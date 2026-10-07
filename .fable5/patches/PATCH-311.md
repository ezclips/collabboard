# PATCH-311 — Kanban's scheduler on react-big-calendar; dhtmlx-scheduler removed

Status: AUTHORIZED (owner, 2026-10-07: "Yes to 1 and 2 you are the PM" — 2 = replace dhtmlx-scheduler beside Kanban
with our own calendar).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode) for the code; CTO removes the dependency
Branch: `feature/board-retrieval`

## Facts (CTO)
- `dhtmlx-scheduler` 7.2.x is GPL-2.0 in every version (latest 7.2.15 too) — LESSONS_LEARNED standing risk 2. Its only
  user is `components/scheduler-canvas/SchedulerCanvas.tsx` (397 lines), rendered by `KanbanSchedulerSplit.tsx` and
  `KanbanGanttSchedulerSplit.tsx` beside a Kanban board (toggle "Show Scheduler", behind
  `NEXT_PUBLIC_ENABLE_SCHEDULER`).
- What it does today (keep all of it): week view, hours 6–22; cards with dates are events (`mapCardToEvent`);
  drag to move and resize → `actions.updateCard(id, { start_date, end_date })` as ISO strings (`toDateInput`); drag
  across empty time → `actions.addCard` in the first column (`resolveDefaultColumnId`); right-click an event →
  `SchedulerEventMenu` (Set 15/30/45/60 minutes, Split, Trim to half, Revert time setting, Duplicate, Delete, colours)
  with the existing `withMenuCard` handlers; read-only (`useKanbanReadonly`) → no drag, no create, no menu; card
  colour shows on the event.
- The Scheduler board already uses react-big-calendar 1.19 (MIT) with `momentLocalizer(moment)`, `withDragAndDrop`,
  `scheduler-theme.css` (`components/canvas/StandaloneSchedulerCanvas.tsx`). PATCH-308 lessons that apply here:
  pass a MEMOISED `components` object (an inline one remounts every event on each render); the DnD addon swallows the
  mouseup of a click on an event.

## Design — rewrite `components/scheduler-canvas/SchedulerCanvas.tsx` on react-big-calendar
- Same export (`SchedulerCanvas`, no props), same hooks (`useKanbanData`, `useKanbanPersistence`,
  `useKanbanReadonly`), same `scheduler-shell` / `scheduler-toolbar` / `scheduler-container` wrappers, same
  `SchedulerEventMenu` and every `withMenuCard` handler body unchanged.
- Calendar: `withDragAndDrop(Calendar)` with `momentLocalizer(moment)`; `views={['week','day','month']}`, default
  `week`, `min`/`max` = 06:00/22:00, `step={30} timeslots={2}`; import react-big-calendar's two stylesheets and
  `@/components/canvas/scheduler-theme.css` so both calendars look the same. Controlled `date`/`view` state.
- Events: **only cards that have a `start_date` or `end_date`** (today every undated card lands at "now" and clutters
  the week); title = `card.label || 'Untitled'`; `resource` = the card.
- `onEventDrop` / `onEventResize` (not read-only) → `actions.updateCard(card.id, { start_date: toDateInput(start),
  end_date: toDateInput(end) })`.
- `selectable={!readonly}`; `onSelectSlot` with `action === 'select'` or `'doubleClick'` → `addCard` exactly as the
  current `onEventAdded` does (label `'Untitled'`, first column, order = cards in that column + 1); `'click'` does
  nothing.
- Right-click: a memoised `eventWrapper` component whose wrapper element has `onContextMenu` (not read-only):
  `preventDefault()`, then `setEventMenu({ cardId, x: clientX, y: clientY })`.
- Colour: `eventPropGetter` → `{ style: { backgroundColor: card.color, color: readable text } }` when the card has a
  colour (reuse the scheduler's existing readable-text logic if exported, otherwise a small local helper).
- `components={useMemo(...)}`; drag/resize disabled when read-only (`draggableAccessor`, `resizableAccessor`).
- Delete the dhtmlx-only code: the `SchedulerLike` type, `dhtmlx-scheduler` import and css import, `init/parse/
  attachEvent` setup, `isApplyingExternalUpdateRef`, the `sched-color-*` rules in `scheduler.css` (keep the shell,
  toolbar and menu rules).

## Tests
- `components/scheduler-canvas/SchedulerCanvas.behavior.test.tsx` (jsdom; mock react-big-calendar like
  `components/canvas/StandaloneSchedulerCanvas.eventClick.behavior.test.tsx` does, and the kanban store hooks):
  dated cards become events and undated cards do not; `onEventDrop`/`onEventResize` call `updateCard` with ISO dates;
  `onSelectSlot` `select` calls `addCard` in the first column and `click` calls nothing; a right-click on an event
  opens the menu and "Set 30 minutes" calls `updateCard`; read-only → no menu and no create.
- A source test: no file under `components/`, `app/`, `lib/` imports `dhtmlx-scheduler`.

## Allowed files
`components/scheduler-canvas/SchedulerCanvas.tsx`, `components/scheduler-canvas/scheduler.css`, the new tests. Do NOT
touch `package.json` (CTO uninstalls). Same rules as before. Run only the new tests and `npx tsc --noEmit`.

## Commit message (verbatim)
```
feat(kanban): the scheduler beside Kanban runs on our own calendar

The scheduler next to a Kanban board was built on dhtmlx-scheduler, which
is GPL-2.0 and cannot ship in a closed-source app. It now uses the same
react-big-calendar as the Scheduler board, with the same drag, create and
right-click menu, and shows only cards that have dates. dhtmlx-scheduler
is removed.
```

## Addendum 1 (CTO, live 2026-10-07)
Live with react-big-calendar beside Kanban: drag-create → POST kanban_cards (first column), move → PATCH dates, menu
"Set 30 minutes" → PATCH; no dhtmlx left (`npm uninstall dhtmlx-scheduler` done by the CTO; tsc clean).
**Problem:** `SchedulerEventMenu` opens at the cursor with no bound, so for an event near the bottom of the screen the
lower items (Set 60 minutes … Delete event) are off screen and cannot be clicked (same in the old version).
**Change (`components/scheduler-canvas/SchedulerEventMenu.tsx`, allowed now):** after it renders, measure the menu and
clamp its position so it stays fully inside the window with an 8 px margin (shift up/left when it would overflow; if
taller than the window, top = 8 and let it scroll with `max-height: calc(100vh - 16px); overflow:auto`). Add
`import React` if the component needs it for vitest. Test: with `window.innerHeight` 600 and a menu of height 400
opened at y = 500, its top becomes ≤ 192. Same rules; run the scheduler tests and tsc.

## Final result (CTO, 2026-10-07, live with a mouse beside a Kanban board)
react-big-calendar renders, no dhtmlx (`npm uninstall dhtmlx-scheduler`; only `dhtmlx-gantt` 10 MIT remains). Drag-create → card in the first column (POST); move, Set 30/60 minutes, Trim to half, Revert, Split, Duplicate, colour, Delete — all saved, all back after a reload; the menu stays on screen near the bottom. A brand-new Kanban board had no columns at all (pre-existing) → PATCH-312. Gate `.opencode-vitest-311.json`: 26 baseline + 2 files that pass alone (load timeouts); tsc clean. Test boards deleted.
