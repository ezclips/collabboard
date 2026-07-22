# PATCH-103 — Fix Excalidraw Fractional-Index Fixtures AND Runtime Element Construction (Prerequisite to PATCH-102 Live Review)

**Status:** **AUTHORIZED, AMENDED** (not yet implemented in its amended
form). This is an infrastructure prerequisite, NOT a PATCH-102
amendment and NOT new feature scope.

**Amendment (2026-07-22):** the original one-file harness-only design
was INCOMPLETE. The current uncommitted candidate
(`e2e/characterization/drawingBridgeHarness.ts`,
blob `9388086c4354e69290d9de2b7e1f2ecedcd15c45`, deterministic
`a000001, a000002, ...` fixture indices) is CORRECT and RETAINED
unchanged — it fixed every seed-time fixture path. It failed its first
authenticated live gate (`drawing-line-bridge.spec.ts -g "renders
seeded attached"`) not because the fixture fix was wrong, but because a
SECOND, independent, production-facing source of `index: null` exists
and was not yet in scope — see §0.1. This amendment adds exactly one
more file to scope (`DrawingLayout.tsx`) without altering anything
about the retained harness change.

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (Kepler primary, Gemini 3.1 Pro fallback) — PASS required
before commit. Sonnet (CTO/governance owner) authored/authorized this
patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-22.

**Starting HEAD (bind):** `548376dc5efe1a4be238c149c2ceaac2037fde7c`
(`docs(fable): record PATCH-102 credential blocker`; HEAD ==
origin/main at authoring time). **The PATCH-102 candidate remains
uncommitted and out of scope for this patch** — do not stage, commit,
or reference it.

**Bound implementation commit message (verbatim, amended — see §11 for
the current authoritative text, superseding §6 and §10):**
`fix(e2e): capture post-mount-sync baseline before drawing-presentation order assertion (PATCH-103)`

**Second amendment (2026-07-22):** §8's PATCH-100 scene-reference-churn
regression is resolved (gate applied, verification matrix passed). A
further, independent, live-verified failure surfaced next
(`drawing-presentation.spec.ts`'s persisted-height assertion) —
investigated in §9, definitively classified in §9's resolution as a
pre-existing test-readiness gap (not a production regression), and
fixed by a scoped, test-only amendment in §10 (a bounded persistence
poll, one new file: `drawing-presentation.spec.ts`).

**Third amendment (2026-07-22):** with §10's height-poll fix applied,
a further failure surfaced in the same spec: the element-order
assertion. Investigated and definitively resolved by source in §11 —
a second, independent instance of the same class of defect as §9/§10
(a test baseline captured before a legitimate, deterministic
production behavior lands), fixed the same way (a bounded, targeted
wait), in the same already-authorized file. §11 is now the
authoritative scope/commit-message/gate list for this patch.

---

## 0. Investigation summary (bind, 2026-07-22)

**Observed blocker (as reported):** authentication succeeds, board
creation succeeds, the app reaches the canvas route, then the canvas
crashes before any `[data-padlet-id]` element renders, with an
Excalidraw fractional-indices invariant error. Reproduces across
server restarts; `.next` cache deletion did not change the outcome
(already crashing before cleanup). Affects every drawing E2E spec that
calls `openDrawingBoard`, including PATCH-097/099/100/101/102 — not
specific to PATCH-102.

**Root cause, confirmed by source (not speculation):**

1. `components/collabboard/canvas/layouts/DrawingLayout.tsx:895` loads
   the master drawing padlet's persisted scene via
   `setInitialElements(JSON.parse(drawingPadlet.content))` — a raw
   `JSON.parse` with **no restoration/normalization step**
   (`DrawingLayout.tsx` never calls the fork's `restore`/
   `syncInvalidIndices` utilities on this path). This is production
   code, but it is not itself the defect: elements ever created
   through Excalidraw's own UI/API element factories always receive a
   valid fractional `index` at creation time, so real user-authored
   drawings never reach this path with an invalid index. Confirmed via
   `components/collabboard/canvas/excalidraw_fork/packages/element/src/fractionalIndex.ts:43`'s
   `validateFractionalIndices()`, which throws
   `InvalidFractionalIndexError` when an element's index is missing or
   out of order relative to its siblings, and is invoked during
   Excalidraw's scene reconciliation (`Scene.ts`) whenever `initialData`
   or `updateScene` introduces elements — this is long-standing fork
   behavior, not new (fork last touched 2026-03-24/03-30, both
   tracking-mechanism commits with no code-logic change; confirmed via
   `git log`).
2. `e2e/characterization/drawingBridgeHarness.ts` (the SHARED harness
   used across the entire drawing E2E suite) constructs synthetic
   Excalidraw elements directly via raw Supabase inserts, bypassing
   Excalidraw's element-creation APIs entirely, and hard-codes
   `index: null` in `embeddableElement()` (line 110) and
   `frameElement()`/other builders (lines 145, 176, 218). Every spec
   built on this harness — and every spec that copies the same
   `sceneBase()`-style local builder pattern
   (`presentation-ai-component-render.spec.ts`,
   `presentation-ai-component-structured-render.spec.ts`,
   `presentation-snapshot-ai-component-render.spec.ts`,
   `presentation-snapshot-diagram-readiness.spec.ts`, and PATCH-102's
   own still-uncommitted
   `presentation-snapshot-image-readiness.spec.ts`) — inherits the same
   `index: null` fixture data.
3. `versionNonce: 1` (also present in the same fixtures) is confirmed
   **incidental, not causal**: `validateFractionalIndices()` inspects
   only each element's `index` field relative to its ordered
   neighbors; `versionNonce` is used solely for Excalidraw's own
   conflict-detection/re-render bookkeeping and is not read by the
   fractional-index validator at all.

**Classification: A — E2E fixture incompatibility.** Not B (no
production defect requiring a `DrawingLayout.tsx` change — real
interactive drawings never carry invalid indices); not C (the vendored
fork's validator logic has not changed since March); not D (no
lockfile/dependency drift found); not E (the report itself already
ruled out `.next` cache); not F (none of PATCH-097 through 102 touch
`drawingBridgeHarness.ts`, `DrawingLayout.tsx`, or the Excalidraw fork
— all three remain fenced across every one of those patches, confirmed
by their governance records).

**Not new, not caused by this patch program:** the harness's
`index: null` pattern and the fork's strict validator have coexisted
since at least PATCH-064 (the harness's oldest confirmed usage). The
most likely explanation for why this has not blocked earlier patches'
reported "live PASS" results is that this is the first time in this
governance thread that a genuinely authenticated, real-credentialed
live session has actually opened a drawing board seeded by this
harness — prior "3/3 stability run" claims were accepted from
independent-reviewer reports per this program's established closure
pattern (CTO re-verifies diffs/blobs/fences directly but relies on the
reviewer's report for live-run execution) and were never independently
re-executed by the CTO role. This is a genuine, pre-existing gap in
this program's verification depth, not a new regression — flagged here
for awareness, not re-litigated.

**PATCH-102 is NOT implicated.** Its own new spec inherits the same
harness pattern faithfully, exactly as every prior patch's spec did;
this is not an implementation defect introduced by PATCH-102's
candidate. The candidate requires no changes and must not be modified
by this patch.

## 0.1 Amendment investigation — the second, production-facing source (bind, 2026-07-22)

**Live-gate result that triggered this amendment:** with the harness
fix applied, authentication passed (1/1), but the first non-AI drawing
gate (`drawing-line-bridge.spec.ts -g "renders seeded attached"`)
still failed waiting for `[data-padlet-id]`, with error context
showing a **runtime-created** embeddable (not a seeded fixture) with
`index: null`. Remaining gates were correctly not run.

**Root cause, confirmed by source:**
`components/collabboard/canvas/layouts/DrawingLayout.tsx` contains TWO
raw Excalidraw-element-construction functions that hard-code
`index: null`, independent of the E2E harness and independent of each
other:

1. `createEmbeddableElementForPadlet` (line ~1690-1722, `index: null`
   at line 1710) — constructs a raw embeddable object for any
   non-drawing padlet that needs representation on a drawing board.
   Called from `insertPadletEmbeddable` (line ~1732) and from the
   padlet-embeddable sync effect (line ~1777, batched as
   `missingEmbeddables`, passed into `excalidrawAPI.updateScene(...)`
   at line ~1896 via `buildDrawingSceneUpdate`). This effect runs
   automatically whenever the padlet list changes for a drawing
   board — i.e. on essentially every real board load that has any
   non-drawing padlet on it. This is the exact code path
   `drawing-line-bridge.spec.ts`'s "renders seeded attached" scenario
   exercises, and the exact code path any real user hits by placing
   any padlet on a drawing board.
2. `makeFrameElement` (line ~1393-1421, `index: null` at line 1417) —
   constructs a raw frame element, used by `handleAddSlide`,
   `handleAddSlideBelow`, and `handleDuplicateSlide` (the "add
   slide"/"duplicate slide" UI actions).

Both bypass Excalidraw's own element-creation APIs entirely (raw
object literals), exactly mirroring the harness's original mistake,
but in **production application code**, not test fixtures. This is
confirmed reachable by real end users, not merely by tests — any user
placing a padlet on a drawing board, or adding/duplicating a slide,
constructs an element via one of these two functions.

**`buildDrawingSceneUpdate` (`lib/infra/drawing/importScene.ts:38-50`)
was investigated and REJECTED as the fix location.** It is the single
shared chokepoint through which 10 `updateScene` call sites in
`DrawingLayout.tsx` route their elements, which made it an attractive
single-point fix — but its own existing test
(`lib/infra/drawing/importScene.test.ts:104-119`) asserts `elements`
passes through **unchanged**, using deliberately minimal non-Excalidraw
stub objects (`{ id: "el-1" }`) unrelated to fractional-index
correctness. Adding Excalidraw-specific index normalization here would
both break that existing, correctly-scoped test and mix an unrelated
concern into a generic scene-update-payload builder. `importScene.ts`
is therefore explicitly PROHIBITED from modification by this patch —
see §2.1's amended prohibited list.

**Revised classification: E — multiple independent null-index paths
exist** (not A alone): the E2E harness fixture path (fixed, retained,
test-only) AND the `DrawingLayout.tsx` production-construction path
(newly confirmed, real-user-reachable). This is not evidence of a
"general Excalidraw migration" — it is exactly two named functions in
one file, both raw object literals bypassing Excalidraw's own APIs,
both fixable the same way.

## 1. Product/test contract (bind)

Every E2E fixture-seeded Excalidraw element (frame, embeddable,
rectangle, or any other synthetic scene element inserted directly via
Supabase rather than through Excalidraw's own UI/API) must carry a
valid, correctly-ordered fractional `index` string satisfying the
fork's `isValidFractionalIndex`/`validateFractionalIndices` contract,
instead of `null`.

- Indices must be assigned in the same relative order the elements are
  intended to render/stack in (frame first, then its children, matching
  each spec's existing z-order assumptions).
- No change to `versionNonce`, `seed`, `updated`, or any other fixture
  field — `index` only.
- No change to `DrawingLayout.tsx`, the Excalidraw fork, or any
  production rendering/save path.
- No change to PATCH-097/099/100/101/102's own governed scope, tests,
  timeouts, or selectors.

## 2. Exact allowed change (bind, amended)

**File 1 (retained, unchanged, already correct):**
`e2e/characterization/drawingBridgeHarness.ts` — the current
uncommitted candidate at blob `9388086c4354e69290d9de2b7e1f2ecedcd15c45`
is KEPT AS-IS. No further changes to this file are authorized or
required by this amendment.

**File 2 (new, amended scope):**
`components/collabboard/canvas/layouts/DrawingLayout.tsx`.

In BOTH `createEmbeddableElementForPadlet` and `makeFrameElement`,
replace the hard-coded `index: null` with a call to the fork's own
`syncInvalidIndicesImmutable()`
(`components/collabboard/canvas/excalidraw_fork/packages/element/src/fractionalIndex.ts:222`)
applied to the complete resulting elements array — i.e. the existing
scene elements (from `excalidrawAPI.getSceneElements()`) plus the
newly-constructed raw element(s) — immediately before each
`updateScene` call that introduces one of these raw elements, so the
new element(s) receive a correctly-ordered, valid fractional index
relative to their real siblings at the moment of insertion. Do NOT
hand-compute or hard-code an index value directly in either
constructor function — always derive it via the fork's own utility,
using the live sibling array at insertion time, not a static/global
counter.

The implementer must grep `DrawingLayout.tsx` for every call site that
passes a raw, newly-constructed element (from `createEmbeddableElementForPadlet`,
`makeFrameElement`, or any other similarly-shaped raw-construction
helper discovered during implementation) into `updateScene`, and apply
this treatment at each one — enumerate every call site touched in the
final report (`grep -n "createEmbeddableElementForPadlet\|makeFrameElement" components/collabboard/canvas/layouts/DrawingLayout.tsx`
is the minimum required verification command; note in the report
whether it found additional raw-construction sites beyond the two
named here).

**Explicitly prohibited (bind, amended):** no change to
`lib/infra/drawing/importScene.ts`/`buildDrawingSceneUpdate` (rejected
in §0.1 — would break its own existing test and mixes an unrelated
concern); no change to any spec file's element-count, ids, positions,
types, `versionNonce`, or any other field; no change to any file under
`components/collabboard/canvas/excalidraw_fork/` (the fork's own
`syncInvalidIndicesImmutable` is imported and used, not modified); no
change to PATCH-102's candidate files (`createSlideRenderer.tsx`,
`presentation-snapshot-image-readiness.spec.ts`); no new npm
dependency; no change to any geometry, position, binding, frame
relationship, `versionNonce`, `seed`, or `updated` field on any element
— `index` assignment only; no broad refactor of `DrawingLayout.tsx`
beyond the two named functions and their direct `updateScene` call
sites.

## 3. Verification (bind)

No new spec is required — this patch is validated by successfully
re-running EVERY existing drawing E2E spec that previously could not
progress past canvas mount, with real assertions executing (not
skip-only):

- PATCH-097 spec (`presentation-ai-component-render.spec.ts`)
- PATCH-099 spec (`presentation-ai-component-structured-render.spec.ts`)
- PATCH-100 spec (`presentation-snapshot-ai-component-render.spec.ts`)
- PATCH-101 spec (`presentation-snapshot-diagram-readiness.spec.ts`)
- PATCH-096 grouped runner (`node e2e/run-carried-groups.mjs`) — must
  show real per-group results, not the credential-skip path
- at least one other pre-existing drawing characterization spec not
  otherwise touched by this AI-content patch sequence (e.g.
  `drawing-presentation.spec.ts` or `drawing-line-bridge.spec.ts`), to
  confirm the fix generalizes across the harness rather than only the
  AI-content specs

Each must reach its ORIGINAL bound classification/assertions with the
canvas actually rendering `[data-padlet-id]` elements — not merely
"no crash," but the specific assertions each patch's governance record
already requires.

## 4. Cleanup contract (bind)

Same as every prior patch in this program: board prefix cleanup must
reach zero; no leftover `test-results/`/`playwright-report/`/JSON
reporter output; ports 3000/4000 free at close.

## 5. Hard stop conditions (bind, amended)

STOP immediately, report, do not commit, if:

- any file outside `drawingBridgeHarness.ts` and `DrawingLayout.tsx`
  is touched (in particular: `importScene.ts` or any Excalidraw fork
  file);
- `drawingBridgeHarness.ts` is modified beyond its already-landed
  candidate state (blob `9388086c4354e69290d9de2b7e1f2ecedcd15c45`);
- the PATCH-102 candidate (`createSlideRenderer.tsx`,
  `presentation-snapshot-image-readiness.spec.ts`) is modified, staged,
  or committed as part of this patch;
- the PATCH-102 named stash (`PATCH-102-candidate-before-PATCH-103`) is
  popped, applied, rewritten, or dropped;
- any spec's element count, ids, positions, or non-index fields change;
- any element's geometry, binding, frame relationship, `versionNonce`,
  `seed`, or `updated` field changes as a side effect of the index fix;
- an index value is hard-coded/hand-computed anywhere instead of
  derived via `syncInvalidIndicesImmutable()`;
- credentials are printed, logged, or committed anywhere;
- any of the re-run specs still fails to render `[data-padlet-id]`
  elements after the fix;
- cleanup cannot reach zero.

## 6. Review and commit flow (bind, amended)

Implementer delivers the uncommitted two-file diff + report (exact
`DrawingLayout.tsx` call sites touched, confirming `syncInvalidIndicesImmutable()`
was used rather than a hand-computed index; the harness file confirmed
unchanged from its already-landed candidate blob; all six-plus re-run
specs' real results, not skip-only; cleanup proof). The independent
reviewer (Kepler primary, Gemini 3.1 Pro fallback — NOT Sonnet)
re-derives everything live, using the same approved credential-loading
procedure, and must return an explicit PASS — with real (non-skipped)
assertion output pasted, specifically confirming
`drawing-line-bridge.spec.ts -g "renders seeded attached"` now passes
— before the implementer commits with the bound message and pushes.
Only after this patch lands and is closed does PATCH-102's independent
review resume, using the same approved credentials.

**Bound implementation commit message (verbatim, amended):**
`fix(e2e,canvas): assign valid fractional indices to seeded and runtime-created Excalidraw elements (PATCH-103)`

## 7. Required final report

Exact files changed + final blobs (both `drawingBridgeHarness.ts` and
`DrawingLayout.tsx`); exact `DrawingLayout.tsx` call sites touched and
confirmation `syncInvalidIndicesImmutable()` was used at each; full
real (non-skip) results for every spec listed in §3, PLUS explicit
confirmation `drawing-line-bridge.spec.ts -g "renders seeded attached"`
passes; cleanup proof; explicit confirmation the PATCH-102 candidate
and its named stash were not touched; commit hash + push status after
PASS.

## 8. PATCH-100 regression investigation (bind, 2026-07-22 — unresolved, candidate NOT amended by this section)

**Reported live result with the candidate applied** (blobs
`drawingBridgeHarness.ts` → `9388086c4354e69290d9de2b7e1f2ecedcd15c45`,
`DrawingLayout.tsx` → `cdd015bd9edcea0d8ea1df18ebd6e90bbe810289`): auth
setup, `drawing-line-bridge.spec.ts -g "renders seeded attached"`,
PATCH-097, PATCH-099, and PATCH-101 PASS. PATCH-100 FAILS on "Preview
modal exposes a populated snapshot image." No
`InvalidFractionalIndexError`; canvas renders past the previous
blocker.

**Traced mechanism (source-confirmed, NOT independently live-verified
by the CTO role this turn — disclosed, not fabricated):** the
candidate's automatic missing-embeddable sync effect
(`DrawingLayout.tsx`, the effect building `missingEmbeddables`) calls
`syncSceneElementIndices()` (which wraps
`syncInvalidIndicesImmutable()`) **unconditionally on every effect
run**, regardless of whether the combined array actually contains an
invalid index. The fork's own JSDoc on `syncInvalidIndices`/
`syncInvalidIndicesImmutable`
(`fractionalIndex.ts:217-221`) states it "could modify the elements
which were not moved" — i.e. it can assign a new instance
(new version/reference identity) to already-valid sibling elements,
including the frame, on every call. Separately,
`PresentationPreviewModal.tsx:48-79`'s big-preview render effect
cancels its in-flight `renderSlideToPNG(...).then(...)` and restarts
whenever `currentSlide` or `renderSlideToPNG` changes reference. If the
frame's reference churns on every padlet-list tick faster than one
snapshot call resolves, `setBigPng` is never reached — the preview
image never populates. This matches the reported symptom exactly (no
crash, canvas renders, only the async image-populate assertion fails).

**Provisional classification: E — scene-reference churn from an
unconditionally-firing sync effect.** NOT classified as B (flake) or G
(infrastructure) — those require the repeated clean-base comparison
this investigation did not perform. This classification is provisional
pending the live verification below.

**Required next step (NOT yet authorized as applied — the candidate
remains exactly as reported, unmodified by this section):** gate the
automatic sync effect so `syncSceneElementIndices()`/`updateScene`
fires only when the combined array actually contains at least one
element with a missing/invalid fractional index (e.g. check via the
fork's own `validateFractionalIndices`/an equivalent presence check
before calling `syncInvalidIndicesImmutable`), exactly mirroring
PATCH-101's "only wait when something is actually pending" design.
Scope stays inside `DrawingLayout.tsx`'s existing sync effect — no new
file, no change to `PresentationPreviewModal.tsx`, no change to
`createSlideRenderer.tsx` or any PATCH-102 file.

**Required verification before this amendment is accepted as
resolving the regression (bind):**

1. PATCH-100 re-run at least 3 times with the gated fix applied — all
   3 must show the Preview modal image populating.
2. A clean-base (pre-PATCH-103) comparison, using a temporary stash
   named exactly `PATCH-103-candidate-for-clean-base-comparison`
   (distinct from the preserved `PATCH-102-candidate-before-PATCH-103`
   — do not touch that one), confirming PATCH-100 behaves as it did
   before any PATCH-103 change (i.e. still blocked by the original
   fractional-index crash, not by this churn symptom) — proving the
   regression is specific to the unconditional-sync design, not
   present on clean HEAD.
3. Re-verify PATCH-097/099/101, `drawing-line-bridge.spec.ts -g
   "renders seeded attached"`, and the PATCH-096 grouped runner remain
   green after the gating change.
4. Candidate blobs for both files verified before and after any stash
   operation; the PATCH-102 named stash confirmed present and
   untouched throughout.

Only after this verification is pasted with real (non-skip) output
does PATCH-103 proceed to commit under its existing §6/§7 review flow.

**§8 resolution (2026-07-22):** the reported PATCH-103 results confirm
the gated fix was applied and the required verification matrix was
run: PATCH-100 candidate stability 3/3 real runs; clean-base A/B
proved clean HEAD still fails the original `InvalidFractionalIndex`
crash before `[data-padlet-id]` (i.e. the churn regression is specific
to the unconditional-sync design, not present on clean HEAD);
`drawing-line-bridge` targeted gate, PATCH-097, PATCH-099, PATCH-100,
PATCH-101, and the full `drawing-line-bridge.spec.ts` file all PASS.
Current candidate `DrawingLayout.tsx` blob
`539f85b127db938d7ee6c72d32fe913cb88f35f1` includes the
`hasInvalidFractionalIndex()` gate confirmed via `git diff` (the
automatic sync effect's early-return now reads
`!needsIndexSync` alongside the pre-existing checks, and
`indexedElements` is only recomputed via `syncSceneElementIndices()`
when `needsIndexSync` is true). §8 is **resolved** — superseded by §9
below, which covers a newly-surfaced, independent failure.

## 9. Drawing-presentation persisted-height investigation (bind, 2026-07-22 — unresolved, candidate NOT amended by this section)

**Reported live result with the §8-resolved candidate applied:**
`drawing-presentation.spec.ts` and PATCH-096 grouped-runner
`group-12-drawing-presentation` FAIL. Exact assertion
(`e2e/characterization/drawing-presentation.spec.ts:1132`):
`expect(entry.persistedHeight).toBe(entry.liveConformedHeight)` —
`liveConformedHeight` measured at 153 (`getBoundingClientRect().height`
on `.excalidraw__embeddable-container`, line 1041-1049),
`persistedHeight` read at 260 (the original seeded value) from
`fetchPersistedScene()` (line 246-256), which reads the master drawing
padlet's `padlets.content` column directly — the same whole-scene JSON
written by the existing debounced autosave (`handleChange` →
`dirtyDataRef` → `performSave` → `saveDrawingSnapshot`,
`DrawingLayout.tsx:1075-1239`). All 14 PATCH-096 groups were not
reached (12/14 accounted, stopped on this failure per protocol); no
auth-expiry or setup-close incidents; 1 non-signature failure.

**Traced mechanism, static source only (NOT independently live-verified
by the CTO role this turn — disclosed, not fabricated; I do not have
live browser/network/DB inspection tooling in this environment):**

1. The whole-scene autosave path is unchanged by PATCH-103's diff. `git
   diff -- DrawingLayout.tsx` confirms zero hunks touch `handleChange`,
   `performSave`, `dirtyDataRef`, `onNaturalHeight`,
   `recentlyNaturalResizedRef`, or the height-lock comparison
   (`heightLocked`/`pendingHeight`, lines ~1859-1873, ~1893). Every line
   of that mechanism is byte-identical to clean governance HEAD.
2. `onNaturalHeight` (line ~519-538) is the only place that writes a
   "natural" (content-measured) height into the scene, via a direct
   `excalidrawAPI.updateScene({ ..., height: newHeight })` outside the
   `isSyncingEmbeddablesRef` guard — this call should reach
   `handleChange` normally, get captured into `dirtyDataRef`, and be
   persisted by the next debounced `performSave`. Nothing in the diff
   changes this.
3. The automatic padlet-embeddable sync effect's height-lock mechanism
   (`heightLocked = pendingHeight !== undefined && el.height ===
   pendingHeight`) is also unchanged. It exists specifically to stop
   the sync effect from reverting a natural-resize height back to the
   padlet record's stale DB height (`nextHeight = linkedPadlet.height ??
   280`) while a natural resize is pending DB catch-up.
4. **This test could never previously reach this assertion.** Before
   PATCH-103, every drawing E2E spec (including this one) crashed with
   `InvalidFractionalIndexError` before any `[data-padlet-id]` element
   rendered (§0/§0.1). `drawing-presentation.spec.ts`'s height
   assertions execute well after the fullscreen PNG census and native
   raster-count checks — deep into a flow this test has never
   completed in this governance program.

**Provisional classification: B — PATCH-103 exposes a pre-existing
persistence gap, not a regression it introduces.** The mechanism that
would need to be broken for this to be an A/E-style regression (the
height-lock/autosave chain) is untouched by the diff; the only thing
PATCH-103 changed is that the test now runs far enough to reach this
assertion at all. NOT classified as C (stale test expectation) or D
(intentionally visual-only) without proving the product contract
first (Phase 6 requirement) — no prior governance record in this
program states persisted height is allowed to diverge from live
conformed height, and the test's own construction (asserting equality)
implies the opposite intent. NOT classified as F (async/debounce race)
or G (test-data contamination) without the live A/B this investigation
did not perform.

**Product contract (bind, pending live confirmation):** presentation
conformance that naturally resizes an embeddable's rendered height
must result in that height being persisted to the drawing scene same
as any other natural resize — i.e. `onNaturalHeight`'s existing
contract ("hold scene height until DB catches up") is presumed to
already cover this case. If live tracing shows the 153px conformance
value is produced by a code path other than `onNaturalHeight` (e.g.
presentation/snapshot-side CSS sizing that has no natural-resize
persistence hook at all), the contract question becomes whether that
separate code path was always expected to feed the same
`onNaturalHeight`/height-lock bridge, or whether it is a distinct,
previously-unbuilt persistence gap — this cannot be resolved from
source alone and requires live confirmation of which mechanism
actually produces 153.

**Required investigation before any code change is authorized (bind):**

1. Live reproduction of the failing `drawing-presentation.spec.ts`
   assertion, repeated at least 3 times, capturing: whether
   `onNaturalHeight` fires at all during the test's run; the exact
   scene element height immediately after any `onNaturalHeight` call;
   whether a subsequent sync-effect `updateScene` call reverts it;
   whether `recentlyNaturalResizedRef` is ever populated for the target
   padlet IDs; the exact sequence/timing of `handleChange` calls versus
   the 2000ms `performSave` debounce; console/page errors; network
   failures on the padlet-update path.
2. Clean-base A/B using a temporary stash named exactly
   `PATCH-103-candidate-for-height-comparison` (distinct from both
   `PATCH-102-candidate-before-PATCH-103` and the already-used
   `PATCH-103-candidate-for-clean-base-comparison`) — confirming clean
   HEAD cannot even reach this assertion (still blocked by the original
   fractional-index crash), which would further support classification
   B over A/E.
3. Verify candidate blobs before and after any stash operation; verify
   the PATCH-102 stash remains present and untouched throughout.

**Candidate status:** retained, unmodified — no code was changed
during this investigation. Do not commit PATCH-103. Do not restore or
modify the PATCH-102 stash. Do not begin PATCH-104.

Only after this verification is pasted with real (non-skip) output,
and a definitive (non-provisional) classification is reached, does
PATCH-103 proceed toward its existing §6/§7 review flow — amended
further if the live evidence shows an actual code change is required,
or left as-is with a separately-scoped prerequisite patch authorized if
the gap proves pre-existing and unrelated to the index-sync mechanism.

**§9 resolution (2026-07-22) — definitive, live-verified.** Three
focused candidate runs failed identically at
`drawing-presentation.spec.ts:1132`. Observed initially: live DOM
heights `[153, 153]`, persisted DB heights `[260, 260]`. Observed after
the existing debounced save completed: the master-padlet content write
reflected `[153, 153]` — i.e. **production persistence converges to
the correct live-conformed heights**; it just hadn't landed yet at the
moment the test read it. Clean-base A/B confirmed clean HEAD fails
earlier, waiting for `[data-padlet-id]`, and never reaches the
persisted-height assertion at all.

**Definitive classification: B — pre-existing debounced-save timing
gap, newly reachable after PATCH-103.** Not a regression: PATCH-103
does not corrupt geometry, revert 153 to 260, serialize stale scene
data, or break `saveDrawingSnapshot`. The defect is entirely in the
test: `fetchPersistedScene()` is called as a single immediate read
(`drawing-presentation.spec.ts:1033`) with no wait for the existing
~2000ms debounced autosave (`DrawingLayout.tsx`'s
`autoSaveTimerRef`/`performSave`, unchanged by this patch) to land.
This closes the investigation opened in §9 above — no further live
tracing required before authorizing the fix below.

## 10. Amendment — bounded persistence-readiness wait in the test (bind, 2026-07-22)

**Scope addition.** PATCH-103 is amended to add exactly one more file
to its authorized scope:

3. `e2e/characterization/drawing-presentation.spec.ts` — starting blob
   `6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f` (current HEAD content,
   unmodified as of this amendment).

**Final authorized PATCH-103 paths (bind, supersedes §2):**

1. `e2e/characterization/drawingBridgeHarness.ts` — retained, unchanged,
   blob `9388086c4354e69290d9de2b7e1f2ecedcd15c45`.
2. `components/collabboard/canvas/layouts/DrawingLayout.tsx` — retained,
   unchanged, blob `539f85b127db938d7ee6c72d32fe913cb88f35f1`.
3. `e2e/characterization/drawing-presentation.spec.ts` — new, starting
   blob `6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f`.

**Exact change authorized in file 3, and only this change:** replace
the single immediate `await fetchPersistedScene(supabase,
fixture.masterPadletId!)` call at line 1033 with a bounded polling wait
that reuses the repo's existing persistence-wait convention (see
`waitForFramePersisted` in
`e2e/characterization/drawing-duplicate-persistence.spec.ts:555-605` —
same shape: a `while (Date.now() - startedAt <= timeoutMs)` loop
re-querying `fetchPersistedScene()`, sleeping `pollingIntervalMs`
between attempts, returning full diagnostics on both the converged and
timed-out paths).

**Bound contract for the new wait helper:**

- **Timeout:** `20_000` ms (matches `waitForFramePersisted`'s bound
  timeout for the same debounced-autosave mechanism).
- **Polling interval:** `500` ms (matches `waitForFramePersisted`).
- **Element matching strategy:** poll by the exact scene element ids
  already used by the test (`emb-slide-a`, `emb-slide-b` — the
  `naturalHeightTargets` scene ids at line 1037-1040), not by index or
  type — read each target element's persisted `height` from
  `fetchPersistedScene()`'s returned `sceneElements`, matched by `id`.
- **Convergence condition:** the helper must not return "converged"
  until **both** target elements' persisted heights exactly equal
  their own already-measured `liveConformedHeightBySceneId` value (no
  averaging, no rounding beyond what `liveConformedHeightBySceneId`
  already applies at line 1046, no partial convergence — one element
  converging is not sufficient).
- **On timeout:** return the same diagnostic shape as
  `waitForFramePersisted` (converged flag, last-observed persisted
  heights per target id, live-conformed heights per target id,
  `waitDurationMs`, `pollingIntervalMs`) so the existing assertions at
  lines 1130-1133 produce a useful failure message identifying exactly
  which target id(s) failed to converge and what value they were stuck
  at — do not swallow a timeout into a silent pass.
- **No fixed `sleep`/`setTimeout` substitute for the loop** — must be a
  genuine poll-until-condition, not a single delay guess.
- **The assertions themselves (lines 1130-1133) are NOT weakened**:
  `expect(entry.seededHeight).toBe(260)` and
  `expect(entry.persistedHeight).toBe(entry.liveConformedHeight)`
  remain byte-identical in intent — the wait only changes when
  `postRunPersistedScene` is captured, not what is asserted against it.
  `liveConformedHeightBySceneId` continues to be measured from the live
  DOM exactly as today, before or independent of the new wait.

**Explicitly prohibited by this amendment (bind):** no change to
`DrawingLayout.tsx` save/debounce logic, `performSave`,
`saveDrawingSnapshot`, any persistence repository, or Supabase code; no
change to the Excalidraw fork; no change to `package.json` or any
lockfile; no change to PATCH-102's files
(`createSlideRenderer.tsx`, `presentation-snapshot-image-readiness.spec.ts`)
or its named stash (`PATCH-102-candidate-before-PATCH-103`); no change
to any other assertion, fixture, seed value, or element id in
`drawing-presentation.spec.ts` beyond the single `fetchPersistedScene`
call site being replaced with the bounded wait; no fixed/arbitrary
sleep; no relaxing of `liveConformedHeights` expected values (`[153,
153]`) or `seededHeight` (`260`); no governance changes beyond this
amendment.

**Required live gates after this amendment (bind, non-skip real
results required for all):**

1. `drawing-presentation.spec.ts`'s persisted-height scenario — **at
   least 3 consecutive real runs**, all converging within the 20s
   timeout, all producing `persistedHeight === liveConformedHeight`.
2. `drawing-line-bridge.spec.ts -g "renders seeded attached"` (targeted
   gate).
3. Full `drawing-line-bridge.spec.ts`.
4. PATCH-097 spec.
5. PATCH-099 spec.
6. PATCH-100 spec.
7. PATCH-101 spec.
8. PATCH-096 grouped runner (`node e2e/run-carried-groups.mjs`) —
   must report **14 groups configured, 14 specs configured, 14 final
   passes, zero non-signature failures, exit code 0**. Skip-only
   results do not count as passes for any of the above.

**Bound implementation commit message (verbatim, supersedes §6):**
`fix(e2e): poll persisted drawing scene for debounced-save convergence before height assertion (PATCH-103)`

**Hard-stop conditions (bind, amended — supersedes §5 for this
amendment):** STOP immediately, report, do not commit, if:

- any file outside the three named in this section is touched;
- either of the two already-verified candidate files
  (`drawingBridgeHarness.ts`, `DrawingLayout.tsx`) changes from its
  bound blob;
- the PATCH-102 candidate or its named stash is modified, popped,
  applied, or dropped;
- the wait helper uses a fixed sleep instead of a genuine poll loop;
- the wait helper accepts partial convergence (only one of the two
  target ids matching);
- any assertion's expected value is changed/weakened;
- any of the 8 required live gates above fails or is skip-only;
- PATCH-096 does not report exactly 14/14/14, zero non-signature
  failures, exit code 0;
- credentials are printed, logged, or committed anywhere;
- cleanup cannot reach zero.

**Review and commit flow:** implementer applies the single authorized
change to `drawing-presentation.spec.ts` only, delivers the diff +
report (final blob, full real results for all 8 required gates,
cleanup proof, confirmation the other two candidate files and the
PATCH-102 stash are untouched). The independent reviewer (Kepler
primary, Gemini 3.1 Pro fallback — NOT Sonnet) re-derives everything
live and must return an explicit PASS with real (non-skipped) output
before the implementer commits with the bound message above and
pushes. Only after this lands and closes does PATCH-102's independent
review resume.

## 11. Element-order assertion investigation and amendment (bind, 2026-07-22)

**Reported live result with §10's height-poll fix applied** (blobs
`drawingBridgeHarness.ts` → `9388086c4354e69290d9de2b7e1f2ecedcd15c45`,
`DrawingLayout.tsx` → `539f85b127db938d7ee6c72d32fe913cb88f35f1`,
`drawing-presentation.spec.ts` → `307774a894d867e7001d5236be0ec12efe447cab`):
runs 1-2 passed outright (height poll converged in 1 attempt, ~110-125ms).
Run 3 failed **after** height convergence (5 poll attempts, 2265ms) at
`expect(preRunElementOrder).toEqual(postRunElementOrder)` — the
persisted-height assertion itself no longer failed. `postRunElementOrder`
contained one additional runtime-created embeddable id, appended at the
end, not present in `preRunElementOrder`.

**Root cause, confirmed by source (deterministic, not a timing
coincidence — reproducible on every run once the wait converges slowly
enough to observe it):**

1. `drawingBridgeHarness.ts`'s `seedDrawingContainers()` (lines
   313-410) seeds **three** containers — `containerA`, `containerB`,
   `containerC` — and pushes all three into `fixture.containerIds`
   (line 396).
2. `seedPresentationScene()` (lines 490-522) destructures only the
   first two (`const [a, b] = fixture.containerIds;`, line 491) and
   inserts scene embeddables for exactly those two
   (`emb-slide-a` → `a`, `emb-slide-b` → `b`). **`containerC`
   (`fixture.containerIds[2]`) is never given a scene embeddable by
   any seed function this spec calls** — confirmed by reading every
   line of `seedPresentationScene`'s `insertMasterPadlet(...)` element
   list (7 elements: 2 frames, `emb-slide-a`, `emb-uploaded-image`,
   `text-landscape`, `shape-landscape`, `emb-slide-b` — zero reference
   to `containerC`).
3. `DrawingLayout.tsx`'s automatic missing-embeddable sync effect
   (unchanged by PATCH-103 — only its index-sync gate condition was
   added in §0.1/§8, not the `missingEmbeddables` detection itself)
   computes `missingEmbeddables` as every `nonDrawingRootPadlet` whose
   `padlet://<id>` link has no existing scene embeddable. `containerC`
   satisfies this on every single board mount, deterministically,
   because it is a real, persisted, non-drawing padlet on the board
   with no seeded embeddable — this is exactly the pre-existing,
   intended production behavior documented in §0.1 ("any real user
   placing a padlet on a drawing board" triggers this). The effect
   appends the new embeddable to the end of the elements array
   (`combinedElements = [...nextElements, ...missingEmbeddables]`,
   unchanged by PATCH-103) — matching the reported symptom exactly
   ("additional... ID appended at the end").
4. `preRunElementOrder` (`drawing-presentation.spec.ts:1107`) is
   derived from `persistedScene` — the raw Supabase read taken at line
   871, **immediately after seeding, before `openDrawingBoard` is ever
   called** (line 977). It can never include `containerC`'s auto-embed,
   because that embed only happens once Excalidraw actually mounts and
   the sync effect runs. `postRunElementOrder` is derived from a scene
   fetched after the board has been open and settled for the
   presentation-mode interactions — by which point the deterministic,
   one-time auto-embed has already landed. The two baselines were never
   going to match, independent of any test flakiness: **run 3 "failing
   after 5 poll attempts" is simply the run where the height-poll
   helper's retries gave the (already-inevitable) auto-embed enough
   wall-clock time to land before the order comparison ran; runs 1-2
   "passing" would be masking the same defect if the auto-embed hadn't
   yet committed to the DB at the moment of comparison** — this is not
   evidence the defect is intermittent, only evidence of exactly how
   thin the race margin is. This spec could never previously reach this
   assertion (§0/§0.1's pre-existing `InvalidFractionalIndexError`
   blocked it), so it has never been exercised against real production
   mount behavior before now.

**Whether the extra embeddable is legitimate, duplicate, orphan, or
residue:** legitimate. It is not a duplicate (no embeddable for
`containerC` existed before); not an orphan (the opposite — a real,
persisted padlet that lacked an embeddable, not a stale embeddable
whose padlet is gone); not test residue (created fresh, deterministically,
every run, by the fixture's own board-mount, not leaked from a prior
run — cleanup counts were not implicated). It is real, intended,
already-shipped production behavior that this test had simply never
run far enough to observe before PATCH-103.

**Clean-base A/B:** not independently re-executed live by the CTO role
this turn — the root cause here is fully deterministic and provable
from static source (unlike §9's timing question, there is no
ambiguity to resolve live: `seedPresentationScene` unconditionally
omits `containerC`'s embeddable on every invocation, and the sync
effect's `missingEmbeddables` detection is unconditional and untouched
by PATCH-103's diff). Per §0/§0.1's already-established finding, clean
governance HEAD cannot reach this assertion at all (still blocked by
the original fractional-index crash before `[data-padlet-id]`
renders), so it could not have exposed or hidden this behavior either
way. A live re-confirmation is still required before commit (see gates
below), using a temporary stash named exactly
`PATCH-103-candidate-for-order-comparison` (distinct from
`PATCH-102-candidate-before-PATCH-103` and both prior comparison
stashes) if the implementer wishes to re-verify the clean-HEAD-blocked
premise directly, but it is not what determines the fix here.

**Intended order contract (Phase 4 — determined from the test's own
surrounding structure, not from this failure alone):** the assertion's
purpose, read alongside its neighbors (PNG-census stability checks,
`postRunCompositionPlan` stability, `noNativeMembersDropped`, and —
critically — the separate per-seeded-element completeness loop at
line 1231 that already checks every *originally seeded* element is
still present and unchanged in the post-run scene, by id, individually,
without requiring the two full id-lists to be identical) is to prove
that **viewing/interacting with presentation mode does not reorder or
corrupt already-settled scene elements**. It was never meant to assert
byte-identical scene contents between "the instant after raw seed
insertion" and "after presentation-mode interaction" — the existing
per-element loop already deliberately allows the post-run scene to be
a superset check on identity/type/frameId/link, not a set-equality
check. The correct baseline for the order-stability assertion is the
scene **as it looks once genuinely settled after board mount** (i.e.
including the deterministic one-time embeddable auto-sync), captured
*before* presentation-mode interactions begin — not the raw pre-seed
snapshot.

**Definitive classification: C — preRun order is captured before
legitimate scene synchronization completes.** Not A (no duplicate
created), not B/G (no over-broad assertion in isolation — the
assertion's exactness is correct, only its baseline timing is wrong),
not D (no stale/foreign data — the extra element belongs to this exact
fixture's own `containerC`), not E (no cleanup/isolation failure —
reproducible from a single run's own seed data, not leaked from a
prior run). PATCH-103 did not cause this: it is the same class of
"test reaches further than it ever has, and its baseline predates a
real mount-time behavior" defect as §9/§10's persisted-height gap, not
a new production regression.

**Authorized fix (bind) — scoped entirely inside the already-authorized
file, no new file added to scope:**

`e2e/characterization/drawing-presentation.spec.ts`, current blob
`307774a894d867e7001d5236be0ec12efe447cab` (§10's landed candidate),
amended as follows and only as follows:

1. Add one new helper, `waitForContainerEmbeddableSync`, matching the
   existing `waitForNaturalHeightPersistence` shape exactly
   (lines 264-330-ish): a `while (Date.now() - startedAt <= timeoutMs)`
   poll loop calling `fetchPersistedScene()`, **timeout `20_000`ms,
   polling interval `500`ms** (same bound values as
   `waitForNaturalHeightPersistence`), checking whether the persisted
   scene contains an active (`!isDeleted`) `embeddable` element whose
   `link === \`padlet://${fixture.containerIds[2]}\``. Return the same
   diagnostic shape convention (`converged`, the settled
   `persistedScene`, `waitDurationMs`, `timeoutMs`, `pollingIntervalMs`,
   `attempts`) so a timeout produces a useful failure message
   identifying that `containerC`'s embeddable never synced.
2. Immediately after the existing `[data-padlet-id]` visibility wait
   (line 979) and *before* the "Present Frames" click (line 981), call
   this new helper and require `converged === true` via an `expect(...)`
   assertion (mirroring §10's `naturalHeightPersistence.converged`
   pattern) with the same non-hidden-failure diagnostic requirement —
   a timeout must fail loudly, not be swallowed.
3. Capture the settled scene from this new helper's returned
   `persistedScene` into a new local (e.g. `settledScene`), and change
   `preRunElementOrder` (currently line 1107) to derive from
   `settledScene.sceneElements`, not from `persistedScene` (the line-871
   raw pre-seed read).
4. **Leave every other use of `persistedScene` unchanged** — the frame
   lookup (line 873), native-element checks (lines 883-889), the
   `seededHeight` lookups via `preRunSceneById` (line 1163, sourced from
   `persistedScene`), and the per-seeded-element completeness loop
   (line 1231) all continue to read the original line-871 raw seed
   snapshot exactly as today. Only the order-assertion's baseline
   changes.
5. `postRunElementOrder`, the height-poll helper, and the height/order
   assertions themselves (lines 1222, 1225-1230) are **not** changed in
   wording or strictness — `expect(preRunElementOrder).toEqual(postRunElementOrder)`
   remains an exact `toEqual`, not relaxed to a subset/superset check.

**Explicitly prohibited by this amendment (bind):** no change to
`DrawingLayout.tsx` or `drawingBridgeHarness.ts` (both remain at their
already-verified blobs); no change to `seedDrawingContainers`/
`seedPresentationScene`'s seeded element set (do not add `containerC`'s
embeddable to the seed instead — that would hide the real mount-time
behavior this test should be allowed to observe); no relaxing of the
order assertion to a subset/contains check; no change to any other
assertion, fixture value, or selector in
`drawing-presentation.spec.ts`; no fixed/arbitrary sleep; no change to
`PATCH-102`'s files or its named stash; no governance changes beyond
this amendment.

**Bound implementation commit message (verbatim, supersedes §6 and
§10):**
`fix(e2e): capture post-mount-sync baseline before drawing-presentation order assertion (PATCH-103)`

**Required live gates after this amendment (bind, non-skip real
results required for all — supersedes §10's gate list):**

1. `drawing-presentation.spec.ts`'s full scenario — **at least 3
   consecutive real runs**, all passing, including both the
   persisted-height convergence (§10) and the order assertion (§11).
2. `drawing-line-bridge.spec.ts -g "renders seeded attached"` (targeted
   gate).
3. Full `drawing-line-bridge.spec.ts`.
4. PATCH-097 spec.
5. PATCH-099 spec.
6. PATCH-100 spec.
7. PATCH-101 spec.
8. PATCH-096 grouped runner — must report **14 groups configured, 14
   specs configured, 14 final passes, zero non-signature failures,
   exit code 0**. Skip-only results do not count as passes.

**Hard-stop conditions (bind, supersedes §5/§10 for this amendment):**
STOP immediately, report, do not commit, if:

- any file outside `drawing-presentation.spec.ts` is touched;
- `DrawingLayout.tsx` or `drawingBridgeHarness.ts` changes from their
  bound blobs;
- the PATCH-102 candidate or its named stash is modified, popped,
  applied, or dropped;
- the new wait helper uses a fixed sleep instead of a genuine poll
  loop;
- the order assertion is weakened to anything other than an exact
  `toEqual` over the corrected baseline;
- the seed functions are changed to add `containerC`'s embeddable
  (masking the behavior instead of accounting for it);
- any of the 8 required live gates fails or is skip-only;
- PATCH-096 does not report exactly 14/14/14, zero non-signature
  failures, exit code 0;
- credentials are printed, logged, or committed anywhere;
- generated artifacts (`test-results/`, `.next/trace`,
  `playwright-report/`) are committed;
- cleanup cannot reach zero.

**Review and commit flow:** implementer applies the single authorized
change to `drawing-presentation.spec.ts` only, delivers the diff +
report (final blob, full real results for all 8 required gates,
cleanup proof, confirmation the other two candidate files and the
PATCH-102 stash are untouched). The independent reviewer (Kepler
primary, Gemini 3.1 Pro fallback — NOT Sonnet) re-derives everything
live and must return an explicit PASS with real (non-skipped) output
before the implementer commits with the bound message above and
pushes. Only after this lands and closes does PATCH-102's independent
review resume.
