ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS coord_space text;

DO $$
BEGIN
  ALTER TABLE canvas_lines
    ADD CONSTRAINT canvas_lines_coord_space_check
    CHECK (coord_space IS NULL OR coord_space = 'scene');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
