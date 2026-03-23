ALTER TABLE workspace_invitations
ADD COLUMN IF NOT EXISTS password text;
