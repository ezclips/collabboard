import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  createBoardAiThreadRepository: vi.fn(),
  executeBoardAiChat: vi.fn(),
  resolveBoardAiChatContext: vi.fn(),
  resolveHistoricalBoardAiChatContext: vi.fn(),
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
vi.mock('@/lib/server/ai/boardAiChatContext', () => ({
  resolveBoardAiChatContext: mocks.resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext: mocks.resolveHistoricalBoardAiChatContext,
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '44444444-4444-4444-8444-444444444444';
const PAD_ID = '55555555-5555-4555-8555-555555555555';

let route: typeof import('../../../app/api/boards/[id]/ai/chat/route');

const ok = <T>(value: T) => ({ ok: true as const, value });
const err = (code: string) => ({ ok: false as const, error: { code, message: code } });

const thread = { id: THREAD_ID, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: 'c', updatedAt: 'u' };
const row = {
  id: 'a1', threadId: THREAD_ID, role: 'assistant' as const, content: 'answer',
  provider: null, model: null, context: null, citations: null, createdAt: 'now',
};

const pageBlock = {
  type: 'knowledge-page' as const, label: 'source.pdf - page 2',
  knowledgeDocumentId: DOC_ID, pageNumber: 2, text: 'AUTHORITATIVE page two text',
};

/** History defaults to just the message this request persists. */
function repository(history: Record<string, unknown>[] | null = null) {
  const appended: Record<string, unknown>[] = [];
  let userRow: Record<string, unknown> = { ...row, id: 'u1', role: 'user', content: 'hello' };
  const repo = {
    appended,
    createThread: vi.fn(async () => ok(thread)),
    getThread: vi.fn(async () => ok(thread)),
    listMessages: vi.fn(async () => ok(history ?? [userRow])),
    appendMessage: vi.fn(async (_u: unknown, _b: unknown, _t: unknown, input: Record<string, unknown>) => {
      appended.push(input);
      const stored = { ...row, ...input, id: input.role === 'user' ? 'u1' : 'a1' };
      if (input.role === 'user') userRow = stored;
      return ok(stored);
    }),
  };
  mocks.createBoardAiThreadRepository.mockReturnValue(repo);
  return repo;
}

const post = (body: unknown) => route.POST(
  new Request(`http://localhost/api/boards/${BOARD_ID}/ai/chat`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

const get = (threadId: string) => route.GET(
  new Request(`http://localhost/api/boards/${BOARD_ID}/ai/chat?threadId=${threadId}`),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

/** The blocks that actually reached the model on the last call. */
const modelContext = () =>
  (mocks.executeBoardAiChat.mock.calls[0]?.[3] ?? []) as { label: string; text: string }[];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
  });
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.executeBoardAiChat.mockResolvedValue({ text: 'answer', provider: 'deepseek', model: 'deepseek-chat' });
  mocks.resolveBoardAiChatContext.mockResolvedValue(ok([pageBlock]));
  mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([]);
  repository();
  route = await import('../../../app/api/boards/[id]/ai/chat/route');
});

const attach = (items: unknown[]) => ({ message: 'hello', context: { items } });

describe('1,2,8,14,16. context is authorized against the ROUTE board, before any write', () => {
  it('resolves against the board in the URL, not one the body names', async () => {
    await post(attach([{ type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2 }]));
    expect(mocks.resolveBoardAiChatContext.mock.calls[0][1]).toBe(BOARD_ID);
  });

  it('14,16. an unauthorized source is 404 and leaves NOTHING behind', async () => {
    const repo = repository();
    mocks.resolveBoardAiChatContext.mockResolvedValue(err('not_found'));
    const response = await post(attach([{ type: 'padlet', padletId: PAD_ID }]));

    expect(response.status).toBe(404);
    // A user probing ids must not litter their board with orphan threads.
    expect(repo.createThread).not.toHaveBeenCalled();
    expect(repo.appendMessage).not.toHaveBeenCalled();
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Context is not available.' });
  });

  it('answers the same way whatever the reason, disclosing nothing', async () => {
    for (const [code, status] of [
      ['not_found', 404], ['validation', 400], ['conflict', 409], ['infrastructure', 503],
    ] as const) {
      vi.clearAllMocks();
      repository();
      mocks.resolveBoardAiChatContext.mockResolvedValue(err(code));
      const response = await post(attach([{ type: 'padlet', padletId: PAD_ID }]));
      expect(response.status, code).toBe(status);
      // The body is identical in all four cases.
      expect(await response.json()).toEqual({ error: 'Context is not available.' });
    }
  });
});

describe('23,28,29. the request may name a source, never describe one', () => {
  it('23. refuses any request field that would supply content', async () => {
    const repo = repository();
    for (const item of [
      { type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2, text: 'forged' },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2, label: 'forged' },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2, excerpt: 'forged' },
      { type: 'padlet', padletId: PAD_ID, content: 'forged' },
      { type: 'padlet', padletId: PAD_ID, title: 'forged' },
      // Nor a type the server does not resolve, nor a non-uuid identity.
      { type: 'board', boardId: BOARD_ID },
      { type: 'knowledge-page', knowledgeDocumentId: 'not-a-uuid', pageNumber: 2 },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 0 },
    ]) {
      const response = await post(attach([item]));
      expect(response.status, JSON.stringify(item)).toBe(400);
    }
    expect(repo.appendMessage).not.toHaveBeenCalled();
    expect(mocks.resolveBoardAiChatContext).not.toHaveBeenCalled();
  });

  it('refuses an empty or oversized attachment list', async () => {
    expect((await post(attach([]))).status).toBe(400);
    const many = Array.from({ length: 9 }, () => ({ type: 'padlet', padletId: PAD_ID }));
    expect((await post(attach(many))).status).toBe(400);
  });

  it('28,29. persists the SERVER envelope, built from what it resolved', async () => {
    const repo = repository();
    await post(attach([{ type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2 }]));

    const stored = repo.appended[0].context as { version: number; items: Record<string, unknown>[] };
    expect(stored.version).toBe(1);
    expect(stored.items[0]).toMatchObject({
      type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2,
      // The resolver's label and its own excerpt -- nothing the client sent.
      label: 'source.pdf - page 2', excerpt: 'AUTHORITATIVE page two text',
    });
  });

  it('31. the assistant reply carries no context of its own', async () => {
    const repo = repository();
    await post(attach([{ type: 'padlet', padletId: PAD_ID }]));
    const assistant = repo.appended.find((input) => input.role === 'assistant')!;
    expect(assistant.context ?? null).toBeNull();
    expect(assistant.citations).toBeUndefined();
  });
});

describe('35-37,41. what reaches the model is what the server just read', () => {
  it('35,36. authorized blocks travel as a separate argument, with their text', async () => {
    await post(attach([{ type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2 }]));
    expect(modelContext()).toEqual([pageBlock]);
  });

  it('37,45. with no attachment the model gets no context at all', async () => {
    const repo = repository();
    await post({ message: 'hello' });
    expect(modelContext()).toEqual([]);
    expect(mocks.resolveBoardAiChatContext).not.toHaveBeenCalled();
    // 46. And nothing was swept off the board on the user's behalf.
    expect(repo.listMessages).toHaveBeenCalledTimes(1);
  });

  it('41. the current attachment leads, so history can never crowd it out', async () => {
    const old = { ...pageBlock, label: 'OLD', text: 'old text' };
    mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([old]);
    repository([
      {
        ...row, id: 'm0', role: 'user', content: 'earlier',
        context: { version: 1, items: [{ type: 'padlet', padletId: PAD_ID }] },
      },
      { ...row, id: 'u1', role: 'user', content: 'hello' },
    ]);
    await post(attach([{ type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: 2 }]));
    expect(modelContext().map((block) => block.label)).toEqual(['source.pdf - page 2', 'OLD']);
  });
});

describe('24,26,43,44. history is re-authorized from identity alone', () => {
  const forged = {
    ...row, id: 'm0', role: 'user' as const, content: 'earlier',
    context: {
      version: 1,
      items: [{
        type: 'padlet', padletId: PAD_ID,
        label: 'FORGED LABEL', excerpt: 'FORGED CONTENT THE USER TYPED',
      }],
    },
  };

  it('26,43. the stored label and excerpt are not what gets resolved', async () => {
    repository([forged, { ...row, id: 'u1', role: 'user', content: 'hello' }]);
    await post({ message: 'hello' });

    const requested = mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2];
    // Identity only: the forged display strings never leave the row.
    expect(requested).toEqual([{ type: 'padlet', padletId: PAD_ID }]);
    expect(JSON.stringify(requested)).not.toContain('FORGED');
  });

  it('44. the message being sent is not re-resolved as its own history', async () => {
    repository([
      forged,
      {
        ...row, id: 'u1', role: 'user', content: 'hello',
        context: { version: 1, items: [{ type: 'padlet', padletId: PAD_ID }] },
      },
    ]);
    await post(attach([{ type: 'padlet', padletId: PAD_ID }]));
    // Exactly one historical item -- the older row, not the row just written.
    expect(mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2]).toHaveLength(1);
  });

  it('24. a source revoked since it was attached simply stops arriving', async () => {
    repository([forged, { ...row, id: 'u1', role: 'user', content: 'hello' }]);
    mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([]);
    const response = await post({ message: 'hello' });
    // The conversation still works; the content is just gone.
    expect(response.status).toBe(200);
    expect(modelContext()).toEqual([]);
  });
});

describe('9-18. history is bounded BEFORE any source is read', () => {
  const page = (n: number) => ({ type: 'knowledge-page', knowledgeDocumentId: DOC_ID, pageNumber: n });
  const envelope = (items: unknown[]) => ({ version: 1, items });

  /** A thread of `count` user messages, each naming `perMessage` sources. */
  const thread = (count: number, perMessage: (m: number) => unknown[]) => repository([
    ...Array.from({ length: count }, (_, m) => ({
      ...row, id: `m${m}`, role: 'user' as const, content: `turn ${m}`,
      context: envelope(perMessage(m)),
    })),
    { ...row, id: 'u1', role: 'user' as const, content: 'hello' },
  ]);

  it('9,10,11. a 200-message thread resolves at most 8 identities', async () => {
    // Eight hundred distinct sources named across the thread.
    thread(200, (m) => Array.from({ length: 4 }, (_, i) => page(m * 4 + i + 1)));
    await post({ message: 'hello', threadId: THREAD_ID });

    const requested = mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2] as { pageNumber: number }[];
    expect(requested).toHaveLength(8);
    // The ninth distinct identity never reaches the resolver, so it is never
    // read: the work is constant, not a function of thread length.
    expect(requested.every((item) => item.pageNumber <= 800)).toBe(true);
    expect(requested).not.toContainEqual(expect.objectContaining({ pageNumber: 9 }));
  });

  it('12. the newest turns are the ones that get resolved', async () => {
    // Message 199 is the newest, so its page 800 leads.
    thread(200, (m) => [page(m + 1)]);
    await post({ message: 'hello', threadId: THREAD_ID });
    const requested = mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2] as { pageNumber: number }[];
    expect(requested[0].pageNumber).toBe(200);
    expect(requested.map((item) => item.pageNumber)).toEqual([200, 199, 198, 197, 196, 195, 194, 193]);
  });

  it('13,14. one source re-attached 200 times is resolved once', async () => {
    thread(200, () => [page(7)]);
    await post({ message: 'hello', threadId: THREAD_ID });
    expect(mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2]).toEqual([page(7)]);
  });

  it('15,16. the current 4 attachments are separate from the historical 8', async () => {
    thread(50, (m) => [page(m + 100)]);
    const items = [
      { type: 'padlet', padletId: PAD_ID },
      page(1), page(2), page(3),
    ];
    mocks.resolveBoardAiChatContext.mockResolvedValue(ok(items.map((_, i) => ({
      ...pageBlock, label: `CURRENT-${i}`,
    }))));
    const response = await post({ message: 'hello', threadId: THREAD_ID, context: { items } });

    expect(response.status).toBe(200);
    // Four current attachments accepted, and eight historical still selected.
    expect(mocks.resolveBoardAiChatContext.mock.calls[0][2]).toHaveLength(4);
    expect(mocks.resolveHistoricalBoardAiChatContext.mock.calls[0][2]).toHaveLength(8);
  });

  it('17,18. the final budget still applies, and the oldest history drops first', async () => {
    thread(20, (m) => [page(m + 1)]);
    // Each block alone fills the single-block clamp, so the 14k total decides.
    const big = (label: string) => ({ ...pageBlock, label, text: 'x'.repeat(6_000) });
    mocks.resolveBoardAiChatContext.mockResolvedValue(ok([big('CURRENT')]));
    mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([
      big('NEWEST-HISTORY'), big('OLDER-HISTORY'), big('OLDEST-HISTORY'),
    ]);
    await post({ message: 'hello', threadId: THREAD_ID, context: { items: [page(1)] } });

    const reached = modelContext().map((block) => block.label);
    expect(reached).toEqual(['CURRENT', 'NEWEST-HISTORY']);
    expect(modelContext().reduce((n, block) => n + block.text.length, 0)).toBeLessThanOrEqual(14_000);
  });

  it('7. a thread full of unsupported stored context still answers', async () => {
    thread(20, () => [{ type: 'padlet', padletId: PAD_ID }]);
    // Everything the history names now resolves to nothing.
    mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([]);
    const response = await post({ message: 'hello', threadId: THREAD_ID });
    expect(response.status).toBe(200);
    expect(modelContext()).toEqual([]);
  });
});

describe('3,4. an unsupported CURRENT post type has no side effects', () => {
  it('is refused before a thread, a message or a provider call', async () => {
    const repo = repository();
    // What the narrowed resolver now answers for todo and card.
    mocks.resolveBoardAiChatContext.mockResolvedValue(err('validation'));
    const response = await post(attach([{ type: 'padlet', padletId: PAD_ID }]));

    expect(response.status).toBe(400);
    expect(repo.createThread).not.toHaveBeenCalled();
    expect(repo.appendMessage).not.toHaveBeenCalled();
    expect(mocks.executeBoardAiChat).not.toHaveBeenCalled();
  });
});

describe('32-34. reading a thread back re-derives the context view', () => {
  it('returns contract fields only, never the raw stored row', async () => {
    repository([{
      ...row, id: 'u1', role: 'user', content: 'hello',
      context: {
        version: 1,
        items: [{
          type: 'padlet', padletId: PAD_ID, label: 'My note', excerpt: 'hello',
          signedUrl: 'https://leak.example', apiKey: 'sk-must-never-travel',
        }],
      },
    }]);
    const body = await (await get(THREAD_ID)).json();

    expect(body.messages[0].context.items[0]).toEqual({
      type: 'padlet', padletId: PAD_ID, label: 'My note', excerpt: 'hello',
    });
    const serialized = JSON.stringify(body);
    for (const leak of ['signedUrl', 'apiKey', 'sk-', 'leak.example']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('a message with no attachment reads back as no context', async () => {
    repository([{ ...row, id: 'u1', role: 'user', content: 'hello', context: null }]);
    const body = await (await get(THREAD_ID)).json();
    expect(body.messages[0].context).toBeNull();
  });
});
