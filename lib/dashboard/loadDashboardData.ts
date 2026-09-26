// PATCH-192. The dashboard's data loading, split out of the page so the three
// network reads can run in PARALLEL and be tested without React.
//
// The workspace resolves first because everything below depends on it (which
// column the boards and folders are filtered by). Once it is known, the
// entitlements, boards and folders reads all START together -- each with its
// own catch, so one failing read never takes the others down.

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getWorkspaceEntitlements } from '@/lib/auth/permissions';
import { resolveCurrentWorkspace, type WorkspaceContext } from '@/lib/workspace/context';
import type { EntitlementsContext } from '@/types/permissions';

/** The board shape the dashboard list renders. */
export interface Canvas {
  id: number;
  title: string;
  description: string;
  layout: string;
  created_at: string;
  updated_at: string;
  thumbnail_url?: string | null;
  last_visited_at?: string | null;
  is_favorite?: boolean;
  folder_id?: string | null;
  deleted_at?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * A raw `folders` row. The page turns these into sidebar `Folder`s, computing
 * each one's `canvasCount` from the boards it just loaded.
 */
export interface FolderRow {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  workspace_id?: string | null;
  user_id?: string | null;
  position?: number | null;
  [key: string]: unknown;
}

export interface DashboardData {
  readonly workspace: WorkspaceContext | null;
  /** Null when the entitlements read failed; the page then keeps its default. */
  readonly entitlements: EntitlementsContext | null;
  /** [] when the boards read failed. */
  readonly canvases: Canvas[];
  /** [] when the folders read failed or the table does not exist. */
  readonly folders: FolderRow[];
}

async function loadCanvases(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  workspace: WorkspaceContext | null,
): Promise<Canvas[]> {
  try {
    let query = supabase
      .from('boards')
      .select('*')
      .order('updated_at', { ascending: false });

    query = workspace
      ? query.eq('workspace_id', workspace.workspaceId)
      : query.eq('user_id', user.id);

    const { data, error } = await query;

    if (error) {
      console.error('Error loading canvases:', error);
      return [];
    }
    return (data ?? []) as Canvas[];
  } catch (canvasError) {
    console.error('Error loading canvases:', canvasError);
    return [];
  }
}

async function loadFolders(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  workspace: WorkspaceContext | null,
): Promise<FolderRow[]> {
  try {
    let query = supabase
      .from('folders')
      .select('*')
      .order('position', { ascending: true });

    query = workspace
      ? query.eq('workspace_id', workspace.workspaceId)
      : query.eq('user_id', user.id);

    const { data, error } = await query;

    if (error) {
      console.error('Error loading folders:', error);
      return [];
    }
    return (data ?? []) as FolderRow[];
  } catch (folderError) {
    // The folders table may not exist yet; that is a blank sidebar, not a
    // failed dashboard.
    console.error('Error during folder load:', folderError);
    return [];
  }
}

/**
 * Resolve the workspace, then read the entitlements, boards and folders IN
 * PARALLEL. Each of the three catches its own failure and yields an empty
 * value, so one unreadable read never hides the others.
 */
export async function loadDashboardData(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
): Promise<DashboardData> {
  const workspace = await resolveCurrentWorkspace(supabase, user).catch((workspaceError) => {
    console.warn('Workspace resolution fallback:', workspaceError);
    return null;
  });

  const [entitlements, canvases, folders] = await Promise.all([
    getWorkspaceEntitlements(supabase, workspace?.workspaceId).catch((entitlementsError) => {
      console.error('Error loading entitlements:', entitlementsError);
      return null;
    }),
    loadCanvases(supabase, user, workspace),
    loadFolders(supabase, user, workspace),
  ]);

  return { workspace, entitlements, canvases, folders };
}
