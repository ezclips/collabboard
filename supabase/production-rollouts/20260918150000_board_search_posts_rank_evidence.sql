-- PRODUCTION ROLLOUT -- the posts search function ranks by evidence.
--
-- SOURCE: supabase/migrations/20260918150000_board_search_posts_rank_evidence.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * search_board_posts_text moves from ts_rank normalization flag 1 to FLAG 0,
--     so a post's rank is the evidence it carries and not its length. Flag 1
--     ranked a 29-character TITLE-ONLY post above two 380-character posts that
--     matched exactly the same terms exactly as often, and answered the question
--     where the title-only post could not. Measured, on question q02 of the
--     tuning battery;
--   * its ORDER BY gains one tie-break: at equal rank, a post WITH a body sorts
--     before a post without one. Flag 0 makes the three q02 posts tie exactly, so
--     without this the outcome would fall to padlet_id;
--   * search_board_knowledge_chunks_text IS NOT TOUCHED and stays on flag 1. The
--     two ranks are never compared -- the caller takes top-K per source -- and
--     chunks need the length normalization that posts do not.
--
-- WHAT IT IS NOT MEASURED AGAINST. No question in the battery returns more posts
-- than the per-source limit -- the board holds nine text/note posts, but the
-- questions only ever surface four of them and never more than three at once,
-- against a limit of four. So no post is ever dropped by ranking there and the
-- battery's bar cannot tell these two flags apart. The unmeasured risk flag 0
-- carries is a long post that repeats one term many times outranking a short
-- exact answer; no post the battery returns does that. Followups item 7.
--
-- WHY A NEW MIGRATION RATHER THAN AN EDIT. 20260918140000 is released, and this
-- repository does not rewrite released migrations: a database that already ran
-- one would never see the change, and two deployments would silently disagree
-- about what the same filename means.
--
-- IT DOES NOT REQUIRE 20260918130000 OR 20260918140000 TO HAVE BEEN APPLIED.
-- This is a complete function definition rather than a delta, so applying it
-- alone produces the correct end state for this function -- but note that it
-- defines ONLY the posts function, so a database that has never run
-- 20260918130000 still has no chunks function after this.
--
-- IT DOES REQUIRE 20260918120000: the body calls
-- public.plain_text_from_post_content, and without it this file fails with
-- SQLSTATE 42883 and the batch aborts.
--
-- NO INDEX REBUILD. The indexed expression is untouched -- same configuration,
-- same projection, same partial predicate. Only the rank expression and the
-- ORDER BY differ, and neither is indexed.
--
-- WHAT IS NOT CHANGED. The signature, the return shape, the board filter, the
-- type IN ('text','note') predicate that lets the partial index be used, the
-- 1..10 clamp, the empty search_path, the grants, and SECURITY INVOKER.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock and builds no
-- index, so this is fast on any database size.
--
-- SAFE TO RE-RUN. CREATE OR REPLACE with a fixed signature.
--
-- VERIFY WITH:
--   20260918150000_board_search_posts_rank_evidence_verify.sql
-- UNDO WITH (read its header first):
--   20260918150000_board_search_posts_rank_evidence_rollback.sql
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

COMMIT;
