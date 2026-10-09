import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  fetchIcsText: vi.fn(),
  syncScheduler: vi.fn(),
  importScheduler: vi.fn(),
  removeEntries: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
vi.mock('@/lib/server/net/publicUrlGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/net/publicUrlGuard')>()),
  fetchIcsText: mocks.fetchIcsText,
}));
vi.mock('@/lib/server/scheduler/calendarSchedulerSync', () => ({
  syncSchedulerCalendarSubscription: mocks.syncScheduler,
  importSchedulerEntries: mocks.importScheduler,
  removeSchedulerSubscriptionEntries: mocks.removeEntries,
}));

type Row = Record<string, unknown>;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '84da6ea7-865d-4c8d-a229-0fd0124d8c10';
const SECRET_URL = 'https://calendar.google.com/secret/address/abc/private.ics';

let listCreateRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/route');
let deleteRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/route');
let syncRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/sync/route');
let applyRoute: typeof import('../../../app/api/boards/[id]/calendar-import/apply/route');

function fakeClient(seed: { layout?: string; padlets?: Row[]; subscriptions?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    boards: [{ id: BOARD_ID, layout: seed.layout ?? 'scheduler', title: 'Board' }],
    kanban_calendar_subscriptions: [...(seed.subscriptions ?? [])],
    padlets: [...(seed.padlets ?? [])],
  };
  const inserted: Row[] = [];

  const from = (name: string) => {
    const rows = tables[name] ?? (tables[name] = []);
    const build = (op: 'select' | 'insert' | 'update' | 'delete', payload?: unknown) => {
      const filters: Record<string, unknown> = {};
      let insertedRow: Row | null = null;
      const matches = (row: Row) => Object.entries(filters).every(([key, value]) => {
        const path = key.split('->>');
        const actual = path.length === 2 ? (row[path[0]] as Row | undefined)?.[path[1]] : row[key];
        return actual === value;
      });
      const query: Record<string, unknown> = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        in() { return query; },
        or() { return query; },
        is() { return query; },
        lt() { return query; },
        maybeSingle: async () => {
          const error = run();
          return { data: error ? null : (insertedRow ?? resolve()[0] ?? null), error };
        },
        then(resolveThen: (value: unknown) => unknown) {
          const error = run();
          return Promise.resolve({ data: error ? null : resolve(), error }).then(resolveThen);
        },
      };
      function resolve(): Row[] {
        return op !== 'select' ? [] : rows.filter(matches);
      }
      function run(): unknown {
        if (op === 'insert') {
          for (const raw of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
            const row = { id: raw.id ?? 'sub-1', ...raw };
            rows.push(row);
            inserted.push(row);
            insertedRow = row;
          }
          return null;
        }
        if (op === 'delete') {
          const index = rows.findIndex(matches);
          if (index >= 0) rows.splice(index, 1);
          return null;
        }
        return null;
      }
      return query;
    };
    return {
      select: () => build('select'),
      insert: (payload: unknown) => build('insert', payload),
      update: (payload: unknown) => build('update', payload),
      delete: () => build('delete'),
    };
  };

  return { client: { from } as unknown as never, inserted };
}

function wire(seed: Parameters<typeof fakeClient>[0] = {}) {
  const fake = fakeClient(seed);
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
    ...(fake.client as object),
  });
  return fake;
}

const calendar = () => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nSUMMARY:Meeting\nDTSTART:20260610T090000Z\nDTEND:20260610T100000Z\nEND:VEVENT\nEND:VCALENDAR`;

const postJson = (route: { POST: (r: Request, c: never) => Promise<Response> }, body: unknown, subId?: string) =>
  route.POST(
    new Request(`http://localhost/api/boards/${BOARD_ID}/calendar-subscriptions${subId ? `/${subId}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve(subId ? { id: BOARD_ID, subId } : { id: BOARD_ID }) } as never,
  );

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.CALENDAR_LINK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  mocks.cookies.mockResolvedValue({});
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.fetchIcsText.mockResolvedValue(calendar());
  mocks.syncScheduler.mockResolvedValue({ added: 2, updated: 0, removed: 0, unchanged: 0 });
  mocks.importScheduler.mockResolvedValue({ added: 3 });
  mocks.removeEntries.mockResolvedValue({ removedEntries: 2, keptEntries: 1 });
  listCreateRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/route');
  deleteRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/route');
  syncRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/sync/route');
  applyRoute = await import('../../../app/api/boards/[id]/calendar-import/apply/route');
});

describe('PATCH-333 subscription routes accept Scheduler boards', () => {
  it('a Scheduler board connects WITHOUT a columnId and syncs with the scheduler engine', async () => {
    const fake = wire({ layout: 'scheduler' });
    const response = await postJson(listCreateRoute, { url: SECRET_URL, timeZone: 'UTC' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.added).toBe(2);
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0].target_column_id).toBeNull();
    expect(mocks.syncScheduler).toHaveBeenCalledTimes(1);
  });

  it('a Kanban board still requires a columnId', async () => {
    wire({ layout: 'kanban' });
    expect((await postJson(listCreateRoute, { url: SECRET_URL, timeZone: 'UTC' })).status).toBe(400);
  });

  it('any other board is 404', async () => {
    wire({ layout: 'freeform' });
    expect((await postJson(listCreateRoute, { url: SECRET_URL, timeZone: 'UTC' })).status).toBe(404);
  });

  it('DELETE on a Scheduler board removes entries and reports the counts', async () => {
    wire({ layout: 'scheduler', subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID }] });
    const response = await deleteRoute.DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: BOARD_ID, subId: 'sub-1' }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removedEntries: 2, keptEntries: 1 });
    expect(mocks.removeEntries).toHaveBeenCalledWith(expect.anything(), BOARD_ID, 'sub-1');
  });

  it('a failed Scheduler sync answers with an error status, not zero counts', async () => {
    wire({ layout: 'scheduler', subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID, url_ciphertext: 'v1.a.b.c' }] });
    mocks.syncScheduler.mockResolvedValue({ added: 0, updated: 0, removed: 0, unchanged: 0, reason: 'upstream_error' });
    const response = await syncRoute.POST(
      new Request(`http://localhost/api/boards/${BOARD_ID}/calendar-subscriptions/sub-1/sync`, {
        method: 'POST',
        body: JSON.stringify({ timeZone: 'UTC' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: BOARD_ID, subId: 'sub-1' }) },
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.reason).toBe('upstream_error');
    expect(body.error).toMatch(/could not be read/i);
  });
});

describe('PATCH-333 one-time apply route', () => {
  it('creates entries and never returns the URL', async () => {
    wire({ layout: 'scheduler' });
    const response = await applyRoute.POST(
      new Request(`http://localhost/api/boards/${BOARD_ID}/calendar-import/apply`, {
        method: 'POST',
        body: JSON.stringify({ url: SECRET_URL, timeZone: 'UTC' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: BOARD_ID }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 3 });
    expect(mocks.importScheduler).toHaveBeenCalledTimes(1);
  });

  it('400 for both url and icsText, and never logs the URL', async () => {
    wire({ layout: 'scheduler' });
    const spies = ['log', 'warn', 'error', 'info'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    try {
      const response = await applyRoute.POST(
        new Request(`http://localhost/api/boards/${BOARD_ID}/calendar-import/apply`, {
          method: 'POST',
          body: JSON.stringify({ url: SECRET_URL, icsText: calendar(), timeZone: 'UTC' }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: Promise.resolve({ id: BOARD_ID }) },
      );
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(SECRET_URL);
      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => call.join(' '))).join('\n');
      expect(logged).not.toContain(SECRET_URL);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
