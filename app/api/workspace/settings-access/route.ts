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
            // fallback to authorization header
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

export async function GET(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient<any>(supabaseUrl, serviceRoleKey);

        const { userId, userEmail } = await resolveAuthContext(req, adminClient);
        console.log(`[Settings API Debug] Extracted auth context: userId=${userId}, userEmail=${userEmail}`);
        if (!userId) {
            console.log(`[Settings API Debug] Returning 401 Not authenticated`);
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
        }

        const normalizeRole = (role: string | null | undefined) => (role || '').trim().toLowerCase();
        const isManagerRole = (role: string | null | undefined) => {
            const normalized = normalizeRole(role);
            return normalized === 'owner' || normalized === 'admin';
        };

        const { data: directMemberships, error: directMembershipError } = await adminClient
            .from('workspace_members')
            .select('workspace_id, role, member_email, member_user_id, status, created_at')
            .eq('status', 'active')
            .eq('member_user_id', userId)
            .order('created_at', { ascending: true });

        if (directMembershipError) {
            return NextResponse.json({ error: directMembershipError.message }, { status: 500 });
        }

        const { data: emailMemberships, error: emailMembershipError } = userEmail
            ? await adminClient
                .from('workspace_members')
                .select('workspace_id, role, member_email, member_user_id, status, created_at')
                .eq('status', 'active')
                .eq('member_email', userEmail)
                .order('created_at', { ascending: true })
            : { data: [], error: null };

        if (emailMembershipError) {
            return NextResponse.json({ error: emailMembershipError.message }, { status: 500 });
        }

        const membershipMap = new Map<string, {
            workspace_id: string;
            role: string;
            member_email?: string | null;
            member_user_id?: string | null;
            created_at?: string | null;
        }>();

        for (const membership of [...(directMemberships || []), ...(emailMemberships || [])]) {
            const key = `${membership.workspace_id}:${membership.member_user_id || ''}:${membership.member_email || ''}:${membership.role || ''}`;
            if (!membershipMap.has(key)) {
                membershipMap.set(key, membership);
            }
        }

        const memberships = Array.from(membershipMap.values());
        const normalizedMemberships = memberships.map((membership) => ({
            workspaceId: membership.workspace_id,
            role: normalizeRole(membership.role),
            match: membership.member_user_id === userId ? 'user_id' : 'email',
            memberEmail: membership.member_email || null,
            createdAt: membership.created_at || null,
        }));

        const managerMembership = normalizedMemberships.find((membership) =>
            isManagerRole(membership.role),
        );

        if (managerMembership) {
            const { data: workspaceRow } = await adminClient
                .from('workspaces')
                .select('id, name, logo_url')
                .eq('id', managerMembership.workspaceId)
                .maybeSingle();

            console.log(`[Settings API Debug] Found manager membership. Returning can_manage=true for workspace ${managerMembership.workspaceId}`);
            return NextResponse.json({
                can_manage: true,
                workspace_id: managerMembership.workspaceId,
                workspace_name: workspaceRow?.name || null,
                workspace_logo: workspaceRow?.logo_url || null,
                role: normalizeRole(managerMembership.role),
                source: managerMembership.match,
                memberships: normalizedMemberships,
            });
        }

        const ownedWorkspaceQuery = adminClient
            .from('workspaces')
            .select('id')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        const { data: ownedWorkspace, error: ownedWorkspaceError } = await ownedWorkspaceQuery;
        if (ownedWorkspaceError) {
            return NextResponse.json({ error: ownedWorkspaceError.message }, { status: 500 });
        }

        if (ownedWorkspace?.id) {
            const { data: workspaceRow } = await adminClient
                .from('workspaces')
                .select('id, name, logo_url')
                .eq('id', ownedWorkspace.id)
                .maybeSingle();

            console.log(`[Settings API Debug] Found owned workspace. Returning can_manage=true for workspace ${ownedWorkspace.id}`);
            return NextResponse.json({
                can_manage: true,
                workspace_id: ownedWorkspace.id,
                workspace_name: workspaceRow?.name || null,
                workspace_logo: workspaceRow?.logo_url || null,
                role: 'owner',
                source: 'owner_lookup',
                memberships: normalizedMemberships,
            });
        }

        const firstMembership = normalizedMemberships[0] || null;
        if (firstMembership?.workspaceId) {
            const { data: workspaceRow } = await adminClient
                .from('workspaces')
                .select('id, name, logo_url')
                .eq('id', firstMembership.workspaceId)
                .maybeSingle();

            console.log(`[Settings API Debug] Found first membership. Returning can_manage=false for workspace ${firstMembership.workspaceId}`);
            return NextResponse.json({
                can_manage: false,
                workspace_id: firstMembership.workspaceId,
                workspace_name: workspaceRow?.name || null,
                workspace_logo: workspaceRow?.logo_url || null,
                role: normalizeRole(firstMembership.role) || null,
                source: firstMembership.match || null,
                memberships: normalizedMemberships,
            });
        }

        const prefix = userEmail?.split('@')[0]?.trim();
        const workspaceName = prefix ? `${prefix}'s Workspace` : 'My Workspace';
        const { data: createdWorkspace, error: createWorkspaceError } = await adminClient
            .from('workspaces')
            .insert({
                owner_user_id: userId,
                name: workspaceName,
            })
            .select('id, name, logo_url')
            .single();

        if (createWorkspaceError || !createdWorkspace?.id) {
            return NextResponse.json({
                can_manage: false,
                workspace_id: null,
                workspace_name: null,
                workspace_logo: null,
                role: null,
                source: null,
                memberships: normalizedMemberships,
            });
        }

        await adminClient
            .from('workspace_members')
            .insert({
                workspace_id: createdWorkspace.id,
                workspace_owner_id: userId,
                member_user_id: userId,
                member_email: userEmail ?? '',
                role: 'owner',
                status: 'active',
                invited_at: new Date().toISOString(),
                joined_at: new Date().toISOString(),
            });

        return NextResponse.json({
            can_manage: true,
            workspace_id: createdWorkspace.id,
            workspace_name: createdWorkspace.name || workspaceName,
            workspace_logo: createdWorkspace.logo_url || null,
            role: 'owner',
            source: 'workspace_bootstrap',
            memberships: normalizedMemberships,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Settings API Debug] Error caught in API: ${message}`, err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
