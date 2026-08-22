import { createClient } from '@supabase/supabase-js';
import { validateKnowledgeQueryEmbeddingVector, validateKnowledgeSemanticSearchParameters } from '../../domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeSemanticSearchRepository,
  KnowledgeSemanticSearchRequest,
  KnowledgeSemanticSearchResult,
} from '../../domain/knowledge/knowledgeEmbedding';

interface SupabaseErrorLike { readonly message?: string; }
interface KnowledgeSearchRow { readonly chunk_id: string; readonly document_id: string; readonly original_filename: string; readonly page_start: number; readonly page_end: number; readonly chunk_index: number; readonly text: string; readonly source_locators: unknown; readonly similarity: number; }

export interface KnowledgeSemanticSearchSupabaseClient {
  rpc<TData = unknown>(
    fn: 'search_board_knowledge_chunks',
    args: Record<string, unknown>,
  ): Promise<{ data: TData | null; error: SupabaseErrorLike | null }>;
}

function vectorLiteral(vector: readonly number[]): string {
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('Knowledge search vector contains a non-finite value');
  return `[${vector.join(',')}]`;
}

export class SupabaseKnowledgeSemanticSearchRepository implements KnowledgeSemanticSearchRepository {
  constructor(private readonly client: KnowledgeSemanticSearchSupabaseClient) {}

  async searchBoardKnowledge(request: KnowledgeSemanticSearchRequest): Promise<readonly KnowledgeSemanticSearchResult[]> {
    validateKnowledgeSemanticSearchParameters(request.boardId, request.limit, request.minSimilarity);
    validateKnowledgeQueryEmbeddingVector(request.queryEmbedding, request.profile);
    const { data, error } = await this.client.rpc<readonly KnowledgeSearchRow[]>('search_board_knowledge_chunks', {
      p_board_id: request.boardId,
      p_query_embedding: vectorLiteral(request.queryEmbedding.embedding),
      p_model_id: request.profile.modelId,
      p_limit: request.limit,
      p_min_similarity: request.minSimilarity ?? null,
    });
    if (error) throw new Error('Could not search Knowledge chunks');
    return (data ?? []).map((row) => {
      if (!Number.isFinite(row.similarity)) throw new Error('Knowledge search returned a non-finite similarity');
      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        originalFilename: row.original_filename,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        chunkIndex: row.chunk_index,
        text: row.text,
        sourceLocators: row.source_locators,
        similarity: row.similarity,
      };
    });
  }
}

export function createKnowledgeSemanticSearchRepositoryFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SupabaseKnowledgeSemanticSearchRepository {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Knowledge search Supabase configuration is required');
  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return new SupabaseKnowledgeSemanticSearchRepository(client as unknown as KnowledgeSemanticSearchSupabaseClient);
}
