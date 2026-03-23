UPDATE workspace_members AS wm
SET member_user_id = users.id
FROM auth.users AS users
WHERE wm.member_user_id IS NULL
  AND wm.member_email IS NOT NULL
  AND lower(wm.member_email) = lower(users.email);

CREATE INDEX IF NOT EXISTS workspace_members_member_email_lower_idx
ON workspace_members (lower(member_email));

CREATE OR REPLACE FUNCTION get_workspace_role(
    workspace_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS workspace_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role workspace_role;
    jwt_email text;
BEGIN
    jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));

    SELECT CASE
        WHEN workspaces.owner_user_id = user_uuid THEN 'owner'::workspace_role
        ELSE (
            SELECT normalize_workspace_role(workspace_members.role)
            FROM workspace_members
            WHERE workspace_members.workspace_id = workspace_uuid
              AND workspace_members.status = 'active'
              AND (
                workspace_members.member_user_id = user_uuid
                OR (
                    workspace_members.member_user_id IS NULL
                    AND workspace_members.member_email IS NOT NULL
                    AND lower(workspace_members.member_email) = jwt_email
                )
              )
            ORDER BY workspace_members.created_at ASC
            LIMIT 1
        )
    END
    INTO resolved_role
    FROM workspaces
    WHERE workspaces.id = workspace_uuid;

    RETURN resolved_role;
END;
$$;
