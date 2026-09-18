-- Read-only verification for 20260918160000_board_search_language_vectors.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog, inspects function
-- bodies and index definitions as text, and calls both functions against a board
-- id that cannot exist. Runs unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT IS SAFE IN WHICH STATE, as with the verify files before it: the
-- invariants query is safe in EVERY state and reports a missing object as
-- '(absent)' with pass = f. The smoke query CALLS both functions, so it requires
-- them; on a database without them the batch aborts with SQLSTATE 42883 and rows
-- 1-2 are the early warning.
--
-- ROW 3 IS THE ONE THAT MATTERS MOST, AND IT IS AN EXISTENCE CHECK ON A
-- CONFIGURATION. `german` is not installed everywhere. If it is missing, every
-- statement in the migration still PARSES -- the failure arrives at execution as
-- SQLSTATE 3F000 -- so a database can look correct right up until the first
-- search. This row is checked before anything else is believed.
--
-- ROWS 8-13 ARE THE SIX INDEXES, AND THEY ARE WHY THIS FILE IS LONG. The
-- functions are correct with zero indexes present: they return the same rows,
-- slower. So NOTHING IN A RESULT reveals a missing index, and the only symptom
-- is latency under a sequential scan that runs the projection over every post on
-- the board. There is no cheaper alarm than naming all six.
--
-- WHAT A PASS DOES NOT MEAN.
--
--   * It does not mean the planner USES the indexes. Expression-index matching
--     compares parse trees, and only EXPLAIN against real rows proves it. Rows
--     8-13 prove the indexes exist with the expected expressions; row 14 proves
--     the function body still spells those expressions the same way, which is
--     the part a careless edit breaks.
--   * It does not mean GREATEST() across three configurations ranks sensibly.
--     That is a battery question, not a SQL invariant, and it is scored
--     separately.
--   * It does not mean q08 is fixed. It is not, by design; see the migration.

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
       AND p.proname IN ('search_board_posts_text', 'search_board_knowledge_chunks_text',
                         'plain_text_from_post_content')
),
fn_grants AS (
    SELECT fns.proname, COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM fns, aclexplode(fns.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
idx AS (
    SELECT c.relname AS index_name, pg_get_indexdef(c.oid) AS definition
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'i'
       AND c.relname IN ('padlets_search_gin', 'padlets_search_en_gin', 'padlets_search_de_gin',
                         'knowledge_chunks_search_gin', 'knowledge_chunks_search_en_gin',
                         'knowledge_chunks_search_de_gin')
),
searchers AS (SELECT * FROM fns WHERE proname LIKE 'search_board_%'),
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'search_board_posts_text exists'::text AS check_name,
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_posts_text'), '(absent)') AS actual,
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_posts_text') AS pass
    UNION ALL SELECT 2, 'function', 'search_board_knowledge_chunks_text exists',
           COALESCE((SELECT 'present' FROM fns WHERE proname = 'search_board_knowledge_chunks_text'), '(absent)'),
           EXISTS (SELECT 1 FROM fns WHERE proname = 'search_board_knowledge_chunks_text')
    -- THE PRECONDITION FOR EVERYTHING ELSE. A missing configuration parses fine
    -- and fails at execution time, so it must be checked, not assumed.
    UNION ALL SELECT 3, 'configuration', 'all three text search configurations exist',
           COALESCE((SELECT string_agg(cfgname, ', ' ORDER BY cfgname)
                       FROM pg_ts_config WHERE cfgname IN ('simple', 'english', 'german')), '(none)'),
           (SELECT count(*) = 3 FROM pg_ts_config WHERE cfgname IN ('simple', 'english', 'german'))
    -- Both function bodies must name all three, or a configuration exists and is
    -- simply not being used -- which looks identical in every result.
    UNION ALL SELECT 4, 'configuration', 'both functions query all three configurations',
           COALESCE((SELECT string_agg(proname || '=' ||
                       (CASE WHEN definition LIKE '%''simple''::regconfig%' THEN 's' ELSE '-' END ||
                        CASE WHEN definition LIKE '%''english''::regconfig%' THEN 'e' ELSE '-' END ||
                        CASE WHEN definition LIKE '%''german''::regconfig%' THEN 'g' ELSE '-' END),
                       ' ' ORDER BY proname) FROM searchers), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%''simple''::regconfig%'
                                         AND definition LIKE '%''english''::regconfig%'
                                         AND definition LIKE '%''german''::regconfig%') FROM searchers)
    UNION ALL SELECT 5, 'ranking', 'both rank with GREATEST across the three',
           COALESCE((SELECT string_agg(proname || '=' ||
                       CASE WHEN definition LIKE '%GREATEST(%' THEN 'greatest' ELSE 'SINGLE RANK' END,
                       ' ' ORDER BY proname) FROM searchers), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(definition LIKE '%GREATEST(%') FROM searchers)
    -- The asymmetry from 20260918150000 survives: posts on flag 0, chunks on 1.
    UNION ALL SELECT 6, 'ranking', 'posts still flag 0 and chunks still flag 1',
           COALESCE((SELECT
                  (CASE WHEN (SELECT definition FROM searchers WHERE proname = 'search_board_posts_text')
                               LIKE '%, 0)%' THEN 'posts=0' ELSE 'posts=NOT 0' END) || ' ' ||
                  (CASE WHEN (SELECT definition FROM searchers WHERE proname = 'search_board_knowledge_chunks_text')
                               LIKE '%, 1)%' THEN 'chunks=1' ELSE 'chunks=NOT 1' END)), '(absent)'),
           COALESCE((SELECT (SELECT definition FROM searchers WHERE proname = 'search_board_posts_text') LIKE '%, 0)%'
                        AND (SELECT definition FROM searchers WHERE proname = 'search_board_knowledge_chunks_text') LIKE '%, 1)%'), false)
    -- R2's widening. `card` in, and the predicate is what lets the partial
    -- indexes be used at all.
    UNION ALL SELECT 7, 'index', 'the posts body carries the WIDENED type predicate',
           COALESCE((SELECT CASE WHEN definition LIKE '%type IN (''text'', ''note'', ''card'')%'
                                 THEN 'text, note, card'
                                 WHEN definition LIKE '%type IN (''text'', ''note'')%'
                                 THEN 'NOT WIDENED -- card missing'
                                 ELSE 'MISSING' END
                       FROM searchers WHERE proname = 'search_board_posts_text'), '(absent)'),
           COALESCE((SELECT definition LIKE '%type IN (''text'', ''note'', ''card'')%'
                       FROM searchers WHERE proname = 'search_board_posts_text'), false)
    -- THE SIX INDEXES. Nothing in any result reveals a missing one.
    UNION ALL SELECT 8, 'index', 'padlets_search_gin exists (simple)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'padlets_search_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'padlets_search_gin')
    UNION ALL SELECT 9, 'index', 'padlets_search_en_gin exists (english)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'padlets_search_en_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'padlets_search_en_gin')
    UNION ALL SELECT 10, 'index', 'padlets_search_de_gin exists (german)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'padlets_search_de_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'padlets_search_de_gin')
    UNION ALL SELECT 11, 'index', 'knowledge_chunks_search_gin exists (simple)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'knowledge_chunks_search_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'knowledge_chunks_search_gin')
    UNION ALL SELECT 12, 'index', 'knowledge_chunks_search_en_gin exists (english)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'knowledge_chunks_search_en_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'knowledge_chunks_search_en_gin')
    UNION ALL SELECT 13, 'index', 'knowledge_chunks_search_de_gin exists (german)',
           COALESCE((SELECT 'present' FROM idx WHERE index_name = 'knowledge_chunks_search_de_gin'), '(absent)'),
           EXISTS (SELECT 1 FROM idx WHERE index_name = 'knowledge_chunks_search_de_gin')
    -- THE THREE PADLETS INDEXES MUST CARRY THE WIDENED PREDICATE TOO. An index
    -- whose predicate is narrower than the function's qual cannot be used for it.
    -- MATCHED LITERAL BY LITERAL, NOT AS ONE RENDERED PHRASE, and that is a fix
    -- for a FALSE FAILURE this row produced on its first run. pg_get_indexdef
    -- renders the predicate in whatever type the column actually is: this
    -- database prints
    --     'text'::character varying, 'note'::character varying, 'card'::character varying
    -- because padlets.type is varchar, while the same index on a `text` column
    -- prints ::text, and some versions print neither. The earlier pattern
    -- hard-coded one of those renderings and reported NOT WIDENED on three
    -- indexes that were correctly widened -- verified by direct test.
    --
    -- Checking for the three LITERALS instead is rendering-independent and
    -- contains no backslash, so it also survives any transport that mangles
    -- escapes. It is safe from false PASSES because 'card' appears nowhere else
    -- in these definitions: the indexed expression is title and body only.
    UNION ALL SELECT 14, 'index', 'all three padlets indexes are partial on text, note, card',
           COALESCE((SELECT string_agg(index_name || '=' ||
                       CASE WHEN definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                             AND definition LIKE '%''card''%' THEN 'widened'
                            WHEN definition LIKE '%''card''%' THEN 'card only -- predicate malformed'
                            ELSE 'NOT WIDENED -- card missing' END, ' ' ORDER BY index_name)
                       FROM idx WHERE index_name LIKE 'padlets_search%'), '(absent)'),
           COALESCE((SELECT count(*) = 3 AND bool_and(
                       definition LIKE '%''text''%' AND definition LIKE '%''note''%'
                   AND definition LIKE '%''card''%')
                       FROM idx WHERE index_name LIKE 'padlets_search%'), false)
    -- The double evaluation is the write-path cost this batch removed. Two calls
    -- in one index expression is the shape that regressed.
    UNION ALL SELECT 15, 'write cost', 'the padlets simple index calls the projection ONCE',
           COALESCE((SELECT CASE
                         WHEN (pg_catalog.length(definition)
                               - pg_catalog.length(pg_catalog.replace(definition, 'plain_text_from_post_content', ''))) / 28 = 1
                           THEN 'one call' ELSE 'MORE THAN ONE CALL' END
                       FROM idx WHERE index_name = 'padlets_search_gin'), '(absent)'),
           COALESCE((SELECT (pg_catalog.length(definition)
                             - pg_catalog.length(pg_catalog.replace(definition, 'plain_text_from_post_content', ''))) / 28 = 1
                       FROM idx WHERE index_name = 'padlets_search_gin'), false)
    -- The E'' regex. A plain-string pattern silently degrades where
    -- standard_conforming_strings is off, and every <br> stops becoming a newline.
    UNION ALL SELECT 16, 'projection', 'the <br> pattern survives a non-standard-conforming database',
           COALESCE((SELECT CASE WHEN definition LIKE '%<br\\s*/?>%' THEN 'escaped form'
                                 ELSE 'PLAIN STRING -- depends on standard_conforming_strings' END
                       FROM fns WHERE proname = 'plain_text_from_post_content'), '(absent)'),
           COALESCE((SELECT definition LIKE '%<br\\s*/?>%'
                       FROM fns WHERE proname = 'plain_text_from_post_content'), false)
    -- Everything below is what a careless CREATE OR REPLACE could have dropped.
    UNION ALL SELECT 17, 'hardening', 'both searchers set an EMPTY search_path',
           COALESCE((SELECT string_agg(proname || '=' || COALESCE(array_to_string(proconfig, ','), '(none)'),
                                       ' ' ORDER BY proname) FROM searchers), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(
                EXISTS (SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY['(none)'])) AS setting
                         WHERE setting IN ('search_path=', 'search_path=""'))) FROM searchers)
    UNION ALL SELECT 18, 'authorization', 'both searchers are still SECURITY INVOKER',
           COALESCE((SELECT string_agg(proname || '=' || CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END,
                                       ' ' ORDER BY proname) FROM searchers), '(absent)'),
           (SELECT count(*) = 2 AND bool_and(NOT prosecdef) FROM searchers)
    UNION ALL SELECT 19, 'authorization', 'PUBLIC, anon and authenticated hold no EXECUTE on either searcher',
           COALESCE((SELECT string_agg(DISTINCT proname || ':' || grantee, ', ' ORDER BY proname || ':' || grantee)
                       FROM fn_grants WHERE proname LIKE 'search_board_%'
                        AND grantee IN ('PUBLIC', 'anon', 'authenticated')), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE proname LIKE 'search_board_%'
                        AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    UNION ALL SELECT 20, 'authorization', 'service_role may still execute both searchers',
           COALESCE((SELECT string_agg(DISTINCT proname, ', ' ORDER BY proname)
                       FROM fn_grants WHERE proname LIKE 'search_board_%' AND grantee = 'service_role'), '(none)'),
           (SELECT count(DISTINCT proname) = 2 FROM fn_grants
             WHERE proname LIKE 'search_board_%' AND grantee = 'service_role')
    UNION ALL SELECT 21, 'dependency', 'plain_text_from_post_content is still IMMUTABLE',
           COALESCE((SELECT CASE WHEN definition LIKE '%IMMUTABLE%' THEN 'immutable' ELSE 'NOT IMMUTABLE' END
                       FROM fns WHERE proname = 'plain_text_from_post_content'), '(absent)'),
           COALESCE((SELECT definition LIKE '%IMMUTABLE%'
                       FROM fns WHERE proname = 'plain_text_from_post_content'), false)
)
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE SMOKE QUERY, on a board id that cannot exist.
--
-- Every count must be 0, and the point is that it must be 0 WITHOUT an error.
-- Three configurations means THREE to_tsquery calls per search, and each is a
-- new way for a query to raise: a missing configuration raises 3F000, and a
-- term that every dictionary in a configuration reduces to nothing yields an
-- empty tsquery which must match nothing rather than fail.
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
-- `will` is a stopword in BOTH the english and the german dictionaries, so two
-- of the three tsqueries here are empty. That must be a no-op, not a failure.
UNION ALL SELECT 5, 'posts, a term that is a stopword in two of three configurations',
       (SELECT count(*) FROM public.search_board_posts_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'will', 4))
UNION ALL SELECT 6, 'chunks, umlaut and eszett terms parse in all three',
       (SELECT count(*) FROM public.search_board_knowledge_chunks_text(
            '00000000-0000-0000-0000-000000000000'::uuid, 'stoßstange | lösen', 4))
ORDER BY ord;

ROLLBACK;
