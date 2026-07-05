import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getBoardPermission, boardPermissionSatisfies, mapLegacyToBoardPermission } from '@/lib/auth/permissions';

// Create a Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Generate a short, URL-safe token
function generateToken(): string {
    return crypto.randomBytes(16).toString('base64url');
}

// Simple hash for password (in production, use bcrypt)
function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate the caller
        const cookieStore = await cookies();
        const userSupabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
        const { data: { user }, error: authError } = await userSupabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Authentication required to create a share link' }, { status: 401 });
        }

        const body = await request.json();
        const { boardId, padletId, permission, shareTarget, expirationDays, password } = body;

        // Validate inputs
        if (!boardId && !padletId) {
            return NextResponse.json({ error: 'boardId or padletId is required' }, { status: 400 });
        }

        if (!['view', 'comment', 'edit'].includes(permission)) {
            return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
        }

        if (shareTarget && !['post', 'board', 'post-in-board'].includes(shareTarget)) {
            return NextResponse.json({ error: 'Invalid share target' }, { status: 400 });
        }

        // Verify the caller has at least the permission level they are granting
        const requiredPerm = mapLegacyToBoardPermission(permission) ?? 'reader';
        if (boardId) {
            const callerPerm = await getBoardPermission(supabase, boardId, user.id);
            if (!boardPermissionSatisfies(callerPerm, requiredPerm)) {
                return NextResponse.json(
                    { error: 'Insufficient board permissions to create this share link' },
                    { status: 403 },
                );
            }
        } else if (padletId) {
            // For padlet-only shares, look up the padlet's board and check permission there
            const { data: padlet, error: padletLookupError } = await supabase
                .from('padlets')
                .select('board_id')
                .eq('id', padletId)
                .single();
            if (padletLookupError || !padlet?.board_id) {
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
            const callerPerm = await getBoardPermission(supabase, padlet.board_id, user.id);
            if (!boardPermissionSatisfies(callerPerm, requiredPerm)) {
                return NextResponse.json(
                    { error: 'Insufficient board permissions to create this share link' },
                    { status: 403 },
                );
            }
        }

        // Generate token
        const token = generateToken();

        // Calculate expiration date if provided
        let expiresAt: string | null = null;
        if (expirationDays) {
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + expirationDays);
            expiresAt = expDate.toISOString();
        }

        // Hash password if provided
        const passwordHash = password ? hashPassword(password) : null;

        const { data, error } = await supabase
            .from('share_links')
            .insert({
                board_id: boardId || null,
                padlet_id: padletId || null,
                token,
                permission,
                share_target: shareTarget || 'post-in-board',
                password_hash: passwordHash,
                expires_at: expiresAt,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            console.error('Share link creation error:', error);
            return NextResponse.json({ error: 'Failed to create share link: ' + error.message }, { status: 500 });
        }

        // Build the share URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const shareUrl = `${baseUrl}/share/${token}`;

        return NextResponse.json({
            success: true,
            shareUrl,
            token,
            expiresAt: data.expires_at,
            isPasswordProtected: !!passwordHash,
        });

    } catch (error) {
        console.error('Share link API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET: Validate a share link token
export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('share_links')
            .select('*')
            .eq('token', token)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
        }

        // Check if expired
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
        }

        // Update access count
        await supabase
            .from('share_links')
            .update({
                access_count: (data.access_count || 0) + 1,
                last_accessed_at: new Date().toISOString(),
            })
            .eq('id', data.id);

        return NextResponse.json({
            valid: true,
            boardId: data.board_id,
            padletId: data.padlet_id,
            permission: data.permission,
            shareTarget: data.share_target || 'post-in-board',
            isPasswordProtected: !!data.password_hash,
            expiresAt: data.expires_at,
        });

    } catch (error) {
        console.error('Share link validation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
