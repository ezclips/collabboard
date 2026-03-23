-- ============================================================================
-- Ensure board owner is always present in kanban_board_members
-- ============================================================================
-- Existing migration includes a one-time backfill. This adds a live trigger so
-- new boards and owner changes are kept in sync automatically.

CREATE OR REPLACE FUNCTION ensure_kanban_board_owner_member()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'kanban_board_members'
          AND column_name = 'permission_level'
    ) THEN
        INSERT INTO kanban_board_members (canvas_id, user_id, role, permission_level)
        VALUES (NEW.id, NEW.user_id, 'owner', 'admin')
        ON CONFLICT (canvas_id, user_id)
        DO UPDATE SET
            role = 'owner',
            permission_level = 'admin';
    ELSE
        INSERT INTO kanban_board_members (canvas_id, user_id, role)
        VALUES (NEW.id, NEW.user_id, 'owner')
        ON CONFLICT (canvas_id, user_id)
        DO UPDATE SET
            role = 'owner';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_kanban_board_owner_member_insert ON boards;
CREATE TRIGGER trg_ensure_kanban_board_owner_member_insert
AFTER INSERT ON boards
FOR EACH ROW
EXECUTE FUNCTION ensure_kanban_board_owner_member();

DROP TRIGGER IF EXISTS trg_ensure_kanban_board_owner_member_update ON boards;
CREATE TRIGGER trg_ensure_kanban_board_owner_member_update
AFTER UPDATE OF user_id ON boards
FOR EACH ROW
WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id)
EXECUTE FUNCTION ensure_kanban_board_owner_member();

-- Safety backfill for any rows created before this trigger existed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'kanban_board_members'
          AND column_name = 'permission_level'
    ) THEN
        INSERT INTO kanban_board_members (canvas_id, user_id, role, permission_level)
        SELECT b.id, b.user_id, 'owner', 'admin'
        FROM boards b
        WHERE b.user_id IS NOT NULL
        ON CONFLICT (canvas_id, user_id)
        DO UPDATE SET
            role = 'owner',
            permission_level = 'admin';
    ELSE
        INSERT INTO kanban_board_members (canvas_id, user_id, role)
        SELECT b.id, b.user_id, 'owner'
        FROM boards b
        WHERE b.user_id IS NOT NULL
        ON CONFLICT (canvas_id, user_id)
        DO UPDATE SET
            role = 'owner';
    END IF;
END $$;
