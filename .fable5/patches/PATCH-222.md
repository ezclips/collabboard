# PATCH-222 — "Hide draw frame", and a frameless drawing has no white box behind it

Status: AUTHORIZED (owner, 2026-09-30: "call it hide draw frame and show draw frame! Then remove the bg
around the drawing as default").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-221

## Why (CTO)
1. The owner wants the menu wording **"Hide draw frame" / "Show draw frame"** for drawings. The same
   item also serves images and AI components (`ImagePostContextMenu`, and `NotePostContextMenu` for
   ai-component), where "draw frame" would be wrong. So only DRAWINGS get the new words; the other
   types keep "Hide frame" / "Show frame".
2. **The white box:** `DrawingEditor.tsx` `handleSaveAndClose` (~318-332) exports the preview SVG with
   `exportBackground: true, viewBackgroundColor: "#ffffff"`. So every preview has a full-size white
   `<rect>` baked in, and a frameless drawing still covers whatever is beneath it with a white
   rectangle (seen live over a YouTube card).

## Design
1. **Labels** (`components/collabboard/menus/NotePostContextMenu.tsx`): when `padlet.type === 'drawing'`,
   the item reads **"Hide draw frame"** / **"Show draw frame"**; for other types it stays "Hide frame"
   / "Show frame". `ImagePostContextMenu` is unchanged. The action id is unchanged.
2. **New previews are transparent:** in `DrawingEditor.tsx`, export with `exportBackground: false`.
   Keep `exportWithDarkMode: false`. A FRAMED drawing still looks the same (its card behind is white);
   a frameless one shows the board through.
3. **Existing previews:** a new pure helper `stripDrawingPreviewBackground(previewUrl: string): string`
   in `lib/domain/canvas/drawingPreview.ts` (new):
   - It applies only to a `data:image/svg+xml;base64,` URL. It decodes it and removes the background
     `<rect>` Excalidraw emits: the FIRST `<rect>` that is a direct child of the root `<svg>` (after an
     optional `<metadata>`, `<defs>` or `<style>`), with `x="0" y="0"`, width/height equal to the
     root's `width`/`height` (or the viewBox's), and a `fill` attribute. It then re-encodes the SVG.
   - Anything else (a non-SVG, a different first element, an unparsable input) → the input returned
     UNCHANGED. It never throws.
   - Use string/regex handling that works in both the browser and jsdom (no DOMParser dependency is
     required; if you use DOMParser, guard for its absence).
4. **Where it applies:** in `PostCardContent.tsx`'s drawing branch, when
   `padlet.metadata?.fullView === true`, the `<img src>` uses
   `stripDrawingPreviewBackground(previewUrl)` (memoised on `previewUrl`). A framed drawing uses the
   URL as it is.
   - Also check that nothing else paints white behind a frameless drawing: the Freeform generic card
     branch (`FreeformPadletCards.tsx` ~3417, where `isFullView` is computed) must give the card body
     a transparent background when `isFullView`.
   - If it already does, change nothing there and say so. If it does not, that one background change
     is authorized, and ONLY that change in FreeformPadletCards.
   - The column child from PATCH-220 already sets a transparent background.

## Tests
- `drawingPreview.test.ts`:
  - an Excalidraw-style SVG (with `<defs>` and a full-size white rect) → the rect is removed and the
    other elements are kept;
  - a rect that is NOT full-size, or not first → kept;
  - a PNG data URL, an http URL, or garbage → returned unchanged;
  - the result is still a valid `data:image/svg+xml;base64,` URL.
- `DrawingEditor`: the export is called with `exportBackground: false`. If an existing test mocks
  `exportToSvg`, extend it; otherwise add a focused test.
- `PostCardContent`:
  - a fullView drawing's `<img src>` is the stripped URL;
  - a framed drawing's is the original.
- Menu:
  - a drawing shows "Hide draw frame" and then "Show draw frame";
  - an ai-component shows "Hide frame".
- **Mutations:**
  - skip the strip for fullView → its test fails;
  - export with the background again → the export test fails.

## Allowed files
```
lib/domain/canvas/drawingPreview.ts (+ test)                          (new)
components/collabboard/PostCardContent.tsx                            (the drawing <img> src only)
components/collabboard/editors/DrawingEditor.tsx                      (the export option only)
components/collabboard/menus/NotePostContextMenu.tsx                  (the label only)
components/collabboard/canvas/ui/FreeformPadletCards.tsx              (ONLY a transparent card body for isFullView, if needed)
tests beside them; freeformHideFrame.behavior.test.tsx for the label assertions
```
Forbidden: the database, `package.json`, `CanvasClient.tsx`, and existing stored data (no migration;
stored previews are cleaned at render). **Do not touch the comments inside
`isBlockingEditorModalOpen`.** If a census pins any of these, STOP and ask (spec line, code at
file:line, proposed resolution).

Use the Read/Grep/Edit tools; `rg` with `timeout 30` if you need bash. Every test command is
`timeout 600 npx vitest run …`. REAL tool calls only. No `ls` on the repo root, no curl of the dev
server, no git writes, no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/domain/canvas components/collabboard/freeformHideFrame components/collabboard/editors components/collabboard/PostCardContent
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-222.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):**
- the owner's ellipse, with "Hide draw frame", shows no white box: the board or cards beneath show
  around the ellipse;
- "Show draw frame" restores it (the owner's post ends as it began);
- a new drawing saves with a transparent preview.

## Commit message (verbatim)
```
feat(canvas): "Hide draw frame", and a frameless drawing has no white box

Drawings now say "Hide draw frame" / "Show draw frame" in their
right-click menu. A drawing's preview was exported with a white
background baked in, so even without a frame it covered whatever lay
beneath it. New previews are exported transparent, and a frameless
drawing's stored preview has its background rectangle removed when it
is shown, so existing drawings look right without being re-saved.
```

## Addendum (CTO, 2026-09-30): live result
- The owner's ellipse (frame already hidden by the owner): the menu reads "Show draw frame"; the
  shown preview has no background rect, and the ellipse sits directly on the YouTube card beneath
  with no white box. Left as the owner set it.
- A NEW drawing (the CTO's test rectangle): saved with `fullView: true`; the preview is an SVG with no
  baked-in white rect; the board shows through; the menu offers "Show draw frame". The test drawing
  was deleted (DELETE 204), as was an earlier empty attempt.
- `FreeformPadletCards.tsx` needed no change (the card body is already transparent in full view).
