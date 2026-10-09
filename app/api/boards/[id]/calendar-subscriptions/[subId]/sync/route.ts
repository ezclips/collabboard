import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import {
  checkCalendarRateLimit,
  resolveCalendarBoardKind,
  syncCalendarSubscription,
  type CalendarSyncClient,
} from '@/lib/server/kanban/calendarSync';
import { syncSchedulerCalendarSubscription } from '@/lib/server/scheduler/calendarSchedulerSync';

/** PATCH-328/333. Update one connected calendar now, or when it is stale enough. */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/**
 * The narrow claim surface: plain `is` / `lt` filters and one `maybeSingle`.
 * The atomic claim must NOT use a single `.or()` string -- the live client did
 * not accept it, so every auto-sync reload returned 503.
 */
interface ClaimQuery {
  select(columns: string): ClaimQuery;
  eq(column: string, value: unknown): ClaimQuery;
  is(column: string, value: null): ClaimQuery;
  lt(column: string, value: unknown): ClaimQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}

interface ClaimClient {
  from(table: string): { update(values: Record<string, unknown>): ClaimQuery };
}

/**
 * PATCH-333 Addendum 1. A sync that failed must not answer 200 -- otherwise the
 * modal's "Update now" reads the zero counts as "up to date". The reason code
 * becomes an error status and a plain-words message (never the link).
 */
function syncFailureResponse(reason: string): { status: number; error: string } {
  switch (reason) {
    case 'not_a_calendar':
      return { status: 422, error: 'This link did not return a calendar' };
    case 'missing_key':
      return { status: 503, error: 'Calendar links are not configured on this server.' };
    case 'unavailable':
      return { status: 503, error: 'Could not update this calendar right now.' };
    case 'invalid_ciphertext':
      return { status: 503, error: 'This calendar link could not be read.' };
    case 'invalid_url':
    case 'blocked_host':
    case 'dns_failed':
      return { status: 502, error: 'That calendar link is not allowed.' };
    case 'too_many_redirects':
      return { status: 502, error: 'The calendar link redirected too many times.' };
    case 'too_large':
      return { status: 502, error: 'This calendar is too large.' };
    case 'upstream_error':
      return { status: 502, error: 'The calendar link could not be read.' };
    case 'network_error':
      return { status: 502, error: 'The calendar link could not be reached.' };
    default:
      return { status: 502, error: 'The calendar could not be updated.' };
  }
}

function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const bodySchema = z.object({
  timeZone: z.string().min(1),
  ifOlderThanSeconds: z.number().int().positive().optional(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; subId: string }> },
) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!checkCalendarRateLimit(user.id)) {
      return NextResponse.json({ error: 'Too many imports. Try again in a minute.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success || !isValidTimeZone(parsed.data.timeZone)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const { id: boardId, subId } = await context.params;
    const client = sessionClient as unknown as CalendarSyncClient;
    const kind = await resolveCalendarBoardKind(client, boardId);
    if (kind === null) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const { data: subscription, error: readError } = await client
      .from('kanban_calendar_subscriptions')
      .select('id, url_ciphertext, target_column_id, target_swimlane_id')
      .eq('id', subId)
      .eq('canvas_id', boardId)
      .maybeSingle();
    if (readError) {
      return NextResponse.json({ error: 'Unavailable', code: 'read_failed' }, { status: 503 });
    }
    if (!subscription) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });

    // The auto-sync path asks to be skipped when the calendar was synced
    // recently. The claim is atomic: it moves `last_synced_at` forward only for
    // the row that is stale, so two tabs do not both sync. TWO plain updates
    // rather than one `.or()` -- the live client rejected the combined filter.
    if (parsed.data.ifOlderThanSeconds !== undefined) {
      const nowIso = new Date().toISOString();
      const cutoff = new Date(Date.now() - parsed.data.ifOlderThanSeconds * 1000).toISOString();
      const claims = sessionClient as unknown as ClaimClient;

      // (a) never synced.
      const neverSynced = await claims
        .from('kanban_calendar_subscriptions')
        .update({ last_synced_at: nowIso })
        .eq('id', subId)
        .is('last_synced_at', null)
        .select('id')
        .maybeSingle();
      if (neverSynced.error) {
        return NextResponse.json({ error: 'Unavailable', code: 'claim_failed' }, { status: 503 });
      }

      let claimed = neverSynced.data;
      if (!claimed) {
        // (b) synced before the cutoff.
        const stale = await claims
          .from('kanban_calendar_subscriptions')
          .update({ last_synced_at: nowIso })
          .eq('id', subId)
          .lt('last_synced_at', cutoff)
          .select('id')
          .maybeSingle();
        if (stale.error) {
          return NextResponse.json({ error: 'Unavailable', code: 'claim_failed' }, { status: 503 });
        }
        claimed = stale.data;
      }

      if (!claimed) return NextResponse.json({ skipped: true });
    }

    const subscriptionInput = {
      id: String(subscription.id),
      canvasId: boardId,
      urlCiphertext: String(subscription.url_ciphertext),
      targetColumnId: typeof subscription.target_column_id === 'string' ? subscription.target_column_id : null,
      targetSwimlaneId: typeof subscription.target_swimlane_id === 'string' ? subscription.target_swimlane_id : null,
    };
    const result = kind === 'scheduler'
      ? await syncSchedulerCalendarSubscription(client, subscriptionInput, { timeZone: parsed.data.timeZone })
      : await syncCalendarSubscription(client, subscriptionInput, { timeZone: parsed.data.timeZone });

    if (result.reason) {
      const failure = syncFailureResponse(result.reason);
      return NextResponse.json(
        { error: failure.error, reason: result.reason },
        { status: failure.status },
      );
    }

    return NextResponse.json({
      added: result.added,
      updated: result.updated,
      removed: result.removed,
    });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
