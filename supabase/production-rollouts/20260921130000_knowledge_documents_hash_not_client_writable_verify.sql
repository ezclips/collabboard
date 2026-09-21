-- VERIFY item 17: the hash is no longer client-writable, and nothing else was
-- taken away.
--
-- Effective privileges are checked with has_column_privilege rather than by
-- reading the grant catalogue, because what matters is what a role can
-- actually do -- privileges accumulate from direct grants, role membership and
-- PUBLIC, and a catalogue row is only one of those sources.

DO $$
DECLARE
    remaining integer;
BEGIN
    -- 1. The thing this migration exists to stop.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can still UPDATE content_sha256';
    END IF;

    -- 2. A table-wide UPDATE would make the column list meaningless.
    IF has_table_privilege('authenticated', 'public.knowledge_documents', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated holds table-wide UPDATE; the column allowlist is not in force';
    END IF;

    -- 3. anon must not have acquired anything either.
    IF has_column_privilege('anon', 'public.knowledge_documents', 'content_sha256', 'UPDATE')
       OR has_column_privilege('anon', 'public.knowledge_documents', 'content_sha256', 'INSERT') THEN
        RAISE EXCEPTION 'anon can write content_sha256';
    END IF;

    -- 4. INSERT IS A SEPARATE QUESTION and is checked separately, because a
    --    role that cannot UPDATE the hash but can INSERT a row still chooses
    --    the hash of everything it creates.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'INSERT') THEN
        RAISE EXCEPTION
            'authenticated can INSERT content_sha256 -- a client could create a document with a chosen version';
    END IF;

    -- 5. And the same question for the transcript representation, which is the
    --    other half of a transcript's version: a caller able to create a
    --    transcript-bearing row through any permitted path would be choosing
    --    both halves at once.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'transcript_representation', 'INSERT')
       OR has_column_privilege('authenticated', 'public.knowledge_documents', 'transcript_representation', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can write transcript_representation';
    END IF;

    -- 6. THE OTHER HALF: the intended writable columns must SURVIVE. A revoke
    --    that took everything would satisfy every check above.
    SELECT count(*)
      INTO remaining
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated'
       AND table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND privilege_type = 'UPDATE';

    -- The allowlist analysed before this change was 21 columns, so exactly 20
    -- must remain. A different number means this environment did not match the
    -- one the change was designed against, and that must stop the rollout
    -- rather than pass quietly.
    IF remaining <> 20 THEN
        RAISE EXCEPTION
            'expected 20 updatable columns for authenticated after removing content_sha256, found %', remaining;
    END IF;

    -- 7. service_role must still be able to do the server's work.
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'content_sha256', 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT content_sha256 -- ingestion would fail';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'processing_status', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role cannot UPDATE processing_status -- promotion to ready would fail';
    END IF;
END $$;

-- BEHAVIOURAL CONTROL, not just a privilege reading.
--
-- Privilege functions describe the catalogue; this exercises it. Runs as
-- `authenticated` against a copy of the table so no production row is touched,
-- and requires BOTH directions: the hash write must fail, and a permitted
-- metadata write must still succeed. A migration that broke ordinary updates
-- would pass a one-sided check.
DO $$
DECLARE
    blocked boolean := false;
BEGIN
    CREATE TEMP TABLE hash_grant_probe
        (LIKE public.knowledge_documents INCLUDING CONSTRAINTS) ON COMMIT DROP;

    -- Mirror the real table's column privileges onto the probe.
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
        RAISE EXCEPTION 'authenticated was able to rewrite content_sha256 on a table with the same grants';
    END IF;

    -- The permitted write must still work.
    UPDATE hash_grant_probe SET processing_status = 'failed';

    RESET ROLE;
END $$;

SELECT 'knowledge_documents hash permission verify: ok' AS result;
