-- READ-ONLY: title weights, scored on the SHIPPING expressions, across ALL
-- ELEVEN battery questions.
--
-- ------------------------------------------------------------------------
-- WHY THIS FILE EXISTS, AND WHY IT IS NOT A MIGRATION.
-- ------------------------------------------------------------------------
-- `setweight` A/B -- the document's title at weight A beside its body at weight
-- B -- showed a 6x separation on ONE question (q02, where it split the answering
-- Audi page-6 chunk from unrelated-document noise while flag 1 managed 0.4%).
-- ONE QUESTION IS NOT A RESULT. It is the same instrument failure this project
-- has now recorded three times: a rule promoted on the question it was found on,
-- which is the question it cannot fail.
--
-- So it is scored here, on all eleven, before adoption.
--
-- ------------------------------------------------------------------------
-- WHY IT CAN BE SCORED WITHOUT A REBUILD -- the finding that moved title
-- weights out of the index batch entirely.
-- ------------------------------------------------------------------------
-- MATCHING AND RANKING NEED NOT USE THE SAME VECTOR. `@@` runs against the
-- indexed, unweighted vector; ts_rank can be handed a DIFFERENT, setweight-ed
-- vector constructed on the fly for the handful of rows that already matched.
-- Both vectors hold the same lexemes, so nothing matchable becomes unrankable,
-- and the weighted one is built for at most ten rows per search.
--
-- That makes title weights a FUNCTION-BODY change with NO index rebuild, which
-- is the only reason this scoring run is cheap enough to insist on. It applies
-- doubly to chunks: `original_filename` lives on knowledge_documents, and an
-- index expression may only reference its own table, so a document-title weight
-- could NEVER have been indexed. It was always going to be a rank-time join.
--
-- ------------------------------------------------------------------------
-- THE EXPRESSIONS BELOW ARE THE ONES 20260918160000 SHIPS.
-- ------------------------------------------------------------------------
-- Three configurations, rank taken as the GREATEST of the three, posts on
-- normalization flag 0 and chunks on flag 1. Scoring `setweight` against the old
-- single-`simple` expression would measure a vector that no longer exists --
-- which is the mistake this file is built to avoid, so it is worth saying twice.
--
-- THE tsquery LITERALS CAME FROM THE REAL QUERY BUILDER, not from a person: they
-- are the `terms:` lines that
--     npx vite-node scripts/db/boardSearchTuningBattery.ts
-- prints for each question (lib/domain/ai/boardAiSearchQuery.ts). ts_rank is
-- query-dependent, so a variant measured against a hand-written tsquery is
-- measured on a number no pipeline produces. Regenerate them if the builder,
-- the stopword lists or the term cap ever change.
--
-- ------------------------------------------------------------------------
-- HOW TO READ THE RESULT. Two questions, in this order.
-- ------------------------------------------------------------------------
-- 1. DOES IT EVER REORDER A RATED-RELEVANT PASSAGE BELOW AN IRRELEVANT ONE?
--    That is the bar, and it disqualifies outright. The ratings are in
--    scripts/db/boardSearchTuningRatings.json, keyed by the labels printed here.
-- 2. WHERE IT DOES REORDER, IS THE NEW ORDER BETTER? `rank_weighted` beside
--    `rank_plain` per row, same query, same rows. A question where nothing moves
--    is evidence too -- it means the weight buys nothing there and the 6x on q02
--    was local.
--
-- REMEMBER WHAT THE BATTERY CANNOT SEE, so a clean run is not over-read: no
-- question returns more posts than the per-source limit, so on the POSTS side a
-- reordering cannot drop anything and the bar is passed vacuously. On the CHUNKS
-- side the limit does bite, so chunk reordering is real evidence. Weigh the two
-- halves differently. (followups items 7 and 1.)

BEGIN TRANSACTION READ ONLY;

WITH q(id, terms) AS (
    VALUES
      ('q01-iran',        'iran | oil | headlines'),
      ('q02-audi-horn',   'remove | bumper | audi | a2 | change | horn'),
      ('q03-trump-note',  'trump | note | post'),
      ('q04-bike-chain',  'look | bike | chain | lube'),
      ('q05-hypermodern', 'hypermodernism | chess | openings'),
      ('q06-absent',      'fix | leaking | roof | garden | shed'),
      ('q07-tens',        'single | channel | tens | stimulator | module'),
      ('q08-knitting',    'knit | ribbed | pattern'),
      ('q09-watson',      'news | website | linked | slideshow'),
      ('q10-spreizniete', 'wie | löse | ich | die | spreizniete | der | stoßstange'),
      ('q11-noise-only',  'won | chess | tournament | berlin | last | year')
),
qq AS (
    SELECT id,
           pg_catalog.to_tsquery('simple'::regconfig, terms)  AS q_simple,
           pg_catalog.to_tsquery('english'::regconfig, terms) AS q_english,
           pg_catalog.to_tsquery('german'::regconfig, terms)  AS q_german
      FROM q
),
board AS (SELECT 'af02972f-dfde-4545-9fc8-5fcbccb007c3'::uuid AS id)

-- CHUNKS. rank_plain is what 20260918160000 ships; rank_weighted adds the
-- document filename at weight A beside the chunk text at weight B.
SELECT
    qq.id                                   AS query_id,
    'chunk'                                 AS kind,
    d.original_filename || ' — chunk ' || c.chunk_index AS label,
    pg_catalog.length(c.text)               AS chars,
    GREATEST(
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text),  qq.q_simple, 1),
        pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig, c.text), qq.q_english, 1),
        pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig, c.text),  qq.q_german, 1)
    )                                       AS rank_plain,
    GREATEST(
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, COALESCE(d.original_filename, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, c.text), 'B'), qq.q_simple, 1),
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, COALESCE(d.original_filename, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, c.text), 'B'), qq.q_english, 1),
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('german'::regconfig, COALESCE(d.original_filename, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('german'::regconfig, c.text), 'B'), qq.q_german, 1)
    )                                       AS rank_weighted
  FROM qq, board
  JOIN public.knowledge_documents AS d ON d.board_id = board.id AND d.processing_status = 'ready'
  JOIN public.knowledge_chunks AS c ON c.document_id = d.id
 WHERE pg_catalog.to_tsvector('simple'::regconfig, c.text)  @@ qq.q_simple
    OR pg_catalog.to_tsvector('english'::regconfig, c.text) @@ qq.q_english
    OR pg_catalog.to_tsvector('german'::regconfig, c.text)  @@ qq.q_german

UNION ALL

-- POSTS. rank_plain is the shipped expression -- title and body in ONE
-- unweighted vector, flag 0. rank_weighted splits them A/B.
SELECT
    qq.id,
    CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN 'post (TITLE ONLY)' ELSE 'post' END,
    COALESCE(p.title, ''),
    pg_catalog.length(public.plain_text_from_post_content(p.content)),
    GREATEST(
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
            COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)), qq.q_simple, 0),
        pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig,
            COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)), qq.q_english, 0),
        pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig,
            COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)), qq.q_german, 0)
    ),
    GREATEST(
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig, COALESCE(p.title, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::regconfig,
                 public.plain_text_from_post_content(p.content)), 'B'), qq.q_simple, 0),
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig, COALESCE(p.title, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('english'::regconfig,
                 public.plain_text_from_post_content(p.content)), 'B'), qq.q_english, 0),
        pg_catalog.ts_rank(
            pg_catalog.setweight(pg_catalog.to_tsvector('german'::regconfig, COALESCE(p.title, '')), 'A')
            || pg_catalog.setweight(pg_catalog.to_tsvector('german'::regconfig,
                 public.plain_text_from_post_content(p.content)), 'B'), qq.q_german, 0)
    )
  FROM qq, board
  JOIN public.padlets AS p ON p.board_id = board.id AND p.type IN ('text', 'note', 'card')
 WHERE pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ qq.q_simple
    OR pg_catalog.to_tsvector('english'::regconfig,
        COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ qq.q_english
    OR pg_catalog.to_tsvector('german'::regconfig,
        COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ qq.q_german

 ORDER BY query_id, kind, rank_plain DESC;

ROLLBACK;
