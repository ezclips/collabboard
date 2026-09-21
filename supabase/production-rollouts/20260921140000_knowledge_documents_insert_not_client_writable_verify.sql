-- VERIFY item 18: no client role can INSERT knowledge_documents, and the
-- server still can.
--
-- Effective privileges, not catalogue text: privileges accumulate from direct
-- grants, role membership and PUBLIC, so every check below asks
-- has_*_privilege what a role can actually do.

DO $$
DECLARE
    still text[];
BEGIN
    -- 1. No client role may INSERT, at table or column level, by any path.
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[])
      INTO still
      FROM pg_attribute a
     WHERE a.attrelid = 'public.knowledge_documents'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
       AND (has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
            OR has_column_privilege('anon', a.attrelid, a.attname, 'INSERT'));

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'INSERT still reaches a client role on: %', array_to_string(still, ', ');
    END IF;

    -- anon is asked separately and explicitly, because its denial today comes
    -- from a missing RLS policy rather than from the grant -- the two layers
    -- are independent and this file is about the grant layer.
    IF has_table_privilege('anon', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'anon still holds table-wide INSERT';
    END IF;
    IF has_table_privilege('authenticated', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated still holds table-wide INSERT';
    END IF;

    -- 2. The server must be unaffected.
    IF NOT has_table_privilege('service_role', 'public.knowledge_documents', 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT -- ingestion would fail';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'content_sha256', 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT content_sha256';
    END IF;

    -- 3. Item 17 must still hold: this migration must not have restored it.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'content_sha256', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE content_sha256 -- item 17 has been undone';
    END IF;
END $$;

-- BEHAVIOURAL CONTROL: the caller-selected-id path, which is the reason this
-- migration exists.
--
-- A permitted client could previously recreate a DELETED document under its
-- OLD id with a chosen hash, so a wiki source shown as gone would look present
-- and unchanged. This reproduces that attempt under a genuine authorized
-- identity and requires it to fail on PRIVILEGES.
DO $$
DECLARE
    probe_board uuid;
    probe_owner uuid;
    recycled_id uuid := gen_random_uuid();
    blocked boolean := false;
    seen_uid uuid;
BEGIN
    IF to_regclass('public.boards') IS NULL THEN
        RAISE NOTICE 'skipping the live-table control: no boards table here';
        RETURN;
    END IF;

    SELECT b.id, b.user_id INTO probe_board, probe_owner
      FROM public.boards b WHERE b.user_id IS NOT NULL LIMIT 1;

    IF probe_board IS NULL THEN
        RAISE EXCEPTION 'this control needs a board with an owner in the isolated test database';
    END IF;

    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', probe_owner::text, 'role', 'authenticated')::text,
        true
    );
    SET LOCAL ROLE authenticated;

    seen_uid := auth.uid();
    IF seen_uid IS NULL OR seen_uid <> probe_owner THEN
        RESET ROLE;
        RAISE EXCEPTION 'the probe identity was not established: auth.uid() = %', seen_uid;
    END IF;

    -- An id the caller chose, on a board it genuinely owns, with created_by
    -- set to itself: everything the RLS policy asks for. Only the grant stops
    -- it now.
    BEGIN
        INSERT INTO public.knowledge_documents
            (id, board_id, created_by, kind, original_filename, content_sha256,
             processing_status, file_size_bytes, storage_path, mime_type)
        VALUES
            (recycled_id, probe_board, probe_owner, 'text', 'recycled.txt', repeat('e', 64),
             'ready', 1, 'probe/item18', 'text/plain');
    EXCEPTION WHEN insufficient_privilege THEN
        blocked := true;
    END;

    RESET ROLE;
    DELETE FROM public.knowledge_documents WHERE id = recycled_id;

    IF NOT blocked THEN
        RAISE EXCEPTION
            'an authorized client inserted a document under a chosen id with a chosen hash -- item 18 is not in force';
    END IF;
END $$;

SELECT 'knowledge_documents insert permission verify: ok' AS result;
