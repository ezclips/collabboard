-- PRODUCTION ROLLOUT -- narrow the public-scoped policies, then close the last
-- six anonymous SECURITY DEFINER oracles.
--
-- SOURCE: supabase/migrations/20260916150000_narrow_public_policies_and_close_anon_surface.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full safety
-- argument; the short version is:
--
--   * every policy narrowed here is `TO public` and calls its function with the
--     user argument omitted, so it defaults to auth.uid(), which is NULL for
--     anon. Each already evaluated to a non-true value for an anonymous caller,
--     so narrowing removes a false evaluation rather than a grant;
--   * the invitations policy is SPLIT, not narrowed, because its second branch
--     is user-independent and is what lets an anonymous visitor read an active
--     link invitation. Two permissive policies OR together, so the split is
--     behaviour-identical for both roles;
--   * only then are the six revoked. Doing it the other way round would turn
--     anonymous queries into "permission denied for function" errors.
--
-- ORDER MATTERS AND IT IS ONE TRANSACTION. If any statement fails, none of it
-- applies, and the database is never left with the functions revoked while a
-- `TO public` policy still calls them.
--
-- VERIFY WITH:
--   20260916150000_narrow_public_policies_and_close_anon_surface_verify.sql
-- UNDO WITH (read its header first):
--   20260916150000_narrow_public_policies_and_close_anon_surface_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Narrow the twenty-five purely user-driven policies to `authenticated`.
-- ---------------------------------------------------------------------------

-- freeform_graph_settings -- can_access_board / can_edit_board.
ALTER POLICY "Users can select freeform settings of their boards" ON public.freeform_graph_settings TO authenticated;
ALTER POLICY "Users can insert freeform settings of their boards" ON public.freeform_graph_settings TO authenticated;
ALTER POLICY "Users can update freeform settings of their boards" ON public.freeform_graph_settings TO authenticated;

-- customers -- can_manage_workspace / has_workspace_access.
ALTER POLICY "Workspace managers can manage customers" ON public.customers TO authenticated;
ALTER POLICY "Workspace members can view customers" ON public.customers TO authenticated;

-- subscriptions -- can_manage_workspace / has_workspace_access.
ALTER POLICY "Workspace managers can manage subscriptions" ON public.subscriptions TO authenticated;
ALTER POLICY "Workspace members can view subscriptions" ON public.subscriptions TO authenticated;

-- teams -- can_manage_workspace.
ALTER POLICY "Workspace managers can delete teams" ON public.teams TO authenticated;
ALTER POLICY "Workspace managers can insert teams" ON public.teams TO authenticated;
ALTER POLICY "Workspace managers can update teams" ON public.teams TO authenticated;
ALTER POLICY "Workspace managers can view teams" ON public.teams TO authenticated;

-- workspace_members -- can_manage_workspace / has_workspace_access.
ALTER POLICY "Workspace managers can delete memberships" ON public.workspace_members TO authenticated;
ALTER POLICY "Workspace managers can insert memberships" ON public.workspace_members TO authenticated;
ALTER POLICY "Workspace managers can update memberships" ON public.workspace_members TO authenticated;
ALTER POLICY "Workspace members can view memberships" ON public.workspace_members TO authenticated;

-- workspace_settings -- can_manage_workspace / has_workspace_access /
-- get_workspace_role.
ALTER POLICY "Workspace managers can insert workspace settings" ON public.workspace_settings TO authenticated;
ALTER POLICY "Workspace managers can update workspace settings" ON public.workspace_settings TO authenticated;
ALTER POLICY "Workspace members can view workspace settings" ON public.workspace_settings TO authenticated;
ALTER POLICY "Workspace owners can delete workspace settings" ON public.workspace_settings TO authenticated;

-- workspaces -- has_workspace_access.
ALTER POLICY "Users can view workspaces they belong to" ON public.workspaces TO authenticated;

-- platform_admins -- is_platform_admin.
ALTER POLICY "Platform admins can delete platform admins" ON public.platform_admins TO authenticated;
ALTER POLICY "Platform admins can insert platform admins" ON public.platform_admins TO authenticated;
ALTER POLICY "Platform admins can update platform admins" ON public.platform_admins TO authenticated;
ALTER POLICY "Platform admins can view platform admins" ON public.platform_admins TO authenticated;

-- webhook_events -- is_platform_admin.
ALTER POLICY "Platform admins can view webhook events" ON public.webhook_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Split the invitations policy, preserving its anonymous branch.
-- ---------------------------------------------------------------------------
-- The manager branch becomes authenticated-only; the link branch becomes its
-- own permissive `TO public` policy with the identical predicate. PERMISSIVE
-- policies OR together, so the pair is equivalent to the original for
-- `authenticated`, and identical to the original for anon.

ALTER POLICY "Workspace managers can view invitations" ON public.workspace_invitations TO authenticated;

CREATE POLICY "Anyone can view an active link invitation"
    ON public.workspace_invitations
    FOR SELECT TO public
    USING (
        (type = 'link'::text)
        AND (link_code IS NOT NULL)
        AND (redeemed_at IS NULL)
        AND ((expires_at IS NULL) OR (expires_at > now()))
        AND ((max_uses IS NULL) OR (uses < max_uses))
    );

-- ---------------------------------------------------------------------------
-- 3. With no `TO public` policy left calling them, revoke the six.
-- ---------------------------------------------------------------------------
-- REVOKE is idempotent: re-running changes nothing.

REVOKE EXECUTE ON FUNCTION public.can_access_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;

COMMIT;
