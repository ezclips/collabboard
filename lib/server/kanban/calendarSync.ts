import { CalendarLinkCipherError, decryptCalendarLink } from './calendarLinkCipher';
import { IcsParseError, parseIcsEvents, type ImportedEvent } from '@/lib/kanban/icsImport';
import { eventToCardFields } from '@/lib/kanban/calendarEventMapping';
import { PublicUrlError, fetchIcsText } from '@/lib/server/net/publicUrlGuard';

// PATCH-328. One-way sync: the calendar is the source of truth, the board
// mirrors it.
//
// A sync adds a card for a new event, renames/redates the card of a changed
// one, and REMOVES the card of an event that vanished -- but only when it can
// be sure the event really left the calendar. It never writes to the calendar.
//
// Every read and write goes through the CALLER'S Supabase client, so RLS
// decides who may sync. The link is decrypted here and never logged, returned
// or stored in the clear.

const DAY_MS = 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = '23505';
const INSERT_CHUNK = 100;

/**
 * The shared calendar rate limiter (PATCH-326's values), used by the one-off
 * import route and every subscription route so they cost one budget. The
 * per-instance scope is pre-existing debt, as it is on the AI and upload routes.
 */
export const CALENDAR_RATE_LIMIT_MAX = 10;
export const CALENDAR_RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function checkCalendarRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > CALENDAR_RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= CALENDAR_RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

export interface CalendarSyncQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select(columns: string): CalendarSyncQuery;
  eq(column: string, value: unknown): CalendarSyncQuery;
  order(column: string, options: { ascending: boolean }): CalendarSyncQuery;
  limit(count: number): CalendarSyncQuery;
  or(filter: string): CalendarSyncQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}

export interface CalendarSyncTable {
  select(columns: string): CalendarSyncQuery;
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): CalendarSyncQuery;
  update(values: Record<string, unknown>): CalendarSyncQuery;
  delete(): CalendarSyncQuery;
}

export interface CalendarSyncClient {
  from(table: string): CalendarSyncTable;
}

export interface CalendarSyncSubscription {
  readonly id: string;
  readonly canvasId: string;
  readonly urlCiphertext: string;
  readonly targetColumnId: string | null;
  readonly targetSwimlaneId: string | null;
}

export interface CalendarSyncResult {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly unchanged: number;
  /** A short reason code when the sync could not run; absent on success. */
  readonly reason?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/** The store's own date normalisation, so server-written dates match its own. */
function normalizeDateInput(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/** A short reason code for `last_error`; never the link or an upstream body. */
function reasonFor(error: unknown): string {
  if (error instanceof CalendarLinkCipherError) return error.code;
  if (error instanceof IcsParseError) return 'not_a_calendar';
  if (error instanceof PublicUrlError) {
    switch (error.reason) {
      case 'invalid_url':
      case 'blocked_host':
      case 'dns_failed':
      case 'too_many_redirects':
      case 'too_large':
      case 'upstream_error':
        return error.reason;
      case 'network_error':
      default:
        return 'network_error';
    }
  }
  return 'unknown';
}

async function setLastError(
  client: CalendarSyncClient,
  subscriptionId: string,
  reason: string,
): Promise<void> {
  await client
    .from('kanban_calendar_subscriptions')
    .update({ last_error: reason })
    .eq('id', subscriptionId);
}

/**
 * Runs one sync for one subscription. Card changes only ever happen after a
 * clean fetch + parse; any failure records a reason and changes no cards.
 */
export async function syncCalendarSubscription(
  client: CalendarSyncClient,
  subscription: CalendarSyncSubscription,
  options: { timeZone: string; now?: Date },
): Promise<CalendarSyncResult> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone;
  const windowStartDate = new Date(now.getTime() - 30 * DAY_MS).toISOString().slice(0, 10);

  const fail = async (reason: string): Promise<CalendarSyncResult> => {
    await setLastError(client, subscription.id, reason);
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

  const { data: cardRows, error: cardError } = await client
    .from('kanban_cards')
    .select('id, calendar_event_key, title, content, date_started, date_due')
    .eq('calendar_subscription_id', subscription.id);
  if (cardError) return await fail('unavailable');
  const rows = Array.isArray(cardRows) ? (cardRows as Record<string, unknown>[]) : [];

  // Target column: the saved one, or the board's first by order.
  let columnId = subscription.targetColumnId;
  if (!columnId) {
    const { data: columns, error: columnError } = await client
      .from('kanban_columns')
      .select('id')
      .eq('canvas_id', subscription.canvasId)
      .order('order_index', { ascending: true })
      .limit(1);
    if (columnError) return await fail('unavailable');
    const first = Array.isArray(columns) ? (columns[0] as Record<string, unknown> | undefined) : undefined;
    columnId = first ? String(first.id) : null;
  }
  if (!columnId) return await fail('no_column');

  // New cards go after the column's last card.
  let nextOrder = 0;
  {
    const { data: columnCards } = await client
      .from('kanban_cards')
      .select('order_index')
      .eq('column_id', columnId);
    if (Array.isArray(columnCards)) {
      nextOrder = columnCards.reduce((max, row) => {
        const value = Number((row as Record<string, unknown>).order_index);
        return Number.isFinite(value) ? Math.max(max, value + 1) : max;
      }, 0);
    }
  }

  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = typeof row.calendar_event_key === 'string' ? row.calendar_event_key : '';
    if (key) byKey.set(key, row);
  }

  const inserts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let updated = 0;
  let unchanged = 0;

  for (const event of events) {
    const key = event.sourceKey;
    if (!key) continue;
    seen.add(key);

    const fields = eventToCardFields(event, timeZone);
    const start = normalizeDateInput(fields.startDate) ?? null;
    const due = normalizeDateInput(fields.endDate) ?? null;
    const content = fields.description ?? null;

    const existing = byKey.get(key);
    if (!existing) {
      inserts.push({
        canvas_id: subscription.canvasId,
        column_id: columnId,
        swimlane_id: subscription.targetSwimlaneId ?? null,
        title: fields.label,
        content,
        date_started: start,
        date_due: due,
        order_index: nextOrder,
        priority: 0,
        score: 0,
        calendar_subscription_id: subscription.id,
        calendar_event_key: key,
      });
      nextOrder += 1;
      continue;
    }

    const currentStart = normalizeDateInput(existing.date_started) ?? null;
    const currentDue = normalizeDateInput(existing.date_due) ?? null;
    const currentContent = existing.content ?? null;
    const changed = existing.title !== fields.label
      || currentContent !== content
      || currentStart !== start
      || currentDue !== due;
    if (changed) {
      // ONLY the mirrored fields. Column, swimlane, order, status, priority,
      // progress, colour, assignees and comments are the user's, never ours.
      const { error } = await client
        .from('kanban_cards')
        .update({ title: fields.label, content, date_started: start, date_due: due })
        .eq('id', existing.id);
      if (!error) updated += 1;
    } else {
      unchanged += 1;
    }
  }

  // Removals: only when the parse was not truncated (a truncated feed simply
  // did not mention the event) and the card is inside the parse window (an
  // older card fell out of the window, not out of the calendar).
  let removed = 0;
  if (!truncated) {
    for (const [key, row] of byKey) {
      if (seen.has(key)) continue;
      const effective = normalizeDateInput(row.date_due) ?? normalizeDateInput(row.date_started);
      if (!effective || effective < windowStartDate) continue;
      const { error } = await client.from('kanban_cards').delete().eq('id', row.id);
      if (!error) removed += 1;
    }
  }

  // Inserts, in chunks. A chunk that trips the unique index (another editor
  // synced at the same moment) is retried row by row, skipping the duplicates.
  let added = 0;
  for (let index = 0; index < inserts.length; index += INSERT_CHUNK) {
    const chunk = inserts.slice(index, index + INSERT_CHUNK);
    const { error } = await client.from('kanban_cards').insert(chunk);
    if (!error) {
      added += chunk.length;
      continue;
    }
    if (!isUniqueViolation(error)) continue;
    for (const row of chunk) {
      const { error: rowError } = await client.from('kanban_cards').insert(row);
      if (!rowError) added += 1;
    }
  }

  await client
    .from('kanban_calendar_subscriptions')
    .update({ last_synced_at: now.toISOString(), last_error: null })
    .eq('id', subscription.id);

  return { added, updated, removed, unchanged };
}
