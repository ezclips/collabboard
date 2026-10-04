# PATCH-277 — SPIKE: AntV picture → Excalidraw drawing converter

Status: AUTHORIZED as a SPIKE (owner, 2026-10-04: "We only need one AntV and remove the AI … we do have excalidraw
already so we actually have 3 systems. Ideal would be if we could combine AntV with excalidraw … convert the AntV to
JSON so excalidraw could read it". Owner delegated the design to the CTO as PM: "make sure it is well thought out").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-276. Icons must be real SVG; the converter reads `<symbol>` paths.

## 0. What this spike is and is NOT
- **Goal:** decide with measured evidence whether every AntV picture can become a native, editable Excalidraw drawing
  of acceptable quality. The target direction (owner + CTO) is ONE design library (AntV) and ONE editor (Excalidraw).
  The AI only writes content.
- **IS:**
  - a converter module (kept if the spike passes);
  - its unit tests;
  - one hidden developer test page (a "harness") that shows each AntV design next to its converted Excalidraw drawing
    and reports measurements.
- **IS NOT:**
  - no button for users;
  - no saving, no change to any post, board, editor or renderer;
  - no removal of anything;
  - no AI call, no database access;
  - no change to the Excalidraw fork.
  Nothing a user sees changes.
- Nobody publishes an AntV→Excalidraw converter (CTO search, 2026-10-04). The proven pattern is Excalidraw's own
  `mermaid-to-excalidraw`:
  1. an engine lays the diagram out;
  2. the converter emits `ExcalidrawElementSkeleton[]`;
  3. Excalidraw's `convertToExcalidrawElements` (exported by our fork, `packages/excalidraw/index.tsx` L308, v0.18.0)
     builds the real elements.
  We follow exactly that, with AntV as the engine.

## 1. Architecture (three small pure-ish modules plus a harness)
```
rendered AntV <svg>  ──readSvgScene──▶  PictureScene (our neutral JSON, versioned)
                     ──toSkeleton────▶  { elements: ExcalidrawElementSkeleton[], files: Record<FileId, BinaryFile> }
                     ──convertToExcalidrawElements (Excalidraw's own)──▶  elements the editor renders
```
- **`PictureScene` is our own format, documented, with `version: 1`.** It is the answer to the owner's "convert AntV
  to JSON". It does not depend on Excalidraw, so a later export (PowerPoint, SVG, another canvas) can reuse it.
- **The reader runs in a real browser.** It needs layout (`getScreenCTM`, `getPointAtLength`, text ranges). All
  browser geometry goes through ONE injectable `SvgGeometry` interface, so unit tests can stub it in jsdom.
- **The converter reads the LIVE DOM.** Every user edit already painted into the picture (colours, moves, additions,
  icon swaps) is converted as seen. No second code path for overrides.

Files (all NEW; one responsibility each; each ≤ 400 lines):
```
lib/ai/antv/toExcalidraw/scene.ts          PictureScene types + version + doc comment (the format spec)
lib/ai/antv/toExcalidraw/geometry.ts       SvgGeometry interface + the browser implementation
lib/ai/antv/toExcalidraw/paint.ts          colour parsing, alpha blending, gradient flattening (pure)
lib/ai/antv/toExcalidraw/readSvgScene.ts   AntV <svg> → PictureScene (+ skip reasons)
lib/ai/antv/toExcalidraw/toSkeleton.ts     PictureScene → skeleton elements + files (pure)
lib/ai/antv/toExcalidraw/report.ts         coverage/fidelity measurements (pure, from source scene + output)
lib/ai/antv/toExcalidraw/index.ts          convertAntvSvg(svg, { background }) → { scene, elements, files, report }
lib/ai/antv/toExcalidraw/*.test.ts         unit tests
lib/ai/antv/toExcalidraw/harnessFixtures.ts  the sample outline(s) + template list
components/ai/dev/AntvExcalidrawHarness.tsx  the side-by-side harness (client)
app/e2e-fixtures/antv-excalidraw/page.tsx    the route: notFound() when NODE_ENV === 'production'
```

## 2. Conversion rules (decided here so nothing is improvised later)
### 2.1 Coordinates
- `root` = the AntV `<svg>` that the container holds. For every visual element:
  `M = root.getScreenCTM()⁻¹ × el.getScreenCTM()`, the matrix into root USER units. This makes the result
  independent of the stage zoom.
- Axis-aligned M (`|b|,|c| < 1e-6`): transform the element's own box.
- Rotated or skewed M: emit the shape as a polygon built from its transformed outline.
- Output units = root user units × 1 (the AntV viewBox size), origin at the viewBox's top-left.

### 2.2 Shapes
| Source | Excalidraw | Notes |
|---|---|---|
| `rect` rx = 0 | `rectangle`, `roundness: null` | |
| `rect` 0 < rx < min(w,h)/2 | `rectangle`, `roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }` | record rx |
| `rect` rx ≥ min(w,h)/2 − 0.5 (pill) | default: `rectangle` + ADAPTIVE_RADIUS; harness toggle `pill=polygon` emits a closed polygon of the exact outline | compare both in the harness |
| `circle`, `ellipse` | `ellipse` | |
| `path`, `polygon`, `polyline`, `line` closed + filled | `line` with `polygon: true` + `backgroundColor` | sample with `getPointAtLength`: N = clamp(len/4, 8, 96); split subpaths at `M`; drop a point within 0.25 units of its predecessor |
| the same, open or stroke-only | `line` (2 points if collinear within 0.5) | `marker-end` / `marker-start` → `arrow` with `endArrowhead` / `startArrowhead: "triangle"` |
| `<use>` icon → `<symbol>` | `image` + one file per distinct (icon, colour) | 2.4 |
| `<image href="data:…">` | `image` | other href schemes are skipped, reason `external-image` |
| `text`, `foreignObject` text | `text` | 2.3 |

Common for every element:
- `roughness: 0`, `fillStyle: "solid"`, `strokeStyle` from `stroke-dasharray` (`"dashed"`, or `"dotted"` if every
  dash ≤ 2× the stroke width), `strokeWidth` = the stroke width × M scale (min 0.5);
- `opacity` 100 (opacity goes into the colour, 2.5);
- z-order = SVG document order.

### 2.3 Text
- **Text string:**
  - `<text>`: the tspans, joined by `\n` when their `y` differs;
  - `foreignObject`: the `innerText` of its content, whitespace-normalised per line.
  - Empty strings are skipped.
- **Box:** the union of a DOM `Range` over the text nodes (`getClientRects()`), mapped into root user units. This is
  the RENDERED text block, so text centred by flexbox lands where AntV drew it.
- **Size:**
  - font size = computed `font-size` × M scale, rounded to 0.5;
  - colour = computed `color` (HTML) or `fill` (SVG), with paint rules 2.5;
  - `textAlign` from computed `text-align` / `text-anchor`;
  - `verticalAlign: "top"`.
- **Font:** `fontFamily: FONT_FAMILY.Helvetica` (2), a SYSTEM font that Excalidraw does not download. Any AntV
  monospace text → `Cascadia` (3); record it as a font that may be downloaded.
- **Weight and style:** Excalidraw has no bold or italic. Record them as `lost: fontWeight` / `lost: fontStyle`. Do not
  fake bold.
- **Wrapping:**
  - pre-wrap greedily to the box width + 2 % with Excalidraw's own text measuring: `wrapText` + `getFontString`, if the
    fork's package exports them;
  - otherwise use a canvas `measureText` with the same font string, and say which in a code comment;
  - then emit the text with explicit `\n`.
- **Alignment after conversion:** `convertToExcalidrawElements` computes the text width. In a post-pass, move `x` so
  the element's centre (or right edge) equals the box's centre (or right edge) for `center` (or `right`).

### 2.4 Icons
- **Source:** `<use href="#id">` → `document.getElementById(id)` or the root's own `[id]`. Must be an
  `SVGSymbolElement`; otherwise skip with reason `icon-unresolved`.
- **Standalone SVG:** `<svg xmlns viewBox=symbol.viewBox width height>` with the symbol's presentation attributes, and
  every `currentColor` replaced by the icon's resolved colour (the `<use>` `fill` / computed `color`, paint rules 2.5).
- **Data URL:** `data:image/svg+xml;base64,…`.
- **File:** `fileId` = a stable hash of the data URL (identical icon + colour = one file).
  `files[fileId] = { id, mimeType: "image/svg+xml", dataURL, created: 0 }`. Shape it EXACTLY like the files map that
  `DrawingEditor` stores (`drawingFiles`); read that file, don't guess.
- **Box:** the `<use>`'s `x / y / width / height` through M.
- **Not editable as strokes.** An icon is a picture inside Excalidraw (move, resize, delete). That is acceptable;
  record it.

### 2.5 Paint
- Accept `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, CSS named colours, `none`, `transparent` and
  `url(#gradient)`.
- **Alpha:** effective alpha = colour alpha × `fill-opacity` / `stroke-opacity` × the product of `opacity` up the
  ancestor chain. When it is < 1, BLEND the colour over the picture background (the theme background passed in) into
  an opaque `#rrggbb`. Reason: Excalidraw's element opacity also fades the stroke and the text, and an `#rrggbbaa`
  fill is not guaranteed through its renderer. Blending reproduces what AntV shows over its background. Count
  `blended`.
- **Gradient** (`linearGradient`, `radialGradient`, resolved through `href` chains): take the colour at offset 0.5,
  interpolated between the nearest stops, then blend. Count `gradient-flattened`.
- **Visibility:** fill none AND stroke none (or both alpha 0) → skip, reason `invisible`. `display:none`,
  `visibility:hidden`, opacity 0, or a zero-size box → skip, reason `hidden`.
- `clip-path` / `mask` on a converted element: convert it without the clip; count `clip-ignored`.

### 2.6 Structure and grouping (Excalidraw semantics: click = group, double-click = enter group)
- Every converted element gets `groupIds = [itemGroup?, pictureGroup]` (innermost first):
  - `pictureGroup`: one id for the whole picture, so one click selects the whole picture;
  - `itemGroup`: one id per item scope from the nearest `data-indexes` ancestor (the same scopes the element editor
    uses; mind-map nodes are separate scopes). A double-click enters the item, another double-click the element.
  - Title, connectors and other unscoped parts: only `pictureGroup`.
- **Skip, with reasons:**
  - AntV edit buttons (`btns-group`, `btn-add`, `btn-remove`): reason `editor-ui`;
  - `defs`, `clipPath`, `mask`, `marker`, `symbol` subtrees: reason `definition`;
  - our editor chrome, if present (`[data-picture-control]`): reason `editor-ui`.
- **Background:** the picture background (passed in) becomes the FIRST element, a rectangle covering the viewBox, in
  `pictureGroup`.

## 3. The harness (`/e2e-fixtures/antv-excalidraw`, dev only)
- `page.tsx` calls `notFound()` when `process.env.NODE_ENV === 'production'`. No link to it anywhere.
- **Design list:** a FIXED list, at least one design per family. Take the real names from `catalog.data.ts`:
  - `list-grid-badge-card`, `list-row-horizontal-icon-arrow`;
  - one each of `sequence-timeline-*`, `sequence-roadmap-*`, `sequence-steps-*`, `sequence-funnel-*`,
    `sequence-pyramid-*`, `hierarchy-structure-*`, `compare-binary-*`, `compare-swot-*`, `compare-quadrant-*`;
  - `hierarchy-mindmap-branch-gradient-capsule-item`;
  - `chart-pie-donut-pill-badge`, `chart-column-simple`, `chart-line-plain-text`.
- **Sample outline:** one fixed outline (`harnessFixtures.ts`): title, 5 items with label, detail, value, icon and
  date, and children on 2 items for the hierarchy designs.
  - Theme `classic` for all.
  - Plus `midnight` (dark background) for 3 of them: badge card, mind map, donut.
  - `?t=<template>&theme=<id>&pill=polygon` shows one design on its own.
- **Drawing the AntV side:** exactly the renderer's path: `loadAntv()`, `new mod.Infographic({ ...toAntvOptions(outline,
  template, theme, style), container, width: '100%', height: 'auto', editable: false })`, `render()`, then wait for
  `loaded`. Import from `lib/ai/antv`, not from `components/ai/renderers`, so no editor code is involved.
- **Each row shows:**
  - left: the AntV picture;
  - right: the converted drawing in a REAL `<Excalidraw>` from `@excalidraw/excalidraw`, with
    `initialData { elements, files, appState: { viewBackgroundColor: background } }` and `scrollToContent`. It is
    editable, so the CTO can test the grouping.
  - Do NOT set `window.EXCALIDRAW_ASSET_PATH`. The CTO measures which font requests happen without it.
- **Results:** the report table under each row, and `window.__antvExcalidrawSpike = { [template+theme]: report }` for
  the CTO's browser.

## 4. Measurements (`report.ts`) and the pass/fail decision
Per design:

| Measure | How | Spike passes at |
|---|---|---|
| Text coverage | every non-empty source string appears in exactly one output text (normalised whitespace) | **100 %** |
| Shape coverage | converted / (all visible source shapes); skipped ones listed by reason; reason `unknown` must not exist | **≥ 95 %**, `unknown` = 0 |
| Icon coverage | resolvable `<use>` icons = image elements | **100 %** |
| Colour fidelity | every converted fill and stroke equals the paint rule's expected hex | **100 %** |
| Geometry | each rect/ellipse/image box within 1 unit of the source box; polygons within 2 | **100 %** |
| Conversion time | `performance.now()` around `convertAntvSvg` | **< 150 ms** |
| Size | element count; JSON bytes of elements + files | report (posts store both as JSON) |
| Losses | counts: blended, gradient-flattened, pill-approximated, clip-ignored, lost fontWeight/fontStyle, icons-as-image | report |

Plus, measured by the CTO in the browser (not by code):
- **Visual:** side-by-side screenshots of every row, sent to the owner. The owner decides whether it is "good enough",
  because that is a taste call.
- **Editing in Excalidraw:**
  - one click selects the whole picture;
  - a double-click selects one card, and its text and icon move with it;
  - a double-click on text edits it;
  - ungroup works.
- **Network:** zero requests to outside hosts caused by the conversion. Excalidraw's own font requests are listed.
  Note: our `ExcalidrawWrapper` points `EXCALIDRAW_ASSET_PATH` at unpkg.com, a pre-existing outside dependency; this
  is recorded, not fixed here.

**Decision:**
- All "spike passes at" rows met, and the owner accepts the screenshots → follow-up patches:
  1. "Edit as drawing" (convert and save as a drawing post / onto the drawing canvas);
  2. then the removal of our own designs and of our DOM-override picture editor.
- Not met → the report says which designs or rules fail and why. We decide per family.

## 5. Tests (jsdom, with a stubbed `SvgGeometry`)
- **`paint.test.ts`:**
  - every colour syntax;
  - alpha blend: `#4f9d8f1a` over `#ffffff` → the exact expected hex (compute it in the test);
  - `fill-opacity × opacity` chain;
  - gradient at 0.5 between two stops, including through an `href` chain;
  - `none` / `transparent`.
- **`readSvgScene.test.ts`:** hand-built SVGs shaped like real AntV output, with the stub geometry giving boxes:
  - badge card: rect + foreignObject text + `<use>` icon + item group;
  - mind-map capsule: pill + `item-icon-group` with badge ellipse + `<use>`;
  - donut slice: closed arc path;
  - `<text>` with 2 tspans;
  - gradient fill;
  - hidden, invisible and `btn-add` elements are skipped with the right reasons;
  - document order kept.
- **`toSkeleton.test.ts`:**
  - each shape row of 2.2 (incl. pill default and `pill=polygon`, arrow markers, collinear → 2 points);
  - text post-pass for center/right;
  - icon → image + deduped file with `currentColor` replaced;
  - `groupIds` order `[item, picture]`;
  - the background first;
  - no `NaN` anywhere.
- **`report.test.ts`:** each measure on a tiny scene, including a deliberate miss.
- **One test calls the REAL `convertToExcalidrawElements`** on a toSkeleton output, if it runs in jsdom. If it cannot,
  say why in the report; do NOT replace it with a mock that agrees with our assumptions (AGENTS.md §4).
- **Mutations** (revert with Edit):
  - remove the alpha blend → the paint test fails;
  - drop `pictureGroup` → the grouping test fails.

## 6. Allowed files
Only the NEW files listed in §1, plus their tests. **No existing file may be modified.**
Read-only references:
- `components/ai/renderers/AntvInfographicRenderer.tsx` (render path);
- `lib/ai/antv/*` (setup, icons, mapOutline, catalog.data);
- `components/collabboard/editors/DrawingEditor.tsx` and `ExcalidrawWrapper.tsx` (the files-map and initialData
  shape);
- the fork's `packages/excalidraw/index.tsx` and `packages/element` types.

Forbidden: everything else, the Excalidraw fork, the database, any network call.
- Make real tool calls only; never write a tool call as plain text.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.

## 7. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai/antv --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-277.json
```
The CTO compares failing files AND failing test names (no new failures allowed).

Report:
- every file with its line count;
- which Excalidraw functions you used and from which import path;
- whether the real `convertToExcalidrawElements` ran in jsdom;
- every rule from §2 you could NOT implement as written, and why.

Do not commit.

**Live (CTO):**
1. Open the harness in the CTO's own tab.
2. Read `window.__antvExcalidrawSpike` for every design.
3. Take a side-by-side screenshot per design.
4. Test the editing checks.
5. Record the network.
6. Write the result table into `.fable5/reviews/SPIKE-277-antv-to-excalidraw.md`, then into this file's Final result.

## Commit message (verbatim)
```
feat(ai): spike converter from AntV pictures to Excalidraw drawings

A developer-only test page converts each AntV picture design into
native Excalidraw shapes and shows both side by side with coverage
measurements, to decide whether pictures can be edited in the drawing
editor. Nothing users see changes.
```

## Final result (CTO, 2026-10-04, live)
See `.fable5/reviews/SPIKE-277-antv-to-excalidraw.md`. 18/18 rows pass text, shape, icon, colour and geometry at 100%;
text size and colour independently confirmed for every text; no outside requests. 17/18 under 150 ms; the roadmap
takes 420 ms (dense `getPointAtLength` sampling) — fix analytically in the build patch. Addenda 1–4 fixed: SSR/route
build, text style read from the wrong element, timer including module load, path sampling/dashes/title wrap/vertical
centring/pill outline, and the CTO's own text-count rule. Gate `.opencode-vitest-277e.json`: failing test names
identical to PATCH-276 (59/59); tsc clean. Visual acceptance: owner.
