-- Ensures the integrations table needed for Google Drive + Microsoft OneDrive OAuth.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_user_id text,
    email text,
    scopes text[] NOT NULL DEFAULT '{}',
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_integrations
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS user_id uuid,
    ADD COLUMN IF NOT EXISTS provider text,
    ADD COLUMN IF NOT EXISTS provider_user_id text,
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS access_token text,
    ADD COLUMN IF NOT EXISTS refresh_token text,
    ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE user_integrations
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN provider SET NOT NULL,
    ALTER COLUMN scopes SET DEFAULT '{}',
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now()),
    ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_integrations_provider_check'
          AND conrelid = 'public.user_integrations'::regclass
    ) THEN
        ALTER TABLE user_integrations
            ADD CONSTRAINT user_integrations_provider_check
            CHECK (provider IN ('google-drive', 'microsoft-onedrive'));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_integrations_user_id_provider_key'
          AND conrelid = 'public.user_integrations'::regclass
    ) THEN
        ALTER TABLE user_integrations
            ADD CONSTRAINT user_integrations_user_id_provider_key UNIQUE (user_id, provider);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS user_integrations_user_id_idx ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS user_integrations_provider_idx ON user_integrations(provider);
CREATE INDEX IF NOT EXISTS user_integrations_expires_at_idx ON user_integrations(expires_at);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can insert own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can update own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Users can delete own integrations" ON user_integrations;

CREATE POLICY "Users can view own integrations"
    ON user_integrations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
    ON user_integrations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
    ON user_integrations FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
    ON user_integrations FOR DELETE
    USING (auth.uid() = user_id);
