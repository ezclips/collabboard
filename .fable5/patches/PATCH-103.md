# PATCH-103 — Fix Excalidraw Fractional-Index Fixtures in the Drawing E2E Harness (Prerequisite to PATCH-102 Live Review)

**Status:** **AUTHORIZED** (not yet implemented). This is an
infrastructure prerequisite, NOT a PATCH-102 amendment and NOT new
feature scope.

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

**Bound implementation commit message (verbatim):**
`fix(e2e): assign valid fractional indices to seeded Excalidraw drawing fixtures (PATCH-103)`

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

## 2. Exact allowed change (bind)

**File:** `e2e/characterization/drawingBridgeHarness.ts` only.

Replace each `index: null` literal (lines 110, 145, 176, 218) with a
valid fractional-index string, generated by a small local helper
(e.g. a simple monotonically-increasing base-62/fractional-indexing
generator, or by importing an existing fractional-index generator
already vendored in the Excalidraw fork if one is safely importable
from a Playwright/Node test context — the implementer must verify
importability before choosing that path and fall back to a minimal
local generator if the fork's module has browser-only dependencies).
The generated indices must satisfy `validateFractionalIndices()` for
the exact element ordering each existing spec already assumes.

**Explicitly prohibited (bind):** no change to any spec file's
element-count, ids, positions, types, `versionNonce`, or any other
field; no change to `DrawingLayout.tsx`; no change to any file under
`components/collabboard/canvas/excalidraw_fork/`; no change to
PATCH-102's candidate files
(`createSlideRenderer.tsx`,
`presentation-snapshot-image-readiness.spec.ts`); no new npm
dependency unless strictly required to import an existing, already-
vendored fork utility (prefer a small local helper over adding one).

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

## 5. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- any file outside `drawingBridgeHarness.ts` is touched;
- the PATCH-102 candidate (`createSlideRenderer.tsx`,
  `presentation-snapshot-image-readiness.spec.ts`) is modified, staged,
  or committed as part of this patch;
- `DrawingLayout.tsx` or any Excalidraw fork file is touched;
- any spec's element count, ids, positions, or non-index fields change;
- credentials are printed, logged, or committed anywhere;
- any of the re-run specs still fails to render `[data-padlet-id]`
  elements after the fix;
- cleanup cannot reach zero.

## 6. Review and commit flow (bind)

Implementer delivers the uncommitted single-file diff + report (exact
index values assigned; all six-plus re-run specs' real results, not
skip-only; cleanup proof). The independent reviewer (Kepler primary,
Gemini 3.1 Pro fallback — NOT Sonnet) re-derives everything live,
using the same approved credential-loading procedure, and must return
an explicit PASS — with real (non-skipped) assertion output pasted —
before the implementer commits with the bound message and pushes.
Only after this patch lands and is closed does PATCH-102's independent
review resume, using the same approved credentials.

## 7. Required final report

Exact file changed + final blob; exact index values assigned per
element; full real (non-skip) results for every spec listed in §3;
cleanup proof; explicit confirmation the PATCH-102 candidate was not
touched; commit hash + push status after PASS.
