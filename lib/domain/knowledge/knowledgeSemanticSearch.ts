import type {
  KnowledgeEmbeddingProfile,
  KnowledgeQueryEmbeddingProvider,
  KnowledgeSemanticSearchRepository,
  KnowledgeSemanticSearchResult,
} from './knowledgeEmbedding';
import { validateKnowledgeQueryText, validateKnowledgeSemanticSearchParameters } from './knowledgeEmbedding';

export interface SearchKnowledgeOptions {
  readonly query: string;
  readonly boardId: string;
  readonly profile: KnowledgeEmbeddingProfile;
  readonly provider: KnowledgeQueryEmbeddingProvider;
  readonly repository: KnowledgeSemanticSearchRepository;
  readonly limit: number;
  readonly minSimilarity?: number | null;
  readonly signal?: AbortSignal;
}

export async function searchKnowledge(options: SearchKnowledgeOptions): Promise<readonly KnowledgeSemanticSearchResult[]> {
  const query = validateKnowledgeQueryText(options.query);
  validateKnowledgeSemanticSearchParameters(options.boardId, options.limit, options.minSimilarity);
  const queryEmbedding = await options.provider.embedQuery({ profile: options.profile, query, signal: options.signal });
  return options.repository.searchBoardKnowledge({
    boardId: options.boardId,
    queryEmbedding,
    profile: options.profile,
    limit: options.limit,
    minSimilarity: options.minSimilarity,
  });
}
