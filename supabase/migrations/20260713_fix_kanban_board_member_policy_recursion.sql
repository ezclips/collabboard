-- ============================================================================
-- Fix recursive kanban_board_members RLS policies
-- ============================================================================
-- The historical policy rewrite in 20260706 introduced self-referential
-- membership checks on kanban_board_members itself:
--   EXISTS (SELECT 1 FROM kanban_board_members ...)
-- That causes PostgreSQL 42P17 infinite recursion when the roster table or any
-- dependent Kanban table is queried under RLS. Break the cycle with
-- SECURITY DEFINER helpers that evaluate the current authenticated user against
-- the roster table without re-entering row policies.

CREATE OR REPLACE FUNCTION public.is_current_kanban_member(canvas_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kanban_board_members AS m
    WHERE m.canvas_id = canvas_uuid
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_kanban_admin(canvas_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kanban_board_members AS m
    WHERE m.canvas_id = canvas_uuid
      AND m.user_id = auth.uid()
      AND m.permission_level = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_kanban_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_kanban_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_kanban_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_current_kanban_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_kanban_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_kanban_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_kanban_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_current_kanban_admin(uuid) TO service_role;

ALTER TABLE public.kanban_board_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kanban_board_members_select" ON public.kanban_board_members;
DROP POLICY IF EXISTS "kanban_board_members_insert" ON public.kanban_board_members;
DROP POLICY IF EXISTS "kanban_board_members_update" ON public.kanban_board_members;
DROP POLICY IF EXISTS "kanban_board_members_delete" ON public.kanban_board_members;

CREATE POLICY "kanban_board_members_select"
ON public.kanban_board_members
FOR SELECT
TO authenticated
USING (
  public.is_current_kanban_member(canvas_id)
  OR EXISTS (
    SELECT 1
    FROM public.boards AS b
    WHERE b.id = kanban_board_members.canvas_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY "kanban_board_members_insert"
ON public.kanban_board_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_current_kanban_admin(canvas_id)
  OR EXISTS (
    SELECT 1
    FROM public.boards AS b
    WHERE b.id = kanban_board_members.canvas_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY "kanban_board_members_update"
ON public.kanban_board_members
FOR UPDATE
TO authenticated
USING (
  public.is_current_kanban_admin(canvas_id)
  OR EXISTS (
    SELECT 1
    FROM public.boards AS b
    WHERE b.id = kanban_board_members.canvas_id
      AND b.user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_current_kanban_admin(canvas_id)
  OR EXISTS (
    SELECT 1
    FROM public.boards AS b
    WHERE b.id = kanban_board_members.canvas_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY "kanban_board_members_delete"
ON public.kanban_board_members
FOR DELETE
TO authenticated
USING (
  public.is_current_kanban_admin(canvas_id)
  OR EXISTS (
    SELECT 1
    FROM public.boards AS b
    WHERE b.id = kanban_board_members.canvas_id
      AND b.user_id = auth.uid()
  )
);
