# PATCH-111 — Drawing Canvas Frame (Slide) Membership and Clipping Characterization

**Purpose:** investigate and characterize — with reproducible tests,
not a fix — how post cards (and other non-Excalidraw DOM objects) are
placed relative to a drawing-canvas "slider"/frame (Excalidraw's
native frame element, wrapped by this app's `FrameSlide` concept for
presentation/slides), across the scene/frame-local/preview-scaled/DOM
coordinate systems already in use, with particular focus on an
existing, already-instrumented ambiguity: geometric bounds-overlap
fallback membership for embeddables lacking an explicit `frameId`.

**This is investigation/characterization only.** No product behavior
changes are authorized in this patch unless the investigation proves
one single, narrowly-scoped, safe defect fix — and even then, that fix
must be proposed back to the CTO with an exact diff for explicit
separate authorization before being applied; it is never applied
unilaterally inside this patch. Do not refactor the canvas, redesign
the frame/slide concept, combine this with any other canvas issue, or
touch the unrelated `FreeformPadletCards.tsx` canvas stack (confirmed
by direct investigation to have no frame concept at all — a different
system).

**Status:** **DONE.** Landed commit
`c41e19a6a011eaa73fdb9b96b666f5ec52ecbb3d` (exact bound message,
below). Independent review PASS. See closure section at the end of
this document for the full record.

**Implementer:** **Codex 5.6 Terra** — not GPT-5.5's default for pure
investigation, because direct inspection of this codebase found the
relevant architecture materially complex: a 3,314-line
`DrawingLayout.tsx` frame-lifecycle owner, four distinct coordinate
systems in simultaneous use (Excalidraw scene coordinates, frame-local
coordinates, a preview object-fit-contain scale transform, and a
hand-rolled pointer→scene transform independent of Excalidraw's own
exported utilities), and an already-instrumented diagnostic
(`slide-embeddable-overlap-fallback`) signaling a known, live
ambiguity in production code. This crosses the "materially complex
canvas architecture" threshold the CTO's own selection criteria named
for preferring Terra over GPT-5.5. Sol is not required — this is
characterization of existing React/TypeScript/Excalidraw application
code, not new Windows git/process/path architecture. **Reviewer:**
independent read-only reviewer (DeepSeek V4 Pro primary, Kepler or
Gemini 3.1 Pro fallback) — PASS required before commit. Sonnet
(CTO/governance owner) authored/authorized this patch and must NOT
perform its review. **Authored:** Sonnet (CTO), 2026-07-24.

**Base commit (bind — implementation must start here):** state your
current `git rev-parse HEAD`/`origin/main` before starting and confirm
it against the value given in the CTO's continuation prompt for this
turn — not whatever static value appears in this file, per this
session's now-standard pattern (a governance-authoring commit
necessarily advances `main` by one commit after this text is written).

**Bound investigation commit message (verbatim, for the
test/characterization commit only):**
`test(presentation): characterize frame-membership and clipping behavior for post cards (PATCH-111)`

---

## 1. What direct investigation already found (bind — read before
re-deriving any of this; do not re-investigate what's already
established here, only verify and extend)

- **No component literally named "slider" exists.** The "bounded
  preview window" is Excalidraw's native `frame` element type, wrapped
  by this app's `FrameSlide` domain type
  (`components/presentation/PresentationPanel.tsx:12-24`) for a
  presentation/slides feature layered on the Excalidraw-based drawing
  canvas. This is unrelated to `components/canvas/` (a different,
  scheduler/wall canvas stack with no frame concept) and unrelated to
  `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (a
  separate, non-Excalidraw zoomable canvas with no frame concept —
  confirmed, out of scope for this patch).
- **Frame/slide lifecycle owner:** `components/collabboard/canvas/layouts/DrawingLayout.tsx`
  — `buildActiveFrameNameSignature` (152-160),
  `frameVersionsRef`/`frameSigsRef`/`framesArrayRef`/`framesObjectsRef`
  (688-692), `handleDuplicateSlide` (1579-1612), `handleRemoveSlide`
  (1614-1623), `handleRenameSlide` (1625-1631), `handleArrangeLayout`
  (1633-1679), `handleStartPresentation` (1681-1686). Also owns the
  embeddable drag/drop hand-rolled scene-coordinate transform
  `toSceneCoords` (209-224), independent of Excalidraw's own exported
  `viewportCoordsToSceneCoords`/`sceneCoordsToViewportCoords` (which
  this app never imports or uses anywhere outside the vendored fork
  itself — confirmed by repo-wide grep).
- **Membership resolution — the core characterization target:**
  `components/presentation/slide-renderer/resolveSlidePadlets.ts:16-42`:
  ```ts
  // padlet.type !== "drawing" && element.link?.startsWith("padlet://") required to match at all
  const overlapsFrame =
    element.x < frameRight && elementRight > slideFrame.x &&
    element.y < frameBottom && elementBottom > slideFrame.y;
  const inFrame = element.frameId ? element.frameId === slideFrame.id : overlapsFrame;
  const localX = element.x - slideFrame.x;
  const localY = element.y - slideFrame.y;
  ```
  Priority order: an explicit `element.frameId` match wins outright
  (exact ID equality, no geometry); **only when `frameId` is absent**
  does membership fall back to **any bounding-rect overlap** (not
  containment — a 1% sliver overlap counts the same as full
  containment). `components/presentation/slide-renderer/planSlideComposition.ts:8-15`
  (`isNativeFrameMember`) applies the same `frameId` check for native
  (non-embeddable) frame children but has **no geometric fallback** —
  an asymmetry between embeddable and native-element membership rules
  that is itself a characterization target (§3, test 10).
- **This exact ambiguity is already instrumented in production**:
  `lib/infra/drawing/presentationBridge.ts` defines and emits a
  `"slide-embeddable-overlap-fallback"` diagnostic (line 11, emitted
  246-257) specifically when an embeddable lacks `frameId` and
  membership had to be geometrically inferred — a strong signal this
  is a known, live risk, not a hypothetical one this patch is
  inventing.
- **Clipping is purely CSS, never computed.** Both the live runtime
  layer (`components/presentation/runtime-slide/RuntimeSlideRenderer.tsx:163`,
  `RuntimePadletLayer.tsx:29`) and the static export layer
  (`components/presentation/slide-renderer/createSlideRenderer.tsx:69-76,128-131`)
  rely solely on a parent `overflow: hidden` container. No code
  computes partial-vs-full visibility, dims a partially-overlapping
  card, or excludes/reduces a card based on how much of it is inside
  the frame — inclusion is binary (§ above), then whatever falls
  outside the frame's box is simply not painted.
- **Coordinate systems in play:** Excalidraw scene coordinates (raw
  element `x/y/width/height`); frame-local coordinates
  (`localX = element.x - slideFrame.x`, computed once in
  `resolveSlidePadlets.ts:41-42`, consumed identically by both the live
  and static renderers); the preview object-fit-contain scale
  (`RuntimeSlideRenderer.tsx:64-67`, `Math.min(vpW/slide.width,
  vpH/slide.height)`, applied as `transform: scale(scale)` in
  `RuntimePadletLayer.tsx:52` plus centering offsets); and
  `DrawingLayout.tsx`'s own hand-rolled pointer→scene transform for
  drag/drop (`toSceneCoords`, 209-224).
- **Existing test coverage:** `lib/infra/drawing/presentationBridge.test.ts`
  (383 lines) is the most directly relevant existing asset — it
  already exercises `resolveSlidePadlets`/`planSlideComposition`/
  `expandRuntimeContainerItems` and the diagnostic codes. No test
  today specifically drives the *partial-overlap* case to its logical
  edge, nor the embeddable-vs-native-element asymmetry, nor a live
  browser drag/reload reproduction. `e2e/characterization/` has
  slide-lifecycle specs (duplication, rename, add/dup persistence) and
  a `drawing-presentation.spec.ts` covering seeded-frame presentation,
  but none targets post-card placement/clipping at a frame boundary
  specifically.

## 2. Reproduction scenario (bind — what must be exercised)

Live, in a real browser (Playwright), against a real dev server:
1. Create a frame (slide) on the drawing canvas.
2. Place a post-card embeddable fully inside the frame's bounds —
   confirm it renders at the expected position in both the live
   runtime preview (`RuntimeSlideRenderer`/`RuntimePadletLayer`) and,
   if reachable in the test environment, the static export path.
3. Drag that same card so its bounding rect straddles the frame's edge
   (partially inside, partially outside) — observe and record: (a)
   whether Excalidraw's own frame-reparenting assigns/clears
   `element.frameId` during the drag, (b) whether the card is included
   in the runtime slide overlay per current membership rules, (c) the
   card's actual on-screen clipped appearance.
4. Save and reload — confirm whether membership/position is stable
   across a persistence round-trip, or whether it drifts (e.g. because
   `frameId` assignment happens client-side during drag but isn't
   persisted, or is persisted but then re-evaluated differently on
   load).
5. Drag a card fully outside the frame — confirm it is excluded from
   the slide overlay (or document precisely if a stale `frameId`
   causes it to incorrectly remain).

Every step must produce a citable, reproducible fact (a passing or
documented-failing test, a screenshot, a captured diagnostic emission)
— not a narrative impression.

## 3. Characterization test matrix (bind)

### 3a. Unit-level (extend `lib/infra/drawing/presentationBridge.test.ts`
— this is the preferred, existing 1:1 test-to-source location; only
add a new sibling file if these additions would push it past the
repo's 800-line file ceiling, and report that decision rather than
silently splitting it)

1. Embeddable fully inside frame, `frameId` matches → included
   (restate/confirm existing baseline coverage).
2. Embeddable fully inside frame, `frameId` absent →
   included via the `overlapsFrame` fallback (documents the fallback
   firing even when geometry alone would have been sufficient and
   unambiguous).
3. Embeddable fully outside frame (zero overlap), `frameId` absent →
   excluded.
4. Embeddable fully outside frame, `frameId` explicitly set to a
   *different* frame's id → excluded (ID mismatch is authoritative
   regardless of any incidental geometric relationship).
5. Embeddable overlapping only a small sliver of the frame's edge
   (e.g., 10% inside), `frameId` absent → **included** per the current
   any-overlap fallback — characterize this precisely as current,
   reproducible behavior (not asserted as "correct," only as "this is
   what happens today").
6. Same small-sliver overlap, but `frameId` explicitly set to a
   *different* frame → excluded despite the overlap (confirms ID
   -match priority holds even under geometric ambiguity).
7. Embeddable exactly edge-adjacent (`elementRight === slideFrame.x`,
   zero-width touching, no true overlap) → excluded, per the strict
   `<`/`>` inequalities in `resolveSlidePadlets.ts:29-34` (document the
   exact boundary operator behavior explicitly).
8. Two frames present; an embeddable's bounds geometrically overlap
   both frames' rects, but `frameId` matches only one → included only
   for the matching frame, excluded for the other (confirms the
   fallback is reached per-frame only in the total absence of
   `frameId`, not "for whichever frame doesn't match").
9. Diagnostic emission: `"slide-embeddable-overlap-fallback"` is
   emitted exactly when the fallback path is taken (test 2, 5, 8's
   non-matching frame) and never emitted when `frameId` cleanly
   resolves membership (test 1, 4, 6).
10. Native (non-embeddable) frame child via `planSlideComposition.ts`'s
    `isNativeFrameMember`: `frameId` absent + geometric overlap →
    **excluded** (no fallback for native elements) — explicitly
    characterizing the asymmetry against the embeddable case (test 2/5)
    as a documented current-behavior fact, not yet judged as a defect.

### 3b. E2E/live (new file
`e2e/characterization/drawing-slide-frame-membership.spec.ts`)

Drives §2's reproduction scenario end-to-end against a real dev
server (`PW_BASE_URL`, per this repo's standing Playwright
convention), capturing: DOM state/screenshots at each step, whether
`element.frameId` is present/absent/changed after each drag, and
whether the card's rendered position in the live runtime preview
matches its expected frame-local coordinates given the current
resolution rules from §3a. Skips cleanly without credentials, matching
every other `e2e/characterization/` spec's convention.

## 4. Investigation questions (bind — answer these explicitly in a
new §5 "Findings" section appended to this document before closure)

1. Does Excalidraw's own frame-reparenting (native drag-into-frame
   behavior) actually assign `element.frameId` automatically when a
   post-card embeddable is dragged into a frame via this app's UI, or
   does `DrawingLayout.tsx`'s hand-rolled `toSceneCoords`/drag handling
   bypass that native behavior (leaving `frameId` perpetually unset for
   embeddables, making the geometric fallback the *de facto* primary
   path rather than a rare fallback)?
2. Is the "any overlap" fallback rule (vs., e.g., "majority area
   inside" or "center point inside") ever intentional per any product
   requirement, or is it an accidental consequence of reusing a
   simple overlap check originally written for a different purpose?
3. Does the embeddable-vs-native-element asymmetry (fallback exists
   for embeddables, not for native frame children) produce any
   observable, reproducible inconsistency a user could notice (e.g., a
   native drawn shape dropped half-in/half-out of a frame behaves
   differently from a post card in the identical geometric position)?
4. Does `frameId` persist correctly across save/reload for an
   embeddable that was dragged into a frame, or does the value
   observed live during a drag ever fail to survive persistence?
5. Is there a single, narrowly-scoped, safe fix that would remove
   reliance on the geometric fallback for the common case (e.g.,
   always assigning `frameId` on drag-into-frame) without touching
   rendering, clipping, or the broader coordinate-system architecture?
   If yes, propose it as an exact diff in the §5 Findings section for
   separate CTO authorization — **do not apply it in this patch.**

## 5. Findings
PATCH-111 implementation findings:

1. `element.frameId` is the decisive membership signal when it is
   present. The deterministic unit cases in
   `lib/infra/drawing/presentationBridge.test.ts` cover an inside
   embeddable with matching `frameId`, an outside embeddable with a
   different `frameId`, and a geometry-overlapping embeddable with a
   different `frameId`; all show that explicit `frameId` wins over
   geometry. The live characterization spec records the included
   matching-`frameId` and no-`frameId` sliver-overlap states through the
   real drawing board and presentation preview, then records the
   exclusion states through persisted model observations. The
   real drag action is currently classified as `action-not-drivable`
   because there is no stable public DOM handle that identifies an
   Excalidraw embeddable by scene id for a deterministic Playwright
   drag without invoking hidden product handlers. That means this patch
   proves the persisted/rendered membership rules, but does not prove
   that a manual drag into a frame always assigns `frameId` for app
   embeddables.
2. The any-overlap fallback appears accidental or compatibility-driven,
   not a product requirement. The current rule in
   `resolveSlidePadlets` includes an embeddable without `frameId` when
   its rectangle overlaps by a one-pixel sliver and excludes it when it
   is merely edge-adjacent because the rule uses strict `<`/`>`
   inequalities. No investigated product path documents a stricter
   "fully inside" or "center point inside" policy.
3. The embeddable-vs-native asymmetry is real and observable at the
   presentation bridge boundary. New unit coverage shows a native
   rectangle with identical overlapping geometry and no `frameId` is
   excluded from `planSlideComposition`, while a post-card embeddable in
   the same membership class is included by `resolveSlidePadlets`. The
   live characterization spec records the same asymmetry in the
   persisted model, while the runtime presentation path is exercised for
   included post-card clipping.
4. Persistence preserves whatever `frameId` value is stored in the
   master drawing scene. The live spec reloads persisted scene states
   with matching `frameId`, no `frameId`, and a different `frameId`; the
   bridge model after reload follows those stored values exactly. This
   patch does not prove manual drag-generated `frameId` persistence
   because the real drag action is not deterministically drivable from
   the available public DOM.
5. Smallest likely follow-up fix boundary: make the post-card
   embeddable placement/move path assign or clear `element.frameId`
   consistently with Excalidraw frame membership before persistence,
   then narrow `resolveSlidePadlets` to treat geometric overlap as
   legacy fallback only if the CTO explicitly wants backward
   compatibility. The most plausible product files for a future,
   separately authorized fix are
   `components/collabboard/canvas/layouts/DrawingLayout.tsx` around the
   app-embeddable scene update/persistence path and
   `components/presentation/slide-renderer/resolveSlidePadlets.ts`
   around the fallback policy. No product fix is applied in PATCH-111.

## 6. Exact file scope (bind)

**Read access is unrestricted** for investigation — the implementer
may read any file needed to understand the architecture (in
particular, but not limited to,
`components/collabboard/canvas/layouts/DrawingLayout.tsx`,
`components/presentation/PresentationPanel.tsx`,
`components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`,
`components/presentation/runtime-slide/RuntimePadletLayer.tsx`,
`components/presentation/slide-renderer/*.ts(x)`,
`lib/infra/drawing/presentationBridge.ts`,
`lib/infra/drawing/bridge.ts`). **Write access is limited to:**

**New files (1, conditionally 2):**
1. `e2e/characterization/drawing-slide-frame-membership.spec.ts`
2. A new sibling unit-test file **only if** extending
   `presentationBridge.test.ts` would push it past 800 lines — report
   this decision explicitly rather than deciding it silently.

**Modified files (2):**
- `lib/infra/drawing/presentationBridge.test.ts` — additive test cases
  only (§3a); no existing test is weakened, removed, or changed to
  pass for a different reason than it already does.
- `.fable5/patches/PATCH-111.md` (this file) — append the §5 Findings
  section; no other section is rewritten.

**Prohibited paths (must NOT change) — the actual implementation
files under investigation:** `components/collabboard/canvas/layouts/DrawingLayout.tsx`,
`components/presentation/PresentationPanel.tsx`,
`components/presentation/slide-renderer/resolveSlidePadlets.ts`,
`components/presentation/slide-renderer/planSlideComposition.ts`,
`components/presentation/slide-renderer/createSlideRenderer.tsx`,
`components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`,
`components/presentation/runtime-slide/RuntimePadletLayer.tsx`,
`components/presentation/runtime-slide/expandRuntimeContainerItems.ts`,
`lib/infra/drawing/presentationBridge.ts`, and every other product
file — **unless** §4 question 5 identifies one single, narrowly-scoped,
safe defect. Even then: the fix is only ever **proposed** (an exact
diff, in §5) for a future, separate CTO authorization — it is never
applied inside this patch's own commit. Also prohibited, unconditionally:
`components/collabboard/canvas/ui/FreeformPadletCards.tsx` (confirmed
unrelated — a different canvas stack with no frame concept),
`components/collabboard/canvas/excalidraw_fork/**` (vendored, never
touched), and all `scripts/harness/**` files (this is a product
patch, not an infrastructure patch — no harness file may be touched).

**Expected file count:** 1–2 new, 2 modified, 0 deleted.

## 7. Validation matrix (bind)

1. `npx vitest run lib/infra/drawing/presentationBridge.test.ts` — all
   existing cases still green, plus the new §3a cases, growing only.
2. Full `npx vitest run` — must remain at or above the pre-patch
   baseline, never shrinking or newly failing elsewhere.
3. The new e2e spec (§3b) run against a live dev server
   (`PW_BASE_URL=http://localhost:3000`, never built under a running
   dev server, per this repo's standing convention) — skips cleanly
   without credentials, passes/documents findings with credentials.
4. `npx tsc --noEmit` — clean.
5. `npm run check:boundaries` — clean, no-op confirmation (no
   `lib/domain/**` or new UI-Supabase coupling introduced).
6. `npm run verify` — full green.
7. §5's Findings section is present, complete, and answers all five
   §4 questions with citations to the new tests.
8. Fresh independent review (DeepSeek V4 Pro primary, Kepler/Gemini
   3.1 Pro fallback — NOT Sonnet) required before commit.

**The implementer must leave the candidate uncommitted** after all
gates pass — report results, including the full §5 Findings, and await
explicit direction from the CTO on next steps (which may be: close
this investigation patch as-is, or separately authorize a narrowly
-scoped fix patch based on §5's proposal).

## 8. Hard-stop conditions (bind)

STOP, report, do not commit, if: any file outside §6's exact list is
touched; any file in §6's prohibited list is modified without a §4
question 5 proposal having first been written into §5 and separately,
explicitly authorized by the CTO; any existing test is weakened,
skipped, or deleted rather than extended; the canvas is refactored or
the frame/slide concept is redesigned; this investigation is combined
with any other canvas/product issue; `FreeformPadletCards.tsx` or any
`excalidraw_fork/**` file is touched; any `scripts/harness/**` file is
touched; a broad fix is applied before §5's Findings are written and
reviewed; any required gate in §7 fails or is skipped; §5 is left
empty or is not written before requesting independent review.

## 9. Health ledger

Not applicable to a product/investigation patch — no change to the
harness health-ledger ruling.

## 10. Closure (bind — CTO post-landing verification)

**Landed commit:** `c41e19a6a011eaa73fdb9b96b666f5ec52ecbb3d`, parent
`e25754cce2292690e34d43deb4a32a665c65bc9a`, exact bound message
`test(presentation): characterize frame-membership and clipping behavior for post cards (PATCH-111)`.
Verified directly: branch `main`, HEAD == origin/main == the landed
commit, clean working tree, empty stash, `package-lock.json`
unchanged, `git diff HEAD^ HEAD --check` clean, and `git show
--name-only --format="" HEAD` returns exactly the three governed paths
from §6 — `.fable5/patches/PATCH-111.md`,
`e2e/characterization/drawing-slide-frame-membership.spec.ts`,
`lib/infra/drawing/presentationBridge.test.ts` — no more, no fewer.
No prohibited path (any actual implementation file, `FreeformPadletCards.tsx`,
the vendored fork, or any `scripts/harness/**` file) was touched.
Live-reran `npx vitest run lib/infra/drawing/presentationBridge.test.ts`
this closure turn: **42/42 passing.**

**Independent review:** PASS.

**§5 Findings reviewed and accepted:** explicit `frameId` is confirmed
decisive when present; the any-overlap fallback is confirmed accidental
/compatibility-shaped, not a documented product requirement; the
embeddable-vs-native asymmetry is confirmed real at the presentation
-bridge boundary; persistence is confirmed to preserve whatever
`frameId` value is already stored. **Critically, whether a manual
drag of a post-card embeddable into a frame actually assigns
`element.frameId` remains unproven** — the implementer correctly
classified this as `action-not-drivable` from Playwright (no stable
public DOM handle exists to drive a real Excalidraw drag
deterministically) rather than guessing or asserting an unverified
claim. This is accepted as a legitimate investigation boundary, not a
gap requiring rework — PATCH-112 must resolve it by tracing the
production source directly (§ of `PATCH-112.md`), not by another
Playwright attempt.

**Remaining implementation blocker:** none for PATCH-111 itself. The
unresolved manual-drag question is carried forward as PATCH-112's
first required investigation step, not a blocker on this patch's
closure.

**PATCH-112:** authorized separately (see `PATCH-112.md`) as a narrow
product fix — not implemented as part of this closure. (The prior
gating condition — "do not authorize PATCH-112 until PATCH-111's
findings are reviewed by the CTO" — is satisfied by this closure
section; PATCH-112 is now authorized.)
