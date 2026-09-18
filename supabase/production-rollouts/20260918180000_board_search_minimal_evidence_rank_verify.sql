-- Read-only verification for 20260918180000_board_search_minimal_evidence_rank.sql.
--
-- Creates nothing, changes nothing. Runs unchanged inside
-- `BEGIN TRANSACTION READ ONLY`.
--
-- ROW 3 IS THE CENTRAL CHECK AND IT HAS TO BE PRECISE, because THREE different
-- rank expressions now exist in this project's history and all three contain the
-- word GREATEST:
--
--   GREATEST(s, e, g)                              20260918160000
--   CASE WHEN n_simple > 0 THEN s ELSE GREATEST(..) 20260918170000
--   CASE WHEN n_simple >= 2 THEN s WHEN ... > ...   this one
--
-- So the check is for the BOUNDARY -- `>= 2` -- which is the only thing that
-- distinguishes the rule from the additive form it replaces. A check for
-- "mentions GREATEST" or even "mentions CASE WHEN n_simple" would pass on the
-- expression this migration exists to replace.
--
-- ROW 4 IS THE ONE THAT PROTECTS RECALL. Matching must STILL be the three-way
-- OR. It is easy to "simplify" this function by restricting the match to
-- `simple`, which would delete every row the added configurations contributed --
-- including q07's page 2, the passage this whole migration is for.
--
-- ROW 5 IS ABOUT THE PLAN, AND IT IS THE WEAKEST ROW IN THE FILE. It asserts
-- that the qual still spells the indexed expression and that the term counts are
-- NOT in it. That is necessary and not sufficient: it proves the text, not the
-- plan. **THE PLAN MUST BE CHECKED WITH EXPLAIN** -- see the migration header.
-- Expect Bitmap Heap Scan into BitmapOr across padlets_search_{gin,en_gin,de_gin}
-- and the knowledge_chunks equivalents. If they are gone, this file will still
-- report readiness, because a sequential scan returns exactly the same rows.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean q08 is fixed. It is not -- the gap narrows from 3.07x to
--     1.12x and the introduction still leads. That is a semantic problem, not a
--     ranking one, and no term-count rule reaches it.
--   * It does not mean the "two terms" boundary is right. It is minimal evidence
--     rather than a tuned constant, and it has not been tested against 3.

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
    -- THE BOUNDARY. Three rank expressions in this project's history contain
    -- GREATEST; only this one has the two-term guard.
    UNION ALL SELECT 3, 'ranking', 'both use the TWO-TERM boundary, not the additive guard',
           COALESCE((SELECT string_agg(proname || '=' || CASE
                         WHEN definition LIKE '%n.n_simple >= 2%' THEN 'two-term'
                         WHEN definition LIKE '%n_simple > 0%' THEN 'ADDITIVE (not applied)'
                         WHEN definition LIKE '%GREATEST(%' THEN 'MAXIMUM (not applied)'
                         ELSE 'NO KNOWN RANK FORM' END, ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%n.n_simple >= 2%') FROM fns)
    -- And the supersede clause is STRICTLY more, not >=. With >= it would fire
    -- on every tie, which is the q05 boost this rule exists to refuse.
    UNION ALL SELECT 4, 'ranking', 'the stemmed view supersedes only on STRICTLY more terms',
           COALESCE((SELECT string_agg(proname || '=' || CASE
                         WHEN definition LIKE '%GREATEST(n.n_english, n.n_german) > n.n_simple%' THEN 'strict'
                         WHEN definition LIKE '%>= n.n_simple%' THEN 'NOT STRICT -- fires on ties'
                         ELSE 'CLAUSE MISSING' END, ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                definition LIKE '%GREATEST(n.n_english, n.n_german) > n.n_simple%') FROM fns)
    UNION ALL SELECT 5, 'recall', 'matching is STILL the three-way OR',
           COALESCE((SELECT string_agg(proname || '=' ||
                       (CASE WHEN definition LIKE '%@@ q.q_simple%' THEN 's' ELSE '-' END ||
                        CASE WHEN definition LIKE '%@@ q.q_english%' THEN 'e' ELSE '-' END ||
                        CASE WHEN definition LIKE '%@@ q.q_german%' THEN 'g' ELSE '-' END),
                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%@@ q.q_simple%'
                                         AND definition LIKE '%@@ q.q_english%'
                                         AND definition LIKE '%@@ q.q_german%') FROM fns)
    -- THE TEXT OF THE PLAN ARGUMENT, not the plan. See the header: EXPLAIN is
    -- the proof, and this row cannot replace it.
    UNION ALL SELECT 6, 'index', 'the term counts are NOT in the match qual',
           COALESCE((SELECT string_agg(proname || '=' || CASE
                         WHEN pg_catalog.strpos(
                                pg_catalog.substr(definition, 1, pg_catalog.strpos(definition, 'CROSS JOIN LATERAL')),
                                'n_simple') = 0
                           THEN 'counts after the qual' ELSE 'COUNT IN THE QUAL -- indexes unusable' END,
                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                pg_catalog.strpos(
                    pg_catalog.substr(definition, 1, pg_catalog.strpos(definition, 'CROSS JOIN LATERAL')),
                    'n_simple') = 0) FROM fns)
    UNION ALL SELECT 7, 'ranking', 'the flag asymmetry survives: posts 0, chunks 1',
           COALESCE((SELECT
                  (CASE WHEN (SELECT definition FROM fns WHERE proname = 'search_board_posts_text')
                               LIKE '%m.q_simple, 0)%' THEN 'posts=0' ELSE 'posts=NOT 0' END) || ' ' ||
                  (CASE WHEN (SELECT definition FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
                               LIKE '%m.q_simple, 1)%' THEN 'chunks=1' ELSE 'chunks=NOT 1' END)), '(absent)'),
           COALESCE((SELECT (SELECT definition FROM fns WHERE proname = 'search_board_posts_text')
                              LIKE '%m.q_simple, 0)%'
                        AND (SELECT definition FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
                              LIKE '%m.q_simple, 1)%'), false)
    UNION ALL SELECT 8, 'ranking', 'the body-over-title-only tie-break survives',
           COALESCE((SELECT CASE WHEN definition LIKE '%body.text <> ''''%' THEN 'present' ELSE 'MISSING' END
                       FROM fns WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%body.text <> ''''%'
                       FROM fns WHERE proname = 'search_board_posts_text'), false)
    UNION ALL SELECT 9, 'index', 'the posts body still carries the widened type predicate',
           COALESCE((SELECT CASE WHEN definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                                  AND definition LIKE '%''card''%' THEN 'text, note, card'
                                 ELSE 'NOT WIDENED -- card missing' END
                       FROM fns WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                          AND definition LIKE '%''card''%'
                       FROM fns WHERE proname = 'search_board_posts_text'), false)
    UNION ALL SELECT 10, 'hardening', 'both set an EMPTY search_path',
           COALESCE((SELECT string_agg(proname || '=' || COALESCE(array_to_string(proconfig, ','), '(none)'),
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                EXISTS (SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY['(none)'])) AS setting
                         WHERE setting IN ('search_path=', 'search_path=""'))) FROM fns)
    UNION ALL SELECT 11, 'authorization', 'both are still SECURITY INVOKER',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END,
                                       ' ' ORDER BY proname) FROM fns), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(NOT prosecdef) FROM fns)
    UNION ALL SELECT 12, 'authorization', 'PUBLIC, anon and authenticated hold no EXECUTE',
           COALESCE((SELECT string_agg(DISTINCT proname || ':' || grantee, ', ' ORDER BY proname || ':' || grantee)
                       FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon', 'authenticated'))
    UNION ALL SELECT 13, 'authorization', 'service_role may still execute both',
           COALESCE((SELECT string_agg(DISTINCT proname, ', ' ORDER BY proname)
                       FROM fn_grants WHERE grantee = 'service_role'), '(none)'),
           (SELECT count(DISTINCT proname) = 2 FROM fn_grants WHERE grantee = 'service_role')
)
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY, on a board id that cannot exist. Every count must be 0, and
-- the point is that it must be 0 WITHOUT an error.
--
-- A NOTE ON WHAT IS **NOT** TESTED HERE, because the obvious test is impossible.
-- The term splitter guards against an empty term (`btrim(raw) <> ''`), since
-- to_tsquery('') raises 42601. But a string that would PRODUCE an empty term --
-- 'alpha | ' or 'alpha || beta' -- is not a valid tsquery either, so the `q` CTE
-- raises on the whole string before the splitter ever runs. The guard is
-- therefore DEFENCE IN DEPTH against a future caller that builds the term list
-- differently, and it cannot be exercised from this entry point. Writing a smoke
-- row for it would abort the batch rather than prove anything.
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
-- Separators without surrounding spaces still split into clean terms.
UNION ALL SELECT 5, 'posts, unspaced separators still split cleanly',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha|beta|gamma', 4))
-- A single term: the two-term boundary must take its ELSE branch cleanly.
UNION ALL SELECT 6, 'posts, a SINGLE term exercises the boundary branch',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha', 4))
UNION ALL SELECT 7, 'chunks, a SINGLE term exercises the boundary branch',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'alpha', 4))
-- A term that is a stopword in english AND german: two empty tsqueries, so the
-- counts are 0 and GREATEST of two zero ranks must be a number, not a null.
UNION ALL SELECT 8, 'posts, a term that is a stopword in two of three configurations',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'will', 4))
-- Umlaut and eszett terms parse in all three configurations.
UNION ALL SELECT 9, 'chunks, umlaut and eszett terms parse in all three',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'stoßstange | lösen', 4))
ORDER BY ord;

ROLLBACK;
