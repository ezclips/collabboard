import {
  buildKnowledgeEmbeddingBatches,
  isKnowledgeEmbeddingCurrent,
  validateKnowledgeEmbeddingVectors,
} from '../../lib/domain/knowledge/knowledgeEmbedding';
import type {
  KnowledgeEmbeddingProfile,
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingRepository,
} from '../../lib/domain/knowledge/knowledgeEmbedding';

export interface EmbedDocumentDependencies {
  readonly repository: KnowledgeEmbeddingRepository;
  readonly provider: KnowledgeEmbeddingProvider;
}

export interface EmbedDocumentOptions {
  readonly documentId: string;
  readonly profile: KnowledgeEmbeddingProfile;
  readonly batchSize: number;
}

export interface EmbedDocumentSummary {
  readonly documentId: string;
  readonly considered: number;
  readonly providerBatches: number;
  readonly persisted: number;
  readonly skippedDeleted: number;
  readonly failedBatches: number;
  readonly failedChunks: number;
}

export async function embedKnowledgeDocument(
  deps: EmbedDocumentDependencies,
  options: EmbedDocumentOptions,
): Promise<EmbedDocumentSummary> {
  const chunks = await deps.repository.listChunks(options.documentId);
  const states = await deps.repository.listEmbeddingStates(
    chunks.map((chunk) => chunk.chunkId),
    options.profile,
  );
  const statesByChunk = new Map(states.map((state) => [state.chunkId, state]));
  const pending = chunks.filter((chunk) => !isKnowledgeEmbeddingCurrent(
    chunk,
    statesByChunk.get(chunk.chunkId),
    options.profile,
  ));
  const batches = buildKnowledgeEmbeddingBatches(pending, options.batchSize);
  let persisted = 0;
  let skippedDeleted = 0;
  let failedBatches = 0;
  let failedChunks = 0;

  for (const batch of batches) {
    try {
      const vectors = await deps.provider.embed({ profile: options.profile, inputs: batch });
      const validVectors = validateKnowledgeEmbeddingVectors(vectors, batch, options.profile);
      const result = await deps.repository.upsertEmbeddings(validVectors);
      persisted += result.persisted;
      skippedDeleted += result.skippedDeleted;
    } catch {
      // A failed provider or persistence batch remains discoverable through the
      // missing/stale candidate RPC and is retried on a later poll.
      failedBatches += 1;
      failedChunks += batch.length;
    }
  }

  return {
    documentId: options.documentId,
    considered: chunks.length,
    providerBatches: batches.length,
    persisted,
    skippedDeleted,
    failedBatches,
    failedChunks,
  };
}
