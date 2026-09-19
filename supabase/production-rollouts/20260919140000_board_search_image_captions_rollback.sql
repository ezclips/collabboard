-- ROLLBACK for 20260919140000_board_search_image_captions.sql.
--
-- WHAT IT DOES. Restores the 20260918180000 search function verbatim and the
-- 20260918160000 index expressions and predicates, then drops the two
-- functions this migration introduced. No row is touched and no data is lost:
-- indexes are derived, and the functions are the only thing being removed.
--
-- WHAT YOU GIVE UP BY RUNNING IT. Images stop being searchable -- they are not
-- merely demoted, they leave the indexed set entirely, exactly as before. A
-- captioned image becomes unfindable again and nothing in the product says so.
--
-- WHEN RUNNING THIS IS THE RIGHT CALL: the admitted rows measurably damage
-- ranking for everything else -- the named pairs in
-- scripts/db/boardSearchRankingPairs.test.ts move the wrong way, or real
-- queries start returning images over prose. It is NOT the response to "an
-- image shows up in results": that is the fixed behaviour working.
--
-- ORDER MATTERS. The indexes are rebuilt on the OLD expression BEFORE the new
-- functions are dropped, because an index depends on the function it calls and
-- the drop would otherwise be refused.
--
-- LOCKS. Same as the forward migration: the index builds block writes on
-- padlets for seconds at this size, are the last statements here, and are
-- individually re-runnable as CREATE INDEX CONCURRENTLY outside a transaction.

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

COMMIT;

-- ---------------------------------------------------------------------------
-- The 20260918160000 index expressions and predicates, restored. Rebuilt
-- BEFORE the new functions are dropped: an index depends on the function in its
-- expression.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.padlets_search_gin;
DROP INDEX IF EXISTS public.padlets_search_en_gin;
DROP INDEX IF EXISTS public.padlets_search_de_gin;

CREATE INDEX IF NOT EXISTS padlets_search_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('simple'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

CREATE INDEX IF NOT EXISTS padlets_search_en_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('english'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

CREATE INDEX IF NOT EXISTS padlets_search_de_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector('german'::regconfig,
        COALESCE(title, '') || ' ' || public.plain_text_from_post_content(content)))
    WHERE type IN ('text', 'note', 'card');

DROP FUNCTION IF EXISTS public.searchable_post_document(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.searchable_post_excerpt(text, text, jsonb);
