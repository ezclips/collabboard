-- ROLLBACK for
-- supabase/production-rollouts/20260916170000_invite_credentials_server_side.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- RUNNING THIS REPUBLISHES INVITE CREDENTIALS TO ANONYMOUS CALLERS. It restores
-- anon's privileges on public.workspace_invitations and recreates the policy
-- whose link branch depends on no user at all. After running it, anyone who can
-- reach the API -- with no account, no session and no cookie -- can once again
-- read any active link invitation row, and that row contains:
--
--   * link_code -- the bearer credential. Possession of it IS the invitation;
--   * password  -- IN PLAINTEXT. The password that gates the invite is returned
--     beside the invite it gates, so the gate stops being a gate;
--   * email_domain, role, workspace_id, created_by, canvas_ids and the usage
--     counters.
--
-- The practical effect is that every password-protected invite link in the
-- workspace becomes a link with a published password.
--
-- IT ALSO BREAKS THE APPLICATION IF THE NEW CODE IS DEPLOYED. The invite page
-- now reads app/api/invitations/preview, which never returns a credential.
-- Running this does not restore the old client-side lookup; it only reopens the
-- hole the route was written to close.
--
-- THIS FILE EXISTS ONLY TO UNDO THAT ONE MIGRATION, and only if applying it is
-- shown to have broken something -- most plausibly, the members page losing
-- invitations for a manager. If that is the symptom, the fix is to restore the
-- MANAGER policy alone (statement 3 below) and leave anon and the link branch
-- closed. Do not run the whole file for that.
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY, which is why the
-- undo is version-controlled rather than assumed. That it is available is not a
-- reason to reach for it.
--
-- ORDER. Privileges are restored first, then the policies, so the table is
-- never briefly readable by anon with no policy to constrain the rows.
--
-- WHAT THIS DOES NOT UNDO: the invite code generator. Codes issued after
-- 20260916170000 come from crypto.randomBytes and stay valid; this file does
-- not and must not reintroduce Math.random().
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- 1. Hand the table's privileges back to anon, as the default ACL had them.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_invitations TO anon;

-- 2. Recreate the anonymous link-branch policy, with the predicate exactly as
-- 20260916150000 created it.
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

-- 3. Restore the manager policy's original predicate: manager OR link branch.
-- This is the statement to run ALONE if the only symptom is a manager losing
-- invitations on the members page.
ALTER POLICY "Workspace managers can view invitations"
    ON public.workspace_invitations
    TO authenticated
    USING (
        can_manage_workspace(workspace_id)
        OR (
            (type = 'link'::text)
            AND (link_code IS NOT NULL)
            AND (redeemed_at IS NULL)
            AND ((expires_at IS NULL) OR (expires_at > now()))
            AND ((max_uses IS NULL) OR (uses < max_uses))
        )
    );

COMMIT;
