-- Read-only verification for
-- 20260916160000_narrow_storage_write_policies.sql.
--
-- Creates nothing, changes nothing: it reads pg_policies only, runs unchanged
-- inside `BEGIN TRANSACTION READ ONLY`, and is safe before a rollout, after
-- one, or against a partial state.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row. Scan for `pass = f`, or read readiness from
-- any row.
--
-- ROW 3 IS THE INVARIANT THAT WOULD HAVE CAUGHT THIS, and it is the reason to
-- re-run this verifier periodically rather than only at rollout time. It does
-- not check the six by name -- checking the six by name only proves this one
-- migration applied. It states the RULE the six were violating:
--
--     no policy on storage.objects may permit a WRITE (INSERT, UPDATE, DELETE
--     or ALL) to an anon-reachable role without an auth.role() gate.
--
-- Anon-reachable means scoped `TO public` -- which pg_policy stores as the role
-- oid 0 and pg_policies renders as `{public}` -- or naming `anon` outright. The
-- offenders are printed BY NAME, not counted: a count would pass while one
-- policy was swapped for another, and a name is what someone can act on.
-- Expected: none.
--
-- WHAT ROW 3 DOES NOT CATCH, stated so nobody reads more into a pass than is
-- there. It detects a MISSING lock, not a WRONG one: a policy gated on
-- `auth.role() = 'anon'` would satisfy it while permitting exactly what this
-- migration closes. It is a floor, not a proof.
--
-- WHAT A PASS DOES NOT MEAN. Any AUTHENTICATED user can still overwrite or
-- delete any other user's file in `padlet-files`: object names there are flat
-- with no user prefix and `owner` is null throughout, so no policy can express
-- per-object ownership today. That gap is recorded, not closed, and no row
-- below claims otherwise.

BEGIN TRANSACTION READ ONLY;

WITH narrowed AS (
    -- The six this migration rescopes. Group 1 was `TO public`, Group 2 was
    -- `TO anon` only; both must now read exactly {authenticated}.
    SELECT * FROM (VALUES
        ('Give users access to own folder',            'group 1 (was public)'),
        ('Allow public uploads',                       'group 1 (was public)'),
        ('Allow uploads for any user',                 'group 1 (was public)'),
        ('Allow public uploads fjopzy_0',              'group 2 (was anon)'),
        ('Allow public uploads fjopzy_1',              'group 2 (was anon)'),
        ('Allow public uploads on board-backgrounds',  'group 2 (was anon)')
    ) AS t(policyname, grp)
),
narrowed_live AS (
    SELECT n.policyname, n.grp, p.roles, (p.policyname IS NOT NULL) AS present
      FROM narrowed AS n
      LEFT JOIN pg_policies AS p
             ON p.schemaname = 'storage' AND p.tablename = 'objects'
            AND p.policyname = n.policyname
),
-- The public READ policies. These are anon-reachable ON PURPOSE -- the buckets
-- are public -- so the check is that they were NOT caught up in the narrowing.
public_reads AS (
    SELECT unnest(ARRAY[
        'Files are publicly accessible',
        'Allow public read',
        'Allow public downloads',
        'Allow public read access',
        'Allow public read access on canvas-icons',
        'Public read ai-component-assets',
        'Public read import previews',
        'Public thumbnail access'
    ]) AS policyname
),
public_reads_live AS (
    SELECT r.policyname, p.roles, p.cmd, (p.policyname IS NOT NULL) AS present
      FROM public_reads AS r
      LEFT JOIN pg_policies AS p
             ON p.schemaname = 'storage' AND p.tablename = 'objects'
            AND p.policyname = r.policyname
),
-- THE INVARIANT. Every anon-reachable write policy on storage.objects that
-- carries no auth.role() gate. This set must be empty.
write_exposure AS (
    SELECT policyname, cmd, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       AND (roles && ARRAY['public', 'anon']::name[] OR cardinality(roles) = 0)
       AND position('auth.role()' IN (COALESCE(qual, '') || COALESCE(with_check, ''))) = 0
),
invariants AS (
    SELECT 1 AS ord, 'prerequisites'::text AS section,
           'all six named policies still exist on storage.objects'::text AS check_name,
           COALESCE((SELECT string_agg(policyname, ', ') FROM narrowed_live WHERE NOT present),
                    '(all present)') AS actual,
           NOT EXISTS (SELECT 1 FROM narrowed_live WHERE NOT present) AS pass
    -- The narrowing itself: roles must be EXACTLY {authenticated}. An extra
    -- role in the array would leave the anonymous evaluation in place.
    UNION ALL SELECT 2, 'policy roles', 'all six are scoped to exactly {authenticated}',
           COALESCE((SELECT string_agg(policyname || ' [' || grp || '] => ' || roles::text, ', ')
                       FROM narrowed_live
                      WHERE present AND roles <> ARRAY['authenticated']::name[]),
                    '(all authenticated)'),
           NOT EXISTS (SELECT 1 FROM narrowed_live
                        WHERE present AND roles <> ARRAY['authenticated']::name[])
    -- THE INVARIANT. Offenders by name, not by count. Expected: none.
    UNION ALL SELECT 3, 'invariant', 'no anon-reachable storage write policy lacks an auth.role() gate',
           COALESCE((SELECT string_agg(policyname || ' (' || cmd || ' ' || roles || ')', ', '
                                       ORDER BY policyname) FROM write_exposure),
                    '(none)'),
           NOT EXISTS (SELECT 1 FROM write_exposure)
    -- The public reads must survive untouched, or the buckets stop serving.
    UNION ALL SELECT 4, 'public reads', 'every named public read policy still exists',
           COALESCE((SELECT string_agg(policyname, ', ') FROM public_reads_live WHERE NOT present),
                    '(all present)'),
           NOT EXISTS (SELECT 1 FROM public_reads_live WHERE NOT present)
    UNION ALL SELECT 5, 'public reads', 'every named public read policy is still anon-reachable',
           COALESCE((SELECT string_agg(policyname || ' => ' || roles::text, ', ')
                       FROM public_reads_live
                      WHERE present AND NOT (roles && ARRAY['public', 'anon']::name[])),
                    '(all anon-reachable)'),
           NOT EXISTS (SELECT 1 FROM public_reads_live
                        WHERE present AND NOT (roles && ARRAY['public', 'anon']::name[]))
    UNION ALL SELECT 6, 'public reads', 'every named public read policy is still SELECT only',
           COALESCE((SELECT string_agg(policyname || ' => ' || cmd, ', ')
                       FROM public_reads_live WHERE present AND cmd <> 'SELECT'),
                    '(all select)'),
           NOT EXISTS (SELECT 1 FROM public_reads_live WHERE present AND cmd <> 'SELECT')
    -- The two padlet-files write policies that were already gated stay as they
    -- are: they deny anon through their own predicate, and rescoping them is a
    -- change this migration has no evidence for.
    UNION ALL SELECT 7, 'untouched', 'the two auth.role()-gated padlet-files write policies are unchanged',
           COALESCE((SELECT string_agg(policyname || ' => ' || roles::text || ' ' || cmd, ', ')
                       FROM pg_policies
                      WHERE schemaname = 'storage' AND tablename = 'objects'
                        AND policyname IN ('Users can upload files', 'Users can delete own files')),
                    '(absent)'),
           (SELECT count(*) = 2 FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname IN ('Users can upload files', 'Users can delete own files')
               AND roles && ARRAY['public', 'anon']::name[]
               AND position('auth.role()' IN (COALESCE(qual, '') || COALESCE(with_check, ''))) > 0)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up, with the offender list spelled out so it is read and not
-- merely counted. Same source as the rows above, so it cannot disagree.
WITH write_exposure AS (
    SELECT policyname, cmd, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       AND (roles && ARRAY['public', 'anon']::name[] OR cardinality(roles) = 0)
       AND position('auth.role()' IN (COALESCE(qual, '') || COALESCE(with_check, ''))) = 0
),
narrowed_live AS (
    SELECT policyname, roles FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('Give users access to own folder', 'Allow public uploads',
                          'Allow uploads for any user', 'Allow public uploads fjopzy_0',
                          'Allow public uploads fjopzy_1',
                          'Allow public uploads on board-backgrounds')
)
SELECT
    CASE WHEN NOT EXISTS (SELECT 1 FROM write_exposure)
          AND (SELECT count(*) FROM narrowed_live
                WHERE roles = ARRAY['authenticated']::name[]) = 6
         THEN 'PASS' ELSE 'FAIL' END                                          AS rollup,
    (SELECT count(*) FROM narrowed_live
      WHERE roles = ARRAY['authenticated']::name[])                           AS six_now_authenticated,
    (SELECT count(*) FROM write_exposure)                                     AS anon_writable_policies,
    COALESCE((SELECT string_agg(policyname || ' (' || cmd || ' ' || roles || ')', ', '
                                ORDER BY policyname) FROM write_exposure),
             '(none -- anonymous writes are closed)')                         AS anon_write_offenders,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects')                 AS storage_objects_policies,
    -- Not an invariant, a standing reminder: narrowing to `authenticated` does
    -- not give padlet-files per-object ownership, because the data cannot
    -- express it. Any signed-in user can still overwrite any other user's file.
    'padlet-files has flat object names and null owner: per-object ownership is still unenforceable'::text
                                                                              AS recorded_gap;

ROLLBACK;
