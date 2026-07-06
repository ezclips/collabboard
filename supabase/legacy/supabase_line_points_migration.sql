-- Add points column to canvas_lines table for multi-point support
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS points JSONB;
