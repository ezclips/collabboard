import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';

/**
 * PATCH-362. Remove one person's access to this board.
 *
 * Admin-only, like the list. The board owner cannot be removed. Deleting the
 * `board_collaborators` row is enough: the `sync_kanban_after_collaborator_change`
 * trigger drops the matching `kanban_board_members` row (except an admin/owner).
 */

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const cookieStore = await cookies();
  const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id: boardId, userId } = await context.params;

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

  // The board owner cannot be removed: they hold access by ownership, not by a
  // collaborator row, and there would be nothing to remove them from.
  const { data: board, error: boardError } = await admin
    .from('boards')
    .select('user_id')
    .eq('id', boardId)
    .maybeSingle();
  if (boardError) {
    console.error('Board lookup failed:', boardError);
    return NextResponse.json({ error: 'Could not remove this person.' }, { status: 500 });
  }
  const ownerId = (board as { user_id?: string | null } | null)?.user_id ?? null;
  if (ownerId !== null && ownerId === userId) {
    return NextResponse.json({ error: "The board owner can't be removed." }, { status: 400 });
  }

  // `select` after the delete distinguishes "removed a row" from "there was
  // nothing there", so a no-op delete never reports success.
  const { data: deleted, error: deleteError } = await admin
    .from('board_collaborators')
    .delete()
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .select('user_id');
  if (deleteError) {
    console.error('Collaborator delete failed:', deleteError);
    return NextResponse.json({ error: 'Could not remove this person.' }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'That person is not a collaborator.' }, { status: 404 });
  }

  return NextResponse.json({ removed: true });
}
