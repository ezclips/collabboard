import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchIcsText: vi.fn() }));

vi.mock('@/lib/server/net/publicUrlGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/net/publicUrlGuard')>()),
  fetchIcsText: mocks.fetchIcsText,
}));

import { encryptCalendarLink } from './calendarLinkCipher';
import {
  syncCalendarSubscription,
  type CalendarSyncClient,
  type CalendarSyncSubscription,
} from './calendarSync';
import { PublicUrlError } from '@/lib/server/net/publicUrlGuard';

const KEY = 'CALENDAR_LINK_ENCRYPTION_KEY';
const KEY_VALUE = Buffer.alloc(32, 7).toString('base64');
const NOW = new Date('2026-06-01T00:00:00Z');
const TIME_ZONE = 'UTC';

type Row = Record<string, unknown>;

const ics = (events: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
const event = (uid: string, summary: string, start: string, end: string) =>
  `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:${summary}\nDTSTART:${start}\nDTEND:${end}\nEND:VEVENT`;

interface FakeSeed {
  cards?: Row[];
  columns?: Row[];
  conflictKeys?: Set<string>;
}

function makeClient(seed: FakeSeed = {}) {
  const cards = seed.cards ?? [];
  const columns = seed.columns ?? [{ id: 'col-1', canvas_id: 'board-1', order_index: 0 }];
  const subscriptions: Row[] = [{ id: 'sub-1', last_error: 'old', last_synced_at: null }];
  const conflictKeys = seed.conflictKeys ?? new Set<string>();
  const updates: { table: string; values: Row }[] = [];
  const deletes: string[] = [];

  const rowsFor = (name: string) => (name === 'kanban_cards' ? cards : name === 'kanban_columns' ? columns : subscriptions);

  const table = (name: string) => {
    const build = (op: 'select' | 'insert' | 'update' | 'delete', payload?: unknown) => {
      const filters: Record<string, unknown> = {};
      let orderColumn: string | null = null;
      const query: Record<string, unknown> = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        order(column: string) { orderColumn = column; return query; },
        limit() { return query; },
        or() { return query; },
        maybeSingle: async () => ({ data: resolve()[0] ?? null, error: opError() }),
        then(resolveThen: (value: unknown) => unknown) {
          return Promise.resolve({ data: resolve(), error: opError() }).then(resolveThen);
        },
      };

      function resolve(): Row[] {
        if (op !== 'select') return [];
        let out = rowsFor(name).filter((row) => Object.entries(filters).every(([k, v]) => row[k] === v));
        if (orderColumn) out = [...out].sort((a, b) => Number(a[orderColumn as string]) - Number(b[orderColumn as string]));
        return out;
      }
      function opError(): unknown {
        if (op === 'insert') {
          const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[];
          if (incoming.some((row) => conflictKeys.has(String(row.calendar_event_key)))) return { code: '23505' };
          for (const row of incoming) cards.push({ ...row });
          return null;
        }
        if (op === 'update') {
          for (const row of rowsFor(name).filter((r) => r.id === filters.id)) Object.assign(row, payload as Row);
          updates.push({ table: name, values: payload as Row });
          return null;
        }
        if (op === 'delete') {
          const index = rowsFor(name).findIndex((r) => r.id === filters.id);
          if (index >= 0) rowsFor(name).splice(index, 1);
          deletes.push(String(filters.id));
          return null;
        }
        return null;
      }
      return query;
    };
    return {
      select: (columns_: string) => build('select'),
      insert: (payload: unknown) => build('insert', payload),
      update: (payload: unknown) => build('update', payload),
      delete: () => build('delete'),
    };
  };

  return { client: { from: table } as unknown as CalendarSyncClient, cards, updates, deletes, subscriptions };
}

function subscription(link: string): CalendarSyncSubscription {
  return {
    id: 'sub-1',
    canvasId: 'board-1',
    urlCiphertext: encryptCalendarLink(link),
    targetColumnId: 'col-1',
    targetSwimlaneId: null,
  };
}

beforeEach(() => {
  process.env[KEY] = KEY_VALUE;
  mocks.fetchIcsText.mockReset();
});

afterEach(() => {
  delete process.env[KEY];
});

describe('PATCH-328 syncCalendarSubscription', () => {
  it('adds a card for a new event, with a 64-hex key and no UID', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics(event('secret-uid-abc@example.com', 'Meeting', '20260610T090000Z', '20260610T100000Z')));
    const fake = makeClient();
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });

    expect(result).toMatchObject({ added: 1, updated: 0, removed: 0, unchanged: 0 });
    expect(fake.cards).toHaveLength(1);
    const written = fake.cards[0];
    expect(written.calendar_subscription_id).toBe('sub-1');
    expect(String(written.calendar_event_key)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.cards)).not.toContain('secret-uid-abc');
    expect(JSON.stringify(fake.cards)).not.toContain('example.com');
    // last_error cleared, last_synced_at written.
    expect(fake.subscriptions[0].last_error).toBeNull();
    expect(typeof fake.subscriptions[0].last_synced_at).toBe('string');
  });

  it('updates ONLY title/content/dates of a changed card', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics(event('uid-1', 'New title', '20260610T090000Z', '20260610T100000Z')));
    const fake = makeClient({
      cards: [{
        id: 'card-1',
        calendar_subscription_id: 'sub-1',
        calendar_event_key: 'a'.repeat(64),
        title: 'Old title',
        content: 'old',
        date_started: '2026-06-10',
        date_due: '2026-06-10',
        column_id: 'other',
        priority: 3,
        status: 'done',
      }],
    });
    // Make the seeded key the one the feed produces by syncing the same event.
    mocks.fetchIcsText.mockResolvedValue(ics(event('uid-1', 'New title', '20260610T090000Z', '20260610T100000Z')));
    // Seed the exact key: run once with a fresh card to learn it, then reset.
    const learn = makeClient();
    await syncCalendarSubscription(learn.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    const realKey = String(learn.cards[0].calendar_event_key);
    fake.cards[0].calendar_event_key = realKey;

    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result.updated).toBe(1);
    const update = fake.updates.find((entry) => entry.table === 'kanban_cards');
    expect(update).toBeDefined();
    expect(Object.keys(update!.values).sort()).toEqual(['content', 'date_due', 'date_started', 'title']);
    expect(fake.cards[0].column_id).toBe('other');
    expect(fake.cards[0].priority).toBe(3);
    expect(fake.cards[0].status).toBe('done');
  });

  it('removes a card whose event left the calendar', async () => {
    const learn = makeClient();
    mocks.fetchIcsText.mockResolvedValue(ics(event('gone', 'Gone', '20260610T090000Z', '20260610T100000Z')));
    await syncCalendarSubscription(learn.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    const key = String(learn.cards[0].calendar_event_key);

    // Feed now has no events.
    mocks.fetchIcsText.mockResolvedValue(ics(event('other', 'Other', '20260611T090000Z', '20260611T100000Z')));
    const fake = makeClient({
      cards: [{
        id: 'card-1', calendar_subscription_id: 'sub-1', calendar_event_key: key,
        title: 'Gone', content: '', date_started: '2026-06-10', date_due: '2026-06-10',
      }],
    });
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result.removed).toBe(1);
    expect(fake.deletes).toEqual(['card-1']);
  });

  it('keeps a card older than the parse window', async () => {
    const fake = makeClient({
      cards: [{
        id: 'old-card', calendar_subscription_id: 'sub-1', calendar_event_key: 'b'.repeat(64),
        title: 'Old', content: '', date_started: '2025-01-01', date_due: '2025-01-02',
      }],
    });
    mocks.fetchIcsText.mockResolvedValue(ics(event('new', 'New', '20260610T090000Z', '20260610T100000Z')));
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result.removed).toBe(0);
    expect(fake.cards.some((card) => card.id === 'old-card')).toBe(true);
  });

  it('does not delete from a truncated feed', async () => {
    const fake = makeClient({
      cards: [{
        id: 'kept', calendar_subscription_id: 'sub-1', calendar_event_key: 'c'.repeat(64),
        title: 'Kept', content: '', date_started: '2026-06-10', date_due: '2026-06-10',
      }],
    });
    const many = Array.from({ length: 501 }, (_, index) =>
      event(`uid-${index}`, `E${index}`, '20260610T090000Z', '20260610T100000Z'),
    ).join('\n');
    mocks.fetchIcsText.mockResolvedValue(ics(many));
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result.removed).toBe(0);
    expect(fake.cards.some((card) => card.id === 'kept')).toBe(true);
  });

  it('a fetch failure changes no cards and records a reason', async () => {
    mocks.fetchIcsText.mockRejectedValue(new PublicUrlError('upstream_error', 'HTTP 500', 500));
    const fake = makeClient({
      cards: [{
        id: 'card-1', calendar_subscription_id: 'sub-1', calendar_event_key: 'd'.repeat(64),
        title: 'X', content: '', date_started: '2026-06-10', date_due: '2026-06-10',
      }],
    });
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0, reason: 'upstream_error' });
    expect(fake.updates.every((entry) => entry.table !== 'kanban_cards')).toBe(true);
    expect(fake.deletes).toHaveLength(0);
    expect(fake.subscriptions[0].last_error).toBe('upstream_error');
  });

  it('on a chunk unique violation retries row by row and skips duplicates', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics([
      event('a', 'A', '20260610T090000Z', '20260610T100000Z'),
      event('b', 'B', '20260611T090000Z', '20260611T100000Z'),
    ].join('\n')));

    // Learn both keys, then mark one as conflicting.
    const learn = makeClient();
    await syncCalendarSubscription(learn.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    const keys = learn.cards.map((card) => String(card.calendar_event_key));

    const fake = makeClient({ conflictKeys: new Set([keys[0]]) });
    const result = await syncCalendarSubscription(fake.client, subscription('https://x/cal.ics'), { timeZone: TIME_ZONE, now: NOW });
    expect(result.added).toBe(1);
    expect(fake.cards).toHaveLength(1);
  });
});
