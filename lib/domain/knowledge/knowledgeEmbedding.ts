export interface KnowledgeEmbeddingProfile {
  readonly model: string;
  readonly modelId: string;
  readonly dimensions: number;
}

export interface KnowledgeEmbeddingInput {
  readonly chunkId: string;
  readonly text: string;
  readonly textHash: string;
}

export interface KnowledgeEmbeddingProviderRequest {
  readonly profile: KnowledgeEmbeddingProfile;
  readonly inputs: readonly KnowledgeEmbeddingInput[];
  readonly signal?: AbortSignal;
}

export interface KnowledgeEmbeddingVector {
  readonly chunkId: string;
  readonly modelId: string;
  readonly dimensions: number;
  readonly textHash: string;
  readonly embedding: readonly number[];
}

export interface KnowledgeEmbeddingProvider {
  embed(request: KnowledgeEmbeddingProviderRequest): Promise<readonly KnowledgeEmbeddingVector[]>;
}

export const MAX_KNOWLEDGE_QUERY_LENGTH = 4_000;

export interface KnowledgeQueryEmbeddingRequest {
  readonly profile: KnowledgeEmbeddingProfile;
  readonly query: string;
  readonly signal?: AbortSignal;
}

export interface KnowledgeQueryEmbeddingVector {
  readonly modelId: string;
  readonly dimensions: number;
  readonly embedding: readonly number[];
}

export interface KnowledgeQueryEmbeddingProvider {
  embedQuery(request: KnowledgeQueryEmbeddingRequest): Promise<KnowledgeQueryEmbeddingVector>;
}

export interface KnowledgeSemanticSearchResult {
  readonly chunkId: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly chunkIndex: number;
  readonly text: string;
  readonly sourceLocators: unknown;
  readonly similarity: number;
}

export interface KnowledgeSemanticSearchRequest {
  readonly boardId: string;
  readonly queryEmbedding: KnowledgeQueryEmbeddingVector;
  readonly profile: KnowledgeEmbeddingProfile;
  readonly limit: number;
  readonly minSimilarity?: number | null;
}

export interface KnowledgeSemanticSearchRepository {
  searchBoardKnowledge(request: KnowledgeSemanticSearchRequest): Promise<readonly KnowledgeSemanticSearchResult[]>;
}

export function validateKnowledgeQueryText(query: string): string {
  if (typeof query !== 'string' || query.trim().length === 0 || query.length > MAX_KNOWLEDGE_QUERY_LENGTH) {
    throw new Error('Knowledge query must be a non-empty bounded string');
  }
  return query.trim();
}

export function validateKnowledgeQueryEmbeddingVector(
  vector: KnowledgeQueryEmbeddingVector,
  profile: KnowledgeEmbeddingProfile,
): KnowledgeQueryEmbeddingVector {
  if (vector.modelId !== profile.modelId || vector.dimensions !== profile.dimensions || vector.embedding.length !== profile.dimensions) {
    throw new Error('Query embedding has an unexpected model identity or dimensions');
  }
  if (vector.embedding.some((value) => !Number.isFinite(value))) throw new Error('Query embedding contains a non-finite value');
  return vector;
}

export function validateKnowledgeSemanticSearchParameters(
  boardId: string,
  limit: number,
  minSimilarity?: number | null,
): void {
  if (typeof boardId !== 'string' || boardId.trim().length === 0) throw new Error('Knowledge search board id is required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Knowledge search limit must be between 1 and 50');
  if (minSimilarity !== undefined && minSimilarity !== null && (!Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1)) {
    throw new Error('Knowledge search minimum similarity must be a finite cosine threshold');
  }
}

export interface KnowledgeEmbeddingState {
  readonly chunkId: string;
  readonly modelId: string;
  readonly dimensions: number;
  readonly chunkTextHash: string;
}

export interface KnowledgeEmbeddingRepository {
  listCandidateDocumentIds(
    profile: KnowledgeEmbeddingProfile,
    limit: number,
    createdAfter?: string | null,
  ): Promise<readonly string[]>;
  listChunks(documentId: string): Promise<readonly KnowledgeEmbeddingInput[]>;
  listEmbeddingStates(
    chunkIds: readonly string[],
    profile: KnowledgeEmbeddingProfile,
  ): Promise<readonly KnowledgeEmbeddingState[]>;
  upsertEmbeddings(
    vectors: readonly KnowledgeEmbeddingVector[],
  ): Promise<{ readonly persisted: number; readonly skippedDeleted: number }>;
}

export function isKnowledgeEmbeddingCurrent(
  input: KnowledgeEmbeddingInput,
  state: KnowledgeEmbeddingState | undefined,
  profile: KnowledgeEmbeddingProfile,
): boolean {
  return state?.chunkId === input.chunkId
    && state.modelId === profile.modelId
    && state.dimensions === profile.dimensions
    && state.chunkTextHash === input.textHash;
}

export function buildKnowledgeEmbeddingBatches(
  inputs: readonly KnowledgeEmbeddingInput[],
  batchSize: number,
): readonly (readonly KnowledgeEmbeddingInput[])[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Embedding batch size must be a positive integer');
  }
  const batches: KnowledgeEmbeddingInput[][] = [];
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    batches.push([...inputs].slice(offset, offset + batchSize));
  }
  return batches;
}

export function validateKnowledgeEmbeddingVectors(
  vectors: readonly KnowledgeEmbeddingVector[],
  inputs: readonly KnowledgeEmbeddingInput[],
  profile: KnowledgeEmbeddingProfile,
): readonly KnowledgeEmbeddingVector[] {
  if (vectors.length !== inputs.length) throw new Error('Embedding provider returned an unexpected vector count');
  const expected = new Map(inputs.map((input) => [input.chunkId, input]));
  const seen = new Set<string>();
  for (const vector of vectors) {
    const input = expected.get(vector.chunkId);
    if (!input || seen.has(vector.chunkId)) throw new Error('Embedding provider returned an unexpected chunk identity');
    if (vector.modelId !== profile.modelId || vector.dimensions !== profile.dimensions) {
      throw new Error('Embedding provider returned an unexpected model identity');
    }
    if (vector.textHash !== input.textHash || vector.embedding.length !== profile.dimensions) {
      throw new Error('Embedding provider returned an unexpected vector dimension or text identity');
    }
    if (vector.embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Embedding provider returned a non-finite vector value');
    }
    seen.add(vector.chunkId);
  }
  if (seen.size !== inputs.length) throw new Error('Embedding provider omitted a requested chunk');
  return vectors;
}
