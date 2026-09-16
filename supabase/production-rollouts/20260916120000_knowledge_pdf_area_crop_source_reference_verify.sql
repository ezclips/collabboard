-- Read-only verification for
-- 20260916120000_knowledge_pdf_area_crop_source_reference.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog plus two public tables,
-- runs unchanged inside `BEGIN TRANSACTION READ ONLY`, and is safe before a
-- rollout, after one, or against a partial state.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row -- no separate roll-up can drift from the rows
-- above it. Scan for `pass = f`, or read readiness from any row.
--
-- RUN IT TWICE: once BEFORE the rollout and once AFTER.
--   BEFORE: rows 1-2 fail (neither function writes a reference yet) and row 9
--           reports crops_without_reference = 6. That 6 is the dry run -- it is
--           the exact set the backfill will create, counted without writing.
--   AFTER:  every row passes and row 9 reports crops_without_reference = 0.
-- A pass is visible as "0 crops without a reference".
--
-- WHY THE BODY IS SEARCHED RATHER THAN DIGESTED. The sibling verifier for
-- update_synced_note_pair pins md5(prosrc) because its claim is about ordering
-- and locking, which keywords cannot establish. The claim here is narrower and
-- structural -- the reference write exists, targets the right table, supplies
-- all four region columns, and writes neither a quote nor a char span -- so
-- position() over prosrc states it directly. A digest would also have to be
-- regenerated for the next unrelated edit to either function, which is how
-- digests quietly become rubber stamps.

BEGIN TRANSACTION READ ONLY;

WITH expected AS (
    SELECT
        to_regprocedure('public.create_knowledge_pdf_area_image_post_with_library_item('
                        || 'uuid, uuid, uuid, text, text, double precision, double precision, '
                        || 'double precision, double precision, text, jsonb)')::oid AS creator,
        to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement('
                        || 'uuid, uuid, uuid, uuid, text, text, double precision, double precision, '
                        || 'double precision, double precision, text, jsonb)')::oid AS reuse
),
creator_body AS (
    SELECT p.prosrc AS src,
           (SELECT array_agg(t.typname::text ORDER BY k.ord)
              FROM unnest(p.proargtypes) WITH ORDINALITY AS k(argtype, ord)
              JOIN pg_type AS t ON t.oid = k.argtype) AS argtypes
      FROM pg_proc AS p WHERE p.oid = (SELECT creator FROM expected)
),
reuse_body AS (
    SELECT p.prosrc AS src,
           (SELECT array_agg(t.typname::text ORDER BY k.ord)
              FROM unnest(p.proargtypes) WITH ORDINALITY AS k(argtype, ord)
              JOIN pg_type AS t ON t.oid = k.argtype) AS argtypes
      FROM pg_proc AS p WHERE p.oid = (SELECT reuse FROM expected)
),
-- The nine constraints the reference shape depends on. Named individually: a
-- count would pass while the one that matters had been dropped.
cons AS (
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint AS c
     WHERE c.conrelid = to_regclass('public.source_references')
),
-- Every crop, judged by the SAME mirror the two functions and the backfill use.
crops AS (
    SELECT p.id
      FROM public.padlets AS p
     WHERE p.metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'
       AND public.is_knowledge_pdf_area_provenance(p.metadata)
),
counts AS (
    SELECT
        (SELECT count(*) FROM crops) AS crop_total,
        (SELECT count(*) FROM crops c
          WHERE EXISTS (SELECT 1 FROM public.source_references r
                         WHERE r.target_padlet_id = c.id
                           AND r.region_x IS NOT NULL)) AS crop_with_region_reference,
        (SELECT count(*) FROM crops c
          WHERE NOT EXISTS (SELECT 1 FROM public.source_references r
                             WHERE r.target_padlet_id = c.id)) AS crop_without_reference,
        (SELECT count(*) FROM crops c
          WHERE NOT EXISTS (SELECT 1 FROM public.knowledge_documents d
                             WHERE d.id = (SELECT (p.metadata -> 'source' ->> 'knowledgeDocumentId')::uuid
                                             FROM public.padlets p WHERE p.id = c.id)))
                                                        AS crop_with_missing_document
),
invariants AS (
    SELECT 1 AS ord, 'creator'::text AS section,
           'create_knowledge_pdf_area_image_post_with_library_item writes a source reference'::text AS check_name,
           COALESCE((SELECT position('source_references' IN src)::text FROM creator_body), '(absent)') AS actual,
           COALESCE((SELECT position('source_references' IN src) > 0 FROM creator_body), false) AS pass
    UNION ALL SELECT 2, 'reuse', 'create_knowledge_pdf_area_image_reuse_placement writes a source reference',
           COALESCE((SELECT position('source_references' IN src)::text FROM reuse_body), '(absent)'),
           COALESCE((SELECT position('source_references' IN src) > 0 FROM reuse_body), false)
    UNION ALL SELECT 3, 'creator', 'the creator signature is unchanged (11 arguments, in order)',
           COALESCE((SELECT array_to_string(argtypes, ',') FROM creator_body), '(absent)'),
           COALESCE((SELECT argtypes = ARRAY['uuid','uuid','uuid','text','text','float8','float8',
                                             'float8','float8','text','jsonb']::text[]
                       FROM creator_body), false)
    UNION ALL SELECT 4, 'reuse', 'the reuse signature is unchanged (12 arguments, in order)',
           COALESCE((SELECT array_to_string(argtypes, ',') FROM reuse_body), '(absent)'),
           COALESCE((SELECT argtypes = ARRAY['uuid','uuid','uuid','uuid','text','text','float8','float8',
                                             'float8','float8','text','jsonb']::text[]
                       FROM reuse_body), false)
    UNION ALL SELECT 5, 'shape', 'the creator supplies all four region columns',
           COALESCE((SELECT (position('region_x' IN src) > 0)::text FROM creator_body), '(absent)'),
           COALESCE((SELECT position('region_x' IN src) > 0 AND position('region_y' IN src) > 0
                       AND position('region_width' IN src) > 0
                       AND position('region_height' IN src) > 0 FROM creator_body), false)
    UNION ALL SELECT 6, 'shape', 'the reuse supplies all four region columns',
           COALESCE((SELECT (position('region_x' IN src) > 0)::text FROM reuse_body), '(absent)'),
           COALESCE((SELECT position('region_x' IN src) > 0 AND position('region_y' IN src) > 0
                       AND position('region_width' IN src) > 0
                       AND position('region_height' IN src) > 0 FROM reuse_body), false)
    -- A region reference carries no text locator. If either body ever learned
    -- to write one, source_references_region_text_exclusion_check would reject
    -- every crop at runtime -- so catch it here, not in production.
    UNION ALL SELECT 7, 'shape', 'neither body writes a quote or a char span into the reference',
           COALESCE((SELECT (position('quote_hash' IN c.src) > 0)::text
                       FROM creator_body c), '(absent)'),
           COALESCE((SELECT position('quote_text, quote_hash, char_start, char_end, locator' IN c.src) > 0
                       AND position('quote_text, quote_hash, char_start, char_end, locator' IN r.src) > 0
                       AND position('NULL, NULL, NULL, NULL, NULL' IN c.src) > 0
                       AND position('NULL, NULL, NULL, NULL, NULL' IN r.src) > 0
                       FROM creator_body c, reuse_body r), false)
    -- Without this, a repeated call mints a duplicate chip on the same card.
    UNION ALL SELECT 8, 'idempotency', 'both bodies guard the reference write with NOT EXISTS',
           COALESCE((SELECT (position('NOT EXISTS' IN c.src) > 0)::text FROM creator_body c), '(absent)'),
           COALESCE((SELECT position('NOT EXISTS' IN c.src) > 0
                       AND position('NOT EXISTS' IN r.src) > 0
                       AND position('IF NOT EXISTS' IN c.src)
                           < position('RETURN QUERY SELECT p_padlet_id, v_library_item_id;' IN c.src)
                       FROM creator_body c, reuse_body r), false)
    -- THE DRY RUN, and after the rollout the headline result.
    UNION ALL SELECT 9, 'data', 'crops without any source reference (6 before the rollout, 0 after)',
           (SELECT 'crops=' || crop_total || ' with_region_reference=' || crop_with_region_reference
                   || ' without_reference=' || crop_without_reference FROM counts),
           (SELECT crop_without_reference = 0 FROM counts)
    -- The foreign key would abort the whole apply, so it is surfaced BEFORE it
    -- can: a crop naming a deleted knowledge_documents row cannot be backfilled.
    UNION ALL SELECT 10, 'data', 'every crop names a knowledge document that still exists',
           (SELECT crop_with_missing_document::text FROM counts),
           (SELECT crop_with_missing_document = 0 FROM counts)
    UNION ALL SELECT 11, 'constraints', 'region references are confined to a single page',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_region_single_page_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_region_single_page_check')
    UNION ALL SELECT 12, 'constraints', 'a region excludes a char span',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_region_text_exclusion_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_region_text_exclusion_check')
    UNION ALL SELECT 13, 'constraints', 'a region is all four columns or none',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_region_complete_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_region_complete_check')
    UNION ALL SELECT 14, 'constraints', 'a region is normalised within the page',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_region_bounds_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_region_bounds_check')
    UNION ALL SELECT 15, 'constraints', 'page_start is at least 1',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_page_start_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_page_start_check')
    UNION ALL SELECT 16, 'constraints', 'page_end is at least page_start',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_page_range_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_page_range_check')
    UNION ALL SELECT 17, 'constraints', 'a char range is both offsets or neither',
           COALESCE((SELECT def FROM cons WHERE conname = 'source_references_char_range_check'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE conname = 'source_references_char_range_check')
    UNION ALL SELECT 18, 'constraints', 'the padlet foreign key still cascades on delete',
           COALESCE((SELECT def FROM cons WHERE def LIKE 'FOREIGN KEY (target_padlet_id)%'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE def LIKE 'FOREIGN KEY (target_padlet_id)%'
                                        AND def LIKE '%ON DELETE CASCADE%')
    UNION ALL SELECT 19, 'constraints', 'the document foreign key still cascades on delete',
           COALESCE((SELECT def FROM cons WHERE def LIKE 'FOREIGN KEY (source_document_id)%'), '(absent)'),
           EXISTS (SELECT 1 FROM cons WHERE def LIKE 'FOREIGN KEY (source_document_id)%'
                                        AND def LIKE '%ON DELETE CASCADE%')
    -- The idempotency guard is required precisely BECAUSE there is no unique
    -- index. If one is ever added, the guard can go -- but until then its
    -- absence is the reason the NOT EXISTS above is load-bearing.
    UNION ALL SELECT 20, 'constraints', 'there is still no unique index making the guard redundant',
           COALESCE((SELECT string_agg(i.relname, ', ')
                       FROM pg_index AS x JOIN pg_class AS i ON i.oid = x.indexrelid
                      WHERE x.indrelid = to_regclass('public.source_references')
                        AND x.indisunique AND NOT x.indisprimary), '(none)'),
           NOT EXISTS (SELECT 1 FROM pg_index AS x
                        WHERE x.indrelid = to_regclass('public.source_references')
                          AND x.indisunique AND NOT x.indisprimary)
    -- Both functions stay service_role only: a browser must never reach them.
    UNION ALL SELECT 21, 'authorization', 'neither function is executable by anon or authenticated',
           COALESCE((SELECT (has_function_privilege('authenticated', creator, 'EXECUTE')::text
                             || '/' || has_function_privilege('anon', creator, 'EXECUTE')::text
                             || '/' || has_function_privilege('authenticated', reuse, 'EXECUTE')::text
                             || '/' || has_function_privilege('anon', reuse, 'EXECUTE')::text)
                       FROM expected), '(absent)'),
           COALESCE((SELECT NOT has_function_privilege('authenticated', creator, 'EXECUTE')
                         AND NOT has_function_privilege('anon', creator, 'EXECUTE')
                         AND NOT has_function_privilege('authenticated', reuse, 'EXECUTE')
                         AND NOT has_function_privilege('anon', reuse, 'EXECUTE')
                       FROM expected), false)
    UNION ALL SELECT 22, 'authorization', 'service_role may still execute both',
           COALESCE((SELECT (has_function_privilege('service_role', creator, 'EXECUTE')::text
                             || '/' || has_function_privilege('service_role', reuse, 'EXECUTE')::text)
                       FROM expected), '(absent)'),
           COALESCE((SELECT has_function_privilege('service_role', creator, 'EXECUTE')
                         AND has_function_privilege('service_role', reuse, 'EXECUTE')
                       FROM expected), false)
    UNION ALL SELECT 23, 'prerequisites', 'the shared provenance mirror still exists and returns boolean',
           COALESCE((SELECT t.typname FROM pg_proc AS p JOIN pg_type AS t ON t.oid = p.prorettype
                      WHERE p.oid = to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)')::oid),
                    '(absent)'),
           COALESCE((SELECT t.typname = 'bool' FROM pg_proc AS p JOIN pg_type AS t ON t.oid = p.prorettype
                      WHERE p.oid = to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)')::oid),
                    false)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up. Same source as the rows above, so it cannot disagree.
WITH crops AS (
    SELECT p.id
      FROM public.padlets AS p
     WHERE p.metadata -> 'source' ->> 'kind' = 'knowledge-pdf-area'
       AND public.is_knowledge_pdf_area_provenance(p.metadata)
),
counts AS (
    SELECT
        (SELECT count(*) FROM crops) AS crop_total,
        (SELECT count(*) FROM crops c
          WHERE EXISTS (SELECT 1 FROM public.source_references r
                         WHERE r.target_padlet_id = c.id
                           AND r.region_x IS NOT NULL)) AS crop_with_region_reference,
        (SELECT count(*) FROM crops c
          WHERE NOT EXISTS (SELECT 1 FROM public.source_references r
                             WHERE r.target_padlet_id = c.id)) AS crop_without_reference
),
bodies AS (
    SELECT
        COALESCE((SELECT position('source_references' IN p.prosrc) > 0 FROM pg_proc AS p
                   WHERE p.oid = to_regprocedure('public.create_knowledge_pdf_area_image_post_with_library_item('
                        || 'uuid, uuid, uuid, text, text, double precision, double precision, '
                        || 'double precision, double precision, text, jsonb)')::oid), false) AS creator_ok,
        COALESCE((SELECT position('source_references' IN p.prosrc) > 0 FROM pg_proc AS p
                   WHERE p.oid = to_regprocedure('public.create_knowledge_pdf_area_image_reuse_placement('
                        || 'uuid, uuid, uuid, uuid, text, text, double precision, double precision, '
                        || 'double precision, double precision, text, jsonb)')::oid), false) AS reuse_ok
)
SELECT
    CASE WHEN b.creator_ok AND b.reuse_ok AND c.crop_without_reference = 0
         THEN 'PASS' ELSE 'FAIL' END           AS rollup,
    c.crop_total                               AS pdf_area_crops,
    c.crop_with_region_reference               AS crops_with_region_reference,
    c.crop_without_reference                   AS crops_without_reference,
    b.creator_ok                               AS creator_writes_reference,
    b.reuse_ok                                 AS reuse_writes_reference
FROM counts AS c, bodies AS b;

ROLLBACK;
