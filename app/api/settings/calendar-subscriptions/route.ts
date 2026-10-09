import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * PATCH-332. The caller's connected calendars, for Settings -> Integrations.
 *
 * Same auth pattern as the integrations route: a Bearer token makes an
 * authenticated client, and RLS decides what exists. The query is scoped to
 * `created_by = user` on top of that.
 *
 * NEVER the ciphertext: only the host is read, and the link itself stays on the
 * server.
 */

export const runtime = 'nodejs';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function makeAuthedClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = makeAuthedClient(token);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const userId = authData.user?.id;
    if (authError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: subscriptions, error } = await supabase
      .from('kanban_calendar_subscriptions')
      .select('id, canvas_id, url_host, last_synced_at, last_error')
      .eq('created_by', userId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to load calendars' }, { status: 500 });
    }

    const rows = subscriptions ?? [];
    const boardIds = [...new Set(
      rows
        .map((row) => row.canvas_id)
        .filter((id): id is string => typeof id === 'string'),
    )];

    const boardTitles = new Map<string, string>();
    if (boardIds.length > 0) {
      const { data: boards } = await supabase
        .from('boards')
        .select('id, title')
        .in('id', boardIds);
      for (const board of boards ?? []) {
        if (typeof board.id === 'string') {
          boardTitles.set(board.id, typeof board.title === 'string' ? board.title : '');
        }
      }
    }

    return NextResponse.json({
      calendars: rows.map((row) => ({
        id: String(row.id),
        boardId: typeof row.canvas_id === 'string' ? row.canvas_id : null,
        boardTitle: typeof row.canvas_id === 'string' ? (boardTitles.get(row.canvas_id) ?? '') : '',
        urlHost: typeof row.url_host === 'string' ? row.url_host : '',
        lastSyncedAt: typeof row.last_synced_at === 'string' ? row.last_synced_at : null,
        lastError: typeof row.last_error === 'string' ? row.last_error : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
