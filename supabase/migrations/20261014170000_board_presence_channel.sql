-- PATCH-363. The board presence channel is PRIVATE and access-checked.
--
-- WHY. Supabase Realtime PUBLIC channels can be joined by anyone who knows the
-- channel name, so a public `board:<id>` would leak who is on a board to a
-- stranger. A PRIVATE channel is authorised by RLS on `realtime.messages`: the
-- policies below decide who may receive (SELECT) and send (INSERT) on it.
--
-- GUESTS ARE INCLUDED. A guest joined by a share link has a `board_collaborators`
-- row, so `get_board_permission` returns a level for them and they pass. The
-- Kanban fallback covers a member who is in `kanban_board_members` but has no
-- collaborator row yet.
--
-- The existing public `postgres_changes` channels are UNTOUCHED: this adds
-- policies for presence/broadcast on private topics only, and `postgres_changes`
-- is a different extension.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.get_board_permission` and `public.kanban_board_members`.

BEGIN;

-- 1. The authorizer. It accepts ONLY a `board:<uuid>` topic -- anything else is
--    false, and the 36-character body is cast to uuid only inside an exception
--    guard, so malformed text can never raise.
CREATE OR REPLACE FUNCTION public.can_join_board_channel(topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  board_id uuid;
BEGIN
  IF topic IS NULL OR topic !~ '^board:[0-9a-f-]{36}$' THEN
    RETURN false;
  END IF;

  BEGIN
    board_id := substring(topic from 7)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  -- Owner, workspace member, or board collaborator.
  IF public.get_board_permission(board_id, auth.uid()) IS NOT NULL THEN
    RETURN true;
  END IF;

  -- Kanban member (a row created by the redeem route or by the board owner).
  IF EXISTS (
    SELECT 1 FROM public.kanban_board_members
     WHERE canvas_id = board_id AND user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- Not an anonymous oracle: only a signed-in user may ask whether they can join.
REVOKE ALL ON FUNCTION public.can_join_board_channel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_join_board_channel(text) TO authenticated;

-- 2. Realtime Authorization policies on realtime.messages. `(select realtime.topic())`
--    is wrapped in a sub-select so Postgres evaluates it once per statement.
DROP POLICY IF EXISTS board_channel_receive ON realtime.messages;
CREATE POLICY board_channel_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('presence', 'broadcast')
    AND public.can_join_board_channel((select realtime.topic()))
  );

DROP POLICY IF EXISTS board_channel_send ON realtime.messages;
CREATE POLICY board_channel_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('presence', 'broadcast')
    AND public.can_join_board_channel((select realtime.topic()))
  );

COMMIT;
