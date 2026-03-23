ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS color text,
    ADD COLUMN IF NOT EXISTS member_ids text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS collection_ids text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

UPDATE teams
SET workspace_id = workspaces.id
FROM workspaces
WHERE teams.workspace_id IS NULL
  AND teams.created_by IS NOT NULL
  AND workspaces.owner_user_id = teams.created_by;

UPDATE teams
SET member_ids = '{}'
WHERE member_ids IS NULL;

UPDATE teams
SET collection_ids = '{}'
WHERE collection_ids IS NULL;

CREATE INDEX IF NOT EXISTS teams_workspace_id_idx ON teams(workspace_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace managers can view teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can insert teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can update teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can delete teams" ON teams;

CREATE POLICY "Workspace managers can view teams"
    ON teams FOR SELECT
    USING (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can insert teams"
    ON teams FOR INSERT
    WITH CHECK (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can update teams"
    ON teams FOR UPDATE
    USING (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id))
    WITH CHECK (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can delete teams"
    ON teams FOR DELETE
    USING (workspace_id IS NOT NULL AND can_manage_workspace(workspace_id));
