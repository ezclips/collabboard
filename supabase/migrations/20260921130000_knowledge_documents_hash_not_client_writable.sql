-- FOLLOWUPS ITEM 17: `authenticated` loses UPDATE on content_sha256.
--
-- WHAT IS WRONG. content_sha256 sits in the `authenticated` UPDATE allowlist on
-- knowledge_documents, and nothing uses it. Across tracked sources, application
-- code only INSERTs the column (knowledgeIngestionAdapters,
-- knowledgeTextIngestionAdapters -- both through the admin client), the RPCs
-- only COMPARE it as p_expected_content_sha256, and no migration or rollout
-- contains `SET content_sha256 =`.
--
-- WHY IT MATTERS. That value is the version, and the wiki's staleness signal is
-- a comparison of it. A client able to UPDATE it on an existing row can set it
-- back to a previously recorded value, so a genuinely changed source looks
-- unchanged and a citing page keeps quoting text that no longer says what it
-- said.
--
-- SCOPE: THIS FIXES UPDATE ONLY. `authenticated` also holds TABLE-WIDE INSERT,
-- which reaches every column including this one and any added later. That is
-- followups item 18, and it is a PREREQUISITE in its own right rather than a
-- tidy-up -- a caller may supply an explicit `id`, so a deleted document can be
-- recreated under its old id with a chosen hash. Item 18 is a separate
-- migration because broadening a narrow repair is how a permission change
-- becomes an outage; the two are ordered, not merged.
--
-- ============================================================================
-- WHY A REVOKE, AND WHAT IS VALIDATED FIRST
-- ============================================================================
--
-- Omitting a column from a new GRANT does not remove an earlier grant --
-- privileges accumulate, and only a REVOKE removes one. REVOKE UPDATE at TABLE
-- level drops the table-wide privilege and every column-level UPDATE together,
-- so this takes the house allowlist form: revoke at the table, grant back the
-- reviewed columns, minus one.
--
-- THE EXPECTED ALLOWLIST IS PINNED BY NAME, NOT BY COUNT. An earlier version
-- of this migration checked the direct set's SIZE and that content_sha256 was
-- in it. A different 21-column set containing content_sha256 would have
-- passed, and the error that printed the found set is a message, not a
-- comparison. The array below is compared exactly, in both directions.
--
-- PROVENANCE OF THAT ARRAY, stated because it matters: it is derived from this
-- repository's migration history -- every column of knowledge_documents except
-- `id` -- and it matches the column count observed on the live schema. It has
-- NOT been observed name-by-name. If it is wrong, this migration fails and
-- prints both sets rather than repairing anything; that is the intended
-- behaviour, and correcting the array from that output is the next step.

DO $$
DECLARE
    expected_update_columns CONSTANT text[] := ARRAY[
        'board_id',
        'content_sha256',
        'created_at',
        'created_by',
        'derivatives_rendered_at',
        'derivatives_requested_at',
        'file_size_bytes',
        'kind',
        'mime_type',
        'original_filename',
        'page_count',
        'parser_name',
        'parser_options_hash',
        'parser_version',
        'processing_error',
        'processing_lease_expires_at',
        'processing_lease_token',
        'processing_status',
        'raw_artifact_path',
        'storage_path',
        'updated_at'
    ];
    direct_columns    text[];
    effective_columns text[];
    kept              text;
    missing           text[];
    extra             text[];
    has_table_update  boolean;
    grantable         integer;
BEGIN
    -- ---------------------------------------------------------------------
    -- 1. The supported starting ACL state.
    -- ---------------------------------------------------------------------

    -- (a) No table-wide UPDATE: a column allowlist would otherwise be
    --     decoration, and replaying "every column" would freeze today's
    --     column list into permanent grants.
    SELECT EXISTS (
        SELECT 1
          FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = 'public.knowledge_documents'::regclass
           AND r.rolname = 'authenticated'
           AND acl.privilege_type = 'UPDATE'
    ) INTO has_table_update;

    IF has_table_update THEN
        RAISE EXCEPTION
            'unsupported starting state: authenticated holds TABLE-WIDE UPDATE; this migration is designed for a column allowlist';
    END IF;

    -- (b) DIRECT column grants, from the ACL itself.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO direct_columns
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE';

    -- (c) EFFECTIVE privileges, asked of every live column.
    --
    --     This is the check the earlier version could not perform. Filtering
    --     information_schema by grantee = 'authenticated' cannot see privileges
    --     arriving through PUBLIC or through role membership -- those rows
    --     carry a different grantee entirely. has_column_privilege answers what
    --     the role can actually do, whatever the path.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_columns
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE');

    -- (d) Effective must equal direct. If it exceeds it, UPDATE is reaching
    --     the role by a path this migration cannot revoke, and replaying the
    --     direct set would turn inherited access into permanent direct grants
    --     while leaving the inherited path open.
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(effective_columns) c WHERE NOT (c = ANY (direct_columns));
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported starting state: UPDATE reaches authenticated on % by a path other than a direct grant (PUBLIC or role membership)',
            array_to_string(extra, ', ');
    END IF;

    -- (e) EXACT comparison against the reviewed array, both directions.
    SELECT array_agg(c ORDER BY c) INTO missing
      FROM unnest(expected_update_columns) c WHERE NOT (c = ANY (direct_columns));
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(direct_columns) c WHERE NOT (c = ANY (expected_update_columns));

    IF missing IS NOT NULL OR extra IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported starting state: the UPDATE allowlist is not the reviewed set. missing=[%] unexpected=[%]',
            coalesce(array_to_string(missing, ', '), ''),
            coalesce(array_to_string(extra, ', '), '');
    END IF;

    -- (f) No grant options: a grantable privilege may have been passed on.
    SELECT count(*) INTO grantable
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE'
       AND acl.is_grantable;

    IF grantable > 0 THEN
        RAISE EXCEPTION 'unsupported starting state: % UPDATE grant(s) are WITH GRANT OPTION', grantable;
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. The narrow repair.
    -- ---------------------------------------------------------------------

    SELECT string_agg(quote_ident(c), ', ' ORDER BY c) INTO kept
      FROM unnest(expected_update_columns) c WHERE c <> 'content_sha256';

    RAISE NOTICE 'item 17: removing content_sha256 from the authenticated UPDATE allowlist';

    EXECUTE 'REVOKE UPDATE ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.knowledge_documents TO authenticated', kept);

    -- ---------------------------------------------------------------------
    -- 3. The post-state, by EFFECTIVE privilege, in the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_columns
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE');

    SELECT array_agg(c ORDER BY c) INTO missing
      FROM unnest(expected_update_columns) c
     WHERE c <> 'content_sha256' AND NOT (c = ANY (effective_columns));
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(effective_columns) c WHERE NOT (c = ANY (expected_update_columns));

    IF 'content_sha256' = ANY (effective_columns) THEN
        RAISE EXCEPTION 'repair failed: authenticated can still UPDATE content_sha256';
    END IF;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: these columns lost UPDATE and should not have: %', array_to_string(missing, ', ');
    END IF;
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION 'repair failed: unexpected UPDATE remains on: %', array_to_string(extra, ', ');
    END IF;
END $$;

-- service_role is untouched: it is the role the server writes with.
