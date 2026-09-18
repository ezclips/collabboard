-- BOARD_SEARCH_READ_6: one term is not a ranking.
--
-- ========================================================================
-- THE RULE.
-- ========================================================================
--   Rank by `simple` when `simple` matched TWO OR MORE query terms.
--   When it matched one or none, the stemmed view supersedes -- but only where
--   it strictly sees MORE terms than `simple` did.
--
--     CASE WHEN n_simple >= 2                        THEN rank_simple
--          WHEN GREATEST(n_english, n_german) > n_simple
--                                                    THEN GREATEST(rank_english, rank_german)
--          ELSE rank_simple END
--
-- MATCHING IS UNTOUCHED -- still the indexed three-way OR -- so every row the
-- three configurations admit is still returned. No index changes, no rebuild.
--
-- ========================================================================
-- WHY: THE TWO OBVIOUS OPTIONS WERE SCORED AND BOTH FAILED.
-- ========================================================================
-- The candidates were "take the stemmed rank when it saw strictly more terms"
-- (option 1) and "rank by whichever configuration saw the most terms, ties to
-- simple" (option 2). BOTH FAIL THE BAR, and they fail on the hypothesis that
-- justified them.
--
-- THE HYPOTHESIS WAS THAT q05's INTRO WAS BOOSTED AT EQUAL TERM COUNT. It was
-- not. Measured: the introduction matches n_simple = 2, n_english = 3,
-- n_german = 2. So the stemmed view genuinely sees more, both options boost it
-- to 0.011075, and the answer -- which falls back to `simple` -- drops to
-- 0.006487 and position 3 of 4.
--
-- THAT IS WORSE THAN THE EXPRESSION THEY WERE MEANT TO REPLACE: a 1.71x
-- inversion against GREATEST's 1.16x, because the options demote the answer
-- while keeping the intro's boost. An option that is worse than the thing it
-- replaces, on the pair it was designed for, is not a near miss.
--
-- AND THE TWO CANNOT BE TOLD APART HERE. `options_disagree` is false on EVERY
-- row in the corpus -- english and german never match different numbers of terms
-- on this board -- so nothing in this data could have chosen between them. That
-- is worth recording as a property of the corpus rather than of the options.
--
-- ========================================================================
-- WHAT THIS RULE ACTUALLY CHANGES: THREE ROWS. ALL OF THEM.
-- ========================================================================
--   q07 page 2 (RELEVANT)  0.001710 -> 0.004145   position 5 -> 3
--   q07 page 3 (irrelevant) 0.002012 -> 0.004287  position 2, unchanged
--   q08 answer (RELEVANT)  0.003145 -> 0.008635   position 2, gap 3.07x -> 1.12x
--
-- Every other row in all eleven questions is untouched, because `simple` had two
-- or more terms and therefore governs. THE NARROWNESS IS THE DESIGN: the rule
-- only speaks where `simple`'s view was too thin to be a ranking at all.
--
-- THE BAR, ALL FOUR ITEMS:
--   * q07's page is back inside the top-K -- the passage EVERY previous
--     expression failed, `simple` alone by never admitting it, GREATEST by
--     costing q05, additive by ranking it on its weakest view;
--   * q05's answer leads its introduction again -- both its rows match two terms
--     under `simple`, so `simple` governs and the stemmed boost never applies;
--   * no rated-relevant passage leaves the top-K anywhere;
--   * no NEW rated inversion -- q08's is the known one, narrowed from 3.07x to
--     1.12x, and q07's two rows keep their existing relative order.
--
-- ========================================================================
-- THE CAVEATS, STATED RATHER THAN BURIED.
-- ========================================================================
-- "TWO" IS A BOUNDARY, AND A BOUNDARY IS A NUMBER. It is minimal evidence
-- rather than a tuned constant -- one term is not a ranking, two is the smallest
-- count that can order anything -- but it was not derived from first principles
-- and it has not been tested against 3. It is defensible, not proven.
--
-- IT FIXES THE PROMOTED-ROW CASE, NOT THE CLASS. q05's introduction and q08's
-- introduction are "mentions everything" passages: they genuinely match more
-- query terms than the answer does, in every configuration. NO TERM-COUNT RULE
-- SEPARATES THEM FROM q07, because the difference is not how many terms matched
-- but whether the passage is ABOUT the question. That is a semantic problem. The
-- embeddings already in this database are the eventual lever; another lexical
-- clause is not.
--
-- PER-ROW COST IS ON THE WATCH LIST. The rank now counts terms per
-- configuration, O(terms x configs) per matching row. The structure below
-- computes each document's three tsvectors ONCE per row and tests the terms
-- against those, rather than recomputing a tsvector per term -- which the
-- straightforward form would do, at up to 20 x 3 projections per row. If it
-- still shows up, the fallback is intersecting `tsvector_to_array(document)`
-- with the query's lexemes once per configuration.
--
-- ------------------------------------------------------------------------
-- **RE-RUN EXPLAIN AFTER APPLYING THIS.** The EXPLAIN that proved the six GIN
-- indexes are used -- Bitmap Heap Scan into BitmapOr across
-- padlets_search_{gin,en_gin,de_gin} and the chunk equivalents -- was taken
-- against the 20260918170000 function SHAPE. This file adds LATERAL joins for
-- the vectors and the counts, which changes the plan shape even though it does
-- not change the qual. The qual is deliberately left spelled exactly as before
-- and the laterals are kept OUT of it, so the indexes should still match; that
-- is an argument, and EXPLAIN is the proof. The failure mode is silent: the same
-- rows, a sequential scan, and latency as the only symptom.
-- ------------------------------------------------------------------------
--
-- UNCHANGED: signatures, return shapes, the three-way match, the widened type
-- predicate, the posts/chunks flag asymmetry (0 and 1), the body-over-title-only
-- tie-break, the empty search_path, SECURITY INVOKER and the grants.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock.
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- VERIFY WITH:
--   20260918180000_board_search_minimal_evidence_rank_verify.sql
-- UNDO WITH (read its header first):
--   20260918180000_board_search_minimal_evidence_rank_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_board_posts_text(
    p_board_id uuid,
    p_query text,
    p_limit integer DEFAULT 4
)
RETURNS TABLE(
    padlet_id uuid,
    title text,
    text text,
    rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    ),
    -- FILTERED FIRST, DELIBERATELY. The qual below is spelled exactly as the
    -- three padlets indexes are, and nothing from the laterals appears in it, so
    -- the planner can still prove the bitmap index scans. Everything expensive
    -- happens afterwards, on the rows that survived.
    matched AS (
        SELECT p.id, p.title, p.content, q.q_simple, q.q_english, q.q_german
          FROM public.padlets AS p, q
         WHERE p.board_id = p_board_id
           AND p.type IN ('text', 'note', 'card')
           AND (pg_catalog.to_tsvector('simple'::regconfig,
                    COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_simple
             OR pg_catalog.to_tsvector('english'::regconfig,
                    COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_english
             OR pg_catalog.to_tsvector('german'::regconfig,
                    COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_german)
    )
    SELECT
        m.id AS padlet_id,
        COALESCE(m.title, '') AS title,
        body.text,
        -- ONE TERM IS NOT A RANKING. Where `simple` saw two or more terms it has
        -- a real view and it governs. Where it saw one or none, a stemmed view
        -- that strictly sees more supersedes it. Flag 0: a post's rank is the
        -- evidence it carries, not its length (20260918150000).
        CASE WHEN n.n_simple >= 2
               THEN pg_catalog.ts_rank(v.v_simple, m.q_simple, 0)
             WHEN GREATEST(n.n_english, n.n_german) > n.n_simple
               THEN GREATEST(pg_catalog.ts_rank(v.v_english, m.q_english, 0),
                             pg_catalog.ts_rank(v.v_german,  m.q_german,  0))
             ELSE pg_catalog.ts_rank(v.v_simple, m.q_simple, 0)
        END AS rank
      FROM matched AS m
      -- The projection runs ONCE per matched row here, instead of six times in
      -- the qual and the rank as it did before.
      CROSS JOIN LATERAL (
          SELECT public.plain_text_from_post_content(m.content) AS text
      ) AS body
      CROSS JOIN LATERAL (
          SELECT COALESCE(m.title, '') || ' ' || body.text AS document
      ) AS d
      CROSS JOIN LATERAL (
          SELECT pg_catalog.to_tsvector('simple'::regconfig, d.document)  AS v_simple,
                 pg_catalog.to_tsvector('english'::regconfig, d.document) AS v_english,
                 pg_catalog.to_tsvector('german'::regconfig, d.document)  AS v_german
      ) AS v
      -- How many DISTINCT query terms each configuration matches, counted
      -- against the vectors above rather than by rebuilding one per term.
      CROSS JOIN LATERAL (
          SELECT pg_catalog.count(*) FILTER (
                     WHERE v.v_simple @@ pg_catalog.to_tsquery('simple'::regconfig, t.term))::int AS n_simple,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_english @@ pg_catalog.to_tsquery('english'::regconfig, t.term))::int AS n_english,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_german @@ pg_catalog.to_tsquery('german'::regconfig, t.term))::int AS n_german
            FROM (
                SELECT pg_catalog.btrim(raw) AS term
                  FROM pg_catalog.unnest(pg_catalog.string_to_array(p_query, '|')) AS raw
                 -- An empty term would make to_tsquery raise a syntax error, so
                 -- a trailing separator must not become a query.
                 WHERE pg_catalog.btrim(raw) <> ''
            ) AS t
      ) AS n
     ORDER BY rank DESC, (body.text <> '') DESC, m.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text, note and card posts of one board under three configurations. Ranked by simple where simple matched two or more query terms; otherwise by the stemmed configuration that strictly matched more. Evidence-only normalization, with a body-over-title-only tie-break. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks_text(
    p_board_id uuid,
    p_query text,
    p_limit integer DEFAULT 4
)
RETURNS TABLE(
    chunk_id uuid,
    document_id uuid,
    original_filename text,
    page_start integer,
    page_end integer,
    chunk_index integer,
    text text,
    source_locators jsonb,
    rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    ),
    matched AS (
        SELECT c.id, c.document_id, c.page_start, c.page_end, c.chunk_index,
               c.text, c.source_locators, d.original_filename,
               q.q_simple, q.q_english, q.q_german
          FROM public.knowledge_chunks AS c
          JOIN public.knowledge_documents AS d ON d.id = c.document_id
          CROSS JOIN q
         WHERE d.board_id = p_board_id
           AND d.processing_status = 'ready'
           AND (pg_catalog.to_tsvector('simple'::regconfig, c.text)  @@ q.q_simple
             OR pg_catalog.to_tsvector('english'::regconfig, c.text) @@ q.q_english
             OR pg_catalog.to_tsvector('german'::regconfig, c.text)  @@ q.q_german)
    )
    SELECT
        m.id AS chunk_id,
        m.document_id,
        m.original_filename,
        m.page_start,
        m.page_end,
        m.chunk_index,
        m.text,
        m.source_locators,
        -- The same rule, on flag 1. This is the half that moves q08's answering
        -- paragraph: `simple` sees one term there, `english` sees two because
        -- `ribbed` and "Ribbing" stem together, so the stemmed view supersedes
        -- and the gap narrows from 3.07x to 1.12x. It does NOT flip -- the
        -- introduction genuinely matches more of the query, which is a semantic
        -- problem and not a ranking one.
        CASE WHEN n.n_simple >= 2
               THEN pg_catalog.ts_rank(v.v_simple, m.q_simple, 1)
             WHEN GREATEST(n.n_english, n.n_german) > n.n_simple
               THEN GREATEST(pg_catalog.ts_rank(v.v_english, m.q_english, 1),
                             pg_catalog.ts_rank(v.v_german,  m.q_german,  1))
             ELSE pg_catalog.ts_rank(v.v_simple, m.q_simple, 1)
        END AS rank
      FROM matched AS m
      CROSS JOIN LATERAL (
          SELECT pg_catalog.to_tsvector('simple'::regconfig, m.text)  AS v_simple,
                 pg_catalog.to_tsvector('english'::regconfig, m.text) AS v_english,
                 pg_catalog.to_tsvector('german'::regconfig, m.text)  AS v_german
      ) AS v
      CROSS JOIN LATERAL (
          SELECT pg_catalog.count(*) FILTER (
                     WHERE v.v_simple @@ pg_catalog.to_tsquery('simple'::regconfig, t.term))::int AS n_simple,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_english @@ pg_catalog.to_tsquery('english'::regconfig, t.term))::int AS n_english,
                 pg_catalog.count(*) FILTER (
                     WHERE v.v_german @@ pg_catalog.to_tsquery('german'::regconfig, t.term))::int AS n_german
            FROM (
                SELECT pg_catalog.btrim(raw) AS term
                  FROM pg_catalog.unnest(pg_catalog.string_to_array(p_query, '|')) AS raw
                 WHERE pg_catalog.btrim(raw) <> ''
            ) AS t
      ) AS n
     ORDER BY rank DESC, m.chunk_index ASC, m.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text IS
    'Full-text search the PDF chunks of one board under three configurations. Ranked by simple where simple matched two or more query terms; otherwise by the stemmed configuration that strictly matched more. Length normalization throughout. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
