-- PRODUCTION ROLLOUT -- one term is not a ranking.
--
-- SOURCE: supabase/migrations/20260918180000_board_search_minimal_evidence_rank.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * rank by `simple` when `simple` matched TWO OR MORE query terms; when it
--     matched one or none, a stemmed configuration that strictly sees MORE terms
--     supersedes it;
--   * the two obvious options were scored and BOTH FAILED. The hypothesis that
--     q05's introduction was boosted at equal term count was wrong -- it matches
--     2 terms under simple and 3 under english -- so both options boost it and
--     demote the answer, giving a 1.71x inversion against GREATEST's 1.16x.
--     Worse than the expression they were meant to replace;
--   * this rule changes exactly THREE ROWS in the whole corpus: q07 page 2
--     (relevant, position 5 -> 3), q07 page 3 (irrelevant, position unchanged),
--     and q08's answer (relevant, gap 3.07x -> 1.12x). Everything else keeps
--     simple's ordering, because simple had two or more terms and governs;
--   * MATCHING IS UNTOUCHED. Still the indexed three-way OR, so every row the
--     three configurations admit is still returned.
--
-- ** RE-RUN EXPLAIN AFTER APPLYING THIS. ** The EXPLAIN that proved the six GIN
-- indexes are used was taken against the 20260918170000 function SHAPE. This
-- file adds LATERAL joins for the vectors and the term counts. The qual is
-- deliberately unchanged and the laterals are kept out of it, so the bitmap
-- index scans should still match -- but that is an argument, and EXPLAIN is the
-- proof. The failure mode is silent: same rows, sequential scan, latency as the
-- only symptom.
--
-- NO INDEX WORK, so nothing is rebuilt and nothing is locked.
--
-- IT REQUIRES 20260918120000 for public.plain_text_from_post_content, and
-- assumes 20260918160000's six indexes exist for SPEED, not for correctness.
--
-- LOCKS. None. SAFE TO RE-RUN.
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
