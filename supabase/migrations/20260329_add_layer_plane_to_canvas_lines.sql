-- Add layer_plane column to canvas_lines for explicit global plane membership.
-- 'front' = renders above padlets/cards (default)
-- 'back'  = renders behind padlets/cards
--
-- Existing rows receive 'front' automatically via the DEFAULT clause.
-- Inserts without an explicit layer_plane value still succeed (DEFAULT 'front').
-- Updates can write any valid value ('front' or 'back').

ALTER TABLE canvas_lines
  ADD COLUMN IF NOT EXISTS layer_plane text NOT NULL DEFAULT 'front';

-- Optional: add a check constraint so only valid values are stored.
ALTER TABLE canvas_lines
  DROP CONSTRAINT IF EXISTS canvas_lines_layer_plane_check;

ALTER TABLE canvas_lines
  ADD CONSTRAINT canvas_lines_layer_plane_check
    CHECK (layer_plane IN ('front', 'back'));
