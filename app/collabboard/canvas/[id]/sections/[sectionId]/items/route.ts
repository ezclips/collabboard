// 📄 app/api/collabboard/canvases/[id]/sections/[sectionId]/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface CreateItemRequest {
  content: string;
  position: number;
  type?: string;
  color?: string;
  metadata?: any;
}

// POST /api/collabboard/canvases/[id]/sections/[sectionId]/items - Create new item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    // Get user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canvasId = id;
    const body: CreateItemRequest = await request.json();

    // Validate required fields
    if (!body.content || body.position === undefined) {
      return NextResponse.json({
        error: 'Missing required fields: content, position'
      }, { status: 400 });
    }

    // Check if canvas and section exist and user has permission
    const { data: canvas, error: fetchError } = await supabase
      .from('canvases')
      .select(`
        id, 
        created_by,
        sections:canvas_sections!inner(id)
      `)
      .eq('id', canvasId)
      .eq('sections.id', sectionId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Canvas or section not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch canvas' }, { status: 500 });
    }

    // Check permission (owner or collaborator with edit rights)
    if (canvas.created_by !== user.id) {
      // TODO: Check if user is a collaborator with edit rights
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create item
    const { data: item, error: createError } = await supabase
      .from('canvas_items')
      .insert({
        section_id: sectionId,
        content: body.content,
        type: body.type || 'text',
        position: body.position,
        color: body.color || '#FEF3C7',
        created_by: user.id,
        metadata: body.metadata || {}
      })
      .select()
      .single();

    if (createError) {
      console.error('Item creation error:', createError);
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
    }

    return NextResponse.json({ item }, { status: 201 });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 📄 app/api/collabboard/canvases/[id]/sections/[sectionId]/items/[itemId]/route.ts
// PUT /api/collabboard/canvases/[id]/sections/[sectionId]/items/[itemId] - Update item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string; itemId?: string }> }
) {
  try {
    const { id, sectionId, itemId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    // Get user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canvasId = id;
    const body = await request.json();

    // Check if canvas exists and user has permission
    const { data: canvas, error: fetchError } = await supabase
      .from('canvases')
      .select('id, created_by')
      .eq('id', canvasId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch canvas' }, { status: 500 });
    }

    // Check permission
    if (canvas.created_by !== user.id) {
      // TODO: Check if user is a collaborator with edit rights
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    if (body.content !== undefined) updateData.content = body.content;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    // Update item
    const { data: item, error: updateError } = await supabase
      .from('canvas_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .select()
      .single();

    if (updateError) {
      console.error('Item update error:', updateError);
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    }

    return NextResponse.json({ item });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/collabboard/canvases/[id]/sections/[sectionId]/items/[itemId] - Delete item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string; itemId?: string }> }
) {
  try {
    const { id, sectionId, itemId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    // Get user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canvasId = id;

    // Check if canvas exists and user has permission
    const { data: canvas, error: fetchError } = await supabase
      .from('canvases')
      .select('id, created_by')
      .eq('id', canvasId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch canvas' }, { status: 500 });
    }

    // Check permission
    if (canvas.created_by !== user.id) {
      // TODO: Check if user is a collaborator with edit rights
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete item
    const { error: deleteError } = await supabase
      .from('canvas_items')
      .delete()
      .eq('id', itemId)
      .eq('section_id', sectionId);

    if (deleteError) {
      console.error('Item delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Item deleted successfully' });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}