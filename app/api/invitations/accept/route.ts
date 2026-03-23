import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type AuthContext = {
    userId: string | null;
    userEmail: string | null;
};

type InvitationRow = {
    id: string;
    workspace_id: string;
    created_by: string | null;
    role: string;
    type: 'link' | 'email';
    link_code: string | null;
    email: string | null;
    email_domain: string | null;
    password: string | null;
    expires_at: string | null;
    max_uses: number | null;
    uses: number | null;
    canvas_ids: string[] | null;
};

async function resolveAuthContext(req: NextRequest, adminClient: SupabaseClient<any>): Promise<AuthContext> {
    const authCookie = req.cookies.getAll().find((cookie) => cookie.name.includes('auth-token'));

    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authCookie) {
        try {
            let tokenValue = authCookie.value;
            const baseName = authCookie.name.replace(/\.\d+$/, '');
            const allChunks = req.cookies
                .getAll()
                .filter((cookie) => cookie.name === baseName || cookie.name.startsWith(baseName + '.'))
                .sort((a, b) => a.name.localeCompare(b.name));

            if (allChunks.length > 1) {
                tokenValue = allChunks.map((cookie) => cookie.value).join('');
            }

            const parsed = JSON.parse(tokenValue);
            const accessToken = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
            if (accessToken) {
                const { data: { user }, error } = await adminClient.auth.getUser(accessToken);
                if (!error && user) {
                    userId = user.id;
                    userEmail = user.email?.toLowerCase() ?? null;
                }
            }
        } catch {
            // Fallback to Authorization header.
        }
    }

    if (!userId) {
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data: { user }, error } = await adminClient.auth.getUser(token);
            if (!error && user) {
                userId = user.id;
                userEmail = user.email?.toLowerCase() ?? null;
            }
        }
    }

    return { userId, userEmail };
}

function normalizeWorkspaceRole(role: string | null | undefined): 'admin' | 'member' | 'readonly' {
    if (role === 'admin') return 'admin';
    if (role === 'readonly' || role === 'viewer') return 'readonly';
    return 'member';
}

function mapRoleToLegacyBoardPermission(role: 'admin' | 'member' | 'readonly'): 'admin' | 'edit' | 'view' {
    if (role === 'admin') return 'admin';
    if (role === 'readonly') return 'view';
    return 'edit';
}

function mapRoleToBoardPermission(role: 'admin' | 'member' | 'readonly'): 'admin' | 'editor' | 'reader' {
    if (role === 'admin') return 'admin';
    if (role === 'readonly') return 'reader';
    return 'editor';
}

function isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient<any>(supabaseUrl, serviceRoleKey);

        const { userId, userEmail } = await resolveAuthContext(req, adminClient);
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
        }

        const body = await req.json();
        const { code, password } = body as { code?: string; password?: string };
        const inviteCode = typeof code === 'string' ? code.trim() : '';
        const providedPassword = typeof password === 'string' ? password : '';

        if (!inviteCode) {
            return NextResponse.json({ error: 'Invite code is required.' }, { status: 400 });
        }

        const { data: invitationData, error: invitationError } = await adminClient
            .from('workspace_invitations')
            .select('id, workspace_id, created_by, role, type, link_code, email, email_domain, password, expires_at, max_uses, uses, canvas_ids')
            .eq('link_code', inviteCode)
            .eq('type', 'link')
            .is('redeemed_at', null)
            .maybeSingle();

        const invitation = invitationData as InvitationRow | null;

        if (invitationError || !invitation) {
            return NextResponse.json({ error: 'This invite link is invalid or has expired.' }, { status: 404 });
        }

        if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
            return NextResponse.json({ error: 'This invite link has expired.' }, { status: 410 });
        }

        if (invitation.max_uses !== null && (invitation.uses || 0) >= invitation.max_uses) {
            return NextResponse.json({ error: 'This invite link has reached its maximum number of uses.' }, { status: 410 });
        }

        if (invitation.email_domain && userEmail) {
            const userDomain = userEmail.split('@')[1];
            if (userDomain !== invitation.email_domain) {
                return NextResponse.json({ error: `This invite is restricted to @${invitation.email_domain} email addresses.` }, { status: 403 });
            }
        }

        if (invitation.password && invitation.password !== providedPassword) {
            return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
        }

        const normalizedRole = normalizeWorkspaceRole(invitation.role);
        const requestedCanvasIds = (invitation.canvas_ids || [])
            .map((value) => value.trim())
            .filter((value): value is string => value.length > 0 && isValidUuid(value));

        let validWorkspaceCanvasIds: string[] = [];
        if (requestedCanvasIds.length > 0) {
            const { data: workspaceBoards, error: boardValidationError } = await adminClient
                .from('boards')
                .select('id')
                .eq('workspace_id', invitation.workspace_id)
                .in('id', requestedCanvasIds);

            if (boardValidationError) {
                return NextResponse.json({ error: `Failed to validate canvas access: ${boardValidationError.message}` }, { status: 500 });
            }

            const allowedSet = new Set((workspaceBoards || []).map((board: { id: string }) => board.id));
            validWorkspaceCanvasIds = requestedCanvasIds.filter((id) => allowedSet.has(id));
        }

        const { data: existingMembership } = await adminClient
            .from('workspace_members')
            .select('id, role')
            .eq('workspace_id', invitation.workspace_id)
            .eq('member_user_id', userId)
            .maybeSingle();

        if (!existingMembership) {
            const { error: membershipError } = await adminClient
                .from('workspace_members')
                .insert({
                    workspace_id: invitation.workspace_id,
                    workspace_owner_id: invitation.created_by,
                    member_user_id: userId,
                    member_email: userEmail ?? '',
                    role: normalizedRole,
                    status: 'active',
                    joined_at: new Date().toISOString(),
                    allowed_canvas_ids: validWorkspaceCanvasIds.length > 0 ? validWorkspaceCanvasIds : null,
                });

            if (membershipError) {
                return NextResponse.json({ error: membershipError.message || 'Failed to join workspace.' }, { status: 500 });
            }
        } else if (
            validWorkspaceCanvasIds.length > 0 &&
            existingMembership.role !== 'owner' &&
            existingMembership.role !== 'admin'
        ) {
            // Keep existing role as-is, but enforce narrowed board scope for this member.
            await adminClient
                .from('workspace_members')
                .update({ allowed_canvas_ids: validWorkspaceCanvasIds, updated_at: new Date().toISOString() })
                .eq('id', existingMembership.id);
        }

        if (validWorkspaceCanvasIds.length > 0) {
            const { data: existingCanvases } = await adminClient
                .from('canvases')
                .select('id')
                .eq('workspace_id', invitation.workspace_id)
                .in('id', validWorkspaceCanvasIds);

            const canvasIdsForCollaborators = (existingCanvases || []).map((canvas: { id: string }) => canvas.id);
            if (canvasIdsForCollaborators.length > 0) {
                const nowIso = new Date().toISOString();
                const collaboratorRows = canvasIdsForCollaborators.map((canvasId) => ({
                    canvas_id: canvasId,
                    user_id: userId,
                    invited_by: invitation.created_by || userId,
                    invited_at: nowIso,
                    accepted_at: nowIso,
                    permission_level: mapRoleToLegacyBoardPermission(normalizedRole),
                    board_permission: mapRoleToBoardPermission(normalizedRole),
                }));

                await adminClient
                    .from('canvas_collaborators')
                    .upsert(collaboratorRows, { onConflict: 'canvas_id,user_id' });
            }
        }

        const inviteUpdate: {
            uses: number;
            updated_at: string;
            redeemed_by?: string;
            redeemed_at?: string;
        } = {
            uses: (invitation.uses || 0) + 1,
            updated_at: new Date().toISOString(),
        };

        if (invitation.max_uses === 1) {
            inviteUpdate.redeemed_by = userId;
            inviteUpdate.redeemed_at = new Date().toISOString();
        }

        const { error: invitationUpdateError } = await adminClient
            .from('workspace_invitations')
            .update(inviteUpdate)
            .eq('id', invitation.id);

        if (invitationUpdateError) {
            return NextResponse.json({ error: invitationUpdateError.message || 'Failed to update invitation usage.' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            workspace_id: invitation.workspace_id,
            restricted_canvas_ids: validWorkspaceCanvasIds,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('POST /api/invitations/accept error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
