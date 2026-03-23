CREATE TABLE IF NOT EXISTS platform_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS platform_admins_created_by_idx
ON platform_admins(created_by);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view platform admins" ON platform_admins;
DROP POLICY IF EXISTS "Platform admins can insert platform admins" ON platform_admins;
DROP POLICY IF EXISTS "Platform admins can update platform admins" ON platform_admins;
DROP POLICY IF EXISTS "Platform admins can delete platform admins" ON platform_admins;

CREATE OR REPLACE FUNCTION is_platform_admin(user_uuid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM platform_admins
        WHERE user_id = user_uuid
    );
$$;

CREATE POLICY "Platform admins can view platform admins"
    ON platform_admins FOR SELECT
    USING (is_platform_admin());

CREATE POLICY "Platform admins can insert platform admins"
    ON platform_admins FOR INSERT
    WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update platform admins"
    ON platform_admins FOR UPDATE
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can delete platform admins"
    ON platform_admins FOR DELETE
    USING (is_platform_admin());
