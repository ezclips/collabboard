-- Removing OpenCode Go from the closed provider list.
--
-- WHY. OpenCode Go refused every live request on 2026-09-23 with HTTP 400
-- `MissingSessionID` -- "Request is missing x-opencode-session". Its own docs
-- reserve the endpoint for coding agents and state that traffic is monitored
-- for abuse. CollabBoard's AI features are not coding-agent traffic, and making
-- them look like it would risk the owner's subscription -- the same one that
-- runs their coding. The owner decided to remove it, so the value goes.
--
-- THE MIGRATION THAT ADMITTED IT STAYS. `20260923120000_ai_provider_opencode_go.sql`
-- has been APPLIED, and an applied migration is history: it is not edited and
-- not deleted. This file narrows the CHECK back to four values.
--
-- NO USER DATA IS DELETED HERE. The owner's own connection was removed through
-- the application's DELETE endpoint before this file was written, and no role
-- referenced it. If ANY row still carries the value, this migration REFUSES to
-- run and says so: a row left behind is the operator's to remove knowingly, not
-- something a migration should silently drop. That is why the guard below
-- raises rather than deleting.
--
-- A SOURCE TEST pins the LATEST provider_type CHECK against AI_PROVIDER_TYPES,
-- so this file and the code cannot drift apart.
--
-- NOT APPLIED HERE. Writing the file is the job; applying is the operator's.

-- Guard FIRST, so nothing is changed if a row would be stranded by the new
-- CHECK. A single reading that finds one opencode-go row aborts the whole
-- migration before the constraint is touched.
DO $remove_opencode_go$
DECLARE
    stranded integer;
BEGIN
    SELECT count(*) INTO stranded
      FROM public.ai_provider_connections
     WHERE provider_type = 'opencode-go';

    IF stranded > 0 THEN
        RAISE EXCEPTION
            'Refusing to narrow the provider CHECK: % ai_provider_connections row(s) still have provider_type = ''opencode-go''. Remove those connection(s) (they cannot execute any more) and re-run this migration.',
            stranded;
    END IF;
END
$remove_opencode_go$;

-- Widen-or-narrow a named CHECK is a drop and a re-add. IF EXISTS makes a
-- re-run a no-op rather than an error, which a rollout sequence requires.
ALTER TABLE public.ai_provider_connections
    DROP CONSTRAINT IF EXISTS ai_provider_connections_provider_type_check;

ALTER TABLE public.ai_provider_connections
    ADD CONSTRAINT ai_provider_connections_provider_type_check
    CHECK (provider_type IN ('openai', 'anthropic', 'gemini', 'openrouter'));
