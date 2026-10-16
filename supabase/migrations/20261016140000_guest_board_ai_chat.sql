-- PATCH-380 Addendum 1. A GUEST'S BOARD AI CHAT, when the owner allows it.
--
-- WHY. The PATCH-380 live run (2026-10-16) found guest Board AI chat failing
-- with a bare 503. Root cause: the chat route stores its threads and messages
-- with the GUEST'S OWN session client, but
-- `20261014120000_guest_write_guard.sql` (PATCH-358) had put restrictive
-- `guest_no_select/insert/update/delete` policies on `board_ai_threads` and
-- `board_ai_messages` -- both tables existed when that guard ran, so the loops
-- covered them and blocked a guest outright. The permissive policies from
-- `20260902120000_create_board_ai_chat.sql` already allow a guest's OWN rows
-- (they test `user_id = auth.uid()` AND `is_board_member(...)`), so the guest
-- passes the permissive gate and is stopped only by the blanket restrictive one.
--
-- WHAT THIS DOES. It narrows the four restrictive policies on each table so a
-- guest is refused UNLESS ALL THREE hold: the caller is the row's own user, the
-- row is on a board whose owner switched `guest_ai_allowed` on, and the
-- permissive policy already allowed it. A non-guest is unaffected.
--
-- WHY A FUNCTION. `guest_ai_board_ok` reads an OWNER-ONLY switch from `boards`.
-- SECURITY DEFINER is required so a guest -- who cannot read the owner's
-- `boards` row under RLS -- can still have the server evaluate the switch for
-- them; the caller only ever learns a boolean, never the row. It is STABLE, so
-- it is evaluated once per statement (an initPlan), not once per row.
--
-- WHAT IS DELIBERATELY UNCHANGED. No permissive policy is touched. No storage
-- policy. The guest still has NO direct Storage write (PATCH-358). If the owner
-- switches the flag back off, the next read or write of the thread fails again,
-- exactly as it did before this migration -- the check is live on every statement.
--
-- ORDER. Depends on `public.boards.guest_ai_allowed` (20261016130000) and
-- `public.is_guest()` (20261014120000). DO NOT APPLY from a coding session --
-- the owner runs this in the Supabase SQL editor. Idempotent: every policy is
-- dropped before it is recreated.

BEGIN;

-- 1. The board's switch, readable by a guest ONLY as a boolean.
CREATE OR REPLACE FUNCTION public.guest_ai_board_ok(p_board uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT guest_ai_allowed FROM public.boards WHERE id = p_board), false);
$$;

-- Trigger-only style: nobody but the two trusted roles needs EXECUTE, and a
-- missing anonymous grant is deliberate -- the restrictive policies are all
-- TO authenticated, so anon can never reach this anyway.
REVOKE EXECUTE ON FUNCTION public.guest_ai_board_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_ai_board_ok(uuid) TO authenticated, service_role;

-- 2. THREADS. Every policy keeps its name and its RESTRICTIVE kind, so it can
-- only ever REMOVE access; the permissive pair still decides what is allowed.
-- The guest branch is exactly the permissive test plus the owner's switch.

DROP POLICY IF EXISTS guest_no_select ON public.board_ai_threads;
CREATE POLICY guest_no_select ON public.board_ai_threads
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR (user_id = (select auth.uid()) AND public.guest_ai_board_ok(board_id))
  );

DROP POLICY IF EXISTS guest_no_insert ON public.board_ai_threads;
CREATE POLICY guest_no_insert ON public.board_ai_threads
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (NOT (select public.is_guest()))
    OR (user_id = (select auth.uid()) AND public.guest_ai_board_ok(board_id))
  );

DROP POLICY IF EXISTS guest_no_update ON public.board_ai_threads;
CREATE POLICY guest_no_update ON public.board_ai_threads
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR (user_id = (select auth.uid()) AND public.guest_ai_board_ok(board_id))
  )
  WITH CHECK (
    (NOT (select public.is_guest()))
    OR (user_id = (select auth.uid()) AND public.guest_ai_board_ok(board_id))
  );

DROP POLICY IF EXISTS guest_no_delete ON public.board_ai_threads;
CREATE POLICY guest_no_delete ON public.board_ai_threads
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR (user_id = (select auth.uid()) AND public.guest_ai_board_ok(board_id))
  );

-- 3. MESSAGES. A message has no owner of its own; the owning thread carries it.
-- So the guest branch resolves the thread and repeats ALL THREE tests against
-- it -- never "this message's thread is mine" alone, because a thread whose
-- board the caller can no longer read must take its messages out of reach with
-- it, exactly as the permissive policies already require.

DROP POLICY IF EXISTS guest_no_select ON public.board_ai_messages;
CREATE POLICY guest_no_select ON public.board_ai_messages
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR EXISTS (
      SELECT 1 FROM public.board_ai_threads t
      WHERE t.id = board_ai_messages.thread_id
        AND t.user_id = (select auth.uid())
        AND public.guest_ai_board_ok(t.board_id)
    )
  );

DROP POLICY IF EXISTS guest_no_insert ON public.board_ai_messages;
CREATE POLICY guest_no_insert ON public.board_ai_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (NOT (select public.is_guest()))
    OR EXISTS (
      SELECT 1 FROM public.board_ai_threads t
      WHERE t.id = board_ai_messages.thread_id
        AND t.user_id = (select auth.uid())
        AND public.guest_ai_board_ok(t.board_id)
    )
  );

DROP POLICY IF EXISTS guest_no_update ON public.board_ai_messages;
CREATE POLICY guest_no_update ON public.board_ai_messages
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR EXISTS (
      SELECT 1 FROM public.board_ai_threads t
      WHERE t.id = board_ai_messages.thread_id
        AND t.user_id = (select auth.uid())
        AND public.guest_ai_board_ok(t.board_id)
    )
  )
  WITH CHECK (
    (NOT (select public.is_guest()))
    OR EXISTS (
      SELECT 1 FROM public.board_ai_threads t
      WHERE t.id = board_ai_messages.thread_id
        AND t.user_id = (select auth.uid())
        AND public.guest_ai_board_ok(t.board_id)
    )
  );

DROP POLICY IF EXISTS guest_no_delete ON public.board_ai_messages;
CREATE POLICY guest_no_delete ON public.board_ai_messages
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (NOT (select public.is_guest()))
    OR EXISTS (
      SELECT 1 FROM public.board_ai_threads t
      WHERE t.id = board_ai_messages.thread_id
        AND t.user_id = (select auth.uid())
        AND public.guest_ai_board_ok(t.board_id)
    )
  );

-- 4. SELF-CHECK. Inside the transaction: a missing function or a policy that is
-- not RESTRICTIVE rolls the whole thing back rather than leaving a half-applied
-- permission model.
DO $$
DECLARE
  want record;
  kind text;
BEGIN
  IF to_regprocedure('public.guest_ai_board_ok(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-380 Addendum 1: public.guest_ai_board_ok(uuid) is missing';
  END IF;

  FOR want IN
    SELECT * FROM (VALUES
      ('board_ai_threads', 'guest_no_select'),
      ('board_ai_threads', 'guest_no_insert'),
      ('board_ai_threads', 'guest_no_update'),
      ('board_ai_threads', 'guest_no_delete'),
      ('board_ai_messages', 'guest_no_select'),
      ('board_ai_messages', 'guest_no_insert'),
      ('board_ai_messages', 'guest_no_update'),
      ('board_ai_messages', 'guest_no_delete')
    ) AS v(tablename, policyname)
  LOOP
    SELECT p.permissive INTO kind
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename = want.tablename
       AND p.policyname = want.policyname;
    IF kind IS NULL THEN
      RAISE EXCEPTION 'PATCH-380 Addendum 1: policy %.% is missing', want.tablename, want.policyname;
    END IF;
    IF kind <> 'RESTRICTIVE' THEN
      RAISE EXCEPTION 'PATCH-380 Addendum 1: policy %.% is not RESTRICTIVE', want.tablename, want.policyname;
    END IF;
  END LOOP;
END $$;

COMMIT;
