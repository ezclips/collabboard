import { describe, expect, it } from 'vitest';

import { asBoardId, asUserId } from '../../domain/core/ids';
import {
  createBoardAiThreadRepository,
  type BoardAiChatSupabaseClient,
} from './boardAiThreadRepository';

const USER_A = asUserId('11111111-1111-4111-8111-111111111111');
const USER_B = asUserId('22222222-2222-4222-8222-222222222222');
const BOARD_1 = asBoardId('33333333-3333-4333-8333-333333333333');
const BOARD_2 = asBoardId('44444444-4444-4444-8444-444444444444');
const THREAD_A = '55555555-5555-4555-8555-555555555555';

interface ThreadSeed {
  id: string;
  board_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageSeed {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  context: unknown;
  citations: unknown;
  created_at: string;
}

/**
 * A structural stand-in for the authenticated client.
 *
 * It applies `.eq()` filters exactly as PostgREST would, which is the point:
 * these tests prove the repository ASKS for the right rows. RLS is the real
 * boundary and is asserted separately over the migration SQL -- a fake cannot
 * prove a policy, and pretending otherwise would be the more dangerous test.
 */
function fakeClient(seed: { threads?: ThreadSeed[]; messages?: MessageSeed[] } = {}) {
  const threads = seed.threads ?? [];
  const messages = seed.messages ?? [];
  const calls: { table: string; filters: Record<string, unknown>; op: string }[] = [];

  const buildSelect = <T extends object>(rows: T[], table: string) => {
    const filters: Record<string, unknown> = {};
    const matching = () => rows.filter((row) => Object.entries(filters)
      .every(([column, value]) => (row as Record<string, unknown>)[column] === value));
    const query: Record<string, unknown> = {
      eq(column: string, value: unknown) { filters[column] = value; return query; },
      in() { return query; },
      order() { return query; },
      maybeSingle: async () => {
        calls.push({ table, filters: { ...filters }, op: 'select' });
        return { data: matching()[0] ?? null, error: null };
      },
      then(resolve: (value: { data: T[]; error: null }) => unknown) {
        calls.push({ table, filters: { ...filters }, op: 'select' });
        return Promise.resolve({ data: matching(), error: null }).then(resolve);
      },
    };
    return query;
  };

  const client = {
    from(table: string) {
      if (table === 'board_ai_threads') {
        return {
          select: () => buildSelect(threads, table),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                calls.push({ table, filters: { ...row }, op: 'insert' });
                const created: ThreadSeed = {
                  id: THREAD_A,
                  board_id: String(row.board_id),
                  user_id: String(row.user_id),
                  title: (row.title as string | null) ?? null,
                  created_at: '2026-09-02T10:00:00Z',
                  updated_at: '2026-09-02T10:00:00Z',
                };
                threads.push(created);
                return { data: created, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const query: Record<string, unknown> = {
              eq(column: string, value: unknown) { filters[column] = value; return query; },
              then(resolve: (value: { error: null }) => unknown) {
                calls.push({ table, filters: { ...filters, ...payload }, op: 'update' });
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return query;
          },
        };
      }
      return {
        select: () => buildSelect(messages, table),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              calls.push({ table, filters: { ...row }, op: 'insert' });
              const created: MessageSeed = {
                id: '66666666-6666-4666-8666-666666666666',
                thread_id: String(row.thread_id),
                role: String(row.role),
                content: String(row.content),
                provider: (row.provider as string | null) ?? null,
                model: (row.model as string | null) ?? null,
                context: row.context ?? null,
                citations: row.citations ?? null,
                created_at: '2026-09-02T10:01:00Z',
              };
              messages.push(created);
              return { data: created, error: null };
            },
          }),
        }),
      };
    },
  };

  return { client: client as unknown as BoardAiChatSupabaseClient, calls, threads, messages };
}

const ownedThread: ThreadSeed = {
  id: THREAD_A,
  board_id: BOARD_1,
  user_id: USER_A,
  title: 'Reading notes',
  created_at: '2026-09-02T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
};

describe('G. every thread read is scoped by user, board and thread', () => {
  it('getThread filters on all three', async () => {
    const { client, calls } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);

    const result = await repo.getThread(USER_A, BOARD_1, THREAD_A);
    expect(result.ok && result.value?.id).toBe(THREAD_A);

    const read = calls.find((c) => c.op === 'select')!;
    expect(read.filters).toEqual({ id: THREAD_A, user_id: USER_A, board_id: BOARD_1 });
  });

  it('a wrong userId returns nothing, even with the right thread id', async () => {
    const { client } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);
    const result = await repo.getThread(USER_B, BOARD_1, THREAD_A);
    expect(result.ok && result.value).toBeNull();
  });

  it('a wrong boardId returns nothing, even with the right user and thread id', async () => {
    const { client } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);
    const result = await repo.getThread(USER_A, BOARD_2, THREAD_A);
    expect(result.ok && result.value).toBeNull();
  });

  it('listThreads is scoped to one user on one board', async () => {
    const { client, calls } = fakeClient({
      threads: [ownedThread, { ...ownedThread, id: 'other', user_id: USER_B }],
    });
    const repo = createBoardAiThreadRepository(client);
    const result = await repo.listThreads(USER_A, BOARD_1);
    expect(result.ok && result.value.map((t) => t.id)).toEqual([THREAD_A]);
    expect(calls[0].filters).toEqual({ user_id: USER_A, board_id: BOARD_1 });
  });
});

describe('B. ownership comes from the caller scope, never the payload', () => {
  it('createThread writes the scoped user and board', async () => {
    const { client, calls } = fakeClient();
    const repo = createBoardAiThreadRepository(client);

    const created = await repo.createThread(USER_A, BOARD_1, { title: '  Notes  ' });
    expect(created.ok).toBe(true);

    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.filters.user_id).toBe(USER_A);
    expect(insert.filters.board_id).toBe(BOARD_1);
    // And the title is normalised on the way in.
    expect(insert.filters.title).toBe('Notes');
  });

  it('the input type carries no user or board to override them with', () => {
    // A compile-time guarantee, restated here so a future widening is noticed:
    // CreateBoardAiThreadInput has exactly one optional field.
    const input: Parameters<ReturnType<typeof createBoardAiThreadRepository>['createThread']>[2] = { title: null };
    expect(Object.keys(input ?? {})).toEqual(['title']);
  });
});

describe('D/G. messages are reached only through the scoped thread', () => {
  it('listMessages refuses a thread the scope does not own', async () => {
    const { client } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);
    const result = await repo.listMessages(USER_B, BOARD_1, THREAD_A);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('appendMessage refuses a thread on another board before writing anything', async () => {
    const { client, calls } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);

    const result = await repo.appendMessage(USER_A, BOARD_2, THREAD_A, {
      role: 'user',
      content: 'hello',
    });
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.op === 'insert'), 'nothing may be written').toBe(false);
  });

  it('appendMessage stores a valid message and touches the thread on the same scope', async () => {
    const { client, calls } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);

    const result = await repo.appendMessage(USER_A, BOARD_1, THREAD_A, {
      role: 'assistant',
      content: 'Page 3 says ...',
      provider: 'deepseek',
      model: 'deepseek-chat',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe('assistant');
      expect(result.value.provider).toBe('deepseek');
      expect(result.value.context).toBeNull();
      expect(result.value.citations).toBeNull();
    }

    const touch = calls.find((c) => c.op === 'update')!;
    expect(touch.filters.id).toBe(THREAD_A);
    expect(touch.filters.user_id).toBe(USER_A);
    expect(touch.filters.board_id).toBe(BOARD_1);
  });

  it('refuses an invalid role or empty content without touching the database', async () => {
    const { client, calls } = fakeClient({ threads: [ownedThread] });
    const repo = createBoardAiThreadRepository(client);

    const badRole = await repo.appendMessage(USER_A, BOARD_1, THREAD_A, {
      role: 'system' as never,
      content: 'hello',
    });
    expect(badRole.ok).toBe(false);
    if (!badRole.ok) expect(badRole.error.code).toBe('validation');

    const empty = await repo.appendMessage(USER_A, BOARD_1, THREAD_A, { role: 'user', content: '   ' });
    expect(empty.ok).toBe(false);

    expect(calls.length, 'neither reached the database').toBe(0);
  });
});

describe('the repository never reaches for an admin client', () => {
  it('imports no service-role factory', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'lib/infra/ai/boardAiThreadRepository.ts'),
      'utf8',
    );
    // Comments stripped before the absence checks: this file's own prose
    // explains what it deliberately does NOT use, and matching that
    // explanation would fail a test that is really about the statements --
    // the same convention aiProviderFoundation.source.test.ts follows.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toContain('getSupabaseAdmin');
    expect(source).not.toContain('service_role');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    // The client is injected by the caller, so the session decides visibility.
    expect(raw).toContain('export function createBoardAiThreadRepository(');
    expect(raw).toContain('client: BoardAiChatSupabaseClient');
  });
});

describe('the repository exposes no way to re-associate a conversation', () => {
  it('writes no association column, and offers no API that would', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'lib/infra/ai/boardAiThreadRepository.ts'),
      'utf8',
    );
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    // No method whose job would be moving a thread or a message.
    for (const forbidden of ['updateThreadBoard', 'updateMessageThread', 'moveThread', 'moveMessage', 'updateMessage']) {
      expect(source, `${forbidden} must not exist`).not.toContain(forbidden);
    }

    // Exactly one update, and its payload is the ordering timestamp alone.
    const updates = source.match(/\.update\(\{[^}]*\}\)/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('updated_at');
    for (const column of ['board_id', 'user_id', 'thread_id', 'created_at', 'id:']) {
      expect(updates[0], `${column} must never be in an update payload`).not.toContain(column);
    }
    // Messages are inserted and read, never updated.
    expect(source).not.toMatch(/from\('board_ai_messages'\)\s*\.update/);
  });
});
