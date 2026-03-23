-- ============================================================================
-- Ensure updated_at columns and triggers for optimistic locking prerequisites
-- ============================================================================

ALTER TABLE kanban_cards
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE kanban_columns
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE kanban_swimlanes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE kanban_cards
SET updated_at = NOW()
WHERE updated_at IS NULL;

UPDATE kanban_columns
SET updated_at = NOW()
WHERE updated_at IS NULL;

UPDATE kanban_swimlanes
SET updated_at = NOW()
WHERE updated_at IS NULL;

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
        WHERE tgname = 'update_kanban_cards_updated_at'
          AND tgrelid = 'kanban_cards'::regclass
    ) THEN
        CREATE TRIGGER update_kanban_cards_updated_at
        BEFORE UPDATE ON kanban_cards
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_kanban_columns_updated_at'
          AND tgrelid = 'kanban_columns'::regclass
    ) THEN
        CREATE TRIGGER update_kanban_columns_updated_at
        BEFORE UPDATE ON kanban_columns
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_kanban_swimlanes_updated_at'
          AND tgrelid = 'kanban_swimlanes'::regclass
    ) THEN
        CREATE TRIGGER update_kanban_swimlanes_updated_at
        BEFORE UPDATE ON kanban_swimlanes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
