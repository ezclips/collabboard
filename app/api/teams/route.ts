import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type AuthContext = {
    userId: string | null;
    userEmail: string | null;
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
            // Fallback to Authorization header
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

async function resolveWorkspaceId(adminClient: SupabaseClient<any>, userId: string, userEmail: string | null): Promise<string> {
    let wsId: string | null = null;

    const { data: membership } = await adminClient
        .from('workspace_members')
        .select('workspace_id')
        .eq('member_user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (membership?.workspace_id) {
        wsId = membership.workspace_id;
    }

    if (!wsId) {
        const { data: ownedWorkspace } = await adminClient
            .from('workspaces')
            .select('id')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (ownedWorkspace?.id) {
            wsId = ownedWorkspace.id;
        }
    }

    if (!wsId) {
        const prefix = userEmail?.split('@')[0]?.trim();
        const workspaceName = prefix ? `${prefix}'s Workspace` : 'My Workspace';
        const { data: newWorkspace, error } = await adminClient
            .from('workspaces')
            .insert({
                owner_user_id: userId,
                name: workspaceName,
            })
            .select('id')
            .single();

        if (error) {
            throw new Error(`Failed to create workspace: ${error.message}`);
        }

        wsId = newWorkspace.id;
        await adminClient.from('workspace_members').insert({
            workspace_id: wsId,
            workspace_owner_id: userId,
            member_user_id: userId,
            member_email: userEmail ?? '',
            role: 'owner',
            status: 'active',
            invited_at: new Date().toISOString(),
            joined_at: new Date().toISOString(),
        });
    }

    if (!wsId) throw new Error('Failed to resolve workspace ID');
    return wsId;
}

async function ensureWorkspaceManager(adminClient: SupabaseClient<any>, workspaceId: string, userId: string) {
    const { data: managerCheck } = await adminClient
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('member_user_id', userId)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

    if (managerCheck) {
        return true;
    }

    const { data: isOwner } = await adminClient
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('owner_user_id', userId)
        .maybeSingle();

    return !!isOwner;
}

async function validateTeamPayload(
    adminClient: SupabaseClient<any>,
    workspaceId: string,
    rawMemberIds: unknown,
    rawCollectionIds: unknown,
) {
    const requestedMemberIds = Array.isArray(rawMemberIds)
        ? [...new Set(rawMemberIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
        : [];
    const requestedCollectionIds = Array.isArray(rawCollectionIds)
        ? [...new Set(rawCollectionIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
        : [];

    const { data: workspaceMembers, error: memberError } = await adminClient
        .from('workspace_members')
        .select('member_user_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active');

    if (memberError) {
        throw new Error(`Failed to validate members: ${memberError.message}`);
    }

    const validMemberIds = new Set(
        (workspaceMembers || [])
            .map((member: { member_user_id: string | null }) => member.member_user_id)
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
    );

    const { data: pendingInvitations, error: invitationError } = await adminClient
        .from('workspace_invitations')
        .select('email')
        .eq('workspace_id', workspaceId)
        .is('redeemed_at', null);

    if (invitationError) {
        throw new Error(`Failed to validate pending invitations: ${invitationError.message}`);
    }

    const validInviteTokens = new Set(
        (pendingInvitations || [])
            .map((invitation: { email: string | null }) => invitation.email?.toLowerCase() || '')
            .filter((email) => email.length > 0)
            .map((email) => `invite:${email}`),
    );

    const invalidMemberIds = requestedMemberIds.filter(
        (memberId) => !validMemberIds.has(memberId) && !validInviteTokens.has(memberId.toLowerCase()),
    );
    if (invalidMemberIds.length > 0) {
        throw new Error(`Invalid team member IDs: ${invalidMemberIds.join(', ')}`);
    }

    const { data: folders, error: folderError } = await adminClient
        .from('folders')
        .select('id')
        .eq('workspace_id', workspaceId);

    if (folderError) {
        throw new Error(`Failed to validate collections: ${folderError.message}`);
    }

    const validCollectionIds = new Set((folders || []).map((folder: { id: string }) => folder.id));
    validCollectionIds.add('main');

    const invalidCollectionIds = requestedCollectionIds.filter((collectionId) => !validCollectionIds.has(collectionId));
    if (invalidCollectionIds.length > 0) {
        throw new Error(`Invalid collection IDs: ${invalidCollectionIds.join(', ')}`);
    }

    return {
        memberIds: requestedMemberIds,
        collectionIds: requestedCollectionIds,
    };
}

function formatDatabaseError(error: unknown, fallback: string) {
    if (typeof error !== 'object' || error === null) {
        return fallback;
    }

    const dbError = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
    };

    const relationMissing =
        dbError.code === '42P01' ||
        (typeof dbError.message === 'string' &&
            dbError.message.toLowerCase().includes('relation "public.teams" does not exist'));

    if (relationMissing) {
        return 'Teams table is missing. Run migrations 20260312_100000_create_teams_table.sql and 20260312_101000_backfill_teams_table_columns.sql.';
    }

    const parts = [dbError.message, dbError.details, dbError.hint].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return parts.length > 0 ? parts.join(' | ') : fallback;
}

export async function GET(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient<any>(supabaseUrl, serviceRoleKey);

        const { userId, userEmail } = await resolveAuthContext(req, adminClient);
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
        }

        const workspaceId = await resolveWorkspaceId(adminClient, userId, userEmail);
        const canManage = await ensureWorkspaceManager(adminClient, workspaceId, userId);
        if (!canManage) {
            return NextResponse.json({ error: 'You do not have permission to view teams.' }, { status: 403 });
        }

        const { data: teams, error } = await adminClient
            .from('teams')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json(
                { error: formatDatabaseError(error, 'Failed to load teams.') },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, workspace_id: workspaceId, teams: teams || [] });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('GET /api/teams error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
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

        const workspaceId = await resolveWorkspaceId(adminClient, userId, userEmail);
        const canManage = await ensureWorkspaceManager(adminClient, workspaceId, userId);
        if (!canManage) {
            return NextResponse.json({ error: 'You do not have permission to create teams.' }, { status: 403 });
        }

        const body = await req.json();
        const { name, color, member_ids, collection_ids } = body as {
            name?: string;
            color?: string | null;
            member_ids?: string[];
            collection_ids?: string[];
        };

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Team name is required.' }, { status: 400 });
        }

        let validatedPayload: { memberIds: string[]; collectionIds: string[] };
        try {
            validatedPayload = await validateTeamPayload(
                adminClient,
                workspaceId,
                member_ids,
                collection_ids,
            );
        } catch (validationError) {
            const message = validationError instanceof Error ? validationError.message : 'Invalid team payload.';
            const status = message.startsWith('Invalid ') ? 400 : 500;
            return NextResponse.json({ error: message }, { status });
        }

        const { data: team, error } = await adminClient
            .from('teams')
            .insert({
                workspace_id: workspaceId,
                name: name.trim(),
                color: color || null,
                member_ids: validatedPayload.memberIds,
                collection_ids: validatedPayload.collectionIds,
                created_by: userId,
            })
            .select('*')
            .single();

        if (error) {
            return NextResponse.json(
                { error: formatDatabaseError(error, 'Failed to create team.') },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, team, workspace_id: workspaceId });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('POST /api/teams error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
