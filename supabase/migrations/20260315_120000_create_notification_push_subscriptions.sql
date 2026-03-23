CREATE TABLE IF NOT EXISTS notification_push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS notification_push_subscriptions_user_id_idx
    ON notification_push_subscriptions(user_id);

ALTER TABLE notification_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON notification_push_subscriptions;

CREATE POLICY "Users can view own push subscriptions"
    ON notification_push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
    ON notification_push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
    ON notification_push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
    ON notification_push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);
