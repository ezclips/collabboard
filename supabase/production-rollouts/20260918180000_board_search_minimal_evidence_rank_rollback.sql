-- ROLLBACK for 20260918180000_board_search_minimal_evidence_rank.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- THIS IS A REVERT, NOT A DROP. It restores the 20260918170000 additive bodies
-- exactly. It touches no index, in either direction.
--
-- WHAT YOU ARE CHOOSING BY RUNNING IT, AND IT IS NOT A SAFE STATE. The additive
-- rank is ITSELF DISQUALIFIED: it drops q07's rated-relevant TENS page 2 out of
-- the top-K, because that row matches one term under `simple` and two under
-- english and german, and additive ranks it by its weakest view. Running this
-- does not return to a correct expression -- there is no correct earlier
-- expression. `simple` alone never admitted the row, GREATEST admitted it but
-- cost a rated inversion on q05, and additive drops it.
--
-- SO RUN THIS ONLY TO UNDO A PROBLEM THIS FILE INTRODUCED -- most plausibly a
-- PLAN regression. 20260918180000 adds LATERAL joins, and if EXPLAIN shows the
-- bitmap index scans are no longer used, searches get slow with no other
-- symptom. That is the case this rollback exists for, and the right follow-up is
-- to restructure the laterals, not to stay here.
--
-- THERE IS NO ERROR WHEN THIS TAKES EFFECT. The same rows come back in a
-- different order, minus q07's page. Note it somewhere a person will read.
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
        SELECT pg_catalog.to_tsquery('simple'::regconfig, p_query)  AS q_simple,
               pg_catalog.to_tsquery('english'::regconfig, p_query) AS q_english,
               pg_catalog.to_tsquery('german'::regconfig, p_query)  AS q_german
         WHERE pg_catalog.btrim(COALESCE(p_query, '')) <> ''
    )
    SELECT
        p.id AS padlet_id,
        COALESCE(p.title, '') AS title,
        public.plain_text_from_post_content(p.content) AS text,
        -- ADDITIVE, NOT MAXIMUM. If `simple` matched this row, `simple` ranks
        -- it -- the added configurations do not get to re-rank a row they did
        -- not add. Only a row admitted SOLELY by english or german is ranked by
        -- the better of those two. Flag 0 throughout: a post's rank is the
        -- evidence it carries, not its length (20260918150000).
        CASE WHEN pg_catalog.to_tsvector('simple'::regconfig,
                    COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_simple
             THEN pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
                    COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                    q.q_simple, 0)
             ELSE GREATEST(
                    pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig,
                        COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                        q.q_english, 0),
                    pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig,
                        COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)),
                        q.q_german, 0))
        END AS rank
      FROM public.padlets AS p, q
     WHERE p.board_id = p_board_id
       -- Written out so the planner can prove it implies the partial indexes.
       AND p.type IN ('text', 'note', 'card')
       -- MATCHING IS UNCHANGED. Every row the three configurations admit is
       -- still returned; only the rank expression above differs.
       AND (pg_catalog.to_tsvector('simple'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig,
                COALESCE(p.title, '') || ' ' || public.plain_text_from_post_content(p.content)) @@ q.q_german)
     ORDER BY rank DESC, (public.plain_text_from_post_content(p.content) <> '') DESC, p.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_posts_text IS
    'Full-text search the text, note and card posts of one board under three configurations (simple, english, german). A row that matches simple is ranked by simple; only rows admitted solely by english or german are ranked by the better of those two. Evidence-only normalization, with a body-over-title-only tie-break. p_query is a tsquery expression built by the caller, not a raw user message.';

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
        -- ADDITIVE, for the same reason and with the same shape as above. This
        -- is the half that q05 proved: both of its passages matched under
        -- `simple`, so both are ranked by `simple` again and the answer leads
        -- once more. Flag 1 throughout: chunk lengths span two orders of
        -- magnitude, so length normalization is load-bearing here.
        CASE WHEN pg_catalog.to_tsvector('simple'::regconfig, c.text) @@ q.q_simple
             THEN pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, c.text), q.q_simple, 1)
             ELSE GREATEST(
                    pg_catalog.ts_rank(pg_catalog.to_tsvector('english'::regconfig, c.text), q.q_english, 1),
                    pg_catalog.ts_rank(pg_catalog.to_tsvector('german'::regconfig, c.text),  q.q_german, 1))
        END AS rank
      FROM public.knowledge_chunks AS c
      JOIN public.knowledge_documents AS d ON d.id = c.document_id
      CROSS JOIN q
     WHERE d.board_id = p_board_id
       AND d.processing_status = 'ready'
       AND (pg_catalog.to_tsvector('simple'::regconfig, c.text)  @@ q.q_simple
         OR pg_catalog.to_tsvector('english'::regconfig, c.text) @@ q.q_english
         OR pg_catalog.to_tsvector('german'::regconfig, c.text)  @@ q.q_german)
     ORDER BY rank DESC, c.chunk_index ASC, c.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 10);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text IS
    'Full-text search the PDF chunks of one board under three configurations (simple, english, german). A chunk that matches simple is ranked by simple; only chunks admitted solely by english or german are ranked by the better of those two. Length normalization throughout. p_query is a tsquery expression built by the caller, not a raw user message.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer)
    TO service_role;

COMMIT;
