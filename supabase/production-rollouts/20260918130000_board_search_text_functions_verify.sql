-- Read-only verification for 20260918130000_board_search_text_functions.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog and calls the two search
-- functions against a board id that cannot exist, and runs unchanged inside
-- `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT IS SAFE IN WHICH STATE -- READ THIS BEFORE RUNNING IT ON A DATABASE THAT
-- MAY NOT HAVE THE ROLLOUT. The two sections behave differently, exactly as in
-- the verify file for 20260918120000:
--
--   * THE INVARIANTS QUERY is safe in EVERY state -- before a rollout, after one,
--     after a rollback, or against a partial apply. It reads pg_catalog only and
--     names no function that might be absent, so a missing one reports as
--     '(absent)' with pass = f rather than failing.
--   * THE SMOKE QUERY CALLS BOTH FUNCTIONS BY NAME, so it requires them to
--     exist. Against a database where they do not, it fails with SQLSTATE 42883
--     and that error aborts the batch. Rows 1 and 2 are the early warning: if
--     they read '(absent)', stop there. The same parse-analysis limit applies as
--     before -- `to_regprocedure(...) IS NOT NULL AND <call>` does NOT help,
--     because PostgreSQL resolves function references during parse analysis,
--     before `AND` can short-circuit.
--
-- THE SMOKE QUERY IS A CONTRACT CHECK, NOT A SEARCH. It calls both functions
-- with the all-zero UUID, which no board has, so both must return ZERO ROWS on
-- any database. What it proves is that the functions PARSE, RESOLVE, and accept
-- the declared argument types -- including that `p_query` survives
-- `to_tsquery('simple', ...)`. It deliberately also passes an EMPTY query, which
-- must return zero rows rather than raising: "the user typed only stopwords" is
-- an ordinary outcome and the caller relies on it not being an error.
--
-- IT DOES NOT AND CANNOT PROVE RELEVANCE. Whether the right passage comes back
-- for a real question is a live check on a populated board, not a SQL invariant.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from any
-- row.
--
-- WHAT THE INVARIANTS ARE FOR.
--
--   * Rows 1-2: both functions exist. A search function that is absent is the
--     whole feature absent.
--   * Rows 3-4: both are STABLE and SECURITY INVOKER. SECURITY DEFINER here
--     would be a board-scoped read running as the owner -- RLS off, on a
--     function whose only argument is a board id. That is the single most
--     dangerous thing this file can catch.
--   * Rows 5-6: PUBLIC, anon and authenticated may NOT execute either. Tighter
--     than the projection, and the reason is in the migration header.
--   * Rows 7-8: service_role may execute both. Without it the server's own
--     adapter cannot call them and the toggle fails closed.
--   * Row 9: the projection the posts search depends on still exists. This
--     function is the bridge between the index expression and the query; if it
--     were dropped, the posts search would be searching different words than
--     the index holds -- though in practice the call would fail first.
--   * Row 10: both GIN indexes from 20260918120000 are still present. These
--     functions are usable without them and would seq-scan; that is a latency
--     failure with no error, which is exactly the kind that survives review.
--   * Row 11: RLS is still enabled on all three tables these functions read.
--     SECURITY INVOKER means RLS is the boundary, so RLS being off would make
--     these board-wide reads rather than board-scoped ones.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean the planner uses the indexes. Proving that needs EXPLAIN
--     against real data, which is not a read-only invariant. Row 10 proves the
--     indexes exist and the migration writes the predicate out plainly so they
--     CAN be used; neither is the same as proving they WERE.
--   * It does not mean the search returns anything useful. See the smoke note.
--   * It does not verify the caller's tsquery construction at all. That lives in
--     lib/domain/ai/boardAiSearchQuery.ts and is tested there.

BEGIN TRANSACTION READ ONLY;

WITH fns AS (
    SELECT p.proname,
           p.oid,
           p.provolatile,
           p.prosecdef,
           p.proacl
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('search_board_posts_text', 'search_board_knowledge_chunks_text')
),
-- Who may EXECUTE each function, by role name. grantee 0 is PUBLIC, which is the
-- DEFAULT grant on a new function and therefore the one that must be visibly
-- absent rather than merely inferred.
fn_grants AS (
    SELECT fns.proname, COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM fns, aclexplode(fns.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
idx AS (
    SELECT c.relname AS name
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('knowledge_chunks_search_gin', 'padlets_search_gin')
),
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'search_board_posts_text exists'::text AS check_name,
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_posts_text'), '(absent)') AS actual,
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_posts_text') AS pass
    UNION ALL SELECT 2, 'function', 'search_board_knowledge_chunks_text exists',
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
    UNION ALL SELECT 3, 'function', 'both are STABLE',
           COALESCE((SELECT string_agg(proname || '=' || provolatile, ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(provolatile = 's') FROM fns)
    -- The dangerous one. A board-scoped read running as its owner is RLS off.
    UNION ALL SELECT 4, 'authorization', 'both are SECURITY INVOKER',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END,
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(NOT prosecdef) FROM fns)
    UNION ALL SELECT 5, 'authorization', 'PUBLIC and anon may not execute either',
           COALESCE((SELECT string_agg(DISTINCT proname || ':' || grantee, ', ' ORDER BY proname || ':' || grantee)
                       FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon'))
    -- Stricter than the projection: nothing writes through these, so the
    -- index-expression argument for granting `authenticated` does not apply.
    UNION ALL SELECT 6, 'authorization', 'authenticated may not execute either',
           COALESCE((SELECT string_agg(DISTINCT proname, ', ' ORDER BY proname)
                       FROM fn_grants WHERE grantee = 'authenticated'), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee = 'authenticated')
    UNION ALL SELECT 7, 'authorization', 'service_role may execute search_board_posts_text',
           COALESCE((SELECT string_agg(grantee, ', ' ORDER BY grantee) FROM fn_grants
                      WHERE proname = 'search_board_posts_text'), '(none)'),
           EXISTS (SELECT 1 FROM fn_grants WHERE proname = 'search_board_posts_text' AND grantee = 'service_role')
    UNION ALL SELECT 8, 'authorization', 'service_role may execute search_board_knowledge_chunks_text',
           COALESCE((SELECT string_agg(grantee, ', ' ORDER BY grantee) FROM fn_grants
                      WHERE proname = 'search_board_knowledge_chunks_text'), '(none)'),
           EXISTS (SELECT 1 FROM fn_grants WHERE proname = 'search_board_knowledge_chunks_text'
                                             AND grantee = 'service_role')
    -- The bridge between the index expression and the posts query.
    UNION ALL SELECT 9, 'dependency', 'plain_text_from_post_content still exists',
           COALESCE((SELECT 'present' FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content'), '(absent)'),
           EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content')
    -- Missing indexes are a LATENCY failure with no error. Nothing else catches it.
    UNION ALL SELECT 10, 'index', 'both search GIN indexes from 20260918120000 are present',
           COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM idx), '(none)'),
           (SELECT count(*) = 2 FROM idx)
    -- SECURITY INVOKER means RLS is the boundary. RLS off would make these
    -- board-wide reads rather than board-scoped ones.
    UNION ALL SELECT 11, 'attributes', 'row level security is enabled on all three tables these read',
           (SELECT string_agg(c.relname || '=' || c.relrowsecurity::text, ' ' ORDER BY c.relname)
              FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relname IN ('padlets', 'knowledge_chunks', 'knowledge_documents')),
           (SELECT count(*) = 3 AND bool_and(c.relrowsecurity)
              FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relname IN ('padlets', 'knowledge_chunks', 'knowledge_documents'))
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY. Both functions, on a board id that cannot exist.
--
-- REQUIRES BOTH FUNCTIONS. This names them, so on a database without them it
-- raises 42883 and aborts the batch. Rows 1 and 2 above are the early warning.
--
-- Every count below must be 0, and the point is that it must be 0 WITHOUT an
-- error. The empty-query cases are the load-bearing ones: the caller drops
-- stopwords and can legitimately end up with nothing to search for, and it
-- relies on that returning no rows rather than raising.
SELECT 1 AS ord,
       'posts, ordinary query, impossible board'::text AS case_name,
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha | beta', 4)) AS rows_returned
UNION ALL SELECT 2, 'chunks, ordinary query, impossible board',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha | beta', 4))
-- An empty tsquery must be an empty result, never a 42601.
UNION ALL SELECT 3, 'posts, EMPTY query returns no rows and does not raise',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, '', 4))
UNION ALL SELECT 4, 'chunks, EMPTY query returns no rows and does not raise',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, '   ', 4))
ORDER BY ord;

ROLLBACK;
