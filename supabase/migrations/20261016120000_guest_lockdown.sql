-- PATCH-379. Guest lockdown: own posts only, no section edits, a post rate limit.
--
-- WHY. PATCH-358's guest write guard deliberately put `padlets`, `board_sections`
-- and `canvas_lines` on the WRITE ALLOW-LIST, because a guest with an edit link
-- must be able to post. But the permissive policies on those tables only ask for
-- editor rights -- so a guest holding an edit link can UPDATE or DELETE ANY post
-- and ANY section on the board. That is the gap this closes. The app-side
-- guards are user experience only; Postgres is where the JWT is verified, so
-- this is the real guard.
--
-- AUTHORSHIP IS `metadata.createdBy`, stamped by PATCH-364's
-- `stamp_padlet_creator` (20261014180000): the client's value is stripped and
-- `auth.uid()::text` is written instead, so a guest cannot forge it.
--
-- WHAT A GUEST MAY STILL DO. Create posts. Comment and react -- on anyone's post.
-- Draw lines. Read everything the board allows. Everything else on someone
-- else's post is refused.
--
-- SERVICE ROLE AND NON-GUESTS PASS UNCHANGED: every trigger returns immediately
-- when `auth.uid()` IS NULL (the service role, i.e. the AI routes) or when
-- `is_guest()` is false.
--
-- KANBAN IS OUT OF SCOPE: `kanban_cards` and friends keep their current guest
-- access. They are a separate island with their own authority model, and they
-- get their own patch.
--
-- TRIGGER ORDER, deliberately. Postgres fires BEFORE triggers alphabetically:
-- `padlets_guard_approval` (PATCH-367) < `padlets_guard_guest_edits` (here) <
-- `padlets_stamp_creator` (PATCH-364). The approval guard has therefore already
-- forced `pendingApproval` back to its stored value before this one compares the
-- two rows, which is why a guest's attempt to flip it is refused rather than
-- mistaken for a legitimate comment edit. `createdBy`/`createdByGuest` are
-- stripped from BOTH sides before comparing, so the stamp trigger running AFTER
-- this one cannot make a legitimate edit look like a metadata change.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.is_guest()` (20261014120000) and
-- `public.stamp_padlet_creator()` (20261014180000).

BEGIN;

-- 1. The entry-level helpers. `comments` and `detachedComments` entries carry
-- their author in `userId`; a `reactions` entry is a BARE EMOJI with no author
-- at all (see the report), so that key can only be append-only.

-- A comment/detachedComment entry that is NOT mine must still be present,
-- byte-identical, somewhere in the new array. Mine may be added, edited or
-- removed. Order is not part of the rule here -- an entry is identified by its
-- whole value, not by its position.
--
-- AND A NEW ONE MUST BE MINE. Any entry in NEW that was not in OLD is either an
-- addition or an edit, and either way its `userId` must be this guest's: nobody
-- may write a comment that claims to be somebody else's.
CREATE OR REPLACE FUNCTION public.guest_comment_entries_ok(old_entries jsonb, new_entries jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH o AS (
    SELECT CASE WHEN jsonb_typeof(old_entries) = 'array' THEN old_entries ELSE '[]'::jsonb END AS arr
  ), n AS (
    SELECT CASE WHEN jsonb_typeof(new_entries) = 'array' THEN new_entries ELSE '[]'::jsonb END AS arr
  )
  SELECT NOT EXISTS (
    -- 1. An entry that is not mine, and is gone or changed, is a refusal.
    SELECT 1
      FROM jsonb_array_elements(o.arr) AS o_item(value)
     WHERE coalesce(o_item.value->>'userId', '') <> coalesce(auth.uid()::text, '')
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(n.arr) AS n_item(value) WHERE n_item.value = o_item.value
       )
  )
  AND NOT EXISTS (
    -- 2. An entry that is new (added OR edited) must name THIS guest as author.
    SELECT 1
      FROM jsonb_array_elements(n.arr) AS n_item(value)
     WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(o.arr) AS o_item(value) WHERE o_item.value = n_item.value
       )
       AND coalesce(n_item.value->>'userId', '') <> coalesce(auth.uid()::text, '')
  )
  FROM o, n;
$function$;

-- A reaction has no author to check, so the OLD array must be an unchanged
-- PREFIX of the new one: same entries, same order, nothing removed. A guest may
-- therefore ADD a reaction and never take one away -- and no more than ONE per
-- update, so a single statement cannot fill the row with them.
CREATE OR REPLACE FUNCTION public.guest_reaction_entries_ok(old_entries jsonb, new_entries jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH o AS (
    SELECT CASE WHEN jsonb_typeof(old_entries) = 'array' THEN old_entries ELSE '[]'::jsonb END AS arr
  ), n AS (
    SELECT CASE WHEN jsonb_typeof(new_entries) = 'array' THEN new_entries ELSE '[]'::jsonb END AS arr
  )
  SELECT jsonb_array_length(n.arr) - jsonb_array_length(o.arr) BETWEEN 0 AND 1
     AND coalesce((
       SELECT bool_and(o_item.value = n_item.value)
         FROM jsonb_array_elements(o.arr) WITH ORDINALITY AS o_item(value, ord)
         JOIN jsonb_array_elements(n.arr) WITH ORDINALITY AS n_item(value, ord)
           ON n_item.ord = o_item.ord
     ), true)
    FROM o, n;
$function$;

REVOKE EXECUTE ON FUNCTION public.guest_comment_entries_ok(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guest_reaction_entries_ok(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- THE CHILD LIST. A guest posts INTO a card by changing that CARD's
-- `metadata.childPadletIds` -- a post they did not create -- so without this rule
-- the edit guard BELOW would refuse every "add my post to this card", which is
-- the whole point of a Wall/Columns board. Three rules, and nothing else:
--
--   1. An id REMOVED must name a post THIS GUEST created, OR name NO post at
--      all. Taking a dangling id out of the list is harmless and has to be
--      allowed: `handleDeleteChildFromContainer` writes the CONTAINER first and
--      deletes the child second, so this path never has a missing post -- but a
--      child deleted by the ordinary delete path first, or one deleted by
--      someone else, leaves an id here that no longer resolves.
--   2. An id ADDED must name a post this guest created, OR name no post at all
--      yet. The second half is a safety net: both client paths leave the child
--      EXISTING before the container is updated (`attachPostToContainer` updates
--      the container first, then the post -- but the post is an existing padlet;
--      `createRealPostFromDraft` inserts the post first, then the container), so
--      neither order actually needs it.
--   3. The ids present in BOTH keep their relative order -- a guest may not
--      reorder other people's posts inside a card.
--
-- The card itself changes in NO OTHER WAY when a post joins or leaves it: the
-- three client paths (`attachPostToContainer`, `createRealPostFromDraft`,
-- `handleDetachChildFromFreeformContainer`) write `childPadletIds` and nothing
-- else on the container -- no counts, no cover.
CREATE OR REPLACE FUNCTION public.guest_child_ids_ok(old_ids jsonb, new_ids jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH o AS (
    SELECT CASE WHEN jsonb_typeof(old_ids) = 'array' THEN old_ids ELSE '[]'::jsonb END AS arr
  ), n AS (
    SELECT CASE WHEN jsonb_typeof(new_ids) = 'array' THEN new_ids ELSE '[]'::jsonb END AS arr
  ), removed AS (
    -- `o` and `n` MUST be in this FROM: a CTE cannot see a sibling CTE's
    -- columns, so `o.arr` alone is "missing FROM-clause entry for table o".
    SELECT value AS id FROM o, jsonb_array_elements_text(o.arr) AS value
    EXCEPT SELECT value FROM n, jsonb_array_elements_text(n.arr) AS value
  ), added AS (
    SELECT value AS id FROM n, jsonb_array_elements_text(n.arr) AS value
    EXCEPT SELECT value FROM o, jsonb_array_elements_text(o.arr) AS value
  )
  SELECT
    -- 1. A removed id is refused ONLY when a post with that id exists and is not
    --    this guest's. A dangling id may always be dropped.
    NOT EXISTS (
      SELECT 1 FROM removed
       WHERE EXISTS (
         SELECT 1 FROM public.padlets p
          WHERE p.id::text = removed.id
            AND p.metadata->>'createdBy' IS DISTINCT FROM coalesce(auth.uid()::text, '')
       )
    )
    -- 2. No added id names a post that is not this guest's.
    AND NOT EXISTS (
      SELECT 1 FROM added
       WHERE EXISTS (
         SELECT 1 FROM public.padlets p
          WHERE p.id::text = added.id
            AND p.metadata->>'createdBy' IS DISTINCT FROM coalesce(auth.uid()::text, '')
       )
    )
    -- 3. The ids in both, in array order, are the same sequence.
    AND coalesce((
      SELECT bool_and(a.id = b.id)
        FROM (
          SELECT value AS id, row_number() OVER (ORDER BY ord) AS k
            FROM jsonb_array_elements_text(o.arr) WITH ORDINALITY AS t(value, ord)
           WHERE value IN (SELECT value FROM jsonb_array_elements_text(n.arr) AS x(value))
        ) a
        JOIN (
          SELECT value AS id, row_number() OVER (ORDER BY ord) AS k
            FROM jsonb_array_elements_text(n.arr) WITH ORDINALITY AS t(value, ord)
           WHERE value IN (SELECT value FROM jsonb_array_elements_text(o.arr) AS x(value))
        ) b ON b.k = a.k
    ), true)
    FROM o, n;
$function$;

REVOKE EXECUTE ON FUNCTION public.guest_child_ids_ok(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- 2. padlets BEFORE UPDATE. A guest may change their OWN post freely; anyone
-- else's post may only move in the interaction keys, and only in the guest's own
-- entries there.
CREATE OR REPLACE FUNCTION public.guard_guest_padlet_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  board_comments_enabled boolean;
BEGIN
  -- Service role (no auth.uid()) and every signed-in non-guest pass unchanged.
  IF auth.uid() IS NULL OR NOT public.is_guest() THEN
    RETURN NEW;
  END IF;

  -- Their own post: an ordinary edit. (The rate limit guards INSERT, not this.)
  IF OLD.metadata->>'createdBy' = auth.uid()::text THEN
    RETURN NEW;
  END IF;

  -- Someone else's post. No column other than `updated_at` may move.
  IF (to_jsonb(NEW) - 'metadata' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'metadata' - 'updated_at') THEN
    RAISE EXCEPTION 'Guests can only change their own posts' USING ERRCODE = '42501';
  END IF;

  -- No metadata key but the interaction ones may move. `createdBy` and
  -- `createdByGuest` are excluded because PATCH-364's stamp owns them and runs
  -- AFTER this trigger; `pendingApproval` is deliberately NOT excluded, so
  -- PATCH-367's guard (which runs BEFORE this one) has already restored it and a
  -- guest's attempt to change it lands here. `childPadletIds` is excluded
  -- because it has its OWN rule below -- posting into someone else's card is
  -- exactly what a guest is here to do.
  IF (NEW.metadata - 'comments' - 'detachedComments' - 'reactions' - 'childPadletIds' - 'createdBy' - 'createdByGuest')
     IS DISTINCT FROM
     (OLD.metadata - 'comments' - 'detachedComments' - 'reactions' - 'childPadletIds' - 'createdBy' - 'createdByGuest') THEN
    RAISE EXCEPTION 'Guests can only change their own posts' USING ERRCODE = '42501';
  END IF;

  IF NOT public.guest_child_ids_ok(OLD.metadata->'childPadletIds', NEW.metadata->'childPadletIds') THEN
    RAISE EXCEPTION 'Guests can only change their own posts' USING ERRCODE = '42501';
  END IF;

  -- The board's own "Comments" switch (`boards.comments_enabled`) freezes the
  -- comment keys for guests too when it is off.
  SELECT coalesce(comments_enabled, true) INTO board_comments_enabled
    FROM public.boards WHERE id = coalesce(NEW.board_id, NEW.canvas_id);
  IF board_comments_enabled IS FALSE THEN
    IF (NEW.metadata->'comments') IS DISTINCT FROM (OLD.metadata->'comments')
       OR (NEW.metadata->'detachedComments') IS DISTINCT FROM (OLD.metadata->'detachedComments') THEN
      RAISE EXCEPTION 'Comments are switched off on this board' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.guest_comment_entries_ok(OLD.metadata->'comments', NEW.metadata->'comments') THEN
    RAISE EXCEPTION 'Guests can only change their own comments' USING ERRCODE = '42501';
  END IF;
  IF NOT public.guest_comment_entries_ok(OLD.metadata->'detachedComments', NEW.metadata->'detachedComments') THEN
    RAISE EXCEPTION 'Guests can only change their own comments' USING ERRCODE = '42501';
  END IF;
  IF NOT public.guest_reaction_entries_ok(OLD.metadata->'reactions', NEW.metadata->'reactions') THEN
    RAISE EXCEPTION 'Guests can only add reactions' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. padlets BEFORE DELETE. Only their own.
CREATE OR REPLACE FUNCTION public.guard_guest_padlet_deletes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_guest() THEN
    RETURN OLD;
  END IF;

  IF OLD.metadata->>'createdBy' IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Guests can only delete their own posts' USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$function$;

-- 4. padlets BEFORE INSERT: the rate limit. Counts the guest's OWN posts on this
-- board in the last ten minutes -- a guest who reaches 30 is refused the 31st.
CREATE OR REPLACE FUNCTION public.guard_guest_post_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  recent integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_guest() THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent
    FROM public.padlets p
   WHERE coalesce(p.board_id, p.canvas_id) = coalesce(NEW.board_id, NEW.canvas_id)
     AND p.metadata->>'createdBy' = auth.uid()::text
     AND p.created_at > now() - interval '10 minutes';

  IF recent >= 30 THEN
    RAISE EXCEPTION 'You are posting too fast. Please wait a moment.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger-only: nobody needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.guard_guest_padlet_edits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_guest_padlet_deletes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_guest_post_rate() FROM PUBLIC, anon, authenticated;

-- BEFORE UPDATE, not BEFORE UPDATE OF metadata: a guest changing only `title` on
-- someone else's post must be refused too, and a column trigger would not fire.
DROP TRIGGER IF EXISTS padlets_guard_guest_edits ON public.padlets;
CREATE TRIGGER padlets_guard_guest_edits
  BEFORE UPDATE ON public.padlets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_guest_padlet_edits();

DROP TRIGGER IF EXISTS padlets_guard_guest_deletes ON public.padlets;
CREATE TRIGGER padlets_guard_guest_deletes
  BEFORE DELETE ON public.padlets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_guest_padlet_deletes();

DROP TRIGGER IF EXISTS padlets_guard_guest_rate ON public.padlets;
CREATE TRIGGER padlets_guard_guest_rate
  BEFORE INSERT ON public.padlets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_guest_post_rate();

-- Serves the rate-limit count above: one guest, one board, recent first.
CREATE INDEX IF NOT EXISTS padlets_guest_rate_idx
  ON public.padlets ((metadata->>'createdBy'), created_at)
  WHERE metadata->>'createdBy' IS NOT NULL;

-- 5. board_sections. RESTRICTIVE, so they can only ever REMOVE access: a guest
-- cannot rename, reorder, add or remove a column/section. Insert is refused too,
-- which is what stops a guest restructuring the board.
DROP POLICY IF EXISTS guest_no_sections_insert ON public.board_sections;
CREATE POLICY guest_no_sections_insert ON public.board_sections
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (not (select public.is_guest()));

DROP POLICY IF EXISTS guest_no_sections_update ON public.board_sections;
CREATE POLICY guest_no_sections_update ON public.board_sections
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (not (select public.is_guest()))
  WITH CHECK (not (select public.is_guest()));

DROP POLICY IF EXISTS guest_no_sections_delete ON public.board_sections;
CREATE POLICY guest_no_sections_delete ON public.board_sections
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (not (select public.is_guest()));

-- 6. canvas_lines. `canvas_lines` has NO creator column (see the report), so
-- there is nothing to compare against: a guest may INSERT a line and may not
-- UPDATE or DELETE one -- not even their own. INSERT is deliberately left alone.
DROP POLICY IF EXISTS guest_no_lines_update ON public.canvas_lines;
CREATE POLICY guest_no_lines_update ON public.canvas_lines
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (not (select public.is_guest()))
  WITH CHECK (not (select public.is_guest()));

DROP POLICY IF EXISTS guest_no_lines_delete ON public.canvas_lines;
CREATE POLICY guest_no_lines_delete ON public.canvas_lines
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (not (select public.is_guest()));

-- 7. SELF-CHECK. Inside the transaction: a missing trigger, policy or helper
-- rolls the whole thing back rather than leaving a half-applied lockdown.
DO $$
DECLARE
  missing text;
  wrong_kind text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing
    FROM unnest(ARRAY[
      'public.is_guest()',
      'public.guest_comment_entries_ok(jsonb,jsonb)',
      'public.guest_reaction_entries_ok(jsonb,jsonb)',
      'public.guest_child_ids_ok(jsonb,jsonb)',
      'public.guard_guest_padlet_edits()',
      'public.guard_guest_padlet_deletes()',
      'public.guard_guest_post_rate()'
    ]) AS name
   WHERE to_regprocedure(name) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PATCH-379: missing function(s): %', missing;
  END IF;

  SELECT string_agg(name, ', ') INTO missing
    FROM unnest(ARRAY[
      'padlets_guard_guest_edits', 'padlets_guard_guest_deletes', 'padlets_guard_guest_rate'
    ]) AS name
   WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = name);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PATCH-379: missing trigger(s): %', missing;
  END IF;

  -- Every guest policy must be RESTRICTIVE: a permissive one would GRANT access
  -- to whoever it matched instead of only ever taking it away.
  SELECT string_agg(policyname, ', ') INTO wrong_kind
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN (
       'guest_no_sections_insert', 'guest_no_sections_update', 'guest_no_sections_delete',
       'guest_no_lines_update', 'guest_no_lines_delete'
     )
     AND permissive <> 'RESTRICTIVE';
  IF wrong_kind IS NOT NULL THEN
    RAISE EXCEPTION 'PATCH-379: policy(ies) must be RESTRICTIVE: %', wrong_kind;
  END IF;

  SELECT string_agg(name, ', ') INTO missing
    FROM unnest(ARRAY[
      'guest_no_sections_insert', 'guest_no_sections_update', 'guest_no_sections_delete',
      'guest_no_lines_update', 'guest_no_lines_delete'
    ]) AS name
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = name);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PATCH-379: missing policy(ies): %', missing;
  END IF;
END $$;

COMMIT;
