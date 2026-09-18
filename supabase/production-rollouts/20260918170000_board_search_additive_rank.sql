-- PRODUCTION ROLLOUT -- the added configurations stop re-ranking rows they did
-- not add.
--
-- SOURCE: supabase/migrations/20260918170000_board_search_additive_rank.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * GREATEST(simple, english, german) let a configuration re-rank a row it did
--     not add, which voided the promise design C was adopted on -- "strictly
--     more, never differently". It cost a RATED INVERSION on q05, where the
--     irrelevant chess-openings intro now leads the passage that defines
--     Hypermodernism (0.011075 against 0.009579; before C the answer led,
--     0.006487 against 0.006154). Both passages matched under `simple` both
--     times, so this is purely the scale mix;
--   * the rank becomes: a row that matches `simple` is ranked by `simple`; only
--     a row admitted SOLELY by english or german is ranked by the better of
--     those two;
--   * MATCHING IS UNTOUCHED. Every row the three configurations admit is still
--     returned, including the one genuine recall gain (q07, where `stimulator`
--     matches "stimulators" under english).
--
-- WHY THIS IS SAFE TO APPLY QUICKLY: NO INDEX WORK. Nothing indexed appears in
-- the diff, so nothing is rebuilt, nothing is locked, and the six indexes from
-- 20260918160000 continue to serve the unchanged match predicate.
--
-- WHAT IT DOES NOT FIX, so a green run is not over-read: a row admitted solely
-- by english or german still enters at that configuration's scale and nothing
-- holds it below the `simple`-matched rows. q09's Audi post -- admitted only by
-- a `linked`/"links" cross-language collision, rated irrelevant -- is still the
-- top of its block at 0.018998.
--
-- IT REQUIRES 20260918120000 for public.plain_text_from_post_content. It does
-- not require any of 20260918130000/140000/150000/160000 to have been applied:
-- both functions are complete definitions rather than deltas. It does assume the
-- six indexes exist for SPEED, not for correctness.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock and builds no
-- index.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- VERIFY WITH:
--   20260918170000_board_search_additive_rank_verify.sql
-- UNDO WITH (read its header first):
--   20260918170000_board_search_additive_rank_rollback.sql
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
