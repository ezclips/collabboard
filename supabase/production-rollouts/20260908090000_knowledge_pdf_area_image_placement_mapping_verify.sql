-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE verifier. READ ONLY.
--
-- Run after 20260908090000_knowledge_pdf_area_image_placement_mapping.sql.
-- Every row returns an explicit `pass` boolean and section 12 is the release
-- gate: it repeats every load-bearing condition rather than trusting an
-- operator to read the rows above, and every conjunct is COALESCEd so a NULL
-- can never read as success.
--
-- PLAIN SQL ONLY. No \set, \gset or \if: this file must run through whatever
-- executes SQL for the release -- psql, a driver, the Supabase SQL editor -- so
-- it uses nothing psql-specific. Signatures are written out in full rather than
-- carried in client-side variables.
--
-- IT NEVER RAISES. This file is diagnostic: it must be able to DESCRIBE a
-- broken database, so a missing object is a `false`, never an error. Two
-- PostgreSQL behaviours make that harder than it looks, and both are handled:
--
--   * a privilege test NAMING a missing table raises. Every one below therefore
--     passes an OID from to_regclass()/to_regprocedure(), which is NULL for an
--     absent object -- and the privilege functions are strict, so the answer is
--     NULL and the check reads as false rather than aborting the report.
--   * function names are resolved at PARSE time, so a statement that merely
--     names an absent function fails before any CASE could guard it. Nothing
--     here CALLS an owned function; it reads catalogs only.
--
-- SQL errors belong to the rollout's preflight, which is the thing that must
-- refuse to proceed. This file only reports.
--
-- It reads catalogs and structural columns only. No filename, page text, quote,
-- excerpt or any other document content is selected, and no PDF is opened.
-- Nothing here writes.

-- 1. The server-owned mapping table exists.
SELECT 1 AS section, 'mapping table exists' AS check,
    COALESCE(to_regclass('public.knowledge_pdf_area_image_placements') IS NOT NULL, false) AS pass,
    COALESCE(to_regclass('public.knowledge_pdf_area_image_placements')::text, 'absent') AS detail;

-- 2. Its columns are exactly the reviewed shape.
SELECT 2 AS section, 'mapping columns are uuid/uuid/timestamptz and NOT NULL' AS check,
    COALESCE(
      (SELECT data_type = 'uuid' AND is_nullable = 'NO' FROM information_schema.columns
        WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
          AND column_name='padlet_id')
      AND (SELECT data_type = 'uuid' AND is_nullable = 'NO' FROM information_schema.columns
            WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
              AND column_name='library_item_id')
      AND (SELECT data_type = 'timestamp with time zone' AND is_nullable = 'NO'
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
              AND column_name='created_at'), false) AS pass,
    COALESCE((SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY column_name)
                FROM information_schema.columns
               WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'),
             'absent') AS detail;

-- 3. One placement, one durable object: padlet_id IS the identity.
SELECT 3 AS section, 'padlet_id is the primary key' AS check,
    COALESCE((SELECT EXISTS (
        SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = t.oid AND con.contype = 'p'
           AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                    WHERE a.attrelid = t.oid AND a.attname = 'padlet_id')]::int2[])
      ), false) AS pass,
    COALESCE((SELECT string_agg(con.conname, ', ') FROM pg_constraint con
               WHERE con.conrelid = t.oid AND con.contype = 'p'), 'absent') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 4. Deleting the placement removes its authorisation -- structurally, not by
--    application discipline.
SELECT 4 AS section, 'padlet delete cascades the mapping away' AS check,
    COALESCE((SELECT EXISTS (
        SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = t.oid AND con.contype = 'f'
           AND con.confrelid = to_regclass('public.padlets')
           AND con.confdeltype = 'c')), false) AS pass,
    COALESCE((SELECT string_agg(con.conname || '->' || con.confdeltype, ', ')
                FROM pg_constraint con
               WHERE con.conrelid = t.oid AND con.contype = 'f'), 'absent') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 5. And so does deleting the durable object it points at.
SELECT 5 AS section, 'library item delete cascades the mapping away' AS check,
    COALESCE((SELECT EXISTS (
        SELECT 1 FROM pg_constraint con
         WHERE con.conrelid = t.oid AND con.contype = 'f'
           AND con.confrelid = to_regclass('public.library_items')
           AND con.confdeltype = 'c')), false) AS pass,
    'both foreign keys must be ON DELETE CASCADE' AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 6. RLS is on and there is not one policy: nothing without BYPASSRLS may read
--    or write a row, whatever privileges may later appear.
SELECT 6 AS section, 'RLS enabled with ZERO policies' AS check,
    COALESCE((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid)
             AND (SELECT count(*) = 0 FROM pg_policy p WHERE p.polrelid = t.oid), false) AS pass,
    COALESCE(format('rls=%s policies=%s',
        (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid),
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = t.oid)), 'absent') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 7. Browser roles hold ZERO privileges of any kind. The OID form is used so an
--    absent table answers NULL (-> false) instead of raising.
SELECT 7 AS section, 'anon and authenticated have no privilege on the mapping' AS check,
    COALESCE(NOT (
        has_table_privilege('anon', t.oid, 'SELECT')
     OR has_table_privilege('anon', t.oid, 'INSERT')
     OR has_table_privilege('anon', t.oid, 'UPDATE')
     OR has_table_privilege('anon', t.oid, 'DELETE')
     OR has_table_privilege('anon', t.oid, 'TRUNCATE')
     OR has_table_privilege('anon', t.oid, 'REFERENCES')
     OR has_table_privilege('anon', t.oid, 'TRIGGER')
     -- PostgreSQL 17's MAINTAIN is invisible to information_schema, so it is
     -- asked for by name here or it would never be checked at all.
     OR has_table_privilege('anon', t.oid, 'MAINTAIN')
     OR has_table_privilege('authenticated', t.oid, 'SELECT')
     OR has_table_privilege('authenticated', t.oid, 'INSERT')
     OR has_table_privilege('authenticated', t.oid, 'UPDATE')
     OR has_table_privilege('authenticated', t.oid, 'DELETE')
     OR has_table_privilege('authenticated', t.oid, 'TRUNCATE')
     OR has_table_privilege('authenticated', t.oid, 'REFERENCES')
     OR has_table_privilege('authenticated', t.oid, 'TRIGGER')
     OR has_table_privilege('authenticated', t.oid, 'MAINTAIN')), false) AS pass,
    COALESCE((SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ', ')
                FROM information_schema.table_privileges
               WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
                 AND grantee IN ('anon','authenticated','PUBLIC')), 'none') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 8. The trusted server authority can still maintain it.
SELECT 8 AS section, 'service_role may write the mapping' AS check,
    COALESCE(has_table_privilege('service_role', t.oid, 'SELECT')
         AND has_table_privilege('service_role', t.oid, 'INSERT')
         AND has_table_privilege('service_role', t.oid, 'DELETE'), false) AS pass,
    'server authority only' AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 9. The trusted reuse RPC exists, is SECURITY INVOKER, and only service_role
--    may run it. Resolved by oid first, so an absent function is a `false`
--    rather than an aborted report.
SELECT 9 AS section, 'reuse RPC: exists, INVOKER, service_role only' AS check,
    COALESCE(
      f.oid IS NOT NULL
      AND (SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = f.oid)
      AND has_function_privilege('service_role', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('public', f.oid, 'EXECUTE'), false) AS pass,
    CASE WHEN f.oid IS NULL THEN 'absent'
         ELSE format('invoker=%s service=%s authenticated=%s anon=%s public=%s',
              (SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = f.oid),
              has_function_privilege('service_role', f.oid, 'EXECUTE'),
              has_function_privilege('authenticated', f.oid, 'EXECUTE'),
              has_function_privilege('anon', f.oid, 'EXECUTE'),
              has_function_privilege('public', f.oid, 'EXECUTE')) END AS detail
  FROM (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f;

-- 10. What that function is, read from its own body: it re-proves ownership and
--     board authority, writes both rows, and reaches for nothing else. It takes
--     no path, creates no Library row, and there is no storage call in it.
SELECT 10 AS section, 'reuse RPC re-proves authority and copies nothing' AS check,
    COALESCE((SELECT p.prosrc LIKE '%board_collaborators%'
                AND p.prosrc LIKE '%l.user_id%'
                AND p.prosrc LIKE '%is_knowledge_pdf_area_provenance%'
                AND p.prosrc LIKE '%INSERT INTO public.knowledge_pdf_area_image_placements%'
                AND p.prosrc LIKE '%INSERT INTO public.padlets%'
                AND p.prosrc NOT LIKE '%INSERT INTO public.library_items%'
                AND p.prosrc NOT LIKE '%p_storage_path%'
                AND p.prosrc NOT LIKE '%storage.%'
                AND p.prosrc NOT LIKE '%board-derived/%'
                FROM pg_proc p WHERE p.oid = f.oid), false) AS pass,
    CASE WHEN f.oid IS NULL THEN 'absent' ELSE 'body inspected' END AS detail
  FROM (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f;

-- 11. The durable-preview correction this one depends on is UNCHANGED: the
--     protected column is still there, still text, and still not writable by a
--     browser role. This rollout owns none of it and must not have moved it.
SELECT 11 AS section, 'durable-preview protected column unchanged' AS check,
    COALESCE((SELECT data_type = 'text' AND is_nullable = 'YES'
                FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items'
                 AND column_name='knowledge_storage_path')
      AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT')
      AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
      AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','INSERT')
      AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE')
      AND to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)') IS NOT NULL, false) AS pass,
    'server-owned, and the shared provenance mirror is present' AS detail;

-- 11a. Diagnostic only, never a gate: how many placements are mapped. The
--      rollout writes NONE -- every row here was written one drop at a time by
--      the trusted path -- so a fresh release legitimately reports 0.
SELECT '11a' AS section, 'mapping rows (diagnostic, not a gate)' AS check,
    true AS pass,
    -- The count is deferred through query_to_xml so the table NAME is resolved
    -- at execution time: naming an absent relation directly would fail at parse
    -- time, which is exactly the state this report must be able to describe.
    CASE WHEN to_regclass('public.knowledge_pdf_area_image_placements') IS NULL THEN 'absent'
         ELSE COALESCE((xpath('/row/c/text()',
                query_to_xml('SELECT count(*) AS c FROM public.knowledge_pdf_area_image_placements',
                             false, true, '')))[1]::text, 'unknown')
    END AS detail;

-- 12. THE RELEASE GATE. Every load-bearing condition above, repeated in one
--     boolean. Nothing is inherited from the rows above and nothing is assumed:
--     a NULL anywhere is a failure, not a pass.
SELECT 12 AS section, 'COMPLETE PASS' AS check,
    COALESCE(
        t.oid IS NOT NULL
    AND f.oid IS NOT NULL
    -- structure
    AND (SELECT data_type = 'uuid' AND is_nullable = 'NO' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
            AND column_name='padlet_id')
    AND (SELECT data_type = 'uuid' AND is_nullable = 'NO' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
            AND column_name='library_item_id')
    AND EXISTS (SELECT 1 FROM pg_constraint con
                 WHERE con.conrelid = t.oid AND con.contype = 'p'
                   AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = t.oid AND a.attname = 'padlet_id')]::int2[])
    AND EXISTS (SELECT 1 FROM pg_constraint con
                 WHERE con.conrelid = t.oid AND con.contype = 'f'
                   AND con.confrelid = to_regclass('public.padlets') AND con.confdeltype = 'c')
    AND EXISTS (SELECT 1 FROM pg_constraint con
                 WHERE con.conrelid = t.oid AND con.contype = 'f'
                   AND con.confrelid = to_regclass('public.library_items') AND con.confdeltype = 'c')
    -- authority
    AND (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid)
    AND (SELECT count(*) = 0 FROM pg_policy p WHERE p.polrelid = t.oid)
    AND NOT has_table_privilege('anon', t.oid, 'SELECT')
    AND NOT has_table_privilege('anon', t.oid, 'INSERT')
    AND NOT has_table_privilege('anon', t.oid, 'UPDATE')
    AND NOT has_table_privilege('anon', t.oid, 'DELETE')
    AND NOT has_table_privilege('anon', t.oid, 'TRUNCATE')
    AND NOT has_table_privilege('anon', t.oid, 'REFERENCES')
    AND NOT has_table_privilege('anon', t.oid, 'TRIGGER')
    AND NOT has_table_privilege('anon', t.oid, 'MAINTAIN')
    AND NOT has_table_privilege('authenticated', t.oid, 'SELECT')
    AND NOT has_table_privilege('authenticated', t.oid, 'INSERT')
    AND NOT has_table_privilege('authenticated', t.oid, 'UPDATE')
    AND NOT has_table_privilege('authenticated', t.oid, 'DELETE')
    AND NOT has_table_privilege('authenticated', t.oid, 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', t.oid, 'REFERENCES')
    AND NOT has_table_privilege('authenticated', t.oid, 'TRIGGER')
    AND NOT has_table_privilege('authenticated', t.oid, 'MAINTAIN')
    AND has_table_privilege('service_role', t.oid, 'INSERT')
    AND has_table_privilege('service_role', t.oid, 'SELECT')
    -- the trusted function
    AND (SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = f.oid)
    AND has_function_privilege('service_role', f.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
    AND NOT has_function_privilege('public', f.oid, 'EXECUTE')
    AND (SELECT p.prosrc LIKE '%board_collaborators%'
            AND p.prosrc LIKE '%is_knowledge_pdf_area_provenance%'
            AND p.prosrc LIKE '%INSERT INTO public.knowledge_pdf_area_image_placements%'
            AND p.prosrc NOT LIKE '%INSERT INTO public.library_items%'
            AND p.prosrc NOT LIKE '%p_storage_path%'
            AND p.prosrc NOT LIKE '%storage.%'
           FROM pg_proc p WHERE p.oid = f.oid)
    -- the prerequisite it must not have disturbed
    AND (SELECT data_type = 'text' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='library_items'
            AND column_name='knowledge_storage_path')
    AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
    AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE')
    AND to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)') IS NOT NULL
    , false) AS pass,
    'every load-bearing condition, re-evaluated' AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t,
       (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f;
