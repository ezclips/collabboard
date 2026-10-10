# PATCH-334 — Gantt / Scheduler calendar button looks exactly like Kanban's "Import"

## Why
Owner, 2026-10-10: "use the same button as in Kanban in Scheduler and Gantt"
(screenshot: the Kanban toolbar's calendar icon + "Import").

Measured live:
- Kanban Import (`.kanban-toolbar-btn`): text "Import", 14px / 400, colour
  rgb(23,23,23), transparent background, NO border, radius 6px, padding
  8px 12px, gap 6px, lucide Calendar icon 16×16 stroke 2, no hover change.
- Gantt / Scheduler / standalone Scheduler button today (`.gantt-calendar-btn`,
  `.scheduler-calendar-btn`): text "Calendar", 12px, #334155, white
  background, 1px #cbd5e1 border, radius 4px, padding 4px 8px, icon 14×14.

## Change
In all three places (components/gantt-canvas/GanttCanvas.tsx,
components/scheduler-canvas/SchedulerCanvas.tsx,
components/canvas/StandaloneSchedulerCanvas.tsx):
- Label "Import" (reuse the Kanban i18n `import` string), Calendar icon at
  16px. Keep `title`, `data-calendar-import-open`, and the editors-only rule.
- CSS (gantt.css, scheduler.css, scheduler-theme.css): same values as the
  Kanban button — transparent background, no border, radius 6px, 14px,
  rgb(23,23,23), gap 6px — except vertical padding 4px (horizontal 12px) so
  the panel title bars keep their current height (the padding is invisible
  without a border). Keep a visible keyboard focus outline.
- Remove the now-unused `calendarButton` string only if nothing else uses it.

## Tests
Update the existing button tests (label "Import"; still editors-only; still
opens the modal).

## Allowed files
The three components, the three CSS files, useKanbanI18n.ts (only removing
the unused string), and their tests. No git.
