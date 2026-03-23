import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import SharePageClient from './SharePageClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default async function SharePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;

    // Validate the token
    const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .eq('token', token)
        .single();

    if (error || !data) {
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
    supabase
        .from('share_links')
        .update({
            access_count: (data.access_count || 0) + 1,
            last_accessed_at: new Date().toISOString(),
        })
        .eq('id', data.id)
        .then(() => {});

    const shareTarget: string = data.share_target || 'post-in-board';
    const boardId: string | null = data.board_id;
    const padletId: string | null = data.padlet_id;
    const isPasswordProtected: boolean = !!data.password_hash;

    // Option 2: Full board — redirect immediately (no password shown before redirect)
    if (shareTarget === 'board' && boardId && !isPasswordProtected) {
        redirect(`/dashboard/canvas/${boardId}`);
    }

    // Option 3: Post in board — redirect with openPadlet param
    if (shareTarget === 'post-in-board' && boardId && !isPasswordProtected) {
        const url = padletId
            ? `/dashboard/canvas/${boardId}?openPadlet=${padletId}`
            : `/dashboard/canvas/${boardId}`;
        redirect(url);
    }

    // For password-protected board/post-in-board links, or option 1 (post only):
    // render the client component which handles password check + content display
    return (
        <SharePageClient
            token={token}
            shareTarget={shareTarget}
            boardId={boardId}
            padletId={padletId}
            permission={data.permission}
            isPasswordProtected={isPasswordProtected}
            passwordHash={data.password_hash || null}
        />
    );
}
