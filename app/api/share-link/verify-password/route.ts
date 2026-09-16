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
        const { token, password, padletId } = await request.json();

        if (!token || !password) {
            return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
        }

        const { data: link, error } = await supabase
            .from('share_links')
            .select('id, password_hash, expires_at')
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

        // Only a padlet-scoped grant is issued: board targets redirect to the
        // canvas, which is behind its own authenticated RLS boundary.
        const grant =
            typeof padletId === 'string' && padletId
                ? issueShareGrant({ token, padletId })
                : null;

        return NextResponse.json({ valid: true, grant });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
