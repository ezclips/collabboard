-- FOLLOWUPS ITEM 17: `authenticated` loses UPDATE on content_sha256.
--
-- WHAT IS WRONG. content_sha256 sits in the `authenticated` UPDATE allowlist on
-- knowledge_documents, and nothing uses it. Searched across tracked sources:
-- application code only ever INSERTs the column (knowledgeIngestionAdapters and
-- knowledgeTextIngestionAdapters, both through the admin client), the RPCs only
-- COMPARE it as p_expected_content_sha256 for optimistic concurrency, and no
-- migration or rollout contains `SET content_sha256 =`.
--
-- WHY IT MATTERS. That value is the version, and the wiki's staleness signal is
-- a comparison of it. A client able to UPDATE it on an existing row can set it
-- back to a previously recorded value, so a genuinely changed source looks
-- unchanged and a citing page keeps quoting text that no longer says what it
-- said. Silent, and the worse of the two directions.
--
-- ============================================================================
-- SCOPE: THIS FIXES UPDATE. IT DOES NOT FIX INSERT, AND THAT IS DELIBERATE.
-- ============================================================================
--
-- `authenticated` also holds TABLE-WIDE INSERT on this table, which covers
-- every column, present and future. That is a real and separate finding, and
-- it is NOT repaired here:
--
--   * The staleness guarantee is about EXISTING documents being re-versioned.
--     INSERT creates a new row with a new id; it cannot re-version a document
--     a wiki page already cites. Removing UPDATE is therefore sufficient for
--     the guarantee this change exists to protect.
--   * Revoking table-wide INSERT is a broader change with its own blast
--     radius, and broadening a narrow repair is how a permission migration
--     turns into an outage.
--
-- The INSERT decision is written up in `.agent/retrieval-followups.md` item 18
-- with the observed facts. What this migration does is refuse to pretend the
-- INSERT path is closed.
--
-- ============================================================================
-- WHY A REVOKE, AND WHY ONLY DIRECT GRANTS ARE REPLAYED
-- ============================================================================
--
-- Omitting a column from a new GRANT does not remove a grant made earlier --
-- privileges accumulate, and only a REVOKE removes one. REVOKE UPDATE at TABLE
-- level drops the table-wide privilege and every column-level UPDATE together,
-- so this takes the house allowlist form: revoke at the table, grant back the
-- columns that had it, minus one.
--
-- The set that is replayed is read from pg_attribute.attacl -- DIRECT grants to
-- `authenticated` only. information_schema.column_privileges would also report
-- privileges reaching the role through membership or PUBLIC, and replaying
-- those as direct grants would quietly convert inherited access into permanent
-- access. That is a broadening, not a repair, so this refuses instead.
--
-- THE STARTING STATE IS VALIDATED AGAINST A REVIEWED EXPECTATION, not accepted
-- as whatever happens to be there. If this database does not match the shape
-- the change was designed against, the migration raises and the transaction
-- rolls back.

DO $$
DECLARE
    expected_update_columns CONSTANT integer := 21;
    direct_update_columns   text[];
    kept                    text;
    has_table_update        boolean;
    grantable               integer;
    inherited               integer;
BEGIN
    -- ---------------------------------------------------------------------
    -- 1. The supported starting ACL state, asserted before anything changes.
    -- ---------------------------------------------------------------------

    -- (a) No table-wide UPDATE. If one existed, a column allowlist would be
    --     decoration, and replaying "every column" as direct grants would
    --     freeze today's column list into permanent grants.
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
            'unsupported starting state: authenticated holds TABLE-WIDE UPDATE on knowledge_documents; this migration is designed for a column allowlist';
    END IF;

    -- (b) Direct column-level UPDATE grants, and only those.
    SELECT array_agg(a.attname::text ORDER BY a.attname)
      INTO direct_update_columns
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE';

    IF direct_update_columns IS NULL THEN
        RAISE EXCEPTION
            'unsupported starting state: authenticated holds no DIRECT column UPDATE grants, so there is no allowlist to narrow';
    END IF;

    -- (c) The count must match what was reviewed. A different number means
    --     this environment is not the one the change was analysed against,
    --     and that must stop the rollout rather than be papered over.
    IF array_length(direct_update_columns, 1) <> expected_update_columns THEN
        RAISE EXCEPTION
            'unsupported starting state: expected % direct UPDATE columns for authenticated, found % (%)',
            expected_update_columns,
            array_length(direct_update_columns, 1),
            array_to_string(direct_update_columns, ', ');
    END IF;

    -- (d) content_sha256 must actually be among them, or this migration is
    --     being applied to something it does not describe.
    IF NOT ('content_sha256' = ANY (direct_update_columns)) THEN
        RAISE EXCEPTION
            'unsupported starting state: content_sha256 is not in the direct UPDATE allowlist; nothing to remove';
    END IF;

    -- (e) No grant options. A grantable privilege can have been passed on,
    --     and revoking without CASCADE would fail or leave dependents.
    SELECT count(*)
      INTO grantable
      FROM pg_attribute a
      CROSS JOIN LATERAL aclexplode(a.attacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND r.rolname = 'authenticated'
       AND acl.privilege_type = 'UPDATE'
       AND acl.is_grantable;

    IF grantable > 0 THEN
        RAISE EXCEPTION
            'unsupported starting state: % UPDATE grant(s) to authenticated are WITH GRANT OPTION', grantable;
    END IF;

    -- (f) No UPDATE reaching authenticated by any path other than these direct
    --     grants. If effective privileges exceed direct ones, something is
    --     inherited -- and replaying it as a direct grant would make temporary
    --     access permanent.
    SELECT count(*)
      INTO inherited
      FROM information_schema.column_privileges p
     WHERE p.grantee = 'authenticated'
       AND p.table_schema = 'public'
       AND p.table_name = 'knowledge_documents'
       AND p.privilege_type = 'UPDATE'
       AND NOT (p.column_name = ANY (direct_update_columns));

    IF inherited > 0 THEN
        RAISE EXCEPTION
            'unsupported starting state: % UPDATE privilege(s) reach authenticated other than by direct grant', inherited;
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. The narrow repair.
    -- ---------------------------------------------------------------------

    SELECT string_agg(quote_ident(col), ', ' ORDER BY col)
      INTO kept
      FROM unnest(direct_update_columns) AS col
     WHERE col <> 'content_sha256';

    RAISE NOTICE 'before: % direct UPDATE columns for authenticated', array_length(direct_update_columns, 1);
    RAISE NOTICE 'after : %', kept;

    EXECUTE 'REVOKE UPDATE ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.knowledge_documents TO authenticated', kept);

    -- ---------------------------------------------------------------------
    -- 3. The post-state, asserted inside the same transaction.
    -- ---------------------------------------------------------------------

    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'repair failed: authenticated can still UPDATE content_sha256';
    END IF;

    IF (SELECT count(*)
          FROM information_schema.column_privileges
         WHERE grantee = 'authenticated'
           AND table_schema = 'public'
           AND table_name = 'knowledge_documents'
           AND privilege_type = 'UPDATE') <> expected_update_columns - 1 THEN
        RAISE EXCEPTION 'repair failed: the surviving UPDATE allowlist is not the expected % columns', expected_update_columns - 1;
    END IF;
END $$;

-- service_role is untouched: it is the role the server writes with, and the
-- insert path for content_sha256 runs through it.
