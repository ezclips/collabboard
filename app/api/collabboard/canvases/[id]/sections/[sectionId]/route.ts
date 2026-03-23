import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireBoardPermission } from '@/lib/auth/permissions';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'editor');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'description', 'type', 'position_x', 'position_y', 'width', 'height', 'z_index',
      'background_color', 'border_color', 'border_width', 'border_radius', 'opacity', 'is_locked', 'settings',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const { data: section, error: updateError } = await supabase
      .from('canvas_sections')
      .update(updateData)
      .eq('id', sectionId)
      .eq('canvas_id', id)
      .select(`
        id,
        canvas_id,
        title,
        description,
        type,
        position_x,
        position_y,
        width,
        height,
        z_index,
        background_color,
        border_color,
        border_width,
        border_radius,
        opacity,
        is_locked,
        settings,
        created_by,
        created_at,
        updated_at,
        items:canvas_items (
          id,
          section_id,
          canvas_id,
          type,
          content,
          position_x,
          position_y,
          width,
          height,
          z_index,
          rotation,
          scale_x,
          scale_y,
          opacity,
          is_locked,
          style_properties,
          created_by,
          created_at,
          updated_at
        )
      `)
      .single();

    if (updateError) {
      console.error('Section update error:', updateError);
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 });
    }

    return NextResponse.json({ section });
  } catch (error) {
    console.error('Sections PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'editor');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('canvas_sections')
      .delete()
      .eq('id', sectionId)
      .eq('canvas_id', id);

    if (deleteError) {
      console.error('Section delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Section deleted successfully' });
  } catch (error) {
    console.error('Sections DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
