-- AI providers / BYOK Phase 1A: secure credential foundation.
--
-- THREE tables, deliberately split so that secret material never lives in a
-- table an authenticated browser can read:
--
--   ai_provider_connections  SAFE metadata only. Owner-readable via RLS, so the
--                            Settings UI can list connections without ever
--                            touching secret material. No key, no ciphertext,
--                            no IV, no auth tag, no base URL.
--
--   ai_provider_credentials  Encrypted API keys. SERVER-ONLY: RLS is enabled
--                            with NO policies at all and privileges are revoked
--                            from anon/authenticated, so PostgREST cannot reach
--                            this table even for the owning user. Reads happen
--                            exclusively through server code holding the
--                            service role, which re-proves ownership itself.
--
--   ai_role_preferences      role -> connection/model mapping, owner-only.
--
-- "CollabBoard Default" is NOT represented as a row here. A missing preference,
-- or a preference whose connection_id is NULL, resolves to the environment
-- backed default provider, so no fake credential is ever stored.
--
-- Custom / OpenAI-compatible providers are deliberately absent: a user-supplied
-- base URL is an SSRF surface and is deferred to a later phase. There is no
-- base_url column anywhere in this foundation.

CREATE TABLE IF NOT EXISTS public.ai_provider_connections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_type text NOT NULL CHECK (provider_type IN ('openai', 'anthropic', 'gemini', 'openrouter')),
    display_name text NOT NULL,
    -- Masked suffix ONLY (last few characters). The CHECK below keeps this too
    -- narrow to ever carry a usable credential, whatever a caller intends.
    key_hint text NOT NULL,
    default_model text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT ai_provider_connections_display_name_check
        CHECK (length(btrim(display_name)) > 0 AND length(display_name) <= 120),
    CONSTRAINT ai_provider_connections_key_hint_check
        CHECK (length(key_hint) BETWEEN 1 AND 4),
    CONSTRAINT ai_provider_connections_default_model_check
        CHECK (default_model IS NULL OR (length(btrim(default_model)) > 0 AND length(default_model) <= 200)),
    CONSTRAINT ai_provider_connections_user_display_name_key UNIQUE (user_id, display_name)
);

CREATE INDEX IF NOT EXISTS ai_provider_connections_user_id_idx
    ON public.ai_provider_connections(user_id);

-- Secret material lives here and ONLY here. connection_id is the primary key,
-- so one connection has at most one credential, and ON DELETE CASCADE means
-- deleting a connection can never strand orphaned ciphertext.
CREATE TABLE IF NOT EXISTS public.ai_provider_credentials (
    connection_id uuid PRIMARY KEY REFERENCES public.ai_provider_connections(id) ON DELETE CASCADE,
    api_key_encrypted text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- role is text, NOT a Postgres enum: adding a future role (chat, research)
-- must be an application concern and an INSERT, never a schema migration.
CREATE TABLE IF NOT EXISTS public.ai_role_preferences (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL,
    -- NULL (or no row at all) means CollabBoard Default. ON DELETE SET NULL is
    -- what makes deleting a provider fall back to the default automatically.
    connection_id uuid REFERENCES public.ai_provider_connections(id) ON DELETE SET NULL,
    model_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT ai_role_preferences_role_check
        CHECK (length(btrim(role)) > 0 AND length(role) <= 64),
    CONSTRAINT ai_role_preferences_model_id_check
        CHECK (model_id IS NULL OR (length(btrim(model_id)) > 0 AND length(model_id) <= 200)),
    PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS ai_role_preferences_connection_id_idx
    ON public.ai_role_preferences(connection_id);

-- Cross-user reference guard.
--
-- RLS alone is not sufficient here: the credential path runs with the service
-- role, which bypasses RLS entirely. A trigger fires for EVERY writer -- the
-- service role included -- so a preference can never point at another user's
-- provider connection even if the caller knows its UUID.
CREATE OR REPLACE FUNCTION public.ai_role_preferences_enforce_connection_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.connection_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.ai_provider_connections c
        WHERE c.id = NEW.connection_id
          AND c.user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'ai_role_preferences.connection_id must reference a provider connection owned by the same user';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_role_preferences_connection_ownership ON public.ai_role_preferences;

CREATE TRIGGER ai_role_preferences_connection_ownership
    BEFORE INSERT OR UPDATE ON public.ai_role_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.ai_role_preferences_enforce_connection_ownership();

ALTER TABLE public.ai_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_role_preferences ENABLE ROW LEVEL SECURITY;

-- The secret table gets NO policies whatsoever, and its privileges are revoked
-- from both PostgREST roles. Enabled RLS with zero policies denies by default;
-- the REVOKE is the second, independent lock. Deliberately no view and no
-- SECURITY DEFINER function exposes api_key_encrypted either.
REVOKE ALL ON public.ai_provider_credentials FROM anon;
REVOKE ALL ON public.ai_provider_credentials FROM authenticated;

DROP POLICY IF EXISTS "Users can view own ai provider connections" ON public.ai_provider_connections;
DROP POLICY IF EXISTS "Users can insert own ai provider connections" ON public.ai_provider_connections;
DROP POLICY IF EXISTS "Users can update own ai provider connections" ON public.ai_provider_connections;
DROP POLICY IF EXISTS "Users can delete own ai provider connections" ON public.ai_provider_connections;

CREATE POLICY "Users can view own ai provider connections"
    ON public.ai_provider_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai provider connections"
    ON public.ai_provider_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai provider connections"
    ON public.ai_provider_connections FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai provider connections"
    ON public.ai_provider_connections FOR DELETE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own ai role preferences" ON public.ai_role_preferences;
DROP POLICY IF EXISTS "Users can insert own ai role preferences" ON public.ai_role_preferences;
DROP POLICY IF EXISTS "Users can update own ai role preferences" ON public.ai_role_preferences;
DROP POLICY IF EXISTS "Users can delete own ai role preferences" ON public.ai_role_preferences;

CREATE POLICY "Users can view own ai role preferences"
    ON public.ai_role_preferences FOR SELECT
    USING (auth.uid() = user_id);

-- The ownership EXISTS below is defence in depth beside the trigger: it stops a
-- direct PostgREST write before it ever reaches the trigger, and it reads
-- ai_provider_connections under that table's own RLS, so another user's row is
-- simply not visible. No recursion: a different table, never itself.
CREATE POLICY "Users can insert own ai role preferences"
    ON public.ai_role_preferences FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            connection_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.ai_provider_connections c
                WHERE c.id = connection_id
                  AND c.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update own ai role preferences"
    ON public.ai_role_preferences FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND (
            connection_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.ai_provider_connections c
                WHERE c.id = connection_id
                  AND c.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete own ai role preferences"
    ON public.ai_role_preferences FOR DELETE
    USING (auth.uid() = user_id);
