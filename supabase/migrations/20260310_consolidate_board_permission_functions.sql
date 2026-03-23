CREATE OR REPLACE FUNCTION board_permission_rank(permission board_permission_level)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE permission
        WHEN 'reader'::board_permission_level THEN 1
        WHEN 'commenter'::board_permission_level THEN 2
        WHEN 'editor'::board_permission_level THEN 3
        WHEN 'moderator'::board_permission_level THEN 4
        WHEN 'admin'::board_permission_level THEN 5
        ELSE 0
    END;
$$;

CREATE OR REPLACE FUNCTION normalize_required_board_permission(required_permission text)
RETURNS board_permission_level
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE lower(coalesce(required_permission, 'reader'))
        WHEN 'view' THEN 'reader'::board_permission_level
        WHEN 'reader' THEN 'reader'::board_permission_level
        WHEN 'comment' THEN 'commenter'::board_permission_level
        WHEN 'commenter' THEN 'commenter'::board_permission_level
        WHEN 'edit' THEN 'editor'::board_permission_level
        WHEN 'editor' THEN 'editor'::board_permission_level
        WHEN 'moderate' THEN 'moderator'::board_permission_level
        WHEN 'moderator' THEN 'moderator'::board_permission_level
        WHEN 'admin' THEN 'admin'::board_permission_level
        ELSE 'reader'::board_permission_level
    END;
$$;

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
        RETURN 'reader'::board_permission_level;
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION can_read_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_board_permission(board_uuid, user_uuid) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION can_comment_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('commenter'::board_permission_level);
$$;

CREATE OR REPLACE FUNCTION can_edit_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('editor'::board_permission_level);
$$;

CREATE OR REPLACE FUNCTION can_manage_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT board_permission_rank(get_board_permission(board_uuid, user_uuid))
        >= board_permission_rank('admin'::board_permission_level);
$$;

CREATE OR REPLACE FUNCTION check_canvas_permission(
    canvas_uuid uuid,
    user_uuid uuid,
    required_permission text DEFAULT 'view'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_permission board_permission_level;
    required_board_permission board_permission_level;
BEGIN
    resolved_permission := get_board_permission(canvas_uuid, user_uuid);
    required_board_permission := normalize_required_board_permission(required_permission);

    IF resolved_permission IS NULL THEN
        RETURN false;
    END IF;

    RETURN board_permission_rank(resolved_permission) >= board_permission_rank(required_board_permission);
END;
$$;

DROP FUNCTION IF EXISTS get_canvas_with_permission(uuid, uuid);

CREATE FUNCTION get_canvas_with_permission(
    canvas_uuid uuid,
    user_uuid uuid
)
RETURNS TABLE (
    canvas_data jsonb,
    user_permission text,
    board_permission text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    canvas_record RECORD;
    resolved_permission board_permission_level;
BEGIN
    SELECT *
    INTO canvas_record
    FROM canvases
    WHERE id = canvas_uuid;

    IF canvas_record IS NULL THEN
        RETURN;
    END IF;

    resolved_permission := get_board_permission(canvas_uuid, user_uuid);

    IF resolved_permission IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        row_to_json(canvas_record)::jsonb,
        board_permission_to_legacy(resolved_permission)::text,
        resolved_permission::text;
END;
$$;

GRANT EXECUTE ON FUNCTION board_permission_rank(board_permission_level) TO authenticated;
GRANT EXECUTE ON FUNCTION normalize_required_board_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_board_permission(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_read_board(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_comment_board(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_board(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_board(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_canvas_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_canvas_with_permission(uuid, uuid) TO authenticated;
