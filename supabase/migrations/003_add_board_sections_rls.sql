-- Migration: Add board_sections RLS policies
-- This enables Row Level Security for the board_sections table

-- Enable RLS on board_sections if not already enabled
ALTER TABLE board_sections ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all board sections
CREATE POLICY "Users can view board sections"
ON board_sections FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert board sections
CREATE POLICY "Users can insert board sections"
ON board_sections FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update board sections
CREATE POLICY "Users can update board sections"
ON board_sections FOR UPDATE
TO authenticated
USING (true);

-- Policy: Allow authenticated users to delete board sections
CREATE POLICY "Users can delete board sections"
ON board_sections FOR DELETE
TO authenticated
USING (true);
