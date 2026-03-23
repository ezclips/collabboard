-- ============================================================================
-- Migration: Change order_index from INTEGER to NUMERIC for fractional ordering
-- Date: 2026-02-14
-- Description: Allow fractional order values (e.g., 100.5) for drag-and-drop positioning
-- ============================================================================

-- Change kanban_swimlanes.order_index to NUMERIC
ALTER TABLE kanban_swimlanes
    ALTER COLUMN order_index TYPE NUMERIC USING order_index::NUMERIC;

-- Change kanban_columns.order_index to NUMERIC
ALTER TABLE kanban_columns
    ALTER COLUMN order_index TYPE NUMERIC USING order_index::NUMERIC;

-- Change kanban_cards.order_index to NUMERIC
ALTER TABLE kanban_cards
    ALTER COLUMN order_index TYPE NUMERIC USING order_index::NUMERIC;

-- Add comment for documentation
COMMENT ON COLUMN kanban_swimlanes.order_index
    IS 'Numeric order for positioning. Supports fractional values for drag-and-drop (e.g., 100.5)';

COMMENT ON COLUMN kanban_columns.order_index
    IS 'Numeric order for positioning. Supports fractional values for drag-and-drop (e.g., 100.5)';

COMMENT ON COLUMN kanban_cards.order_index
    IS 'Numeric order for positioning. Supports fractional values for drag-and-drop (e.g., 100.5)';
