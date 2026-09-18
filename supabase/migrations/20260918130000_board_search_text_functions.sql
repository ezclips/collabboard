-- BOARD_SEARCH_READ_1: the two board-scoped text search functions.
--
-- ------------------------------------------------------------------------
-- WHAT THIS IS.
-- ------------------------------------------------------------------------
-- The read half of the toggle whose indexes shipped in
-- 20260918120000_board_search_config.sql. That migration built
-- `padlets_search_gin` and `knowledge_chunks_search_gin` and deliberately left
-- nothing able to read them. These two functions are that reader.
--
-- One board, two sources, one function each:
--
--   * search_board_posts_text        -- Notes and text posts, over padlets
--   * search_board_knowledge_chunks_text -- PDF text, over knowledge_chunks
--
-- They are SEPARATE rather than one UNION on purpose. `ts_rank` over a short
-- post title and `ts_rank` over a 600-character PDF fragment are different
-- scales, so a single ORDER BY across both would be a made-up comparison
-- presented as a ranking. The caller takes top-K from each independently and
-- labels every passage with where it came from.
--
-- ------------------------------------------------------------------------
-- THE CONFIG IS THE LITERAL 'simple', AND IT HAS TO BE.
-- ------------------------------------------------------------------------
-- Not a column, not a parameter, not current_setting(). A GIN index over
-- to_tsvector('simple'::regconfig, ...) can only be used by a query whose own
-- expression matches it; anything else silently seq-scans. There is also no
-- column left to hold it -- the trialled `search_config regconfig` was removed
-- because Supabase's advisor rejects reg* types in tables (an OID does not
-- survive a restore as the same config).
--
-- This is the coupling the later language-detection commit inherits: it must
-- change the INDEX EXPRESSIONS AND THESE QUERIES TOGETHER, in one migration, or
-- the planner quietly stops using the indexes and nothing fails loudly.
--
-- ------------------------------------------------------------------------
-- p_query IS ALREADY A tsquery EXPRESSION. IT IS NOT THE USER'S MESSAGE.
-- ------------------------------------------------------------------------
-- The caller normalises the message, drops stopwords, de-duplicates, caps the
-- term count and joins with `|` before calling. See
-- lib/domain/ai/boardAiSearchQuery.ts, which owns that and is tested against a
-- 4,000-character message, an all-stopword message and operator punctuation.
--
-- WHY THE CALLER AND NOT websearch_to_tsquery HERE: websearch_to_tsquery and
-- plainto_tsquery both AND their terms. Handing either a whole chat message
-- means "every one of these 600 words must appear in the same post", which
-- matches nothing, every time, and would have shipped as "search finds
-- nothing" rather than as an error.
--
-- to_tsquery RAISES on malformed input, so the caller's sanitiser is what keeps
-- this from turning a chat message into a 42601. It emits alphanumeric terms
-- only. A blank or whitespace-only p_query returns NO ROWS rather than
-- erroring, because "the user typed only stopwords" is an ordinary outcome.
--
-- ------------------------------------------------------------------------
-- AUTHORIZATION. These are stricter than the projection, deliberately.
-- ------------------------------------------------------------------------
-- SECURITY INVOKER, and EXECUTE granted to service_role ONLY -- revoked from
-- PUBLIC, anon AND authenticated. The projection is granted to `authenticated`
-- because index expressions may be evaluated with the writing role's
-- privileges; nothing writes through these, so no such argument exists and the
-- grant would be surface for nothing. This mirrors the vector RPC
-- `search_board_knowledge_chunks` exactly.
--
-- SECURITY INVOKER also means RLS still applies to the caller. The board filter
-- below is the route-board rule on top of that, not a replacement for it.
--
-- ------------------------------------------------------------------------
-- THE PARTIAL INDEX IS ONLY USED IF THE PREDICATE IS REPEATED.
-- ------------------------------------------------------------------------
-- `padlets_search_gin` is partial: WHERE type IN ('text', 'note'). A query that
-- does not carry that same predicate in its own WHERE clause cannot use it, no
-- matter how the expression matches. So it is written out plainly below --
-- never as `type = ANY(p_types)` or any other indirection the planner cannot
-- prove implies the index predicate.
--
-- The type list is also the R2 rule: a padlet type qualifies only if its
-- substance is prose in `content`. The other eleven hold structured JSON, and
-- indexing that would put JSON keys in the index.
--
-- ------------------------------------------------------------------------
-- LOCKS. None worth planning around: CREATE FUNCTION takes no table lock and
-- builds no index. This migration is fast on any database size.
-- ------------------------------------------------------------------------
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
