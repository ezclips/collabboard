# PATCH-112 — Assign and Narrow Post-Card Frame Membership on Drag Commit

**Purpose:** fix the confirmed root cause of unreliable slide/frame
membership for post-card embeddables — the product's own drag handle
never assigns `element.frameId` on move — by assigning it exactly once,
at drag commit, via one new shared, deterministic membership rule, and
by narrowing the geometric fallback (used only when `frameId` is still
absent) so a one-pixel edge sliver no longer counts as membership. This
is a targeted fix, not a canvas refactor and not a redesign of the
frame/slide concept.

## 0. Root cause — confirmed by direct source trace (bind; supersedes
PATCH-111's "unproven" classification)

PATCH-111 could not prove or disprove, via Playwright, whether manually
dragging a post card into an Excalidraw frame assigns `frameId` (no
stable DOM handle existed to drive Excalidraw's own native canvas drag
deterministically). This patch's authoring turn traced the actual
production source directly and **confirms it does not, structurally,
for the reason below** — this is proven from source, not inferred:

- Every post-card embeddable is created with `frameId: null`,
  hardcoded, in `createEmbeddableElementForPadlet`
  (`components/collabboard/canvas/layouts/DrawingLayout.tsx:1720-1751`,
  the literal field at line 1742).
- The vendored Excalidraw fork **does** have native, automatic
  frame-membership reconciliation on drag: `App.tsx` calls
  `updateFrameMembershipOfSelectedElements` after a native
  pointer-driven element drag completes (`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx:10575`,
  imported at line 187) — **but this only runs inside Excalidraw's own
  internal pointer-down/move/up flow for a natively-selected element.**
- Post-card repositioning in this product **does not use that native
  flow.** The card's own drag-handle strip
  (`DrawingLayout.tsx:372-451`, the `onPointerDown` at line 381) is a
  fully custom, self-contained pointer-capture implementation: it
  captures the pointer directly on a plain DOM `div` (line 396,
  `target.setPointerCapture`), computes new coordinates via the
  hand-rolled `toSceneCoords` (lines 392, 401, 427), and on
  `pointerup` (`handleUp`, lines 422-446) builds
  `updatedSceneEl = { ...sceneEl, x: newX, y: newY }` (line 430) —
  spreading the *existing* element (whose `frameId` is `null` from
  creation, or whatever it already was) and changing only `x`/`y` —
  then calls `excAPI.updateScene(...)` directly (lines 432-439).
  **This never touches Excalidraw's native selection/pointer system at
  all**, so `updateFrameMembershipOfSelectedElements` never runs for
  this drag path, for any post card, ever.

**Consequence, and why the overlap fallback must not simply be
deleted or tightened in isolation:** because post cards are created
with `frameId: null` and the only drag path that ever moves them never
assigns one, **essentially no post-card embeddable in this product
today carries a real, meaningful `frameId`.** `resolveSlidePadlets.ts`'s
geometric overlap fallback is therefore not a rare legacy-compatibility
path — it is, in current practice, **the only mechanism by which any
post card ever becomes a slide/frame member.** A fix that only narrows
or removes that fallback, without also closing the assignment gap,
would silently break existing slide membership for every board in
production. This patch does both halves together, as PATCH-111's own
§5 Findings already anticipated ("make the post-card embeddable
placement/move path assign or clear `element.frameId`... then narrow
`resolveSlidePadlets`... " — this patch executes exactly that plan,
now that the manual-drag question is resolved).

**Status:** AUTHORIZED, NOT STARTED.

**Implementer:** **Codex 5.6 Terra** — the fix spans a live DOM
pointer-capture drag-commit path (`DrawingLayout.tsx`), a new shared
pure utility, and `resolveSlidePadlets.ts`'s consumption of it, plus
updates to both an existing unit-test file and an existing live
Playwright characterization spec whose previously-documented behavior
this patch deliberately changes. This crosses the "materially complex,
multi-layer drag/persistence path" threshold the CTO's own selection
criteria named for escalating past GPT-5.5 — the same architecture
PATCH-111 itself was escalated for, now being modified rather than
only read. Sol is not required — no new Windows git/process/path
architecture is involved. **Reviewer:** independent read-only reviewer
(DeepSeek V4 Pro primary, Kepler or Gemini 3.1 Pro fallback) — PASS
required before commit. Sonnet (CTO/governance owner)
authored/authorized this patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — not whatever static value appears in this file, per this
session's now-standard pattern.

**Bound implementation commit message (verbatim):**
`fix(presentation): assign frame membership on post-card drag commit and narrow the geometric fallback (PATCH-112)`

---

## 1. Ruling on the six required categories (bind — exact expected
behavior)

- **A — explicit valid `frameId`:** authoritative, unconditionally.
  Unchanged by this patch. Protected by existing
  `presentationBridge.test.ts` cases plus new ones in §4.
- **B — missing `frameId`:** after this patch, any post card whose
  drag is *completed* (pointer-up, not intermediate move frames) has
  its `frameId` explicitly computed and assigned by the same shared
  rule used for rendering (§2) — closing the root-cause gap going
  forward. A post card that is never dragged after this patch lands
  (an existing, at-rest legacy record) remains governed by the
  narrowed fallback rule (§2) until it is next moved.
- **C — stale or invalid `frameId`** (set, but not equal to the frame
  currently being resolved — including a reference to a frame that no
  longer exists): excluded from that frame; **never** falls back to
  geometric overlap merely because the id happens to be wrong or
  stale — presence of *any* `frameId` value fully disables the
  fallback, exactly as today. Unchanged; protected by existing +
  new tests.
- **D/E/F/G — overlap / edge-touch / partial-cross / full-containment,
  only reached when `frameId` is absent:** governed by one new,
  deterministic rule (§2) — **the element's center point must lie
  strictly within the frame's bounds.** Full containment (G) ⇒ center
  obviously inside ⇒ included. Fully outside (no overlap) ⇒ center
  outside ⇒ excluded (unchanged from today). Edge-touching (E, zero
  -width contact) ⇒ excluded (consistent with today's strict-inequality
  exclusion). Partial crossing (F) ⇒ included only if the center
  happens to fall on the inside portion, excluded otherwise — this is
  the behavior change: a card that is 95% outside the frame with only a
  one-pixel sliver inside (today: included) will, after this patch, be
  excluded, because its center point is outside.

## 2. New shared membership utility (bind — single canonical rule,
used by both the render path and the drag-commit path, so the two
never diverge)

New file `lib/infra/drawing/frameMembership.ts`:

```ts
export interface FrameLikeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameCandidate extends FrameLikeBounds {
  readonly id: string;
}

export interface ElementFrameState extends FrameLikeBounds {
  readonly frameId: string | null | undefined;
}

export interface FrameMembershipResult {
  readonly frameId: string | null; // the resolved membership: an explicit match, a fallback match, or null
  readonly viaFallback: boolean; // true only when frameId was absent AND a fallback match was found
}

/**
 * Single canonical membership rule, shared by rendering
 * (resolveSlidePadlets) and drag-commit assignment (DrawingLayout).
 * Explicit frameId (even if stale/non-matching) is always authoritative
 * and short-circuits the fallback entirely. The fallback (only reached
 * when frameId is null/undefined) requires the element's center point
 * to lie strictly within a candidate frame's bounds — a one-pixel edge
 * sliver is never sufficient.
 */
export function resolveFrameMembership(
  element: ElementFrameState,
  frames: readonly FrameCandidate[],
): FrameMembershipResult;
```

**Bound semantics:**
- If `element.frameId` is present (non-null, non-undefined): resolved
  `frameId` is `element.frameId` itself, `viaFallback: false` —
  **the caller is responsible for then checking equality against the
  specific frame it cares about** (this function does not filter to
  "does this match frame X," it resolves what the element's effective
  membership *is*; `resolveSlidePadlets.ts`'s existing per-frame
  equality check against `slideFrame.id` is preserved as the caller
  -side comparison, this function only replaces the fallback
  computation, not the existing explicit-match comparison).
- If `element.frameId` is absent: compute
  `centerX = element.x + element.width / 2`,
  `centerY = element.y + element.height / 2`; find the first frame in
  `frames` (in array order — document this as the deterministic
  tie-break for overlapping frames, matching how multi-frame ambiguity
  is already handled today) whose bounds strictly contain the center
  point (`frame.x < centerX < frame.x + frame.width` and equivalent for
  Y); return that frame's `id` with `viaFallback: true`, or `null` with
  `viaFallback: false` if none match.
- Pure function. No I/O, no mutation of its inputs, no dependency on
  React/Excalidraw/DOM APIs — testable in complete isolation.

## 3. Production changes (bind — the only two files under
investigation this patch is authorized to modify)

- **`components/presentation/slide-renderer/resolveSlidePadlets.ts`**:
  replace the inline `overlapsFrame`/`inFrame` computation (current
  lines 29-34, cited in PATCH-111 §1) with a call to
  `resolveFrameMembership`, then compare its result's `frameId` against
  `slideFrame.id` exactly as the existing code already does for the
  explicit-match case. `localX`/`localY` computation is unchanged. No
  other line in this file changes.
- **`components/collabboard/canvas/layouts/DrawingLayout.tsx`**: in the
  post-card drag handle's `handleUp` **only** (lines 422-446 — never
  `handleMove`, lines 398-420, which must continue to update position
  live without touching `frameId`, preserving today's exact live-drag
  visual behavior), after computing final `newX`/`newY` and before
  building `updatedSceneEl`: call `resolveFrameMembership` with the
  post card's final bounds against the current scene's `frame`-typed
  elements, and include the resolved `frameId` (or `null`) in
  `updatedSceneEl` alongside the existing `x`/`y` change. No other
  handler, no other drag path, no other line in this file changes —
  in particular, `handleMove`'s per-frame `updateScene` calls
  (`commitToHistory: false`) remain exactly as they are today; only
  the final `commitToHistory: true` write in `handleUp` gains the
  `frameId` field.

No other product file is modified. Post-card embeddable *creation*
(`createEmbeddableElementForPadlet`, still hardcoding `frameId: null`)
is intentionally **not** changed by this patch — a newly-created post
card dropped directly inside a frame's bounds will still rely on the
narrowed fallback until its first drag-commit; this is a deliberate,
narrow scope boundary, not an oversight, and may be a candidate for a
future, separately-authorized patch if it proves to matter in
practice.

## 4. Required tests (bind)

### 4a. New unit tests, `lib/infra/drawing/frameMembership.test.ts`
(new file, mirrors this repo's existing pure-function test
conventions):
1. `frameId` present, matches a candidate frame → returned as-is,
   `viaFallback:false`.
2. `frameId` present, does **not** match any candidate frame (stale/
   invalid) → returned as-is (the stale value), `viaFallback:false` —
   the caller's equality check against a specific frame will then
   correctly exclude it; this function must not "helpfully" fall back
   to geometry just because the stale id didn't resolve.
3. `frameId` absent, element fully inside a frame → that frame's id,
   `viaFallback:true`.
4. `frameId` absent, element fully outside all frames → `null`,
   `viaFallback:false`.
5. `frameId` absent, element's center exactly on a frame boundary line
   → excluded (strict inequality), matching today's edge-touch
   exclusion direction.
6. `frameId` absent, element 95% outside / 5% inside a frame (center
   point outside) → `null` — the exact behavior-narrowing case this
   patch exists to fix.
7. `frameId` absent, element 55% inside / 45% outside a frame (center
   point inside) → that frame's id.
8. `frameId` absent, element's center point falls inside two
   overlapping frames' bounds simultaneously → the first frame in
   array order wins, deterministically (documents and tests the
   tie-break rule explicitly).
9. Pure-function contract: calling twice with identical inputs returns
   identical results; inputs are not mutated.

### 4b. Updated unit tests, `lib/infra/drawing/presentationBridge.test.ts`
(extend the existing file from PATCH-111; do not delete or weaken any
currently-passing case for a reason other than this patch's own
intentional behavior change):
- The PATCH-111 characterization case documenting "no `frameId`, 1
  -pixel sliver overlap → included" must be **updated** (not deleted)
  to reflect the new, intentionally narrower behavior — document in
  the test's own description why it changed (cite this patch).
- All other existing cases (valid `frameId`, stale/different
  `frameId`, native-element asymmetry, diagnostic emission for the
  fallback path) must remain green, asserting the same outcomes as
  before, now backed by `resolveFrameMembership` instead of inline
  logic.
- Add one new case: an embeddable dragged and committed by the fixed
  `handleUp` path (simulated at the `resolveSlidePadlets` boundary,
  not required to re-drive the full DOM drag) with a freshly-assigned
  `frameId` resolves identically to the explicit-`frameId` case (A),
  proving the render path trusts drag-assigned membership the same way
  it trusts any other explicit `frameId`.

### 4b-1. Amendment — one additional stale test exposed by the full
`npx vitest run` gate (bind — added 2026-07-24, after the candidate
above was otherwise complete and passing focused tests)

`lib/infra/drawing/bridge.test.ts`'s `T19 matches resolveSlidePadlets
inclusion across the shared fixture matrix` fails under the full
suite. **Root cause, confirmed by direct trace (not assumed from the
failure message alone):** T19 does not contain a hardcoded expected
array — it computes `liveIds` from the real, now-fixed
`resolveSlidePadlets` and `helperIds` from `isEmbeddableInSlideFrame`,
a **separate, third production implementation** of frame-membership
logic exported from `lib/infra/drawing/bridge.ts` (line 178) — a
diagnostic/summary module (`summarizeDrawingBridgeSnapshot` et al.)
that this patch's scope never touched and was never asked to touch.
`isEmbeddableInSlideFrame` still implements the old any-overlap rule
verbatim and is not itself part of the live rendering/persistence
path — confirmed by repo-wide grep: its only consumers are its own
defining file and `bridge.test.ts`; no `app/`, `components/`, or other
`lib/` file imports it. **This is not a live production
inconsistency** — it is a dormant, currently-unused diagnostic helper
that happens to still encode the old rule, exposed only because T19
cross-checks it against the real, fixed path. Separately, T19's
`elements` fixture contains no `type: "frame"` scene element at all,
so `resolveSlidePadlets`'s (correct, intentional) derivation of
candidate frames by scanning `sceneElements` for `type === "frame"`
finds zero candidates regardless of the center-point-vs-any-overlap
policy change — meaning this specific fixture would exclude "overlap"
under the fixed code for this reason too. Both explanations agree on
the outcome; the fix does not need to adjudicate between them.

**Authorized fix (bind — the only change to `bridge.test.ts`):**
change T19's assertion from a cross-check against the now-stale
`isEmbeddableInSlideFrame` helper into a direct assertion against the
correct, intentional post-PATCH-112 result:
```ts
expect(liveIds).toEqual(["match"]);
```
(replacing `expect(helperIds).toEqual(liveIds)`). If the implementer
judges it clearer to retain the `helperIds` computation alongside a
comment explaining why it is no longer asserted against, that is
acceptable; removing the now-unused `helperIds` computation entirely
is also acceptable. **No line in `lib/infra/drawing/bridge.ts` changes
under this amendment** — `isEmbeddableInSlideFrame` is left exactly as
it is; reconciling it with `resolveFrameMembership` (it currently is
not consulted by any live code path, so this is a cleanup opportunity,
not a defect) is explicitly deferred to a future, separately
-authorized patch, not folded into PATCH-112. T16, T17, T18, and every
other test in `bridge.test.ts` are unaffected and must remain
unchanged and green.

### 4c. Live Playwright characterization, extend
`e2e/characterization/drawing-slide-frame-membership.spec.ts`:
- **This drag path is drivable, unlike PATCH-111's native-Excalidraw
  -drag attempt** — the post card's drag handle is a plain DOM element
  with its own `onPointerDown`/`pointermove`/`pointerup` handlers (§0),
  not Excalidraw's internal canvas hit-testing, so Playwright's mouse
  /pointer simulation can target the handle's real bounding box
  directly. Add a scenario: drag a post card (via its drag-handle
  strip) so it ends fully inside a frame with no prior `frameId` —
  after drag completes, confirm (via the persisted/reloaded model,
  matching this spec's existing persistence-check pattern) that
  `frameId` is now set to that frame's id. Add a second scenario:
  drag a card so it ends with only a one-pixel-class sliver overlap —
  confirm it is **not** assigned that frame's id and is **not**
  rendered as a member in the presentation preview.
- Skips cleanly without credentials, matching this repo's standing
  convention and this spec's own existing skip behavior.
- All PATCH-111 scenarios already in this spec must remain green,
  updated only where their asserted outcome is this patch's own
  intentional change (the sliver-overlap case).

## 5. Exact file scope (bind)

**New files (2):**
1. `lib/infra/drawing/frameMembership.ts`
2. `lib/infra/drawing/frameMembership.test.ts`

**Modified files (4):**
1. `components/presentation/slide-renderer/resolveSlidePadlets.ts` —
   replace inline fallback logic with a call to
   `resolveFrameMembership`; no other change.
2. `components/collabboard/canvas/layouts/DrawingLayout.tsx` —
   `handleUp` only, assign `frameId` on drag commit; no other change.
3. `lib/infra/drawing/presentationBridge.test.ts` — update the one
   sliver-overlap case per §4b; add the one new drag-assigned case;
   no other change.
4. `e2e/characterization/drawing-slide-frame-membership.spec.ts` — add
   the two new drag scenarios per §4c; update only the one scenario
   whose asserted outcome this patch intentionally changes.
5. `lib/infra/drawing/bridge.test.ts` — **(added by the 2026-07-24
   amendment, §4b-1)** update T19's assertion only, exactly as bound
   in §4b-1 (replace the stale cross-check with a direct assertion
   against the corrected `liveIds`); no other test in this file
   changes; no line in the sibling production file
   `lib/infra/drawing/bridge.ts` changes.

**Prohibited paths (must NOT change):** `planSlideComposition.ts`
(native-element membership is explicitly out of scope — no fallback
existed there and none is added), `RuntimeSlideRenderer.tsx`,
`RuntimePadletLayer.tsx`, `createSlideRenderer.tsx`,
`expandRuntimeContainerItems.ts`, any other function in
`DrawingLayout.tsx` besides the one `handleUp` closure named above
(in particular, `handleMove`, embeddable creation
(`createEmbeddableElementForPadlet`), frame lifecycle handlers, and
every other drag/drop path in the file), `lib/infra/drawing/bridge.ts`
(the production file `isEmbeddableInSlideFrame` lives in — only its
*test* file may change, per §4b-1), `FreeformPadletCards.tsx`,
`components/collabboard/canvas/excalidraw_fork/**`, and every
`scripts/harness/**` file (this is a product patch — no infrastructure
file may be touched).

**Expected file count:** 2 new, 5 modified, 0 deleted.

**Dependency choices:** zero new dependencies — pure TypeScript
functions and existing test tooling only.

## 6. Validation matrix (bind)

1. `npx vitest run lib/infra/drawing/frameMembership.test.ts` — all
   new cases green.
2. `npx vitest run lib/infra/drawing/presentationBridge.test.ts` — all
   cases green, including the one intentionally-updated case and the
   one new drag-assigned case.
3. Full `npx vitest run` — must remain at or above the pre-patch
   baseline, never shrinking or newly failing elsewhere. This must
   include `lib/infra/drawing/bridge.test.ts` passing in full
   (specifically T19, per the §4b-1 amendment) — the full-suite gate
   is not satisfied while T19 fails.
4. The extended Playwright spec (§4c), run against a live dev server
   (`PW_BASE_URL=http://localhost:3000`, never built under a running
   dev server) — skips cleanly without credentials; with credentials,
   both new drag scenarios pass and all retained PATCH-111 scenarios
   still pass.
5. `npx tsc --noEmit` — clean.
6. `npm run check:boundaries` — clean, no-op confirmation.
7. `npm run verify` — full green.
8. Manual confirmation (documented in the implementer's report, not a
   new automated gate): dragging a post card fully within the canvas
   but not near any frame still behaves identically to today (no
   `frameId` assigned when no frame is a candidate; `handleMove`'s live
   visual feedback is pixel-identical to pre-patch, since only
   `handleUp` changed).
9. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
   3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after all
gates pass — report results and await explicit commit authorization
from the CTO.

## 7. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §5's exact list is
touched; `handleMove` (as opposed to `handleUp`) is modified in any
way; post-card *creation* (`createEmbeddableElementForPadlet`,
`insertPadletEmbeddable`) is modified; `planSlideComposition.ts` gains
a geometric fallback it didn't have before; any rendering file
(`RuntimeSlideRenderer.tsx`, `RuntimePadletLayer.tsx`,
`createSlideRenderer.tsx`, `expandRuntimeContainerItems.ts`) is
touched; posts are converted into native Excalidraw elements; the
canvas is refactored beyond the two named production changes; any
existing test is weakened or deleted rather than intentionally,
documentedly updated for this patch's own behavior change; a new
dependency is added; `FreeformPadletCards.tsx` or any
`excalidraw_fork/**` file is touched; any `scripts/harness/**` file is
touched; `lib/infra/drawing/bridge.ts` (the production file) is
modified in any way, including to "fix" `isEmbeddableInSlideFrame` —
that reconciliation is explicitly deferred to a future, separate
patch (§4b-1); any test in `bridge.test.ts` other than T19's assertion
is changed; any required gate in §6 fails or is skipped; the candidate
is committed without explicit CTO authorization.

## 8. Health ledger

Not applicable to a product patch.

**Do not authorize PATCH-113.**
