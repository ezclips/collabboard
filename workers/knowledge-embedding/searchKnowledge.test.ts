import { describe, expect, it, vi } from 'vitest';
import { searchKnowledge } from './searchKnowledge';

const profile = { model: 'voyageai/voyage-4-nano', modelId: 'local:voyage-4-nano', dimensions: 3 };
const result = { chunkId: 'chunk-1', documentId: 'document-1', originalFilename: 'manual.pdf', pageStart: 1, pageEnd: 1, chunkIndex: 0, text: 'text', sourceLocators: [], similarity: 0.8 };

describe('searchKnowledge orchestration', () => {
  it('embeds a query once, searches once, and preserves ranked provenance without persistence', async () => {
    const provider = { embedQuery: vi.fn(async () => ({ modelId: profile.modelId, dimensions: 3, embedding: [1, 0, 0] })) };
    const repository = { searchBoardKnowledge: vi.fn(async () => [result]), upsertEmbeddings: vi.fn() };
    await expect(searchKnowledge({ query: 'find recovery', boardId: 'board-1', profile, provider, repository, limit: 10, minSimilarity: null })).resolves.toEqual([result]);
    expect(provider.embedQuery).toHaveBeenCalledTimes(1);
    expect(repository.searchBoardKnowledge).toHaveBeenCalledTimes(1);
    expect(repository.upsertEmbeddings).not.toHaveBeenCalled();
    expect(repository.searchBoardKnowledge).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'board-1', limit: 10, minSimilarity: null }));
  });

  it('validates query/search inputs before calling the provider', async () => {
    const provider = { embedQuery: vi.fn() };
    const repository = { searchBoardKnowledge: vi.fn() };
    for (const options of [
      { query: '   ', boardId: 'board-1', limit: 1 },
      { query: 'valid', boardId: '', limit: 1 },
      { query: 'valid', boardId: 'board-1', limit: 0 },
      { query: 'valid', boardId: 'board-1', limit: 1, minSimilarity: Number.NaN },
    ]) {
      await expect(searchKnowledge({ ...options, profile, provider, repository })).rejects.toThrow();
    }
    expect(provider.embedQuery).not.toHaveBeenCalled();
    expect(repository.searchBoardKnowledge).not.toHaveBeenCalled();
  });
});
