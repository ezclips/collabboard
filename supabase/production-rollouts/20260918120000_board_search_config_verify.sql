-- Read-only verification for 20260918120000_board_search_config.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog and calls one IMMUTABLE
-- function, and runs unchanged inside `BEGIN TRANSACTION READ ONLY`.
--
-- WHAT IS SAFE IN WHICH STATE -- READ THIS BEFORE RUNNING IT ON A DATABASE THAT
-- MAY NOT HAVE THE ROLLOUT. The two sections behave differently:
--
--   * THE INVARIANTS QUERY is safe in EVERY state -- before a rollout, after one,
--     after a rollback, or against a partial apply. It reads pg_catalog only and
--     names no object that might be absent, so a missing function reports as
--     '(absent)' with pass = f rather than failing.
--   * THE FIXTURES QUERY AND THE ROLL-UP CALL THE PROJECTION BY NAME, so they
--     require it to exist. Against a database where it does not, both fail with
--     SQLSTATE 42883, `function public.plain_text_from_post_content(text) does
--     not exist`, and that error aborts the batch.
--
-- THAT ERROR CANNOT BE GUARDED AWAY IN PLAIN SQL, and it is worth saying why so
-- nobody spends an afternoon trying. `to_regprocedure(...) IS NOT NULL AND
-- public.plain_text_from_post_content(input) ...` does NOT help: PostgreSQL
-- resolves function references during PARSE ANALYSIS, before any row is read and
-- before `AND` can short-circuit, so merely naming the function in the statement
-- is what fails. Sourcing the inputs from a VALUES scan defeats constant folding,
-- which is a real and separate concern, but it does not defeat name resolution.
-- True tolerance would need dynamic SQL in a DO block, which cannot return the
-- result sets this file exists to produce.
--
-- IN PRACTICE THIS COSTS NOTHING, because rows 1 and 2 of the invariants query
-- have already told you: if they read '(absent)', the fixtures below will error,
-- and that error IS the verdict -- it is the expected reading after a rollback.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from
-- any row.
--
-- ROWS 3 AND 4 ARE THE ONES THAT OUTLIVE THIS MIGRATION. Rows 1 and 2 prove the
-- function landed with the attributes an index expression requires: IMMUTABLE,
-- because a VOLATILE or STABLE function cannot be indexed at all, and SECURITY
-- INVOKER, because a pure text transform has no business running as its owner.
-- Row 3 is the standing rule that the TRIALLED SHAPE MUST STAY GONE: neither
-- table may carry `search_config` or `search_text` again, because a reg* column
-- does not survive a restore as the same config and a stored projection is a
-- second definition that will drift from the TypeScript one. Row 4 is the
-- execution lockdown -- PUBLIC and anon must hold nothing.
--
-- WHY authenticated MAY EXECUTE. Whether an INDEX expression is evaluated with
-- the privileges of the writing role is not something this rollout is willing to
-- guess at, and the failure mode if it is -- every padlet insert and update
-- refused -- is the app breaking for a reason nobody would look for. The
-- function reads no table, no row and no session, so the grant costs nothing.
--
-- THE FIXTURES ARE THE CONTRACT, AND THEY ARE ASSERTED TWICE. The eleven pairs
-- in the second query are the same eleven asserted against the live TypeScript
-- by lib/server/ai/boardPlainTextProjection.test.ts. The two lists must stay
-- identical: a fixture added in one belongs in the other, or the two sides can
-- drift with both suites green. Fixture 11 (`<br />`) exists specifically to
-- prove the whitespace class in the br pattern matches anything at all --
-- fixture 9 (`<br>`) would pass even if it matched nothing.
--
-- WHAT A PASS DOES NOT MEAN. This verifies the DATABASE half only.
--
--   * It does not mean search works. Nothing reads these objects yet; the
--     search function and its reader ship later.
--   * It does not mean the two projections agree on ALL input, only on the
--     eleven fixtures. One known difference is deliberate and unfixtured:
--     `btrim` here strips space, tab, newline and carriage return, while
--     JavaScript's `trim()` also strips U+000B, U+000C, U+00A0, U+1680,
--     U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. It can
--     only show as a RAW one of those at the very start or end of a post body.
--   * It does not mean the planner will use the padlets index. Row 6 asserts the
--     partial predicate exists; a query that omits `type IN ('text','note')`
--     from its own WHERE clause cannot use the index no matter what this says.

BEGIN TRANSACTION READ ONLY;

WITH fn AS (
    SELECT p.oid,
           p.provolatile,
           p.prosecdef,
           p.proacl
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'plain_text_from_post_content'
),
-- Who may EXECUTE the projection, by role name. grantee 0 is PUBLIC, which is
-- the DEFAULT grant on a new function and therefore the one that must be
-- visibly absent rather than merely inferred.
fn_grants AS (
    SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM fn, aclexplode(fn.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
-- Any surviving trace of the rejected trial, on either table.
trial_cols AS (
    SELECT c.relname || '.' || a.attname AS col
      FROM pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('padlets', 'knowledge_chunks')
       AND a.attname IN ('search_config', 'search_text')
       AND NOT a.attisdropped
),
idx AS (
    SELECT c.relname AS name, pg_get_indexdef(c.oid) AS def
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('knowledge_chunks_search_gin', 'padlets_search_gin')
),
invariants AS (
    SELECT 1 AS ord, 'function'::text AS section,
           'the projection exists and is IMMUTABLE'::text AS check_name,
           COALESCE((SELECT CASE provolatile WHEN 'i' THEN 'immutable'
                                             WHEN 's' THEN 'stable'
                                             ELSE 'volatile' END FROM fn), '(absent)') AS actual,
           COALESCE((SELECT provolatile = 'i' FROM fn), false) AS pass
    UNION ALL SELECT 2, 'function', 'the projection is SECURITY INVOKER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END FROM fn), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM fn), false)
    -- THE STANDING RULE. The trialled shape must stay gone from BOTH tables.
    UNION ALL SELECT 3, 'invariant', 'no search_config or search_text column exists on either table',
           COALESCE((SELECT string_agg(col, ', ' ORDER BY col) FROM trial_cols), '(none)'),
           (SELECT count(*) = 0 FROM trial_cols)
    UNION ALL SELECT 4, 'authorization', 'PUBLIC and anon may not execute the projection',
           COALESCE((SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee) FROM fn_grants), '(none)'),
           NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon'))
    UNION ALL SELECT 5, 'authorization', 'authenticated and service_role may execute the projection',
           COALESCE((SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee) FROM fn_grants), '(none)'),
           EXISTS (SELECT 1 FROM fn_grants WHERE grantee = 'authenticated')
           AND EXISTS (SELECT 1 FROM fn_grants WHERE grantee = 'service_role')
    UNION ALL SELECT 6, 'index', 'padlets_search_gin exists and is partial on text/note',
           COALESCE((SELECT def FROM idx WHERE name = 'padlets_search_gin'), '(absent)'),
           COALESCE((SELECT def LIKE '%USING gin%' AND def LIKE '%WHERE%type%'
                          AND def LIKE '%''text''%' AND def LIKE '%''note''%'
                       FROM idx WHERE name = 'padlets_search_gin'), false)
    UNION ALL SELECT 7, 'index', 'knowledge_chunks_search_gin exists over to_tsvector(simple, text)',
           COALESCE((SELECT def FROM idx WHERE name = 'knowledge_chunks_search_gin'), '(absent)'),
           COALESCE((SELECT def LIKE '%USING gin%' AND def LIKE '%to_tsvector%' AND def LIKE '%simple%'
                       FROM idx WHERE name = 'knowledge_chunks_search_gin'), false)
    -- Nothing here should have disturbed either table's own gate.
    UNION ALL SELECT 8, 'attributes', 'row level security is still enabled on padlets and knowledge_chunks',
           (SELECT string_agg(c.relname || '=' || c.relrowsecurity::text, ' ' ORDER BY c.relname)
              FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname IN ('padlets', 'knowledge_chunks')),
           (SELECT bool_and(c.relrowsecurity)
              FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname IN ('padlets', 'knowledge_chunks'))
    -- anon never needed a write on padlets, so it must not have one to explain
    -- why the EXECUTE revoke above costs it nothing.
    UNION ALL SELECT 9, 'authorization', 'anon holds no write on padlets',
           (SELECT string_agg(p || '=' || has_table_privilege('anon', 'public.padlets', p)::text, ' ')
              FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) AS p),
           (SELECT bool_and(NOT has_table_privilege('anon', 'public.padlets', p))
              FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) AS p)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- THE ELEVEN FIXTURES. Identical to lib/server/ai/boardPlainTextProjection.test.ts.
--
-- REQUIRES THE FUNCTION. This query and the roll-up after it name the projection,
-- so on a database without it both raise 42883 and abort the batch. Rows 1 and 2
-- above are the early warning: if they read '(absent)', stop there -- everything
-- below is already answered. See the header for why no SQL guard avoids this.
-- `expected` is what the LIVE TypeScript produces; SQL is the port, so a
-- disagreement is the SQL being wrong until a PM says otherwise.
WITH fixtures(ord, input, expected) AS (
    VALUES
        ( 1, '<p>Hello &amp; bye</p>',            'Hello & bye'),
        ( 2, '<p>R&amp;D</p>',                    'R&D'),
        ( 3, '<p>a</p><p>b</p>',                  E'a\nb'),
        ( 4, '<p>&lt;script&gt;</p>',             '<script>'),
        -- &amp; is decoded BEFORE &lt;, so this decodes twice. Arguably wrong,
        -- and it is what the live implementation does.
        ( 5, '<p>&amp;lt;</p>',                   '<'),
        ( 6, '<p>don&#39;t</p>',                  'don''t'),
        ( 7, '<p>a&nbsp;b</p>',                   'a b'),
        -- Tags are REMOVED, not replaced by a space: "foobar", never "foo bar".
        ( 8, '<p>foo<strong>bar</strong></p>',    'foobar'),
        ( 9, '<p>a<br>b</p>',                     E'a\nb'),
        -- The only fixture that proves the whitespace class matches anything.
        (10, '<p>a<br />b</p>',                   E'a\nb'),
        -- Four newlines collapse to two, then the trailing one is trimmed.
        (11, '<p>a</p><p></p><p></p><p>b</p>',    E'a\n\nb')
)
SELECT ord,
       input,
       expected,
       public.plain_text_from_post_content(input) AS actual,
       public.plain_text_from_post_content(input) IS NOT DISTINCT FROM expected AS pass,
       bool_and(public.plain_text_from_post_content(input) IS NOT DISTINCT FROM expected)
         OVER () AS fixtures_readiness
  FROM fixtures ORDER BY ord;

-- The single roll-up. Same sources as the rows above, so it cannot disagree.
WITH fn AS (
    SELECT p.provolatile, p.prosecdef, p.proacl
      FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'plain_text_from_post_content'
),
fn_grants AS (
    SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM fn, aclexplode(fn.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
trial_cols AS (
    SELECT 1 FROM pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('padlets', 'knowledge_chunks')
       AND a.attname IN ('search_config', 'search_text')
       AND NOT a.attisdropped
),
idx AS (
    SELECT c.relname AS name FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('knowledge_chunks_search_gin', 'padlets_search_gin')
),
fixtures(input, expected) AS (
    VALUES ('<p>Hello &amp; bye</p>', 'Hello & bye'), ('<p>R&amp;D</p>', 'R&D'),
           ('<p>a</p><p>b</p>', E'a\nb'), ('<p>&lt;script&gt;</p>', '<script>'),
           ('<p>&amp;lt;</p>', '<'), ('<p>don&#39;t</p>', 'don''t'),
           ('<p>a&nbsp;b</p>', 'a b'), ('<p>foo<strong>bar</strong></p>', 'foobar'),
           ('<p>a<br>b</p>', E'a\nb'), ('<p>a<br />b</p>', E'a\nb'),
           ('<p>a</p><p></p><p></p><p>b</p>', E'a\n\nb')
)
SELECT
    CASE WHEN (SELECT provolatile = 'i' AND NOT prosecdef FROM fn)
              AND (SELECT count(*) = 0 FROM trial_cols)
              AND (SELECT count(*) = 2 FROM idx)
              AND NOT EXISTS (SELECT 1 FROM fn_grants WHERE grantee IN ('PUBLIC', 'anon'))
              AND (SELECT bool_and(public.plain_text_from_post_content(input)
                                     IS NOT DISTINCT FROM expected) FROM fixtures)
         THEN 'PASS' ELSE 'FAIL' END                                     AS rollup,
    (SELECT count(*) FROM idx)                                           AS search_indexes_present,
    (SELECT count(*) FROM trial_cols)                                    AS trialled_columns_remaining,
    COALESCE((SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee) FROM fn_grants), '(none)')
                                                                         AS projection_execute_grants,
    (SELECT count(*) FROM fixtures
      WHERE public.plain_text_from_post_content(input) IS NOT DISTINCT FROM expected)
                                                                         AS fixtures_passing,
    (SELECT count(*) FROM fixtures)                                      AS fixtures_total,
    (SELECT count(*) FROM public.padlets)                                AS padlet_rows,
    -- Not an invariant, a standing reminder: nothing reads these objects yet, so
    -- a PASS says the foundation is correct, never that search works.
    'nothing reads the function or either index yet; the reader ships later'::text
                                                                         AS recorded_limitation;

ROLLBACK;
