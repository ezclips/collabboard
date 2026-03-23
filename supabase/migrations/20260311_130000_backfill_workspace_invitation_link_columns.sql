-- Backfill link-invitation columns for environments where workspace_invitations
-- existed before the full link schema was introduced.
ALTER TABLE workspace_invitations
    ADD COLUMN IF NOT EXISTS type text,
    ADD COLUMN IF NOT EXISTS link_code text,
    ADD COLUMN IF NOT EXISTS max_uses integer,
    ADD COLUMN IF NOT EXISTS uses integer,
    ADD COLUMN IF NOT EXISTS email_domain text,
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS redeemed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS password text;

UPDATE workspace_invitations
SET type = COALESCE(type, CASE WHEN email IS NULL THEN 'link' ELSE 'email' END),
    uses = COALESCE(uses, 0),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE type IS NULL OR uses IS NULL OR updated_at IS NULL;

ALTER TABLE workspace_invitations
    ALTER COLUMN type SET DEFAULT 'link',
    ALTER COLUMN type SET NOT NULL,
    ALTER COLUMN uses SET DEFAULT 0,
    ALTER COLUMN uses SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workspace_invitations_type_check'
    ) THEN
        ALTER TABLE workspace_invitations
            ADD CONSTRAINT workspace_invitations_type_check
            CHECK (type IN ('link', 'email'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS workspace_invitations_link_code_idx
    ON workspace_invitations(link_code);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_link_code_unique_idx
    ON workspace_invitations(link_code)
    WHERE link_code IS NOT NULL;
