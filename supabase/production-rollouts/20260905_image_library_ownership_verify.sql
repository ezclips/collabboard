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
-- READINESS IS THE CONJUNCTION, BY CONSTRUCTION. Every invariant is one row of
-- the `invariants` list below, and `rollout_readiness` is `bool_and(pass)` over
-- that same list as a window, repeated on every row. There is no separately
-- maintained roll-up expression that could drift from the rows above it, so it
-- is not possible for a row to report pass = false while readiness reads true.
-- Scan for any `pass = f`, or read `rollout_readiness` from any row.
--
-- SEMANTIC AUTHORITY IS THE BODY DIGEST, NOT KEYWORDS. A function that lets a
-- viewer through, that skips the retry's Library-ownership test, or that moves
-- the actor binding after the retry, still mentions every identifier the
-- hardened body mentions -- keyword checks pass all of them. md5(prosrc) does
-- not. The pinned digest comes from
-- supabase/migrations/20260905100000_harden_image_post_library_idempotency.sql
-- and is re-derived from that file by scripts/db/imageLibraryRollout.source.test.ts.
-- The diagnostic rows near the end help locate a mismatch; they are
-- deliberately NOT the authority.

WITH expected AS (
    SELECT
        to_regprocedure(
            'public.create_image_post_with_library_item(uuid, uuid, uuid, text, text,'
            ' double precision, double precision, double precision, double precision,'
            ' text, jsonb)')::oid                                    AS fn,
        'e5b8ce9de5a443313593af4ee71c28b8'::text                     AS body_md5,
        ('p_padlet_id uuid, p_board_id uuid, p_user_id uuid, p_title text,'
         ' p_content text, p_position_x double precision,'
         ' p_position_y double precision, p_width double precision,'
         ' p_height double precision, p_file_url text, p_metadata jsonb')::text AS identity_args,
        'TABLE(padlet_id uuid, library_item_id uuid)'::text          AS result_type,
        'postgres'::text                                             AS owner,
        ARRAY['search_path=public']::text[]                          AS config,
        ('CREATE INDEX padlets_library_item_id_idx ON public.padlets'
         ' USING btree (library_item_id) WHERE (library_item_id IS NOT NULL)')::text AS indexdef
),
link AS (
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'padlets'
       AND column_name = 'library_item_id'
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
acl AS (
    SELECT array_agg(entry ORDER BY entry) AS entries FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
               || ':' || a.privilege_type AS entry
          FROM pg_proc AS p, aclexplode(p.proacl) AS a
         WHERE p.oid = (SELECT fn FROM expected)) AS x
),
expected_acl AS (
    SELECT array_agg(e ORDER BY e) AS entries
      FROM unnest(ARRAY[(SELECT owner FROM expected) || ':EXECUTE',
                        'authenticated:EXECUTE', 'service_role:EXECUTE']) AS e
),
-- Every table and column the FINAL hardened function reads or writes, traced
-- from that function. padlets.library_item_id is excluded on purpose: the
-- rollout creates it, and rows 1-4 assert its exact shape instead.
prereq AS (
    SELECT string_agg(t || '.' || c, ', ' ORDER BY t, c) AS missing
      FROM (VALUES
            ('boards','id'),('boards','user_id'),
            ('board_collaborators','board_id'),('board_collaborators','user_id'),
            ('board_collaborators','role'),
            ('padlets','id'),('padlets','board_id'),('padlets','title'),
            ('padlets','content'),('padlets','type'),('padlets','position_x'),
            ('padlets','position_y'),('padlets','width'),('padlets','height'),
            ('padlets','file_url'),('padlets','metadata'),
            ('library_items','id'),('library_items','user_id'),
            ('library_items','title'),('library_items','type'),
            ('library_items','content'),('library_items','thumbnail_url'),
            ('library_items','is_public')
           ) AS required(t, c)
     WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = required.t
           AND column_name = required.c)
),
body AS (
    SELECT p.prosrc AS src, md5(p.prosrc) AS digest,
           pg_get_userbyid(p.proowner) AS owner, p.prosecdef,
           COALESCE(p.proconfig, ARRAY[]::text[]) AS config
      FROM pg_proc AS p WHERE p.oid = (SELECT fn FROM expected)
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
    UNION ALL SELECT  8, 'cardinality', 'no UNIQUE index covers the link',
           'checked',
           NOT EXISTS (
                SELECT 1 FROM pg_index AS i
                 WHERE i.indrelid = to_regclass('public.padlets') AND i.indisunique
                   AND EXISTS (SELECT 1 FROM unnest(i.indkey) AS k(attnum)
                                WHERE k.attnum = (SELECT a.attnum FROM pg_attribute AS a
                                                   WHERE a.attrelid = to_regclass('public.padlets')
                                                     AND a.attname = 'library_item_id')))
    UNION ALL SELECT  9, 'index', 'supporting index matches exactly',
           COALESCE((SELECT indexdef FROM pg_indexes
                      WHERE schemaname = 'public'
                        AND indexname = 'padlets_library_item_id_idx'), '(absent)'),
           COALESCE((SELECT indexdef FROM pg_indexes
                      WHERE schemaname = 'public'
                        AND indexname = 'padlets_library_item_id_idx'), '(absent)')
           = (SELECT indexdef FROM expected)
    UNION ALL SELECT 10, 'function', 'exists with the reviewed signature',
           COALESCE((SELECT fn FROM expected)::text, '(absent)'),
           (SELECT fn FROM expected) IS NOT NULL
    UNION ALL SELECT 11, 'function', 'no other overload of the same name',
           (SELECT count(*)::text FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item'),
           (SELECT count(*) FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname = 'create_image_post_with_library_item') = 1
    UNION ALL SELECT 12, 'function', 'canonical body digest matches the reviewed migration',
           COALESCE((SELECT digest FROM body), '(absent)'),
           COALESCE((SELECT digest FROM body) = (SELECT body_md5 FROM expected), false)
    UNION ALL SELECT 13, 'function', 'identity arguments match',
           COALESCE(pg_get_function_identity_arguments((SELECT fn FROM expected)), '(absent)'),
           COALESCE(pg_get_function_identity_arguments((SELECT fn FROM expected))
                    = (SELECT identity_args FROM expected), false)
    UNION ALL SELECT 14, 'function', 'result type matches',
           COALESCE(pg_get_function_result((SELECT fn FROM expected)), '(absent)'),
           COALESCE(pg_get_function_result((SELECT fn FROM expected))
                    = (SELECT result_type FROM expected), false)
    UNION ALL SELECT 15, 'function', 'SECURITY INVOKER, never DEFINER',
           COALESCE((SELECT CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END FROM body), '(absent)'),
           COALESCE((SELECT NOT prosecdef FROM body), false)
    UNION ALL SELECT 16, 'function', 'configuration is exactly search_path=public',
           COALESCE((SELECT array_to_string(config, ',') FROM body), '(absent)'),
           COALESCE((SELECT config FROM body) = (SELECT config FROM expected), false)
    UNION ALL SELECT 17, 'function', 'owner is the expected deployment role',
           COALESCE((SELECT owner FROM body), '(absent)'),
           COALESCE((SELECT owner FROM body) = (SELECT owner FROM expected), false)
    UNION ALL SELECT 18, 'privileges', 'PUBLIC cannot execute',
           COALESCE(has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('public', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 19, 'privileges', 'anon cannot execute',
           COALESCE(has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(NOT has_function_privilege('anon', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 20, 'privileges', 'authenticated can execute',
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('authenticated', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 21, 'privileges', 'service_role can execute',
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE')::text, '(absent)'),
           COALESCE(has_function_privilege('service_role', (SELECT fn FROM expected), 'EXECUTE'), false)
    UNION ALL SELECT 22, 'privileges', 'no unexpected EXECUTE holder',
           COALESCE(array_to_string((SELECT entries FROM acl), ', '), '(default ACL)'),
           COALESCE((SELECT entries FROM acl) = (SELECT entries FROM expected_acl), false)
    UNION ALL SELECT 23, 'prerequisites', 'every table/column the function uses exists',
           COALESCE((SELECT missing FROM prereq), '(none missing)'),
           (SELECT missing FROM prereq) IS NULL
    UNION ALL SELECT 24, 'diagnostic', 'body binds the logical actor',
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('auth.uid() <> p_user_id' IN src) > 0 FROM body), false)
    UNION ALL SELECT 25, 'diagnostic', 'board authority precedes the retry lookup',
           COALESCE((SELECT position('public.board_collaborators' IN src)::text FROM body), '(absent)'),
           COALESCE((SELECT position('public.board_collaborators' IN src) > 0
                     AND position('public.board_collaborators' IN src)
                         < position('LEFT JOIN public.library_items' IN src) FROM body), false)
    UNION ALL SELECT 26, 'diagnostic', 'retry requires board, link and library owner',
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
