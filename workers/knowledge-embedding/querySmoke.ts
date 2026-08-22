import type { KnowledgeSemanticSearchResult } from '../../lib/domain/knowledge/knowledgeEmbedding';

export type QuerySmokeSimilarityBucket = 'high' | 'medium' | 'low';

export interface QuerySmokeOutput {
  readonly event: 'knowledge-query-smoke';
  readonly teiReady: boolean;
  readonly resultCount: number;
  readonly expectedDocumentFound: boolean;
  readonly forbiddenDocumentPresent: boolean;
  readonly topSimilarityBucket: QuerySmokeSimilarityBucket;
  readonly pass: boolean;
}

export interface QuerySmokeConfig {
  readonly provider: string;
  readonly teiUrl: string;
  readonly model: string;
  readonly modelId: string;
  readonly dimensions: number;
  readonly query: string;
  readonly boardId: string;
  readonly expectedDocumentId: string;
  readonly forbiddenDocumentId: string;
}

export function validateQuerySmokeConfig(config: QuerySmokeConfig): QuerySmokeConfig {
  if (config.provider !== 'local-tei' || config.model !== 'voyageai/voyage-4-nano' || config.modelId !== 'local:voyage-4-nano' || config.dimensions !== 1024) throw new Error('invalid smoke configuration');
  if ([config.teiUrl, config.query, config.boardId, config.expectedDocumentId, config.forbiddenDocumentId].some((value) => typeof value !== 'string' || value.trim().length === 0)) throw new Error('missing smoke configuration');
  if (config.expectedDocumentId === config.forbiddenDocumentId) throw new Error('smoke document identities must differ');
  return config;
}

export function summarizeQuerySmokeResults(
  results: readonly KnowledgeSemanticSearchResult[],
  expectedDocumentId: string,
  forbiddenDocumentId: string,
  teiReady = true,
): QuerySmokeOutput {
  const topSimilarity = results[0]?.similarity ?? 0;
  const topSimilarityBucket: QuerySmokeSimilarityBucket = topSimilarity >= 0.75 ? 'high' : topSimilarity >= 0.5 ? 'medium' : 'low';
  const expectedDocumentFound = results.some((result) => result.documentId === expectedDocumentId);
  const forbiddenDocumentPresent = results.some((result) => result.documentId === forbiddenDocumentId);
  return {
    event: 'knowledge-query-smoke',
    teiReady,
    resultCount: results.length,
    expectedDocumentFound,
    forbiddenDocumentPresent,
    topSimilarityBucket,
    pass: teiReady && expectedDocumentFound && !forbiddenDocumentPresent,
  };
}
