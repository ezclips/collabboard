-- Read-only verification for 20260919140000_board_search_image_captions.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog and information_schema
-- only, and runs unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row,
-- and `rollout_readiness` is `bool_and(pass)` over that same list as a window,
-- repeated on every row -- so no roll-up can drift from the rows above it. Scan
-- for `pass = f`, or read readiness from any row.
--
-- IT READS THE DATABASE, NEVER THE REPOSITORY. Index expressions come from
-- `pg_get_indexdef` and function bodies from `pg_proc.prosrc` -- what the
-- server will actually execute, not what someone intended to apply. That
-- distinction has already cost this project twice: a column REVOKE that was
-- present in a file and inert against the server, and a verify row that could
-- only ever be red. Rows 9-11 are the ones that matter most here, because a
-- predicate or an expression that does not match the search function's qual
-- does not fail -- it silently stops the planner proving the bitmap scans, and
-- search gets slower rather than wrong.
--
-- WHAT THIS FILE CANNOT TELL YOU: whether admitting images made retrieval
-- BETTER. That is not a catalog question. The named ranking pairs in
-- scripts/db/boardSearchRankingPairs.test.ts are the instrument for it, and a
-- before/after on them is this unit's real acceptance.

WITH expected AS (
    SELECT
        to_regprocedure('public.searchable_post_document(text, text, text, jsonb)')::oid AS doc_fn,
        to_regprocedure('public.searchable_post_excerpt(text, text, jsonb)')::oid        AS excerpt_fn,
        to_regprocedure('public.search_board_posts_text(uuid, text, integer)')::oid      AS search_fn,
        ARRAY['padlets_search_gin', 'padlets_search_en_gin', 'padlets_search_de_gin']::text[] AS index_names,
        -- The predicate every padlets search index must carry, and which the
        -- search function's qual must repeat for the planner to use them.
        'image'::text AS admitted_type
),
idx AS (
    SELECT c.relname::text AS name, pg_get_indexdef(c.oid) AS def
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY (SELECT unnest(index_names) FROM expected)
),
search_body AS (
    SELECT p.prosrc AS src, p.provolatile, p.prosecdef
      FROM pg_proc AS p WHERE p.oid = (SELECT search_fn FROM expected)
),
doc_body AS (
    SELECT p.prosrc AS src, p.provolatile, p.proparallel
      FROM pg_proc AS p WHERE p.oid = (SELECT doc_fn FROM expected)
),
invariants(ord, section, check_name, actual, pass) AS (
              SELECT  1, 'compatibility', 'PostgreSQL major 17 (this artifact is certified for it only)',
           current_setting('server_version_num'),
           current_setting('server_version_num')::int BETWEEN 170000 AND 179999
    UNION ALL SELECT  2, 'function', 'searchable_post_document exists with the reviewed signature',
           COALESCE((SELECT doc_fn FROM expected)::text, '(absent)'),
           (SELECT doc_fn FROM expected) IS NOT NULL
    UNION ALL SELECT  3, 'function', 'searchable_post_excerpt exists with the reviewed signature',
           COALESCE((SELECT excerpt_fn FROM expected)::text, '(absent)'),
           (SELECT excerpt_fn FROM expected) IS NOT NULL
    UNION ALL SELECT  4, 'function', 'the document function is IMMUTABLE -- a volatile one cannot be indexed at all',
           COALESCE((SELECT CASE provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END
                       FROM doc_body), '(absent)'),
           COALESCE((SELECT provolatile = 'i' FROM doc_body), false)
    UNION ALL SELECT  5, 'function', 'the document function is PARALLEL SAFE',
           COALESCE((SELECT CASE proparallel WHEN 's' THEN 'SAFE' WHEN 'r' THEN 'RESTRICTED' ELSE 'UNSAFE' END
                       FROM doc_body), '(absent)'),
           COALESCE((SELECT proparallel = 's' FROM doc_body), false)
    UNION ALL SELECT  6, 'function', 'an image contributes NO content to its document',
           -- The least obvious rule in the migration, read back from the body
           -- the server holds: image `content` is a raw URL or the editor's
           -- "Click to add a caption..." placeholder, never prose.
           COALESCE((SELECT position('WHEN p_type = ''image'' THEN ''''' IN src)::text FROM doc_body), '(absent)'),
           COALESCE((SELECT position('WHEN p_type = ''image'' THEN ''''' IN src) > 0 FROM doc_body), false)
    UNION ALL SELECT  7, 'function', 'the document reads metadata.caption',
           COALESCE((SELECT position('''caption''' IN src)::text FROM doc_body), '(absent)'),
           COALESCE((SELECT position('''caption''' IN src) > 0 FROM doc_body), false)
    UNION ALL SELECT  8, 'function', 'and reads NEITHER photographer NOR source -- attribution stays out',
           -- Present on 249 of the 320 admitted rows against 29 real captions:
           -- indexing them would make attribution the dominant new signal.
           COALESCE((SELECT (position('photographer' IN src) + position('''source''' IN src))::text FROM doc_body), '(absent)'),
           COALESCE((SELECT position('photographer' IN src) = 0
                     AND position('''source''' IN src) = 0 FROM doc_body), false)
    UNION ALL SELECT  9, 'index', 'all three padlets search indexes exist',
           (SELECT count(*)::text FROM idx),
           (SELECT count(*) = 3 FROM idx)
    UNION ALL SELECT 10, 'index', 'every one admits images in its predicate',
           COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM idx
                      WHERE def NOT LIKE '%''image''%'), '(all admit images)'),
           NOT EXISTS (SELECT 1 FROM idx WHERE def NOT LIKE '%''image''%')
    UNION ALL SELECT 11, 'index', 'every one indexes the SHARED document expression',
           -- If an index spells the document differently from the function's
           -- qual, nothing fails -- the planner simply stops proving the bitmap
           -- scan, and search quietly gets slower.
           COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM idx
                      WHERE def NOT LIKE '%searchable_post_document%'), '(all shared)'),
           NOT EXISTS (SELECT 1 FROM idx WHERE def NOT LIKE '%searchable_post_document%')
    UNION ALL SELECT 12, 'index', 'no padlets search index still carries the old hand-spelled expression',
           COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM idx
                      WHERE def LIKE '%plain_text_from_post_content%'), '(none)'),
           NOT EXISTS (SELECT 1 FROM idx WHERE def LIKE '%plain_text_from_post_content%')
    UNION ALL SELECT 13, 'search', 'the search function admits images in its own qual',
           COALESCE((SELECT position('''image''' IN src)::text FROM search_body), '(absent)'),
           COALESCE((SELECT position('''image''' IN src) > 0 FROM search_body), false)
    UNION ALL SELECT 14, 'search', 'and matches against the shared document expression',
           COALESCE((SELECT position('searchable_post_document' IN src)::text FROM search_body), '(absent)'),
           COALESCE((SELECT position('searchable_post_document' IN src) > 0 FROM search_body), false)
    UNION ALL SELECT 15, 'search', 'it is still SECURITY INVOKER, never DEFINER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END FROM search_body), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM search_body), false)
    UNION ALL SELECT 16, 'privileges', 'only service_role may execute the search',
           COALESCE(has_function_privilege('authenticated', (SELECT search_fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('authenticated', (SELECT search_fn FROM expected), 'EXECUTE')
                    AND has_function_privilege('service_role', (SELECT search_fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 17, 'privileges', 'anon may execute neither new function (or does not exist here)',
           COALESCE(has_function_privilege('anon', (SELECT doc_fn FROM expected), 'EXECUTE')::text, '(no anon role)'),
           to_regrole('anon') IS NULL
             OR (NOT has_function_privilege('anon', (SELECT doc_fn FROM expected), 'EXECUTE')
                 AND NOT has_function_privilege('anon', (SELECT excerpt_fn FROM expected), 'EXECUTE'))
    UNION ALL SELECT 18, 'prerequisites', 'padlets.metadata is jsonb -- the caption is read with ->>',
           COALESCE((SELECT t.typname::text
                       FROM pg_attribute AS a JOIN pg_type AS t ON t.oid = a.atttypid
                      WHERE a.attrelid = to_regclass('public.padlets')
                        AND a.attname = 'metadata' AND a.attnum > 0 AND NOT a.attisdropped), '(absent)'),
           COALESCE((SELECT t.typname = 'jsonb'
                       FROM pg_attribute AS a JOIN pg_type AS t ON t.oid = a.atttypid
                      WHERE a.attrelid = to_regclass('public.padlets')
                        AND a.attname = 'metadata' AND a.attnum > 0 AND NOT a.attisdropped), false)
    UNION ALL SELECT 19, 'prerequisites', 'plain_text_from_post_content still exists -- the document calls it',
           COALESCE(to_regprocedure('public.plain_text_from_post_content(text)')::text, '(absent)'),
           to_regprocedure('public.plain_text_from_post_content(text)') IS NOT NULL
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;
