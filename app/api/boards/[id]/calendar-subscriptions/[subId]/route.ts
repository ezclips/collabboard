import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { checkCalendarRateLimit, type CalendarSyncClient } from '@/lib/server/kanban/calendarSync';

/** PATCH-328. Disconnect a calendar. The FK cascade removes the cards it made. */

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

async function isKanbanBoard(client: CalendarSyncClient, boardId: string): Promise<boolean> {
  const { data, error } = await client
    .from('boards')
    .select('id, layout')
    .eq('id', boardId)
    .maybeSingle();
  return !error && !!data && data.layout === 'kanban';
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
    if (!(await isKanbanBoard(client, boardId))) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
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
