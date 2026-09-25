-- The subscriptions table predates 20260310_add_billing_schema.sql: that migration's
-- CREATE TABLE IF NOT EXISTS was skipped, so the UNIQUE keys it declares were never
-- created. The Stripe webhook upserts ON CONFLICT (workspace_id), which Postgres refuses
-- without a unique constraint (42P10) -- so no paid plan could ever be saved.
-- Found by the first live test checkout (2026-09-25). Checked before writing: one row,
-- no duplicate workspace_id, no duplicate stripe_subscription_id.
--
-- Idempotent: each constraint is added only when missing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname = 'subscriptions_workspace_id_key'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_workspace_id_key UNIQUE (workspace_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.subscriptions'::regclass
          AND conname = 'subscriptions_stripe_subscription_id_key'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
    END IF;
END
$$;
-- Rollback:
-- ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_workspace_id_key;
-- ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_stripe_subscription_id_key;
