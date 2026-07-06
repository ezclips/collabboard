-- Run this in your Supabase SQL Editor to add all missing line columns

-- Multi-point path support
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS points JSONB;

-- Label position (0-1 along line path)
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS label_position FLOAT DEFAULT 0.5;

-- Label styling
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS label_text_color TEXT;
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS label_background_color TEXT;
