CREATE TABLE IF NOT EXISTS notification_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS accessibility_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_workspace text,
    libraries jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('google-drive', 'microsoft-onedrive')),
    provider_user_id text,
    email text,
    scopes text[] NOT NULL DEFAULT '{}',
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_integrations_user_id_idx ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS user_integrations_provider_idx ON user_integrations(provider);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can insert own notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can update own notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can delete own notification settings" ON notification_settings;

CREATE POLICY "Users can view own notification settings"
    ON notification_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings"
    ON notification_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
    ON notification_settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification settings"
    ON notification_settings FOR DELETE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own accessibility settings" ON accessibility_settings;
DROP POLICY IF EXISTS "Users can insert own accessibility settings" ON accessibility_settings;
DROP POLICY IF EXISTS "Users can update own accessibility settings" ON accessibility_settings;
DROP POLICY IF EXISTS "Users can delete own accessibility settings" ON accessibility_settings;

CREATE POLICY "Users can view own accessibility settings"
    ON accessibility_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accessibility settings"
    ON accessibility_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accessibility settings"
    ON accessibility_settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accessibility settings"
    ON accessibility_settings FOR DELETE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own dashboard settings" ON dashboard_settings;
DROP POLICY IF EXISTS "Users can insert own dashboard settings" ON dashboard_settings;
DROP POLICY IF EXISTS "Users can update own dashboard settings" ON dashboard_settings;
DROP POLICY IF EXISTS "Users can delete own dashboard settings" ON dashboard_settings;

CREATE POLICY "Users can view own dashboard settings"
    ON dashboard_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dashboard settings"
    ON dashboard_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboard settings"
    ON dashboard_settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboard settings"
    ON dashboard_settings FOR DELETE
    USING (auth.uid() = user_id);

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
