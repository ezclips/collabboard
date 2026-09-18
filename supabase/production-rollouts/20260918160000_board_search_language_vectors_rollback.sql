-- ROLLBACK for 20260918160000_board_search_language_vectors.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- THIS IS A REVERT, NOT A DROP. It restores the state 20260918150000 produced:
-- both search functions on a single `simple` configuration, the projection with
-- the plain-string <br> regex, and ONE padlets index with the old expression and
-- the old type predicate. Dropping the functions instead would leave the
-- application calling functions that are gone, which is a harder failure than
-- the one being undone.
--
-- WHAT YOU ARE CHOOSING BY RUNNING IT.
--
--   * GERMAN STEMMING GOES AWAY. `Stoßstange` and `Stossstange` stop being the
--     same token, `lösen` stops matching `löse`, and q10's answering chunk falls
--     from 0.01413 back to 0.00778 -- narrowing its lead over the next passage
--     from 1.29x to 1.10x. On a bilingual board this is the largest single loss
--     in this file.
--   * ENGLISH STEMMING GOES AWAY. `ribbed` stops matching `Ribbing`. q08's
--     answering paragraph stops matching the query at all -- it returns to
--     matching one term once. NOTE that q08 was INVERTED either way; what is
--     lost is the answer entering the result at all, not its position.
--   * `card` POSTS STOP BEING SEARCHABLE. Any post of that type silently leaves
--     the index.
--   * THE PROJECTION IS EVALUATED TWICE PER ROW PER WRITE AGAIN. A performance
--     regression on writes, invisible in any result.
--
-- NOTHING BECOMES WRONG, WHICH IS THE DANGEROUS PART. Every query still
-- succeeds and every row still comes back; the result sets simply get SMALLER,
-- and a smaller result set looks exactly like a board that holds less. If you
-- run this, note it somewhere a person will read -- the symptom is "board search
-- stopped finding the German posts", which nobody traces to a rollback.
--
-- WHEN RUNNING IT IS NEVERTHELESS RIGHT. The standing cost of design C is WRITE
-- AMPLIFICATION: three GIN indexes maintained on every post edit and every
-- ingestion instead of one. If post writes become slow enough to matter, this is
-- the way back, and the cheaper middle ground is to run it and then re-create
-- only the `german` pair -- the two vectors are independent, and the functions
-- tolerate a missing index (they get slower, not wrong).
--
-- IT REBUILDS INDEXES, SO IT IS NOT INSTANT. Same lock warning as the rollout:
-- at this size it is seconds; on a large database use CONCURRENTLY outside the
-- transaction.
--
-- NO DATA IS LOST either way. Both functions are pure reads and the indexes are
-- derived; nothing here stores anything.
--
-- IT DOES NOT TOUCH THE VECTOR RPC. `search_board_knowledge_chunks` (no `_text`)
-- is the older embedding search, a different function with a different
-- signature. The names are one suffix apart; check twice before editing this.
--
-- SAFE TO RE-RUN.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

CREATE OR REPLACE FUNCTION public.plain_text_from_post_content(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
-- Present so the schema advisor stays clear, and harmless here: the body calls
-- only pg_catalog builtins, fully qualified.
SET search_path = ''
AS $$
    WITH br AS (
        SELECT pg_catalog.regexp_replace(COALESCE(p_content, ''), '<br\s*/?>', E'\n', 'gi') AS t
    ), closers AS (
        SELECT pg_catalog.regexp_replace(t, '</(p|div|li|h[1-6])>', E'\n', 'gi') AS t FROM br
    ), tags AS (
        SELECT pg_catalog.regexp_replace(t, '<[^>]*>', '', 'g') AS t FROM closers
    ), entities AS (
        SELECT pg_catalog.replace(
                 pg_catalog.replace(
                   pg_catalog.replace(
                     pg_catalog.replace(
                       pg_catalog.replace(
                         pg_catalog.replace(t, '&nbsp;', ' '),
                       '&amp;', '&'),
                     '&lt;', '<'),
                   '&gt;', '>'),
                 '&quot;', '"'),
               '&#39;', '''') AS t
          FROM tags
    )
    SELECT pg_catalog.btrim(
             pg_catalog.regexp_replace(t, E'\n{3,}', E'\n\n', 'g'),
             E' \t\n\r')
      FROM entities;
$$;

REVOKE ALL ON FUNCTION public.plain_text_from_post_content(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plain_text_from_post_content(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.plain_text_from_post_content(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plain_text_from_post_content(text) TO service_role;

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
        -- NORMALIZATION FLAG 0 -- DELIBERATE, AND DELIBERATELY DIFFERENT FROM THE
        -- CHUNKS FUNCTION. Flag 0 ignores document length, so a post's rank is
        -- the evidence it carries and nothing else. Flag 1 divided by
        -- 1 + log(length) and thereby ranked a 29-character title-only post above
        -- two 380-character posts carrying exactly the same terms exactly as
        -- often. Post ranks are never compared with chunk ranks -- the caller
        -- takes top-K per source -- so the length spread between the two corpora,
        -- which is why chunks keep flag 1, does not apply here. See the header.
        pg_catalog.ts_rank(matched.document, q.query, 0) AS rank
      FROM matched, q
     WHERE matched.document @@ q.query
     -- EQUAL EVIDENCE, THEN A BODY BEATS NO BODY. Stated as a policy rather than
     -- arriving as a side effect of a logarithm. It fires only on a tie, so a
     -- title-only post that matches more of the query still wins outright -- and
     -- must, because sometimes the title-only post IS the answer.
     -- padlet_id last, so two runs of the same query agree exactly.
     ORDER BY rank DESC, (matched.text <> '') DESC, matched.padlet_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text and note posts of one board, ranked by evidence alone (ts_rank normalization 0), with posts that have a body ahead of title-only posts at equal rank. p_query is a tsquery expression built by the caller, not a raw user message.';

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

-- The two new chunk vectors go first: they are pure additions, so dropping
-- them can never change a result that the simple vector already produced.
DROP INDEX IF EXISTS public.knowledge_chunks_search_en_gin;
DROP INDEX IF EXISTS public.knowledge_chunks_search_de_gin;
DROP INDEX IF EXISTS public.padlets_search_en_gin;
DROP INDEX IF EXISTS public.padlets_search_de_gin;

-- The padlets index must be REBUILT rather than dropped: its expression and
-- its predicate both changed, so the 20260918160000 version does not serve the
-- restored function body above.
DROP INDEX IF EXISTS public.padlets_search_gin;

CREATE INDEX IF NOT EXISTS padlets_search_gin
    ON public.padlets
    USING gin (pg_catalog.to_tsvector(
        'simple'::regconfig,
        COALESCE(title, '')
        || CASE
               WHEN public.plain_text_from_post_content(content) = '' THEN ''
               ELSE ' ' || public.plain_text_from_post_content(content)
           END))
    WHERE type IN ('text', 'note');

COMMIT;
