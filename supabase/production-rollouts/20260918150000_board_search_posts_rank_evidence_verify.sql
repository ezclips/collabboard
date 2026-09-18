-- Read-only verification for 20260918150000_board_search_posts_rank_evidence.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog, inspects function
-- bodies as text, and calls the function against a board id that cannot exist.
-- Runs unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT IS SAFE IN WHICH STATE, as with the verify files before it:
--
--   * THE INVARIANTS QUERY is safe in EVERY state. It reads pg_catalog only and
--     names no function that might be absent, so a missing one reports as
--     '(absent)' with pass = f rather than failing.
--   * THE SMOKE QUERY CALLS THE FUNCTION BY NAME, so it requires it. On a
--     database without it the batch aborts with SQLSTATE 42883; rows 1 and 2 of
--     the invariants are the early warning.
--
-- THE CENTRAL CHECKS ARE ROWS 3, 4 AND 5, AND THEY ARE SOURCE ASSERTIONS. No
-- catalog column records a normalization flag or an ORDER BY, so the only place
-- those answers exist is the function body, read back with pg_get_functiondef.
-- That is a weaker instrument than a catalog flag and it is the right one here:
-- the alternative is not verifying the change at all.
--
-- WHY IT MATTERS ENOUGH TO CHECK THIS WAY. Every variant of this function
-- compiles, runs, and returns the same rows. They differ ONLY in order. A
-- rollback, a partial apply, or a later edit would be completely silent: no
-- error, no missing row, just the title-only post back on top of the two posts
-- that answer the question. These rows are the only alarm.
--
-- ROW 5 IS THE ASYMMETRY, AND IT IS DELIBERATE. The chunks function must still be
-- on flag 1 while the posts function is on flag 0. The two ranks are never
-- compared -- the caller takes top-K from each source independently -- and chunks
-- need the length normalization that posts do not. A future reader "tidying" the
-- two to match would undo one of the two decisions without noticing; this row
-- fails when they do.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row below
-- and `rollout_readiness` is `bool_and(pass)` over that same list as a window,
-- repeated on every row. Scan for `pass = f`, or read readiness from any row.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean the posts ranking is GOOD, only that the flag and the
--     tie-break that were chosen are the ones in force. Whether flag 0 orders a
--     real posts corpus sensibly is a live question against real data -- and one
--     the tuning battery cannot answer, because no question it asks returns more
--     posts than the per-source limit.
--   * It does not mean the planner uses the index. That needs EXPLAIN against
--     real rows. Row 9 proves the predicate that makes it possible survived.
--   * It does not re-verify what the two verifiers before it cover. Run those
--     too; this file checks the delta plus what a careless CREATE OR REPLACE
--     could have dropped along with it.

BEGIN TRANSACTION READ ONLY;

WITH fns AS (
    SELECT p.proname,
           p.oid,
           p.prosecdef,
           p.proacl,
           pg_get_functiondef(p.oid) AS definition,
           p.proconfig
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('search_board_posts_text', 'search_board_knowledge_chunks_text')
),
fn_grants AS (
    SELECT fns.proname, COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM fns, aclexplode(fns.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
posts AS (SELECT * FROM fns WHERE proname = 'search_board_posts_text'),
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'search_board_posts_text exists'::text AS check_name,
           COALESCE((SELECT 'present' FROM posts), '(absent)') AS actual,
           EXISTS (SELECT 1 FROM posts) AS pass
    UNION ALL SELECT 2, 'function', 'search_board_knowledge_chunks_text still exists',
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
    -- THE CHANGE ITSELF, PART ONE. Flag 0: rank is the evidence, not the length.
    UNION ALL SELECT 3, 'ranking', 'posts pass normalization flag 0 to ts_rank',
           COALESCE((SELECT CASE
                         WHEN definition LIKE '%ts_rank(matched.document, q.query, 0)%' THEN 'flag 0'
                         WHEN definition LIKE '%ts_rank(matched.document, q.query, 1)%' THEN 'FLAG 1 (not reverted)'
                         WHEN definition LIKE '%ts_rank(%' THEN 'SOME OTHER ts_rank CALL'
                         ELSE 'no ts_rank found' END
                       FROM posts), '(absent)'),
           COALESCE((SELECT definition LIKE '%ts_rank(matched.document, q.query, 0)%' FROM posts), false)
    -- PART TWO, and without it flag 0 leaves q02 decided by padlet_id. The
    -- preference has to be stated, not inferred from a logarithm.
    UNION ALL SELECT 4, 'ranking', 'posts ORDER BY carries the body-over-title-only tie-break',
           COALESCE((SELECT CASE
                         WHEN definition LIKE '%ORDER BY rank DESC, (matched.text <> ''''::text) DESC, matched.padlet_id ASC%'
                           OR definition LIKE '%ORDER BY rank DESC, (matched.text <> '''') DESC, matched.padlet_id ASC%'
                           THEN 'present'
                         WHEN definition LIKE '%ORDER BY rank DESC%' THEN 'ORDER BY PRESENT, TIE-BREAK MISSING'
                         ELSE 'no ORDER BY found' END
                       FROM posts), '(absent)'),
           COALESCE((SELECT definition LIKE '%ORDER BY rank DESC, (matched.text <> ''''::text) DESC, matched.padlet_id ASC%'
                          OR definition LIKE '%ORDER BY rank DESC, (matched.text <> '''') DESC, matched.padlet_id ASC%'
                       FROM posts), false)
    -- THE ASYMMETRY. Chunks stay on flag 1; see the header for why this is a
    -- decision and not a leftover.
    UNION ALL SELECT 5, 'ranking', 'chunks are STILL on flag 1 -- the two must differ',
           COALESCE((SELECT CASE
                         WHEN definition LIKE '%, 1) AS rank%' THEN 'flag 1'
                         WHEN definition LIKE '%, 0) AS rank%' THEN 'FLAG 0 -- chunks were changed too'
                         ELSE 'no flagged ts_rank found' END
                       FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%, 1) AS rank%'
                       FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), false)
    -- Everything below is what a careless CREATE OR REPLACE could have dropped.
    UNION ALL SELECT 6, 'hardening', 'posts still set an EMPTY search_path',
           COALESCE((SELECT COALESCE(array_to_string(proconfig, ','), '(none)') FROM posts), '(absent)'),
           -- BOTH SPELLINGS, because proconfig stores what was parsed rather
           -- than what was typed: `SET search_path = ''` comes back as
           -- search_path="" on a live database, and as search_path= elsewhere.
           COALESCE((SELECT EXISTS (
                SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY['(none)'])) AS setting
                 WHERE setting IN ('search_path=', 'search_path=""')) FROM posts), false)
    UNION ALL SELECT 7, 'authorization', 'posts are still SECURITY INVOKER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END FROM posts), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM posts), false)
    UNION ALL SELECT 8, 'authorization', 'PUBLIC, anon and authenticated still hold no EXECUTE on posts',
           COALESCE((SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee) FROM fn_grants
                      WHERE proname = 'search_board_posts_text'
                        AND grantee IN ('PUBLIC', 'anon', 'authenticated')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants
                        WHERE proname = 'search_board_posts_text'
                          AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    -- A search nothing may execute fails closed, and silently.
    UNION ALL SELECT 9, 'authorization', 'service_role may still execute posts',
           COALESCE((SELECT 'granted' FROM fn_grants
                      WHERE proname = 'search_board_posts_text' AND grantee = 'service_role' LIMIT 1), '(none)'),
           EXISTS (SELECT 1 FROM fn_grants
                    WHERE proname = 'search_board_posts_text' AND grantee = 'service_role')
    -- Without this predicate in the body, padlets_search_gin cannot be used and
    -- the only symptom is latency.
    UNION ALL SELECT 10, 'index', 'the posts body still carries the partial index predicate',
           COALESCE((SELECT CASE WHEN definition LIKE '%type IN (''text'', ''note'')%'
                                 THEN 'present' ELSE 'MISSING' END FROM posts), '(absent)'),
           COALESCE((SELECT definition LIKE '%type IN (''text'', ''note'')%' FROM posts), false)
    -- The indexed EXPRESSION is what this change must not have touched: same
    -- configuration, same title-then-body projection. If either moved, the index
    -- stops matching and a rebuild is owed after all.
    UNION ALL SELECT 11, 'index', 'the posts body still uses the literal simple configuration',
           COALESCE((SELECT CASE WHEN definition LIKE '%''simple''::regconfig%'
                                 THEN 'literal' ELSE 'NOT LITERAL' END FROM posts), '(absent)'),
           COALESCE((SELECT definition LIKE '%''simple''::regconfig%' FROM posts), false)
    UNION ALL SELECT 12, 'dependency', 'plain_text_from_post_content still exists',
           COALESCE((SELECT 'present' FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content'), '(absent)'),
           EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content')
)
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY, on a board id that cannot exist.
--
-- Every count must be 0, and the point is that it must be 0 WITHOUT an error --
-- in particular for the empty query, which the caller legitimately produces when
-- a message is all stopwords, and which must never become a 42601.
--
-- The tie-break is an expression in the ORDER BY, so it is parse-analysed on
-- every call. A typo in it -- a column that does not exist, a type mismatch --
-- would raise here rather than in production.
SELECT 1 AS ord,
       'posts, ordinary query, impossible board'::text AS case_name,
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha | beta', 4)) AS rows_returned
UNION ALL SELECT 2, 'posts, EMPTY query returns no rows and does not raise',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, '', 4))
UNION ALL SELECT 3, 'posts, clamp still accepts a limit above the ceiling',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha', 999))
ORDER BY ord;

ROLLBACK;
