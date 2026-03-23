-- ============================================================================
-- Add free-text card status + allow status group-by preference
-- ============================================================================

ALTER TABLE kanban_cards
    ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_kanban_cards_status
    ON kanban_cards(status);

ALTER TABLE kanban_board_members
    DROP CONSTRAINT IF EXISTS kanban_board_members_group_by_check;

ALTER TABLE kanban_board_members
    ADD CONSTRAINT kanban_board_members_group_by_check
    CHECK (group_by IN ('none', 'assignee', 'priority', 'project', 'status'));
