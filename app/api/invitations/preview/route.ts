import { createClient } from '@supabase/supabase-js';
import {
    INVITE_PREVIEW_COLUMNS,
    createInvitePreviewGetHandler,
} from '@/lib/server/invitations/invitePreviewRoute';
import type { InvitePreviewRow } from '@/lib/server/invitations/invitePreviewRoute';

export const runtime = 'nodejs';

/**
 * The anonymous half of the invite flow. The invite page calls this INSTEAD of
 * reading workspace_invitations directly, because that row carries `link_code`
 * and the plaintext `password`; see
 * supabase/migrations/20260916170000_invite_credentials_server_side.sql.
 *
 * The service client is constructed here rather than in lib/server so the
 * handler stays a pure function of its lookup and can be tested without
 * credentials or a network.
 *
 * The lookup shape is deliberately identical to the accept route's: same
 * filters, same notion of "active". If these two ever disagree, a link
 * previews as valid and then fails on accept, or the reverse.
 */
export const GET = createInvitePreviewGetHandler({
    lookup: {
        async findActiveLinkInvitation(code: string): Promise<InvitePreviewRow | null> {
            const adminClient = createClient<any>(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );

            const { data, error } = await adminClient
                .from('workspace_invitations')
                .select(INVITE_PREVIEW_COLUMNS)
                .eq('link_code', code)
                .eq('type', 'link')
                .is('redeemed_at', null)
                .maybeSingle();

            if (error) return null;
            return (data as InvitePreviewRow | null) ?? null;
        },
    },
});
