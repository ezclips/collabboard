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
-- or knowledge_pages. Reusing claim_knowledge_extraction would have done all of
-- those, which is exactly why these columns are new rather than borrowed.

ALTER TABLE public.knowledge_documents
    ADD COLUMN IF NOT EXISTS derivatives_requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_rendered_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_renderer_version text,
    ADD COLUMN IF NOT EXISTS derivatives_lease_token uuid,
    ADD COLUMN IF NOT EXISTS derivatives_lease_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS derivatives_error text,
    ADD COLUMN IF NOT EXISTS derivatives_attempt integer NOT NULL DEFAULT 0;

-- Candidate discovery reads exactly this shape: requested, ready, unleased.
CREATE INDEX IF NOT EXISTS knowledge_documents_derivative_requests_idx
    ON public.knowledge_documents(derivatives_requested_at)
    WHERE derivatives_requested_at IS NOT NULL;

/* ------------------------------------------------------------------ */
/* REQUEST -- called by an authenticated reader, never by the worker    */
/* ------------------------------------------------------------------ */

/**
 * Ask for this document's page visuals to be (re)rendered.
 *
 * SECURITY DEFINER, so it proves board readability itself rather than trusting
 * the route that called it: owner OR is_board_member, the same authority the
 * Knowledge read routes use. A viewer qualifies -- recovering a derived image
 * of a document you may already read is not a board mutation.
 *
 * Idempotent: asking twice while a request is outstanding refreshes the
 * timestamp and nothing else. It cannot start work, choose a path, choose a
 * renderer, or touch any extraction field.
 */
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

/* ------------------------------------------------------------------ */
/* WORKER AUTHORITIES                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ready documents whose page visuals are wanted.
 *
 * Deliberately a separate function from list_knowledge_processing_candidates:
 * that one must keep returning only 'uploaded' and lease-expired 'processing'
 * rows, so a ready document can never re-enter extraction.
 *
 * A document qualifies when a request is outstanding, no live derivative lease
 * exists, and the visuals are genuinely absent or stale -- never rendered, or
 * rendered before the current request, or rendered by an older renderer.
 */
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

/**
 * Take exclusive ownership of one document's render.
 *
 * One UPDATE with the eligibility predicate in its WHERE clause is the whole
 * exclusivity argument: two workers racing here both run the same statement,
 * and row locking means only one of them can observe the pre-claim state, so
 * only one gets a token back. Idempotent Storage upsert is defence in depth
 * behind this, never the primary mechanism.
 */
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

/**
 * Finish a render. Only the lease holder may.
 *
 * `derivatives_requested_at` is cleared so the document stops being a
 * candidate, and the renderer version is recorded so a later version makes it
 * eligible again without anyone having to remember to ask.
 */
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

/**
 * Record a failed render. Only the lease holder may.
 *
 * The document stays `ready` and keeps every knowledge_pages row: a missing
 * picture is not a reason to invalidate text that is already correct. The
 * request is cleared so the worker does not hot-loop; a later explicit request
 * from a reader sets it again, which is what makes Retry meaningful.
 */
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

/* ------------------------------------------------------------------ */
/* PRIVILEGES                                                           */
/* ------------------------------------------------------------------ */

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

-- The new columns are lifecycle bookkeeping, never client-writable: a browser
-- must not be able to forge a lease, a render time or a renderer version.
--
-- ORDER MATTERS. A column-level REVOKE is a no-op while a table-level UPDATE
-- grant stands, so the blanket grant is withdrawn FIRST and the pre-existing
-- columns are then granted back by name. The result is exactly the privileges
-- that existed before this migration, minus the seven columns above -- which
-- only the service-role functions may write.
REVOKE UPDATE ON public.knowledge_documents FROM anon, authenticated;

GRANT UPDATE (
    id, board_id, created_by, kind, original_filename, mime_type,
    file_size_bytes, storage_path, content_sha256, page_count,
    processing_status, processing_error, parser_name, parser_version,
    parser_options_hash, raw_artifact_path, created_at, updated_at,
    processing_lease_token, processing_lease_expires_at, processing_attempt
) ON public.knowledge_documents TO authenticated;
