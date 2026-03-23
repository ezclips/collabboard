-- ============================================================================
-- Add kanban board member grouping preference + enrich profile RPC output
-- ============================================================================

ALTER TABLE kanban_board_members
    ADD COLUMN IF NOT EXISTS sort_by TEXT,
    ADD COLUMN IF NOT EXISTS sort_order TEXT NOT NULL DEFAULT 'asc'
        CHECK (sort_order IN ('asc', 'desc')),
    ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD'
        CHECK (date_format IN ('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
    ADD COLUMN IF NOT EXISTS group_by TEXT NOT NULL DEFAULT 'none'
    CHECK (group_by IN ('none', 'assignee', 'priority', 'project'));

DROP FUNCTION IF EXISTS public.get_board_members_with_profile(UUID);

CREATE OR REPLACE FUNCTION public.get_board_members_with_profile(board_id UUID)
RETURNS TABLE (
    id UUID,
    canvas_id UUID,
    user_id UUID,
    role TEXT,
    permission_level TEXT,
    sort_by TEXT,
    sort_order TEXT,
    group_by TEXT,
    date_format TEXT,
    created_at TIMESTAMPTZ,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT
        m.id,
        m.canvas_id,
        m.user_id,
        m.role,
        m.permission_level,
        m.sort_by,
        m.sort_order,
        m.group_by,
        m.date_format,
        m.created_at,
        u.email,
        COALESCE(
            u.raw_user_meta_data->>'name',
            u.raw_user_meta_data->>'full_name',
            u.email
        ) AS display_name,
        u.raw_user_meta_data->>'avatar_url' AS avatar_url
    FROM kanban_board_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.canvas_id = board_id
      AND (
          EXISTS (
              SELECT 1
              FROM boards b
              WHERE b.id = board_id
                AND b.user_id = auth.uid()
          )
          OR EXISTS (
              SELECT 1
              FROM kanban_board_members viewer
              WHERE viewer.canvas_id = board_id
                AND viewer.user_id = auth.uid()
          )
      );
$$;

REVOKE ALL ON FUNCTION public.get_board_members_with_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_members_with_profile(UUID) TO authenticated;
