# PATCH-316 — Remove typing text into a Scheduler event (keep the item counter)

## Why
The owner decided against typing a short text into a time span. PATCH-315 (the
style bar) is already reverted (commit 8fbdb37d). This patch removes the
text-entry half of PATCH-314 and keeps its counter half exactly as it is.

## Remove
1. `components/canvas/SchedulerEventContextMenu.tsx`: the `onEditText` and
   `hasText` props, the "Add text"/"Edit text" MenuItem, and the `Type` icon import.
2. `components/canvas/StandaloneSchedulerCanvas.tsx`:
   - the `onRenameContainer` prop (type + destructure + every dependency array);
   - `editingEventId` state and every use of it;
   - the `onEditText` / `hasText` props passed to SchedulerEventContextMenu;
   - in `CustomEvent`: `isEditing`, `inputRef`, `draft`/`setDraft`, the focus
     `useEffect`, `commit`, `stop`, and the `<input>` branch. The render becomes
     `isShort ? (flex row) : (tall layout)`.
3. `app/dashboard/canvas/[id]/CanvasClient.tsx`: the `onRenameContainer=` line
   passed to StandaloneSchedulerCanvas (only that line).
4. `StandaloneSchedulerCanvas.eventClick.behavior.test.tsx`: the whole
   `describe('PATCH-314: type a short text right in an event')` block and any
   helper used only by it.

## Keep unchanged (the counter)
- `itemLabel` ("1 item"/"N items"), `showPostBadge`, `containerBadgeColors`,
  `DEFAULT_EVENT_BACKGROUND`, `badgeStyle`, `tabRef` + `isShort` measuring
  (`useLayoutEffect` + ResizeObserver), the short flex-row layout and the tall
  lower-left absolute badge, `data-scheduler-post-count`.
- `lib/domain/canvas/containerBadgeColors.ts` and its test, and its use in
  `RowColumnContainerCard.tsx`.
- Test blocks "PATCH-313/314: an event shows how many items it holds" and
  "PATCH-314 Addendum 1" and "PATCH-308 Addendum 1".
- Remove `useEffect`/`useLayoutEffect` imports only if nothing else uses them.

## Tests
Add one test: right-clicking an event shows "Add post" and no menu item named
"Add text" or "Edit text".

## Verification
- `npx vitest run components/canvas lib/domain/canvas` passes.
- `npx tsc --noEmit` clean.
- `grep -rn "onRenameContainer\|editingEventId\|onEditText" components app lib` returns nothing.

## Allowed files
The four files above (plus the new test inside the existing test file). No git writes.
