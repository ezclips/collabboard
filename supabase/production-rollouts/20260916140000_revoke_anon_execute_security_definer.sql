-- CollabBoard REVOKE_ANON_EXECUTE_SECURITY_DEFINER_1 production rollout.
--
-- SOURCE:
--   supabase/migrations/20260916140000_revoke_anon_execute_security_definer.sql
--
-- The statements below are a byte-faithful copy of that reviewed migration --
-- nothing is improved, reordered or redesigned here. This file exists because
-- `[db.migrations] enabled = false` in config.toml and supabase/BASELINE.md
-- records that supabase/migrations/ does not rebuild the live database. Run it
-- as one PostgreSQL statement batch.
--
-- WHAT IT CLOSES. Thirteen SECURITY DEFINER functions were executable without
-- authenticating and are referenced by no RLS policy, so no anonymous path can
-- legitimately need them: nine permission oracles, one member-list disclosure
-- (get_board_members_with_profile, which returns email and display name), one
-- anonymous write (log_canvas_activity) and two trigger functions.
--
-- WHAT IT DOES NOT CLOSE. Six functions -- can_access_board, can_edit_board,
-- can_manage_workspace, get_workspace_role, has_workspace_access,
-- is_platform_admin -- stay anon-executable, because live policies scoped
-- `TO public` reference them and revoking would turn anonymous queries into
-- "permission denied for function" errors rather than empty results. Narrowing
-- those policies is a separate unit. DO NOT read this rollout as closing the
-- anonymous SECURITY DEFINER surface.
--
-- The three PostGIS st_estimatedextent functions are not ours and are untouched.
--
-- AFTER APPLYING, run the verifier:
--   supabase/production-rollouts/20260916140000_revoke_anon_execute_security_definer_verify.sql
-- It pins the REMAINING surface as exactly those six names, so a future grant
-- cannot slip in unnoticed.
--
-- TO UNDO, see ..._rollback.sql -- which re-opens an anonymous oracle surface
-- and exists for no other purpose.

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
