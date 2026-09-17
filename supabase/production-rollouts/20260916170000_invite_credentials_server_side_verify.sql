-- Read-only verification for
-- 20260916170000_invite_credentials_server_side.sql.
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
-- ROW 7 IS THE ONE THAT OUTLIVES THIS MIGRATION. Rows 1 to 6 prove this change
-- applied. Row 7 states the RULE it exists to keep: NO anon-reachable policy on
-- ANY table in `public` may expose `link_code` or `password` through its
-- expression, and none may belong to workspace_invitations at all. That is what
-- catches the same mistake in a policy nobody has written yet. Offenders print
-- BY NAME, because a count would pass while one policy was swapped for another.
--
-- WHAT A PASS DOES NOT MEAN. This verifies the DATABASE half only. The invite
-- password is still stored in PLAINTEXT in `workspace_invitations.password` and
-- is still compared with `!==` in the accept route -- it is now reachable only
-- by the service role rather than by anyone with the link, which is the whole
-- of what this migration claims. Hashing it, and making that comparison
-- constant-time the way lib/server/share/sharePassword.ts already does for
-- share links, is a separate unit.
--
-- The other half of this change is application code and cannot be verified from
-- SQL: app/api/invitations/preview must be deployed before or with this, or
-- every invite link will render "invalid" once anon loses SELECT.

BEGIN TRANSACTION READ ONLY;

WITH invitations AS (
    SELECT 'public.workspace_invitations'::regclass AS rel
),
manager_policy AS (
    SELECT roles, cmd,
           regexp_replace(COALESCE(qual, ''), '\s+', '', 'g') AS tight_qual,
           COALESCE(qual, '') AS raw_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'workspace_invitations'
       AND policyname = 'Workspace managers can view invitations'
),
-- THE STANDING RULE. Any policy in `public` reachable by an unauthenticated
-- caller that either touches workspace_invitations or mentions a credential
-- column in its expression.
credential_exposure AS (
    SELECT tablename, policyname, cmd, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (roles && ARRAY['public', 'anon']::name[] OR cardinality(roles) = 0)
       AND (tablename = 'workspace_invitations'
            OR (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(link_code|password)')
),
invariants AS (
    SELECT 1 AS ord, 'authorization'::text AS section,
           'anon holds no DML privilege on workspace_invitations'::text AS check_name,
           (SELECT string_agg(p || '=' || has_table_privilege('anon', rel, p)::text, ' ')
              FROM invitations, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p) AS actual,
           (SELECT bool_and(NOT has_table_privilege('anon', rel, p))
              FROM invitations, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p) AS pass
    -- has_table_privilege already accounts for PUBLIC, but PUBLIC is checked by
    -- acl entry as well: it is the grant that makes every FUTURE role readable
    -- by default, so it must be visibly absent, not merely inferred.
    UNION ALL SELECT 2, 'authorization', 'no PUBLIC privilege entry remains on workspace_invitations',
           COALESCE((SELECT string_agg(DISTINCT a.privilege_type, ', ')
                       FROM invitations, pg_class AS c, aclexplode(c.relacl) AS a
                      WHERE c.oid = rel AND a.grantee = 0), '(none)'),
           NOT EXISTS (SELECT 1 FROM invitations, pg_class AS c, aclexplode(c.relacl) AS a
                        WHERE c.oid = rel AND a.grantee = 0)
    UNION ALL SELECT 3, 'policies', 'the anonymous link-branch policy no longer exists',
           COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'workspace_invitations'
                        AND policyname = 'Anyone can view an active link invitation'),
                    '(absent, as required)'),
           NOT EXISTS (SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public' AND tablename = 'workspace_invitations'
                          AND policyname = 'Anyone can view an active link invitation')
    UNION ALL SELECT 4, 'policies', 'the manager policy is SELECT and scoped to {authenticated}',
           COALESCE((SELECT cmd || ' ' || roles::text FROM manager_policy), '(absent)'),
           COALESCE((SELECT cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
                       FROM manager_policy), false)
    -- Exactness: the predicate is the manager check and nothing else. Both
    -- renderings are the same expression; which one the deparser emits depends
    -- on search_path, so both are accepted and nothing else is.
    UNION ALL SELECT 5, 'policies', 'the manager policy USING is exactly can_manage_workspace(workspace_id)',
           COALESCE((SELECT raw_qual FROM manager_policy), '(absent)'),
           COALESCE((SELECT tight_qual IN ('can_manage_workspace(workspace_id)',
                                           'public.can_manage_workspace(workspace_id)',
                                           '(can_manage_workspace(workspace_id))',
                                           '(public.can_manage_workspace(workspace_id))')
                       FROM manager_policy), false)
    -- Stated separately from row 5 so a failure says WHICH half broke: an
    -- expression that still mentions the link branch is the original defect.
    UNION ALL SELECT 6, 'policies', 'the manager policy mentions no link branch and no credential column',
           COALESCE((SELECT raw_qual FROM manager_policy), '(absent)'),
           COALESCE((SELECT raw_qual !~ '(link_code|password|''link'')' FROM manager_policy), false)
    -- THE STANDING RULE. Expected: none.
    UNION ALL SELECT 7, 'invariant', 'no anon-reachable policy in public exposes an invite credential',
           COALESCE((SELECT string_agg(tablename || '.' || policyname || ' (' || cmd || ' ' || roles || ')',
                                       ', ' ORDER BY tablename, policyname)
                       FROM credential_exposure), '(none)'),
           NOT EXISTS (SELECT 1 FROM credential_exposure)
    -- The callers that must keep working: the members page reads as the signed-in
    -- manager, and the preview/accept routes read as service_role.
    UNION ALL SELECT 8, 'authorization', 'authenticated keeps SELECT on workspace_invitations',
           (SELECT has_table_privilege('authenticated', rel, 'SELECT')::text FROM invitations),
           (SELECT has_table_privilege('authenticated', rel, 'SELECT') FROM invitations)
    UNION ALL SELECT 9, 'authorization', 'service_role keeps full access to workspace_invitations',
           (SELECT string_agg(p || '=' || has_table_privilege('service_role', rel, p)::text, ' ')
              FROM invitations, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p),
           (SELECT bool_and(has_table_privilege('service_role', rel, p))
              FROM invitations, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p)
    -- Nothing here should have disturbed the table's own gate.
    UNION ALL SELECT 10, 'attributes', 'row level security is still enabled on workspace_invitations',
           (SELECT c.relrowsecurity::text FROM invitations, pg_class AS c WHERE c.oid = rel),
           (SELECT c.relrowsecurity FROM invitations, pg_class AS c WHERE c.oid = rel)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up, with the offender list spelled out so it is read and not
-- merely counted. Same source as the rows above, so it cannot disagree.
WITH credential_exposure AS (
    SELECT tablename, policyname, cmd, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (roles && ARRAY['public', 'anon']::name[] OR cardinality(roles) = 0)
       AND (tablename = 'workspace_invitations'
            OR (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(link_code|password)')
),
anon_dml AS (
    SELECT bool_or(has_table_privilege('anon', 'public.workspace_invitations', p)) AS any_priv
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
)
SELECT
    CASE WHEN NOT EXISTS (SELECT 1 FROM credential_exposure)
          AND NOT (SELECT any_priv FROM anon_dml)
         THEN 'PASS' ELSE 'FAIL' END                                       AS rollup,
    (SELECT any_priv FROM anon_dml)                                        AS anon_still_has_a_privilege,
    (SELECT count(*) FROM credential_exposure)                             AS credential_exposing_policies,
    COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
                FROM credential_exposure),
             '(none -- no anonymous path to an invite credential)')        AS credential_exposure_offenders,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'workspace_invitations') AS invitation_policies,
    -- Not an invariant, a standing reminder: the column this migration stopped
    -- publishing is still stored as plaintext and still compared with !==.
    'workspace_invitations.password is still plaintext and still compared non-constant-time'::text
                                                                           AS recorded_gap;

ROLLBACK;
