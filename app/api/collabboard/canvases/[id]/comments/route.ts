import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireBoardPermission } from '@/lib/auth/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'reader');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data: comments, error: commentsError } = await supabase
      .from('canvas_comments')
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .eq('canvas_id', id)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    const { count: totalCount } = await supabase
      .from('canvas_comments')
      .select('*', { count: 'exact', head: true })
      .eq('canvas_id', id)
      .is('parent_comment_id', null);

    return NextResponse.json({
      comments: comments || [],
      total_count: totalCount || 0,
      pagination: {
        limit,
        offset,
        has_more: (totalCount || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('Error in comments GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'commenter');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { content, position_x, position_y, section_id, item_id } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const { data: comment, error: commentError } = await supabase
      .from('canvas_comments')
      .insert({
        canvas_id: id,
        section_id: section_id || null,
        item_id: item_id || null,
        parent_comment_id: null,
        content: String(content).trim(),
        position_x: position_x ?? null,
        position_y: position_y ?? null,
        is_resolved: false,
        created_by: user.id,
      })
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .single();

    if (commentError) {
      console.error('Error creating comment:', commentError);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    // Non-blocking notification dispatch for canvas owner preferences.
    try {
      const adminClient = getSupabaseAdmin();
      const { data: canvasRow } = await adminClient
        .from('canvases')
        .select('created_by, workspace_id')
        .eq('id', id)
        .maybeSingle();

      const recipientUserId =
        canvasRow && typeof canvasRow.created_by === 'string' ? canvasRow.created_by : null;

      if (recipientUserId && recipientUserId !== user.id) {
        const allowedChannels = await getAllowedNotificationChannels(
          adminClient,
          recipientUserId,
          'comments_posts',
          ['email', 'push']
        );

        if (allowedChannels.length > 0) {
          let recipientEmail: string | null = null;
          if (canvasRow?.workspace_id) {
            const { data: memberRow } = await adminClient
              .from('workspace_members')
              .select('member_email')
              .eq('workspace_id', canvasRow.workspace_id)
              .eq('member_user_id', recipientUserId)
              .maybeSingle();
            recipientEmail =
              memberRow && typeof memberRow.member_email === 'string'
                ? memberRow.member_email
                : null;
          }

          await dispatchNotification({
            eventId: 'comments_posts',
            recipientUserId,
            channels: allowedChannels,
            recipientEmail,
            context: {
              appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
              workspaceLink: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/dashboard/canvas/${id}`,
            },
          });
        }
      }
    } catch (notifyError) {
      console.warn('Comment notification dispatch skipped:', notifyError);
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error in comments POST route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
