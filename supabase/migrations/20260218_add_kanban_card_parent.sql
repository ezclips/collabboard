-- Migration: Add parent_id to kanban_cards for Gantt hierarchy
-- Date: 2026-02-18
-- Description: Adds parent_id field to support parent-child task relationships in Gantt view

ALTER TABLE kanban_cards 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES kanban_cards(id) ON DELETE CASCADE;

-- Add index for efficient parent lookups
CREATE INDEX IF NOT EXISTS idx_kanban_cards_parent ON kanban_cards(parent_id);

-- Add comment for documentation
COMMENT ON COLUMN kanban_cards.parent_id IS 'Parent card ID for hierarchical task relationships in Gantt view';
