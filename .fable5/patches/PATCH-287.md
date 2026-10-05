# PATCH-287 — Change the numbers of an AntV chart in a drawing

Status: AUTHORIZED (owner, 2026-10-05: "It is impossible to change for example the pie diagram ratio from 50% 25%
25% to an easy split 50% 50% … add again the engine we had in Visualizer … the color and text/text color we wouldn't
need to touch, just the design of these ratios." Decisions: deleting a row removes its slice and legend entry; the
percentage texts are replaced by the new percentages.)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-281 (converter), PATCH-282 (AntV library in the drawing editor).

## Why
A chart inserted from the AntV library (PATCH-282) becomes plain Excalidraw shapes with no numbers behind them, so a
pie of 24/40/26/10/12 can only be changed by dragging slice points by hand. The owner wants the Visualizer's engine
back for these charts: keep the chart's data, let the user edit label + value rows, and redraw the chart with AntV.
Colours and text are still edited with Excalidraw's own tools, and a redraw must keep those edits.

## Facts the design relies on (CTO-verified 2026-10-05)
- The library's chart items (`chart-*` in `libraryTemplates.ts`): `chart-pie-donut-pill-badge`,
  `chart-pie-compact-card`, `chart-pie-donut-plain-text`, `chart-pie-pill-badge`, `chart-column-simple`,
  `chart-bar-plain-text`, `chart-line-plain-text`. All rendered from `HARNESS_OUTLINE` (5 items, values
  24/40/26/10/12), theme `classic`, `pill: 'polygon'`, `icons: 'strokes'`, in a 720 px wide container
  (`AntvExcalidrawHarness.tsx` `renderLibraryTemplate`).
- The converter puts every element of a picture in one outer group (`PICTURE_GROUP_ID`, last entry of `groupIds`).
  Excalidraw regenerates group ids when a library item is inserted, so **the outermost group id identifies one chart
  on the canvas**. `customData` survives library insert, save and reload (no save path strips it).
- AntV marks per-item parts with `data-element-type` and `data-indexes` (`item-label@0`, `item-value@0`,
  `item-desc@0`, `item-icon@0`, …). Pie slices, leader lines and percentage labels have NO indexes. The pie slices are
  emitted in item order (slice n has palette colour n); the percentage labels and leader lines are NOT in item order.
- `SceneSource` already records the nearest `data-indexes` (`scene.ts`).
- The Excalidraw API has `onChange(cb)` (returns an unsubscribe), `getSceneElements`, `getAppState`,
  `updateScene({ elements, appState, captureUpdate })` with `CaptureUpdateAction.IMMEDIATELY` for one undo step.
- `ExcalidrawWrapper.tsx` (306 lines) is shared by the drawing post (`DrawingEditor.tsx`, 840 lines — over the
  ceiling, do not touch) and the Drawing canvas (`DrawingLayout.tsx` — do not touch). Both load the AntV library.

## Design

### 1. Roles: every converted element knows which part of the chart it is
- `SceneSource` gains `elementType?: string` = the nearest `data-element-type` of the source node or an ancestor
  (`readSvgScene.ts`, same walk that finds `indexes`).
- New pure `lib/ai/antv/chartValues/roles.ts` `assignRoles(scene)` → `Map<sceneElementId, string>`:
  - indexed element: `${elementType ?? kind}@${indexes.join(',')}#${n}` where `n` counts earlier elements with the same
    prefix (document order);
  - background: `background`;
  - unindexed element: `${elementType ?? kind}#${n}` with `n` counting earlier unindexed elements of the same prefix.
  Deterministic: the same SVG always yields the same roles.
- `toSkeleton` writes the role into `customData.antvRole` when a role map is passed (the default library/harness
  path passes it; nothing else changes).

### 2. The chart's data travels with its elements
- New `lib/ai/antv/chartValues/data.ts`:
  - `ANTV_CHART_TEMPLATES` = the 7 ids above; `isAntvChartTemplate(id)`.
  - `AntvChartData = { v: 1, template, theme, title, items: Array<{ label, value, detail?, icon? }> }` and its zod
    schema `antvChartDataSchema` (template must be one of the 7; 1..10 items; label 1..60 chars trimmed; value finite,
    0..1e9; detail ≤ 120; icon ≤ 40, `[a-z0-9-]`; title ≤ 80). `parseAntvChartData(raw)` → data | null (never throws).
  - `chartDataToOutline(data)` → `VisualOutline` (`kind: 'list'`, `ordered: true`, items without children).
- Every element of a chart item carries `customData = { antvRole, antvChart: AntvChartData }`.
- `libraryTemplates.ts` `exportLibraryElement`: for elements whose `customData.antvChart` parses, keep ONLY
  `{ antvRole, antvChart }`; every other `customData` is still dropped. Library budget stays ≤ 2.5 MB.
- The harness export (`AntvExcalidrawHarness.tsx`) attaches `antvChart` (built from `HARNESS_OUTLINE`, theme
  `classic`) to the elements of the 7 chart templates only. The CTO regenerates
  `public/libraries/antv-diagrams.excalidrawlib` after implementation (not the coder).

### 3. The render engine, one copy
- Move `renderLibraryTemplate` out of the harness into `lib/ai/antv/chartValues/render.ts`
  `renderAntvToElements({ template, theme, outline, container? })` → `{ elements }` (roles assigned, icons strokes, pill
  polygon, the theme background). When no container is given it creates an off-screen one
  (`position:fixed; left:-100000px; top:0; width:720px; opacity:0; pointer-events:none`) and removes it afterwards,
  also on failure. The AntV instance is always destroyed. The harness imports it (no second copy).

### 4. Redraw (pure core + thin browser shell)
New pure `lib/ai/antv/chartValues/redraw.ts`:
- `findSelectedChart(elements, appState)` → `{ groupId, data, elements } | null`: the selection is non-empty, every
  selected element has a parseable `antvChart`, and they share one outermost group id; the chart is every non-deleted
  scene element with that outermost group id and a parseable `antvChart`. Otherwise `null` (e.g. after ungrouping).
- `readCanvasTexts(chartElements)` → the current `title`, per-item `label` and `detail` from the text elements with
  roles `title…`, `item-label@i…`, `item-desc@i…` (whitespace including `\n` collapsed to single spaces). Missing
  → keep the stored value.
- `planRows(data, canvasTexts)` → the rows the panel shows: `{ key, from: index, label, value }`.
- `buildNextData(data, canvasTexts, rows)` → new `AntvChartData`: title and details from the canvas texts, labels and
  values from the rows, a row's `detail`/`icon` follow its `from` item; a new row (`from: null`) has neither.
  The result must pass `antvChartDataSchema`.
- `carryOver({ oldRender, current, nextRender, indexMap, oldCount, nextCount })` → the new elements:
  - **Placement:** pick the anchor = the largest-area element whose role exists in both `oldRender` and `current`;
    `scale = current.width / oldRender.width` of the anchor (1 when either width is 0); every new element is scaled
    by `scale` about the old render's origin and translated so the anchor's old-render position maps onto its current
    position. Scaling covers `x, y, width, height, points, fontSize, strokeWidth` (and `lineHeight`-safe text).
  - **Role mapping old → new:** indexed roles map item `i` to `indexMap[i]` (dropped when `null`). Unindexed roles
    map 1:1 when `oldCount === nextCount`. When the count changed, an unindexed role group whose size in the old
    render equals `oldCount` AND whose members are filled closed shapes (the pie slices) maps member `i` through
    `indexMap`; all other unindexed roles are not carried.
  - **What is carried:** for every mapped pair, each of `strokeColor, backgroundColor, fillStyle, strokeWidth,
    strokeStyle, roughness, opacity, fontFamily` is copied from `current` ONLY when it differs from `oldRender` (the
    user changed it). Text content is never carried (texts come from the data, so percentages are always the new
    ones).
  - **Deleted parts stay deleted:** a role present in `oldRender` but absent from `current` (the user deleted it) is
    dropped from the new elements (after mapping).
  - **Ids and groups:** every new element gets a fresh unique id; inner group ids are remapped to fresh ids; the
    outermost group id is the chart's existing `groupId` (so the chart stays one selectable group).
  - Every new element's `customData.antvChart` is the next data.
- `replaceChartInScene(sceneElements, chartGroupId, newElements)` → new scene array with the chart's elements removed
  and the new ones inserted at the position of the first removed element (z-order kept).
New browser shell `lib/ai/antv/chartValues/redrawChart.ts`
`redrawChart(api, chart, rows)`: render the OLD data and the NEXT data with `renderAntvToElements`, run `carryOver`,
`replaceChartInScene`, then `api.updateScene({ elements, appState: { selectedGroupIds: { [groupId]: true },
selectedElementIds: <the new elements> }, captureUpdate: IMMEDIATELY })` — one undo step. Returns
`{ ok: true } | { ok: false, error }`; never leaves the scene half-changed.

### 5. The panel `components/collabboard/editors/AntvChartValuesControl.tsx` (new, ≤ 300 lines; split if needed)
- Props: `getApi: () => ExcalidrawApi | null`, `apiVersion` (or an equivalent so it subscribes once the API exists).
  Subscribes to `api.onChange`, computes `findSelectedChart` (cheap; only when the selection changed).
- When a chart is selected: a small button **"Edit values"** (`data-antv-chart-edit`) floating at the top-left of the
  canvas area, below Excalidraw's toolbar. Not shown in read-only.
- Click → the panel (`data-antv-chart-panel`, right side, ~300 px, scrolls): title "Chart values", one row per item
  (`data-antv-chart-row`): label input (`data-antv-chart-label`), number input (`data-antv-chart-value`, min 0, step
  any), a remove button (`data-antv-chart-remove`, disabled when only one row is left). "Add row"
  (`data-antv-chart-add`, disabled at 10). Pie charts show each row's share as a read-only percentage next to the
  value (`data-antv-chart-share`), computed live.
- "Apply" (`data-antv-chart-apply`) validates (labels non-empty, values finite ≥ 0, for pies at least one value > 0;
  errors inline per row, nothing applied) then calls `redrawChart`; while it runs the button reads "Redrawing…" and is
  disabled; on success the panel closes; on failure the panel stays open with the error text
  (`data-antv-chart-error`) and the canvas is unchanged. "Cancel" closes without changes. Esc closes.
- Key handling inside the panel must not reach Excalidraw (typing "2" in a value box must not switch tools): stop
  propagation of key events from the panel.
- The panel closes when the selection no longer is that chart.

### 6. Wiring `ExcalidrawWrapper.tsx` (≤ +15 lines)
Render `<AntvChartValuesControl …/>` as an overlay inside the wrapper's container when `!readOnly`. No change to
`DrawingEditor.tsx`, `DrawingLayout.tsx`, or the Excalidraw fork.

## Tests (TDD — write them failing first)
- roles: indexed / unindexed / background roles; deterministic across two reads of the same SVG; `elementType` taken
  from the nearest ancestor.
- data: schema accepts the library data; rejects 0 or 11 items, empty label, negative / NaN value, unknown template;
  `parseAntvChartData` never throws on junk.
- export: chart elements keep exactly `{ antvRole, antvChart }`; a non-chart element still has no `customData`.
- `findSelectedChart`: whole chart selected → found; mixed selection (chart + another shape) → null; elements without
  data → null; deleted elements ignored.
- `readCanvasTexts` collapses wrapped text; `buildNextData` keeps detail/icon with `from`, new row has none, removed
  row is gone; result passes the schema.
- `carryOver`:
  - user recoloured slice 1 (of 5), value edit only → new slice 1 has the user's colour, other slices AntV's;
  - delete row 0 (5 → 4 rows) → the user's slice-1 colour lands on new slice 0; the removed item's parts are gone;
  - an un-edited property takes the new render's value (not copied);
  - a part the user deleted stays deleted;
  - chart moved by (+300, +120) and scaled ×2 → new elements land at the moved, scaled place (anchor maths);
  - text content is never copied (the new percentage text wins);
  - fresh ids, inner groups fresh, outer group = the chart's group id; input arrays not mutated.
- `replaceChartInScene` keeps z-order and leaves other elements untouched (same object identity).
- panel: Edit values appears only for a selected chart and not in read-only; rows show labels/values from data +
  canvas texts; remove/add limits; invalid input blocks Apply with inline errors; Apply calls the redraw once with the
  rows; failure keeps the panel open with the error; key events inside the panel do not propagate.
- render shell (with a stubbed AntV module): the off-screen container is removed and the instance destroyed on
  success and on failure.
- Mutation: make `carryOver` copy a property that the user did NOT change → a test fails.

## Allowed files
```
lib/ai/antv/toExcalidraw/scene.ts, readSvgScene.ts, toSkeleton.ts (+ tests)    roles plumbing only
lib/ai/antv/toExcalidraw/libraryTemplates.ts (+ test)                          export keeps chart customData
lib/ai/antv/chartValues/** (new, + tests)
components/ai/dev/AntvExcalidrawHarness.tsx                                     use render.ts; attach antvChart
components/collabboard/editors/AntvChartValuesControl.tsx (+ test, + a split file if needed)   new
components/collabboard/editors/ExcalidrawWrapper.tsx                            overlay wiring, <= +15
vitest.config.ts                                                                only if a new folder needs including
```
Forbidden: everything else — `DrawingEditor.tsx`, `DrawingLayout.tsx`, the Excalidraw fork, the library file, the
database, routes.
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
timeout 600 npx vitest run lib/ai/antv components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-287.json
```
Do not commit.

**Live (CTO):** regenerate the library file from `?export=library` (≤ 2.5 MB). New drawing post → library → insert the
donut pie → select it → Edit values → change to two rows 50/50 → Apply → two slices, legends and "50%" texts; the
user's earlier slice colour kept; Ctrl+Z restores the old pie; save, reload, Edit values still offered. Same on the
column chart (bar heights follow the values). Delete one row → its slice and legend gone. Moved and resized chart
stays where it is. Typing digits in the panel does not switch Excalidraw tools.

## Commit message (verbatim)
```
feat(drawing): change the numbers of an AntV chart

A chart inserted from the drawing library now keeps its data. Select it
and choose Edit values to change, add or remove rows; the chart is redrawn
with the new proportions and percentages while keeping its place, size
and the colours you changed. One undo step brings the old chart back.
```

## Addendum 1 (CTO, 2026-10-05, review + live)
Live (own tab, regenerated library 2.30 MB, every chart element carries `{antvRole, antvChart}`, no other item has
customData): insert the donut pie → "Edit values" appears → 5 rows with shares 21/36/23/9/11 % → remove 3 rows, 50/50,
labels Half A / Half B → Apply in 1.1 s → two equal slices, "50.0%" twice, legends Half A/B, the chart keeps its place;
saved drawing: 17 elements, all carry the new data, one outer group. Undo/redo through Excalidraw's buttons work.
Typing digits in the panel does not switch tools. Fix these:

1. **Focus after Apply/Cancel/Esc.** After the panel closes, focus is on `<body>`, so Ctrl+Z does nothing until the user
   clicks the canvas. Call `api.focusContainer()` after a successful Apply, Cancel and Esc. Test it.
2. **The "Edit values" button covers Excalidraw's style panel** (both at the top-left). Place it centred horizontally
   just below the toolbar (`top: 64`, `left: 50%`, `transform: translateX(-50%)`).
3. **Stale chart.** The control caches the chart when the selection changes. A colour changed while the chart stays
   selected (same selected ids) leaves `chart.elements` stale, so Apply carries the OLD colours and `open()` reads old
   texts. In `open()` and in Apply, re-run `findSelectedChart(api.getSceneElements(), api.getAppState())`; when it is
   no longer that chart, show "Select the chart again" and do nothing. Test: change an element's colour without
   changing the selection, Apply → the redraw receives the changed colour.
4. **Per-item runs for unindexed parts.** The real roles (library file): in the pie, slices are `shape#0..4`, leader
   lines `shape#5..9`, legend pills `shape#10..14`; in the column chart the bars are `shape#0..4` (rectangles); in the
   line chart grid bands `shape#0..4` (all `#ebebeb`), the points are ellipses `shape#9..13`. So the current rule
   (whole group size == item count and all filled polygons) never fires and slice/bar colours are lost when a row is
   added or removed. Replace it with: in a render, within each unindexed role type, the **item run** is the FIRST
   contiguous run (document order within that type) of exactly `itemCount` elements with the same Excalidraw `type`
   and `polygon` flag whose `backgroundColor`s (or, for text, `strokeColor`s) are all different and not
   `transparent`. Run member `j` is item `j`. Compute the run in the old render with `oldCount` and in the next render
   with `nextCount`; a next-render element in its run at position `j` maps to the old-render run member at the old
   index `i` with `indexMap[i] === j` (none → not carried). Unindexed elements outside the run are carried 1:1 only
   when the counts are equal. Tests with the three real role layouts above (fixtures copied from the library file):
   pie delete row 0 → the user's slice-1 colour lands on new slice 0, the grid bands of the line chart are never
   treated as items, column bars follow their rows.
5. **Background always maps** (`background`, `background#n`), whatever the counts: a changed background colour must
   survive adding or removing a row.
6. **`lineHeight` is a unitless multiplier** in Excalidraw: do not scale it (fontSize already scales). Test with
   scale 2.
7. **No static runtime import of `@excalidraw/excalidraw`** in `redrawChart.ts` (it pulls the whole editor into the
   wrapper's static graph, which the wrapper loads lazily on purpose). Use the literal `captureUpdate: 'IMMEDIATELY'`
   with a comment. Source test: `chartValues/**` and `AntvChartValuesControl.tsx` have no static value import from
   `@excalidraw/excalidraw` (type imports allowed).
8. **Render timeout.** `renderAntvToElements` rejects with "AntV render timed out" after 20 s when neither `loaded`
   nor `error` fires; the instance is destroyed and the container removed. Test with fake timers.

Allowed files: as in the spec (the two editor files stay untouched). Gate `--outputFile=.opencode-vitest-287a.json`,
compare by name with `.opencode-vitest-285a.json`.

## Addendum 2 (CTO, 2026-10-05, live)
Live after Addendum 1 (own tab): the button sits centred under the toolbar; a slice recoloured by the user (Summer,
pink) keeps its colour when another row (Spring) is deleted and lands on new slice 0; the percentages become
45.5/29.5/11.4/13.6 %; save 201, all elements carry the new data, one group. Remaining defect:
**Ctrl+Z after Apply still does nothing — focus is on `<body>`.** `focusContainer` is NOT part of the public
`ExcalidrawImperativeAPI` (only an App method), so `getApi()?.focusContainer?.()` is a silent no-op. Fix: the control
keeps a ref to its own root element; after the panel closes (Apply success, Cancel, Esc) it focuses the Excalidraw
container — the `.excalidraw-container` element (Excalidraw renders it with `tabIndex=0`) found inside the wrapper
(`root.parentElement`), in a `setTimeout(0)` so it runs after the panel has unmounted. Remove `focusContainer` from
`ExcalidrawApiLike`. Test: after Apply/Cancel/Esc (fake timers flushed) `document.activeElement` is the
`.excalidraw-container` element rendered next to the control. Gate `--outputFile=.opencode-vitest-287b.json`.

## Final result (CTO, 2026-10-05, live)
Own tab, board af02972f, regenerated library (2.30 MB; 7 chart items carry `{antvRole, antvChart}`, nothing else
carries customData):
- Insert the donut pie → "Edit values" centred under the toolbar → 5 rows, shares 21/36/23/9/11 %.
- 50/50 with labels Half A/B → two equal slices, "50.0%" twice, legends Half A/B, same place (1.1 s).
- Summer slice recoloured by the user, Spring row deleted → 4 slices, 45.5/29.5/11.4/13.6 %, the pink slice is now
  slice 0 (Summer); the other slices take the design's colours for their new positions and match their legends.
- Ctrl+Z right after Apply restores the old chart (focus returns to the canvas), Ctrl+Shift+Z redoes it; Excalidraw's
  undo button does the same. Typing digits in the panel never switches tools.
- Save 201; the saved drawing's elements all carry the new data in one group. Test posts deleted (bbc4ada0,
  96d158ff, fd766fe5, 9e5bb123).
- Gate `.opencode-vitest-287b.json`: 59/59 identical to the baseline by name; tsc clean. Neither editor file touched;
  wrapper +12/−2.
- Known: charts inserted before this patch have no data (insert again from the library); after a row is deleted the
  un-coloured slices follow the design's colour order (consistent with legends and leader lines).
