# PATCH-263 — Resize handles must not cover a small element (mind map nodes)

Status: AUTHORIZED (owner, 2026-10-03: "continue with the implementation from the patches"; CTO bug fix found in the
PATCH-261 live pass, a PATCH-260 defect).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-261 (cc1111ef).

## Why (CTO live finding, Chrome, 2026-10-03)
On an AntV mind map (`antv:hierarchy-mindmap-branch-gradient-rounded-rect`) a node is ~12-20 px tall on screen. After
the first click selects the node (`item@0,1`), the 8 handles (`data-ai-element-handle`, 10x10 px buttons) are centred
ON the box edges (`components/ai/renderers/AntvElementChrome.tsx`, `left: rect.left + fx*width`, `top: rect.top +
fy*height`), so the n/s/e/w and corner handles together cover the node's middle. `document.elementsFromPoint` at the
label centre: `BUTTON(handle) > BUTTON(handle) > SPAN > foreignObject[item-label@0,1] > rect[shape@0,1#0]`. Result:
- the second click lands on a handle → it never narrows to the label or the shape;
- double-click on the label never reaches AntV's text editor (text editing on mind maps is broken while selected);
- the same happens on any small element (a short label, a small icon) in every design.
No redraw is involved (measured: viewBox, positions and the svg DOM are unchanged by the clicks).

## Design (`AntvElementChrome.tsx`, + the editor only if needed)
1. Handles sit OUTSIDE the selection box: each handle's centre is offset outward by half the handle size plus 2 px
   (corners diagonally, edge handles perpendicular to their edge), so no handle overlaps the box interior. Keep the
   box outline where it is.
2. Edge handles (n, s, e, w) are not rendered when the box is smaller than 28 px in the perpendicular screen
   dimension (n/s hidden when height < 28 px; e/w hidden when width < 28 px). Corner handles always show.
3. The selection box outline itself must not take pointer events (`pointer-events: none`); only the handles and the
   bar do. Clicks inside the box therefore reach the svg element underneath (narrowing and AntV double-click edit).
4. Screen sizes come from the counter-scaled overlay the handles already use (PictureZoomContext); compute in
   screen pixels, not percent of the picture.

## Tests (`components/ai/renderers/AntvElementEditor.test.tsx`)
- With a 100x14 px selection: no handle's rect intersects the selection box interior; n and s are absent; the four
  corners and e/w are present.
- With a 100x100 px selection: all 8 handles present, none intersecting the interior.
- A click at the centre of a small selected item reaches the svg (a listener on the svg receives it) and the second
  click narrows to the element under the pointer; a dblclick at the centre of a selected text element is received by
  the svg (AntV's editor listens there).
- Mutation (revert with Edit): put the handles back on the edges → the intersection test fails.

## Allowed files
```
components/ai/renderers/AntvElementChrome.tsx
components/ai/renderers/AntvElementEditor.tsx (only if the pointer-events/size plumbing needs it)
components/ai/renderers/AntvElementEditor.test.tsx
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no
test files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the
dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/ai/renderers lib/ai/antv --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-263.json
```
The CTO compares the gate. Short report. Do not commit.

**Live (CTO):** mind map: click a node → handles outside it; second click narrows to the label; double-click edits
the label; recolour the label; list design: PATCH-260/261 checks still pass (move, se resize exact, colours).

## Commit message (verbatim)
```
fix(ai): selecting a small part of a picture no longer blocks clicking it

The resize handles now sit outside the selection, and small selections
show only the corner handles, so a mind map node can be clicked again to
pick its label, and double-clicking its text edits it.
```

## Addendum 1 (CTO, 2026-10-03, live round 1): the mind map's +/− buttons cover the nodes
Live (own tab, AntV mind map, zoom 54%): the handle fix works — after the first click n/s are hidden, the second click
narrows to `item-label@0,1`, double-click edits ("Food" → "Food Z"), zoom and viewBox stay put through the edit. But
the PATCH-240/243 mind-map +/− buttons (`components/ai/renderers/PictureEditOverlay.tsx`, `data-ai-edit-add` /
`data-ai-edit-remove`, rendered by `AntvInfographicRenderer` for mind maps) then block the picture:
1. **Wrong size.** They are meant to be 18 px on screen at every zoom (`scale(1/zoom)`), measured live
   `getBoundingClientRect().width === 33` at 54%: on the AntV path the stage zoom does NOT CSS-scale the layer they live
   in, so the counter-scale enlarges them instead of cancelling a scale. Fix: the rendered on-screen size must be 18 px
   whatever the zoom — compute the counter-scale from the layer's real on-screen scale (e.g. the overlay element's
   `getBoundingClientRect().width / offsetWidth`) instead of trusting the context value; keep the context for our own
   renderers if that is where it is correct. Same for the inline edit input and colour popover in that file.
2. **Invisible but clickable, all at once.** Every node's buttons are `opacity-0 … group-hover:opacity-100` with
   `pointer-events-auto`, so 16 invisible 33 px circles catch clicks meant for the nodes (live: after one text edit,
   two clicks on a node label selected nothing). Fix: a button is rendered (or at least takes pointer events) only
   for the node under the pointer or the node whose item is selected in the element editor; all others are
   `pointer-events: none` and invisible.
3. **Outside the node.** A visible button sits outside its node's box (offset outward by half its size + 2 px), not
   centred on the node edge, so it never covers the label.
Tests (`PictureEditOverlay.test.tsx` and/or the renderer test): with a layer whose real screen scale differs from the
context zoom, the button's rect is 18 px; with two nodes, only the hovered node's buttons accept a click and a click
on the other node's label reaches the svg; a visible button's rect does not intersect its node's box. Mutation (revert
with Edit): pointer-events auto on all buttons → the click-through test fails.
Allowed files, in addition: `components/ai/renderers/PictureEditOverlay.tsx` (+ test),
`components/ai/renderers/AntvInfographicRenderer.tsx` (+ tests, only to pass hovered/selected node and box geometry),
`components/ai/renderers/AntvElementEditor.tsx` (only to expose the selected item). Our own renderers that use
PictureEditOverlay (`InfographicRenderer`, `MindmapTreeRenderer`) must keep working: run their tests.

## Addendum 2 (CTO, 2026-10-03, live round 2): the selection bar is mis-scaled; a text edit later resets the zoom
Live: Addendum 1 works (the +/− circles measure 18 px at 54%). Two more defects on the same mind map:
1. **Our own chrome has the Addendum-1 scale bug.** `AntvElementEditor.tsx:88` uses `1 / PictureZoomContext` for the
   selection bar, the handles and the colour popover; at 37% they are drawn ~2.7x too big (the undo/redo icons ~40 px,
   handles ~20 px; screenshot), at 54% ~1.85x. Fix: use the same real-layer counter-scale as PictureEditOverlay (export
   `useLayerCounterScale` from there, or move it into a tiny shared module) for the bar, handles and popover. Test:
   with a layer whose real screen scale differs from the context zoom, a handle measures 10 px and the bar keeps its
   100%-zoom size.
2. **A text edit resets the zoom one interaction later.** Sequence live: zoom in to 54% → double-click a mind map label
   → type → click outside (zoom still 54%, viewBox unchanged for 2.5 s) → Escape → click the same node: the zoom is
   now 37% and the picture re-fitted, so the node moved from under the pointer and the next click hit empty space
   (deselect). Cause in `AntvInfographicRenderer.tsx`: AntV's own text edit fires `options:change` → `emitOutline(next,
   'antv-change')` updates `outlineRef` but NOT `lastUpdatedOutlineRef`; when that outline later comes back as
   `data.outline` (the parent re-renders, e.g. on a selection change), the update effect sees new content and calls
   `instance.update(...)`, which re-fits the view. AntV has already drawn that change itself. Fix: when emitting an
   `'antv-change'`, record it as drawn (`lastUpdatedOutlineRef = JSON.stringify(withoutElementOverrides(next))`), so the
   echo takes the no-update path; keep calling `update` for changes that come from outside AntV (side panel text,
   design, theme, style, the +/− buttons / mind-map handles if they rely on our update to draw). Test: an
   `options:change` that maps to a new outline, then the parent passing that outline back (and re-rendering again
   with an unrelated prop change) → `instance.update` is NOT called; a side-panel text change still calls it.
   Mutation: drop the new line → the test fails.
Allowed files, in addition: `components/ai/renderers/AntvElementColourMenu.tsx` (only the scale).

## Addendum 3 (CTO, 2026-10-03, live round 3): a giant icon in the colour popover; popover clipped at the edge
Live: Addendum 2 works — the zoom stays 54% after a text edit, the next click selects the node and a second narrows
to the label, the label turns green, the bar is normal size at 37-54%, hovering a node shows only its two 18 px +/−
buttons and + adds a branch (5 → 6 nodes). Two defects remain (screenshot):
1. **A giant "Reset colour" icon.** `PictureStage.tsx:550`:
   `[data-picture-stage][data-picture-mode="antv"] [data-picture-content] svg { width: 100% !important; height: 100%
   !important; … }` matches EVERY svg inside the picture content, including the lucide icons in our overlays. The
   popover's Reset button stretches to the popover width, so its `RotateCcw` icon is drawn ~250 px. Fix: the rule must
   match only the picture's own svg (AntV's root svg), never an svg inside `[data-picture-control]` or
   `[data-ai-edit-overlay]` (e.g. `:not([data-picture-control] svg)` or scope it to AntV's container's direct svg).
   Also check `findSvg` in PictureStage (`querySelector('svg')`) cannot return an overlay icon (it must find the
   picture's svg even if an overlay with icons comes earlier in the DOM). Test: render the stage in antv mode with an
   overlay containing a lucide icon → the icon's computed width is not `100%` (jsdom: assert the stylesheet selector
   does not match the overlay svg via `element.matches(selector)`), and `findSvg` returns the picture svg when an
   overlay with an svg precedes it.
2. **Popover and bar clipped at the right edge.** The popover is anchored at `rect.left` and grows rightward; for a
   node near the right edge its hex field is cut off by the preview's overflow. Fix: after mount, measure the popover
   (and the bar) against the stage viewport and shift it left (or open it right-aligned to the selection) so it stays
   fully inside; same vertically (open above the bar if below would leave the stage). Test: a selection at the right
   edge → the popover's right edge ≤ the container's right edge.
Allowed files, in addition: `components/ai/renderers/PictureStage.tsx` (+ test) ONLY for the svg selector and
`findSvg`.
Known cosmetic, not required: the hovered node's "−" circle overlaps its node's right edge by ~4 px.

## Final result (CTO, 2026-10-03, live round 4)
Mind map (own tab, 54%): first click selects the node with n/s handles hidden and all handles outside it; second click
narrows to the label; double-click edits ("Food" → "Food Z") with zoom and viewBox unchanged; the next click selects
again and a second narrows; the label turns green via the Colour popover, which now fits inside the preview with a
normal 12 px Reset icon; the bar is normal size; hovering a node makes only its two 18 px +/− buttons live, and + adds a
branch (5 → 6). List regression (the PATCH-261 script): fill/border/icon/text colours, invalid hex, undo/redo, drag
leaves no text selection, viewBox constant, theme change, save + reload — all pass; double-click on a label opens AntV's
text editor. Gate `.opencode-vitest-263.json`: extra [] missing [] (path-format duplicate only); tsc clean. Test post
deleted. Found, not in this patch (→ PATCH-265): Escape closes the generator's side panel, the preview widens and the
picture re-fits, losing the user's zoom (54% → 37%, viewBox changed). Known cosmetic: a hovered node's "−" circle
overlaps the node's right edge by ~4 px.
