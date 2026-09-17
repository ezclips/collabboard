-- NARROW_PUBLIC_POLICIES_AND_CLOSE_ANON_SURFACE_1: scope the policies that
-- reference the last six anon-executable SECURITY DEFINER functions to
-- `authenticated`, then revoke anon EXECUTE on those six.
--
-- This is the second half of the work begun in
-- 20260916140000_revoke_anon_execute_security_definer.sql, which closed
-- thirteen functions and deliberately left six open because live RLS policies
-- scoped `TO public` referenced them. Revoking those six first would not have
-- denied an anonymous query -- it would have made it ERROR with "permission
-- denied for function" during policy evaluation. Narrowing the policies first
-- removes that hazard, and this migration does both, in that order, in one
-- transaction.
--
-- THE SAFETY ARGUMENT. Every policy narrowed below is `TO public` and calls one
-- of the six WITHOUT a user argument, so the user parameter takes its default,
-- auth.uid(). auth.uid() is NULL for anon, so each of these expressions already
-- evaluated to a non-true value for an anonymous caller and anon already
-- received zero rows. Narrowing to `TO authenticated` therefore removes a false
-- evaluation, not a grant. No anonymous access is lost, and no authenticated
-- access changes -- `authenticated` was already inside PUBLIC.
--
-- RLS is enabled on all ten tables, so the policies are the operative gate and
-- the anon table grants are inert on their own.
--
-- ONE POLICY IS EXEMPT, because it is not purely user-driven. "Workspace
-- managers can view invitations" is `manager OR public-link`, and its second
-- branch depends on no user at all: it is what lets an anonymous visitor read
-- an active link invitation. That policy is SPLIT rather than narrowed, and the
-- anonymous branch is PRESERVED VERBATIM as its own `TO public` policy. Two
-- PERMISSIVE policies OR together to the same predicate, so for `authenticated`
-- the pair is still `manager OR link`, and for anon the link branch is
-- unchanged. Nothing observable moves for either role.
--
-- WHETHER THAT ANONYMOUS BRANCH SHOULD EXIST AT ALL is a separate finding and
-- is NOT decided here: an anonymous caller can read active link invitations,
-- including link_code. Preserving it is the conservative choice for a migration
-- whose whole claim is that it changes no behaviour.
--
-- WHY `authenticated` AND `service_role` KEEP EXECUTE. RLS policy expressions
-- are evaluated as the INVOKING role, so a signed-in user evaluating a narrowed
-- policy still needs EXECUTE in their own right. Two of the six also have
-- callers outside policy evaluation: get_workspace_role is called by the
-- repaired get_board_permission (itself SECURITY DEFINER, so it runs as its
-- owner and is unaffected by the anon revoke), and is_platform_admin is called
-- by getAuthContext on a session client. The verifier checks both.
--
-- ALTER POLICY BELOW CHANGES ONLY THE ROLES. No USING or WITH CHECK clause is
-- restated anywhere in this migration except in the one CREATE POLICY, whose
-- expression is the preserved link branch. Restating an expression is how a
-- "role-only" change silently becomes a predicate change; the source guard
-- forbids it.
--
-- AFTER THIS MIGRATION no SECURITY DEFINER function of ours is reachable by
-- anon. The three PostGIS st_estimatedextent functions remain, as before: they
-- belong to the extension and are not ours to change.

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
