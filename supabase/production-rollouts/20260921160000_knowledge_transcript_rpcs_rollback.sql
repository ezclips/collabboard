-- ROLLBACK the transcript RPCs: drop the five functions.
--
-- RUN THIS BEFORE the revision column's rollback. That file refuses to drop
-- the column while any of these functions exist, on purpose -- dropping the
-- column underneath them would replace a lost update with a hard failure on
-- every transcript edit.
--
-- WHAT DROPPING THEM COSTS: there is no other atomic path for a transcript
-- version. Without them a replacement becomes a sequence of statements, and
-- halfway through that sequence is a document whose text, chunks,
-- representation and hash describe different transcripts. Roll back only if
-- the functions themselves broke something, and name what, in the same change.
--
-- NO CASCADE. If something else has come to depend on one of these, that is a
-- second change nobody reviewed, and PostgreSQL saying so is the right outcome.
--
-- UNVERIFIED: not executed anywhere.

DO $rpcrollback$
DECLARE
    fn text;
    fns CONSTANT text[] := ARRAY[
        'public.knowledge_transcript_create_version(uuid, uuid, uuid, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_replace_version(uuid, uuid, text, bigint, text, text, bigint, text, text, text, text, text, jsonb, jsonb)',
        'public.knowledge_transcript_update_metadata(uuid, uuid, text, bigint, text, text, text)',
        'public.knowledge_transcript_assert_chunks(jsonb)',
        'public.knowledge_transcript_assert_representation(jsonb)',
        'public.knowledge_transcript_assert_version(jsonb, jsonb)'
    ];
    dropped integer := 0;
BEGIN
    FOREACH fn IN ARRAY fns LOOP
        IF to_regprocedure(fn) IS NOT NULL THEN
            EXECUTE format('DROP FUNCTION %s', fn);
            dropped := dropped + 1;
        END IF;
    END LOOP;

    IF dropped = 0 THEN
        RAISE NOTICE 'transcript RPCs: already absent -- nothing to roll back';
    ELSE
        RAISE NOTICE 'transcript RPCs: dropped % function(s) -- transcript imports have no atomic path now', dropped;
    END IF;
END
$rpcrollback$;
