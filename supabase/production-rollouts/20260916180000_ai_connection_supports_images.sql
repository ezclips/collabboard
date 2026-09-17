-- PRODUCTION ROLLOUT -- let a user declare that their own model accepts images.
--
-- SOURCE: supabase/migrations/20260916180000_ai_connection_supports_images.sql
--
-- The statement block below is a byte-faithful copy of that migration's
-- BEGIN/COMMIT body. Read the source migration's header for the full reasoning;
-- the short version is:
--
--   * Board AI already routes to a user's BYOK model for TEXT. The gap is
--     images, and half of it is that a user has no way to SAY their model
--     accepts one. This column is that declaration, on the CONNECTION, because
--     the drawer's chooser leaves modelId null and the model therefore always
--     comes from the connection's own default_model;
--   * it is a DECLARATION, never an inference. Nothing may set it from a model
--     id: the provider contract calls a model id opaque and never guessed at;
--   * DEFAULT false is the whole safety posture. Every connection that already
--     exists stays text-only until its owner says otherwise, so this rollout
--     cannot turn on image delivery for a single connection anywhere.
--
-- THE FUNCTION SIGNATURE CHANGES, AND THE OLD ONE IS DROPPED. Connection
-- creation does not go through the repository; it goes through
-- create_ai_provider_connection_atomic, whose parameter list is fixed. Leaving
-- the 6-argument overload in place would leave a create resolvable to either,
-- and the one a 6-argument call resolves to is the one that silently discards
-- the declaration.
--
-- THIS ROLLOUT MUST BE PAIRED WITH THE APPLICATION CHANGE. The only caller of
-- that function is lib/infra/settings/aiProviderAtomicRepository.ts, which
-- sends p_supports_images from the same commit. Apply this WITHOUT that deploy
-- and every "Add provider" fails on an unknown function signature; deploy the
-- application WITHOUT this and every create fails the same way. They go
-- together, in either order, but not apart.
--
-- SAFE TO RE-RUN. The ADD COLUMN is IF NOT EXISTS, the function is CREATE OR
-- REPLACE, and the DROP is IF EXISTS.
--
-- VERIFY WITH:
--   20260916180000_ai_connection_supports_images_verify.sql
-- UNDO WITH (read its header first):
--   20260916180000_ai_connection_supports_images_rollback.sql
--
-- Run as one PostgreSQL statement batch.

BEGIN;

ALTER TABLE public.ai_provider_connections
    ADD COLUMN IF NOT EXISTS supports_images boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_provider_connections.supports_images IS
    'The OWNER''s declaration that this connection''s model accepts image input. '
    'Never inferred from a model id. Default false: a connection is text-only '
    'until its owner says otherwise.';

-- The new signature. p_supports_images has no DEFAULT: an explicit argument on
-- every call is what makes a caller that forgot it fail loudly here rather than
-- quietly store false.
CREATE OR REPLACE FUNCTION public.create_ai_provider_connection_atomic(
    p_user_id uuid,
    p_provider_type text,
    p_display_name text,
    p_key_hint text,
    p_default_model text,
    p_api_key_encrypted text,
    p_supports_images boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_connection_id uuid;
BEGIN
    -- Table CHECK constraints stay authoritative: provider_type, display_name
    -- bounds and the key_hint length limit are enforced by the schema, not
    -- re-implemented here.
    INSERT INTO public.ai_provider_connections (
        user_id, provider_type, display_name, key_hint, default_model, supports_images
    )
    VALUES (
        p_user_id, p_provider_type, p_display_name, p_key_hint, p_default_model,
        COALESCE(p_supports_images, false)
    )
    RETURNING id INTO v_connection_id;

    INSERT INTO public.ai_provider_credentials (connection_id, api_key_encrypted)
    VALUES (v_connection_id, p_api_key_encrypted);

    RETURN v_connection_id;
END;
$$;

-- Drop the old overload so a 6-argument call cannot resolve to a function that
-- discards the declaration. Dropped AFTER the replacement exists, so there is
-- no window in which neither is callable.
DROP FUNCTION IF EXISTS public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text
);

-- Execution lockdown, re-applied to the NEW signature. Postgres grants EXECUTE
-- on new functions to PUBLIC by default, so PUBLIC is revoked first;
-- anon/authenticated are revoked explicitly so a future blanket schema grant to
-- the PostgREST roles cannot quietly re-open this. Only service_role may call
-- it: there is no authenticated RPC surface here.
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text, boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text, boolean
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_provider_connection_atomic(
    uuid, text, text, text, text, text, boolean
) TO service_role;

COMMIT;
