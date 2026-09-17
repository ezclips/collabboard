-- Read-only verification for
-- 20260916180000_ai_connection_supports_images.sql.
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
-- ROWS 5 AND 6 ARE THE ONES THAT OUTLIVE THIS MIGRATION. Rows 1 to 4 prove the
-- column and the function landed. Row 5 states the RULE this change exists to
-- keep: NO EXISTING ROW MAY HAVE BEEN SWITCHED ON. Default false is the entire
-- safety posture, and the one way to break it silently is a stray backfill, so
-- the count of rows already declaring images is printed rather than inferred --
-- it should be 0 immediately after a rollout, and anything above 0 later must
-- be a user who ticked the box themselves. Row 6 is the standing signature
-- rule: exactly ONE create_ai_provider_connection_atomic may exist, because two
-- overloads means a create can resolve to the one that discards the flag.
--
-- WHAT A PASS DOES NOT MEAN. This verifies the DATABASE half only. Whether a
-- user's declaration is TRUE of their model is not knowable here and is not
-- claimed anywhere: a wrong declaration surfaces as a failed image turn, which
-- is the designed outcome. The adapter wire shapes are verified by
-- lib/server/ai/userDeclaredVisionCapability.test.ts, not by SQL.
--
-- THE APPLICATION HALF MUST SHIP WITH THIS. The only caller of the function is
-- lib/infra/settings/aiProviderAtomicRepository.ts, which sends the 7th
-- argument. Row 6 failing with a count of 1 and the OLD signature is what an
-- un-applied rollout looks like; every "Add provider" is failing in that state.

BEGIN TRANSACTION READ ONLY;

WITH target AS (
    SELECT 'public.ai_provider_connections'::regclass AS rel
),
col AS (
    SELECT a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr,
           format_type(a.atttypid, a.atttypmod) AS col_type
      FROM target, pg_attribute AS a
      LEFT JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = target.rel
       AND a.attname = 'supports_images'
       AND NOT a.attisdropped
),
-- Every overload of the create function, by argument signature.
create_fns AS (
    SELECT p.oid,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proacl
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_ai_provider_connection_atomic'
),
-- Who may EXECUTE the create function, by role name. Expected: service_role
-- only. grantee 0 is PUBLIC, which is the default grant on a NEW function and
-- therefore the one that must be visibly absent rather than merely inferred.
create_grants AS (
    SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee
      FROM create_fns AS f, aclexplode(f.proacl) AS a
      LEFT JOIN pg_roles AS r ON r.oid = a.grantee
     WHERE a.privilege_type = 'EXECUTE'
),
invariants AS (
    SELECT 1 AS ord, 'column'::text AS section,
           'supports_images exists and is boolean'::text AS check_name,
           COALESCE((SELECT col_type FROM col), '(absent)') AS actual,
           COALESCE((SELECT col_type = 'boolean' FROM col), false) AS pass
    UNION ALL SELECT 2, 'column', 'supports_images is NOT NULL',
           COALESCE((SELECT attnotnull::text FROM col), '(absent)'),
           COALESCE((SELECT attnotnull FROM col), false)
    -- The default is the safety posture, so it is asserted as an expression,
    -- not merely as "has a default".
    UNION ALL SELECT 3, 'column', 'the default is false',
           COALESCE((SELECT default_expr FROM col), '(none)'),
           COALESCE((SELECT default_expr = 'false' FROM col), false)
    UNION ALL SELECT 4, 'function', 'the create function takes the declaration',
           COALESCE((SELECT string_agg(args, ' | ') FROM create_fns), '(absent)'),
           COALESCE((SELECT bool_or(args LIKE '%p_supports_images boolean%') FROM create_fns), false)
    -- THE STANDING RULE, part one. Expected: 0 immediately after rollout.
    -- Above 0 later is a user's own declaration, not a defect -- but a non-zero
    -- reading on the day of the rollout means something backfilled.
    UNION ALL SELECT 5, 'invariant', 'no connection was switched on by the migration',
           (SELECT count(*)::text || ' of ' || (SELECT count(*) FROM public.ai_provider_connections)::text
              FROM public.ai_provider_connections WHERE supports_images),
           (SELECT count(*) = 0 FROM public.ai_provider_connections WHERE supports_images)
    -- THE STANDING RULE, part two. Exactly one overload, or a create can
    -- resolve to the signature that discards the declaration.
    UNION ALL SELECT 6, 'invariant', 'exactly one create_ai_provider_connection_atomic exists',
           COALESCE((SELECT string_agg(args, ' || ') FROM create_fns), '(absent)'),
           (SELECT count(*) = 1 FROM create_fns)
    UNION ALL SELECT 7, 'authorization', 'only service_role may execute the create function',
           COALESCE((SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee) FROM create_grants), '(none)'),
           COALESCE((SELECT bool_and(grantee = 'service_role') FROM create_grants), false)
           AND EXISTS (SELECT 1 FROM create_grants WHERE grantee = 'service_role')
    -- Nothing here should have disturbed the table's own gate.
    UNION ALL SELECT 8, 'attributes', 'row level security is still enabled on ai_provider_connections',
           (SELECT c.relrowsecurity::text FROM target, pg_class AS c WHERE c.oid = target.rel),
           (SELECT c.relrowsecurity FROM target, pg_class AS c WHERE c.oid = target.rel)
    -- The credential table is the one that must stay unreachable; this change
    -- did not touch it, and that is worth proving rather than assuming.
    UNION ALL SELECT 9, 'authorization', 'anon and authenticated still hold nothing on ai_provider_credentials',
           (SELECT string_agg(r || ':' || p || '=' || has_table_privilege(r, 'public.ai_provider_credentials', p)::text, ' ')
              FROM unnest(ARRAY['anon','authenticated']) AS r,
                   unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p),
           (SELECT bool_and(NOT has_table_privilege(r, 'public.ai_provider_credentials', p))
              FROM unnest(ARRAY['anon','authenticated']) AS r,
                   unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;

-- The single roll-up. Same sources as the rows above, so it cannot disagree.
WITH create_fns AS (
    SELECT pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_ai_provider_connection_atomic'
),
col AS (
    SELECT a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_attribute AS a
      LEFT JOIN pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'public.ai_provider_connections'::regclass
       AND a.attname = 'supports_images'
       AND NOT a.attisdropped
)
SELECT
    CASE WHEN (SELECT count(*) FROM create_fns) = 1
          AND (SELECT attnotnull AND default_expr = 'false' FROM col)
          AND (SELECT count(*) = 0 FROM public.ai_provider_connections WHERE supports_images)
         THEN 'PASS' ELSE 'FAIL' END                                    AS rollup,
    (SELECT count(*) FROM create_fns)                                   AS create_function_overloads,
    COALESCE((SELECT string_agg(args, ' || ') FROM create_fns), '(absent)')
                                                                        AS create_function_signatures,
    COALESCE((SELECT default_expr FROM col), '(absent)')                AS supports_images_default,
    (SELECT count(*) FROM public.ai_provider_connections)               AS total_connections,
    (SELECT count(*) FROM public.ai_provider_connections
      WHERE supports_images)                                            AS connections_declaring_images,
    -- Not an invariant, a standing reminder: this column records what a USER
    -- said about their model. Nothing verifies that they were right, and
    -- nothing should -- a wrong declaration is a failed image turn by design.
    'supports_images is the owner''s claim, never validated against the model'::text
                                                                        AS recorded_limitation;

ROLLBACK;
