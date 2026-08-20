-- Read-only verification for 20260820_knowledge_pdf_v1.sql.
-- This file creates no persistent objects and does not modify data.

WITH expected(table_name) AS (
    VALUES
        ('knowledge_documents'::text),
        ('knowledge_pages'::text),
        ('knowledge_chunks'::text),
        ('source_references'::text)
)
SELECT
    e.table_name,
    to_regclass('public.' || e.table_name) IS NOT NULL AS exists,
    COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM expected AS e
LEFT JOIN pg_class AS c
    ON c.oid = to_regclass('public.' || e.table_name)
ORDER BY e.table_name;

-- Exact row counts are collected dynamically only for tables that exist. This
-- keeps the verifier safe to run before a rollout or against a partial state.
DO $row_counts$
DECLARE
    object_name text;
    row_count bigint;
    row_counts jsonb := '{}'::jsonb;
BEGIN
    FOREACH object_name IN ARRAY ARRAY[
        'knowledge_documents',
        'knowledge_pages',
        'knowledge_chunks',
        'source_references'
    ] LOOP
        IF to_regclass(format('public.%I', object_name)) IS NULL THEN
            row_counts := row_counts || jsonb_build_object(object_name, NULL);
        ELSE
            EXECUTE format('SELECT count(*) FROM public.%I', object_name)
                INTO row_count;
            row_counts := row_counts || jsonb_build_object(object_name, row_count);
        END IF;
    END LOOP;

    RAISE NOTICE 'knowledge_row_counts=%', row_counts;
END
$row_counts$;

SELECT
    EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'knowledge-documents'
    ) AS bucket_exists,
    COALESCE((
        SELECT public = false
        FROM storage.buckets
        WHERE id = 'knowledge-documents'
    ), false) AS bucket_private;

WITH expected_rpc(name) AS (
    VALUES
        ('complete_knowledge_extraction'::text),
        ('claim_knowledge_extraction'::text),
        ('renew_knowledge_processing_lease'::text),
        ('fail_knowledge_extraction'::text),
        ('list_knowledge_processing_candidates'::text)
)
SELECT
    p.proname AS name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef AS security_definer,
    EXISTS (
        SELECT 1
        FROM aclexplode(
            COALESCE(p.proacl, acldefault('f', p.proowner))
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ) AS public_execute,
    has_function_privilege(p.oid, 'EXECUTE') AS current_role_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN expected_rpc AS e ON e.name = p.proname
WHERE n.nspname = 'public'
ORDER BY p.proname, arguments;

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'knowledge_documents'
  AND column_name IN (
      'processing_lease_token',
      'processing_lease_expires_at',
      'processing_attempt'
  )
ORDER BY ordinal_position;

SELECT
    to_regclass('public.knowledge_elements') IS NULL AS knowledge_elements_absent,
    EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
    ) AS vector_extension_present;

SELECT jsonb_build_object(
    'tables_present', (
        SELECT count(*) = 4
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'knowledge_documents',
              'knowledge_pages',
              'knowledge_chunks',
              'source_references'
          )
          AND c.relkind = 'r'
    ),
    'rls_enabled', (
        SELECT count(*) = 4
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'knowledge_documents',
              'knowledge_pages',
              'knowledge_chunks',
              'source_references'
          )
          AND c.relkind = 'r'
          AND c.relrowsecurity
    ),
    'private_bucket', EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'knowledge-documents'
          AND public = false
    ),
    'knowledge_rpc_count', (
        SELECT count(*)
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'complete_knowledge_extraction',
              'claim_knowledge_extraction',
              'renew_knowledge_processing_lease',
              'fail_knowledge_extraction',
              'list_knowledge_processing_candidates'
          )
    ),
    'lease_columns', (
        SELECT count(*) = 3
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_documents'
          AND column_name IN (
              'processing_lease_token',
              'processing_lease_expires_at',
              'processing_attempt'
          )
    ),
    'knowledge_elements_absent',
        to_regclass('public.knowledge_elements') IS NULL,
    'vector_extension_absent', NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
    )
) AS rollout_readiness;
