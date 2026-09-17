-- AI_CONNECTION_SUPPORTS_IMAGES_1: let a user DECLARE that their own model
-- accepts image input.
--
-- ------------------------------------------------------------------------
-- WHY A COLUMN, AND WHY ON THE CONNECTION.
-- ------------------------------------------------------------------------
-- Board AI already routes to a user's BYOK model for TEXT: the drawer's model
-- chooser writes the same per-user AI_ROLE_CHAT preference Settings owns, and
-- the chat route resolves it per request. The chooser deliberately leaves
-- modelId NULL, so the model always comes from the connection's own
-- default_model -- which is why the capability belongs to the CONNECTION row
-- and not to a role preference or a model-id list.
--
-- ------------------------------------------------------------------------
-- THIS IS A DECLARATION, NEVER AN INFERENCE.
-- ------------------------------------------------------------------------
-- The provider execution contract calls `model` an "opaque provider model id,
-- never inspected or guessed at", and that rule is what makes BYOK safe: a user
-- may type any string their provider accepts and this server does not pretend
-- to know what it means. Deriving vision support from a name or a prefix would
-- break that rule exactly where being wrong is expensive -- guessing YES sends
-- private PDF imagery to a model that may reject it or log it as an
-- unrecognised part, and guessing NO silently drops an attachment the user
-- deliberately made.
--
-- So this column records what the OWNER said about THEIR model. Nothing in the
-- codebase may set it from a model id.
--
-- ------------------------------------------------------------------------
-- DEFAULT false IS THE WHOLE SAFETY POSTURE.
-- ------------------------------------------------------------------------
-- Every connection that already exists is text-only until its owner says
-- otherwise. NOT NULL DEFAULT false backfills existing rows to false, so this
-- migration cannot turn on image delivery for a single connection anywhere --
-- it only creates the ability to turn it on. A user whose declaration is wrong
-- gets a failed image turn, which is the honest outcome; the alternative, a
-- text-only answer to a question about a picture, is the silent degradation the
-- adapter guards exist to prevent.
--
-- ------------------------------------------------------------------------
-- WHY THE ATOMIC CREATE FUNCTION CHANGES TOO.
-- ------------------------------------------------------------------------
-- A column the UI can write but the create path drops is precisely the defect
-- lib/infra/settings/aiProviderCredentialRepository.ts exists to prevent, and
-- connection creation does NOT go through that repository: it goes through
-- create_ai_provider_connection_atomic, whose parameter list is fixed. So the
-- function gains p_supports_images.
--
-- The previous 6-argument overload is DROPPED rather than left in place.
-- Keeping both would leave a create resolvable to either, and the one it would
-- resolve to on a 6-argument call is the one that silently discards the flag --
-- a connection created "with images" that is stored without them. There is no
-- caller of the old signature after this migration: the only caller is
-- lib/infra/settings/aiProviderAtomicRepository.ts, which ships in the same
-- commit.

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
