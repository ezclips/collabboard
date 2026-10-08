# PATCH-324 — Kanban Scheduler uses the same font and sizes as the Gantt

## Why
Owner (2026-10-08, screenshot of a Kanban board with Gantt + Scheduler open):
the Scheduler text is a different size from the Gantt. Measured live:

| Panel | Element | Font | Size |
|---|---|---|---|
| Gantt | grid header, rows, scale | Inter, Helvetica, Arial | 14px |
| Gantt | Day/Week/Month buttons | Arial | 12px |
| Scheduler | Today/Back/Next, Week/Day/Month | Arial | 16px |
| Scheduler | date range label | Arial | 16px |
| Scheduler | day headers | Arial | 14.4px bold |
| Scheduler | time labels ("6:00 AM") | Arial | 16px |

Cause: `components/canvas/scheduler-theme.css` styles the calendar only under
`.scheduler-wrapper` (the standalone Scheduler board). The Kanban Scheduler
(`components/scheduler-canvas/SchedulerCanvas.tsx`) renders `.scheduler-shell`
with no `.scheduler-wrapper`, so it gets react-big-calendar's raw defaults
(16px inherited). Do NOT add `.scheduler-wrapper` to it: that theme sets a
`background: linear-gradient` on `.rbc-event`, which would paint over the card
colour the Kanban Scheduler sets via `backgroundColor`.

## Design — CSS only, in `components/scheduler-canvas/scheduler.css`
Every rule scoped under `.scheduler-shell` (so the standalone Scheduler board
is untouched):
- `.scheduler-shell .rbc-calendar` — `font-family: Inter, Helvetica, Arial,
  sans-serif` (the dhtmlx Gantt stack), `font-size: 14px`.
- `.scheduler-shell .rbc-toolbar` — `font-size: 14px`; `margin-bottom: 0`;
  `padding: 6px 12px`.
- `.scheduler-shell .rbc-toolbar .rbc-toolbar-label` — `font-size: 14px`.
- `.scheduler-shell .rbc-toolbar button` — same look as the Gantt zoom buttons
  (`.gantt-zoom-controls button` in gantt.css): `font-size: 12px;
  line-height: 1.2; padding: 4px 8px; color: #334155; border-color: #cbd5e1`.
  Active (`.rbc-active`): `border-color: #2563eb; color: #2563eb;
  background: #eff6ff; box-shadow: none`. Keep react-big-calendar's grouped
  button corners as they are.
- `.scheduler-shell .rbc-header` — `font-size: 14px; font-weight: 400;
  color: #555d63` (the Gantt scale cell).
- `.scheduler-shell .rbc-label` (time gutter) — `font-size: 12px`.
- `.scheduler-shell .rbc-event`, `.rbc-event-content` — `font-size: 14px`
  (do not touch background/colour).
- Month view: `.scheduler-shell .rbc-date-cell`, `.rbc-show-more`,
  `.rbc-month-view .rbc-header` — `font-size: 12px` dates / 14px headers as above.

## Tests
CSS only; jsdom applies no stylesheets, so a unit test would only restate the
rule. Verification is a live measurement (I do it).

## Verification
`npx tsc --noEmit` unaffected; I measure computed styles live on a Kanban board
with Gantt + Scheduler open, and check the standalone Scheduler board is
unchanged (13px Segoe UI theme).

## Allowed files
components/scheduler-canvas/scheduler.css only. No git writes, no database.
