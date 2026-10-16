import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';

/**
 * PATCH-365 / PATCH-380. Turn a guest link OFF: delete the board-target share
 * link.
 *
 * Admin-only, same authority as the list. Deleting the row stops NEW joins. With
 * an optional body `{ removeJoined: true }` it ALSO removes the people who joined
 * through this link -- collected BEFORE the delete, because the FK is
 * `ON DELETE SET NULL` and would otherwise erase the very ids we need. The
 * matching `kanban_board_members` rows go via PATCH-362's sync trigger.
 */

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; linkId: string }> },
) {
  const cookieStore = await cookies();
  const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id: boardId, linkId } = await context.params;
  if (!UUID.test(boardId) || !UUID.test(linkId)) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  // The optional body. An absent or unparseable body simply means "link only".
  let removeJoined = false;
  try {
    const body = await request.json() as { removeJoined?: unknown } | null;
    removeJoined = body?.removeJoined === true;
  } catch {
    removeJoined = false;
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 500 });
  }

  let permission;
  try {
    permission = await getBoardPermission(admin, boardId, user.id);
  } catch (error) {
    console.error('Could not check board permission:', error);
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }
  if (!boardPermissionSatisfies(permission, 'admin')) {
    return NextResponse.json({ error: 'Only the board owner can manage access.' }, { status: 403 });
  }

  // PATCH-380. BEFORE the link is deleted, collect who joined through it. The FK
  // is ON DELETE SET NULL, so after the delete these rows have no join id and
  // cannot be found again. The owner is excluded, always.
  let joinedUserIds: readonly string[] = [];
  if (removeJoined) {
    const { data: board, error: boardError } = await admin
      .from('boards')
      .select('user_id')
      .eq('id', boardId)
      .maybeSingle();
    if (boardError) {
      console.error('Could not read the board owner:', boardError);
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    const ownerId = (board as { user_id?: string | null } | null)?.user_id ?? null;

    const { data: rows, error: joinedError } = await admin
      .from('board_collaborators')
      .select('user_id')
      .eq('board_id', boardId)
      .eq('joined_via_link_id', linkId);
    if (joinedError) {
      console.error('Could not list the people who joined:', joinedError);
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    joinedUserIds = (rows ?? [])
      .map((row) => (row as { user_id?: string | null }).user_id)
      .filter((id): id is string => typeof id === 'string' && id !== ownerId);
  }

  // `select` after the delete distinguishes "turned a link off" from "there was
  // no such link", so a no-op delete never reports success.
  const { data: deleted, error } = await admin
    .from('share_links')
    .delete()
    .eq('id', linkId)
    .eq('board_id', boardId)
    .eq('share_target', 'board')
    .select('id');
  if (error) {
    console.error('Guest link delete failed:', error);
    return NextResponse.json({ error: 'Could not turn off this link.' }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  }

  let removed = 0;
  if (removeJoined && joinedUserIds.length > 0) {
    // Deleting these board_collaborators rows cascades to kanban_board_members
    // through PATCH-362's trigger. A failure here is reported, not swallowed --
    // the link is already off, and the caller deserves to know some people
    // remain.
    const { data: removedRows, error: removeError } = await admin
      .from('board_collaborators')
      .delete()
      .eq('board_id', boardId)
      .in('user_id', joinedUserIds)
      .select('user_id');
    if (removeError) {
      console.error('Removing joined guests failed:', removeError);
      return NextResponse.json({ error: 'The link was turned off, but removing its people failed.' }, { status: 500 });
    }
    removed = removedRows?.length ?? 0;
  }

  return NextResponse.json({ removed });
}
