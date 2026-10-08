import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import {
  checkCalendarRateLimit,
  syncCalendarSubscription,
  type CalendarSyncClient,
} from '@/lib/server/kanban/calendarSync';
import { CalendarLinkCipherError, encryptCalendarLink } from '@/lib/server/kanban/calendarLinkCipher';
import { IcsParseError, parseIcsEvents } from '@/lib/kanban/icsImport';
import { PublicUrlError, fetchIcsText } from '@/lib/server/net/publicUrlGuard';

/**
 * PATCH-328. A board's connected calendars.
 *
 * GET lists them (RLS: only board members with edit/admin see any row); POST
 * connects a new one. The link is encrypted before it is written and never
 * returned, and neither the plaintext nor the ciphertext ever appears in a
 * response, an error or a log.
 */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

const MAX_SUBSCRIPTIONS_PER_BOARD = 5;

function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const createSchema = z.object({
  url: z.string().min(1),
  columnId: z.string().uuid(),
  swimlaneId: z.string().uuid().optional(),
  timeZone: z.string().min(1),
}).strict();

async function isKanbanBoard(client: CalendarSyncClient, boardId: string): Promise<boolean> {
  const { data, error } = await client
    .from('boards')
    .select('id, layout')
    .eq('id', boardId)
    .maybeSingle();
  return !error && !!data && data.layout === 'kanban';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: boardId } = await context.params;
    const client = sessionClient as unknown as CalendarSyncClient;
    if (!(await isKanbanBoard(client, boardId))) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const { data: subscriptions, error } = await client
      .from('kanban_calendar_subscriptions')
      .select('id, url_host, target_column_id, last_synced_at, last_error')
      .eq('canvas_id', boardId);
    if (error) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    const rows = Array.isArray(subscriptions) ? (subscriptions as Record<string, unknown>[]) : [];

    const { data: cardRows } = await client
      .from('kanban_cards')
      .select('calendar_subscription_id')
      .eq('canvas_id', boardId);
    const counts = new Map<string, number>();
    if (Array.isArray(cardRows)) {
      for (const row of cardRows as Record<string, unknown>[]) {
        const id = typeof row.calendar_subscription_id === 'string' ? row.calendar_subscription_id : null;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    return NextResponse.json(rows.map((row) => ({
      id: String(row.id),
      urlHost: typeof row.url_host === 'string' ? row.url_host : '',
      targetColumnId: typeof row.target_column_id === 'string' ? row.target_column_id : null,
      lastSyncedAt: typeof row.last_synced_at === 'string' ? row.last_synced_at : null,
      lastError: typeof row.last_error === 'string' ? row.last_error : null,
      cardCount: counts.get(String(row.id)) ?? 0,
    })));
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    if (!isValidTimeZone(parsed.data.timeZone)) {
      return NextResponse.json({ error: 'Invalid time zone.' }, { status: 400 });
    }

    const { id: boardId } = await context.params;
    const client = sessionClient as unknown as CalendarSyncClient;
    if (!(await isKanbanBoard(client, boardId))) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const { data: existing, error: existingError } = await client
      .from('kanban_calendar_subscriptions')
      .select('id')
      .eq('canvas_id', boardId);
    if (existingError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    if (Array.isArray(existing) && existing.length >= MAX_SUBSCRIPTIONS_PER_BOARD) {
      return NextResponse.json({ error: 'This board already has the maximum number of calendars.' }, { status: 409 });
    }

    // FIRST read the link, so a bad one saves nothing. Same messages as the
    // one-off import route.
    let text: string;
    try {
      text = await fetchIcsText(parsed.data.url);
    } catch (error) {
      if (error instanceof PublicUrlError) {
        if (error.reason === 'invalid_url') return NextResponse.json({ error: 'That calendar link is not allowed.' }, { status: 400 });
        if (error.reason === 'blocked_host') return NextResponse.json({ error: 'That calendar link is not allowed.' }, { status: 400 });
        if (error.reason === 'dns_failed') return NextResponse.json({ error: 'That calendar link is not allowed.' }, { status: 400 });
        if (error.reason === 'too_large') return NextResponse.json({ error: 'This calendar is too large.' }, { status: 413 });
        if (error.reason === 'upstream_error') return NextResponse.json({ error: error.message }, { status: 502 });
        return NextResponse.json({ error: 'The calendar link could not be reached.' }, { status: 502 });
      }
      return NextResponse.json({ error: 'The calendar link could not be read.' }, { status: 502 });
    }
    if (!text.includes('BEGIN:VCALENDAR')) {
      return NextResponse.json({ error: 'This link did not return a calendar' }, { status: 422 });
    }
    try {
      parseIcsEvents(text, { now: new Date() });
    } catch (error) {
      if (error instanceof IcsParseError) {
        return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
      }
      return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
    }

    let urlCiphertext: string;
    try {
      urlCiphertext = encryptCalendarLink(parsed.data.url);
    } catch (error) {
      if (error instanceof CalendarLinkCipherError && error.code === 'missing_key') {
        return NextResponse.json({ error: 'Calendar links are not configured on this server.' }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }

    const urlHost = new URL(parsed.data.url.replace(/^webcal:\/\//i, 'https://')).hostname;
    const { data: inserted, error: insertError } = await client
      .from('kanban_calendar_subscriptions')
      .insert({
        canvas_id: boardId,
        created_by: user.id,
        url_ciphertext: urlCiphertext,
        url_host: urlHost,
        target_column_id: parsed.data.columnId,
        target_swimlane_id: parsed.data.swimlaneId ?? null,
      })
      .select('id')
      .maybeSingle();
    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    const subscriptionId = String((inserted as Record<string, unknown>).id);

    const result = await syncCalendarSubscription(client, {
      id: subscriptionId,
      canvasId: boardId,
      urlCiphertext,
      targetColumnId: parsed.data.columnId,
      targetSwimlaneId: parsed.data.swimlaneId ?? null,
    }, { timeZone: parsed.data.timeZone });

    return NextResponse.json({
      id: subscriptionId,
      urlHost,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
    });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
