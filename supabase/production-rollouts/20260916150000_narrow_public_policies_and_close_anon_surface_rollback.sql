-- ROLLBACK for
-- supabase/production-rollouts/20260916150000_narrow_public_policies_and_close_anon_surface.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- RUNNING THIS RE-OPENS AN ANONYMOUS ORACLE SURFACE. It hands EXECUTE back to
-- anon and PUBLIC on six SECURITY DEFINER functions -- code that runs with its
-- owner's authority -- and widens twenty-five RLS policies back to `TO public`.
-- After running it, an unauthenticated caller can once again:
--
--   * ask whether any user has access to, or can edit, any board, for any
--     (subject, object) pair they care to name
--     (can_access_board, can_edit_board);
--   * ask whether any user is a member, or a manager, of any workspace, and
--     what their ROLE in it is -- a free "does user X have access to workspace
--     Y" oracle (has_workspace_access, can_manage_workspace, get_workspace_role);
--   * ask whether any user is a PLATFORM ADMIN, for any user id
--     (is_platform_admin).
--
-- Each of those is a boolean or a role name returned to someone who has not
-- authenticated at all, for any subject and object they choose to name. That is
-- the surface this rollback restores.
--
-- THIS FILE EXISTS ONLY TO UNDO THAT ONE MIGRATION, and only if applying it is
-- shown to have broken something. It is not a maintenance tool and there is no
-- other legitimate reason to run it. If some caller turns out to need one of
-- these functions, grant EXECUTE to that ONE function for the specific named
-- role that needs it -- never all six, and never to PUBLIC or anon. If some
-- anonymous path turns out to need one of the narrowed policies, restore that
-- ONE policy and record why an anonymous caller may read that table.
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY, which is why the
-- undo is version-controlled rather than assumed. That it is available is not a
-- reason to reach for it.
--
-- ORDER. Grants are restored FIRST, then the policies are widened, so the
-- database is never left with a `TO public` policy calling a function anon
-- cannot execute -- the state that turns anonymous queries into "permission
-- denied for function" errors. It is one transaction regardless.
--
-- GRANT is idempotent, and ALTER POLICY changes only the roles: no USING or
-- WITH CHECK clause is restated here either, so widening cannot alter a
-- predicate. The one DROP removes only the policy this migration added.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hand EXECUTE back to anon and PUBLIC on the six.
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.can_access_board(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_board(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. Widen the twenty-five back to `TO public`.
-- ---------------------------------------------------------------------------

ALTER POLICY "Users can select freeform settings of their boards" ON public.freeform_graph_settings TO public;
ALTER POLICY "Users can insert freeform settings of their boards" ON public.freeform_graph_settings TO public;
ALTER POLICY "Users can update freeform settings of their boards" ON public.freeform_graph_settings TO public;

ALTER POLICY "Workspace managers can manage customers" ON public.customers TO public;
ALTER POLICY "Workspace members can view customers" ON public.customers TO public;

ALTER POLICY "Workspace managers can manage subscriptions" ON public.subscriptions TO public;
ALTER POLICY "Workspace members can view subscriptions" ON public.subscriptions TO public;

ALTER POLICY "Workspace managers can delete teams" ON public.teams TO public;
ALTER POLICY "Workspace managers can insert teams" ON public.teams TO public;
ALTER POLICY "Workspace managers can update teams" ON public.teams TO public;
ALTER POLICY "Workspace managers can view teams" ON public.teams TO public;

ALTER POLICY "Workspace managers can delete memberships" ON public.workspace_members TO public;
ALTER POLICY "Workspace managers can insert memberships" ON public.workspace_members TO public;
ALTER POLICY "Workspace managers can update memberships" ON public.workspace_members TO public;
ALTER POLICY "Workspace members can view memberships" ON public.workspace_members TO public;

ALTER POLICY "Workspace managers can insert workspace settings" ON public.workspace_settings TO public;
ALTER POLICY "Workspace managers can update workspace settings" ON public.workspace_settings TO public;
ALTER POLICY "Workspace members can view workspace settings" ON public.workspace_settings TO public;
ALTER POLICY "Workspace owners can delete workspace settings" ON public.workspace_settings TO public;

ALTER POLICY "Users can view workspaces they belong to" ON public.workspaces TO public;

ALTER POLICY "Platform admins can delete platform admins" ON public.platform_admins TO public;
ALTER POLICY "Platform admins can insert platform admins" ON public.platform_admins TO public;
ALTER POLICY "Platform admins can update platform admins" ON public.platform_admins TO public;
ALTER POLICY "Platform admins can view platform admins" ON public.platform_admins TO public;

ALTER POLICY "Platform admins can view webhook events" ON public.webhook_events TO public;

-- ---------------------------------------------------------------------------
-- 3. Re-merge the invitations policy.
-- ---------------------------------------------------------------------------
-- Widening the manager policy back to `TO public` restores the original
-- `manager OR link` predicate for every role, which makes the split-out policy
-- redundant. Dropping it is what returns workspace_invitations to exactly one
-- policy, as it was before the migration.

ALTER POLICY "Workspace managers can view invitations" ON public.workspace_invitations TO public;

DROP POLICY IF EXISTS "Anyone can view an active link invitation" ON public.workspace_invitations;

COMMIT;
