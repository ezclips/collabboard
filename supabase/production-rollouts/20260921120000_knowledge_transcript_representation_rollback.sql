-- ROLLBACK: remove the column and its check.
--
-- SAFE ONLY WHILE NOTHING HAS BEEN WRITTEN. Dropping this column discards the
-- stored cue arrays, and those are what make a transcript's content_sha256
-- reproducible. After the importer has stored any transcript, this rollback
-- destroys the ability to re-derive those versions -- the documents would
-- survive with a hash nothing can reproduce or re-verify.
--
-- So: roll back only if the importer has not yet run in this environment.
-- Check first, and stop if anything is populated.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.knowledge_documents
         WHERE transcript_representation IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'refusing to roll back: % transcript document(s) would lose the representation their content_sha256 was taken over',
            (SELECT count(*) FROM public.knowledge_documents WHERE transcript_representation IS NOT NULL);
    END IF;
END $$;

ALTER TABLE public.knowledge_documents
    DROP CONSTRAINT IF EXISTS knowledge_documents_transcript_representation_check;

ALTER TABLE public.knowledge_documents
    DROP COLUMN IF EXISTS transcript_representation;
