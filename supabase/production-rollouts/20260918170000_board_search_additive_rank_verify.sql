-- Read-only verification for 20260918170000_board_search_additive_rank.sql.
--
-- Creates nothing, changes nothing. Runs unchanged inside
-- `BEGIN TRANSACTION READ ONLY`.
--
-- THE CENTRAL CHECK IS ROW 3, AND IT IS THE HARDEST THING IN THIS FILE TO GET
-- RIGHT. The change replaced one rank expression with another; BOTH contain the
-- word GREATEST, because the additive form still takes the greater of `english`
-- and `german` in its ELSE branch. So "does the body mention GREATEST" cannot
-- tell the two apart, and a check that asked only that would pass on the version
-- this migration exists to replace. What separates them is the CASE: the
-- additive form guards the rank on whether `simple` matched.
--
-- ROW 4 IS THE OTHER HALF, AND IT IS WHAT STOPS A "FIX" FROM BECOMING A LOSS.
-- Matching must STILL be the three-way OR. It would be easy to "simplify" this
-- function by also restricting the match to `simple`, which would silently
-- delete every row the added configurations contributed -- including q07's, the
-- one rated-relevant gain in the whole set. The match predicate is therefore
-- checked independently of the rank.
--
-- NO INDEX ROWS HERE. This migration touches no indexed expression, so
-- 20260918160000's verifier remains the authority on the six indexes. Run it too
-- if you are checking a database from scratch rather than checking this delta.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean the ordering is now right. It means the added
--     configurations no longer re-rank rows they did not add. q09's Audi post is
--     still the top of its block at 0.018998 on a cross-language collision, and
--     that is a KNOWN, RECORDED limitation rather than a regression.
--   * It does not mean q05 is fixed. That is a battery measurement, not a SQL
--     invariant, and it is re-run separately.

BEGIN TRANSACTION READ ONLY;

WITH fns AS (
    SELECT p.proname,
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
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'search_board_posts_text exists'::text AS check_name,
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_posts_text'), '(absent)') AS actual,
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_posts_text') AS pass
    UNION ALL SELECT 2, 'function', 'search_board_knowledge_chunks_text exists',
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
    -- THE CHANGE ITSELF. Both forms contain GREATEST; only the additive form
    -- guards the rank behind a CASE on whether `simple` matched.
    UNION ALL SELECT 3, 'ranking', 'both rank ADDITIVELY -- simple wins where simple matched',
           COALESCE((SELECT string_agg(proname || '=' || CASE
                         WHEN definition LIKE '%CASE WHEN pg_catalog.to_tsvector(''simple''::regconfig%'
                          AND definition LIKE '%ELSE GREATEST(%' THEN 'additive'
                         WHEN definition LIKE '%GREATEST(%' THEN 'MAXIMUM (not reverted)'
                         ELSE 'NEITHER FORM FOUND' END, ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                definition LIKE '%CASE WHEN pg_catalog.to_tsvector(''simple''::regconfig%'
            AND definition LIKE '%ELSE GREATEST(%') FROM fns)
    -- THE HALF THAT MUST NOT HAVE MOVED. Restricting the match to `simple` would
    -- silently delete every row the added configurations contributed.
    UNION ALL SELECT 4, 'recall', 'matching is STILL the three-way OR',
           COALESCE((SELECT string_agg(proname || '=' ||
                       (CASE WHEN definition LIKE '%@@ q.q_simple%' THEN 's' ELSE '-' END ||
                        CASE WHEN definition LIKE '%@@ q.q_english%' THEN 'e' ELSE '-' END ||
                        CASE WHEN definition LIKE '%@@ q.q_german%' THEN 'g' ELSE '-' END),
                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%@@ q.q_simple%'
                                         AND definition LIKE '%@@ q.q_english%'
                                         AND definition LIKE '%@@ q.q_german%') FROM fns)
    UNION ALL SELECT 5, 'ranking', 'the flag asymmetry survives: posts 0, chunks 1',
           COALESCE((SELECT
                  (CASE WHEN (SELECT definition FROM fns WHERE proname = 'search_board_posts_text')
                               LIKE '%q.q_simple, 0)%' THEN 'posts=0' ELSE 'posts=NOT 0' END) || ' ' ||
                  (CASE WHEN (SELECT definition FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
                               LIKE '%q.q_simple, 1)%' THEN 'chunks=1' ELSE 'chunks=NOT 1' END)), '(absent)'),
           COALESCE((SELECT (SELECT definition FROM fns WHERE proname = 'search_board_posts_text')
                              LIKE '%q.q_simple, 0)%'
                        AND (SELECT definition FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
                              LIKE '%q.q_simple, 1)%'), false)
    UNION ALL SELECT 6, 'ranking', 'the body-over-title-only tie-break survives',
           COALESCE((SELECT CASE WHEN definition LIKE '%<> ''''::text) DESC%'
                                   OR definition LIKE '%<> '''') DESC%' THEN 'present' ELSE 'MISSING' END
                       FROM fns WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%<> ''''::text) DESC%'
                          OR definition LIKE '%<> '''') DESC%'
                       FROM fns WHERE proname = 'search_board_posts_text'), false)
    -- R2's widening. Matched literal by literal so the check is independent of
    -- how this database renders the column's type; see 20260918160000's verifier
    -- row 14, where a rendering-specific pattern produced a false failure.
    UNION ALL SELECT 7, 'index', 'the posts body still carries the widened type predicate',
           COALESCE((SELECT CASE WHEN definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                                  AND definition LIKE '%''card''%' THEN 'text, note, card'
                                 ELSE 'NOT WIDENED -- card missing' END
                       FROM fns WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                          AND definition LIKE '%''card''%'
                       FROM fns WHERE proname = 'search_board_posts_text'), false)
    UNION ALL SELECT 8, 'hardening', 'both set an EMPTY search_path',
           COALESCE((SELECT string_agg(proname || '=' || COALESCE(array_to_string(proconfig, ','), '(none)'),
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                EXISTS (SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY['(none)'])) AS setting
                         WHERE setting IN ('search_path=', 'search_path=""'))) FROM fns)
    UNION ALL SELECT 9, 'authorization', 'both are still SECURITY INVOKER',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END,
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(NOT prosecdef) FROM fns)
    UNION ALL SELECT 10, 'authorization', 'PUBLIC, anon and authenticated hold no EXECUTE',
           COALESCE((SELECT string_agg(DISTINCT proname || ':' || grantee, ', ' ORDER BY proname || ':' || grantee)
                       FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated'))
    UNION ALL SELECT 11, 'authorization', 'service_role may still execute both',
           COALESCE((SELECT string_agg(DISTINCT proname, ', ' ORDER BY proname)
                       FROM fn_grants WHERE grantee = 'service_role'), '(none)'),
           (SELECT count(DISTINCT proname) = 2 FROM fn_grants WHERE grantee = 'service_role')
)
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY, on a board id that cannot exist. Every count must be 0, and
-- the point is that it must be 0 WITHOUT an error -- the CASE is evaluated per
-- row, so a malformed guard raises here rather than in production.
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
-- `will` is a stopword in english AND german, so the CASE falls to its ELSE with
-- two empty tsqueries. GREATEST of two zero ranks must be a number, not a null
-- that sorts unpredictably.
UNION ALL SELECT 5, 'posts, a term that is a stopword in two of three configurations',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'will', 4))
ORDER BY ord;

ROLLBACK;
