-- PATCH-368. Hide guest names: guests show as "Guest NN".
--
-- WHY. Last of the four guest safety controls (365 links + QR, 366 freeze, 367
-- approval, 368 hide names). Honest feedback in retrospectives and anonymous
-- brainstorming: Klaxoon and Mural let the organiser hide participants'
-- identities. Our guests type a name when they join (PATCH-358), and that name
-- shows in presence, Kanban member lists and comment authors.
--
-- HOW. `boards.hide_guest_names` is off by default. When on, the Kanban members
-- RPC returns a stable alias -- `'Guest ' || ((('x' || substr(u.id::text,1,4))::bit(16)::int % 99) + 1)`
-- -- and a NULL avatar for every OTHER anonymous member. Registered members and
-- the caller themself are unchanged. Emails stay hidden from guests as in 360.
--
-- The app half hides the name at the OTHER exit: a guest's presence payload
-- carries `name: null` while the flag is on, so the real name never travels over
-- the channel. Rendering also applies the alias, so a stale payload never shows
-- a name.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.is_guest()` (20261014120000) and the PATCH-360 RPC
-- in 20261014140000.

BEGIN;

-- 1. The column. Off by default.
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS hide_guest_names boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.boards.hide_guest_names IS
  'PATCH-368. When true, guests appear as a stable alias ("Guest NN") to everyone but themselves.';

-- 2. Guard the switch: only the owner/admin may change it (same rule as 367's
-- guest_posts_need_approval guard). Service role (no auth.uid()) passes.
CREATE OR REPLACE FUNCTION public.guard_board_hide_guest_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.hide_guest_names IS DISTINCT FROM OLD.hide_guest_names
     AND auth.uid() IS NOT NULL
     AND OLD.user_id IS DISTINCT FROM auth.uid()
     AND public.get_board_permission(OLD.id, auth.uid())::text IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the board owner can change guest name visibility'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_board_hide_guest_names() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS boards_guard_hide_guest_names ON public.boards;
CREATE TRIGGER boards_guard_hide_guest_names
  BEFORE UPDATE OF hide_guest_names ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_board_hide_guest_names();

-- 3. The member list. Copied VERBATIM from 20261014140000_kanban_share_access.sql
--    (same signature, return table, STABLE SECURITY DEFINER, pinned search_path,
--    access check and grants). ONLY `display_name` and `avatar_url` change: when
--    the board hides guest names AND the member is anonymous AND is not the
--    caller, the member shows as the stable alias with no avatar.
CREATE OR REPLACE FUNCTION public.get_board_members_with_profile(board_id uuid)
 RETURNS TABLE(id uuid, canvas_id uuid, user_id uuid, role text, permission_level text, sort_by text, sort_order text, group_by text, date_format text, created_at timestamp with time zone, email text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    SELECT m.id, m.canvas_id, m.user_id, m.role, m.permission_level, m.sort_by, m.sort_order,
        m.group_by, m.date_format, m.created_at,
        CASE WHEN (select public.is_guest()) THEN NULL ELSE u.email END,
        CASE
          WHEN (SELECT b.hide_guest_names FROM public.boards b WHERE b.id = board_id) IS TRUE
               AND u.is_anonymous
               AND u.id <> auth.uid()
            THEN 'Guest ' || ((('x' || substr(u.id::text, 1, 4))::bit(16)::int % 99) + 1)
          ELSE COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', CASE WHEN (select public.is_guest()) THEN 'Member' ELSE u.email END)
        END AS display_name,
        CASE
          WHEN (SELECT b.hide_guest_names FROM public.boards b WHERE b.id = board_id) IS TRUE
               AND u.is_anonymous
               AND u.id <> auth.uid()
            THEN NULL
          ELSE u.raw_user_meta_data->>'avatar_url'
        END AS avatar_url
    FROM kanban_board_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.canvas_id = board_id
      AND (
          EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM kanban_board_members viewer
                     WHERE viewer.canvas_id = board_id AND viewer.user_id = auth.uid())
      );
$function$;

-- The security half, unchanged from 360.
REVOKE EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) TO authenticated, service_role;

-- 4. Self-check: column, trigger, function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = 'hide_guest_names'
  ) THEN
    RAISE EXCEPTION 'PATCH-368: boards.hide_guest_names is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'boards_guard_hide_guest_names') THEN
    RAISE EXCEPTION 'PATCH-368: boards_guard_hide_guest_names trigger is missing';
  END IF;

  IF to_regprocedure('public.get_board_members_with_profile(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-368: public.get_board_members_with_profile(uuid) is missing';
  END IF;
END $$;

COMMIT;
