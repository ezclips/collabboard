-- BOARD_SEARCH_READ_5: the added configurations stop re-ranking rows they did
-- not add.
--
-- ------------------------------------------------------------------------
-- WHAT CHANGES: THE RANK EXPRESSION IN BOTH FUNCTIONS. NOTHING ELSE.
-- ------------------------------------------------------------------------
--   was:  GREATEST(rank_simple, rank_english, rank_german)
--   now:  CASE WHEN the row matches under `simple`
--              THEN rank_simple
--              ELSE GREATEST(rank_english, rank_german) END
--
-- MATCHING IS UNTOUCHED -- still the three-way OR -- so EVERY ROW THE THREE
-- CONFIGURATIONS ADMIT IS STILL RETURNED. No index changes, no rebuild, no lock.
--
-- ------------------------------------------------------------------------
-- WHY: GREATEST BROKE DESIGN C's OWN PROMISE, ON MEASURED EVIDENCE.
-- ------------------------------------------------------------------------
-- C was adopted on one property: `simple` is retained, so the new vectors can
-- only ADD rows -- "strictly more, never differently". GREATEST quietly voided
-- the second half. A row that already matched under `simple` could be handed a
-- HIGHER rank because `english` or `german` happened to score it better, which
-- reorders rows the new configurations did not add.
--
-- IT COST A RATED INVERSION. On q05 -- "What is hypermodernism in chess
-- openings?" -- the irrelevant chess-openings INTRO now leads the relevant
-- passage that defines Hypermodernism, 0.011075 against 0.009579. Before C the
-- answer led, 0.006487 against 0.006154. Both passages matched under `simple`
-- both times, and chunks never touch the HTML projection, so this is PURELY the
-- scale mix: two ranks from two different configurations compared as if they
-- were one quantity.
--
-- AND IT BOUGHT NOTHING. Across the battery the rank boosts GREATEST handed out
-- changed no decision toward correctness. One rated inversion against zero
-- measured gain is not a trade worth keeping.
--
-- ------------------------------------------------------------------------
-- WHAT THE TEN NEW PASSAGES TURNED OUT TO BE -- rated before this was decided.
-- ------------------------------------------------------------------------
-- The three configurations grew the result set on 6 of 11 questions. NINE OF THE
-- TEN ADDITIONS ARE IRRELEVANT, and most are cross-language collisions:
--
--   `bumper` -> de `bump`   an Audi question matches a knitting page's
--                           "horizontal bump" (the German stemmer treats the
--                           English -er as a German suffix)
--   `note`   -> de `not`    a question about a note post matches every English
--                           "not" in a TENS device manual
--   `linked` -> en `link`   a question about a linked website matches the German
--   "links"  -> de `link`   word for "left" in a car-repair post -- and arrives
--                           as the TOP of the block at 0.018998
--   `fix`    -> en `fix`    matches "5 fixed stimulation gears", which makes
--                           q06 -- THE CONTROL QUESTION, whose whole purpose is
--                           to return nothing -- no longer empty
--   `year`   -> en `year`   matches "In recent years" in the same manual
--
-- THE ONE GENUINE GAIN is q07: `stimulator` matches "stimulators" under
-- `english`, surfacing a passage that does state what the device is for. That
-- is the recall design C was built for, and it survives this change untouched --
-- the passage is admitted solely by `english`, so it keeps its `english` rank.
--
-- ------------------------------------------------------------------------
-- WHAT THIS DOES **NOT** FIX, AND THE NUMBER THAT PROVES IT.
-- ------------------------------------------------------------------------
-- A row admitted SOLELY by `english` or `german` still enters at that
-- configuration's scale, and nothing holds it below rows that matched `simple`.
-- q09's Audi post is exactly that row: admitted only by the `linked`/"links"
-- collision, ranked 0.018998, and STILL THE TOP OF THE BLOCK after this change.
--
-- So this migration fixes the reordering of PRE-EXISTING rows and leaves the
-- placement of NEW ones open. The stronger rule -- sort every solely-added row
-- below every `simple`-matched row, making the additions strictly a tail -- is
-- NOT taken here: it is a bigger claim, it would have to be scored, and with 9
-- of 10 additions rated irrelevant the question worth asking first is whether
-- the two stemming vectors should be constrained at all rather than merely
-- re-ordered. That is a decision, not a cleanup.
--
-- ------------------------------------------------------------------------
-- UNCHANGED, AND CHECKED: the signatures, the return shapes, the three-way
-- match, the widened type predicate, the posts/chunks flag asymmetry (0 and 1),
-- the body-over-title-only tie-break, the empty search_path, SECURITY INVOKER
-- and the grants.
--
-- NO INDEX WORK. No expression that is indexed appears in this file's diff, so
-- nothing is rebuilt and nothing is locked.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock.
--
-- SAFE TO RE-RUN. Both are CREATE OR REPLACE with fixed signatures.
--
-- REQUIRES 20260918120000 (the projection) and the six indexes from
-- 20260918160000 for speed -- though not for correctness: without them these
-- functions return the same rows by sequential scan.
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
