-- Read-only verification for 20260913120000_synced_note_pair_atomic_update.sql.
--
-- Creates nothing, changes nothing: it reads pg_catalog and information_schema
-- only, runs unchanged inside `BEGIN READ ONLY`, and is safe before a rollout,
-- after one, or against a partial state. PostgreSQL major 17 only, per row 1.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row
-- below, and `rollout_readiness` is `bool_and(pass)` over that same list as a
-- window, repeated on every row -- no separate roll-up can drift from the rows
-- above it. Scan for `pass = f`, or read readiness from any row.
--
-- SEMANTIC AUTHORITY IS THE BODY DIGEST, NOT KEYWORDS. A body that drops the
-- FOR UPDATE, checks reciprocity one way only, or writes without verifying it
-- touched two rows still mentions every identifier the reviewed body mentions.
-- md5(prosrc) does not. TWO digests are accepted and only two: the reviewed
-- body with LF newlines, and the SAME body with CRLF -- prosrc is stored
-- verbatim, so the identical file pasted from a CRLF client hashes
-- differently. Nothing is folded, so a weakened or reordered body still fails
-- under either encoding. A THIRD digest is a body nobody reviewed: STOP, never
-- add it here to get an apply through. 'diagnostic' rows locate a mismatch and
-- are NOT authority.

WITH expected AS (
    SELECT
        to_regprocedure('public.update_synced_note_pair(uuid, uuid, text, text, jsonb, jsonb)')::oid
                                                                     AS fn,
        ARRAY['b901b81ebcb4475b5f74ad3313b0ce79',
              '460e5b476f4a9afdc8169d37d8b91839']::text[]            AS body_md5s,
        ARRAY['uuid','uuid','text','text','jsonb','jsonb']::text[]    AS argtypes,
        ARRAY['id:uuid','title:text','content:text','metadata:jsonb']::text[]
                                                                     AS out_columns,
        'postgres'::text                                             AS owner,
        ARRAY['search_path=public']::text[]                          AS config
),
body AS (
    SELECT p.prosrc AS src, md5(p.prosrc) AS digest,
           pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proretset,
           COALESCE(p.proconfig, ARRAY[]::text[]) AS config,
           (SELECT array_agg(t.typname::text ORDER BY k.ord)
              FROM unnest(p.proargtypes) WITH ORDINALITY AS k(argtype, ord)
              JOIN pg_type AS t ON t.oid = k.argtype)                AS argtypes,
           (SELECT array_agg(k.argname || ':' || t.typname ORDER BY k.ord)
              FROM unnest(p.proallargtypes, p.proargmodes, p.proargnames)
                   WITH ORDINALITY AS k(argtype, argmode, argname, ord)
              JOIN pg_type AS t ON t.oid = k.argtype
             WHERE k.argmode = 't')                                  AS out_columns
      FROM pg_proc AS p WHERE p.oid = (SELECT fn FROM expected)
),
grantable AS (
    SELECT string_agg(pg_get_userbyid(a.grantee) || ':' || a.privilege_type, ', ') AS entries
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
     WHERE p.oid = (SELECT fn FROM expected) AND a.is_grantable),
-- Every relation, column, TYPE and TYPMOD the function depends on, pinned
-- against supabase/baseline/schema_snapshot_2026-07-05.sql. The type family
-- alone is not enough: padlets.type as varchar(1) still looks text-ish, then
-- fails the 'text'/'note' comparison for every caller.
prereq AS (
    SELECT string_agg(req.t || '.' || req.c || ' (expected ' || req.ty
                      || CASE WHEN req.tm = -1 THEN '' ELSE '/' || req.tm::text END
                      || ', found ' || COALESCE(cur.ty, 'nothing')
                      || CASE WHEN cur.tm IS NULL OR cur.tm = -1 THEN ''
                              ELSE '/' || cur.tm::text END || ')',
                      ', ' ORDER BY req.t, req.c) AS bad
      FROM (VALUES
            ('boards','id','uuid',-1),('boards','user_id','uuid',-1),
            ('board_collaborators','board_id','uuid',-1),
            ('board_collaborators','user_id','uuid',-1),
            ('board_collaborators','role','text',-1),
            ('padlets','id','uuid',-1),('padlets','board_id','uuid',-1),
            ('padlets','title','text',-1),('padlets','content','text',-1),
            ('padlets','type','varchar',54),('padlets','metadata','jsonb',-1)
           ) AS req(t, c, ty, tm)
      LEFT JOIN LATERAL (
            SELECT ty2.typname::text AS ty, a.atttypmod AS tm
              FROM pg_attribute AS a JOIN pg_type AS ty2 ON ty2.oid = a.atttypid
             WHERE a.attrelid = to_regclass('public.' || req.t)
               AND a.attname = req.c AND a.attnum > 0 AND NOT a.attisdropped
           ) AS cur ON true
     WHERE cur.ty IS NULL OR cur.ty <> req.ty OR cur.tm <> req.tm
),
authuid AS (
    SELECT p.pronargs, p.prorettype::regtype::text AS rettype
      FROM pg_proc AS p WHERE p.oid = to_regprocedure('auth.uid()')
),
invariants(ord, section, check_name, actual, pass) AS (
              SELECT  1, 'compatibility', 'PostgreSQL major 17 (this artifact is certified for it only)',
           current_setting('server_version_num'),
           current_setting('server_version_num')::int BETWEEN 170000 AND 179999
    UNION ALL SELECT  2, 'function', 'exists with the reviewed signature',
           COALESCE((SELECT fn FROM expected)::text, '(absent)'),
           (SELECT fn FROM expected) IS NOT NULL
    UNION ALL SELECT  3, 'function', 'no other overload of the same name',
           (SELECT count(*)::text FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'update_synced_note_pair'),
           (SELECT count(*) = 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'update_synced_note_pair')
    UNION ALL SELECT  4, 'function', 'canonical body digest matches the reviewed migration (LF or CRLF)',
           COALESCE((SELECT digest FROM body), '(absent)'),
           COALESCE((SELECT digest FROM body) = ANY (SELECT unnest(body_md5s) FROM expected), false)
    UNION ALL SELECT  5, 'function', 'argument types match (structural)',
           COALESCE(array_to_string((SELECT argtypes FROM body), ','), '(absent)'),
           COALESCE((SELECT argtypes FROM body) = (SELECT argtypes FROM expected), false)
    UNION ALL SELECT  6, 'function', 'result columns match, and it returns a set',
           COALESCE(array_to_string((SELECT out_columns FROM body), ','), '(absent)'),
           COALESCE((SELECT out_columns FROM body) = (SELECT out_columns FROM expected)
                    AND (SELECT proretset FROM body), false)
    UNION ALL SELECT  7, 'function', 'SECURITY INVOKER, never DEFINER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END FROM body), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM body), false)
    UNION ALL SELECT  8, 'function', 'configuration is exactly search_path=public',
           COALESCE((SELECT array_to_string(config, ',') FROM body), '(absent)'),
           COALESCE((SELECT config FROM body) = (SELECT config FROM expected), false)
    UNION ALL SELECT  9, 'function', 'owner is the expected deployment role',
           COALESCE((SELECT owner FROM body), '(absent)'),
           COALESCE((SELECT owner FROM body) = (SELECT owner FROM expected), false)
    UNION ALL SELECT 10, 'privileges', 'PUBLIC cannot execute',
           COALESCE(has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 11, 'privileges', 'anon cannot execute (or does not exist here)',
           COALESCE(has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE')::text, '(no anon role)'),
           to_regrole('anon') IS NULL
             OR NOT has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE')
    UNION ALL SELECT 12, 'privileges', 'authenticated can execute',
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 13, 'privileges', 'no grantee may re-grant execute',
           COALESCE((SELECT entries FROM grantable), '(none grantable)'),
           (SELECT entries FROM grantable) IS NULL
    UNION ALL SELECT 14, 'prerequisites', 'every column the function uses has the canonical type and typmod',
           COALESCE((SELECT bad FROM prereq), '(all canonical)'),
           (SELECT bad FROM prereq) IS NULL
    UNION ALL SELECT 15, 'prerequisites', 'auth.uid() exists, takes no arguments, returns uuid',
           COALESCE((SELECT 'nargs=' || pronargs::text || ' returns ' || rettype FROM authuid), '(absent)'),
           COALESCE((SELECT pronargs = 0 AND rettype = 'uuid' FROM authuid), false)
    UNION ALL SELECT 16, 'authorization', 'padlets still has row level security enabled',
           COALESCE((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.padlets')), '(absent)'),
           COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.padlets')), false)
    UNION ALL SELECT 17, 'diagnostic', 'board authority is established before either row is locked',
           COALESCE((SELECT position('board_collaborators' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('board_collaborators' IN src) > 0
                     AND position('board_collaborators' IN src)
                         < position('FOR UPDATE' IN src) FROM body), false)
    UNION ALL SELECT 18, 'diagnostic', 'both rows are locked in deterministic id order',
           COALESCE((SELECT position('ORDER BY p.id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('ORDER BY p.id' IN src) > 0
                     AND position('FOR UPDATE' IN src) > position('ORDER BY p.id' IN src) FROM body), false)
    UNION ALL SELECT 19, 'diagnostic', 'the link is required reciprocal, in both directions',
           COALESCE((SELECT position('v_b.id::text' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('v_b.id::text' IN src) > 0
                     AND position('v_a.id::text' IN src) > 0 FROM body), false)
    UNION ALL SELECT 20, 'diagnostic', 'the write is verified to have touched exactly two rows',
           COALESCE((SELECT position('v_updated <> 2' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('v_updated <> 2' IN src) > 0 FROM body), false)
    UNION ALL SELECT 22, 'diagnostic', 'a non-object patch is refused before either sanitizer runs',
           COALESCE((SELECT position('jsonb_typeof' IN src)::text FROM body), '(absent)'),
           -- Anchored on the CALL SITE, not the word: the comment explaining
           -- the guard mentions jsonb_each above the guard itself.
           COALESCE((SELECT position('jsonb_typeof' IN src) > 0
                     AND position('jsonb_typeof' IN src) < position('FROM jsonb_each(' IN src) FROM body), false)
    UNION ALL SELECT 21, 'diagnostic', 'scheduler dates are source-only, never in the shared allowlist',
           COALESCE((SELECT position('start_date' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('start_date' IN src) > position('c_source' IN src)
                     AND position('start_date' IN src) > position('c_shared' IN src)
                     AND position('start_date' IN src) < position('BEGIN' IN src) FROM body), false)
)
-- rollout_readiness is the conjunction of every row above, on every row.
SELECT ord, section, check_name, actual, pass, bool_and(pass) OVER () AS rollout_readiness
FROM invariants ORDER BY ord;
