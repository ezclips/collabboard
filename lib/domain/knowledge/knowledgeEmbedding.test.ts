import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../../workers/knowledge-embedding/openAIEmbeddingProvider';
import { LocalTeiEmbeddingProvider, assertLocalTeiUrl } from '../../../workers/knowledge-embedding/localTeiEmbeddingProvider';
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
    const failures: unknown[] = [];
    provider.failCallNumbers.add(2);
    const first = await embedKnowledgeDocument({ repository, provider, onBatchFailure: (event) => failures.push(event) }, { documentId: 'document-1', profile: PROFILE, batchSize: 2 });
    expect(first.persisted).toBe(2);
    expect(first.failedBatches).toBe(1);
    expect(failures).toEqual([{ event: 'knowledge-embedding-document-batch-failed', documentId: 'document-1', batchNumber: 2, batchSize: 1 }]);
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
    KNOWLEDGE_EMBEDDING_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  };

  it('fails closed before discovery when createdAfter is missing or invalid', () => {
    expect(() => createKnowledgeEmbeddingWorkerFromEnvironment(environment)).toThrow(/CREATED_AFTER/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_CREATED_AFTER: 'not-a-date' })).toThrow(/ISO/);
  });

  it('selects local-tei without requiring OpenAI and locks the Voyage profile', () => {
    const localEnvironment = {
      ...environment,
      KNOWLEDGE_EMBEDDING_PROVIDER: 'local-tei',
      KNOWLEDGE_EMBEDDING_TEI_URL: 'http://127.0.0.1:8080',
      KNOWLEDGE_EMBEDDING_CREATED_AFTER: '2026-08-21T00:00:00Z',
      OPENAI_API_KEY: undefined,
    };
    const worker = createKnowledgeEmbeddingWorkerFromEnvironment(localEnvironment);
    expect(worker.config.profile).toEqual({ model: 'voyageai/voyage-4-nano', modelId: 'local:voyage-4-nano', dimensions: 1024 });
    expect(worker.dependencies.provider).toBeInstanceOf(LocalTeiEmbeddingProvider);
  });

  it('fails closed for missing or unsupported provider and invalid local TEI URL', () => {
    const missing = { ...environment, KNOWLEDGE_EMBEDDING_PROVIDER: undefined };
    expect(() => resolveKnowledgeEmbeddingConfig(missing)).toThrow(/PROVIDER/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_PROVIDER: 'unknown' })).toThrow(/unsupported/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_PROVIDER: 'local-tei', KNOWLEDGE_EMBEDDING_TEI_URL: 'https://example.com' })).toThrow(/loopback/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_PROVIDER: 'local-tei' })).toThrow(/TEI_URL/);
    expect(() => resolveKnowledgeEmbeddingConfig({ ...environment, KNOWLEDGE_EMBEDDING_PROVIDER: 'openai', OPENAI_API_KEY: undefined, KNOWLEDGE_EMBEDDING_CREATED_AFTER: '2026-08-21T00:00:00Z' })).toThrow(/OPENAI_API_KEY/);
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

  it('emits only the bounded poll-failure event payload', async () => {
    const controller = new AbortController();
    let discoveries = 0;
    const repository: KnowledgeEmbeddingRepository = {
      listCandidateDocumentIds: async () => {
        discoveries += 1;
        if (discoveries === 1) throw new Error('secret text and vector must not be logged');
        return [];
      },
      listChunks: async () => [],
      listEmbeddingStates: async () => [],
      upsertEmbeddings: async () => ({ persisted: 0, skippedDeleted: 0 }),
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runKnowledgeEmbeddingWorker(
        { repository, provider: new FakeProvider() },
        { profile: PROFILE, batchSize: 1, pollIntervalMs: 1, discoveryLimit: 1, createdAfter: '2026-08-21T00:00:00Z' },
        controller.signal,
        { sleep: async () => { if (discoveries === 2) controller.abort(); }, maxPolls: 2 },
      );
    } finally {
      const calls = [...log.mock.calls];
      log.mockRestore();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([JSON.stringify({ event: 'knowledge-embedding-worker-poll-failed', consecutiveFailures: 1 })]);
      expect(calls.join(' ')).not.toContain('secret text');
    }
    expect(discoveries).toBe(2);
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

describe('LocalTeiEmbeddingProvider', () => {
  const localProfile = { model: 'voyageai/voyage-4-nano', modelId: 'local:voyage-4-nano', dimensions: 3 };
  const localInputs = [input('local-a'), input('local-b')];
  const localRequest = { profile: localProfile, inputs: localInputs };

  it('sends the document contract without credentials and preserves input order', async () => {
    let receivedUrl = '';
    let receivedInit: RequestInit | undefined;
    const provider = new LocalTeiEmbeddingProvider({
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl: async (url, init) => {
        receivedUrl = url;
        receivedInit = init;
        return new Response(JSON.stringify([[1, 0, 0], [0, 1, 0]]), { status: 200 });
      },
    });
    const result = await provider.embed(localRequest);
    expect(receivedUrl).toBe('http://127.0.0.1:8080/embed');
    expect(JSON.parse(String(receivedInit?.body))).toEqual({ inputs: ['text-local-a', 'text-local-b'], prompt_name: 'document', dimensions: 3, normalize: true, truncate: false });
    expect(receivedInit?.credentials).toBe('omit');
    expect(receivedInit?.headers).toEqual({ 'content-type': 'application/json' });
    expect(result.map((item) => item.chunkId)).toEqual(['local-a', 'local-b']);
  });

  it('accepts only unauthenticated HTTP loopback URLs', () => {
    expect(assertLocalTeiUrl('http://localhost:8080')).toBe('http://localhost:8080/embed');
    expect(assertLocalTeiUrl('http://[::1]:8080')).toBe('http://[::1]:8080/embed');
    for (const value of ['https://localhost:8080', 'http://example.com:8080', 'http://user:pass@127.0.0.1:8080']) {
      expect(() => assertLocalTeiUrl(value)).toThrow(/loopback/);
    }
  });

  it('sends query embeddings with the query prompt and locked request options', async () => {
    let receivedInit: RequestInit | undefined;
    const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://127.0.0.1:8080', fetchImpl: async (_url, init) => {
      receivedInit = init;
      return new Response(JSON.stringify([[1, 0, 0]]), { status: 200 });
    } });
    await expect(provider.embedQuery({ profile: localProfile, query: 'Which planet has rings?' })).resolves.toEqual({ modelId: localProfile.modelId, dimensions: 3, embedding: [1, 0, 0] });
    expect(JSON.parse(String(receivedInit?.body))).toEqual({ inputs: ['Which planet has rings?'], prompt_name: 'query', dimensions: 3, normalize: true, truncate: false });
    expect(receivedInit?.credentials).toBe('omit');
  });

  it('rejects invalid query text and query vector responses', async () => {
    for (const query of ['', '   ', 'q'.repeat(4001)]) {
      const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => new Response('[[1,2,3]]') });
      await expect(provider.embedQuery({ profile: localProfile, query })).rejects.toThrow();
    }
    for (const body of ['[]', '[[1,2,3],[4,5,6]]', '[[1,2]]']) {
      const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => new Response(body) });
      await expect(provider.embedQuery({ profile: localProfile, query: 'valid' })).rejects.toThrow();
    }
    for (const embedding of [[1, 2, Number.NaN], [1, 2, Number.POSITIVE_INFINITY]]) {
      const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => ({ ok: true, status: 200, json: async () => [embedding] } as Response) });
      await expect(provider.embedQuery({ profile: localProfile, query: 'valid' })).rejects.toThrow();
    }
  });

  it('does not call TEI for empty input', async () => {
    let calls = 0;
    const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => { calls += 1; return new Response('[]'); } });
    expect(await provider.embed({ ...localRequest, inputs: [] })).toEqual([]);
    expect(calls).toBe(0);
  });

  it('rejects malformed, wrong-dimension, and non-finite responses', async () => {
    for (const body of [JSON.stringify([[1, 2, 3]]), JSON.stringify([[1, 2], [3, 4]]), JSON.stringify([[1, 2, 3], [3, 4, 'bad']]), JSON.stringify({ data: [] })]) {
      const provider = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => new Response(body) });
      await expect(provider.embed(localRequest)).rejects.toThrow();
    }
  });

  it('exposes only status for non-2xx responses and supports timeout/abort', async () => {
    const failed = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => new Response('private body', { status: 503 }) });
    await expect(failed.embed(localRequest)).rejects.toThrow('status 503');
    const hanging = async (_url: string, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    await expect(new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: hanging, requestTimeoutMs: 1 }).embed(localRequest)).rejects.toThrow();
    const controller = new AbortController();
    const pending = new LocalTeiEmbeddingProvider({ baseUrl: 'http://localhost:8080', fetchImpl: hanging }).embed({ ...localRequest, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
