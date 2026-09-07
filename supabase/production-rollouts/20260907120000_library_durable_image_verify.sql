-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW verifier. READ ONLY.
--
-- Run after 20260907120000_library_durable_image.sql. Every row returns an
-- explicit `pass` boolean and section 12 is the release gate: it repeats every
-- load-bearing condition rather than trusting an operator to read the rows
-- above, and every conjunct is COALESCEd so a NULL can never read as success.
--
-- WHAT IT DELIBERATELY DOES NOT CHECK: that a durable row still has a live
-- origin placement. Trust is established ONCE, when the path is written, by the
-- structural join in the rollout. The feature exists precisely so the object
-- outlives its placements, so requiring one here would fail the moment the
-- correction started working.
--
-- It reads catalogs and structural columns only. No filename, page text, quote,
-- excerpt or any other document content is selected, and no PDF is opened.
-- Nothing here writes.

\set fn 'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)'
\set genericfn 'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)'
\set pathre '^board-derived/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/pdf-areas/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.webp$'

-- 1. The server-owned location column exists, is text and is nullable.
SELECT 1 AS section, 'knowledge_storage_path exists, text, nullable' AS check,
    COALESCE((SELECT data_type = 'text' AND is_nullable = 'YES'
                FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items'
                 AND column_name='knowledge_storage_path'), false) AS pass,
    COALESCE((SELECT data_type || '/' || is_nullable FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items'
                 AND column_name='knowledge_storage_path'), 'absent') AS detail;

-- 2. No table-wide browser write authority survives, in any form.
SELECT 2 AS section, 'no table-wide browser write authority' AS check,
    COALESCE(NOT (
        has_table_privilege('authenticated','public.library_items','INSERT')
     OR has_table_privilege('authenticated','public.library_items','UPDATE')
     OR has_table_privilege('authenticated','public.library_items','TRUNCATE')
     OR has_table_privilege('authenticated','public.library_items','REFERENCES')
     OR has_table_privilege('authenticated','public.library_items','TRIGGER')
     OR has_table_privilege('anon','public.library_items','INSERT')
     OR has_table_privilege('anon','public.library_items','UPDATE')
     OR has_table_privilege('anon','public.library_items','DELETE')
     OR has_table_privilege('anon','public.library_items','TRUNCATE')
     OR has_table_privilege('anon','public.library_items','REFERENCES')
     OR has_table_privilege('anon','public.library_items','TRIGGER')), false) AS pass,
    format('authenticated ins=%s upd=%s trunc=%s ref=%s trig=%s | anon ins=%s upd=%s del=%s',
        has_table_privilege('authenticated','public.library_items','INSERT'),
        has_table_privilege('authenticated','public.library_items','UPDATE'),
        has_table_privilege('authenticated','public.library_items','TRUNCATE'),
        has_table_privilege('authenticated','public.library_items','REFERENCES'),
        has_table_privilege('authenticated','public.library_items','TRIGGER'),
        has_table_privilege('anon','public.library_items','INSERT'),
        has_table_privilege('anon','public.library_items','UPDATE'),
        has_table_privilege('anon','public.library_items','DELETE')) AS detail;

-- 3. The new column is outside every browser mutation grant.
SELECT 3 AS section, 'knowledge_storage_path not browser-writable' AS check,
    COALESCE(NOT (
        has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT')
     OR has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
     OR has_column_privilege('anon','public.library_items','knowledge_storage_path','INSERT')
     OR has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE')), false) AS pass,
    'server-owned' AS detail;

-- 4. The exact browser column sets, and nothing beyond them. An empty grant set
--    aggregates to NULL, so both sides are COALESCEd to an empty array.
SELECT 4 AS section, 'authenticated INSERT/UPDATE column sets are exact' AS check,
    COALESCE(ins = ARRAY['content','description','is_public','thumbnail_url','title','type','user_id']
             AND upd = ARRAY['content','thumbnail_url','updated_at'], false) AS pass,
    format('insert=%s update=%s', ins, upd) AS detail
  FROM (
    SELECT
      COALESCE((SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text)
                  FROM information_schema.column_privileges
                 WHERE grantee='authenticated' AND table_schema='public'
                   AND table_name='library_items' AND privilege_type='INSERT'), ARRAY[]::text[]) AS ins,
      COALESCE((SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text)
                  FROM information_schema.column_privileges
                 WHERE grantee='authenticated' AND table_schema='public'
                   AND table_name='library_items' AND privilege_type='UPDATE'), ARRAY[]::text[]) AS upd
  ) g;

-- 5. The trusted creation function exists and only service_role may run it.
SELECT 5 AS section, 'trusted PDF-area creation function is service_role only' AS check,
    COALESCE(
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='create_knowledge_pdf_area_image_post_with_library_item')
      AND has_function_privilege('service_role', :'fn', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', :'fn', 'EXECUTE')
      AND NOT has_function_privilege('anon', :'fn', 'EXECUTE')
      AND NOT has_function_privilege('public', :'fn', 'EXECUTE'), false) AS pass,
    format('service=%s authenticated=%s anon=%s public=%s',
        has_function_privilege('service_role', :'fn', 'EXECUTE'),
        has_function_privilege('authenticated', :'fn', 'EXECUTE'),
        has_function_privilege('anon', :'fn', 'EXECUTE'),
        has_function_privilege('public', :'fn', 'EXECUTE')) AS detail;

-- 6. It is SECURITY INVOKER, takes no path, and the generic function is intact.
SELECT 6 AS section, 'trusted function derives its own path; generic RPC intact' AS check,
    COALESCE((SELECT NOT p.prosecdef
                AND p.prosrc NOT LIKE '%p_storage_path%'
                AND p.prosrc NOT LIKE '%p_durable_object_path%'
                AND p.prosrc LIKE '%board-derived/%'
                AND p.prosrc LIKE '%knowledge-pdf-area%'
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public'
                 AND p.proname='create_knowledge_pdf_area_image_post_with_library_item'), false)
    AND COALESCE(has_function_privilege('authenticated', :'genericfn', 'EXECUTE'), false) AS pass,
    'SECURITY INVOKER, derives path internally, generic image RPC still granted' AS detail;

-- 6b. Parser parity. Every row here is a case the TypeScript parser decides one
--     way, asserted to decide the same way in SQL -- and no malformed input may
--     raise instead of returning false.
SELECT '6b' AS section, 'provenance mirror matches the TypeScript parser' AS check,
    COALESCE(
      -- ACCEPTED by parseKnowledgePdfAreaProvenance:
      public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":0.1,"y":0.1,"width":0.2,"height":0.2}}}'::jsonb)
      -- Number.isInteger(1.0) is true: a digits-only text regex would strand this row.
      AND public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1.0,"region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      -- finalizeRegion clamps a hair below zero to 0 rather than rejecting.
      AND public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":2,"region":{"x":-0.0000000001,"y":-0.0000000001,"width":0.5,"height":0.5}}}'::jsonb)
      -- Full-page and epsilon overhang are both inside tolerance.
      AND public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":7,"region":{"x":0.5,"y":0.5,"width":0.5000000001,"height":0.5}}}'::jsonb)
      -- REJECTED, each returning false rather than raising:
      AND NOT public.is_knowledge_pdf_area_provenance(NULL)
      AND NOT public.is_knowledge_pdf_area_provenance('{}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance('[]'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance('{"source":[]}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance('{"source":"x"}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance('{"source":{"kind":"upload"}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance('{"source":{"kind":"knowledge-pdf-area"}}'::jsonb)
      -- document id: missing, wrong type, non-canonical
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":5,"pageNumber":1,"region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"not-a-uuid","pageNumber":1,"region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      -- page: wrong type, non-integral, below 1
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":"1","region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1.5,"region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":0,"region":{"x":0,"y":0,"width":1,"height":1}}}'::jsonb)
      -- region: missing, wrong type, member wrong type, malformed numeric text
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":[]}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":"0","y":0,"width":1,"height":1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":"abc","y":"1e","width":"--3","height":"NaN"}}}'::jsonb)
      -- zero/negative extent, and overhang beyond tolerance
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":0,"y":0,"width":0,"height":1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":0,"y":0,"width":1,"height":-1}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":0.9,"y":0,"width":0.5,"height":0.5}}}'::jsonb)
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":-0.5,"y":0,"width":0.5,"height":0.5}}}'::jsonb)
      -- a coordinate exactly at the far edge leaves no area after trimming
      AND NOT public.is_knowledge_pdf_area_provenance(
        '{"source":{"kind":"knowledge-pdf-area","knowledgeDocumentId":"11111111-1111-4111-8111-111111111111","pageNumber":1,"region":{"x":1,"y":0,"width":0.0000000001,"height":0.5}}}'::jsonb),
      false) AS pass,
    'accepts what TypeScript accepts, rejects the rest, never raises' AS detail;

-- 7. RLS enabled, and the EXACT accepted owner-policy set.
--
--    `qual LIKE '%uid()%'` is not proof: `auth.uid() = user_id OR true` would
--    satisfy it. Each of the four commands is pinned to its own normalised
--    predicate in the correct clause, and a USING/WITH CHECK that has become
--    NULL -- i.e. unrestricted -- fails the FILTER rather than passing it.
SELECT 7 AS section, 'RLS enabled and the exact owner-policy set is intact' AS check,
    COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname='library_items'), false)
    AND COALESCE((SELECT count(*) = 4
           AND count(*) FILTER (WHERE cmd='SELECT'
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
           AND count(*) FILTER (WHERE cmd='INSERT'
                 AND qual IS NULL AND replace(with_check,' ','')='(auth.uid()=user_id)') = 1
           AND count(*) FILTER (WHERE cmd='UPDATE'
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
           AND count(*) FILTER (WHERE cmd='DELETE'
                 AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
          FROM pg_policies WHERE schemaname='public' AND tablename='library_items'), false) AS pass,
    COALESCE((SELECT format('rls=%s policies=%s cmds=%s',
                (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname='library_items'),
                count(*), string_agg(DISTINCT cmd, ',' ORDER BY cmd))
                FROM pg_policies WHERE schemaname='public' AND tablename='library_items'), 'none') AS detail;

-- 7b. anon holds SELECT and nothing else -- proven as an exact set, not as a
--     list of absences that a future grant could slip past.
SELECT '7b' AS section, 'anon table privileges are exactly SELECT' AS check,
    COALESCE((SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
                FROM information_schema.table_privileges
               WHERE grantee='anon' AND table_schema='public' AND table_name='library_items')
             = ARRAY['SELECT'], false)
    AND COALESCE((SELECT count(*) FROM information_schema.column_privileges
                   WHERE grantee='anon' AND table_schema='public' AND table_name='library_items'
                     AND privilege_type IN ('INSERT','UPDATE')) = 0, false) AS pass,
    COALESCE((SELECT array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text)::text
                FROM information_schema.table_privileges
               WHERE grantee='anon' AND table_schema='public' AND table_name='library_items'), '{}') AS detail;

-- 7c. authenticated holds exactly SELECT and DELETE at table level.
SELECT '7c' AS section, 'authenticated table privileges are exactly SELECT+DELETE' AS check,
    COALESCE((SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
                FROM information_schema.table_privileges
               WHERE grantee='authenticated' AND table_schema='public' AND table_name='library_items')
             = ARRAY['DELETE','SELECT'], false) AS pass,
    COALESCE((SELECT array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text)::text
                FROM information_schema.table_privileges
               WHERE grantee='authenticated' AND table_schema='public' AND table_name='library_items'), '{}') AS detail;

-- 7d. The provenance mirror is internal machinery: no browser role may call it.
SELECT '7d' AS section, 'provenance helper is not browser-executable' AS check,
    COALESCE(NOT has_function_privilege('public','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE')
         AND NOT has_function_privilege('anon','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE')
         AND NOT has_function_privilege('authenticated','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE')
         AND has_function_privilege('service_role','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'), false) AS pass,
    format('public=%s anon=%s authenticated=%s service_role=%s',
        has_function_privilege('public','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'),
        has_function_privilege('anon','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'),
        has_function_privilege('authenticated','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'),
        has_function_privilege('service_role','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE')) AS detail;

-- 8. Durable rows satisfy the contract that SURVIVES placement deletion.
--    A live padlet is deliberately NOT required here.
SELECT 8 AS section, 'durable rows are canonical, image, valid provenance' AS check,
    COALESCE((SELECT count(*) FROM public.library_items li
               WHERE li.knowledge_storage_path IS NOT NULL
                 AND NOT (li.knowledge_storage_path ~ :'pathre'
                          AND li.type = 'image'
                          AND public.is_knowledge_pdf_area_provenance(li.content -> 'metadata'))) = 0, false) AS pass,
    format('%s durable row(s) failing the contract',
        COALESCE((SELECT count(*) FROM public.library_items li
                   WHERE li.knowledge_storage_path IS NOT NULL
                     AND NOT (li.knowledge_storage_path ~ :'pathre'
                              AND li.type = 'image'
                              AND public.is_knowledge_pdf_area_provenance(li.content -> 'metadata'))), -1)) AS detail;

-- 8b. A durable row never previews through a board-scoped URL.
SELECT '8b' AS section, 'durable rows preview through their own Library URL' AS check,
    COALESCE((SELECT count(*) FROM public.library_items li
               WHERE li.knowledge_storage_path IS NOT NULL
                 AND li.thumbnail_url ~ '^/api/boards/'
                 AND li.thumbnail_url IS DISTINCT FROM '/api/library/items/' || li.id::text || '/image') = 0, false) AS pass,
    'no durable row left on a stale board-scoped preview' AS detail;

-- 8c. No composite was downgraded: a row carrying a newer representation must
--     never have been repointed at its original crop.
SELECT '8c' AS section, 'no composite row was repointed to the original crop' AS check,
    COALESCE((SELECT count(*) FROM public.library_items li
               WHERE li.thumbnail_url = '/api/library/items/' || li.id::text || '/image'
                 AND (li.content -> 'metadata' ->> 'drawing' IS NOT NULL
                      OR li.content -> 'metadata' ->> 'previewUrl' IS NOT NULL)) = 0, false) AS pass,
    'composite/preview state preserved' AS detail;

-- 9. Counts, for the operator. Structural only -- no titles, no content.
SELECT 9 AS section, 'population' AS check, true AS pass,
    format('pdf_area_library_rows=%s durable_path_set=%s unrecoverable_null_path=%s already_composite_or_other_url=%s',
      count(*),
      count(*) FILTER (WHERE knowledge_storage_path IS NOT NULL),
      count(*) FILTER (WHERE knowledge_storage_path IS NULL
                         AND thumbnail_url ~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'),
      count(*) FILTER (WHERE knowledge_storage_path IS NULL
                         AND (thumbnail_url IS NULL
                              OR thumbnail_url !~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'))) AS detail
  FROM public.library_items
 WHERE type = 'image'
   AND content -> 'metadata' -> 'source' ->> 'kind' = 'knowledge-pdf-area';

-- 10. Migration state is complete: both functions and the column are present.
SELECT 10 AS section, 'rollout state complete' AS check,
    COALESCE(
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items' AND column_name='knowledge_storage_path')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='create_knowledge_pdf_area_image_post_with_library_item')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='is_knowledge_pdf_area_provenance')
      AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='create_image_post_with_library_item'), false) AS pass,
    'column + trusted RPC + provenance mirror + generic RPC' AS detail;

-- 11. Library route prerequisites SQL can prove: the columns it selects exist.
SELECT 11 AS section, 'Library serve route schema prerequisites' AS check,
    COALESCE((SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items'
                 AND column_name IN ('id','type','knowledge_storage_path','content')) = 4, false) AS pass,
    'id, type, knowledge_storage_path, content all present' AS detail;

-- 12. RELEASE GATE. Every load-bearing condition, repeated here so the gate can
--     never pass on a section nobody read. Each conjunct fails closed.
SELECT 12 AS section, 'ROLL-UP' AS check,
  COALESCE((SELECT data_type='text' FROM information_schema.columns
             WHERE table_schema='public' AND table_name='library_items'
               AND column_name='knowledge_storage_path'), false)
  AND COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='library_items'), false)
  AND COALESCE(NOT has_table_privilege('authenticated','public.library_items','INSERT'), false)
  AND COALESCE(NOT has_table_privilege('authenticated','public.library_items','UPDATE'), false)
  AND COALESCE(NOT has_table_privilege('authenticated','public.library_items','TRUNCATE'), false)
  AND COALESCE(NOT has_table_privilege('authenticated','public.library_items','REFERENCES'), false)
  AND COALESCE(NOT has_table_privilege('authenticated','public.library_items','TRIGGER'), false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','INSERT'), false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','UPDATE'), false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','DELETE'), false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','TRUNCATE'), false)
  AND COALESCE(NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT'), false)
  AND COALESCE(NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE'), false)
  AND COALESCE(NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','INSERT'), false)
  AND COALESCE(NOT has_column_privilege('anon','public.library_items','knowledge_storage_path','UPDATE'), false)
  AND COALESCE((SELECT COALESCE(array_agg(DISTINCT column_name::text ORDER BY column_name::text), ARRAY[]::text[])
                  FROM information_schema.column_privileges
                 WHERE grantee='authenticated' AND table_schema='public'
                   AND table_name='library_items' AND privilege_type='INSERT')
               = ARRAY['content','description','is_public','thumbnail_url','title','type','user_id'], false)
  AND COALESCE((SELECT COALESCE(array_agg(DISTINCT column_name::text ORDER BY column_name::text), ARRAY[]::text[])
                  FROM information_schema.column_privileges
                 WHERE grantee='authenticated' AND table_schema='public'
                   AND table_name='library_items' AND privilege_type='UPDATE')
               = ARRAY['content','thumbnail_url','updated_at'], false)
  AND COALESCE(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname='public' AND p.proname='create_knowledge_pdf_area_image_post_with_library_item'), false)
  AND COALESCE((SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='create_knowledge_pdf_area_image_post_with_library_item'), false)
  AND COALESCE(has_function_privilege('service_role', :'fn', 'EXECUTE'), false)
  AND COALESCE(NOT has_function_privilege('authenticated', :'fn', 'EXECUTE'), false)
  AND COALESCE(NOT has_function_privilege('anon', :'fn', 'EXECUTE'), false)
  AND COALESCE(NOT has_function_privilege('public', :'fn', 'EXECUTE'), false)
  AND COALESCE(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname='public' AND p.proname='create_image_post_with_library_item'), false)
  AND COALESCE(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname='public' AND p.proname='is_knowledge_pdf_area_provenance'), false)
  AND COALESCE((SELECT count(*) FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='library_items'
                   AND column_name IN ('id','type','knowledge_storage_path','content')) = 4, false)
  -- Durable rows: canonical, image, valid provenance. NO live padlet required.
  AND COALESCE((SELECT count(*) FROM public.library_items li
                 WHERE li.knowledge_storage_path IS NOT NULL
                   AND NOT (li.knowledge_storage_path ~ :'pathre'
                            AND li.type='image'
                            AND public.is_knowledge_pdf_area_provenance(li.content -> 'metadata'))) = 0, false)
  AND COALESCE((SELECT count(*) FROM public.library_items li
                 WHERE li.knowledge_storage_path IS NOT NULL
                   AND li.thumbnail_url ~ '^/api/boards/'
                   AND li.thumbnail_url IS DISTINCT FROM '/api/library/items/' || li.id::text || '/image') = 0, false)
  AND COALESCE((SELECT count(*) FROM public.library_items li
                 WHERE li.thumbnail_url = '/api/library/items/' || li.id::text || '/image'
                   AND (li.content -> 'metadata' ->> 'drawing' IS NOT NULL
                        OR li.content -> 'metadata' ->> 'previewUrl' IS NOT NULL)) = 0, false)
  -- Exact owner-policy set. `LIKE '%uid()%'` would accept
  -- `auth.uid() = user_id OR true`, so each command is pinned individually and
  -- a NULL (unrestricted) USING/WITH CHECK fails its FILTER.
  AND COALESCE((SELECT count(*) = 4
         AND count(*) FILTER (WHERE cmd='SELECT'
               AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
         AND count(*) FILTER (WHERE cmd='INSERT'
               AND qual IS NULL AND replace(with_check,' ','')='(auth.uid()=user_id)') = 1
         AND count(*) FILTER (WHERE cmd='UPDATE'
               AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
         AND count(*) FILTER (WHERE cmd='DELETE'
               AND replace(qual,' ','')='(auth.uid()=user_id)' AND with_check IS NULL) = 1
        FROM pg_policies WHERE schemaname='public' AND tablename='library_items'), false)
  -- anon holds exactly SELECT, proven as a set rather than as absences.
  AND COALESCE((SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
                  FROM information_schema.table_privileges
                 WHERE grantee='anon' AND table_schema='public' AND table_name='library_items')
               = ARRAY['SELECT'], false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','REFERENCES'), false)
  AND COALESCE(NOT has_table_privilege('anon','public.library_items','TRIGGER'), false)
  AND COALESCE((SELECT count(*) FROM information_schema.column_privileges
                 WHERE grantee='anon' AND table_schema='public' AND table_name='library_items'
                   AND privilege_type IN ('INSERT','UPDATE')) = 0, false)
  -- authenticated holds exactly SELECT + DELETE at table level.
  AND COALESCE((SELECT COALESCE(array_agg(DISTINCT privilege_type::text ORDER BY privilege_type::text), ARRAY[]::text[])
                  FROM information_schema.table_privileges
                 WHERE grantee='authenticated' AND table_schema='public' AND table_name='library_items')
               = ARRAY['DELETE','SELECT'], false)
  -- The provenance mirror is internal machinery, not a client-callable function.
  AND COALESCE(NOT has_function_privilege('public','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'), false)
  AND COALESCE(NOT has_function_privilege('anon','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'), false)
  AND COALESCE(NOT has_function_privilege('authenticated','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'), false)
  AND COALESCE(has_function_privilege('service_role','public.is_knowledge_pdf_area_provenance(jsonb)','EXECUTE'), false)
  AS pass,
  'schema, RLS, exact policies, exact grants, RPC authority, durable-row and composite invariants' AS detail;
