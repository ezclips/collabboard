ALTER TABLE public.auth_rate_limit_events
    DROP CONSTRAINT IF EXISTS auth_rate_limit_events_action_check;

ALTER TABLE public.auth_rate_limit_events
    ADD CONSTRAINT auth_rate_limit_events_action_check
    CHECK (action IN ('login', 'password_reset', 'signup'));
