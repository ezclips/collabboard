import { describe, expect, it } from 'vitest';
import { assertLocalTeiUrl } from '../../lib/infra/knowledge/localTeiEmbeddingProvider';
import { summarizeQuerySmokeResults, validateQuerySmokeConfig } from './querySmoke';

const result = (documentId: string, similarity: number) => ({
  chunkId: 'chunk', documentId, originalFilename: 'file.pdf', pageStart: 1, pageEnd: 1,
  chunkIndex: 0, text: 'text', sourceLocators: [], similarity,
});
const config = {
  provider: 'local-tei', teiUrl: 'http://127.0.0.1:8080', model: 'voyageai/voyage-4-nano',
  modelId: 'local:voyage-4-nano', dimensions: 1024, query: 'recovery', boardId: 'board',
  expectedDocumentId: 'expected', forbiddenDocumentId: 'forbidden',
};

describe('query smoke safety contract', () => {
  it('passes only when expected is present and forbidden is absent', () => {
    expect(summarizeQuerySmokeResults([result('expected', 0.9)], 'expected', 'forbidden').pass).toBe(true);
    expect(summarizeQuerySmokeResults([], 'expected', 'forbidden').pass).toBe(false);
    expect(summarizeQuerySmokeResults([result('other', 0.9)], 'expected', 'forbidden').pass).toBe(false);
    expect(summarizeQuerySmokeResults([result('expected', 0.9), result('forbidden', 0.9)], 'expected', 'forbidden').pass).toBe(false);
  });

  it('buckets similarity safely and exposes only approved fields', () => {
    expect(summarizeQuerySmokeResults([result('expected', 0.75)], 'expected', 'forbidden').topSimilarityBucket).toBe('high');
    expect(summarizeQuerySmokeResults([result('expected', 0.5)], 'expected', 'forbidden').topSimilarityBucket).toBe('medium');
    expect(summarizeQuerySmokeResults([result('expected', 0.49)], 'expected', 'forbidden').topSimilarityBucket).toBe('low');
    expect(summarizeQuerySmokeResults([], 'expected', 'forbidden').topSimilarityBucket).toBe('low');
    expect(Object.keys(summarizeQuerySmokeResults([result('expected', 0.91)], 'expected', 'forbidden')).sort()).toEqual([
      'event', 'expectedDocumentFound', 'forbiddenDocumentPresent', 'pass', 'resultCount', 'teiReady', 'topSimilarityBucket',
    ].sort());
  });

  it('fails closed for configuration and public TEI URLs', () => {
    expect(validateQuerySmokeConfig(config)).toEqual(config);
    for (const override of [
      { provider: 'openai' }, { model: 'wrong' }, { modelId: 'wrong:id' }, { dimensions: 1536 },
      { query: '' }, { boardId: '' }, { expectedDocumentId: 'forbidden' },
    ]) expect(() => validateQuerySmokeConfig({ ...config, ...override })).toThrow();
    expect(() => assertLocalTeiUrl('http://example.com:8080')).toThrow(/loopback/);
  });
});
