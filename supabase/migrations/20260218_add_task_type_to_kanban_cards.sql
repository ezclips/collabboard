-- Add task_type column to kanban_cards table
-- This field stores the task classification: 'Feature' or 'Task'
-- Used for Gantt chart integration and task filtering

-- Add the column with a default value
ALTER TABLE kanban_cards 
ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'Task';

-- Add check constraint to enforce valid task types
ALTER TABLE kanban_cards
ADD CONSTRAINT task_type_check 
CHECK (task_type IN ('Feature', 'Task'));

-- Add index for efficient filtering by task type
CREATE INDEX IF NOT EXISTS idx_kanban_cards_task_type 
ON kanban_cards(task_type);

-- Optionally update existing records (all will be 'Task' by default)
-- This is safe since the column defaults to 'Task'
COMMENT ON COLUMN kanban_cards.task_type IS 'Task classification: Feature or Task';
