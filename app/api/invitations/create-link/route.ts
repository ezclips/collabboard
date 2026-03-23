import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        // Use the service role client for everything
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // Extract the user's access token from the request cookies
        // Supabase stores the session token in sb-<ref>-auth-token cookie
        const authCookie = req.cookies.getAll()
            .find(c => c.name.includes('auth-token'));

        let userId: string | null = null;
        let userEmail: string | null = null;

        if (authCookie) {
            // Try to parse the cookie value (Supabase stores JSON array in chunks)
            try {
                let tokenValue = authCookie.value;

                // Supabase may chunk auth cookies into .0, .1, etc.
                const baseName = authCookie.name.replace(/\.\d+$/, '');
                const allChunks = req.cookies.getAll()
                    .filter(c => c.name === baseName || c.name.startsWith(baseName + '.'))
                    .sort((a, b) => a.name.localeCompare(b.name));

                if (allChunks.length > 1) {
                    tokenValue = allChunks.map(c => c.value).join('');
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
                // Cookie parse failed, try alternative auth methods below
            }
        }

        // Fallback: check Authorization header
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

        if (!userId) {
            return NextResponse.json(
                { error: 'Not authenticated. Please log in first.' },
                { status: 401 },
            );
        }

        const body = await req.json();
        const {
            role = 'member',
            email_domain,
            password,
            canvas_ids,
        } = body as {
            role?: string;
            email_domain?: string | null;
            password?: string | null;
            canvas_ids?: string[] | null;
        };

        // 1. Find the user's workspace
        let wsId: string | null = null;

        // Try workspace_members first
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

        // Try owned workspaces
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

        // Bootstrap a workspace if none exists
        if (!wsId) {
            const prefix = userEmail?.split('@')[0]?.trim();
            const workspaceName = prefix ? `${prefix}'s Workspace` : 'My Workspace';

            const { data: newWorkspace, error: wsError } = await adminClient
                .from('workspaces')
                .insert({
                    owner_user_id: userId,
                    name: workspaceName,
                })
                .select('id')
                .single();

            if (wsError) {
                return NextResponse.json(
                    { error: `Failed to create workspace: ${wsError.message}` },
                    { status: 500 },
                );
            }

            wsId = newWorkspace.id;

            // Create owner membership
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

        // 2. Verify the user can manage this workspace
        const { data: managerCheck } = await adminClient
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', wsId)
            .eq('member_user_id', userId)
            .in('role', ['owner', 'admin'])
            .maybeSingle();

        // Also check if user is workspace owner directly
        if (!managerCheck) {
            const { data: isOwner } = await adminClient
                .from('workspaces')
                .select('id')
                .eq('id', wsId)
                .eq('owner_user_id', userId)
                .maybeSingle();

            if (!isOwner) {
                return NextResponse.json(
                    { error: 'You do not have permission to create invite links for this workspace.' },
                    { status: 403 },
                );
            }
        }

        // 3. Generate invite code and insert invitation
        const inviteCode =
            Math.random().toString(36).substring(2, 10) +
            Math.random().toString(36).substring(2, 10);

        const invitePayload: Record<string, unknown> = {
            workspace_id: wsId,
            type: 'link',
            role: role,
            link_code: inviteCode,
            max_uses: null,
            uses: 0,
            email_domain: email_domain || null,
            created_by: userId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const requestedCanvasIds = Array.isArray(canvas_ids)
            ? [...new Set(canvas_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
            : [];

        if (requestedCanvasIds.length > 0) {
            const { data: workspaceCanvases, error: canvasError } = await adminClient
                .from('boards')
                .select('id')
                .eq('workspace_id', wsId)
                .in('id', requestedCanvasIds);

            if (canvasError) {
                return NextResponse.json(
                    { error: `Failed to validate canvas selection: ${canvasError.message}` },
                    { status: 500 },
                );
            }

            const validCanvasIds = new Set((workspaceCanvases || []).map((canvas: { id: string }) => canvas.id));
            const invalidSelection = requestedCanvasIds.filter((canvasId) => !validCanvasIds.has(canvasId));
            if (invalidSelection.length > 0) {
                return NextResponse.json(
                    { error: 'One or more selected canvases are invalid for this workspace.' },
                    { status: 400 },
                );
            }

            invitePayload.canvas_ids = requestedCanvasIds;
        }

        if (password) {
            invitePayload.password = password;
        }

        let invitation: {
            id: string;
            link_code: string;
            role: string;
            password?: string | null;
            email_domain?: string | null;
            max_uses?: number | null;
            uses?: number | null;
            expires_at?: string | null;
            created_at: string;
            canvas_ids?: string[] | null;
        } | null = null;

        let insertError: { message: string } | null = null;
        let canvasIdsPersisted = !!invitePayload.canvas_ids;

        const firstInsert = await adminClient
            .from('workspace_invitations')
            .insert(invitePayload)
            .select('id, link_code, role, password, email_domain, max_uses, uses, expires_at, created_at, canvas_ids')
            .single();

        invitation = firstInsert.data;
        insertError = firstInsert.error ? { message: firstInsert.error.message } : null;

        // Backward-compatible fallback for databases missing the canvas_ids column.
        if (insertError && invitePayload.canvas_ids) {
            const missingCanvasIdsColumn =
                insertError.message.includes('canvas_ids') &&
                (insertError.message.includes('column') || insertError.message.includes('schema cache'));

            if (missingCanvasIdsColumn) {
                delete invitePayload.canvas_ids;
                canvasIdsPersisted = false;
                const retryInsert = await adminClient
                    .from('workspace_invitations')
                    .insert(invitePayload)
                    .select('id, link_code, role, password, email_domain, max_uses, uses, expires_at, created_at')
                    .single();

                invitation = retryInsert.data
                    ? { ...retryInsert.data, canvas_ids: null }
                    : null;
                insertError = retryInsert.error ? { message: retryInsert.error.message } : null;
            }
        }

        if (insertError) {
            return NextResponse.json(
                { error: `Failed to create invitation: ${insertError.message}` },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            invitation,
            workspace_id: wsId,
            canvas_ids_persisted: canvasIdsPersisted,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('POST /api/invitations/create-link error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
