-- Read-only verification for 20260903_pdf_derivative_render_lifecycle.sql.
-- This file creates no persistent objects and does not modify data. It is safe
-- to run before a rollout, after one, or against a partial state.
--
-- Plain SQL only: the section headers are SELECTs rather than psql metacommands,
-- so this runs unchanged in the Supabase dashboard SQL Editor as well as in
-- psql. Each header returns a single labelled row, keeping the sections
-- legible in either tool.
--
-- Every check yields a `pass` boolean so the whole output can be scanned for a
-- single `false`. The last query is a roll-up.

SELECT '== 1. lifecycle columns exist, with the reviewed types and defaults ==' AS section;
WITH expected(column_name, data_type, is_nullable, column_default) AS (
    VALUES
        ('derivatives_requested_at'::text,     'timestamp with time zone'::text, 'YES'::text, NULL::text),
        ('derivatives_rendered_at',            'timestamp with time zone',       'YES',       NULL),
        ('derivatives_renderer_version',       'text',                           'YES',       NULL),
        ('derivatives_lease_token',            'uuid',                           'YES',       NULL),
        ('derivatives_lease_expires_at',       'timestamp with time zone',       'YES',       NULL),
        ('derivatives_error',                  'text',                           'YES',       NULL),
        ('derivatives_attempt',                'integer',                        'NO',        '0')
)
SELECT
    e.column_name,
    c.column_name IS NOT NULL                                   AS exists,
    c.data_type   IS NOT DISTINCT FROM e.data_type              AS type_ok,
    c.is_nullable IS NOT DISTINCT FROM e.is_nullable            AS nullable_ok,
    COALESCE(c.column_default, '') LIKE COALESCE(e.column_default, '') || '%'
                                                                AS default_ok,
    (c.column_name IS NOT NULL
     AND c.data_type IS NOT DISTINCT FROM e.data_type
     AND c.is_nullable IS NOT DISTINCT FROM e.is_nullable)      AS pass
FROM expected AS e
LEFT JOIN information_schema.columns AS c
       ON c.table_schema = 'public'
      AND c.table_name = 'knowledge_documents'
      AND c.column_name = e.column_name
ORDER BY e.column_name;

SELECT '== 2. no table-wide UPDATE for browser roles ==' AS section;
SELECT
    r.grantee,
    NOT EXISTS (
        SELECT 1
          FROM information_schema.table_privileges AS t
         WHERE t.table_schema = 'public'
           AND t.table_name = 'knowledge_documents'
           AND t.privilege_type = 'UPDATE'
           AND t.grantee = r.grantee
    ) AS pass
FROM (VALUES ('anon'), ('authenticated')) AS r(grantee)
ORDER BY r.grantee;

SELECT '== 3. ZERO derivatives_* UPDATE column grants for browser roles ==' AS section;
SELECT
    r.grantee,
    COALESCE((
        SELECT count(*)
          FROM information_schema.column_privileges AS c
         WHERE c.table_schema = 'public'
           AND c.table_name = 'knowledge_documents'
           AND c.privilege_type = 'UPDATE'
           AND c.grantee = r.grantee
           AND c.column_name LIKE 'derivatives%'
    ), 0) AS derivative_grants,
    COALESCE((
        SELECT count(*)
          FROM information_schema.column_privileges AS c
         WHERE c.table_schema = 'public'
           AND c.table_name = 'knowledge_documents'
           AND c.privilege_type = 'UPDATE'
           AND c.grantee = r.grantee
           AND c.column_name LIKE 'derivatives%'
    ), 0) = 0 AS pass
FROM (VALUES ('anon'), ('authenticated')) AS r(grantee)
ORDER BY r.grantee;

SELECT '== 4. authenticated keeps UPDATE on exactly the 21 pre-existing columns ==' AS section;
WITH expected(column_name) AS (
    VALUES
        ('id'::text), ('board_id'), ('created_by'), ('kind'), ('original_filename'),
        ('mime_type'), ('file_size_bytes'), ('storage_path'), ('content_sha256'),
        ('page_count'), ('processing_status'), ('processing_error'), ('parser_name'),
        ('parser_version'), ('parser_options_hash'), ('raw_artifact_path'),
        ('created_at'), ('updated_at'), ('processing_lease_token'),
        ('processing_lease_expires_at'), ('processing_attempt')
), granted AS (
    SELECT c.column_name
      FROM information_schema.column_privileges AS c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'knowledge_documents'
       AND c.privilege_type = 'UPDATE'
       AND c.grantee = 'authenticated'
)
SELECT
    (SELECT count(*) FROM expected)                                   AS expected_count,
    (SELECT count(*) FROM granted)                                    AS granted_count,
    (SELECT count(*) FROM expected e
      WHERE NOT EXISTS (SELECT 1 FROM granted g WHERE g.column_name = e.column_name)) AS missing,
    (SELECT count(*) FROM granted g
      WHERE NOT EXISTS (SELECT 1 FROM expected e WHERE e.column_name = g.column_name)) AS unexpected,
    (SELECT count(*) FROM expected) = (SELECT count(*) FROM granted)
      AND NOT EXISTS (SELECT 1 FROM expected e
                       WHERE NOT EXISTS (SELECT 1 FROM granted g WHERE g.column_name = e.column_name))
      AND NOT EXISTS (SELECT 1 FROM granted g
                       WHERE NOT EXISTS (SELECT 1 FROM expected e WHERE e.column_name = g.column_name))
                                                                      AS pass;

SELECT '== 5. RPC execute grants: request is authenticated, worker RPCs are not ==' AS section;
WITH fns(proname, browser_allowed) AS (
    VALUES
        ('request_knowledge_page_render'::text,    true),
        ('list_knowledge_render_candidates',       false),
        ('claim_knowledge_page_render',            false),
        ('complete_knowledge_page_render',         false),
        ('fail_knowledge_page_render',             false)
), acl AS (
    SELECT p.proname,
           pg_get_userbyid(a.grantee) AS grantee,
           a.privilege_type
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
     WHERE n.nspname = 'public'
)
SELECT
    f.proname,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = f.proname)            AS exists,
    EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
             AND acl.grantee = 'authenticated' AND acl.privilege_type = 'EXECUTE') AS authenticated_execute,
    EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
             AND acl.grantee = 'anon' AND acl.privilege_type = 'EXECUTE')          AS anon_execute,
    EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
             AND acl.grantee = 'service_role' AND acl.privilege_type = 'EXECUTE')  AS service_role_execute,
    (
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = f.proname)
        AND EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
                     AND acl.grantee = 'service_role' AND acl.privilege_type = 'EXECUTE')
        AND NOT EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
                         AND acl.grantee = 'anon' AND acl.privilege_type = 'EXECUTE')
        AND EXISTS (SELECT 1 FROM acl WHERE acl.proname = f.proname
                     AND acl.grantee = 'authenticated' AND acl.privilege_type = 'EXECUTE')
            = f.browser_allowed
    )                                                                          AS pass
FROM fns AS f
ORDER BY f.proname;

SELECT '== 6. request RPC is SECURITY DEFINER; worker RPCs are not ==' AS section;
SELECT p.proname, p.prosecdef AS security_definer,
       (p.prosecdef = (p.proname = 'request_knowledge_page_render')) AS pass
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('request_knowledge_page_render', 'list_knowledge_render_candidates',
                     'claim_knowledge_page_render', 'complete_knowledge_page_render',
                     'fail_knowledge_page_render')
 ORDER BY p.proname;

SELECT '== 7. extraction functions still present and unchanged in signature ==' AS section;
-- Identity arguments as pg_get_function_identity_arguments renders them,
-- including parameter names: a signature change would be a real regression.
WITH expected(proname, args) AS (
    VALUES
        ('claim_knowledge_extraction'::text,
         'p_document_id uuid, p_lease_ttl_seconds integer'::text),
        ('renew_knowledge_processing_lease',
         'p_document_id uuid, p_lease_token uuid, p_lease_ttl_seconds integer'),
        ('fail_knowledge_extraction',
         'p_document_id uuid, p_lease_token uuid, p_processing_error text'),
        ('list_knowledge_processing_candidates',
         'p_limit integer'),
        ('complete_knowledge_extraction',
         'p_document_id uuid, p_lease_token uuid, p_page_count integer, p_pages jsonb, '
         || 'p_parser_name text, p_parser_version text, p_parser_options_hash text, '
         || 'p_raw_artifact_path text, p_expected_content_sha256 text, p_chunks jsonb')
)
SELECT
    e.proname,
    EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = e.proname
           AND pg_get_function_identity_arguments(p.oid) = e.args
    ) AS pass
FROM expected AS e
ORDER BY e.proname;

SELECT '== 8. knowledge_pages schema untouched by this rollout ==' AS section;
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_pages'
        AND column_name LIKE 'derivatives%') = 0 AS no_derivative_columns,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_pages') AS column_count,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_pages'
        AND column_name LIKE 'derivatives%') = 0 AS pass;

SELECT '== 9. this rollout implied no bucket or public Storage change ==' AS section;
SELECT
    b.id AS bucket,
    b.public,
    b.public = false AS pass
FROM storage.buckets AS b
WHERE b.id = 'knowledge-documents';

SELECT '== 10. roll-up: every gate in one row ==' AS section;
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='knowledge_documents'
        AND column_name LIKE 'derivatives%') = 7                       AS columns_ok,
    NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                 WHERE table_schema='public' AND table_name='knowledge_documents'
                   AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated'))
                                                                       AS no_table_update,
    NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema='public' AND table_name='knowledge_documents'
                   AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated')
                   AND column_name LIKE 'derivatives%')                AS derivatives_immutable,
    (SELECT count(*) FROM information_schema.column_privileges
      WHERE table_schema='public' AND table_name='knowledge_documents'
        AND privilege_type='UPDATE' AND grantee='authenticated') = 21  AS twenty_one_restored,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'request_knowledge_page_render','list_knowledge_render_candidates',
        'claim_knowledge_page_render','complete_knowledge_page_render',
        'fail_knowledge_page_render')) = 5                             AS rpcs_present;
