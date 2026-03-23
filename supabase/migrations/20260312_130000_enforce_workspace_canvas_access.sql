ALTER TABLE workspace_members
    ADD COLUMN IF NOT EXISTS allowed_canvas_ids uuid[];

ALTER TABLE folders
    ADD COLUMN IF NOT EXISTS access text DEFAULT 'everyone',
    ADD COLUMN IF NOT EXISTS team_ids text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS member_ids text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS workspace_members_allowed_canvas_ids_idx
ON workspace_members USING gin (allowed_canvas_ids);

CREATE OR REPLACE FUNCTION can_access_workspace_folder(
    folder_uuid uuid,
    user_uuid uuid DEFAULT auth.uid(),
    required_action text DEFAULT 'view'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    folder_record RECORD;
    workspace_role_value workspace_role;
    member_email_value text;
    invite_member_token text;
    is_manager boolean;
BEGIN
    IF folder_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id, workspace_id, user_id, access, team_ids, member_ids
    INTO folder_record
    FROM folders
    WHERE id = folder_uuid;

    IF folder_record IS NULL THEN
        RETURN false;
    END IF;

    IF folder_record.user_id = user_uuid THEN
        RETURN true;
    END IF;

    IF folder_record.workspace_id IS NULL THEN
        RETURN false;
    END IF;

    workspace_role_value := get_workspace_role(folder_record.workspace_id, user_uuid);
    IF workspace_role_value IS NULL THEN
        RETURN false;
    END IF;

    is_manager := workspace_role_value IN ('owner'::workspace_role, 'admin'::workspace_role);
    IF is_manager THEN
        RETURN true;
    END IF;

    IF lower(coalesce(required_action, 'view')) IN ('edit', 'update', 'delete', 'write')
        AND workspace_role_value = 'readonly'::workspace_role THEN
        RETURN false;
    END IF;

    IF coalesce(folder_record.access, 'everyone') = 'everyone' THEN
        RETURN true;
    END IF;

    SELECT lower(member_email)
    INTO member_email_value
    FROM workspace_members
    WHERE workspace_id = folder_record.workspace_id
      AND member_user_id = user_uuid
      AND status = 'active'
      AND member_email IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1;

    invite_member_token := CASE
        WHEN member_email_value IS NULL OR member_email_value = '' THEN NULL
        ELSE 'invite:' || member_email_value
    END;

    IF folder_record.access = 'members' THEN
        RETURN (
            user_uuid::text = ANY(coalesce(folder_record.member_ids, ARRAY[]::text[]))
            OR (
                invite_member_token IS NOT NULL
                AND invite_member_token = ANY(coalesce(folder_record.member_ids, ARRAY[]::text[]))
            )
        );
    END IF;

    IF folder_record.access = 'teams' THEN
        RETURN EXISTS (
            SELECT 1
            FROM teams
            WHERE teams.workspace_id = folder_record.workspace_id
              AND teams.id::text = ANY(coalesce(folder_record.team_ids, ARRAY[]::text[]))
              AND (
                  user_uuid::text = ANY(coalesce(teams.member_ids, ARRAY[]::text[]))
                  OR (
                      invite_member_token IS NOT NULL
                      AND invite_member_token = ANY(coalesce(teams.member_ids, ARRAY[]::text[]))
                  )
              )
        );
    END IF;

    IF folder_record.access = 'private' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION can_view_workspace_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    board_record RECORD;
    workspace_role_value workspace_role;
    allowed_ids uuid[];
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id, user_id, workspace_id, folder_id
    INTO board_record
    FROM boards
    WHERE id = board_uuid;

    IF board_record IS NULL THEN
        RETURN false;
    END IF;

    IF board_record.user_id = user_uuid THEN
        RETURN true;
    END IF;

    IF board_record.workspace_id IS NULL THEN
        RETURN false;
    END IF;

    workspace_role_value := get_workspace_role(board_record.workspace_id, user_uuid);
    IF workspace_role_value IS NULL THEN
        RETURN false;
    END IF;

    IF workspace_role_value IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
        RETURN true;
    END IF;

    SELECT allowed_canvas_ids
    INTO allowed_ids
    FROM workspace_members
    WHERE workspace_id = board_record.workspace_id
      AND member_user_id = user_uuid
      AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    IF allowed_ids IS NOT NULL AND NOT (board_record.id = ANY(allowed_ids)) THEN
        RETURN false;
    END IF;

    IF board_record.folder_id IS NULL THEN
        RETURN true;
    END IF;

    RETURN can_access_workspace_folder(board_record.folder_id, user_uuid, 'view');
END;
$$;

CREATE OR REPLACE FUNCTION can_edit_workspace_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    board_record RECORD;
    workspace_role_value workspace_role;
    allowed_ids uuid[];
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id, user_id, workspace_id, folder_id
    INTO board_record
    FROM boards
    WHERE id = board_uuid;

    IF board_record IS NULL THEN
        RETURN false;
    END IF;

    IF board_record.user_id = user_uuid THEN
        RETURN true;
    END IF;

    IF board_record.workspace_id IS NULL THEN
        RETURN false;
    END IF;

    workspace_role_value := get_workspace_role(board_record.workspace_id, user_uuid);
    IF workspace_role_value IS NULL OR workspace_role_value = 'readonly'::workspace_role THEN
        RETURN false;
    END IF;

    IF workspace_role_value IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
        RETURN true;
    END IF;

    SELECT allowed_canvas_ids
    INTO allowed_ids
    FROM workspace_members
    WHERE workspace_id = board_record.workspace_id
      AND member_user_id = user_uuid
      AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    IF allowed_ids IS NOT NULL AND NOT (board_record.id = ANY(allowed_ids)) THEN
        RETURN false;
    END IF;

    IF board_record.folder_id IS NULL THEN
        RETURN true;
    END IF;

    RETURN can_access_workspace_folder(board_record.folder_id, user_uuid, 'edit');
END;
$$;

CREATE OR REPLACE FUNCTION can_manage_workspace_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    board_record RECORD;
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT id, user_id, workspace_id
    INTO board_record
    FROM boards
    WHERE id = board_uuid;

    IF board_record IS NULL THEN
        RETURN false;
    END IF;

    IF board_record.user_id = user_uuid THEN
        RETURN true;
    END IF;

    IF board_record.workspace_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN can_manage_workspace(board_record.workspace_id, user_uuid);
END;
$$;

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace users can view boards" ON boards;
DROP POLICY IF EXISTS "Workspace users can create boards" ON boards;
DROP POLICY IF EXISTS "Workspace users can edit boards" ON boards;
DROP POLICY IF EXISTS "Workspace managers can delete boards" ON boards;

CREATE POLICY "Workspace users can view boards"
    ON boards FOR SELECT
    USING (can_view_workspace_board(id));

CREATE POLICY "Workspace users can create boards"
    ON boards FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            workspace_id IS NULL
            OR can_edit_workspace(workspace_id)
        )
        AND (
            folder_id IS NULL
            OR can_access_workspace_folder(folder_id, auth.uid(), 'edit')
        )
    );

CREATE POLICY "Workspace users can edit boards"
    ON boards FOR UPDATE
    USING (can_edit_workspace_board(id))
    WITH CHECK (can_edit_workspace_board(id));

CREATE POLICY "Workspace managers can delete boards"
    ON boards FOR DELETE
    USING (can_manage_workspace_board(id));

DROP POLICY IF EXISTS "Workspace members can view folders" ON folders;
DROP POLICY IF EXISTS "Workspace editors can create folders" ON folders;
DROP POLICY IF EXISTS "Workspace managers can update folders" ON folders;
DROP POLICY IF EXISTS "Workspace managers can delete folders" ON folders;

CREATE POLICY "Workspace members can view folders"
    ON folders FOR SELECT
    USING (
        (
            workspace_id IS NOT NULL
            AND has_workspace_access(workspace_id)
        )
        OR user_id = auth.uid()
    );

CREATE POLICY "Workspace editors can create folders"
    ON folders FOR INSERT
    WITH CHECK (
        (
            workspace_id IS NULL
            AND user_id = auth.uid()
        )
        OR (
            workspace_id IS NOT NULL
            AND can_edit_workspace(workspace_id)
            AND (
                can_manage_workspace(workspace_id)
                OR (
                    coalesce(access, 'everyone') = 'everyone'
                    AND coalesce(array_length(team_ids, 1), 0) = 0
                    AND coalesce(array_length(member_ids, 1), 0) = 0
                )
            )
        )
    );

CREATE POLICY "Workspace managers can update folders"
    ON folders FOR UPDATE
    USING (
        (
            workspace_id IS NULL
            AND user_id = auth.uid()
        )
        OR (
            workspace_id IS NOT NULL
            AND can_manage_workspace(workspace_id)
        )
    )
    WITH CHECK (
        (
            workspace_id IS NULL
            AND user_id = auth.uid()
        )
        OR (
            workspace_id IS NOT NULL
            AND can_manage_workspace(workspace_id)
        )
    );

CREATE POLICY "Workspace managers can delete folders"
    ON folders FOR DELETE
    USING (
        (
            workspace_id IS NULL
            AND user_id = auth.uid()
        )
        OR (
            workspace_id IS NOT NULL
            AND can_manage_workspace(workspace_id)
        )
    );
