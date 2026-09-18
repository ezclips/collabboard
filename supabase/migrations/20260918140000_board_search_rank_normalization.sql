-- BOARD_SEARCH_READ_2: two corrections to the search functions, before the first
-- live query is ever run against them.
--
-- ------------------------------------------------------------------------
-- WHY THIS IS A NEW MIGRATION AND NOT AN EDIT.
-- ------------------------------------------------------------------------
-- 20260918130000_board_search_text_functions.sql is released. This repository
-- does not rewrite released migrations, because a database that already ran one
-- would never see the change and two deployments would silently disagree about
-- what the same filename means. Both functions are CREATE OR REPLACE with
-- unchanged signatures, so this converges from either state.
--
-- ------------------------------------------------------------------------
-- CORRECTION 1. ts_rank's NORMALIZATION FLAG WAS NEVER CHOSEN BY ANYONE.
-- ------------------------------------------------------------------------
-- The previous version called `ts_rank(document, query)` with no third
-- argument. That is not neutral: the default normalization is 0, which means
-- DOCUMENT LENGTH IS IGNORED ENTIRELY. Rank then accumulates with every extra
-- occurrence, so longer text wins essentially by being longer.
--
-- On these corpora that is not a subtle bias, it is the whole outcome. Posts
-- have a median length of 13 characters; PDF chunks run to 6,000. Under flag 0
-- a note whose entire content is "Iran oil headlines" -- a perfect answer --
-- loses to a chunk that happens to mention oil eight times in six thousand
-- characters. Because the caller takes top-K from each source independently the
-- bias does not show as "PDFs beat posts" in the result list; it shows as the
-- WRONG post and the WRONG chunk being chosen within each source, which is far
-- harder to notice and impossible to argue with after the fact.
--
-- FLAG 1 divides the rank by `1 + log(document length)`. It is the standard
-- choice for mixed-length corpora: it still rewards a document that matches more
-- of the query, but it stops sheer volume from being the deciding factor. It is
-- written out explicitly, and this paragraph exists, because the next reader
-- will otherwise see a bare `1` and have no way to tell a decision from a typo.
--
-- The alternatives were considered and rejected: flag 2 (divide by raw length)
-- over-punishes long chunks to the point that a single-word post would win
-- almost every query, and flag 32 (rank/(rank+1)) only rescales into 0..1
-- without addressing length at all.
--
-- ------------------------------------------------------------------------
-- CORRECTION 2. SET search_path = '' -- matching the hardened pattern.
-- ------------------------------------------------------------------------
-- The previous version used `SET search_path = public`. Every reference in both
-- bodies is already schema-qualified -- `public.` for this schema's own objects,
-- `pg_catalog.` for builtins -- so the stricter setting costs nothing and is
-- what `plain_text_from_post_content` beside them already uses.
--
-- `'simple'::regconfig` STILL RESOLVES under an empty search_path, and that is
-- worth stating because it looks like it should not. pg_catalog is ALWAYS
-- effectively part of the search path: if it is not named explicitly it is
-- implicitly searched first. The `simple` text search configuration lives there,
-- so the cast resolves to the same OID it always did.
--
-- IT IS ALSO LEFT SPELLED EXACTLY AS THE INDEX EXPRESSION SPELLS IT, rather
-- than qualified as 'pg_catalog.simple'. Both would produce the identical OID
-- constant and the planner compares parse trees rather than text, so matching
-- would survive either way -- but the argument that these queries can use
-- `padlets_search_gin` and `knowledge_chunks_search_gin` is easier to check by
-- eye when the two read the same, and that argument is checked by eye far more
-- often than it is checked by EXPLAIN.
--
-- ------------------------------------------------------------------------
-- WHAT IS NOT CHANGED HERE. The signatures, the return shapes, the board and
-- status filters, the `type IN ('text','note')` predicate that lets the partial
-- index be used, the 1..10 clamp, the grants, and SECURITY INVOKER. Only the
-- rank expression and the search_path setting differ from 20260918130000.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock and builds no
-- index.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- REQUIRES 20260918120000 (the projection and the two GIN indexes). It does NOT
-- require 20260918130000 to have been applied first: these are complete function
-- definitions, not deltas, so applying this alone produces the correct end state.
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
