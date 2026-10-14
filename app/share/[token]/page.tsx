import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import SharePageClient from './SharePageClient';
import { createShareLinkRepository } from '@/lib/infra/share/shareLinkRepository';

export default async function SharePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const repository = createShareLinkRepository();

    // Validate the token
    const result = await repository.findByToken(token);
    const data = result.ok ? result.value : null;

    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Link not found</h1>
                    <p className="text-gray-500">This share link is invalid or has been removed.</p>
                </div>
            </div>
        );
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Link expired</h1>
                    <p className="text-gray-500">This share link has expired and is no longer valid.</p>
                </div>
            </div>
        );
    }

    // Update access count (fire and forget)
    void repository.recordAccess(data.id, data.access_count || 0);

    const shareTarget: string = data.share_target || 'post-in-board';
    const boardId: string | null = data.board_id;
    const padletId: string | null = data.padlet_id;
    const permission: string = data.permission || 'view';
    const isPasswordProtected: boolean = !!data.password_hash;

    // PATCH-357. A board link needs a signed-in visitor: redeeming applies the
    // link's permission to that account. A standalone post link does not.
    const isBoardLink = shareTarget === 'board' || shareTarget === 'post-in-board';
    let isSignedIn = false;
    if (isBoardLink) {
        try {
            const cookieStore = await cookies();
            const supabase = createServerComponentClient({ cookies: () => cookieStore as any });
            const { data: { user } } = await supabase.auth.getUser();
            isSignedIn = !!user;
        } catch {
            isSignedIn = false;
        }
        if (!isSignedIn) {
            redirect(`/auth?redirect=${encodeURIComponent(`/share/${token}`)}`);
        }
    }

    // A password-protected link discloses only that it is protected. The target
    // ids and the granted permission arrive from verify-password once the
    // password has proven itself, so they never sit in this payload for a
    // visitor who has not unlocked the link.
    const withholdsTarget = isPasswordProtected;

    return (
        <SharePageClient
            token={token}
            shareTarget={shareTarget}
            boardId={withholdsTarget ? null : boardId}
            padletId={withholdsTarget ? null : padletId}
            permission={withholdsTarget ? '' : permission}
            isPasswordProtected={isPasswordProtected}
            isSignedIn={isSignedIn}
        />
    );
}
