-- PATCH-364. The database stamps each post's creator, so a guest's post can be
-- shown in the guest's own colour.
--
-- WHY THE DATABASE. `padlets` has NO author column (live columns: id, canvas_id,
-- title, content, color, position_x, position_y, created_at, top, left, width,
-- height, updated_at, file_*, type, metadata, board_id, location_*,
-- library_item_id), and posts are created from many client paths. Stamping in the
-- app would mean every path remembering to do it, and a client could SPOOF it.
-- A trigger stamps `createdBy` (= `auth.uid()`) and, only for an anonymous user,
-- `createdByGuest: true`.
--
-- This is COSMETIC data. Existing posts have no stamp and look exactly as before.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Depends on `public.is_guest()` from 20261014120000.

BEGIN;

CREATE OR REPLACE FUNCTION public.stamp_padlet_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The client cannot spoof the stamp: strip whatever it sent.
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'createdBy' - 'createdByGuest';
    -- Service-role inserts (no auth.uid()) get no stamp.
    IF auth.uid() IS NOT NULL THEN
      NEW.metadata := NEW.metadata || jsonb_build_object('createdBy', auth.uid()::text);
      IF public.is_guest() THEN
        NEW.metadata := NEW.metadata || jsonb_build_object('createdByGuest', true);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: strip both keys the client may have sent, then copy back the STORED
  -- values, so the stamp can never be changed by an edit.
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) - 'createdBy' - 'createdByGuest';
  IF OLD.metadata ? 'createdBy' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('createdBy', OLD.metadata -> 'createdBy');
  END IF;
  IF OLD.metadata ? 'createdByGuest' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('createdByGuest', OLD.metadata -> 'createdByGuest');
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger-only: nobody needs EXECUTE, so nobody gets it. (The trigger still
-- fires -- EXECUTE is checked at CREATE TRIGGER time.)
REVOKE EXECUTE ON FUNCTION public.stamp_padlet_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS padlets_stamp_creator ON public.padlets;
CREATE TRIGGER padlets_stamp_creator
  BEFORE INSERT OR UPDATE OF metadata ON public.padlets
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_padlet_creator();

COMMIT;
