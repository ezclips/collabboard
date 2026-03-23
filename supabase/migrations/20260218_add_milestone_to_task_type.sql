-- Add task_type column to kanban_cards if it doesn't exist,
-- and allow 'Milestone' as a valid value for DHTMLX Gantt rendering.

-- 1. Add the column (safe if it already exists)
ALTER TABLE kanban_cards
ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'Task';

-- 2. Drop any existing constraint so we can recreate it
ALTER TABLE kanban_cards
DROP CONSTRAINT IF EXISTS task_type_check;

-- 3. Create constraint with Feature, Task, and Milestone
ALTER TABLE kanban_cards
ADD CONSTRAINT task_type_check
CHECK (task_type IN ('Feature', 'Task', 'Milestone'));

-- 4. Index for filtering
CREATE INDEX IF NOT EXISTS idx_kanban_cards_task_type
ON kanban_cards(task_type);

COMMENT ON COLUMN kanban_cards.task_type IS 'Task classification: Feature, Task, or Milestone';
