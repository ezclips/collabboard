-- Dashboard Enhancement Migration
-- Run this in Supabase SQL Editor

-- ===========================================
-- 1. Add new columns to boards table
-- ===========================================

-- Thumbnail URL for canvas preview images
ALTER TABLE boards ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Track when user last visited/opened the canvas
ALTER TABLE boards ADD COLUMN IF NOT EXISTS last_visited_at timestamp with time zone;

-- Allow users to favorite/bookmark canvases
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;

-- Support organizing into folders
ALTER TABLE boards ADD COLUMN IF NOT EXISTS folder_id uuid;

-- Soft delete support
ALTER TABLE boards ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- ===========================================
-- 2. Create folders table for collections
-- ===========================================

CREATE TABLE IF NOT EXISTS folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '📁',
  color text DEFAULT '#6b7280',
  parent_id uuid REFERENCES folders(id), -- For nested folders
  position integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders(user_id);
CREATE INDEX IF NOT EXISTS boards_folder_id_idx ON boards(folder_id);
CREATE INDEX IF NOT EXISTS boards_last_visited_idx ON boards(last_visited_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS boards_is_favorite_idx ON boards(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS boards_deleted_at_idx ON boards(deleted_at) WHERE deleted_at IS NULL;

-- Add foreign key constraint for folder_id
ALTER TABLE boards 
  DROP CONSTRAINT IF EXISTS boards_folder_id_fkey;
ALTER TABLE boards 
  ADD CONSTRAINT boards_folder_id_fkey 
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;

-- ===========================================
-- 3. Enable Row Level Security on folders
-- ===========================================

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can view their own folders" ON folders;
DROP POLICY IF EXISTS "Users can insert their own folders" ON folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON folders;

-- Policies for folders
CREATE POLICY "Users can view their own folders"
  ON folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders"
  ON folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON folders FOR DELETE
  USING (auth.uid() = user_id);

-- ===========================================
-- 4. Create thumbnails storage bucket
-- ===========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Public thumbnail access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their thumbnails" ON storage.objects;

-- Storage policies for thumbnails
CREATE POLICY "Public thumbnail access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their thumbnails"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'thumbnails' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their thumbnails"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'thumbnails' AND auth.role() = 'authenticated');
