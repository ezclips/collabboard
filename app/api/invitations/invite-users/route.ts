import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export async function POST(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
                // Cookie parsing fallback below.
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

        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated. Please log in first.' }, { status: 401 });
        }

        const body = await req.json();
        const { emails, role = 'member', canvas_ids } = body as { emails?: string[]; role?: string; canvas_ids?: string[] | null };

        const normalizedEmails = Array.isArray(emails)
            ? [...new Set(emails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes('@')))]
            : [];

        if (normalizedEmails.length === 0) {
            return NextResponse.json({ error: 'No valid emails provided.' }, { status: 400 });
        }

        const requestedCanvasIds = Array.isArray(canvas_ids)
            ? [...new Set(canvas_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
            : [];

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
            const { data: newWorkspace, error: workspaceError } = await adminClient
                .from('workspaces')
                .insert({
                    owner_user_id: userId,
                    name: workspaceName,
                })
                .select('id')
                .single();

            if (workspaceError) {
                return NextResponse.json(
                    { error: `Failed to create workspace: ${workspaceError.message}` },
                    { status: 500 },
                );
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

        const { data: managerCheck } = await adminClient
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', wsId)
            .eq('member_user_id', userId)
            .in('role', ['owner', 'admin'])
            .maybeSingle();

        if (!managerCheck) {
            const { data: isOwner } = await adminClient
                .from('workspaces')
                .select('id')
                .eq('id', wsId)
                .eq('owner_user_id', userId)
                .maybeSingle();

            if (!isOwner) {
                return NextResponse.json(
                    { error: 'You do not have permission to invite users for this workspace.' },
                    { status: 403 },
                );
            }
        }

        let validWorkspaceCanvasIds: string[] = [];
        if (requestedCanvasIds.length > 0) {
            const { data: workspaceBoards, error: boardValidationError } = await adminClient
                .from('boards')
                .select('id')
                .eq('workspace_id', wsId)
                .in('id', requestedCanvasIds);

            if (boardValidationError) {
                return NextResponse.json(
                    { error: `Failed to validate canvas access: ${boardValidationError.message}` },
                    { status: 500 },
                );
            }

            const allowedSet = new Set((workspaceBoards || []).map((board: { id: string }) => board.id));
            validWorkspaceCanvasIds = requestedCanvasIds.filter((id) => allowedSet.has(id));
        }

        const invitationPayload = normalizedEmails.map((email) => ({
            workspace_id: wsId,
            type: 'email',
            email,
            role,
            canvas_ids: validWorkspaceCanvasIds.length > 0 ? validWorkspaceCanvasIds : null,
            uses: 0,
            created_by: userId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }));

        const { data: invitations, error: insertError } = await adminClient
            .from('workspace_invitations')
            .insert(invitationPayload)
            .select('id, workspace_id, email, role, type, canvas_ids, uses, created_at');

        if (insertError) {
            return NextResponse.json(
                { error: `Failed to save invitations: ${insertError.message}` },
                { status: 500 },
            );
        }

        const notificationPreferenceEval: Array<{
            email: string;
            recipient_user_id: string;
            allowed_channels: Array<'email' | 'push'>;
        }> = [];
        const notificationDispatchResults: Array<{
            email: string;
            recipient_user_id: string;
            channels: Array<'email' | 'push'>;
            results: Array<{ channel: 'email' | 'push'; status: 'sent' | 'skipped' | 'failed'; reason?: string }>;
        }> = [];

        const { data: existingUsersByEmail } = await adminClient
            .from('workspace_members')
            .select('member_email, member_user_id')
            .in('member_email', normalizedEmails)
            .not('member_user_id', 'is', null);

        const recipientMap = new Map<string, string>();
        for (const row of existingUsersByEmail || []) {
            const email = typeof row.member_email === 'string' ? row.member_email.toLowerCase() : '';
            const recipientUserId = typeof row.member_user_id === 'string' ? row.member_user_id : '';
            if (email && recipientUserId && !recipientMap.has(email)) {
                recipientMap.set(email, recipientUserId);
            }
        }

        for (const [email, recipientUserId] of recipientMap.entries()) {
            try {
                const allowedChannels = await getAllowedNotificationChannels(
                    adminClient,
                    recipientUserId,
                    'invitation_collaborate',
                    ['email', 'push'],
                );
                notificationPreferenceEval.push({
                    email,
                    recipient_user_id: recipientUserId,
                    allowed_channels: allowedChannels,
                });

                if (allowedChannels.length > 0) {
                    const dispatched = await dispatchNotification({
                        eventId: 'invitation_collaborate',
                        recipientUserId,
                        recipientEmail: email,
                        channels: allowedChannels,
                        context: {
                            role,
                            appUrl: process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin,
                            workspaceLink: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/dashboard`,
                        },
                    });

                    notificationDispatchResults.push({
                        email,
                        recipient_user_id: recipientUserId,
                        channels: allowedChannels,
                        results: dispatched,
                    });
                }
            } catch {
                // Do not block invitation creation on preference lookup.
            }
        }

        return NextResponse.json({
            success: true,
            invitations: invitations || [],
            workspace_id: wsId,
            notification_preference_eval: notificationPreferenceEval,
            notification_dispatch: notificationDispatchResults,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('POST /api/invitations/invite-users error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
