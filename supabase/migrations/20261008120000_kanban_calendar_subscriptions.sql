-- PATCH-328. Keep a Kanban board in step with an outside calendar (one way).
--
-- A board can remember calendar links (.ics / webcal). The link is a secret
-- (a Google "secret address" gives read access to the whole calendar), so it
-- is stored ONLY as ciphertext, encrypted by the app server with
-- lib/security/tokenCipher.ts (INTEGRATIONS_TOKEN_ENCRYPTION_KEY). The
-- database never sees the plain link. `url_host` is the only readable part,
-- for the UI ("calendar.google.com").
--
-- Each card created from a calendar remembers which event it came from, so a
-- later update moves/renames that card instead of adding a second one, and an
-- event removed from the calendar removes its card.
--
-- Access mirrors kanban_cards exactly: board members with permission_level
-- 'edit' or 'admin' (kanban_board_members). Readers cannot see subscriptions.
--
-- Safe to run twice.

-- 1. The saved calendar links -------------------------------------------------

create table if not exists public.kanban_calendar_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  canvas_id          uuid not null references public.boards(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  url_ciphertext     text not null check (char_length(url_ciphertext) between 1 and 8192),
  url_host           text not null check (char_length(url_host) between 1 and 255),
  target_column_id   uuid references public.kanban_columns(id) on delete set null,
  target_swimlane_id uuid references public.kanban_swimlanes(id) on delete set null,
  last_synced_at     timestamptz,
  -- A short reason code only (e.g. 'upstream_error'); never the link.
  last_error         text check (last_error is null or char_length(last_error) <= 64),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists kanban_calendar_subscriptions_canvas_idx
  on public.kanban_calendar_subscriptions (canvas_id);

drop trigger if exists kanban_calendar_subscriptions_updated_at
  on public.kanban_calendar_subscriptions;
create trigger kanban_calendar_subscriptions_updated_at
  before update on public.kanban_calendar_subscriptions
  for each row execute function public.update_updated_at_column();

alter table public.kanban_calendar_subscriptions enable row level security;

revoke all on public.kanban_calendar_subscriptions from anon;
grant select, insert, update, delete on public.kanban_calendar_subscriptions to authenticated;

drop policy if exists "kanban_calendar_subscriptions_select" on public.kanban_calendar_subscriptions;
create policy "kanban_calendar_subscriptions_select"
on public.kanban_calendar_subscriptions for select
to authenticated
using (
  exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
);

drop policy if exists "kanban_calendar_subscriptions_insert" on public.kanban_calendar_subscriptions;
create policy "kanban_calendar_subscriptions_insert"
on public.kanban_calendar_subscriptions for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
);

drop policy if exists "kanban_calendar_subscriptions_update" on public.kanban_calendar_subscriptions;
create policy "kanban_calendar_subscriptions_update"
on public.kanban_calendar_subscriptions for update
to authenticated
using (
  exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
)
with check (
  exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
);

drop policy if exists "kanban_calendar_subscriptions_delete" on public.kanban_calendar_subscriptions;
create policy "kanban_calendar_subscriptions_delete"
on public.kanban_calendar_subscriptions for delete
to authenticated
using (
  exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
);

-- 2. Which event a card came from ---------------------------------------------
--
-- calendar_event_key is the SHA-256 hex of "<UID>|<occurrence start>", made by
-- the app: stable across updates, and it carries no email or other personal
-- data from the calendar (UIDs can contain a domain or an address).
--
-- ON DELETE CASCADE: disconnecting a calendar removes the cards it created.
-- The calendar stays the source of truth; these cards only mirror deadlines.

alter table public.kanban_cards
  add column if not exists calendar_subscription_id uuid
    references public.kanban_calendar_subscriptions(id) on delete cascade,
  add column if not exists calendar_event_key text;

alter table public.kanban_cards
  drop constraint if exists kanban_cards_calendar_link_check;
alter table public.kanban_cards
  add constraint kanban_cards_calendar_link_check check (
    (calendar_subscription_id is null and calendar_event_key is null)
    or (calendar_subscription_id is not null
        and calendar_event_key ~ '^[0-9a-f]{64}$')
  );

create unique index if not exists kanban_cards_calendar_event_unique
  on public.kanban_cards (calendar_subscription_id, calendar_event_key)
  where calendar_subscription_id is not null;
