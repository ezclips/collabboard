-- Read-only verification for
-- 20260916140000_revoke_anon_execute_security_definer.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog only, runs unchanged
-- inside `BEGIN TRANSACTION READ ONLY`, and is safe before a rollout, after
-- one, or against a partial state.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from
-- any row.
--
-- ROW 4 IS THE IMPORTANT ONE, AND IT IS AN EQUALITY, NOT A COUNT. It pins the
-- set of OUR SECURITY DEFINER functions that still hold anon EXECUTE as exactly
-- the six Group B names. A count would pass while one name was swapped for
-- another; an equality cannot. That row is what makes a future grant --
-- deliberate or accidental -- visible instead of silent, and it is the reason
-- to re-run this verifier periodically rather than only at rollout time.
--
-- WHAT A PASS DOES NOT MEAN. Six functions remain anon-executable on purpose,
-- because live policies scoped `TO public` reference them. A pass here means
-- "the thirteen provably-safe ones are closed AND the remaining surface is
-- still exactly the six we accepted" -- NOT that the surface is closed.
-- pg_catalog is filtered to our own functions throughout: the three PostGIS
-- st_estimatedextent functions are not ours to re-grant and never appear.

BEGIN TRANSACTION READ ONLY;

WITH revoked AS (
    -- The thirteen this migration closes, by exact signature.
    SELECT unnest(ARRAY[
        'public.is_board_member(uuid, uuid)',
        'public.can_read_board(uuid, uuid)',
        'public.can_comment_board(uuid, uuid)',
        'public.can_manage_board(uuid, uuid)',
        'public.can_edit_workspace(uuid, uuid)',
        'public.get_board_members_with_profile(uuid)',
        'public.log_canvas_activity(uuid, uuid, text, jsonb)',
        'public.handle_new_user()',
        'public.handle_new_canvas()',
        'public.is_canvas_admin(uuid, uuid)',
        'public.get_canvas_with_permission(uuid, uuid)',
        'public.check_canvas_permission(uuid, uuid, public.permission_level)',
        'public.check_canvas_permission(uuid, uuid, text)'
    ]) AS sig
),
resolved AS (
    SELECT sig, to_regprocedure(sig)::oid AS fn FROM revoked
),
-- Every SECURITY DEFINER function OF OURS still executable by anon. Filtered to
-- functions owned in `public` and excluding the PostGIS extension's own, which
-- are not ours to change.
remaining AS (
    SELECT p.oid, p.proname,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
      FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend AS d
              JOIN pg_extension AS e ON e.oid = d.refobjid
             WHERE d.objid = p.oid AND d.deptype = 'e')
),
expected_remaining AS (
    SELECT unnest(ARRAY[
        'can_access_board', 'can_edit_board', 'can_manage_workspace',
        'get_workspace_role', 'has_workspace_access', 'is_platform_admin'
    ]) AS proname
),
invariants AS (
    SELECT 1 AS ord, 'prerequisites'::text AS section,
           'all thirteen signatures still resolve to a function'::text AS check_name,
           COALESCE((SELECT string_agg(sig, ', ') FROM resolved WHERE fn IS NULL), '(all resolve)') AS actual,
           NOT EXISTS (SELECT 1 FROM resolved WHERE fn IS NULL) AS pass
    UNION ALL SELECT 2, 'authorization', 'none of the thirteen is executable by anon',
           COALESCE((SELECT string_agg(sig, ', ') FROM resolved
                      WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE')),
                    '(none)'),
           NOT EXISTS (SELECT 1 FROM resolved
                        WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE'))
    -- PUBLIC is the grant that makes every future role executable by default,
    -- so it is checked by acl entry rather than inferred from anon.
    UNION ALL SELECT 3, 'authorization', 'no PUBLIC execute entry remains on any of the thirteen',
           COALESCE((SELECT string_agg(r.sig, ', ') FROM resolved AS r, pg_proc AS p, aclexplode(p.proacl) AS a
                      WHERE p.oid = r.fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), '(none)'),
           NOT EXISTS (SELECT 1 FROM resolved AS r, pg_proc AS p, aclexplode(p.proacl) AS a
                        WHERE p.oid = r.fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    -- THE SURFACE PIN. Equality both ways: nothing unexpected has anon EXECUTE,
    -- and nothing expected has quietly lost it (which would mean someone
    -- revoked a Group B function without narrowing its policies first, turning
    -- anonymous reads into errors).
    UNION ALL SELECT 4, 'surface', 'the remaining anon-executable set is EXACTLY the six accepted names',
           COALESCE((SELECT string_agg(sig, ', ' ORDER BY sig) FROM remaining), '(none)'),
           NOT EXISTS (SELECT proname FROM remaining EXCEPT SELECT proname FROM expected_remaining)
             AND NOT EXISTS (SELECT proname FROM expected_remaining EXCEPT SELECT proname FROM remaining)
    UNION ALL SELECT 5, 'surface', 'nothing unexpected gained anon execute',
           COALESCE((SELECT string_agg(sig, ', ' ORDER BY sig) FROM remaining
                      WHERE proname NOT IN (SELECT proname FROM expected_remaining)), '(none)'),
           NOT EXISTS (SELECT 1 FROM remaining
                        WHERE proname NOT IN (SELECT proname FROM expected_remaining))
    -- The application calls these two on session clients; revoking
    -- `authenticated` would break five call sites and two respectively.
    UNION ALL SELECT 6, 'authorization', 'authenticated can still execute is_board_member',
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.is_board_member(uuid, uuid)')::oid, 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.is_board_member(uuid, uuid)')::oid, 'EXECUTE'), false)
    UNION ALL SELECT 7, 'authorization', 'authenticated can still execute get_board_members_with_profile',
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.get_board_members_with_profile(uuid)')::oid, 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.get_board_members_with_profile(uuid)')::oid, 'EXECUTE'), false)
    UNION ALL SELECT 8, 'authorization', 'service_role can still execute all thirteen',
           COALESCE((SELECT string_agg(sig, ', ') FROM resolved
                      WHERE fn IS NOT NULL AND NOT has_function_privilege('service_role', fn, 'EXECUTE')),
                    '(all executable)'),
           NOT EXISTS (SELECT 1 FROM resolved
                        WHERE fn IS NOT NULL AND NOT has_function_privilege('service_role', fn, 'EXECUTE'))
    -- Revoking EXECUTE must not have altered what the functions ARE.
    UNION ALL SELECT 9, 'attributes', 'all thirteen are still SECURITY DEFINER',
           COALESCE((SELECT string_agg(r.sig, ', ') FROM resolved AS r JOIN pg_proc AS p ON p.oid = r.fn
                      WHERE NOT p.prosecdef), '(all definer)'),
           NOT EXISTS (SELECT 1 FROM resolved AS r JOIN pg_proc AS p ON p.oid = r.fn WHERE NOT p.prosecdef)
    UNION ALL SELECT 10, 'prerequisites', 'both check_canvas_permission overloads exist and are distinct',
           COALESCE((SELECT count(DISTINCT fn)::text FROM resolved WHERE sig LIKE '%check_canvas_permission%'), '(absent)'),
           COALESCE((SELECT count(DISTINCT fn) = 2 FROM resolved WHERE sig LIKE '%check_canvas_permission%'), false)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up, with the remaining surface spelled out so it is read and
-- not merely counted. Same source as the rows above, so it cannot disagree.
WITH resolved AS (
    SELECT to_regprocedure(sig)::oid AS fn FROM unnest(ARRAY[
        'public.is_board_member(uuid, uuid)',
        'public.can_read_board(uuid, uuid)',
        'public.can_comment_board(uuid, uuid)',
        'public.can_manage_board(uuid, uuid)',
        'public.can_edit_workspace(uuid, uuid)',
        'public.get_board_members_with_profile(uuid)',
        'public.log_canvas_activity(uuid, uuid, text, jsonb)',
        'public.handle_new_user()',
        'public.handle_new_canvas()',
        'public.is_canvas_admin(uuid, uuid)',
        'public.get_canvas_with_permission(uuid, uuid)',
        'public.check_canvas_permission(uuid, uuid, public.permission_level)',
        'public.check_canvas_permission(uuid, uuid, text)'
    ]) AS sig
),
remaining AS (
    SELECT p.proname
      FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend AS d
              JOIN pg_extension AS e ON e.oid = d.refobjid
             WHERE d.objid = p.oid AND d.deptype = 'e')
),
expected_remaining AS (
    SELECT unnest(ARRAY['can_access_board','can_edit_board','can_manage_workspace',
                        'get_workspace_role','has_workspace_access','is_platform_admin']) AS proname
)
SELECT
    CASE WHEN NOT EXISTS (SELECT 1 FROM resolved
                           WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE'))
          AND NOT EXISTS (SELECT proname FROM remaining EXCEPT SELECT proname FROM expected_remaining)
          AND NOT EXISTS (SELECT proname FROM expected_remaining EXCEPT SELECT proname FROM remaining)
         THEN 'PASS' ELSE 'FAIL' END                                       AS rollup,
    (SELECT count(*) FROM resolved
      WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE')) AS thirteen_still_open,
    (SELECT count(*) FROM remaining)                                       AS remaining_anon_executable,
    (SELECT string_agg(proname, ', ' ORDER BY proname) FROM remaining)     AS remaining_surface,
    'group B: policies TO public reference these; narrow the policies first'::text AS remaining_reason;

ROLLBACK;
