import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

type Row = Record<string, unknown>;

function fakeClient(options: {
  userId?: string;
  userError?: unknown;
  subscriptions?: Row[];
  boards?: Row[];
}) {
  const from = (table: string) => ({
    select: () => {
      const filters: Record<string, unknown> = {};
      let inIds: string[] | null = null;
      const query = {
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        in(_column: string, values: readonly string[]) { inIds = [...values]; return query; },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          let rows = table === 'kanban_calendar_subscriptions'
            ? (options.subscriptions ?? [])
            : (options.boards ?? []);
          rows = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          if (inIds) rows = rows.filter((row) => inIds!.includes(String(row.id)));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  });

  return {
    auth: {
      getUser: vi.fn(async () => (
        options.userError
          ? { data: { user: null }, error: options.userError }
          : { data: { user: { id: options.userId ?? 'user-1' } }, error: null }
      )),
    },
    from,
  };
}

const get = (token?: string) => route.GET(new NextRequest(
  'http://localhost/api/settings/calendar-subscriptions',
  { headers: token ? { authorization: `Bearer ${token}` } : {} },
));

let route: typeof import('./route');

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  route = await import('./route');
});

describe('PATCH-332 GET /api/settings/calendar-subscriptions', () => {
  it('401 without a token', async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('401 when the token does not resolve to a user', async () => {
    mocks.createClient.mockReturnValue(fakeClient({ userError: { message: 'bad' } }));
    expect((await get('t')).status).toBe(401);
  });

  it('returns only the caller’s rows, with board titles, and never the ciphertext', async () => {
    mocks.createClient.mockReturnValue(fakeClient({
      userId: 'user-1',
      subscriptions: [
        {
          id: 'sub-1', canvas_id: 'board-1', created_by: 'user-1', url_host: 'calendar.google.com',
          url_ciphertext: 'v1.SECRET.CIPHERTEXT', last_synced_at: '2026-06-01T00:00:00Z', last_error: null,
        },
        {
          id: 'sub-2', canvas_id: 'board-2', created_by: 'user-2', url_host: 'other.example',
          url_ciphertext: 'v1.OTHER.SECRET', last_synced_at: null, last_error: null,
        },
      ],
      boards: [
        { id: 'board-1', title: 'Roadmap' },
        { id: 'board-2', title: 'Someone else’s' },
      ],
    }));

    const response = await get('t');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.calendars).toEqual([{
      id: 'sub-1',
      boardId: 'board-1',
      boardTitle: 'Roadmap',
      // PATCH-333. The board's layout, for the Disconnect wording.
      boardLayout: null,
      urlHost: 'calendar.google.com',
      lastSyncedAt: '2026-06-01T00:00:00Z',
      lastError: null,
    }]);
    expect(JSON.stringify(body)).not.toContain('url_ciphertext');
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });
});
