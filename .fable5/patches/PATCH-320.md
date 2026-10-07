# PATCH-320 — Kanban: Add Group, Move to Row, undated Gantt rows, attachment cleanup, Gantt rename

Owner approved fixing items 5–8 of the Kanban live test and the Gantt rename.

## 1. Gantt: renaming a task in the grid does not save
Live (dhtmlx-gantt 10.0.3, also 9.1.1): double-click the Task name cell → inline
editor → type → Enter. The editor closes, the old name comes back, no write.
`mapGanttTaskToCardPatch` maps `text → label` correctly, so the save never
happens. `GanttConfig.ts` replaces the default mapping with
`gantt.ext.inlineEditors.setMapping({ init, destroy })` (double-click to edit);
the default mapping's keyboard handling (Enter = save, Esc = cancel, Tab) is
gone, and with `keyboard_navigation` on, Enter closes without saving.
**Fix:** reproduce first (a test with the real dhtmlx build if feasible, else
document why), then in the custom mapping handle keys while the editor is open:
Enter → `ctrl.save()`, Escape → `ctrl.hide()`, and blur/click-away keeps
saving via `commitOrHideEditor`. The saved name must reach
`onAfterTaskUpdate` → `actions.updateCard(id, { label })`. Readonly stays
non-editable. Keep double-click-to-edit and row drag behaviour unchanged.

## 2. "Add Group" creates a column group; Group by gets its own button
Today the toolbar "Add Group" only opens Group by + Filter, while the column
menu offers "Move to Group" and a group menu offers rename/delete — but no UI
creates a group.
- Toolbar **Add Group**: opens the existing InputModal ("Group name"), then the
  persisted `addColumnGroup` store action creates it (next order, not collapsed).
  Cancel/empty name creates nothing.
- Move the Group by select + Filter select (unchanged behaviour) to a new
  toolbar button **Group by** (same i18n key `groupByLabel`, es/fr included).
- After creating a group, a column's menu "Move to Group" lists it.

## 3. "Move to Row" is not shown when there is nowhere to move
`CardMenu.tsx` pushes the "Move to Row" label even when no `-> row` / `-> No Row`
item follows (single row). Only add the label (and its separator) when at least
one target item is added.

## 4. Gantt: undated cards
`mapCardToGanttTask` gives a card without start/end dates today's date, so the
Gantt draws a bar the card does not have (the calendar correctly skips it).
Mark such tasks `unscheduled: true` with `gantt.config.show_unscheduled = true`
(row in the grid, no bar, empty Start time). If the MIT build does not support
unscheduled tasks, leave undated cards out of the Gantt instead, and say which
you did. Either way: an update coming back from the Gantt for an undated task
(e.g. a rename) must NOT write dates to the card — `mapGanttTaskToCardPatch`
skips dates for unscheduled tasks. A card that gets dates shows its bar.

## 5. Attachment files are deleted with what owns them
Uploads go to bucket `padlet-files` at `kanban/<cardId>/<...>` (Editor
`uploadAttachmentToStorage`). Nothing ever deletes them.
- Removing an attachment then **Save**: delete that file's object (path parsed
  from the stored public URL; only paths under `kanban/<thisCardId>/`).
  Cancel must not delete anything.
- **Delete Card**: remove every object under `kanban/<cardId>/`.
- **Delete Column**: same for each card it deletes.
- **Delete board** (`app/api/boards/[id]/route.ts` DELETE): before the board
  row is deleted, remove `kanban/<cardId>/` for every kanban card of the board,
  with the admin client already used there; only after the caller's ownership
  check that route already does.
- Storage failures are logged and never block the card/column/board delete.

## Tests
- Gantt: Enter saves the edited name → `updateCard(id, { label })`; Escape
  leaves it unchanged (mapping-level test with a fake controller is fine).
- Toolbar: Add Group → modal → `addColumnGroup` called with the name; Group by
  button shows the two selects.
- CardMenu: single row → no "Move to Row"; two rows → present with target.
- Mapper: undated card → `unscheduled: true` (or excluded); patch from an
  unscheduled task has no `start_date`/`end_date`.
- Storage: remove+Save deletes exactly that path; Cancel deletes nothing;
  deleteCard lists+removes `kanban/<id>/`; a path outside the card prefix is
  never deleted; board DELETE removes prefixes for its cards.

## Verification
Focused tests pass; `npx tsc --noEmit` clean. List changed files and say which
option you took in §4.

## Allowed files
components/gantt-canvas/*, components/kanban-canvas/*,
lib/kanban/supabaseAdapter.ts, app/api/boards/[id]/route.ts, a small new
helper module for kanban attachment storage if useful, and their tests.
No git writes, no database or migration changes.

## Addendum 1 — the Gantt rename is still broken live (root cause found)
Live on dhtmlx-gantt 10.0.3, after the first implementation:
- Double-click the Task name cell: the editor input appears, but
  `document.activeElement` is the `.gantt_row` DIV (keyboard_navigation keeps
  focus on the row). Typing goes nowhere; the input still says "Dated".
- Clicking INTO the input closes the editor: the click bubbles to Gantt's
  `onTaskClick` handler, `commitOrHideEditor()` sees no change and calls
  `ctrl.hide()`. Focus ends on BODY.
- So Enter (now handled) never has a changed editor to save. The unit test with a
  fake controller could not see either problem.

**Fix (GanttConfig.ts custom mapping):**
1. Add the mapping's `onShow(controller, placeholder)` hook: focus the editor's
   input (`placeholder.querySelector('input, select, textarea')`, after the
   current event — `setTimeout(…, 0)` or `requestAnimationFrame`) and select its
   text. Also attach a `keydown` listener on the placeholder: Enter → `save()`,
   Escape → `hide()`, Tab → `save()`; `stopPropagation` so keyboard_navigation
   does not steal them. Remove the listener in `onHide`.
2. In the `onTaskClick` / `onEmptyClick` / `onBeforeTaskDrag` handlers, do
   nothing when the event target is inside `.gantt_grid_editor_placeholder`
   (a click inside the editor is not a click-away).
3. Keep the keyboardNavigation onKeyDown handling only if it is still needed;
   no double save.
**Tests:** keep the unit tests; add one that exercises the mapping's `onShow`
with a real DOM placeholder containing an input (focus + Enter → save, Escape →
hide) and one that a click whose target is inside the placeholder does not
call save/hide. I will verify live afterwards.

## Addendum 2 — focus is taken back 7 ms later
Live, after Addendum 1 (focusin log on double-click):
`14879 DIV.gantt_layout_root` → `15094 INPUT` (our onShow focus) →
`15101 DIV.gantt_row` (keyboard_navigation re-focuses the row ~7 ms later).
Typing then goes to the row. With focus FORCED into the input, typing + Enter
saves correctly ("Dated renamed" reached the card and survived a reload), so
save/Enter are fine — only focus is wrong.
**Fix:** while the editor is visible, if focus moves to a `.gantt_row` (or any
element outside the placeholder inside the gantt container) without a user
pointer-down outside the editor, put focus back on the editor field and keep
the selection. Do it with a `focusin` listener on the gantt container added in
`onShow` and removed in `onHide` (not a bigger timeout). A real click outside
still commits via the existing click-away handlers.
Test: jsdom — after onShow, dispatch focus to a `.gantt_row` element → the
input is focused again; after onHide the listener is gone.

## Addendum 3 — the task form must be able to schedule an undated card
Live: double-clicking an undated (unscheduled) row's Start time opens the
lightbox with "Time period" prefilled with placeholder dates (today → tomorrow)
and no unscheduled toggle. Because the task stays `unscheduled: true`,
`mapGanttTaskToCardPatch` drops the dates, so dates picked there are silently lost.
**Fix:** on `onLightboxSave(id, task)` for a task that is unscheduled, compare
the submitted start/end with the values the lightbox opened with (capture them
in `onLightbox`/`onBeforeLightbox`). If either changed → set
`task.unscheduled = false` so the dates are saved and the bar appears. If both
are unchanged → keep it unscheduled (saving a description edit must not give
the card today's dates). Cancel changes nothing.
Test: lightbox save with changed dates → patch contains start/end; unchanged →
patch has no dates.

## Addendum 4 — board delete: no second authorization, files only after success
The route change made `lib/server/boards/boardDeleteRoute.test.ts` fail (5
tests, 500s): the route now calls `authorizer.canDeleteBoard` itself before
`deleteKnowledgeBoard`, which already authorizes. That duplicates the check and
changes the orchestration that test pins ("authorization is unchanged",
"deletion orchestration is untouched").
**Fix:** restore the original flow (`deleteKnowledgeBoard` with
`{ authorizer, repository, storage }`, its own auth and status mapping).
Around it:
1. Before calling it, read the board's kanban card ids with the admin client
   (`kanban_cards.id where canvas_id = id`) inside try/catch — read only,
   nothing returned to the caller.
2. Only when `deleteKnowledgeBoard` reports success, call
   `removeKanbanCardAttachmentsForCards(adminClient.storage, cardIds)`; failures
   are logged and do not change the response.
3. A rejected/failed delete must not touch storage.
Update/add tests: the existing boardDeleteRoute tests pass unchanged; new
test — authorized success removes the prefixes; non-owner (403) and missing
board (404) remove nothing.

## Addendum 5 — keys typed in the editor must not reach keyboard_navigation
Live: double-click → click into the input → Ctrl+A → type "Dated renamed" →
Enter saves "DatedDated renamed": Ctrl+A did not select the input's text
(keyboard_navigation handles it on the gantt container). Typing itself works.
**Fix:** in the placeholder `keydown` listener added in `onShow`, call
`event.stopPropagation()` for EVERY key (not only Enter/Escape/Tab), keeping the
default action for normal keys (no preventDefault) so the input still edits,
selects (Ctrl+A), copies and moves the caret. Enter/Tab/Escape keep their
current save/save/hide behaviour. Test: a Ctrl+A keydown inside the
placeholder does not propagate to the container.

## Addendum 6 — a Gantt change makes the next card save fail as a "conflict"
Live: rename an (undated) task in the Gantt → its PATCH succeeds. Then open the
card in the Kanban editor, attach a file, Save → `PATCH kanban_cards … 200 []`
(zero rows): `updateCardWithFallback` conditions on `.eq('updated_at',
card.updated_at)` with the card's OLD stamp, so `saveCard` reports
`conflict: true`, `handleConflict('Card')` refetches, the editor's change is
lost and the just-uploaded file is orphaned. A second Save then works.
Cause: every update writes `updated_at: new Date().toISOString()` (client
clock) but the store never records the stamp it just wrote; the Kanban editor
path usually gets the new stamp back via realtime, the Gantt path does not.
**Fix (generic, all update paths):**
1. `updateCardWithFallback`/`saveCard` return the `updated_at` they wrote (or
   `.select('id, updated_at')` and return the row's value).
2. After a successful update, the store sets that `updated_at` on the local
   card (reducer update, no history entry), so the next save — from the
   editor, Gantt, scheduler, drag, menu — conditions on the right stamp.
3. Keep real conflict detection: another user's change still conflicts.
Tests: two successive `actions.updateCard` calls on the same card where the
second is conditioned on the first's returned stamp (mock client asserts the
`.eq('updated_at', …)` value); a mismatched stamp still yields `conflict`.
Live (I will verify): Gantt rename → editor attach + Save keeps the file.
