-- ============================================================================
-- Add Kanban Links Table
-- ============================================================================
-- Implements card-to-card relationship links for the Kanban board
-- Supports DHTMLX-style relation types with proper persistence

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Create kanban_links table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kanban_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    from_card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    to_card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate links (same from+to+relation)
    CONSTRAINT unique_link UNIQUE (from_card_id, to_card_id, relation)
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================

CREATE INDEX idx_kanban_links_canvas ON kanban_links (canvas_id);
CREATE INDEX idx_kanban_links_from_card ON kanban_links (from_card_id);
CREATE INDEX idx_kanban_links_to_card ON kanban_links (to_card_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE kanban_links ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage links
CREATE POLICY "kanban_links_auth_all" ON kanban_links
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE kanban_links IS 'Card-to-card relationship links for Kanban boards';
COMMENT ON COLUMN kanban_links.from_card_id IS 'Source card (master) of the relationship';
COMMENT ON COLUMN kanban_links.to_card_id IS 'Target card (slave) of the relationship';
COMMENT ON COLUMN kanban_links.relation IS 'Type of relationship: Relates to, Depends on, Is required for, etc.';
