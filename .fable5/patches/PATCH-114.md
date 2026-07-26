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
  could reject existing rows.
- **AMENDED 2026-07-26 (acceptance gate 1, MEDIUM 1 ruling): the CHECK
  constraint is now REQUIRED, not merely permitted.** The migration must
  read:

  ```sql
  ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS coord_space text;

  ALTER TABLE canvas_lines
    ADD CONSTRAINT canvas_lines_coord_space_check
    CHECK (coord_space IS NULL OR coord_space = 'scene');
  ```

  **AMENDED AGAIN 2026-07-26 (live gate, LOW 1 upgraded): the
  `ADD CONSTRAINT` must carry an existence guard.** Required final text:

  ```sql
  ALTER TABLE canvas_lines ADD COLUMN IF NOT EXISTS coord_space text;

  DO $$
  BEGIN
    ALTER TABLE canvas_lines
      ADD CONSTRAINT canvas_lines_coord_space_check
      CHECK (coord_space IS NULL OR coord_space = 'scene');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;
  ```

  Rationale for the upgrade from LOW: `supabase/BASELINE.md` records that
  migrations in this repository "were applied non-linearly and several
  changes went to prod via the SQL editor". In an environment with a
  documented history of out-of-band and replayed SQL, a bare
  `ADD CONSTRAINT` is a live hazard rather than a cosmetic gap —
  `ADD COLUMN` is already guarded by `IF NOT EXISTS`, and the two
  statements must be equally replay-safe or the file is only half
  idempotent.

  Rationale: §2a defines `coord_space` as a strictly two-valued domain
  (`null` = legacy, `'scene'` = normalized), and rendering branches on it.
  An unconstrained `text` column lets any future writer persist a third
  value that would silently fall through to the legacy branch and
  mis-place a line, with no error anywhere. The constraint is free at
  this size, passes for every existing row (all `NULL`), and is
  independently droppable. Enforcing a two-valued invariant only in
  TypeScript when the database can enforce it is a gap, not a
  preference.
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

**AMENDED 2026-07-26 (acceptance gate 1):** one configuration file is
added to the allowlist —

- `vitest.config.ts` — **include-pattern extension only.**

The existing pattern is
`['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts', 'scripts/harness/**/*.test.ts']`,
which does not reach `components/`, so
`components/collabboard/SimpleLineRenderer.test.tsx` never executed. Only
a **precisely scoped** entry may be added — `'components/collabboard/*.test.tsx'`
(single-level). A broader glob such as `components/**/*.test.tsx` is a
**hard stop**: it would sweep in roughly 100 Excalidraw-fork test files
that the narrow pattern deliberately excludes. No other key in this file
may change; in particular `environment: 'node'` stays, and is sufficient
because the renderer test uses `renderToStaticMarkup` from
`react-dom/server` rather than a DOM.

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

## 14. Acceptance gate 1 — CORRECTION REQUIRED (CTO ruling, 2026-07-26)

**Verdict: NOT CLOSED. Focused correction required before any migration
deployment or live testing. The candidate remains uncommitted.**
(Decision path **A**.)

The independent verdict of *PASS WITH BLOCKED LIVE GATE* is accepted for
everything it verified, and CTO re-verification confirms it independently:
the candidate is inside the allowlist; the five unrelated pending paths
are untouched; no prohibited fork, presentation, Freeform, Map, or
`frameMembership.ts` file changed; the coordinate algebra matches §2b;
non-zero origin offsets are genuinely used; maximum round-trip error is
`≈9.9476e-14` scene units, **six orders of magnitude inside the §7
tolerance of 0.01**; legacy rows do not convert on load or on move
frames; conversion occurs only on completed deliberate edit; geometry and
`coord_space` persist atomically; Freeform and Map stay on legacy paths.
`git diff --check`, `npx tsc --noEmit`, `npx vitest run` (53 files, 564
tests) and ESLint are clean.

**§4a is fully satisfied.** CTO re-verification: the three `it.each`
blocks expand across three viewports, so T1-T3, T4-T6 and T7 are all
genuinely covered, plus T8, T9, T10 — twelve executing tests, exactly
matching the 552 → 564 delta.

### 14a. Corrections to the independent characterization (bind)

Two findings are materially more severe than reported. Recording both so
the correction is scoped to reality:

1. **The §4c live characterization spec was never written.** The review
   framed the live gate as blocked by the absent database column. It is
   not: `git ls-files --others --exclude-standard e2e/` returns nothing,
   and no new file exists under `e2e/characterization/`. The §6 slot for
   it is empty. **Authoring a Playwright spec has never required the
   column to exist — only executing it does.** "Cannot run" and "was not
   written" are different failures, and only the first is legitimately
   blocked. §4c states verbatim that it is *required* and that *helper
   tests alone are insufficient*; the present candidate is precisely
   helper tests alone.

2. **LOW 1 is upgraded to HIGH.** A test file outside the runner's
   include pattern is not weak coverage — it is **zero** coverage
   emitting a false green signal. All five renderer tests reported as
   part of the passing suite never executed. The 564 figure contains
   none of them.

   **Standing governance rule, effective now and for all future
   patches:** a test file that the configured runner does not execute
   never satisfies a test contract. Any patch claiming test coverage must
   demonstrate the tests appear in the runner's own output.

### 14b. §4b coverage — actual status (bind)

| Test | Required behavior | Status |
|---|---|---|
| T11 | legacy row render invariance | written, **not executing** |
| T12 | scene row in transformed group | written, **not executing** |
| T13 | drag commit converts all fields + marker | **missing** |
| T14 | intermediate move frame does not convert | **missing** |
| T15 | Freeform never converts on drag | **partial** — covers the render path only, not conversion-on-drag |
| T16 | map geo branch never converts | **missing** |
| T17 | duplication copies `coord_space` | **missing** |
| T18 | front/back planes | written, **not executing** |

Three fully written, one partial, four missing, **zero executing**.

### 14c. Required corrections (bind — exhaustive)

1. **Migration:** add the required CHECK constraint per the amended §3.
2. **Runner:** extend `vitest.config.ts` by the single precisely scoped
   include entry per the amended §6, so T11/T12/T15/T18 actually execute.
3. **T13, T14, T16, T17:** add executing automated coverage, and complete
   T15 to cover conversion-on-drag, not just rendering.
   **Recommended route (satisfies §7 of PATCH-115's "no duplicated
   formula" principle and needs no further allowlist entry):** expose the
   conversion *decision* and the conversion *transform* as pure functions
   in the already-allowlisted
   `lib/infra/drawing/canvasLineCoordinates.ts`, have the hooks call
   them, and unit-test them under `lib/infra/**` where the runner already
   reaches. Binding requirement is the outcome, not the route: all four
   must appear in `npx vitest run` output.
4. **§4c live spec:** author the spec file under `e2e/characterization/`
   now. It may be authored and committed to the candidate while still
   **unrunnable** pending the migration; authoring is not gated.

### 14d. Explicitly NOT authorized by this ruling

- **No migration may be deployed to any database yet.** Deployment is
  gated on acceptance gate 2.
- No commit, no push — the candidate stays uncommitted.
- No scope broadening beyond §14c. Behavior verified as correct must not
  be refactored.
- PATCH-115 remains blocked.

### 14e. Acceptance gate 2 (defined now, not yet open)

Once the §14c correction passes local re-validation, the CTO will
authorize, as a separately governed step: migration deployment to the
database backing the authenticated Drawing canvas, then the full §4c live
matrix, then closure. The live matrix must include the deliberate ~1px
drag that converts the real repro Arrow Post (§2e / §8 step 4), and its
restoration afterward — without that conversion, PATCH-115 has no
acceptance-testable subject.

## 15. Live gate — CONDITIONAL AUTHORIZATION (CTO ruling, 2026-07-26)

Correction gate 2 is **accepted**. Independent verdict *PASS — CORRECTION
GATE COMPLETE* confirmed by CTO re-verification: T11-T18 execute
(54 files / 576 tests), migration CHECK present, algebra intact, the §4c
spec exists and is not skipped, no database mutation has occurred, and
the candidate is uncommitted.

**CTO additional verification — the new coverage is real, not theatre.**
LOW 2 raised the possibility that tests cover functions production never
calls. Verified false for everything that matters: every helper backing
the restored tests has a genuine production caller —
`drawingLineDragPersistenceIntent` → `SimpleLineRenderer.tsx:484`
(T13/T14), `createCanvasLineGeometryFromLayerCoords` →
`useCanvasLines.ts:90`, `normalizeCanvasLineForPersistence` →
`useCanvasData.ts:368`, `canvasLinePersistencePayload` →
`useCanvasData.ts:382`, `duplicateCanvasLineWithOffset` →
`useCanvasData.ts:467` (T17), `mapGeoCanvasLinePersistencePayload` →
`CanvasClient.tsx:3271` (T16). `convertCanvasLineGeometryToScene` is used
internally at line 117 and is **not** dead.

### 15a. Target environment (bind — no ambiguity permitted)

**PRODUCTION.** Determined from source, not assumed:

- `NEXT_PUBLIC_SUPABASE_URL` resolves to a remote hosted project
  (`https://<20-char-ref>.supabase.co`). Classification was derived
  programmatically without printing the value.
- **No local Supabase stack exists** — there is no `supabase/config.toml`.
- `supabase/BASELINE.md` refers to this database as "the live database"
  and records that changes "went to **prod**".

There is exactly one remote database, it holds the user's real canvases
including the repro Arrow Post, and **no staging environment exists.**

**Ruling on deploying to production for acceptance testing: ACCEPTABLE IN
PRINCIPLE, CONDITIONAL ON EXPLICIT USER GO-AHEAD.** The change is two
additive DDL statements — nullable column, no default, no backfill, no
`UPDATE`, no destructive statement, valid for every existing row (all
`NULL`), and independently droppable. Its blast radius is as small as a
schema change can be. But it is production data, there is no staging to
rehearse on, and authorizing it is the user's call, not the CTO's.
**The operator must obtain a one-time explicit confirmation from the
repository owner immediately before applying.**

### 15b. HARD STOP — `supabase db push` is FORBIDDEN

`supabase/BASELINE.md` states plainly that `supabase/migrations/` **does
not rebuild the live database**, that migrations "were applied
non-linearly", that several changes were applied out-of-band, and that
the baseline reconciliation was **blocked on 2026-07-06 and never
completed** (`legacy/` and the interim section are both still present).
There are **64 migration files**.

Against a desynchronized remote migration history, `npx supabase db push`
applies everything the remote history table does not record as applied.
That set is unknown and cannot be trusted here, and it may include
`20260213_kanban_clean_reset.sql` (a reset script) and
`20260213_step1_diagnostic.sql`. Running it against production risks
catastrophic, unrelated schema change.

This is exactly the narrower-method hard stop. `db push`,
`db reset`, `migration up --include-all`, and any command that can apply
more than the single authorized file are **prohibited**.

### 15c. Authorized operator (bind)

**The repository owner (the user), operating locally.** Sole operator for
the migration step. Not the CTO — this governance role explicitly
excludes deployment execution. Not the implementation model — production
database credentials must not be handed to it.

The implementation model (GPT-5.5 / Codex 5.6) **is** authorized to run
the §4c Playwright matrix afterward, which needs only application-level
credentials.

### 15d. Pre-deployment checks (bind — all read-only, all must pass first)

Run against production and record the output. **Any surprise is a hard
stop.**

```sql
-- 1. table exists
SELECT to_regclass('public.canvas_lines');                    -- expect non-null

-- 2. column absent (or capture its exact existing definition)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'canvas_lines' AND column_name = 'coord_space';   -- expect 0 rows

-- 3. constraint absent
SELECT conname FROM pg_constraint
WHERE conname = 'canvas_lines_coord_space_check';              -- expect 0 rows

-- 4. no existing value would violate the constraint
--    (skip only if step 2 returned 0 rows)
SELECT count(*) FROM canvas_lines
WHERE coord_space IS NOT NULL AND coord_space <> 'scene';      -- expect 0

-- 5. this migration version is not already recorded
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260726%';                                -- expect 0 rows

-- 6. baseline row count, for the post-check comparison
SELECT count(*) AS total FROM canvas_lines;
```

Additionally, **capture a rollback record before applying**: a
schema-only dump of the table
(`pg_dump --schema-only --table=public.canvas_lines`) stored **outside
the repository**. Rollback for this change is
`ALTER TABLE canvas_lines DROP CONSTRAINT IF EXISTS canvas_lines_coord_space_check;`
followed by `ALTER TABLE canvas_lines DROP COLUMN IF EXISTS coord_space;`.

### 15e. Approved deployment method (bind — exact, narrow)

Apply **only** `supabase/migrations/20260726_add_canvas_line_coord_space.sql`,
as a single file, then record the version so future tooling skips it:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260726_add_canvas_line_coord_space.sql

npx supabase migration repair --status applied 20260726
```

`SUPABASE_DB_URL` must be supplied from the local environment and must
never be printed, echoed, logged, or pasted into a report. This satisfies
`BASELINE.md`'s "CLI, not the dashboard SQL editor" rule while touching
exactly one file. The `migration repair` step is **required** — without
it the version stays unrecorded and a future `db push` would try to
reapply it.

**Not authorized:** any other migration, `db push`, `db reset`, schema
recreation, bulk `UPDATE`, backfill, or any destructive statement.

### 15f. Post-deployment verification (bind — leave no test rows)

```sql
-- column exists, nullable text
SELECT data_type, is_nullable FROM information_schema.columns
WHERE table_name='canvas_lines' AND column_name='coord_space';  -- text, YES

-- constraint exists
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname='canvas_lines_coord_space_check';

-- no row was backfilled; count unchanged vs 15d step 6
SELECT count(*) AS total,
       count(coord_space) AS non_null_coord_space
FROM canvas_lines;                       -- non_null_coord_space expect 0
```

Accept/reject probes **must run inside a transaction that is rolled
back**, so no test row can survive even on error:

```sql
BEGIN;
  -- NULL accepted, 'scene' accepted, third value rejected
  UPDATE canvas_lines SET coord_space = NULL    WHERE id = (SELECT id FROM canvas_lines LIMIT 1);
  UPDATE canvas_lines SET coord_space = 'scene' WHERE id = (SELECT id FROM canvas_lines LIMIT 1);
  -- expect this to raise check_violation:
  UPDATE canvas_lines SET coord_space = 'bogus' WHERE id = (SELECT id FROM canvas_lines LIMIT 1);
ROLLBACK;
```

Confirm the third statement raised `check_violation` and that `ROLLBACK`
completed. Do not use `INSERT` for probes — rolled-back inserts still
consume identity/sequence values.

### 15g. Required live environment variables (bind)

`PATCH114_LIVE_DRAWING_CANVAS_ID`, `PATCH114_LIVE_LEGACY_LINE_ID`,
`PATCH114_LIVE_FREEFORM_CANVAS_ID`, `PATCH114_LIVE_MAP_CANVAS_ID`,
`LIVE_ACCESS_EMAIL`, `LIVE_ACCESS_PASSWORD`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

All resolve from local environment files only. **Never printed,
committed, echoed, or copied into any report.** Reports state that a
variable was set — never its value.

### 15h. Authorized live command (bind)

```bash
node scripts/live-access-login.mjs "<scratch-path>/state.json"

npx playwright test --project=characterization \
  e2e/characterization/drawing-canvas-line-coordinates.spec.ts
```

Storage state goes to a scratch path outside the repository and is
deleted afterward.

### 15i. Real repro Arrow Post — restoration policy (bind)

Record `id`, all geometry fields, `coord_space`, `layer_plane`, `z_index`
and style **before** touching it. Move it only by the governed ~1px
conversion drag.

**Ruling: policy A — restore the original visual position, RETAIN
`coord_space = 'scene'`.** PATCH-115 uses this object as its acceptance
subject and requires normalized geometry to have a membership-testable
subject at all; reverting to `coord_space = NULL` would immediately
recreate the blocker PATCH-114 exists to remove. The conversion is
value-preserving by §2e (visual position is held constant across
conversion, which §7 of the live matrix independently asserts), so
retaining it loses nothing the user can observe.

Position must be restored to the original scene-equivalent coordinates
within the §7 tolerance. Report the before/after geometry explicitly.

### 15j. Cleanup (bind)

Delete every temporary test line created by the matrix. Restore the
repro Arrow Post per §15i. Delete scratch storage-state files. Close only
processes the task started — **a pre-existing dev server must be left
running**. No credential output anywhere. Git state unchanged; the
candidate stays uncommitted.

### 15k. Failure policy (bind)

If any live scenario fails: do not commit the candidate, do not begin
PATCH-115, and **leave the additive migration installed** unless rollback
is specifically required — it is backward-compatible with the pre-patch
code, which simply ignores the column. Report the exact failing scenario
with observed values. Do not broaden implementation scope without a
governance amendment.

### 15l. Closure conditions (bind)

Two residual corrections must land in the candidate **before** the live
run, both trivial and inside the existing allowlist:

1. the §3 idempotent `ADD CONSTRAINT` guard;
2. deletion of `shouldConvertLegacyCanvasLineToScene` from
   `lib/infra/drawing/canvasLineCoordinates.ts` — verified to have zero
   internal, production **and** test references. Keep
   `convertCanvasLineGeometryToScene` (used internally, line 117).

The candidate **remains uncommitted until the live matrix passes.**

**PATCH-114 may then close without a further amendment**, provided: the
two corrections above landed, the full §4c matrix passed, §15f
verification passed, §15i restoration is evidenced, and an independent
reviewer confirms it. No third correction gate is required for a clean
run.
