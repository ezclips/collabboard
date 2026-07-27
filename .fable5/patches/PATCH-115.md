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

---

## 17. Closure-review findings ruling (2026-07-27, CTO)

Issued at governance HEAD `e53bb47ebf30558bfcf0dd96a71ee1381dbe66c4`
against an independent closure verdict of **PASS — READY TO CLOSE** with
two MEDIUM findings referred for explicit ruling. Both findings were
re-derived from the candidate diff before ruling; neither was accepted on
the reviewer's characterization.

### 17a. Decision: OPTION A, AMENDED

**Option A is selected — with item 2 of its correction list rejected.**

Finding 1 is upheld and must be corrected. **Finding 2 is rejected**: the
dependency it asks to remove is load-bearing, and removing it would
reintroduce the exact §3 defect this patch exists to fix. Neither pure
Option A nor Option B is adopted, because Option A as written would ship a
regression and Option B would absorb a genuine scope violation.

This is not an override of the reviewer on taste. Finding 1 is accepted
*as written*. Finding 2 rests on a factual premise about the code that is
false, evidenced below.

### 17b. Finding 1 — UPHELD. Correction required.

Confirmed at `DrawingLayout.tsx:3197-3199` and `:3250-3252`. Both hunks
replace immutable rest-destructuring with `{ ...spread }` followed by two
`delete` statements:

```
-          const { parentId: _p2, childPadletIds: _c2, ...cleanMeta2 } = c.metadata || {};
+          const cleanMeta2 = { ...(c.metadata || {}) };
+          delete cleanMeta2.parentId;
+          delete cleanMeta2.childPadletIds;
```

This is the **same** ESLint-driven rewrite that §15c required reverting
from `CanvasClient.tsx`, in the same candidate, by the same implementer.
It must be ruled the same way, for three reasons:

1. **Consistency is the whole value of the ruling.** A restriction that
   applied to one file and not its neighbour in the same patch is not a
   restriction.
2. **It is out of scope.** DrawingLayout's authorization covers CanvasLine
   plumbing — the prop, the ref, the two getters, the deps array. These
   two sites touch library-item placement metadata and have no relation
   to CanvasLine presentation.
3. **It contradicts repository immutability guidance**, replacing a
   non-mutating destructure with in-place `delete`.

**Required:** revert both hunks to their committed rest-destructuring
form, exactly. The ESLint gate remains **"no candidate-introduced
findings"** (§15) — if reverting reintroduces a pre-existing
`no-unused-vars` warning on `_p`/`_p2`/`_c`/`_c2`, that warning is
**pre-existing and correct**, and must **not** be fixed here.

### 17c. Finding 2 — REJECTED. The dependency must remain.

The reviewer's stated premise is:

> CanvasLines do not determine the Excalidraw frame list.

**This premise is false**, and the memo at `DrawingLayout.tsx:2168-2213`
is not a frame list. It is the **thumbnail invalidation engine**. Inside
it, per frame element:

```
const sig = slideRenderer.getSlideRenderSignature(baseSlide);   // :2181
if (frameSigsRef.current[el.id] !== sig) {
  frameSigsRef.current[el.id] = sig;
  frameVersionsRef.current[el.id] = (frameVersionsRef.current[el.id] ?? 0) + 1;
}
```

The chain that makes `canvasLines` load-bearing:

1. `slideRenderer` is memoized with **`[]` deps** (`:2135-2140`) and reads
   lines through the ref-backed getter `getCanvasLines: () =>
   runtimeCanvasLinesRef.current`. Its identity **never changes** — that
   is the §14e requirement, deliberately.
2. `getSlideRenderSignature` now folds CanvasLine state into the
   signature via `canvasLineSignature`
   (`getSlideRenderSignature.ts:145-152`).
3. A stale-closure-free getter means **nothing else in React can observe
   a CanvasLine change**. The deps array is the only trigger.

So with deps `[elements]`, editing a CanvasLine's colour changes no
Excalidraw element, the memo does not re-run, `sig` is never recomputed,
`contentVersion` never bumps, `frames` keeps its identity, and
`PresentationPanel` (`:3290 slides={frames}`) never re-renders the
thumbnail. **That is precisely the §3 defect** — the thumbnail not
refreshing on a CanvasLine change.

The live matrix corroborates this empirically:
`patch115ThumbnailSignatureChangedAfterStyle: true` was observed **with**
`[elements, canvasLines]` in place. Applying Option A item 2 would
falsify that observation.

The "unnecessary recomputation" cost is also overstated: the memo is
identity-stable by construction — `framesArrayRef.current` is returned
unless `changed`, and each slide object is reused unless its signature or
geometry differs (`:2188-2202`). A CanvasLine change that affects no
slide re-runs the comparison and returns the **same array reference**.

**Ruling:** `[elements, canvasLines]` is **correct, required, and
governed**. It may not be reverted by this patch or by any future
cleanup, refactor, or lint autofix without a fresh governance ruling.

**Required (single line, authorized):** add an explanatory comment
immediately above the deps array so the dependency is not silently
removed later. Mechanism over memory — a rule recorded only in a patch
document does not protect a deps array. Exact text:

```
    // PATCH-115: canvasLines is load-bearing. getSlideRenderSignature folds
    // CanvasLine state in via a []-deps ref-backed getter, so this dep is the
    // only trigger that recomputes renderSignature/contentVersion. Removing it
    // silently stops thumbnails refreshing on CanvasLine edits. Do not remove.
  }, [elements, canvasLines]);
```

**Reviewer note.** The finding was correctly *raised* — an added memo
dependency deserves challenge, and marking it non-blocking was the right
call rather than asserting a change. The characterization was wrong, not
the vigilance. This is the fourth time the hard-stop review protocol has
surfaced a claim that source inspection contradicted (two of them mine,
in §14a).

### 17d. Candidate may NOT be committed yet

Not committed; not staged; no closure. Order of operations:

1. Codex applies the §17e correction instruction.
2. Full re-validation.
3. Focused independent re-review of the three hunks only, by a **different
   reviewer** than the closure reviewer, and not by Codex or the CTO.
4. Then closure is reconsidered.

`.gitignore`, the three `app/api/ai/**` routes, and
`scripts/live-access-login.mjs` remain protected and unstageable
throughout.

### 17e. Exact correction instruction (bind)

> Apply exactly three hunks to the uncommitted PATCH-115 candidate. Read
> PATCH-115 §17 first; it is authoritative over this prompt. Do not
> commit, push, stage, or start a new patch.
>
> **Hunk 1 — `DrawingLayout.tsx:3197-3199`.** Restore
> `const { parentId: _p2, childPadletIds: _c2, ...cleanMeta2 } = c.metadata || {};`
> and delete the three replacement lines.
>
> **Hunk 2 — `DrawingLayout.tsx:3250-3252`.** Restore
> `const { parentId: _p, childPadletIds: _c, ...cleanMeta } = item.metadata || {};`
> and delete the three replacement lines.
>
> **Hunk 3 — `DrawingLayout.tsx:2213`.** **Do NOT change the dependency
> array.** It stays `[elements, canvasLines]`. Add only the four-line
> `// PATCH-115: canvasLines is load-bearing…` comment from §17c
> immediately above it.
>
> Make no other change. Do not fix any ESLint finding that reverting
> reintroduces — the gate is "no candidate-introduced findings", and
> `_p`/`_p2`/`_c`/`_c2` warnings are pre-existing.
>
> Re-run and report actual output: `git diff --check`, `npx tsc --noEmit`,
> full `npx vitest run` (expect 55 files / 592 tests), the focused
> PATCH-115 test file (expect 12 tests), and ESLint under the amended
> gate. Confirm `CanvasClient.tsx` still shows exactly `1 +` and `0 -`,
> and that no protected path moved.
>
> Leave the candidate **uncommitted**.

### 17f. Unchanged by this ruling

All §16 rulings stand: Freeform **NOT EXECUTABLE — NO ACCESSIBLE
PRODUCTION FIXTURE**; Map **NOT EXECUTABLE — NO ACCESSIBLE PRODUCTION
FIXTURE**; PATCH-116 **CANCELLED**; the §16d residual risk carries into
closure verbatim. Drawing live acceptance remains **COMPLETE** — the §17e
correction touches no code path the live matrix exercised, so it does not
invalidate that evidence and no live re-run is required.

**PATCH-115 remains AUTHORIZED and the candidate remains UNCOMMITTED.**
This section does not close the patch.

---

## 18. Reopened closure gate — new user-visible evidence triage (2026-07-27, CTO)

Issued at governance HEAD `c9ee39fd7980d40d6967b4a7acc3c04b2819be7c`. Three
defects were reported from direct user inspection of the candidate. Each
was source-traced before ruling. **Two of the three recommended rulings do
not survive that trace and are not adopted as written.**

### 18a. Live acceptance: REOPENED

The §16e / §17f statement *"Drawing live acceptance remains COMPLETE — no
live re-run required"* is **withdrawn**. It is superseded by this section.

The withdrawal is warranted on its own terms, independent of how the three
defects are classified. The §15f matrix asserted *presence* — "the Arrow
Post is visible in the thumbnail" — and every such assertion passed. It
contained **no assertion of containment** (that nothing paints outside the
slide rect), and **no assertion of completeness** (that every object on
the canvas appears in its thumbnail). A scripted matrix proves the
propositions it encodes and nothing else; the user's eye covered a
proposition the matrix never encoded.

**Standing rule (record in LESSONS_LEARNED):** a live matrix built only
from presence assertions cannot certify a rendering patch. Every future
rendering patch must assert **presence, containment, and completeness** —
"the right thing appears", "nothing appears where it must not", and
"nothing that should appear is missing".

**PATCH-115 remains open, uncommitted, and unclosed.**

### 18b. Defect A — CanvasLine thumbnail overflow: CONDITIONAL BLOCKER, mechanism NOT established

**Ruling: this is a PATCH-115 closure blocker. The recommended
correction is NOT authorized, because the code it would correct is
provably already correct.**

The recommendation was: *"the patch explicitly requires clipping to the
slide viewport; authorise the minimum correction."* Source says the
thumbnail path already clips to the slide viewport, exactly:

1. `renderExcalidrawSlideBase` calls `exportToCanvas` with
   `exportPadding: opts.paddingPx ?? 0` and a `getDimensions` that
   multiplies by `scale`. So
   `nativeBelowCanvas.width = round((slideWidth + 2p) * scale)`, and scene
   point `sx` lands at image `x = (sx - slide.x + p) * scale`.
2. `drawCanvasLinePayloadsToCanvas` sets
   `ctx.rect(padding, padding, width - padding*2, height - padding*2)`
   followed by `ctx.clip()`, where `padding = round(p * scale)`. That
   rect **is** the slide rectangle in image space — not an approximation
   of it.
3. It then applies `translate(padding, padding)` and `scale(scale, scale)`
   before drawing slide-local payload coordinates, so CanvasLine geometry
   is registered to native geometry **exactly**, with no off-by-padding
   error.
4. `mergeSlideLayers` filters null layers (`layers.filter(Boolean)`), so
   the five-layer array introduced by the candidate cannot drop or
   mis-stack a band.
5. The sidebar thumbnail card carries `overflow-hidden`
   (`PresentationPanel.tsx:355`) and `SlideThumbnail` renders a **PNG**
   at fixed width/height. A raster image cannot paint outside its own
   element box.

Points 2 and 5 are independently sufficient: even if the clip were absent,
the PNG could not escape the card. **Authorizing a clipping fix here would
change correct code and leave the real defect in place.** That is the
worse outcome, not the safer one.

**Therefore the mechanism must be identified before any correction is
authorized.** Two hypotheses, in order of source-supported likelihood —
both must be tested, neither may be assumed:

- **H1 (favoured): the overflow is not the thumbnail at all.** It is the
  **live editor** `SimpleLineRenderer` overlay painting the real Arrow
  Post on the Drawing canvas, appearing beside or beneath the
  presentation sidebar. The sidebar is `fixed top-0 right-0 bottom-0 w-80
  z-[500]` (`DrawingLayout.tsx:3288`) and **overlays** the canvas without
  insetting it — the canvas keeps its full width underneath. Under
  PATCH-114 a scene-space line now tracks its true canvas position, so a
  line near the right edge sits in the region the panel covers. If H1
  holds, Defect A is **the same root cause as Defect C** and is a layout
  issue, not a PATCH-115 rendering issue.
- **H2: the fullscreen SVG path.** `renderCanvasLinePayloadsSvg` relies on
  the outer `<svg>` viewport clip, and its label `<foreignObject>`
  carries an explicit `style={{ overflow: "visible" }}`. The outer SVG
  should still clip, but this is the only place in the candidate where
  clipping is implicit rather than explicit, and it is the only surface
  that renders CanvasLines as live DOM.

**Blocker status.** Defect A blocks closure until the mechanism is
identified. If the trace shows H1, Defect A leaves PATCH-115 entirely and
merges into the Defect C patch, and PATCH-115 closure is unblocked by it.
If the trace shows H2 or any third mechanism inside an authorized file,
PATCH-115 is amended narrowly at that point.

**Acceptance criteria (bind, whichever patch ends up owning it):** the
line is clipped entirely inside the slide rectangle; it cannot overlap
thumbnail borders, slide labels, checkboxes, menus, neighbouring previews,
or the outer sidebar; it remains correctly rendered in fullscreen;
front/back z-order remains correct inside the slide; and **no global
z-index escalation may be used to hide the issue** — raising or lowering a
`z-[…]` to make the symptom invisible is explicitly prohibited as a fix.

### 18c. Defect B — missing post content in thumbnails: DIAGNOSIS FIRST, no scope ruling yet

**Ruling: scope deferred pending source trace. Blocks closure until
classified.** It may not be treated as covered merely because the Arrow
Post appears in one thumbnail — that inference is explicitly rejected.

What the trace can already exclude: the candidate's only structural change
to the thumbnail merge is the five-layer array, and `mergeSlideLayers`
filters nulls, so a null CanvasLine band cannot suppress the padlet
overlay or the native above-band. `resolveSlidePadlets` is **not** in the
candidate diff. So a PATCH-115-introduced cause is unlikely but **not
disproven** — `planSlideComposition` and `getSlideRenderSignature` are
both in the candidate and both sit on the path.

**Exact source-trace task (bind).** For each affected slide, produce a
table with one row per object visible inside the frame on the Drawing
canvas, and these columns:

1. slide/frame id, and the object's id and kind (native element / padlet
   embeddable / CanvasLine);
2. does it satisfy the membership rule for its kind — `frameId ===
   slideFrame.id` for natives (`planSlideComposition`), `resolveSlidePadlets`
   for padlets, `resolveCanvasLineSlideMemberships` for lines;
3. does it appear in `compositionPlan` (`nativeBelowElements`,
   `nativeAboveElements`, `resolvedPadlets`, `back`/`frontCanvasLinePayloads`);
4. does it appear in the rendered PNG;
5. if absent, at **which** of those three stages it disappeared.

Then answer two binary questions explicitly:

- **Stale or excluded?** Force a thumbnail regeneration (change the
  frame's geometry, or clear the signature cache) and re-observe. If the
  object appears after regeneration, the defect is **invalidation**; if
  not, it is **membership or composition**.
- **Pre-existing or introduced?** Re-run the identical observation with
  the candidate stashed, at commit `c9ee39f`. If the objects are missing
  there too, PATCH-115 did not introduce it.

**Routing, decided in advance so the result cannot be argued into
PATCH-115:**

- Missing objects reproduce **without** the candidate → **pre-existing
  independent defect**. Bind a **fresh patch**. PATCH-115 is **not**
  broadened, and this defect stops blocking PATCH-115 closure.
- Missing objects reproduce **only with** the candidate → **PATCH-115
  regression**. Amend PATCH-115 narrowly; closure stays blocked.

Do **not** run this trace against a canvas whose state has been altered to
make it reproduce.

### 18d. Defect C — zoom control positioning: SEPARATE PATCH. Confirmed pre-existing.

**Ruling: not in PATCH-115. Not caused by PATCH-115. A fresh patch is
required, and it may not begin until PATCH-115 closes.**

Source-confirmed, not assumed:

- Drawing's zoom controls are portalled into `viewportContainerRef.current`
  with `className="absolute bottom-6 right-6 z-[130] …"`
  (`DrawingLayout.tsx:3085-3094`).
- The presentation sidebar is `fixed top-0 right-0 bottom-0 w-80 z-[500]`
  (`:3288`) and does not inset the canvas.
- `130 < 500` and both are anchored to the same right edge, so the controls
  are occluded whenever the panel is open. The reported symptom follows
  directly.
- `git diff` on `DrawingLayout.tsx` filtered for `zoom|Zoom|w-80|z-\[`
  returns **nothing**. The candidate does not touch either element.

**One correction to the report:** the controls are **not** "centred across
the full browser width" — they are bottom-**right**-anchored, which is why
they collide with a right-edge panel. A fix that centres them in the
remaining canvas area is a design change, not a restoration; a smaller fix
is to reserve the sidebar width on the right offset.

**The correct pattern already exists in this file.** The top-right floating
cluster measures
`presentationSidebarRef.current?.getBoundingClientRect().left ?? (viewportRight - 320)`
(`:872`) and re-solves its offset under both a `MutationObserver` and a
`ResizeObserver` that observes the sidebar itself (`:896-897`). The future
patch should **reuse this mechanism**, not invent a second one — that is
what satisfies the "account for opening/closing and resizing the panel"
requirement, including the panel's absence.

**Do not implement this now.** No patch number is assigned; PATCH-116
remains **cancelled** and its number is not to be reused for this.

### 18e. Allowlist: UNCHANGED

No amendment to the PATCH-115 file scope is authorized by this section.
The allowlist stays exactly as bound in §6, §13 and §14: **10 production
files (cap reached) and 5 test files (1 used, 4 free).** No new production
file may be added for Defect A or Defect B until the corresponding trace
completes and a narrow amendment is issued. Diagnosis in §18b and §18c is
**read-only plus disposable live specs** — it authorizes no product edit.

The five protected unrelated paths remain protected and unstageable.

### 18f. Order of operations (revised)

1. Apply the §17e corrections — still required, unchanged.
2. Run the §18b Defect A surface identification and the §18c Defect B
   source trace. **No product edit.**
3. CTO issues a follow-up ruling routing A and B.
4. Any authorized narrow amendment is implemented.
5. **Full visual live re-run** (see §18g), not the §15f matrix.
6. Focused independent re-review of the §17e hunks **plus** whatever
   step 4 produced, by a reviewer who is neither the closure reviewer,
   nor Codex, nor the CTO.
7. Closure reconsidered.

### 18g. A full visual live re-run IS required

**Yes.** The §15f matrix may not be reused as-is; presence assertions
alone are now known to be insufficient (§18a). The re-run must add:

- **Containment:** for every slide, assert no CanvasLine ink falls outside
  the slide rectangle in the thumbnail, and that the sidebar's controls,
  labels, and neighbouring cards are unobstructed. Capture full-panel
  screenshots, not element-scoped ones — an element-scoped screenshot
  cannot show a defect that consists of painting *outside* that element.
- **Completeness:** for every slide with visible frame content, assert the
  thumbnail is non-blank and object counts match the §18c trace table.
- **Panel-open and panel-closed** states for both.

All standing live rules continue to apply: `PW_BASE_URL` set, `--no-deps`,
no build while the dev server is live, health-probe `/auth` not only `/`,
scratch state outside the repo, no credential ever printed, and full
restoration of real canvas data afterwards.

### 18h. Status

**PATCH-115: AUTHORIZED, OPEN, UNCOMMITTED, NOT CLOSED.** Live acceptance
**REOPENED**. The candidate **must remain uncommitted**. §16's Freeform and
Map **NOT EXECUTABLE** rulings and the §16d residual risk are unchanged.
**PATCH-116 remains CANCELLED.** No new patch may begin.

---

## 19. §18 resolution and final focused re-review authorization (2026-07-27, CTO)

Issued at governance HEAD `3455c55f71fcba75b0637aaca36b131401dab4c5`.
Resolves the three §18 defects and authorizes the final gate before
closure. All claims below were re-derived from the working tree; none
were accepted on report.

### 19a. §17 corrections — independently verified

**VERIFIED.** `git diff` on `DrawingLayout.tsx` now shows **14 changed
lines, all CanvasLine plumbing plus the comment**. Both out-of-scope
hunks are gone from the diff — the file's only remaining changes are the
type import, the prop, the ref, the two ref-backed getters, and the memo
dependency with its four-line explanatory comment. `CanvasClient.tsx`
remains exactly **`1 +` / `0 -`**. Candidate total: 12 modified + 4
untracked, unchanged in shape.

Re-run by the CTO, not quoted from the report:

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → **55 files / 592 tests passed**.
- `git diff --check` → pass.
- ESLint on both corrected files → **4 `no-unused-vars` errors** on
  `_p2`/`_c2`/`_p`/`_c`.

That last result is the expected one and is **explicitly acceptable**.
Verified pre-existing by stashing the candidate and re-running ESLint at
HEAD: the same 4 errors are present without the candidate. Under the §15
gate — *no candidate-introduced findings* — the candidate contributes
**zero**. §17b predicted exactly this and forbade fixing it; that
prohibition stands through closure. **Do not `--fix` these.**

### 19b. Defect A — NOT A PATCH-115 PRODUCT DEFECT

**Bound.** No clipping correction is authorized, and none is needed. The
observed ink was the **editor** surface, not preview content escaping its
bounds.

The diagnosis confirms hypothesis **H1** from §18b, and does so by
elimination rather than assertion: fullscreen was not open and the
runtime CanvasLine SVG was absent, so neither PATCH-115 render path was
even mounted; the topmost sampled element was the editor's
`data-line-role="hit-path"`; hiding the editor line layer removed the
ink, while hiding thumbnail images did not. That is a controlled
substitution test, and it is what makes the ruling safe to bind.

It also independently corroborates §18b's source proof: the thumbnail
image uses `overflow: clip`, the card `overflow: hidden`, and the content
is raster — so it could not have painted outside its element regardless.
The editor SVG, by contrast, spans the canvas with `overflow: visible`,
and the line ended just left of the sidebar boundary. **The line never
left the canvas; the sidebar arrived on top of it.**

This is the same root cause as Defect C — a `fixed` sidebar overlaying a
canvas that is not inset — and it is therefore **routed to the Defect C
patch**, not to PATCH-115. **Defect A no longer blocks closure.**

Recorded so this is not re-litigated: §18b withheld the recommended
clipping correction, and the diagnosis shows that correction would have
modified provably-correct code while leaving an unrelated layout issue in
place. The hard-stop-before-fixing rule earned its keep here.

### 19c. Defect B — PRE-EXISTING. Does not block closure.

**Bound.** Not introduced by PATCH-115. Any improvement requires a fresh
patch with its own diagnosis and scope.

**The load-bearing evidence is the pre-candidate reproduction**, not the
scale explanation: the same tiny/missing-looking thumbnail behavior
reproduced in a temporary worktree at the governed pre-candidate commit
on port 3001 (cleanly isolated from the owner's dev server on 3000, and
cleaned up afterwards). That is the §18c binary question answered
correctly, and it alone settles the routing. The "small thumbnail size and
scale/layout" account is a **plausible explanation, not proof**, and is
recorded as such — it must not be cited by a future patch as a completed
root-cause analysis.

For the objects actually inspected: present in the composition plan where
membership resolved, present in the render payloads, and visible in
regenerated PNGs. Neither stale nor excluded.

**Named residual — do not let this dissolve into "scale".** The
diagnosis reports that *some native embeddable rows remain excluded under
the governed native `frameId` rule while their padlet counterparts
resolve normally*. This is a **distinct, real, pre-existing finding**,
not a rendering-scale artifact. It is consistent with
`planSlideComposition`'s `isNativeFrameMember` requiring
`element.frameId === slideFrame.id` with **no geometric fallback for
natives** — the deliberate narrowing made by PATCH-112. An embeddable
whose native element never received a `frameId` will therefore never
enter a slide, however it looks on canvas.

This residual is **carried forward explicitly** as the seed for the
future thumbnail-completeness patch. It is **out of scope for
PATCH-115**, which may not widen native membership. Do not begin it.

### 19d. Defect C — fresh patch required. CONFIRMED.

Unchanged from §18d and now reinforced, since Defect A shares its root
cause. The future patch must reuse the existing presentation-sidebar
measurement mechanism at `DrawingLayout.tsx:872` and its
`ResizeObserver`/`MutationObserver` wiring — not invent a second one —
and must handle panel open, close, absence, and resize.

**PATCH-116 remains CANCELLED and its number must not be reused for this
or for the Defect B follow-up.** Both future patches take fresh numbers.
Neither may begin until PATCH-115 closes.

### 19e. Drawing live acceptance — REINSTATED, scoped

**Reinstated as COMPLETE for the behavior PATCH-115 owns**: CanvasLine
present in the thumbnail; present in runtime fullscreen; both invalidation
mechanisms working; style, label, geometry, plane, deletion, restoration
and persistence all passing; no preview-driven stored-geometry mutation;
`coord_space` remaining `'scene'`.

This is a **reinstatement on new evidence, not a reversal of §18a**. §18a
withdrew the earlier claim because the matrix asserted only presence. That
criticism was correct and is not retracted. What has changed is that the
§18 diagnosis now **supplies** the missing containment and completeness
classifications — containment by showing no preview content escaped its
element, completeness by showing the shortfall reproduces without the
candidate. The gap was closed by evidence, not by relaxing the standard.

### 19f. Standing rule (record in LESSONS_LEARNED)

> A rendering live gate must separately assert **presence** (the right
> thing appears), **containment** (nothing paints outside its element),
> and **completeness** (nothing that should appear is missing). A gate
> built only from presence assertions cannot certify a rendering patch —
> it will pass while a user sees an obvious defect.

Corollary, from Defect A: when visual ink appears in an unexpected place,
**identify the emitting surface by controlled substitution** (hide one
layer at a time) before attributing it to any renderer. A screenshot shows
*where* ink is, never *who drew it*.

### 19g. Focused re-review — AUTHORIZED, read-only

**Reviewer eligibility (bind):** not Opus (authoring CTO), not Codex
(implementer), not the original full closure reviewer. DeepSeek V4 Pro,
Kepler, or Gemini 3.1 Pro, whichever did not perform the §16/§17 closure
review.

**Scope — strictly limited to these six items. Nothing else may be
re-reviewed, re-litigated, or reopened:**

1. The two restored immutable-destructuring hunks
   (`DrawingLayout.tsx:3201`, `:3252`) match their committed forms
   exactly.
2. The four-line explanatory comment is present above the dependency
   array and states why `canvasLines` is load-bearing.
3. The dependency array remains **`[elements, canvasLines]`** —
   unchanged. Per §17c this is **governed**; a recommendation to remove
   it is out of scope and must not be raised again.
4. Validation reproduces: 55 files / 592 tests; focused file 12 tests;
   `tsc --noEmit` clean; **zero candidate-introduced** ESLint findings
   (the 4 pre-existing `_p`/`_p2`/`_c`/`_c2` errors are expected and
   **must not** be reported as findings or fixed).
5. §18 introduced **no product changes** — the candidate file set is
   unchanged from the §16 review.
6. The candidate remains within the authorized allowlist: **10
   production files** (cap reached, no additions) and **5 test files**
   (1 used). The five protected unrelated paths are not absorbed.

**Read-only.** The reviewer edits nothing, stages nothing, commits
nothing, and runs no live browser session.

**Verdict — exactly one of:**

- `PASS — PATCH-115 CORRECTIONS VERIFIED`
- `PASS WITH FINDINGS`
- `FAIL`

### 19h. No further live run required

**Correct, on the condition that the verdict is PASS.** The §18g full
visual live re-run requirement is **satisfied by the §18 diagnosis**, not
waived — containment and completeness were both classified against real
surfaces. The §17 correction and the comment touch no rendering behavior
and no path the live matrix exercised, so they cannot invalidate it.

On `PASS`: PATCH-115 proceeds directly to candidate commit and governance
closure.
On `PASS WITH FINDINGS` or `FAIL`: return to the CTO for a fresh ruling.
The reviewer may **not** authorize a commit under either of those verdicts.

### 19i. Status

**PATCH-115: AUTHORIZED, OPEN, UNCOMMITTED, NOT CLOSED.** Defects A, B
and C are all routed out of PATCH-115; **no defect now blocks closure**,
which awaits only the §19g verdict. §16's Freeform and Map **NOT
EXECUTABLE** rulings and the §16d residual risk stand unchanged and carry
into closure verbatim. **PATCH-116 remains CANCELLED.** No new patch may
begin.
