-- Read-only verification for
-- 20260916130000_repair_get_board_permission.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog only, runs unchanged
-- inside `BEGIN TRANSACTION READ ONLY`, and is safe before a rollout, after
-- one, or against a partial state.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row -- no separate roll-up can drift from the rows
-- above it. Scan for `pass = f`, or read readiness from any row.
--
-- RUN IT TWICE: once BEFORE the rollout and once AFTER.
--   BEFORE: the body rows fail (it still names canvases) and row 10 fails
--           (anon still holds EXECUTE).
--   AFTER:  every row passes.
--
-- TWO HALVES, BOTH REQUIRED. The rollout is a bug fix AND a security
-- correction, and either without the other is a bad outcome: the old body with
-- the revoke is still broken sharing, and the new body WITHOUT the revoke is an
-- anonymous permission oracle -- strictly worse than the bug, because the bug
-- was the only thing hiding it. Rows 1-8 check the repair; rows 9-12 check the
-- grants. A run where one half passes and the other does not is a FAIL.

BEGIN TRANSACTION READ ONLY;

WITH expected AS (
    SELECT to_regprocedure('public.get_board_permission(uuid, uuid)')::oid AS fn
),
fn AS (
    SELECT p.prosrc AS src,
           p.provolatile, p.prosecdef,
           COALESCE(p.proconfig, ARRAY[]::text[]) AS config,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_arguments(p.oid)          AS args_with_defaults,
           t.typname                                 AS rettype,
           p.pronargdefaults                         AS ndefaults
      FROM pg_proc AS p
      JOIN pg_type AS t ON t.oid = p.prorettype
     WHERE p.oid = (SELECT fn FROM expected)
),
invariants AS (
    SELECT 1 AS ord, 'signature'::text AS section,
           'the function still exists as get_board_permission(uuid, uuid)'::text AS check_name,
           COALESCE((SELECT args FROM fn), '(absent)') AS actual,
           COALESCE((SELECT args = 'uuid, uuid' FROM fn), false) AS pass
    UNION ALL SELECT 2, 'signature', 'it still returns board_permission_level',
           COALESCE((SELECT rettype FROM fn), '(absent)'),
           COALESCE((SELECT rettype = 'board_permission_level' FROM fn), false)
    -- lib/auth/permissions.ts calls this facade; a lost DEFAULT would change
    -- every caller that relies on auth.uid().
    UNION ALL SELECT 3, 'signature', 'user_uuid still defaults to auth.uid()',
           COALESCE((SELECT args_with_defaults FROM fn), '(absent)'),
           COALESCE((SELECT ndefaults = 1 AND args_with_defaults LIKE '%DEFAULT auth.uid()%' FROM fn), false)
    UNION ALL SELECT 4, 'attributes', 'still STABLE',
           COALESCE((SELECT provolatile::text FROM fn), '(absent)'),
           COALESCE((SELECT provolatile = 's' FROM fn), false)
    UNION ALL SELECT 5, 'attributes', 'still SECURITY DEFINER',
           COALESCE((SELECT prosecdef::text FROM fn), '(absent)'),
           COALESCE((SELECT prosecdef FROM fn), false)
    UNION ALL SELECT 6, 'attributes', 'search_path is still pinned to public',
           COALESCE((SELECT array_to_string(config, ',') FROM fn), '(absent)'),
           COALESCE((SELECT 'search_path=public' = ANY(config) FROM fn), false)
    UNION ALL SELECT 7, 'body', 'it resolves from boards and board_collaborators',
           COALESCE((SELECT (position('public.boards' IN src) > 0)::text FROM fn), '(absent)'),
           COALESCE((SELECT position('public.boards' IN src) > 0
                       AND position('public.board_collaborators' IN src) > 0 FROM fn), false)
    -- The whole point of the repair: `canvases` holds one row and no board in
    -- use, so any surviving reference to it is a silent deny waiting to happen.
    --
    -- Matched on 'FROM canvases', not on the bare word: the repaired body's own
    -- comments name `canvases` several times to explain what it stopped reading
    -- and why, and prosrc includes comments. A bare-word test would fail a
    -- CORRECT apply -- it would be checking the explanation, not the code.
    -- `canvas_collaborators` is matched bare because the repaired body never
    -- mentions it at all.
    UNION ALL SELECT 8, 'body', 'it no longer reads from canvases or canvas_collaborators',
           COALESCE((SELECT 'FROM canvases@' || position('FROM canvases' IN src)::text
                            || ' canvas_collaborators@' || position('canvas_collaborators' IN src)::text
                       FROM fn), '(absent)'),
           COALESCE((SELECT position('FROM canvases' IN src) = 0
                       AND position('canvas_collaborators' IN src) = 0 FROM fn), false)
    UNION ALL SELECT 9, 'body', 'the owner, workspace and collaborator authorities all survive',
           COALESCE((SELECT (position('get_workspace_role' IN src) > 0)::text FROM fn), '(absent)'),
           COALESCE((SELECT position('b.user_id = user_uuid' IN src) > 0
                       AND position('get_workspace_role' IN src) > 0
                       AND position('c.user_id = user_uuid' IN src) > 0 FROM fn), false)
    -- THE SECURITY HALF. A SECURITY DEFINER function answering "what permission
    -- does user X have on board Y" must not be reachable without authenticating.
    UNION ALL SELECT 10, 'authorization', 'anon can NO LONGER execute it',
           COALESCE((SELECT has_function_privilege('anon', fn, 'EXECUTE')::text FROM expected), '(absent)'),
           COALESCE((SELECT NOT has_function_privilege('anon', fn, 'EXECUTE') FROM expected), false)
    UNION ALL SELECT 11, 'authorization', 'authenticated can still execute it (getAuthContext depends on this)',
           COALESCE((SELECT has_function_privilege('authenticated', fn, 'EXECUTE')::text FROM expected), '(absent)'),
           COALESCE((SELECT has_function_privilege('authenticated', fn, 'EXECUTE') FROM expected), false)
    UNION ALL SELECT 12, 'authorization', 'service_role can still execute it',
           COALESCE((SELECT has_function_privilege('service_role', fn, 'EXECUTE')::text FROM expected), '(absent)'),
           COALESCE((SELECT has_function_privilege('service_role', fn, 'EXECUTE') FROM expected), false)
    -- PUBLIC is the grant that makes every future role executable by default,
    -- so it is checked by its own acl entry rather than inferred from anon.
    UNION ALL SELECT 13, 'authorization', 'no PUBLIC execute entry remains in the acl',
           COALESCE((SELECT string_agg(COALESCE(pg_get_userbyid(a.grantee), 'PUBLIC') || ':' || a.privilege_type, ', ')
                       FROM pg_proc AS p, aclexplode(p.proacl) AS a
                      WHERE p.oid = (SELECT fn FROM expected) AND a.grantee = 0), '(none)'),
           NOT EXISTS (SELECT 1 FROM pg_proc AS p, aclexplode(p.proacl) AS a
                        WHERE p.oid = (SELECT fn FROM expected) AND a.grantee = 0)
    UNION ALL SELECT 14, 'prerequisites', 'get_workspace_role still exists and returns workspace_role',
           COALESCE((SELECT t.typname FROM pg_proc AS p JOIN pg_type AS t ON t.oid = p.prorettype
                      WHERE p.oid = to_regprocedure('public.get_workspace_role(uuid, uuid)')::oid), '(absent)'),
           COALESCE((SELECT t.typname = 'workspace_role' FROM pg_proc AS p JOIN pg_type AS t ON t.oid = p.prorettype
                      WHERE p.oid = to_regprocedure('public.get_workspace_role(uuid, uuid)')::oid), false)
    UNION ALL SELECT 15, 'prerequisites', 'boards and board_collaborators both exist',
           COALESCE(to_regclass('public.boards')::text, '(absent)')
             || ' / ' || COALESCE(to_regclass('public.board_collaborators')::text, '(absent)'),
           to_regclass('public.boards') IS NOT NULL
             AND to_regclass('public.board_collaborators') IS NOT NULL
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up. Same source as the rows above, so it cannot disagree.
WITH expected AS (
    SELECT to_regprocedure('public.get_board_permission(uuid, uuid)')::oid AS fn
),
fn AS (
    SELECT p.prosrc AS src FROM pg_proc AS p WHERE p.oid = (SELECT fn FROM expected)
)
SELECT
    CASE WHEN (SELECT position('public.boards' IN src) > 0 AND position('FROM canvases' IN src) = 0 FROM fn)
          AND NOT (SELECT has_function_privilege('anon', fn, 'EXECUTE') FROM expected)
          AND (SELECT has_function_privilege('authenticated', fn, 'EXECUTE') FROM expected)
         THEN 'PASS' ELSE 'FAIL' END                                  AS rollup,
    (SELECT position('public.boards' IN src) > 0 FROM fn)             AS reads_boards,
    (SELECT position('FROM canvases' IN src) = 0 FROM fn)             AS canvases_gone,
    (SELECT has_function_privilege('anon', fn, 'EXECUTE') FROM expected)          AS anon_can_execute,
    (SELECT has_function_privilege('authenticated', fn, 'EXECUTE') FROM expected) AS authenticated_can_execute;

ROLLBACK;
