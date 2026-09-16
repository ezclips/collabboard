import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    hashSharePassword,
    issueShareGrant,
    verifySharePassword,
} from '@/lib/server/share/sharePassword';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(request: NextRequest) {
    try {
        const { token, password } = await request.json();

        if (!token || !password) {
            return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
        }

        const { data: link, error } = await supabase
            .from('share_links')
            .select('id, board_id, padlet_id, permission, password_hash, expires_at')
            .eq('token', token)
            .single();

        if (error || !link) {
            return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
        }

        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
        }

        const verification = await verifySharePassword(password, link.password_hash);

        if (!verification.valid) {
            return NextResponse.json({ valid: false });
        }

        // Complete the legacy SHA-256 -> scrypt upgrade now that the plaintext
        // has proven itself. A failed write only means the next unlock retries.
        if (verification.upgradedHash) {
            const { error: upgradeError } = await supabase
                .from('share_links')
                .update({ password_hash: verification.upgradedHash })
                .eq('id', link.id);
            if (upgradeError) {
                console.error('Share password rehash failed:', upgradeError);
            }
        }

        // The grant's binding comes from the LINK, never from the request: a
        // caller must not nominate which padlet their grant unlocks.
        //
        // A link with no padlet_id issues no grant. A link that HAS one mints a
        // grant even when its shareTarget redirects into the canvas and will
        // never call the padlet endpoint; such a grant is inert, and minting it
        // keeps the rule simple -- the binding follows the row, not the caller
        // and not the target.
        const grantedPadletId =
            typeof link.padlet_id === 'string' && link.padlet_id.length > 0
                ? link.padlet_id
                : null;
        const grant = grantedPadletId
            ? issueShareGrant({ token, padletId: grantedPadletId })
            : null;

        // The target identity is disclosed only now that the password has proven
        // itself. Before this point the response carries nothing about the target.
        return NextResponse.json({
            valid: true,
            grant,
            boardId: typeof link.board_id === 'string' ? link.board_id : null,
            padletId: grantedPadletId,
            permission: typeof link.permission === 'string' && link.permission
                ? link.permission
                : 'view',
        });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
