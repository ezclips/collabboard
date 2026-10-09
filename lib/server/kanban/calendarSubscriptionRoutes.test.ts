import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  fetchIcsText: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('@/lib/server/net/publicUrlGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/net/publicUrlGuard')>()),
  fetchIcsText: mocks.fetchIcsText,
}));
vi.mock('@/lib/server/kanban/calendarSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/kanban/calendarSync')>()),
  syncCalendarSubscription: mocks.sync,
  // Rate limiting is not under test here, and its module-scope counter would
  // otherwise carry across the cases in this file.
  checkCalendarRateLimit: () => true,
}));

type Row = Record<string, unknown>;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '84da6ea7-865d-4c8d-a229-0fd0124d8c10';
const SECRET_URL = 'https://calendar.google.com/secret/address/abc123/private.ics';

let listCreateRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/route');
let deleteRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/route');
let syncRoute: typeof import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/sync/route');

interface Seed {
  boardLayout?: string;
  subscriptions?: Row[];
  cards?: Row[];
  /** Make the subscription read fail (503 read_failed). */
  readError?: boolean;
  /** Make the stale claim update fail (503 claim_failed). */
  claimError?: boolean;
}

function fakeClient(seed: Seed = {}) {
  const tables: Record<string, Row[]> = {
    boards: [{ id: BOARD_ID, layout: seed.boardLayout ?? 'kanban' }],
    kanban_calendar_subscriptions: [...(seed.subscriptions ?? [])],
    kanban_cards: [...(seed.cards ?? [])],
  };
  const inserted: Row[] = [];
  const deleted: string[] = [];
  let counter = 0;

  const from = (name: string) => {
    const rows = tables[name] ?? (tables[name] = []);
    const build = (op: 'select' | 'insert' | 'update' | 'delete', payload?: unknown) => {
      const filters: Record<string, unknown> = {};
      let orderColumn: string | null = null;
      let insertedRow: Row | null = null;
      let updatedRow: Row | null = null;

      const matches = (row: Row) => Object.entries(filters).every(([key, value]) => {
        if (value !== null && typeof value === 'object') {
          const marker = value as { __is?: unknown; __lt?: unknown };
          if ('__is' in marker) return row[key] === marker.__is;
          if ('__lt' in marker) return String(row[key]) < String(marker.__lt);
        }
        return row[key] === value;
      });

      const query: Record<string, unknown> = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        is(column: string, value: null) { filters[column] = { __is: value }; return query; },
        lt(column: string, value: unknown) { filters[column] = { __lt: value }; return query; },
        order(column: string) { orderColumn = column; return query; },
        limit() { return query; },
        maybeSingle: async () => {
          const error = run();
          if (error) return { data: null, error };
          if (op === 'insert') return { data: insertedRow, error: null };
          if (op === 'update') return { data: updatedRow, error: null };
          return { data: resolve()[0] ?? null, error: null };
        },
        then(resolveThen: (value: unknown) => unknown) {
          const error = run();
          return Promise.resolve({ data: error ? null : resolve(), error }).then(resolveThen);
        },
      };

      function resolve(): Row[] {
        if (op !== 'select') return [];
        let out = rows.filter(matches);
        if (orderColumn) out = [...out].sort((a, b) => Number(a[orderColumn as string]) - Number(b[orderColumn as string]));
        return out;
      }

      function run(): unknown {
        if (op === 'select') {
          if (seed.readError && name === 'kanban_calendar_subscriptions') return { code: 'read_failed' };
          return null;
        }
        if (op === 'insert') {
          for (const raw of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
            const row = { id: raw.id ?? `gen-${++counter}`, ...raw };
            rows.push(row);
            inserted.push(row);
            insertedRow = row;
          }
          return null;
        }
        if (op === 'update') {
          if (seed.claimError && name === 'kanban_calendar_subscriptions') return { code: 'claim_failed' };
          const matched = rows.filter(matches);
          updatedRow = matched[0] ?? null;
          for (const row of matched) Object.assign(row, payload as Row);
          return null;
        }
        if (op === 'delete') {
          const index = rows.findIndex((r) => r.id === filters.id);
          if (index >= 0) rows.splice(index, 1);
          deleted.push(String(filters.id));
          return null;
        }
        return null;
      }

      return query;
    };
    return {
      select: (_columns: string) => build('select'),
      insert: (payload: unknown) => build('insert', payload),
      update: (payload: unknown) => build('update', payload),
      delete: () => build('delete'),
    };
  };

  return { client: { from } as unknown as never, tables, inserted, deleted };
}

function sessionClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
  };
}

function wire(seed: Seed = {}) {
  const fake = fakeClient(seed);
  const session = { ...sessionClient(), ...(fake.client as object) };
  mocks.createRouteHandlerClient.mockReturnValue(session);
  return fake;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonPost = (route: { POST: (request: Request, context: any) => Promise<Response> }, body: unknown, subId?: string) => {
  const path = subId
    ? `http://localhost/api/boards/${BOARD_ID}/calendar-subscriptions/${subId}/sync`
    : `http://localhost/api/boards/${BOARD_ID}/calendar-subscriptions`;
  return route.POST(
    new Request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    { params: Promise.resolve(subId ? { id: BOARD_ID, subId } : { id: BOARD_ID }) },
  );
};

const calendar = () => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nSUMMARY:Meeting\nDTSTART:20260610T090000Z\nDTEND:20260610T100000Z\nEND:VEVENT\nEND:VCALENDAR`;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.CALENDAR_LINK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  mocks.cookies.mockResolvedValue({});
  mocks.sync.mockResolvedValue({ added: 1, updated: 0, removed: 0, unchanged: 0 });
  listCreateRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/route');
  deleteRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/route');
  syncRoute = await import('../../../app/api/boards/[id]/calendar-subscriptions/[subId]/sync/route');
});

describe('PATCH-328 subscription routes', () => {
  it('401 without a user', async () => {
    mocks.createRouteHandlerClient.mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no' } })) },
    });
    expect((await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' })).status).toBe(401);
  });

  it('404 on a non-kanban board', async () => {
    wire({ boardLayout: 'freeform' });
    const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' });
    expect(response.status).toBe(404);
  });

  it('400 for an invalid time zone', async () => {
    wire();
    const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'Not/AZone' });
    expect(response.status).toBe(400);
  });

  it('409 for a sixth subscription', async () => {
    wire({ subscriptions: Array.from({ length: 5 }, (_, index) => ({ id: `sub-${index}`, canvas_id: BOARD_ID })) });
    const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' });
    expect(response.status).toBe(409);
  });

  it('a bad link saves nothing', async () => {
    const fake = wire();
    mocks.fetchIcsText.mockResolvedValue('<html>nope</html>');
    const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' });
    expect(response.status).toBe(422);
    expect(fake.inserted).toHaveLength(0);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('connects and syncs, returning the host and counts', async () => {
    const fake = wire();
    mocks.fetchIcsText.mockResolvedValue(calendar());
    const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.urlHost).toBe('calendar.google.com');
    expect(body.added).toBe(1);
    expect(fake.inserted).toHaveLength(1);
    expect(String(fake.inserted[0].url_ciphertext).startsWith('v1.')).toBe(true);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('never returns the URL or ciphertext, and never logs either', async () => {
    const fake = wire();
    mocks.fetchIcsText.mockResolvedValue(calendar());
    const spies = ['log', 'warn', 'error', 'info'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    try {
      const response = await jsonPost(listCreateRoute, { url: SECRET_URL, columnId: BOARD_ID, timeZone: 'UTC' });
      const text = await response.text();
      expect(text).not.toContain(SECRET_URL);
      expect(text).not.toContain(String(fake.inserted[0].url_ciphertext));
      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => call.join(' '))).join('\n');
      expect(logged).not.toContain(SECRET_URL);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('DELETE returns the card count', async () => {
    const fake = wire({
      subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID }],
      cards: [
        { id: 'c1', calendar_subscription_id: 'sub-1' },
        { id: 'c2', calendar_subscription_id: 'sub-1' },
        { id: 'c3', calendar_subscription_id: 'other' },
      ],
    });
    const response = await deleteRoute.DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: BOARD_ID, subId: 'sub-1' }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removedCards: 2 });
    expect(fake.deleted).toContain('sub-1');
  });

  it('a fresh subscription is skipped by the stale-only sync (both claims miss)', async () => {
    wire({ subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID, url_ciphertext: 'v1.a.b.c', last_synced_at: new Date().toISOString() }] });
    const response = await jsonPost(syncRoute, { timeZone: 'UTC', ifOlderThanSeconds: 3600 }, 'sub-1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: true });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('claims and syncs a never-synced subscription', async () => {
    wire({ subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID, url_ciphertext: 'v1.a.b.c', last_synced_at: null }] });
    const response = await jsonPost(syncRoute, { timeZone: 'UTC', ifOlderThanSeconds: 3600 }, 'sub-1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 1, updated: 0, removed: 0 });
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it('a subscription read failure is 503 read_failed', async () => {
    wire({ subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID }], readError: true });
    const response = await jsonPost(syncRoute, { timeZone: 'UTC' }, 'sub-1');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Unavailable', code: 'read_failed' });
  });

  it('a claim failure is 503 claim_failed', async () => {
    wire({ subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID, url_ciphertext: 'v1.a.b.c', last_synced_at: null }], claimError: true });
    const response = await jsonPost(syncRoute, { timeZone: 'UTC', ifOlderThanSeconds: 3600 }, 'sub-1');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Unavailable', code: 'claim_failed' });
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});

// PATCH-333 Addendum 1. A sync that FAILED must not answer 200 with zero
// counts -- the modal reads that as "Calendar is up to date".
describe('PATCH-333 Addendum 1 a failed sync is an error, not "up to date"', () => {
  it.each([
    ['upstream_error', 502, /could not be read/i],
    ['network_error', 502, /could not be reached/i],
    ['blocked_host', 502, /not allowed/i],
    ['not_a_calendar', 422, /did not return a calendar/i],
    ['missing_key', 503, /not configured/i],
  ] as const)('%s -> %i', async (reason, status, pattern) => {
    wire({ subscriptions: [{ id: 'sub-1', canvas_id: BOARD_ID, url_ciphertext: 'v1.a.b.c' }] });
    mocks.sync.mockResolvedValue({ added: 0, updated: 0, removed: 0, unchanged: 0, reason });
    const response = await jsonPost(syncRoute, { timeZone: 'UTC' }, 'sub-1');
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.reason).toBe(reason);
    expect(body.error).toMatch(pattern);
  });
});
