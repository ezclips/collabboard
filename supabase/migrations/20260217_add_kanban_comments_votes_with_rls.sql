-- ============================================================================
-- Add kanban_comments + kanban_votes with RLS
-- ============================================================================
-- This migration intentionally ships table creation and authorization together.
-- It prevents global authenticated access by scoping reads/writes to board members.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS kanban_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(card_id, user_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kanban_comments_card_id
    ON kanban_comments(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kanban_comments_canvas_id
    ON kanban_comments(canvas_id);

CREATE INDEX IF NOT EXISTS idx_kanban_votes_card_id
    ON kanban_votes(card_id);

CREATE INDEX IF NOT EXISTS idx_kanban_votes_canvas_id
    ON kanban_votes(canvas_id);

-- ============================================================================
-- Trigger for comments.updated_at
-- ============================================================================

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
        WHERE tgname = 'update_kanban_comments_updated_at'
          AND tgrelid = 'kanban_comments'::regclass
    ) THEN
        CREATE TRIGGER update_kanban_comments_updated_at
        BEFORE UPDATE ON kanban_comments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE kanban_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kanban_comments_select_member" ON kanban_comments;
CREATE POLICY "kanban_comments_select_member" ON kanban_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kanban_comments_insert_member_self" ON kanban_comments;
CREATE POLICY "kanban_comments_insert_member_self" ON kanban_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kanban_comments_update_author_or_manager" ON kanban_comments;
CREATE POLICY "kanban_comments_update_author_or_manager" ON kanban_comments
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.role IN ('manager', 'admin', 'owner')
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.role IN ('manager', 'admin', 'owner')
        )
    );

DROP POLICY IF EXISTS "kanban_comments_delete_author_or_manager" ON kanban_comments;
CREATE POLICY "kanban_comments_delete_author_or_manager" ON kanban_comments
    FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_comments.canvas_id
              AND m.user_id = auth.uid()
              AND m.role IN ('manager', 'admin', 'owner')
        )
    );

DROP POLICY IF EXISTS "kanban_votes_select_member" ON kanban_votes;
CREATE POLICY "kanban_votes_select_member" ON kanban_votes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kanban_votes_insert_member_self" ON kanban_votes;
CREATE POLICY "kanban_votes_insert_member_self" ON kanban_votes
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kanban_votes_update_owner" ON kanban_votes;
CREATE POLICY "kanban_votes_update_owner" ON kanban_votes
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "kanban_votes_delete_owner_or_manager" ON kanban_votes;
CREATE POLICY "kanban_votes_delete_owner_or_manager" ON kanban_votes
    FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1
            FROM kanban_board_members m
            WHERE m.canvas_id = kanban_votes.canvas_id
              AND m.user_id = auth.uid()
              AND m.role IN ('manager', 'admin', 'owner')
        )
    );

COMMENT ON TABLE kanban_comments IS 'Per-card comments for kanban cards';
COMMENT ON TABLE kanban_votes IS 'Per-card votes for kanban cards';
