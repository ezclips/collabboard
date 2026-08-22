import { createClient } from '@supabase/supabase-js';
import { validateKnowledgeQueryEmbeddingVector, validateKnowledgeSemanticSearchParameters } from '../../domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeEmbeddingInput,
  KnowledgeEmbeddingProfile,
  KnowledgeEmbeddingRepository,
  KnowledgeEmbeddingState,
  KnowledgeEmbeddingVector,
  KnowledgeSemanticSearchRepository,
  KnowledgeSemanticSearchRequest,
  KnowledgeSemanticSearchResult,
} from '../../domain/knowledge/knowledgeEmbedding';

interface SupabaseErrorLike { readonly code?: string; readonly message?: string; }
interface KnowledgeChunkRow { readonly id: string; readonly text: string; readonly text_hash: string; }
interface KnowledgeEmbeddingStateRow { readonly chunk_id: string; readonly model_id: string; readonly dimensions: number; readonly chunk_text_hash: string; }
interface KnowledgeSearchRow { readonly chunk_id: string; readonly document_id: string; readonly original_filename: string; readonly page_start: number; readonly page_end: number; readonly chunk_index: number; readonly text: string; readonly source_locators: unknown; readonly similarity: number; }

interface Query<T> extends PromiseLike<{ data: readonly T[] | null; error: SupabaseErrorLike | null }> {
  eq(column: string, value: unknown): Query<T>;
  in(column: string, values: readonly unknown[]): Query<T>;
}

interface KnowledgeChunkTable { select(columns: string): Query<KnowledgeChunkRow>; }
interface KnowledgeEmbeddingTable {
  select(columns: string): Query<KnowledgeEmbeddingStateRow>;
  upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: SupabaseErrorLike | null }>;
}

export interface KnowledgeEmbeddingSupabaseClient {
  rpc<TData = unknown>(
    fn: 'list_knowledge_embedding_candidates' | 'search_board_knowledge_chunks',
    args: Record<string, unknown>,
  ): Promise<{ data: TData | null; error: SupabaseErrorLike | null }>;
  from(table: 'knowledge_chunks'): KnowledgeChunkTable;
  from(table: 'knowledge_chunk_embeddings'): KnowledgeEmbeddingTable;
}

function requireRows<T>(result: { data: readonly T[] | null; error: SupabaseErrorLike | null }, message: string): readonly T[] {
  if (result.error) throw new Error(message);
  return result.data ?? [];
}

function isDeletedChunkError(error: SupabaseErrorLike): boolean {
  return error.code === '23503';
}

function vectorLiteral(vector: readonly number[]): string {
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('Knowledge search vector contains a non-finite value');
  return `[${vector.join(',')}]`;
}

export class SupabaseKnowledgeEmbeddingRepository implements KnowledgeEmbeddingRepository, KnowledgeSemanticSearchRepository {
  constructor(private readonly client: KnowledgeEmbeddingSupabaseClient) {}

  async listCandidateDocumentIds(
    profile: KnowledgeEmbeddingProfile,
    limit: number,
    createdAfter?: string | null,
  ): Promise<readonly string[]> {
    const { data, error } = await this.client.rpc<readonly { document_id: string }[]>(
      'list_knowledge_embedding_candidates',
      { p_model_id: profile.modelId, p_dimensions: profile.dimensions, p_limit: limit, p_created_after: createdAfter ?? null },
    );
    if (error) throw new Error('Could not discover Knowledge embedding candidates');
    return (data ?? []).map((row) => row.document_id);
  }

  async listChunks(documentId: string): Promise<readonly KnowledgeEmbeddingInput[]> {
    const result = await this.client.from('knowledge_chunks').select('id,text,text_hash').eq('document_id', documentId);
    return requireRows(result, 'Could not load Knowledge chunks').map((row) => ({
      chunkId: row.id,
      text: row.text,
      textHash: row.text_hash,
    }));
  }

  async listEmbeddingStates(
    chunkIds: readonly string[],
    profile: KnowledgeEmbeddingProfile,
  ): Promise<readonly KnowledgeEmbeddingState[]> {
    if (chunkIds.length === 0) return [];
    const result = await this.client
      .from('knowledge_chunk_embeddings')
      .select('chunk_id,model_id,dimensions,chunk_text_hash')
      .eq('model_id', profile.modelId)
      .eq('dimensions', profile.dimensions)
      .in('chunk_id', chunkIds);
    return requireRows(result, 'Could not load Knowledge embedding states').map((row) => ({
      chunkId: row.chunk_id,
      modelId: row.model_id,
      dimensions: row.dimensions,
      chunkTextHash: row.chunk_text_hash,
    }));
  }

  async upsertEmbeddings(
    vectors: readonly KnowledgeEmbeddingVector[],
  ): Promise<{ readonly persisted: number; readonly skippedDeleted: number }> {
    let persisted = 0;
    let skippedDeleted = 0;
    for (const vector of vectors) {
      const embeddedAt = new Date().toISOString();
      const result = await this.client.from('knowledge_chunk_embeddings').upsert({
        chunk_id: vector.chunkId,
        model_id: vector.modelId,
        dimensions: vector.dimensions,
        embedding: vectorLiteral(vector.embedding),
        chunk_text_hash: vector.textHash,
        embedded_at: embeddedAt,
      }, { onConflict: 'chunk_id,model_id,dimensions' });
      if (!result.error) {
        persisted += 1;
      } else if (isDeletedChunkError(result.error)) {
        skippedDeleted += 1;
      } else {
        throw new Error('Could not persist Knowledge embeddings');
      }
    }
    return { persisted, skippedDeleted };
  }

  async searchBoardKnowledge(request: KnowledgeSemanticSearchRequest): Promise<readonly KnowledgeSemanticSearchResult[]> {
    validateKnowledgeSemanticSearchParameters(request.boardId, request.limit, request.minSimilarity);
    validateKnowledgeQueryEmbeddingVector(request.queryEmbedding, request.profile);
    const { data, error } = await this.client.rpc<readonly KnowledgeSearchRow[]>(
      'search_board_knowledge_chunks',
      {
        p_board_id: request.boardId,
        p_query_embedding: vectorLiteral(request.queryEmbedding.embedding),
        p_model_id: request.profile.modelId,
        p_limit: request.limit,
        p_min_similarity: request.minSimilarity ?? null,
      },
    );
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

export function createKnowledgeEmbeddingRepositoryFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SupabaseKnowledgeEmbeddingRepository {
  const url = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is required for the embedding worker');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the embedding worker');
  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return new SupabaseKnowledgeEmbeddingRepository(client as unknown as KnowledgeEmbeddingSupabaseClient);
}
