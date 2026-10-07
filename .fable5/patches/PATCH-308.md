# PATCH-308 — Scheduler: the event right-click menu works with a mouse again

Status: AUTHORIZED (owner, 2026-10-07, screenshot of the event right-click menu: "review for the second time the
scheduler … adding a post is broken again … make sure the right click drop menu with all its function is working").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, live 2026-10-07 on a test Scheduler board)
No earlier scheduler review is saved in the .md files; the last scheduler commits are the "backup point" snapshots.
- **Every menu item fails with a mouse click and works from the keyboard.** Keyboard: Set duration 60 → PATCH 204,
  event 20→38 px; Trim to half → PATCH 204. Mouse: Set duration, Trim, Revert, Split, Add container, Extend across
  days, a colour — no request at all, nothing changes. Add post with the mouse never targets the event.
- **Mechanism.** `SchedulerEventContextMenu` renders inside `CustomEventWrapper` (`StandaloneSchedulerCanvas.tsx`
  ~L640–725). The menu is portalled, but React bubbles synthetic events through the React tree, so pressing a menu
  item reaches the wrapper's `onMouseDown`/`onMouseUp` (~L660), which treats it as a click on the event and calls
  `onEditItem` → CanvasClient state changes → re-render. The calendar's `components={{ event, eventWrapper,
  timeSlotWrapper }}` (~L882) is a new object on every render, so react-big-calendar remounts every event wrapper —
  and the open menu with it — before the item's `onSelect` fires.
- **Add post consequence.** Because the event is never targeted, the Note opened from the toolbar has no `parentId`,
  and on save `usePadletSave` (L480) starts the "Drop to place the post into a container" drag instead of saving into
  the event.
- **A left-click on an event opens nothing.** The wrapper's `onMouseUp` opens the event (popover), then the calendar
  also reports the same click as a slot click; `handleSelectSlot` (~L272) sees it overlaps an event and calls
  `onSelectTimeSlot(null)`, whose CanvasClient handler clears the target AND the popover.
- **"0 posts" tooltip** covers the first menu item: the event tab's native `title` (~L758).
- **Hint is wrong.** The empty-board hint says "Click a time slot to schedule a post", but a single click deliberately
  does nothing; an event needs a double-click or a drag.

## Design
1. `components/canvas/SchedulerEventContextMenu.tsx`: on `ContextMenu.Content` AND each `ContextMenu.SubContent`, stop
   React propagation of `onPointerDown`, `onPointerUp`, `onMouseDown`, `onMouseUp` and `onClick`
   (`event.stopPropagation()` only — never `preventDefault`, so Radix's own handling is unchanged). Nothing inside the
   menu may reach the event wrapper.
2. `components/canvas/StandaloneSchedulerCanvas.tsx`:
   - `const calendarComponents = useMemo(() => ({ event: CustomEvent, eventWrapper: CustomEventWrapper,
     timeSlotWrapper: TimeSlotWrapper }), [CustomEvent, CustomEventWrapper, TimeSlotWrapper])` and pass it to
     `components`. (If `TimeSlotWrapper` is not already stable, wrap it in `useCallback` with its real deps.)
   - `handleSelectSlot`: when the slot overlaps an existing event, `return` WITHOUT calling `onSelectTimeSlot(null)` —
     the event's own click owns that click (that is what the existing comment already says).
   - The event tab: remove the native `title` attribute; put the same text in `aria-label`.
3. `app/dashboard/canvas/[id]/CanvasClient.tsx`, hint bar only:
   - Scheduler empty-board hint: `<kbd>Double-click</kbd> a time slot or drag across slots to add an event, or use the
     <kbd>toolbar</kbd>`.
   - A new P1 hint while `isSchedulerLayout && selectedSchedulerContainerId && !schedulerPopoverPadletId` and no other
     P0/P1 state applies: `Event selected — pick a post type in the <kbd>toolbar</kbd> to add it to this event`.
Nothing else changes (no handler logic, no writes).

## Tests
- `components/canvas/SchedulerEventContextMenu.test.tsx` (jsdom): render the menu inside a parent `<div>` with
  `onMouseDown`/`onMouseUp`/`onClick` spies; open it (`contextmenu` on the trigger); press a top-level item with
  pointerdown/mousedown/pointerup/mouseup/click: the item's handler is called once and NO parent spy is called. Same for
  an item inside a submenu (open it with the keyboard if pointer opening is awkward in jsdom).
- A source test `components/canvas/StandaloneSchedulerCanvas.menuStability.source.test.ts`: `components={` receives a
  memoised value (no inline object literal); `handleSelectSlot`'s overlap branch does not call `onSelectTimeSlot`; the
  event tab has no `title=` attribute.
- CanvasClient hint source test (pattern of existing `*.source.test.ts`): the two strings above exist.
- Existing scheduler tests stay green.

## Allowed files
`components/canvas/SchedulerEventContextMenu.tsx`, `components/canvas/StandaloneSchedulerCanvas.tsx`,
`app/dashboard/canvas/[id]/CanvasClient.tsx` (hint bar only), and the new tests. Same rules as before. Run only the
new tests, any existing `components/canvas/*Scheduler*` tests, and `npx tsc --noEmit`.

## Commit message (verbatim)
```
fix(scheduler): the event menu and event clicks work with a mouse again

A click in an event's right-click menu also counted as a click on the
event, which redrew the calendar and threw the menu away before the
choice registered, so every menu item did nothing with a mouse. Add post
never targeted the event, so a new post asked to be dropped somewhere.
Clicking an event was cancelled by the same click on the slot beneath.
The "0 posts" tooltip no longer covers the menu, and the empty-board hint
says to double-click or drag.
```

## Addendum 1 (CTO, live after the first pass, 2026-10-07)
**Live with a mouse, all saved:** Set duration 60 (PATCH, 20→38 px), Trim to half, Revert time setting, Split into 2
(POST + PATCH), Add container (POST), Extend 2 days and Back to single day (PATCH), colour (PATCH), Delete event
(DELETE). Add post → toolbar Note → saved INTO the event (POST with the event's id, `childPadletIds` updated,
"1 post"), no drop prompt; the "Event selected — pick a post type…" hint shows. No native "0 posts" tooltip.

**Still broken: a left-click on an event opens nothing** (no popover, not even selected). Traced in the page with
listeners on the event, its wrapper, the day slot and the document: `mousedown` reaches event → wrapper → slot → doc,
but `mouseup` reaches only slot → doc and there is NO `click`. The DnD addon takes the event on mousedown, so the
release lands on the slot beneath; the wrapper's `onMouseUp` (~L666) and the calendar's `onSelectEvent` never run.

**Also:** the 8 px day-span edge handles (~L762–784) start a day-span drag on ANY mouse button, so a right-click on an
event's edge starts a drag instead of opening the menu.

**Changes (`components/canvas/StandaloneSchedulerCanvas.tsx` only)**
1. In the event wrapper's `onMouseDown` (button 0 only, not read-only): record the pointer position and add ONE
   `window` `mouseup` listener (`{ capture: true, once: true }`). In it: distance ≤ 5 px and not
   `suppressNextSelectRef` → `onEditItem(event.resource)`; otherwise nothing. Remove the wrapper's own `onMouseUp`
   click logic (it can no longer fire). Make sure one click opens the event once (if `onSelectEvent` does fire in some
   view, guard so `onEditItem` is not called twice for the same click, e.g. a short `lastOpenedAtRef`).
2. Both day-span handles: `if (e.button !== 0) return;` before anything else.
Tests: extend the source test — the wrapper registers a window `mouseup` listener in its mousedown path; both handle
`onMouseDown`s check `e.button !== 0` first. If practical, a jsdom test: mousedown on the wrapper, then a `mouseup` on
`window`/document at the same point → `onEditItem` called once; at a point 20 px away → not called.
Same rules; run the new/updated tests and tsc.

## Final result (CTO, 2026-10-07, live with a mouse on a test Scheduler board)
Every menu item works and saves: Add post (Note saved into the event, "1 post", hint shown, no drop prompt), Set
duration, Trim to half, Revert time setting, Split, Add container, Extend across days / Back to single day, colours,
Delete event. A left-click opens the event's posts (the saved Note is listed). A right-click on an event's edge opens
the menu. No native tooltip over the menu. Gate `.opencode-vitest-308.json`: 26 = 26; tsc clean. Test board deleted.
Open follow-up (not fixed here): opening an event's posts issues PATCHes to its child posts without any edit (seen as
blocked writes in the live kit) — needs its own look.
