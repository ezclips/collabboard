import { createBrowserSupabaseClient } from './browserClient';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import type { WorkspaceContext } from '@/lib/workspace/context';

/**
 * PATCH-021: narrow raw-passthrough wrappers for the members settings
 * page's workspace_members / workspace_invitations / boards CRUD, plus the
 * two auth calls it needs. All calls run on the STANDARD cookie/browser
 * client - the same client the page previously obtained via useSupabase().
 *
 * DELIBERATE house-style exception (same ruling as legacyToken.ts and
 * passwordSecurity.ts): these return RAW supabase shapes, not Result - the
 * page's error handling (error.code checks, error.message toasts) consumes
 * those shapes directly, and a behavior-preserving extraction must not
 * translate them. Do not add consumers beyond the pages the patches name.
 *
 * resolveWorkspaceForUser is a THIN pass-through to the existing
 * lib/workspace/context.ts helper (already outside the app/ and components/ trees and
 * therefore already outside the boundary lint) - it supplies the client,
 * nothing about that helper's own logic changes.
 */

export function getCurrentAuthUser() {
    return createBrowserSupabaseClient().auth.getUser();
}

export function getCurrentAuthSession() {
    return createBrowserSupabaseClient().auth.getSession();
}

export function resolveWorkspaceForUser(
    user: Parameters<typeof resolveCurrentWorkspace>[1],
): Promise<WorkspaceContext | null> {
    return resolveCurrentWorkspace(createBrowserSupabaseClient(), user);
}

export function listWorkspaceMembers(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .select('id, member_user_id, member_email, role, status, joined_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
}

export function updateMemberRole(membershipId: string, workspaceId: string, role: string, updatedAt: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .update({ role, updated_at: updatedAt })
        .eq('id', membershipId)
        .eq('workspace_id', workspaceId);
}

export function removeWorkspaceMember(membershipId: string, workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_members')
        .delete()
        .eq('id', membershipId)
        .eq('workspace_id', workspaceId);
}

export function listPendingInvitations(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('redeemed_at', null)
        .order('created_at', { ascending: false });
}

export function updateInvitation(
    invitationId: string,
    patch: { role: string; email_domain: string | null; canvas_ids: string[] | null },
) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .update(patch)
        .eq('id', invitationId);
}

export function deleteInvitation(invitationId: string) {
    return createBrowserSupabaseClient()
        .from('workspace_invitations')
        .delete()
        .eq('id', invitationId);
}

export function listWorkspaceCanvasOptions(workspaceId: string) {
    return createBrowserSupabaseClient()
        .from('boards')
        .select('id, title, layout')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
}
