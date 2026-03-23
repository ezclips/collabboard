ALTER TABLE workspace_invitations
ADD COLUMN IF NOT EXISTS canvas_ids text[];
