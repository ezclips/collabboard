# PATCH-114 — Normalize Drawing CanvasLine Geometry to Excalidraw Scene Coordinates

**Status:** **AUTHORIZED FOR IMPLEMENTATION.** Bound against governance
baseline `e970d7dad4b44de5b1fb08abaa8c77ed6043c131` (see §0a for the
base-commit resync rule). This patch is a **coordinate prerequisite
only**. It renders nothing into any slide preview. PATCH-115 is blocked
on its acceptance.

---

## 0. Root cause — source-proven

The Drawing "Arrow Post" / "Line Post" is a `CanvasLine` row in
`canvas_lines`, rendered by `components/collabboard/SimpleLineRenderer.tsx`,
**not** a native Excalidraw element. Its stored coordinates live in a
viewport-fixed CSS-pixel space that has no relationship to Excalidraw's
scene space. Chain of proof, all read directly from source:

1. **The line SVG has no viewBox and no transform.**
   `SimpleLineRenderer.tsx:615-624` renders
   `<svg className="absolute inset-0" style={{ width: '100%', height: '100%', ... }}>`.
   SVG user units are therefore identical to CSS pixels of the SVG's own
   box.

2. **Path geometry consumes stored values as raw user units.**
   `SimpleLineRenderer.tsx:670-672` and `:730-732` build
   `` `M ${line.start_x} ${line.start_y} Q ${line.control_x} ${line.control_y} ${line.end_x} ${line.end_y}` ``
   (or `getCurvePath(line.points)`) with no scaling or offset applied.

3. **Pointer input is divided only by `canvasZoom`.**
   `SimpleLineRenderer.tsx:257-264`:
   `getMousePos = (e.clientX - rect.left) / canvasZoom`.

4. **`canvasZoom` is permanently `1` on the Drawing canvas.**
   `components/collabboard/canvas/hooks/useCanvasCamera.ts:6` initializes
   `useState(1)`; its only mutators (`handleZoomIn` / `handleZoomOut` /
   `handleZoomReset`, lines 7-9) are wired exclusively to `ZoomControls`,
   which `CanvasClient.tsx:8411` renders only when `!isDrawingLayout`.
   The Drawing canvas's visible zoom control is Excalidraw's own and never
   touches `canvasZoom`.

5. **Creation stores that same unscaled space.**
   `useCanvasLines.ts:84-87` (`createLineFromCoords`) stores
   `rawStartX / canvasZoom` etc. With `canvasZoom === 1` this is the raw
   layer pixel offset. The Drawing path reaches it through
   `createLineForMap` (`CanvasClient.tsx:3119-3133`) via its non-map
   `else` branch.

6. **Excalidraw scene space is viewport-dependent.** Scene→viewport is
   `(scene + scroll) * zoom` plus the canvas box origin, driven by live
   `appState.zoom.value` / `scrollX` / `scrollY`.

Because (1)-(5) contain **no scroll or zoom term** and (6) is defined
entirely by them, the two spaces are related by a *viewport-dependent*
affine map. Comparing a raw `CanvasLine` coordinate with an Excalidraw
frame's scene bounds is therefore valid for exactly one viewport and no
other.

**Live empirical confirmation (this session, real board).** The repro
arrow rendered at the same screen pixels (~x 1220-1302, y 450-490) both
at Excalidraw `zoom 0.4 / scroll(-1932, 840.5)` and, after a
`scrollToContent` call, at `zoom 1.0` with entirely different scroll —
while every Excalidraw frame moved. A scene-anchored object cannot hold
a fixed screen position across a scene transform change. The arrow's
apparent containment inside the "Slide 4" frame is an artifact of one
captured viewport.

**Classification (from the coordinate-characterization contract):
E — the coordinate relationship is unstable under pan/zoom.** Under that
contract, `E` mandates stopping the *membership/rendering* work and first
landing the smallest prerequisite coordinate-normalization patch. This
document **is** that prerequisite patch; PATCH-115 carries the rendering
work and is blocked accordingly. The two are consistent, not in conflict.

### 0a. Implementation base commit (bind)

Check out and build on the **current governance HEAD of `main` at the
moment implementation starts**, not any hash quoted in this document. The
governance commit that publishes this file advances HEAD after the text
is written, so any hash printed here is one commit stale by definition
(established convention, PATCH-106 §0a onward). The authoritative value
is the one supplied in the implementation prompt. **Hard stop:** do not
check out a historical commit.

### 0b. Pre-existing unrelated worktree changes (bind)

These paths carry unrelated pending work and are **out of scope**. Do not
stage, revert, stash, reformat, or otherwise touch them:

- `.gitignore`
- `app/api/ai/classify-intent/route.ts`
- `app/api/ai/convert-component/route.ts`
- `app/api/ai/generate-component/route.ts`
- `scripts/live-access-login.mjs`

## 1. Relationship to prior governance (bind — no silent semantic change)

- **PATCH-111 (DONE)** characterized native Excalidraw slide membership
  as `frameId`-only. `CanvasLine` is a third, disjoint object family —
  neither a native Excalidraw element nor a padlet embeddable — so
  nothing here contradicts that ruling. **No amendment required.**
- **PATCH-112 (DONE)** bound `resolveFrameMembership` in
  `lib/infra/drawing/frameMembership.ts` as the single canonical
  membership rule shared by the render and drag-commit paths, and
  narrowed the embeddable fallback to strict center-point containment.
  This patch does not call, modify, or re-specify that function.
  **No amendment required.** PATCH-115 will *reuse it unmodified* for a
  new caller; adding a caller is not a semantic change to existing
  callers.
- **PATCH-113 (PROPOSAL, still open, not authorized)** concerns stacked
  padlet-card pointer-event blocking. Unrelated and **not superseded**;
  it remains an open proposal awaiting the user's fix-scope choice.
- Native Excalidraw membership semantics and padlet-embeddable
  membership semantics **must remain byte-for-byte unchanged** by this
  patch. Enforced by the untouched-file list in §6.

## 2. Authorized behavior (bind)

### 2a. Canonical stored geometry

`CanvasLine` gains an explicit, additive coordinate-space marker.

- `coord_space` absent / `null` ⇒ **legacy viewport-layer space.**
  Interpreted and rendered exactly as today. This is the default for
  every existing row in every layout.
- `coord_space === 'scene'` ⇒ **Excalidraw scene space**, the same
  origin and axes as frame/element geometry on the Drawing canvas.

No existing column changes meaning. No row is rewritten except by the
deliberate-edit rule in §2e.

### 2b. Pure conversion module (bind — exact interface)

New file `lib/infra/drawing/canvasLineCoordinates.ts`. Pure, no React,
no DOM reads, fully unit-testable:

```ts
export interface DrawingViewport {
  /** Excalidraw appState.zoom.value */
  readonly zoom: number;
  /** Excalidraw appState.scrollX */
  readonly scrollX: number;
  /** Excalidraw appState.scrollY */
  readonly scrollY: number;
  /** excalidrawCanvasRect.left - lineLayerRect.left */
  readonly originOffsetX: number;
  /** excalidrawCanvasRect.top - lineLayerRect.top */
  readonly originOffsetY: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export function sceneToLayer(point: Point2D, viewport: DrawingViewport): Point2D;
export function layerToScene(point: Point2D, viewport: DrawingViewport): Point2D;

/** SVG transform string equivalent to applying sceneToLayer to every child. */
export function sceneGroupTransform(viewport: DrawingViewport): string;
```

Definitions (bind exactly):

- `sceneToLayer`: `x = (point.x + scrollX) * zoom + originOffsetX`,
  `y = (point.y + scrollY) * zoom + originOffsetY`
- `layerToScene`: `x = (point.x - originOffsetX) / zoom - scrollX`,
  `y = (point.y - originOffsetY) / zoom - scrollY`
- `sceneGroupTransform`:
  `` `translate(${originOffsetX + scrollX * zoom}, ${originOffsetY + scrollY * zoom}) scale(${zoom})` ``
  — algebraically identical to `sceneToLayer` applied per child.

`originOffsetX/Y` must be **measured**, never assumed to be zero. The
line-layer SVG and the Excalidraw canvas are separate absolutely
positioned boxes; their origins coinciding is an implementation detail
that must not be baked into the maths.

### 2c. Rendering

`SimpleLineRenderer` renders scene-space rows inside a single
`<g transform={sceneGroupTransform(viewport)}>` and legacy rows in a
sibling untransformed `<g>`. Both groups keep the existing intra-plane
z-ordering (`orderedLines`, selected-last). Stroke geometry scales with
zoom (correct for scene-anchored content). **Hit paths only** carry
`vector-effect="non-scaling-stroke"` so the 20px grab band stays ~20
screen px at every zoom instead of collapsing to ~8px at 40%.

### 2d. Input, drag, and creation

- `getMousePos` keeps returning **layer** coordinates.
- Per-line conversion at the point of use: when a line is scene-space,
  drag/point-drag/label math converts through `layerToScene` first.
  Mixing spaces inside one renderer instance is expected and must be
  handled per row, never per renderer.
- **Creation on the Drawing canvas** writes scene coordinates and
  `coord_space: 'scene'`.
- **Creation on Freeform** and the **map geo branch** of
  `createLineForMap` are untouched and keep writing legacy space.

### 2e. Legacy policy (bind — explicit, reversible, no bulk conversion)

**Chosen policy: per-row marker + conversion on deliberate edit.**
Rejected alternatives and why:

- *Silent bulk conversion:* forbidden by the governance objective;
  irreversible; would corrupt Freeform/Map rows that share the table.
- *Heuristic detection without a marker:* impossible — legacy and scene
  values occupy overlapping numeric ranges, so no safe discriminator
  exists. This is precisely why the marker is required rather than
  merely convenient.
- *One-off conversion of the repro row only:* insufficient as a general
  rule, but retained as an **acceptance step** (below).

The rule:

1. Existing rows keep `coord_space = null` and render exactly as today.
2. A legacy row on the **Drawing canvas** converts to scene space only
   on a **completed deliberate geometry edit** — whole-line drag commit,
   point-drag commit, or midpoint-insert commit (pointer-up, never an
   intermediate move frame). All of its stored geometry
   (`start_*`, `control_*`, `end_*`, every `points[]` entry) converts
   through `layerToScene` with the viewport captured at commit time, and
   `coord_space: 'scene'` persists atomically in the same write.
3. Rows on Freeform and Map **never** convert, regardless of edit.
4. Conversion is reversible: `layerToScene`/`sceneToLayer` are exact
   inverses within the §7 tolerance, so a row can be converted back by
   the inverse transform if ever needed.

**Known and accepted consequence:** an unedited legacy Drawing line
remains viewport-pinned and therefore still will not participate in
slide membership. This is deliberate — it keeps the patch reversible and
Freeform/Map untouched. The user's actual repro arrow is a legacy row and
must be converted by one deliberate 1px drag-and-drop as part of the §8
acceptance steps; PATCH-115's acceptance depends on that conversion
having happened.

## 3. Schema / migration allowance (bind)

One additive, nullable column is authorized:

```sql
ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS coord_space text;
```

- Nullable, no default, no backfill, no `NOT NULL`, no constraint that
  could reject existing rows. A `CHECK (coord_space IS NULL OR coord_space = 'scene')`
  is permitted.
- **No data migration.** No `UPDATE` over existing rows.
- Delivered as a new file under the repository's existing migration
  directory, following whatever convention that directory already uses.
  **Hard stop:** do not edit an existing migration file.
- `lib/infra/canvas/linesRepository.ts` is column-agnostic (it forwards
  opaque objects to `.insert()` / `.update()`, lines 42-68), so it needs
  **no change** — confirmed by source read.

## 4. Required tests (bind)

### 4a. New unit tests — `lib/infra/drawing/canvasLineCoordinates.test.ts`

- T1-T3: `sceneToLayer` at `zoom` 0.5 / 1.0 / 2.0 with non-zero scroll
  and non-zero origin offset.
- T4-T6: `layerToScene` at the same three zooms.
- T7: exact round-trip `layerToScene(sceneToLayer(p)) === p` within
  tolerance, at all three zooms, with non-zero scroll **and** non-zero
  origin offset.
- T8: `sceneGroupTransform` is algebraically equivalent to
  per-point `sceneToLayer` (assert against computed values, not a
  hardcoded string).
- T9: non-zero `originOffsetX/Y` genuinely shifts output — proves the
  offset is not ignored.
- T10: negative scroll (the real board's `scrollX` is `-1932`).

### 4b. New unit tests — Drawing-only gating and legacy policy

- T11: a `null`-`coord_space` row produces identical render geometry
  before and after this patch (legacy invariance).
- T12: a `'scene'` row is placed in the transformed group.
- T13: a completed Drawing drag on a legacy row converts every stored
  geometry field and sets `coord_space: 'scene'` in one write.
- T14: an *intermediate* move frame does **not** convert or persist.
- T15: Freeform (no `drawingViewport`) never converts on drag.
- T16: the map geo branch never converts.
- T17: duplication copies `coord_space` verbatim.
- T18: front and back `layer_plane` rows both convert and render
  correctly.

### 4c. Live Playwright characterization (required — helper tests alone
are insufficient)

Extend `e2e/characterization/` with a Drawing-canvas spec proving, on a
real authenticated board:

- L1: create a line from the left toolbar at Excalidraw zoom 50%, 100%,
  and 200%; stored coordinates round-trip to the rendered position
  within tolerance at each.
- L2: create a line after a significant horizontal **and** vertical pan;
  same assertion.
- L3: a scene-space line's **stored** coordinates are byte-identical
  before and after pan and zoom (only rendering moves).
- L4: a scene-space line pans and zooms **together with** the Excalidraw
  frames — the failure signature from §0 is gone.
- L5: reload persists `coord_space` and geometry.

Use `scripts/live-access-login.mjs` with a scratch-path storage state;
delete it afterward. Restore any moved real object to its original
coordinates.

## 5. Non-regression fence (bind)

`SimpleLineRenderer` receives a `drawingViewport` prop **only** on the
Drawing canvas. `CanvasClient.tsx` already discriminates Drawing mode at
this exact call site — `excalidrawAPIRef={isDrawingLayout ? drawingExcalidrawAPIRef : undefined}`
(`:7163`) — and the new prop must follow the same condition. When
`drawingViewport` is absent, **every** new branch (render grouping, input
conversion, creation space, legacy conversion) takes the legacy path, so
Freeform and Map behavior is unchanged by construction. Freeform and Map
non-regression tests must assert this, not assume it.

The viewport must be supplied from `DrawingLayout`'s existing
Excalidraw `onChange` (`handleChange`, `DrawingLayout.tsx:1089`) so the
line layer re-renders on pan/zoom. Throttle to animation frames; do not
introduce an unthrottled per-pointer-move React state write.

## 6. Exact file scope (bind)

**Allowed production files (7):**

1. `types/collabboard.ts` — add optional `coord_space?: 'scene' | null` to `CanvasLine`.
2. `lib/infra/drawing/canvasLineCoordinates.ts` — **new**, pure conversions.
3. `components/collabboard/SimpleLineRenderer.tsx` — render grouping, per-line input conversion, hit-path `vector-effect`, new optional prop.
4. `components/collabboard/canvas/hooks/useCanvasLines.ts` — Drawing creation writes scene space + marker.
5. `components/collabboard/canvas/hooks/useCanvasData.ts` — persist `coord_space`; atomic legacy conversion on commit.
6. `app/dashboard/canvas/[id]/CanvasClient.tsx` — thread `drawingViewport` to the line layers under the existing `isDrawingLayout` condition.
7. `components/collabboard/canvas/layouts/DrawingLayout.tsx` — publish the throttled viewport from the existing `onChange`.

**Allowed migration:** exactly one new migration file (§3).

**Allowed test files (3):**

- `lib/infra/drawing/canvasLineCoordinates.test.ts` — new
- `components/collabboard/SimpleLineRenderer.test.tsx` — new or extended
- one new spec under `e2e/characterization/` — new

**Explicitly prohibited (non-exhaustive; the spirit binds):**

- Anything under `components/collabboard/canvas/excalidraw_fork/**` — **no fork modification whatsoever.**
- `lib/infra/drawing/frameMembership.ts` and its test — PATCH-112's canonical rule is untouched.
- `components/presentation/**` — **no slide rendering in this patch.**
- `lib/infra/drawing/presentationBridge.ts`, `lib/infra/drawing/bridge.ts`.
- `components/map/MapCanvas.tsx`, any Freeform-specific component.
- `lib/infra/canvas/linesRepository.ts` — proven unnecessary.
- Any existing migration file.
- The five unrelated worktree paths in §0b.
- `.fable5/**` — governance is the CTO's, not the implementer's.

## 7. Numeric tolerance (bind)

Round-trip and reconstruction assertions use an absolute tolerance of
**≤ 0.01 scene units**. Anything larger is a defect, not float noise.
Report the **maximum observed error** across the whole §4c matrix in the
implementation report; a value above 0.01 is a hard stop.

## 8. Live browser acceptance steps (bind)

1. Log in via `scripts/live-access-login.mjs` (scratch storage state).
2. Open the Drawing canvas. Confirm the existing repro arrow still
   renders exactly as before (legacy row, unchanged).
3. Create a new Arrow Post from the left toolbar inside a slide frame.
   Pan and zoom; confirm it stays locked to the frame.
4. Drag the **existing repro arrow** by ~1px and drop — confirm it
   converts (`coord_space: 'scene'`), keeps its visual position, and
   thereafter pans/zooms with the canvas.
5. Reload; confirm both lines persist correctly.
6. Open a Freeform canvas with existing lines; confirm no visual or
   behavioral change.
7. Delete every temporary line created during acceptance. Restore any
   moved real object.

## 9. Validation matrix (bind)

**Phase 1 — candidate uncommitted:**

- `npx tsc --noEmit` clean.
- `npx vitest run` — all green, **552 pre-existing tests still passing**
  plus the new ones.
- `npx eslint` clean on every touched file.
- The §4c live spec green.
- `git status --short --untracked-files=all` shows **only** the §6 files
  plus the five untouched §0b paths.

**Phase 2 — after the candidate lands:**

- `npm run harness:validate-landed` for this patch.
- `harness:validate-scope` is **expected** to report `ok:false` with
  `commitMessageMatches: true` post-landing — standing ruling since
  PATCH-105 §13. Not a regression.

## 10. Hard-stop conditions (bind — stop and report, do not improvise)

1. Any need to modify the Excalidraw fork.
2. Any need to change `frameMembership.ts` or any file under
   `components/presentation/**`.
3. Any Freeform or Map behavior change, however small.
4. Any raw-coordinate comparison between a `CanvasLine` and frame
   geometry anywhere in the diff.
5. Any bulk `UPDATE` over `canvas_lines`.
6. Round-trip error above the §7 tolerance.
7. Discovering that `originOffsetX/Y` cannot be measured reliably.
8. Any temptation to render lines into a slide preview — that is
   PATCH-115.

## 11. Model assignment (bind)

- **Implementer:** GPT-5.5 / Codex 5.6.
- **Independent reviewer:** DeepSeek V4 Pro (primary), or Kepler /
  Gemini 3.1 Pro.
- **Never** the authoring CTO (Sonnet) as implementer or reviewer of its
  own authored work.

## 12. Bound commit message (exact)

```
fix(drawing): normalize Drawing CanvasLine geometry to Excalidraw scene coordinates (PATCH-114)
```

## 13. Health ledger

- Adds one nullable column; no data rewritten.
- Net new pure module with full unit coverage.
- Legacy rendering path preserved verbatim for all three layouts.
- Incidentally restores a usable hit-grab band at low zoom
  (`non-scaling-stroke`), which was measurably degraded at 40%.

**Do not authorize PATCH-115 implementation until this patch is closed
by the CTO after independent review.**
