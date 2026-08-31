-- AI providers / BYOK Phase 2A: atomic cross-table writes.
--
-- Phase 1A deliberately shipped `insertConnectionMetadata` and `putCredential`
-- as two separate primitives, because supabase-js cannot span two tables in a
-- transaction and compensating for a partial write in application code is
-- worse than not claiming atomicity. These functions are that deferred
-- decision, resolved where transactions actually exist: one function call is
-- one transaction, so a connection can never be created without its credential
-- and a key replacement can never update the hint without the secret.
--
-- SECURITY INVOKER, deliberately. These are called exclusively by server code
-- holding the service role, which already bypasses RLS -- SECURITY DEFINER
-- would add privilege escalation for no benefit and would make an accidental
-- future EXECUTE grant catastrophic rather than merely wrong.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so both
-- functions REVOKE that and every PostgREST role explicitly. Only service_role
-- may call them; there is no authenticated RPC surface here.
--
-- `search_path = ''` with fully-qualified names throughout: nothing resolves
-- through a caller-controlled search path.
--
-- Neither function ever receives a plaintext API key. Encryption happens in
-- lib/server/ai/credentialCipher.ts before the call, and `p_api_key_encrypted`
-- is ciphertext by contract.

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
    -- Table CHECK constraints stay authoritative: provider_type, display_name
    -- bounds and the key_hint length limit are enforced by the schema, not
    -- re-implemented here.
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

CREATE OR REPLACE FUNCTION public.replace_ai_provider_credential_atomic(
    p_user_id uuid,
    p_connection_id uuid,
    p_key_hint text,
    p_api_key_encrypted text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- Ownership is the WHERE clause, so a connection belonging to someone else
    -- simply does not match. The caller gets `false` either way: "not yours"
    -- and "does not exist" are deliberately indistinguishable.
    --
    -- verified_at is cleared here because the credential that was verified is
    -- being replaced -- a new key is unverified until Test Connection says
    -- otherwise.
    UPDATE public.ai_provider_connections
       SET key_hint = p_key_hint,
           verified_at = NULL,
           updated_at = timezone('utc'::text, now())
     WHERE id = p_connection_id
       AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Upsert rather than update: a connection with no credential row is not
    -- reachable through the create function above, but repairing that state is
    -- better than failing on it.
    INSERT INTO public.ai_provider_credentials (connection_id, api_key_encrypted)
    VALUES (p_connection_id, p_api_key_encrypted)
    ON CONFLICT (connection_id) DO UPDATE
       SET api_key_encrypted = EXCLUDED.api_key_encrypted,
           updated_at = timezone('utc'::text, now());

    RETURN true;
END;
$$;

-- Execution lockdown. PUBLIC is revoked first because that is the default
-- grant; anon/authenticated are revoked explicitly so that a future blanket
-- schema grant to the PostgREST roles cannot quietly re-open these.
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

REVOKE EXECUTE ON FUNCTION public.replace_ai_provider_credential_atomic(
    uuid, uuid, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_ai_provider_credential_atomic(
    uuid, uuid, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_ai_provider_credential_atomic(
    uuid, uuid, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_ai_provider_credential_atomic(
    uuid, uuid, text, text
) TO service_role;
