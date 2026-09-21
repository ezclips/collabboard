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
-- SCOPE. This fixes UPDATE. Client INSERT is item 18, which is a prerequisite
-- in its own right: `id` has a DEFAULT rather than being generated, so a caller
-- may supply one and recreate a deleted document under its old id. The two are
-- ordered, not merged.
--
-- ============================================================================
-- REPEAT-APPLICABLE BY DESIGN
-- ============================================================================
--
-- An earlier version of this migration accepted exactly one starting state --
-- the 21-column allowlist -- and raised on any other, so running it twice
-- failed on its own result. A migration that cannot recognise its own
-- post-state is not safely re-runnable, and a rollout sequence has to be able
-- to apply, verify, apply again and still be correct.
--
-- So exactly three outcomes are possible here:
--
--   NEEDS REPAIR   the supported pre-state -> revoke and re-grant
--   ALREADY DONE   the exact intended post-state -> verified no-op
--   anything else  -> raise, and change nothing
--
-- ============================================================================
-- WHY A REVOKE, AND WHAT IS COMPARED
-- ============================================================================
--
-- Omitting a column from a new GRANT does not remove an earlier grant;
-- privileges accumulate and only a REVOKE removes one. REVOKE UPDATE at TABLE
-- level drops the table-wide privilege and every column-level UPDATE together,
-- so this takes the house allowlist form.
--
-- The allowlist is pinned BY NAME and compared in both directions. A count
-- would pass on the wrong columns. Effective privileges are read with
-- has_column_privilege over every live column, because filtering
-- information_schema by grantee cannot see privileges arriving through PUBLIC
-- or role membership -- those rows carry a different grantee.
--
-- PROVENANCE OF THE ARRAY: the set restored by the PDF-R1 rollout, which
-- names it as "the exact mutable column set this rollout restores UPDATE on"
-- -- see 20260903_pdf_derivative_render_lifecycle.sql. Read back from the
-- hosted ACL and reproduced on an isolated local stack, name by name, both
-- agreeing with that list.
--
-- AN EARLIER DRAFT GUESSED IT, and the guess is worth recording because the
-- shape of the error is the point. It was inferred as "every column except
-- `id`" and checked only against the COLUMN COUNT, which matched -- 21 either
-- way. The guess wrongly included derivatives_rendered_at and
-- derivatives_requested_at (server-written lifecycle columns, never granted to
-- a client) and wrongly omitted `id` and processing_attempt. A count agreed
-- while the SET was wrong, which is exactly why this is pinned BY NAME: the
-- exact-name comparison refused to run and printed both sets, as designed.
--
-- NOTE, NOT A CHANGE: `id` really is client-UPDATE-able here. That predates
-- this migration, whose contract is to remove content_sha256 and preserve the
-- rest EXACTLY; narrowing it silently would break restoration matching. It is
-- recorded as followups item 20.

DO $item17$
DECLARE
    expected_all CONSTANT text[] := ARRAY[
        'board_id', 'content_sha256', 'created_at', 'created_by',
        'file_size_bytes', 'id', 'kind', 'mime_type', 'original_filename',
        'page_count', 'parser_name', 'parser_options_hash', 'parser_version',
        'processing_attempt', 'processing_error',
        'processing_lease_expires_at', 'processing_lease_token',
        'processing_status', 'raw_artifact_path', 'storage_path', 'updated_at'
    ];
    expected_after text[];
    direct_columns    text[];
    effective_columns text[];
    kept    text;
    missing text[];
    extra   text[];
    has_table_update boolean;
    grantable integer;
BEGIN
    SELECT array_agg(c ORDER BY c) INTO expected_after
      FROM unnest(expected_all) c WHERE c <> 'content_sha256';

    -- ---------------------------------------------------------------------
    -- Facts, gathered once.
    -- ---------------------------------------------------------------------

    SELECT EXISTS (
        SELECT 1 FROM pg_class c
          CROSS JOIN LATERAL aclexplode(c.relacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE c.oid = 'public.knowledge_documents'::regclass
           AND r.rolname = 'authenticated'
           AND acl.privilege_type = 'UPDATE'
    ) INTO has_table_update;

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO direct_columns
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE';

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_columns
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE');

    SELECT count(*) INTO grantable
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE'
       AND acl.is_grantable;

    -- ---------------------------------------------------------------------
    -- Invariants that must hold in EITHER accepted state.
    -- ---------------------------------------------------------------------

    IF has_table_update THEN
        RAISE EXCEPTION
            'unsupported state: authenticated holds TABLE-WIDE UPDATE; this migration is designed for a column allowlist';
    END IF;

    IF grantable > 0 THEN
        RAISE EXCEPTION 'unsupported state: % UPDATE grant(s) to authenticated are WITH GRANT OPTION', grantable;
    END IF;

    -- Effective must not exceed direct, or UPDATE is reaching the role by a
    -- path this migration cannot revoke -- and replaying the direct set would
    -- make inherited access permanent while leaving that path open.
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(effective_columns) c WHERE NOT (c = ANY (direct_columns));
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: UPDATE reaches authenticated on [%] other than by a direct grant (PUBLIC or role membership)',
            array_to_string(extra, ', ');
    END IF;

    -- ---------------------------------------------------------------------
    -- ALREADY DONE: the exact intended post-state. Verified, then no-op.
    -- ---------------------------------------------------------------------

    IF effective_columns @> expected_after AND effective_columns <@ expected_after THEN
        RAISE NOTICE 'item 17: already applied -- authenticated cannot UPDATE content_sha256, and the other % columns are intact',
            array_length(expected_after, 1);
        RETURN;
    END IF;

    -- ---------------------------------------------------------------------
    -- NEEDS REPAIR: the exact supported pre-state, and nothing else.
    -- ---------------------------------------------------------------------

    SELECT array_agg(c ORDER BY c) INTO missing
      FROM unnest(expected_all) c WHERE NOT (c = ANY (effective_columns));
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(effective_columns) c WHERE NOT (c = ANY (expected_all));

    IF missing IS NOT NULL OR extra IS NOT NULL THEN
        RAISE EXCEPTION
            'unsupported state: the UPDATE allowlist is neither the reviewed pre-state nor the intended post-state. missing=[%] unexpected=[%]',
            coalesce(array_to_string(missing, ', '), ''),
            coalesce(array_to_string(extra, ', '), '');
    END IF;

    SELECT string_agg(quote_ident(c), ', ' ORDER BY c) INTO kept FROM unnest(expected_after) c;

    RAISE NOTICE 'item 17: removing content_sha256 from the authenticated UPDATE allowlist';

    EXECUTE 'REVOKE UPDATE ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.knowledge_documents TO authenticated', kept);

    -- ---------------------------------------------------------------------
    -- Post-state, by EFFECTIVE privilege, inside the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_columns
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE');

    IF NOT (effective_columns @> expected_after AND effective_columns <@ expected_after) THEN
        RAISE EXCEPTION 'repair failed: the surviving UPDATE set is not the intended post-state ([%])',
            array_to_string(effective_columns, ', ');
    END IF;
END
$item17$;

-- service_role is untouched: it is the role the server writes with.
