import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');
    const padletId = request.nextUrl.searchParams.get('padletId');

    if (!token || !padletId) {
        return NextResponse.json({ error: 'token and padletId are required' }, { status: 400 });
    }

    // Validate the share link token
    const { data: link, error: linkError } = await supabase
        .from('share_links')
        .select('*')
        .eq('token', token)
        .single();

    if (linkError || !link) {
        return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
    }

    // Ensure the token is linked to this padlet or board
    if (link.padlet_id && link.padlet_id !== padletId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch the padlet
    const { data: padlet, error: padletError } = await supabase
        .from('padlets')
        .select('id, title, content, type, image_url, metadata, file_url')
        .eq('id', padletId)
        .single();

    if (padletError || !padlet) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ padlet });
}
