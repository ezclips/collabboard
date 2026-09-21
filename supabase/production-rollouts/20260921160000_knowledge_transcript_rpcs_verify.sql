-- VERIFY the transcript RPCs, behaviourally.
--
-- PLAIN SQL, no psql meta-commands, so a statement runner can execute it. RUN
-- IT AS ONE CALL: the result table is session-scoped, and a runner that splits
-- these statements fails loudly on the final SELECT rather than quietly
-- reporting success.
--
-- EVERY CASE IS ITS OWN SUBTRANSACTION THAT ALWAYS ENDS BY RAISING, so nothing
-- a case writes survives it -- documents, chunks, revisions, all rolled back.
-- The success path raises ZZ001 deliberately for exactly that reason.
--
-- RUN AGAINST THE ISOLATED DATABASE ONLY. It writes real rows to
-- knowledge_documents and knowledge_chunks before rolling them back.
--
-- PREREQUISITE, FATAL: a board with a non-null user_id.
--
-- PASS CRITERION: the verdict row reads ALL PASS, and every case row is PASS.
--
-- UNVERIFIED: not executed anywhere.

CREATE TEMP TABLE knowledge_transcript_rpc_result (
    case_no integer PRIMARY KEY,
    outcome text NOT NULL,
    title   text NOT NULL,
    detail  text NOT NULL
);

-- ===========================================================================
-- CASE 1 -- EXECUTION PERMISSION. Catalogue-level, but the one that decides
-- whether every predicate in those functions is reachable by a client at all.
-- ===========================================================================
DO $case1$
DECLARE
    fns CONSTANT text[] := ARRAY[
        'public.knowledge_transcript_create_version(uuid, uuid, uuid, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_replace_version(uuid, uuid, text, bigint, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_update_metadata(uuid, uuid, text, bigint, text, text, text)',
        'public.knowledge_transcript_assert_chunks(jsonb)',
        'public.knowledge_transcript_assert_representation(jsonb)'
    ];
    reachable text[];
    missing   text[];
    fn text;
BEGIN
    SELECT coalesce(array_agg(role_name || ' -> ' || fn_name ORDER BY role_name || ' -> ' || fn_name), ARRAY[]::text[])
      INTO reachable
      FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
      CROSS JOIN unnest(fns) AS fn_name
     WHERE has_function_privilege(role_name, fn_name, 'EXECUTE');

    missing := ARRAY[]::text[];
    FOREACH fn IN ARRAY fns LOOP
        IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
            missing := missing || fn;
        END IF;
    END LOOP;

    IF array_length(reachable, 1) IS NOT NULL THEN
        INSERT INTO knowledge_transcript_rpc_result VALUES
            (1, 'FAIL', 'execution permission',
             'a client role can execute: ' || array_to_string(reachable, ', '));
    ELSIF array_length(missing, 1) IS NOT NULL THEN
        INSERT INTO knowledge_transcript_rpc_result VALUES
            (1, 'FAIL', 'execution permission',
             'service_role cannot execute: ' || array_to_string(missing, ', '));
    ELSE
        INSERT INTO knowledge_transcript_rpc_result VALUES
            (1, 'PASS', 'execution permission',
             'service_role only; PUBLIC, anon and authenticated all refused');
    END IF;
END
$case1$;

-- ===========================================================================
-- CASES 2-6 -- BEHAVIOUR, against real rows.
-- ===========================================================================
DO $behaviour$
DECLARE
    probe_board uuid;
    probe_owner uuid;
    doc_id      uuid := gen_random_uuid();
    rev0 bigint; rev1 bigint; rev2 bigint;
    chunks_before bigint; chunks_after bigint;
    sha_a CONSTANT text := repeat('a', 64);
    sha_b CONSTANT text := repeat('b', 64);
    rep CONSTANT jsonb := jsonb_build_object(
        'representationVersion', 1, 'videoIdentity', 'yt:probe',
        'cues', jsonb_build_array(
            jsonb_build_object('charStart', 0, 'charEnd', 5, 'startMs', 0, 'endMs', 1000)),
        'language', null, 'trackKind', 'machine', 'format', 'srt',
        'videoAssociation', 'claimed');
    chunks CONSTANT jsonb := jsonb_build_array(
        jsonb_build_object('chunkIndex', 0, 'text', 'hello', 'charStart', 0,
                           'charEnd', 5, 'startMs', 0, 'endMs', 1000));
    chunks2 CONSTANT jsonb := jsonb_build_array(
        jsonb_build_object('chunkIndex', 0, 'text', 'hello again', 'charStart', 0,
                           'charEnd', 11, 'startMs', 0, 'endMs', 2000));
    bad_chunks CONSTANT jsonb := jsonb_build_array(
        jsonb_build_object('chunkIndex', 7, 'text', 'wrong index', 'charStart', 0,
                           'charEnd', 11, 'startMs', 0, 'endMs', 2000));
    verdict text;
    detail  text;
BEGIN
    IF to_regclass('public.boards') IS NULL THEN
        RAISE EXCEPTION 'prerequisite missing: no public.boards table';
    END IF;
    SELECT b.id, b.user_id INTO probe_board, probe_owner
      FROM public.boards b WHERE b.user_id IS NOT NULL LIMIT 1;
    IF probe_board IS NULL THEN
        RAISE EXCEPTION 'prerequisite missing: a board with a non-null user_id';
    END IF;

    -- -------------------------------------------------------------------
    -- CASE 2: create establishes a real initial revision, not the default.
    -- -------------------------------------------------------------------
    BEGIN
        SELECT r.mutation_revision INTO rev0
          FROM public.knowledge_transcript_create_version(
                 doc_id, probe_board, probe_owner, 'probe.srt', 'application/x-subrip',
                 10, 'probe/transcript', sha_a, 'knowledge-transcript', '1',
                 repeat('c', 64), rep, chunks) r;

        IF rev0 IS NULL OR rev0 = 0 THEN
            RAISE EXCEPTION 'create left the revision at % -- indistinguishable from never established',
                coalesce(rev0::text, 'null') USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_chunks c WHERE c.document_id = doc_id) THEN
            RAISE EXCEPTION 'create wrote no chunks' USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'ok' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN verdict := 'PASS'; detail := 'initial revision ' || rev0::text;
        ELSE verdict := 'FAIL'; detail := SQLERRM; END IF;
    END;
    INSERT INTO knowledge_transcript_rpc_result VALUES
        (2, verdict, 'create establishes the initial revision', detail);

    -- -------------------------------------------------------------------
    -- CASE 3: a stale revision conflicts and changes NOTHING -- not the
    -- document, not the child chunks.
    -- -------------------------------------------------------------------
    BEGIN
        PERFORM public.knowledge_transcript_create_version(
            doc_id, probe_board, probe_owner, 'probe.srt', 'application/x-subrip',
            10, 'probe/transcript', sha_a, 'knowledge-transcript', '1',
            repeat('c', 64), rep, chunks);
        SELECT count(*) INTO chunks_before FROM public.knowledge_chunks c WHERE c.document_id = doc_id;

        BEGIN
            PERFORM public.knowledge_transcript_replace_version(
                doc_id, probe_board, sha_a, 999999, 'renamed.srt', 'application/x-subrip',
                20, 'probe/transcript-2', sha_b, 'knowledge-transcript', '1',
                repeat('c', 64), rep, chunks2);
            RAISE EXCEPTION 'a stale revision was accepted' USING ERRCODE = 'ZZ002';
        EXCEPTION WHEN sqlstate 'KT001' THEN
            NULL; -- expected
        END;

        SELECT count(*) INTO chunks_after FROM public.knowledge_chunks c WHERE c.document_id = doc_id;
        IF chunks_after <> chunks_before THEN
            RAISE EXCEPTION 'the refused replace changed the chunk count from % to %',
                chunks_before, chunks_after USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_documents d
                        WHERE d.id = doc_id AND d.content_sha256 = sha_a
                          AND d.original_filename = 'probe.srt') THEN
            RAISE EXCEPTION 'the refused replace changed the document row' USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'ok' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN verdict := 'PASS'; detail := 'refused, document and chunks untouched';
        ELSE verdict := 'FAIL'; detail := SQLERRM; END IF;
    END;
    INSERT INTO knowledge_transcript_rpc_result VALUES
        (3, verdict, 'a stale revision conflicts and changes nothing', detail);

    -- -------------------------------------------------------------------
    -- CASE 4: a content replacement advances the revision, and preserves
    -- identity and authorship.
    -- -------------------------------------------------------------------
    BEGIN
        SELECT r.mutation_revision INTO rev0
          FROM public.knowledge_transcript_create_version(
                 doc_id, probe_board, probe_owner, 'probe.srt', 'application/x-subrip',
                 10, 'probe/transcript', sha_a, 'knowledge-transcript', '1',
                 repeat('c', 64), rep, chunks) r;

        SELECT r.mutation_revision INTO rev1
          FROM public.knowledge_transcript_replace_version(
                 doc_id, probe_board, sha_a, rev0, 'renamed.srt', 'application/x-subrip',
                 20, 'probe/transcript-2', sha_b, 'knowledge-transcript', '1',
                 repeat('c', 64), rep, chunks2) r;

        IF rev1 <= rev0 THEN
            RAISE EXCEPTION 'the replacement did not advance the revision (% -> %)', rev0, rev1
                USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_documents d
                        WHERE d.id = doc_id AND d.board_id = probe_board
                          AND d.created_by = probe_owner AND d.content_sha256 = sha_b) THEN
            RAISE EXCEPTION 'the replacement did not preserve identity or authorship'
                USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_chunks c
                        WHERE c.document_id = doc_id AND c.text = 'hello again') THEN
            RAISE EXCEPTION 'the replacement did not write the new chunks' USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'ok' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN verdict := 'PASS'; detail := format('revision %s -> %s', rev0, rev1);
        ELSE verdict := 'FAIL'; detail := SQLERRM; END IF;
    END;
    INSERT INTO knowledge_transcript_rpc_result VALUES
        (4, verdict, 'a content replacement advances the revision', detail);

    -- -------------------------------------------------------------------
    -- CASE 5: a metadata-only update advances the revision while leaving the
    -- hash, the chunks and the stored payload alone. This is the path where
    -- the hash cannot separate two callers at all.
    -- -------------------------------------------------------------------
    BEGIN
        SELECT r.mutation_revision INTO rev0
          FROM public.knowledge_transcript_create_version(
                 doc_id, probe_board, probe_owner, 'probe.srt', 'application/x-subrip',
                 10, 'probe/transcript', sha_a, 'knowledge-transcript', '1',
                 repeat('c', 64), rep, chunks) r;
        SELECT count(*) INTO chunks_before FROM public.knowledge_chunks c WHERE c.document_id = doc_id;

        SELECT r.mutation_revision INTO rev1
          FROM public.knowledge_transcript_update_metadata(
                 doc_id, probe_board, sha_a, rev0, 'corrected.srt', 'de', 'human') r;

        SELECT count(*) INTO chunks_after FROM public.knowledge_chunks c WHERE c.document_id = doc_id;

        IF rev1 <= rev0 THEN
            RAISE EXCEPTION 'the metadata update did not advance the revision (% -> %)', rev0, rev1
                USING ERRCODE = 'ZZ002';
        END IF;
        IF chunks_after <> chunks_before THEN
            RAISE EXCEPTION 'the metadata update changed the chunks' USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_documents d
                        WHERE d.id = doc_id
                          AND d.content_sha256 = sha_a
                          AND d.storage_path = 'probe/transcript'
                          AND d.file_size_bytes = 10
                          AND d.original_filename = 'corrected.srt'
                          AND d.transcript_representation ->> 'trackKind' = 'human'
                          AND d.transcript_representation ->> 'language' = 'de'
                          AND d.transcript_representation -> 'cues' = rep -> 'cues') THEN
            RAISE EXCEPTION 'the metadata update touched the version, or did not apply the metadata'
                USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'ok' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN verdict := 'PASS'; detail := format('revision %s -> %s, version untouched', rev0, rev1);
        ELSE verdict := 'FAIL'; detail := SQLERRM; END IF;
    END;
    INSERT INTO knowledge_transcript_rpc_result VALUES
        (5, verdict, 'a metadata-only update advances the revision', detail);

    -- -------------------------------------------------------------------
    -- CASE 6: THE ONE THAT MATTERS MOST. A failure inside a replacement must
    -- leave the COMPLETE prior version -- chunks with their old text, the old
    -- hash, the old storage path, the old revision.
    --
    -- WHAT THIS DOES NOT PROVE, stated so nobody reads more into it: it does
    -- NOT establish that validation runs BEFORE the delete, because the
    -- rollback would restore the chunks either way. The ordering is enforced
    -- by construction -- both PERFORM asserts sit at the top of the function,
    -- above the lock and far above the DELETE -- and that is a source claim,
    -- not something this case measures.
    -- -------------------------------------------------------------------
    BEGIN
        SELECT r.mutation_revision INTO rev0
          FROM public.knowledge_transcript_create_version(
                 doc_id, probe_board, probe_owner, 'probe.srt', 'application/x-subrip',
                 10, 'probe/transcript', sha_a, 'knowledge-transcript', '1',
                 repeat('c', 64), rep, chunks) r;

        BEGIN
            PERFORM public.knowledge_transcript_replace_version(
                doc_id, probe_board, sha_a, rev0, 'renamed.srt', 'application/x-subrip',
                20, 'probe/transcript-2', sha_b, 'knowledge-transcript', '1',
                repeat('c', 64), rep, bad_chunks);
            RAISE EXCEPTION 'an invalid chunk payload was accepted' USING ERRCODE = 'ZZ002';
        EXCEPTION WHEN sqlstate 'KT003' THEN
            NULL; -- expected, and expected BEFORE any delete
        END;

        SELECT d.transcript_mutation_revision INTO rev2
          FROM public.knowledge_documents d WHERE d.id = doc_id;

        IF NOT EXISTS (SELECT 1 FROM public.knowledge_chunks c
                        WHERE c.document_id = doc_id AND c.text = 'hello') THEN
            RAISE EXCEPTION 'the prior chunks were not restored -- the delete outlived the failure'
                USING ERRCODE = 'ZZ002';
        END IF;
        IF rev2 <> rev0 THEN
            RAISE EXCEPTION 'the revision moved despite the failure (% -> %)', rev0, rev2
                USING ERRCODE = 'ZZ002';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.knowledge_documents d
                        WHERE d.id = doc_id AND d.content_sha256 = sha_a
                          AND d.storage_path = 'probe/transcript'
                          AND d.original_filename = 'probe.srt') THEN
            RAISE EXCEPTION 'the document row did not survive the failure intact'
                USING ERRCODE = 'ZZ002';
        END IF;
        RAISE EXCEPTION 'ok' USING ERRCODE = 'ZZ001';
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = 'ZZ001' THEN verdict := 'PASS'; detail := 'prior version complete: chunks, hash, path, revision';
        ELSE verdict := 'FAIL'; detail := SQLERRM; END IF;
    END;
    INSERT INTO knowledge_transcript_rpc_result VALUES
        (6, verdict, 'a failure restores the complete prior version', detail);

    -- NO OUTER ROLLBACK WRAPPER, deliberately. Each case above is its own
    -- subtransaction that always ends by raising, so each case's rows are
    -- already gone by the time the next one starts. Wrapping the whole block
    -- in a catch would ALSO roll back the result rows inserted between the
    -- cases, and the summary would report nothing at all.
END
$behaviour$;

-- ---------------------------------------------------------------------------
-- SUMMARY. Computed, not eyeballed: a missing case is a failure.
-- ---------------------------------------------------------------------------
SELECT
    CASE
        WHEN count(*) <> 6 THEN '*** INCOMPLETE -- ' || count(*)::text || ' of 6 cases reported'
        WHEN count(*) FILTER (WHERE outcome <> 'PASS') > 0
            THEN '*** FAIL -- ' || (count(*) FILTER (WHERE outcome <> 'PASS'))::text || ' case(s) failed'
        ELSE 'ALL PASS -- 6 of 6'
    END AS verdict
FROM knowledge_transcript_rpc_result;

SELECT case_no, outcome, title, detail
  FROM knowledge_transcript_rpc_result ORDER BY case_no;

DROP TABLE knowledge_transcript_rpc_result;
