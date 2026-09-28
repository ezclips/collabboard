# PATCH-210 — A selected section heading says how to edit its title

Status: AUTHORIZED (owner, 2026-09-28: "add a hint 'double click to change title' or so").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-209 (`602e4f8a`)

## Why
A new Section Heading shows the stored text "Section heading". Editing starts on double-click, or
Enter/F2 on the focused text (`components/collabboard/canvas/ui/SectionHeadingPost.tsx` ~340-355),
but nothing on screen says so. The owner selected the heading, saw the H1-H4 toolbar, and could not
tell how to change the title.

## Design (`SectionHeadingPost.tsx` only)
- When `isSelected && canEdit && !isEditing`, show a hint BELOW the heading box:
  `Double-click to edit the title`.
  - Small (`text-[11px]`), grey (`text-gray-500`), no background.
  - Absolutely positioned just under the heading (e.g. `top: 100% + 4px`, left-aligned), so it takes
    no layout space and never moves the heading.
  - `pointer-events-none`, `select-none`, `data-section-heading-edit-hint="true"`.
  - It must not be clipped by the heading surface's `overflow-hidden`: render it outside that
    element.
- The text button gets `title="Double-click to edit"` when `canEdit` (a hover tooltip), and nothing
  for a viewer.
- A viewer (`canEdit === false`) never sees the hint. While editing, the hint is hidden.
- Nothing else changes: the double-click, Enter/F2, the toolbar, the resize handles.

## Tests (the existing Section Heading test file that mounts `SectionHeadingPost`)
- Selected and editable → the hint is shown with that exact text; not selected → no hint.
- A viewer → no hint and no `title`.
- Editing (after a double-click) → no hint.
- **Mutation:** show the hint for viewers → the viewer test fails.

## Allowed files
```
components/collabboard/canvas/ui/SectionHeadingPost.tsx
its existing test file (or a new SectionHeadingPost.editHint.test.tsx)
```
Forbidden: everything else. **Do not touch the comments inside `isBlockingEditorModalOpen`.** If a
census pins the markup, STOP and ask (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` for searches. Every test command is `timeout 600 npx vitest run …`. Delete
temporary diagnostic files (in bash use `/dev/null`, never `nul`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/sectionHeading
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-210.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

## Commit message (verbatim)
```
feat(canvas): a selected section heading says how to edit its title

Editing a Section Heading's title starts on a double-click, and nothing
said so. A selected heading that the viewer can edit now shows a small
"Double-click to edit the title" line beneath it, and the title has the
same tooltip. Viewers see neither.
```
