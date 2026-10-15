-- PATCH-373. Columns and Grid sections did not update live for a second viewer.
--
-- WHY. Found in the PATCH-372 live run: Board AI created 3 columns and moved 8
-- posts into them, and a second open tab showed nothing until reload -- the
-- posts were moved into columns its page did not know about. It was not an AI
-- bug: a manual "Add section" behaved the same. `board_sections` was simply not
-- in the `supabase_realtime` publication, so Supabase refused the subscription
-- ("Unable to subscribe to changes ... table: board_sections") exactly as it did
-- for `padlets` before PATCH-357 Addendum 2, and `useCanvasData` had no
-- `board_sections` handler anyway (PATCH-373 adds it).
--
-- SAFE TO RE-RUN. The table is skipped when it does not exist or is already
-- published, so running this again changes nothing.
--
-- NO DATA OR POLICY CHANGE. postgres_changes INSERT/UPDATE respect the existing
-- SELECT RLS on `board_sections`, so a viewer only receives rows the board's
-- SELECT policy already admits. (DELETE events are not filterable by
-- `board_id`; the client drops ids that are not on its board -- see
-- `useCanvasData.ts`.)
--
-- A NEW SUBSCRIPTION TO ANOTHER TABLE MUST ADD IT HERE TOO, or it will be
-- refused at runtime the same way.

DO $$
BEGIN
  IF to_regclass('public.board_sections') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'board_sections'
     ) THEN
    EXECUTE 'alter publication supabase_realtime add table public.board_sections';
  END IF;
END $$;

-- Self-check: the table exists in this database and is now published.
DO $$
BEGIN
  IF to_regclass('public.board_sections') IS NULL THEN
    RAISE EXCEPTION 'PATCH-373: public.board_sections is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'board_sections'
  ) THEN
    RAISE EXCEPTION 'PATCH-373: public.board_sections is not in the supabase_realtime publication';
  END IF;
END $$;
