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
--
-- STATUS 2026-09-21: VERIFIED on an isolated LOCAL stack -- clean run, no
-- shims, at 571b19b6, against a pre-state matching the hosted ACL. An earlier
-- shimmed run found five defects in this rollout's SQL; all are fixed and the
-- clean run is green. NOT yet run against the hosted database.
-- NEVER applied to hosted. See .agent/isolated-sql-verification.md.

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
