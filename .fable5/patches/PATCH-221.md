# PATCH-221 — New drawings start with the frame hidden

Status: AUTHORIZED (owner, 2026-09-30: "can we make 'Hide frame' status as default").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-220 (`0161d811`)

## Design (CTO decisions)
- **Scope: NEW drawings only.**
  - Existing drawings keep what they have (a user may have chosen the frame).
  - Images, AI drawings and every other type keep their frame by default: their title bar or caption
    carries information.
  - "Show frame" in the right-click menu brings a frame back, as today.
- **One place:** the Draw tool's new-drawing draft in `app/dashboard/canvas/[id]/CanvasClient.tsx`
  `handleToolClick` `case 'draw'` (~8720-8740) builds `metadata: { ...createMetadata }`. Make it
  `metadata: { ...createMetadata, fullView: true }`.
  - `saveDrawing` (`hooks/canvas/usePadletSave.ts` ~1608) spreads `padletToEdit.metadata` into the
    insert, so the stored post gets `fullView: true`.
  - The placement-prompt path (`draftToInsertPayload` `case 'drawing'`, ~3845) spreads
    `draft.metadata`, so it carries the value too. Confirm both by reading them.
- Check the other entry points to a new drawing and say how each behaves. The board right-click
  "New Draw" (`FreeformCanvasBoardMenu` → `type: 'draw'`) should route to the same case.
  `DrawingLayout.tsx`'s "Master Drawing" is the drawing LAYOUT's own canvas, not a post: leave it
  alone. The template (`lib/collabboard/templates/template1.ts`): leave it alone.
- Do not change `saveDrawing`, the menus or the renderers.

## Tests
- A test that triggers the `draw` tool (or the smallest seam around it: if `handleToolClick` is not
  reachable in a unit test, test through the existing pattern the repo uses for `case 'draw'`, and
  say which) asserts that the new drawing draft's metadata has `fullView: true`.
- `saveDrawing` with a new draft whose metadata has `fullView: true` inserts `metadata.fullView ===
  true` (mock supabase). This is likely a small addition to an existing `usePadletSave` test file.
- **Mutation:** remove `fullView: true` → the draft test fails.

## Allowed files
```
app/dashboard/canvas/[id]/CanvasClient.tsx   (the one metadata line in case 'draw')
a test file for the draw draft (new, or an existing one that covers handleToolClick 'draw')
hooks/canvas/usePadletSave test (only to add the insert assertion)
```
Forbidden: every other file; the database; `package.json`. **Do not touch the comments inside
`isBlockingEditorModalOpen`.** CanvasClient has census/source tests: if one pins the `case 'draw'`
block, STOP and ask (spec line, code at file:line, proposed resolution).

Use the Grep/Read tools, or `rg` with `timeout 30`. Every test command is
`timeout 600 npx vitest run …`. No `ls` on the repo root, no curl of the dev server. Real tool calls
only (never write a tool call as text). No git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run <your new/changed tests> hooks/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-221.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Draw → draw a shape → save → the new card shows without a frame; right-click → "Show
frame" → the frame appears. The CTO deletes the test drawing.

## Commit message (verbatim)
```
feat(canvas): new drawings start with the frame hidden

A drawing now appears on the board as just the drawing; "Show frame" in
its right-click menu brings the title bar and frame back. Existing
drawings and other post types keep their current look.
```
