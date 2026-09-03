-- CollabBoard PDF-R1 derivative render lifecycle production rollout.
--
-- SOURCE: supabase/migrations/20260903120000_add_knowledge_derivative_render_lifecycle.sql
-- The DDL, functions and grants below are an exact copy of that reviewed
-- migration. Nothing is improved, reordered or extended here; this file only
-- adds the preflight that makes it safe to run once against production.
--
-- Run this file as one PostgreSQL statement batch. It is intentionally not a
-- Supabase CLI migration and it deliberately carries only this one change:
-- 20260902120000_create_board_ai_chat.sql is NOT part of this rollout.
--
-- What it does NOT touch: extraction lifecycle state or functions,
-- knowledge_pages, storage buckets, storage policies, or any row of user data.

BEGIN;

-- Fail before any schema or privilege mutation unless production is in one of
-- exactly two recognised states.
--
--   PRE-R1   none of the seven lifecycle columns exist          -> apply
--   POST-R1  all seven exist AND all five RPCs exist            -> re-apply
--            (every statement below is idempotent, so this converges)
--   anything else                                               -> ABORT
--
-- A partially applied schema is never repaired automatically: the operator is
-- told exactly what was found and decides.
DO $preflight$
DECLARE
    lifecycle_columns constant text[] := ARRAY[
        'derivatives_requested_at',
        'derivatives_rendered_at',
        'derivatives_renderer_version',
        'derivatives_lease_token',
        'derivatives_lease_expires_at',
        'derivatives_error',
        'derivatives_attempt'
    ];
    lifecycle_rpcs constant text[] := ARRAY[
        'request_knowledge_page_render',
        'list_knowledge_render_candidates',
        'claim_knowledge_page_render',
        'complete_knowledge_page_render',
        'fail_knowledge_page_render'
    ];
    -- The exact mutable column set this rollout restores UPDATE on. The
    -- privilege step below withdraws the table-wide grant and hands back
    -- precisely these, so if production carries a column this list does not
    -- know about, that column would silently LOSE its privilege.
    expected_columns constant text[] := ARRAY[
        'id', 'board_id', 'created_by', 'kind', 'original_filename', 'mime_type',
        'file_size_bytes', 'storage_path', 'content_sha256', 'page_count',
        'processing_status', 'processing_error', 'parser_name', 'parser_version',
        'parser_options_hash', 'raw_artifact_path', 'created_at', 'updated_at',
        'processing_lease_token', 'processing_lease_expires_at', 'processing_attempt'
    ];
    present_columns integer;
    present_rpcs integer;
    actual_columns text[];
    unexpected text[];
    missing text[];
BEGIN
    IF to_regclass('public.knowledge_documents') IS NULL THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: public.knowledge_documents is missing';
    END IF;
    IF to_regclass('public.knowledge_pages') IS NULL THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: public.knowledge_pages is missing';
    END IF;

    SELECT count(*) INTO present_columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND column_name = ANY (lifecycle_columns);

    SELECT count(*) INTO present_rpcs
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (lifecycle_rpcs);

    IF present_columns NOT IN (0, 7) THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: partially applied schema, % of 7 lifecycle columns present',
            present_columns;
    END IF;

    IF present_columns = 7 AND present_rpcs <> 5 THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: lifecycle columns present but % of 5 RPCs found',
            present_rpcs;
    END IF;

    IF present_columns = 0 AND present_rpcs <> 0 THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: % lifecycle RPCs exist without their columns',
            present_rpcs;
    END IF;

    -- The privilege restoration is only safe against a known column set.
    SELECT array_agg(column_name ORDER BY column_name) INTO actual_columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'knowledge_documents'
       AND NOT (column_name = ANY (lifecycle_columns));

    SELECT array_agg(c) INTO unexpected
      FROM unnest(actual_columns) AS c
     WHERE NOT (c = ANY (expected_columns));

    SELECT array_agg(c) INTO missing
      FROM unnest(expected_columns) AS c
     WHERE NOT (c = ANY (actual_columns));

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: expected knowledge_documents columns are missing: %',
            array_to_string(missing, ', ');
    END IF;

    IF unexpected IS NOT NULL THEN
        RAISE EXCEPTION
            'PDF-R1 rollout preflight failed: knowledge_documents has unknown columns that the privilege restore would strip: %',
            array_to_string(unexpected, ', ');
    END IF;

    IF present_columns = 7 THEN
        RAISE NOTICE
            'PDF-R1 rollout: already applied; re-running the idempotent statements to converge state.';
    ELSE
        RAISE NOTICE 'PDF-R1 rollout: pre-R1 state confirmed; applying.';
    END IF;
END
$preflight$;

-- SOURCE: supabase/migrations/20260903120000_add_knowledge_derivative_render_lifecycle.sql
--
-- Knowledge PDF derivative render lifecycle.
--
-- A SECOND, fully separate lifecycle beside extraction. It exists because
-- rasterisation is worker-only (PDF.js may not enter the Next.js tree) while a
-- `ready` document is deliberately invisible to the extraction dispatcher --
-- so a document that finished its text but never got page images has, until
-- now, no way back to a renderer.
--
-- The one rule that governs every function below: this lifecycle owns ONLY the
-- derived page visuals. It never reads, writes or reasons about
-- processing_status, processing_error, processing_attempt, raw_artifact_path
-- or knowledge_pages.

ALTER TABLE public.knowledge_documents
    ADD COLUMN IF NOT EXISTS derivatives_requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_rendered_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_renderer_version text,
    ADD COLUMN IF NOT EXISTS derivatives_lease_token uuid,
    ADD COLUMN IF NOT EXISTS derivatives_lease_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_error text,
    ADD COLUMN IF NOT EXISTS derivatives_attempt integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS knowledge_documents_derivative_requests_idx
    ON public.knowledge_documents(derivatives_requested_at)
    WHERE derivatives_requested_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_knowledge_page_render(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    doc record;
    caller uuid := auth.uid();
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT d.id, d.board_id, d.processing_status, d.page_count,
           d.derivatives_rendered_at, d.derivatives_renderer_version
      INTO doc
      FROM public.knowledge_documents AS d
     WHERE d.id = p_document_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Readability is re-proved here, not inherited from the caller.
    IF NOT EXISTS (
        SELECT 1 FROM public.boards AS b
         WHERE b.id = doc.board_id AND b.user_id = caller
    ) AND NOT public.is_board_member(doc.board_id, caller) THEN
        -- Indistinguishable from a document that does not exist.
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Only a text-complete document has pages worth rendering, and only this
    -- state guarantees the request can never disturb an extraction in flight.
    IF doc.processing_status <> 'ready' THEN
        RETURN jsonb_build_object('status', 'not_ready');
    END IF;

    UPDATE public.knowledge_documents
       SET derivatives_requested_at = now(),
           -- A fresh request clears the last failure so the UI stops offering
           -- a stale error; the attempt counter is deliberately NOT reset.
           derivatives_error = NULL
     WHERE id = p_document_id;

    RETURN jsonb_build_object('status', 'requested');
END;
$$;

COMMENT ON FUNCTION public.request_knowledge_page_render IS
    'Read-authorized request to (re)render a ready document''s page visuals. Never touches extraction state.';

CREATE OR REPLACE FUNCTION public.list_knowledge_render_candidates(
    p_renderer_version text,
    p_limit integer DEFAULT 16
)
RETURNS TABLE(document_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT d.id
      FROM public.knowledge_documents AS d
     WHERE d.processing_status = 'ready'
       AND d.derivatives_requested_at IS NOT NULL
       AND (d.derivatives_lease_expires_at IS NULL OR d.derivatives_lease_expires_at <= now())
       AND (
            d.derivatives_rendered_at IS NULL
         OR d.derivatives_rendered_at < d.derivatives_requested_at
         OR d.derivatives_renderer_version IS DISTINCT FROM p_renderer_version
       )
     ORDER BY d.derivatives_requested_at ASC, d.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 16), 1), 100);
$$;

COMMENT ON FUNCTION public.list_knowledge_render_candidates IS
    'Ready documents with an outstanding, unleased page-visual render request.';

CREATE OR REPLACE FUNCTION public.claim_knowledge_page_render(
    p_document_id uuid,
    p_renderer_version text,
    p_lease_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    claimed record;
BEGIN
    IF p_lease_ttl_seconds IS NULL OR p_lease_ttl_seconds <= 0 THEN
        RAISE EXCEPTION 'derivative lease TTL must be positive';
    END IF;

    UPDATE public.knowledge_documents
       SET derivatives_lease_token = gen_random_uuid(),
           derivatives_lease_expires_at = now() + make_interval(secs => p_lease_ttl_seconds),
           derivatives_attempt = derivatives_attempt + 1
     WHERE id = p_document_id
       -- Extraction state is READ to confirm the document is text-complete;
       -- it is never written by this lifecycle.
       AND processing_status = 'ready'
       AND derivatives_requested_at IS NOT NULL
       AND (derivatives_lease_expires_at IS NULL OR derivatives_lease_expires_at <= now())
       AND (
            derivatives_rendered_at IS NULL
         OR derivatives_rendered_at < derivatives_requested_at
         OR derivatives_renderer_version IS DISTINCT FROM p_renderer_version
       )
    RETURNING id, board_id, storage_path, content_sha256, page_count,
              derivatives_lease_token, derivatives_attempt
         INTO claimed;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unavailable');
    END IF;

    RETURN jsonb_build_object(
        'status', 'claimed',
        'documentId', claimed.id,
        'boardId', claimed.board_id,
        'storagePath', claimed.storage_path,
        'contentSha256', claimed.content_sha256,
        'pageCount', claimed.page_count,
        'leaseToken', claimed.derivatives_lease_token,
        'attempt', claimed.derivatives_attempt
    );
END;
$$;

COMMENT ON FUNCTION public.claim_knowledge_page_render IS
    'Atomically lease one ready document for page-visual rendering. Never mutates extraction state.';

CREATE OR REPLACE FUNCTION public.complete_knowledge_page_render(
    p_document_id uuid,
    p_lease_token uuid,
    p_renderer_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    UPDATE public.knowledge_documents
       SET derivatives_rendered_at = now(),
           derivatives_renderer_version = p_renderer_version,
           derivatives_requested_at = NULL,
           derivatives_lease_token = NULL,
           derivatives_lease_expires_at = NULL,
           derivatives_error = NULL
     WHERE id = p_document_id
       AND derivatives_lease_token = p_lease_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'lease_lost');
    END IF;
    RETURN jsonb_build_object('status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_knowledge_page_render(
    p_document_id uuid,
    p_lease_token uuid,
    p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    UPDATE public.knowledge_documents
       SET derivatives_requested_at = NULL,
           derivatives_lease_token = NULL,
           derivatives_lease_expires_at = NULL,
           -- Bounded and low-cardinality by contract; the caller passes a
           -- reason code, never a raw driver or Storage message.
           derivatives_error = left(coalesce(p_error, 'render_failed'), 200)
     WHERE id = p_document_id
       AND derivatives_lease_token = p_lease_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'lease_lost');
    END IF;
    RETURN jsonb_build_object('status', 'failed');
END;
$$;

-- The request is the ONLY derivative function a browser session may call, and
-- it proves readability itself. Everything else is worker lifecycle.
REVOKE ALL ON FUNCTION public.request_knowledge_page_render(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_knowledge_page_render(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_knowledge_render_candidates(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_knowledge_page_render(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_knowledge_page_render(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_knowledge_page_render(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_knowledge_render_candidates(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_knowledge_page_render(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_knowledge_page_render(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_knowledge_page_render(uuid, uuid, text) TO service_role;

-- ORDER MATTERS. A column-level REVOKE is a no-op while a table-level UPDATE
-- grant stands, so the blanket grant is withdrawn FIRST and the pre-existing
-- columns are then granted back by name. The preflight above has already
-- proved that this list is exactly the non-derivative column set, so nothing
-- loses a privilege it had before.
REVOKE UPDATE ON public.knowledge_documents FROM anon, authenticated;

GRANT UPDATE (
    id, board_id, created_by, kind, original_filename, mime_type,
    file_size_bytes, storage_path, content_sha256, page_count,
    processing_status, processing_error, parser_name, parser_version,
    parser_options_hash, raw_artifact_path, created_at, updated_at,
    processing_lease_token, processing_lease_expires_at, processing_attempt
) ON public.knowledge_documents TO authenticated;

COMMIT;
