import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';
import {
  boardPersonFromRow,
  sortBoardPeople,
  type BoardCollaboratorRow,
  type BoardUserProfile,
} from '@/lib/domain/sharing/boardPeople';

/**
 * PATCH-362. PEOPLE WITH ACCESS: who joined this board through a share link.
 *
 * Admin-only, like the redeem route: the caller's board permission is read with
 * `getBoardPermission` and must satisfy `admin`. The rows are read with the
 * service-role admin client AFTER that check, because a collaborator cannot read
 * another user's `public.users` row under RLS. A guest (a user with no email) is
 * returned with `isGuest: true` and `email: null`.
 */

export const runtime = 'nodejs';

const MAX_PEOPLE = 500;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

  const { data: collaboratorRows, error: collaboratorError } = await admin
    .from('board_collaborators')
    .select('user_id, role, added_at')
    .eq('board_id', boardId)
    .order('added_at', { ascending: true })
    .limit(MAX_PEOPLE);
  if (collaboratorError) {
    console.error('Collaborator list failed:', collaboratorError);
    return NextResponse.json({ error: 'Could not load people.' }, { status: 500 });
  }
  const rows = (collaboratorRows ?? []) as BoardCollaboratorRow[];

  const userIds = [...new Set(
    rows.map((row) => row.user_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  const profiles = new Map<string, BoardUserProfile>();
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await admin
      .from('users')
      .select('id, email, name, full_name')
      .in('id', userIds);
    if (profileError) {
      console.error('Collaborator profiles failed:', profileError);
      return NextResponse.json({ error: 'Could not load people.' }, { status: 500 });
    }
    for (const profile of (profileRows ?? []) as BoardUserProfile[]) {
      if (typeof profile.id === 'string') profiles.set(profile.id, profile);
    }
  }

  const people = sortBoardPeople(
    rows.map((row) => boardPersonFromRow(row, profiles.get(row.user_id) ?? null)),
  );

  return NextResponse.json({ people });
}
