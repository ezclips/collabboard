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
    workspace_role_value workspace_role;
    collaborator_permission board_permission_level;
    allowed_ids uuid[];
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id, owner_id, workspace_id, is_public
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
        workspace_role_value := get_workspace_role(canvas_record.workspace_id, user_uuid);

        SELECT allowed_canvas_ids
        INTO allowed_ids
        FROM workspace_members
        WHERE workspace_id = canvas_record.workspace_id
          AND member_user_id = user_uuid
          AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1;

        IF allowed_ids IS NOT NULL AND NOT (canvas_record.id = ANY(allowed_ids)) THEN
            workspace_role_value := NULL;
        END IF;

        IF workspace_role_value IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
            RETURN 'admin'::board_permission_level;
        END IF;

        IF workspace_role_value = 'member'::workspace_role THEN
            RETURN 'editor'::board_permission_level;
        END IF;

        IF workspace_role_value = 'readonly'::workspace_role THEN
            RETURN 'reader'::board_permission_level;
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
        RETURN 'reader'::board_permission_level;
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION get_board_permission(uuid, uuid) TO authenticated;
