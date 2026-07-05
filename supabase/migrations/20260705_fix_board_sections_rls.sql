-- Migration: Tighten board_sections RLS policies
-- Replaces the blanket authenticated-user policies from 003_add_board_sections_rls.sql
-- with board-ownership-scoped policies so that only members with the appropriate
-- role on a board can mutate its sections.

-- ── Drop the permissive policies added in 003 ────────────────────────────────

DROP POLICY IF EXISTS "Users can view board sections"   ON board_sections;
DROP POLICY IF EXISTS "Users can insert board sections" ON board_sections;
DROP POLICY IF EXISTS "Users can update board sections" ON board_sections;
DROP POLICY IF EXISTS "Users can delete board sections" ON board_sections;

-- ── Helper: determine whether the calling user is at least an editor ─────────
-- Editors/moderators/admins in canvas_collaborators, or the canvas owner.

-- SELECT: any authenticated member of the board (any permission level)
CREATE POLICY "board_sections_select"
ON board_sections FOR SELECT
TO authenticated
USING (
  board_id IN (
    SELECT canvas_id
    FROM canvas_collaborators
    WHERE user_id = auth.uid()
  )
  OR board_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  )
);

-- INSERT: editors, moderators, or admins on the board (or the board owner)
-- Uses board_permission (board_permission_level enum: reader/commenter/editor/moderator/admin),
-- not the legacy permission_level enum (view/comment/edit/admin), which has no 'editor'/'moderator' labels.
CREATE POLICY "board_sections_insert"
ON board_sections FOR INSERT
TO authenticated
WITH CHECK (
  board_id IN (
    SELECT canvas_id
    FROM canvas_collaborators
    WHERE user_id = auth.uid()
      AND board_permission IN ('editor', 'moderator', 'admin')
  )
  OR board_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  )
);

-- UPDATE: same as INSERT
CREATE POLICY "board_sections_update"
ON board_sections FOR UPDATE
TO authenticated
USING (
  board_id IN (
    SELECT canvas_id
    FROM canvas_collaborators
    WHERE user_id = auth.uid()
      AND board_permission IN ('editor', 'moderator', 'admin')
  )
  OR board_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  )
);

-- DELETE: same as INSERT
CREATE POLICY "board_sections_delete"
ON board_sections FOR DELETE
TO authenticated
USING (
  board_id IN (
    SELECT canvas_id
    FROM canvas_collaborators
    WHERE user_id = auth.uid()
      AND board_permission IN ('editor', 'moderator', 'admin')
  )
  OR board_id IN (
    SELECT id FROM canvases WHERE owner_id = auth.uid()
  )
);
