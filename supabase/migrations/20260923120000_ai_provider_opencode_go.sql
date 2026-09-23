-- OpenCode Go joins the closed provider list.
--
-- WHY A MIGRATION IS NEEDED AT ALL. The provider list is closed in three
-- places, and this is the third: the code's type list, the settings dropdown,
-- and this CHECK constraint. The model id is already free text, so only the
-- provider value is widened here.
--
-- THE CONSTRAINT HAS NO NAME IN THE ORIGINAL, and this file guesses nothing:
-- `20260831120000_create_ai_provider_foundation.sql` declares it inline as
-- `provider_type text NOT NULL CHECK (provider_type IN (...))`, so Postgres
-- generated the name from the `<table>_<column>_check` convention --
-- `ai_provider_connections_provider_type_check`. It is dropped and re-added
-- under the SAME name so a future reader sees one constraint and not two.
--
-- DROP IF EXISTS, then ADD. Postgres offers no ALTER ... CHECK; widening a
-- named CHECK is a drop and a re-add. IF EXISTS makes a re-run a no-op rather
-- than an error, which is required: a rollout sequence applies every migration
-- once, and a second application must not fail on a constraint that is already
-- the shape this file wants.
--
-- THE FIVE VALUES TRACK `AI_PROVIDER_TYPES` IN
-- lib/domain/settings/aiProviderConnection.ts, and a source test pins the two
-- lists together so they cannot drift.

ALTER TABLE public.ai_provider_connections
    DROP CONSTRAINT IF EXISTS ai_provider_connections_provider_type_check;

ALTER TABLE public.ai_provider_connections
    ADD CONSTRAINT ai_provider_connections_provider_type_check
    CHECK (provider_type IN ('openai', 'anthropic', 'gemini', 'openrouter', 'opencode-go'));
