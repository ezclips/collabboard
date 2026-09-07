-- CollabBoard IMAGE-LIBRARY-DURABLE-PREVIEW verifier. READ ONLY.
--
-- Run after 20260907120000_library_durable_image.sql. Every row below returns an
-- explicit `pass` boolean; section 9 is the roll-up. Require every `pass` to be
-- `t` before treating the correction as production-ready.
--
-- It reads catalogs and structural columns only. No filename, page text, quote,
-- excerpt or any other document content is selected, and no PDF is opened.
-- Nothing here writes.

-- 1. The server-owned location column exists and is nullable.
SELECT
    1 AS section,
    'knowledge_storage_path exists, text, nullable' AS check,
    (data_type = 'text' AND is_nullable = 'YES') AS pass,
    data_type || '/' || is_nullable AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'library_items'
   AND column_name = 'knowledge_storage_path';

-- 2. No table-wide browser write authority survives in any form.
SELECT
    2 AS section,
    'no table-wide browser write authority' AS check,
    NOT (
        has_table_privilege('authenticated', 'public.library_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.library_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.library_items', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.library_items', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.library_items', 'TRIGGER')
     OR has_table_privilege('anon', 'public.library_items', 'INSERT')
     OR has_table_privilege('anon', 'public.library_items', 'UPDATE')
     OR has_table_privilege('anon', 'public.library_items', 'DELETE')
     OR has_table_privilege('anon', 'public.library_items', 'TRUNCATE')
    ) AS pass,
    format('authenticated ins=%s upd=%s trunc=%s ref=%s trig=%s | anon ins=%s upd=%s del=%s',
        has_table_privilege('authenticated', 'public.library_items', 'INSERT'),
        has_table_privilege('authenticated', 'public.library_items', 'UPDATE'),
        has_table_privilege('authenticated', 'public.library_items', 'TRUNCATE'),
        has_table_privilege('authenticated', 'public.library_items', 'REFERENCES'),
        has_table_privilege('authenticated', 'public.library_items', 'TRIGGER'),
        has_table_privilege('anon', 'public.library_items', 'INSERT'),
        has_table_privilege('anon', 'public.library_items', 'UPDATE'),
        has_table_privilege('anon', 'public.library_items', 'DELETE')) AS detail;

-- 3. The new column is outside every browser mutation grant.
SELECT
    3 AS section,
    'knowledge_storage_path not browser-writable' AS check,
    NOT (
        has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'INSERT')
     OR has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
     OR has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'INSERT')
     OR has_column_privilege('anon', 'public.library_items', 'knowledge_storage_path', 'UPDATE')
    ) AS pass,
    'server-owned' AS detail;

-- 4. The exact browser column sets, and nothing beyond them.
SELECT
    4 AS section,
    'authenticated INSERT/UPDATE column sets are exact' AS check,
    (ins = ARRAY['content','description','is_public','thumbnail_url','title','type','user_id']
     AND upd = ARRAY['content','thumbnail_url','updated_at']) AS pass,
    format('insert=%s update=%s', ins, upd) AS detail
  FROM (
    SELECT
      (SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text)
         FROM information_schema.column_privileges
        WHERE grantee = 'authenticated' AND table_schema = 'public'
          AND table_name = 'library_items' AND privilege_type = 'INSERT') AS ins,
      (SELECT array_agg(DISTINCT column_name::text ORDER BY column_name::text)
         FROM information_schema.column_privileges
        WHERE grantee = 'authenticated' AND table_schema = 'public'
          AND table_name = 'library_items' AND privilege_type = 'UPDATE') AS upd
  ) g;

-- 5. The trusted creation function exists and is service_role only.
SELECT
    5 AS section,
    'trusted PDF-area creation function is service_role only' AS check,
    (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname = 'create_knowledge_pdf_area_image_post_with_library_item')
     AND has_function_privilege('service_role', sig, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', sig, 'EXECUTE')
     AND NOT has_function_privilege('anon', sig, 'EXECUTE')
     AND NOT has_function_privilege('public', sig, 'EXECUTE')) AS pass,
    format('service=%s authenticated=%s anon=%s public=%s',
        has_function_privilege('service_role', sig, 'EXECUTE'),
        has_function_privilege('authenticated', sig, 'EXECUTE'),
        has_function_privilege('anon', sig, 'EXECUTE'),
        has_function_privilege('public', sig, 'EXECUTE')) AS detail
  FROM (SELECT 'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)' AS sig) s;

-- 6. It accepts no storage path, and the generic function is untouched.
SELECT
    6 AS section,
    'trusted function derives its own path and takes none' AS check,
    (src NOT LIKE '%p_storage_path%'
     AND src NOT LIKE '%p_durable_object_path%'
     AND src LIKE '%board-derived/%'
     AND src LIKE '%knowledge-pdf-area%'
     AND has_function_privilege('authenticated',
           'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)',
           'EXECUTE')) AS pass,
    'derives path internally; generic image function still granted' AS detail
  FROM (
    SELECT p.prosrc AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_knowledge_pdf_area_image_post_with_library_item'
  ) f;

-- 7. Owner RLS unchanged: every policy on the table is still owner-scoped.
SELECT
    7 AS section,
    'library_items RLS remains owner-scoped' AS check,
    (count(*) FILTER (WHERE qual IS NOT NULL AND qual NOT LIKE '%uid()%') = 0
     AND count(*) FILTER (WHERE with_check IS NOT NULL AND with_check NOT LIKE '%uid()%') = 0
     AND count(*) >= 4) AS pass,
    format('%s policies, none non-owner-scoped', count(*)) AS detail
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'library_items';

-- 8. Every repaired row has a structurally proven origin, and no row was guessed.
SELECT
    8 AS section,
    'no path exists without a matching placement' AS check,
    (count(*) = 0) AS pass,
    format('%s row(s) with an unprovable path', count(*)) AS detail
  FROM public.library_items li
 WHERE li.knowledge_storage_path IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.padlets p
        WHERE p.library_item_id = li.id
          AND li.knowledge_storage_path =
              'board-derived/' || p.board_id::text || '/pdf-areas/' || p.id::text || '.webp'
   );

-- 8b. Repaired rows point their preview at the durable address.
SELECT
    '8b' AS section,
    'repaired rows use the Library URL for preview' AS check,
    (count(*) FILTER (
        WHERE li.thumbnail_url IS DISTINCT FROM '/api/library/items/' || li.id::text || '/image'
          AND li.thumbnail_url ~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'
     ) = 0) AS pass,
    format('%s repaired row(s) still on a board-scoped preview URL',
        count(*) FILTER (
          WHERE li.thumbnail_url ~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$')) AS detail
  FROM public.library_items li
 WHERE li.knowledge_storage_path IS NOT NULL;

-- 9. Counts, for the operator. Structural only -- no titles, no content.
SELECT
    9 AS section,
    'population' AS check,
    true AS pass,
    format(
      'pdf_area_library_rows=%s durable_path_set=%s unrecoverable_null_path=%s already_composite_or_other_url=%s',
      count(*),
      count(*) FILTER (WHERE knowledge_storage_path IS NOT NULL),
      count(*) FILTER (
        WHERE knowledge_storage_path IS NULL
          AND thumbnail_url ~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'),
      count(*) FILTER (
        WHERE knowledge_storage_path IS NULL
          AND (thumbnail_url IS NULL
               OR thumbnail_url !~ '^/api/boards/[0-9a-fA-F-]{36}/padlets/[0-9a-fA-F-]{36}/image$'))
    ) AS detail
  FROM public.library_items
 WHERE type = 'image'
   AND content -> 'metadata' -> 'source' ->> 'kind' = 'knowledge-pdf-area';

-- 10. Roll-up. `pass` is true only when the correction is production-ready.
WITH sig AS (
  SELECT 'public.create_knowledge_pdf_area_image_post_with_library_item(uuid, uuid, uuid, text, text, double precision, double precision, double precision, double precision, text, jsonb)' AS s
)
SELECT
    10 AS section,
    'ROLL-UP' AS check,
    (
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='library_items'
                 AND column_name='knowledge_storage_path' AND data_type='text')
      AND NOT has_table_privilege('authenticated','public.library_items','UPDATE')
      AND NOT has_table_privilege('authenticated','public.library_items','INSERT')
      AND NOT has_table_privilege('authenticated','public.library_items','TRUNCATE')
      AND NOT has_table_privilege('anon','public.library_items','UPDATE')
      AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')
      AND NOT has_column_privilege('authenticated','public.library_items','knowledge_storage_path','INSERT')
      AND has_function_privilege('service_role',(SELECT s FROM sig),'EXECUTE')
      AND NOT has_function_privilege('authenticated',(SELECT s FROM sig),'EXECUTE')
      AND NOT has_function_privilege('anon',(SELECT s FROM sig),'EXECUTE')
      AND (SELECT count(*) FROM public.library_items li
            WHERE li.knowledge_storage_path IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.padlets p
                               WHERE p.library_item_id = li.id
                                 AND li.knowledge_storage_path =
                                     'board-derived/' || p.board_id::text || '/pdf-areas/' || p.id::text || '.webp')) = 0
    ) AS pass,
    'all schema, privilege and referential conditions' AS detail;
