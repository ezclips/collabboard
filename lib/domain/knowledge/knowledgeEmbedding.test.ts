import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../../workers/knowledge-embedding/openAIEmbeddingProvider';
import { embedKnowledgeDocument } from '../../../workers/knowledge-embedding/embedDocument';
import type {
  KnowledgeEmbeddingInput,
  KnowledgeEmbeddingProfile,
  KnowledgeEmbeddingProvider,
  KnowledgeEmbeddingRepository,
  KnowledgeEmbeddingState,
  KnowledgeEmbeddingVector,
} from './knowledgeEmbedding';
import {
  buildKnowledgeEmbeddingBatches,
  embeddingIdentityKey,
  isKnowledgeEmbeddingCurrent,
} from './knowledgeEmbedding';

const PROFILE: KnowledgeEmbeddingProfile = { model: 'test-model', modelId: 'test:model', dimensions: 3 };

function input(chunkId: string, textHash = `${chunkId}-hash`): KnowledgeEmbeddingInput {
  return { chunkId, text: `text-${chunkId}`, textHash };
}

function vectors(inputs: readonly KnowledgeEmbeddingInput[], profile = PROFILE): readonly KnowledgeEmbeddingVector[] {
  return inputs.map((item, index) => ({
    chunkId: item.chunkId,
    modelId: profile.modelId,
    dimensions: profile.dimensions,
    textHash: item.textHash,
    embedding: Array.from({ length: profile.dimensions }, (_, offset) => index + offset / 10),
  }));
}

class FakeRepository implements KnowledgeEmbeddingRepository {
  readonly chunks: KnowledgeEmbeddingInput[];
  readonly states: KnowledgeEmbeddingState[] = [];
  readonly upserts: KnowledgeEmbeddingVector[][] = [];
  deletedOnUpsert = false;
  readonly readyStatus = 'ready';

  constructor(chunks: readonly KnowledgeEmbeddingInput[]) { this.chunks = [...chunks]; }
  async listCandidateDocumentIds(): Promise<readonly string[]> { return ['document-1']; }
  async listChunks(): Promise<readonly KnowledgeEmbeddingInput[]> { return this.chunks; }
  async listEmbeddingStates(): Promise<readonly KnowledgeEmbeddingState[]> { return this.states; }
  async upsertEmbeddings(items: readonly KnowledgeEmbeddingVector[]) {
    this.upserts.push([...items]);
    if (this.deletedOnUpsert) return { persisted: 0, skippedDeleted: items.length };
    for (const item of items) {
      const existing = this.states.findIndex((state) => state.chunkId === item.chunkId && state.modelId === item.modelId && state.dimensions === item.dimensions);
      const state = { chunkId: item.chunkId, modelId: item.modelId, dimensions: item.dimensions, chunkTextHash: item.textHash };
      if (existing >= 0) this.states[existing] = state;
      else this.states.push(state);
    }
    return { persisted: items.length, skippedDeleted: 0 };
  }
}

class FakeProvider implements KnowledgeEmbeddingProvider {
  readonly calls: KnowledgeEmbeddingInput[][] = [];
  failCallNumbers = new Set<number>();
  async embed(request: { readonly profile: KnowledgeEmbeddingProfile; readonly inputs: readonly KnowledgeEmbeddingInput[] }) {
    this.calls.push([...request.inputs]);
    if (this.failCallNumbers.has(this.calls.length)) throw new Error('mock provider failure');
    return vectors(request.inputs, request.profile);
  }
}

describe('P6I-A embedding foundation', () => {
  it('makes dimensions part of the operational embedding identity', () => {
    expect(embeddingIdentityKey('chunk-1', 'openai:model', 1536)).not.toBe(embeddingIdentityKey('chunk-1', 'openai:model', 3072));
    expect(isKnowledgeEmbeddingCurrent(input('chunk-1'), { chunkId: 'chunk-1', modelId: PROFILE.modelId, dimensions: 3, chunkTextHash: 'chunk-1-hash' }, PROFILE)).toBe(true);
  });

  it('batches deterministically and rejects a provider vector dimension mismatch', async () => {
    const batches = buildKnowledgeEmbeddingBatches([input('a'), input('b'), input('c')], 2);
    expect(batches.map((batch) => batch.map((item) => item.chunkId))).toEqual([['a', 'b'], ['c']]);
    let requestBody = '';
    const provider = new OpenAIEmbeddingProvider({
      apiKey: 'test-key',
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body);
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }), { status: 200 });
      },
    });
    await expect(provider.embed({ profile: { model: 'text-embedding-3-small', modelId: 'openai:text-embedding-3-small', dimensions: 3 }, inputs: [input('a')] })).rejects.toThrow(/dimension/i);
    expect(JSON.parse(requestBody).dimensions).toBe(3);
  });

  it('makes no provider call when the current embedding is already present', async () => {
    const repository = new FakeRepository([input('a')]);
    repository.states.push({ chunkId: 'a', modelId: PROFILE.modelId, dimensions: PROFILE.dimensions, chunkTextHash: 'a-hash' });
    const provider = { embed: vi.fn(async () => []) } as unknown as KnowledgeEmbeddingProvider;
    const result = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 2 });
    expect(provider.embed).not.toHaveBeenCalled();
    expect(result.persisted).toBe(0);
  });

  it('embeds missing chunks exactly once and replaces only a matching stale identity', async () => {
    const repository = new FakeRepository([input('a'), input('b')]);
    repository.states.push({ chunkId: 'a', modelId: PROFILE.modelId, dimensions: PROFILE.dimensions, chunkTextHash: 'old-hash' });
    repository.states.push({ chunkId: 'a', modelId: 'other:model', dimensions: 7, chunkTextHash: 'other-hash' });
    const provider = new FakeProvider();
    const result = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 2 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].map((item) => item.chunkId)).toEqual(['a', 'b']);
    expect(result.persisted).toBe(2);
    expect(repository.upserts[0].every((item) => item.modelId === PROFILE.modelId && item.dimensions === PROFILE.dimensions)).toBe(true);
    expect(repository.states.some((state) => state.modelId === 'other:model')).toBe(true);
  });

  it('survives a partial provider failure and retries only the remainder', async () => {
    const repository = new FakeRepository([input('a'), input('b'), input('c')]);
    const provider = new FakeProvider();
    provider.failCallNumbers.add(2);
    const first = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 2 });
    expect(first.persisted).toBe(2);
    expect(first.failedBatches).toBe(1);
    provider.failCallNumbers.clear();
    const second = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 2 });
    expect(provider.calls.map((batch) => batch.map((item) => item.chunkId))).toEqual([['a', 'b'], ['c'], ['c']]);
    expect(second.persisted).toBe(1);
  });

  it('treats a deleted chunk during persistence as a benign skip and never changes Ready state', async () => {
    const repository = new FakeRepository([input('deleted')]);
    repository.deletedOnUpsert = true;
    const provider = new FakeProvider();
    const result = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 1 });
    expect(result.skippedDeleted).toBe(1);
    expect(repository.readyStatus).toBe('ready');
  });
});
