-- VERIFY the transcript mutation revision column.
--
-- Effective privileges, not catalogue text: privileges accumulate from direct
-- grants, role membership and PUBLIC, so every check asks has_*_privilege what
-- a role can ACTUALLY do.
--
-- THIS FILE HAS NO SKIPPABLE CHECKS. Missing prerequisites are fatal. A
-- behavioural control that returned quietly would let the script print its
-- final ok having exercised nothing.
--
-- STATUS 2026-09-21: executed on an isolated LOCAL stack ONLY, in a shimmed
-- run that found five defects in this rollout's SQL -- all now fixed. It has
-- NOT been re-run clean, and has NEVER been applied to hosted. See
-- .agent/isolated-sql-verification.md.

DO $revisionprivs$
DECLARE
    tbl CONSTANT regclass := 'public.knowledge_documents'::regclass;
    col CONSTANT text := 'transcript_mutation_revision';
    writable text[];
    type_name text;
    col_comment text;
    not_null boolean;
BEGIN
    -- 1. It exists, and in the intended shape.
    SELECT a.atttypid::regtype::text, a.attnotnull
      INTO type_name, not_null
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attname = col
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF type_name IS NULL THEN
        RAISE EXCEPTION 'the % column does not exist', col;
    END IF;
    IF type_name <> 'bigint' THEN
        RAISE EXCEPTION 'the % column is %, not bigint', col, type_name;
    END IF;
    IF NOT not_null THEN
        RAISE EXCEPTION 'the % column is nullable; a null revision matches nothing and blocks every edit', col;
    END IF;

    -- The comment is part of the intended shape, because it is what tells the
    -- next reader not to write this column by hand. Checked here so it cannot
    -- drift away from the migration that set it.
    SELECT col_description(tbl, a.attnum) INTO col_comment
      FROM pg_attribute a
     WHERE a.attrelid = tbl AND a.attname = col;

    IF coalesce(col_comment, '') NOT LIKE '%advanced only by the transcript RPCs%' THEN
        RAISE EXCEPTION
            'the % column is missing its intended comment. found = [%]', col, coalesce(col_comment, '<none>');
    END IF;

    -- 2. THE POINT OF THE COLUMN: no client role may write it, by any path.
    --    A revision a client can write is a revision a client can forge, and a
    --    forged compare-and-swap token is worse than none -- it reports
    --    success while losing the other edit.
    SELECT coalesce(array_agg(role_name || ':' || priv ORDER BY role_name || ':' || priv), ARRAY[]::text[])
      INTO writable
      FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
      CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE']) AS priv
     WHERE has_column_privilege(role_name, tbl, col, priv);

    IF array_length(writable, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'the revision column is client-writable by [%]', array_to_string(writable, ', ');
    END IF;

    -- 3. The prerequisites that MAKE it unwritable must still hold. Checking
    --    only (2) would pass today and silently stop being true the moment a
    --    table-wide grant came back -- including for columns added later.
    IF has_table_privilege('authenticated', tbl, 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated holds table-wide UPDATE; item 17 has been undone and every new column is writable';
    END IF;
    IF has_table_privilege('authenticated', tbl, 'INSERT') OR has_table_privilege('anon', tbl, 'INSERT') THEN
        RAISE EXCEPTION 'a client role holds table-wide INSERT; item 18 has been undone and the revision can be supplied on insert';
    END IF;

    -- 4. The server must be able to increment it, or every transcript edit
    --    fails.
    IF NOT has_column_privilege('service_role', tbl, col, 'UPDATE') THEN
        RAISE EXCEPTION 'service_role cannot UPDATE % -- the transcript RPCs could not increment it', col;
    END IF;
    IF NOT has_column_privilege('service_role', tbl, col, 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT % -- transcript creation could not establish a revision', col;
    END IF;
END
$revisionprivs$;

-- ===========================================================================
-- BEHAVIOURAL CONTROL: the forgery attempt, as a genuinely authorized client.
--
-- Privilege functions describe the catalogue. This exercises it: a real
-- authorized identity, on a board it owns, trying to write the revision.
-- ===========================================================================

DO $forgeprobe$
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
            'prerequisite missing: no public.boards table -- this verifier must run against a full schema';
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
        (probe_board, probe_owner, 'text', 'revision-probe.txt', repeat('f', 64),
         'ready', 1, 'probe/revision', 'text/plain')
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
           SET transcript_mutation_revision = 9999
         WHERE id = probe_doc;
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := true;
    END;

    -- The permitted write, same row and identity. Without it, an invisible row
    -- or a denying policy would produce the same "blocked" reading and the
    -- result above would mean nothing about privileges.
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
            'an authorized client wrote transcript_mutation_revision -- the compare-and-swap token can be forged';
    END IF;
    IF NOT permitted THEN
        RAISE EXCEPTION
            'the permitted metadata update did not apply under RLS, so the revision block cannot be attributed to privileges';
    END IF;
END
$forgeprobe$;

SELECT 'knowledge_documents transcript mutation revision verify: ok' AS result;
