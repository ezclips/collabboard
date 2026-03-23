CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    display_name text,
    username text,
    about text,
    class_info text,
    language text DEFAULT 'en-US',
    account_type text DEFAULT 'Individual',
    avatar_url text,
    beta_features boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS username text,
    ADD COLUMN IF NOT EXISTS about text,
    ADD COLUMN IF NOT EXISTS class_info text,
    ADD COLUMN IF NOT EXISTS language text DEFAULT 'en-US',
    ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'Individual',
    ADD COLUMN IF NOT EXISTS avatar_url text,
    ADD COLUMN IF NOT EXISTS beta_features boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles(username);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
    ON profiles FOR DELETE
    USING (auth.uid() = id);
