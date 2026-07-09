import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireBoardPermission } from '@/lib/auth/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
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

    const { data: comment, error: commentError } = await supabase
      .from('canvas_comments')
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .eq('id', commentId)
      .eq('canvas_id', id)
      .single();

    if (commentError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error in comment GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
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
    const { content, is_resolved } = body;

    const { data: existingComment, error: fetchError } = await supabase
      .from('canvas_comments')
      .select('created_by, is_resolved')
      .eq('id', commentId)
      .eq('canvas_id', id)
      .single();

    if (fetchError || !existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (content !== undefined) {
      if (existingComment.created_by !== user.id) {
        return NextResponse.json({ error: 'You can only edit your own comments' }, { status: 403 });
      }
      if (!String(content).trim()) {
        return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
      }
      updateData.content = String(content).trim();
      updateData.updated_at = new Date().toISOString();
    }

    if (is_resolved !== undefined) {
      updateData.is_resolved = Boolean(is_resolved);
      updateData.updated_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const { data: updatedComment, error: updateError } = await supabase
      .from('canvas_comments')
      .update(updateData)
      .eq('id', commentId)
      .eq('canvas_id', id)
      .select('id, canvas_id, section_id, item_id, parent_comment_id, content, position_x, position_y, is_resolved, created_by, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Error updating comment:', updateError);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error('Error in comment PUT route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: comment, error: fetchError } = await supabase
      .from('canvas_comments')
      .select('created_by')
      .eq('id', commentId)
      .eq('canvas_id', id)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.created_by !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('canvas_comments')
      .delete()
      .eq('id', commentId)
      .eq('canvas_id', id);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error in comment DELETE route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
