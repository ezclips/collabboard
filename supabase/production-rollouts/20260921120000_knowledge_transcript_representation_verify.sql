-- VERIFY: the column and its shape check exist, and nothing else moved.
--
-- Each check RAISES rather than returning a row, so a failure is impossible to
-- read as a pass in a transcript of the run.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'knowledge_documents'
           AND column_name = 'transcript_representation'
           AND data_type = 'jsonb'
           AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'transcript_representation is missing, not jsonb, or not nullable';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'knowledge_documents_transcript_representation_check'
    ) THEN
        RAISE EXCEPTION 'the transcript_representation shape check is missing';
    END IF;

    -- The column admits no rows by itself. Any non-null value here after the
    -- migration alone would mean something wrote through an unexpected path.
    IF EXISTS (
        SELECT 1 FROM public.knowledge_documents
         WHERE transcript_representation IS NOT NULL
    ) THEN
        RAISE WARNING 'transcript_representation is already populated -- expected only after the importer ships';
    END IF;

    -- Nothing that existed before may have been relaxed by this migration.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'knowledge_documents'
           AND column_name = 'content_sha256'
           AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'content_sha256 became nullable -- this migration must not touch it';
    END IF;
END $$;

-- A POSITIVE CONTROL THAT ACTUALLY EXERCISES THE CONSTRAINT.
--
-- An earlier draft of this file 'tested' the check with an UPDATE ... WHERE
-- false, which touches no row and therefore proves nothing. This copies the
-- table definition INCLUDING CONSTRAINTS into a temporary table -- no FKs, no
-- production rows -- and writes a representation that is not an object. The
-- check must reject it. If it does not, the constraint is not doing its job
-- and this script must fail rather than report ok.

DO $$
DECLARE
    rejected boolean := false;
BEGIN
    CREATE TEMP TABLE transcript_check_probe
        (LIKE public.knowledge_documents INCLUDING CONSTRAINTS) ON COMMIT DROP;

    BEGIN
        INSERT INTO transcript_check_probe
            (board_id, original_filename, content_sha256, transcript_representation)
        VALUES
            (gen_random_uuid(), 'probe.srt', repeat('a', 64), '"not an object"'::jsonb);
    EXCEPTION WHEN check_violation THEN
        rejected := true;
    END;

    IF NOT rejected THEN
        RAISE EXCEPTION 'the shape check accepted a representation that is not an object';
    END IF;

    -- And the negative half: a well-formed representation must be ACCEPTED.
    -- A check that rejects everything would pass the test above.
    INSERT INTO transcript_check_probe
        (board_id, original_filename, content_sha256, transcript_representation)
    VALUES
        (gen_random_uuid(), 'probe.srt', repeat('b', 64),
         '{"cues": [], "representationVersion": 1}'::jsonb);
END $$;

-- PRIVILEGES, BOTH HALVES.
--
-- Granting is half the job; asserting that nothing ELSE was granted is the
-- other. A rollout that only checks its intended grants cannot notice a
-- capability it handed out by accident.

DO $$
DECLARE
    unexpected text;
BEGIN
    -- The intended set, stated positively.
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'transcript_representation', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role cannot UPDATE transcript_representation -- the importer could not write it';
    END IF;
    IF NOT has_column_privilege('service_role', 'public.knowledge_documents', 'transcript_representation', 'INSERT') THEN
        RAISE EXCEPTION 'service_role cannot INSERT transcript_representation';
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.knowledge_documents', 'transcript_representation', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated cannot read transcript_representation -- the reader needs it for timestamps';
    END IF;

    -- And the half that matters more: nobody else may WRITE it.
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'transcript_representation', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE transcript_representation -- it could be made to disagree with content_sha256';
    END IF;
    IF has_column_privilege('authenticated', 'public.knowledge_documents', 'transcript_representation', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated can INSERT transcript_representation';
    END IF;
    IF has_column_privilege('anon', 'public.knowledge_documents', 'transcript_representation', 'UPDATE')
       OR has_column_privilege('anon', 'public.knowledge_documents', 'transcript_representation', 'INSERT') THEN
        RAISE EXCEPTION 'anon can write transcript_representation';
    END IF;

    -- The writable set for authenticated must be EXACTLY what it was before
    -- this rollout. Naming the new column is not enough: this catches a grant
    -- widened anywhere on the table while this migration was applied.
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO unexpected
      FROM information_schema.column_privileges
     WHERE grantee = 'authenticated'
       AND table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND privilege_type = 'UPDATE'
       AND column_name = 'transcript_representation';

    IF unexpected IS NOT NULL THEN
        RAISE EXCEPTION 'unexpected authenticated UPDATE grant on: %', unexpected;
    END IF;
END $$;

SELECT 'transcript_representation verify: ok' AS result;
