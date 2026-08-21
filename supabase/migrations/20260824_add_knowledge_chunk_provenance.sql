-- P6H spatial chunk provenance. Chunks remain the canonical derived retrieval
-- unit; durable citations remain in source_references and are not coupled to a
-- chunk row identity.

ALTER TABLE public.knowledge_chunks
    ADD COLUMN IF NOT EXISTS source_locators jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'knowledge_chunks_source_locators_array_check'
           AND conrelid = 'public.knowledge_chunks'::regclass
    ) THEN
        ALTER TABLE public.knowledge_chunks
            ADD CONSTRAINT knowledge_chunks_source_locators_array_check
            CHECK (jsonb_typeof(source_locators) = 'array');
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.complete_knowledge_extraction(
    uuid, uuid, integer, jsonb, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.complete_knowledge_extraction(
    uuid, uuid, integer, jsonb, jsonb, text, text, text, text, text
);

CREATE FUNCTION public.complete_knowledge_extraction(
    p_document_id uuid,
    p_lease_token uuid,
    p_page_count integer,
    p_pages jsonb,
    p_chunks jsonb,
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
    distinct_chunks bigint;
    max_chunk_index integer;
    inserted_chunks integer;
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

    IF p_chunks IS NULL OR jsonb_typeof(p_chunks) <> 'array' THEN
        RAISE EXCEPTION 'knowledge extraction chunks must be a JSON array';
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

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_chunks)
            AS c(
                page_start integer,
                page_end integer,
                text text,
                char_start integer,
                char_end integer,
                text_hash text,
                chunk_index integer,
                source_locators jsonb
            )
         WHERE c.page_start IS NULL
            OR c.page_end IS NULL
            OR c.page_start < 1
            OR c.page_end <> c.page_start
            OR c.page_end > p_page_count
            OR c.text IS NULL
            OR c.text_hash IS NULL
            OR c.chunk_index IS NULL
            OR c.chunk_index < 0
            OR c.source_locators IS NULL
            OR jsonb_typeof(c.source_locators) <> 'array'
            OR (c.char_start IS NULL AND c.char_end IS NOT NULL)
            OR (c.char_start IS NOT NULL AND c.char_end IS NULL)
            OR (c.char_start IS NOT NULL AND (c.char_start < 0 OR c.char_end < c.char_start))
    ) THEN
        RAISE EXCEPTION 'knowledge extraction contains malformed chunk payload';
    END IF;

    SELECT count(DISTINCT c.chunk_index), max(c.chunk_index)
      INTO distinct_chunks, max_chunk_index
      FROM jsonb_to_recordset(p_chunks) AS c(chunk_index integer);

    IF distinct_chunks <> jsonb_array_length(p_chunks)
       OR (jsonb_array_length(p_chunks) > 0 AND max_chunk_index <> jsonb_array_length(p_chunks) - 1) THEN
        RAISE EXCEPTION 'knowledge extraction chunk indexes must be unique and contiguous';
    END IF;

    DELETE FROM public.knowledge_chunks WHERE document_id = p_document_id;
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

    INSERT INTO public.knowledge_chunks (
        document_id, page_start, page_end, text, char_start, char_end,
        text_hash, chunk_index, source_locators
    )
    SELECT
        p_document_id,
        c.page_start,
        c.page_end,
        c.text,
        c.char_start,
        c.char_end,
        c.text_hash,
        c.chunk_index,
        c.source_locators
      FROM jsonb_to_recordset(p_chunks)
        AS c(
            page_start integer,
            page_end integer,
            text text,
            char_start integer,
            char_end integer,
            text_hash text,
            chunk_index integer,
            source_locators jsonb
        );

    GET DIAGNOSTICS inserted_chunks = ROW_COUNT;
    IF inserted_chunks <> jsonb_array_length(p_chunks) THEN
        RAISE EXCEPTION 'knowledge extraction persisted % of % chunks', inserted_chunks, jsonb_array_length(p_chunks);
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

COMMENT ON FUNCTION public.complete_knowledge_extraction IS
    'Atomically complete the current Knowledge extraction lease with pages and derived chunks.';

REVOKE ALL ON FUNCTION public.complete_knowledge_extraction(
    uuid, uuid, integer, jsonb, jsonb, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction(
    uuid, uuid, integer, jsonb, jsonb, text, text, text, text, text
) TO service_role;
