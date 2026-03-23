import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireBoardPermission } from '@/lib/auth/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
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

    const { data: parentComment, error: parentError } = await supabase
      .from('canvas_comments')
      .select('id, canvas_id')
      .eq('id', commentId)
      .eq('canvas_id', id)
      .single();

    if (parentError || !parentComment) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
    }

    const { data: replies, error: repliesError } = await supabase
      .from('canvas_comments')
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .eq('parent_comment_id', commentId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (repliesError) {
      console.error('Error fetching replies:', repliesError);
      return NextResponse.json({ error: 'Failed to fetch replies' }, { status: 500 });
    }

    const { count: totalCount } = await supabase
      .from('canvas_comments')
      .select('*', { count: 'exact', head: true })
      .eq('parent_comment_id', commentId);

    return NextResponse.json({
      replies: replies || [],
      total_count: totalCount || 0,
      parent_comment_id: commentId,
      pagination: {
        limit,
        offset,
        has_more: (totalCount || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('Error in replies GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
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
    const { content } = body;
    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const { data: parentComment, error: parentError } = await supabase
      .from('canvas_comments')
      .select('id, canvas_id, section_id, item_id, created_by')
      .eq('id', commentId)
      .eq('canvas_id', id)
      .single();

    if (parentError || !parentComment) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
    }

    const { data: reply, error: replyError } = await supabase
      .from('canvas_comments')
      .insert({
        canvas_id: id,
        section_id: parentComment.section_id,
        item_id: parentComment.item_id,
        parent_comment_id: commentId,
        content: String(content).trim(),
        position_x: null,
        position_y: null,
        is_resolved: false,
        created_by: user.id,
      })
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .single();

    if (replyError) {
      console.error('Error creating reply:', replyError);
      return NextResponse.json({ error: 'Failed to create reply' }, { status: 500 });
    }

    // Non-blocking notification dispatch for parent comment author preferences.
    try {
      const recipientUserId =
        parentComment && typeof parentComment.created_by === 'string'
          ? parentComment.created_by
          : null;

      if (recipientUserId && recipientUserId !== user.id) {
        const adminClient = getSupabaseAdmin();
        const allowedChannels = await getAllowedNotificationChannels(
          adminClient,
          recipientUserId,
          'comments_posts',
          ['email', 'push']
        );

        if (allowedChannels.length > 0) {
          const { data: canvasRow } = await adminClient
            .from('canvases')
            .select('workspace_id')
            .eq('id', id)
            .maybeSingle();

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
      console.warn('Reply notification dispatch skipped:', notifyError);
    }

    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    console.error('Error in replies POST route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
