-- Read-only verification for 20260918140000_board_search_rank_normalization.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog, inspects the two
-- function bodies as text, and calls them against a board id that cannot exist.
-- Runs unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT IS SAFE IN WHICH STATE. As with the two verify files before it:
--
--   * THE INVARIANTS QUERY is safe in EVERY state. It reads pg_catalog only and
--     names no function that might be absent, so a missing one reports as
--     '(absent)' with pass = f rather than failing.
--   * THE SMOKE QUERY CALLS BOTH FUNCTIONS BY NAME, so it requires them. On a
--     database without them it raises SQLSTATE 42883 and aborts the batch. Rows
--     1 and 2 are the early warning; the same parse-analysis limit applies as
--     before, and no `to_regprocedure(...) AND <call>` guard avoids it.
--
-- THE CENTRAL CHECK IS ROW 3, AND IT IS A SOURCE ASSERTION. There is no catalog
-- column that records "which normalization flag does this function pass to
-- ts_rank", so the only place the answer exists is the function body, read back
-- with pg_get_functiondef. That is a weaker instrument than a catalog flag and
-- it is the right one here: the alternative is not verifying the correction at
-- all. It asserts the three-argument form with a literal 1, in both functions.
--
-- WHY IT MATTERS ENOUGH TO CHECK THIS WAY. ts_rank's default normalization is 0,
-- which ignores document length. A rollback, a partial apply, or a later edit
-- that drops the argument would restore that default SILENTLY: every query would
-- still succeed, every row would still come back, and only the ORDER would be
-- wrong -- ranked mostly by length, on a corpus whose posts have a median of 13
-- characters and whose chunks reach 6,000. There is no error to notice. This row
-- is the only thing standing between that regression and production.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from any
-- row.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean the ranking is GOOD, only that the flag that was chosen
--     is the flag in force. Whether flag 1 orders these corpora sensibly is a
--     live question against real data, not a SQL invariant.
--   * It does not mean the planner uses the indexes. That needs EXPLAIN against
--     real rows. Row 7 proves the predicate that makes it possible survived.
--   * It does not re-verify what 20260918130000's verifier already covers. Run
--     that one too; this file checks the delta plus the invariants a careless
--     CREATE OR REPLACE could have dropped along with it.

BEGIN TRANSACTION READ ONLY;

WITH fns AS (
    SELECT p.proname,
           p.oid,
           p.provolatile,
           p.prosecdef,
           p.proacl,
           pg_get_functiondef(p.oid) AS definition,
           -- The configuration settings attached to the function, e.g.
           -- {search_path=""}. NULL when none are set at all.
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
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'search_board_posts_text exists'::text AS check_name,
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_posts_text'), '(absent)') AS actual,
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_posts_text') AS pass
    UNION ALL SELECT 2, 'function', 'search_board_knowledge_chunks_text exists',
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
    -- THE CORRECTION ITSELF. A silent regression to the unchosen default 0 has
    -- no error and no missing row -- only a wrong order. This is the only check.
    UNION ALL SELECT 3, 'ranking', 'both pass normalization flag 1 to ts_rank',
           COALESCE((SELECT string_agg(
                       proname || '=' || CASE
                           WHEN definition LIKE '%ts_rank(%, 1)%' THEN 'flag 1'
                           WHEN definition LIKE '%ts_rank(%' THEN 'NO FLAG (default 0)'
                           ELSE 'no ts_rank found' END,
                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%ts_rank(%, 1)%') FROM fns)
    -- The second correction. proconfig carries the SET clauses verbatim.
    UNION ALL SELECT 4, 'hardening', 'both set an EMPTY search_path',
           COALESCE((SELECT string_agg(proname || '=' || COALESCE(array_to_string(proconfig, ','), '(none)'),
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and('search_path=' = ANY(COALESCE(proconfig, ARRAY['(none)']))) FROM fns)
    -- Everything below is what a careless CREATE OR REPLACE could have dropped.
    UNION ALL SELECT 5, 'authorization', 'both are still SECURITY INVOKER',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END,
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(NOT prosecdef) FROM fns)
    UNION ALL SELECT 6, 'authorization', 'PUBLIC, anon and authenticated still hold no EXECUTE',
           COALESCE((SELECT string_agg(DISTINCT proname || ':' || grantee, ', ' ORDER BY proname || ':' || grantee)
                       FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated'))
    -- CREATE OR REPLACE preserves grants, but a REVOKE typo in this file would
    -- not, and a search nothing may execute fails closed and silently.
    UNION ALL SELECT 7, 'authorization', 'service_role may still execute both',
           COALESCE((SELECT string_agg(DISTINCT proname, ', ' ORDER BY proname)
                       FROM fn_grants WHERE grantee = 'service_role'), '(none)'),
           (SELECT count(DISTINCT proname) = 2 FROM fn_grants WHERE grantee = 'service_role')
    -- Without this predicate in the body, padlets_search_gin cannot be used and
    -- the only symptom is latency.
    UNION ALL SELECT 8, 'index', 'the posts body still carries the partial index predicate',
           COALESCE((SELECT CASE WHEN definition LIKE '%type IN (''text'', ''note'')%'
                                 THEN 'present' ELSE 'MISSING' END
                       FROM fns WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%type IN (''text'', ''note'')%'
                       FROM fns WHERE proname = 'search_board_posts_text'), false)
    UNION ALL SELECT 9, 'index', 'both still use the literal simple configuration',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN definition LIKE '%''simple''::regconfig%'
                                                             THEN 'literal' ELSE 'NOT LITERAL' END,
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%''simple''::regconfig%') FROM fns)
    UNION ALL SELECT 10, 'dependency', 'plain_text_from_post_content still exists',
           COALESCE((SELECT 'present' FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content'), '(absent)'),
           EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content')
)
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY. Both functions, on a board id that cannot exist.
--
-- REQUIRES BOTH FUNCTIONS; see the header. Every count must be 0, and the point
-- is that it must be 0 WITHOUT an error -- in particular for the empty query,
-- which the caller can legitimately produce when a message is all stopwords, and
-- which must never become a 42601.
--
-- It proves the bodies parse and resolve UNDER THE NEW EMPTY search_path, which
-- is the one way correction 2 could have broken something: an unqualified
-- reference that resolved before would now fail. A pass here is that check.
SELECT 1 AS ord,
       'posts, ordinary query, impossible board'::text AS case_name,
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha | beta', 4)) AS rows_returned
UNION ALL SELECT 2, 'chunks, ordinary query, impossible board',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha | beta', 4))
UNION ALL SELECT 3, 'posts, EMPTY query returns no rows and does not raise',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, '', 4))
UNION ALL SELECT 4, 'chunks, EMPTY query returns no rows and does not raise',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, '   ', 4))
ORDER BY ord;

ROLLBACK;
