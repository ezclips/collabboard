-- PATCH-187. The AI credit ledger: one append-only row per charge, per bucket.
--
-- The balance is not stored: it is summed from this table at check time, so a
-- row is the only fact and nothing can drift out of sync with it. Nothing in
-- the app updates or deletes a row; only the server's service role writes.
--
-- `workspaces` and `boards` are the pre-existing tables; `get_workspace_role`
-- is the PATCH-185-era helper that answers a workspace role from the JWT email
-- or a workspace member row.

create table if not exists public.ai_credit_usage (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  feature      text not null check (feature in (
    'board_chat',
    'table_from_document',
    'wiki_compile',
    'text_action',
    'table_fill',
    'table_plan',
    'transcript_punctuate',
    'component'
  )),
  credits      integer not null check (credits > 0),
  bucket       text not null check (bucket in ('allowance', 'grant')),
  created_at   timestamptz not null default now()
);

create index if not exists ai_credit_usage_workspace_created_idx
  on public.ai_credit_usage (workspace_id, created_at desc);

alter table public.ai_credit_usage enable row level security;

-- Members can read their workspace's usage (for the meters later). No
-- insert/update/delete policy: only the server's service role writes.
create policy "ai_credit_usage_select_members" on public.ai_credit_usage
  for select using (public.get_workspace_role(workspace_id) is not null);
