import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../../workers/knowledge-embedding/openAIEmbeddingProvider';
import { embedKnowledgeDocument } from '../../../workers/knowledge-embedding/embedDocument';
import {
  createKnowledgeEmbeddingWorkerFromEnvironment,
  resolveKnowledgeEmbeddingConfig,
  runKnowledgeEmbeddingPoll,
  runKnowledgeEmbeddingWorker,
} from '../../../workers/knowledge-embedding/runEmbeddingWorker';
import { SupabaseKnowledgeEmbeddingRepository } from '../../infra/knowledge/knowledgeEmbeddingAdapters';
import type { KnowledgeEmbeddingSupabaseClient } from '../../infra/knowledge/knowledgeEmbeddingAdapters';
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

  constructor(chunks: readonly KnowledgeEmbeddingInput[]) { this.chunks = [...chunks]; }
  async listCandidateDocumentIds(): Promise<readonly string[]> { return ['document-1']; }
  async listChunks(): Promise<readonly KnowledgeEmbeddingInput[]> { return this.chunks; }
  async listEmbeddingStates(_chunkIds: readonly string[], profile: KnowledgeEmbeddingProfile): Promise<readonly KnowledgeEmbeddingState[]> {
    return this.states.filter((state) => state.modelId === profile.modelId && state.dimensions === profile.dimensions);
  }
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
  it('requires matching hash, model, and dimensions for a current embedding', () => {
    expect(isKnowledgeEmbeddingCurrent(input('chunk-1'), { chunkId: 'chunk-1', modelId: PROFILE.modelId, dimensions: 3, chunkTextHash: 'chunk-1-hash' }, PROFILE)).toBe(true);
    expect(isKnowledgeEmbeddingCurrent(input('chunk-1'), { chunkId: 'chunk-1', modelId: PROFILE.modelId, dimensions: 7, chunkTextHash: 'chunk-1-hash' }, PROFILE)).toBe(false);
    expect(isKnowledgeEmbeddingCurrent(input('chunk-1'), { chunkId: 'chunk-1', modelId: 'other:model', dimensions: 3, chunkTextHash: 'chunk-1-hash' }, PROFILE)).toBe(false);
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

  it('treats a deleted chunk during persistence as a benign skip', async () => {
    const repository = new FakeRepository([input('deleted')]);
    repository.deletedOnUpsert = true;
    const provider = new FakeProvider();
    const result = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 1 });
    expect(result.skippedDeleted).toBe(1);
  });
});

describe('P6I-A.1 worker hardening', () => {
  const environment = {
    OPENAI_API_KEY: 'test-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  };

  it('fails closed before discovery when createdAfter is missing or invalid', () => {
    expect(() => createKnowledgeEmbeddingWorkerFromEnvironment(environment)).toThrow(/CREATED_AFTER/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_CREATED_AFTER: 'not-a-date' })).toThrow(/ISO/);
  });

  it('passes a valid createdAfter exactly to candidate discovery', async () => {
    const createdAfter = '2026-08-21T12:34:56Z';
    const received: Array<string | null | undefined> = [];
    const repository: KnowledgeEmbeddingRepository = {
      listCandidateDocumentIds: async (_profile, _limit, value) => { received.push(value); return []; },
      listChunks: async () => [],
      listEmbeddingStates: async () => [],
      upsertEmbeddings: async () => ({ persisted: 0, skippedDeleted: 0 }),
    };
    const provider = new FakeProvider();
    const config = { profile: PROFILE, batchSize: 2, pollIntervalMs: 1, discoveryLimit: 2, createdAfter };
    await runKnowledgeEmbeddingPoll({ repository, provider }, config);
    expect(received).toEqual([createdAfter]);
  });

  it('retries discovery failures with bounded backoff and continues after recovery', async () => {
    const controller = new AbortController();
    let discoveries = 0;
    const delays: number[] = [];
    const repository: KnowledgeEmbeddingRepository = {
      listCandidateDocumentIds: async () => {
        discoveries += 1;
        if (discoveries === 1 || discoveries === 3) throw new Error('temporary discovery failure');
        return [];
      },
      listChunks: async () => [],
      listEmbeddingStates: async () => [],
      upsertEmbeddings: async () => ({ persisted: 0, skippedDeleted: 0 }),
    };
    await runKnowledgeEmbeddingWorker(
      { repository, provider: new FakeProvider() },
      { profile: PROFILE, batchSize: 1, pollIntervalMs: 5, discoveryLimit: 1, createdAfter: '2026-08-21T00:00:00Z' },
      controller.signal,
      { sleep: async (milliseconds) => { delays.push(milliseconds); if (delays.length === 3) controller.abort(); } },
    );
    expect(discoveries).toBe(3);
    expect(delays).toEqual([1_000, 5, 1_000]);
  });

  it('aborts provider requests on timeout and shutdown', async () => {
    const hangingFetch = async (_url: string, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    const request = { profile: PROFILE, inputs: [input('timeout')] };
    await expect(new OpenAIEmbeddingProvider({ apiKey: 'test', fetchImpl: hangingFetch, requestTimeoutMs: 1 }).embed(request)).rejects.toThrow();
    const controller = new AbortController();
    const pending = new OpenAIEmbeddingProvider({ apiKey: 'test', fetchImpl: hangingFetch, requestTimeoutMs: 30_000 }).embed({ ...request, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('persists nothing when provider validation fails', async () => {
    const repository = new FakeRepository([input('bad')]);
    const provider: KnowledgeEmbeddingProvider = { embed: async () => [{ ...vectors([input('bad')])[0], embedding: [1, 2] }] };
    const result = await embedKnowledgeDocument({ repository, provider }, { documentId: 'document-1', profile: PROFILE, batchSize: 1 });
    expect(result.failedBatches).toBe(1);
    expect(repository.upserts).toHaveLength(0);
  });

  it('refreshes embedded_at and swallows only SQLSTATE 23503', async () => {
    const rows: Record<string, unknown>[] = [];
    const client = {
      from: () => ({ upsert: async (row: Record<string, unknown>) => { rows.push(row); return { error: null }; } }),
    } as unknown as KnowledgeEmbeddingSupabaseClient;
    const repository = new SupabaseKnowledgeEmbeddingRepository(client);
    const vector = vectors([input('timestamp')])[0];
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-21T00:00:00.000Z'));
      await repository.upsertEmbeddings([vector]);
      vi.setSystemTime(new Date('2026-08-21T00:00:01.000Z'));
      await repository.upsertEmbeddings([vector]);
    } finally {
      vi.useRealTimers();
    }
    expect(rows[1].embedded_at).not.toBe(rows[0].embedded_at);

    const deletedClient = { from: () => ({ upsert: async () => ({ error: { code: '23503', message: 'unrelated wording' } }) }) } as unknown as KnowledgeEmbeddingSupabaseClient;
    await expect(new SupabaseKnowledgeEmbeddingRepository(deletedClient).upsertEmbeddings([vector])).resolves.toEqual({ persisted: 0, skippedDeleted: 1 });
    const failedClient = { from: () => ({ upsert: async () => ({ error: { code: 'XX000', message: 'knowledge_chunks wording' } }) }) } as unknown as KnowledgeEmbeddingSupabaseClient;
    await expect(new SupabaseKnowledgeEmbeddingRepository(failedClient).upsertEmbeddings([vector])).rejects.toThrow();
  });
});
