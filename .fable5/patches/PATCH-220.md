# PATCH-220 — "Hide frame": a drawing shows as just the drawing, on the board and in columns

Status: AUTHORIZED (owner, 2026-09-30: "yes").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-217 follow-up (`fa379f66`)

## Why (the owner, with the CTO's live findings)
The owner wants a drawing to show without the post frame. That feature already exists: the right-click
item **"Full View"** stores `metadata.fullView`, and the Freeform board then drops the title bar and
frame. That covers Drawing and AI Component (generic branch, `FreeformPadletCards.tsx` ~3417) and
Image/Card (`CardPreview hideFrame`, ~2546). Live, on the owner's drawing, three gaps showed:
1. **A faint pink dashed box stays** around the drawing. `PostCardContent.tsx` ~890-895, the drawing
   branch's wrapper: `bg-red-50/50 border border-red-100 border-dashed`.
2. **"Full View" is the wrong name.** It sounds like opening the drawing large; it hides the frame.
3. **Columns ignore it.** A container's children are drawn as uniform cards (border, shadow, an
   orange left strip, and the drawing inside a second bordered box). Find the component that renders
   a container's children on a Freeform board (`RowColumnContainerCard.tsx` and/or
   `ContainerChildPreviewCard.tsx`) and say which one.

## Design
1. **No leftover box:** in `PostCardContent.tsx`, the drawing branch drops `bg-red-50/50`, `border`,
   `border-red-100` and `border-dashed` when `padlet.metadata?.fullView === true`. Keep every other
   class and all behaviour (click to view, drag guard, `draggable=false`). Without fullView, nothing
   changes.
2. **Rename the menu item** in `NotePostContextMenu.tsx` (~145-155) and `ImagePostContextMenu.tsx`
   (~148): the label is **"Hide frame"** when the frame shows, and **"Show frame"** when
   `isFullView`. Drop the check mark: the label now says the state. The action id
   (`post.toggleFullView`), the handler and the stored key (`metadata.fullView`) do NOT change, so
   existing posts keep their setting.
3. **Columns respect it:** in the container child renderer, a child whose `metadata.fullView === true`
   and whose type is one the Freeform board already frames conditionally (`drawing`, `ai-component`,
   `image`, `card`) renders WITHOUT the card chrome: no border, no shadow, no white background, no
   orange left strip, and no inner bordered box around the picture or drawing preview. It keeps:
   - the same outer spacing, so the column's rhythm holds;
   - the same click, drag and selection handlers;
   - a visible selection outline when the child is selected (reuse the existing selection style, or a
     `ring-2 ring-blue-400` rounded outline), so a frameless child can still be seen as selected.
   Other types, and children without fullView, are unchanged.
4. New posts keep the frame by default (no change).

## Tests
- `PostCardContent`: a drawing with `fullView` has no `border-dashed` / `border-red-100` wrapper
  classes; without fullView they are present.
- Menus: the label reads "Hide frame" for a post without fullView and "Show frame" with it; clicking
  still dispatches `post.toggleFullView`.
- Container child: a drawing child with fullView renders no chrome (no `border`, no `shadow-sm`, no
  orange strip element) and still calls its click and select handlers; the same drawing without
  fullView keeps the chrome; a fullView NOTE child keeps the chrome (the type is not eligible).
- **Authorized pin updates:** these test files assert the "Full View" label. Update only those
  assertions to the new labels:
  - `freeformFullViewFrame.test.tsx`
  - `freeformPostContextMenus.characterization.test.tsx`
  - `freeformAlignmentGuideDetection.characterization.test.tsx`
  - `freeformAlignmentGuideDetection.test.tsx`
  - `postResizeB1.integration.test.tsx`
  Any other failure: STOP and list it.
- **Mutation:** ignore fullView in the container child → the "no chrome" test fails.

## Allowed files
```
components/collabboard/PostCardContent.tsx            (the drawing wrapper classes only)
components/collabboard/menus/NotePostContextMenu.tsx  (the label only)
components/collabboard/context-menus/ImagePostContextMenu.tsx (the label only)
the container child renderer (RowColumnContainerCard.tsx and/or ContainerChildPreviewCard.tsx)
the five tests above (label assertions only) + new tests beside the changed components
```
Forbidden:
- `CanvasClient.tsx`, `FreeformPadletCards.tsx` (it already honours fullView; touch it only if a
  STOP-and-ask shows it is needed);
- the database, `package.json`, `next.config.ts`, `.env*`.

**Do not touch the comments inside `isBlockingEditorModalOpen`.** Container components have many
census tests (scrollbar lane, resize B3, orientation, per-child titles). If one pins markup you must
change, STOP and ask (spec line, code at file:line, proposed resolution).

Use the Grep/Read tools, or `rg` with `timeout 30`. Every test command is
`timeout 600 npx vitest run …`. No `ls` on the repo root, no curl of the dev server. Delete temp
files (bash: `/dev/null`, never `nul`). No stash/reset/restore/checkout/clean/commit/push; no
production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/freeformFullViewFrame components/collabboard/freeformPostContextMenus components/collabboard/freeformAlignmentGuideDetection components/collabboard/postResizeB1 components/collabboard/RowColumnContainerCard components/collabboard/container components/collabboard/PostCardContent
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-220.json
```
The failing FILE set must equal the 26-file baseline, and the new tests must be present. Compact
report. Do not commit.

**Live (CTO, own tab):**
- right-click the owner's drawing → "Hide frame" → only the ellipse shows, with no pink box;
- right-click → "Show frame" restores it, so the owner's post ends as it began;
- the column case: moving the owner's drawing into their column is NOT done without asking. The
  CTO checks it with the unit test, or with a test drawing the CTO creates and deletes.

## Commit message (verbatim)
```
feat(canvas): "Hide frame" shows a drawing as just the drawing, in columns too

The right-click "Full View" already hid a drawing's title bar and frame
on the board, but left a faint dashed box around the drawing, sounded
like opening it larger, and was ignored inside columns. It is now "Hide
frame" / "Show frame", the leftover box is gone, and a column shows a
frameless drawing or image without its card chrome, keeping its
spacing, clicks and selection outline.
```

## Addendum (CTO, 2026-09-30): result
- The first DeepSeek session wrote tool calls as text twice; a fresh session reviewed its partial
  work, restored a census-pinned class order in `RowColumnContainerCard`, fixed a test that never
  clicked, and finished the patch.
- Selection outline in columns: NOT implemented, and the CTO accepted that. Column children are not
  individually selectable (the board selects the column), so there is no child selection state to
  outline.
- Four of the five "pin" files mention "Full View" only in test titles; they were left unchanged.
- Live, on the owner's drawing: "Hide frame" → only the ellipse, with no dashed box; "Show frame" →
  the original look. The post ended as it began.
