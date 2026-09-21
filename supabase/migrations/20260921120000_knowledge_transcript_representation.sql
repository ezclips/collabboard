-- MEDIA_SOURCES_STAGE_3B: a document can carry the representation its version
-- hash was taken over.
--
-- WHY A COLUMN IS NEEDED AT ALL. A transcript's version must change when its
-- cue TIMING changes even though its words did not -- otherwise re-importing a
-- corrected caption file whose timings shifted leaves every citing wiki page
-- holding a timestamp that now points at the wrong moment, with nothing
-- flagged stale. So content_sha256 for a transcript is taken over canonical
-- text AND cue timing AND the claimed video identity.
--
-- That hash has to be reproducible from what is stored, without re-parsing the
-- original upload: a check that re-runs the parser proves the parser is
-- deterministic, not that the stored row is the one that was hashed. Nothing
-- on knowledge_documents can hold a cue array -- there is no jsonb column on
-- it, and the file-shaped columns are for files. Hence one additive column.
--
-- WHAT THIS MIGRATION DOES NOT DO. It admits NO ROWS by itself and changes no
-- existing predicate. The column is nullable with no default, so every
-- existing row remains valid and unread by it; nothing writes a transcript
-- until the application does. A battery run before and after this migration
-- must therefore be identical, which is the acceptance for this file.
--
-- WHY NOT A NEW `kind`. A transcript is read the way every other pageless text
-- source is read -- character ranges into one canonical string, no pages --
-- so it reuses kind = 'text', exactly as DOCX does. `kind` answers HOW a
-- source is read, not what it was made from. The transcript-ness lives in this
-- column and in the parser_* columns that already exist. Adding a kind would
-- force every consumer that switches on kind to grow a branch that behaves
-- identically to the one beside it.

ALTER TABLE public.knowledge_documents
    ADD COLUMN IF NOT EXISTS transcript_representation jsonb;

-- Shape, not contents. The application owns the representation's meaning and
-- its version number; the database's job is to refuse something that is not a
-- representation at all, so a malformed write fails at the boundary rather
-- than becoming a row whose hash can never be reproduced.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'knowledge_documents_transcript_representation_check'
    ) THEN
        ALTER TABLE public.knowledge_documents
            ADD CONSTRAINT knowledge_documents_transcript_representation_check
            CHECK (
                transcript_representation IS NULL
                OR (
                    jsonb_typeof(transcript_representation) = 'object'
                    AND jsonb_typeof(transcript_representation -> 'cues') = 'array'
                    AND jsonb_typeof(transcript_representation -> 'representationVersion') = 'number'
                )
            );
    END IF;
END $$;

COMMENT ON COLUMN public.knowledge_documents.transcript_representation IS
    'For transcript sources: the cue array (character ranges in UTF-16 code '
    'units, times in integer milliseconds), the claimed video identity, the '
    'declared language and track kind, and the representation version. '
    'content_sha256 is taken over a deterministic serialisation of this plus '
    'the canonical text, so a timing-only correction is a new version. NULL '
    'for every other source kind.';

-- ---------------------------------------------------------------------------
-- GRANTS. An added column is writable by NOBODY but postgres until it is
-- granted, including service_role -- confirmed read-only against the live
-- schema before this was written, not assumed from Supabase defaults.
--
-- WHO WRITES IT. The knowledge routes authorise with the caller's session
-- client and then write with the admin (service_role) client. So the importer
-- writes this column as service_role, and `authenticated` needs no UPDATE on
-- it at all.
--
-- WHY `authenticated` IS DELIBERATELY NOT GRANTED. The stored representation
-- and content_sha256 must agree: the hash is taken over the representation,
-- and the wiki's staleness signal is the comparison of that hash. A column a
-- client could write independently of the text it describes is a column that
-- can be made to disagree with it, and the disagreement would be invisible --
-- a citing page either falsely stale or, worse, falsely fresh. Keeping the
-- write on one server-side path keeps the two written together.
-- ---------------------------------------------------------------------------

GRANT SELECT (transcript_representation) ON TABLE public.knowledge_documents TO authenticated;
GRANT SELECT (transcript_representation) ON TABLE public.knowledge_documents TO service_role;
GRANT INSERT (transcript_representation) ON TABLE public.knowledge_documents TO service_role;
GRANT UPDATE (transcript_representation) ON TABLE public.knowledge_documents TO service_role;
