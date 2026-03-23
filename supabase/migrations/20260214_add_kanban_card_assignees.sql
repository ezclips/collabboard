-- ============================================================================
-- Migration: Add kanban_card_assignees join table for multi-user assignment
-- Date: 2026-02-14
-- ============================================================================

CREATE TABLE IF NOT EXISTS kanban_card_assignees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_assignees_canvas
    ON kanban_card_assignees (canvas_id);
CREATE INDEX IF NOT EXISTS idx_kanban_card_assignees_card
    ON kanban_card_assignees (card_id);
CREATE INDEX IF NOT EXISTS idx_kanban_card_assignees_user
    ON kanban_card_assignees (user_id);

ALTER TABLE kanban_card_assignees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'kanban_card_assignees'
          AND policyname = 'kanban_card_assignees_auth_all'
    ) THEN
        CREATE POLICY "kanban_card_assignees_auth_all"
            ON kanban_card_assignees
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE kanban_card_assignees
    IS 'Many-to-many assignment mapping between kanban cards and users';
