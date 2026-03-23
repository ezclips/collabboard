-- ============================================================================
-- Add permission_level to kanban_board_members + update RLS policies
-- ============================================================================
-- Evolves kanban_board_members from a simple role-based table to a
-- permission-level model (view/comment/edit/admin) matching the
-- canvas_collaborators pattern. This enables per-board granular permissions.

-- ============================================================================
-- 1. Add permission_level column
-- ============================================================================

ALTER TABLE kanban_board_members
    ADD COLUMN IF NOT EXISTS permission_level TEXT NOT NULL DEFAULT 'edit'
    CHECK (permission_level IN ('view', 'comment', 'edit', 'admin'));

-- Backfill: map existing roles to permission levels
UPDATE kanban_board_members
SET permission_level = CASE
    WHEN role IN ('owner', 'admin') THEN 'admin'
    WHEN role = 'manager' THEN 'edit'
    WHEN role = 'viewer' THEN 'view'
    ELSE 'edit'
END
WHERE permission_level = 'edit';

-- ============================================================================
-- 2. Update RLS on kanban_comments to use kanban_board_members
-- ============================================================================

-- SELECT: any board member can read comments
DROP POLICY IF EXISTS "kanban_comments_select_member" ON kanban_comments;
CREATE POLICY "kanban_comments_select_member" ON kanban_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
        )
    );

-- INSERT: members with 'comment', 'edit', or 'admin' can add comments (own user_id only)
DROP POLICY IF EXISTS "kanban_comments_insert_member_self" ON kanban_comments;
CREATE POLICY "kanban_comments_insert_member_self" ON kanban_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('comment', 'edit', 'admin')
        )
    );

-- UPDATE: author or admin/edit members
DROP POLICY IF EXISTS "kanban_comments_update_author_or_manager" ON kanban_comments;
CREATE POLICY "kanban_comments_update_author_or_manager" ON kanban_comments
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    );

-- DELETE: author or admin members
DROP POLICY IF EXISTS "kanban_comments_delete_author_or_manager" ON kanban_comments;
CREATE POLICY "kanban_comments_delete_author_or_manager" ON kanban_comments
    FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level = 'admin'
        )
    );

-- ============================================================================
-- 3. Update RLS on kanban_votes to use kanban_board_members
-- ============================================================================

-- SELECT: any board member can read votes
DROP POLICY IF EXISTS "kanban_votes_select_member" ON kanban_votes;
CREATE POLICY "kanban_votes_select_member" ON kanban_votes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
        )
    );

-- INSERT: members with 'comment', 'edit', or 'admin' can vote (own user_id only)
DROP POLICY IF EXISTS "kanban_votes_insert_member_self" ON kanban_votes;
CREATE POLICY "kanban_votes_insert_member_self" ON kanban_votes
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('comment', 'edit', 'admin')
        )
    );

-- UPDATE: vote owner only
DROP POLICY IF EXISTS "kanban_votes_update_owner" ON kanban_votes;
CREATE POLICY "kanban_votes_update_owner" ON kanban_votes
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: vote owner or admin
DROP POLICY IF EXISTS "kanban_votes_delete_owner_or_manager" ON kanban_votes;
CREATE POLICY "kanban_votes_delete_owner_or_manager" ON kanban_votes
    FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level = 'admin'
        )
    );

-- ============================================================================
-- 4. Auto-populate: backfill board creators as admin members
-- ============================================================================
-- For every board that has kanban data but no board_members entry for the owner,
-- insert the board owner as admin.

INSERT INTO kanban_board_members (canvas_id, user_id, role, permission_level)
SELECT DISTINCT b.id, b.user_id, 'owner', 'admin'
FROM boards b
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM kanban_board_members m
      WHERE m.canvas_id = b.id AND m.user_id = b.user_id
  )
ON CONFLICT (canvas_id, user_id) DO NOTHING;
