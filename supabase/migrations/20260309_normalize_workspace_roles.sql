DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'workspace_role'
    ) THEN
        CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'readonly');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS workspaces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'My Workspace',
    logo_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'My Workspace',
    ADD COLUMN IF NOT EXISTS logo_url text,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_user_id_idx ON workspaces(owner_user_id);

INSERT INTO workspaces (owner_user_id, name, logo_url, created_at, updated_at)
SELECT
    owners.owner_user_id,
    COALESCE(settings.workspace_name, 'My Workspace'),
    settings.workspace_logo,
    COALESCE(settings.created_at, timezone('utc'::text, now())),
    COALESCE(settings.updated_at, timezone('utc'::text, now()))
FROM (
    SELECT user_id AS owner_user_id
    FROM workspace_settings
    UNION
    SELECT workspace_owner_id AS owner_user_id
    FROM workspace_members
    UNION
    SELECT created_by AS owner_user_id
    FROM workspace_invitations
) AS owners
LEFT JOIN workspace_settings AS settings
    ON settings.user_id = owners.owner_user_id
WHERE owners.owner_user_id IS NOT NULL
ON CONFLICT (owner_user_id) DO UPDATE
SET
    name = EXCLUDED.name,
    logo_url = COALESCE(EXCLUDED.logo_url, workspaces.logo_url),
    updated_at = GREATEST(workspaces.updated_at, EXCLUDED.updated_at);

ALTER TABLE workspace_settings
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE workspace_settings
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspace_settings.workspace_id IS NULL
  AND workspaces.owner_user_id = workspace_settings.user_id;

ALTER TABLE workspace_members
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE workspace_members
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspace_members.workspace_id IS NULL
  AND workspaces.owner_user_id = workspace_members.workspace_owner_id;

ALTER TABLE workspace_invitations
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE workspace_invitations
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspace_invitations.workspace_id IS NULL
  AND workspaces.owner_user_id = workspace_invitations.created_by;

UPDATE workspace_members
SET role = 'readonly'
WHERE role = 'viewer';

UPDATE workspace_invitations
SET role = 'readonly'
WHERE role = 'viewer';

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_invitations DROP CONSTRAINT IF EXISTS workspace_invitations_role_check;

ALTER TABLE workspace_members
    ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'readonly'));

ALTER TABLE workspace_invitations
    ADD CONSTRAINT workspace_invitations_role_check
    CHECK (role IN ('admin', 'member', 'readonly'));

INSERT INTO workspace_members (
    workspace_id,
    workspace_owner_id,
    member_user_id,
    member_email,
    role,
    status,
    invited_at,
    joined_at,
    created_at,
    updated_at
)
SELECT
    workspaces.id,
    workspaces.owner_user_id,
    workspaces.owner_user_id,
    COALESCE(users.email, ''),
    'owner',
    'active',
    workspaces.created_at,
    workspaces.created_at,
    workspaces.created_at,
    workspaces.updated_at
FROM workspaces
LEFT JOIN auth.users AS users
    ON users.id = workspaces.owner_user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.member_user_id = workspaces.owner_user_id
);

ALTER TABLE workspace_settings ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_members ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_invitations ALTER COLUMN workspace_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_settings_workspace_id_key ON workspace_settings(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_member_user_id_idx ON workspace_members(member_user_id);
CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_id_idx ON workspace_invitations(workspace_id);

CREATE OR REPLACE FUNCTION normalize_workspace_role(role_text text)
RETURNS workspace_role
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE COALESCE(role_text, 'member')
        WHEN 'owner' THEN 'owner'::workspace_role
        WHEN 'admin' THEN 'admin'::workspace_role
        WHEN 'member' THEN 'member'::workspace_role
        WHEN 'viewer' THEN 'readonly'::workspace_role
        WHEN 'readonly' THEN 'readonly'::workspace_role
        ELSE 'member'::workspace_role
    END;
END;
$$;

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
BEGIN
    SELECT CASE
        WHEN workspaces.owner_user_id = user_uuid THEN 'owner'::workspace_role
        ELSE (
            SELECT normalize_workspace_role(workspace_members.role)
            FROM workspace_members
            WHERE workspace_members.workspace_id = workspace_uuid
              AND workspace_members.member_user_id = user_uuid
              AND workspace_members.status = 'active'
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

CREATE OR REPLACE FUNCTION has_workspace_access(
    workspace_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION can_manage_workspace(
    workspace_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IN ('owner'::workspace_role, 'admin'::workspace_role);
$$;

CREATE OR REPLACE FUNCTION can_edit_workspace(
    workspace_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT get_workspace_role(workspace_uuid, user_uuid) IN (
        'owner'::workspace_role,
        'admin'::workspace_role,
        'member'::workspace_role
    );
$$;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON workspaces;
DROP POLICY IF EXISTS "Workspace owners can insert workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace owners can update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace owners can delete workspaces" ON workspaces;

CREATE POLICY "Users can view workspaces they belong to"
    ON workspaces FOR SELECT
    USING (has_workspace_access(id));

CREATE POLICY "Workspace owners can insert workspaces"
    ON workspaces FOR INSERT
    WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Workspace owners can update workspaces"
    ON workspaces FOR UPDATE
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Workspace owners can delete workspaces"
    ON workspaces FOR DELETE
    USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can view their own workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Users can insert their own workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Users can update their own workspace settings" ON workspace_settings;
DROP POLICY IF EXISTS "Users can delete their own workspace settings" ON workspace_settings;

CREATE POLICY "Workspace members can view workspace settings"
    ON workspace_settings FOR SELECT
    USING (has_workspace_access(workspace_id));

CREATE POLICY "Workspace managers can insert workspace settings"
    ON workspace_settings FOR INSERT
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can update workspace settings"
    ON workspace_settings FOR UPDATE
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace owners can delete workspace settings"
    ON workspace_settings FOR DELETE
    USING (get_workspace_role(workspace_id) = 'owner'::workspace_role);

DROP POLICY IF EXISTS "Workspace owners can view their members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace owners can insert members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace owners can update their members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace owners can delete their members" ON workspace_members;

CREATE POLICY "Workspace members can view memberships"
    ON workspace_members FOR SELECT
    USING (has_workspace_access(workspace_id));

CREATE POLICY "Workspace managers can insert memberships"
    ON workspace_members FOR INSERT
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can update memberships"
    ON workspace_members FOR UPDATE
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can delete memberships"
    ON workspace_members FOR DELETE
    USING (can_manage_workspace(workspace_id));

DROP POLICY IF EXISTS "Users can view their own invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Users can insert invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Users can update their own invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Users can delete their own invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Anyone can view active link invitations by code" ON workspace_invitations;

CREATE POLICY "Workspace managers can view invitations"
    ON workspace_invitations FOR SELECT
    USING (
        can_manage_workspace(workspace_id)
        OR (
            type = 'link'
            AND link_code IS NOT NULL
            AND redeemed_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
            AND (max_uses IS NULL OR uses < max_uses)
        )
    );

CREATE POLICY "Workspace managers can insert invitations"
    ON workspace_invitations FOR INSERT
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can update invitations"
    ON workspace_invitations FOR UPDATE
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (
        can_manage_workspace(workspace_id)
        OR auth.uid() = redeemed_by
    );

CREATE POLICY "Workspace managers can delete invitations"
    ON workspace_invitations FOR DELETE
    USING (can_manage_workspace(workspace_id));