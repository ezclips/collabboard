# PATCH-262 — Swap an icon, and add shapes, icons and text to a picture

Status: AUTHORIZED (owner, 2026-10-03: "implement Patch 259 - 262"; CTO plan: "PATCH-262: swap an icon, and add a
shape or icon from a search box").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-261.

## Why
Napkin ("Visuals Customization"): click an icon → "select new icons"; "Spark Search … to locate and add shapes like
circles or triangles". Ours: an item's icon can only be changed in Edit text (a select list), and nothing can be added
to a picture.

## Design
### A. Swap an icon (outline change — no new storage)
- When the selection (PATCH-260) is an `item-icon` / icon group, the bar shows **Change icon** (`Shapes`/`Smile`
  icon, hint "Change icon", `data-ai-element-icon-toggle`) → a popover `data-ai-icon-picker` with a search field
  (`data-ai-icon-search`) and a grid of ALL `VISUAL_ICON_NAMES` drawn with `VISUAL_ICON_MAP` (filtered by name as
  you type; the current one highlighted). Picking one sets that ITEM's `icon` in the outline (find the item from the
  element's `data-indexes`, respecting the hierarchy root offset exactly as the existing AntV edit mapping does —
  reuse that helper, do not invent a second mapping) and calls `edit.onChange`. Undo via the PATCH-260 history (store
  the outline icon change as a history entry too).
### B. Add shapes, icons and text (stored with the overrides)
- `ElementOverrides` gains `additions?: Addition[]` (max 50):
  ```ts
  type Addition = {
    id: string;                                // /^[a-z0-9]{6,16}$/
    kind: 'rect' | 'rounded' | 'circle' | 'triangle' | 'line' | 'arrow' | 'text' | 'icon';
    x: number; y: number; w: number; h: number;   // viewBox units, bounded like PATCH-260
    fill?: string; stroke?: string; text?: string;  // colours #rrggbb (as PATCH-261)
    label?: string;                            // kind 'text': <= 200 chars, plain text only
    icon?: VisualIconName;                     // kind 'icon': a listed name
    fontSize?: number;                         // 8..72
  };
  ```
  sanitized leniently (unknown kinds/icons/fields dropped, label stripped of control chars and `<`/`>`).
- `applyElementOverrides` also (re)draws the additions after every render/update: one
  `<g data-ai-additions>` appended as the LAST child of the AntV svg (so they sit on top), each addition a
  `<g data-ai-addition="<id>" data-element-type="ai-addition">` with: rect / rounded rect (rx = 12 % of the short
  side) / ellipse / triangle path / line / line + arrow head / `foreignObject` with a text node (`textContent`, never
  innerHTML) / the icon symbol from `lib/ai/antv/icons.ts` (`iconSymbolSvg`, scaled into w×h). Defaults: fill from
  the palette's first colour (text: no fill, text colour = theme text colour), stroke none, fontSize 18.
  Idempotent; additions are keyed `ai-addition@<id>` so PATCH-260/261 select/move/resize/colour/delete work on them
  (a move/resize updates x,y,w,h directly; delete removes the addition).
- **Add** button in the preview toolbar (PATCH-251 bar, after Customize; `Plus` icon, hint "Add",
  `data-ai-add-toggle`), shown only for AntV designs → opens the side panel `add` (PATCH-252 panel) titled "Add":
  - **Shapes:** Rectangle, Rounded, Circle, Triangle, Line, Arrow (buttons with small previews, `data-ai-add-shape`);
  - **Text:** "Add text" (`data-ai-add-text`);
  - **Icons:** a search field + the icon grid (same as A), `data-ai-add-icon`.
  Clicking one inserts it at the centre of the current view (visible viewBox), 120×80 (icon 64×64, text 200×40), selects
  it, and commits (undoable). Double-click on an added text edits it in a small inline input (Enter/blur commits,
  Escape cancels).
- No AI call, no credit, anywhere in this patch.

## Tests
- `elementOverrides.test.ts`: additions sanitize (bad id, kind, icon, 51 items, `<script>` label → stripped text,
  bounds); apply draws each kind with the right element, uses `textContent`, is idempotent, sits last in the svg,
  removed additions disappear.
- `AntvElementEditor.test.tsx` (or a new `AntvAddPanel.test.tsx`): Change icon on an item icon → `onChange` with that
  item's icon replaced (flat and hierarchy fixtures); search filters the grid; Add → Circle inserts a selected
  addition at the view centre; move/resize/colour/delete work on an addition; double-click an added text → edit →
  Enter commits; undo removes the addition.
- **Mutations** (revert with Edit): (1) render the text label with innerHTML → the `<script>` test fails; (2) skip
  the hierarchy root offset in icon swap → the hierarchy fixture test fails.

## Allowed files
```
lib/ai/antv/elementOverrides.ts (+ test)
lib/ai/antv/icons.ts (read; add an exported helper only if needed, + test)
components/ai/renderers/AntvElementEditor.tsx (+ tests) and new small files next to it (icon picker, add panel)
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests)   the Add toolbar icon + the `add` side panel
components/ai/editors/AIContentEditModal.tsx (+ tests)                 ONLY if the Edit window needs the Add entry too
```
Forbidden: everything else (routes, the database, `package.json`, our own renderers). Real tool calls only; one test
file at a time with `--reporter=dot`; never pipe vitest; NEVER compare results with diff/process substitution; no
test files outside the repo; revert mutations with Edit; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-262.json
```
The CTO compares the gate. Compact report listing every file changed. Do not commit.

**Live (CTO):** AntV list and mind map: change an item's icon from the picture; add a circle, an arrow, a text and an
icon, move/resize/colour them; undo; save, reload: all there; then delete my test post.

## Commit message (verbatim)
```
feat(ai): swap icons and add shapes, icons and text to AI pictures

Select an icon in a picture to swap it from a searchable list. The new
Add panel puts rectangles, circles, triangles, lines, arrows, text and
icons on the picture, and they can be moved, resized, coloured and
deleted like everything else. Free and saved with the picture.
```

## Addendum 1 (CTO, 2026-10-03, before implementation): lessons from PATCH-261, 263, 264 and 265
Every item below was a live Chrome defect that jsdom passed; build them in from the start, with tests that model the
real browser:
1. **Clicks on our controls.** Every clickable control we put over or next to the picture (the Change-icon button and
   picker, the Add panel's buttons when they sit in the stage, inline text inputs for added text) carries
   `data-picture-control="true"` and stops `pointerdown`, or PictureStage's pan `setPointerCapture`s the press and
   the click never arrives (PATCH-261 round 2). Reuse `mountEditorInStage` in tests.
2. **Size.** Overlay controls use `useLayerCounterScale` (PictureEditOverlay.tsx), never `1 / PictureZoomContext`
   (on the AntV path the layer is not CSS-scaled; PATCH-263 Add. 1/2).
3. **Stay inside.** Popovers (icon picker) use `useClampedLeft` (AntvElementChrome.tsx) so they are not cut off at the
   preview's right edge (PATCH-263 Add. 3).
4. **The "fill 100%" rule.** `ANTV_PICTURE_SVG_SELECTOR` in PictureStage.tsx is `… [data-antv-container] svg` — a
   DESCENDANT selector, so a nested `<svg>` inside the picture would be stretched to 100% x 100%. Draw added icons
   with a `<g transform="translate(x y) scale(…)">` around the symbol's paths (or `<use>`), NOT a nested `<svg>`; AND
   tighten the selector to the picture's root svg only (`[data-antv-container] > svg` if AntV's root svg is a direct
   child — verify), with a PictureStage test that a nested svg inside the picture does not match. PictureStage.tsx
   is allowed for that selector line only.
5. **Keys.** The additions group is NOT part of AntV's keying: real AntV keys (`shape@0#0`, `item-label@1`, ordinals)
   must be identical with and without additions present (test it, as PATCH-261 did for AntV's transient container).
   AntV's `transient-container` must also stay above/outside the additions logic.
6. **No redraw for local edits.** Adding, moving, resizing, recolouring or deleting an addition is an
   elementOverrides-only change: it must NOT call `instance.update` (PATCH-260 Add. 1 #7) — the view must not jump.
   Swapping an item icon IS a content change (the outline's `icon`) and does update; after it, the user's zoom must
   stay (PATCH-265 keeps it on resize; check the update path too — if AntV's update re-fits the view, restore the
   user's box the way PATCH-258 does).
7. **Escape order.** The icon picker and the added-text input consume Escape first (`preventDefault`), so it does not
   also deselect or close the side panel (PATCH-265).
8. **Read-only previews.** Design tiles and the hover preview must render additions (they are part of the picture)
   but no editing controls — no nested `<button>` inside a tile `<button>` (PATCH-264 round 1).

## Final result (CTO, 2026-10-03, live)
Own tab, generator. List-grid-badge: item 1's icon swapped from the picture via Change icon → search "rocket"
(`#rsc-1509223490` → `#rsc-654153837`), zoom/viewBox unchanged. Add panel: circle, arrow, text and a "heart" icon
inserted and selected; each dragged pixel-exact (−140,−90 / 140,−90 / −140,90 / 140,90); AntV's own keys identical
with the additions present; circle moved 60,0 exact, se-resized +30/+30 exact, filled #ff0000 (rows fill, border);
added text double-click → "Hello Napkin"; viewBox constant through all of it; saved, reloaded: the board post has the
red ellipse, the arrow, "Hello Napkin", the heart, the swapped icon, and no nested `<svg>`. AntV mind map: the same
four additions insert and move exactly, keys unchanged, and node click → narrow still works. No console errors. Gate
`.opencode-vitest-262.json`: extra [] missing [] (path-format duplicate only); tsc clean. Test post deleted.
Deviation accepted: `ThumbButton` / `PreviewToolButton` moved to `components/collabboard/editors/SuggestionThumbButton.tsx`
(behaviour unchanged) to keep OutlineSuggestionsPanel.tsx under 800 lines.
Not verified live: the undo line of the text step (my log filter dropped it; redo left the expected "Hello Napkin").
Follow-ups noted: new additions all land on the same spot (cascade them); AntV mind-map nodes have no icons, so icon
swap there is untested; AntvElementEditor.tsx is at 799 lines — the next change to it must split it first.
