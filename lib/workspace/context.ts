import type { SupabaseClient, User } from '@supabase/supabase-js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'readonly';
export type InvitableWorkspaceRole = Exclude<WorkspaceRole, 'owner'>;

export interface WorkspaceContext {
  workspaceId: string;
  ownerUserId: string | null;
  role: WorkspaceRole;
  workspaceName: string;
  workspaceLogo: string | null;
}

export const workspaceRoleLabels: Record<WorkspaceRole, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  member: { label: 'Member', color: 'bg-green-100 text-green-700' },
  readonly: { label: 'Read only', color: 'bg-gray-100 text-gray-700' },
};

export const workspaceRoleDescriptions: Record<InvitableWorkspaceRole, string> = {
  admin: 'Admins can manage members, invitations, and workspace settings.',
  member: 'Members can create and edit workspace content but cannot manage workspace access.',
  readonly: 'Read only members can open workspace content but cannot change it.',
};

export function normalizeWorkspaceRole(role: string | null | undefined): WorkspaceRole {
  switch (role) {
    case 'owner':
    case 'admin':
    case 'member':
    case 'readonly':
      return role;
    case 'viewer':
      return 'readonly';
    default:
      return 'member';
  }
}

export function canManageWorkspace(role: WorkspaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function canEditWorkspace(role: WorkspaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

function defaultWorkspaceName(email: string | null | undefined): string {
  const prefix = email?.split('@')[0]?.trim();
  return prefix ? `${prefix}'s Workspace` : 'My Workspace';
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === 'string' ? maybeCode : undefined;
}

function isIgnorableWorkspaceError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === 'PGRST116' || code === '42P01' || code === '42703';
}

async function ensureWorkspaceBootstrap(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  adminClient?: SupabaseClient,
) {
  const writeClient = adminClient ?? supabase;
  const newWorkspaceId = crypto.randomUUID();
  const workspaceName = defaultWorkspaceName(user.email);

  const { error: workspaceInsertError } = await writeClient
    .from('workspaces')
    .insert({
      id: newWorkspaceId,
      owner_user_id: user.id,
      name: workspaceName,
    });

  if (workspaceInsertError && !isIgnorableWorkspaceError(workspaceInsertError)) {
    throw workspaceInsertError;
  }

  const insertedWorkspace = {
    id: newWorkspaceId,
    owner_user_id: user.id,
    name: workspaceName,
    logo_url: null
  };

  const { error: memberInsertError } = await writeClient
    .from('workspace_members')
    .insert({
      workspace_id: insertedWorkspace.id,
      workspace_owner_id: user.id,
      member_user_id: user.id,
      member_email: user.email ?? '',
      role: 'owner',
      status: 'active',
      invited_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
    });

  if (memberInsertError && !isIgnorableWorkspaceError(memberInsertError)) {
    throw memberInsertError;
  }

  return insertedWorkspace;
}

export async function resolveCurrentWorkspace(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  adminClient?: SupabaseClient,
): Promise<WorkspaceContext | null> {
  try {
    const { data: initialMembershipRows, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, created_at')
      .eq('member_user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1);

    let membershipRows = initialMembershipRows;

    if (membershipError && !isIgnorableWorkspaceError(membershipError)) {
      throw membershipError;
    }

    if ((!membershipRows || membershipRows.length === 0) && user.email) {
      const fallbackMembership = await supabase
        .from('workspace_members')
        .select('workspace_id, role, created_at')
        .eq('member_email', user.email.toLowerCase())
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1);

      if (fallbackMembership.error && !isIgnorableWorkspaceError(fallbackMembership.error)) {
        throw fallbackMembership.error;
      }

      membershipRows = fallbackMembership.data ?? membershipRows;
    }

    const membership = membershipRows?.[0] ?? null;

    let workspaceId = membership?.workspace_id ?? null;
    let role = membership ? normalizeWorkspaceRole(membership.role) : null;

    let workspaceQuery = null;
    if (workspaceId) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, owner_user_id, name, logo_url')
        .eq('id', workspaceId)
        .single();

      if (error && !isIgnorableWorkspaceError(error)) {
        throw error;
      }

      workspaceQuery = data ?? null;
    }

    if (!workspaceQuery) {
      const readClient = adminClient ?? supabase;
      const { data, error } = await readClient
        .from('workspaces')
        .select('id, owner_user_id, name, logo_url')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error && !isIgnorableWorkspaceError(error)) {
        throw error;
      }

      workspaceQuery = data ?? null;
      workspaceId = workspaceQuery?.id ?? null;
      if (workspaceQuery && !role) {
        role = 'owner';
      }
    }

    // If user owns the workspace but has no membership row, create it so RLS helpers
    // like can_manage_workspace(workspace_id) work consistently.
    if (workspaceQuery?.id && workspaceQuery.owner_user_id === user.id && !membership) {
      const writeClient = adminClient ?? supabase;
      const { error: ownerMembershipError } = await writeClient
        .from('workspace_members')
        .insert({
          workspace_id: workspaceQuery.id,
          workspace_owner_id: user.id,
          member_user_id: user.id,
          member_email: user.email ?? '',
          role: 'owner',
          status: 'active',
          invited_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        });

      if (ownerMembershipError && !isIgnorableWorkspaceError(ownerMembershipError)) {
        throw ownerMembershipError;
      }
    }

    if (!workspaceQuery || !workspaceId) {
      const bootstrappedWorkspace = await ensureWorkspaceBootstrap(supabase, user, adminClient);
      if (!bootstrappedWorkspace?.id) {
        return null;
      }

      workspaceQuery = bootstrappedWorkspace;
      workspaceId = bootstrappedWorkspace.id;
      role = 'owner';
    }

    const { data: settingsRow, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('workspace_name, workspace_logo')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (settingsError && !isIgnorableWorkspaceError(settingsError)) {
      throw settingsError;
    }

    return {
      workspaceId,
      ownerUserId: workspaceQuery.owner_user_id ?? null,
      role: role ?? (workspaceQuery.owner_user_id === user.id ? 'owner' : 'member'),
      workspaceName: settingsRow?.workspace_name || workspaceQuery.name || defaultWorkspaceName(user.email),
      workspaceLogo: settingsRow?.workspace_logo || workspaceQuery.logo_url || null,
    };
  } catch (error) {
    console.warn('resolveCurrentWorkspace fallback to personal workspace', error);
    return null;
  }
}
