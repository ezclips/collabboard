-- READ-ONLY: the two ranking options, scored side by side against the three
-- expressions that have already shipped.
--
-- ========================================================================
-- WHY THIS EXISTS: EVERY STATE WE HAVE IS DISQUALIFIED.
-- ========================================================================
-- q07's TENS page 2 is rated RELEVANT. It contains "a single pulse" and
-- "stimulators", so `simple` sees ONE query term and `english` and `german` each
-- see TWO.
--
--   * UNDER `simple` ALONE (pre-C): never admitted -- `stimulator` does not
--     match "stimulators" without a stemmer.
--   * UNDER GREATEST (20260918160000): admitted and ranked by english, so it
--     made the top-K -- but GREATEST cost a rated inversion on q05.
--   * UNDER ADDITIVE (20260918170000, live today): admitted, then ranked by
--     `simple` BECAUSE `simple` MATCHED AT ALL -- one weak term -- and dropped
--     below the bicycle chunks at 0.001878.
--
-- So there is no correct state to revert to. The fix goes FORWARD, and this file
-- is how the forward step gets chosen rather than argued.
--
-- ------------------------------------------------------------------------
-- THE TWO OPTIONS.
-- ------------------------------------------------------------------------
-- OPTION 2 (the preferred one): rank by the configuration that matched the MOST
-- query terms; ties go to `simple`; an english/german tie takes the greater of
-- those two.
--
--     rank_opt2 = CASE
--       WHEN n_simple >= GREATEST(n_english, n_german) THEN rank_simple
--       WHEN n_english > n_german                      THEN rank_english
--       WHEN n_german  > n_english                     THEN rank_german
--       ELSE GREATEST(rank_english, rank_german) END
--
-- OPTION 1 (the fallback): take the greater of english/german ONLY when the
-- better of them matched STRICTLY MORE terms than `simple`; otherwise `simple`.
--
--     rank_opt1 = CASE
--       WHEN GREATEST(n_english, n_german) > n_simple
--         THEN GREATEST(rank_english, rank_german)
--       ELSE rank_simple END
--
-- WHERE THEY DISAGREE, which is the only reason to score both: when english and
-- german match DIFFERENT numbers of terms. Option 1 takes the greater RANK of
-- the two; option 2 takes the rank of the one that matched more TERMS, which can
-- be the lower number. Everywhere else they agree.
--
-- WHY EITHER SHOULD FIX q07 AND STILL BLOCK q05: q07's row is 1 term under
-- simple against 2 under english/german, so the stemmed view wins on evidence.
-- q05's intro was boosted at EQUAL term count, so both options leave it on
-- `simple` and the pre-C order returns. That is the hypothesis; this file is the
-- test of it, and a surprise here is the point of running it.
--
-- ------------------------------------------------------------------------
-- THE BAR, so the result is read against it rather than for it.
-- ------------------------------------------------------------------------
--   1. q07's page 2 is back inside the top-K for q07 (pos <= 4).
--   2. q05's ANSWER leads its document INTRODUCTION again.
--   3. No rated-relevant passage leaves the top-K anywhere -- check every
--      pos_opt* <= 4 against scripts/db/boardSearchTuningRatings.json.
--   4. No new rated inversion: no irrelevant row rises above a relevant one
--      within the same question and source.
--
-- ------------------------------------------------------------------------
-- A CONSTRAINT ON WHATEVER SHIPS, AND IT IS EASY TO BREAK.
-- ------------------------------------------------------------------------
-- MATCHING MUST STAY THE INDEXED THREE-WAY OR. The per-configuration term counts
-- belong in the RANK side only. The moment a term count appears in the WHERE
-- clause, the qual stops being the expression the six GIN indexes were built on,
-- the planner cannot match them, and every search becomes a sequential scan that
-- runs the HTML projection over every post on the board. The only symptom is
-- latency.
--
-- A COST TO MEASURE BEFORE SHIPPING, not after. The rank expression is evaluated
-- for EVERY row that matches the qual, not just the ten that survive the LIMIT.
-- Counting terms per configuration is O(terms x configs) per matching row -- up
-- to 20 x 3 `@@` tests against an in-memory tsvector. That is cheap per row and
-- it is not free per query, and a common term can match a lot of rows. If it
-- shows up, the cheaper formulation to try is intersecting
-- `tsvector_to_array(document)` with the query's lexemes once per configuration
-- instead of testing each term separately.
--
-- The tsquery term lists come from the real query builder; regenerate with
--     npx vite-node scripts/db/boardSearchTuningBattery.ts
-- and copy each `terms:` line if the builder ever changes.

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
term AS (
    SELECT q.id, pg_catalog.btrim(t) AS term
      FROM q, pg_catalog.unnest(pg_catalog.string_to_array(q.terms, '|')) AS t
),
board AS (SELECT 'af02972f-dfde-4545-9fc8-5fcbccb007c3'::uuid AS id),
-- Posts and chunks in one shape. `norm` carries the flag asymmetry that
-- 20260918150000 established: posts rank on 0, chunks on 1.
doc AS (
    SELECT 'chunk'::text AS source,
           d.original_filename || ' — chunk ' || c.chunk_index AS label,
           c.text AS body,
           1 AS norm,
           c.chunk_index AS tiebreak
      FROM board
      JOIN public.knowledge_documents AS d ON d.board_id = board.id AND d.processing_status = 'ready'
      JOIN public.knowledge_chunks AS c ON c.document_id = d.id
    UNION ALL
    SELECT 'post',
           COALESCE(p.title, '')
             || CASE WHEN public.plain_text_from_post_content(p.content) = '' THEN ' (TITLE ONLY)' ELSE '' END,
           COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content),
           0,
           0
      FROM board
      JOIN public.padlets AS p ON p.board_id = board.id AND p.type IN ('text', 'note', 'card')
),
-- How many DISTINCT query terms each configuration matches in each body. This
-- is the quantity both options turn on, and it cannot be computed outside the
-- database without re-implementing three snowball stemmers.
counts AS (
    SELECT term.id AS query_id, doc.label, doc.source,
           pg_catalog.count(*) FILTER (
               WHERE pg_catalog.to_tsvector('simple'::regconfig, doc.body)
                     @@ pg_catalog.to_tsquery('simple'::regconfig, term.term))::int AS n_simple,
           pg_catalog.count(*) FILTER (
               WHERE pg_catalog.to_tsvector('english'::regconfig, doc.body)
                     @@ pg_catalog.to_tsquery('english'::regconfig, term.term))::int AS n_english,
           pg_catalog.count(*) FILTER (
               WHERE pg_catalog.to_tsvector('german'::regconfig, doc.body)
                     @@ pg_catalog.to_tsquery('german'::regconfig, term.term))::int AS n_german
      FROM term JOIN doc ON true
     GROUP BY term.id, doc.label, doc.source
),
ranked AS (
    SELECT
        qq.id AS query_id,
        doc.source,
        doc.label,
        pg_catalog.length(doc.body) AS chars,
        doc.tiebreak,
        counts.n_simple, counts.n_english, counts.n_german,
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, doc.body),  qq.q_simple,  doc.norm) AS r_s,
        pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig, doc.body), qq.q_english, doc.norm) AS r_e,
        pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig, doc.body),  qq.q_german,  doc.norm) AS r_g
      FROM qq
      JOIN doc ON true
      JOIN counts ON counts.query_id = qq.id AND counts.label = doc.label AND counts.source = doc.source
     -- The shipped admission rule, unchanged: the three-way OR.
     WHERE pg_catalog.to_tsvector('simple'::regconfig, doc.body)  @@ qq.q_simple
        OR pg_catalog.to_tsvector('english'::regconfig, doc.body) @@ qq.q_english
        OR pg_catalog.to_tsvector('german'::regconfig, doc.body)  @@ qq.q_german
),
scored AS (
    SELECT *,
        -- What 20260918160000 did.
        GREATEST(r_s, r_e, r_g) AS rank_max,
        -- What 20260918170000 does today, and the one that drops q07.
        CASE WHEN n_simple > 0 THEN r_s ELSE GREATEST(r_e, r_g) END AS rank_additive,
        -- Option 1: greater only on strictly more terms.
        CASE WHEN GREATEST(n_english, n_german) > n_simple THEN GREATEST(r_e, r_g)
             ELSE r_s END AS rank_opt1,
        -- Option 2: the configuration that matched the most terms wins; ties to
        -- simple; an english/german tie takes the greater of those two.
        CASE WHEN n_simple >= GREATEST(n_english, n_german) THEN r_s
             WHEN n_english > n_german THEN r_e
             WHEN n_german > n_english THEN r_g
             ELSE GREATEST(r_e, r_g) END AS rank_opt2
      FROM ranked
)
SELECT
    query_id, source, label, chars,
    n_simple, n_english, n_german,
    rank_additive, rank_max, rank_opt1, rank_opt2,
    -- TOP-K MEMBERSHIP, which is the question the bar actually asks. K = 4 per
    -- source. A rated-relevant row with pos > 4 under an option disqualifies it.
    pg_catalog.row_number() OVER (PARTITION BY query_id, source ORDER BY rank_additive DESC, tiebreak, label) AS pos_additive,
    pg_catalog.row_number() OVER (PARTITION BY query_id, source ORDER BY rank_max      DESC, tiebreak, label) AS pos_max,
    pg_catalog.row_number() OVER (PARTITION BY query_id, source ORDER BY rank_opt1     DESC, tiebreak, label) AS pos_opt1,
    pg_catalog.row_number() OVER (PARTITION BY query_id, source ORDER BY rank_opt2     DESC, tiebreak, label) AS pos_opt2,
    -- Where the two options disagree at all. Expect few rows; they are the only
    -- place the choice between them is decided by evidence rather than taste.
    (rank_opt1 IS DISTINCT FROM rank_opt2) AS options_disagree
  FROM scored
 ORDER BY query_id, source, rank_opt2 DESC, label;

ROLLBACK;
