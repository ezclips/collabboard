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

**Bound implementation commit message (verbatim, amended — see §6 for
the current authoritative text):**
`fix(e2e,canvas): assign valid fractional indices to seeded and runtime-created Excalidraw elements (PATCH-103)`

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
