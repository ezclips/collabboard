-- ROLLBACK for
-- supabase/production-rollouts/20260916130000_repair_get_board_permission.sql
--
-- THIS PROJECT'S SUPABASE PLAN HAS NO POINT-IN-TIME RECOVERY. This file is the
-- only undo path for that rollout, so it lives in the repository, under review,
-- beside the thing it reverses.
--
-- WHAT RUNNING THIS DOES, stated plainly: it RE-BREAKS SHARING. The body below
-- reads `canvases` and selects `canvases.workspace_id`, a column the schema
-- does not have, so get_board_permission will raise 42703 again and
-- POST /api/share-link will return 500 again. That is the correct undo -- a
-- rollback restores the previous state, it does not invent a third one -- but
-- it is not a neutral act. Run it only to get back to a known state, and
-- expect share-link creation to be unusable again while it is in effect.
--
-- IT DELIBERATELY DOES NOT RE-GRANT PUBLIC OR anon EXECUTE.
--
-- The rollout did two things: it repaired the body (a bug fix) and it revoked
-- EXECUTE from PUBLIC and anon (a security correction). Only the first is
-- undone here. The function is SECURITY DEFINER and answers "what permission
-- does user X have on board Y" for any pair, so reachable by anon it is an
-- anonymous permission oracle. That hole existed before the rollout and was
-- hidden only by the function being broken -- restoring the broken body would
-- hide it again, not close it. A rollback must never re-create a hole to
-- undo a fix. If EXECUTE is ever genuinely needed by another role, grant it to
-- that named role, never to PUBLIC or anon.
--
-- Run as one PostgreSQL statement batch.

BEGIN;

-- Restored VERBATIM from supabase/baseline/schema_snapshot_2026-07-05.sql:438,
-- the repository's record of the definition this rollout replaced. Nothing is
-- retyped or tidied: a rollback that ships an edited body is not a rollback.

CREATE OR REPLACE FUNCTION "public"."get_board_permission"("board_uuid" "uuid", "user_uuid" "uuid" DEFAULT "auth"."uid"()) RETURNS "public"."board_permission_level"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    canvas_record RECORD;
    workspace_role workspace_role;
    collaborator_permission board_permission_level;
    visitor_permission_text text;
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id, owner_id, workspace_id, is_public, settings
    INTO canvas_record
    FROM canvases
    WHERE id = board_uuid;

    IF canvas_record IS NULL THEN
        RETURN NULL;
    END IF;

    IF canvas_record.owner_id = user_uuid THEN
        RETURN 'admin'::board_permission_level;
    END IF;

    IF canvas_record.workspace_id IS NOT NULL THEN
        workspace_role := get_workspace_role(canvas_record.workspace_id, user_uuid);
        IF workspace_role IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
            RETURN 'admin'::board_permission_level;
        END IF;
    END IF;

    SELECT COALESCE(
        board_permission,
        legacy_permission_to_board(permission_level)
    )
    INTO collaborator_permission
    FROM canvas_collaborators
    WHERE canvas_id = board_uuid
      AND user_id = user_uuid
      AND accepted_at IS NOT NULL
    ORDER BY invited_at DESC
    LIMIT 1;

    IF collaborator_permission IS NOT NULL THEN
        RETURN collaborator_permission;
    END IF;

    IF canvas_record.is_public THEN
        visitor_permission_text := lower(
            COALESCE(canvas_record.settings -> 'accessPolicy' ->> 'visitorPermission', 'reader')
        );

        RETURN CASE visitor_permission_text
            WHEN 'no_access' THEN NULL
            WHEN 'reader' THEN 'reader'::board_permission_level
            WHEN 'commenter' THEN 'commenter'::board_permission_level
            WHEN 'editor' THEN 'editor'::board_permission_level
            WHEN 'moderator' THEN 'moderator'::board_permission_level
            WHEN 'admin' THEN 'admin'::board_permission_level
            ELSE 'reader'::board_permission_level
        END;
    END IF;

    RETURN NULL;
END;
$$;

-- No GRANT follows, by design. See the header: the PUBLIC/anon revoke is a
-- security correction and is deliberately NOT undone.

COMMIT;
