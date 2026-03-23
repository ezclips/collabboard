-- ============================================================================
-- CORRECTED KANBAN MIGRATION: Fix 'boards' table (not 'canvases')
-- ============================================================================
-- ROOT CAUSE: The app uses .from('boards'), not .from('canvases')
-- The previous migration converted the wrong table!
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART A: Drop Kanban tables
-- ============================================================================

DROP TABLE IF EXISTS kanban_board_members CASCADE;
DROP TABLE IF EXISTS kanban_cards CASCADE;
DROP TABLE IF EXISTS kanban_columns CASCADE;
DROP TABLE IF EXISTS kanban_swimlanes CASCADE;
DROP TABLE IF EXISTS _canvases_id_migration CASCADE;

-- ============================================================================
-- PART B: Fix 'boards' table to use UUID
-- ============================================================================

DO $$
DECLARE
    current_type TEXT;
    dep_table RECORD;
BEGIN
    -- Check if boards.id is INTEGER
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_name = 'boards' AND column_name = 'id';

    IF current_type IN ('integer', 'bigint') THEN
        RAISE NOTICE 'boards.id is INTEGER/BIGINT — converting to UUID...';

        -- Step 1: Add temporary UUID column
        ALTER TABLE boards ADD COLUMN id_uuid UUID DEFAULT uuid_generate_v4();
        UPDATE boards SET id_uuid = uuid_generate_v4() WHERE id_uuid IS NULL;
        ALTER TABLE boards ALTER COLUMN id_uuid SET NOT NULL;

        -- Step 2: Create mapping table
        CREATE TEMP TABLE _board_id_map AS
        SELECT id AS old_id, id_uuid AS new_id FROM boards;

        -- Step 3: Update all foreign keys
        FOR dep_table IN
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = 'boards'
                AND ccu.column_name = 'id'
                AND tc.table_name NOT LIKE 'kanban_%'
        LOOP
            RAISE NOTICE 'Updating %.% ...', dep_table.table_name, dep_table.column_name;

            -- First, drop all RLS policies on this table
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS "Users can view sections of their own boards" ON %I', dep_table.table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Users can insert sections to their own boards" ON %I', dep_table.table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Users can update sections of their own boards" ON %I', dep_table.table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Users can delete sections of their own boards" ON %I', dep_table.table_name);
                RAISE NOTICE 'Dropped RLS policies for %', dep_table.table_name;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'No policies to drop for %', dep_table.table_name;
            END;

            -- Add new UUID column
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN %I UUID',
                dep_table.table_name,
                dep_table.column_name || '_uuid'
            );

            -- Populate from mapping
            EXECUTE format(
                'UPDATE %I t SET %I = m.new_id FROM _board_id_map m WHERE t.%I = m.old_id',
                dep_table.table_name,
                dep_table.column_name || '_uuid',
                dep_table.column_name
            );

            -- Drop old FK constraint
            EXECUTE format(
                'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                dep_table.table_name,
                dep_table.table_name || '_' || dep_table.column_name || '_fkey'
            );

            -- Drop old column (CASCADE to drop dependent policies)
            EXECUTE format(
                'ALTER TABLE %I DROP COLUMN %I CASCADE',
                dep_table.table_name,
                dep_table.column_name
            );

            -- Rename new column
            EXECUTE format(
                'ALTER TABLE %I RENAME COLUMN %I TO %I',
                dep_table.table_name,
                dep_table.column_name || '_uuid',
                dep_table.column_name
            );
        END LOOP;

        -- Step 4: Swap boards.id
        ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_pkey;
        ALTER TABLE boards DROP COLUMN id CASCADE;
        ALTER TABLE boards RENAME COLUMN id_uuid TO id;
        ALTER TABLE boards ADD PRIMARY KEY (id);

        -- Step 5: Re-add foreign key constraints
        FOR dep_table IN
            SELECT DISTINCT t.table_name, c.column_name
            FROM information_schema.tables t
            JOIN information_schema.columns c ON t.table_name = c.table_name
            WHERE t.table_schema = 'public'
                AND c.column_name = 'board_id'
                AND c.data_type = 'uuid'
                AND t.table_name NOT LIKE 'kanban_%'
                AND t.table_name != 'boards'
        LOOP
            BEGIN
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES boards(id) ON DELETE CASCADE',
                    dep_table.table_name,
                    dep_table.table_name || '_board_id_fkey',
                    dep_table.column_name
                );
                RAISE NOTICE 'Added FK: %.%', dep_table.table_name, dep_table.column_name;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Skipped FK for %.%: %', dep_table.table_name, dep_table.column_name, SQLERRM;
            END;
        END LOOP;

        DROP TABLE IF EXISTS _board_id_map;
        RAISE NOTICE 'boards.id successfully converted to UUID!';

    ELSIF current_type = 'uuid' THEN
        RAISE NOTICE 'boards.id is already UUID — no conversion needed.';
    ELSE
        RAISE EXCEPTION 'Unexpected boards.id type: %', current_type;
    END IF;
END $$;

-- ============================================================================
-- PART C: Create Kanban tables (referencing boards, not canvases)
-- ============================================================================

CREATE TABLE kanban_swimlanes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kanban_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    task_limit INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kanban_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    swimlane_id UUID REFERENCES kanban_swimlanes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT,
    order_index INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    time_estimated REAL DEFAULT 0,
    time_spent REAL DEFAULT 0,
    date_due TIMESTAMPTZ,
    date_started TIMESTAMPTZ,
    date_modification TIMESTAMPTZ DEFAULT NOW(),
    date_completed TIMESTAMPTZ,
    color_id TEXT,
    reference TEXT,
    assignee_id UUID,
    creator_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kanban_board_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(canvas_id, user_id)
);

-- ============================================================================
-- PART D: Indexes
-- ============================================================================

CREATE INDEX idx_kanban_cards_canvas ON kanban_cards (canvas_id);
CREATE INDEX idx_kanban_cards_column ON kanban_cards (column_id);
CREATE INDEX idx_kanban_cards_swimlane ON kanban_cards (swimlane_id);
CREATE INDEX idx_kanban_cards_priority ON kanban_cards (priority);
CREATE INDEX idx_kanban_cards_assignee ON kanban_cards (assignee_id);
CREATE INDEX idx_kanban_columns_canvas ON kanban_columns (canvas_id);
CREATE INDEX idx_kanban_columns_order ON kanban_columns (canvas_id, order_index);
CREATE INDEX idx_kanban_swimlanes_canvas ON kanban_swimlanes (canvas_id);
CREATE INDEX idx_kanban_swimlanes_order ON kanban_swimlanes (canvas_id, order_index);
CREATE INDEX idx_kanban_members_canvas ON kanban_board_members (canvas_id);
CREATE INDEX idx_kanban_members_user ON kanban_board_members (user_id);

-- ============================================================================
-- PART E: RLS Policies
-- ============================================================================

ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_swimlanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_board_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban_cards_auth_all" ON kanban_cards
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "kanban_columns_auth_all" ON kanban_columns
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "kanban_swimlanes_auth_all" ON kanban_swimlanes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "kanban_board_members_auth_all" ON kanban_board_members
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- PART F: Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kanban_cards_updated_at
    BEFORE UPDATE ON kanban_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kanban_columns_updated_at
    BEFORE UPDATE ON kanban_columns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kanban_swimlanes_updated_at
    BEFORE UPDATE ON kanban_swimlanes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
