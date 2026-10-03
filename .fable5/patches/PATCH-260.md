# PATCH-260 — Select, move, resize and delete any element of an AntV picture (with undo)

Status: AUTHORIZED (owner, 2026-10-03: "Finally! You are the PM implement Patch 259 - 262", after the CTO plan
"select any element, move it, resize with handles, delete, undo — saved as a small note per element that survives
every redraw").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-259.

## Why (CTO findings, 2026-10-03)
Napkin's help ("Visuals Customization"): click any element → handles to resize; edit colours per element; editing is
free. Ours: AntV's own `DragElement` (enabled in `lib/ai/antv/interactions.ts`) only moves TEXT, did not move anything
in our stage live (Venue label 760 → 757 → 760 after a redraw), and every redraw rebuilds the SVG from the outline, so
any manual change would be lost. Shapes and icons cannot be selected at all.

Every AntV element carries `data-element-type` (`background`, `title`, `shape`, `item-icon`, `item-label`,
`item-value`, `item-desc`, `items-group`, `item-icon-group`, `btns-group`, `btn-add`, `btn-remove`,
`btn-icon-defs`, …); item elements also carry `data-indexes` (`0`, `0,1`, …). Shapes carry no index (a pie has 16
unindexed `path type=shape`).

## Design
### A. Stored overrides (pure; new `lib/ai/antv/elementOverrides.ts`)
```ts
export interface ElementOverride {
  dx?: number; dy?: number;          // translation in viewBox units, |v| <= 5000
  sx?: number; sy?: number;          // scale, 0.1..10, around the element's own top-left (see C)
  hidden?: true;                     // deleted
}
export interface ElementOverrides { template: string; items: Record<string, ElementOverride> } // <= 300 keys
```
- Stored INSIDE the outline as `VisualOutline.elementOverrides?: ElementOverrides` so every existing path (generator
  preview, Edit window, saving, the board) carries it without new plumbing. `parseOutline` keeps it ONLY through
  `sanitizeElementOverrides(raw)` (lenient, never throws: key regex `^[a-z-]{1,40}(@[0-9]{1,3}(,[0-9]{1,3}){0,3})?(#[0-9]{1,4})?$`,
  finite numbers within the bounds, unknown fields dropped, empty → undefined). The model never sets it: the outline
  route must strip it from the model's output (same pattern as `valuesEstimated`).
- Overrides apply only when `elementOverrides.template` equals the drawn template name; switching design ignores
  them (they come back if the user switches back).
- `elementKey(el, svg): string | null` — stable name of an element:
  - with `data-indexes` → `${type}@${indexes}`; if several share that, append `#n` (document order among them);
  - without → nearest ancestor-or-sibling scope that has an indexed element (the item group) → `${type}@${thatIndexes}#n`;
  - otherwise `${type}#n` = n-th element of that type in document order.
  - Never keys: `background`, `items-group`, `btns-group`, `btn-*`, `btn-icon-defs` (return null). An
    `item-icon-group` selects as a whole (its key), its children are not separately selectable.
- `applyElementOverrides(svg, overrides, template)`: for each matching element set `transform` (composed with any
  existing transform the element had: keep AntV's original in `data-ai-base-transform` and rebuild from it) =
  `translate(dx,dy) translate(x0,y0) scale(sx,sy) translate(-x0,-y0)` where (x0,y0) is the element's own bbox
  top-left; `hidden` → `display:none`. Idempotent (applying twice gives the same DOM).
### B. Drawing (everywhere a picture shows: board, thumbnails, preview, Edit window)
`AntvInfographicRenderer.tsx`: after every render and every `update()`, call `applyElementOverrides` (also when not
editable). The overrides come from `data.outline.elementOverrides`.
### C. Editing (only when `edit` is given)
- New `components/ai/renderers/AntvElementEditor.tsx` (an HTML overlay over the AntV container, like
  `PictureEditOverlay`, counter-scaled with `PictureZoomContext`):
  - **Select:** single click on a selectable element → a blue selection box (its `getBoundingClientRect`) with 8
    handles (`data-ai-element-handle="nw|n|ne|e|se|s|sw|w"`) and a small floating bar above it
    (`data-ai-element-bar`): Undo, Redo, Reset element, Delete (lucide icons with hints). Click on empty space or
    Escape → deselect. `data-ai-element-selected="<key>"` on the overlay root.
  - **Move:** pointerdown on the selected element (or an unselected one: it is selected first) and drag > 4 px →
    live translate; pointerup commits. Screen → viewBox via `svg.getScreenCTM().inverse()`. During the drag the
    events are `stopPropagation`'d so `PictureStage` does not pan and AntV does not act.
  - **Resize:** corner handles scale proportionally (opposite corner fixed); edge handles scale one axis. Live while
    dragging, committed on pointerup. Min size 8 px on screen.
  - **Delete / Backspace** (not while typing in a text editor or input) → `hidden: true`.
  - **Undo / Redo:** own history of `elementOverrides` (max 50). Buttons, and Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y while
    this layer has a selection and focus is not inside a contenteditable/input.
  - Every commit calls `edit.onChange(outlineWithOverrides(outline, nextOverrides))` — NO AI call, no credit.
  - **Text stays editable:** a single click without movement on a text element still lets AntV show its text toolbar
    (PATCH-244, do not swallow that click); double-click still opens AntV's inline text editor.
  - The existing AntV +/− item buttons (PATCH-243) and the mind-map handles keep working.
- `lib/ai/antv/interactions.ts`: remove `DragElement` and `BrushSelect` from the stage interactions (they fight this
  layer); keep the others.
### D. Scope
AntV designs only (the 276 `antv:*` designs). Our own designs (hub, tree, flow, …) are a later patch.

## Tests
- `lib/ai/antv/elementOverrides.test.ts`: sanitize (bad keys, NaN, out-of-range, 301 keys, unknown fields, empty);
  `elementKey` on a small fixture SVG (indexed, unindexed in an item scope, global ordinal, excluded types → null,
  icon group); `applyElementOverrides` sets the transform, keeps the base transform, hides, is idempotent, ignores
  another template.
- `lib/ai/outline.test.ts`: `parseOutline` keeps sanitized overrides and drops junk; the outline route strips a
  model-supplied `elementOverrides` (route test).
- `components/ai/renderers/AntvElementEditor.test.tsx` (jsdom with a fixture SVG; mock `getScreenCTM` /
  `getBoundingClientRect`): click selects (box + 8 handles + bar); drag commits `{dx,dy}`; a corner drag commits
  proportional `{sx,sy}`; Delete hides; Undo/Redo restore; Escape deselects; a click without movement on an
  `item-label` is not stopped (a listener on the svg still receives it); no `onChange` for a sub-threshold move.
- `AntvInfographicRenderer` test: overrides in the outline are applied on first render and after an `update()`,
  also without `edit`.
- **Mutations** (revert with Edit): (1) skip re-applying after `update()` → a renderer test fails; (2) let
  `sanitizeElementOverrides` keep an out-of-range scale → a sanitize test fails.

## Allowed files
```
lib/ai/antv/elementOverrides.ts (+ test)                       new
lib/ai/outline.ts (+ outline.test.ts)                          the optional field + sanitize hook
app/api/ai/generate-outline/route.ts (+ route.test.ts)         strip a model-supplied elementOverrides
lib/ai/antv/interactions.ts (+ its test)
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)
components/ai/renderers/AntvElementEditor.tsx (+ test)         new
```
If a file would pass 800 lines, split it. Forbidden: everything else (PictureStage, our own renderers, the editors,
the database, `package.json`). Real tool calls only (never write a tool call as plain text); one test file at a
time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution,
no test files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of
the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai app/api/ai/generate-outline components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-260.json
```
The CTO compares the gate. Compact report listing every file changed. Do not commit.

**Live (CTO):** on an AntV list, pie and mind map in the generator preview: select a box, an icon, a label; move,
resize, delete; undo/redo; edit a text after moving (the move stays); zoom in and move (follows the pointer); save to
the board, reload: the changes are there; open the Edit window: still editable; then delete my test post.

## Commit message (verbatim)
```
feat(ai): move, resize and delete any part of an AI picture

Click any box, icon or text in an AntV picture to select it, then drag
to move it, pull a handle to resize it, or press Delete. Undo and Redo
are on the small bar above the selection. Changes are free, survive
text edits and colour changes, and are saved with the picture.
```

## Addendum 1 (CTO, 2026-10-03): eleven live rounds, root causes, final result
Every defect below passed jsdom but failed in Chrome; each was found live and fixed with a test that encodes the real
browser behaviour:
1. resize grew ~2x (screen px vs viewBox units) → resize from screen deltas, exact old + delta;
2. AntV icons are `<use>` with a 0x0 client rect AND 0x0 getBBox → geometry falls back to x/y/width/height;
3. moving a card left its icon/label behind → first click selects the whole ITEM (shape + indexed members), a plain
   second click narrows to one element; narrowing only on a click without movement;
4. a large title foreignObject swallowed clicks → hit-testing picks the smallest box under the pointer;
5. a double-click on text was swallowed → text clicks reach AntV's DblClickEditText;
6. **the root cause of the remaining symptoms: in Chrome the drag END never reached the editor** (AntV / pointer
   capture stops `pointerup` before a bubbling `window` listener), so moves were only painted locally and never
   emitted upward — resizes then started from a different map and saves lost the overrides. Window listeners are now
   in the CAPTURE phase (+ lostpointercapture / trailing click), proven by a test whose svg stops pointerup;
7. every element edit re-ran AntV's update and re-fitted the view → an outline change that only touches
   elementOverrides re-applies them without `instance.update` (viewBox unchanged).
Debug attributes kept for live verification: `data-ai-element-key` on every keyable element, `data-ai-element-members`
on the overlay, `data-ai-outline-overrides` and `data-ai-last-emit` on the AntV container.
Final live (own tab, list-grid-badge-card, icons set): item move exact (0,-40 for card, icon, label, value); second
click narrows; se resize +40/+30 with the top-left fixed (0,0); a narrowed icon moves exactly (30,0); double-click edits
text and the moves stay; zoomed move exact (50,0); Delete hides the item, Ctrl+Z restores; the viewBox stays constant
through edits; save + reload keeps the overrides on the board. Gate `.opencode-vitest-260.json`: extra [] missing [];
tsc clean. Known cosmetic: dragging can leave a browser text selection on the "INFOGRAPHIC" label (→ PATCH-261).
