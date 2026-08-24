-- P6J-E2: semantic Knowledge results represent SOURCES, not raw chunks.
--
-- The previous body ranked and limited CHUNK rows, so a single long PDF could
-- own every returned slot and no downstream layer could recover the documents
-- SQL never returned. Document selection therefore has to happen here, before
-- LIMIT: this is the only layer that sees the complete qualifying candidate set
-- and can guarantee "requested limit = up to that many unique documents".
--
-- Signature, return shape, filters, threshold semantics and grants are all
-- unchanged. Only the unit of ranking becomes the document. The threshold is
-- still applied to chunk similarity, and still before a document's winner is
-- chosen, so a document represented in the results always has a chunk at or
-- above p_min_similarity.

CREATE OR REPLACE FUNCTION public.search_board_knowledge_chunks(
    p_board_id uuid,
    p_query_embedding extensions.vector,
    p_model_id text,
    p_limit integer DEFAULT 10,
    p_min_similarity double precision DEFAULT NULL
)
RETURNS TABLE(
    chunk_id uuid,
    document_id uuid,
    original_filename text,
    page_start integer,
    page_end integer,
    chunk_index integer,
    text text,
    source_locators jsonb,
    similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
    WITH candidates AS MATERIALIZED (
        SELECT
            e.chunk_id,
            c.document_id,
            d.original_filename,
            c.page_start,
            c.page_end,
            c.chunk_index,
            c.text,
            c.source_locators,
            e.embedding
          FROM public.knowledge_chunk_embeddings AS e
          JOIN public.knowledge_chunks AS c ON c.id = e.chunk_id
          JOIN public.knowledge_documents AS d ON d.id = c.document_id
         WHERE d.board_id = p_board_id
           AND d.processing_status = 'ready'
           AND e.model_id = p_model_id
           AND e.dimensions = extensions.vector_dims(p_query_embedding)
           AND e.chunk_text_hash = c.text_hash
    ),
    scored AS (
        SELECT
            candidates.chunk_id,
            candidates.document_id,
            candidates.original_filename,
            candidates.page_start,
            candidates.page_end,
            candidates.chunk_index,
            candidates.text,
            candidates.source_locators,
            1 - (candidates.embedding <=> p_query_embedding) AS similarity
          FROM candidates
    ),
    qualified AS (
        SELECT scored.*
          FROM scored
         WHERE p_min_similarity IS NULL
            OR scored.similarity >= p_min_similarity
    ),
    best_per_document AS (
        SELECT
            qualified.*,
            ROW_NUMBER() OVER (
                PARTITION BY qualified.document_id
                ORDER BY qualified.similarity DESC, qualified.chunk_index ASC, qualified.chunk_id ASC
            ) AS document_rank
          FROM qualified
    )
    SELECT
        best_per_document.chunk_id,
        best_per_document.document_id,
        best_per_document.original_filename,
        best_per_document.page_start,
        best_per_document.page_end,
        best_per_document.chunk_index,
        best_per_document.text,
        best_per_document.source_locators,
        best_per_document.similarity
      FROM best_per_document
     WHERE best_per_document.document_rank = 1
     ORDER BY best_per_document.similarity DESC, best_per_document.chunk_index ASC, best_per_document.chunk_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks IS
    'Search current same-model embeddings for one board and return the best qualifying chunk per document, without returning vectors.';

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)
    TO service_role;
