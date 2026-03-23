import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type AuthContext = {
    userId: string | null;
};

async function resolveAuthContext(req: NextRequest, adminClient: SupabaseClient<any>): Promise<AuthContext> {
    const authCookie = req.cookies.getAll().find((cookie) => cookie.name.includes('auth-token'));
    let userId: string | null = null;

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
                }
            }
        } catch {
            // Fallback below
        }
    }

    if (!userId) {
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data: { user }, error } = await adminClient.auth.getUser(token);
            if (!error && user) {
                userId = user.id;
            }
        }
    }

    return { userId };
}

async function canManageTeam(adminClient: SupabaseClient<any>, teamId: string, userId: string) {
    const { data: team, error } = await adminClient
        .from('teams')
        .select('workspace_id')
        .eq('id', teamId)
        .maybeSingle();

    if (error || !team?.workspace_id) {
        return { ok: false, workspaceId: null as string | null };
    }

    const { data: managerCheck } = await adminClient
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', team.workspace_id)
        .eq('member_user_id', userId)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

    if (managerCheck) {
        return { ok: true, workspaceId: team.workspace_id };
    }

    const { data: isOwner } = await adminClient
        .from('workspaces')
        .select('id')
        .eq('id', team.workspace_id)
        .eq('owner_user_id', userId)
        .maybeSingle();

    return { ok: !!isOwner, workspaceId: team.workspace_id };
}

async function validateTeamPayload(
    adminClient: SupabaseClient<any>,
    workspaceId: string,
    rawMemberIds: unknown,
    rawCollectionIds: unknown,
) {
    const requestedMemberIds = Array.isArray(rawMemberIds)
        ? [...new Set(rawMemberIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
        : null;
    const requestedCollectionIds = Array.isArray(rawCollectionIds)
        ? [...new Set(rawCollectionIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
        : null;

    let validatedMemberIds: string[] | undefined;
    if (requestedMemberIds) {
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

        validatedMemberIds = requestedMemberIds;
    }

    let validatedCollectionIds: string[] | undefined;
    if (requestedCollectionIds) {
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

        validatedCollectionIds = requestedCollectionIds;
    }

    return {
        memberIds: validatedMemberIds,
        collectionIds: validatedCollectionIds,
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

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: teamId } = await context.params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient<any>(supabaseUrl, serviceRoleKey);

        const { userId } = await resolveAuthContext(req, adminClient);
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
        }

        const access = await canManageTeam(adminClient, teamId, userId);
        if (!access.ok) {
            return NextResponse.json({ error: 'You do not have permission to update this team.' }, { status: 403 });
        }
        if (!access.workspaceId) {
            return NextResponse.json({ error: 'Team workspace could not be resolved.' }, { status: 404 });
        }

        const body = await req.json();
        const { name, color, member_ids, collection_ids } = body as {
            name?: string;
            color?: string | null;
            member_ids?: string[];
            collection_ids?: string[];
        };

        let validatedPayload: { memberIds?: string[]; collectionIds?: string[] };
        try {
            validatedPayload = await validateTeamPayload(
                adminClient,
                access.workspaceId,
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
            .update({
                name: typeof name === 'string' ? name.trim() : undefined,
                color: color ?? undefined,
                member_ids: validatedPayload.memberIds,
                collection_ids: validatedPayload.collectionIds,
                updated_at: new Date().toISOString(),
            })
            .eq('id', teamId)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json(
                { error: formatDatabaseError(error, 'Failed to update team.') },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, team });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('PATCH /api/teams/[id] error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: teamId } = await context.params;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient<any>(supabaseUrl, serviceRoleKey);

        const { userId } = await resolveAuthContext(req, adminClient);
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
        }

        const access = await canManageTeam(adminClient, teamId, userId);
        if (!access.ok) {
            return NextResponse.json({ error: 'You do not have permission to delete this team.' }, { status: 403 });
        }

        const { error } = await adminClient.from('teams').delete().eq('id', teamId);
        if (error) {
            return NextResponse.json(
                { error: formatDatabaseError(error, 'Failed to delete team.') },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('DELETE /api/teams/[id] error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
