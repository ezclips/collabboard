# PATCH-289 — Transparent chart background; large library preview on hover

Status: AUTHORIZED (owner, 2026-10-05: "add me in the 'Chart Values' panel a checkmark for background transparent.
Also give me an excalidraw canvas preview from the library object by mouse over as the library sample [is] very
small").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-287 (chart values), PATCH-288.

## Facts (CTO-verified)
- A library chart has two background rectangles: role `background` (theme ground, `#FFFFFF`) and `background#0`
  (AntV's own ground, `#ffffff`) — see the roles in `public/libraries/antv-diagrams.excalidrawlib`.
- `carryOver` (`lib/ai/antv/chartValues/redraw.ts`) maps background roles whatever the counts (287 Addendum 1 item 5)
  and copies a property only when the user changed it.
- Excalidraw's library thumbnail: `LibraryUnit.tsx` renders `<div class="library-unit">` with a child
  `<div class="library-unit__dragger">` whose content is the item's exported `<svg>` (set by `useLibraryItemSvg`).
  The library sidebar renders inside the Excalidraw container, i.e. inside `ExcalidrawWrapper`'s root `<div>`.
- Do not edit the Excalidraw fork.

## Design
### 1. Transparent background in "Chart values"
- `data.ts`: `AntvChartData.transparentBackground?: boolean` (schema: optional boolean). Old data without it parses.
- Panel: a checkbox row above the footer, `data-antv-chart-transparent`, label "Transparent background". Initial
  state: `data.transparentBackground`, or — when absent — true if every background-role element of the chart is
  currently `transparent`.
- `buildNextData(data, texts, rows, { transparentBackground })` stores the flag.
- `carryOver`, background roles only: when `nextData.transparentBackground` → `backgroundColor: 'transparent'`; when
  it is false and the previous data had it true → take the new render's colour (do NOT carry the old `transparent`);
  otherwise the existing changed-only rule. Nothing else changes for other roles.
- Apply with only the checkbox changed redraws (one undo step) like any other edit.

### 2. Large library preview on hover — `components/collabboard/editors/LibraryHoverPreview.tsx` (new, ≤ 200 lines)
- Props: `rootRef` (the wrapper's root element). Listens with event delegation on that root: `pointerover` /
  `pointerout` / `dragstart` / `wheel` (capture), plus `keydown` Escape on `document` while shown.
- Hovering a `.library-unit__dragger` that contains an `<svg>` for 250 ms (mouse or pen; never `touch`) shows a
  floating box `data-library-hover-preview` (`position: fixed`, `z-index` above the sidebar, `pointer-events: none`,
  white, 1 px `#e5e7eb` border, radius 8, shadow, padding 8) holding `svg.cloneNode(true)` — a clone, never the
  original node, never `innerHTML` of a string. The clone gets `width="100%"`, its `height` attribute removed and
  `style.height = 'auto'`, `style.maxHeight = '300px'`, `display: block`; the box is 360 px wide (less on narrow
  windows: `min(360px, 40vw)`).
- Position: to the LEFT of the hovered unit (the sidebar is on the right), vertically centred on it, clamped inside
  the viewport with 8 px margin; if there is no room on the left, below the unit.
- Hidden on: leaving the unit, `dragstart` (a drag must show Excalidraw's own ghost only), wheel/scroll, Escape, the
  unit leaving the DOM, the sidebar closing. A pending timer is cancelled on leave.
- Read-only surfaces: rendered too (viewing the library is harmless).

### 3. Wiring `ExcalidrawWrapper.tsx` (≤ +8 lines)
A `ref` on the existing root `<div>` and `<LibraryHoverPreview rootRef={…} />` next to the chart values control.

## Tests
- data: old data without the flag parses; `transparentBackground: 'yes'` rejected.
- `carryOver`: flag true → both background roles `transparent`; flag false after true → the render's colour; flag
  absent, user-changed background colour → still carried (287 behaviour); other roles unaffected.
- panel: checkbox initial state from data and from the canvas; toggling + Apply passes the flag to the redraw.
- hover preview (jsdom, fake timers): hover a `.library-unit__dragger` with an svg → after 250 ms a preview holds an
  svg that is NOT the original node and has `width="100%"`; leave before 250 ms → nothing; leave after → hidden;
  `pointerType: 'touch'` → nothing; `dragstart` hides; a dragger without an svg → nothing; the box is left of the unit
  and clamped inside the viewport.
- Source test: no file of this patch imports from `components/collabboard/canvas/excalidraw_fork`.

## Allowed files
```
lib/ai/antv/chartValues/data.ts, redraw.ts, redrawChart.ts (+ tests)
components/collabboard/editors/AntvChartValuesControl.tsx, .styles.ts (+ test)
components/collabboard/editors/LibraryHoverPreview.tsx (+ test)              new
components/collabboard/editors/ExcalidrawWrapper.tsx                          wiring, <= +8
```
Forbidden: everything else, the Excalidraw fork, the library file, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai/antv/chartValues components/collabboard/editors/AntvChartValuesControl components/collabboard/editors/LibraryHoverPreview --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-289.json
```
Do not commit.

**Live (CTO):** insert the donut → Edit values → tick Transparent background → Apply → the chart has no white ground
(the board shows through after save); untick → white again; Ctrl+Z works. Open the library, hover a pie thumbnail →
a large sharp preview appears left of it; moving away hides it; dragging an item onto the canvas shows no preview.

## Commit message (verbatim)
```
feat(drawing): transparent chart background and large library previews

The chart values panel has a Transparent background option. Hovering an
item in the drawing library shows a large preview of it next to the
library, so the small thumbnails are easy to tell apart.
```

## Final result (CTO, 2026-10-05, live)
Own tab, board af02972f, new drawing:
- Library open, hover the first thumbnail: nothing at 100 ms, at 600 ms a 360×166 preview with a cloned svg left of
  the library; hovering another item moves it there (360×171); moving away hides it; inserting an item leaves none.
- Donut inserted → Edit values → "Transparent background" unchecked initially → tick + Apply → reopened shows it
  ticked → untick + Apply → Ctrl+Z → saved (201): `background=transparent background#0=transparent`, flag `true`.
  (The editor ground is white, so the difference is verified in the saved data.)
- Test post deleted (8ac99ab6). Gate `.opencode-vitest-289.json`: 59/59 identical to 288 by name; tsc clean. Wrapper
  +5/−1; no fork file touched.
