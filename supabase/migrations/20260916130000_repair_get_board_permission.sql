-- REPAIR_GET_BOARD_PERMISSION_1: point get_board_permission at the live board
-- model, and stop it being an anonymous permission oracle.
--
-- THE DEFECT. The function resolved everything from `canvases` and
-- `canvas_collaborators` -- a nav-orphaned legacy vertical. Two separate
-- problems, and fixing only the visible one would have been worse than useless:
--
--   1. It selected `canvases.workspace_id`, a column the schema does not have,
--      so EVERY call raised 42703. share-link creation returned 500 because
--      app/api/share-link/route.ts calls this through getBoardPermission.
--   2. Even with the column restored it would still have been wrong: `canvases`
--      holds ONE row project-wide and no board in use appears in it, so the
--      lookup would have returned NULL for every real board -- a silent deny
--      instead of a loud raise. That is why this re-points the function at
--      `boards` / `board_collaborators` rather than patching the column.
--
-- Recorded at .fable5/docs/LESSONS_LEARNED.md:191.
--
-- WHAT IS PRESERVED, deliberately and exactly: the signature including the
-- `DEFAULT auth.uid()`, the `board_permission_level` return type, STABLE,
-- SECURITY DEFINER and the pinned `search_path`. lib/auth/permissions.ts calls
-- this by name with `board_uuid` / `user_uuid` and must keep working untouched.
-- The three authorities it recognised -- owner, workspace owner/admin, board
-- collaborator -- are all preserved, each re-pointed at the table in use.
--
-- THE VISITOR BRANCH IS NOT REPRODUCED -- a deliberate behaviour change, not an
-- omission. The original's final branch returned a visitor permission derived
-- from `canvases.is_public` and `settings -> 'accessPolicy' ->> 'visitorPermission'`.
-- `boards` has no `is_public` column at all, so there is nothing to translate
-- it from; inventing one would be inventing a policy. A public-board visitor
-- therefore now resolves to NULL -- deny. That is the safe direction for a
-- function whose callers mint share links and gate board writes: the failure
-- mode is "you must be signed in as someone with access", never "an anonymous
-- visitor may create a link". If public-board visitors are wanted back, that is
-- a product decision needing an `is_public` concept on `boards` first.
--
-- SECURITY, and the reason this is not purely a bug fix. The function is
-- SECURITY DEFINER, and PUBLIC and anon both held EXECUTE
-- (proacl {=X/postgres, anon=X/postgres, ...}). It takes (board_uuid,
-- user_uuid) and returns that user's permission on that board, so a WORKING
-- version reachable by anon is an anonymous oracle: anyone could ask "does user
-- X have access to board Y" for any pair, without authenticating. The bug was
-- the only thing hiding it. Repairing the body without revoking the grants
-- would have shipped that oracle, so both are revoked below.
--
-- `authenticated` is deliberately NOT revoked: getAuthContext
-- (lib/auth/permissions.ts:219) calls this facade on a user session.

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
