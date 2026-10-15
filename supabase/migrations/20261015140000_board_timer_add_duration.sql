-- PATCH-374 Addendum 1. `board_timer_add` must extend the timer's LENGTH too.
--
-- WHY. The timer's remaining time is clamped to `timer_duration_seconds` (a
-- skew estimate taken over a slow round trip must not show 184 s on a 180 s
-- timer). The applied `board_timer_add` (20261015130000) added seconds to
-- `timer_ends_at`/`timer_paused_remaining_seconds` but left the duration alone,
-- so adding a minute while RUNNING was then clamped straight back to the old
-- length. This replaces the function so the recorded length grows with it;
-- an idle board is still left exactly as it is.
--
-- Only the body changes: same signature, SECURITY INVOKER, reviewer check,
-- FOUND guard and grants. DO NOT APPLY from a coding session -- the owner runs
-- this in the Supabase SQL editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.board_timer_add(b uuid, seconds int)
RETURNS TABLE(server_now timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  t timestamptz := now();
BEGIN
  IF NOT public.can_review_board_posts(b) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF seconds IS NULL OR seconds < 10 OR seconds > 600 THEN
    RAISE EXCEPTION 'seconds must be between 10 and 600' USING ERRCODE = '22023';
  END IF;

  -- Adds to whichever clock is live: a running timer's end, or a paused
  -- timer's remaining seconds. An idle board stays idle. The recorded LENGTH
  -- grows with the same condition, so the clamp above never eats the addition.
  UPDATE public.boards
     SET timer_ends_at = CASE
           WHEN boards.timer_ends_at IS NOT NULL
             THEN boards.timer_ends_at + make_interval(secs => seconds)
           ELSE NULL
         END,
         timer_paused_remaining_seconds = CASE
           WHEN boards.timer_ends_at IS NULL AND boards.timer_paused_remaining_seconds IS NOT NULL
             THEN boards.timer_paused_remaining_seconds + seconds
           ELSE boards.timer_paused_remaining_seconds
         END,
         timer_duration_seconds = CASE
           WHEN boards.timer_ends_at IS NOT NULL
             OR boards.timer_paused_remaining_seconds IS NOT NULL
             THEN COALESCE(boards.timer_duration_seconds, 0) + seconds
           ELSE boards.timer_duration_seconds
         END
   WHERE boards.id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

REVOKE ALL ON FUNCTION public.board_timer_add(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_timer_add(uuid, int) TO authenticated;

-- Self-check: the function is there, and still callable by a signed-in user.
DO $$
BEGIN
  IF to_regprocedure('public.board_timer_add(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'PATCH-374: public.board_timer_add(uuid, int) is missing';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.board_timer_add(uuid, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PATCH-374: authenticated cannot execute public.board_timer_add(uuid, int)';
  END IF;
END $$;

COMMIT;
