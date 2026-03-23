ALTER TABLE workspace_settings
    ADD COLUMN IF NOT EXISTS access_policy jsonb NOT NULL DEFAULT jsonb_build_object(
        'requirePassword', false,
        'password', '',
        'requireLogin', false,
        'publishToProfileAndWeb', false,
        'showInWorkspaceDashboard', true,
        'visitorPermission', 'reader'
    );

UPDATE workspace_settings
SET access_policy = jsonb_build_object(
    'requirePassword', false,
    'password', '',
    'requireLogin', false,
    'publishToProfileAndWeb', false,
    'showInWorkspaceDashboard', true,
    'visitorPermission', 'reader'
)
WHERE access_policy IS NULL;