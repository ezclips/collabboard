import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolveCurrentWorkspace: vi.fn(),
  getWorkspaceEntitlements: vi.fn(),
  canCreateBoardForEntitlements: vi.fn(),
}));

vi.mock('@/lib/workspace/context', () => ({
  resolveCurrentWorkspace: hoisted.resolveCurrentWorkspace,
}));

vi.mock('@/lib/auth/permissions', () => ({
  getWorkspaceEntitlements: hoisted.getWorkspaceEntitlements,
  canCreateBoardForEntitlements: hoisted.canCreateBoardForEntitlements,
}));

import { createBoard, type CreateBoardInput } from './createBoard';

type LogEntry = { table: string; op: string; payload: any; opts?: any };

interface FakeConfig {
  boardCount?: number;
  boardCountError?: { message: string } | null;
  boardInsert?: { data: { id: string } | null; error: { message: string } | null };
  sectionsError?: { message: string } | null;
  getUser?: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
}

function fakeSupabase(config: FakeConfig = {}) {
  const log: LogEntry[] = [];
  function from(table: string) {
    const state = { op: 'select' };
    const builder: any = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      is() {
        state.op = 'count';
        return builder;
      },
      insert(rows: unknown) {
        state.op = 'insert';
        log.push({ table, op: 'insert', payload: rows });
        return builder;
      },
      upsert(rows: unknown, opts: unknown) {
        state.op = 'upsert';
        log.push({ table, op: 'upsert', payload: rows, opts });
        return builder;
      },
      single() {
        if (table === 'boards') {
          return Promise.resolve(config.boardInsert ?? { data: { id: 'board-1' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        if (state.op === 'count') {
          return Promise.resolve({
            count: config.boardCount ?? 0,
            error: config.boardCountError ?? null,
          }).then(resolve, reject);
        }
        if (state.op === 'insert' && table === 'board_sections') {
          return Promise.resolve({ data: null, error: config.sectionsError ?? null }).then(
            resolve,
            reject,
          );
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    log,
    client: {
      auth: {
        getUser:
          config.getUser ??
          (async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
      from,
    } as any,
  };
}

const INPUT: CreateBoardInput = {
  title: '  My board  ',
  description: '  a description  ',
  layout: 'wall',
  background_type: 'color',
  background_value: '#ffffff',
  comments_enabled: true,
  new_posts_at_top: true,
  thumbnail: 'lucide:layout',
};

function entry(log: LogEntry[], table: string, op: string): LogEntry | undefined {
  return log.find((item) => item.table === table && item.op === op);
}

beforeEach(() => {
  hoisted.resolveCurrentWorkspace.mockReset().mockResolvedValue(null);
  hoisted.getWorkspaceEntitlements
    .mockReset()
    .mockResolvedValue({ plan: 'free', status: 'free', trialEndsAt: null });
  hoisted.canCreateBoardForEntitlements.mockReset().mockReturnValue(true);
});

describe('createBoard', () => {
  it('inserts the board row with the exact fields and returns its id', async () => {
    const { client, log } = fakeSupabase();
    const result = await createBoard(client, INPUT);

    expect(result).toEqual({ ok: true, boardId: 'board-1' });
    expect(entry(log, 'boards', 'insert')?.payload).toMatchObject({
      title: 'My board',
      description: 'a description',
      layout: 'wall',
      background_type: 'color',
      background_value: '#ffffff',
      comments_enabled: true,
      new_posts_at_top: true,
      reactions_enabled: true,
      user_id: 'user-1',
      workspace_id: null,
      thumbnail: 'lucide:layout',
    });
  });

  it('upserts the creator as an owner/admin member', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, INPUT);

    const membership = entry(log, 'kanban_board_members', 'upsert');
    expect(membership?.payload).toEqual({
      canvas_id: 'board-1',
      user_id: 'user-1',
      role: 'owner',
      permission_level: 'admin',
    });
    expect(membership?.opts).toEqual({ onConflict: 'canvas_id,user_id' });
  });

  it('seeds the three Gantt stages for a Gantt board', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, { ...INPUT, layout: 'gantt' });

    const stages = entry(log, 'kanban_columns', 'insert')?.payload as Array<Record<string, unknown>>;
    expect(stages).toHaveLength(3);
    expect(stages.map((stage) => stage.name)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(stages.map((stage) => stage.order_index)).toEqual([0, 1, 2]);
    expect(stages.every((stage) => stage.canvas_id === 'board-1')).toBe(true);
    expect(stages.every((stage) => typeof stage.id === 'string')).toBe(true);
  });

  it('does not seed Gantt stages for another layout', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, INPUT);
    expect(entry(log, 'kanban_columns', 'insert')).toBeUndefined();
  });

  it('seeds the same three stages for a Kanban board', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, { ...INPUT, layout: 'kanban' });

    const stages = entry(log, 'kanban_columns', 'insert')?.payload as Array<Record<string, unknown>>;
    expect(stages).toHaveLength(3);
    expect(stages.map((stage) => stage.name)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(stages.map((stage) => stage.order_index)).toEqual([0, 1, 2]);
    expect(stages.every((stage) => stage.canvas_id === 'board-1')).toBe(true);
  });

  it('does not seed stages for a Freeform board', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, { ...INPUT, layout: 'freeform' });
    expect(entry(log, 'kanban_columns', 'insert')).toBeUndefined();
  });

  it('creates the three default sections for a Columns board', async () => {
    const { client, log } = fakeSupabase();
    await createBoard(client, { ...INPUT, layout: 'columns' });

    const sections = entry(log, 'board_sections', 'insert')?.payload as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.title)).toEqual([
      'Column 1',
      'Column 2',
      'Column 3',
    ]);
    expect(sections.map((section) => section.description)).toEqual([
      'Column 1',
      'Column 2',
      'Column 3',
    ]);
    expect(sections.map((section) => section.position)).toEqual([1, 2, 3]);
  });

  it('returns the plan-limit message without inserting a board', async () => {
    hoisted.canCreateBoardForEntitlements.mockReturnValue(false);
    const { client, log } = fakeSupabase({ boardCount: 3 });
    const result = await createBoard(client, INPUT);

    expect(result).toEqual({
      ok: false,
      message: 'Free plan allows up to 3 active boards. Upgrade to Pro to create more.',
    });
    expect(entry(log, 'boards', 'insert')).toBeUndefined();
  });

  it('returns the board-count failure message', async () => {
    const { client } = fakeSupabase({ boardCountError: { message: 'nope' } });
    const result = await createBoard(client, INPUT);
    expect(result).toEqual({ ok: false, message: 'Failed to validate your current board limit.' });
  });

  it('returns the database error message and does not throw', async () => {
    const { client } = fakeSupabase({
      boardInsert: { data: null, error: { message: 'boom' } },
    });
    const result = await createBoard(client, INPUT);
    expect(result).toEqual({ ok: false, message: 'Database error: boom' });
  });

  it('returns the sections error message', async () => {
    const { client } = fakeSupabase({ sectionsError: { message: 'sections boom' } });
    const result = await createBoard(client, { ...INPUT, layout: 'columns' });
    expect(result).toEqual({ ok: false, message: 'Error creating sections: sections boom' });
  });

  it('returns the authentication error message', async () => {
    const { client } = fakeSupabase({
      getUser: async () => ({ data: { user: null }, error: { message: 'expired' } }),
    });
    const result = await createBoard(client, INPUT);
    expect(result).toEqual({ ok: false, message: 'Authentication error: expired' });
  });

  it('returns the sign-in message when there is no user', async () => {
    const { client } = fakeSupabase({
      getUser: async () => ({ data: { user: null }, error: null }),
    });
    const result = await createBoard(client, INPUT);
    expect(result).toEqual({ ok: false, message: 'You must be logged in to save a canvas.' });
  });

  it('never throws when the client itself throws', async () => {
    const client = {
      auth: {
        getUser: () => {
          throw new Error('kaboom');
        },
      },
      from: () => {
        throw new Error('should not reach');
      },
    } as any;
    const result = await createBoard(client, INPUT);
    expect(result).toEqual({ ok: false, message: 'Error: kaboom' });
  });
});
