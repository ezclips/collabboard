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
