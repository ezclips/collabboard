-- MEDIA_SOURCES_STAGE_1: the knowledge tables stop assuming every source is a
-- PDF.
--
-- WHAT IS WRONG. knowledge_chunks.page_start and page_end are NOT NULL with
-- CHECK (page_start >= 1). A .txt chunk has no page, so the schema cannot hold
-- one without inventing a page number -- and an invented page is not a harmless
-- placeholder: it is a locator that a citation will display and a reader will
-- believe. knowledge_documents.kind was declared with DEFAULT 'pdf' and then
-- pinned by CHECK (kind = 'pdf'), so the column that anticipated this admits
-- nothing. The file-shaped columns (storage_path, file_size_bytes, mime_type)
-- are NOT NULL and describe an uploaded file, which a pasted URL is not.
--
-- WHAT THIS MIGRATION DOES NOT DO. It admits NO ROWS by itself. Nothing writes
-- a 'text' document until the application does, so a battery run before and
-- after this migration must be identical -- that is the acceptance for this
-- file, and it is the reason it ships alone rather than beside the ingestion
-- that will use it.
--
-- THE NEW PREDICATES ARE STRICTLY WEAKER THAN THE OLD ONES. Every row that
-- satisfied NOT NULL plus `>= 1` satisfies `IS NULL OR >= 1`, so the validation
-- scan below cannot fail on existing data. It is still a scan: DROP CONSTRAINT
-- is catalog-only, but ADD CONSTRAINT validates under ACCESS EXCLUSIVE for its
-- duration. knowledge_chunks is the larger of the two tables. If it has grown
-- past a comfortable window, split each ADD into `NOT VALID` plus a later
-- `VALIDATE CONSTRAINT`, which takes only SHARE UPDATE EXCLUSIVE -- the
-- predicates being weaker is exactly what makes that split safe.
--
-- PAGES STAY BOTH-OR-NEITHER, which is the one thing here that was not asked
-- for. The adjacent knowledge_chunks_char_range_check already spells that
-- pattern out for char_start/char_end, and a chunk with a page_start and no
-- page_end is not a partial locator -- it is a broken one. Mirroring the
-- sibling costs nothing and refuses a state nothing should ever write. Strike
-- knowledge_chunks_page_pair_check alone if that judgment is unwanted; nothing
-- else in this file depends on it.
--
-- KIND IS EXTENDED BY EXACTLY ONE VALUE. 'text' only. 'docx' and 'youtube'
-- join at their own stages, each admitted when something exists that can
-- create it -- a CHECK that permits a kind no code writes is a promise the
-- schema cannot keep.
--
-- THE RETRIEVAL FUNCTION IS NOT TOUCHED. search_board_knowledge_chunks_text
-- keeps its signature and its body; its RETURNS TABLE already exposes
-- source_locators, and the locator decision for this unit is that time and
-- character ranges live there rather than in typed columns. CREATE OR REPLACE
-- cannot change a RETURNS TABLE, so a typed column would have meant dropping
-- and recreating the function both Board AI and the wiki compiler retrieve
-- through. Only its COMMENT changes, because the comment says "PDF chunks" and
-- after this migration that is no longer what the table holds.

BEGIN;

-- ---------------------------------------------------------------------------
-- knowledge_chunks: a chunk may have no page.
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_chunks ALTER COLUMN page_start DROP NOT NULL;
ALTER TABLE public.knowledge_chunks ALTER COLUMN page_end   DROP NOT NULL;

-- All four are dropped, including the two this file introduces: the rollout
-- must be re-runnable, and ADD CONSTRAINT has no IF NOT EXISTS. Applying it
-- twice is not hypothetical -- a rollout is re-run after a partial failure.
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_start_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_range_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_end_check;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_page_pair_check;

-- A page number, when there is one, is still 1-based.
ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_start_check
    CHECK (page_start IS NULL OR page_start >= 1);

ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_end_check
    CHECK (page_end IS NULL OR page_end >= 1);

-- Ordering is asserted only when both ends are present.
ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_range_check
    CHECK (page_start IS NULL OR page_end IS NULL OR page_end >= page_start);

-- Both ends or neither -- the same shape knowledge_chunks_char_range_check
-- already uses for char_start/char_end.
ALTER TABLE public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_page_pair_check
    CHECK ((page_start IS NULL) = (page_end IS NULL));

COMMENT ON COLUMN public.knowledge_chunks.page_start IS
    'First page of the chunk''s span, or NULL for a source that has no pages (text, and later transcripts). NULL is the honest absence of a locator, never a placeholder: a citation reads this to decide whether to name a page at all.';

COMMENT ON COLUMN public.knowledge_chunks.page_end IS
    'Last page of the chunk''s span, or NULL. Null exactly when page_start is null.';

-- ---------------------------------------------------------------------------
-- knowledge_documents: a document may be something other than an uploaded PDF.
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_kind_check;

ALTER TABLE public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_kind_check
    CHECK (kind IN ('pdf', 'text'));

ALTER TABLE public.knowledge_documents ALTER COLUMN storage_path     DROP NOT NULL;
ALTER TABLE public.knowledge_documents ALTER COLUMN file_size_bytes  DROP NOT NULL;
ALTER TABLE public.knowledge_documents ALTER COLUMN mime_type        DROP NOT NULL;

-- file_size_bytes keeps its non-negative check, which already tolerates NULL
-- by its own wording; it is re-stated here only because DROP NOT NULL does not
-- touch it and a reader should not have to go looking to confirm that.
--
-- original_filename stays NOT NULL ON PURPOSE. It is the DISPLAY NAME, and
-- every consumer already reads it as one -- chunkLabel falls back to 'PDF' only
-- when it is blank. A URL source puts its title here. The column's name is a
-- wart we accept rather than a rename that would touch every reader of it.

COMMENT ON COLUMN public.knowledge_documents.kind IS
    'What this document is: pdf, or text. Extended one value per stage, and only when something exists that can create that kind.';

COMMENT ON COLUMN public.knowledge_documents.original_filename IS
    'The DISPLAY NAME of the source, not necessarily a filename. For an uploaded file it is the filename; for a non-file kind it is the title. NOT NULL because every consumer labels a citation with it.';

COMMENT ON COLUMN public.knowledge_documents.storage_path IS
    'Where the uploaded bytes live, or NULL for a kind that has no uploaded file.';

COMMENT ON COLUMN public.knowledge_documents.mime_type IS
    'The uploaded file''s media type, or NULL for a kind that has no uploaded file.';

COMMENT ON COLUMN public.knowledge_documents.file_size_bytes IS
    'Size of the uploaded file in bytes, or NULL for a kind that has no uploaded file.';

-- ---------------------------------------------------------------------------
-- The retrieval function's comment, which no longer describes the table.
-- The function itself is unchanged; this is a COMMENT, not a replacement.
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.search_board_knowledge_chunks_text(uuid, text, integer) IS
    'Full-text search the knowledge chunks of one board under three configurations. Ranked by simple where simple matched two or more query terms; otherwise by the stemmed configuration that strictly matched more. Length normalization throughout. p_query is a tsquery expression built by the caller, not a raw user message. page_start/page_end are NULL for sources that have no pages; callers must not assume a page.';

COMMIT;
