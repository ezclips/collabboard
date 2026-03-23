// app/api/collabboard/canvases/[id]/collaborators/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { mapBoardPermissionToLegacy, mapLegacyToBoardPermission, requireBoardPermission } from '@/lib/auth/permissions';
import type { BoardPermission } from '@/types/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

const AddCollaboratorSchema = z.object({
  user_id: z.string().uuid('Invalid user ID').optional(),
  email: z.string().email('Invalid email address').optional(),
  permission_level: z.enum(['view', 'comment', 'edit', 'admin', 'reader', 'commenter', 'editor', 'moderator']).default('view'),
  send_invitation: z.boolean().default(true),
}).refine((data) => Boolean(data.user_id || data.email), {
  message: 'Either user_id or email is required',
  path: ['user_id'],
});

const UpdateCollaboratorSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  permission_level: z.enum(['view', 'comment', 'edit', 'admin', 'reader', 'commenter', 'editor', 'moderator']),
});

const RemoveCollaboratorSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
});

function normalizeCollaboratorPermission(input: string): BoardPermission | null {
  return mapLegacyToBoardPermission(input) ?? null;
}

async function getCollaboratorsWithProfiles(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  canvasId: string
) {
  const { data: collaborators, error } = await supabase
    .from('canvas_collaborators')
    .select('id, canvas_id, user_id, permission_level, invited_by, invited_at, accepted_at, last_accessed_at')
    .eq('canvas_id', canvasId)
    .order('invited_at', { ascending: false });

  if (error || !collaborators?.length) {
    return { collaborators: collaborators || [], error };
  }

  const profileIds = Array.from(new Set(
    collaborators.flatMap((collaborator) => [collaborator.user_id, collaborator.invited_by]).filter(Boolean)
  ));

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, username')
    .in('id', profileIds);

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return {
    collaborators: collaborators.map((collaborator) => ({
      ...collaborator,
      user_profile: profileMap.get(collaborator.user_id) || null,
      invited_by_profile: profileMap.get(collaborator.invited_by) || null,
    })),
    error: null,
  };
}

async function sendInvitationEmail(
  inviterName: string,
  inviterEmail: string,
  inviteeEmail: string,
  canvasTitle: string,
  canvasId: string,
  permissionLevel: string
) {
  console.log('Invitation email would be sent:', {
    from: inviterEmail,
    to: inviteeEmail,
    subject: `${inviterName} invited you to collaborate on "${canvasTitle}"`,
    canvasId,
    permissionLevel,
  });
}

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

    const { collaborators, error } = await getCollaboratorsWithProfiles(supabase, id);
    if (error) {
      console.error('Error fetching collaborators:', error);
      return NextResponse.json({ error: 'Failed to fetch collaborators' }, { status: 500 });
    }

    return NextResponse.json({ success: true, collaborators });
  } catch (error) {
    console.error('Collaborators GET error:', error);
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

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'editor');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = AddCollaboratorSchema.parse(body);

    if (validatedData.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot add yourself as a collaborator' }, { status: 400 });
    }

    if (!validatedData.user_id) {
      return NextResponse.json({
        error: 'Email-based invitations are not supported by the current schema. Provide user_id instead.'
      }, { status: 400 });
    }

    const { data: canvas, error: canvasError } = await supabase
      .from('canvases')
      .select('id, title, workspace_id')
      .eq('id', id)
      .single();

    if (canvasError || !canvas) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const { data: existingCollaborator } = await supabase
      .from('canvas_collaborators')
      .select('id')
      .eq('canvas_id', id)
      .eq('user_id', validatedData.user_id)
      .single();

    if (existingCollaborator) {
      return NextResponse.json({ error: 'User is already a collaborator on this canvas' }, { status: 400 });
    }

    const boardPermission = normalizeCollaboratorPermission(validatedData.permission_level);
    const legacyPermission = mapBoardPermissionToLegacy(boardPermission);
    if (!boardPermission || !legacyPermission) {
      return NextResponse.json({ error: 'Invalid board permission' }, { status: 400 });
    }

    const { data: collaborator, error: collaboratorError } = await supabase
      .from('canvas_collaborators')
      .insert({
        canvas_id: id,
        user_id: validatedData.user_id,
        permission_level: legacyPermission,
        board_permission: boardPermission,
        invited_by: user.id,
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      })
      .select('id, canvas_id, user_id, permission_level, invited_by, invited_at, accepted_at, last_accessed_at')
      .single();

    if (collaboratorError) {
      console.error('Error adding collaborator:', collaboratorError);
      return NextResponse.json({ error: 'Failed to add collaborator' }, { status: 500 });
    }

    await supabase.rpc('log_canvas_activity', {
      canvas_uuid: id,
      user_uuid: user.id,
      action: 'collaborator_added',
      details: {
        collaborator_id: validatedData.user_id,
        permission_level: legacyPermission,
        board_permission: boardPermission,
      },
    });

    // Non-blocking notification dispatch for direct scene sharing.
    try {
      const adminClient = getSupabaseAdmin();
      const allowedChannels = await getAllowedNotificationChannels(
        adminClient,
        validatedData.user_id,
        'scene_shared',
        ['email', 'push']
      );

      if (allowedChannels.length > 0) {
        let recipientEmail: string | null = null;
        if (canvas.workspace_id) {
          const { data: memberRow } = await adminClient
            .from('workspace_members')
            .select('member_email')
            .eq('workspace_id', canvas.workspace_id)
            .eq('member_user_id', validatedData.user_id)
            .maybeSingle();
          recipientEmail =
            memberRow && typeof memberRow.member_email === 'string'
              ? memberRow.member_email
              : null;
        }

        await dispatchNotification({
          eventId: 'scene_shared',
          recipientUserId: validatedData.user_id,
          channels: allowedChannels,
          recipientEmail,
          context: {
            role: boardPermission,
            canvasTitle: canvas.title,
            appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
            workspaceLink: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/dashboard/canvas/${id}`,
          },
        });
      }
    } catch (notifyError) {
      console.warn('Scene share notification dispatch skipped:', notifyError);
    }

    if (validatedData.send_invitation && validatedData.email) {
      await sendInvitationEmail(
        user.user_metadata?.name || user.email || 'Someone',
        user.email || '',
        validatedData.email,
        canvas.title,
        id,
        boardPermission
      );
    }

    return NextResponse.json({
      success: true,
      collaborator,
      message: 'Collaborator added successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    }

    console.error('Collaborators POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
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

    const permissionCheck = await requireBoardPermission(supabase, id, user.id, 'admin');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = UpdateCollaboratorSchema.parse(body);

    const { data: existingCollaborator, error: existingError } = await supabase
      .from('canvas_collaborators')
      .select('id, permission_level')
      .eq('canvas_id', id)
      .eq('user_id', validatedData.user_id)
      .single();

    if (existingError || !existingCollaborator) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    const boardPermission = normalizeCollaboratorPermission(validatedData.permission_level);
    const legacyPermission = mapBoardPermissionToLegacy(boardPermission);
    if (!boardPermission || !legacyPermission) {
      return NextResponse.json({ error: 'Invalid board permission' }, { status: 400 });
    }

    const { data: collaborator, error: updateError } = await supabase
      .from('canvas_collaborators')
      .update({ permission_level: legacyPermission, board_permission: boardPermission })
      .eq('canvas_id', id)
      .eq('user_id', validatedData.user_id)
      .select('id, canvas_id, user_id, permission_level, invited_by, invited_at, accepted_at, last_accessed_at')
      .single();

    if (updateError) {
      console.error('Error updating collaborator:', updateError);
      return NextResponse.json({ error: 'Failed to update collaborator' }, { status: 500 });
    }

    await supabase.rpc('log_canvas_activity', {
      canvas_uuid: id,
      user_uuid: user.id,
      action: 'collaborator_updated',
      details: {
        collaborator_id: validatedData.user_id,
        old_permission: existingCollaborator.permission_level,
        new_permission: legacyPermission,
        new_board_permission: boardPermission,
      },
    });

    return NextResponse.json({
      success: true,
      collaborator,
      message: 'Collaborator updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    }

    console.error('Collaborators PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const body = await request.json();
    const validatedData = RemoveCollaboratorSchema.parse(body);

    const isRemovingSelf = validatedData.user_id === user.id;
    const permissionCheck = isRemovingSelf
      ? { allowed: true }
      : await requireBoardPermission(supabase, id, user.id, 'admin');
    if (!permissionCheck.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: collaboratorToRemove, error: collaboratorError } = await supabase
      .from('canvas_collaborators')
      .select('id, permission_level, user_id')
      .eq('canvas_id', id)
      .eq('user_id', validatedData.user_id)
      .single();

    if (collaboratorError || !collaboratorToRemove) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('canvas_collaborators')
      .delete()
      .eq('canvas_id', id)
      .eq('user_id', validatedData.user_id);

    if (deleteError) {
      console.error('Error removing collaborator:', deleteError);
      return NextResponse.json({ error: 'Failed to remove collaborator' }, { status: 500 });
    }

    await supabase.rpc('log_canvas_activity', {
      canvas_uuid: id,
      user_uuid: user.id,
      action: isRemovingSelf ? 'collaborator_left' : 'collaborator_removed',
      details: {
        collaborator_id: validatedData.user_id,
        permission_level: collaboratorToRemove.permission_level,
      },
    });

    return NextResponse.json({
      success: true,
      message: isRemovingSelf ? 'You have left the canvas' : 'Collaborator removed successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    }

    console.error('Collaborators DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
