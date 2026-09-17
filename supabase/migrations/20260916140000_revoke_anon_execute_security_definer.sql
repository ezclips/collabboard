-- REVOKE_ANON_EXECUTE_SECURITY_DEFINER_1: close the provably-safe half of the
-- anonymous SECURITY DEFINER surface.
--
-- An audit of anon-executable SECURITY DEFINER functions found 22. A SECURITY
-- DEFINER function runs with its owner's authority, so one reachable without
-- authenticating is not merely a query -- it is a capability handed to anyone
-- who can reach the API. Three of the 22 are PostGIS (st_estimatedextent);
-- they are not ours to re-grant and are deliberately untouched.
--
-- The remaining nineteen split in two, and the split is the whole design of
-- this migration.
--
-- WHAT THIS CLOSES -- thirteen functions referenced by NO RLS policy at all.
-- Nothing anonymous can reach them through policy evaluation, so an anonymous
-- caller cannot legitimately need EXECUTE on any of them. Revoking is therefore
-- provably a no-op for every legitimate path and a real loss of capability for
-- an illegitimate one. Among them:
--
--   * the permission oracles -- is_board_member, can_read_board,
--     can_comment_board, can_manage_board, can_edit_workspace,
--     is_canvas_admin, check_canvas_permission (both overloads),
--     get_canvas_with_permission. Each takes a (subject, object) pair and
--     returns an authority answer, so anonymously callable each is a free
--     oracle for "does user X have access to Y", for any X and Y.
--   * get_board_members_with_profile -- worse than an oracle: it RETURNS the
--     member list, with email, display name and avatar, to an anonymous caller.
--   * log_canvas_activity -- not a read at all. It accepted anonymous WRITES
--     into the activity log, with the caller choosing the canvas, the user id
--     and the action text.
--
-- Two trigger functions, handle_new_user and handle_new_canvas, are included.
-- Revoking cannot stop their triggers firing: EXECUTE on a trigger function is
-- checked when the trigger is CREATED, not each time it fires. What it does
-- stop is a caller invoking them directly as ordinary functions.
--
-- WHAT THIS DELIBERATELY DOES NOT CLOSE -- six functions remain anon-executable
-- after this migration:
--
--     can_access_board, can_edit_board, can_manage_workspace,
--     get_workspace_role, has_workspace_access, is_platform_admin
--
-- Those ARE referenced by live RLS policies scoped `TO public`, on tables where
-- anon holds grants. Revoking EXECUTE would not make an anonymous query return
-- zero rows -- it would make it ERROR with "permission denied for function"
-- during policy evaluation. That is a behaviour change, not a lock, and it
-- needs its own review: narrow those policies to `TO authenticated` FIRST, then
-- revoke. Recorded as an open finding with its own unit. THIS MIGRATION DOES
-- NOT CLAIM THE SURFACE IS CLOSED.
--
-- WHY `authenticated` IS UNTOUCHED. RLS policy expressions are evaluated as the
-- INVOKING role, not as the function's owner, so a signed-in user evaluating a
-- policy that calls one of these needs EXECUTE in their own right. Separately,
-- the application's own RPC calls -- is_board_member (five call sites) and
-- get_board_members_with_profile (two) -- are issued on session clients, which
-- are `authenticated`. Revoking there would break both. `service_role` is
-- likewise untouched: the server-side paths depend on it.
--
-- REVOKE is idempotent: re-running changes nothing.

BEGIN;

-- The permission oracles.
REVOKE EXECUTE ON FUNCTION public.is_board_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_comment_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid) FROM PUBLIC, anon;

-- The disclosure: this one returns the member list itself, not a boolean.
REVOKE EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) FROM PUBLIC, anon;

-- The anonymous write.
REVOKE EXECUTE ON FUNCTION public.log_canvas_activity(uuid, uuid, text, jsonb) FROM PUBLIC, anon;

-- Trigger functions. Their triggers keep firing -- EXECUTE is checked at
-- CREATE TRIGGER time, not at fire time -- but they stop being directly
-- callable by an anonymous caller.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_canvas() FROM PUBLIC, anon;

-- The legacy canvas-vertical authorities. Both check_canvas_permission
-- overloads are named explicitly: revoking one signature leaves the other
-- reachable, and the enum is schema-qualified so the right overload is
-- resolved regardless of search_path.
REVOKE EXECUTE ON FUNCTION public.is_canvas_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_canvas_with_permission(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_canvas_permission(uuid, uuid, public.permission_level) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_canvas_permission(uuid, uuid, text) FROM PUBLIC, anon;

COMMIT;
