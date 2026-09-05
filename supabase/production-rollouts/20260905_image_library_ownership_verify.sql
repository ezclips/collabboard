-- Read-only verification for 20260905_image_library_ownership.sql.
--
-- This file creates nothing and changes nothing. It reads pg_catalog and
-- information_schema only, and runs unchanged inside `BEGIN READ ONLY`. It is
-- safe before a rollout, after one, or against a partial state.
--
-- Plain SQL, one statement: the section labels are ordinary columns rather than
-- psql metacommands, so it runs in the Supabase dashboard SQL Editor as well as
-- in psql.
--
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every load-bearing invariant
-- is one row of the `invariants` list below, and `rollout_readiness` is
-- `bool_and(pass)` over that same list as a window, repeated on every row.
-- There is no separately maintained roll-up expression that could drift from
-- the rows above it, so it is not possible for a row to report pass = false
-- while readiness reads true. Scan for any `pass = f`, or read
-- `rollout_readiness` from any row.
--
-- SEMANTIC AUTHORITY IS THE BODY DIGEST, NOT KEYWORDS. A function that lets a
-- viewer through, that skips the retry's Library-ownership test, or that moves
-- the actor binding after the retry, still mentions every identifier the
-- hardened body mentions -- keyword checks pass all of them. md5(prosrc) does
-- not. TWO digests are accepted and only two: the reviewed body with LF
-- newlines, and the SAME reviewed body with CRLF newlines. PostgreSQL stores
-- prosrc verbatim, so the identical reviewed function pasted from a CRLF
-- client hashes differently -- which failed a first production apply with
-- nothing semantic changed. Nothing is folded, so a weakened, reordered or
-- pre-hardening body still fails under either encoding, and a THIRD digest is
-- a body nobody reviewed: STOP, never add it here to get past an apply.
-- Both values come from
-- supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
-- and are re-derived from that file by scripts/db/imageLibraryRollout.source.test.ts.
-- The rows labelled 'diagnostic' help locate a mismatch and are NOT the
-- authority.
--
-- POSTGRESQL MAJOR 17 ONLY, AND SAID SO. The supporting-index predicate is
-- compared exactly as PostgreSQL deparses it -- deliberately NOT normalised,
-- because stripping parentheses and whitespace let a call to a function named
-- `library_item_idisnotnull()` collapse onto `library_item_id IS NOT NULL` and
-- verify green while returning FALSE. Exact comparison is what keeps different
-- parse trees apart; deparsed output is a major-version detail, so row 1 fails
-- closed anywhere but major 17. A different major is a reviewed artifact
-- change, never an expected value edited during an apply.

WITH expected AS (
    SELECT
        to_regprocedure(
            'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
            ' double precision, double precision, double precision, double precision,'
            ' text, jsonb)')::oid                                    AS fn,
        -- TWO exact byte representations of ONE reviewed body: LF, then the
        -- same body with CRLF newlines. Not normalisation -- nothing is
        -- folded, so any third digest is a body nobody reviewed.
        ARRAY['e5b8ce9de5a443313593af4ee71c28b8',
              'face6815bf0be1b1511ab415eb698b09']::text[]             AS body_md5s,
        ARRAY['uuid','uuid','uuid','text','text','float8','float8','float8',
              'float8','text','jsonb']::text[]                       AS argtypes,
        ARRAY['padlet_id:uuid','library_item_id:uuid']::text[]        AS out_columns,
        'postgres'::text                                             AS owner,
        ARRAY['search_path=public']::text[]                          AS config,
        ARRAY['authenticated:EXECUTE:false','postgres:EXECUTE:false',
              'service_role:EXECUTE:false']::text[]                  AS acl,
        ('non-unique btree keys=library_item_id natts=1 expr=false'
         ' pred=(library_item_id IS NOT NULL)')::text                AS index_shape
),
link AS (
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'padlets'
       AND column_name = 'library_item_id'
),
link_attnum AS (
    SELECT a.attnum FROM pg_attribute AS a
     WHERE a.attrelid = to_regclass('public.padlets') AND a.attname = 'library_item_id'
),
fks AS (
    SELECT rc.delete_rule,
           ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')' AS target
      FROM information_schema.key_column_usage AS k
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = k.constraint_name AND rc.constraint_schema = k.constraint_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = k.constraint_name AND ccu.constraint_schema = k.constraint_schema
     WHERE k.table_schema = 'public' AND k.table_name = 'padlets'
       AND k.column_name = 'library_item_id'
),
-- Cardinality detection by CATALOG DEPENDENCY on the BACKING INDEX. An
-- expression key such as ((library_item_id::text)) stores 0 in both indkey and
-- conkey, so an attnum comparison misses it while it still outlaws the second
-- placement -- and an EXCLUSION constraint's backing index is not indisunique,
-- so uniqueness alone is not the test either.
unique_indexes AS (
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) AS names
      FROM pg_index AS i JOIN pg_class AS c ON c.oid = i.indexrelid
     WHERE i.indrelid = to_regclass('public.padlets') AND i.indisunique
       AND EXISTS (
            SELECT 1 FROM pg_depend AS d
             WHERE d.classid = 'pg_class'::regclass AND d.objid = i.indexrelid
               AND d.refclassid = 'pg_class'::regclass AND d.refobjid = i.indrelid
               AND d.refobjsubid = (SELECT attnum FROM link_attnum))
),
cardinality_constraints AS (
    SELECT string_agg(name, ', ' ORDER BY name) AS names FROM (
        SELECT con.conname AS name
          FROM pg_constraint AS con
          JOIN pg_index AS i ON i.indexrelid = con.conindid
         WHERE con.conrelid = to_regclass('public.padlets')
           AND con.contype = 'x'
           AND EXISTS (
                SELECT 1 FROM pg_depend AS d
                 WHERE d.classid = 'pg_class'::regclass AND d.objid = i.indexrelid
                   AND d.refclassid = 'pg_class'::regclass AND d.refobjid = i.indrelid
                   AND d.refobjsubid = (SELECT attnum FROM link_attnum))
        UNION
        SELECT con.conname
          FROM pg_constraint AS con
         WHERE con.conrelid = to_regclass('public.padlets')
           AND con.contype IN ('u', 'x', 'p')
           AND (SELECT attnum FROM link_attnum) = ANY (con.conkey)
    ) AS offenders
),
supporting_index AS (
    SELECT (CASE WHEN i.indisunique THEN 'unique' ELSE 'non-unique' END)
           || ' ' || am.amname
           || ' keys=' || COALESCE((SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                                      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                                      LEFT JOIN pg_attribute AS a
                                             ON a.attrelid = i.indrelid AND a.attnum = k.attnum), '(expression)')
           || ' natts=' || i.indnatts::text
           || ' expr=' || (i.indexprs IS NOT NULL)::text
           -- Exact, never normalised: see the header.
           || ' pred=' || COALESCE(pg_get_expr(i.indpred, i.indrelid, false), '(none)') AS shape
      FROM pg_index AS i
      JOIN pg_class AS c ON c.oid = i.indexrelid
      JOIN pg_am AS am ON am.oid = c.relam
     WHERE i.indrelid = to_regclass('public.padlets')
       AND c.relname = 'padlets_library_item_id_idx'
),
acl AS (
    SELECT array_agg(entry ORDER BY entry) AS entries FROM (
        SELECT (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
               || ':' || a.privilege_type || ':' || a.is_grantable::text AS entry
          FROM pg_proc AS p, aclexplode(p.proacl) AS a
         WHERE p.oid = (SELECT fn FROM expected)) AS x
),
-- Every relation, column, TYPE and TYPMOD the FINAL hardened function depends
-- on, pinned against supabase/baseline/schema_snapshot_2026-07-05.sql. The type
-- family alone is not enough: library_items.type narrowed to varchar(1) still
-- looks text-ish and then rejects the literal 'image' the function inserts.
-- atttypmod is -1 for an unconstrained type and N + 4 for varchar(N).
-- padlets.library_item_id is excluded on purpose -- the rollout creates it, and
-- rows 2-5 assert its exact shape.
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
            ('padlets','type','varchar',54),
            ('padlets','position_x','int4',-1),('padlets','position_y','int4',-1),
            ('padlets','width','numeric',-1),('padlets','height','numeric',-1),
            ('padlets','file_url','text',-1),('padlets','metadata','jsonb',-1),
            ('library_items','id','uuid',-1),('library_items','user_id','uuid',-1),
            ('library_items','title','text',-1),('library_items','type','text',-1),
            ('library_items','content','jsonb',-1),
            ('library_items','thumbnail_url','text',-1),
            ('library_items','is_public','bool',-1)
           ) AS req(t, c, ty, tm)
      LEFT JOIN LATERAL (
            SELECT ty2.typname::text AS ty, a.atttypmod AS tm
              FROM pg_attribute AS a JOIN pg_type AS ty2 ON ty2.oid = a.atttypid
             WHERE a.attrelid = to_regclass('public.' || req.t)
               AND a.attname = req.c AND a.attnum > 0 AND NOT a.attisdropped
           ) AS cur ON true
     WHERE cur.ty IS NULL OR cur.ty <> req.ty OR cur.tm <> req.tm
),
missing_tables AS (
    SELECT string_agg(t, ', ' ORDER BY t) AS names
      FROM unnest(ARRAY['public.padlets','public.library_items',
                        'public.boards','public.board_collaborators']) AS t
     WHERE to_regclass(t) IS NULL
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
authuid AS (
    SELECT p.pronargs, p.prorettype::regtype::text AS rettype
      FROM pg_proc AS p WHERE p.oid = to_regprocedure('auth.uid()')
),
invariants(ord, section, check_name, actual, pass) AS (
    -- Load-bearing: the predicate comparison below trusts this major's deparser.
              SELECT  1, 'compatibility', 'PostgreSQL major 17 (this artifact is certified for it only)',
           current_setting('server_version_num'),
           current_setting('server_version_num')::int BETWEEN 170000 AND 179999
    UNION ALL SELECT  2, 'column', 'padlets.library_item_id exists',
           COALESCE((SELECT data_type FROM link), '(absent)'),
           EXISTS (SELECT 1 FROM link)
    UNION ALL SELECT  3, 'column', 'type is uuid',
           COALESCE((SELECT data_type FROM link), '(absent)'),
           COALESCE((SELECT data_type = 'uuid' FROM link), false)
    UNION ALL SELECT  4, 'column', 'is nullable',
           COALESCE((SELECT is_nullable FROM link), '(absent)'),
           COALESCE((SELECT is_nullable = 'YES' FROM link), false)
    UNION ALL SELECT  5, 'column', 'has NO default',
           COALESCE((SELECT column_default FROM link), '(none)'),
           COALESCE((SELECT column_default IS NULL FROM link), false)
    UNION ALL SELECT  6, 'foreign key', 'exactly one foreign key on the link',
           (SELECT count(*)::text FROM fks),
           (SELECT count(*) FROM fks) = 1
    UNION ALL SELECT  7, 'foreign key', 'targets public.library_items(id)',
           COALESCE((SELECT string_agg(target, ', ') FROM fks), '(none)'),
           (SELECT count(*) FROM fks WHERE target = 'public.library_items(id)') = 1
    UNION ALL SELECT  8, 'foreign key', 'delete action is SET NULL, and only that',
           COALESCE((SELECT string_agg(delete_rule, ', ') FROM fks), '(none)'),
           (SELECT count(*) FROM fks WHERE delete_rule = 'SET NULL') = 1
             AND (SELECT count(*) FROM fks WHERE delete_rule <> 'SET NULL') = 0
    UNION ALL SELECT  9, 'cardinality', 'no UNIQUE index depends on the link column',
           COALESCE((SELECT names FROM unique_indexes), '(none)'),
           (SELECT names FROM unique_indexes) IS NULL
    UNION ALL SELECT 10, 'cardinality', 'no unique/exclusion constraint constrains the link',
           COALESCE((SELECT names FROM cardinality_constraints), '(none)'),
           (SELECT names FROM cardinality_constraints) IS NULL
    UNION ALL SELECT 11, 'index', 'supporting index matches structurally, predicate exactly',
           COALESCE((SELECT shape FROM supporting_index), '(absent)'),
           COALESCE((SELECT shape FROM supporting_index), '(absent)')
           = (SELECT index_shape FROM expected)
    UNION ALL SELECT 12, 'function', 'exists with the reviewed signature',
           COALESCE((SELECT fn FROM expected)::text, '(absent)'),
           (SELECT fn FROM expected) IS NOT NULL
    UNION ALL SELECT 13, 'function', 'no other overload of the same name',
           (SELECT count(*)::text FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item'),
           (SELECT count(*) FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item') = 1
    UNION ALL SELECT 14, 'function', 'canonical body digest matches the reviewed migration (LF or CRLF)',
           COALESCE((SELECT digest FROM body), '(absent)'),
           -- ANY over a subquery of scalar rows: `= ANY (<subquery returning
           -- the array>)` would compare text to text[] and fail to type.
           COALESCE((SELECT digest FROM body)
                    = ANY (SELECT unnest(body_md5s) FROM expected), false)
    UNION ALL SELECT 15, 'function', 'argument types match (structural)',
           COALESCE(array_to_string((SELECT argtypes FROM body), ','), '(absent)'),
           COALESCE((SELECT argtypes FROM body) = (SELECT argtypes FROM expected), false)
    UNION ALL SELECT 16, 'function', 'result columns match (structural)',
           COALESCE(array_to_string((SELECT out_columns FROM body), ','), '(absent)'),
           COALESCE((SELECT out_columns FROM body) = (SELECT out_columns FROM expected)
                    AND (SELECT proretset FROM body), false)
    UNION ALL SELECT 17, 'function', 'SECURITY INVOKER, never DEFINER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END FROM body), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM body), false)
    UNION ALL SELECT 18, 'function', 'configuration is exactly search_path=public',
           COALESCE((SELECT array_to_string(config, ',') FROM body), '(absent)'),
           COALESCE((SELECT config FROM body) = (SELECT config FROM expected), false)
    UNION ALL SELECT 19, 'function', 'owner is the expected deployment role',
           COALESCE((SELECT owner FROM body), '(absent)'),
           COALESCE((SELECT owner FROM body) = (SELECT owner FROM expected), false)
    UNION ALL SELECT 20, 'privileges', 'PUBLIC cannot execute',
           COALESCE(has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 21, 'privileges', 'anon cannot execute',
           COALESCE(has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 22, 'privileges', 'authenticated can execute',
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 23, 'privileges', 'service_role can execute',
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 24, 'privileges', 'exact ACL set, none grantable',
           COALESCE(array_to_string((SELECT entries FROM acl), ', '), '(default ACL)'),
           COALESCE((SELECT entries FROM acl) = (SELECT acl FROM expected), false)
    UNION ALL SELECT 25, 'prerequisites', 'required relations exist',
           COALESCE((SELECT names FROM missing_tables), '(none missing)'),
           (SELECT names FROM missing_tables) IS NULL
    UNION ALL SELECT 26, 'prerequisites', 'every column the function uses has the canonical type and typmod',
           COALESCE((SELECT bad FROM prereq), '(all canonical)'),
           (SELECT bad FROM prereq) IS NULL
    UNION ALL SELECT 27, 'prerequisites', 'auth.uid() exists, takes no arguments, returns uuid',
           COALESCE((SELECT 'nargs=' || pronargs::text || ' returns ' || rettype FROM authuid), '(absent)'),
           COALESCE((SELECT pronargs = 0 AND rettype = 'uuid' FROM authuid), false)
    UNION ALL SELECT 28, 'diagnostic', 'body binds the logical actor',
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src) > 0 FROM body), false)
    UNION ALL SELECT 29, 'diagnostic', 'board authority precedes the retry lookup',
           COALESCE((SELECT position('public.board_collaborators' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('public.board_collaborators' IN src) > 0
                     AND position('public.board_collaborators' IN src)
                         < position('LEFT JOIN public.library_items' IN src) FROM body), false)
    UNION ALL SELECT 30, 'diagnostic', 'retry requires board, link and library owner',
           COALESCE((SELECT position('v_library_owner = p_user_id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('v_existing_board = p_board_id' IN src) > 0
                     AND position('v_existing_library IS NOT NULL' IN src) > 0
                     AND position('v_library_owner = p_user_id' IN src) > 0 FROM body), false)
)
SELECT
    ord,
    section,
    check_name,
    actual,
    pass,
    -- The conjunction of every row above, repeated on every row. Nothing else
    -- computes readiness, so no invariant can fail while this reads true.
    bool_and(pass) OVER () AS rollout_readiness
FROM invariants
ORDER BY ord;
