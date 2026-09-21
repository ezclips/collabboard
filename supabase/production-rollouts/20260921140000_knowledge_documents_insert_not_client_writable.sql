-- FOLLOWUPS ITEM 18: `authenticated` and `anon` lose table-wide INSERT on
-- knowledge_documents.
--
-- A PREREQUISITE, NOT A TIDY-UP. An earlier note argued INSERT could not
-- defeat the staleness guarantee because it creates new rows with new ids.
-- THAT REASONING WAS WRONG, and the live schema says why:
--
--   * `id` has a gen_random_uuid() DEFAULT. It is not an identity column
--     (is_identity = NO) and not generated (is_generated = NEVER), so a caller
--     MAY SUPPLY AN EXPLICIT id.
--   * The INSERT policy checks `created_by = auth.uid()` and board ownership
--     or an editor role. It says nothing about `id`.
--
-- So a permitted client can recreate a DELETED document under its OLD id, with
-- a chosen content_sha256 and -- once that column exists -- a chosen
-- transcript_representation. A wiki source previously shown as gone would
-- appear present and unchanged. That defeats provenance and staleness
-- together, and it is why this must land before the transcript guarantee is
-- accepted live.
--
-- WHY REVOKE RATHER THAN ALLOWLIST. Every production INSERT into this table
-- runs in lib/infra/knowledge/*Adapters.ts through the admin (service_role)
-- client; no component, hook or other client-side path inserts. The capability
-- is unused, so the narrowest correct repair is to remove it rather than to
-- curate which columns a client may choose. An allowlist would still let a
-- client create rows -- and `id` and `created_by` would have to be excluded
-- anyway, which leaves a client able to insert almost nothing useful.
--
-- If a client workflow is later verified to need INSERT, the allowlist form is
-- the way back: revoke at the table, grant the columns that workflow writes,
-- excluding at minimum id, content_sha256, transcript_representation and the
-- lifecycle columns the server owns.
--
-- RLS IS NOT A SUBSTITUTE FOR THIS, and vice versa. They are independent: the
-- policy denies `anon` today while the grant still permits it, which is
-- exactly the split this migration closes on the grant side.

DO $$
DECLARE
    expected_insert_roles CONSTANT text[] := ARRAY['anon', 'authenticated'];
    found_roles text[];
    still text[];
BEGIN
    -- ---------------------------------------------------------------------
    -- 1. The supported starting state, validated rather than assumed.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(DISTINCT r.rolname::text ORDER BY r.rolname::text), ARRAY[]::text[])
      INTO found_roles
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
     WHERE c.oid = 'public.knowledge_documents'::regclass
       AND acl.privilege_type = 'INSERT'
       AND r.rolname = ANY (expected_insert_roles);

    IF NOT (found_roles @> expected_insert_roles AND found_roles <@ expected_insert_roles) THEN
        RAISE EXCEPTION
            'unsupported starting state: expected table-wide INSERT for [%], found [%]',
            array_to_string(expected_insert_roles, ', '),
            array_to_string(found_roles, ', ');
    END IF;

    -- service_role must hold INSERT, or removing the client grants would take
    -- ingestion down with them.
    IF NOT has_table_privilege('service_role', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION
            'refusing to proceed: service_role cannot INSERT, so removing client INSERT would break ingestion';
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. The repair. Column-level INSERT grants go with the table-level one.
    -- ---------------------------------------------------------------------

    RAISE NOTICE 'item 18: removing INSERT on knowledge_documents from anon and authenticated';

    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM authenticated';
    EXECUTE 'REVOKE INSERT ON TABLE public.knowledge_documents FROM anon';

    -- ---------------------------------------------------------------------
    -- 3. The post-state, by EFFECTIVE privilege, in the same transaction.
    -- ---------------------------------------------------------------------

    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'repair failed: INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    IF NOT has_table_privilege('service_role', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'repair failed: service_role lost INSERT';
    END IF;
END $$;
