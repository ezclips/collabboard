import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { checkCalendarRateLimit, type CalendarSyncClient } from '@/lib/server/kanban/calendarSync';
import { importSchedulerEntries } from '@/lib/server/scheduler/calendarSchedulerSync';
import { IcsParseError, parseIcsEvents } from '@/lib/kanban/icsImport';
import { MAX_ICS_BYTES, PublicUrlError, fetchIcsText } from '@/lib/server/net/publicUrlGuard';

/**
 * PATCH-333. One-time calendar import onto a STANDALONE Scheduler board.
 *
 * Creates ordinary entries with NO calendar keys (the board is not "kept
 * updated" from this). Same auth, limits, URL guard and messages as the
 * Kanban one-off import; the link is never logged, stored or returned.
 */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
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

const requestSchema = z
  .object({
    url: z.string().min(1).optional(),
    icsText: z.string().min(1).optional(),
    timeZone: z.string().min(1),
  })
  .strict()
  .refine((value) => (value.url === undefined) !== (value.icsText === undefined), {
    message: 'Provide exactly one of url or icsText.',
  });

const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function jsonForFetchError(error: unknown): NextResponse {
  if (error instanceof PublicUrlError) {
    switch (error.reason) {
      case 'too_large':
        return NextResponse.json({ error: 'This calendar is too large.' }, { status: 413 });
      case 'invalid_url':
      case 'blocked_host':
      case 'dns_failed':
        return NextResponse.json({ error: 'That calendar link is not allowed.' }, { status: 400 });
      case 'too_many_redirects':
        return NextResponse.json({ error: 'The calendar link redirected too many times.' }, { status: 502 });
      case 'upstream_error':
        return NextResponse.json({ error: error.message }, { status: 502 });
      case 'network_error':
      default:
        return NextResponse.json({ error: 'The calendar link could not be reached.' }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'The calendar link could not be read.' }, { status: 502 });
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
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provide exactly one of url or icsText.' }, { status: 400 });
    }
    if (!isValidTimeZone(parsed.data.timeZone)) {
      return NextResponse.json({ error: 'Invalid time zone.' }, { status: 400 });
    }

    const { id: boardId } = await context.params;
    let allowed: boolean;
    try {
      allowed = await canReadBoardKnowledge(
        sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
        boardId,
        user.id,
      );
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let icsText: string;
    if (parsed.data.icsText !== undefined) {
      if (textByteLength(parsed.data.icsText) > MAX_ICS_BYTES) {
        return NextResponse.json({ error: 'This calendar is too large.' }, { status: 413 });
      }
      icsText = parsed.data.icsText;
    } else {
      let fetched: string;
      try {
        fetched = await fetchIcsText(parsed.data.url as string);
      } catch (error) {
        return jsonForFetchError(error);
      }
      if (!fetched.includes('BEGIN:VCALENDAR')) {
        return NextResponse.json({ error: 'This link did not return a calendar' }, { status: 422 });
      }
      icsText = fetched;
    }

    let events;
    try {
      events = parseIcsEvents(icsText, { now: new Date() }).events;
    } catch (error) {
      if (error instanceof IcsParseError) {
        return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
      }
      return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
    }

    const result = await importSchedulerEntries(
      sessionClient as unknown as CalendarSyncClient,
      boardId,
      events,
      { timeZone: parsed.data.timeZone },
    );

    return NextResponse.json({ added: result.added });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
