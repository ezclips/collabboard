// app/api/collabboard/canvases/[id]/route.ts
// Enhanced version with permission checking
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getPermissionContext, mapBoardPermissionToLegacy, requireBoardPermission } from '@/lib/auth/permissions';
import { resolveCanvasAccessGate } from '@/lib/workspace/access-policy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    const canvasId = id;
    const providedPassword = request.headers.get('x-canvas-password')?.trim() || '';

    const { data: canvasMeta, error: canvasMetaError } = await supabase
      .from('canvases')
      .select('*')
      .eq('id', canvasId)
      .single();

    if (canvasMetaError || !canvasMeta) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const { accessPolicy, visitorPermission } = resolveCanvasAccessGate(canvasMeta.settings);
    const authenticatedUser = authError ? null : user;

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

      if (accessPolicy.requirePassword && accessPolicy.password !== providedPassword) {
        return NextResponse.json(
          { error: 'Password required to access this board', code: 'PASSWORD_REQUIRED' },
          { status: 403 },
        );
      }
    }

    // Use the helper function to get canvas with permission
    const { data: canvasData, error: canvasError } = authenticatedUser
      ? await supabase.rpc('get_canvas_with_permission', {
          canvas_id: canvasId,
          user_id: authenticatedUser.id,
        })
      : { data: null, error: null };

    if (canvasError) {
      console.error('Error fetching canvas:', canvasError);
      return NextResponse.json({ error: 'Failed to fetch canvas' }, { status: 500 });
    }

    if (authenticatedUser && (!canvasData || canvasData.length === 0)) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const canvasResult = canvasData?.[0];
    const canvas = canvasResult?.canvas_data || canvasMeta;
    const boardPermission = canvasResult?.board_permission || visitorPermission;
    const permission = canvasResult?.user_permission || mapBoardPermissionToLegacy(visitorPermission);

    // Get collaborator count
    const { count: collaboratorCount, error: countError } = await supabase
      .from('canvas_collaborators')
      .select('*', { count: 'exact', head: true })
      .eq('canvas_id', canvasId);

    if (countError) {
      console.error('Error counting collaborators:', countError);
    }

    // Get owner profile
    // Update last accessed timestamp
    if (authenticatedUser && permission && permission !== 'admin') {
      await supabase
        .from('canvas_collaborators')
        .upsert({
          canvas_id: canvasId,
          user_id: authenticatedUser.id,
          permission_level: permission || 'view',
          last_accessed_at: new Date().toISOString()
        }, {
          onConflict: 'canvas_id,user_id'
        });
    }

    const response = {
      canvas: {
        ...canvas,
        collaborator_count: collaboratorCount || 0,
        is_owner: authenticatedUser ? canvas.created_by === authenticatedUser.id : false,
      },
      permission,
      board_permission: boardPermission,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in canvas GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canvasId = id;
    const body = await request.json();
    const { title, description, status } = body;

    // Check if user has edit permission
    const permissionCheck = await requireBoardPermission(supabase, canvasId, user.id, 'editor');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update the canvas
    const { data: updatedCanvas, error: updateError } = await supabase
      .from('canvases')
      .update({
        title,
        description,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', canvasId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating canvas:', updateError);
      return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 });
    }

    // Log the activity
    await supabase.rpc('log_canvas_activity', {
      canvas_id: canvasId,
      user_id: user.id,
      action: 'canvas_updated',
      details: {
        changes: { title, description, status }
      }
    });

    return NextResponse.json({
      canvas: updatedCanvas,
      permission: permissionCheck.legacyPermission ?? 'edit',
      board_permission: permissionCheck.permission,
    });

  } catch (error) {
    console.error('Error in canvas PUT route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canvasId = id;

    // Check if user is the owner (only owners can delete)
    const { data: canvas, error: canvasError } = await supabase
      .from('canvases')
      .select('created_by, workspace_id, title')
      .eq('id', canvasId)
      .single();

    if (canvasError) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const permissionContext = await getPermissionContext(supabase, user, canvas.workspace_id || undefined, canvasId);
    const canDelete = canvas.created_by === user.id
      || permissionContext.boardAccess?.permission === 'admin';

    if (!canDelete) {
      return NextResponse.json({ error: 'Only the owner or a workspace manager can delete this canvas' }, { status: 403 });
    }

    // Delete the canvas (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('canvases')
      .delete()
      .eq('id', canvasId);

    if (deleteError) {
      console.error('Error deleting canvas:', deleteError);
      return NextResponse.json({ error: 'Failed to delete canvas' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Canvas deleted successfully' });

  } catch (error) {
    console.error('Error in canvas DELETE route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
