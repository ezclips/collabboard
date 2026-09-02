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
/**
 * Imported from the SAME module registry as the route, after resetModules.
 * A copy loaded before the reset is a different class object, and the route's
 * `instanceof AIProviderError` would miss it -- the test would then be
 * measuring the harness rather than the error handling.
 */
let AIProviderError: typeof import('./providers/errors').AIProviderError;

const ok = <T>(value: T) => ({ ok: true as const, value });
const fail = (code: string) => ({ ok: false as const, error: { code, message: code } });

const thread = { id: THREAD_ID, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: 'c', updatedAt: 'u' };
const assistantRow = {
  id: 'a1', threadId: THREAD_ID, role: 'assistant' as const, content: 'answer',
  provider: 'deepseek', model: 'deepseek-chat', context: null, citations: null, createdAt: 'now',
};

/** A repository whose behaviour each test tunes; every call is recorded. */
function repository(overrides: Record<string, unknown> = {}) {
  const appended: unknown[] = [];
  const repo = {
    appended,
    createThread: vi.fn(async () => ok(thread)),
    getThread: vi.fn(async () => ok(thread)),
    listMessages: vi.fn(async () => ok([
      { ...assistantRow, id: 'm0', role: 'user' as const, content: 'earlier', provider: null, model: null },
      { ...assistantRow, id: 'm1', role: 'user' as const, content: 'hello', provider: null, model: null },
    ])),
    appendMessage: vi.fn(async (_u: unknown, _b: unknown, _t: unknown, input: unknown) => {
      appended.push(input);
      const typed = input as { role: string; content: string; provider?: string; model?: string };
      return ok({ ...assistantRow, role: typed.role, content: typed.content, provider: typed.provider ?? null, model: typed.model ?? null });
    }),
    ...overrides,
  };
  mocks.createBoardAiThreadRepository.mockReturnValue(repo);
  return repo;
}

function session(user: { id: string } | null = { id: USER_ID }) {
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
  });
}

const post = (body: unknown, boardId = BOARD_ID) => route.POST(
  new Request('http://localhost/api/boards/' + boardId + '/ai/chat', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: boardId }) },
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  session();
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.executeBoardAiChat.mockResolvedValue({ text: 'answer', provider: 'deepseek', model: 'deepseek-chat' });
  repository();
  ({ AIProviderError } = await import('./providers/errors'));
  route = await import('../../../app/api/boards/[id]/ai/chat/route');
});

describe('1-4. authentication and board authorization', () => {
  it('1. unauthenticated is 401 and never reaches the provider', async () => {
    session(null);
    const response = await post({ message: 'hi' });
    expect(response.status).toBe(401);
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });

  it('2. a user without board read is 403 and never reaches the provider', async () => {
    mocks.canReadBoardKnowledge.mockResolvedValue(false);
    const response = await post({ message: 'hi' });
    expect(response.status).toBe(403);
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });

  it('3-4. any reader -- owner or viewer -- may chat privately', async () => {
    // The route asks only "can this user READ the board", which is what
    // is_board_member answers for a viewer too. No editor check exists here.
    const response = await post({ message: 'hi' });
    expect(response.status).toBe(200);
    expect(mocks.canReadBoardKnowledge).toHaveBeenCalledTimes(1);
    expect(mocks.canReadBoardKnowledge.mock.calls[0].slice(1)).toEqual([BOARD_ID, USER_ID]);
  });

  it('uses the caller session client, never an admin client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/boards/[id]/ai/chat/route.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('service_role');
    expect(source).toContain('createRouteHandlerClient');
  });
});

describe('5-8. thread scoping', () => {
  it('5. no threadId creates a private thread for this user and board', async () => {
    const repo = repository();
    const response = await post({ message: 'hi' });
    expect(await response.json()).toMatchObject({ threadId: THREAD_ID });
    expect(repo.createThread).toHaveBeenCalledTimes(1);
    expect(repo.createThread.mock.calls[0].slice(0, 2)).toEqual([USER_ID, BOARD_ID]);
  });

  it('6. a supplied threadId is resolved through user + board + thread', async () => {
    const repo = repository();
    await post({ threadId: THREAD_ID, message: 'hi' });
    expect(repo.getThread).toHaveBeenCalledTimes(1);
    expect(repo.getThread.mock.calls[0]).toEqual([USER_ID, BOARD_ID, THREAD_ID]);
    expect(repo.createThread).not.toHaveBeenCalled();
  });

  it('7-8. a thread of another user or board is 404, disclosing nothing', async () => {
    // The scoped read returns null for both cases and the route cannot tell
    // them apart, so neither can the response.
    repository({ getThread: vi.fn(async () => ok(null)) });
    const other = await post({ threadId: THREAD_ID, message: 'hi' }, OTHER_BOARD);
    expect(other.status).toBe(404);
    const body = await other.json();
    expect(JSON.stringify(body)).not.toMatch(/other user|another board|exists/i);
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });
});

describe('16-20. persistence order and metadata', () => {
  it('16. the user message is persisted before generation', async () => {
    const repo = repository();
    await post({ message: 'hello' });
    expect(repo.appended[0]).toEqual({ role: 'user', content: 'hello' });
    const userAppendOrder = repo.appendMessage.mock.invocationCallOrder[0];
    expect(userAppendOrder).toBeLessThan(mocks.executeBoardAiChat.mock.invocationCallOrder[0]);
  });

  it('17. persisted history reaches the model in chronological order', async () => {
    await post({ message: 'hello' });
    const turns = mocks.executeBoardAiChat.mock.calls[0][1];
    expect(turns).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('18-19. the assistant reply persists with provider and model; the user turn has neither', async () => {
    const repo = repository();
    await post({ message: 'hello' });
    expect(repo.appended[1]).toEqual({
      role: 'assistant', content: 'answer', provider: 'deepseek', model: 'deepseek-chat',
    });
    expect(repo.appended[0]).not.toHaveProperty('provider');
  });

  it('20. context and citations are never written in this slice', async () => {
    const repo = repository();
    await post({ message: 'hello' });
    for (const input of repo.appended as Record<string, unknown>[]) {
      expect(input.context).toBeUndefined();
      expect(input.citations).toBeUndefined();
    }
  });

  it('25. no board, post or document content is loaded automatically', async () => {
    const repo = repository();
    await post({ message: 'hello' });
    // The only reads are the caller's own thread and its messages.
    expect(repo.listMessages).toHaveBeenCalledTimes(1);
    const turns = mocks.executeBoardAiChat.mock.calls[0][1] as { content: string }[];
    expect(turns.every((t) => ['earlier', 'hello'].includes(t.content))).toBe(true);
  });
});

describe('26-30. failure behaviour', () => {
  it('26. a provider failure leaves the user message and writes no assistant row', async () => {
    const repo = repository();
    mocks.executeBoardAiChat.mockRejectedValue(new AIProviderError('provider_unavailable'));
    const response = await post({ message: 'hello' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(repo.appended).toHaveLength(1);
    expect(repo.appended[0]).toMatchObject({ role: 'user' });
  });

  it('26b. an unexpected failure invents no assistant answer either', async () => {
    const repo = repository();
    mocks.executeBoardAiChat.mockRejectedValue(new Error('socket hang up'));
    const response = await post({ message: 'hello' });
    expect(response.status).toBe(502);
    expect(repo.appended).toHaveLength(1);
  });

  it('an empty model result is not persisted as an answer', async () => {
    const repo = repository();
    mocks.executeBoardAiChat.mockResolvedValue({ text: '   ', provider: 'deepseek', model: 'm' });
    const response = await post({ message: 'hello' });
    expect(response.status).toBe(502);
    expect(repo.appended).toHaveLength(1);
  });

  it('28. rate limiting stops the provider being invoked', async () => {
    for (let i = 0; i < 20; i += 1) await post({ message: 'hello' });
    mocks.executeBoardAiChat.mockClear();
    const limited = await post({ message: 'hello' });
    expect(limited.status).toBe(429);
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });

  it('29. validation failure has no thread, message or provider side effect', async () => {
    const repo = repository();
    for (const body of [{}, { message: '' }, { message: '   ' }, { message: 'x'.repeat(5000) }, { threadId: 'not-a-uuid', message: 'x' }]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(repo.createThread).not.toHaveBeenCalled();
    expect(repo.appendMessage).not.toHaveBeenCalled();
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });

  it('30. a provider error never leaks a key, a body or a stack', async () => {
    mocks.executeBoardAiChat.mockRejectedValue(new AIProviderError('invalid_configuration', { provider: 'openai' }));
    const response = await post({ message: 'hello' });
    const body = JSON.stringify(await response.json());
    for (const secret of ['sk-', 'Bearer', 'stack', 'at Object.', 'api_key']) {
      expect(body).not.toContain(secret);
    }
    // Category travels, because a client must be able to say "fix your key".
    expect(body).toContain('invalid_configuration');
  });
});

describe('context fields belong to a later slice and are rejected, not ignored', () => {
  it('refuses every future context field rather than silently dropping it', async () => {
    const repo = repository();
    for (const extra of [
      { knowledgeDocumentId: THREAD_ID }, { pageNumber: 3 }, { selectedText: 'x' },
      { charStart: 0 }, { charEnd: 5 }, { postId: THREAD_ID },
      { context: { a: 1 } }, { citations: [] },
      // And nothing may name execution.
      { provider: 'openai' }, { model: 'gpt-4' }, { apiKey: 'sk-x' },
    ]) {
      const response = await post({ message: 'hello', ...extra });
      expect(response.status, JSON.stringify(extra)).toBe(400);
    }
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
    expect(repo.appendMessage).not.toHaveBeenCalled();
  });
});

describe('9-15. provider execution is the existing authority', () => {
  it('9. the route passes the invoking user and the existing repositories', async () => {
    await post({ message: 'hello' });
    expect(mocks.executeBoardAiChat).toHaveBeenCalledTimes(1);
    const [userId, , deps] = mocks.executeBoardAiChat.mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(mocks.createAIRolePreferenceRepository).toHaveBeenCalled();
    expect(mocks.createAIProviderCredentialRepository).toHaveBeenCalled();
    expect(Object.keys(deps as object).sort()).toEqual(['credentials', 'preferences']);
  });

  it('14-15. no credential appears in the response or in a persisted message', async () => {
    const repo = repository();
    mocks.executeBoardAiChat.mockResolvedValue({ text: 'answer', provider: 'openai', model: 'gpt-4o' });
    const response = await post({ message: 'hello' });
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/apiKey|api_key|sk-|keyHint|connectionId/);
    expect(JSON.stringify(repo.appended)).not.toMatch(/apiKey|api_key|sk-|keyHint|connectionId/);
    // Names only.
    expect(body).toContain('openai');
  });
});
