import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { IcsParseError, parseIcsEvents } from '@/lib/kanban/icsImport';
import { MAX_ICS_BYTES, PublicUrlError, fetchIcsText } from '@/lib/server/net/publicUrlGuard';

/**
 * PATCH-326. Read an .ics calendar (uploaded or linked) into events.
 *
 * The route WRITES NOTHING. It authorizes the caller's read of the board, turns
 * the text into events, and returns them; the browser store creates the cards,
 * where RLS still decides who may write.
 *
 * THE LINK IS A SECRET. A Google "secret address" grants read access to a whole
 * calendar, so the URL is never logged, stored, echoed, or put into an error
 * message -- only a status or a fixed sentence is returned.
 */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/**
 * The same per-instance fixed-window limiter the Knowledge and AI routes use.
 * No shared reusable limiter exists in the repo, so this follows the established
 * per-route shape: 10 imports per minute per user.
 */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const requestSchema = z
  .object({
    url: z.string().min(1).optional(),
    icsText: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => (value.url === undefined) !== (value.icsText === undefined), {
    message: 'Provide exactly one of url or icsText.',
  });

const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const sessionClient = createRouteClient(cookieStore);
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
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

    try {
      const result = parseIcsEvents(icsText);
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof IcsParseError) {
        return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
      }
      return NextResponse.json({ error: 'This file is not a calendar (.ics)' }, { status: 422 });
    }
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

/** Maps a guard/fetch refusal to a status WITHOUT ever including the URL. */
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
