-- CollabBoard REPAIR_GET_BOARD_PERMISSION_1 production rollout.
--
-- SOURCE:
--   supabase/migrations/20260916130000_repair_get_board_permission.sql
--
-- The function and the REVOKE below are a byte-faithful copy of that reviewed
-- migration -- nothing is improved, reordered or redesigned here. This file
-- exists because `[db.migrations] enabled = false` in config.toml and
-- supabase/BASELINE.md records that supabase/migrations/ does not rebuild the
-- live database. Run it as one PostgreSQL statement batch.
--
-- WHAT IT FIXES. get_board_permission resolved from `canvases` /
-- `canvas_collaborators` and selected `canvases.workspace_id`, a column that
-- does not exist, so every call raised 42703 and POST /api/share-link returned
-- 500. `canvases` also holds one row and no board in use, so the function would
-- have denied every real board even with the column restored. It now resolves
-- from `boards` / `board_collaborators`.
--
-- IT ALSO CLOSES A HOLE. The function is SECURITY DEFINER and PUBLIC and anon
-- held EXECUTE, so a working version is an anonymous permission oracle for any
-- (board, user) pair. Both grants are revoked. `authenticated` is left intact
-- because getAuthContext calls this on a user session.
--
-- AFTER APPLYING, run the verifier:
--   supabase/production-rollouts/20260916130000_repair_get_board_permission_verify.sql
-- A pass requires anon EXECUTE = false and the body naming boards, never canvases.
--
-- TO UNDO, see ..._rollback.sql -- which restores the previous body verbatim
-- and deliberately does NOT re-grant PUBLIC or anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_board_permission(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS board_permission_level
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    collaborator_permission board_permission_level;
    workspace_role workspace_role;
    board_workspace_id uuid;
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    -- The live board, or nothing. This function used to read `canvases`,
    -- a nav-orphaned legacy vertical whose single row describes no board
    -- in use, so it returned NULL for every real board even before the
    -- column drift made it raise. `boards` is what the application reads.
    SELECT b.workspace_id INTO board_workspace_id
      FROM public.boards b
     WHERE b.id = board_uuid;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Owner. `boards.user_id` is the live owner column; the legacy
    -- `canvases.owner_id` describes nothing a board has.
    IF EXISTS (
        SELECT 1 FROM public.boards b
         WHERE b.id = board_uuid AND b.user_id = user_uuid
    ) THEN
        RETURN 'admin'::board_permission_level;
    END IF;

    -- Workspace owner/admin. Same intent as the version this replaces,
    -- which read `canvases.workspace_id`; `boards.workspace_id` is the
    -- same column on the table actually in use.
    IF board_workspace_id IS NOT NULL THEN
        workspace_role := public.get_workspace_role(board_workspace_id, user_uuid);
        IF workspace_role IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
            RETURN 'admin'::board_permission_level;
        END IF;
    END IF;

    -- Board collaborator. `board_collaborators.role` is free text; its
    -- documented values are 'editor', 'commenter' and 'viewer'. An
    -- unknown role returns NULL -- deny -- rather than being guessed at.
    SELECT CASE lower(c.role)
             WHEN 'editor'    THEN 'editor'::board_permission_level
             WHEN 'commenter' THEN 'commenter'::board_permission_level
             WHEN 'viewer'    THEN 'reader'::board_permission_level
           END
      INTO collaborator_permission
      FROM public.board_collaborators c
     WHERE c.board_id = board_uuid
       AND c.user_id = user_uuid
     LIMIT 1;

    IF collaborator_permission IS NOT NULL THEN
        RETURN collaborator_permission;
    END IF;

    RETURN NULL;
END;
$function$;

-- The security half. Without this, the repaired function is an anonymous
-- oracle for "does user X have access to board Y" -- see the header. This is
-- the whole grant change: `authenticated` and `service_role` are untouched.
REVOKE ALL ON FUNCTION public.get_board_permission(uuid, uuid)
    FROM PUBLIC, anon;

COMMIT;
