-- Migration: Fix board_sections RLS referencing the wrong data model
--
-- 20260705_fix_board_sections_rls.sql tightened board_sections policies but
-- checked ownership against `canvases` / `canvas_collaborators` — a separate,
-- unrelated table pair. board_sections.board_id actually references
-- `boards.id` (see boards_select / board_collaborators_select in
-- 20260707_enable_rls_missing_tables.sql), so every insert/update/delete on
-- board_sections for a real board-based canvas was rejected with 42501
-- ("new row violates row-level security policy"), even for the board's own
-- owner. This replaces those policies with the correct boards-based checks.

DROP POLICY IF EXISTS "board_sections_select" ON board_sections;
DROP POLICY IF EXISTS "board_sections_insert" ON board_sections;
DROP POLICY IF EXISTS "board_sections_update" ON board_sections;
DROP POLICY IF EXISTS "board_sections_delete" ON board_sections;

-- SELECT: the board owner, or any board_collaborators member (any role)
CREATE POLICY "board_sections_select"
ON board_sections FOR SELECT
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR public.is_board_member(board_id, auth.uid())
);

-- INSERT: the board owner, or a collaborator with the 'editor' role
-- (board_collaborators.role is 'editor' | 'viewer' | 'commenter' — viewers/
-- commenters can see sections but not create/rename/delete them)
CREATE POLICY "board_sections_insert"
ON board_sections FOR INSERT
TO authenticated
WITH CHECK (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (
    SELECT board_id FROM board_collaborators
    WHERE user_id = auth.uid() AND role = 'editor'
  )
);

-- UPDATE: same as INSERT
CREATE POLICY "board_sections_update"
ON board_sections FOR UPDATE
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (
    SELECT board_id FROM board_collaborators
    WHERE user_id = auth.uid() AND role = 'editor'
  )
);

-- DELETE: same as INSERT
CREATE POLICY "board_sections_delete"
ON board_sections FOR DELETE
TO authenticated
USING (
  board_id IN (SELECT id FROM boards WHERE user_id = auth.uid())
  OR board_id IN (
    SELECT board_id FROM board_collaborators
    WHERE user_id = auth.uid() AND role = 'editor'
  )
);
