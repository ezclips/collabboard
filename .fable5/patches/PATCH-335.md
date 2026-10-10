# PATCH-335 — Short Scheduler entries: text centred, not clipped at the bottom

## Why
Owner, 2026-10-10 (screenshot of imported entries "Chat" and "1 item  English
Lesson 1 (New Series)"): the text sits at the bottom of the box. "Make sure the
text stays in the middle and not on the bottom of the box unless there is a
reason for it."

## Cause (measured live, throwaway Scheduler board, Week view)
| Entry | `.rbc-event` box | padding | text row inside the box |
|---|---|---|---|
| 30 min "Chat" | 20 px | 4px 8px | top 4 px, height 20 px → ends at 24 px, **4 px past the bottom, clipped** |
| 1 h | 38 px | 4px 8px | top 4 px, height 20 px → sits in the top half |
| 2 h | 78 px | 4px 8px | title at the top (fine) |

`.scheduler-wrapper .rbc-event { padding: 4px 8px }` (scheduler-theme.css)
plus the event tab's `min-h-[20px]` (StandaloneSchedulerCanvas `CustomEvent`)
do not fit a 20 px box, so a 30-minute entry's text is pushed to and past the
bottom edge.

## Decision (PM)
- **Short entries (the one-line layout, `isShort`)**: the text row is
  **vertically centred** in the box and never clipped. This covers 30-minute
  and 1-hour entries.
- **Tall entries** keep the title **at the top**, on purpose: that is how
  Google and Outlook show long events, the title may wrap over several lines,
  and the "N items" badge sits bottom-left. Unchanged.

## Design
Standalone Scheduler only (the Kanban Scheduler uses the library's default
event and is not affected).
1. Time-grid entries (`.scheduler-wrapper .rbc-day-slot .rbc-event` and the
   same for `.rbc-time-view` events) get **no vertical padding** (keep 8px
   left/right). Month view / all-day row events are unchanged.
2. `CustomEvent`, short layout: the tab fills the box height and centres its
   row vertically (flex, `items-center`); drop the `min-h-[20px]` that made a
   20 px box overflow (keep a minimum only if it cannot exceed the box).
   Icon, "N items" badge and title stay on the one row as today; the title
   still truncates with an ellipsis.
3. `CustomEvent`, tall layout: keep the title at the top with the same visual
   top inset as today (4 px), now applied inside the tab since the box no
   longer pads it. Badge stays bottom-left.
4. Nothing else changes: drag, resize handles, day-span handles, context
   menu, colours, the calendar badge.

## Tests
`components/canvas/StandaloneSchedulerCanvas.eventClick.behavior.test.tsx` (or
a new focused test file next to it):
- short layout: the tab's row has the centring classes (flex + items-center)
  and no `min-h-[20px]`;
- tall layout: title first, badge absolutely bottom-left (as today);
- a source test on scheduler-theme.css: time-grid `.rbc-event` vertical
  padding is 0, month/all-day events untouched.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live on a
throwaway Scheduler board with 30 min / 1 h / 2 h entries: the text's centre
within ±1 px of the box's centre for 30 min and 1 h, fully inside the box;
2 h title at the top.

## Allowed files
components/canvas/StandaloneSchedulerCanvas.tsx (CustomEvent only),
components/canvas/scheduler-theme.css, and tests. No SQL, no git.

## Addendum 1 — live finding
With the box padding gone, a 1-hour entry's tab is 38 px, which is over the
`isShort` threshold (`height < 36`), so it takes the tall layout and its title
sits at the top. One-hour entries must be centred too: raise the threshold to
`height < 44` (one line plus the badge fits; a 1 h entry is 38–40 px, 2 h is
78 px). Keep it a named constant with a one-line comment. Test: a 40 px tab
renders the short (centred) layout, a 78 px tab the tall one.
