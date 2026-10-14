import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';
import { isGuestLinkActive, toGuestLink, type GuestLinkRow } from '@/lib/domain/sharing/guestLinks';

/**
 * PATCH-365. GUEST LINKS: the board's active board-target share links.
 *
 * Admin-only, copying the People route's authority exactly: the caller's board
 * permission is read with `getBoardPermission` and must satisfy `admin`. The rows
 * are read with the service-role admin client AFTER that check -- `share_links`
 * carries a password hash, so it is never read on a user's session. Only the
 * shaped `GuestLink` is returned: no token column, no hash.
 */

export const runtime = 'nodejs';

const MAX_LINKS = 50;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id: boardId } = await context.params;

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

  const { data, error } = await admin
    .from('share_links')
    .select('id, token, permission, created_at, expires_at, password_hash, access_count')
    .eq('board_id', boardId)
    .eq('share_target', 'board')
    .order('created_at', { ascending: false })
    .limit(MAX_LINKS);
  if (error) {
    console.error('Guest link list failed:', error);
    return NextResponse.json({ error: 'Could not load guest links.' }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const now = new Date();
  const links = ((data ?? []) as GuestLinkRow[])
    .filter((row) => isGuestLinkActive(row, now))
    .map((row) => toGuestLink(row, origin));

  return NextResponse.json({ links });
}
