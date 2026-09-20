-- Rollback for 20260920120000_knowledge_sources_beyond_pdf.sql.
--
-- REVERSING THIS IS NOT SYMMETRIC, and the asymmetry is the whole point of
-- reading this file before running it. The migration WIDENED what the tables
-- accept. Narrowing them again fails -- correctly -- if anything has used the
-- width. Restoring NOT NULL on knowledge_chunks.page_start scans the table and
-- errors on the first pageless chunk; restoring CHECK (kind = 'pdf') errors on
-- the first 'text' document.
--
-- THAT IS THE DESIGN. A rollback that succeeded by deleting rows would destroy
-- a user's ingested source to tidy a schema. If this file fails, the answer is
-- to decide what happens to those documents FIRST -- delete them deliberately
-- through the application's own deletion path, which cleans storage and
-- embeddings with them -- and then run this again.
--
-- The guard below refuses early and says which, rather than letting the first
-- ALTER produce a constraint violation that names a row and not a reason.

BEGIN;

DO $$
DECLARE
    v_pageless bigint;
    v_nonpdf   bigint;
    v_fileless bigint;
BEGIN
    SELECT count(*) INTO v_pageless
      FROM public.knowledge_chunks WHERE page_start IS NULL OR page_end IS NULL;

    SELECT count(*) INTO v_nonpdf
      FROM public.knowledge_documents WHERE kind <> 'pdf';

    SELECT count(*) INTO v_fileless
      FROM public.knowledge_documents
     WHERE storage_path IS NULL OR file_size_bytes IS NULL OR mime_type IS NULL;

    IF v_pageless > 0 OR v_nonpdf > 0 OR v_fileless > 0 THEN
        RAISE EXCEPTION
            'Refusing to roll back: % pageless chunk(s), % non-pdf document(s), % document(s) without file columns. Remove those sources through the application''s deletion path first -- this file will not delete a user''s data to narrow a schema.',
            v_pageless, v_nonpdf, v_fileless;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- knowledge_documents, back to pdf-only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents ALTER COLUMN storage_path     SET NOT NULL;
ALTER TABLE public.knowledge_documents ALTER COLUMN file_size_bytes  SET NOT NULL;
ALTER TABLE public.knowledge_documents ALTER COLUMN mime_type        SET NOT NULL;

ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_kind_check;
ALTER TABLE public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_kind_check CHECK (kind = 'pdf');

COMMENT ON COLUMN public.knowledge_documents.kind IS NULL;
COMMENT ON COLUMN public.knowledge_documents.original_filename IS NULL;
COMMENT ON COLUMN public.knowledge_documents.storage_path IS NULL;
COMMENT ON COLUMN public.knowledge_documents.mime_type IS NULL;
COMMENT ON COLUMN public.knowledge_documents.file_size_bytes IS NULL;

-- ---------------------------------------------------------------------------
-- knowledge_chunks, back to pages-always. Constraint names and predicates are
-- restored to the 20260820 foundation exactly, including the absence of a
-- page_end lower bound there -- page_end >= page_start carried that job.
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_pair_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_end_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_start_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_range_check;

ALTER TABLE public.knowledge_chunks ALTER COLUMN page_start SET NOT NULL;
ALTER TABLE public.knowledge_chunks ALTER COLUMN page_end   SET NOT NULL;

ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_start_check CHECK (page_start >= 1);
ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_range_check CHECK (page_end >= page_start);

COMMENT ON COLUMN public.knowledge_chunks.page_start IS NULL;
COMMENT ON COLUMN public.knowledge_chunks.page_end IS NULL;

-- ---------------------------------------------------------------------------
-- The retrieval function's comment, restored to the 20260918180000 wording.
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer) IS
    'Full-text search the PDF chunks of one board under three configurations. Ranked by simple where simple matched two or more query terms; otherwise by the stemmed configuration that strictly matched more. Length normalization throughout. p_query is a tsquery expression built by the caller, not a raw user message.';

COMMIT;
