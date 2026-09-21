-- VERIFY item 17: the hash is no longer client-UPDATABLE, the rest of the
-- allowlist survived, and the INSERT path is reported as it actually is.
--
-- CORRECTED, twice over:
--
--   * An earlier version asserted `authenticated` cannot INSERT
--     content_sha256. That was FALSE against the live schema -- table-wide
--     INSERT covers every column -- and would have failed a correct migration.
--     Replaced by an assertion of what is intended, plus a NOTICE recording
--     the open INSERT path.
--   * The real-table block was opened with `DO $` and closed with `END $;`.
--     A lone `$` is not a dollar-quote, so that block did not parse at all.
--     Named tags are used throughout now, so a stray edit cannot silently
--     produce an unparseable file.
--
-- Effective privileges are read with has_*_privilege rather than from the grant
-- catalogue, because privileges accumulate from direct grants, role membership
-- and PUBLIC, and a catalogue row is only one of those sources.
--
-- THIS FILE HAS NO SKIPPABLE CHECKS. Missing prerequisites are fatal: a
-- behavioural control that quietly returned would let the script print its
-- final ok having exercised nothing.
--
-- STATUS 2026-09-21: VERIFIED on an isolated LOCAL stack -- clean run, no
-- shims, at 571b19b6, against a pre-state matching the hosted ACL. An earlier
-- shimmed run found five defects in this rollout's SQL; all are fixed and the
-- clean run is green. NOT yet run against the hosted database.
-- NEVER applied to hosted. See .agent/isolated-sql-verification.md.

DO $privileges$
DECLARE
    -- The reviewed allowlist MINUS content_sha256: exactly what must remain.
    expected_after CONSTANT text[] := ARRAY[
        'board_id', 'created_at', 'created_by', 'file_size_bytes', 'id',
        'kind', 'mime_type', 'original_filename', 'page_count',
        'parser_name', 'parser_options_hash', 'parser_version',
        'processing_attempt', 'processing_error', 'processing_lease_expires_at',
        'processing_lease_token', 'processing_status', 'raw_artifact_path',
        'storage_path', 'updated_at'
    ];
    effective_columns text[];
    missing text[];
    extra   text[];
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

    -- 4. THE OTHER HALF, by EFFECTIVE privilege and BY NAME. A count would
    --    pass on the wrong twenty columns, and filtering information_schema by
    --    grantee cannot see PUBLIC or role membership.
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

    -- 6. The INSERT path, reported rather than asserted away. Item 17 narrows
    --    UPDATE only; item 18 is the migration that closes INSERT.
    IF has_table_privilege('authenticated', 'public.knowledge_documents', 'INSERT') THEN
        RAISE NOTICE
            'OPEN until item 18: authenticated holds table-wide INSERT, so it can supply content_sha256 (and transcript_representation) on rows it creates -- including under a caller-chosen id.';
    ELSE
        RAISE NOTICE 'item 18 appears applied: authenticated holds no table-wide INSERT.';
    END IF;
END
$privileges$;

-- ===========================================================================
-- BEHAVIOURAL CONTROLS. Privilege functions describe the catalogue; these
-- exercise it. Neither may be skipped.
-- ===========================================================================

-- (A) Against a COPY of the table carrying the same column grants. No RLS, so
--     a failure here is unambiguously a grant failure.
DO $grantprobe$
DECLARE
    blocked boolean := false;
BEGIN
    CREATE TEMP TABLE hash_grant_probe
        (LIKE public.knowledge_documents INCLUDING CONSTRAINTS INCLUDING DEFAULTS) ON COMMIT DROP;

    EXECUTE 'REVOKE ALL ON hash_grant_probe FROM authenticated';
    EXECUTE 'GRANT INSERT, SELECT ON hash_grant_probe TO authenticated';
    EXECUTE format(
        'GRANT UPDATE (%s) ON hash_grant_probe TO authenticated',
        (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attname)
           FROM pg_attribute a
          WHERE a.attrelid = 'public.knowledge_documents'::regclass
            AND a.attnum > 0 AND NOT a.attisdropped
            AND has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE'))
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
END
$grantprobe$;

-- (B) Against the REAL, MIGRATED table, as a GENUINELY AUTHORIZED identity,
--     under RLS.
--
--     CORRECTED. An earlier version did `SET LOCAL ROLE authenticated` with no
--     claims established and picked an arbitrary board, so auth.uid() was NULL,
--     every policy denied, and the permitted update could never apply -- the
--     probe would have raised its own "cannot distinguish" exception on a
--     correct migration. It proved nothing.
--
--     It also returned quietly when `boards` was absent, which would let this
--     script print ok having exercised nothing. Missing prerequisites are now
--     FATAL.
DO $rlsprobe$
DECLARE
    probe_board uuid;
    probe_owner uuid;
    probe_doc   uuid;
    seen_uid    uuid;
    blocked     boolean := false;
    permitted   boolean := false;
BEGIN
    IF to_regclass('public.boards') IS NULL THEN
        RAISE EXCEPTION
            'prerequisite missing: no public.boards table -- this verifier must run against a full schema, not a bare one';
    END IF;

    SELECT b.id, b.user_id INTO probe_board, probe_owner
      FROM public.boards b WHERE b.user_id IS NOT NULL LIMIT 1;

    IF probe_board IS NULL THEN
        RAISE EXCEPTION
            'prerequisite missing: the isolated test database needs at least one board with an owner (boards.user_id)';
    END IF;

    INSERT INTO public.knowledge_documents
        (board_id, created_by, kind, original_filename, content_sha256,
         processing_status, file_size_bytes, storage_path, mime_type)
    VALUES
        (probe_board, probe_owner, 'text', 'item17-probe.txt', repeat('c', 64),
         'ready', 1, 'probe/item17', 'text/plain')
    RETURNING id INTO probe_doc;

    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', probe_owner::text, 'role', 'authenticated')::text,
        true
    );
    SET LOCAL ROLE authenticated;

    -- ASSERT THE IDENTITY BEFORE TRUSTING ANY OUTCOME. A null uid would make
    -- both writes fail and read as a privilege result.
    seen_uid := auth.uid();
    IF seen_uid IS NULL OR seen_uid <> probe_owner THEN
        RESET ROLE;
        RAISE EXCEPTION
            'prerequisite missing: auth.uid() = %, expected % -- the probe identity was not established',
            seen_uid, probe_owner;
    END IF;

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
        permitted := FOUND;
    EXCEPTION WHEN insufficient_privilege THEN
        permitted := false;
    END;

    RESET ROLE;
    DELETE FROM public.knowledge_documents WHERE id = probe_doc;

    IF NOT blocked THEN
        RAISE EXCEPTION 'authenticated rewrote content_sha256 on the real table -- the repair is not in force';
    END IF;

    -- RLS and grants are independent. Without this, an invisible row or a
    -- denying policy would produce the same "blocked" reading.
    IF NOT permitted THEN
        RAISE EXCEPTION
            'the permitted metadata update did not apply under RLS, so the hash block cannot be attributed to privileges';
    END IF;
END
$rlsprobe$;

SELECT 'knowledge_documents hash permission verify: ok' AS result;
