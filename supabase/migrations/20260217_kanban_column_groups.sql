-- ============================================================================
-- Add kanban_column_groups and link kanban_columns.group_id
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS kanban_column_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_column_groups_canvas_id
    ON kanban_column_groups(canvas_id);

ALTER TABLE kanban_columns
    ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES kanban_column_groups(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_kanban_column_groups_updated_at'
          AND tgrelid = 'kanban_column_groups'::regclass
    ) THEN
        CREATE TRIGGER update_kanban_column_groups_updated_at
        BEFORE UPDATE ON kanban_column_groups
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

ALTER TABLE kanban_column_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kanban_column_groups_select_member" ON kanban_column_groups;
CREATE POLICY "kanban_column_groups_select_member" ON kanban_column_groups
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_column_groups.canvas_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kanban_column_groups_insert_member" ON kanban_column_groups;
CREATE POLICY "kanban_column_groups_insert_member" ON kanban_column_groups
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_column_groups.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    );

DROP POLICY IF EXISTS "kanban_column_groups_update_member" ON kanban_column_groups;
CREATE POLICY "kanban_column_groups_update_member" ON kanban_column_groups
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_column_groups.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_column_groups.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    );

DROP POLICY IF EXISTS "kanban_column_groups_delete_member" ON kanban_column_groups;
CREATE POLICY "kanban_column_groups_delete_member" ON kanban_column_groups
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_column_groups.canvas_id
              AND m.user_id = auth.uid()
              AND m.permission_level IN ('edit', 'admin')
        )
    );
