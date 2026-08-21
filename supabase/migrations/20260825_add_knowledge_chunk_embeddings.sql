-- P6I-A semantic embedding foundation.
-- Embeddings are derived rows and are deliberately separate from chunks so a
-- chunk can carry multiple model/dimension identities without changing its
-- retrieval provenance.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.knowledge_chunk_embeddings (
    chunk_id uuid NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
    model_id text NOT NULL,
    dimensions integer NOT NULL,
    embedding extensions.vector NOT NULL,
    chunk_text_hash text NOT NULL,
    embedded_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT knowledge_chunk_embeddings_pkey PRIMARY KEY (chunk_id, model_id, dimensions),
    CONSTRAINT knowledge_chunk_embeddings_dimensions_check CHECK (dimensions > 0),
    CONSTRAINT knowledge_chunk_embeddings_vector_dimensions_check
        CHECK (extensions.vector_dims(embedding) = dimensions),
    CONSTRAINT knowledge_chunk_embeddings_model_id_check
        CHECK (char_length(model_id) BETWEEN 1 AND 128)
);

ALTER TABLE public.knowledge_chunk_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.knowledge_chunk_embeddings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_chunk_embeddings TO service_role;

CREATE FUNCTION public.list_knowledge_embedding_candidates(
    p_model_id text,
    p_dimensions integer,
    p_limit integer DEFAULT 16,
    p_created_after timestamptz DEFAULT NULL
)
RETURNS TABLE(document_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
    SELECT d.id
      FROM public.knowledge_documents AS d
      JOIN public.knowledge_chunks AS c ON c.document_id = d.id
      LEFT JOIN public.knowledge_chunk_embeddings AS e
        ON e.chunk_id = c.id
       AND e.model_id = p_model_id
       AND e.dimensions = p_dimensions
     WHERE d.processing_status = 'ready'
       AND (p_created_after IS NULL OR d.created_at >= p_created_after)
       AND (e.chunk_id IS NULL OR e.chunk_text_hash <> c.text_hash)
     GROUP BY d.id, d.created_at
     ORDER BY d.created_at ASC, d.id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 16), 1), 100);
$$;

COMMENT ON FUNCTION public.list_knowledge_embedding_candidates IS
    'Discover ready documents with missing or stale embeddings for one model and dimension.';

CREATE FUNCTION public.search_board_knowledge_chunks(
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
    )
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
     WHERE p_min_similarity IS NULL
        OR 1 - (candidates.embedding <=> p_query_embedding) >= p_min_similarity
     ORDER BY similarity DESC, candidates.chunk_index ASC, candidates.chunk_id ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

COMMENT ON FUNCTION public.search_board_knowledge_chunks IS
    'Search current same-model embeddings for one board without returning vectors.';

REVOKE ALL ON FUNCTION public.list_knowledge_embedding_candidates(text, integer, integer, timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_knowledge_embedding_candidates(text, integer, integer, timestamptz)
    TO service_role;

REVOKE ALL ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_board_knowledge_chunks(uuid, extensions.vector, text, integer, double precision)
    TO service_role;
