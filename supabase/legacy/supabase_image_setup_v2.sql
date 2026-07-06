-- CORRECTED SCRIPT
-- The previous error was because the database uses 'text' for notes, but I mistakenly put 'note' in the allowed list.

-- 1. Drop existing constraint
ALTER TABLE padlets DROP CONSTRAINT IF EXISTS padlets_type_check;

-- 2. Add corrected constraint including 'text' and 'file'
ALTER TABLE padlets 
ADD CONSTRAINT padlets_type_check 
CHECK (type IN ('text', 'link', 'todo', 'table', 'container', 'comment', 'image', 'line', 'file'));

-- 3. Create 'images' storage bucket (if not already done)
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- 4. Storage policies (if not already done)
create policy "Public Access" 
  on storage.objects for select 
  using ( bucket_id = 'images' );

create policy "Authenticated Uploads" 
  on storage.objects for insert 
  with check ( bucket_id = 'images' and auth.role() = 'authenticated' );
