-- ROLLBACK for 20260918170000_board_search_additive_rank.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- THIS IS A REVERT, NOT A DROP. It restores the 20260918160000 bodies exactly:
-- rank as GREATEST(simple, english, german) in both functions. Dropping them
-- would leave the application calling functions that are gone.
--
-- IT TOUCHES NO INDEX. 20260918170000 changed only a rank expression, so there
-- is nothing to rebuild here either, in either direction.
--
-- WHAT YOU ARE CHOOSING BY RUNNING IT. You are restoring the scale mix: a row
-- that matched under `simple` can again be re-ranked by whichever of the three
-- configurations happens to score it higher. That is a MEASURED harm, not a
-- theoretical one -- on q05 it puts the irrelevant chess-openings introduction
-- ahead of the passage that defines Hypermodernism, 0.011075 against 0.009579,
-- reversing an order that was correct before the configurations were added.
--
-- THERE IS NO ERROR WHEN THIS TAKES EFFECT. The same rows come back in a
-- different order. If you run this, note it somewhere a person will read.
--
-- WHEN RUNNING IT IS NEVERTHELESS RIGHT. If the ten added passages are later
-- re-rated and most turn out RELEVANT, then boosting rows that two
-- configurations agree on is defensible and this revert is the way back. As
-- rated today -- nine of ten irrelevant, five of them cross-language collisions
-- -- it is not.
--
-- IT DOES NOT TOUCH THE VECTOR RPC. `search_board_knowledge_chunks` (no
-- `_text`) is the older embedding search, a different function with a different
-- signature. The names are one suffix apart; check twice before editing this.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
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
        -- ONE TERM LIST, THREE QUERIES. The caller sends a single tsquery
        -- EXPRESSION -- `alpha | beta | gamma` -- and each configuration parses
        -- it in its own way. That is the whole of the query-side change: the
        -- application still builds one list of terms.
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    )
    SELECT
        p.id AS padlet_id,
        COALESCE(p.title, '') AS title,
        public.plain_text_from_post_content(p.content) AS text,
        -- GREATEST OF THE THREE. A row that matches under two configurations is
        -- ranked by whichever saw it best, and a row that matches under one is
        -- ranked by that one. Flag 0 on posts, unchanged: a post's rank is the
        -- evidence it carries, not its length. See 20260918150000.
        GREATEST(
            pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_simple, 0),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_english, 0),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                q.q_german, 0)
        ) AS rank
      FROM public.padlets AS p, q
     WHERE p.board_id = p_board_id
       -- Written out so the planner can prove it implies the partial indexes.
       -- `card` joins `text` and `note` per R2's fixture; see the header.
       AND p.type IN ('text', 'note', 'card')
       -- THE EXPRESSIONS ARE REPEATED VERBATIM FROM THE INDEX DEFINITIONS, and
       -- they are inline against the base table rather than hidden behind a CTE
       -- for one reason: the planner matches an expression index by comparing
       -- parse trees against the qual. A tidier formulation that the planner
       -- cannot match would turn every search into a sequential scan running the
       -- projection over every post on the board, and the only symptom is
       -- latency.
       AND (pg_catalog.to_tsvector('simple'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_german)
     -- Equal evidence, then a body beats no body, then the id. Unchanged from
     -- 20260918150000; the tie-break is why flag 0 is safe here.
     ORDER BY rank DESC, (public.plain_text_from_post_content(p.content) <> '') DESC, p.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text, note and card posts of one board under three configurations (simple, english, german), ranked by the greatest of the three with evidence-only normalization and a body-over-title-only tie-break. p_query is a tsquery expression built by the caller, not a raw user message.';

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
        -- Flag 1 on chunks, unchanged and deliberately different from posts:
        -- chunk lengths span two orders of magnitude, so length normalization
        -- is load-bearing here and harmful there. The two ranks are never
        -- compared -- the caller takes top-K per source.
        GREATEST(
            pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text),  q.q_simple, 1),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig, c.text), q.q_english, 1),
            pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig, c.text),  q.q_german, 1)
        ) AS rank
      FROM public.knowledge_chunks AS c
      JOIN public.knowledge_documents AS d ON d.id = c.document_id
      CROSS JOIN q
     WHERE d.board_id = p_board_id
       -- Only a finished document has persisted text. Matching an in-flight one
       -- would cite a page that may still change.
       AND d.processing_status = 'ready'
       AND (pg_catalog.to_tsvector('simple'::regconfig, c.text)  @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig, c.text) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig, c.text)  @@ q.q_german)
     ORDER BY rank DESC, c.chunk_index ASC, c.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text IS
    'Full-text search the PDF chunks of one board under three configurations (simple, english, german), ranked by the greatest of the three with length normalization. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
