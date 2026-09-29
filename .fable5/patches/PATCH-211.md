# PATCH-211 — Section heading: a larger edit hint, and a fuller right-click menu

Status: AUTHORIZED (owner, 2026-09-29: "increase the font size a bit. Also give it a right click menu
with the basics, one of them is to copy and to delete the bar").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-210 (`46c93f11`)

## What the CTO found
- The right-click menu ALREADY exists and works (`components/collabboard/menus/SectionHeadingContextMenu.tsx`,
  wired in `FreeformPadletCards.tsx` ~1008-1018 and ~1422-1432): Copy, Paste, Delete, Bring to Front,
  Send to Back. It opened live on a right-click on a heading that was not being edited.
- While the title is being EDITED, a right-click deliberately shows the browser's own text-field menu
  (`SectionHeadingPost.tsx` ~265-273, PATCH SECTION-H3B.4 Phase 17). The owner's screenshot shows the
  heading in edit mode (text highlighted in the input), which is why they did not see our menu. Keep
  that behaviour.
- The menu lacks what other post menus have: **Duplicate** and **Cut** (`LinkPostContextMenu.tsx`
  uses `edit.cut`, `edit.duplicate`, with `cutPadlet` / `duplicatePadlet`). It also has no entry to
  edit the title.

## Design
1. **Hint font:** in `SectionHeadingPost.tsx`, the edit hint `text-[11px]` → `text-[13px]`. Nothing
   else about it changes.
2. **Menu** (`SectionHeadingContextMenu.tsx` + its wiring in `FreeformPadletCards.tsx`), in this
   order:
   - **Edit title**: puts that heading into edit mode, exactly as a double-click does. Add a way for
     the parent to request editing, e.g. an `editRequestId` prop on `SectionHeadingPost` that, when
     it changes for this padlet, calls `setIsEditing(true)` (only if `canEdit`). Use the smallest
     mechanism that fits the existing code, and say which.
   - separator;
   - **Cut** (`edit.cut`, `cutPadlet`), **Copy** (existing), **Paste** (existing), **Duplicate**
     (`edit.duplicate`, `duplicatePadlet`);
   - **Delete** (existing, `requestDeletePadlet`, so the existing confirmation/undo path applies);
   - separator; **Bring to Front**, **Send to Back** (existing).
   Use the same `handleAction(id, handler)` pattern the menu already uses. The menu only opens for an
   editor (unchanged).

## Tests
- Hint: the class is `text-[13px]`.
- Menu: renders the items in that order; Cut/Duplicate call their handlers with the heading's id;
  Edit title puts the heading into edit mode (the input appears).
- The existing Section Heading menu tests stay green (update the item list if one pins it; that is
  authorized).
- **Mutation:** drop the Duplicate wiring → its test fails.

## Allowed files
```
components/collabboard/canvas/ui/SectionHeadingPost.tsx
components/collabboard/menus/SectionHeadingContextMenu.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (only the menu wiring and the edit request)
their existing tests, and SectionHeadingPost.editHint.test.tsx
```
Forbidden: the database, `package.json`, other menus. **Do not touch the comments inside
`isBlockingEditorModalOpen`.** If a census pins the menu items or markup beyond an item list, STOP and
ask (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (bash: `/dev/null`, never `nul`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/sectionHeading components/collabboard/SectionHeadingPost components/collabboard/menus
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-211.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

## Commit message (verbatim)
```
feat(canvas): section heading menu gains Edit title, Cut and Duplicate

The heading's right-click menu had Copy, Paste, Delete and the layer
items, but not the Cut and Duplicate every other post offers, nor a way
to edit the title. It now has Edit title first, then Cut, Copy, Paste,
Duplicate and Delete. The "Double-click to edit the title" hint is a
little larger.
```
