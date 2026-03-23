import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
    try {
        const { token, password } = await request.json();

        if (!token || !password) {
            return NextResponse.json({ error: 'token and password are required' }, { status: 400 });
        }

        const { data: link, error } = await supabase
            .from('share_links')
            .select('password_hash, expires_at')
            .eq('token', token)
            .single();

        if (error || !link) {
            return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
        }

        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
        }

        const inputHash = hashPassword(password);
        const valid = inputHash === link.password_hash;

        return NextResponse.json({ valid });
    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
