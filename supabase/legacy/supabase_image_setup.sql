-- 1. Update the 'type' check constraint on the 'padlets' table
-- This ensures 'image' is accepted as a valid padlet type.
ALTER TABLE padlets DROP CONSTRAINT IF EXISTS padlets_type_check;

ALTER TABLE padlets 
ADD CONSTRAINT padlets_type_check 
CHECK (type IN ('note', 'link', 'todo', 'table', 'container', 'comment', 'image', 'line'));

-- 2. Create a Storage Bucket for Images
-- We'll create a bucket named 'images' if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- 3. Set up Security Policies for the 'images' bucket

-- Allow public read access (so anyone can view the images on the canvas)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'images' );

-- Allow authenticated users to upload images
create policy "Authenticated Uploads"
  on storage.objects for insert
  with check ( bucket_id = 'images' and auth.role() = 'authenticated' );

-- Allow users to update/delete their own images (optional, good practice)
create policy "Owner Update/Delete"
  on storage.objects for all
  using ( bucket_id = 'images' and auth.uid() = owner );
