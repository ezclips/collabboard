ALTER TABLE boards
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE folders
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE boards
SET workspace_id = workspaces.id
FROM workspaces
WHERE boards.workspace_id IS NULL
  AND workspaces.owner_user_id = boards.user_id;

UPDATE folders
SET workspace_id = workspaces.id
FROM workspaces
WHERE folders.workspace_id IS NULL
  AND workspaces.owner_user_id = folders.user_id;

CREATE INDEX IF NOT EXISTS boards_workspace_id_idx ON boards(workspace_id);
CREATE INDEX IF NOT EXISTS folders_workspace_id_idx ON folders(workspace_id);

CREATE OR REPLACE FUNCTION can_access_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM boards
        WHERE boards.id = board_uuid
          AND (
              boards.user_id = user_uuid
              OR (
                  boards.workspace_id IS NOT NULL
                  AND has_workspace_access(boards.workspace_id, user_uuid)
              )
          )
    );
$$;

CREATE OR REPLACE FUNCTION can_edit_board(
    board_uuid uuid,
    user_uuid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM boards
        WHERE boards.id = board_uuid
          AND (
              boards.user_id = user_uuid
              OR (
                  boards.workspace_id IS NOT NULL
                  AND can_edit_workspace(boards.workspace_id, user_uuid)
              )
          )
    );
$$;

DROP POLICY IF EXISTS "Users can select freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can insert freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can update freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can delete freeform edges of their boards" ON freeform_graph_edges;

CREATE POLICY "Users can select freeform edges of their boards"
  ON freeform_graph_edges FOR SELECT
  USING (can_access_board(board_id));

CREATE POLICY "Users can insert freeform edges of their boards"
  ON freeform_graph_edges FOR INSERT
  WITH CHECK (can_edit_board(board_id));

CREATE POLICY "Users can update freeform edges of their boards"
  ON freeform_graph_edges FOR UPDATE
  USING (can_edit_board(board_id))
  WITH CHECK (can_edit_board(board_id));

CREATE POLICY "Users can delete freeform edges of their boards"
  ON freeform_graph_edges FOR DELETE
  USING (can_edit_board(board_id));

DROP POLICY IF EXISTS "Users can select freeform settings of their boards" ON freeform_graph_settings;
DROP POLICY IF EXISTS "Users can insert freeform settings of their boards" ON freeform_graph_settings;
DROP POLICY IF EXISTS "Users can update freeform settings of their boards" ON freeform_graph_settings;

CREATE POLICY "Users can select freeform settings of their boards"
  ON freeform_graph_settings FOR SELECT
  USING (can_access_board(board_id));

CREATE POLICY "Users can insert freeform settings of their boards"
  ON freeform_graph_settings FOR INSERT
  WITH CHECK (can_edit_board(board_id));

CREATE POLICY "Users can update freeform settings of their boards"
  ON freeform_graph_settings FOR UPDATE
  USING (can_edit_board(board_id))
  WITH CHECK (can_edit_board(board_id));