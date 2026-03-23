DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'billing_plan'
    ) THEN
        CREATE TYPE billing_plan AS ENUM ('free', 'pro');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'subscription_status'
    ) THEN
        CREATE TYPE subscription_status AS ENUM (
            'trialing',
            'active',
            'past_due',
            'canceled',
            'unpaid',
            'incomplete',
            'incomplete_expired'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_customer_id text NOT NULL UNIQUE,
    email text,
    name text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    stripe_subscription_id text UNIQUE,
    stripe_price_id text,
    stripe_product_id text,
    plan billing_plan NOT NULL DEFAULT 'free',
    status subscription_status,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    current_period_start timestamptz,
    current_period_end timestamptz,
    trial_start timestamptz,
    trial_end timestamptz,
    canceled_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS customers_workspace_id_idx
ON customers(workspace_id);

CREATE INDEX IF NOT EXISTS subscriptions_workspace_id_idx
ON subscriptions(workspace_id);

CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx
ON subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
ON subscriptions(status);

CREATE OR REPLACE FUNCTION update_billing_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_billing_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_billing_updated_at_column();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view customers" ON customers;
DROP POLICY IF EXISTS "Workspace managers can manage customers" ON customers;
DROP POLICY IF EXISTS "Workspace members can view subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Workspace managers can manage subscriptions" ON subscriptions;

CREATE POLICY "Workspace members can view customers"
    ON customers FOR SELECT
    USING (has_workspace_access(workspace_id));

CREATE POLICY "Workspace managers can manage customers"
    ON customers FOR ALL
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (can_manage_workspace(workspace_id));

CREATE POLICY "Workspace members can view subscriptions"
    ON subscriptions FOR SELECT
    USING (has_workspace_access(workspace_id));

CREATE POLICY "Workspace managers can manage subscriptions"
    ON subscriptions FOR ALL
    USING (can_manage_workspace(workspace_id))
    WITH CHECK (can_manage_workspace(workspace_id));
