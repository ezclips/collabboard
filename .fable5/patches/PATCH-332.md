# PATCH-332 — 24-hour times, "Scheduler" title, calendars in Settings → Integrations

## Why
Owner, 2026-10-09:
1. "yes switch to 24 hours" — both Schedulers still show "6:00 AM".
2. The standalone Scheduler board's title bar shows the board name
   ("Untitled board"); the owner wants it to read "Scheduler", like the
   Gantt/Scheduler panels in Kanban ("Gantt  [Calendar]"). (The Calendar
   button for the standalone board follows in PATCH-333 — it needs a
   database policy change.)
3. Connected calendars should also appear in Settings → Integrations, next
   to Google Drive / OneDrive, for consistency.

## Design
### 1. 24-hour times (both calendars)
`lib/scheduler/schedulerLocalizer.ts` exports `SCHEDULER_FORMATS`, passed as
`formats` to both calendars (merge with any formats they already pass):
`timeGutterFormat: 'HH:mm'`, `eventTimeRangeFormat` → `HH:mm – HH:mm`,
`eventTimeRangeStartFormat` → `HH:mm –`, `eventTimeRangeEndFormat` →
`– HH:mm`, `selectRangeFormat` → `HH:mm – HH:mm`, `agendaTimeFormat:
'HH:mm'`, `agendaTimeRangeFormat` → `HH:mm – HH:mm`. Keep the day headings
as they are ("05 Mon"). Any time the standalone canvas formats itself
(popovers, tooltips, the slot highlight) also uses 24-hour `HH:mm`.

### 2. Standalone title bar text
The bar added in PATCH-331 shows "Scheduler" (same style as the Kanban
panels). Drop the `title` prop from StandaloneSchedulerCanvas and its
CanvasClient wiring again. Leave room on the right of the title for the
PATCH-333 button (a flex row like `.gantt-toolbar-left`).

### 3. Calendars in Settings → Integrations
- New `GET /api/settings/calendar-subscriptions` (same auth pattern as
  `app/api/settings/integrations/route.ts`: Bearer token →
  `makeAuthedClient`). Reads `kanban_calendar_subscriptions` where
  `created_by = user` (RLS still applies) joined with the board title:
  `[{ id, boardId, boardTitle, urlHost, lastSyncedAt, lastError }]`.
  Never the ciphertext.
- `app/dashboard/settings/integrations/page.tsx`: a "Calendars" card under
  the existing list (same row style). Each row: calendar icon, host,
  "on <board title>" (a link to `/dashboard/canvas/<boardId>`), "Updated 5
  min ago" or the error in plain words, and a Disconnect button that calls
  the existing `DELETE /api/boards/[id]/calendar-subscriptions/[subId]`
  after a confirm ("Its cards will be removed from <board>"). Empty state:
  "No calendars connected. Connect one on a board: Import in the Kanban
  toolbar, or the Calendar button in the Gantt or Scheduler."
- `CalendarImportModal`: a small link at the bottom, "All connected
  calendars" → `/dashboard/settings/integrations` (a real `<a href>`).

## Tests
- Formats: 06:00 / 18:30 render as "06:00" / "18:30"; event range string.
- Standalone title bar text is "Scheduler".
- Settings route: 401 without token; returns only the caller's rows; no
  `url_ciphertext` in the response.
- Integrations page: renders rows, link to the board, empty state;
  Disconnect calls the DELETE route after confirm.
- Modal: the settings link exists.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live.

## Allowed files
lib/scheduler/schedulerLocalizer.ts, components/canvas/StandaloneSchedulerCanvas.tsx,
components/scheduler-canvas/SchedulerCanvas.tsx, components/canvas/scheduler-theme.css,
app/dashboard/canvas/[id]/CanvasClient.tsx (only removing the title prop),
new app/api/settings/calendar-subscriptions/route.ts,
app/dashboard/settings/integrations/page.tsx,
components/kanban-canvas/CalendarImportModal.tsx (the link only),
components/kanban-canvas/useKanbanI18n.ts (strings), and tests.
No git, no database.
