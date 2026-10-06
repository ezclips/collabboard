import type { SupabaseClient } from '@supabase/supabase-js';
import type { LayoutType } from '@/types/collabboard';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import {
  canCreateBoardForEntitlements,
  getWorkspaceEntitlements,
} from '@/lib/auth/permissions';

/**
 * PATCH-301. The create branch of the old CanvasSetupPage `handleSaveCanvas`,
 * lifted verbatim (same steps, same messages, no console.log). Errors are
 * returned, never thrown, so the new board page can render the message inline.
 */
export interface CreateBoardInput {
  title: string;
  description: string;
  layout: LayoutType;
  background_type: string;
  background_value: string;
  comments_enabled: boolean;
  new_posts_at_top: boolean;
  thumbnail: string;
}

export type CreateBoardResult =
  | { ok: true; boardId: string }
  | { ok: false; message: string };

const DEFAULT_SECTION_TITLES = ['Column 1', 'Column 2', 'Column 3'] as const;

export async function createBoard(
  supabase: SupabaseClient,
  input: CreateBoardInput,
): Promise<CreateBoardResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { ok: false, message: 'Authentication error: ' + userError.message };
    }
    if (!user) {
      return { ok: false, message: 'You must be logged in to save a canvas.' };
    }

    const workspaceContext = await resolveCurrentWorkspace(supabase, user);
    const entitlements = await getWorkspaceEntitlements(
      supabase,
      workspaceContext?.workspaceId,
    );

    let boardCountQuery = supabase
      .from('boards')
      .select('*', { count: 'exact', head: true });

    boardCountQuery = workspaceContext
      ? boardCountQuery.eq('workspace_id', workspaceContext.workspaceId)
      : boardCountQuery.eq('user_id', user.id);

    const { count: boardCount, error: boardCountError } = await boardCountQuery.is(
      'deleted_at',
      null,
    );
    if (boardCountError) {
      return { ok: false, message: 'Failed to validate your current board limit.' };
    }

    if (!canCreateBoardForEntitlements(entitlements, boardCount ?? 0)) {
      return {
        ok: false,
        message: 'Free plan allows up to 3 active boards. Upgrade to Pro to create more.',
      };
    }

    const canvasData = {
      title: input.title.trim(),
      description: input.description.trim(),
      layout: input.layout,
      background_type: input.background_type,
      background_value: input.background_value,
      comments_enabled: input.comments_enabled,
      new_posts_at_top: input.new_posts_at_top,
      reactions_enabled: true,
      user_id: user.id,
      workspace_id: workspaceContext?.workspaceId ?? null,
      thumbnail: input.thumbnail,
    };

    const { data, error: canvasError } = await supabase
      .from('boards')
      .insert(canvasData)
      .select()
      .single();

    if (canvasError) {
      return { ok: false, message: 'Database error: ' + canvasError.message };
    }
    if (!data) {
      return { ok: false, message: 'No data returned from save operation' };
    }

    await supabase.from('kanban_board_members').upsert(
      {
        canvas_id: data.id,
        user_id: user.id,
        role: 'owner',
        permission_level: 'admin',
      },
      { onConflict: 'canvas_id,user_id' },
    );

    if (input.layout === 'gantt') {
      const defaultStages = [
        { id: crypto.randomUUID(), name: 'To Do', order_index: 0 },
        { id: crypto.randomUUID(), name: 'In Progress', order_index: 1 },
        { id: crypto.randomUUID(), name: 'Done', order_index: 2 },
      ];
      await supabase.from('kanban_columns').insert(
        defaultStages.map((stage) => ({
          id: stage.id,
          canvas_id: data.id,
          name: stage.name,
          order_index: stage.order_index,
          task_limit: 0,
          is_collapsed: false,
        })),
      );
    }

    if (input.layout === 'columns' || input.layout === 'table') {
      const sectionsToInsert = DEFAULT_SECTION_TITLES.map((title, index) => ({
        board_id: data.id,
        title,
        description: `Column ${index + 1}`,
        position: index + 1,
      }));
      const { error: sectionsError } = await supabase
        .from('board_sections')
        .insert(sectionsToInsert);
      if (sectionsError) {
        return { ok: false, message: 'Error creating sections: ' + sectionsError.message };
      }
    }

    return { ok: true, boardId: data.id };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : (err as { message?: string } | null)?.message;
    return { ok: false, message: 'Error: ' + (message || 'Unknown error occurred') };
  }
}
