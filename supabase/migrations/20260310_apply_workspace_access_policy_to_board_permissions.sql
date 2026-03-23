CREATE OR REPLACE FUNCTION get_board_permission(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS board_permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION get_board_permission(uuid, uuid) TO authenticated;