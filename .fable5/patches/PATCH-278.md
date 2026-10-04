# PATCH-278 — "Edit as drawing": turn an AntV picture into an Excalidraw drawing post

Status: AUTHORIZED (owner, 2026-10-04: "yes" to the PM plan after reviewing the spike page; step 1 of 4).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-277 (6c30b188, converter `lib/ai/antv/toExcalidraw/`). Read
`.fable5/reviews/SPIKE-277-antv-to-excalidraw.md` first.

## Goal
A user who has an AntV picture (in the generator or in an AI post's Edit window) clicks **"Edit as drawing"**. A new
**drawing post** is created from the converted picture and opens at once in the drawing editor (Excalidraw), where
everything can be edited by hand. The AI post (if any) is left untouched.

## Out of scope (later patches; do NOT do them here)
- Inserting natively into a board in the Drawing layout (`DrawingLayout.tsx`): there the new post is an ordinary drawing
  post, like on any other layout.
- The AI choosing the design family; Mermaid flowcharts.
- Removing our own designs or the DOM-override picture editor.
- Self-hosting Excalidraw's assets.

## Design
### A. Converter work left from the spike (`lib/ai/antv/toExcalidraw/`)
1. **Speed** (SPIKE-277 known item: roadmap 420 ms). Sample paths ANALYTICALLY:
   - parse `d` (absolute and relative `M L H V C S Q T A Z`);
   - straight segments → exact end points;
   - cubic and quadratic curves and arcs (SVG arc endpoint → centre parameterisation, as in the SVG spec, appendix
     F.6) → points at ≤ 4 user units spacing;
   - then the existing RDP simplification (tolerance 0.5);
   - `getPointAtLength` is used only as a fallback when `d` cannot be parsed (count `pathFallback`).
   - Put this in a new `pathSampler.ts`.
   - Tests: line, H/V, relative commands, cubic, quadratic, arc with large-arc/sweep combinations, against
     reference points (≤ 0.5 unit), and a road-like fixture (a 4,000-unit closed path with radius-60 arcs).
   - Live target: the roadmap row < 150 ms.
2. **Split `readSvgScene.ts`** (532 lines) to ≤ 400: move the text reading (string, box, style, line count) into
   `readText.ts` and the icon reading into `readIcon.ts`. Behaviour unchanged; existing tests stay green.

### B. Drawing-post data from a rendered picture (`lib/ai/antv/toExcalidraw/drawingPost.ts`, new)
`buildDrawingPostData(svg: SVGSVGElement, opts: { background: string; title?: string }): Promise<DrawingPostData>`:
- `convertAntvSvg` (pill = polygon, the default);
- `drawingData` = `JSON.stringify(elements)`;
- `drawingFiles` = `JSON.stringify(files)`;
- `drawingAppState` = `JSON.stringify({ viewBackgroundColor: opts.background })`;
- `previewUrl` = the SAME preview `DrawingEditor` builds on save: `exportToSvg` (from `loadExcalidraw()`) with the same
  appState flags as `DrawingEditor.tsx` ~L318–335, serialised to a base64 `data:image/svg+xml` URL;
- `title` = `opts.title`;
- `size` = `{ width: 500, height: clamp(round(500 × h / w), 200, 900) }` from the picture's viewBox.
- Throws a typed `DrawingConversionError` when the svg is missing or the conversion yields no elements.

Exactly the field names `DrawingEditor`'s `onSave` produces (`drawingData`, `drawingAppState`, `drawingFiles`,
`previewUrl`, `title`). Read that file; don't guess.

### C. Saving: one shared "create drawing post" path (`hooks/canvas/usePadletSave.ts`)
- Extract the "new drawing" branch of `saveDrawing` (~L1602–1690) into ONE function inside the hook:
  `createDrawingPost(data, opts?: { placement?: { x: number; y: number }; size?: { width; height }; openEditor?: boolean })`.
  - `saveDrawing` calls it for `padletToEdit.id === 'new'` (behaviour unchanged).
  - It runs the same `canEditBoardContentNow()` check and the same `checkPlacementRequired({ kind: 'drawing', … })`.
  - It inserts `type: 'drawing'` with `metadata = { drawingData, drawingAppState, drawingFiles, previewUrl }`, and
    returns the created padlet.
  - It does NOT read `padletToEdit`, because the converted post is new even when an existing AI post is open.
  - The file is already 1,898 lines: the net growth must be ≤ 15 lines (it is a move, not new logic). Export
    `createDrawingPost` from the hook's return value.
- **`openEditor: true`**: after a successful insert, `setPadletToEdit(created)` and `setIsDrawingEditorOpen(true)`, the
  same state the board uses to open an existing drawing post.
- **When the layout needs the placement prompt** (grid / columns / wall / timeline): the post is created by the
  placement flow, and the editor is NOT opened automatically. Document this in a comment; the user opens the post
  from the board.

### D. The button (`components/ai/renderers/EditAsDrawingButton.tsx`, new)
- Props:
  - `getSvg: () => SVGSVGElement | null`;
  - `getBackground: () => string`;
  - `title?: string`;
  - `disabledReason?: string`;
  - `onDrawing: (data: DrawingPostData) => void | Promise<void>`.
- Label "Edit as drawing", icon `PenTool` (lucide), `data-ai-edit-as-drawing="true"`.
- **States:**
  - while converting: "Converting…", disabled;
  - on `DrawingConversionError` or any throw: an inline message under the button, "This picture could not be turned
    into a drawing." (`data-ai-edit-as-drawing-error`); the picture and the modal stay as they are;
  - `disabledReason` → disabled, with the reason as `title`.
- **Background:** the computed `background-color` of the renderer's `[data-ai-theme-background]` element (the
  picture's real ground, including a custom background from Colours & Fonts), normalised to `#rrggbb`.

### E. Where the button appears (wiring only in the two big files)
- **Generator (`AIComponentEditor.tsx`):** in the footer, left of "Save to Canvas".
  - Shown ONLY when the selected design is an AntV design and the new prop `onEditAsDrawing` is given.
  - `getSvg` = the SELECTED layer's picture: `[data-ai-preview-selected-layer] [data-antv-container] svg`. Never the
    hover layer.
  - Disabled with the SAME condition and reason as Save (`canSave` / `saveDisabledReason`: example numbers, an
    all-zero pie, …). A drawing must never freeze example numbers (PATCH-268).
- **Edit window (`AIContentEditModal.tsx`):** in the footer, left of "Save changes".
  - Shown only for an AntV infographic and when `onEditAsDrawing` is given.
  - Same disabled rule as its Save.
- **`CanvasModals.tsx`:** passes `onEditAsDrawing` to both. It:
  1. closes the AI modal (as its Cancel does, without saving the AI post);
  2. calls `createDrawingPost(data, { size: data.size, openEditor: true, placement })`, where `placement` is next to the
     AI post being edited (`x = post.position_x + post.width + 40`, `y = post.position_y`) for the Edit window, and
     undefined (the default new-post position) for the generator.
  - Thread `createDrawingPost` from `usePadletSave` to `CanvasModals` the same way `saveDrawing` is threaded. Find the
    parent that renders `CanvasModals`.
- The AI post itself is never modified or deleted.

## Tests
- `pathSampler.test.ts` as A.1; the existing converter tests stay green after the A.2 split.
- `drawingPost.test.ts`:
  - field names and JSON round-trip;
  - `viewBackgroundColor`;
  - size clamp;
  - error on an empty svg;
  - `previewUrl` is a `data:image/svg+xml;base64,` URL.
  - Use the real `convertToExcalidrawElements` via the existing jsdom seam; stub `exportToSvg` only if it cannot run in
    jsdom, and say so.
- `EditAsDrawingButton.test.tsx`: converting state, error message, disabled reason, `onDrawing` receives the data.
- **Generator:**
  - the button exists only for an AntV design;
  - it is disabled exactly when Save is (example values);
  - it reads the selected layer while a tile is hovered;
  - clicking calls `onEditAsDrawing`.
- **Edit window:** the same for its footer.
- **`usePadletSave` (`createDrawingPost`):**
  - insert payload: `type: 'drawing'`, the 4 metadata fields, size, placement;
  - `openEditor` sets `padletToEdit` to the created post and opens the drawing editor;
  - a placement-prompt layout → no insert, the draft is handed to the prompt, the editor is not opened;
  - `saveDrawing` for a new drawing still works through it (an existing test, or add one).
- **Mutations** (revert with Edit):
  - read the hover layer instead of the selected one → the generator test fails;
  - let the button stay enabled with example values → the test fails.

## Allowed files
```
lib/ai/antv/toExcalidraw/pathSampler.ts, readText.ts, readIcon.ts, drawingPost.ts (+ tests)   new
lib/ai/antv/toExcalidraw/geometry.ts, readSvgScene.ts, scene.ts, report.ts (+ tests)          A
components/ai/renderers/EditAsDrawingButton.tsx (+ test)                                      new
components/collabboard/editors/AIComponentEditor.tsx                 wiring only (prop + button)
components/ai/editors/AIContentEditModal.tsx                         wiring only (prop + button)
components/collabboard/canvas/ui/CanvasModals.tsx                    wiring only
hooks/canvas/usePadletSave.ts (+ tests)                              extract createDrawingPost, net ≤ +15 lines
the component that renders CanvasModals                              wiring only (thread createDrawingPost)
new test files next to these
```
Forbidden: everything else, the database schema, the Excalidraw fork, `DrawingLayout.tsx`, `DrawingEditor.tsx`
(read only).
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
timeout 600 npx vitest run lib/ai/antv components/ai components/collabboard/editors hooks/canvas --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-278.json
```
The CTO compares failing files AND failing test names. Report:
- every file changed, with its line count;
- the `usePadletSave.ts` line delta;
- where `createDrawingPost` is threaded.

Do not commit.

**Live (CTO, own tab, freeform board af02972f):**
1. The spike page: roadmap row < 150 ms, all rows still pass.
2. **Generator:** generate, pick an AntV design, then "Edit as drawing":
   - the drawing editor opens with the picture (texts, colours, icons);
   - save → the board shows a new drawing post with the preview;
   - reload → it is still there; reopen it → editable.
3. **Edit window** of an existing AI post (a test AI post made first), then "Edit as drawing": a new drawing post
   appears next to it, and the AI post is unchanged.
4. **Example-value chart:** "Edit as drawing" is disabled with Save's reason.
5. Board signatures of the existing AI posts are identical.
6. All test posts are deleted.

## Commit message (verbatim)
```
feat(ai): edit an AI picture as a drawing

AntV pictures get an "Edit as drawing" button in the generator and in
the Edit window. It turns the picture into a drawing post made of
normal drawing shapes and opens it in the drawing editor, where every
part can be changed by hand. The AI post itself stays as it was.
```

## Final result (CTO, 2026-10-04, live)
Own tab, board af02972f, write-locked except generate-outline (unlocked only for the saving steps):
- Spike page: roadmap 420 ms → 6.3 ms (analytic path sampler); all 18 rows still pass.
- Generator: "Edit as drawing" shown on an AntV design, absent on our own mind-map design → click → drawing post
  created (type drawing; 23 elements incl. 4 icon images, texts, base64 SVG preview, 17 KB) → the drawing editor
  opens, the generator closes → Save Changes → reload: the post shows its preview.
- Edit window of a fresh AI post: "Edit as drawing" → a NEW drawing post next to the AI post; the AI post received
  no write at all.
- Example-value pie: "Edit as drawing" disabled with Save's reason ("Make the chart or type your numbers first").
- Existing board AI posts: signatures identical before/after. Test posts 2f050604, 8b2a7463, 9d7e15bf deleted.
- Gate `.opencode-vitest-278.json`: one extra failing name versus PATCH-277
  (`excalidrawContextMenuRenderer.characterization … only the wrapper mentions the prop outside the fork`): a full
  source-tree scan that hit a STACK_TRACE_ERROR (timeout) under the full parallel run; it passes alone (34/34) and no
  file outside the wrapper mentions the prop. Flaky under load, not caused by this patch. tsc clean.
Found, not caused by this patch (→ follow-up, owner decision): drawing posts are "not resizable"
(`postResizePolicy.ts`: `drawing` → `none`), so EVERY drawing post renders as a small fixed card on the freeform
board and the stored size (500 wide) is not used. Converted pictures therefore look small next to their AI post.
