# PATCH-115 — Render Drawing CanvasLines and Reliably Refresh Slider Previews

**Status:** **BLOCKED — DESIGN BOUND, IMPLEMENTATION NOT AUTHORIZED.**

Two gates must clear before this becomes implementable:

1. **PATCH-114 must be closed by the CTO after independent review.** This
   patch's membership rule operates on scene-space geometry that does not
   exist until PATCH-114 lands.
2. **The §3 invalidation trace and the §5 Drawing-toolbar census must be
   completed and accepted.** Problem 2's mechanism is not yet
   source-proven, and binding a fix to an unproven cause is exactly the
   error PATCH-106/107 were corrected for.

Everything in §1, §2, §4 and §6 is **bound now** and must not be
re-litigated during implementation. §3 and §5 are the investigation
deliverables that unblock it.

---

## 0. Confirmed problem statement

**Problem 1 — Arrow Post absent from both slider surfaces.** Source-proven
and live-confirmed this session. `CanvasLine` data reaches **none** of:

- `components/presentation/slide-renderer/planSlideComposition.ts`
- `components/presentation/slide-renderer/createSlideRenderer.tsx`
- `components/presentation/slide-renderer/getSlideRenderSignature.ts`
- the runtime/fullscreen presentation path
- thumbnail generation

Verified by grep: no file under `components/presentation/**` references
`CanvasLine`, `canvas_lines`, or the `lines` state at all. The pipeline
reads only native Excalidraw scene elements and padlet embeddables. This
is a **categorical omission**, not a membership-resolution defect.

Live evidence: the repro arrow renders visibly inside the Slide 4 frame
on the Drawing canvas, while Slide 4's fully-generated thumbnail shows
only its Photo Card — the arrow is entirely absent from the preview.

**Problem 2 — Drawing slider previews do not reliably refresh.** Reported
by the user; **mechanism not yet proven.** See §3.

**Problem 3 — other Drawing-toolbar object families.** Support status
unknown; must not be inferred from on-canvas visibility. See §5.

## 1. Membership rule (bind — fail-closed, deterministic, no duplicated formula)

`CanvasLine` slide membership reuses **`resolveFrameMembership` from
`lib/infra/drawing/frameMembership.ts` unmodified** (PATCH-112's canonical
rule). The line is adapted to that function's `ElementFrameState` shape:

- `frameId: null` — always, because `CanvasLine` has no frame column.
  This forces the geometric branch every time.
- `x` / `y` / `width` / `height` — the **axis-aligned bounding box of the
  line's normalized scene-space geometry**, computed from `points[]` when
  present, else from the legacy `start`/`control`/`end` triple. This
  mirrors the existing `getBoundingBox` logic in
  `SimpleLineRenderer.tsx:163-190` but **without** its ±10 visual padding —
  padding is a selection affordance and must not widen membership.

Adding a caller does not change the function's behavior for existing
callers. **PATCH-111's native `frameId`-only ruling and PATCH-112's
embeddable ruling remain untouched.** No amendment to either is required.

### Explicit rulings (bind)

| Case | Ruling |
|---|---|
| Both endpoints inside | Included — but *because* the center is inside, not as its own criterion |
| Bounding-box center inside (strict) | **This is the rule.** Included |
| Center outside, path crosses the frame | **Excluded** (fail-closed) |
| Path intersection alone | Never sufficient |
| Edge-touch / zero-width contact | **Excluded** (strict inequality, consistent with PATCH-112) |
| Clipping | Never a membership criterion; a member is clipped to frame bounds when drawn, per §2 |
| Overlapping frames | First match in **scene-array order** — same deterministic tie-break `resolveSlidePadlets` already uses |
| One line in multiple slides | **Forbidden.** At most one slide per line |

Rationale for fail-closed: a long arrow spanning several slides must not
silently appear in all of them. Excluding an ambiguous line is a visible,
reportable outcome; duplicating it across slides is a silent corruption.

## 2. Visual parity and z-order (bind)

### 2a. Static primitive — not the interactive renderer

A **new** presentation-only module produces a static visual from a
`CanvasLine` plus a scene→slide-local transform. **`SimpleLineRenderer`
must not be used, imported, or mounted in presentation mode** — it owns
pointer capture, selection state, drag effects, hover chrome, and dev
diagnostics, none of which may leak into a rendered slide.

Thumbnail and fullscreen/runtime **must consume the same primitive.** Two
drawing implementations is a hard stop.

### 2b. Preserved attributes (bind — all required)

Line path (including multi-point Catmull-Rom curve geometry), start
arrowhead, end arrowhead, stroke color, stroke width, dashed style,
label text, label position (`label_position` along the path), label text
color, label background color, `layer_plane`, and deterministic
`z_index` ordering within a plane.

The curve maths must match `getCurvePath`'s output
(`SimpleLineRenderer.tsx:67-89`) so a slide and the canvas do not draw
visibly different curves. Extract or mirror it — do not re-derive it by
eye.

### 2c. Presentation order (bind — exact, top of list drawn first)

1. slide background
2. native Excalidraw **below**-band (`nativeBelowElements`)
3. **back-plane CanvasLines** (`layer_plane === 'back'`)
4. padlet / card overlay layer
5. **front-plane CanvasLines** (`layer_plane === 'front'`)
6. native Excalidraw **above**-band (`nativeAboveElements`)

This matches the live canvas, where the back-plane line layer sits at
wrapper `zIndex: 0` beneath padlets and the front-plane layer at
`zIndex: 500` above them (`CanvasClient.tsx:6319`, `:7145`).

## 3. Investigation deliverable — invalidation trace (gate; must complete
before implementation)

`getSlideRenderSignature` currently derives its native section from
`sceneElements.filter(el => !el.isDeleted && el.frameId === slideFrame.id)`
(`getSlideRenderSignature.ts:108-116`) and its embeddable section from
`resolvedPadlets`. **A `CanvasLine` change cannot alter that signature at
all**, so a cached thumbnail can never invalidate on a line edit — that
much is already proven and is a genuine sub-cause of Problem 2.

What is **not** yet proven, and must be traced from source before this
patch is bound for implementation:

- whether thumbnail regeneration, fullscreen/runtime state, or both fail
  to refresh;
- which of these actually invalidate today: object creation, movement
  within a frame, movement into a frame, movement out of a frame,
  editing, resizing, deletion, duplication, reordering,
  connect/disconnect, and frame-membership change;
- whether the two preview surfaces read the same board state or diverge;
- whether any path relies on `updated_at` alone.

**Bound requirement regardless of what the trace finds:** the render
signature must contain **actual semantic and render inputs**, never
`updated_at` alone, and both preview surfaces must derive from the same
current board state. For CanvasLines the signature must include geometry,
resolved membership, arrowheads, stroke style, dashed flag, label fields,
`layer_plane`, `z_index`, and `coord_space`.

## 4. Anticipated file boundary (indicative until §3 completes)

Likely production files:

- `components/presentation/slide-renderer/planSlideComposition.ts` — add resolved CanvasLine bands
- `components/presentation/slide-renderer/getSlideRenderSignature.ts` — add the CanvasLine signature section
- `components/presentation/slide-renderer/createSlideRenderer.tsx` — draw the new bands in §2c order
- `components/presentation/slide-renderer/types.ts` — plan/type additions
- a **new** `components/presentation/slide-renderer/` module for the static line primitive
- a **new** shared CanvasLine→membership adapter under `lib/infra/drawing/`
- whichever component supplies `lines` to the presentation entry point (to be named exactly by the §3 trace)

Prohibited: the Excalidraw fork; `frameMembership.ts`;
`SimpleLineRenderer.tsx` (read-only reference only); Freeform and Map
components; the five unrelated worktree paths.

The exact allowed/prohibited lists become binding only when this patch is
promoted to AUTHORIZED.

## 5. Investigation deliverable — Drawing-toolbar census (gate)

Produce an authoritative census of **every** object creatable from the
main left toolbar while in Drawing mode. Do not infer support from
on-canvas visibility; **require rendered thumbnail and fullscreen
evidence per family.**

Record per item: visible name · creation action · domain/object type ·
persistence source · coordinate model · live canvas renderer · slide
composition path · thumbnail support · fullscreen support · invalidation
support · save/reload behavior · status
(`fully supported` / `partially supported` / `missing` / `unresolved`).

Families to verify when present: text · image/photo · video/media ·
link/embed · note/comment card · container/frame · shapes · free drawing ·
native arrows/lines · CanvasLine / Arrow Post · file/document posts ·
AI-created posts · any other custom toolbar post.

Known going in: at least three distinct coordinate/persistence models
coexist — native Excalidraw scene elements, padlet embeddables
(`padlet://` links), and `CanvasLine` rows. Do not assume a fourth does
not exist.

**PATCH-116 is reserved but deliberately not created.** Whether a
follow-up patch is needed, and its boundary, is decided by this census.
Any missing family is either folded into this patch — only if it uses the
identical proven integration path and stays inside a narrow file boundary —
or bound separately as PATCH-116.

## 6. Test contract (bind — helper-only tests are insufficient)

### 6a. CanvasLine presentation (live/rendered evidence required)

The actual toolbar-created double-arrow, visible in **thumbnail** and in
**fullscreen**, with correct arrowheads, curve, dashed style, label,
front/back z-order, and clipping; correct frame membership; correct
behavior when moved into and out of a frame; correct after save/reload;
and **thumbnail/runtime parity** (same visual from the same state).

### 6b. Invalidation

Creating a post inside a frame updates the thumbnail; creating a post
inside a frame updates an **already-open** runtime preview; moving a post
in; moving a post out; deleting; resizing/editing; editing CanvasLine
geometry and style; and **no stale cached thumbnail** in any of these.

### 6c. Regression

PATCH-111 behavior green. PATCH-112 behavior green. Full Vitest suite
green (552 pre-existing tests plus additions). Freeform and Map
non-regression.

### 6d. Census

At least one rendered test per distinct Drawing-toolbar object family.

## 7. Hard stops (bind)

1. No Excalidraw-fork modification.
2. No modification of `frameMembership.ts` — reuse only.
3. No duplicated membership formula anywhere in the diff.
4. No raw (unnormalized) coordinate comparison — PATCH-114's scene space
   is mandatory input.
5. `SimpleLineRenderer` must not be mounted in presentation mode.
6. No divergence between thumbnail and fullscreen visuals.
7. No `updated_at`-only invalidation.
8. Do not start implementation while either §3 or §5 is incomplete, or
   before PATCH-114 is closed.

## 8. Model assignment (bind)

- **Investigation (§3, §5):** may be delegated to a research/Explore
  agent or to GPT-5.5; findings are recorded in this document by the CTO.
- **Implementer:** GPT-5.5 / Codex 5.6.
- **Independent reviewer:** DeepSeek V4 Pro (primary), or Kepler /
  Gemini 3.1 Pro.
- Never the authoring CTO as implementer or as reviewer of its own
  authored work.

## 9. Bound commit message (exact, for the eventual implementation)

```
fix(presentation): render Drawing CanvasLines in slider previews and fix preview invalidation (PATCH-115)
```

**Do not begin PATCH-116. Do not begin this patch's implementation until
PATCH-114 is closed and §3 and §5 are accepted by the CTO.**
