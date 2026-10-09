import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import {
  checkCalendarRateLimit,
  resolveCalendarBoardKind,
  type CalendarSyncClient,
} from '@/lib/server/kanban/calendarSync';
import { removeSchedulerSubscriptionEntries } from '@/lib/server/scheduler/calendarSchedulerSync';

/** PATCH-328/333. Disconnect a calendar and the entries it created. */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export async function DELETE(
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

    const { id: boardId, subId } = await context.params;
    const client = sessionClient as unknown as CalendarSyncClient;
    const kind = await resolveCalendarBoardKind(client, boardId);
    if (kind === null) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (kind === 'scheduler') {
      // Remove (or unlink) the entries BEFORE deleting the row, then report.
      const { removedEntries, keptEntries } = await removeSchedulerSubscriptionEntries(client, boardId, subId);
      const { error: deleteError } = await client
        .from('kanban_calendar_subscriptions')
        .delete()
        .eq('id', subId)
        .eq('canvas_id', boardId);
      if (deleteError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
      return NextResponse.json({ removedEntries, keptEntries });
    }

    // Count BEFORE deleting: the cascade removes the cards, so afterwards there
    // is nothing to count.
    const { data: cards, error: countError } = await client
      .from('kanban_cards')
      .select('id')
      .eq('calendar_subscription_id', subId);
    if (countError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    const removedCards = Array.isArray(cards) ? cards.length : 0;

    const { error: deleteError } = await client
      .from('kanban_calendar_subscriptions')
      .delete()
      .eq('id', subId)
      .eq('canvas_id', boardId);
    if (deleteError) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

    return NextResponse.json({ removedCards });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
