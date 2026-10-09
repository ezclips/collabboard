# PATCH-330 — Gantt week dates on click/hover; calendar button in Gantt and Scheduler

## Why
Owner, 2026-10-09:
1. The Gantt shows "Week #41" (Week zoom) / "W41" (Month zoom). The date range
   popover exists (PATCH-era `.gantt-week-range-popover`) but only opens on
   RIGHT-click, so users who don't know week numbers never find it. Owner
   chose: normal click + hover.
2. The calendar connection (Import / Update now / Disconnect, PATCH-326..329)
   is only in the Kanban toolbar, so it cannot be reached when only the
   Scheduler (or only the Gantt) is open (PATCH-325 views). Owner chose: the
   same button in the Scheduler toolbar; I add it to the Gantt toolbar too
   for the same reason.

## Design
### 1. Week range (components/gantt-canvas/GanttCanvas.tsx, GanttConfig.ts)
- GanttConfig: both week templates add `title="<label>: <range>"` (escaped,
  e.g. `Week #41: Oct 5 – Oct 11, 2026`) to the `.gantt-week-scale-label`
  span → native hover tooltip. Add `cursor: pointer` for it in gantt.css.
- GanttCanvas: open the same popover on a LEFT click on
  `[data-gantt-week-range]` (a `click` listener on the container, same
  handler body as the contextmenu one). Keep right-click working. Make sure
  the window `pointerdown` dismiss does not immediately close a popover that
  the same click opened (the popover opens on `click`, after `pointerdown`,
  so it should already be fine — verify with a test). A second click on the
  same week closes it.
- dhtmlx must not do anything else on that click (no sort, no selection).

### 2. Calendar button in the Gantt and Scheduler toolbars
- `components/scheduler-canvas/SchedulerCanvas.tsx` `.scheduler-toolbar` and
  `components/gantt-canvas/GanttCanvas.tsx` `.gantt-toolbar`: a small button
  next to the title — Calendar icon + "Calendar", `title="Import or connect a
  calendar"`, `data-calendar-import-open="scheduler"` / `"gantt"` — shown
  only when the board is editable (`useKanbanReadonly()` false). Style it
  like the Gantt zoom buttons (12px, same border/padding).
- It opens the existing `CalendarImportModal` (same component, same
  behaviour; it already lives under the KanbanProvider in both places).
  Do not fork the modal.
- The Kanban toolbar button stays as it is.

## Tests
- Gantt: left click on a week label opens the popover with that week's
  range; right click still does; a second click closes; the label has the
  `title` attribute (both zoom levels).
- Scheduler and Gantt toolbars: the Calendar button renders for editors,
  not for readonly; clicking opens `CalendarImportModal`.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live: click
"Week #41" in Week and Month zoom; open the calendar window from the
Scheduler-only and Gantt-only views.

## Allowed files
components/gantt-canvas/GanttCanvas.tsx, GanttConfig.ts, gantt.css,
components/scheduler-canvas/SchedulerCanvas.tsx, scheduler.css (button style
only), components/kanban-canvas/useKanbanI18n.ts (strings only), and tests.
No git, no database.

## Addendum 1 — the week range shows 8 days
Live: Week #41 shows "5-12 October 2026"; the week is Mon 5 – Sun 11.
`formatWeekRangeLabel` (components/gantt-canvas/dateUtils.ts) uses
`getDate() + 7` for the end — must be `+ 6` (the last day of the week, not
the first day of the next). Fix it and add tests: Week #41 2026 →
"5-11 October 2026"; a week across months (28 Sep 2026 → "28 September-4
October 2026"); a week across years (28 Dec 2026 → "28 December 2026-3
January 2027"). Allowed: dateUtils.ts and its test.
