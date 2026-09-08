-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE verifier. READ ONLY.
--
-- Run after 20260908090000_knowledge_pdf_area_image_placement_mapping.sql.
-- Every row returns an explicit `pass` boolean, and the last row is the release
-- gate: it is the SAME fingerprint the rollout evaluates to recognise POST and
-- to postflight itself, pasted here verbatim, so no condition can hold in one
-- file and be missing from the other. Nothing release-critical lives only in a
-- diagnostic row above.
--
-- PLAIN SQL ONLY. No psql metacommands of any kind: this file must run through
-- whatever executes SQL for the release -- psql, a driver, the Supabase SQL
-- editor. Signatures are written out in full rather than carried in
-- client-side variables.
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
-- SQL errors belong to the rollout, which is the thing that must refuse to
-- proceed. This file only reports.
--
-- It reads catalogs and structural columns only. No filename, page text, quote,
-- excerpt or any other document content is selected, and no PDF is opened.
-- Nothing here writes.

-- 1. The server-owned mapping table exists.
SELECT 1 AS section, 'mapping table exists' AS check,
    COALESCE(to_regclass('public.knowledge_pdf_area_image_placements') IS NOT NULL, false) AS pass,
    COALESCE(to_regclass('public.knowledge_pdf_area_image_placements')::text, 'absent') AS detail;

-- 2. Its columns are exactly the reviewed shape: four, named, typed, NOT NULL,
--    and created_at defaulted by the server rather than by a client.
SELECT 2 AS section, 'mapping columns exact (4, uuid/uuid/uuid/timestamptz, NOT NULL, now())' AS check,
    COALESCE((SELECT count(*) = 4 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
      AND (SELECT array_agg(column_name::text || ':' || data_type || ':' || is_nullable ORDER BY column_name::text)
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
          = ARRAY['board_id:uuid:NO','created_at:timestamp with time zone:NO',
                  'library_item_id:uuid:NO','padlet_id:uuid:NO']
      AND (SELECT column_default = 'now()' FROM information_schema.columns
            WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
              AND column_name='created_at'), false) AS pass,
    COALESCE((SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default,'-'), ', ' ORDER BY column_name)
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

-- 4. Exactly three foreign keys, each from the expected column to the expected
--    target, each ON DELETE CASCADE. The padlet cascade is what makes the
--    entitlement die with the card it was granted for.
SELECT 4 AS section, 'the EXACT constraint set: one PK, three cascading FKs, nothing else' AS check,
    COALESCE((SELECT count(*) = 4 FROM pg_constraint c WHERE c.conrelid = t.oid)
      AND (SELECT count(*) = 0 FROM pg_constraint c
            WHERE c.conrelid = t.oid AND c.contype NOT IN ('p','f'))
      AND (SELECT array_agg(c.conname::text ORDER BY c.conname::text)
             FROM pg_constraint c WHERE c.conrelid = t.oid)
          = ARRAY['knowledge_pdf_area_image_placements_board_id_fkey',
                  'knowledge_pdf_area_image_placements_library_item_id_fkey',
                  'knowledge_pdf_area_image_placements_padlet_id_fkey',
                  'knowledge_pdf_area_image_placements_pkey']
      AND (SELECT count(*) = 3 FROM pg_constraint c
               WHERE c.conrelid = t.oid AND c.contype = 'f' AND c.confdeltype = 'c')
      AND EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                     AND c.confrelid = to_regclass('public.padlets')
                     AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = t.oid AND a.attname='padlet_id')]::int2[])
      AND EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                     AND c.confrelid = to_regclass('public.library_items')
                     AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = t.oid AND a.attname='library_item_id')]::int2[])
      AND EXISTS (SELECT 1 FROM pg_constraint c
                   WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                     AND c.confrelid = to_regclass('public.boards')
                     AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                            WHERE a.attrelid = t.oid AND a.attname='board_id')]::int2[]), false) AS pass,
    COALESCE((SELECT string_agg(c.conname || ':' || c.contype::text || '->' || c.confdeltype::text, ', '
                                ORDER BY c.conname)
                FROM pg_constraint c
               WHERE c.conrelid = t.oid), 'absent') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 5. RLS is on and there is not one policy: nothing without BYPASSRLS may read
--    or write a row, whatever privileges may later appear.
SELECT 5 AS section, 'RLS enabled with ZERO policies' AS check,
    COALESCE((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid)
             AND (SELECT count(*) = 0 FROM pg_policy p WHERE p.polrelid = t.oid), false) AS pass,
    COALESCE(format('rls=%s policies=%s',
        (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = t.oid),
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = t.oid)), 'absent') AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 6. Browser roles hold ZERO privileges of any kind. PostgreSQL 17's MAINTAIN
--    is invisible to information_schema, so it is asked for by name.
SELECT 6 AS section, 'anon and authenticated have no privilege on the mapping' AS check,
    COALESCE(NOT (
        has_table_privilege('anon', t.oid, 'SELECT')
     OR has_table_privilege('anon', t.oid, 'INSERT')
     OR has_table_privilege('anon', t.oid, 'UPDATE')
     OR has_table_privilege('anon', t.oid, 'DELETE')
     OR has_table_privilege('anon', t.oid, 'TRUNCATE')
     OR has_table_privilege('anon', t.oid, 'REFERENCES')
     OR has_table_privilege('anon', t.oid, 'TRIGGER')
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

-- 7. The trusted server authority can still maintain it.
SELECT 7 AS section, 'service_role may write the mapping' AS check,
    COALESCE(has_table_privilege('service_role', t.oid, 'SELECT')
         AND has_table_privilege('service_role', t.oid, 'INSERT')
         AND has_table_privilege('service_role', t.oid, 'DELETE'), false) AS pass,
    'server authority only' AS detail
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t;

-- 8. The trusted reuse RPC: exact identity, exact authority. Resolved by oid
--    first, so an absent function is a `false` rather than an aborted report.
SELECT 8 AS section, 'reuse RPC: exactly one of that name, plus signature, result, language, INVOKER, search_path, ACL' AS check,
    COALESCE(
      f.oid IS NOT NULL
      AND (SELECT count(*) = 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'create_knowledge_pdf_area_image_reuse_placement')
      AND (SELECT NOT p.prosecdef
                  AND l.lanname = 'plpgsql'
                  AND COALESCE(p.proconfig, ARRAY[]::text[]) = ARRAY['search_path=public']::text[]
                  AND pg_get_function_identity_arguments(p.oid)
                      = 'p_padlet_id uuid, p_board_id uuid, p_user_id uuid, p_library_item_id uuid, p_title text, p_content text, p_position_x double precision, p_position_y double precision, p_width double precision, p_height double precision, p_board_file_url text, p_metadata jsonb'
                  AND pg_get_function_result(p.oid)
                      = 'TABLE(padlet_id uuid, library_item_id uuid, board_id uuid)'
             FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f.oid)
      AND has_function_privilege('service_role', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
      AND NOT has_function_privilege('public', f.oid, 'EXECUTE'), false) AS pass,
    CASE WHEN f.oid IS NULL THEN 'absent'
         ELSE format('overloads=%s invoker=%s config=%s service=%s authenticated=%s anon=%s public=%s',
              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname='public' AND p.proname='create_knowledge_pdf_area_image_reuse_placement'),
              (SELECT NOT p.prosecdef FROM pg_proc p WHERE p.oid = f.oid),
              (SELECT COALESCE(p.proconfig, ARRAY[]::text[]) FROM pg_proc p WHERE p.oid = f.oid),
              has_function_privilege('service_role', f.oid, 'EXECUTE'),
              has_function_privilege('authenticated', f.oid, 'EXECUTE'),
              has_function_privilege('anon', f.oid, 'EXECUTE'),
              has_function_privilege('public', f.oid, 'EXECUTE')) END AS detail
  FROM (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f;

-- 9. WHAT that function is, pinned by the digest of its shipped body -- and,
--    for a reader, by the load-bearing operations that digest covers: it
--    re-proves board edit authority and Library ownership, judges provenance
--    with the shared mirror, writes the placement and the mapping (with the
--    AUTHORISED board) in one transaction, creates no Library row, and touches
--    no Storage.
SELECT 9 AS section, 'reuse RPC body is the reviewed one, and binds the authorised board' AS check,
    COALESCE((SELECT md5(p.prosrc) = 'c67271ebcc867aaf7f1d272746c62094'
                AND p.prosrc LIKE '%board_collaborators%'
                AND p.prosrc LIKE '%is_knowledge_pdf_area_provenance%'
                AND p.prosrc LIKE '%INSERT INTO public.padlets%'
                AND p.prosrc LIKE '%INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id, board_id)%'
                AND p.prosrc LIKE '%VALUES (p_padlet_id, p_library_item_id, p_board_id)%'
                AND p.prosrc NOT LIKE '%INSERT INTO public.library_items%'
                AND p.prosrc NOT LIKE '%p_storage_path%'
                AND p.prosrc NOT LIKE '%storage.%'
                AND p.prosrc NOT LIKE '%board-derived/%'
                FROM pg_proc p WHERE p.oid = f.oid), false) AS pass,
    CASE WHEN f.oid IS NULL THEN 'absent'
         ELSE COALESCE((SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = f.oid), 'unknown') END AS detail
  FROM (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f;

-- 10. The durable-preview correction this one depends on is UNCHANGED: the
--     protected column is still there, still text, and still not writable by a
--     browser role. This rollout owns none of it and must not have moved it.
SELECT 10 AS section, 'durable-preview protected column unchanged' AS check,
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

-- 11. Diagnostic only, never a gate: how many placements are mapped. The
--     rollout writes NONE -- every row here was written one drop at a time by
--     the trusted path -- so a fresh release legitimately reports 0. The count
--     is deferred through query_to_xml so the table NAME is resolved at
--     execution time: naming an absent relation directly would fail at parse
--     time, which is exactly the state this report must be able to describe.
SELECT 11 AS section, 'mapping rows (diagnostic, not a gate)' AS check,
    true AS pass,
    CASE WHEN to_regclass('public.knowledge_pdf_area_image_placements') IS NULL THEN 'absent'
         ELSE COALESCE((xpath('/row/c/text()',
                query_to_xml('SELECT count(*) AS c FROM public.knowledge_pdf_area_image_placements',
                             false, true, '')))[1]::text, 'unknown')
    END AS detail;

-- 12. THE RELEASE GATE. Byte-identical to the fingerprint the rollout uses to
--     recognise POST and to postflight itself: every load-bearing condition,
--     re-evaluated here, COALESCEd so a NULL can never read as success. This
--     row is literally TRUE or FALSE and never NULL.
SELECT 12 AS section, 'COMPLETE PASS' AS check, gate.pass AS pass,
    'every load-bearing condition, re-evaluated' AS detail
  FROM (
SELECT COALESCE(
       t.oid IS NOT NULL
   AND f.oid IS NOT NULL
   AND (SELECT count(*) = 4 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
   AND (SELECT array_agg(column_name::text || ':' || data_type || ':' || is_nullable
                         ORDER BY column_name::text)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements')
       = ARRAY['board_id:uuid:NO','created_at:timestamp with time zone:NO',
               'library_item_id:uuid:NO','padlet_id:uuid:NO']
   AND (SELECT column_default = 'now()' FROM information_schema.columns
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
           AND column_name='created_at')
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype = 'p'
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='padlet_id')]::int2[])
   AND (SELECT count(*) = 4 FROM pg_constraint c WHERE c.conrelid = t.oid)
   AND (SELECT count(*) = 1 FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'p')
   AND (SELECT count(*) = 3 FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'f')
   AND (SELECT count(*) = 0 FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype NOT IN ('p','f'))
   AND (SELECT array_agg(c.conname::text ORDER BY c.conname::text)
          FROM pg_constraint c WHERE c.conrelid = t.oid)
       = ARRAY['knowledge_pdf_area_image_placements_board_id_fkey',
               'knowledge_pdf_area_image_placements_library_item_id_fkey',
               'knowledge_pdf_area_image_placements_padlet_id_fkey',
               'knowledge_pdf_area_image_placements_pkey']
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.padlets')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='padlet_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.padlets') AND a.attname='id')]::int2[])
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.library_items')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='library_item_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.library_items') AND a.attname='id')]::int2[])
   AND EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.conrelid = t.oid AND c.contype='f' AND c.confdeltype='c'
                  AND c.confrelid = to_regclass('public.boards')
                  AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                         WHERE a.attrelid = t.oid AND a.attname='board_id')]::int2[]
                  AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                          WHERE a.attrelid = to_regclass('public.boards') AND a.attname='id')]::int2[])
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
   AND (SELECT COALESCE(count(*) = 0, true) FROM information_schema.table_privileges
         WHERE table_schema='public' AND table_name='knowledge_pdf_area_image_placements'
           AND grantee IN ('PUBLIC','anon','authenticated'))
   AND has_table_privilege('service_role', t.oid, 'SELECT')
   AND has_table_privilege('service_role', t.oid, 'INSERT')
   AND has_table_privilege('service_role', t.oid, 'DELETE')
   AND (SELECT count(*) = 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'create_knowledge_pdf_area_image_reuse_placement')
   AND (SELECT NOT p.prosecdef
                AND l.lanname = 'plpgsql'
                AND COALESCE(p.proconfig, ARRAY[]::text[]) = ARRAY['search_path=public']::text[]
                AND pg_get_function_identity_arguments(p.oid)
                    = 'p_padlet_id uuid, p_board_id uuid, p_user_id uuid, p_library_item_id uuid, p_title text, p_content text, p_position_x double precision, p_position_y double precision, p_width double precision, p_height double precision, p_board_file_url text, p_metadata jsonb'
                AND pg_get_function_result(p.oid)
                    = 'TABLE(padlet_id uuid, library_item_id uuid, board_id uuid)'
                AND md5(p.prosrc) = 'c67271ebcc867aaf7f1d272746c62094'
                AND p.prosrc LIKE '%board_collaborators%'
                AND p.prosrc LIKE '%is_knowledge_pdf_area_provenance%'
                AND p.prosrc LIKE '%INSERT INTO public.padlets%'
                AND p.prosrc LIKE '%INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id, board_id)%'
                AND p.prosrc LIKE '%VALUES (p_padlet_id, p_library_item_id, p_board_id)%'
                AND p.prosrc NOT LIKE '%INSERT INTO public.library_items%'
                AND p.prosrc NOT LIKE '%p_storage_path%'
                AND p.prosrc NOT LIKE '%storage.%'
                AND p.prosrc NOT LIKE '%board-derived/%'
          FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f.oid)
   AND has_function_privilege('service_role', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
   AND NOT has_function_privilege('public', f.oid, 'EXECUTE')
   AND (SELECT data_type = 'text' FROM information_schema.columns
         WHERE table_schema='public' AND table_name='library_items'
           AND column_name='knowledge_storage_path')
   AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT')
   AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
   AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','INSERT')
   AND NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE')
   AND to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)') IS NOT NULL
   , false)
  FROM (SELECT to_regclass('public.knowledge_pdf_area_image_placements') AS oid) t,
       (SELECT to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement(uuid, uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)') AS oid) f
  ) AS gate(pass);
