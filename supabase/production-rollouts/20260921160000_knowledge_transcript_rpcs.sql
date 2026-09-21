-- THE TRANSCRIPT RPCS: create, replace, metadata-update.
--
-- Each is ONE TRANSACTION writing a whole version. That is the point of them.
-- A transcript is re-imported over an existing document, and halfway between
-- two versions is a document whose text, chunks, representation, hash and
-- revision describe DIFFERENT transcripts -- every citation into it then lands
-- somewhere that is not what it quotes. A sequence of statements can be
-- interrupted; a function body cannot be interrupted halfway and committed.
--
-- ============================================================================
-- SECURITY INVOKER, AND WHY
-- ============================================================================
--
-- These are SECURITY INVOKER, not DEFINER. A DEFINER function would run with
-- the owner's rights and quietly step around RLS for whoever managed to call
-- it, so the ONLY thing standing between a client and another board's
-- transcript would be the predicates inside the body. Invoker keeps the
-- database's own boundary in place: the caller's privileges and policies still
-- apply, and the predicates here are an additional layer rather than a
-- replacement for one.
--
-- Execution is granted to service_role ALONE and revoked from PUBLIC, anon and
-- authenticated. PUBLIC is revoked explicitly because CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default -- leaving that in place would make every
-- careful predicate below reachable by anyone with a connection.
--
-- THE COLUMN COMMENT IS AN OPERATIONAL CONTRACT, NOT AN ENFORCEMENT MECHANISM.
-- What actually stops a client writing transcript_mutation_revision is the
-- column-level privilege (items 17 and 18), and what stops a client calling
-- these functions is the EXECUTE grant. The comment tells a person; the grants
-- tell the server.
--
-- ============================================================================
-- WHAT IS NOT HERE, STATED RATHER THAN LEFT TO BE DISCOVERED
-- ============================================================================
--
-- THE CANONICAL TEXT IS NOT STORED. Chunks carry their own text, and the
-- representation carries cue ranges and timings -- but the joined canonical
-- string is not persisted anywhere, and window boundaries drop the separator
-- between two chunks, so it cannot be reconstructed exactly from the chunks.
-- knowledgeTranscriptVersionBytesFromStored() therefore cannot be run against
-- a stored row yet: re-hashing a stored transcript needs that text.
--
-- This migration does NOT invent a column for it. It is a real gap, it belongs
-- to the representation or to a column of its own, and it is a reviewed
-- decision rather than something to slip in beside three functions.
--
-- ============================================================================
-- ERROR SIGNALLING
-- ============================================================================
--
--   KT001  the locked row did not match -- conflict OR absent, DELIBERATELY
--          indistinguishable. Saying "that document exists but is on another
--          board" would confirm the existence of a row the caller cannot see.
--   KT002  the revision did not advance. Raised so the whole mutation rolls
--          back rather than returning a token the next writer would match.
--   KT003  input failed validation. Always raised BEFORE anything is deleted.
--
-- UNVERIFIED: none of this has been executed against any database.

-- ---------------------------------------------------------------------------
-- Shared input validation. Called before any destructive step, in every path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_transcript_assert_chunks(p_chunks jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $assertchunks$
DECLARE
    expected_index integer := 0;
    previous_end   integer := -1;
    chunk jsonb;
BEGIN
    IF p_chunks IS NULL OR jsonb_typeof(p_chunks) <> 'array' THEN
        RAISE EXCEPTION 'chunks must be a json array, got %', coalesce(jsonb_typeof(p_chunks), 'null')
            USING ERRCODE = 'KT003';
    END IF;

    FOR chunk IN SELECT * FROM jsonb_array_elements(p_chunks) LOOP
        IF jsonb_typeof(chunk) <> 'object' THEN
            RAISE EXCEPTION 'chunk % is not an object', expected_index USING ERRCODE = 'KT003';
        END IF;
        IF NOT (chunk ? 'chunkIndex' AND chunk ? 'text' AND chunk ? 'charStart'
                AND chunk ? 'charEnd' AND chunk ? 'startMs' AND chunk ? 'endMs') THEN
            RAISE EXCEPTION 'chunk % is missing a required field', expected_index USING ERRCODE = 'KT003';
        END IF;
        IF jsonb_typeof(chunk -> 'text') <> 'string' THEN
            RAISE EXCEPTION 'chunk % has non-string text', expected_index USING ERRCODE = 'KT003';
        END IF;

        IF (chunk ->> 'chunkIndex')::integer <> expected_index THEN
            RAISE EXCEPTION 'chunk indexes must be 0..n-1 in order; found % at position %',
                chunk ->> 'chunkIndex', expected_index USING ERRCODE = 'KT003';
        END IF;

        IF (chunk ->> 'charStart')::integer < 0
           OR (chunk ->> 'charEnd')::integer < (chunk ->> 'charStart')::integer THEN
            RAISE EXCEPTION 'chunk % has an impossible character range', expected_index
                USING ERRCODE = 'KT003';
        END IF;

        -- Chunks must not overlap in characters, or one offset would resolve
        -- to two chunks and a citation could not name a single passage.
        IF (chunk ->> 'charStart')::integer < previous_end THEN
            RAISE EXCEPTION 'chunk % starts inside the previous chunk', expected_index
                USING ERRCODE = 'KT003';
        END IF;

        IF (chunk ->> 'endMs')::bigint < (chunk ->> 'startMs')::bigint THEN
            RAISE EXCEPTION 'chunk % ends before it starts', expected_index USING ERRCODE = 'KT003';
        END IF;

        previous_end := (chunk ->> 'charEnd')::integer;
        expected_index := expected_index + 1;
    END LOOP;
END
$assertchunks$;

-- ---------------------------------------------------------------------------
-- Shared representation validation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_transcript_assert_representation(p_representation jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $assertrep$
BEGIN
    IF p_representation IS NULL OR jsonb_typeof(p_representation) <> 'object' THEN
        RAISE EXCEPTION 'the transcript representation must be a json object'
            USING ERRCODE = 'KT003';
    END IF;
    IF NOT (p_representation ? 'representationVersion' AND p_representation ? 'cues'
            AND p_representation ? 'format' AND p_representation ? 'trackKind') THEN
        RAISE EXCEPTION 'the transcript representation is missing a required field'
            USING ERRCODE = 'KT003';
    END IF;
    IF jsonb_typeof(p_representation -> 'cues') <> 'array' THEN
        RAISE EXCEPTION 'the transcript representation cues must be an array'
            USING ERRCODE = 'KT003';
    END IF;
END
$assertrep$;

-- ---------------------------------------------------------------------------
-- CREATE. Document, representation, chunks, readiness and the first revision,
-- together.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_transcript_create_version(
    p_document_id         uuid,
    p_board_id            uuid,
    p_created_by          uuid,
    p_original_filename   text,
    p_mime_type           text,
    p_file_size_bytes     bigint,
    p_storage_path        text,
    p_content_sha256      text,
    p_parser_name         text,
    p_parser_version      text,
    p_parser_options_hash text,
    p_representation      jsonb,
    p_chunks              jsonb
)
RETURNS TABLE (document_id uuid, mutation_revision bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $createversion$
DECLARE
    new_revision bigint;
BEGIN
    -- VALIDATE FIRST. Nothing below this point should discover a malformed
    -- input after it has written anything.
    PERFORM public.knowledge_transcript_assert_representation(p_representation);
    PERFORM public.knowledge_transcript_assert_chunks(p_chunks);

    -- The id and the board are BOUND by the caller, not defaulted. A create
    -- that let the row choose its own id could not be correlated with the
    -- storage object already uploaded under that id.
    INSERT INTO public.knowledge_documents (
        id, board_id, created_by, kind, original_filename, mime_type,
        file_size_bytes, storage_path, content_sha256,
        parser_name, parser_version, parser_options_hash,
        page_count, processing_status, transcript_representation,
        transcript_mutation_revision
    ) VALUES (
        p_document_id, p_board_id, p_created_by, 'text', p_original_filename, p_mime_type,
        p_file_size_bytes, p_storage_path, p_content_sha256,
        p_parser_name, p_parser_version, p_parser_options_hash,
        -- A transcript has no pages. NULL, not 0, which would claim a page
        -- count was measured and found to be none.
        NULL, 'ready', p_representation,
        -- THE FIRST REAL REVISION. Not the column default: a transcript that
        -- has never been edited must still be distinguishable from one whose
        -- revision was never established.
        1
    );

    INSERT INTO public.knowledge_chunks (
        document_id, chunk_index, text, text_hash,
        page_start, page_end, char_start, char_end, source_locators
    )
    SELECT
        p_document_id,
        (c ->> 'chunkIndex')::integer,
        c ->> 'text',
        -- sha256() and convert_to() are pg_catalog builtins, reachable with an
        -- empty search_path. pgcrypto's digest() is NOT: it lives in whichever
        -- schema the extension was installed into, which is not this
        -- function's to assume.
        encode(sha256(convert_to(c ->> 'text', 'UTF8')), 'hex'),
        NULL, NULL,
        (c ->> 'charStart')::integer,
        (c ->> 'charEnd')::integer,
        -- A 'text-range' locator, the SAME kind the text path writes. The
        -- timings are NOT duplicated here: they live in the representation and
        -- are resolved through the cue that owns the offset. A second locator
        -- kind would have to be understood by every existing reader, and any
        -- reader that did not would silently ignore the range.
        jsonb_build_array(jsonb_build_object(
            'kind', 'text-range',
            'charStart', (c ->> 'charStart')::integer,
            'charEnd', (c ->> 'charEnd')::integer
        ))
    FROM jsonb_array_elements(p_chunks) AS c;

    SELECT d.transcript_mutation_revision INTO new_revision
      FROM public.knowledge_documents d WHERE d.id = p_document_id;

    RETURN QUERY SELECT p_document_id, new_revision;
END
$createversion$;

-- ---------------------------------------------------------------------------
-- REPLACE. A whole new version over an existing document.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_transcript_replace_version(
    p_document_id         uuid,
    p_board_id            uuid,
    p_expected_sha256     text,
    p_expected_revision   bigint,
    p_original_filename   text,
    p_mime_type           text,
    p_file_size_bytes     bigint,
    p_storage_path        text,
    p_content_sha256      text,
    p_parser_name         text,
    p_parser_version      text,
    p_parser_options_hash text,
    p_representation      jsonb,
    p_chunks              jsonb
)
RETURNS TABLE (document_id uuid, mutation_revision bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $replaceversion$
DECLARE
    locked_revision bigint;
    new_revision    bigint;
BEGIN
    -- VALIDATE BEFORE THE LOCK AND BEFORE ANY DELETE. A malformed payload must
    -- cost nothing and must never be discovered after the old chunks are gone.
    PERFORM public.knowledge_transcript_assert_representation(p_representation);
    PERFORM public.knowledge_transcript_assert_chunks(p_chunks);

    -- ALL FIVE PREDICATES, UNDER THE LOCK. A check performed before the lock
    -- is a check about the past.
    SELECT d.transcript_mutation_revision INTO locked_revision
      FROM public.knowledge_documents d
     WHERE d.id = p_document_id
       AND d.board_id = p_board_id
       AND d.content_sha256 = p_expected_sha256
       AND d.transcript_mutation_revision = p_expected_revision
       AND d.transcript_representation IS NOT NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        -- ONE MESSAGE FOR BOTH CAUSES, deliberately. Distinguishing "absent"
        -- from "on another board" would confirm the existence of a row the
        -- caller cannot see.
        RAISE EXCEPTION 'this transcript is not available to replace, or it changed since it was opened'
            USING ERRCODE = 'KT001';
    END IF;

    -- id, board_id, created_by and created_at are ABSENT from this statement.
    -- A replacement has no author: provenance belongs to whoever created the
    -- document, and nothing in this path may restate it.
    UPDATE public.knowledge_documents d
       SET original_filename   = p_original_filename,
           mime_type           = p_mime_type,
           file_size_bytes     = p_file_size_bytes,
           storage_path        = p_storage_path,
           content_sha256      = p_content_sha256,
           parser_name         = p_parser_name,
           parser_version      = p_parser_version,
           parser_options_hash = p_parser_options_hash,
           transcript_representation = p_representation,
           processing_status   = 'ready',
           updated_at          = timezone('utc'::text, now()),
           transcript_mutation_revision = d.transcript_mutation_revision + 1
     WHERE d.id = p_document_id;

    DELETE FROM public.knowledge_chunks c WHERE c.document_id = p_document_id;

    INSERT INTO public.knowledge_chunks (
        document_id, chunk_index, text, text_hash,
        page_start, page_end, char_start, char_end, source_locators
    )
    SELECT
        p_document_id,
        (c ->> 'chunkIndex')::integer,
        c ->> 'text',
        -- sha256() and convert_to() are pg_catalog builtins, reachable with an
        -- empty search_path. pgcrypto's digest() is NOT: it lives in whichever
        -- schema the extension was installed into, which is not this
        -- function's to assume.
        encode(sha256(convert_to(c ->> 'text', 'UTF8')), 'hex'),
        NULL, NULL,
        (c ->> 'charStart')::integer,
        (c ->> 'charEnd')::integer,
        jsonb_build_array(jsonb_build_object(
            'kind', 'text-range',
            'charStart', (c ->> 'charStart')::integer,
            'charEnd', (c ->> 'charEnd')::integer
        ))
    FROM jsonb_array_elements(p_chunks) AS c;

    SELECT d.transcript_mutation_revision INTO new_revision
      FROM public.knowledge_documents d WHERE d.id = p_document_id;

    -- THE POSTCONDITION, INSIDE THE TRANSACTION. Raising here rolls back the
    -- document, the representation, the hash, the chunks and the revision
    -- together, so a caller can never be handed a token the next writer would
    -- also match.
    IF new_revision IS NULL OR new_revision = p_expected_revision THEN
        RAISE EXCEPTION 'the transcript revision did not advance (expected to leave %), rolling back',
            p_expected_revision USING ERRCODE = 'KT002';
    END IF;

    RETURN QUERY SELECT p_document_id, new_revision;
END
$replaceversion$;

-- ---------------------------------------------------------------------------
-- METADATA UPDATE. The version does not change; the description of it does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.knowledge_transcript_update_metadata(
    p_document_id       uuid,
    p_board_id          uuid,
    p_expected_sha256   text,
    p_expected_revision bigint,
    p_original_filename text,
    p_language          text,
    p_track_kind        text
)
RETURNS TABLE (document_id uuid, mutation_revision bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $updatemetadata$
DECLARE
    locked_revision bigint;
    new_revision    bigint;
BEGIN
    IF p_track_kind IS NULL OR p_track_kind NOT IN ('human', 'machine', 'unknown') THEN
        RAISE EXCEPTION 'track kind must be human, machine or unknown; got %',
            coalesce(p_track_kind, 'null') USING ERRCODE = 'KT003';
    END IF;

    -- THE SAME FIVE PREDICATES. A metadata write is no less able to land on
    -- the wrong row, and this is the path where the hash cannot separate two
    -- callers AT ALL -- it leaves the hash exactly as it found it, so the
    -- revision is the only thing distinguishing them.
    SELECT d.transcript_mutation_revision INTO locked_revision
      FROM public.knowledge_documents d
     WHERE d.id = p_document_id
       AND d.board_id = p_board_id
       AND d.content_sha256 = p_expected_sha256
       AND d.transcript_mutation_revision = p_expected_revision
       AND d.transcript_representation IS NOT NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'this transcript is not available to update, or it changed since it was opened'
            USING ERRCODE = 'KT001';
    END IF;

    -- ONLY the name and the provenance embedded in the representation.
    -- content_sha256, storage_path, file_size_bytes, the cues and their
    -- timings, and every chunk row are LEFT ALONE: the version is not
    -- changing, which is the entire reason this exists instead of a
    -- replacement.
    UPDATE public.knowledge_documents d
       SET original_filename = p_original_filename,
           transcript_representation = jsonb_set(
               jsonb_set(
                   d.transcript_representation,
                   '{language}',
                   CASE WHEN p_language IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_language) END,
                   true
               ),
               '{trackKind}', to_jsonb(p_track_kind), true
           ),
           updated_at = timezone('utc'::text, now()),
           transcript_mutation_revision = d.transcript_mutation_revision + 1
     WHERE d.id = p_document_id;

    SELECT d.transcript_mutation_revision INTO new_revision
      FROM public.knowledge_documents d WHERE d.id = p_document_id;

    IF new_revision IS NULL OR new_revision = p_expected_revision THEN
        RAISE EXCEPTION 'the transcript revision did not advance (expected to leave %), rolling back',
            p_expected_revision USING ERRCODE = 'KT002';
    END IF;

    RETURN QUERY SELECT p_document_id, new_revision;
END
$updatemetadata$;

-- ===========================================================================
-- EXECUTION. service_role alone.
--
-- PUBLIC is revoked EXPLICITLY: CREATE FUNCTION grants EXECUTE to PUBLIC by
-- default, so without these lines every predicate above would be reachable by
-- anyone with a connection. anon and authenticated are revoked by name as well
-- -- a revoke from PUBLIC does not remove a direct grant, and being explicit
-- costs one line and removes the question.
-- ===========================================================================

DO $grants$
DECLARE
    fn text;
    fns CONSTANT text[] := ARRAY[
        'public.knowledge_transcript_assert_chunks(jsonb)',
        'public.knowledge_transcript_assert_representation(jsonb)',
        'public.knowledge_transcript_create_version(uuid, uuid, uuid, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_replace_version(uuid, uuid, text, bigint, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_update_metadata(uuid, uuid, text, bigint, text, text, text)'
    ];
    still text[];
BEGIN
    FOREACH fn IN ARRAY fns LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END LOOP;

    -- Post-state by EFFECTIVE privilege, inside the same transaction. A grant
    -- that did not take is not something to find out about later.
    SELECT coalesce(array_agg(role_name || ' -> ' || fn_name ORDER BY role_name || ' -> ' || fn_name), ARRAY[]::text[])
      INTO still
      FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
      CROSS JOIN unnest(fns) AS fn_name
     WHERE has_function_privilege(role_name, fn_name, 'EXECUTE');

    IF array_length(still, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'a client role can still execute the transcript RPCs: [%]',
            array_to_string(still, ', ');
    END IF;

    FOREACH fn IN ARRAY fns LOOP
        IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'service_role cannot execute % -- transcript imports would fail', fn;
        END IF;
    END LOOP;
END
$grants$;
