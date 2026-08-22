import { describe, expect, it, vi } from 'vitest';
import { SupabaseKnowledgeSemanticSearchRepository } from './knowledgeSemanticSearchAdapters';
import type { KnowledgeSemanticSearchSupabaseClient } from './knowledgeSemanticSearchAdapters';

const profile = { model: 'voyageai/voyage-4-nano', modelId: 'local:voyage-4-nano', dimensions: 3 };
const queryEmbedding = { modelId: profile.modelId, dimensions: 3, embedding: [1, 0, 0] };

function clientWithRpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
    from: vi.fn(),
  } as unknown as KnowledgeSemanticSearchSupabaseClient;
}

describe('Supabase semantic knowledge search adapter', () => {
  it('calls the board search RPC and maps provenance without exposing vectors', async () => {
    const client = clientWithRpc([{
      chunk_id: 'chunk-1', document_id: 'document-1', original_filename: 'manual.pdf',
      page_start: 2, page_end: 3, chunk_index: 4, text: 'recovery text',
      source_locators: [{ pageNumber: 2, bbox: { left: 1 } }], similarity: 0.91,
    }]);
    const result = await new SupabaseKnowledgeSemanticSearchRepository(client).searchBoardKnowledge({
      boardId: 'board-1', queryEmbedding, profile, limit: 10, minSimilarity: 0.5,
    });
    expect(client.rpc).toHaveBeenCalledWith('search_board_knowledge_chunks', {
      p_board_id: 'board-1', p_query_embedding: '[1,0,0]', p_model_id: profile.modelId,
      p_limit: 10, p_min_similarity: 0.5,
    });
    expect(result).toEqual([{
      chunkId: 'chunk-1', documentId: 'document-1', originalFilename: 'manual.pdf',
      pageStart: 2, pageEnd: 3, chunkIndex: 4, text: 'recovery text',
      sourceLocators: [{ pageNumber: 2, bbox: { left: 1 } }], similarity: 0.91,
    }]);
    expect(result[0]).not.toHaveProperty('embedding');
  });

  it('rejects invalid search bounds, vectors, and raw RPC errors safely', async () => {
    const client = clientWithRpc([]);
    const repository = new SupabaseKnowledgeSemanticSearchRepository(client);
    await expect(repository.searchBoardKnowledge({ boardId: '', queryEmbedding, profile, limit: 1 })).rejects.toThrow();
    await expect(repository.searchBoardKnowledge({ boardId: 'board-1', queryEmbedding, profile, limit: 51 })).rejects.toThrow();
    await expect(repository.searchBoardKnowledge({ boardId: 'board-1', queryEmbedding, profile, limit: 1, minSimilarity: 2 })).rejects.toThrow();
    await expect(repository.searchBoardKnowledge({ boardId: 'board-1', queryEmbedding: { ...queryEmbedding, embedding: [1, 2] }, profile, limit: 1 })).rejects.toThrow();
    const failed = new SupabaseKnowledgeSemanticSearchRepository(clientWithRpc(null, { message: 'secret database detail' }));
    await expect(failed.searchBoardKnowledge({ boardId: 'board-1', queryEmbedding, profile, limit: 1 })).rejects.toThrow('Could not search Knowledge chunks');
  });
});
