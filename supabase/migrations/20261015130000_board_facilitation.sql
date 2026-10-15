-- PATCH-374. Facilitator kit 1: a shared board timer and "Bring everyone here".
--
-- WHY. After the guest controls (365-368) the owner's plan is a facilitator kit:
-- timer + bring-everyone-to-me, then dot-voting with hidden results, then
-- private brainstorm + reveal. These two come first because the next two build
-- on the same idea -- a host controls a session state everyone sees.
--
-- WHERE THE STATE LIVES. On the `boards` row, not in a broadcast: a late joiner
-- then sees a running timer, nothing is lost on reconnect, and `boards` is
-- already in the `supabase_realtime` publication (PATCH-366). A summon is a
-- timestamped ROW CHANGE, not a broadcast, so a member cannot spoof it (the
-- private `board:` channel lets any member send broadcasts).
--
-- WHO MAY DRIVE IT. `public.can_review_board_posts(b)` -- the board owner or a
-- board admin (PATCH-367). Every RPC raises `not allowed` for anyone else, and
-- a guard trigger reverts the six columns on any other UPDATE, so the RPC is
-- not the only thing standing between a member and the session state.
--
-- TIME COMES FROM THE SERVER. `now()` inside these RPCs, never the host's
-- clock; each returns `server_now` so a client can measure its own skew
-- (`public.board_clock()` does the same for a viewer that never drives).
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.can_review_board_posts(uuid)` (20261014200000).

BEGIN;

-- 1. The six columns. All nullable; a null timer is an idle timer.
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS timer_ends_at timestamptz;
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS timer_duration_seconds int;
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS timer_paused_remaining_seconds int;
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS summoned_at timestamptz;
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS summoned_by uuid;
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS summon_target jsonb;

COMMENT ON COLUMN public.boards.timer_ends_at IS
  'PATCH-374. When the running countdown ends (server clock). Null while idle or paused.';
COMMENT ON COLUMN public.boards.timer_duration_seconds IS
  'PATCH-374. The length the countdown was started with.';
COMMENT ON COLUMN public.boards.timer_paused_remaining_seconds IS
  'PATCH-374. Seconds left at the moment of pausing. Non-null means paused.';
COMMENT ON COLUMN public.boards.summoned_at IS
  'PATCH-374. When the host last called everyone to a view.';
COMMENT ON COLUMN public.boards.summoned_by IS
  'PATCH-374. Who called everyone; a client ignores its own summons.';
COMMENT ON COLUMN public.boards.summon_target IS
  'PATCH-374. Where everyone was called to: {"kind":"freeform","x":num,"y":num,"zoom":num} or {"kind":"post","postId":uuid}.';

-- 2. The guard. Anyone may UPDATE a board row (the workspace policy), so the
-- trigger is what makes the six columns reviewer-only: a non-reviewer's change
-- is silently reverted to the stored value. Service role (no auth.uid()) passes.
CREATE OR REPLACE FUNCTION public.guard_board_facilitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role: unchanged
  END IF;

  IF (NEW.timer_ends_at IS DISTINCT FROM OLD.timer_ends_at
      OR NEW.timer_duration_seconds IS DISTINCT FROM OLD.timer_duration_seconds
      OR NEW.timer_paused_remaining_seconds IS DISTINCT FROM OLD.timer_paused_remaining_seconds
      OR NEW.summoned_at IS DISTINCT FROM OLD.summoned_at
      OR NEW.summoned_by IS DISTINCT FROM OLD.summoned_by
      OR NEW.summon_target IS DISTINCT FROM OLD.summon_target)
     AND NOT public.can_review_board_posts(NEW.id) THEN
    NEW.timer_ends_at := OLD.timer_ends_at;
    NEW.timer_duration_seconds := OLD.timer_duration_seconds;
    NEW.timer_paused_remaining_seconds := OLD.timer_paused_remaining_seconds;
    NEW.summoned_at := OLD.summoned_at;
    NEW.summoned_by := OLD.summoned_by;
    NEW.summon_target := OLD.summon_target;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only: nobody needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.guard_board_facilitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS boards_guard_facilitation ON public.boards;
CREATE TRIGGER boards_guard_facilitation
  BEFORE UPDATE ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_board_facilitation();

-- 3. The timer RPCs. Each is a reviewer-only write and answers with the server's
-- clock. `FOUND` after an unconditional UPDATE is how a silent no-op (RLS
-- refused the row, e.g. a board admin who is not a workspace editor) becomes a
-- visible error instead of a timer that never starts.
CREATE OR REPLACE FUNCTION public.board_timer_start(b uuid, seconds int)
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
  IF seconds IS NULL OR seconds < 10 OR seconds > 7200 THEN
    RAISE EXCEPTION 'seconds must be between 10 and 7200' USING ERRCODE = '22023';
  END IF;

  UPDATE public.boards
     SET timer_ends_at = t + make_interval(secs => seconds),
         timer_duration_seconds = seconds,
         timer_paused_remaining_seconds = NULL
   WHERE boards.id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.board_timer_pause(b uuid)
RETURNS TABLE(server_now timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  t timestamptz := now();
  remaining int;
BEGIN
  IF NOT public.can_review_board_posts(b) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- Running only. A timer that is not running is left exactly as it is.
  SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (boards.timer_ends_at - t)))::int)
    INTO remaining
    FROM public.boards
   WHERE boards.id = b AND boards.timer_ends_at IS NOT NULL;

  IF remaining IS NOT NULL THEN
    UPDATE public.boards
       SET timer_paused_remaining_seconds = remaining,
           timer_ends_at = NULL
     WHERE boards.id = b;
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.board_timer_resume(b uuid)
RETURNS TABLE(server_now timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  t timestamptz := now();
  remaining int;
BEGIN
  IF NOT public.can_review_board_posts(b) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- Paused only.
  SELECT boards.timer_paused_remaining_seconds
    INTO remaining
    FROM public.boards
   WHERE boards.id = b AND boards.timer_paused_remaining_seconds IS NOT NULL;

  IF remaining IS NOT NULL THEN
    UPDATE public.boards
       SET timer_ends_at = t + make_interval(secs => remaining),
           timer_paused_remaining_seconds = NULL
     WHERE boards.id = b;
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

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
  -- timer's remaining seconds. An idle board stays idle.
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
         END
   WHERE boards.id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.board_timer_stop(b uuid)
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

  UPDATE public.boards
     SET timer_ends_at = NULL,
         timer_duration_seconds = NULL,
         timer_paused_remaining_seconds = NULL
   WHERE boards.id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

-- 4. "Bring everyone here". The target is validated HERE, not only in the
-- client: a freeform view (x, y and a zoom in 0.1..4) or a post that must
-- already be on this board.
CREATE OR REPLACE FUNCTION public.board_summon(b uuid, target jsonb)
RETURNS TABLE(server_now timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  t timestamptz := now();
  kind text;
  post_id text;
BEGIN
  IF NOT public.can_review_board_posts(b) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF target IS NULL OR jsonb_typeof(target) <> 'object' THEN
    RAISE EXCEPTION 'target must be an object' USING ERRCODE = '22023';
  END IF;

  kind := target ->> 'kind';

  IF kind = 'freeform' THEN
    IF jsonb_typeof(target -> 'x') <> 'number'
       OR jsonb_typeof(target -> 'y') <> 'number'
       OR jsonb_typeof(target -> 'zoom') <> 'number' THEN
      RAISE EXCEPTION 'a freeform target needs numeric x, y and zoom' USING ERRCODE = '22023';
    END IF;
    IF (target ->> 'zoom')::numeric < 0.1 OR (target ->> 'zoom')::numeric > 4 THEN
      RAISE EXCEPTION 'zoom must be between 0.1 and 4' USING ERRCODE = '22023';
    END IF;
  ELSIF kind = 'post' THEN
    post_id := target ->> 'postId';
    IF post_id IS NULL OR post_id !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'a post target needs a postId uuid' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.padlets
       WHERE padlets.id = post_id::uuid
         AND coalesce(padlets.board_id, padlets.canvas_id) = b
    ) THEN
      RAISE EXCEPTION 'that post is not on this board' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown target kind' USING ERRCODE = '22023';
  END IF;

  UPDATE public.boards
     SET summoned_at = t,
         summoned_by = auth.uid(),
         summon_target = target
   WHERE boards.id = b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT t;
END;
$function$;

-- 5. The clock. Any authenticated viewer may read it, so a tab that never
-- drives the timer can still measure its own skew.
CREATE OR REPLACE FUNCTION public.board_clock()
RETURNS TABLE(server_now timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT now();
$function$;

-- 6. Grants: the write RPCs are for signed-in users only (and each raises for a
-- non-reviewer); `board_clock` for any signed-in user.
REVOKE ALL ON FUNCTION public.board_timer_start(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_timer_pause(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_timer_resume(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_timer_add(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_timer_stop(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_summon(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.board_clock() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.board_timer_start(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_timer_pause(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_timer_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_timer_add(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_timer_stop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_summon(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_clock() TO authenticated;

-- 7. Self-check: six columns, the guard function + trigger, the seven RPCs.
DO $$
DECLARE
  missing text;
  rpc text;
BEGIN
  SELECT string_agg(want, ', ') INTO missing
    FROM unnest(ARRAY[
      'timer_ends_at', 'timer_duration_seconds', 'timer_paused_remaining_seconds',
      'summoned_at', 'summoned_by', 'summon_target'
    ]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'boards' AND column_name = want
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PATCH-374: boards is missing column(s): %', missing;
  END IF;

  IF to_regprocedure('public.guard_board_facilitation()') IS NULL THEN
    RAISE EXCEPTION 'PATCH-374: public.guard_board_facilitation() is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'boards_guard_facilitation') THEN
    RAISE EXCEPTION 'PATCH-374: boards_guard_facilitation trigger is missing';
  END IF;

  FOREACH rpc IN ARRAY ARRAY[
    'public.board_timer_start(uuid,integer)',
    'public.board_timer_pause(uuid)',
    'public.board_timer_resume(uuid)',
    'public.board_timer_add(uuid,integer)',
    'public.board_timer_stop(uuid)',
    'public.board_summon(uuid,jsonb)',
    'public.board_clock()'
  ]
  LOOP
    IF to_regprocedure(rpc) IS NULL THEN
      RAISE EXCEPTION 'PATCH-374: % is missing', rpc;
    END IF;
  END LOOP;
END $$;

COMMIT;
