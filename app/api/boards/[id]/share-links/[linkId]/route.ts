import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';

/**
 * PATCH-365. Turn a guest link OFF: delete the board-target share link.
 *
 * Admin-only, same authority as the list. Deleting the row stops NEW joins; the
 * people who already joined keep access until removed on the People tab.
 */

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
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

  return NextResponse.json({ ok: true });
}
