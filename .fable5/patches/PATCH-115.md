# PATCH-115 — Render Drawing CanvasLines in Both Slider Previews and Reliably Refresh Them

**Status:** **AUTHORIZED FOR IMPLEMENTATION (2026-07-27).** Both gates
that blocked this patch have cleared: PATCH-114 is CLOSED (landed
`44c0d5a6400edc00361e1f9141c17bd96680f91a`), so normalized scene-space
geometry now exists; and the invalidation root cause is source-proven
(§3). This is the **actual user-visible fix**.

---

## 0. The defect (confirmed live, unchanged)

An Arrow Post / Line Post created from the main left toolbar is **visible
inside a slide frame on the Drawing canvas** but **absent from both**:

1. the right-side slide thumbnail/preview, and
2. the fullscreen slider/presentation.

Root cause, source-proven and live-confirmed: the object is a
`CanvasLine` row in `canvas_lines`, not a native Excalidraw arrow. No
file under `components/presentation/**` references `CanvasLine`,
`canvas_lines`, or the `lines` state — the pipeline reads only native
scene elements and padlet embeddables. A **categorical omission**, not a
membership-resolution defect.

Live evidence: the arrow renders inside the Slide 4 frame on canvas while
Slide 4's fully-generated thumbnail shows only its Photo Card.

### 0a. Implementation base commit (bind)

Build on the **current governance HEAD of `main` when implementation
starts**, not any hash in this document — the commit publishing this file
advances HEAD after the text is written (convention since PATCH-106 §0a).
**Hard stop:** do not check out a historical commit.

### 0b. Pre-existing unrelated worktree paths (bind)

Out of scope. Do not stage, revert, stash, reformat, or touch:
`.gitignore`, `app/api/ai/classify-intent/route.ts`,
`app/api/ai/convert-component/route.ts`,
`app/api/ai/generate-component/route.ts`,
`scripts/live-access-login.mjs`.

## 1. Membership rule (bind — fail-closed, one formula, no duplication)

Reuse **`resolveFrameMembership` from `lib/infra/drawing/frameMembership.ts`
UNMODIFIED**. That file is on the prohibited list (§6). Adapt the line to
its `ElementFrameState` shape:

- `frameId: null` — always. `CanvasLine` has no frame column, so this
  forces the geometric branch every time.
- `x` / `y` / `width` / `height` — the **axis-aligned bounding box of the
  line's normalized scene-space geometry**, from `points[]` when present,
  else the legacy `start`/`control`/`end` triple. Mirror the existing
  `getBoundingBox` logic in `SimpleLineRenderer.tsx` but **without its
  ±10 visual padding** — padding is a selection affordance and must not
  widen membership.

The **same** resolver output must feed thumbnail composition, fullscreen
composition, and the render signature. Three call sites, one formula.
Computing membership twice is a hard stop.

### Explicit rulings (bind)

| Case | Ruling |
|---|---|
| Bounding-box center strictly inside | **The rule.** Included |
| Both endpoints inside | Included — because the center is, not as its own criterion |
| Center outside, path crosses the frame | **Excluded** (fail-closed) |
| Path intersection alone | Never sufficient |
| Edge-touch / zero-width contact | **Excluded** (strict inequality, matching PATCH-112) |
| Clipping | Never a membership criterion; members are clipped to frame bounds when drawn (§2c) |
| Overlapping frames | First match in **scene-array order** — the tie-break `resolveSlidePadlets` already uses |
| One line in multiple slides | **Forbidden.** At most one slide per line |

**Lines crossing frame boundaries (bind, must be documented in code):** a
line whose AABB center falls inside frame F belongs to F and is **clipped
to F's bounds** when rendered — the portion outside is not drawn and does
not leak into a neighbouring slide. A line whose center falls outside
every frame belongs to no slide and appears in no preview, even if part
of its path overlaps one. Rationale: a long arrow spanning several slides
must not silently appear in all of them; excluding an ambiguous line is
visible and reportable, duplicating it across slides is silent
corruption.

**Native slide membership remains `frameId`-only (PATCH-111) and padlet
embeddable membership remains exactly as PATCH-112 left it.** Neither may
change. Adding a third caller to `resolveFrameMembership` is not a
semantic change to existing callers.

## 2. Rendering (bind)

### 2a. Eligibility — normalized rows only

Only `coord_space === 'scene'` rows participate in slide previews.

- `coord_space === null` (legacy): **renders on the Drawing canvas
  exactly as today and is excluded from previews.** It has no stable
  scene geometry, so any membership answer would be viewport-dependent —
  precisely the defect PATCH-114 removed.
- **No database backfill. No silent mutation.** Preview generation is
  strictly read-only with respect to stored geometry: it must never
  write, convert, or normalize a row. Legacy rows convert only through
  PATCH-114 §2e's deliberate-edit path, driven by the user.
- The exclusion must be **observable, not silent** — emit a dev-only
  diagnostic naming the excluded line id and the reason, in the spirit of
  the existing `slide-embeddable-overlap-fallback` diagnostic.

### 2b. Static presentation primitive — not the interactive renderer

A **new** presentation-only module produces a static visual from a
`CanvasLine` plus a scene→slide-local transform.

**`SimpleLineRenderer` must not be imported, mounted, or reused in
presentation mode.** It owns pointer capture, selection state, drag
effects, hover chrome and dev diagnostics, none of which may reach a
rendered slide.

**Thumbnail and fullscreen must consume the same primitive.** Two drawing
implementations is a hard stop — that divergence is the whole reason
PATCH-112 introduced a shared membership rule.

### 2c. Projection (bind)

Project scene coordinates to slide-local space consistently with how
native Excalidraw content is already projected in the same composition —
derive the transform from the slide frame's own bounds, exactly as
`resolveSlidePadlets` derives `localX`/`localY`.

**Explicitly forbidden:** double scaling, double translation, and any
leakage of live viewport state. `DrawingViewport.scrollX` / `scrollY` /
`zoom` / `originOffsetX` / `originOffsetY` describe the *live editing
viewport* and **must not appear anywhere in the presentation path** — a
thumbnail must render identically regardless of where the user has
scrolled or zoomed the canvas. Pan/zoom independence is a required test
(§5).

### 2d. Visual parity (bind — all required)

Line path including multi-point Catmull-Rom curve geometry · start
arrowhead · end arrowhead · stroke color · stroke width · dashed style ·
label text · label position along the path (`label_position`) · label
text color · label background color · `layer_plane` · deterministic
`z_index` ordering within a plane.

Curve maths must match `getCurvePath`'s output
(`SimpleLineRenderer.tsx:67-89`) so a slide and the canvas never draw
visibly different curves. Extract or mirror it — do not re-derive by eye.

### 2e. Presentation order (bind — exact, first drawn at the bottom)

1. slide background
2. native Excalidraw **below**-band (`nativeBelowElements`)
3. **back-plane CanvasLines** (`layer_plane === 'back'`)
4. padlet / card overlay layer
5. **front-plane CanvasLines** (`layer_plane === 'front'`)
6. native Excalidraw **above**-band (`nativeAboveElements`)

This matches the live canvas, where the back-plane line layer sits at
wrapper `zIndex: 0` beneath padlets and the front-plane layer at
`zIndex: 500` above them (`CanvasClient.tsx:6319`, `:7145`).

## 3. Invalidation (bind — root cause already proven)

`getSlideRenderSignature` derives its native section from
`sceneElements.filter(el => !el.isDeleted && el.frameId === slideFrame.id)`
(`getSlideRenderSignature.ts:108-116`) and its embeddable section from
`resolvedPadlets`. **No `CanvasLine` change can alter that signature**,
so a cached thumbnail can never invalidate on a line edit. That is the
proven mechanism behind the stale-preview reports.

Required:

- Extend the signature with a **CanvasLine section** carrying real
  semantic and render inputs: line id, resolved membership, full
  geometry (`points[]` or the legacy triple), `start_arrow`, `end_arrow`,
  `color`, `stroke_width`, `dashed`, `label`, `label_position`,
  `label_text_color`, `label_background_color`, `layer_plane`, `z_index`,
  and `coord_space`.
- **`updated_at` alone is never sufficient** — it does not distinguish a
  style change from a geometry change and is not present on optimistic
  local state.
- **Both preview surfaces must derive from the same current board
  state.** A thumbnail and an open fullscreen view must never disagree.

Both surfaces must refresh after: creation of a supported CanvasLine ·
moving a line into a frame · moving it out · moving it within a frame ·
endpoint editing · whole-line dragging · style changes · label changes ·
deletion · legacy→scene conversion. **No manual refresh, no unrelated
edit, and no reopening of the slider may be required.**

## 4. Layout fences (bind)

- **No Freeform behavior change. No Map/geo behavior change.**
- PATCH-114 §16e applies and is **not waived**: because this patch
  touches shared `CanvasLine` code paths, live Freeform and Map evidence
  is **required before closure** — or this patch must carry its own
  explicit, separately-ruled unavailable-fixture record accepted by the
  CTO. The PATCH-114 substitute-evidence route does not automatically
  carry over. If fixtures remain unobtainable, stop and report rather
  than assuming the prior exemption.
- Do not create production canvases to obtain fixtures.

## 5. Required tests (bind — helper-only tests are insufficient)

### 5a. Unit

Membership (each row of the §1 table, including the crossing-boundary and
overlapping-frame cases) · projection (slide-local mapping; a viewport
change must produce **identical** output) · render payload (every §2d
attribute preserved) · eligibility (`coord_space=null` excluded and
diagnosed; `'scene'` included) · signature (each §3 field change produces
a different signature; an unrelated change does not) · z-order (§2e).

### 5b. Invalidation

Thumbnail updates on create-inside-frame · an **already-open** fullscreen
preview updates on create-inside-frame · move in · move out · move within
· endpoint edit · whole-line drag · style change · label change ·
deletion · legacy→scene conversion · **no stale cached thumbnail** in any
case.

### 5c. Live/rendered acceptance — **closure is impossible without this**

Visual proof showing the **same Arrow Post** in all three places:

1. the Drawing slide frame,
2. the right-side thumbnail,
3. fullscreen slider/presentation.

Use the **existing Slide 4 Arrow Post** (`coord_space='scene'`, retained
by PATCH-114 policy A) as the live repro fixture where safe. Capture
before/after screenshots or traces as artifacts.

Also required live: save/reload · **pan/zoom independence** (previews
identical across viewport changes) · front plane · back plane · endpoint
edit · whole-line drag · deletion · **no duplicate rendering** (a line
appears exactly once, in exactly one slide) · **no mutation of stored
geometry during preview generation** (assert the row is byte-identical
before and after rendering both surfaces).

### 5d. Regression

PATCH-111 behavior green · PATCH-112 behavior green · PATCH-114 behavior
green · full `npx vitest run` green (≥ 580 pre-existing plus additions) ·
Freeform and Map per §4.

Live execution follows PATCH-114 §17: `PW_BASE_URL` set (which also
disables the configured `webServer`), health-check `/auth` **and** `/`
before running, never `npm run build` while the dev server is live.

## 6. Exact file scope (bind)

**Allowed production files (max 6):**

1. `components/presentation/slide-renderer/planSlideComposition.ts` — resolved CanvasLine bands
2. `components/presentation/slide-renderer/getSlideRenderSignature.ts` — the §3 signature section
3. `components/presentation/slide-renderer/createSlideRenderer.tsx` — draw the new bands in §2e order
4. `components/presentation/slide-renderer/types.ts` — plan/type additions
5. **new** `components/presentation/slide-renderer/renderCanvasLinePrimitive.ts(x)` — the §2b static primitive
6. **new** `lib/infra/drawing/canvasLineSlideMembership.ts` — CanvasLine→`ElementFrameState` adapter + AABB

**Plus** whichever single component supplies `lines` to the presentation
entry point. It is **not yet named** — the implementer must identify it
by source trace and **report it before editing**. If more than one file
is required to plumb `lines` through, **stop and report**; do not widen
the boundary unilaterally.

**Allowed test files (max 4):** unit tests colocated with items 5 and 6
above · an extension of an existing presentation test · one new spec
under `e2e/characterization/`.

**Explicitly prohibited:**

- `lib/infra/drawing/frameMembership.ts` and its test — **reuse only**
- `components/collabboard/SimpleLineRenderer.tsx` — read-only reference
- anything under `components/collabboard/canvas/excalidraw_fork/**`
- `lib/infra/drawing/canvasLineCoordinates.ts` — PATCH-114's, frozen
- `components/map/MapCanvas.tsx`, any Freeform-specific component
- `supabase/migrations/**` — **no schema change is authorized**
- `lib/infra/drawing/bridge.ts` — its stale duplicate membership logic
  remains deferred, not in scope
- the five §0b unrelated paths · `.fable5/**`

## 7. Hard stops (bind — stop and report, do not improvise)

1. Any need to modify `frameMembership.ts`, the Excalidraw fork, or
   `canvasLineCoordinates.ts`.
2. Any duplicated membership formula in the diff.
3. Any raw (unnormalized) coordinate comparison.
4. `SimpleLineRenderer` reachable from presentation code.
5. Thumbnail and fullscreen producing different visuals.
6. Any write to `canvas_lines` from a preview path.
7. Any schema change or backfill.
8. Any Freeform or Map behavior change.
9. Plumbing `lines` requiring more than one additional file.
10. `updated_at`-only invalidation.

## 8. Drawing-toolbar census (bind — deliverable of this patch)

After Arrow Post integration works, enumerate **every** object creatable
from the main left toolbar in Drawing mode. Do not infer support from
on-canvas visibility; **require rendered thumbnail and fullscreen
evidence per family.**

Record per item: visible name · creation action · domain/object type ·
persistence source · coordinate model · live canvas renderer · slide
composition path · thumbnail support · fullscreen support · invalidation
support · save/reload behavior · status (`fully supported` /
`partially supported` / `missing` / `unresolved`).

Verify at least: text · image/photo · video/media · link/embed ·
note/comment card · container/frame · shapes · free drawing · native
arrows/lines · CanvasLine / Arrow Post · file/document posts · AI-created
posts · any other custom toolbar post.

At least three distinct persistence/coordinate models are already known
to coexist (native Excalidraw elements, padlet embeddables, `CanvasLine`).
Do not assume a fourth does not exist.

**The census is a report, not a licence to fix.** Any missing family is
folded into this patch **only** if it uses the identical proven
integration path and stays inside §6; otherwise it is reserved for
PATCH-116. **PATCH-116 remains reserved and uncreated** — its existence
and boundary are decided by this census.

## 9. Validation matrix (bind)

**Phase 1 — candidate uncommitted:** `npx tsc --noEmit` clean · full
`npx vitest run` green · `npx eslint` clean on touched files ·
`git diff --check` clean · the §5c live spec green with artifacts ·
`git status --short --untracked-files=all` showing only §6 files plus the
five untouched §0b paths.

**Phase 2 — after landing:** `npm run harness:validate-landed`.
`harness:validate-scope` reporting `ok:false` with
`commitMessageMatches: true` post-landing is **expected** — standing
ruling since PATCH-105 §13.

## 10. Model assignment (bind)

- **Implementer:** GPT-5.5 / Codex 5.6.
- **Independent reviewer:** DeepSeek V4 Pro (primary), or Kepler /
  Gemini 3.1 Pro.
- **Never** the authoring CTO as implementer, nor as reviewer of its own
  authored work.

## 11. Bound commit message (exact)

```
fix(presentation): render Drawing CanvasLines in slider previews and fix preview invalidation (PATCH-115)
```

## 12. Health ledger

- No schema change; no migration; no backfill.
- Reuses PATCH-112's canonical membership rule rather than adding a
  fourth.
- Removes a categorical gap: the presentation pipeline becomes aware of
  the third object family.
- Fixes a proven cache-invalidation hole in `getSlideRenderSignature`.
- Carries forward PATCH-114's Freeform/Map fixture debt **without
  waiving it** (§4).

**Do not authorize PATCH-116 until the §8 census is complete and
reviewed.**
