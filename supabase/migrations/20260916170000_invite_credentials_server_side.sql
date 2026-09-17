-- INVITE_CREDENTIALS_SERVER_SIDE_1: stop publishing invite credentials to
-- anonymous callers, and move the invite preview to the server.
--
-- ------------------------------------------------------------------------
-- F1 -- THE INVITATION ROW IS ANONYMOUSLY READABLE, AND IT CARRIES ITS OWN KEY.
-- ------------------------------------------------------------------------
-- The policy that serves the invite page's preview has a link branch that
-- depends on no user at all, so an anonymous caller could read any active link
-- invitation -- and `select *` on that row returns `link_code` AND the
-- plaintext `password` column. The invite password was therefore not a secret:
-- the gate was published beside its own key. Anyone holding a link could read
-- the password for that link, and the page then compared it client-side.
--
-- Latent at the time of writing -- three invitations, none of them an active
-- link invitation -- but it goes live the moment an admin creates one, and
-- app/api/invitations/create-link exists and works today.
--
-- ------------------------------------------------------------------------
-- F2 -- THE CODE ITSELF WAS NOT A CREDENTIAL-GRADE SECRET.
-- ------------------------------------------------------------------------
-- link_code was generated from two concatenated Math.random() calls -- a
-- non-cryptographic PRNG -- while the code is a bearer credential: possession
-- is the grant. That is fixed in the same commit as this migration, in
-- app/api/invitations/create-link/route.ts, using the same
-- crypto.randomBytes(16).toString('base64url') that app/api/share-link already
-- uses. Existing codes stay valid; only newly issued ones change, so there is
-- nothing here to migrate.
--
-- The two findings compound, which is why they are fixed together: a preview
-- endpoint that answers "is this code valid" is only as safe as the entropy of
-- the code it is asked about.
--
-- ------------------------------------------------------------------------
-- WHAT IS ALREADY CORRECT AND IS NOT TOUCHED.
-- ------------------------------------------------------------------------
-- app/api/invitations/accept/route.ts is sound and unchanged. It requires
-- authentication (401), resolves the invitation with the service client, and
-- enforces expiry, max_uses, email_domain AND the password server-side before
-- incrementing `uses`. The page's own checks were cosmetic duplicates of it.
-- email_domain therefore still protects even though an anonymous caller could
-- previously learn the domain: knowing it does not produce a matching address.
--
-- ------------------------------------------------------------------------
-- WHY THIS IS A ROUTE CHANGE AND NOT JUST A NARROWER POLICY.
-- ------------------------------------------------------------------------
-- The invite page legitimately looks an invitation up BEFORE sign-in, to show
-- "you have been invited as <role>" and whether a password is required.
--
--   * Narrowing the policy to `authenticated` does not fix it. `authenticated`
--     is trivially obtainable -- anyone can sign up -- so any signed-in stranger
--     could still read any active invite's password.
--   * Column-level grants cannot fix it either. The page must know WHETHER a
--     password exists but must never see it, and PostgREST filters the row by
--     link_code, so the credential columns would have to remain selectable to
--     be filterable.
--
-- So the credential-bearing read moves to the server -- a new
-- app/api/invitations/preview route on the service client, returning a fixed,
-- credential-free key set -- and anon loses the table entirely.
--
-- ------------------------------------------------------------------------
-- THIS MIGRATION DELIBERATELY RESTATES A POLICY EXPRESSION.
-- ------------------------------------------------------------------------
-- Every previous policy migration in this series forbade restating a USING
-- clause, because a "role-only" change that quietly edits a predicate is a
-- behaviour change nobody reviewed. Here the EXPRESSION IS THE DEFECT: the link
-- branch is what publishes link_code and password. So the one thing that has to
-- change is the one thing those migrations refused to touch, and it is called
-- out here so that the exception is read as deliberate rather than as drift.
--
-- After this migration "Workspace managers can view invitations" is exactly
-- `can_manage_workspace(workspace_id)` -- managers keep the members page, and
-- nothing else reads the table through PostgREST.
--
-- ------------------------------------------------------------------------
-- ORDERING. This migration REQUIRES 20260916150000 to have been applied first:
-- that is the migration which created "Anyone can view an active link
-- invitation" by splitting the manager policy. The DROP below is written
-- WITHOUT `IF EXISTS` on purpose, so applying these out of order fails loudly
-- instead of silently leaving the link branch in place.

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
