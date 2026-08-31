-- AI providers / BYOK: pin the ownership trigger's search_path.
--
-- Supabase's security advisor flags `function_search_path_mutable` for
-- public.ai_role_preferences_enforce_connection_ownership(), created in
-- 20260831120000. The two Phase 2A atomic functions already ship with
-- `SET search_path = ''`; this brings the Phase 1A trigger to the same
-- standard rather than leaving one BYOK function inconsistent.
--
-- Exploitability was low: the function is SECURITY INVOKER and its only
-- table reference is already schema-qualified (public.ai_provider_connections),
-- so there is no unqualified name for a hostile search_path to capture.
-- This is defence in depth, not a fix for a known break.
--
-- ALTER FUNCTION deliberately, NOT CREATE OR REPLACE: this changes only the
-- function's configuration. The reviewed body, LANGUAGE plpgsql, SECURITY
-- INVOKER, its ownership check, its RAISE EXCEPTION and the trigger binding
-- on public.ai_role_preferences are all left exactly as deployed.

ALTER FUNCTION public.ai_role_preferences_enforce_connection_ownership()
SET search_path = '';
