-- PRODUCTION ROLLOUT -- three text-search configurations, and the batched index
-- changes that were waiting for a rebuild.
--
-- SOURCE: supabase/migrations/20260918160000_board_search_language_vectors.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * DESIGN C, PARALLEL VECTORS. Every searchable row is indexed under
--     `simple`, `english` AND `german`; a query is parsed under all three and
--     matched against all three; rank is the GREATEST of the three. `simple` is
--     retained unchanged, so NO MATCH THAT EXISTS TODAY CAN DISAPPEAR -- the two
--     new vectors can only add rows. Measured gain: q10's answering chunk goes
--     from 0.00778 to 0.01413 under `german`, widening its lead from 1.10x to
--     1.29x, and ß/ss fold together so `Stossstange` and `Stoßstange` both land;
--   * R2's TYPE WIDENING adds `card` and REJECTS `comment` -- whose `content` is
--     a rendered thread summary with truncation markers, not prose;
--   * the <br> regex moves to E'' form, removing a dependency on
--     standard_conforming_strings with no behaviour change;
--   * the padlets index expression stops evaluating the projection TWICE per row
--     per write. The tokens are identical; it is three times less work.
--
-- WHAT THIS DOES NOT FIX, so a green run is not over-read: q08 does not flip.
-- Under `english` the answering paragraph finally matches (`ribbed` and
-- `Ribbing` both stem to `rib`) and the gap narrows from 3.07x to 1.35x, but the
-- introduction still leads. And the `will` collision is NOT recovered -- the
-- German dictionary carries `will` in its own stopword list, so no vector holds
-- it and only a query-side policy could.
--
-- TITLE WEIGHTS ARE NOT IN THIS BATCH. They turned out not to need the index at
-- all: `@@` can match the indexed unweighted vector while ts_rank is handed a
-- setweight-ed one built for the few rows that matched. They are therefore a
-- function-body change with no rebuild, and are scored before adoption by
-- scripts/db/boardSearchTitleWeightVariants.sql.
--
-- LOCKS -- READ THIS BEFORE RUNNING ON A LARGE DATABASE. CREATE INDEX holds a
-- lock that blocks writes on padlets and knowledge_chunks for the duration of
-- each build. At this database's size (2,126 padlets, 86 chunks) that is
-- seconds. If that is not true where you are running it, convert the five index
-- statements to CREATE INDEX CONCURRENTLY and run them OUTSIDE the transaction
-- -- they are the last statements in the file and are individually re-runnable
-- for exactly that reason. CONCURRENTLY cannot run inside BEGIN/COMMIT.
--
-- THE PADLETS INDEX IS DROPPED AND REBUILT because its expression changed (the
-- double evaluation, and the widened predicate). Between the DROP and the
-- CREATE, inside this transaction, no padlets search can use an index; the
-- transaction holds the lock throughout, so no query runs in that window.
--
-- IT REQUIRES 20260918120000 for public.plain_text_from_post_content. It does
-- not require 20260918130000/140000/150000 to have been applied: both functions
-- are complete definitions rather than deltas.
--
-- SAFE TO RE-RUN. Every index is IF NOT EXISTS after an explicit DROP of the one
-- expression that changed; every function is CREATE OR REPLACE.
--
-- VERIFY WITH:
--   20260918160000_board_search_language_vectors_verify.sql
-- UNDO WITH (read its header first):
--   20260918160000_board_search_language_vectors_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- ------------------------------------------------------------------------
-- (c) The projection, with the E'' regex. Nothing else in it changes.
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plain_text_from_post_content(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    WITH br AS (
        -- E'' FORM, DELIBERATE. The plain-string form '<br\s*/?>' means literal
        -- backslash-s only while standard_conforming_strings is on. With it off
        -- the pattern degrades to <brs*/?> and silently stops matching anything.
        SELECT pg_catalog.regexp_replace(COALESCE(p_content, ''), E'<br\\s*/?>', E'\n', 'gi') AS t
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

-- ------------------------------------------------------------------------
-- The posts search, across three configurations.
-- ------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------
-- The chunk search, across three configurations.
-- ------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------
-- THE INDEXES. Six, and the padlets expression changed, so the old one goes.
-- ------------------------------------------------------------------------
-- The chunks `simple` index is UNCHANGED in expression, so it is left in place
-- rather than dropped and rebuilt for nothing.
DROP INDEX IF EXISTS public.padlets_search_gin;

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_en_gin
    ON public.knowledge_chunks
    USING gin (pg_catalog.to_tsvector('english'::regconfig, text));

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_de_gin
    ON public.knowledge_chunks
    USING gin (pg_catalog.to_tsvector('german'::regconfig, text));

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

COMMIT;
