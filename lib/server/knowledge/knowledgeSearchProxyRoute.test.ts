import { describe, expect, it, vi } from 'vitest';
import { handleKnowledgeSearchProxy, handleKnowledgeWarmProxy } from './knowledgeSearchProxyRoute';
import type { KnowledgeBoardReadAuthorizationClient } from './knowledgeBoardReadAuthorization';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';
const TOKEN = 'token-never-returned';

function client() {
  const owner = { data: { id: BOARD_ID }, error: null };
  const builder = { eq: vi.fn(() => builder), maybeSingle: vi.fn(async () => owner) };
  const auth = { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })), getSession: vi.fn(async () => ({ data: { session: { access_token: TOKEN } }, error: null })) };
  return { auth, from: vi.fn(() => ({ select: vi.fn(() => builder) })), rpc: vi.fn(async () => ({ data: false, error: null })) } as unknown as AuthClient & KnowledgeBoardReadAuthorizationClient;
}

type AuthClient = { auth: { getUser: ReturnType<typeof vi.fn>; getSession: ReturnType<typeof vi.fn> } };

function request(body: unknown) { return new Request('http://localhost/api/boards/' + BOARD_ID + '/knowledge/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function warmRequest(body?: string) { return new Request('http://localhost/api/boards/' + BOARD_ID + '/knowledge/warm', { method: 'POST', ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }) }); }
function context(id = BOARD_ID) { return { params: Promise.resolve({ id }) }; }

describe('Knowledge search proxy route service', () => {
  it('returns 401 without auth and performs no authorization/upstream call', async () => {
    const state = client(); state.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const auth = vi.fn(async () => state);
    const fetchImpl = vi.fn();
    const response = await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: auth as never, serviceUrl: 'https://query.example', fetchImpl });
    expect(response.status).toBe(401); expect(auth).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed/unknown client fields before upstream', async () => {
    const state = client(); const fetchImpl = vi.fn();
    for (const body of [{ query: '' }, { query: 'q', boardId: 'caller-board' }, { query: 'q', model: 'other' }, { query: 'q', minSimilarity: 0.5 }, { query: 'q', limit: 11 }]) {
      expect((await handleKnowledgeSearchProxy(request(body), context(), state, { serviceUrl: 'https://query.example', fetchImpl })).status).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('authorizes locally before upstream and forwards only the fixed proxy payload/token', async () => {
    const state = client(); const authorize = vi.fn(async () => true); const fetchImpl = vi.fn(async (_url, init) => new Response(JSON.stringify({ results: [{ chunkId: 'c', documentId: 'd', originalFilename: 'f', pageStart: 1, pageEnd: 1, chunkIndex: 0, text: 't', sourceLocators: [], similarity: 0.9, vector: [1] }] }), { status: 200 }));
    const response = await handleKnowledgeSearchProxy(request({ query: 'recovery', limit: 5 }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl });
    expect(response.status).toBe(200); expect(authorize).toHaveBeenCalledWith(state, BOARD_ID, USER_ID); expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ boardId: BOARD_ID, query: 'recovery', limit: 5 });
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });
    const payload = await response.json(); expect(JSON.stringify(payload)).not.toContain('similarity'); expect(JSON.stringify(payload)).not.toContain('vector'); expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });

  it('does not call upstream for forbidden/error authorization and maps upstream failures', async () => {
    const state = client(); const authorize = vi.fn(async () => false); const fetchImpl = vi.fn();
    expect((await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(403); expect(fetchImpl).not.toHaveBeenCalled();
    authorize.mockRejectedValue(new Error('unavailable'));
    expect((await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(503); expect(fetchImpl).not.toHaveBeenCalled();
    authorize.mockResolvedValue(true); fetchImpl.mockRejectedValue(new Error('timeout'));
    expect((await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(503);
  });

  it('fails closed for missing/invalid service URL and applies no-store', async () => {
    const state = client(); const authorize = vi.fn(async () => true); const fetchImpl = vi.fn();
    expect((await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, fetchImpl })).status).toBe(503);
    expect((await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'http://public.example', fetchImpl })).status).toBe(503);
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const response = await handleKnowledgeSearchProxy(request({ query: 'q' }), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('warms only after auth and board authorization, forwarding only boardId', async () => {
    const state = client();
    const order: string[] = [];
    state.auth.getUser.mockImplementation(async () => { order.push('getUser'); return { data: { user: { id: USER_ID } }, error: null }; });
    state.auth.getSession.mockImplementation(async () => { order.push('getSession'); return { data: { session: { access_token: TOKEN } }, error: null }; });
    const authorize = vi.fn(async (_client, boardId, userId) => { order.push('authorize'); expect(boardId).toBe(BOARD_ID); expect(userId).toBe(USER_ID); return true; });
    const fetchImpl = vi.fn(async (_url, init) => { order.push('upstream'); return new Response(JSON.stringify({ ok: true, secret: 'hidden' }), { status: 200 }); });
    const response = await handleKnowledgeWarmProxy(warmRequest(), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(order).toEqual(['getUser', 'getSession', 'authorize', 'upstream']);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ boardId: BOARD_ID });
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await handleKnowledgeWarmProxy(warmRequest(JSON.stringify({ query: 'secret' })), context(), state, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps warm failures generic and fails closed before upstream', async () => {
    const forbidden = client();
    const authorize = vi.fn(async () => false);
    const fetchImpl = vi.fn();
    expect((await handleKnowledgeWarmProxy(warmRequest(), context('not-a-uuid'), forbidden, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(400);
    expect((await handleKnowledgeWarmProxy(warmRequest(), context(), forbidden, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    forbidden.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await handleKnowledgeWarmProxy(warmRequest(), context(), forbidden, { canReadBoardKnowledge: authorize as never, serviceUrl: 'https://query.example', fetchImpl })).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
