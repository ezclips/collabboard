-- PRODUCTION ROLLOUT -- two corrections to the board search functions.
--
-- SOURCE: supabase/migrations/20260918140000_board_search_rank_normalization.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * THE RANK NORMALIZATION FLAG WAS NEVER CHOSEN. The previous version called
--     ts_rank with no third argument, and the default is 0 -- which ignores
--     document length entirely, so longer text outranks shorter text largely by
--     being longer. On these corpora that decides the outcome: posts have a
--     median length of 13 characters and PDF chunks run to 6,000, so a note
--     reading exactly "Iran oil headlines" loses to a chunk mentioning oil eight
--     times. Flag 1 divides by 1 + log(length) and is the standard choice for a
--     mixed-length corpus;
--   * SET search_path = '' replaces `= public`. Every reference in both bodies is
--     already schema-qualified, so it is free, and it matches the pattern
--     plain_text_from_post_content beside them already uses. 'simple'::regconfig
--     still resolves, because pg_catalog is always effectively on the search path
--     whether or not it is named.
--
-- WHY A NEW MIGRATION RATHER THAN AN EDIT. 20260918130000 is released, and this
-- repository does not rewrite released migrations: a database that already ran
-- one would never see the change, and two deployments would silently disagree
-- about what the same filename means.
--
-- APPLY THIS BEFORE THE FIRST REAL SEARCH IF YOU CAN. Both corrections are to
-- code no user has yet exercised -- the application half shipped with the
-- functions absent, and a search that cannot run is reported as such. Applying
-- 20260918130000 and this one together means no query is ever ranked by the
-- unchosen default.
--
-- IT DOES NOT REQUIRE 20260918130000 TO HAVE BEEN APPLIED. These are complete
-- function definitions rather than deltas, so applying this alone produces the
-- correct end state. It DOES require 20260918120000: search_board_posts_text
-- calls public.plain_text_from_post_content, and without it this file fails with
-- SQLSTATE 42883 and the batch aborts.
--
-- WHAT IS NOT CHANGED. Signatures, return shapes, the board and status filters,
-- the type IN ('text','note') predicate that lets the partial index be used, the
-- 1..10 clamp, the grants, and SECURITY INVOKER. Only the rank expression and
-- the search_path setting differ.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock and builds no
-- index, so this is fast on any database size.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- VERIFY WITH:
--   20260918140000_board_search_rank_normalization_verify.sql
-- UNDO WITH (read its header first):
--   20260918140000_board_search_rank_normalization_rollback.sql
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
        -- NORMALIZATION FLAG 1 -- DELIBERATE. Divides by 1 + log(length), so a
        -- short exact note is not beaten by a long chunk that mentions one term
        -- repeatedly. The default is 0, which ignores length entirely; see the
        -- header for why that is the wrong answer on a corpus whose posts have a
        -- median of 13 characters.
        pg_catalog.ts_rank(matched.document, q.query, 1) AS rank
      FROM matched, q
     WHERE matched.document @@ q.query
     -- padlet_id breaks ties deterministically, so two runs of the same query
     -- return the same passages in the same order.
     ORDER BY rank DESC, matched.padlet_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text and note posts of one board, ranked with length normalization. p_query is a tsquery expression built by the caller, not a raw user message.';

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
        -- Flag 1, for the same reason and with the same weight as above. Chunks
        -- on this corpus range from tens of characters to six thousand, so an
        -- unnormalized rank would order them mostly by size.
        pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.query, 1) AS rank
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
    'Full-text search the PDF chunks of one board, ranked with length normalization. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
