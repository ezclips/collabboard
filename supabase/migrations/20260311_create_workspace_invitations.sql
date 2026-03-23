-- Create workspace_invitations table if it doesn't exist
CREATE TABLE IF NOT EXISTS workspace_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'link' CHECK (type IN ('link', 'email')),
    email text,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'readonly')),
    link_code text UNIQUE,
    max_uses integer,
    uses integer NOT NULL DEFAULT 0,
    email_domain text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    redeemed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_id_idx ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invitations_link_code_idx ON workspace_invitations(link_code);
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON workspace_invitations(email);

-- Enable RLS
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (idempotent: drop if exists, then create)
DROP POLICY IF EXISTS "Workspace managers can view invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Workspace managers can insert invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Workspace managers can update invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Workspace managers can delete invitations" ON workspace_invitations;

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
