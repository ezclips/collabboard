import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchIcsText: vi.fn() }));

vi.mock('@/lib/server/net/publicUrlGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/net/publicUrlGuard')>()),
  fetchIcsText: mocks.fetchIcsText,
}));

import { encryptCalendarLink } from '@/lib/server/kanban/calendarLinkCipher';
import type { CalendarSyncClient, CalendarSyncSubscription } from '@/lib/server/kanban/calendarSync';
import { PublicUrlError } from '@/lib/server/net/publicUrlGuard';
import {
  importSchedulerEntries,
  syncSchedulerCalendarSubscription,
  zonedMidnightUtc,
} from './calendarSchedulerSync';

const KEY = 'CALENDAR_LINK_ENCRYPTION_KEY';
const KEY_VALUE = Buffer.alloc(32, 7).toString('base64');
const NOW = new Date('2026-06-01T00:00:00Z');

type Row = Record<string, unknown>;

const ics = (events: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
const event = (uid: string, summary: string, start: string, end: string) =>
  `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:${summary}\nDTSTART:${start}\nDTEND:${end}\nEND:VEVENT`;

function makeClient(seed: { padlets?: Row[] } = {}) {
  const padlets = seed.padlets ?? [];
  const subscriptions: Row[] = [{ id: 'sub-1', last_error: 'old', last_synced_at: null }];
  const inserted: Row[] = [];
  const updated: Row[] = [];
  const deleted: string[] = [];

  const matches = (row: Row, filters: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => {
    const path = key.split('->>');
    const actual = path.length === 2
      ? (row[path[0]] as Record<string, unknown> | undefined)?.[path[1]]
      : row[key];
    return actual === value;
  });

  const table = (name: string) => {
    const rows = name === 'padlets' ? padlets : subscriptions;
    const build = (op: 'select' | 'insert' | 'update' | 'delete', payload?: unknown) => {
      const filters: Record<string, unknown> = {};
      const query: Record<string, unknown> = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        maybeSingle: async () => ({ data: resolve()[0] ?? null, error: run() }),
        then(resolveThen: (value: unknown) => unknown) {
          const error = run();
          return Promise.resolve({ data: error ? null : resolve(), error }).then(resolveThen);
        },
      };
      function resolve(): Row[] {
        return op !== 'select' ? [] : rows.filter((row) => matches(row, filters));
      }
      function run(): unknown {
        if (op === 'insert') {
          for (const raw of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
            const row = { id: raw.id ?? `gen-${rows.length}`, ...raw };
            rows.push(row);
            inserted.push(row);
          }
          return null;
        }
        if (op === 'update') {
          for (const row of rows.filter((r) => matches(r, filters))) Object.assign(row, payload as Row);
          updated.push(payload as Row);
          return null;
        }
        if (op === 'delete') {
          const index = rows.findIndex((r) => matches(r, filters));
          if (index >= 0) { deleted.push(String(rows[index].id)); rows.splice(index, 1); }
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

  return { client: { from: table } as unknown as CalendarSyncClient, padlets, inserted, updated, deleted, subscriptions };
}

function subscription(link = 'https://x/cal.ics'): CalendarSyncSubscription {
  return {
    id: 'sub-1',
    canvasId: 'board-1',
    urlCiphertext: encryptCalendarLink(link),
    targetColumnId: null,
    targetSwimlaneId: null,
  };
}

const entryRow = (over: Row = {}): Row => ({
  id: 'entry-1',
  board_id: 'board-1',
  type: 'container',
  title: 'Old',
  content: '',
  created_at: '2026-05-01T00:00:00Z',
  metadata: { start_date: '2026-06-10T09:00:00Z', end_date: '2026-06-10T10:00:00Z', isAllDay: false, calendarSubscriptionId: 'sub-1', calendarEventKey: 'a'.repeat(64), cardColor: '#123456' },
  ...over,
});

beforeEach(() => {
  process.env[KEY] = KEY_VALUE;
  mocks.fetchIcsText.mockReset();
});
afterEach(() => {
  delete process.env[KEY];
});

describe('PATCH-333 scheduler sync engine', () => {
  it('adds an entry for a new event', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics(event('u1', 'Meeting', '20260610T090000Z', '20260610T100000Z')));
    const fake = makeClient();
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result).toMatchObject({ added: 1, updated: 0, removed: 0, unchanged: 0 });
    const entry = fake.padlets[0];
    expect(entry.type).toBe('container');
    expect(entry.title).toBe('Meeting');
    const metadata = entry.metadata as Row;
    expect(metadata.start_date).toBe('2026-06-10T09:00:00.000Z');
    expect(metadata.calendarSubscriptionId).toBe('sub-1');
    expect(String(metadata.calendarEventKey)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('updates only the mirrored fields, merging other metadata keys', async () => {
    const learn = makeClient();
    mocks.fetchIcsText.mockResolvedValue(ics(event('u1', 'Meeting', '20260610T090000Z', '20260610T100000Z')));
    await syncSchedulerCalendarSubscription(learn.client, subscription(), { timeZone: 'UTC', now: NOW });
    const key = String((learn.padlets[0].metadata as Row).calendarEventKey);

    mocks.fetchIcsText.mockResolvedValue(ics(event('u1', 'Renamed', '20260610T090000Z', '20260610T100000Z')));
    const fake = makeClient({ padlets: [entryRow({ metadata: { ...(entryRow().metadata as Row), calendarEventKey: key } })] });
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result.updated).toBe(1);
    const update = fake.updated.find((values) => values.title !== undefined)!;
    expect(update.title).toBe('Renamed');
    const metadata = update.metadata as Row;
    expect(metadata.cardColor).toBe('#123456');
    expect(metadata.calendarEventKey).toBe(key);
  });

  it('stores all-day events as local midnights with an exclusive end', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics('BEGIN:VEVENT\nUID:u2\nSUMMARY:Off\nDTSTART;VALUE=DATE:20260610\nDTEND;VALUE=DATE:20260613\nEND:VEVENT'));
    const fake = makeClient();
    await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    const metadata = fake.padlets[0].metadata as Row;
    expect(metadata.isAllDay).toBe(true);
    expect(metadata.start_date).toBe(zonedMidnightUtc('2026-06-10', 'UTC'));
    expect(metadata.end_date).toBe(zonedMidnightUtc('2026-06-13', 'UTC'));
  });

  it('removes an entry whose event left the calendar', async () => {
    const learn = makeClient();
    mocks.fetchIcsText.mockResolvedValue(ics(event('gone', 'Gone', '20260610T090000Z', '20260610T100000Z')));
    await syncSchedulerCalendarSubscription(learn.client, subscription(), { timeZone: 'UTC', now: NOW });
    const key = String((learn.padlets[0].metadata as Row).calendarEventKey);

    mocks.fetchIcsText.mockResolvedValue(ics(event('other', 'Other', '20260611T090000Z', '20260611T100000Z')));
    const fake = makeClient({ padlets: [entryRow({ metadata: { ...(entryRow().metadata as Row), calendarEventKey: key } })] });
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result.removed).toBe(1);
    expect(fake.deleted).toContain('entry-1');
  });

  it('unlinks (never deletes) an entry that has posts inside', async () => {
    mocks.fetchIcsText.mockResolvedValue(ics(event('other', 'Other', '20260611T090000Z', '20260611T100000Z')));
    const fake = makeClient({
      padlets: [
        entryRow({ id: 'entry-1', metadata: { ...(entryRow().metadata as Row), calendarEventKey: 'b'.repeat(64) } }),
        { id: 'post-1', board_id: 'board-1', title: '', metadata: { parentId: 'entry-1' }, created_at: '2026-05-02T00:00:00Z' },
      ],
    });
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result.removed).toBe(1);
    expect(fake.deleted).not.toContain('entry-1');
    const metadata = fake.padlets.find((row) => row.id === 'entry-1')!.metadata as Row;
    expect(metadata.calendarEventKey).toBeUndefined();
    expect(metadata.calendarSubscriptionId).toBeUndefined();
  });

  it('keeps an entry older than the parse window, and never deletes from a truncated feed', async () => {
    const before = makeClient({ padlets: [entryRow({ metadata: { ...(entryRow().metadata as Row), start_date: '2025-01-01T00:00:00Z', calendarEventKey: 'c'.repeat(64) } })] });
    mocks.fetchIcsText.mockResolvedValue(ics(event('other', 'Other', '20260611T090000Z', '20260611T100000Z')));
    expect((await syncSchedulerCalendarSubscription(before.client, subscription(), { timeZone: 'UTC', now: NOW })).removed).toBe(0);

    const truncated = makeClient({ padlets: [entryRow({ id: 'kept', metadata: { ...(entryRow().metadata as Row), calendarEventKey: 'd'.repeat(64) } })] });
    const many = Array.from({ length: 501 }, (_, index) => event(`u${index}`, `E${index}`, '20260610T090000Z', '20260610T100000Z')).join('\n');
    mocks.fetchIcsText.mockResolvedValue(ics(many));
    expect((await syncSchedulerCalendarSubscription(truncated.client, subscription(), { timeZone: 'UTC', now: NOW })).removed).toBe(0);
    expect(truncated.padlets.some((row) => row.id === 'kept')).toBe(true);
  });

  it('collapses duplicate keys, keeping the oldest', async () => {
    const learn = makeClient();
    mocks.fetchIcsText.mockResolvedValue(ics(event('u1', 'Meeting', '20260610T090000Z', '20260610T100000Z')));
    await syncSchedulerCalendarSubscription(learn.client, subscription(), { timeZone: 'UTC', now: NOW });
    const key = String((learn.padlets[0].metadata as Row).calendarEventKey);

    const fake = makeClient({
      padlets: [
        entryRow({ id: 'old', created_at: '2026-05-01T00:00:00Z', metadata: { ...(entryRow().metadata as Row), calendarEventKey: key } }),
        entryRow({ id: 'new', created_at: '2026-05-09T00:00:00Z', metadata: { ...(entryRow().metadata as Row), calendarEventKey: key } }),
      ],
    });
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result.removed).toBe(1);
    expect(fake.deleted).toContain('new');
    expect(fake.padlets.some((row) => row.id === 'old')).toBe(true);
  });

  it('a fetch failure changes nothing and records a reason', async () => {
    mocks.fetchIcsText.mockRejectedValue(new PublicUrlError('upstream_error', 'HTTP 500', 500));
    const fake = makeClient({ padlets: [entryRow()] });
    const result = await syncSchedulerCalendarSubscription(fake.client, subscription(), { timeZone: 'UTC', now: NOW });
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0, reason: 'upstream_error' });
    expect(fake.inserted).toHaveLength(0);
    expect(fake.deleted).toHaveLength(0);
    expect(fake.subscriptions[0].last_error).toBe('upstream_error');
  });
});

describe('PATCH-333 one-time scheduler import', () => {
  it('creates entries without calendar keys and skips duplicates', async () => {
    const fake = makeClient();
    const events = [
      { title: 'Meeting', description: '', allDay: false, startIso: '2026-06-10T09:00:00.000Z', endIso: '2026-06-10T10:00:00.000Z' },
      { title: 'Meeting', description: '', allDay: false, startIso: '2026-06-10T09:00:00.000Z', endIso: '2026-06-10T10:00:00.000Z' },
    ];
    const result = await importSchedulerEntries(fake.client, 'board-1', events, { timeZone: 'UTC' });
    expect(result.added).toBe(1);
    const metadata = fake.padlets[0].metadata as Row;
    expect(metadata.calendarSubscriptionId).toBeUndefined();
    expect(metadata.calendarEventKey).toBeUndefined();
    expect(metadata.start_date).toBe('2026-06-10T09:00:00.000Z');
  });

  it('skips an event already on the board', async () => {
    const fake = makeClient({
      padlets: [entryRow({ id: 'existing', title: 'Meeting', metadata: { start_date: '2026-06-10T09:00:00.000Z', end_date: '2026-06-10T10:00:00.000Z' } })],
    });
    const events = [
      { title: 'Meeting', description: '', allDay: false, startIso: '2026-06-10T09:00:00.000Z', endIso: '2026-06-10T10:00:00.000Z' },
    ];
    expect((await importSchedulerEntries(fake.client, 'board-1', events, { timeZone: 'UTC' })).added).toBe(0);
  });
});
