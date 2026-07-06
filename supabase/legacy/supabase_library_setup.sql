-- Create library_items table
create table if not exists library_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  title text not null,
  description text,
  type text not null default 'padlet', -- 'padlet', 'section', etc.
  content jsonb not null, -- Stores the full state (title, content, width, height, file_* fields)
  thumbnail_url text,
  is_public boolean default false, -- Future proofing for sharing
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table library_items enable row level security;

-- Policies
create policy "Users can view their own library items"
  on library_items for select
  using (auth.uid() = user_id);

create policy "Users can insert their own library items"
  on library_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own library items"
  on library_items for update
  using (auth.uid() = user_id);

create policy "Users can delete their own library items"
  on library_items for delete
  using (auth.uid() = user_id);
