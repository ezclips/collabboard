-- Create excalidraw_library table for storing Excalidraw drawing library items
-- This replaces localStorage storage to enable cross-browser/cross-device sync

create table if not exists excalidraw_library (
  id text primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  description text,
  author text,
  source text not null default 'local-import',
  preview text, -- Preview string/SVG if available
  elements jsonb not null default '[]'::jsonb, -- Excalidraw elements array
  created bigint not null default (extract(epoch from now()) * 1000)::bigint, -- Unix timestamp in ms
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster user-based queries
create index if not exists excalidraw_library_user_id_idx on excalidraw_library(user_id);
create index if not exists excalidraw_library_created_idx on excalidraw_library(created desc);

-- Enable Row Level Security
alter table excalidraw_library enable row level security;

-- Policies: Users can only access their own items
create policy "Users can view their own excalidraw library items"
  on excalidraw_library for select
  using (auth.uid() = user_id);

create policy "Users can insert their own excalidraw library items"
  on excalidraw_library for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own excalidraw library items"
  on excalidraw_library for update
  using (auth.uid() = user_id);

create policy "Users can delete their own excalidraw library items"
  on excalidraw_library for delete
  using (auth.uid() = user_id);
