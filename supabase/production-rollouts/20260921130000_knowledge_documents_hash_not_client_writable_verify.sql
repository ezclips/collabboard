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
    remaining integer;
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

    -- 4. THE OTHER HALF: the intended writable columns must SURVIVE. A revoke
    --    that took everything would satisfy every check above.
    SELECT count(*)
      INTO remaining
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated'
       AND table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND privilege_type = 'UPDATE';

    IF remaining <> 20 THEN
        RAISE EXCEPTION
            'expected 20 updatable columns for authenticated after removing content_sha256, found %', remaining;
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

-- (B) Against the REAL, MIGRATED table, with a representative row, as
--     `authenticated`, under RLS.
--
--     The copied-table probe above is evidence about GRANTS only -- it has no
--     RLS and it is not the table the application uses. This one is. It runs
--     inside a transaction that is rolled back, so no row survives it.
--
--     The two failure modes must be told apart: a hash write blocked by RLS
--     would look like success here while proving nothing about privileges, so
--     the permitted metadata update is required to SUCCEED on the same row
--     under the same identity. If RLS were hiding the row, that would fail too.
DO $$
DECLARE
    probe_board uuid;
    probe_doc uuid;
    blocked boolean := false;
    permitted_ok boolean := false;
BEGIN
    IF to_regclass('public.boards') IS NULL THEN
        RAISE NOTICE 'skipping the live-table control: no boards table in this database';
        RETURN;
    END IF;

    -- A board the probe identity may act on has to exist for RLS to permit
    -- anything. Creating one is the test environment's job; if the operator
    -- has not supplied one, say so rather than pass silently.
    SELECT id INTO probe_board FROM public.boards LIMIT 1;
    IF probe_board IS NULL THEN
        RAISE EXCEPTION
            'the live-table control needs at least one board row in the isolated test database';
    END IF;

    INSERT INTO public.knowledge_documents
        (board_id, kind, original_filename, content_sha256, processing_status, file_size_bytes, storage_path, mime_type)
    VALUES
        (probe_board, 'text', 'item17-probe.txt', repeat('c', 64), 'ready', 1, 'probe/item17', 'text/plain')
    RETURNING id INTO probe_doc;

    SET LOCAL ROLE authenticated;

    BEGIN
        UPDATE public.knowledge_documents
           SET content_sha256 = repeat('d', 64)
         WHERE id = probe_doc;
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := true;
    END;

    BEGIN
        UPDATE public.knowledge_documents
           SET processing_status = 'failed'
         WHERE id = probe_doc;
        permitted_ok := FOUND;
    EXCEPTION WHEN insufficient_privilege THEN
        permitted_ok := false;
    END;

    RESET ROLE;
    DELETE FROM public.knowledge_documents WHERE id = probe_doc;

    IF NOT blocked THEN
        RAISE EXCEPTION
            'authenticated rewrote content_sha256 on the real table -- the repair is not in force';
    END IF;

    -- Without this, an RLS policy hiding the row entirely would produce the
    -- same "blocked" reading and be mistaken for a privilege success.
    IF NOT permitted_ok THEN
        RAISE EXCEPTION
            'the permitted metadata update did not apply -- this control cannot distinguish a privilege block from an RLS block, so it must not pass';
    END IF;
END $$;

SELECT 'knowledge_documents hash permission verify: ok' AS result;
