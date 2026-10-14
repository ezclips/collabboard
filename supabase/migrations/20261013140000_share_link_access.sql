-- PATCH-357. Share links grant board access; the board-permission function is
-- repaired against the LIVE schema, and the anonymous oracle on the
-- workspace-board helpers is closed.
--
-- THE LIVE DRIFT (owner's read-only snapshots, 2026-10-13). The function in the
-- database is the OLD body, not 20260916130000's repair: it selects
-- `canvases.workspace_id` (the live `canvases` table has NO such column -- its
-- columns are id, title, ..., settings, is_public, owner_id) and
-- `canvas_collaborators.accepted_at/invited_at` (columns that do not exist).
-- Every call raises, so `/api/share-link` (which calls this through
-- `getBoardPermission`) could not work. The REVOKE from anon in that migration
-- DID land; only the body was left behind.
--
-- WHAT THIS DOES.
--   1. Re-points `get_board_permission` at `boards` / `board_collaborators`,
--      the tables the application actually reads, with no `canvases`, no
--      `canvas_collaborators` and no public/visitor branch (deny by default).
--   2. Revokes EXECUTE on it from PUBLIC and anon -- a working version
--      reachable by anon is an oracle for "does user X have access to board Y".
--   3. Re-creates the three `boards` policies that call the workspace-board
--      helpers TO authenticated, so an anon query returns no rows instead of
--      "permission denied for function"; THEN revokes those helpers from PUBLIC
--      and anon. Order matters: policies first.
--   4. Adds the `(board_id, user_id)` unique index the redeem route's upsert
--      needs.
--   5. Guards the whole thing: it reads `pg_policies` ITSELF for any remaining
--      public/anon policy that still calls the workspace-board helpers and
--      aborts if one exists (see the DO block right after BEGIN).
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. It is idempotent where possible.

BEGIN;

-- Read the LIVE policies, not the repo's list of callers. This repo's migration
-- files are known to differ from the database (this patch exists because of
-- exactly that: a function body that was never the one in the file), so the
-- REVOKE of the workspace-board helpers from anon below must not assume it knows
-- every caller. An anon-reachable policy that still calls
-- can_view_workspace_board / can_edit_workspace_board would, after the revoke,
-- fail with "permission denied for function" instead of returning no rows -- a
-- break for board queries, not the intended deny. The three `boards` policies
-- this migration re-creates are excluded (it fixes them); any OTHER public/anon
-- policy that calls these helpers must be re-targeted TO authenticated FIRST, so
-- this aborts and rolls the whole transaction back rather than revoking under
-- a policy that still needs the function.
DO $$
DECLARE
    offending text;
BEGIN
    SELECT string_agg(
               format('%I.%I (table %I.%I)', p.schemaname, p.policyname, p.schemaname, p.tablename),
               ', '
               ORDER BY p.schemaname, p.tablename, p.policyname
           )
      INTO offending
      FROM pg_policies p
     WHERE (p.qual ILIKE '%can_view_workspace_board%'
            OR p.qual ILIKE '%can_edit_workspace_board%'
            OR p.with_check ILIKE '%can_view_workspace_board%'
            OR p.with_check ILIKE '%can_edit_workspace_board%')
       AND ('public' = ANY(p.roles::text[]) OR 'anon' = ANY(p.roles::text[]))
       AND NOT (
             p.schemaname = 'public'
             AND p.tablename = 'boards'
             AND p.policyname IN (
                 'Workspace users can view boards',
                 'Workspace users can edit boards',
                 'Workspace managers can delete boards'
             )
           );

    IF offending IS NOT NULL THEN
        RAISE EXCEPTION
            'PATCH-357 aborted: public/anon policies still call the workspace-board permission helpers: %. Re-target these TO authenticated first, then re-run.',
            offending;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_board_permission(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS board_permission_level
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    collaborator_permission board_permission_level;
    workspace_role_value workspace_role;
    board_workspace_id uuid;
BEGIN
    IF board_uuid IS NULL OR user_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    -- The live board, or nothing. This used to read `canvases`, a legacy
    -- vertical whose single row describes no board in use.
    SELECT b.workspace_id INTO board_workspace_id
      FROM public.boards b
     WHERE b.id = board_uuid;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Owner. `boards.user_id` is the live owner column.
    IF EXISTS (
        SELECT 1 FROM public.boards b
         WHERE b.id = board_uuid AND b.user_id = user_uuid
    ) THEN
        RETURN 'admin'::board_permission_level;
    END IF;

    -- Workspace member. Gated on can_view_workspace_board so the same
    -- allowed_canvas_ids / folder rules apply; a member who may not edit gets
    -- reader, readonly gets reader.
    IF board_workspace_id IS NOT NULL
       AND public.can_view_workspace_board(board_uuid, user_uuid) THEN
        workspace_role_value := public.get_workspace_role(board_workspace_id, user_uuid);
        IF workspace_role_value IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
            RETURN 'admin'::board_permission_level;
        ELSIF workspace_role_value = 'member'::workspace_role THEN
            IF public.can_edit_workspace_board(board_uuid, user_uuid) THEN
                RETURN 'editor'::board_permission_level;
            END IF;
            RETURN 'reader'::board_permission_level;
        ELSIF workspace_role_value = 'readonly'::workspace_role THEN
            RETURN 'reader'::board_permission_level;
        END IF;
    END IF;

    -- Board collaborator. `board_collaborators.role` is free text; an unknown
    -- role returns NULL -- deny -- rather than being guessed at.
    SELECT CASE lower(c.role)
             WHEN 'editor'    THEN 'editor'::board_permission_level
             WHEN 'commenter' THEN 'commenter'::board_permission_level
             WHEN 'viewer'    THEN 'reader'::board_permission_level
           END
      INTO collaborator_permission
      FROM public.board_collaborators c
     WHERE c.board_id = board_uuid
       AND c.user_id = user_uuid
     LIMIT 1;

    IF collaborator_permission IS NOT NULL THEN
        RETURN collaborator_permission;
    END IF;

    RETURN NULL;
END;
$function$;

-- The security half: without it the repaired function is an anonymous oracle.
-- `authenticated` and `service_role` keep EXECUTE (getAuthContext calls it on a
-- user session; the redeem route calls it with the service role).
REVOKE ALL ON FUNCTION public.get_board_permission(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_board_permission(uuid, uuid) TO authenticated, service_role;

-- Policies FIRST (same names, same USING/CHECK): anon is excluded from the
-- policy, so anon queries return no rows rather than erroring on the function
-- before the revoke below lands.
DROP POLICY IF EXISTS "Workspace users can view boards" ON public.boards;
CREATE POLICY "Workspace users can view boards"
    ON public.boards FOR SELECT
    TO authenticated
    USING (public.can_view_workspace_board(id));

DROP POLICY IF EXISTS "Workspace users can edit boards" ON public.boards;
CREATE POLICY "Workspace users can edit boards"
    ON public.boards FOR UPDATE
    TO authenticated
    USING (public.can_edit_workspace_board(id))
    WITH CHECK (public.can_edit_workspace_board(id));

DROP POLICY IF EXISTS "Workspace managers can delete boards" ON public.boards;
CREATE POLICY "Workspace managers can delete boards"
    ON public.boards FOR DELETE
    TO authenticated
    USING (public.can_manage_workspace_board(id));

-- THEN close the helpers from anon. Authenticated and service_role keep them
-- (the policies run as the caller, and the helpers are also called directly).
REVOKE EXECUTE ON FUNCTION public.can_view_workspace_board(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_workspace_board(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_workspace_board(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_workspace_board(uuid, uuid) TO authenticated, service_role;

-- The upsert target for a redeemed share link. 0 rows today, so safe.
CREATE UNIQUE INDEX IF NOT EXISTS board_collaborators_board_user_key
    ON public.board_collaborators (board_id, user_id);

COMMIT;
