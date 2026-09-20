-- Read-only verification for 20260920120000_knowledge_sources_beyond_pdf.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog only, and runs
-- unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row,
-- and `rollout_readiness` is `bool_and(pass)` over that same list as a window,
-- repeated on every row -- so no roll-up can drift from the rows above it.
-- Scan for `pass = f`, or read readiness from any row.
--
-- IT READS THE DATABASE, NEVER THE REPOSITORY. Constraint predicates come from
-- pg_get_constraintdef and nullability from pg_attribute.attnotnull -- what the
-- server will actually enforce, not what a file intended. Rows 13-15 are the
-- ones to read first if anything downstream looks wrong: they assert that the
-- retrieval function BOTH consumers use was not touched, which is this unit's
-- central claim and the reason a typed-column locator was rejected.
--
-- ROW 16 IS THE ACCEPTANCE, NOT A SANITY CHECK. This migration must admit no
-- rows by itself. If any pageless chunk or non-pdf document exists immediately
-- after applying it, something wrote through a path nobody reviewed, and the
-- battery comparison the PM runs either side of the apply is measuring two
-- different corpora.
--
-- WHAT THIS FILE CANNOT TELL YOU: whether a text source, once ingested, cites
-- and opens correctly. That is not a catalog question. Stage 1's live
-- acceptance is the instrument for it -- two paragraphs of one file cited in
-- one answer must produce TWO citations, which is the proof that identity
-- moved to char offsets and did not collapse.

WITH expected AS (
    SELECT
        to_regclass('public.knowledge_chunks')    AS chunks,
        to_regclass('public.knowledge_documents') AS docs,
        to_regprocedure('public.search_board_knowledge_chunks_text(uuid, text, integer)') AS search_fn
),
attr AS (
    SELECT a.attrelid, a.attname, a.attnotnull
      FROM pg_attribute AS a
     WHERE a.attrelid IN ((SELECT chunks FROM expected), (SELECT docs FROM expected))
       AND a.attnum > 0 AND NOT a.attisdropped
),
con AS (
    SELECT c.conrelid, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint AS c
     WHERE c.conrelid IN ((SELECT chunks FROM expected), (SELECT docs FROM expected))
),
invariants AS (
             SELECT 1 AS ord, 'prerequisites' AS section,
                    'both knowledge tables exist' AS check_name,
                    COALESCE((SELECT chunks FROM expected)::text, '(absent)')
                      || ' / ' || COALESCE((SELECT docs FROM expected)::text, '(absent)') AS actual,
                    ((SELECT chunks FROM expected) IS NOT NULL
                     AND (SELECT docs FROM expected) IS NOT NULL) AS pass

  UNION ALL SELECT 2, 'chunks.nullability', 'page_start is nullable',
           COALESCE((SELECT CASE WHEN attnotnull THEN 'NOT NULL' ELSE 'nullable' END
                       FROM attr WHERE attrelid = (SELECT chunks FROM expected) AND attname = 'page_start'), '(absent)'),
           COALESCE((SELECT NOT attnotnull FROM attr
                      WHERE attrelid = (SELECT chunks FROM expected) AND attname = 'page_start'), false)

  UNION ALL SELECT 3, 'chunks.nullability', 'page_end is nullable',
           COALESCE((SELECT CASE WHEN attnotnull THEN 'NOT NULL' ELSE 'nullable' END
                       FROM attr WHERE attrelid = (SELECT chunks FROM expected) AND attname = 'page_end'), '(absent)'),
           COALESCE((SELECT NOT attnotnull FROM attr
                      WHERE attrelid = (SELECT chunks FROM expected) AND attname = 'page_end'), false)

  UNION ALL SELECT 4, 'chunks.nullability', 'text and chunk_index stay NOT NULL -- a chunk without text is not a chunk',
           COALESCE((SELECT string_agg(attname || '=' || CASE WHEN attnotnull THEN 'NOT NULL' ELSE 'nullable' END, ', ' ORDER BY attname)
                       FROM attr WHERE attrelid = (SELECT chunks FROM expected) AND attname IN ('text', 'chunk_index')), '(absent)'),
           COALESCE((SELECT bool_and(attnotnull) FROM attr
                      WHERE attrelid = (SELECT chunks FROM expected) AND attname IN ('text', 'chunk_index')), false)

  UNION ALL SELECT 5, 'chunks.constraints', 'page_start check tolerates NULL and still requires >= 1',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_page_start_check'), '(absent)'),
           COALESCE((SELECT def LIKE '%page_start IS NULL%' AND def LIKE '%page_start >= 1%'
                       FROM con WHERE conname = 'knowledge_chunks_page_start_check'), false)

  UNION ALL SELECT 6, 'chunks.constraints', 'page_end check tolerates NULL and still requires >= 1',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_page_end_check'), '(absent)'),
           COALESCE((SELECT def LIKE '%page_end IS NULL%' AND def LIKE '%page_end >= 1%'
                       FROM con WHERE conname = 'knowledge_chunks_page_end_check'), false)

  UNION ALL SELECT 7, 'chunks.constraints', 'range check asserts ordering ONLY when both ends are present',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_page_range_check'), '(absent)'),
           COALESCE((SELECT def LIKE '%page_start IS NULL%' AND def LIKE '%page_end IS NULL%'
                          AND def LIKE '%page_end >= page_start%'
                       FROM con WHERE conname = 'knowledge_chunks_page_range_check'), false)

  UNION ALL SELECT 8, 'chunks.constraints', 'pages are both-or-neither',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_page_pair_check'), '(absent)'),
           (SELECT count(*) = 1 FROM con WHERE conname = 'knowledge_chunks_page_pair_check')

  UNION ALL SELECT 9, 'chunks.constraints', 'char_range check is UNCHANGED -- it already carried the locator this unit uses',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_char_range_check'), '(absent)'),
           COALESCE((SELECT def LIKE '%char_start IS NULL%' AND def LIKE '%char_end >= char_start%'
                       FROM con WHERE conname = 'knowledge_chunks_char_range_check'), false)

  UNION ALL SELECT 10, 'chunks.constraints', 'the (document_id, chunk_index) uniqueness survives -- contiguity is asserted against it',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_chunks_document_index_key'), '(absent)'),
           COALESCE((SELECT def LIKE 'UNIQUE%document_id%chunk_index%'
                       FROM con WHERE conname = 'knowledge_chunks_document_index_key'), false)

  UNION ALL SELECT 11, 'documents.constraints', 'kind admits pdf and text, and nothing else',
           COALESCE((SELECT def FROM con WHERE conname = 'knowledge_documents_kind_check'), '(absent)'),
           COALESCE((SELECT def LIKE '%''pdf''%' AND def LIKE '%''text''%'
                          AND def NOT LIKE '%''docx''%' AND def NOT LIKE '%''youtube''%'
                       FROM con WHERE conname = 'knowledge_documents_kind_check'), false)

  UNION ALL SELECT 12, 'documents.nullability', 'file-shaped columns are nullable; original_filename is NOT',
           COALESCE((SELECT string_agg(attname || '=' || CASE WHEN attnotnull THEN 'NOT NULL' ELSE 'nullable' END, ', ' ORDER BY attname)
                       FROM attr WHERE attrelid = (SELECT docs FROM expected)
                        AND attname IN ('storage_path', 'file_size_bytes', 'mime_type', 'original_filename')), '(absent)'),
           COALESCE((SELECT bool_and(CASE WHEN attname = 'original_filename' THEN attnotnull ELSE NOT attnotnull END)
                       FROM attr WHERE attrelid = (SELECT docs FROM expected)
                        AND attname IN ('storage_path', 'file_size_bytes', 'mime_type', 'original_filename')), false)

  UNION ALL SELECT 13, 'retrieval', 'the shared search function still exists with its original signature',
           COALESCE((SELECT search_fn FROM expected)::text, '(absent)'),
           (SELECT search_fn FROM expected) IS NOT NULL

  UNION ALL SELECT 14, 'retrieval', 'its RETURNS TABLE is UNTOUCHED -- no typed seconds columns were added',
           COALESCE((SELECT pg_get_function_result((SELECT search_fn FROM expected))), '(absent)'),
           COALESCE((SELECT pg_get_function_result((SELECT search_fn FROM expected))
                            LIKE '%source_locators jsonb%'
                      AND pg_get_function_result((SELECT search_fn FROM expected))
                            NOT LIKE '%seconds%'), false)

  UNION ALL SELECT 15, 'retrieval', 'its comment no longer claims the table holds only PDF chunks',
           COALESCE(left(obj_description((SELECT search_fn FROM expected), 'pg_proc'), 60), '(absent)'),
           COALESCE(obj_description((SELECT search_fn FROM expected), 'pg_proc') NOT LIKE '%PDF chunks%'
                AND obj_description((SELECT search_fn FROM expected), 'pg_proc') LIKE '%knowledge chunks%', false)

  UNION ALL SELECT 16, 'acceptance', 'THIS MIGRATION ADMITS NO ROWS -- nothing pageless or non-pdf exists yet',
           (SELECT count(*)::text FROM public.knowledge_chunks WHERE page_start IS NULL)
             || ' pageless chunk(s), '
             || (SELECT count(*)::text FROM public.knowledge_documents WHERE kind <> 'pdf')
             || ' non-pdf document(s)',
           (SELECT count(*) = 0 FROM public.knowledge_chunks WHERE page_start IS NULL)
             AND (SELECT count(*) = 0 FROM public.knowledge_documents WHERE kind <> 'pdf')
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;
