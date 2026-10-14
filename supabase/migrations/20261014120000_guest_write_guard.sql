-- PATCH-358 Addendum 2 (part 2). THE REAL GUEST WRITE GUARD.
--
-- WHY THIS EXISTS. The app-side guards from PATCH-358 are user experience only:
-- the middleware's guest check reads an UNVERIFIED cookie, and every session
-- client reaches PostgREST directly. Postgres is the only place the JWT is
-- verified, so it is the only real guard. The owner's live snapshot (2026-10-14)
-- showed why it is needed: many permissive policies check only
-- `auth.uid() = user_id` or are `TO public` and check only the storage bucket, so
-- any signed-in user -- a guest included -- could act. One example: the `boards`
-- "Workspace users can create boards" policy lets anyone create a board with
-- `workspace_id IS NULL`.
--
-- HOW IT GUARDS. Every policy here is `AS RESTRICTIVE`. A restrictive policy is
-- AND-ed with every permissive policy on the table, so it can only ever REMOVE
-- access, never grant it. A guest keeps exactly the access a permissive policy
-- already gave, minus the writes and reads this migration takes away.
-- The guard is written as a sub-select so Postgres evaluates the guest test
-- ONCE per statement (an initPlan), not once per row -- these policies sit on
-- almost every table (Supabase RLS performance guidance).
--
-- WHAT IS DELIBERATELY LEFT ALONE. `spatial_ref_sys` is PostGIS's own table and
-- is not ours to lock. Storage policies that check ONLY the bucket
-- (`padlet-files`, `thumbnails`, `canvas-wallpapers`, `board-backgrounds`,
-- `canvas-icons`) are a PRE-EXISTING issue and are OUT OF SCOPE here -- a
-- separate patch. This migration only adds the guest block on `storage.objects`.
--
-- A NEW TABLE GETS THE GUARD ONLY WHEN THIS BLOCK RUNS AGAIN. The loops below
-- walk whatever tables exist at apply time. A table added later is NOT covered
-- until this migration is re-run (the loops are idempotent), and a future table
-- a guest must be allowed to WRITE needs its name added to the write allow-list.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. It is idempotent where possible.

BEGIN;

-- 1. is_guest(). The single source of truth for "is this caller anonymous",
-- read from the VERIFIED JWT claim Supabase sets for anonymous sign-ins. SECURITY
-- INVOKER so it can never be used to read more than the caller already can, and
-- an empty search_path so it cannot be tricked by a caller-set path.
CREATE OR REPLACE FUNCTION public.is_guest()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

REVOKE ALL ON FUNCTION public.is_guest() FROM public;
GRANT EXECUTE ON FUNCTION public.is_guest() TO authenticated, service_role;

-- 2. WRITE GUARD. Every public table with RLS on, except spatial_ref_sys and the
-- write allow-list, gets three restrictive policies TO authenticated. The
-- allow-listed tables keep their existing permissive policies, which already
-- require owner or board-collaborator (editor) rights -- a guest with an edit
-- link must still write posts, lines, sections and Kanban rows.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity = true
       AND c.relname <> 'spatial_ref_sys'
       -- WRITE allow-list: a guest with an edit link may write these.
       AND c.relname NOT IN (
         'padlets', 'canvas_lines', 'board_sections',
         'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
         'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS guest_no_insert ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY guest_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (not (select public.is_guest()))',
      t.relname);
    EXECUTE format('DROP POLICY IF EXISTS guest_no_update ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY guest_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (not (select public.is_guest())) WITH CHECK (not (select public.is_guest()))',
      t.relname);
    EXECUTE format('DROP POLICY IF EXISTS guest_no_delete ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY guest_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (not (select public.is_guest()))',
      t.relname);
  END LOOP;
END $$;

-- 3. READ GUARD. Same walk, over a LARGER allow-list: the write allow-list plus
-- the tables a guest must read to take part on a board they joined (the board,
-- its collaborators, its map/graph settings, its Kanban membership, its
-- Knowledge and wiki content). Every other table gets a restrictive SELECT
-- policy, so a guest reading `users`, `subscriptions` or `workspaces` gets ZERO
-- ROWS, not an error.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity = true
       AND c.relname <> 'spatial_ref_sys'
       -- READ allow-list: the write list plus the board-facing read set.
       AND c.relname NOT IN (
         'padlets', 'canvas_lines', 'board_sections',
         'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
         'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees',
         'boards', 'board_collaborators', 'board_map_settings',
         'freeform_graph_edges', 'freeform_graph_settings', 'kanban_board_members',
         'knowledge_documents', 'knowledge_pages', 'knowledge_chunks',
         'knowledge_source_highlights', 'knowledge_pdf_area_image_placements',
         'source_references', 'board_wiki_pages'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS guest_no_select ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY guest_no_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (not (select public.is_guest()))',
      t.relname);
  END LOOP;
END $$;

-- 4. STORAGE. storage.objects INSERT/UPDATE/DELETE are blocked for guests.
-- READS ARE NOT TOUCHED: a guest must still see the images on the board they
-- joined. The bucket-only permissive policies that let any signed-in user write
-- are a separate, pre-existing issue and are not addressed here.
DROP POLICY IF EXISTS guest_no_storage_insert ON storage.objects;
CREATE POLICY guest_no_storage_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (not (select public.is_guest()));

DROP POLICY IF EXISTS guest_no_storage_update ON storage.objects;
CREATE POLICY guest_no_storage_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (not (select public.is_guest()))
  WITH CHECK (not (select public.is_guest()));

DROP POLICY IF EXISTS guest_no_storage_delete ON storage.objects;
CREATE POLICY guest_no_storage_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (not (select public.is_guest()));

-- 5. handle_new_user. The live body verbatim, with two changes only: the
-- full_name line falls back to the display_name a guest sends, and the function
-- gets a pinned search_path. A guest has no email, and public.users.email is
-- nullable, so this still succeeds. CREATE OR REPLACE preserves the anon
-- EXECUTE revoke from 20260916140000.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.users (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 6. SELF-CHECK. Inside the transaction: if the write guard did not create
-- exactly one guest_no_insert per eligible table, or an allow-listed table name
-- does not exist (a typo would silently skip it), the whole transaction rolls
-- back and nothing changes.
DO $$
DECLARE
  expected integer;
  actual integer;
  missing text;
BEGIN
  -- The SAME predicate the write loop uses, so the two cannot disagree.
  SELECT count(*) INTO expected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relrowsecurity = true
     AND c.relname <> 'spatial_ref_sys'
     AND NOT (c.relname = ANY (ARRAY[
       'padlets', 'canvas_lines', 'board_sections',
       'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
       'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees'
     ]));

  SELECT count(*) INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname = 'guest_no_insert';

  IF actual <> expected THEN
    RAISE EXCEPTION
      'PATCH-358 guest write guard: expected % guest_no_insert policies, found %',
      expected, actual;
  END IF;

  -- Every allow-listed name (write + read) must resolve to a real table.
  SELECT string_agg(name, ', ') INTO missing
    FROM unnest(ARRAY[
      'padlets', 'canvas_lines', 'board_sections',
      'kanban_cards', 'kanban_columns', 'kanban_swimlanes', 'kanban_column_groups',
      'kanban_links', 'kanban_comments', 'kanban_votes', 'kanban_card_assignees',
      'boards', 'board_collaborators', 'board_map_settings',
      'freeform_graph_edges', 'freeform_graph_settings', 'kanban_board_members',
      'knowledge_documents', 'knowledge_pages', 'knowledge_chunks',
      'knowledge_source_highlights', 'knowledge_pdf_area_image_placements',
      'source_references', 'board_wiki_pages'
    ]) AS name
   WHERE to_regclass(format('public.%I', name)) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'PATCH-358 guest write guard: allow-listed tables do not exist: %',
      missing;
  END IF;
END $$;

COMMIT;
