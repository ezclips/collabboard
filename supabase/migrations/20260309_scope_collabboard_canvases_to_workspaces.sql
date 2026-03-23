ALTER TABLE canvases
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE canvases
SET workspace_id = workspaces.id
FROM workspaces
WHERE canvases.workspace_id IS NULL
  AND workspaces.owner_user_id = canvases.owner_id;

CREATE INDEX IF NOT EXISTS idx_canvases_workspace_id ON canvases(workspace_id);

CREATE OR REPLACE FUNCTION get_workspace_canvas_permission(
    workspace_uuid uuid,
    user_uuid uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role workspace_role;
BEGIN
    IF workspace_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    resolved_role := get_workspace_role(workspace_uuid, user_uuid);

    RETURN CASE resolved_role
        WHEN 'owner' THEN 'admin'
        WHEN 'admin' THEN 'admin'
        WHEN 'member' THEN 'edit'
        WHEN 'readonly' THEN 'view'
        ELSE NULL
    END;
END;
$$;

CREATE OR REPLACE FUNCTION check_canvas_permission(
    canvas_uuid UUID,
    user_uuid UUID,
    required_permission TEXT DEFAULT 'view'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_permission TEXT;
    canvas_owner UUID;
    permission_hierarchy INTEGER;
    required_hierarchy INTEGER;
    workspace_permission TEXT;
    canvas_is_public BOOLEAN;
BEGIN
    SELECT owner_id INTO canvas_owner
    FROM canvases
    WHERE id = canvas_uuid;

    IF canvas_owner IS NULL THEN
        RETURN FALSE;
    END IF;

    IF canvas_owner = user_uuid THEN
        RETURN TRUE;
    END IF;

    SELECT permission_level::text INTO user_permission
    FROM canvas_collaborators
    WHERE canvas_id = canvas_uuid
      AND user_id = user_uuid
      AND accepted_at IS NOT NULL;

    IF user_permission IS NULL THEN
        SELECT get_workspace_canvas_permission(workspace_id, user_uuid), is_public
        INTO workspace_permission, canvas_is_public
        FROM canvases
        WHERE id = canvas_uuid;

        IF workspace_permission IS NOT NULL THEN
            user_permission := workspace_permission;
        ELSIF canvas_is_public THEN
            user_permission := 'view';
        ELSE
            RETURN FALSE;
        END IF;
    END IF;

    permission_hierarchy := CASE user_permission
        WHEN 'view' THEN 1
        WHEN 'comment' THEN 2
        WHEN 'edit' THEN 3
        WHEN 'admin' THEN 4
        ELSE 0
    END;

    required_hierarchy := CASE required_permission
        WHEN 'view' THEN 1
        WHEN 'comment' THEN 2
        WHEN 'edit' THEN 3
        WHEN 'admin' THEN 4
        ELSE 0
    END;

    RETURN permission_hierarchy >= required_hierarchy;
END;
$$;

CREATE OR REPLACE FUNCTION get_canvas_with_permission(
    canvas_uuid UUID,
    user_uuid UUID
)
RETURNS TABLE (
    canvas_data JSONB,
    user_permission TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    canvas_record RECORD;
    permission TEXT;
BEGIN
    SELECT * INTO canvas_record
    FROM canvases
    WHERE id = canvas_uuid;

    IF canvas_record IS NULL THEN
        RETURN;
    END IF;

    IF canvas_record.owner_id = user_uuid THEN
        permission := 'admin';
    ELSE
        SELECT permission_level::text INTO permission
        FROM canvas_collaborators
        WHERE canvas_id = canvas_uuid
          AND user_id = user_uuid
          AND accepted_at IS NOT NULL;

        IF permission IS NULL THEN
            permission := get_workspace_canvas_permission(canvas_record.workspace_id, user_uuid);
        END IF;

        IF permission IS NULL AND canvas_record.is_public THEN
            permission := 'view';
        END IF;
    END IF;

    IF permission IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT row_to_json(canvas_record)::jsonb, permission;
END;
$$;

DROP POLICY IF EXISTS "Users can view their own canvases" ON canvases;
DROP POLICY IF EXISTS "Users can view public canvases" ON canvases;
DROP POLICY IF EXISTS "Users can view canvases they collaborate on" ON canvases;
DROP POLICY IF EXISTS "Users can create canvases" ON canvases;
DROP POLICY IF EXISTS "Users can update their own canvases" ON canvases;
DROP POLICY IF EXISTS "Canvas admins can update canvases" ON canvases;
DROP POLICY IF EXISTS "Users can delete their own canvases" ON canvases;

CREATE POLICY "Users can view accessible canvases" ON canvases
    FOR SELECT USING (check_canvas_permission(id, auth.uid(), 'view'));

CREATE POLICY "Users can create canvases" ON canvases
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id
        AND (
            workspace_id IS NULL
            OR can_edit_workspace(workspace_id)
        )
    );

CREATE POLICY "Users can update editable canvases" ON canvases
    FOR UPDATE USING (check_canvas_permission(id, auth.uid(), 'edit'))
    WITH CHECK (check_canvas_permission(id, auth.uid(), 'edit'));

CREATE POLICY "Users can delete manageable canvases" ON canvases
    FOR DELETE USING (
        auth.uid() = owner_id
        OR (
            workspace_id IS NOT NULL
            AND can_manage_workspace(workspace_id)
        )
    );
