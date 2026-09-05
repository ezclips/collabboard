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
-- not. The pinned digest comes from
-- supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
-- and is re-derived from that file by scripts/db/imageLibraryRollout.source.test.ts.
-- The rows labelled 'diagnostic' help locate a mismatch and are NOT the
-- authority; the last one reports the server version for the record only.
--
-- VERSION INDEPENDENCE. No load-bearing row compares a catalog-RENDERED
-- statement. Argument and result types come from pg_type.typname, the
-- supporting index is compared structurally, and the single rendered
-- expression -- the partial index predicate -- is whitespace- and
-- parenthesis-normalised first. Nothing here can be fooled, or falsely
-- blocked, by PostgreSQL-major formatting differences.
--
-- A mismatch is never something to re-pin during a rollout. Expected values are
-- a reviewed code change.

WITH expected AS (
    SELECT
        to_regprocedure(
            'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
            ' double precision, double precision, double precision, double precision,'
            ' text, jsonb)')::oid                                    AS fn,
        'e5b8ce9de5a443313593af4ee71c28b8'::text                     AS body_md5,
        ARRAY['uuid','uuid','uuid','text','text','float8','float8','float8',
              'float8','text','jsonb']::text[]                       AS argtypes,
        ARRAY['padlet_id:uuid','library_item_id:uuid']::text[]        AS out_columns,
        'postgres'::text                                             AS owner,
        ARRAY['search_path=public']::text[]                          AS config,
        ARRAY['authenticated:EXECUTE:false','postgres:EXECUTE:false',
              'service_role:EXECUTE:false']::text[]                  AS acl,
        ('non-unique btree keys=library_item_id natts=1 expr=false'
         ' pred=library_item_idisnotnull')::text                     AS index_shape
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
-- Uniqueness detection by CATALOG DEPENDENCY. An expression index such as
-- UNIQUE ((library_item_id::text)) stores 0 in indkey, so an attnum comparison
-- would miss it while it still outlaws the second placement of one Library
-- object. pg_depend records the column every index key or predicate reads.
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
unique_constraints AS (
    SELECT string_agg(con.conname, ', ' ORDER BY con.conname) AS names
      FROM pg_constraint AS con
     WHERE con.conrelid = to_regclass('public.padlets')
       AND con.contype IN ('u', 'x', 'p')
       AND (SELECT attnum FROM link_attnum) = ANY (con.conkey)
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
           || ' pred=' || lower(regexp_replace(COALESCE(pg_get_expr(i.indpred, i.indrelid), ''),
                                               '[\s()]', '', 'g')) AS shape
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
-- Every relation, column AND TYPE the FINAL hardened function depends on,
-- traced from that function. Existence alone is not enough: a boards.user_id of
-- type text passes an existence check and then fails at runtime with
-- "operator does not exist: text = uuid". padlets.library_item_id is excluded
-- on purpose -- the rollout creates it, and rows 1-4 assert its exact shape.
prereq AS (
    SELECT string_agg(req.t || '.' || req.c || ' (' || req.k || ', found '
                      || COALESCE(col.udt_name, 'nothing') || ')', ', ' ORDER BY req.t, req.c) AS bad
      FROM (VALUES
            ('boards','id','uuid'),('boards','user_id','uuid'),
            ('board_collaborators','board_id','uuid'),
            ('board_collaborators','user_id','uuid'),
            ('board_collaborators','role','text'),
            ('padlets','id','uuid'),('padlets','board_id','uuid'),
            ('padlets','title','text'),('padlets','content','text'),
            ('padlets','type','text'),('padlets','position_x','numeric'),
            ('padlets','position_y','numeric'),('padlets','width','numeric'),
            ('padlets','height','numeric'),('padlets','file_url','text'),
            ('padlets','metadata','jsonb'),
            ('library_items','id','uuid'),('library_items','user_id','uuid'),
            ('library_items','title','text'),('library_items','type','text'),
            ('library_items','content','jsonb'),
            ('library_items','thumbnail_url','text'),
            ('library_items','is_public','bool')
           ) AS req(t, c, k)
      LEFT JOIN information_schema.columns AS col
             ON col.table_schema = 'public' AND col.table_name = req.t
            AND col.column_name = req.c
     WHERE col.column_name IS NULL
        OR NOT CASE req.k
                WHEN 'uuid'    THEN col.udt_name = 'uuid'
                WHEN 'jsonb'   THEN col.udt_name = 'jsonb'
                WHEN 'bool'    THEN col.udt_name = 'bool'
                WHEN 'text'    THEN col.udt_name IN ('text','varchar','bpchar')
                WHEN 'numeric' THEN col.udt_name IN ('int2','int4','int8','numeric','float4','float8')
                ELSE false
               END
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
              SELECT  1, 'column', 'padlets.library_item_id exists',
           COALESCE((SELECT data_type FROM link), '(absent)'),
           EXISTS (SELECT 1 FROM link)
    UNION ALL SELECT  2, 'column', 'type is uuid',
           COALESCE((SELECT data_type FROM link), '(absent)'),
           COALESCE((SELECT data_type = 'uuid' FROM link), false)
    UNION ALL SELECT  3, 'column', 'is nullable',
           COALESCE((SELECT is_nullable FROM link), '(absent)'),
           COALESCE((SELECT is_nullable = 'YES' FROM link), false)
    UNION ALL SELECT  4, 'column', 'has NO default',
           COALESCE((SELECT column_default FROM link), '(none)'),
           COALESCE((SELECT column_default IS NULL FROM link), false)
    UNION ALL SELECT  5, 'foreign key', 'exactly one foreign key on the link',
           (SELECT count(*)::text FROM fks),
           (SELECT count(*) FROM fks) = 1
    UNION ALL SELECT  6, 'foreign key', 'targets public.library_items(id)',
           COALESCE((SELECT string_agg(target, ', ') FROM fks), '(none)'),
           (SELECT count(*) FROM fks WHERE target = 'public.library_items(id)') = 1
    UNION ALL SELECT  7, 'foreign key', 'delete action is SET NULL, and only that',
           COALESCE((SELECT string_agg(delete_rule, ', ') FROM fks), '(none)'),
           (SELECT count(*) FROM fks WHERE delete_rule = 'SET NULL') = 1
             AND (SELECT count(*) FROM fks WHERE delete_rule <> 'SET NULL') = 0
    UNION ALL SELECT  8, 'cardinality', 'no UNIQUE index depends on the link column',
           COALESCE((SELECT names FROM unique_indexes), '(none)'),
           (SELECT names FROM unique_indexes) IS NULL
    UNION ALL SELECT  9, 'cardinality', 'no unique/exclusion constraint covers the link',
           COALESCE((SELECT names FROM unique_constraints), '(none)'),
           (SELECT names FROM unique_constraints) IS NULL
    UNION ALL SELECT 10, 'index', 'supporting index matches structurally',
           COALESCE((SELECT shape FROM supporting_index), '(absent)'),
           COALESCE((SELECT shape FROM supporting_index), '(absent)')
           = (SELECT index_shape FROM expected)
    UNION ALL SELECT 11, 'function', 'exists with the reviewed signature',
           COALESCE((SELECT fn FROM expected)::text, '(absent)'),
           (SELECT fn FROM expected) IS NOT NULL
    UNION ALL SELECT 12, 'function', 'no other overload of the same name',
           (SELECT count(*)::text FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item'),
           (SELECT count(*) FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item') = 1
    UNION ALL SELECT 13, 'function', 'canonical body digest matches the reviewed migration',
           COALESCE((SELECT digest FROM body), '(absent)'),
           COALESCE((SELECT digest FROM body) = (SELECT body_md5 FROM expected), false)
    UNION ALL SELECT 14, 'function', 'argument types match (structural)',
           COALESCE(array_to_string((SELECT argtypes FROM body), ','), '(absent)'),
           COALESCE((SELECT argtypes FROM body) = (SELECT argtypes FROM expected), false)
    UNION ALL SELECT 15, 'function', 'result columns match (structural)',
           COALESCE(array_to_string((SELECT out_columns FROM body), ','), '(absent)'),
           COALESCE((SELECT out_columns FROM body) = (SELECT out_columns FROM expected)
                    AND (SELECT proretset FROM body), false)
    UNION ALL SELECT 16, 'function', 'SECURITY INVOKER, never DEFINER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END FROM body), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM body), false)
    UNION ALL SELECT 17, 'function', 'configuration is exactly search_path=public',
           COALESCE((SELECT array_to_string(config, ',') FROM body), '(absent)'),
           COALESCE((SELECT config FROM body) = (SELECT config FROM expected), false)
    UNION ALL SELECT 18, 'function', 'owner is the expected deployment role',
           COALESCE((SELECT owner FROM body), '(absent)'),
           COALESCE((SELECT owner FROM body) = (SELECT owner FROM expected), false)
    UNION ALL SELECT 19, 'privileges', 'PUBLIC cannot execute',
           COALESCE(has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 20, 'privileges', 'anon cannot execute',
           COALESCE(has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 21, 'privileges', 'authenticated can execute',
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 22, 'privileges', 'service_role can execute',
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE'), false)
    -- The COMPLETE explicit privilege set INCLUDING GRANTABILITY: an extra
    -- EXECUTE holder is a caller nobody reviewed, and WITH GRANT OPTION lets
    -- the holder hand EXECUTE to anyone at all.
    UNION ALL SELECT 23, 'privileges', 'exact ACL set, none grantable',
           COALESCE(array_to_string((SELECT entries FROM acl), ', '), '(default ACL)'),
           COALESCE((SELECT entries FROM acl) = (SELECT acl FROM expected), false)
    UNION ALL SELECT 24, 'prerequisites', 'required relations exist',
           COALESCE((SELECT names FROM missing_tables), '(none missing)'),
           (SELECT names FROM missing_tables) IS NULL
    UNION ALL SELECT 25, 'prerequisites', 'every column the function uses exists with a usable type',
           COALESCE((SELECT bad FROM prereq), '(all usable)'),
           (SELECT bad FROM prereq) IS NULL
    UNION ALL SELECT 26, 'prerequisites', 'auth.uid() exists, takes no arguments, returns uuid',
           COALESCE((SELECT 'nargs=' || pronargs::text || ' returns ' || rettype FROM authuid), '(absent)'),
           COALESCE((SELECT pronargs = 0 AND rettype = 'uuid' FROM authuid), false)
    UNION ALL SELECT 27, 'diagnostic', 'body binds the logical actor',
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src) > 0 FROM body), false)
    UNION ALL SELECT 28, 'diagnostic', 'board authority precedes the retry lookup',
           COALESCE((SELECT position('public.board_collaborators' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('public.board_collaborators' IN src) > 0
                     AND position('public.board_collaborators' IN src)
                         < position('LEFT JOIN public.library_items' IN src) FROM body), false)
    UNION ALL SELECT 29, 'diagnostic', 'retry requires board, link and library owner',
           COALESCE((SELECT position('v_library_owner = p_user_id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('v_existing_board = p_board_id' IN src) > 0
                     AND position('v_existing_library IS NOT NULL' IN src) > 0
                     AND position('v_library_owner = p_user_id' IN src) > 0 FROM body), false)
    -- For the record only. No row above compares a version-formatted string, so
    -- this never gates readiness; it is here so a reviewer can see where a
    -- given verification was run.
    UNION ALL SELECT 30, 'diagnostic', 'server version (informational, not gating)',
           current_setting('server_version_num'), true
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
