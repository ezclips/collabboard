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
