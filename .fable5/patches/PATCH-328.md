# PATCH-328 — Keep a Kanban board updated from a calendar link (one way)

## Why
Owner decision 2026-10-08: calendar cards only mirror project deadlines; the
user's calendar stays the source of truth. A board can remember a calendar
link; an update adds new events, moves/renames changed ones, and REMOVES the
card of an event that was deleted or cancelled. Never writes to the calendar.

**Database: already applied by the owner** —
`supabase/migrations/20261008120000_kanban_calendar_subscriptions.sql`
(read it first). Table `kanban_calendar_subscriptions` (url_ciphertext,
url_host, target_column_id, target_swimlane_id, last_synced_at, last_error;
RLS = board members with permission_level edit/admin) and on `kanban_cards`:
`calendar_subscription_id` (FK, ON DELETE CASCADE) + `calendar_event_key`
(64 lowercase hex, required together), unique per subscription. Do not write
any new SQL.

## Rules
- All reads/writes through the CALLER's Supabase route client (RLS decides).
  Never the admin/service client.
- The link is a secret: encrypt before insert, never return the ciphertext or
  the link to the browser, never log either. `last_error` holds a reason
  code only (`upstream_error`, `not_a_calendar`, `blocked_host`, …).
- Cipher: new `lib/server/kanban/calendarLinkCipher.ts` wrapping
  `lib/security/tokenCipher.ts`, but STRICT: refuse (`missing_key`) unless
  `INTEGRATIONS_TOKEN_ENCRYPTION_KEY` is set (no fallback to other secrets),
  and on decrypt refuse anything not starting with `v1.` (no plaintext
  passthrough). Route maps `missing_key` → 503 "Calendar links are not
  configured on this server."
- Event key = SHA-256 hex of `<UID>|<occurrence start>` (all-day: the date;
  timed: the UTC ISO instant), computed on the server. The UID itself never
  leaves the server and is never stored.

## Design
### 1. Shared mapping (no duplication)
- `lib/kanban/icsImport.ts`: `parseIcsEvents(text, { now, includeSourceKey })`
  — with `includeSourceKey: true` each event also carries `sourceKey`
  (`UID|occurrence`); default false, so the PATCH-326 import route output is
  unchanged.
- Move the event → card-field mapping that `CalendarImportModal` does today
  (label, local start/end dates, `HH:MM–HH:MM` first line, `Location:` line,
  description) into a pure `eventToCardFields(event, timeZone)` in
  `lib/kanban/calendarEventMapping.ts` (Intl with an explicit `timeZone`).
  The modal uses it with the browser zone; the server uses the zone the
  browser sends. Behaviour of the modal must not change.
- Dates are written exactly as the store writes them
  (`normalizeDateInput(...)` of `YYYY-MM-DD` into `date_started`/`date_due`).

### 2. Sync engine — `lib/server/kanban/calendarSync.ts`
`syncCalendarSubscription(client, subscription, { timeZone, now })`:
1. Decrypt, `fetchIcsText`, check `BEGIN:VCALENDAR`, `parseIcsEvents(…,
   includeSourceKey)`. Any failure → no card changes; set `last_error`;
   return the reason.
2. Read this subscription's cards (`id, calendar_event_key, title, content,
   date_started, date_due`).
3. New key → insert card: target column (fallback: first column of the
   board by order; none → error `no_column`), target swimlane or null,
   `order_index` after the column's last card, priority 0, progress fields
   default, `calendar_subscription_id`, `calendar_event_key`. Insert in
   chunks of 100; on unique violation (23505 — another editor synced at the
   same moment) retry that chunk row by row and skip duplicates.
4. Known key → update ONLY title, content, date_started, date_due, and only
   when one of them differs. Never touch column, swimlane, order, status,
   priority, progress, colour, assignees, comments.
5. Key no longer in the feed → delete the card, BUT only when
   (a) the parse was not truncated, and (b) the card's `date_due` (or
   `date_started` if no due) is on/after the parse window start (now − 30
   days). Older cards fell out of the window, not out of the calendar —
   keep them.
6. Set `last_synced_at = now`, `last_error = null`.
7. Return `{ added, updated, removed, unchanged }`.

### 3. Routes (`app/api/boards/[id]/calendar-subscriptions/…`)
Auth → 401; board must exist and be `layout = 'kanban'` (caller's client)
→ 404 otherwise; reuse the PATCH-326 in-memory limiter (10/min/user).
- `GET` → `[{ id, urlHost, targetColumnId, lastSyncedAt, lastError,
  cardCount }]`. Readers get `[]` (RLS).
- `POST { url, columnId, swimlaneId?, timeZone }` → validate `timeZone`
  (Intl; invalid → 400), max 5 subscriptions per board (409), FIRST fetch
  and parse the link (failure → same messages as PATCH-326, nothing saved),
  then encrypt + insert (`created_by = user.id`, `url_host` = hostname), then
  run the sync → `{ id, urlHost, added, updated, removed }`.
- `POST /[subId]/sync { timeZone, ifOlderThanSeconds? }` → with
  `ifOlderThanSeconds`, first CLAIM atomically: `update … set
  last_synced_at = now() where id = subId and (last_synced_at is null or
  last_synced_at < now − n)` returning the row; nothing returned →
  `{ skipped: true }`. Without it (the "Update now" button) always sync.
- `DELETE /[subId]` → delete the row (the FK cascade removes its cards)
  → `{ removedCards }` (count read before deleting).

### 4. UI
- `CalendarImportModal`, "Calendar link" tab: checkbox "Keep this calendar
  updated" (default ON). On → the import button calls the subscription POST
  instead of the per-card loop; toast "Calendar connected · N events added".
  Off → today's one-time import, unchanged. The file tab is unchanged
  (one-time).
- Same modal, top: "Connected calendars" list (only when there is one):
  host, "Updated 5 min ago" / the error in plain words, "Update now",
  "Disconnect". Disconnect asks with the existing `ConfirmModal`:
  "Disconnect calendar.google.com? Its N cards will be removed from this
  board." Toast after Update now: "Calendar updated · 2 added, 1 changed,
  1 removed" (or "Calendar is up to date").
- Auto-update: new `components/kanban-canvas/KanbanCalendarAutoSync.tsx`,
  rendered inside `KanbanProvider` in `KanbanShell` (so it runs whichever
  views are open), only when the board is editable. On mount: GET, then for
  each subscription (one after another) `sync` with
  `ifOlderThanSeconds: 3600` and the browser time zone. Silent: no toast;
  failures only show in the modal list. Runs once per mount.
- Card mapping in the store: read `calendar_subscription_id` into a read-only
  `calendarSubscriptionId` on the Card (never written back —
  `sanitizeCardPayload` already drops unknown keys; keep it that way, and
  make sure Duplicate produces a plain card without it).
- Card face: a small Calendar icon (title "From a connected calendar") on
  cards with `calendarSubscriptionId`. Editor: one grey line under the title
  "From a connected calendar — title, dates and description are updated from
  the calendar."
- Realtime already refetches on `kanban_cards` changes; after a manual
  update or connect, also trigger the store's reconcile so the board updates
  at once.

## Tests
- Cipher: missing key → `missing_key`; plaintext / non-`v1.` → refused;
  round trip.
- Mapping: `eventToCardFields` with explicit zones (Europe/Berlin,
  America/New_York) — dates and time line; the modal still produces the
  same cards as before (existing tests stay green).
- Sync engine (mock client): add / update-only-changed / remove; protected
  fields untouched; truncated feed → no deletes; card before the window →
  not deleted; fetch failure → no writes + last_error; 23505 chunk → row by
  row, duplicates skipped; keys are 64-hex and the UID never appears in any
  write.
- Routes: 401; non-kanban 404; bad timeZone 400; 6th subscription 409; bad
  link → nothing inserted; claim skip → `{ skipped: true }`; response and
  console never contain the URL or ciphertext (spy); DELETE returns count.
- UI: checkbox default on; connected list renders; Disconnect confirm text
  with count; auto-sync runs only when editable and passes ifOlderThan 3600.

## Verification
Focused tests, full vitest gate (26-file baseline), `npx tsc --noEmit`. I
verify live with a real public calendar link and a link I can change.

## Allowed files
lib/kanban/icsImport.ts, new lib/kanban/calendarEventMapping.ts, new
lib/server/kanban/calendarLinkCipher.ts, new lib/server/kanban/calendarSync.ts,
new app/api/boards/[id]/calendar-subscriptions/route.ts,
new app/api/boards/[id]/calendar-subscriptions/[subId]/route.ts,
new app/api/boards/[id]/calendar-subscriptions/[subId]/sync/route.ts,
app/api/boards/[id]/calendar-import/route.ts (only to share the limiter),
components/kanban-canvas/CalendarImportModal.tsx, new
components/kanban-canvas/KanbanCalendarAutoSync.tsx,
components/collabboard/canvas/ui/KanbanShell.tsx (mount the auto-sync only),
components/kanban-canvas/store.tsx (read the field + reconcile hook only),
components/kanban-canvas/Card.tsx (the icon), components/kanban-canvas/Editor.tsx
(the grey line), types/kanban-canvas.ts (the read-only field),
components/kanban-canvas/useKanbanI18n.ts (strings), and tests.
No SQL, no git writes.

## Addendum 1 — calendar links get their OWN key (live finding)
Live: connecting returns 503 because `INTEGRATIONS_TOKEN_ENCRYPTION_KEY` is
not set. Setting it now is NOT safe: `tokenCipher` currently derives its key
from the fallback (`OAUTH_STATE_SECRET` / service role key), so existing
Google Drive / OneDrive tokens would stop decrypting and every user would
have to reconnect. Therefore:
- `calendarLinkCipher.ts` no longer uses `tokenCipher`. Implement it like
  `lib/server/ai/credentialCipher.ts` (strict AES-256-GCM, `v1.` format,
  key read lazily per operation), with its own env var
  `CALENDAR_LINK_ENCRYPTION_KEY` = base64 of EXACTLY 32 bytes. No fallback
  to any other secret. Missing/bad key → `missing_key` (route 503 message
  unchanged). Decrypt refuses anything not `v1.`.
- Update its tests (missing key, wrong length, tamper → refused, round
  trip). The migration's comment naming INTEGRATIONS_TOKEN_ENCRYPTION_KEY is
  superseded by this addendum (do not edit the applied migration).

## Addendum 2 — two live findings
1. **A moved event became a new card.** Live: moving "Deadline Alpha" from
   20 to 22 Oct gave "2 added, 2 removed" — the card was deleted and
   re-created, losing the column the user had moved it to. Cause: the key
   includes the occurrence start for EVERY event. Fix in `sourceKeyOf`:
   - a NON-recurring event (no RRULE/RDATE and no RECURRENCE-ID) → key =
     SHA-256 of `<UID>` only;
   - a generated occurrence of a recurring series → `<UID>|<original
     occurrence start>` (as now);
   - an override (has RECURRENCE-ID) → `<UID>|<RECURRENCE-ID>` (as now).
   Tests: a single event whose DTSTART changes keeps its key; a weekly
   series' occurrences keep distinct keys; a moved override keeps its key.
2. **Auto-update on reload returns 503 "Unavailable"** instead of
   `{ skipped: true }`. The claim uses
   `.or('last_synced_at.is.null,last_synced_at.lt.<ISO>')`; replace it with
   two plain atomic updates, each `.select('id')`:
   (a) `update … set last_synced_at = now where id = subId and
   last_synced_at is null`; if no row, (b) the same with
   `.lt('last_synced_at', cutoff)`; still no row → `{ skipped: true }`.
   Also distinguish the 503 causes server-side by a short code in the JSON
   (`read_failed` / `claim_failed`) — never the link. Test both paths.
