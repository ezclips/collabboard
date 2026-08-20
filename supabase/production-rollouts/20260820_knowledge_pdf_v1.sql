-- CollabBoard Knowledge/PDF V1 production rollout.
-- Sources below are exact copies of the accepted Knowledge migrations.
-- Run this file as one PostgreSQL statement batch. It is intentionally not a
-- Supabase CLI migration and contains no historical schema reconstruction.

BEGIN;

-- Fail before any schema, bucket, or privilege mutation if this is not the
-- audited clean-install state.
DO $preflight$
DECLARE
    object_name text;
    knowledge_rpc_names constant text[] := ARRAY[
        'complete_knowledge_extraction',
        'claim_knowledge_extraction',
        'renew_knowledge_processing_lease',
        'fail_knowledge_extraction',
        'list_knowledge_processing_candidates'
    ];
BEGIN
    FOREACH object_name IN ARRAY ARRAY[
        'knowledge_documents',
        'knowledge_pages',
        'knowledge_chunks',
        'source_references'
    ] LOOP
        IF to_regclass(format('public.%I', object_name)) IS NOT NULL THEN
            RAISE EXCEPTION
                'Knowledge rollout preflight failed: public.% already exists',
                object_name;
        END IF;
    END LOOP;

    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE EXCEPTION
            'Knowledge rollout preflight failed: storage.buckets is unavailable';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'knowledge-documents'
    ) THEN
        RAISE EXCEPTION
            'Knowledge rollout preflight failed: storage bucket knowledge-documents already exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY (knowledge_rpc_names)
    ) THEN
        RAISE EXCEPTION
            'Knowledge rollout preflight failed: one or more Knowledge RPCs already exist';
    END IF;
END
$preflight$;

-- SOURCE: supabase/migrations/20260820_create_knowledge_data_foundation.sql
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

-- SOURCE: supabase/migrations/20260820_provision_knowledge_documents_bucket.sql
-- Knowledge source PDFs are private binary artifacts.
--
-- This is intentionally a normal post-baseline migration.  It provisions only
-- the Knowledge bucket; the existing public application buckets are untouched.
-- No MIME allow-list is set yet: P4D also reserves raw_artifact_path for a
-- future parser artifact whose media type is not fixed by this patch.
INSERT INTO storage.buckets (id, name, public)
VALUES (
    'knowledge-documents',
    'knowledge-documents',
    false
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false;

-- SOURCE: supabase/migrations/20260821_add_knowledge_extraction_lifecycle.sql
-- Knowledge extraction lifecycle: the atomic success commit.
--
-- The other two transitions do not need a function. Claiming a document
-- (uploaded|failed -> processing) and failing one (processing -> failed) are
-- each a single conditional UPDATE, and one UPDATE is already atomic: two
-- concurrent claims serialise on the row lock and the loser re-evaluates its
-- WHERE clause against the winner's committed row, so exactly one claim can
-- ever succeed. Those stay in application code.
--
-- Completion cannot: it must delete stale pages, insert the new page set and
-- flip the document to 'ready' with no window in which 'ready' is visible
-- alongside missing or partial pages. One RPC invocation is one transaction
-- (same rationale as import_workspace_bundle), so any exception below rolls
-- the whole commit back and the document simply stays 'processing'.
--
-- SECURITY INVOKER: this must not become a privilege-escalation path. It is
-- additionally revoked from anon/authenticated so only the server-side worker
-- role can call it at all.

CREATE OR REPLACE FUNCTION public.complete_knowledge_extraction(
    p_document_id uuid,
    p_page_count integer,
    p_pages jsonb,
    p_parser_name text,
    p_parser_version text,
    p_parser_options_hash text DEFAULT NULL,
    p_raw_artifact_path text DEFAULT NULL,
    p_expected_content_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    current_status text;
    current_sha text;
    distinct_pages integer;
    inserted_pages integer;
BEGIN
    -- Lock the document first so a concurrent claim/fail cannot interleave.
    SELECT processing_status, content_sha256
      INTO current_status, current_sha
      FROM public.knowledge_documents
     WHERE id = p_document_id
     FOR UPDATE;

    -- Deleted while the worker was running (P4D remains authoritative): report
    -- a stale job. No pages are written, so no orphans can be created.
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF current_status <> 'processing' THEN
        RETURN jsonb_build_object('status', 'conflict', 'currentStatus', current_status);
    END IF;

    IF p_expected_content_sha256 IS NOT NULL AND p_expected_content_sha256 <> current_sha THEN
        RETURN jsonb_build_object('status', 'content_mismatch');
    END IF;

    -- Defensive re-validation. The domain validates the same rules before it
    -- gets here; this function must not trust its caller any more than the
    -- import RPC trusts restore.ts.
    IF p_pages IS NULL OR jsonb_typeof(p_pages) <> 'array' OR jsonb_array_length(p_pages) = 0 THEN
        RAISE EXCEPTION 'knowledge extraction requires at least one page';
    END IF;

    IF p_page_count IS NULL OR jsonb_array_length(p_pages) <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction page count % does not match % supplied pages',
            p_page_count, jsonb_array_length(p_pages);
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_pages)
            AS p(page_number integer, width_points double precision, height_points double precision)
         WHERE p.page_number IS NULL
            OR p.page_number < 1
            OR p.width_points IS NULL
            OR p.height_points IS NULL
            OR p.width_points <= 0
            OR p.height_points <= 0
    ) THEN
        RAISE EXCEPTION 'knowledge extraction pages require 1-based numbering and positive geometry';
    END IF;

    SELECT count(DISTINCT p.page_number)
      INTO distinct_pages
      FROM jsonb_to_recordset(p_pages) AS p(page_number integer);

    IF distinct_pages <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction contains duplicate page numbers';
    END IF;

    -- Retry replaces stale derived pages only here, inside the transaction
    -- that also installs the replacements.
    DELETE FROM public.knowledge_pages WHERE document_id = p_document_id;

    INSERT INTO public.knowledge_pages (
        document_id, page_number, width_points, height_points, rotation, text, text_hash
    )
    SELECT
        p_document_id,
        p.page_number,
        p.width_points,
        p.height_points,
        p.rotation,
        COALESCE(p.text, ''),
        p.text_hash
      FROM jsonb_to_recordset(p_pages)
        AS p(
            page_number integer,
            width_points double precision,
            height_points double precision,
            rotation double precision,
            text text,
            text_hash text
        );

    GET DIAGNOSTICS inserted_pages = ROW_COUNT;

    IF inserted_pages <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction persisted % of % pages', inserted_pages, p_page_count;
    END IF;

    UPDATE public.knowledge_documents
       SET processing_status = 'ready',
           page_count = p_page_count,
           parser_name = p_parser_name,
           parser_version = p_parser_version,
           parser_options_hash = p_parser_options_hash,
           raw_artifact_path = p_raw_artifact_path,
           processing_error = NULL
     WHERE id = p_document_id;

    RETURN jsonb_build_object('status', 'completed', 'pageCount', p_page_count);
END;
$$;

COMMENT ON FUNCTION public.complete_knowledge_extraction IS
    'Atomic processing -> ready commit for Knowledge extraction (see lib/domain/knowledge/knowledgeExtraction.ts). SECURITY INVOKER; executable by service_role only.';

-- Supabase grants EXECUTE on new public-schema functions to anon and
-- authenticated through ALTER DEFAULT PRIVILEGES, so revoking PUBLIC alone
-- leaves those explicit grants in place. Both roles are named here.
REVOKE ALL ON FUNCTION public.complete_knowledge_extraction(
    uuid, integer, jsonb, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction(
    uuid, integer, jsonb, text, text, text, text, text
) TO service_role;

-- SOURCE: supabase/migrations/20260822_add_knowledge_processing_lease.sql
-- P5C processing lease and stale-worker fencing.
--
-- Every state-changing lifecycle operation is fenced by the current lease
-- token inside Postgres. A token check in TypeScript alone would leave a
-- stale worker able to race a newer attempt.

ALTER TABLE public.knowledge_documents
    ADD COLUMN IF NOT EXISTS processing_lease_token uuid,
    ADD COLUMN IF NOT EXISTS processing_lease_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS processing_attempt integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'knowledge_documents_processing_attempt_check'
          AND conrelid = 'public.knowledge_documents'::regclass
    ) THEN
        ALTER TABLE public.knowledge_documents
            ADD CONSTRAINT knowledge_documents_processing_attempt_check
            CHECK (processing_attempt >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_documents_processing_lease_idx
    ON public.knowledge_documents(processing_status, processing_lease_expires_at);

CREATE OR REPLACE FUNCTION public.claim_knowledge_extraction(
    p_document_id uuid,
    p_lease_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    claimed_row record;
    current_status text;
BEGIN
    IF p_lease_ttl_seconds IS NULL OR p_lease_ttl_seconds <= 0 THEN
        RAISE EXCEPTION 'processing lease TTL must be positive';
    END IF;

    -- This is the exclusivity decision. Database time and one UPDATE ensure
    -- that concurrent claimers cannot both receive a current lease.
    UPDATE public.knowledge_documents
       SET processing_status = 'processing',
           processing_error = NULL,
           raw_artifact_path = NULL,
           processing_lease_token = gen_random_uuid(),
           processing_lease_expires_at = now() + make_interval(secs => p_lease_ttl_seconds),
           processing_attempt = processing_attempt + 1
     WHERE id = p_document_id
       AND (
           processing_status IN ('uploaded', 'failed')
           OR (
               processing_status = 'processing'
               AND (
                   processing_lease_expires_at IS NULL
                   OR processing_lease_expires_at <= now()
               )
           )
       )
     RETURNING id, board_id, storage_path, content_sha256,
               processing_lease_token, processing_attempt, processing_lease_expires_at
      INTO claimed_row;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'claimed',
            'documentId', claimed_row.id,
            'boardId', claimed_row.board_id,
            'storagePath', claimed_row.storage_path,
            'contentSha256', claimed_row.content_sha256,
            'leaseToken', claimed_row.processing_lease_token,
            'attempt', claimed_row.processing_attempt,
            'leaseExpiresAt', claimed_row.processing_lease_expires_at
        );
    END IF;

    SELECT processing_status
      INTO current_status
      FROM public.knowledge_documents
     WHERE id = p_document_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    RETURN jsonb_build_object(
        'status', 'conflict',
        'currentStatus', current_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_knowledge_processing_lease(
    p_document_id uuid,
    p_lease_token uuid,
    p_lease_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    renewed_row record;
BEGIN
    IF p_lease_ttl_seconds IS NULL OR p_lease_ttl_seconds <= 0 THEN
        RAISE EXCEPTION 'processing lease TTL must be positive';
    END IF;

    UPDATE public.knowledge_documents
       SET processing_lease_expires_at = now() + make_interval(secs => p_lease_ttl_seconds)
     WHERE id = p_document_id
       AND processing_status = 'processing'
       AND processing_lease_token = p_lease_token
       AND processing_lease_expires_at > now()
     RETURNING processing_lease_token, processing_attempt, processing_lease_expires_at
      INTO renewed_row;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'renewed',
            'leaseToken', renewed_row.processing_lease_token,
            'attempt', renewed_row.processing_attempt,
            'leaseExpiresAt', renewed_row.processing_lease_expires_at
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.knowledge_documents WHERE id = p_document_id) THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'stale_lease');
END;
$$;

-- Replace the P5A eight-argument function with a nine-argument fenced form.
DROP FUNCTION IF EXISTS public.complete_knowledge_extraction(
    uuid, integer, jsonb, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.complete_knowledge_extraction(
    uuid, uuid, integer, jsonb, text, text, text, text, text
);

CREATE FUNCTION public.complete_knowledge_extraction(
    p_document_id uuid,
    p_lease_token uuid,
    p_page_count integer,
    p_pages jsonb,
    p_parser_name text,
    p_parser_version text,
    p_parser_options_hash text DEFAULT NULL,
    p_raw_artifact_path text DEFAULT NULL,
    p_expected_content_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    current_status text;
    current_sha text;
    current_token uuid;
    current_expiry timestamptz;
    distinct_pages integer;
    inserted_pages integer;
BEGIN
    SELECT processing_status, content_sha256, processing_lease_token, processing_lease_expires_at
      INTO current_status, current_sha, current_token, current_expiry
      FROM public.knowledge_documents
     WHERE id = p_document_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF current_status <> 'processing' THEN
        RETURN jsonb_build_object('status', 'conflict', 'currentStatus', current_status);
    END IF;

    IF current_token IS DISTINCT FROM p_lease_token THEN
        RETURN jsonb_build_object('status', 'conflict', 'currentStatus', current_status, 'reason', 'stale_lease');
    END IF;

    IF current_expiry IS NULL OR current_expiry <= now() THEN
        RETURN jsonb_build_object('status', 'conflict', 'currentStatus', current_status, 'reason', 'lease_expired');
    END IF;

    IF p_expected_content_sha256 IS NOT NULL AND p_expected_content_sha256 <> current_sha THEN
        RETURN jsonb_build_object('status', 'content_mismatch');
    END IF;

    IF p_pages IS NULL OR jsonb_typeof(p_pages) <> 'array' OR jsonb_array_length(p_pages) = 0 THEN
        RAISE EXCEPTION 'knowledge extraction requires at least one page';
    END IF;

    IF p_page_count IS NULL OR jsonb_array_length(p_pages) <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction page count % does not match % supplied pages',
            p_page_count, jsonb_array_length(p_pages);
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_pages)
            AS p(page_number integer, width_points double precision, height_points double precision)
         WHERE p.page_number IS NULL
            OR p.page_number < 1
            OR p.width_points IS NULL
            OR p.height_points IS NULL
            OR p.width_points <= 0
            OR p.height_points <= 0
    ) THEN
        RAISE EXCEPTION 'knowledge extraction pages require 1-based numbering and positive geometry';
    END IF;

    SELECT count(DISTINCT p.page_number)
      INTO distinct_pages
      FROM jsonb_to_recordset(p_pages) AS p(page_number integer);

    IF distinct_pages <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction contains duplicate page numbers';
    END IF;

    DELETE FROM public.knowledge_pages WHERE document_id = p_document_id;

    INSERT INTO public.knowledge_pages (
        document_id, page_number, width_points, height_points, rotation, text, text_hash
    )
    SELECT
        p_document_id,
        p.page_number,
        p.width_points,
        p.height_points,
        p.rotation,
        COALESCE(p.text, ''),
        p.text_hash
      FROM jsonb_to_recordset(p_pages)
        AS p(
            page_number integer,
            width_points double precision,
            height_points double precision,
            rotation double precision,
            text text,
            text_hash text
        );

    GET DIAGNOSTICS inserted_pages = ROW_COUNT;
    IF inserted_pages <> p_page_count THEN
        RAISE EXCEPTION 'knowledge extraction persisted % of % pages', inserted_pages, p_page_count;
    END IF;

    UPDATE public.knowledge_documents
       SET processing_status = 'ready',
           page_count = p_page_count,
           parser_name = p_parser_name,
           parser_version = p_parser_version,
           parser_options_hash = p_parser_options_hash,
           raw_artifact_path = p_raw_artifact_path,
           processing_error = NULL,
           processing_lease_token = NULL,
           processing_lease_expires_at = NULL
     WHERE id = p_document_id;

    RETURN jsonb_build_object('status', 'completed', 'pageCount', p_page_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_knowledge_extraction(
    p_document_id uuid,
    p_lease_token uuid,
    p_processing_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    current_token uuid;
    current_expiry timestamptz;
    current_status text;
BEGIN
    SELECT processing_status, processing_lease_token, processing_lease_expires_at
      INTO current_status, current_token, current_expiry
      FROM public.knowledge_documents
     WHERE id = p_document_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF current_status <> 'processing'
       OR current_token IS DISTINCT FROM p_lease_token
       OR current_expiry IS NULL
       OR current_expiry <= now() THEN
        RETURN jsonb_build_object('status', 'conflict', 'currentStatus', current_status, 'reason', 'stale_lease');
    END IF;

    UPDATE public.knowledge_documents
       SET processing_status = 'failed',
           processing_error = p_processing_error,
           raw_artifact_path = NULL,
           processing_lease_token = NULL,
           processing_lease_expires_at = NULL
     WHERE id = p_document_id;

    RETURN jsonb_build_object('status', 'failed');
END;
$$;

COMMENT ON FUNCTION public.claim_knowledge_extraction IS
    'Atomically claim or reclaim one Knowledge document with a database-time lease.';
COMMENT ON FUNCTION public.renew_knowledge_processing_lease IS
    'Renew the current unexpired Knowledge processing lease.';
COMMENT ON FUNCTION public.complete_knowledge_extraction IS
    'Atomically complete only the current unexpired Knowledge processing lease.';
COMMENT ON FUNCTION public.fail_knowledge_extraction IS
    'Fail only the current unexpired Knowledge processing lease.';

REVOKE ALL ON FUNCTION public.claim_knowledge_extraction(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_knowledge_processing_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_knowledge_extraction(uuid, uuid, integer, jsonb, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_knowledge_extraction(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_knowledge_extraction(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_knowledge_processing_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction(uuid, uuid, integer, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_knowledge_extraction(uuid, uuid, text) TO service_role;

-- SOURCE: supabase/migrations/20260823_add_knowledge_processing_candidates.sql
-- P5D database-time work discovery.
--
-- Discovery is not ownership. The P5C claim RPC remains the sole ownership
-- boundary, so multiple dispatchers may safely receive the same candidate.
CREATE OR REPLACE FUNCTION public.list_knowledge_processing_candidates(
    p_limit integer
)
RETURNS TABLE(document_id uuid)
LANGUAGE sql
SECURITY INVOKER
AS $$
    SELECT d.id
      FROM public.knowledge_documents AS d
     WHERE d.processing_status = 'uploaded'
        OR (
            d.processing_status = 'processing'
            AND (
                d.processing_lease_expires_at IS NULL
                OR d.processing_lease_expires_at <= now()
            )
        )
     ORDER BY d.created_at ASC, d.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 100);
$$;

COMMENT ON FUNCTION public.list_knowledge_processing_candidates IS
    'List only uploaded or database-time expired Knowledge documents for isolated dispatchers; does not claim work.';

REVOKE ALL ON FUNCTION public.list_knowledge_processing_candidates(integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_knowledge_processing_candidates(integer)
    TO service_role;

-- Post-flight assertions are part of the same transaction. Any failure rolls
-- back the entire rollout, including the bucket row and grants.
DO $postflight$
DECLARE
    expected_table_names constant text[] := ARRAY[
        'knowledge_documents',
        'knowledge_pages',
        'knowledge_chunks',
        'source_references'
    ];
    expected_rpc_names constant text[] := ARRAY[
        'complete_knowledge_extraction',
        'claim_knowledge_extraction',
        'renew_knowledge_processing_lease',
        'fail_knowledge_extraction',
        'list_knowledge_processing_candidates'
    ];
    object_name text;
    rpc record;
    public_execute boolean;
BEGIN
    FOREACH object_name IN ARRAY expected_table_names LOOP
        IF to_regclass(format('public.%I', object_name)) IS NULL THEN
            RAISE EXCEPTION
                'Knowledge rollout post-flight failed: public.% is missing',
                object_name;
        END IF;
    END LOOP;

    IF (
        SELECT count(*)
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY (expected_table_names)
          AND c.relkind = 'r'
          AND c.relrowsecurity
    ) <> 4 THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: RLS is not enabled on all four tables';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'knowledge-documents'
          AND name = 'knowledge-documents'
          AND public = false
    ) THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: private bucket is missing';
    END IF;

    IF (
        SELECT count(*)
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY (expected_rpc_names)
    ) <> 5 THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: expected Knowledge RPC set is incomplete';
    END IF;

    FOR rpc IN
        SELECT p.oid, p.proname, p.proacl, p.proowner, p.prosecdef
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY (expected_rpc_names)
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM aclexplode(
                COALESCE(rpc.proacl, acldefault('f', rpc.proowner))
            ) AS privilege
            WHERE privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
        )
        INTO public_execute;

        IF rpc.prosecdef
           OR public_execute
           OR has_function_privilege('anon', rpc.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', rpc.oid, 'EXECUTE')
           OR NOT has_function_privilege('service_role', rpc.oid, 'EXECUTE') THEN
            RAISE EXCEPTION
                'Knowledge rollout post-flight failed: privilege hardening failed for %',
                rpc.proname;
        END IF;
    END LOOP;

    IF (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_documents'
          AND column_name IN (
              'processing_lease_token',
              'processing_lease_expires_at',
              'processing_attempt'
          )
    ) <> 3 THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: lease columns are incomplete';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_pages'
          AND column_name IN ('width_points', 'height_points', 'rotation')
          AND column_default IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: page geometry has a default';
    END IF;

    IF to_regclass('public.knowledge_elements') IS NOT NULL THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: knowledge_elements must remain absent';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
    ) THEN
        RAISE EXCEPTION
            'Knowledge rollout post-flight failed: pgvector must not be introduced';
    END IF;
END
$postflight$;

COMMIT;
