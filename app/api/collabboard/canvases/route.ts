// app/api/collabboard/canvases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import { mapBoardPermissionToLegacy } from '@/lib/auth/permissions';
import {
  buildCanvasAccessSettings,
  createDefaultWorkspaceAccessPolicy,
  isCanvasPublicFromPolicy,
  normalizeWorkspaceAccessPolicy,
} from '@/lib/workspace/access-policy';

interface WorkspaceSettingsRow {
  access_policy?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status');
    const workspaceContext = await resolveCurrentWorkspace(supabase, user);

    // Get canvases where user is owner, collaborator, or workspace member.
    let query = supabase
      .from('canvases')
      .select(`
        id,
        title,
        description,
        status,
        workspace_id,
        created_by,
        created_at,
        updated_at,
        collaborators:canvas_collaborators (
          user_id,
          permission_level,
          accepted_at
        )
      `)
      .order('updated_at', { ascending: false });

    query = workspaceContext
      ? query.eq('workspace_id', workspaceContext.workspaceId)
      : query.or(`created_by.eq.${user.id},canvas_collaborators.user_id.eq.${user.id}`);

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: canvases, error: canvasesError } = await query;

    if (canvasesError) {
      console.error('Error fetching canvases:', canvasesError);
      return NextResponse.json({ error: 'Failed to fetch canvases' }, { status: 500 });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('canvases')
      .select('*', { count: 'exact', head: true });

    countQuery = workspaceContext
      ? countQuery.eq('workspace_id', workspaceContext.workspaceId)
      : countQuery.or(`created_by.eq.${user.id},canvas_collaborators.user_id.eq.${user.id}`);

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting canvases:', countError);
    }

    const response = {
      canvases: canvases || [],
      total_count: totalCount || 0,
      total_pages: Math.max(1, Math.ceil((totalCount || 0) / limit)),
      pagination: {
        limit,
        offset,
        has_more: (totalCount || 0) > offset + limit
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in canvases GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, content, settings: requestedSettings } = body;
    const workspaceContext = await resolveCurrentWorkspace(supabase, user);

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    let accessPolicy = createDefaultWorkspaceAccessPolicy();

    if (workspaceContext?.workspaceId) {
      const { data: workspaceSettings, error: workspaceSettingsError } = await supabase
        .from('workspace_settings')
        .select('access_policy')
        .eq('workspace_id', workspaceContext.workspaceId)
        .maybeSingle();

      if (workspaceSettingsError && workspaceSettingsError.code !== 'PGRST116') {
        console.error('Error loading workspace access policy:', workspaceSettingsError);
      }

      accessPolicy = normalizeWorkspaceAccessPolicy(
        (workspaceSettings as WorkspaceSettingsRow | null)?.access_policy,
      );
    }

    const canvasAccessSettings = buildCanvasAccessSettings(accessPolicy);

    // Create the canvas
    const { data: newCanvas, error: insertError } = await supabase
      .from('canvases')
      .insert({
        title: title.trim(),
        description: description || null,
        content: content || null,
        created_by: user.id,
        workspace_id: workspaceContext?.workspaceId ?? null,
        is_public: isCanvasPublicFromPolicy(accessPolicy),
        settings: {
          ...(requestedSettings && typeof requestedSettings === 'object' && !Array.isArray(requestedSettings)
            ? requestedSettings
            : {}),
          ...canvasAccessSettings,
        },
        status: 'active'
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Error creating canvas:', insertError);
      return NextResponse.json({ error: 'Failed to create canvas' }, { status: 500 });
    }

    // Add creator as admin collaborator
    await supabase
      .from('canvas_collaborators')
      .insert({
        canvas_id: newCanvas.id,
        user_id: user.id,
        permission_level: mapBoardPermissionToLegacy('admin'),
        board_permission: 'admin'
      });

    // Log the activity
    await supabase.rpc('log_canvas_activity', {
      canvas_id: newCanvas.id,
      user_id: user.id,
      action: 'canvas_created',
      details: {
        title: title.trim()
      }
    });

    return NextResponse.json({ canvas: newCanvas, permission: 'admin' }, { status: 201 });

  } catch (error) {
    console.error('Error in canvases POST route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
