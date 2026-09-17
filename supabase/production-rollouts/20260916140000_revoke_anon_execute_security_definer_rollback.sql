-- ROLLBACK for
-- supabase/production-rollouts/20260916140000_revoke_anon_execute_security_definer.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- RUNNING THIS RE-OPENS AN ANONYMOUS ORACLE SURFACE. It hands EXECUTE back to
-- anon and PUBLIC on thirteen SECURITY DEFINER functions -- code that runs with
-- its owner's authority. After running it, an unauthenticated caller can once
-- again:
--
--   * ask whether any user has read, comment, manage or admin rights on any
--     board or workspace, for any (subject, object) pair they care to name
--     (is_board_member, can_read_board, can_comment_board, can_manage_board,
--      can_edit_workspace, is_canvas_admin, check_canvas_permission x2,
--      get_canvas_with_permission);
--   * retrieve a board's MEMBER LIST, including email, display name and avatar
--     (get_board_members_with_profile);
--   * WRITE rows into the activity log, choosing the canvas, the user id and
--     the action text (log_canvas_activity).
--
-- THIS FILE EXISTS ONLY TO UNDO THAT ONE MIGRATION, and only if applying it is
-- shown to have broken something. It is not a maintenance tool and there is no
-- other legitimate reason to run it. If some caller turns out to need one of
-- these functions, grant EXECUTE to that ONE function for the specific named
-- role that needs it -- never all thirteen, and never to PUBLIC or anon.
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY, which is why the
-- undo is version-controlled rather than assumed. That it is available is not a
-- reason to reach for it.
--
-- The signatures below are verbatim from the migration, so this restores
-- exactly what it removed and nothing else. GRANT is idempotent.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- The permission oracles.
GRANT EXECUTE ON FUNCTION public.is_board_member(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_board(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_comment_board(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_board(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid) TO PUBLIC, anon;

-- The member-list disclosure.
GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(uuid) TO PUBLIC, anon;

-- The anonymous write.
GRANT EXECUTE ON FUNCTION public.log_canvas_activity(uuid, uuid, text, jsonb) TO PUBLIC, anon;

-- The trigger functions.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_canvas() TO PUBLIC, anon;

-- The legacy canvas-vertical authorities, both overloads named explicitly.
GRANT EXECUTE ON FUNCTION public.is_canvas_admin(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_canvas_with_permission(uuid, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_canvas_permission(uuid, uuid, public.permission_level) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_canvas_permission(uuid, uuid, text) TO PUBLIC, anon;

COMMIT;
