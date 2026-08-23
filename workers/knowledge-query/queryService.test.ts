import { describe, expect, it, vi } from 'vitest';
import { InMemoryKnowledgeQueryRateLimiter, KNOWLEDGE_QUERY_PROFILE, createKnowledgeQueryService, createKnowledgeWarmService } from './queryService';
import { QueryAuthenticationError, QueryAuthenticationUnavailableError } from './supabaseQuerySecurity';
import type { KnowledgeBoardReadAuthorizationClient } from '../../lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeQueryRateLimiter } from './queryService';

const USER_ID = 'user-1';
const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const result = { chunkId: 'chunk', documentId: 'document', originalFilename: 'file.pdf', pageStart: 1, pageEnd: 1, chunkIndex: 0, text: 'text', sourceLocators: [], similarity: 0.9 };

function boardClient(owner: { data: { id: string } | null; error: unknown } = { data: { id: BOARD_ID }, error: null }, member: { data: boolean | null; error: unknown } = { data: false, error: null }) {
  const builder = { eq: vi.fn(() => builder), maybeSingle: vi.fn(async () => owner) };
  return {
    from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    rpc: vi.fn(async () => member),
  } as unknown as KnowledgeBoardReadAuthorizationClient;
}

type ServiceOverrides = {
  security?: { verifyAccessToken: ReturnType<typeof vi.fn> };
  provider?: { embedQuery: ReturnType<typeof vi.fn> };
  repository?: { searchBoardKnowledge: ReturnType<typeof vi.fn> };
  rateLimiter?: KnowledgeQueryRateLimiter;
};

function setup(overrides: ServiceOverrides = {}) {
  const security = overrides.security ?? { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient() })) };
  const provider = overrides.provider ?? { embedQuery: vi.fn(async () => ({ modelId: KNOWLEDGE_QUERY_PROFILE.modelId, dimensions: 1024, embedding: [0] })) };
  const repository = overrides.repository ?? { searchBoardKnowledge: vi.fn(async () => [result]) };
  return { service: createKnowledgeQueryService({ security, provider, repository, rateLimiter: overrides.rateLimiter }), security, provider, repository };
}

function body(overrides: Record<string, unknown> = {}) {
  return { boardId: BOARD_ID, query: 'recovery', ...overrides };
}

describe('authenticated knowledge query service', () => {
  it('fails closed before provider/search for missing or invalid bearer tokens', async () => {
    const missing = setup();
    await expect(missing.service(body(), undefined)).resolves.toMatchObject({ status: 401, body: { error: 'unauthenticated' } });
    expect(missing.provider.embedQuery).not.toHaveBeenCalled();
    expect(missing.repository.searchBoardKnowledge).not.toHaveBeenCalled();
    const invalid = setup({ security: { verifyAccessToken: vi.fn(async () => { throw new QueryAuthenticationError(); }) } });
    await expect(invalid.service(body(), 'Bearer bad')).resolves.toMatchObject({ status: 401 });
    expect(invalid.provider.embedQuery).not.toHaveBeenCalled();
  });

  it('maps auth backend failure, board denial, and board lookup errors safely', async () => {
    const unavailable = setup({ security: { verifyAccessToken: vi.fn(async () => { throw new QueryAuthenticationUnavailableError(); }) } });
    await expect(unavailable.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 503, body: { error: 'service_unavailable' } });
    const forbidden = setup({
      security: { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient({ data: null, error: null }, { data: false, error: null }) })) },
    });
    await expect(forbidden.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 403 });
    expect(forbidden.provider.embedQuery).not.toHaveBeenCalled();
    expect(forbidden.repository.searchBoardKnowledge).not.toHaveBeenCalled();
    const authError = setup({
      security: { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient({ data: null, error: new Error('db') }) })) },
    });
    await expect(authError.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 503, body: { error: 'authorization_unavailable' } });
    expect(authError.provider.embedQuery).not.toHaveBeenCalled();
  });

  it('authorizes owner/member, uses the fixed profile, defaults/clamps limit, and strips similarity', async () => {
    const memberClient = boardClient({ data: null, error: null }, { data: true, error: null });
    const security = { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: memberClient })) };
    const setupState = setup({ security });
    const response = await setupState.service(body(), 'Bearer verified');
    expect(response.status).toBe(200);
    expect(setupState.provider.embedQuery).toHaveBeenCalledWith({ profile: KNOWLEDGE_QUERY_PROFILE, query: 'recovery', signal: undefined });
    expect(setupState.repository.searchBoardKnowledge).toHaveBeenCalledWith(expect.objectContaining({ boardId: BOARD_ID, profile: KNOWLEDGE_QUERY_PROFILE, limit: 5, minSimilarity: 0.35 }));
    expect(response.body).toEqual({ results: [{ chunkId: 'chunk', documentId: 'document', originalFilename: 'file.pdf', pageStart: 1, pageEnd: 1, chunkIndex: 0, text: 'text', sourceLocators: [] }] });
    await setupState.service(body({ limit: 99 }), 'Bearer verified');
    expect(setupState.repository.searchBoardKnowledge).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it('rejects malformed request shape, invalid UUID/query, and caller profile overrides', async () => {
    const state = setup();
    for (const invalid of [
      body({ unknown: true }), body({ boardId: 'not-a-uuid' }), body({ query: 'q'.repeat(4001) }),
      body({ model: 'other' }), body({ dimensions: 1536 }), body({ minSimilarity: 0.5 }), body({ queryEmbedding: [] }),
    ]) await expect(state.service(invalid, 'Bearer token')).resolves.toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(state.security.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('limits accepted authenticated attempts per user and resets expired entries', async () => {
    let now = 1000;
    const limiter = new InMemoryKnowledgeQueryRateLimiter(() => now);
    const state = setup({ rateLimiter: limiter });
    for (let i = 0; i < 10; i++) await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 429, body: { error: 'rate_limited' } });
    now += 60_001;
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    const otherUserSecurity = { verifyAccessToken: vi.fn(async () => ({ userId: 'user-2', client: boardClient() })) };
    const other = setup({ security: otherUserSecurity, rateLimiter: limiter });
    await expect(other.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
  });

  it('keeps a boundary-straddling request inside the rolling window', async () => {
    let now = 0;
    const limiter = new InMemoryKnowledgeQueryRateLimiter(() => now);
    const state = setup({ rateLimiter: limiter });
    for (let i = 0; i < 9; i++) await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    now = 59_000;
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    now = 60_001;
    for (let i = 0; i < 9; i++) await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 429 });
  });

  it('does not call authorization, embedding, or search after rate rejection', async () => {
    let now = 0;
    const limiter = new InMemoryKnowledgeQueryRateLimiter(() => now);
    const client = boardClient();
    const security = { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client })) };
    const provider = { embedQuery: vi.fn(async () => ({ modelId: KNOWLEDGE_QUERY_PROFILE.modelId, dimensions: 1024, embedding: [0] })) };
    const repository = { searchBoardKnowledge: vi.fn(async () => [result]) };
    const state = setup({ security, provider, repository, rateLimiter: limiter });
    for (let i = 0; i < 10; i++) await state.service(body(), 'Bearer token');
    const authCalls = (client.from as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const embedCalls = provider.embedQuery.mock.calls.length;
    const searchCalls = repository.searchBoardKnowledge.mock.calls.length;
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 429 });
    expect(client.from).toHaveBeenCalledTimes(authCalls);
    expect(provider.embedQuery).toHaveBeenCalledTimes(embedCalls);
    expect(repository.searchBoardKnowledge).toHaveBeenCalledTimes(searchCalls);
  });

  it('warms with auth only, never consumes search budget, and leaves search behavior intact', async () => {
    const rateLimiter = { consume: vi.fn(() => true) };
    const state = setup({ rateLimiter });
    const warm = createKnowledgeWarmService({ security: state.security });
    await expect(warm({ boardId: BOARD_ID }, 'Bearer token')).resolves.toEqual({ status: 200, body: { ok: true } });
    for (let i = 0; i < 10; i++) await expect(warm({ boardId: BOARD_ID }, 'Bearer token')).resolves.toMatchObject({ status: 200 });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(state.provider.embedQuery).not.toHaveBeenCalled();
    expect(state.repository.searchBoardKnowledge).not.toHaveBeenCalled();
    await expect(warm({ boardId: BOARD_ID, query: 'not allowed' }, 'Bearer token')).resolves.toMatchObject({ status: 400 });
    await expect(warm({ boardId: 'not-a-uuid' }, 'Bearer token')).resolves.toMatchObject({ status: 400 });
    await expect(warm({ boardId: BOARD_ID }, undefined)).resolves.toMatchObject({ status: 401 });
    const invalid = setup({ security: { verifyAccessToken: vi.fn(async () => { throw new QueryAuthenticationError(); }) } });
    await expect(createKnowledgeWarmService({ security: invalid.security })({ boardId: BOARD_ID }, 'Bearer bad')).resolves.toMatchObject({ status: 401 });
    const unavailable = setup({ security: { verifyAccessToken: vi.fn(async () => { throw new QueryAuthenticationUnavailableError(); }) } });
    await expect(createKnowledgeWarmService({ security: unavailable.security })({ boardId: BOARD_ID }, 'Bearer token')).resolves.toMatchObject({ status: 503 });
    const forbidden = setup({ security: { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient({ data: null, error: null }) })) } });
    await expect(createKnowledgeWarmService({ security: forbidden.security })({ boardId: BOARD_ID }, 'Bearer token')).resolves.toMatchObject({ status: 403 });
    const authorizationFailure = setup({ security: { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient({ data: null, error: new Error('db') }) })) } });
    await expect(createKnowledgeWarmService({ security: authorizationFailure.security })({ boardId: BOARD_ID }, 'Bearer token')).resolves.toMatchObject({ status: 503 });
    await expect(state.service(body(), 'Bearer token')).resolves.toMatchObject({ status: 200 });
    expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(state.provider.embedQuery).toHaveBeenCalledTimes(1);
    expect(state.repository.searchBoardKnowledge).toHaveBeenCalledTimes(1);
  });

  describe('internal similarity diagnostic', () => {
    const SENTINELS = ['recovery', 'text', 'file.pdf', BOARD_ID, USER_ID];
    const FORBIDDEN_KEYS = /query|text|filename|document|chunk|board|user|token|embedding|vector|model|dimension|sourceLocator/i;

    it('logs rank-ordered similarity while keeping the public response similarity-free', async () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        const repository = { searchBoardKnowledge: vi.fn(async () => [
          { ...result, similarity: 0.8123 },
          { ...result, similarity: 0.6441 },
        ]) };
        const state = setup({ repository });
        const response = await state.service(body(), 'Bearer token');
        expect(spy).toHaveBeenCalledWith('[KNOWLEDGE-SEARCH-SIMILARITY]', {
          resultCount: 2,
          results: [{ rank: 1, similarity: 0.8123 }, { rank: 2, similarity: 0.6441 }],
        });
        expect(JSON.stringify(response.body)).not.toContain('similarity');
      } finally { spy.mockRestore(); }
    });

    it('contains no sentinel values or forbidden keys beyond rank/similarity/resultCount', async () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        const state = setup();
        await state.service(body(), 'Bearer token');
        const call = spy.mock.calls.find(([prefix]) => prefix === '[KNOWLEDGE-SEARCH-SIMILARITY]');
        const serialized = JSON.stringify(call?.[1]);
        for (const sentinel of SENTINELS) expect(serialized).not.toContain(sentinel);
        for (const entry of (call?.[1] as { results: Record<string, unknown>[] }).results) {
          for (const key of Object.keys(entry)) expect(key).not.toMatch(FORBIDDEN_KEYS);
        }
      } finally { spy.mockRestore(); }
    });

    it('logs resultCount 0 with an empty results array for a successful empty search', async () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        const repository = { searchBoardKnowledge: vi.fn(async () => []) };
        const state = setup({ repository });
        await state.service(body(), 'Bearer token');
        expect(spy).toHaveBeenCalledWith('[KNOWLEDGE-SEARCH-SIMILARITY]', { resultCount: 0, results: [] });
      } finally { spy.mockRestore(); }
    });

    it('emits no similarity diagnostic for a warm request', async () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        const state = setup();
        const warm = createKnowledgeWarmService({ security: state.security });
        await warm({ boardId: BOARD_ID }, 'Bearer token');
        expect(spy).not.toHaveBeenCalledWith('[KNOWLEDGE-SEARCH-SIMILARITY]', expect.anything());
      } finally { spy.mockRestore(); }
    });

    it('emits no similarity diagnostic when the search never reaches the repository', async () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        const forbidden = setup({
          security: { verifyAccessToken: vi.fn(async () => ({ userId: USER_ID, client: boardClient({ data: null, error: null }, { data: false, error: null }) })) },
        });
        await forbidden.service(body(), 'Bearer token');
        expect(spy).not.toHaveBeenCalledWith('[KNOWLEDGE-SEARCH-SIMILARITY]', expect.anything());
      } finally { spy.mockRestore(); }
    });
  });
});
