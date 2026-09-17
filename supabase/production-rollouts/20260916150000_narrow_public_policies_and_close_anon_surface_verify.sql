-- Read-only verification for
-- 20260916150000_narrow_public_policies_and_close_anon_surface.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog and pg_policies only,
-- runs unchanged inside `BEGIN TRANSACTION READ ONLY`, and is safe before a
-- rollout, after one, or against a partial state.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from
-- any row.
--
-- ROW 7 IS THE SURFACE PIN, AND IT IS AN EQUALITY, NOT A COUNT: the set of OUR
-- non-extension SECURITY DEFINER functions still holding anon EXECUTE must be
-- EMPTY. The set is printed, not counted, so a future grant -- deliberate or
-- accidental -- is read rather than inferred. This is the reason to re-run this
-- verifier periodically and not only at rollout time. The three PostGIS
-- st_estimatedextent functions are excluded throughout: they belong to the
-- extension and are not ours to change.
--
-- ROWS 4 AND 5 ARE THE BEHAVIOUR CLAIM. The whole argument for this migration
-- is that the anonymous invitation-link branch is PRESERVED VERBATIM. Row 4
-- checks the new policy's deparsed predicate against the expected text
-- character for character (whitespace collapsed, since the deparser chooses its
-- own layout); row 5 checks it is still SELECT and still `TO public`. If either
-- fails, the split silently widened or narrowed anonymous access and must not
-- be accepted.
--
-- ROWS 8 AND 9 GUARD THE NON-POLICY CALLERS. get_workspace_role is called by
-- the repaired get_board_permission, and is_platform_admin by getAuthContext on
-- a session client; both run as `authenticated`. service_role keeps EXECUTE on
-- all six for the server-side paths.

BEGIN TRANSACTION READ ONLY;

WITH narrowed AS (
    -- The twenty-five narrowed to `authenticated`, as (table, policy) pairs.
    SELECT * FROM (VALUES
        ('freeform_graph_settings', 'Users can select freeform settings of their boards'),
        ('freeform_graph_settings', 'Users can insert freeform settings of their boards'),
        ('freeform_graph_settings', 'Users can update freeform settings of their boards'),
        ('customers',               'Workspace managers can manage customers'),
        ('customers',               'Workspace members can view customers'),
        ('subscriptions',           'Workspace managers can manage subscriptions'),
        ('subscriptions',           'Workspace members can view subscriptions'),
        ('teams',                   'Workspace managers can delete teams'),
        ('teams',                   'Workspace managers can insert teams'),
        ('teams',                   'Workspace managers can update teams'),
        ('teams',                   'Workspace managers can view teams'),
        ('workspace_members',       'Workspace managers can delete memberships'),
        ('workspace_members',       'Workspace managers can insert memberships'),
        ('workspace_members',       'Workspace managers can update memberships'),
        ('workspace_members',       'Workspace members can view memberships'),
        ('workspace_settings',      'Workspace managers can insert workspace settings'),
        ('workspace_settings',      'Workspace managers can update workspace settings'),
        ('workspace_settings',      'Workspace members can view workspace settings'),
        ('workspace_settings',      'Workspace owners can delete workspace settings'),
        ('workspaces',              'Users can view workspaces they belong to'),
        ('platform_admins',         'Platform admins can delete platform admins'),
        ('platform_admins',         'Platform admins can insert platform admins'),
        ('platform_admins',         'Platform admins can update platform admins'),
        ('platform_admins',         'Platform admins can view platform admins'),
        ('webhook_events',          'Platform admins can view webhook events')
    ) AS t(tablename, policyname)
),
live AS (
    SELECT n.tablename, n.policyname, p.roles, p.cmd,
           (p.policyname IS NOT NULL) AS present
      FROM narrowed AS n
      LEFT JOIN pg_policies AS p
             ON p.schemaname = 'public'
            AND p.tablename = n.tablename
            AND p.policyname = n.policyname
),
-- The six, by exact signature. is_platform_admin takes ONE argument.
six AS (
    SELECT unnest(ARRAY[
        'public.can_access_board(uuid, uuid)',
        'public.can_edit_board(uuid, uuid)',
        'public.can_manage_workspace(uuid, uuid)',
        'public.get_workspace_role(uuid, uuid)',
        'public.has_workspace_access(uuid, uuid)',
        'public.is_platform_admin(uuid)'
    ]) AS sig
),
resolved AS (
    SELECT sig, to_regprocedure(sig)::oid AS fn FROM six
),
-- Every SECURITY DEFINER function OF OURS still executable by anon, excluding
-- extension-owned ones (PostGIS).
remaining AS (
    SELECT p.proname,
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
-- The preserved anonymous branch, as the deparser renders it. Whitespace is
-- collapsed on both sides because the deparser picks its own layout; every
-- other character must match.
link_policy AS (
    SELECT roles, cmd,
           regexp_replace(COALESCE(qual, ''), '\s+', ' ', 'g') AS flat_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'workspace_invitations'
       AND policyname = 'Anyone can view an active link invitation'
),
invariants AS (
    SELECT 1 AS ord, 'prerequisites'::text AS section,
           'all twenty-five narrowed policies still exist'::text AS check_name,
           COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ')
                       FROM live WHERE NOT present), '(all present)') AS actual,
           NOT EXISTS (SELECT 1 FROM live WHERE NOT present) AS pass
    -- The narrowing itself: roles must be EXACTLY {authenticated}. An extra
    -- role in the array would leave the public evaluation in place.
    UNION ALL SELECT 2, 'policy roles', 'all twenty-five are scoped to exactly {authenticated}',
           COALESCE((SELECT string_agg(tablename || '.' || policyname || ' => ' || roles::text, ', ')
                       FROM live WHERE present AND roles <> ARRAY['authenticated']::name[]),
                    '(all authenticated)'),
           NOT EXISTS (SELECT 1 FROM live WHERE present AND roles <> ARRAY['authenticated']::name[])
    UNION ALL SELECT 3, 'policy roles', 'the invitations manager policy is scoped to {authenticated}',
           COALESCE((SELECT roles::text FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'workspace_invitations'
                        AND policyname = 'Workspace managers can view invitations'), '(absent)'),
           COALESCE((SELECT roles = ARRAY['authenticated']::name[] FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'workspace_invitations'
                        AND policyname = 'Workspace managers can view invitations'), false)
    -- THE BEHAVIOUR CLAIM. The anonymous link branch must be preserved exactly.
    UNION ALL SELECT 4, 'preserved branch', 'the added policy''s predicate is character-identical to the link branch',
           COALESCE((SELECT flat_qual FROM link_policy), '(absent)'),
           COALESCE((SELECT flat_qual FROM link_policy) =
                    '((type = ''link''::text) AND (link_code IS NOT NULL) AND (redeemed_at IS NULL) '
                    || 'AND ((expires_at IS NULL) OR (expires_at > now())) '
                    || 'AND ((max_uses IS NULL) OR (uses < max_uses)))', false)
    UNION ALL SELECT 5, 'preserved branch', 'the added policy is SELECT and scoped to {public}',
           COALESCE((SELECT cmd || ' ' || roles::text FROM link_policy), '(absent)'),
           COALESCE((SELECT cmd = 'SELECT' AND roles = ARRAY['public']::name[] FROM link_policy), false)
    UNION ALL SELECT 6, 'authorization', 'none of the six is executable by anon',
           COALESCE((SELECT string_agg(sig, ', ') FROM resolved
                      WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE')), '(none)'),
           NOT EXISTS (SELECT 1 FROM resolved
                        WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE'))
    -- THE SURFACE PIN. Not a count: the set itself, and it must be empty.
    UNION ALL SELECT 7, 'surface', 'no SECURITY DEFINER function of ours is anon-executable',
           COALESCE((SELECT string_agg(sig, ', ' ORDER BY sig) FROM remaining), '(none)'),
           NOT EXISTS (SELECT 1 FROM remaining)
    -- The two callers that are not policy evaluation.
    UNION ALL SELECT 8, 'authorization', 'authenticated can still execute get_workspace_role and is_platform_admin',
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.get_workspace_role(uuid, uuid)')::oid, 'EXECUTE')::text, '(absent)')
           || ' / ' ||
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.is_platform_admin(uuid)')::oid, 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.get_workspace_role(uuid, uuid)')::oid, 'EXECUTE'), false)
           AND COALESCE(has_function_privilege('authenticated',
                    to_regprocedure('public.is_platform_admin(uuid)')::oid, 'EXECUTE'), false)
    UNION ALL SELECT 9, 'authorization', 'service_role can still execute all six',
           COALESCE((SELECT string_agg(sig, ', ') FROM resolved
                      WHERE fn IS NOT NULL AND NOT has_function_privilege('service_role', fn, 'EXECUTE')),
                    '(all executable)'),
           NOT EXISTS (SELECT 1 FROM resolved
                        WHERE fn IS NOT NULL AND NOT has_function_privilege('service_role', fn, 'EXECUTE'))
    -- PUBLIC is the grant that makes every future role executable by default,
    -- so it is checked by acl entry rather than inferred from anon.
    UNION ALL SELECT 10, 'authorization', 'no PUBLIC execute entry remains on any of the six',
           COALESCE((SELECT string_agg(r.sig, ', ') FROM resolved AS r, pg_proc AS p, aclexplode(p.proacl) AS a
                      WHERE p.oid = r.fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), '(none)'),
           NOT EXISTS (SELECT 1 FROM resolved AS r, pg_proc AS p, aclexplode(p.proacl) AS a
                        WHERE p.oid = r.fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    -- Changing grants must not have changed what the functions ARE.
    UNION ALL SELECT 11, 'attributes', 'all six still resolve and are still SECURITY DEFINER',
           COALESCE((SELECT string_agg(r.sig, ', ') FROM resolved AS r
                      LEFT JOIN pg_proc AS p ON p.oid = r.fn
                      WHERE r.fn IS NULL OR NOT p.prosecdef), '(all definer)'),
           NOT EXISTS (SELECT 1 FROM resolved AS r LEFT JOIN pg_proc AS p ON p.oid = r.fn
                        WHERE r.fn IS NULL OR NOT p.prosecdef)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up, with the remaining surface spelled out so it is read and
-- not merely counted. Same source as the rows above, so it cannot disagree.
WITH resolved AS (
    SELECT to_regprocedure(sig)::oid AS fn FROM unnest(ARRAY[
        'public.can_access_board(uuid, uuid)',
        'public.can_edit_board(uuid, uuid)',
        'public.can_manage_workspace(uuid, uuid)',
        'public.get_workspace_role(uuid, uuid)',
        'public.has_workspace_access(uuid, uuid)',
        'public.is_platform_admin(uuid)'
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
still_public AS (
    SELECT p.tablename, p.policyname
      FROM pg_policies AS p
     WHERE p.schemaname = 'public'
       AND p.roles = ARRAY['public']::name[]
       AND (COALESCE(p.qual, '') || COALESCE(p.with_check, '')) ~
           '(can_access_board|can_edit_board|can_manage_workspace|get_workspace_role|has_workspace_access|is_platform_admin)'
)
SELECT
    CASE WHEN NOT EXISTS (SELECT 1 FROM resolved
                           WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE'))
          AND NOT EXISTS (SELECT 1 FROM remaining)
          AND NOT EXISTS (SELECT 1 FROM still_public)
         THEN 'PASS' ELSE 'FAIL' END                                         AS rollup,
    (SELECT count(*) FROM resolved
      WHERE fn IS NOT NULL AND has_function_privilege('anon', fn, 'EXECUTE')) AS six_still_open,
    (SELECT count(*) FROM remaining)                                         AS remaining_anon_executable,
    COALESCE((SELECT string_agg(proname, ', ' ORDER BY proname) FROM remaining),
             '(none -- the surface is closed)')                              AS remaining_surface,
    -- A `TO public` policy still calling one of the six would mean anonymous
    -- queries now ERROR instead of returning zero rows. There must be none.
    COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
                FROM still_public), '(none)')                                AS public_policies_still_calling_the_six;

ROLLBACK;
