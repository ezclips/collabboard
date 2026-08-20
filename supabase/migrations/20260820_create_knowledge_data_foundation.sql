-- Knowledge/PDF V1 data foundation.
--
-- The tables are board-scoped and intentionally parser-neutral. OpenDataLoader
-- remains a future worker concern; knowledge_elements and pgvector are not
-- part of this migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    kind text NOT NULL DEFAULT 'pdf',
    original_filename text NOT NULL,
    mime_type text NOT NULL DEFAULT 'application/pdf',
    file_size_bytes bigint NOT NULL,
    storage_path text NOT NULL,
    content_sha256 text NOT NULL,
    page_count integer,
    processing_status text NOT NULL DEFAULT 'uploaded',
    processing_error text,
    parser_name text,
    parser_version text,
    parser_options_hash text,
    raw_artifact_path text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT knowledge_documents_kind_check CHECK (kind = 'pdf'),
    CONSTRAINT knowledge_documents_file_size_check CHECK (file_size_bytes >= 0),
    CONSTRAINT knowledge_documents_page_count_check CHECK (page_count IS NULL OR page_count >= 0),
    CONSTRAINT knowledge_documents_processing_status_check
        CHECK (processing_status IN ('uploaded', 'processing', 'ready', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.knowledge_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    page_number integer NOT NULL,
    width_points double precision,
    height_points double precision,
    rotation double precision,
    text text NOT NULL DEFAULT '',
    text_hash text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT knowledge_pages_page_number_check CHECK (page_number >= 1),
    CONSTRAINT knowledge_pages_width_check CHECK (width_points IS NULL OR width_points > 0),
    CONSTRAINT knowledge_pages_height_check CHECK (height_points IS NULL OR height_points > 0),
    CONSTRAINT knowledge_pages_document_page_key UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    text text NOT NULL,
    char_start integer,
    char_end integer,
    text_hash text NOT NULL,
    chunk_index integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT knowledge_chunks_page_start_check CHECK (page_start >= 1),
    CONSTRAINT knowledge_chunks_page_range_check CHECK (page_end >= page_start),
    CONSTRAINT knowledge_chunks_char_range_check CHECK (
        (char_start IS NULL AND char_end IS NULL)
        OR (
            char_start IS NOT NULL
            AND char_end IS NOT NULL
            AND char_start >= 0
            AND char_end >= char_start
        )
    ),
    CONSTRAINT knowledge_chunks_document_index_key UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.source_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_padlet_id uuid NOT NULL REFERENCES public.padlets(id) ON DELETE CASCADE,
    source_document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    quote_text text,
    quote_hash text,
    char_start integer,
    char_end integer,
    locator jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT source_references_page_start_check CHECK (page_start >= 1),
    CONSTRAINT source_references_page_range_check CHECK (page_end >= page_start),
    CONSTRAINT source_references_char_range_check CHECK (
        (char_start IS NULL AND char_end IS NULL)
        OR (
            char_start IS NOT NULL
            AND char_end IS NOT NULL
            AND char_start >= 0
            AND char_end >= char_start
        )
    )
);

CREATE INDEX IF NOT EXISTS knowledge_documents_board_status_idx
    ON public.knowledge_documents(board_id, processing_status);

CREATE INDEX IF NOT EXISTS knowledge_pages_document_idx
    ON public.knowledge_pages(document_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
    ON public.knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS source_references_document_idx
    ON public.source_references(source_document_id);

CREATE INDEX IF NOT EXISTS source_references_target_padlet_idx
    ON public.source_references(target_padlet_id);

DROP TRIGGER IF EXISTS knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER knowledge_documents_updated_at
    BEFORE UPDATE ON public.knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_references ENABLE ROW LEVEL SECURITY;

-- Documents follow the existing board owner/member model. Editors may mutate
-- board knowledge; service-role worker writes bypass RLS server-side.
CREATE POLICY knowledge_documents_select
    ON public.knowledge_documents FOR SELECT TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR public.is_board_member(board_id, auth.uid())
    );

CREATE POLICY knowledge_documents_insert
    ON public.knowledge_documents FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (
            board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
            OR board_id IN (
                SELECT board_id
                FROM public.board_collaborators
                WHERE user_id = auth.uid() AND role = 'editor'
            )
        )
    );

CREATE POLICY knowledge_documents_update
    ON public.knowledge_documents FOR UPDATE TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id
            FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    )
    WITH CHECK (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id
            FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    );

CREATE POLICY knowledge_documents_delete
    ON public.knowledge_documents FOR DELETE TO authenticated
    USING (
        board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
        OR board_id IN (
            SELECT board_id
            FROM public.board_collaborators
            WHERE user_id = auth.uid() AND role = 'editor'
        )
    );

-- Derived rows inherit access exclusively through their source document.
CREATE POLICY knowledge_pages_select
    ON public.knowledge_pages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_pages.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(d.board_id, auth.uid())
              )
        )
    );

CREATE POLICY knowledge_pages_write
    ON public.knowledge_pages FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_pages.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_pages.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    );

CREATE POLICY knowledge_chunks_select
    ON public.knowledge_chunks FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_chunks.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(d.board_id, auth.uid())
              )
        )
    );

CREATE POLICY knowledge_chunks_write
    ON public.knowledge_chunks FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_chunks.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            WHERE d.id = knowledge_chunks.document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    );

-- References require a source document and a target Padlet in the same board.
-- Both foreign keys cascade independently so neither side can leave an orphan
-- citation, while deleting a Padlet never deletes its source document.
CREATE POLICY source_references_select
    ON public.source_references FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            JOIN public.padlets p
              ON p.id = source_references.target_padlet_id
             AND p.board_id = d.board_id
            WHERE d.id = source_references.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR public.is_board_member(d.board_id, auth.uid())
              )
        )
    );

CREATE POLICY source_references_write
    ON public.source_references FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            JOIN public.padlets p
              ON p.id = source_references.target_padlet_id
             AND p.board_id = d.board_id
            WHERE d.id = source_references.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.knowledge_documents d
            JOIN public.padlets p
              ON p.id = source_references.target_padlet_id
             AND p.board_id = d.board_id
            WHERE d.id = source_references.source_document_id
              AND (
                  d.board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
                  OR d.board_id IN (
                      SELECT board_id
                      FROM public.board_collaborators
                      WHERE user_id = auth.uid() AND role = 'editor'
                  )
              )
        )
    );
