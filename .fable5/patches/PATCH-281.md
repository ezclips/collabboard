# PATCH-281 — The converter keeps every line: straight lines, gradient lines; icons as strokes

Status: AUTHORIZED (owner, 2026-10-05: "the converter from AntV to JSON is not optimized, on some diagrams boxes are
missing"; 280–284 delegated to the CTO).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-277/278 (converter `lib/ai/antv/toExcalidraw/`).

## Why (CTO audit, 2026-10-05, all 276 AntV designs, own tab, dev harness)
The spike (277) checked 15 designs. The CTO ran all 276 through `/e2e-fixtures/antv-excalidraw?t=<name>` and counted
painted source shapes independently of the converter's report. **162 of 276 designs lose shapes.** Text (100 %), icons
and fills are fine everywhere. Classifying every dropped shape in the browser gives two defects that explain
essentially all of it:

1. **A perfectly straight horizontal or vertical line is dropped.** Its box has width 0 or height 0, and
   `readSvgScene.ts` `visit()` records `hidden` for `box.width <= 0 || box.height <= 0` before the shape is emitted.
   Real markup:
   - `<path d="M4,0 L4,22" stroke-width="2" stroke="#e9a23b">`: the 5 arrows of `list-row-horizontal-icon-arrow`;
   - `<path d="M 215 100 L 215 230" stroke="#5a5a5a" stroke-width="2" stroke-dasharray="5,5" fill="none">`:
     all 36 `sequence-interaction-*`;
   - `<path d="M160 24 L160 212" stroke="#262626" stroke-opacity="0.08">`: grid and axis of `chart-bar-plain-text`,
     `chart-line-plain-text`;
   - `<line x1="346" y1="73" x2="210" y2="73" stroke="#8E6AC8" stroke-width="1" opacity="0.8">`:
     `sequence-cylinders-3d-simple`;
   - `<path d="M 324 426.8 L 396 426.8" stroke="#E9A23B" stroke-width="2" fill="none">`: the steps of
     `sequence-stairs-*`;
   - `<path d="M 0 1 L 134 1" … transform="translate(0, 33)">`: the underlines of `hierarchy-mindmap-*-lined-palette`;
   - `<path d="M 0 140 L 600 140" stroke="#D9D9D9" stroke-dasharray="4,2">`: the axes of `compare-quadrant-*`.
   `emitIcon` and `emitImage` have the same zero-box rule; there it is correct, so keep it.
2. **A line painted with a gradient (`stroke="url(#…)"`) is dropped.** Real markup:
   - all 100 `hierarchy-tree-*`, 9 connectors each:
     `<path d="M 750 90 C 750 130, 230 130, 230 170" stroke="url(#gradient-0-0-0)" stroke-width="3" fill="none">`;
   - the branches of `hierarchy-mindmap-*-lined-palette`:
     `<path d="M 622 239.5 C 542 239.5 542 117 462 117" stroke="url(#edge-gradient-0-0)" stroke-width="2"
     fill="none">` with `<linearGradient id="edge-gradient-0-0" gradientUnits="userSpaceOnUse" x1="622" y1="239.5"
     x2="462" y2="117"><stop offset="0%" stop-color="#E9A23B"/><stop offset="100%" stop-color="#4F9D8F"/>`;
   - the axis of `sequence-timeline-*`: `<path d="M 90 41 L 90 389" stroke="url(#gradient-timeline-line)" …>`
     (vertical as well, so both defects).
   Gradient FILLS already work (`resolveProperty` → `gradientStops` → the colour at 0.5). Find why the STROKE path does
   not get there (`userSpaceOnUse` gradients? the computed `style.stroke` form `url("#id")` with quotes vs the
   attribute `url(#id)`? the paint resolution order?) and fix the root cause, so a gradient stroke resolves to its
   colour at 0.5 exactly like a gradient fill.
3. Smaller, from the same audit:
   - `list-zigzag-*` (4 designs): the converter's own colour check reports one element "missing" (e.g. `e10: missing`).
     Find out which element and fix it if it is a real loss; otherwise explain it in the report.
   - `fill="url(#…-pattern)"` rectangles (faint 3 % diagonal stripes over SWOT/letter cards) are decoration: keep
     skipping them, but record them as a counted loss `patternIgnored` instead of `invisible`.

## Also in this patch: icons as strokes (needed by PATCH-282)
Excalidraw libraries cannot hold images ("Support for adding images to the library coming soon!", fork
`locales/en.json` `libraryElementTypeError.image`). Add a converter option `icons?: 'image' | 'strokes'`
(default `'image'`, so nothing changes for "Edit as drawing"). With `'strokes'`, `emitIcon` emits the icon's own
geometry instead of a picture:
- read the `<symbol>` children (`path`, `circle`, `ellipse`, `line`, `rect`, `polyline`, `polygon`), map them from the
  symbol's `viewBox` (Lucide: 0 0 24 24) into the `<use>` box;
- paths through the existing analytic `samplePathD` (+ RDP as for other paths);
- stroke colour = `symbolColor(...)`; stroke width = the symbol's `stroke-width` (2) × the box scale, minimum 1;
  fill only when the child has a non-`none` fill;
- all parts carry the icon's `groupIds` plus one extra `icon:<n>` group, so the icon moves as one piece;
- count `losses.iconsAsImage` only in `'image'` mode; add `iconsAsStrokes`;
- the report's icon coverage counts an icon converted in either mode.
Thread the option through `convertAntvSvg` → `readSvgScene` (`ReadSvgSceneOptions`). The harness gets `?icons=strokes`.

## Tests (TDD — write each failing test first)
Use the real markup above as fixtures, through the same geometry seams the existing `readSvgScene.test.ts` uses.
- A vertical `path` (`M4,0 L4,22`), a horizontal `path`, a horizontal `<line>`, and a `path` with
  `transform="translate(0, 33)"` each become ONE open polyline with 2 points, the correct stroke colour, width and
  dash style; `stroke-opacity="0.08"` is blended over the background.
- A zero-box shape with NO stroke is still skipped.
- A cubic path with `stroke="url(#g)"` and a `userSpaceOnUse` two-stop gradient (#E9A23B → #4F9D8F) becomes a polyline
  whose stroke is the 0.5 mix; `losses.gradientFlattened` counts it. The same with the computed form `url("#g")`.
- A pattern-filled rect → skipped, `losses.patternIgnored` = 1, not in the `invisible` skips.
- Icons, `'strokes'`: a Lucide `sun`-like symbol (circle + paths) in a 24×24 `<use>` box at (100, 50) → ellipse +
  polylines inside that box, the icon colour, a shared `icon:<n>` group, no `image` element, `iconsAsImage` 0; in
  `'image'` mode unchanged.
- `toSkeleton` of a 2-point vertical polyline produces a valid Excalidraw `line` (width 0 is allowed).
- Mutations (revert with Edit): restore the zero-box skip for shapes → the straight-line tests fail; break the
  gradient-stroke fix → its test fails.

## Allowed files
```
lib/ai/antv/toExcalidraw/readSvgScene.ts, readPaint.ts, paint.ts, readIcon.ts, scene.ts, report.ts,
  toSkeleton.ts, index.ts (+ their tests; each file stays ≤ 400 lines — split out a helper file if needed)
components/ai/dev/AntvExcalidrawHarness.tsx, app/e2e-fixtures/antv-excalidraw/page.tsx   (?icons= only)
```
Forbidden: everything else, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai/antv/toExcalidraw components/ai/dev --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-281.json
```
Do not commit.

**Live (CTO):** re-run the full 276-design audit (`audit281.mjs`, own tab). PASS when no design has a painted,
non-pattern source shape without a converted counterpart, text/colour/icon coverage stay 100 %, and conversion stays
< 150 ms. Side-by-side screenshots of: `hierarchy-tree-curved-line-compact-card`, `list-row-horizontal-icon-arrow`,
`sequence-interaction-compact-badge-card`, `chart-bar-plain-text`, `sequence-timeline-simple`,
`hierarchy-mindmap-branch-gradient-lined-palette`, plus `?icons=strokes` for `list-grid-badge-card`.

## Commit message (verbatim)
```
fix(ai): the drawing converter keeps straight and gradient lines

Converting AntV pictures into drawings dropped every perfectly straight
horizontal or vertical line (arrows, axes, steps, underlines) and every
line coloured with a gradient (tree connectors, mind-map branches,
timeline axes): 162 of 276 designs lost parts. Both now convert. Icons
can also be converted into editable strokes, which the drawing library
needs.
```

## Addendum 1 (CTO, 2026-10-05, after the live re-audit)
Re-audit of all 276: designs with dropped shapes **162 → 3**, and those 3 (`compare-swot`,
`compare-hierarchy-row-letter-card-*`) are only the 3 % pattern stripes (now `patternIgnored`). Text/icons 100 %, max
24 ms. Gradient connectors, straight arrows/axes/steps verified in side-by-side screenshots. Two things remain:
1. **Dots.** 9 designs report `shape coverage` below total (`sequence-stairs-front-*` 5 each, `list-zigzag-*` 1 each,
   `hierarchy-mindmap-*-circle-progress` 4 each). The stairs' are zero-LENGTH stroked paths that a browser draws as
   round dots: `<path d="M 396 426.8 L 396 426.8" stroke="#E9A23B" stroke-width="6" stroke-linecap="round">`. Since
   this patch they enter the scene, but `toSkeleton` drops them (a polyline collapsing below 2 points). Rule: a
   stroked path/line whose points are all within 0.5 of each other becomes, when `stroke-linecap` is `round`, a filled
   **ellipse** of diameter = stroke width centred on the point (fill = stroke colour, no stroke); `square` → a filled
   square; `butt` (default) → skipped as `hidden` (it draws nothing). Check whether the zigzag/circle-progress
   misses are the same thing (log the skipped scene element in a test with the real markup if not) and fix them the
   same way; the report must then show converted = total for all 9.
2. **Icon group order.** `emitIconStrokes` puts the icon group LAST (`[...groupIdsFor(use), 'icon:n']`). Excalidraw
   orders `groupIds` innermost first (as our `[item, picture]` already does), so the icon group must come FIRST:
   `['icon:n', ...groupIdsFor(use)]`. Add a test.
Same rules and gate as above (`--outputFile=.opencode-vitest-281a.json`). Do not touch the PATCH-282 files now in the
working tree (`DrawingEditor.tsx`, `DrawingLayout.tsx`, `libraryTemplates.ts`, `antvLibrary.ts`, `vitest.config.ts`,
and the harness export view).

## Addendum 2 (CTO, 2026-10-05, live in the drawing editor)
**Pie slices lose their fill after a reload.** With a provisional library file, the CTO inserted
`chart-pie-donut-pill-badge` in a new drawing: pills, leaders and title appear, the donut does NOT, and the library
preview SVG has none of the wedge colours. The exported wedges are `line` elements with `polygon: true` and a fill, but
their points are NOT closed: e.g. first `[0, 2]`, last `[0, 48]`; first `[194.4, 0]`, last `[149.5, 10.2]` (the
pills, by contrast, end where they start: `[18,0]…[18,0]`). Excalidraw's restore (library load, and also reopening a
SAVED drawing — so "Edit as drawing" pictures are affected after reload) re-validates polygons and drops the fill of an
open one. `convertToExcalidrawElements` in the harness does not re-validate, which is why the harness looked right.
Fix at the source: every polyline the skeleton marks closed/polygon must have its last point equal to its first
(append the first point when the gap is > 0; exact equality, no epsilon left over). Test: a filled closed path whose
sampled points do not repeat the first point → the skeleton's points end with the first point; AND run the result
through the fork's `restoreElements` (or `restoreLibraryItems`) in the test and assert `polygon === true` and the
background colour kept. Mutation: remove the closing → the restore test fails. Same rules; gate
`--outputFile=.opencode-vitest-281b.json`.

## Final result (CTO, 2026-10-05, live)
- Full re-audit of all 276 designs (own tab, dev harness, independent shape count): designs with dropped shapes
  **162 → 3**, and those 3 are only the 3 % pattern stripes (`patternIgnored`). Text 100 %, icons 100 %, max conversion
  24 ms. After Addendum 1/2: the 9 "dot" designs are complete (stairs 32/32, circle-progress 30/30), every pie 21/21
  or 11/11. Remaining known loss: `list-zigzag-*` one sub-pixel sliver path each (0.16 px, invisible).
- Side-by-side screenshots checked: tree connectors, mind-map branches, list arrows, chart axes/grid, stairs, zigzag,
  `?icons=strokes` (dark theme, 5/5 icons as strokes).
- Root causes: (1) zero-width/height boxes skipped before emitting straight lines; (2) computed-style paint references
  `url("#id")` (quoted) parsed to an id with a quote; (A1) zero-length round-cap paths are dots; (A2) open polygon
  rings lost their fill on Excalidraw restore — this also affected saved "Edit as drawing" pies after reopening.
- Gates `.opencode-vitest-281/281a/281b.json`: no new failing test names (two load flakes in 281b pass alone).
- The harness `?icons=` change is committed with PATCH-282 (same files).
