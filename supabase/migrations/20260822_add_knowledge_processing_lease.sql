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
