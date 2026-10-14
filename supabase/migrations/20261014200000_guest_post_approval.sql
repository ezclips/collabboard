-- PATCH-367. Approve guest posts before others see them.
--
-- WHY. Guest safety controls, third of four (365 links + QR, 366 freeze, 367
-- approval, 368 hide names). Padlet's moderation ("which posts require
-- approval") is the standard answer to "a stranger with the link posts
-- something rude on the projector".
--
-- HOW. `boards.guest_posts_need_approval` is off by default. When on, a post
-- INSERTed by an ANONYMOUS user (a guest -- `public.is_guest()`) is stamped
-- `metadata.pendingApproval = true` by a trigger. A RESTRICTIVE SELECT policy
-- then hides any row whose metadata carries that key from everyone except its
-- author (`metadata.createdBy` = the caller) and the board's owner/admins. The
-- owner removes the key to approve; the same trigger refuses every other caller
-- the ability to add OR remove it, so nobody can self-approve and nobody can
-- mark someone else's post pending.
--
-- WHO IS MODERATED. Guests only -- anonymous users. A registered collaborator's
-- post is never stamped, whatever the switch says.
--
-- WHAT RLS DOES NOT COVER. Service-role readers (the AI routes) are NOT filtered
-- by RLS, so they see pending posts too; the app hides those for non-reviewers.
--
-- REALTIME. `postgres_changes` applies the SELECT policy per subscriber, so a
-- pending INSERT is delivered only to the author and reviewers; the approving
-- UPDATE (the key removed) becomes visible to everyone and reaches them live.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.is_guest()` (20261014120000),
-- `public.get_board_permission`, and `public.stamp_padlet_creator`
-- (20261014180000).

BEGIN;

-- 1. The column. Off by default.
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS guest_posts_need_approval boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.boards.guest_posts_need_approval IS
  'PATCH-367. When true, a new guest (anonymous) post is hidden until an owner/admin approves it.';

-- 2. Who may review (approve/decline) this board's posts: the owner or a board admin.
CREATE OR REPLACE FUNCTION public.can_review_board_posts(b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  board_user uuid;
BEGIN
  SELECT user_id INTO board_user FROM public.boards WHERE id = b;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF board_user = auth.uid() THEN
    RETURN true;
  END IF;

  RETURN public.get_board_permission(b, auth.uid())::text = 'admin';
END;
$function$;

REVOKE ALL ON FUNCTION public.can_review_board_posts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_board_posts(uuid) TO authenticated, service_role;

-- 3. The approval guard. INSERT: stamp a guest's post pending when the board
-- asks for it, stripping any client-sent key first. UPDATE: only a reviewer may
-- change the key (removing it = approve); everyone else is forced back to the
-- stored state. Service role (no auth.uid()) passes unchanged.
CREATE OR REPLACE FUNCTION public.guard_padlet_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  needs_approval boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role: unchanged
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- The client cannot mark its own post pending (or pre-approve it).
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'pendingApproval';
    SELECT guest_posts_need_approval INTO needs_approval
      FROM public.boards WHERE id = coalesce(NEW.board_id, NEW.canvas_id);
    IF public.is_guest() AND needs_approval IS TRUE THEN
      NEW.metadata := NEW.metadata || jsonb_build_object('pendingApproval', true);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. A reviewer keeps NEW as sent: removing the key approves.
  IF public.can_review_board_posts(coalesce(NEW.board_id, NEW.canvas_id)) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: force the key back to the stored state. Nobody can approve,
  -- and nobody can mark someone else's post pending.
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'pendingApproval';
  IF OLD.metadata ? 'pendingApproval' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('pendingApproval', OLD.metadata -> 'pendingApproval');
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger-only: nobody needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.guard_padlet_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS padlets_guard_approval ON public.padlets;
CREATE TRIGGER padlets_guard_approval
  BEFORE INSERT OR UPDATE OF metadata ON public.padlets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_padlet_approval();

-- 4. Hide a pending post from everyone but its author and the board's reviewers.
-- RESTRICTIVE: it can only ever REMOVE visibility. The first term short-circuits
-- for a normal post, so no function call is made unless the row is pending.
DROP POLICY IF EXISTS padlets_pending_hidden ON public.padlets;
CREATE POLICY padlets_pending_hidden ON public.padlets
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (metadata->>'pendingApproval') IS NULL
    OR metadata->>'createdBy' = (select auth.uid())::text
    OR public.can_review_board_posts(coalesce(board_id, canvas_id))
  );

-- 5. Guard the switch itself: only the owner/admin may change it (same rule as
-- 366's frozen_at guard). Service role (no auth.uid()) passes.
CREATE OR REPLACE FUNCTION public.guard_board_guest_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.guest_posts_need_approval IS DISTINCT FROM OLD.guest_posts_need_approval
     AND auth.uid() IS NOT NULL
     AND OLD.user_id IS DISTINCT FROM auth.uid()
     AND public.get_board_permission(OLD.id, auth.uid())::text IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the board owner can change guest post approval'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_board_guest_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS boards_guard_guest_approval ON public.boards;
CREATE TRIGGER boards_guard_guest_approval
  BEFORE UPDATE OF guest_posts_need_approval ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_board_guest_approval();

-- 6. Self-check: column, functions, both triggers, the policy.
DO $$
DECLARE
  policy_kind text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = 'guest_posts_need_approval'
  ) THEN
    RAISE EXCEPTION 'PATCH-367: boards.guest_posts_need_approval is missing';
  END IF;

  IF to_regprocedure('public.can_review_board_posts(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-367: public.can_review_board_posts(uuid) is missing';
  END IF;
  IF to_regprocedure('public.guard_padlet_approval()') IS NULL THEN
    RAISE EXCEPTION 'PATCH-367: public.guard_padlet_approval() is missing';
  END IF;
  IF to_regprocedure('public.guard_board_guest_approval()') IS NULL THEN
    RAISE EXCEPTION 'PATCH-367: public.guard_board_guest_approval() is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'padlets_guard_approval') THEN
    RAISE EXCEPTION 'PATCH-367: padlets_guard_approval trigger is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'boards_guard_guest_approval') THEN
    RAISE EXCEPTION 'PATCH-367: boards_guard_guest_approval trigger is missing';
  END IF;

  SELECT permissive INTO policy_kind
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'padlets' AND policyname = 'padlets_pending_hidden';
  IF policy_kind IS NULL THEN
    RAISE EXCEPTION 'PATCH-367: padlets_pending_hidden policy is missing';
  END IF;
  IF policy_kind <> 'RESTRICTIVE' THEN
    RAISE EXCEPTION 'PATCH-367: padlets_pending_hidden must be RESTRICTIVE, found %', policy_kind;
  END IF;
END $$;

COMMIT;
