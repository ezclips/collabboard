import { decryptCalendarLink } from '@/lib/server/kanban/calendarLinkCipher';
import { parseIcsEvents, type ImportedEvent } from '@/lib/kanban/icsImport';
import { fetchIcsText } from '@/lib/server/net/publicUrlGuard';
import {
  reasonFor,
  type CalendarSyncClient,
  type CalendarSyncResult,
  type CalendarSyncSubscription,
} from '@/lib/server/kanban/calendarSync';

// PATCH-333. The sync engine for a STANDALONE Scheduler board.
//
// Same contract as the Kanban engine (PATCH-328): the caller's own client, no
// admin client; decrypt -> fetch -> parse with source keys; a failure writes
// nothing but `last_error`. The difference is what a "card" is: a Scheduler
// entry is an ordinary `padlets` row of type 'container', and its calendar
// identity lives in `metadata.calendarSubscriptionId` / `metadata.calendarEventKey`.

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_TYPE = 'container';
const ENTRY_WIDTH = 280;
const ENTRY_HEIGHT = 180;

type Row = Record<string, unknown>;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function metadataOf(row: Row): Record<string, unknown> {
  const metadata = row.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

/** The entry's body: a Location line and the description, blank-line separated. */
function contentFor(event: ImportedEvent): string {
  const parts: string[] = [];
  if (event.location) parts.push(`Location: ${event.location}`);
  if (event.description) parts.push(event.description);
  return parts.join('\n\n');
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - date.getTime();
}

/** The UTC instant of local midnight on `dateStr` in `timeZone`. */
export function zonedMidnightUtc(dateStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const offset = zoneOffsetMs(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offset).toISOString();
}

function nextDay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + DAY_MS).toISOString().slice(0, 10);
}

interface EntryDates {
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay: boolean;
}

/**
 * The entry's dates. Timed events keep their UTC instants. All-day events are
 * stored as LOCAL midnights (the browser's zone), with the end EXCLUSIVE --
 * react-big-calendar renders an all-day bar from `start` up to `end`, so the
 * day after the last inclusive day is what makes the bar cover the right days.
 */
export function entryDatesFor(event: ImportedEvent, timeZone: string): EntryDates {
  if (event.allDay) {
    const start = event.startDate ?? '';
    const end = event.endDate ?? start;
    return {
      startDate: zonedMidnightUtc(start, timeZone),
      endDate: zonedMidnightUtc(nextDay(end), timeZone),
      allDay: true,
    };
  }
  return { startDate: event.startIso as string, endDate: event.endIso as string, allDay: false };
}

async function hasChildren(client: CalendarSyncClient, boardId: string, entryId: string): Promise<boolean> {
  const { data } = await client
    .from('padlets')
    .select('id')
    .eq('board_id', boardId)
    .eq('metadata->>parentId', entryId);
  return Array.isArray(data) && data.length > 0;
}

/** Removes the calendar identity from an entry's metadata, keeping everything else. */
async function unlinkEntry(client: CalendarSyncClient, entryId: string, metadata: Record<string, unknown>): Promise<void> {
  const { calendarSubscriptionId: _subscription, calendarEventKey: _key, ...rest } = metadata;
  await client.from('padlets').update({ metadata: rest }).eq('id', entryId);
}

/**
 * Removes ONE entry, unless it has posts inside it -- then its content is the
 * user's and only the calendar link is dropped. Returns true when it was
 * actually deleted, false when it was kept.
 */
async function removeOrUnlink(
  client: CalendarSyncClient,
  boardId: string,
  row: Row,
): Promise<boolean> {
  if (await hasChildren(client, boardId, String(row.id))) {
    await unlinkEntry(client, String(row.id), metadataOf(row));
    return false;
  }
  await client.from('padlets').delete().eq('id', row.id);
  return true;
}

/** Reads the entries a subscription created on a board. */
async function readSubscriptionEntries(
  client: CalendarSyncClient,
  boardId: string,
  subscriptionId: string,
): Promise<Row[]> {
  const { data } = await client
    .from('padlets')
    .select('id, title, content, metadata, created_at')
    .eq('board_id', boardId)
    .eq('metadata->>calendarSubscriptionId', subscriptionId);
  return Array.isArray(data) ? (data as Row[]) : [];
}

/**
 * Disconnect: remove the subscription's entries (or unlink the ones with posts
 * inside). Returns the counts the route reports.
 */
export async function removeSchedulerSubscriptionEntries(
  client: CalendarSyncClient,
  boardId: string,
  subscriptionId: string,
): Promise<{ removedEntries: number; keptEntries: number }> {
  const rows = await readSubscriptionEntries(client, boardId, subscriptionId);
  let removedEntries = 0;
  let keptEntries = 0;
  for (const row of rows) {
    if (await removeOrUnlink(client, boardId, row)) removedEntries += 1;
    else keptEntries += 1;
  }
  return { removedEntries, keptEntries };
}

function entryIdentity(title: string, start: string, end: string): string {
  return `${title}\u0000${start}\u0000${end}`;
}

/**
 * One-time import: create entries with NO calendar keys. Skips an event whose
 * title + start + end already match an entry on the board.
 */
export async function importSchedulerEntries(
  client: CalendarSyncClient,
  boardId: string,
  events: readonly ImportedEvent[],
  options: { timeZone: string },
): Promise<{ added: number }> {
  const { data: existing } = await client
    .from('padlets')
    .select('title, metadata')
    .eq('board_id', boardId)
    .eq('type', ENTRY_TYPE);

  const seen = new Set<string>();
  if (Array.isArray(existing)) {
    for (const row of existing as Row[]) {
      const metadata = metadataOf(row);
      seen.add(entryIdentity(textOf(row.title), textOf(metadata.start_date), textOf(metadata.end_date)));
    }
  }

  let added = 0;
  for (const event of events) {
    const dates = entryDatesFor(event, options.timeZone);
    const identity = entryIdentity(event.title, dates.startDate, dates.endDate);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const { error } = await client.from('padlets').insert({
      board_id: boardId,
      title: event.title,
      content: contentFor(event),
      type: ENTRY_TYPE,
      position_x: 0,
      position_y: 0,
      width: ENTRY_WIDTH,
      height: ENTRY_HEIGHT,
      metadata: { start_date: dates.startDate, end_date: dates.endDate, isAllDay: dates.allDay },
    });
    if (!error) added += 1;
  }
  return { added };
}

/**
 * Runs one sync for a Scheduler subscription. Card changes only ever happen
 * after a clean fetch + parse; any failure records a reason and changes nothing.
 */
export async function syncSchedulerCalendarSubscription(
  client: CalendarSyncClient,
  subscription: CalendarSyncSubscription,
  options: { timeZone: string; now?: Date },
): Promise<CalendarSyncResult> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone;
  const windowStartMs = now.getTime() - 30 * DAY_MS;

  const fail = async (reason: string): Promise<CalendarSyncResult> => {
    await client
      .from('kanban_calendar_subscriptions')
      .update({ last_error: reason })
      .eq('id', subscription.id);
    return { added: 0, updated: 0, removed: 0, unchanged: 0, reason };
  };

  let events: readonly ImportedEvent[];
  let truncated: boolean;
  try {
    const url = decryptCalendarLink(subscription.urlCiphertext);
    const text = await fetchIcsText(url);
    if (!text.includes('BEGIN:VCALENDAR')) return await fail('not_a_calendar');
    const parsed = parseIcsEvents(text, { now, includeSourceKey: true });
    events = parsed.events;
    truncated = parsed.truncated;
  } catch (error) {
    return await fail(reasonFor(error));
  }

  const rows = await readSubscriptionEntries(client, subscription.canvasId, subscription.id);

  // Collapse duplicate keys first: keep the OLDEST entry per key, remove the
  // rest (or unlink them when they hold the user's posts).
  const byKey = new Map<string, Row>();
  let removed = 0;
  for (const row of rows) {
    const metadata = metadataOf(row);
    const key = textOf(metadata.calendarEventKey);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingCreated = Date.parse(textOf(existing.created_at)) || 0;
    const rowCreated = Date.parse(textOf(row.created_at)) || 0;
    const older = rowCreated < existingCreated ? row : existing;
    const newer = rowCreated < existingCreated ? existing : row;
    byKey.set(key, older);
    if (await removeOrUnlink(client, subscription.canvasId, newer)) removed += 1;
    else removed += 1; // unlinked duplicates still count as removed from the feed
  }

  const inserts: Row[] = [];
  const seen = new Set<string>();
  let updated = 0;
  let unchanged = 0;

  for (const event of events) {
    const key = event.sourceKey;
    if (!key) continue;
    seen.add(key);

    const dates = entryDatesFor(event, timeZone);
    const title = event.title;
    const content = contentFor(event);
    const existing = byKey.get(key);

    if (!existing) {
      inserts.push({
        board_id: subscription.canvasId,
        title,
        content,
        type: ENTRY_TYPE,
        position_x: 0,
        position_y: 0,
        width: ENTRY_WIDTH,
        height: ENTRY_HEIGHT,
        metadata: {
          start_date: dates.startDate,
          end_date: dates.endDate,
          isAllDay: dates.allDay,
          calendarSubscriptionId: subscription.id,
          calendarEventKey: key,
        },
      });
      continue;
    }

    const metadata = metadataOf(existing);
    const changed = existing.title !== title
      || (existing.content ?? '') !== content
      || textOf(metadata.start_date) !== dates.startDate
      || textOf(metadata.end_date) !== dates.endDate
      || (metadata.isAllDay === true) !== dates.allDay;
    if (changed) {
      // ONLY the mirrored fields, merged into the existing metadata so a colour
      // or anything else the user set is kept.
      const { error } = await client.from('padlets').update({
        title,
        content,
        metadata: {
          ...metadata,
          start_date: dates.startDate,
          end_date: dates.endDate,
          isAllDay: dates.allDay,
          calendarSubscriptionId: subscription.id,
          calendarEventKey: key,
        },
      }).eq('id', existing.id);
      if (!error) updated += 1;
    } else {
      unchanged += 1;
    }
  }

  // Removals: only when the parse was not truncated, and only for entries
  // inside the parse window (an older entry fell out of the window, not out of
  // the calendar).
  if (!truncated) {
    for (const [key, row] of byKey) {
      if (seen.has(key)) continue;
      const startMs = Date.parse(textOf(metadataOf(row).start_date));
      if (Number.isNaN(startMs) || startMs < windowStartMs) continue;
      if (await removeOrUnlink(client, subscription.canvasId, row)) removed += 1;
      else removed += 1;
    }
  }

  let added = 0;
  for (const row of inserts) {
    const { error } = await client.from('padlets').insert(row);
    if (!error) added += 1;
  }

  await client
    .from('kanban_calendar_subscriptions')
    .update({ last_synced_at: now.toISOString(), last_error: null })
    .eq('id', subscription.id);

  return { added, updated, removed, unchanged };
}
