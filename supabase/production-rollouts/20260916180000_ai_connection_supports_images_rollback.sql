-- ROLLBACK for 20260916180000_ai_connection_supports_images.sql.
--
-- ------------------------------------------------------------------------
-- RUNNING THIS DESTROYS EVERY USER'S IMAGE DECLARATION, PERMANENTLY.
-- ------------------------------------------------------------------------
-- `DROP COLUMN` does not preserve the values. Every user who ticked "this model
-- accepts images" loses that setting with no record of what it was, and each
-- one must find the checkbox and tick it again after a re-apply. There is no
-- backup taken here and none implied: if the column's contents matter, copy
-- them out BEFORE running this --
--
--   CREATE TABLE ai_supports_images_backup_20260916180000 AS
--     SELECT id, user_id, supports_images
--       FROM public.ai_provider_connections
--      WHERE supports_images;
--
-- ------------------------------------------------------------------------
-- WHAT THIS RESTORES, AND WHAT IT DOES NOT.
-- ------------------------------------------------------------------------
-- It restores the 6-argument create function byte-for-byte as
-- 20260831140000_add_ai_provider_atomic_functions.sql defined it, with the same
-- execution lockdown, and drops the 7-argument version. After this, creating a
-- connection works exactly as it did before the rollout.
--
-- It does NOT roll back the application. The deployed
-- lib/infra/settings/aiProviderAtomicRepository.ts sends p_supports_images on
-- every create, so running this AGAINST THE NEW APPLICATION makes every "Add
-- provider" fail on an unknown function signature. Roll the application back
-- first, or together with this -- never this alone while the new code is live.
--
-- Board AI is the other half. With the column gone, no BYOK connection can
-- declare image support, so every BYOK image turn refuses again. That refusal
-- is honest -- it is what the code did before this unit -- but it is a
-- user-visible regression, not a no-op.
--
-- The retired-model change (deepseek-chat -> deepseek-flash) is NOT rolled back
-- by this file and must not be: it is application code, and the id it replaced
-- was withdrawn by DeepSeek on 2026-07-24. Reverting it would point the
-- CollabBoard default at a model that no longer exists.

BEGIN;

-- Restore the original signature FIRST, so there is no window in which no
-- create function exists at all.
CREATE OR REPLACE FUNCTION public.create_ai_provider_connection_atomic(
    p_user_id uuid,
    p_provider_type text,
    p_display_name text,
    p_key_hint text,
    p_default_model text,
    p_api_key_encrypted text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_connection_id uuid;
BEGIN
    INSERT INTO public.ai_provider_connections (
        user_id, provider_type, display_name, key_hint, default_model
    )
    VALUES (
        p_user_id, p_provider_type, p_display_name, p_key_hint, p_default_model
    )
    RETURNING id INTO v_connection_id;

    INSERT INTO public.ai_provider_credentials (connection_id, api_key_encrypted)
    VALUES (v_connection_id, p_api_key_encrypted);

    RETURN v_connection_id;
END;
$$;

-- The same lockdown the original migration applied. A re-created function is
-- granted to PUBLIC by default, so this is not optional.
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text
) TO service_role;

-- Now the 7-argument version, which nothing may resolve to any more.
DROP FUNCTION IF EXISTS public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text, boolean
);

-- THE DESTRUCTIVE STATEMENT. Read the header before running.
ALTER TABLE public.ai_provider_connections
    DROP COLUMN IF EXISTS supports_images;

COMMIT;
