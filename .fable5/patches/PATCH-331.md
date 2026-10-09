# PATCH-331 — Schedulers: board title, "Week 41" label, Monday weeks, readable dates

## Why
Owner, 2026-10-09, on the standalone Scheduler board:
- "Scheduler canvas has no title."
- The toolbar label "October 04 – 10" repeats the day headings right under it;
  it should show the week number instead (dates on hover/click, like the
  Gantt since PATCH-330).
- "What is this?" about Agenda: "10/09/2026 – 11/08/2026" (US format) and an
  unpadded "There are no events in this range." flush at the left edge.

Found while checking: the Gantt's weeks are ISO (Monday–Sunday, Week #41 =
5–11 Oct 2026) but both Schedulers start weeks on Sunday (4–10 Oct), so a
"Week 41" label would name different days in the two views. PM decision:
both Schedulers use Monday-first weeks.

Applies to BOTH calendars: the standalone Scheduler board
(`components/canvas/StandaloneSchedulerCanvas.tsx`) and the Scheduler inside
Kanban (`components/scheduler-canvas/SchedulerCanvas.tsx`).

## Design
### 1. Monday-first weeks, without touching global moment
New `lib/scheduler/schedulerLocalizer.ts`: register a moment locale
`en-monday` = `parentLocale: 'en'`, `week: { dow: 1, doy: 4 }` — and restore
the previous global locale right after (`moment.defineLocale` switches the
global locale; nothing else in the app may change). Export the
`momentLocalizer(moment)` and `SCHEDULER_CULTURE = 'en-monday'`. Both
calendars pass `culture={SCHEDULER_CULTURE}` and use that localizer.
Test: after import, `moment.locale()` is unchanged; a week view of
9 Oct 2026 spans Mon 5 – Sun 11.

### 2. A shared toolbar — new `components/scheduler-canvas/SchedulerToolbar.tsx`
Passed as `components.toolbar` to both calendars. Same buttons and order as
today (Today / Back / Next on the left; the view buttons on the right — the
standalone board keeps Month/Week/Day/Agenda, Kanban keeps Week/Day/Month),
same classes (`rbc-toolbar`, `rbc-btn-group`, `rbc-active`) so the existing
CSS keeps styling them. The centre label:
- **Week view:** "Week 41" — the ISO week number of the shown week (reuse
  `getIsoWeekNumber` / `formatWeekRangeLabel` from
  components/gantt-canvas/dateUtils.ts; move them to a shared lib file if an
  import across canvases is awkward, keeping the Gantt using the same code).
  `title="Week 41: 5-11 October 2026"`, `cursor: pointer`, and a click toggles
  a small popover with the range (same look as `.gantt-week-range-popover`);
  Escape / outside click closes it.
- **Day view:** "Friday, 9 October 2026".
- **Month view:** "October 2026".
- **Agenda view:** "9 October – 8 November 2026" (no US numeric dates).

### 3. Standalone board title
`StandaloneSchedulerCanvas` gets a `title` prop (CanvasClient passes
`canvas.title || 'Untitled canvas'`) and renders a title bar above the
calendar with the same look as the Kanban Scheduler's `.scheduler-toolbar`
(13px, weight 600, #334155, light bar, bottom border). The calendar height
calculation must account for the bar (no clipped last row).

### 4. Agenda readability (standalone)
In scheduler-theme.css: padding around the agenda table and the empty
message (`.rbc-agenda-empty`: 16px padding, #64748b), and the agenda
date/time columns use the readable formats via the localizer `formats`
(`agendaDateFormat: 'ddd D MMM'`, `agendaTimeRangeFormat` 24-hour
`HH:mm – HH:mm`).

## Tests
- Localizer: global locale unchanged; Monday-first week range.
- Toolbar: labels for week/day/month/agenda; week label title + click
  popover toggles; buttons still call onNavigate/onView; the right view set
  per calendar.
- Standalone: the title bar renders the board title.
- Existing scheduler behaviour tests stay green.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live on a
standalone Scheduler board and the Kanban Scheduler.

## Allowed files
new lib/scheduler/schedulerLocalizer.ts, new
components/scheduler-canvas/SchedulerToolbar.tsx,
components/canvas/StandaloneSchedulerCanvas.tsx,
components/canvas/scheduler-theme.css,
components/scheduler-canvas/SchedulerCanvas.tsx,
components/scheduler-canvas/scheduler.css,
components/gantt-canvas/dateUtils.ts (only to share helpers),
app/dashboard/canvas/[id]/CanvasClient.tsx (only the `title` prop on
StandaloneSchedulerCanvas), and tests. No git, no database.

## Addendum 1 — weeks still start on Sunday (live)
Live: both calendars still show "04 Sun … 10 Sat" while the label popover
says 5–11 Oct. Cause: react-big-calendar's moment localizer computes the
week range with `moment(date).startOf('week')` / `firstVisibleDay` using the
GLOBAL moment locale; the `culture` prop only reaches `firstOfWeek`, which
the week/month ranges do not use.
Checked: `moment` is imported ONLY by the scheduler files
(StandaloneSchedulerCanvas, SchedulerToolbar, schedulerLocalizer). So:
- In `lib/scheduler/schedulerLocalizer.ts` use
  `moment.updateLocale('en', { week: { dow: 1, doy: 4 } })` (idempotent,
  no defineLocale, no HMR warning). Keep exporting the localizer; the
  `culture` prop and the `en-monday` locale can go; SchedulerToolbar uses
  plain `moment(date).startOf('week')`.
- Add a source test that fails if any file outside the scheduler files
  imports `moment`, with a message explaining the global week setting.
- Tests: week of 9 Oct 2026 spans Mon 5 – Sun 11; month view of Oct 2026
  starts on Mon 28 Sep.
