# PATCH-279 — A drawing made with "Edit as drawing" lands on top, with its picture's name

Status: AUTHORIZED (owner, 2026-10-04: "I tried to save the diagram in drawing post but it is not on the canvas").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-278 (a57b15f3).

## Why (CTO, live, board af02972f)
The owner's two drawing posts (3cbcf749 at 17:36 UTC, 44170e96 at 17:41 UTC; 19 and 9 elements) WERE saved. They are
invisible because three things combine:
1. **Stacking.** `createDrawingPost` (`hooks/canvas/usePadletSave.ts` ~L1604) inserts without `metadata.zIndex`, so the
   post renders at the default 100 (`FreeformPadletCards.tsx` `metadata.zIndex || 100`). Every post created through
   `CanvasClient.tsx` gets `zIndex: nextZIndex(padlets)` (`components/collabboard/canvas/engine/zIndex.ts` L28, used 9×
   in CanvasClient), so the PDF card at the new-post position is drawn ON TOP of the new drawings and covers them
   completely (screenshot: only their top edges show behind "My fancy padlet-slideshow").
2. **Name.** Both are titled "Drawing": the generator passes `title={title.trim() || undefined}` (the usually empty
   "Post name" field, `AIComponentEditor.tsx` ~L1762), so the picture's own title is lost.
3. **Size.** Drawing posts render as small fixed cards (`postResizePolicy.ts`: drawing → `none`). The owner decided:
   NOT now. Do not change the resize policy.
Also: `CanvasModals.handleEditAsDrawing` calls `void createDrawingPost(...)`. A failed insert throws into nothing, so
the user sees no post and no message.

## Design
1. **On top.** `createDrawingPost` sets `metadata.zIndex = nextZIndex(padlets)` (import from `zIndex.ts`; `padlets` is
   already a parameter of the hook). This applies to every new drawing post, hand-drawn ones included: they had the
   same defect. Keep `usePadletSave.ts` growth ≤ 5 lines.
2. **Name.** The drawing post's title is, in order:
   1. the Post name if the user typed one;
   2. else the picture's title (the outline title / `data.title` shown on the picture);
   3. else "Drawing".
   Apply this in both places that render `EditAsDrawingButton` (wiring only in the two big files), and in
   `buildDrawingPostData` if it already receives the picture title. Do not invent a second title source.
3. **No silent failure.** `handleEditAsDrawing` awaits `createDrawingPost`. On a rejection it shows
   `toast.error('The drawing could not be saved. Please try again.')` (sonner, already imported in `CanvasModals.tsx`)
   and logs the error with `console.error` (no data payloads in the log).
4. Nothing else changes. No resize policy, no placement change, no change to the AI post.

## Tests
- `createDrawingPost`: the insert's `metadata.zIndex` equals `nextZIndex(padlets)` for a board whose highest post has
  zIndex 250 (→ above it); a hand-drawn new drawing (`saveDrawing` with `id 'new'`) gets it too.
- Title:
  - the generator with an empty Post name → the drawing post title is the picture's title;
  - a typed Post name wins;
  - no title anywhere → "Drawing".
  - The same for the Edit window.
- Failure: `createDrawingPost` rejects → `toast.error` is called once with the message; nothing else throws.
- Mutation (revert with Edit): drop the zIndex → the stacking test fails.

## Allowed files
```
hooks/canvas/usePadletSave.ts (+ tests)                      zIndex only, net ≤ +5 lines
components/collabboard/canvas/ui/CanvasModals.tsx (+ tests)  await + toast
components/collabboard/editors/AIComponentEditor.tsx         wiring only (title fallback)
components/ai/editors/AIContentEditModal.tsx                 wiring only (title fallback)
lib/ai/antv/toExcalidraw/drawingPost.ts (+ test)             only if the title fallback belongs there
components/ai/renderers/EditAsDrawingButton.tsx (+ test)     only if needed for the title
existing tests of these files
```
Forbidden: everything else, `postResizePolicy.ts`, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.
- Put `timeout` on every long command.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run hooks/canvas components/collabboard/canvas components/collabboard/editors components/ai lib/ai/antv --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-279.json
```
Do not commit.

**Live (CTO):**
1. On board af02972f, run "Edit as drawing" from the generator with an empty Post name and save. The new drawing post
   is visible on top of the PDF card and carries the picture's title.
2. The same from the Edit window.
3. The owner's two existing drawings are not touched. They keep their old zIndex; point the owner to them. Test posts
   are deleted.

## Commit message (verbatim)
```
fix(ai): a new drawing appears on top with its picture's name

Drawings made with "Edit as drawing" were saved underneath other posts,
so they could not be seen, and were all called "Drawing". New drawing
posts now land on top of the board and take the picture's title, and a
failed save says so instead of failing silently.
```

## Final result (CTO, 2026-10-04, live)
Board af02972f, own tab, write-locked except generate-outline (unlocked for the saving steps):
- Generator, empty Post name → "Edit as drawing" → drawing post titled "PATCH279 Test: Seasonal Values" (the
  picture's title), `metadata.zIndex` 122 (top of the board); after reload it is the topmost element at its centre and
  both sides (`elementFromPoint` hits the card itself).
- Edit window → drawing post titled "Seasonal Values", zIndex 123, placed next to the AI post; the AI post received no
  write.
- Existing AI posts 108dffef and 0bb9fdfc: signatures identical. The pie post 1766c698 is no longer on the board (gone
  between the CTO's 19:0x check and the owner's session; no delete path in this code; asked the owner). Test posts
  2db6cbe6, 9995513f, 7c7c2f63 deleted. The owner's own drawings 3cbcf749 / 44170e96 left untouched (old zIndex).
- Gate `.opencode-vitest-279.json`: failing test names identical to PATCH-277 (59/59); tsc clean.
