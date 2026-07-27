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

**Plumbing (added by the §13 amendment, 2026-07-27) — exactly two:**

7. `app/dashboard/canvas/[id]/CanvasClient.tsx`
8. `components/collabboard/canvas/layouts/DrawingLayout.tsx`

**Fullscreen runtime path (added by the §14 amendment, 2026-07-27) —
exactly two:**

9. `components/presentation/FullscreenPresentation.tsx`
10. `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`

**Maximum production files: 10.** An eleventh requires another hard stop
and a further amendment. The original "one unnamed supplying component"
rule is **superseded** — see §13 and §14.

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

## 13. Amendment — two-component plumbing path APPROVED (CTO ruling,
2026-07-27)

**Approved.** The original §6 rule authorized only one unnamed supplying
component. That was **insufficient**, and Codex was **correct to hard-stop
without making changes** — exactly the behavior §7.9 demands.

### 13a. Source trace — verified independently by the CTO

- **`createSlideRenderer` is constructed at exactly one site in the
  codebase:** `DrawingLayout.tsx:2131`, inside a `useMemo`.
- Its `renderSlideToPNG` wrapper (`:2138-2139`) is handed to
  `PresentationPanel` at **both** `:3284` and `:3303` — the thumbnail and
  fullscreen surfaces already consume **one** renderer instance.
  Supplying lines at `:2131` therefore serves both surfaces **by
  construction**, not by convention. §2b's "same primitive for both
  surfaces" requirement is satisfied structurally.
- `DrawingLayout` has **no `lines` prop** and no `lines` in its props
  interface — confirmed by grep.
- `CanvasLine` state is owned by `CanvasClient.tsx` (`lines` /
  `updateLineLocal` / `saveLineToDb` via `useCanvasData`).

The minimum legitimate path is therefore exactly:
`CanvasClient` → `DrawingLayout` → `createSlideRenderer` → the shared
composition path. Two files. No third.

### 13b. Restrictions on `CanvasClient.tsx` (bind — exhaustive)

**May only:** pass the **existing** current Drawing `CanvasLine`
collection into `DrawingLayout`, under the existing `isDrawingLayout`
condition already present at the `<DrawingLayout …/>` call site.

**Must not:** introduce new fetching, caching, filtering, conversion, or
mutation of lines · change line ownership or lifecycle · derive or pass
any editor viewport state for presentation purposes · alter Freeform or
Map behavior · pass lines to any component other than `DrawingLayout`.

The collection passed is the same `lines` state already held for the
live canvas. **No second source of truth and no second fetch.**

### 13c. Restrictions on `DrawingLayout.tsx` (bind — exhaustive)

**May only:** accept the collection as one new prop, and feed it into the
**existing** `createSlideRenderer({ … })` construction at `:2131`.

**Must not:** create a separate rendering path or a second cache · filter
by current editor pan, zoom, or viewport origin · modify `CanvasLine`
state · construct a second renderer · pass lines anywhere other than into
that single existing construction.

**Required input convention (bind — source-proven house pattern).** The
existing construction supplies every input as a **ref-backed getter with
empty `useMemo` deps**:

```ts
const slideRenderer = useMemo(() => createSlideRenderer({
  getSceneElements: () => runtimeSceneElementsRef.current,
  getPadlets: () => runtimePadletsRef.current,
  getFiles: () => currentFilesRef.current ?? runtimeInitialFilesRef.current ?? null,
}), []);
```

The CanvasLine input **must follow this exact shape** — e.g.
`getCanvasLines: () => runtimeCanvasLinesRef.current`, with the ref kept
in sync by the same mechanism the sibling refs already use, and the
`useMemo` dependency array **left as `[]`**.

**Passing the array directly, or adding it to the deps array, is a hard
stop.** Doing so would rebuild the renderer on every line edit — causing
thumbnail cache thrash and re-render churn — and a raw array captured in
a `[]`-deps memo would go stale instead. The getter pattern is the only
form that is both current and stable, and it is already the established
convention in this exact call.

### 13d. Hard fences retained and restated (bind)

Still prohibited: global state or context introduced solely for this
patch · duplicate database fetches · presentation-specific CanvasLine
fetching · a second CanvasLine cache · prop drilling **beyond these two
components** · `frameMembership.ts` · `SimpleLineRenderer.tsx` ·
`canvasLineCoordinates.ts` · Excalidraw-fork changes · schema or
migration changes · `bridge.ts` · Map or Freeform component changes · the
five §0b unrelated paths · `.fable5/**`.

### 13e. Test allowlist — UNCHANGED

**Maximum four test files**, as originally bound. Do not broaden
pre-emptively. One additional **existing** integration test may be
extended **only** if source proves it indispensable, and the proof must
be stated in the implementation report before the edit. A fifth *new*
test file requires a further amendment.

### 13f. All prior requirements preserved

This amendment widens the file boundary and nothing else. Unchanged and
still binding in full: the same Arrow Post visible in the Drawing frame,
the thumbnail **and** fullscreen (§5c) · **no editor `DrawingViewport`
state anywhere in the presentation path** (§2c) · one shared
geometry/render path for both surfaces (§2b) · membership and clipping
(§1) · front/back plane and z-order (§2e) · complete style and label
fidelity (§2d) · signature and invalidation (§3) · no duplicate rendering
· no stored-geometry mutation during preview generation ·
`coord_space=NULL` exclusion **with** an observable diagnostic (§2a) ·
and **the Freeform/Map fixture debt still requires a fresh CTO ruling
before closure** (§4) — it is not waived by this amendment.

**PATCH-115 remains AUTHORIZED FOR IMPLEMENTATION.** *(See §15 for the
current execution gate.)*

## 14. Amendment — fullscreen runtime path (CTO ruling, 2026-07-27)

### 14a. Correction of a false statement in §13a

**§13a asserted that supplying lines to `createSlideRenderer` at
`DrawingLayout.tsx:2131` serves thumbnail and fullscreen "by
construction". That is FALSE on current `main`.** It was asserted without
tracing the fullscreen path, and is withdrawn. Codex was **again correct
to hard-stop**; §7.9 has now caught two governance errors, which is the
control working as intended.

The two surfaces use **different renderers**:

**Thumbnail (correct as previously stated):**
`DrawingLayout.tsx:2131` → `createSlideRenderer(…)` → `renderSlideToPNG`
(`:2138-2139`) → `PresentationPanel` (`:3284`).

**Fullscreen (previously missed):**
`DrawingLayout.tsx:3306` → `FullscreenPresentation runtimeHelpers={runtimeSlideHelpers}`
→ `usingRuntime = USE_RUNTIME_LIVE_SLIDESHOW && !!runtimeHelpers`
(`FullscreenPresentation.tsx:75`; the flag is **`true`** at `:20`)
→ `RuntimeSlideRenderer` → `planSlideComposition(slide, sceneElements, allPadlets)`
(`RuntimeSlideRenderer.tsx:56`).

**When `runtimeHelpers` is present, fullscreen never calls
`renderSlideToPNG`.** `RuntimeSlideRenderer` has no CanvasLine input.

`renderSlideToPNG` is also passed at `:3303`, but that is the PNG
fallback/export route, not the live runtime path taken while the flag is
true.

### 14b. Ruling — extend the runtime path; do not disable it

The runtime fullscreen path **stays enabled**. Disabling
`USE_RUNTIME_LIVE_SLIDESHOW` or forcing the PNG fallback so that one
renderer suffices is **prohibited** — it would change existing
presentation behavior for every board and conceal the real integration
gap rather than closing it. Any change to that flag requires a separate,
explicit product decision by the owner.

### 14c. Exact minimum additional files — both required (source-proven)

**`FullscreenPresentation.tsx` MUST change.** Two independent reasons:

1. It **owns the contract**: `export type RuntimeSlideHelpers` is
   declared at `FullscreenPresentation.tsx:26` (currently
   `getSceneElements` / `getPadlets` / `getFiles`). Adding
   `getCanvasLines` cannot be done anywhere else.
2. It **unpacks the getters rather than forwarding the object** — lines
   `231-233` resolve `getSceneElements()`, `getPadlets()` and
   `getFiles()` and pass the **resolved values** down.
   `RuntimeSlideRenderer` receives arrays, not the helper object, so it
   cannot reach a new getter on its own.

The narrower "modify only `RuntimeSlideRenderer`" option is therefore
**not available**. This was checked before binding rather than assumed.

**`RuntimeSlideRenderer.tsx` MUST change** — it accepts the resolved
arrays as props (`:12-14`) and calls `planSlideComposition` at `:56`. It
must accept and forward the CanvasLine collection.

**Final production cap: 10.** No speculative headroom; this is the exact
set the source demonstrates.

### 14d. Runtime input contract (bind — exact)

Extend the existing type at `FullscreenPresentation.tsx:26`:

```ts
export type RuntimeSlideHelpers = {
  getSceneElements: () => readonly any[];
  getPadlets: () => Padlet[];
  getFiles: () => any;
  getCanvasLines: () => CanvasLine[];   // added
};
```

`DrawingLayout` supplies it from the **same ref** used for the PNG path,
so one ref feeds both surfaces — exactly one CanvasLine source of truth
in the presentation layer.

### 14e. The two memos have OPPOSITE requirements (bind — do not conflate)

This is the single most likely way this implementation goes wrong.

**(1) `DrawingLayout.tsx` — renderer/helper construction: deps MUST stay
`[]`.** Both `createSlideRenderer` (`:2131`) and `runtimeSlideHelpers`
(`:2144`) are `useMemo(…, [])` holding **ref-backed getters**, with the
existing comment *"Keep the helper identity stable and read fresh scene
data from refs at call time."* Add
`getCanvasLines: () => runtimeCanvasLinesRef.current` and **leave both
dependency arrays empty**. Adding the array to these deps rebuilds the
renderer and helper identity on every line edit — thumbnail cache thrash
and re-render churn. **Hard stop.**

**(2) `RuntimeSlideRenderer.tsx` — composition memo: the resolved array
MUST be added to deps.** Line `60` is deliberately identity-based —
`[slide?.id, sceneElements, allPadlets]`, with the existing comment *"We
intentionally depend on array identity — the parent recreates these when
elements change."* The resolved `canvasLines` array **must be added to
that dependency list**. Omitting it means an already-open fullscreen view
never recomputes on a line change — the exact stale-preview defect this
patch exists to fix. **Hard stop.**

Stable getter identity at construction; live array identity at
composition. Applying either rule in the other place breaks the patch.

### 14f. Invalidation chain (bind — verify, do not assume)

`CanvasClient` `lines` state changes (new array identity) → prop to
`DrawingLayout` → `runtimeCanvasLinesRef.current` updated during render,
following the existing pattern at `DrawingLayout.tsx:768-769` →
`FullscreenPresentation` re-renders and calls `getCanvasLines()`,
yielding the new identity → `RuntimeSlideRenderer`'s composition memo
recomputes → the open fullscreen view updates.

The implementer must **demonstrate this chain live with fullscreen
already open**, not reason about it.

The two surfaces invalidate by **different mechanisms** and both are
required: the thumbnail via the §3 `getSlideRenderSignature` extension,
the runtime view via the §14e(2) memo deps. Implementing only one leaves
the other stale.

### 14g. Shared implementation (bind — no divergence permitted)

**One composition representation:** both surfaces already call
`planSlideComposition`. Extend it **once** to resolve CanvasLine bands;
both paths then inherit identical membership, ordering and band
assignment automatically. `canvasLineSlideMembership` is used only there,
never re-implemented in either renderer.

**One geometry/style payload:** the two media genuinely differ (PNG path
rasterizes to a canvas; runtime path renders live DOM), so a single
literal drawing component may not be possible. Therefore
`renderCanvasLinePrimitive` **must expose a pure render-payload builder**
— resolved path data, arrowhead geometry, stroke/dash/color, label text,
placement and colors — consumed by **both** paths, with only the final
draw call medium-specific.

**Duplicated curve, arrowhead, label-placement or membership maths across
the two renderers is a hard stop.** A test must assert both paths derive
the **identical payload** from the same input (§14h).

### 14h. Test allowlist — raised to 5, narrowly

Maximum **5** test files. The fifth is authorized **only** as an
extension of the existing
`e2e/characterization/drawing-presentation.spec.ts` (source-verified to
exist and to cover presentation), **not** as a new file. A sixth, or a
new fifth file, requires explicit binding.

Acceptance must exercise all four of:

1. the PNG thumbnail path;
2. the **runtime fullscreen** path;
3. **identical composition and render payload** across both;
4. **already-open fullscreen invalidation** after create / edit / move /
   style / label / delete / legacy→scene conversion.

### 14i. `DrawingLayout.tsx` restrictions — §13c amended

**May now also:** maintain `runtimeCanvasLinesRef.current` (following the
existing `:768-769` pattern) and supply `getCanvasLines` through **both**
the `createSlideRenderer` construction (`:2131`) **and** the existing
`runtimeSlideHelpers` object (`:2144`).

**Still may not:** disable `runtimeHelpers` or force the PNG fallback ·
construct a second renderer · filter by editor pan/zoom/viewport origin ·
mutate or convert lines · introduce a second cache or second fetch · pass
`DrawingViewport` state into presentation · make any other presentation
behavior change.

### 14z. Superseded by §15

§14j remains accurate; the Freeform/Map fixture question it defers is
now ruled on in §15.

### 14j. Everything else preserved

§13's `CanvasClient.tsx` restrictions, all §13d hard fences, and every
requirement in §1-§5 stand unchanged — including that no editor
`DrawingViewport` state may reach either presentation path, that
`coord_space=NULL` rows are excluded with an observable diagnostic and
never mutated, and that **the Freeform/Map fixture debt still requires a
fresh CTO ruling before closure (§4) and is not waived.**

**PATCH-115 remains AUTHORIZED FOR IMPLEMENTATION.**

## 15. Fixture ruling + execution gate (CTO ruling, 2026-07-27)

**PATCH-115 remains AUTHORIZED. The candidate may NOT yet proceed to live
testing** — two corrections are required first (§15c, §15d). The
candidate stays uncommitted.

### 15a. Freeform/Map exemption — CONDITIONALLY APPROVED

The nine conditions were checked against the **actual diff**, not the
report. Eight pass; one fails.

| # | Condition | Verdict |
|---|---|---|
| 1 | No Map or Freeform component changed | **PASS** — absent from the diff entirely |
| 2 | No CanvasLine persistence or editor-rendering module changed | **PASS** — `SimpleLineRenderer.tsx`, `canvasLineCoordinates.ts`, `useCanvasData.ts`, `useCanvasLines.ts` all untouched |
| 3 | Eligibility explicitly excludes `coord_space=NULL` | **PASS** — `canvasLineSlideMembership.ts:65` gates on `!== "scene"`, with an observable diagnostic at `:69` |
| 4 | Plumbing activated only for DrawingLayout | **PASS** — exactly one `canvasLines={lines}`, at the `<DrawingLayout>` call site, itself inside `{isDrawingLayout && …}` |
| 5 | Unit tests prove legacy/null excluded without mutation | **PASS** — dedicated test, `canvasLineSlideMembership.test.ts:213` |
| 6 | Call-site tracing proves Map/Freeform never supply CanvasLines | **PASS** — by construction: the sole supplier is `CanvasClient → DrawingLayout`, which mounts only in Drawing layout |
| 7 | **No shared behavior outside Drawing presentation changed** | **FAIL** — see §15c |
| 8 | Residual risk recorded | Satisfied by §15b |
| 9 | Future patches need real fixtures or a fresh ruling | Bound in §15b |

**The exemption is granted the moment §15c is satisfied**, and not
before. The substance qualifies; the contamination does not.

### 15b. Residual-risk record (exact wording — reproduce verbatim at closure)

> **Freeform and Map: NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION FIXTURE.**
> Neither a pass nor a fail. The authenticated production account has no
> `freeform` or `map` board and is at its 3/3 plan limit, so no fixture
> could be obtained without creating production data, which is
> prohibited. Substitute evidence accepted: no Map or Freeform component
> was changed; no CanvasLine persistence or editor-rendering module was
> changed; presentation eligibility explicitly excludes
> `coord_space=NULL`; the presentation plumbing activates only under
> `isDrawingLayout`; unit tests prove legacy/null rows are excluded
> without mutation; and call-site tracing proves Map and Freeform never
> supply CanvasLines into the PATCH-115 presentation path.
>
> **Residual risk:** this proves the Drawing presentation path is fenced
> and that no shared module changed. It does **not** prove Freeform or
> Map runtime behavior end-to-end on a real board. The risk is accepted
> for PATCH-115 only, on the basis that the fence is structural rather
> than conventional.
>
> **Any future patch that changes shared CanvasLine eligibility, shared
> CanvasLine modules, or Map/Freeform presentation requires real fixtures
> or another fresh CTO ruling. This exemption does not carry forward.**

### 15c. Required correction 1 — revert out-of-scope `CanvasClient` edits

§13b binds `CanvasClient.tsx` to **"may only"** pass the CanvasLine
collection. The diff contains exactly **one** authorized line —
`canvasLines={lines}` at the `<DrawingLayout>` call site. Five further
edits are outside that binding and must be **reverted to their committed
state**:

1. removal of the `AIComponentEditor` import;
2. three `forceContainerPrompt` rewrites from rest-destructuring to
   `{ ...spread }` + `delete`;
3. `onReport={(_post: Padlet) => …}` → `onReport={() => …}`;
4. removal of `const containerError = insertResult.error.cause ?? insertResult.error;`
   inside the `if (!insertResult.ok)` branch;
5. any other edit in this file that is not `canvasLines={lines}`.

These appear to be ESLint-driven cleanups of **pre-existing** findings.
Three reasons they must go, in order of weight:

- **"May only" must mean what it says.** If a bound restriction can be
  exceeded for tidiness, every future restriction becomes advisory. This
  is the governance model, not a style preference.
- **Item 4 deletes an error-capturing binding in a failure branch.**
  CLAUDE.md rule 10 (*no silent catch; report failures honestly*) and
  rule 9 (*don't opportunistically "fix" known legacy patterns*) both
  apply. Whether or not it was unused, deleting it inside an unrelated
  patch is precisely the opportunistic repair the repo forbids.
- **Item 2 replaces immutable destructuring with `delete` mutation**,
  against `.claude/rules/common/coding-style.md`'s immutability rule — a
  style regression, not an improvement, and it makes the patch
  non-atomic (CLAUDE.md rule 8: a refactor with behavior diffs is two
  PRs).

**Amended ESLint gate (bind, resolving the conflict this creates):** the
§9 validation requirement is now **"no candidate-introduced ESLint
findings"**, not "clean on every touched file". Pre-existing findings in
a touched file are **acceptable and must NOT be fixed inside this
patch** — matching the standard already applied at PATCH-114 closure. If
reverting reintroduces a pre-existing warning, that is the correct
outcome; record it and move on.

### 15d. Required correction 2 — test gaps before live execution

The single test file is **genuinely strong** and directly exercises the
new code paths — projection viewport-independence (`:48`), shared
thumbnail/fullscreen payload (`:68`), six-band z-order and no duplicates
(`:76`), signature behavior (`:116`), and the full membership table
including unpadded bounds, strict centre containment, crossing
exclusion, boundary-touch, overlapping-frame ordering, and null-row
exclusion without mutation (`:172-213`). Six of the eight required areas
are covered. This is not a case of inflated counts.

Two gaps must be closed **before** live execution:

1. **Style and label fidelity (§2d)** — no test asserts that the shared
   payload preserves start/end arrowheads, stroke colour, stroke width,
   dashed style, label text, `label_position`, `label_text_color` and
   `label_background_color`. §2d requires all of them.
2. **Signature completeness (§3)** — `:116` covers "semantic line edits"
   generically. Required: a per-field assertion that **each** of
   geometry, membership, `start_arrow`, `end_arrow`, `color`,
   `stroke_width`, `dashed`, `label`, `label_position`,
   `label_text_color`, `label_background_color`, `layer_plane`,
   `z_index` and `coord_space` changes the signature, and that an
   unrelated change does not.

**Not required as a unit test:** runtime memo recomputation on
`canvasLines` identity change. CTO inspection confirms
`RuntimeSlideRenderer` deps are `[slide?.id, sceneElements, allPadlets, canvasLines]`
and that both `DrawingLayout` memos use ref-backed getters with `[]` —
§14e is implemented correctly in both directions. Live already-open
fullscreen evidence (§15f) is sufficient proof of behavior, and the
implementer must **quote both dependency arrays in the report** so the
reviewer can confirm the live pass is not incidental.

These additions belong in the existing test file or one further
authorized file; the allowance of **5** is unchanged and 4 slots remain.

### 15e. Drawing execution gate — owner recovery (bind)

The dev server is down (`:3000` and `:3000/auth` both unreachable).
Owner performs, in order:

1. Ensure no process holds port 3000.
2. Delete generated output: `rm -rf .next` (gitignored; regenerable).
3. `npm run dev`.
4. **Verify immediately before Playwright — both must return 200:**
   ```bash
   curl -s -o /dev/null -w "root:%{http_code}\n" http://localhost:3000
   curl -s -o /dev/null -w "auth:%{http_code}\n" http://localhost:3000/auth
   ```
   A 500 on `/auth` with 200 on `/` is the documented `.next`-corruption
   signature (`LESSONS_LEARNED.md:61-65`) — repeat step 2, do not proceed.
5. `PW_BASE_URL=http://localhost:3000` (this also disables the configured
   `webServer`).
6. Run Playwright with `--no-deps`.
7. **Never run `npm run build` while the dev server is active.**

### 15f. Mandatory Drawing live matrix (bind — closure impossible without)

Same Slide 4 Arrow Post visible in **all three**: the Drawing canvas, the
right-side thumbnail, and **runtime fullscreen**. Plus: fullscreen
demonstrably still on `RuntimeSlideRenderer` (not the PNG fallback) ·
save/reload · editor pan/zoom independence · front and back planes ·
endpoint edit refreshing thumbnail **and already-open fullscreen** ·
whole-line drag refreshing both · style changes refreshing both · label
changes refreshing both · deletion removing it from both ·
recreation/restoration returning it · no duplicate rendering · **no
stored-geometry mutation caused by preview generation** · `coord_space`
still `'scene'` afterwards · the real Arrow Post restored visually · and
the §8 toolbar census completed.

### 15g. Order of operations (bind)

1. Apply §15c (revert) and §15d (tests).
2. Re-run static validation: `tsc`, full `vitest`, ESLint (new gate),
   `git diff --check`.
3. Owner performs §15e recovery and confirms both 200s.
4. Run the §15f live matrix.
5. Report; independent review; **then** closure is considered.

The candidate remains **uncommitted** throughout. Do not begin
PATCH-116.

---

## 16. Final Freeform/Map unavailable-fixture ruling (2026-07-27, CTO)

Supersedes §15's *conditional* exemption. Both §15 corrections have been
verified applied by direct inspection of the candidate diff at governance
HEAD `48b8924495d5ee089ea7b11f8bf8ff9c28578722`; the Drawing live matrix
(§15f) has passed. This section issues the **final** ruling.

### 16a. Correction verification (both PASS)

**Correction 1 — out-of-scope `CanvasClient.tsx` edits reverted: PASS.**
`git diff --stat` reports `app/dashboard/canvas/[id]/CanvasClient.tsx |
1 +` — one insertion, **zero deletions**. The sole hunk adds
`canvasLines={lines}` at `:6792`, inside the `{isDrawingLayout && (`
guard opened at `:6788`. All five §15c edits are gone: the
`AIComponentEditor` import, the three `forceContainerPrompt` rewrites
(`:6466` is back to the committed form), the `onReport` signature change,
and — most importantly — the deleted `containerError` binding in the
`if (!insertResult.ok)` failure branch has been restored.

**Correction 2 — the two §15d test gaps closed: PASS.**
`lib/infra/drawing/canvasLineSlideMembership.test.ts` now carries 13
cases across two describes. The gaps are covered by name and by content:
`"preserves style and label fidelity in the shared render payload"`
(`:69`), `"changes render signatures for each presentation-relevant
CanvasLine field"` (`:137`), and the required negative case `"does not
change render signatures for unrelated editor state"` (`:195`).

**Static gates under the §15 standard.** `npx tsc --noEmit` exits 0.
`npx vitest run` → **55 files / 592 tests passed**, matching the reported
figure exactly. ESLint over all nine candidate files exits 0 — so the
amended *"no candidate-introduced findings"* gate is satisfied without
needing the allowance it grants.

### 16b. Substitute evidence — all 12 items independently verified

Verified by inspection of the working tree, not by accepting the report.

1–4. **No Map, Freeform, or shared-persistence file changed.** The full
   `git status --porcelain` is 12 modified + 4 untracked paths; filtering
   for `map|freeform|geo|mapbox` returns **NONE**, and filtering for
   `SimpleLineRenderer|canvasLineCoordinates|useCanvasLines|useCanvasData|frameMembership`
   returns **NONE**. PATCH-114's normalization surface and PATCH-112's
   `frameMembership.ts` are untouched; the latter is *reused* by import
   at `canvasLineSlideMembership.ts:2`, which is the required direction.

5. **`CanvasClient` supplies `canvasLines` only to `DrawingLayout`.** A
   repo-wide grep for `canvasLines|getCanvasLines` returns exactly one
   occurrence in `CanvasClient.tsx` — `:6792` — and it is layout-gated.

6 & 10. **`DrawingLayout` is the sole path, by construction.** The whole
   chain is single-entry: exactly one `<DrawingLayout>` call site in the
   repo (`CanvasClient.tsx:6789`, under `isDrawingLayout`); exactly one
   `createSlideRenderer(` caller (`DrawingLayout.tsx:2135`); exactly one
   `<FullscreenPresentation>` call site (`DrawingLayout.tsx:3310`), which
   is also the only site passing `runtimeHelpers`. `isDrawingLayout` is
   `canvas?.layout === 'drawing'` (`:1044`), and `isFreeformLayout`
   (`:1047`) and `isMapLayout` are mutually exclusive with it. Map and
   Freeform therefore cannot mount any component in this path — this is a
   structural impossibility, not an untested assumption.

7 & 8. **Null-`coord_space` rows excluded, observably, without
   mutation.** `canvasLineSlideMembership.ts:65` gates on
   `line.coord_space !== "scene"`, emits the
   `canvas-line-preview-legacy-coord-space-excluded` diagnostic at
   `:66-70`, and returns `null` — dropped by the `.filter()` at `:88`.
   The pipeline is `.map(…).filter(…)`; the input array and its rows are
   never written to. Covered by the dedicated case at `:283`.

9. **`RuntimeSlideRenderer` receives lines only through Drawing runtime
   helpers.** `FullscreenPresentation.tsx:236` reads
   `runtimeHelpers!.getCanvasLines()` and passes it at `:258`; the only
   provider of `getCanvasLines` is `DrawingLayout.tsx:2139` and `:2153`,
   both `() => runtimeCanvasLinesRef.current`.

11. **Vitest green at 55 files / 592 tests** — confirmed above.

12. **Dedicated coverage exists** for null-row exclusion without mutation
    (`:283`) and viewport-independent payload behavior (`:48`).

**Accepted.** This structural evidence is accepted as a substitute for
Freeform and Map live execution **for this patch only**. It is accepted
because it proves *non-participation by construction*, which is a
stronger claim than a passing live check would have been — a live Freeform
run could only show that nothing broke on one board, whereas the
single-entry-point proof shows the code cannot be reached at all.

### 16c. Final rulings

**Freeform: NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION FIXTURE.**
**Map: NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION FIXTURE.**

Neither may be recorded as PASS anywhere. `.env.local` defines
`PATCH114_LIVE_DRAWING_CANVAS_ID` and `PATCH114_LIVE_LEGACY_LINE_ID` and
**no** Freeform or Map fixture key for either patch — confirmed by
inspection. Consistent with the PATCH-114 §16 amendment: the authenticated
production account owns no accessible Freeform or Map canvas, and creating,
converting, or relabelling a production board to manufacture one remains
**prohibited**.

**This exemption is PATCH-115-specific and does not carry forward.** It
does not establish precedent, and it may not be cited by a later patch as
having already settled the question.

### 16d. Bound residual risk (verbatim; carry into §18 closure)

> Freeform and Map presentation behavior was not live-verified.
> The current candidate is structurally Drawing-only.
> No inference is made that future shared CanvasLine changes are safe.
> Any future patch touching shared CanvasLine membership, rendering,
> persistence, or presentation plumbing requires real fixtures or another
> fresh governance ruling.

### 16e. Drawing live acceptance: COMPLETE

The §15f matrix is satisfied. Both routes returned 200 before and after;
3 Playwright tests passed in 53.9s with `PW_BASE_URL` set and `--no-deps`;
no `webServer` was started and no build command ran — the three standing
rules from the PATCH-114 gate (never invoke Playwright without
`PW_BASE_URL` while a dev server runs; never build while dev is live;
probe a dynamic route) were all honored. `RuntimeSlideRenderer` stayed
active with **PNG fallback count 0**, so the runtime path — the one my
withdrawn §13a claim got wrong — is what was actually exercised.

The three §14e invalidation observations are the decisive evidence:

```
patch115ThumbnailSignatureChangedAfterStyle: true
patch115RuntimeCanvasLinesIdentityChangedAfterStyle: true
patch115AlreadyOpenRuntimeDashObserved: true
```

These confirm the two opposite memo requirements empirically, not just by
reading deps arrays: the thumbnail signature now responds to a CanvasLine
field change (the §3 defect), and an **already-open** fullscreen updated
(the §14e identity requirement). Cleanup is clean: zero temporary lines,
no scratch directories, disposable spec removed, real Arrow Post restored
with `coord_space='scene'`.

**No additional live evidence is required.**

### 16f. PATCH-116: CANCELLED

The §8 toolbar census is accepted as sufficient. It found no further
unsupported custom Drawing object type; `CanvasLine` was the single
missing path, and it now renders in canvas, thumbnail, and runtime
fullscreen. PATCH-116 is **cancelled**, not merely unreserved — its sole
purpose was additional custom-toolbar object coverage, and the census
establishes there is none.

**Bind:** this cancellation rests on the census being complete. If a
future custom Drawing toolbar object type is *added*, it needs a fresh
patch and may not claim coverage from PATCH-115.

### 16g. Independent closure review: AUTHORIZED

The candidate **may now proceed to independent closure review**.

Reviewer assignment per §11: DeepSeek V4 Pro (primary) or Kepler /
Gemini 3.1 Pro. **The authoring CTO must not review it, and Codex — which
implemented it — must not review its own work.** The reviewer must
re-derive §16a and §16b from the diff rather than accepting this section,
and must check the §16d residual-risk wording is carried into closure
verbatim.

**PATCH-115 remains AUTHORIZED and the candidate remains UNCOMMITTED.**
This section does not close the patch and does not authorize a commit of
the candidate.
