-- PATCH-362. Board access stays in sync between `board_collaborators` and
-- `kanban_board_members`.
--
-- WHY. Since PATCH-357/358/360 a share link adds a person to TWO tables:
-- `board_collaborators` (what post/section policies read) and
-- `kanban_board_members` (what every Kanban policy reads). Removing someone in
-- one table used to leave the other row behind -- removing their board access
-- left their Kanban membership, and removing their Kanban membership left their
-- board access. These two triggers make each removal end BOTH.
--
-- A trigger firing the other must not loop. `pg_trigger_depth()` is 1 for the
-- direct change and 2 for a trigger that fires inside another trigger, so each
-- function returns early at depth > 1 -- the cascade stops after one hop.
--
-- The admin/owner exclusion is deliberate: the board owner's Kanban row is
-- `admin`/`owner`, and a collaborator role change must never delete or downgrade
-- it.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Idempotent where possible.

BEGIN;

-- 1. board_collaborators -> kanban_board_members.
CREATE OR REPLACE FUNCTION public.sync_kanban_after_collaborator_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.kanban_board_members
     WHERE canvas_id = OLD.board_id
       AND user_id = OLD.user_id
       AND permission_level <> 'admin'
       AND coalesce(role, '') <> 'owner';
    RETURN NULL;
  END IF;

  -- UPDATE OF role: mirror the new role's permission, with the same exclusion.
  UPDATE public.kanban_board_members
     SET permission_level = CASE lower(NEW.role)
                              WHEN 'editor'    THEN 'edit'
                              WHEN 'commenter' THEN 'comment'
                              ELSE 'view'
                            END
   WHERE canvas_id = NEW.board_id
     AND user_id = NEW.user_id
     AND permission_level <> 'admin'
     AND coalesce(role, '') <> 'owner';
  RETURN NULL;
END;
$function$;

-- 2. kanban_board_members -> board_collaborators. Removing someone in the Kanban
--    member screen also ends their board access.
CREATE OR REPLACE FUNCTION public.sync_collaborator_after_kanban_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.board_collaborators
   WHERE board_id = OLD.canvas_id
     AND user_id = OLD.user_id;
  RETURN NULL;
END;
$function$;

-- 3. Triggers. DROP IF EXISTS first so a re-run is a no-op.
DROP TRIGGER IF EXISTS board_collaborators_sync_kanban ON public.board_collaborators;
CREATE TRIGGER board_collaborators_sync_kanban
  AFTER DELETE OR UPDATE OF role ON public.board_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_kanban_after_collaborator_change();

DROP TRIGGER IF EXISTS kanban_board_members_sync_collaborator ON public.kanban_board_members;
CREATE TRIGGER kanban_board_members_sync_collaborator
  AFTER DELETE ON public.kanban_board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_collaborator_after_kanban_member_delete();

-- 4. Trigger-only functions: nobody needs EXECUTE, so nobody gets it. (The
--    trigger still fires -- EXECUTE is checked at CREATE TRIGGER time.)
REVOKE EXECUTE ON FUNCTION public.sync_kanban_after_collaborator_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_collaborator_after_kanban_member_delete() FROM PUBLIC, anon, authenticated;

COMMIT;
