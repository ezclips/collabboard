-- PRODUCTION ROLLOUT -- the two board-scoped text search functions.
--
-- SOURCE: supabase/migrations/20260918130000_board_search_text_functions.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * this is the READ half of the toggle whose indexes shipped in
--     20260918120000_board_search_config.sql. That rollout built the indexes and
--     deliberately left nothing able to read them; these two functions are that
--     reader, one per source -- posts and PDF chunks;
--   * THEY ARE TWO FUNCTIONS, NOT ONE UNION. ts_rank over a short post title and
--     ts_rank over a 600-character PDF fragment are different scales, so ranking
--     across both would be a made-up comparison presented as a result. The
--     caller takes top-K from each independently and labels every passage;
--   * p_query IS A tsquery EXPRESSION, NOT A CHAT MESSAGE. The application
--     normalises, drops stopwords, de-duplicates, caps the term count and joins
--     with `|` before calling. websearch_to_tsquery and plainto_tsquery both AND
--     their terms, so handing either a whole message matches nothing, every
--     time. A blank p_query returns no rows rather than erroring;
--   * 'simple' IS A LITERAL IN BOTH, and must stay one. A GIN index over
--     to_tsvector('simple'::regconfig, ...) is only usable by a query whose own
--     expression matches it. The later language-detection work has to change the
--     index expressions and these queries TOGETHER or the planner silently stops
--     using the indexes.
--
-- THIS ROLLOUT PAIRS WITH AN APPLICATION DEPLOY, unlike the one before it. The
-- Board AI search toggle calls these functions; applied without the deploy
-- nothing calls them, which is safe. Deployed without this applied, a user who
-- turns the toggle on gets a failed search rather than a broken chat -- but do
-- not rely on that: apply this first.
--
-- AUTHORIZATION IS TIGHTER THAN THE PROJECTION'S, DELIBERATELY. Both are
-- SECURITY INVOKER with EXECUTE revoked from PUBLIC, anon AND authenticated, and
-- granted to service_role only. `plain_text_from_post_content` is granted to
-- authenticated because an index expression may be evaluated with the writing
-- role's privileges; nothing writes through these, so that argument does not
-- apply and the grant would be surface for nothing. This mirrors the existing
-- vector RPC `search_board_knowledge_chunks` exactly.
--
-- REQUIRES 20260918120000 TO HAVE BEEN APPLIED. search_board_posts_text calls
-- `public.plain_text_from_post_content`, so on a database without it this file
-- fails with SQLSTATE 42883 and the batch aborts. That is the correct outcome,
-- not something to guard: the function is the projection these indexes are
-- built on, and a search that could run without it would be searching different
-- words than the index holds.
--
-- LOCKS. None worth planning around. CREATE FUNCTION takes no table lock and
-- builds no index, so this is fast on any database size.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with a fixed signature.
--
-- VERIFY WITH:
--   20260918130000_board_search_text_functions_verify.sql
-- UNDO WITH (read its header first):
--   20260918130000_board_search_text_functions_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- ------------------------------------------------------------------------
-- POSTS. Notes and text posts on one board.
-- ------------------------------------------------------------------------
-- The tsvector expression is character-for-character the index expression from
-- 20260918120000: title first, then the projection of `content`, joined by a
-- single space and only when the projection is non-empty. If these two ever
-- disagree the index stops being used and the only symptom is latency.
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
SET search_path = public
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query) AS query
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    ),
    matched AS (
        SELECT
            p.id AS padlet_id,
            COALESCE(p.title, '') AS title,
            public.plain_text_from_post_content(p.content) AS text,
            pg_catalog.to_tsvector(
                'simple'::regconfig,
                COALESCE(p.title, '')
                || CASE
                       WHEN public.plain_text_from_post_content(p.content) = '' THEN ''
                       ELSE ' ' || public.plain_text_from_post_content(p.content)
                   END) AS document
          FROM public.padlets AS p
         WHERE p.board_id = p_board_id
           -- Written out so the planner can prove it implies the partial index.
           AND p.type IN ('text', 'note')
    )
    SELECT
        matched.padlet_id,
        matched.title,
        matched.text,
        pg_catalog.ts_rank(matched.document, q.query) AS rank
      FROM matched, q
     WHERE matched.document @@ q.query
     -- padlet_id breaks ties deterministically, so two runs of the same query
     -- return the same passages in the same order.
     ORDER BY rank DESC, matched.padlet_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text and note posts of one board. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_posts_text(uuid, text, integer)
    TO service_role;

-- ------------------------------------------------------------------------
-- PDF TEXT. Chunks of the ready documents on one board.
-- ------------------------------------------------------------------------
-- The column shape is the vector RPC's, with `rank` where `similarity` was, so
-- a caller can treat a lexical hit and a semantic hit as the same kind of
-- thing. `source_locators` travels for the same reason it does there: it is
-- what lets a citation point at a place on a page.
--
-- UNLIKE THE VECTOR RPC, THIS DOES NOT COLLAPSE TO ONE CHUNK PER DOCUMENT. That
-- rule exists there because a semantic result represents a SOURCE; here a
-- passage represents a PLACE, and a board whose only PDF holds the answer twice
-- should be able to return both. The caller's top-K is the bound.
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
SET search_path = public
AS $$
    WITH q AS (
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query) AS query
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    )
    SELECT
        c.id AS chunk_id,
        c.document_id,
        d.original_filename,
        c.page_start,
        c.page_end,
        c.chunk_index,
        c.text,
        c.source_locators,
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query) AS rank
      FROM public.knowledge_chunks AS c
      JOIN public.knowledge_documents AS d ON d.id = c.document_id
      CROSS JOIN q
     WHERE d.board_id = p_board_id
       -- Only a finished document has persisted text. Matching an in-flight one
       -- would cite a page that may still change.
       AND d.processing_status = 'ready'
       AND pg_catalog.to_tsvector('simple'::regconfig, c.text) @@ q.query
     ORDER BY rank DESC, c.chunk_index ASC, c.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text IS
    'Full-text search the PDF chunks of one board. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
