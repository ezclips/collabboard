-- Harden OAuth token storage for user integrations.
-- Run this before deploying code that writes *_encrypted columns.

ALTER TABLE user_integrations
    ADD COLUMN IF NOT EXISTS access_token_encrypted text,
    ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

CREATE INDEX IF NOT EXISTS user_integrations_user_provider_idx
    ON user_integrations(user_id, provider);

-- Optional cleanup (uncomment when you are ready to stop storing plaintext completely):
-- UPDATE user_integrations SET access_token = NULL, refresh_token = NULL;
