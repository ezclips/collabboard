import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  boardPermissionSatisfies,
  getBoardPermission,
  mapLegacyToBoardPermission,
} from '@/lib/auth/permissions';
import { verifySharePassword } from '@/lib/server/share/sharePassword';
import { shareLinkRole, shouldUpgradeCollaborator } from '@/lib/domain/sharing/shareLinkGrant';

/**
 * PATCH-357. Redeem a share link for the SIGNED-IN user: grant them the board
 * role the link carries (via `board_collaborators`), recording the access.
 *
 * Deny by default. The link is loaded with the service-role admin client so a
 * password hash is never readable by the caller; the caller learns only the
 * board id and, for a post-in-board link, the post id -- never the token or the
 * hash. A redeem NEVER downgrades an existing higher collaborator role.
 */

export const runtime = 'nodejs';

// Per-user fixed-window limiter. Local to this route: no other feature shares it.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function allowByRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

interface ShareLinkRow {
  id: string | number;
  board_id: string | null;
  padlet_id: string | null;
  permission: string | null;
  password_hash: string | null;
  expires_at: string | null;
  access_count: number | null;
}

export async function POST(request: NextRequest) {
  // 1. A signed-in user is required; a bearer token is never accepted here.
  const cookieStore = await cookies();
  const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!allowByRateLimit(user.id)) {
    return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  if (token.length === 0) {
    return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Share links are not configured.' }, { status: 500 });
  }

  // 2. The link, loaded with the admin client. Unknown -> 404.
  const { data, error: linkError } = await admin
    .from('share_links')
    .select('id, board_id, padlet_id, permission, password_hash, expires_at, access_count')
    .eq('token', token)
    .maybeSingle();
  if (linkError) {
    console.error('Share link lookup failed:', linkError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  const link = data as ShareLinkRow | null;
  if (!link) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }

  // 3. Post-only links are not board grants.
  if (!link.board_id) {
    return NextResponse.json({ error: 'This link is not a board link.' }, { status: 400 });
  }

  // 4. A password-protected link needs the password before anything is granted.
  if (link.password_hash) {
    if (password.length === 0) {
      return NextResponse.json({ error: 'This link is password-protected.' }, { status: 403 });
    }
    const verification = await verifySharePassword(password, link.password_hash);
    if (!verification.valid) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
    }
  }

  // 5. The role the link grants.
  const collaboratorRole = shareLinkRole(link.permission);
  const requiredPermission = mapLegacyToBoardPermission(link.permission);
  if (!collaboratorRole || !requiredPermission) {
    return NextResponse.json({ error: 'This link grants no board access.' }, { status: 403 });
  }

  // 6. If the user ALREADY has at least this permission (owner, workspace, or a
  //    higher collaborator row), write nothing.
  let existingPermission;
  try {
    existingPermission = await getBoardPermission(admin, link.board_id, user.id);
  } catch (error) {
    console.error('Could not check board permission:', error);
    return NextResponse.json({ error: 'Could not check your access.' }, { status: 503 });
  }

  if (!boardPermissionSatisfies(existingPermission, requiredPermission)) {
    const { data: existing, error: existingError } = await admin
      .from('board_collaborators')
      .select('role')
      .eq('board_id', link.board_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) {
      console.error('Collaborator lookup failed:', existingError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const existingRole = (existing as { role?: string | null } | null)?.role ?? null;
    if (shouldUpgradeCollaborator(existingRole, collaboratorRole)) {
      const { error: upsertError } = await admin
        .from('board_collaborators')
        .upsert(
          { board_id: link.board_id, user_id: user.id, role: collaboratorRole },
          { onConflict: 'board_id,user_id' },
        );
      if (upsertError) {
        console.error('Could not grant board access:', upsertError);
        return NextResponse.json({ error: 'Could not grant board access.' }, { status: 500 });
      }
    }
  }

  // 7. Access bookkeeping. A failure here never blocks the grant.
  const { error: accessError } = await admin
    .from('share_links')
    .update({
      access_count: (link.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', link.id);
  if (accessError) {
    console.error('Could not record share link access:', accessError);
  }

  // 8. Never the token or the hash.
  return NextResponse.json({
    boardId: link.board_id,
    padletId: link.padlet_id ?? null,
  });
}
