-- VERIFY item 17: the hash is no longer client-UPDATABLE, the rest of the
-- allowlist survived, and the INSERT path is reported as it actually is.
--
-- CORRECTED. An earlier version of this file asserted that `authenticated`
-- cannot INSERT content_sha256. That assertion was FALSE against the live
-- schema: `authenticated` holds TABLE-WIDE INSERT on knowledge_documents,
-- which covers every column, present and future. The check would have failed
-- on a correctly applied migration. It is replaced below by an assertion of
-- what is actually intended, plus a notice recording the open INSERT path so
-- it cannot be forgotten.
--
-- Effective privileges are read with has_column_privilege rather than from the
-- grant catalogue, because privileges accumulate from direct grants, role
-- membership and PUBLIC, and a catalogue row is only one of those sources.

DO $$
DECLARE
    -- The reviewed allowlist MINUS content_sha256: what must remain.
    expected_after CONSTANT text[] := ARRAY[
        'board_id','created_at','created_by','derivatives_rendered_at',
        'derivatives_requested_at','file_size_bytes','kind','mime_type',
        'original_filename','page_count','parser_name','parser_options_hash',
        'parser_version','processing_error','processing_lease_expires_at',
        'processing_lease_token','processing_status','raw_artifact_path',
        'storage_path','updated_at'
    ];
    effective_columns text[];
    missing text[];
    extra text[];
    table_insert boolean;
BEGIN
    -- 1. The thing this migration exists to stop.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can still UPDATE content_sha256';
    END IF;

    -- 2. A table-wide UPDATE would make the column allowlist decoration.
    IF has_table_privilege('authenticated', 'public.knowledge_documents', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated holds table-wide UPDATE; the column allowlist is not in force';
    END IF;

    -- 3. anon must not be able to UPDATE the hash.
    IF has_column_privilege('anon', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'anon can UPDATE content_sha256';
    END IF;

    -- 4. THE OTHER HALF, by EFFECTIVE privilege and by NAME.
    --
    --    A count would pass on the wrong twenty columns, and filtering
    --    information_schema by grantee cannot see privileges arriving through
    --    PUBLIC or role membership. has_column_privilege over every live
    --    column answers what the role can actually do, whatever the path.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO effective_columns
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE');

    SELECT array_agg(c ORDER BY c) INTO missing
      FROM unnest(expected_after) c WHERE NOT (c = ANY (effective_columns));
    SELECT array_agg(c ORDER BY c) INTO extra
      FROM unnest(effective_columns) c WHERE NOT (c = ANY (expected_after));

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'these columns lost UPDATE and should not have: %', array_to_string(missing, ', ');
    END IF;
    IF extra IS NOT NULL THEN
        RAISE EXCEPTION 'unexpected UPDATE remains for authenticated on: %', array_to_string(extra, ', ');
    END IF;
    -- 5. service_role must still be able to do the server's work.
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'content_sha256', 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT content_sha256 -- ingestion would fail';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'processing_status', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role cannot UPDATE processing_status -- promotion to ready would fail';
    END IF;

    -- 6. THE INSERT PATH, REPORTED RATHER THAN ASSERTED AWAY.
    --
    --    This migration narrows UPDATE only. Table-wide INSERT remains, and it
    --    reaches every column including content_sha256 and, once it exists,
    --    transcript_representation. That is recorded as followups item 18 and
    --    is not repaired here -- INSERT creates new rows and cannot re-version
    --    a document a wiki page already cites, which is what the staleness
    --    guarantee protects.
    --
    --    The notice exists so a reading of this output cannot leave someone
    --    believing the column is unwritable by clients in every sense.
    table_insert := has_table_privilege('authenticated', 'public.knowledge_documents', 'INSERT');
    IF table_insert THEN
        RAISE NOTICE
            'OPEN, BY DECISION: authenticated holds table-wide INSERT, so it can supply content_sha256 (and transcript_representation) on rows it creates. Item 18.';
    ELSE
        RAISE NOTICE
            'authenticated does not hold table-wide INSERT -- narrower than the state item 17 was designed against; re-check item 18.';
    END IF;
END $$;

-- ===========================================================================
-- BEHAVIOURAL CONTROLS. Privilege functions describe the catalogue; these
-- exercise it.
-- ===========================================================================

-- (A) Against a COPY of the table carrying the same column grants. This
--     isolates privileges from RLS: a failure here is a grant failure.
DO $$
DECLARE
    blocked boolean := false;
BEGIN
    CREATE TEMP TABLE hash_grant_probe
        (LIKE public.knowledge_documents INCLUDING CONSTRAINTS) ON COMMIT DROP;

    EXECUTE 'REVOKE ALL ON hash_grant_probe FROM authenticated';
    EXECUTE 'GRANT INSERT, SELECT ON hash_grant_probe TO authenticated';
    EXECUTE format(
        'GRANT UPDATE (%s) ON hash_grant_probe TO authenticated',
        (SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
           FROM information_schema.column_privileges
          WHERE grantee = 'authenticated'
            AND table_schema = 'public'
            AND table_name = 'knowledge_documents'
            AND privilege_type = 'UPDATE')
    );

    INSERT INTO hash_grant_probe (board_id, original_filename, content_sha256, processing_status)
    VALUES (gen_random_uuid(), 'probe.txt', repeat('a', 64), 'ready');

    SET LOCAL ROLE authenticated;
    BEGIN
        UPDATE hash_grant_probe SET content_sha256 = repeat('b', 64);
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := true;
    END;

    IF NOT blocked THEN
        RESET ROLE;
        RAISE EXCEPTION 'authenticated rewrote content_sha256 on a table carrying the same grants';
    END IF;

    -- The permitted write must still work, or the repair broke ordinary use.
    UPDATE hash_grant_probe SET processing_status = 'failed';
    RESET ROLE;
END $$;

-- (B) Against the REAL, MIGRATED table, as a GENUINELY AUTHORIZED identity,
--     under RLS.
--
--     CORRECTED. An earlier version did `SET LOCAL ROLE authenticated` without
--     establishing any JWT claims and picked an arbitrary board with
--     `SELECT id FROM boards LIMIT 1`. auth.uid() was therefore NULL, every
--     RLS policy on this table denied, and the permitted update could never
--     apply -- so the probe would have raised its own
--     "cannot distinguish a privilege block from an RLS block" exception on a
--     correctly applied migration. It proved nothing and failed honestly only
--     by accident.
--
--     This version establishes the identity the policies actually read:
--     a board is chosen together with its OWNER, request.jwt.claims is set so
--     auth.uid() returns that owner, and the identity is asserted before any
--     write is attempted. Both updates then run against the SAME row under the
--     SAME identity, so the two outcomes are comparable: the hash write must
--     fail on privileges while the metadata write succeeds under RLS.
--
--     Everything is undone before the block ends; no row survives it.
DO $
DECLARE
    probe_board uuid;
    probe_owner uuid;
    probe_doc   uuid;
    seen_uid    uuid;
    blocked     boolean := false;
    permitted   boolean := false;
BEGIN
    IF to_regclass('public.boards') IS NULL THEN
        RAISE NOTICE 'skipping the live-table control: no boards table here';
        RETURN;
    END IF;

    -- A board WITH its owner. The owner is what auth.uid() must return for the
    -- INSERT and UPDATE policies to permit anything at all.
    SELECT b.id, b.user_id
      INTO probe_board, probe_owner
      FROM public.boards b
     WHERE b.user_id IS NOT NULL
     LIMIT 1;

    IF probe_board IS NULL THEN
        RAISE EXCEPTION
            'the live-table control needs a board with an owner (boards.user_id) in the isolated test database';
    END IF;

    -- Seeded as the owner, so created_by = auth.uid() holds for the policy.
    INSERT INTO public.knowledge_documents
        (board_id, created_by, kind, original_filename, content_sha256,
         processing_status, file_size_bytes, storage_path, mime_type)
    VALUES
        (probe_board, probe_owner, 'text', 'item17-probe.txt', repeat('c', 64),
         'ready', 1, 'probe/item17', 'text/plain')
    RETURNING id INTO probe_doc;

    -- The claim auth.uid() reads. Local to this transaction.
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', probe_owner::text, 'role', 'authenticated')::text,
        true
    );
    SET LOCAL ROLE authenticated;

    -- ASSERT THE IDENTITY BEFORE TRUSTING ANY OUTCOME. Without this, a null
    -- uid would make both writes fail and look like a privilege result.
    seen_uid := auth.uid();
    IF seen_uid IS NULL OR seen_uid <> probe_owner THEN
        RESET ROLE;
        RAISE EXCEPTION
            'the probe identity was not established: auth.uid() = %, expected %', seen_uid, probe_owner;
    END IF;

    -- The write this migration must stop. Privilege failure, not policy.
    BEGIN
        UPDATE public.knowledge_documents
           SET content_sha256 = repeat('d', 64)
         WHERE id = probe_doc;
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := true;
    END;

    -- The write that must still work, same row, same identity.
    BEGIN
        UPDATE public.knowledge_documents
           SET processing_status = 'failed'
         WHERE id = probe_doc;
        permitted := FOUND;
    EXCEPTION WHEN insufficient_privilege THEN
        permitted := false;
    END;

    RESET ROLE;
    DELETE FROM public.knowledge_documents WHERE id = probe_doc;

    IF NOT blocked THEN
        RAISE EXCEPTION
            'authenticated rewrote content_sha256 on the real table -- the repair is not in force';
    END IF;

    -- RLS and grants are independent, and this separates them: if the row were
    -- invisible or the policy denied, this would fail too, and the blocked
    -- result above would mean nothing about privileges.
    IF NOT permitted THEN
        RAISE EXCEPTION
            'the permitted metadata update did not apply under RLS, so the hash block cannot be attributed to privileges';
    END IF;
END $;

SELECT 'knowledge_documents hash permission verify: ok' AS result;
