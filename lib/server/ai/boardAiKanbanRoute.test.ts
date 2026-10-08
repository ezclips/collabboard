import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  createBoardAiThreadRepository: vi.fn(),
  executeBoardAiChat: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
  checkBoardAiCredits: vi.fn(),
  recordBoardAiCreditUsage: vi.fn(),
  getSupabaseAdmin: vi.fn(),
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
// The admin client exists ONLY inside the byte reader. It must never be reached
// for a Kanban turn, so it is a spy that fails the test if called.
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));
vi.mock('@/lib/server/billing/aiCredits', () => ({
  checkBoardAiCredits: mocks.checkBoardAiCredits,
  recordBoardAiCreditUsage: mocks.recordBoardAiCreditUsage,
  allowByokFor: (d: { kind: string }) => d.kind === 'byok',
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const CARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CARD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COL_TODO = 'c0111111-1111-4111-8111-111111111111';
const ROW_LOW = 'd0222222-2222-4222-8222-222222222222';
const USER_A = 'e0111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

let route: typeof import('../../../app/api/boards/[id]/ai/chat/route');
let touchedTables: string[];

/**
 * The CALLER'S client, standing in for the authenticated session. Its `from`
 * serves the kanban tables directly, which is what makes "the reads go through
 * the caller" a property of the test rather than a claim.
 */
function sessionClient() {
  const tables: Record<string, Row[]> = {
    boards: [{ id: BOARD_ID, layout: 'kanban' }],
    kanban_columns: [{ id: COL_TODO, name: 'To do', order_index: 0, canvas_id: BOARD_ID }],
    kanban_swimlanes: [{ id: ROW_LOW, name: 'Low', order_index: 0, canvas_id: BOARD_ID }],
    kanban_cards: [
      {
        id: CARD_A, title: 'Ship the release', content: 'Cut the branch.',
        column_id: COL_TODO, swimlane_id: ROW_LOW, priority: 3, status: 'doing',
        project_id: null, score: 40, date_started: null, date_due: '2026-10-10T00:00:00+00:00',
        assignee_id: null, order_index: 1, canvas_id: BOARD_ID,
      },
      {
        id: CARD_B, title: 'Write docs', content: 'Body of B',
        column_id: COL_TODO, swimlane_id: ROW_LOW, priority: 1, status: 'todo',
        project_id: null, score: null, date_started: null, date_due: null,
        assignee_id: null, order_index: 0, canvas_id: BOARD_ID,
      },
    ],
    kanban_links: [],
    kanban_comments: [{ card_id: CARD_A, user_id: USER_A, text: 'ping', created_at: '2026-10-02T00:00:00+00:00' }],
    kanban_card_assignees: [],
    kanban_board_members: [{ canvas_id: BOARD_ID, user_id: USER_A, display_name: 'Ada', email: 'ada@example.com' }],
  };
  touchedTables = [];
  const from = (table: string) => {
    touchedTables.push(table);
    return {
      select() {
        const eq: Record<string, unknown> = {};
        const inFilter: Record<string, unknown[]> = {};
        const rows = tables[table] ?? [];
        const matched = () => rows.filter((row) =>
          Object.entries(eq).every(([key, value]) => row[key] === value)
          && Object.entries(inFilter).every(([key, values]) => values.includes(row[key])));
        const query: Record<string, unknown> = {
          eq(column: string, value: unknown) { eq[column] = value; return query; },
          in(column: string, values: readonly unknown[]) { inFilter[column] = [...values]; return query; },
          order() { return query; },
          limit() { return query; },
          maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
          then(resolve: (value: { data: Row[]; error: null }) => unknown) {
            return Promise.resolve({ data: matched(), error: null }).then(resolve);
          },
        };
        return query;
      },
    };
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
    from,
    // The board-members RPC, on the caller's client like every other read.
    rpc: vi.fn(async () => ({
      data: [{ user_id: USER_A, display_name: 'Ada', email: 'ada@example.com' }],
      error: null,
    })),
  };
}

const ok = <T>(value: T) => ({ ok: true as const, value });
const thread = { id: THREAD_ID, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: 'c', updatedAt: 'u' };

function repository() {
  const appended: Record<string, unknown>[] = [];
  const userRow = {
    id: 'u1', threadId: THREAD_ID, role: 'user' as const, content: 'hello',
    provider: null, model: null, context: null, citations: null, createdAt: 'now',
  };
  const repo = {
    appended,
    createThread: vi.fn(async () => ok(thread)),
    getThread: vi.fn(async () => ok(thread)),
    listMessages: vi.fn(async () => ok([userRow])),
    appendMessage: vi.fn(async (_u: unknown, _b: unknown, _t: unknown, input: Record<string, unknown>) => {
      appended.push(input);
      return ok({ ...userRow, ...input, id: input.role === 'user' ? 'u1' : 'a1' });
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

const modelContext = () =>
  (mocks.executeBoardAiChat.mock.calls[0]?.[3] ?? []) as { type: string; label: string; text: string }[];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.BOARD_AI_PROVENANCE_SIGNING_KEY = Buffer.alloc(32, 13).toString('base64');
  mocks.cookies.mockResolvedValue({});
  mocks.createRouteHandlerClient.mockReturnValue(sessionClient());
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.checkBoardAiCredits.mockResolvedValue({ kind: 'byok' });
  mocks.executeBoardAiChat.mockResolvedValue({
    text: 'Answer.', provider: 'deepseek', model: 'deepseek-chat', source: 'byok',
  });
  repository();
  route = await import('../../../app/api/boards/[id]/ai/chat/route');
});

describe('PATCH-322 a Kanban turn reads through the caller and reaches the model', () => {
  const body = () => ({
    message: 'What is on the board?',
    context: { items: [{ type: 'kanban-board' }, { type: 'kanban-card', cardId: CARD_A }] },
  });

  it('both Kanban blocks reach the model, in the order they were named', async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(modelContext().map((block) => block.type)).toEqual(['kanban-board', 'kanban-card']);
    expect(modelContext()[0].text).toContain('Write docs');
    expect(modelContext()[1].text).toContain('Cut the branch.');
  });

  it('every Kanban read went through the CALLER’S client, never the admin client', async () => {
    await post(body());
    // The caller's client served the reads...
    for (const table of ['boards', 'kanban_cards', 'kanban_columns', 'kanban_swimlanes']) {
      expect(touchedTables, table).toContain(table);
    }
    // ...and the privileged byte reader was never constructed into a call.
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('the schema accepts the new types and still refuses a field that describes one', async () => {
    expect((await post({ message: 'hi', context: { items: [{ type: 'kanban-board', text: 'forged' }] } })).status).toBe(400);
    expect((await post({ message: 'hi', context: { items: [{ type: 'kanban-card', cardId: CARD_A, title: 'forged' }] } })).status).toBe(400);
    expect((await post({ message: 'hi', context: { items: [{ type: 'kanban-card', cardId: 'not-a-uuid' }] } })).status).toBe(400);
  });

  it('the stored envelope keeps the Kanban identities for the chips', async () => {
    const repo = repository();
    await post(body());
    const stored = repo.appended[0].context as { items: Record<string, unknown>[] };
    expect(stored.items.map((item) => item.type)).toEqual(['kanban-board', 'kanban-card']);
    expect(stored.items[1]).toMatchObject({ type: 'kanban-card', cardId: CARD_A, label: 'Ship the release' });
  });
});
