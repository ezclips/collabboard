-- ROLLBACK for 20260918150000_board_search_posts_rank_evidence.sql.
--
-- READ THIS BEFORE RUNNING IT.
--
-- THIS IS A REVERT, NOT A DROP. 20260918150000 REPLACED a function that already
-- existed; dropping it would leave the application calling a function that is
-- gone, which is a harder failure than the one being undone. So this restores the
-- 20260918140000 posts body exactly -- ts_rank normalization flag 1, and no
-- body-over-title-only tie-break.
--
-- IT TOUCHES ONLY THE POSTS FUNCTION. search_board_knowledge_chunks_text was
-- never changed by 20260918150000 and is not restated here. It stays on flag 1
-- either way.
--
-- WHAT YOU ARE CHOOSING BY RUNNING IT. You are restoring length normalization on
-- posts, which is the defect that was measured: on question q02 of the tuning
-- battery a TITLE-ONLY post -- 29 ranked characters, no body at all -- outranked
-- by 2.33x the two posts that answer the question, which matched exactly the same
-- terms exactly as often and differ only by being 380 and 445 characters long.
-- Flag 1 divides by 1 + log(length), so it rewards the passage with the least to
-- say whenever the evidence is equal.
--
-- THERE IS NO ERROR WHEN THIS TAKES EFFECT. Every query still succeeds, every row
-- still comes back, the counts in the chip are unchanged; only the ORDER changes,
-- and it changes toward the answer being read last or dropped first when the
-- budget is tight. If you run this, note it somewhere a person will read -- the
-- symptom is "board search puts the empty post on top", which nobody traces to a
-- rollback.
--
-- WHEN RUNNING IT IS NEVERTHELESS RIGHT. Flag 0 carries an unmeasured risk in the
-- other direction: it ignores length entirely, so a long post that repeats one
-- query term many times accumulates rank and can outrank a short exact answer.
-- The tuning battery cannot see that -- no question it asks returns more posts
-- than the per-source limit, so ranking never decides anything there -- so it is
-- a real possibility rather than a ruled-out one. If a real board shows
-- long rambling posts crowding out short exact ones, this file is the way back
-- while the proper instrument -- a battery with a posts corpus, followups item 7
-- -- is built.
--
-- IF YOU ARE ROLLING BACK THE WHOLE FEATURE, do not run this file: run
-- 20260918130000_board_search_text_functions_rollback.sql, which drops both
-- functions outright. This file reverts one ranking decision and leaves search in
-- place.
--
-- NO DATA IS LOST either way. The function is a pure read over existing tables;
-- nothing here stores anything, so there is nothing to restore. NO INDEX IS
-- AFFECTED: the indexed expression was never part of the change.
--
-- THE SIGNATURE IS UNCHANGED, so the grants survive CREATE OR REPLACE and are
-- restated below only to keep this file a complete definition of the state it
-- produces.
--
-- IT DOES NOT TOUCH THE VECTOR RPC. `search_board_knowledge_chunks` (no `_text`)
-- is the older embedding search, a different function with a different
-- signature. The names are one suffix apart; check twice before editing this.
--
-- SAFE TO RE-RUN. CREATE OR REPLACE with a fixed signature.
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

COMMIT;
