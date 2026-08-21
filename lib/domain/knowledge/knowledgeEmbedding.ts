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
