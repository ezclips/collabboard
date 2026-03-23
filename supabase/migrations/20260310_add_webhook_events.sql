CREATE TABLE IF NOT EXISTS webhook_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_provider_processed_idx
ON webhook_events(provider, processed_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view webhook events" ON webhook_events;

CREATE POLICY "Platform admins can view webhook events"
    ON webhook_events FOR SELECT
    USING (is_platform_admin());
