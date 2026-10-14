-- PATCH-360. Share links open Kanban boards; guests never see member emails.
--
-- WHY. A live probe (2026-10-14) found a guest who joined a KANBAN board by edit
-- link saw an EMPTY board. Every Kanban policy authorises through
-- `kanban_board_members`, which `board_collaborators` never feeds -- so
-- PATCH-357's redeem granted nothing on a Kanban board, for guests and
-- registered visitors alike. The app half (redeem writes a `kanban_board_members`
-- row) ships in the same patch; this migration backfills rows for collaborators
-- that predate it.
--
-- The same probe found `get_board_members_with_profile` returns every member's
-- `auth.users.email`, and used the email as the display name when a member has
-- no name. Once guests become members, a stranger with a link would see
-- everyone's email -- and a guest's own `display_name` metadata was ignored.
-- This recreates the function so a GUEST caller gets no emails and falls back to
-- 'Member', while a REGISTERED caller still sees emails and names (a team
-- feature, unchanged).
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.is_guest()` from 20261014120000.

BEGIN;

-- 1. The member list, from the LIVE body, with only two changes: the email is
--    withheld from a guest, and the display name falls back to the guest's own
--    metadata, then 'Member', then (for a registered caller) the email. The
--    signature, return table, STABLE SECURITY DEFINER, pinned search_path and the
--    access check are unchanged.
CREATE OR REPLACE FUNCTION public.get_board_members_with_profile(board_id uuid)
 RETURNS TABLE(id uuid, canvas_id uuid, user_id uuid, role text, permission_level text, sort_by text, sort_order text, group_by text, date_format text, created_at timestamp with time zone, email text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    SELECT m.id, m.canvas_id, m.user_id, m.role, m.permission_level, m.sort_by, m.sort_order,
        m.group_by, m.date_format, m.created_at,
        CASE WHEN (select public.is_guest()) THEN NULL ELSE u.email END,
        COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', CASE WHEN (select public.is_guest()) THEN 'Member' ELSE u.email END) AS display_name,
        u.raw_user_meta_data->>'avatar_url' AS avatar_url
    FROM kanban_board_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.canvas_id = board_id
      AND (
          EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM kanban_board_members viewer
                     WHERE viewer.canvas_id = board_id AND viewer.user_id = auth.uid())
      );
$function$;

-- The security half, as 20260916140000 did: this function discloses member
-- identities, so it must not be reachable anonymously.
REVOKE EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) TO authenticated, service_role;

-- 2. BACKFILL. Give every existing `board_collaborators` row its Kanban
--    membership, so a collaborator from before PATCH-360 can open a Kanban board
--    too. `edit` -> `edit`, `commenter` -> `comment`, anything else -> `view`.
--    ON CONFLICT keeps an existing row (the owner's `admin` row included) as-is.
INSERT INTO public.kanban_board_members (canvas_id, user_id, role, permission_level)
SELECT c.board_id, c.user_id, 'member',
       CASE lower(c.role)
         WHEN 'editor'    THEN 'edit'
         WHEN 'commenter' THEN 'comment'
         ELSE 'view'
       END
  FROM public.board_collaborators c
 WHERE c.board_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.kanban_board_members m
      WHERE m.canvas_id = c.board_id AND m.user_id = c.user_id
   )
ON CONFLICT (canvas_id, user_id) DO NOTHING;

COMMIT;
