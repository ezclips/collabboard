-- PRODUCTION ROLLOUT -- stop publishing invite credentials to anonymous callers.
--
-- SOURCE: supabase/migrations/20260916170000_invite_credentials_server_side.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for both findings; the
-- short version is:
--
--   * the invite page's preview policy had a link branch depending on no user,
--     so an anonymous caller could read any active link invitation -- and the
--     row carries both `link_code` and the PLAINTEXT `password`. The gate was
--     published beside its own key;
--   * the code itself came from Math.random(), a non-cryptographic PRNG, while
--     being a bearer credential. That half is fixed in application code in the
--     same commit, using crypto.randomBytes(16).toString('base64url');
--   * narrowing the policy to `authenticated` would not have helped (anyone can
--     sign up) and column grants cannot help (PostgREST filters on link_code,
--     so the credential columns must stay selectable to stay filterable). The
--     read therefore moves to the server and anon loses the table.
--
-- THIS ROLLOUT MUST BE PAIRED WITH THE APPLICATION CHANGE. Once anon loses
-- SELECT, the old client-side lookup in app/invite/[code]/page.tsx returns
-- nothing and every invite link renders "invalid". The deploy that carries
-- app/api/invitations/preview must be live before, or together with, this.
--
-- ORDER. This REQUIRES 20260916150000 to have been applied first -- that is what
-- created "Anyone can view an active link invitation". The DROP is written
-- without `IF EXISTS` on purpose, so an out-of-order apply fails loudly rather
-- than silently leaving the link branch in place.
--
-- VERIFY WITH:
--   20260916170000_invite_credentials_server_side_verify.sql
-- UNDO WITH (read its header first):
--   20260916170000_invite_credentials_server_side_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- Anon loses EVERY privilege on the table, not just SELECT. The default ACL
-- grants ALL to anon and the policies above it were the only gate; once the
-- preview is served by the server, nothing anonymous needs this table at all.
REVOKE ALL ON TABLE public.workspace_invitations FROM anon;

-- The public link branch existed to serve the anonymous preview. The preview
-- now comes from the server, so the branch is dead weight that still publishes
-- link_code and password -- to anon before this statement, and to every signed-in
-- user through the manager policy's OR branch until the ALTER below.
DROP POLICY "Anyone can view an active link invitation" ON public.workspace_invitations;

-- Managers keep reading invitations for the members page. The link branch goes;
-- only can_manage_workspace remains. This is the deliberate expression restatement
-- described in the header.
ALTER POLICY "Workspace managers can view invitations"
    ON public.workspace_invitations
    TO authenticated
    USING (can_manage_workspace(workspace_id));

COMMIT;
