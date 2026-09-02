import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  createBoardAiThreadRepository: vi.fn(),
  executeBoardAiChat: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
vi.mock('@/lib/infra/ai/boardAiThreadRepository', () => ({
  createBoardAiThreadRepository: mocks.createBoardAiThreadRepository,
}));
vi.mock('@/lib/server/ai/boardAiChatExecution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./boardAiChatExecution')>()),
  executeBoardAiChat: mocks.executeBoardAiChat,
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';

type RouteModule = typeof import('../../../app/api/boards/[id]/ai/chat/route');
let route: RouteModule;

const ok = <T>(value: T) => ({ ok: true as const, value });
const notFound = () => ({ ok: false as const, error: { code: 'not_found', message: 'nope' } });
const unavailable = () => ({ ok: false as const, error: { code: 'unavailable', message: 'down' } });

const thread = (id = THREAD_ID, updatedAt = '2026-09-02T10:00:00Z') => ({
  id, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: '2026-09-02T09:00:00Z', updatedAt,
});

function repository(overrides: Record<string, unknown> = {}) {
  const repo = {
    listThreads: vi.fn(async () => ok([thread()])),
    getThread: vi.fn(async () => ok(thread())),
    listMessages: vi.fn(async () => ok([
      { id: 'm1', threadId: THREAD_ID, role: 'user' as const, content: 'first', provider: null, model: null, context: null, citations: null, createdAt: '2026-09-02T09:01:00Z' },
      { id: 'm2', threadId: THREAD_ID, role: 'assistant' as const, content: 'second', provider: 'deepseek', model: 'deepseek-chat', context: null, citations: null, createdAt: '2026-09-02T09:02:00Z' },
    ])),
    createThread: vi.fn(async () => ok(thread())),
    appendMessage: vi.fn(async () => ok({ id: 'a', threadId: THREAD_ID, role: 'assistant' as const, content: 'x', provider: null, model: null, context: null, citations: null, createdAt: 'n' })),
    ...overrides,
  };
  mocks.createBoardAiThreadRepository.mockReturnValue(repo);
  return repo;
}

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('none') })) },
  });
}

const get = (query = '', boardId = BOARD_ID) => route.GET(
  new Request(`http://localhost/api/boards/${boardId}/ai/chat${query}`),
  { params: Promise.resolve({ id: boardId }) },
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  repository();
  route = await import('../../../app/api/boards/[id]/ai/chat/route');
});

describe('1-3. GET authentication and board authorization', () => {
  it('1. unauthenticated is 401 and reads nothing', async () => {
    session(null);
    const repo = repository();
    const response = await get();
    expect(response.status).toBe(401);
    expect(repo.listThreads).not.toHaveBeenCalled();
  });

  it('2. a user without board read is 403 and reads nothing', async () => {
    mocks.canReadBoardKnowledge.mockResolvedValue(false);
    const repo = repository();
    const response = await get();
    expect(response.status).toBe(403);
    expect(repo.listThreads).not.toHaveBeenCalled();
  });

  it('3. a viewer with board read may read their own chats', async () => {
    // Same authority as POST: readability, not editorship.
    const response = await get();
    expect(response.status).toBe(200);
    expect(mocks.canReadBoardKnowledge.mock.calls[0].slice(1)).toEqual([BOARD_ID, USER_ID]);
  });
});

describe('4-5. thread list', () => {
  it('4. lists only this user\'s threads for this board', async () => {
    const repo = repository();
    const response = await get();
    expect(repo.listThreads).toHaveBeenCalledTimes(1);
    // The scope is the argument list, so a foreign thread is unreachable
    // rather than filtered out afterwards.
    expect(repo.listThreads.mock.calls[0]).toEqual([USER_ID, BOARD_ID]);
    const body = await response.json();
    expect(body.threads).toHaveLength(1);
  });

  it('5. carries the ordering field and no messages', async () => {
    const body = await (await get()).json();
    expect(Object.keys(body.threads[0]).sort()).toEqual(['createdAt', 'id', 'title', 'updatedAt']);
    expect(body.threads[0]).not.toHaveProperty('messages');
    // Order itself is the repository's (updated_at DESC); the route re-sorts
    // nothing, so there is one definition of "most recent".
    expect(body).not.toHaveProperty('sort');
  });

  it('a list failure is infrastructure, not a disclosure', async () => {
    repository({ listThreads: vi.fn(async () => unavailable()) });
    const response = await get();
    expect(response.status).toBe(503);
  });
});

describe('6-9. one scoped thread and its messages', () => {
  it('6. resolves through user + board + thread', async () => {
    const repo = repository();
    const response = await get(`?threadId=${THREAD_ID}`);
    expect(response.status).toBe(200);
    expect(repo.listMessages.mock.calls[0]).toEqual([USER_ID, BOARD_ID, THREAD_ID]);
    expect(repo.getThread.mock.calls[0]).toEqual([USER_ID, BOARD_ID, THREAD_ID]);
  });

  it('7-8. another user\'s or another board\'s thread is an identical 404', async () => {
    repository({ listMessages: vi.fn(async () => notFound()) });
    const foreign = await get(`?threadId=${THREAD_ID}`);
    expect(foreign.status).toBe(404);
    const other = await get(`?threadId=${THREAD_ID}`, OTHER_BOARD);
    expect(other.status).toBe(404);
    // Byte-identical bodies: nothing distinguishes "not yours" from "not here".
    expect(await foreign.json()).toEqual(await other.json());
  });

  it('a malformed thread id is refused the same way, before any read', async () => {
    const repo = repository();
    const response = await get('?threadId=not-a-uuid');
    expect(response.status).toBe(404);
    expect(repo.listMessages).not.toHaveBeenCalled();
  });

  it('9. messages come back chronological, oldest first', async () => {
    const body = await (await get(`?threadId=${THREAD_ID}`)).json();
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual(['first', 'second']);
  });
});

describe('10. the read projection carries nothing private', () => {
  it('sends only display fields, never storage or credential ones', async () => {
    const body = await (await get(`?threadId=${THREAD_ID}`)).json();
    expect(Object.keys(body.messages[0]).sort())
      .toEqual(['content', 'context', 'createdAt', 'id', 'model', 'provider', 'role']);
    // `context` is the re-derived view, not the stored row -- and it is null
    // for a message with no attachment, as here.
    expect(body.messages[0].context).toBeNull();
    // threadId and citations are storage; connectionId and keyHint do not
    // exist on these rows at all, and must not appear by accident either.
    const serialized = JSON.stringify(body);
    for (const forbidden of ['threadId', 'citations', 'connectionId', 'keyHint', 'apiKey', 'userId']) {
      expect(serialized, `${forbidden} must not be sent`).not.toContain(forbidden);
    }
  });

  it('never reaches for an admin client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/boards/[id]/ai/chat/route.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('service_role');
  });
});

describe('11-13. POST behaviour is unchanged except the approved continuity detail', () => {
  it('12-13. an assistant-persistence failure names the thread without claiming the reply', async () => {
    const repo = repository({
      appendMessage: vi.fn()
        // The user turn stores; the assistant turn does not.
        .mockImplementationOnce(async () => ok({ id: 'u1', threadId: THREAD_ID, role: 'user', content: 'hi', provider: null, model: null, context: null, citations: null, createdAt: 'n' }))
        .mockImplementationOnce(async () => unavailable()),
      listMessages: vi.fn(async () => ok([])),
    });
    mocks.executeBoardAiChat.mockResolvedValue({ text: 'answer', provider: 'deepseek', model: 'deepseek-chat' });

    const response = await route.POST(
      new Request(`http://localhost/api/boards/${BOARD_ID}/ai/chat`, {
        method: 'POST', body: JSON.stringify({ message: 'hi' }), headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: BOARD_ID }) },
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    // The id travels so a NEW thread is not stranded by the failure...
    expect(body.threadId).toBe(THREAD_ID);
    // ...but nothing here reports a durable assistant turn.
    expect(body).not.toHaveProperty('message');
    expect(JSON.stringify(body)).not.toContain('answer');
    expect(repo.appendMessage).toHaveBeenCalledTimes(2);
  });
});
