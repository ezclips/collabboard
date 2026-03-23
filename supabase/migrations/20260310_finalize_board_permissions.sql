DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'board_permission_level'
    ) THEN
        CREATE TYPE board_permission_level AS ENUM (
            'reader',
            'commenter',
            'editor',
            'moderator',
            'admin'
        );
    END IF;
END
$$;

ALTER TABLE canvas_collaborators
    ADD COLUMN IF NOT EXISTS board_permission board_permission_level;

UPDATE canvas_collaborators
SET board_permission = CASE permission_level::text
    WHEN 'view' THEN 'reader'::board_permission_level
    WHEN 'comment' THEN 'commenter'::board_permission_level
    WHEN 'edit' THEN 'editor'::board_permission_level
    WHEN 'admin' THEN 'admin'::board_permission_level
    ELSE NULL
END
WHERE board_permission IS NULL;

ALTER TABLE canvas_collaborators
    ALTER COLUMN board_permission SET DEFAULT 'reader';

CREATE INDEX IF NOT EXISTS idx_canvas_collaborators_board_permission
ON canvas_collaborators(board_permission);

CREATE OR REPLACE FUNCTION board_permission_to_legacy(permission board_permission_level)
RETURNS permission_level
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE permission
        WHEN 'reader'::board_permission_level THEN 'view'::permission_level
        WHEN 'commenter'::board_permission_level THEN 'comment'::permission_level
        WHEN 'editor'::board_permission_level THEN 'edit'::permission_level
        WHEN 'moderator'::board_permission_level THEN 'admin'::permission_level
        WHEN 'admin'::board_permission_level THEN 'admin'::permission_level
    END;
$$;

CREATE OR REPLACE FUNCTION legacy_permission_to_board(permission permission_level)
RETURNS board_permission_level
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE permission
        WHEN 'view'::permission_level THEN 'reader'::board_permission_level
        WHEN 'comment'::permission_level THEN 'commenter'::board_permission_level
        WHEN 'edit'::permission_level THEN 'editor'::board_permission_level
        WHEN 'admin'::permission_level THEN 'admin'::board_permission_level
    END;
$$;

CREATE OR REPLACE FUNCTION sync_canvas_collaborator_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.board_permission IS NULL AND NEW.permission_level IS NOT NULL THEN
            NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
        ELSIF NEW.permission_level IS NULL AND NEW.board_permission IS NOT NULL THEN
            NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.board_permission IS NULL AND NEW.permission_level IS NOT NULL THEN
        NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
    ELSIF NEW.permission_level IS NULL AND NEW.board_permission IS NOT NULL THEN
        NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
    ELSIF NEW.board_permission IS DISTINCT FROM OLD.board_permission THEN
        NEW.permission_level := board_permission_to_legacy(NEW.board_permission);
    ELSIF NEW.permission_level IS DISTINCT FROM OLD.permission_level THEN
        NEW.board_permission := legacy_permission_to_board(NEW.permission_level);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_canvas_collaborator_permissions_trigger ON canvas_collaborators;
CREATE TRIGGER sync_canvas_collaborator_permissions_trigger
    BEFORE INSERT OR UPDATE ON canvas_collaborators
    FOR EACH ROW
    EXECUTE FUNCTION sync_canvas_collaborator_permissions();
