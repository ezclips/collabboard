-- PATCH-366. Freeze board: the owner makes a board read-only for everyone else.
--
-- WHY. Padlet's "Freeze board" ends a session cleanly: the results stay visible,
-- nobody but the owner can change them afterwards, guests included. It also
-- blunts a guest who still holds a valid link after the session.
--
-- HOW. `boards.frozen_at` is null for an open board and set while frozen.
-- `board_open_for_write(board)` returns true for an open board (or a board the
-- caller cannot see -- other policies decide), and while frozen returns true
-- only for the owner or a board admin. The 36 RESTRICTIVE policies below AND
-- that onto the existing permissive policies, so they can only ever REMOVE
-- access. The column needs its OWN trigger because workspace editors can already
-- UPDATE `boards` under RLS.
--
-- The DATABASE is the guard. The app only stops offering what the DB refuses.
-- Existing boards are open (frozen_at is null). Service-role writes (the AI
-- routes) are NOT blocked by RLS -- the app hides those for non-editors.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.get_board_permission`.

BEGIN;

-- 1. The column. NULL = open.
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
COMMENT ON COLUMN public.boards.frozen_at IS
  'PATCH-366. When set, the board is frozen: only the owner/admin may write. NULL = open.';

-- 2. The authorizer. Open board -> true after ONE PK lookup, no permission call.
CREATE OR REPLACE FUNCTION public.board_open_for_write(b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  board_user uuid;
  board_frozen timestamptz;
BEGIN
  SELECT user_id, frozen_at INTO board_user, board_frozen
    FROM public.boards WHERE id = b;

  -- Not a board we can see: other policies decide.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Open board: the common case, kept cheap.
  IF board_frozen IS NULL THEN
    RETURN true;
  END IF;

  IF board_user = auth.uid() THEN
    RETURN true;
  END IF;

  RETURN public.get_board_permission(b, auth.uid())::text = 'admin';
END;
$function$;

REVOKE ALL ON FUNCTION public.board_open_for_write(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_open_for_write(uuid) TO authenticated, service_role;

-- 3. The write guard: three restrictive policies per table.
--
-- The (table, board column) list is FIXED and every column is verified against
-- information_schema FIRST, so a table that does not carry the board column
-- aborts the whole transaction with a clear message rather than creating a
-- policy that can never be satisfied. `padlets` carries both `board_id` and
-- `canvas_id` (legacy rows use canvas_id), so it coalesces them.
--
-- NOT in the list: `kanban_board_members` (a member's own sort/group settings
-- must keep working while frozen) and `boards` itself (frozen_at is guarded by
-- its own trigger).
DO $$
DECLARE
  t text;
  board_expr text;
  cols text[];
  col text;
  tables text[] := ARRAY[
    'padlets', 'canvas_lines', 'board_sections', 'freeform_graph_edges',
    'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
    'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF t = 'padlets' THEN
      board_expr := 'coalesce(board_id, canvas_id)';
      cols := ARRAY['board_id', 'canvas_id'];
    ELSIF t LIKE 'kanban%' THEN
      board_expr := 'canvas_id';
      cols := ARRAY['canvas_id'];
    ELSE
      board_expr := 'board_id';
      cols := ARRAY['board_id'];
    END IF;

    -- Column self-check FIRST.
    FOREACH col IN ARRAY cols LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = col
      ) THEN
        RAISE EXCEPTION 'PATCH-366 board freeze: table % has no column %', t, col;
      END IF;
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS board_frozen_no_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY board_frozen_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.board_open_for_write(%s))',
      t, board_expr);

    EXECUTE format('DROP POLICY IF EXISTS board_frozen_no_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY board_frozen_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.board_open_for_write(%s)) WITH CHECK (public.board_open_for_write(%s))',
      t, board_expr, board_expr);

    EXECUTE format('DROP POLICY IF EXISTS board_frozen_no_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY board_frozen_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.board_open_for_write(%s))',
      t, board_expr);
  END LOOP;
END $$;

-- 4. Guard `frozen_at` itself. Workspace editors can already UPDATE `boards`
-- under RLS, so the column needs its own check: only the owner (or a board
-- admin) may change it. Service role (no auth.uid()) passes.
CREATE OR REPLACE FUNCTION public.guard_board_frozen_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
     AND auth.uid() IS NOT NULL
     AND OLD.user_id IS DISTINCT FROM auth.uid()
     AND public.get_board_permission(OLD.id, auth.uid())::text IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the board owner can freeze or unfreeze this board'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS boards_guard_frozen_at ON public.boards;
CREATE TRIGGER boards_guard_frozen_at
  BEFORE UPDATE OF frozen_at ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_board_frozen_at();

-- Trigger-only.
REVOKE EXECUTE ON FUNCTION public.guard_board_frozen_at() FROM PUBLIC, anon, authenticated;

-- 5. Add `boards` to the realtime publication (guarded, re-runnable).
DO $$
BEGIN
  IF to_regclass('public.boards') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'boards'
     ) THEN
    EXECUTE 'alter publication supabase_realtime add table public.boards';
  END IF;
END $$;

-- 6. Self-check: function, 36 policies, trigger, publication.
DO $$
DECLARE
  policy_count integer;
BEGIN
  IF to_regprocedure('public.board_open_for_write(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-366: public.board_open_for_write(uuid) is missing';
  END IF;

  SELECT count(*) INTO policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('board_frozen_no_insert', 'board_frozen_no_update', 'board_frozen_no_delete');
  IF policy_count <> 36 THEN
    RAISE EXCEPTION 'PATCH-366: expected 36 board-frozen policies, found %', policy_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'boards_guard_frozen_at') THEN
    RAISE EXCEPTION 'PATCH-366: boards_guard_frozen_at trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'boards'
  ) THEN
    RAISE EXCEPTION 'PATCH-366: boards is not in the supabase_realtime publication';
  END IF;
END $$;

COMMIT;
