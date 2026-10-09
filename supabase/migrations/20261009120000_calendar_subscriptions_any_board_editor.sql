-- PATCH-333. Calendar links on the standalone Scheduler board too.
--
-- 20261008120000 gave kanban_calendar_subscriptions policies that only admit
-- Kanban board members (kanban_board_members with 'edit'/'admin'). A
-- standalone Scheduler board has no such rows, so its editors could not save
-- a calendar link. Each policy now ALSO admits anyone public.can_edit_board()
-- says can edit the board (the board's owner and editor collaborators — the
-- same rule the board's posts use). Nothing is loosened for readers: both
-- branches require edit rights.
--
-- Calendar entries on a standalone Scheduler board are ordinary posts; they
-- remember their calendar in the post's metadata, so no column change here.
--
-- Safe to run twice.

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
  or public.can_edit_board(kanban_calendar_subscriptions.canvas_id)
);

drop policy if exists "kanban_calendar_subscriptions_insert" on public.kanban_calendar_subscriptions;
create policy "kanban_calendar_subscriptions_insert"
on public.kanban_calendar_subscriptions for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    exists (
      select 1 from public.kanban_board_members m
      where m.canvas_id = kanban_calendar_subscriptions.canvas_id
        and m.user_id = auth.uid()
        and m.permission_level in ('edit', 'admin')
    )
    or public.can_edit_board(kanban_calendar_subscriptions.canvas_id)
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
  or public.can_edit_board(kanban_calendar_subscriptions.canvas_id)
)
with check (
  exists (
    select 1 from public.kanban_board_members m
    where m.canvas_id = kanban_calendar_subscriptions.canvas_id
      and m.user_id = auth.uid()
      and m.permission_level in ('edit', 'admin')
  )
  or public.can_edit_board(kanban_calendar_subscriptions.canvas_id)
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
  or public.can_edit_board(kanban_calendar_subscriptions.canvas_id)
);
