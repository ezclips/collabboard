import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyShareGrant } from '@/lib/server/share/sharePassword';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** One answer for every authorization failure: no probing the difference. */
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');
    const padletId = request.nextUrl.searchParams.get('padletId');
    const grant = request.nextUrl.searchParams.get('grant');

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

    // A password-protected link yields nothing without a grant this server
    // signed for exactly this token and padlet. Checked BEFORE any content
    // query: the token alone used to be enough to read the post.
    if (link.password_hash && !verifyShareGrant({ grant, token, padletId })) {
        return unauthorized();
    }

    // Ensure the token is scoped to this padlet or to the board that owns this padlet
    if (link.padlet_id) {
        // Padlet-scoped token: must match exactly
        if (link.padlet_id !== padletId) {
            return unauthorized();
        }
    } else if (link.board_id) {
        // Board-scoped token: verify the requested padlet belongs to this board
        const { data: ownerCheck, error: ownerError } = await supabase
            .from('padlets')
            .select('id')
            .eq('id', padletId)
            .eq('board_id', link.board_id)
            .single();
        if (ownerError || !ownerCheck) {
            return unauthorized();
        }
    } else {
        return unauthorized();
    }

    // Fetch the padlet
    const { data: padlet, error: padletError } = await supabase
        .from('padlets')
        .select('id, title, content, type, metadata, file_url')
        .eq('id', padletId)
        .single();

    if (padletError || !padlet) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // The share page's card reads image_url; `padlets` has no such column.
    // Selecting it made PostgREST fail the whole query with 42703, so EVERY
    // post type -- not just images -- came back as 404 here.
    //
    // The display authority is metadata.imageUrl, which wins over file_url on
    // every surface -- file_url is only a snapshot copy taken at creation (see
    // the IMAGE branch in PostCardContent).
    const row = padlet as Record<string, unknown> & {
        metadata?: { imageUrl?: unknown } | null;
        file_url?: unknown;
    };
    const metadataImageUrl = typeof row.metadata?.imageUrl === 'string'
        && row.metadata.imageUrl.length > 0 ? row.metadata.imageUrl : null;
    const fileUrl = typeof row.file_url === 'string' && row.file_url.length > 0
        ? row.file_url : null;

    return NextResponse.json({ padlet: { ...padlet, image_url: metadataImageUrl ?? fileUrl } });
}
