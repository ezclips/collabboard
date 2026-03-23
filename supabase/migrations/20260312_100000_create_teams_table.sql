CREATE TABLE IF NOT EXISTS teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text,
    member_ids text[] NOT NULL DEFAULT '{}',
    collection_ids text[] NOT NULL DEFAULT '{}',
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS teams_workspace_id_idx ON teams(workspace_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace managers can view teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can insert teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can update teams" ON teams;
DROP POLICY IF EXISTS "Workspace managers can delete teams" ON teams;

CREATE POLICY "Workspace managers can view teams"
    ON teams FOR SELECT
    USING (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can insert teams"
    ON teams FOR INSERT
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can update teams"
    ON teams FOR UPDATE
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace managers can delete teams"
    ON teams FOR DELETE
    USING (can_manage_workspace(workspace_id));
