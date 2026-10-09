# PATCH-333 — Calendar import and "keep updated" on the standalone Scheduler board

## Why
Owner, 2026-10-09: the standalone Scheduler board should have the same
"Scheduler  [Calendar]" title bar as the Kanban panels, with the same
calendar import / keep-updated feature. The owner has APPLIED
`supabase/migrations/20261009120000_calendar_subscriptions_any_board_editor.sql`:
`kanban_calendar_subscriptions` policies now also admit
`public.can_edit_board(canvas_id)` (owner + editor collaborators), so a
standalone Scheduler board's editors can save calendar links. No more SQL.

## How the standalone board stores entries (read before coding)
An entry is a `padlets` row: `type = 'container'`, `board_id`, `title`,
`content`, position/size, and `metadata.start_date` / `metadata.end_date`
(ISO) plus `metadata.isAllDay` (see `handleCreateSchedulerPadlet` in
CanvasClient and the `events` memo in StandaloneSchedulerCanvas). Posts
inside an entry have `metadata.parentId = <entry id>`. The `padlets` insert/
update/delete policies admit the board owner and editor collaborators, so
the caller's own client can write them.

## Design
### 1. Engine for Scheduler boards — new `lib/server/scheduler/calendarSchedulerSync.ts`
Same contract and rules as `syncCalendarSubscription` (PATCH-328: caller's
client only; decrypt → fetch → parse with `includeSourceKey`; failure → no
writes + `last_error`; returns `{ added, updated, removed, unchanged }`),
but the "cards" are entries:
- An entry made from a calendar has `metadata.calendarSubscriptionId` and
  `metadata.calendarEventKey` (64-hex). Find them with
  `.eq('board_id', boardId).eq('metadata->>calendarSubscriptionId', subId)`.
- New key → insert an entry: `type 'container'`, title = event title,
  content = [`Location: …`] + description (blank-line separated, omitted
  parts dropped), position 0/0, size 280×180, metadata
  `{ start_date, end_date, isAllDay, calendarSubscriptionId,
  calendarEventKey }`. Timed events: the UTC instants. All-day events:
  store them EXACTLY the way the board's own all-day entries are stored
  (find how the canvas sets `isAllDay` and its dates; use the browser's
  `timeZone` sent with the request for local midnights) — the result must
  render as an all-day bar on the right days.
- Known key → update only title, content and the three date fields (merge
  into the existing metadata; keep every other metadata key, e.g. colour).
- Key gone → remove, with the same window/truncation guards as PATCH-328,
  BUT an entry that has posts inside it (`metadata.parentId = entry id`)
  is never deleted: unlink it instead (remove the two calendar keys from its
  metadata) so the user's content stays. Count it in `removed`.
- Duplicate keys (two editors syncing at once — there is no unique index on
  posts): at the start of each sync keep the oldest entry per key and remove
  the others (same "has posts inside → unlink" rule).

### 2. Routes
`app/api/boards/[id]/calendar-subscriptions/…` accept boards with
`layout = 'kanban'` OR `'scheduler'` (404 otherwise) and dispatch to the
right engine. `POST` (connect) on a Scheduler board takes no `columnId`.
`DELETE /[subId]` on a Scheduler board first removes the subscription's
entries (same "has posts inside → unlink" rule) and returns
`{ removedEntries, keptEntries }`, then deletes the row.
One-time import on a Scheduler board (file, or link with keep-updated off):
new `POST /api/boards/[id]/calendar-import/apply { icsText | url,
timeZone }` (same auth, limits, URL guard and messages as
`calendar-import`) that creates entries with the same engine code but WITHOUT
calendar keys; returns `{ added }`. Duplicates: skip an event whose title +
start + end equal an existing entry on the board.

### 3. The window, generalised (no fork)
`CalendarImportModal` must work outside the Kanban provider. Give it a
`target` prop: `{ kind: 'kanban' }` (today's behaviour, unchanged) or
`{ kind: 'scheduler', boardId, onChanged }`. For `scheduler`: no column
picker; preview shows the duplicate count from the board's entries (the
server can compute it, or pass the entries in); Import calls `/apply` or the
subscription POST; `onChanged()` lets the canvas reload its posts. Strings:
the modal's text hook must not require the Kanban provider (make the i18n
hook work without it, defaulting to English).

### 4. Standalone canvas
- Title bar: "Scheduler" + the Calendar button (same look/attributes as the
  Gantt/Scheduler panel buttons, `data-calendar-import-open="standalone"`),
  shown only when the board is editable (`readOnly` false).
- Auto-update: the same once-per-mount logic as `KanbanCalendarAutoSync`
  (GET, then `sync` with `ifOlderThanSeconds: 3600` and the browser time
  zone, one after another, silent), only when editable; if anything changed,
  reload the posts (CanvasClient passes a refresh callback; it already has
  `fetchData`).
- Entries from a calendar show a small calendar icon in the event (title
  "From a connected calendar"); the entry's own editor/popup shows the same
  grey note as Kanban cards.

### 5. Settings → Integrations
Already lists any board; make sure the Disconnect confirm says "entries"
for Scheduler boards ("Its entries will be removed from <board>; entries
with posts inside are kept").

## Tests
- Engine: add / update (metadata merged, other keys kept) / remove; entry
  with children is unlinked, not deleted; truncated → no removal; before
  window → kept; duplicates collapsed; all-day dates; failure → no writes.
- Routes: kanban and scheduler accepted, others 404; scheduler POST without
  columnId; DELETE counts; /apply creates entries without keys, skips
  duplicates, URL never in responses/logs.
- Modal: scheduler target renders without the Kanban provider; no column
  picker; calls the right endpoints.
- Standalone: button only when editable; auto-sync only when editable.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live with a
calendar I control (connect, change, Update now, an entry with a post
inside, disconnect) on a throwaway standalone Scheduler board ONLY.

## Allowed files
new lib/server/scheduler/calendarSchedulerSync.ts,
lib/server/kanban/calendarSync.ts (only to share helpers),
app/api/boards/[id]/calendar-subscriptions/** ,
new app/api/boards/[id]/calendar-import/apply/route.ts,
components/kanban-canvas/CalendarImportModal.tsx,
components/kanban-canvas/useKanbanI18n.ts (provider-free + strings),
components/canvas/StandaloneSchedulerCanvas.tsx,
components/canvas/scheduler-theme.css,
app/dashboard/canvas/[id]/CanvasClient.tsx (pass a refresh callback and the
board id to the standalone canvas only),
app/dashboard/settings/integrations/page.tsx (confirm wording only),
and tests. No SQL, no git.

## Addendum 1 — live findings
1. **A failed update shows "Calendar is up to date".** The sync route returns
   200 with `{ added: 0, updated: 0, removed: 0, reason }` when the engine
   fails (bad link, upstream error, not a calendar …), and the modal's
   "Update now" only looks at the counts. Fix: when `reason` is present the
   route answers with an error status (502 for upstream/network/blocked
   reasons, 422 for `not_a_calendar`, 503 for `missing_key`/`unavailable`)
   and a plain-words `error` (same wording family as PATCH-326, never the
   link); the modal shows it in its error line and the connected-calendars
   list shows the error. Auto-sync stays silent. Applies to Kanban and
   Scheduler boards. Tests for both.
2. **Disconnect wording on a Scheduler board.** The board's own modal says
   "Its N cards will be removed from this board." On a Scheduler board say
   "Disconnect {host}? Its N entries will be removed from this board.
   Entries with posts inside are kept." (Kanban wording unchanged.)
3. **Always fetch the calendar fresh.** In `fetchIcsText` pass
   `cache: 'no-store'` and the request header `Cache-Control: no-cache`
   (live: a CDN in front of a test calendar served a 46-second-old copy;
   asking intermediaries for a fresh copy costs nothing). Test: the options
   reach `fetchImpl`.

## Addendum 2 — two small things (live)
1. "Its 1 entries will be removed" / "Its 1 cards …": singular for 1 in
   both disconnect messages (entry/card), plural otherwise.
2. After a failed "Update now" the connected-calendars row still says
   "Updated 1 min ago": reload the list after a failure too, and when
   `lastError` is set show the plain-words error in that row (instead of /
   next to "Updated …").
