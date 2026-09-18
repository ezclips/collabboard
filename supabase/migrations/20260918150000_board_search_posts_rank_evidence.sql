-- BOARD_SEARCH_READ_3: the POSTS function ranks by evidence, and says out loud
-- that a body beats no body.
--
-- ------------------------------------------------------------------------
-- WHAT CHANGES, AND ONLY THIS.
-- ------------------------------------------------------------------------
--   * search_board_posts_text moves from ts_rank normalization flag 1 to FLAG 0.
--   * its ORDER BY gains ONE tie-break, ahead of the existing id tie-break:
--     a post WITH a body sorts before a post with none.
--
-- search_board_knowledge_chunks_text IS NOT TOUCHED. It stays on flag 1, it is
-- not restated here, and that asymmetry is the decision rather than an oversight
-- -- see "WHY THE TWO FUNCTIONS MAY DIFFER" below.
--
-- ------------------------------------------------------------------------
-- WHY: THE MEASURED DEFECT.
-- ------------------------------------------------------------------------
-- q02 of the tuning battery -- "How do I remove the bumper on an Audi A2 to
-- change the horn?" -- returned a TITLE-ONLY post, "Audi A2 Stoßstange Titel
-- bild", ahead of the two posts that actually answer it. Measured through the
-- real query builder into these functions:
--
--   title-only post   29 ranked characters   2 distinct terms, 2 occurrences
--   answering post   380 ranked characters   2 distinct terms, 2 occurrences
--   answering post   445 ranked characters   2 distinct terms, 2 occurrences
--
-- THE EVIDENCE IS IDENTICAL. The same number of query terms, the same number of
-- times. Nothing separates these three passages except LENGTH, and flag 1
-- divides by 1 + log(length), so the 29-character one won by 2.33x.
--
-- That was checked against the alternatives rather than assumed. A coverage-first
-- ordering was scored against the same 36 human ratings and fixes 0 of 4 inverted
-- pairs -- here it cannot even see the difference, because coverage is 2 on all
-- three. Raising the title's weight with setweight makes it strictly worse: the
-- title-only post's ONLY signal is its title.
--
-- ------------------------------------------------------------------------
-- WHY FLAG 0, WHICH 20260918140000 REJECTED.
-- ------------------------------------------------------------------------
-- 20260918140000's argument against flag 0 was that a note reading exactly "Iran
-- oil headlines" would lose to a six-thousand-character chunk mentioning oil
-- eight times. THAT COMPARISON NEVER HAPPENS. The caller takes top-K from each
-- source INDEPENDENTLY and concatenates -- mergeBoardAiSearchPassages in
-- lib/domain/ai/boardAiSearchContext.ts, which exists precisely because a post
-- rank and a chunk rank are different scales. A post is never ranked against a
-- chunk anywhere in this system, so the length spread between the two corpora
-- cannot decide anything. The argument was sound about the corpus and irrelevant
-- to the function it was applied to.
--
-- WITHIN POSTS, flag 0 means: rank counts the evidence -- which terms matched,
-- how often -- and stops there. Two posts carrying the same evidence get the same
-- rank, whatever their length. That is what makes q02's three posts tie exactly
-- at 0.0202642 under flag 0, measured, not predicted.
--
-- ------------------------------------------------------------------------
-- A TIE IS NOT A FIX. THE TIE-BREAK IS THE FIX.
-- ------------------------------------------------------------------------
-- Flag 0 alone leaves q02 decided by padlet_id -- deterministic, and arbitrary.
-- So the preference is stated where a reader can see it and argue with it:
--
--     ORDER BY rank DESC, (matched.text <> '') DESC, matched.padlet_id ASC
--
-- A POST WITH A BODY OUTRANKS A POST WITHOUT ONE, WHEN THE EVIDENCE IS EQUAL.
-- Not because short is bad -- it is because a title-only post has already told
-- the reader everything it contains by matching, while a post with a body may
-- contain the procedure that was asked for. Under flag 1 this preference existed
-- too, inverted, and arrived as a side effect of a logarithm nobody read as a
-- policy.
--
-- IT IS A TIE-BREAK AND NOTHING MORE. It fires only at equal rank, so a
-- title-only post that matches MORE of the query still wins outright -- which is
-- q03 of the same battery, "What does the Trump note post say?", where the
-- title-only post IS the answer. It matches 3 of 3 terms where nothing else
-- matches more than one, ranks 0.0607927 against ties at 0.0202642, and this
-- tie-break never fires on it. A change that fixed q02 by demoting title-only
-- posts in general would have broken q03 and would not have been a fix.
--
-- ------------------------------------------------------------------------
-- WHY THE TWO FUNCTIONS MAY DIFFER.
-- ------------------------------------------------------------------------
-- Because their ranks are never compared. Chunks keep flag 1 on live evidence
-- that they need it: an unnormalized chunk rank let long chunks win by length,
-- and under flag 0 the measured q02 rank of the answering page-6 chunk (0.0101321)
-- TIES a bicycle-maintenance chunk that has nothing to do with the question.
-- Flag 0 is right where documents are short and evenly sized and wrong where they
-- are not; posts are the first and chunks are the second. One flag was never
-- going to serve both, and nothing in the design requires it to.
--
-- ------------------------------------------------------------------------
-- WHAT THIS IS NOT MEASURED AGAINST, STATED PLAINLY.
-- ------------------------------------------------------------------------
-- NO QUESTION IN THE BATTERY RETURNS MORE POSTS THAN THE PER-SOURCE LIMIT. The
-- board holds NINE text/note posts, but the battery's eleven questions only ever
-- surface FOUR distinct ones, and never more than three at once -- against a
-- limit of four. A ranking change can only lose a passage by pushing it past
-- that limit or past the character budget, and neither is ever reached. So the
-- bar the battery enforces -- never drop a human-judged relevant passage --
-- CANNOT DISCRIMINATE BETWEEN THESE TWO FLAGS. It is passed, vacuously.
--
-- FIVE OF THE NINE POSTS ARE NEVER RETURNED BY ANY QUESTION, which is the sharper
-- version of the same point: the corpus is not small, the QUESTIONS are narrow.
--
-- The specific risk flag 0 carries within posts is therefore UNMEASURED: a long
-- rambling post that repeats one query term eight times accumulates rank, and
-- will outrank a short exact answer that mentions it once. No post the battery
-- returns does that. On a real board with long posts it is the expected failure
-- mode, and the instrument that would catch it is a battery whose questions
-- actually exercise the posts corpus, which is followups item 7.
--
-- ------------------------------------------------------------------------
-- NO INDEX REBUILD. The indexed expression is untouched: same 'simple'
-- configuration, same title-then-body projection, same partial predicate. Only
-- the rank expression and the ORDER BY differ, and neither is indexed.
--
-- WHY A NEW MIGRATION AND NOT AN EDIT. 20260918140000 is released. This
-- repository does not rewrite released migrations. CREATE OR REPLACE with an
-- unchanged signature converges from either state.
--
-- LOCKS. None. CREATE OR REPLACE FUNCTION takes no table lock and builds no index.
--
-- SAFE TO RE-RUN. CREATE OR REPLACE with a fixed signature.
--
-- REQUIRES 20260918120000 (public.plain_text_from_post_content). It does NOT
-- require either function migration to have run first: this is a complete
-- definition, not a delta.
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
