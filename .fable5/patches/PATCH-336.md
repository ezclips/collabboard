# PATCH-336 — Scheduler entries: the top "=" handle resizes the start time

## Why
Owner, 2026-10-10 (screenshot of a split entry "English - C1/2", 14:45–15:30):
after splitting an entry you cannot pull its top "=" handle up; the only way
is to move the whole entry up and then stretch the bottom down. "Change it so
you can do it both ways by = the icon up or down."

## Cause (measured live, throwaway Scheduler board, 1 h entry, hovered)
react-big-calendar's drag-and-drop addon renders two resize anchors inside the
event: `.rbc-addons-dnd-resize-ns-anchor` first (top, start time) and last
(bottom, end time), each 3 px tall with z-index `auto`. Our `CustomEvent` tab
(`[data-scheduler-event-tab]`, `position: relative`) sits between them in the
DOM, so it paints over the TOP anchor:
- `elementFromPoint` on the top "=" → the event tab, not the anchor;
- dragging the top "=" up 40 px moved the whole entry (top 603→563, height
  38→38) instead of resizing it;
- the bottom anchor comes after the tab, is on top, and works.

## Design (standalone Scheduler, `components/canvas/scheduler-theme.css`)
1. Both resize anchors sit above the event content:
   `.scheduler-wrapper .rbc-addons-dnd-resize-ns-anchor { z-index: 6; }`
   (above the day-span handles' `zIndex: 5`, which are vertical strips at the
   left/right edges and do not overlap the top/bottom anchors).
2. Make them easier to grab without changing their look: each anchor gets a
   6 px tall transparent grab area with `cursor: ns-resize`; the visible "="
   icon (3 px double line, 10 px wide) stays centred in it, shown on hover as
   today. Top anchor's area hugs the top edge, bottom anchor's the bottom.
3. Dragging the top "=" up makes the entry start earlier (longer); down makes
   it start later (shorter). The library's existing resize → our
   `onEventResize` (`handleEventMoveOrResize`) already saves start/end; no
   logic change expected — if something in the save path ignores a changed
   start, fix it there.
4. Do not change month-view / all-day (east–west) anchors.

Also check `components/scheduler-canvas/SchedulerCanvas.tsx` (the Scheduler
inside Kanban): if its event content covers the top anchor the same way, apply
the same rule in `components/scheduler-canvas/scheduler.css`
(`.scheduler-shell`). If it is not covered, leave it.

## Tests
Source test on the CSS: the ns anchor rule has a z-index above 5 and
`cursor: ns-resize`, scoped to `.scheduler-wrapper` (and `.scheduler-shell`
if changed). If the resize handler is touched, a unit test that a resize with
an earlier start saves the new start and keeps the end.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live on a
throwaway board: top "=" up 40 px → starts 1 h earlier, end unchanged (saved
after reload); top "=" down → starts later; bottom "=" still works; dragging
the middle still moves the entry.

## Allowed files
components/canvas/scheduler-theme.css, components/scheduler-canvas/scheduler.css,
components/canvas/StandaloneSchedulerCanvas.tsx (only if the save path needs
it), and tests. No SQL, no git.
