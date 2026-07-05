// 📄 app/api/collabboard/canvases/[id]/sections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireBoardPermission } from '@/lib/auth/permissions';
import { resolveCanvasAccessGate } from '@/lib/workspace/access-policy';

interface CreateSectionRequest {
  title: string;
  description?: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'file' | 'link' | 'drawing' | 'sticky_note' | 'shape';
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  background_color?: string;
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  opacity?: number;
  is_locked?: boolean;
  settings?: Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const authenticatedUser = authError ? null : user;
    const providedPassword = request.headers.get('x-canvas-password')?.trim() || '';

    const { data: canvasMeta, error: canvasMetaError } = await supabase
      .from('canvases')
      .select('id, is_public, settings')
      .eq('id', id)
      .single();

    if (canvasMetaError || !canvasMeta) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const { accessPolicy, visitorPermission } = resolveCanvasAccessGate(canvasMeta.settings);

    if (!authenticatedUser) {
      if (accessPolicy.requireLogin) {
        return NextResponse.json(
          { error: 'Login required to access this board', code: 'LOGIN_REQUIRED' },
          { status: 401 },
        );
      }

      if (!canvasMeta.is_public || !visitorPermission) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Password check applies to all users who are not explicit board members
    if (accessPolicy.requirePassword) {
      let isExplicitMember = false;
      if (authenticatedUser) {
        try {
          const permCheck = await requireBoardPermission(supabase, id, authenticatedUser.id, 'reader');
          isExplicitMember = permCheck.allowed;
        } catch {
          isExplicitMember = false;
        }
      }
      if (!isExplicitMember && accessPolicy.password !== providedPassword) {
        return NextResponse.json(
          { error: 'Password required to access this board', code: 'PASSWORD_REQUIRED' },
          { status: 403 },
        );
      }
    }

    if (authenticatedUser) {
      const permissionCheck = await requireBoardPermission(supabase, id, authenticatedUser.id, 'reader');
      if (!permissionCheck.allowed) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('canvas_sections')
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
      .eq('canvas_id', id)
      .order('z_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (sectionsError) {
      console.error('Sections fetch error:', sectionsError);
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    return NextResponse.json({ sections: sections || [] });
  } catch (error) {
    console.error('Sections GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateSectionRequest = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
    }

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'editor');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: section, error: createError } = await supabase
      .from('canvas_sections')
      .insert({
        canvas_id: id,
        title: body.title.trim(),
        description: body.description || '',
        type: body.type || 'text',
        position_x: body.position_x ?? 0,
        position_y: body.position_y ?? 0,
        width: body.width ?? 300,
        height: body.height ?? 200,
        z_index: body.z_index ?? 0,
        background_color: body.background_color ?? '#ffffff',
        border_color: body.border_color ?? '#e5e7eb',
        border_width: body.border_width ?? 1,
        border_radius: body.border_radius ?? 8,
        opacity: body.opacity ?? 1,
        is_locked: body.is_locked ?? false,
        settings: body.settings ?? {},
        created_by: user.id,
      })
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

    if (createError) {
      console.error('Section creation error:', createError);
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 });
    }

    return NextResponse.json({ section }, { status: 201 });
  } catch (error) {
    console.error('Sections POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
