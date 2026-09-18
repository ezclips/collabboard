-- READ-ONLY: the ranking variants the TypeScript battery cannot score.
--
-- WHY THIS FILE EXISTS. scripts/db/boardSearchTuningBattery.ts scores everything
-- it can compute without Postgres -- coverage, term frequency, document length,
-- and any ordering derived from them. Four candidates need `ts_rank` itself
-- evaluated over ALTERNATIVE vectors, and the two shipped functions are fixed at
-- normalization flag 1. Re-implementing ts_rank in TypeScript to score them
-- would encode a different assumption than the code, which is the exact error
-- the battery exists to prevent. So they are computed here, by the database.
--
-- CREATES NOTHING, CHANGES NOTHING. Runs inside BEGIN TRANSACTION READ ONLY.
-- It does not touch the shipped functions and does not depend on them: it
-- rebuilds their rank expressions inline so alternatives sit beside the current
-- value in the same row.
--
-- THE tsquery LITERALS BELOW CAME FROM THE REAL QUERY BUILDER, not from a
-- person. They are the output of buildBoardAiSearchQuery for the battery's
-- questions (lib/domain/ai/boardAiSearchQuery.ts). ts_rank is query-dependent,
-- so a variant measured against a hand-written tsquery would be measured on a
-- number no pipeline produces -- two earlier smoke runs disagreed about the same
-- passage for exactly that reason. Regenerate them with:
--     npx vite-node scripts/db/boardSearchTuningBattery.ts
-- and copy the `terms:` line for each question if the builder ever changes.
--
-- WHAT EACH COLUMN IS.
--   rank_n1   the SHIPPED value: ts_rank(..., 1), divide by 1 + log(length).
--   rank_n0   the default that was rejected: length ignored entirely.
--   rank_n2   divide by raw length.
--   rank_cd   ts_rank_cd, which rewards terms appearing CLOSE TOGETHER.
--   rank_title_a  chunks only: the document filename at weight A beside the
--                 chunk text at weight B, to test whether a document title in
--                 the chunk rank separates an answering paragraph from its own
--                 document's introduction.
--
-- HOW TO READ THE RESULT. Three named pairs decide it. A candidate is only
-- worth promoting if it fixes the two inversions AND leaves the third alone:
--
--   q08  the ANSWER (chunk_index 1, 483 chars, "Ribbing") must outrank the
--        INTRO (chunk_index 0, 1018 chars). Today: 0.003145 vs 0.009651.
--   q02  the three answering passages must outrank the TITLE-ONLY post
--        "Audi A2 Stoßstange Titel bild". Today the title-only wins by 2.3-5.6x.
--   q03  the title-only post "Trump Note Post" must STAY first -- it is the
--        correct answer there, and a fix for q02 that breaks q03 is not a fix.
--
-- A WARNING ABOUT q08 BEFORE ANY OF THIS IS READ AS A RANKING PROBLEM. The
-- answering paragraph contains "Ribbing"; the query contains "ribbed". The
-- `simple` configuration does NO STEMMING, so they do not match, and the
-- paragraph matches only `knit` -- once. The introduction genuinely matches all
-- three query terms five times. THE RANKING IS CORRECT GIVEN WHAT MATCHED; the
-- defect is that the answer's vocabulary never entered the query at all. Expect
-- every variant below to fail q08, and read that as confirmation rather than as
-- a disappointing result: q08 belongs to stemming, not to ranking.

BEGIN TRANSACTION READ ONLY;

WITH q(id, query) AS (
    VALUES
      ('q08-knitting',  pg_catalog.to_tsquery('simple'::regconfig, 'knit | ribbed | pattern')),
      ('q02-audi-horn', pg_catalog.to_tsquery('simple'::regconfig, 'remove | bumper | audi | a2 | change | horn')),
      ('q03-trump-note',pg_catalog.to_tsquery('simple'::regconfig, 'trump | note | post'))
),
board AS (SELECT 'af02972f-dfde-4545-9fc8-5fcbccb007c3'::uuid AS id)

-- CHUNKS.
SELECT
    q.id                                    AS query_id,
    'chunk'                                 AS kind,
    d.original_filename                     AS label,
    c.chunk_index,
    pg_catalog.length(c.text)               AS chars,
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 1) AS rank_n1,
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 0) AS rank_n0,
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 2) AS rank_n2,
    pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 1) AS rank_cd,
    -- The document filename at weight A beside the chunk text at weight B.
    pg_catalog.ts_rank(
        pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, COALESCE(d.original_filename, '')), 'A')
        || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, c.text), 'B'),
        q.query, 1)                         AS rank_title_a
  FROM q, board
  JOIN public.knowledge_documents AS d ON d.board_id = board.id AND d.processing_status = 'ready'
  JOIN public.knowledge_chunks AS c ON c.document_id = d.id
 WHERE pg_catalog.to_tsvector('simple'::regconfig, c.text) @@ q.query

UNION ALL

-- POSTS. The current expression is title-then-body in ONE unweighted vector;
-- rank_title_a is the setweight A/B alternative for the same content.
SELECT
    q.id,
    CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN 'post (TITLE ONLY)' ELSE 'post' END,
    COALESCE(p.title, ''),
    NULL::int,
    pg_catalog.length(public.plain_text_from_post_content(p.content)),
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                                      ELSE ' ' || public.plain_text_from_post_content(p.content) END), q.query, 1),
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                                      ELSE ' ' || public.plain_text_from_post_content(p.content) END), q.query, 0),
    pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                                      ELSE ' ' || public.plain_text_from_post_content(p.content) END), q.query, 2),
    pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                                      ELSE ' ' || public.plain_text_from_post_content(p.content) END), q.query, 1),
    pg_catalog.ts_rank(
        pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, COALESCE(p.title, '')), 'A')
        || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig,
             public.plain_text_from_post_content(p.content)), 'B'),
        q.query, 1)
  FROM q, board
  JOIN public.padlets AS p ON p.board_id = board.id AND p.type IN ('text', 'note')
 WHERE pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                                      ELSE ' ' || public.plain_text_from_post_content(p.content) END) @@ q.query

 ORDER BY query_id, rank_n1 DESC;

-- THE STEMMING CHECK, which is q08's actual subject.
--
-- It compares what `simple` matches against what `english` would, on the exact
-- pair that inverted. If the english row matches the answering paragraph and the
-- simple row does not, q08 is a configuration question and no amount of rank
-- tuning addresses it.
SELECT
    'stemming' AS check_name,
    c.chunk_index,
    pg_catalog.length(c.text) AS chars,
    pg_catalog.to_tsvector('simple'::regconfig, c.text)
      @@ pg_catalog.to_tsquery('simple'::regconfig, 'ribbed')  AS simple_matches_ribbed,
    pg_catalog.to_tsvector('english'::regconfig, c.text)
      @@ pg_catalog.to_tsquery('english'::regconfig, 'ribbed') AS english_matches_ribbed
  FROM public.knowledge_chunks AS c
  JOIN public.knowledge_documents AS d ON d.id = c.document_id
 WHERE d.original_filename = 'knitting_stitch_patterns.pdf'
 ORDER BY c.chunk_index;

ROLLBACK;
