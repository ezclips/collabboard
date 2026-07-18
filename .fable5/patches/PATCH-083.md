# PATCH-083 — Drawing Scene Save Supersession Diagnosis

**Status:** **DONE** (2026-07-18) — landed as commit
`0683b965d3821088a4ed9812693f408e0dcfa280`, blob
`c6cc4feaa6f2320932232a993b70cda73c9e584c`, independent Sonnet PASS
(freshly re-derived twice), three stable runs zero drift both passes.
Closure record in §12. Was: SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix, NO instrumentation seam — the
question must be answered with real-UI E2E observation plus the
read-only browser-console listener bound in §2; if that proves
impossible, STOP and report rather than adding a seam).
Successor to PATCH-082: both flows create a VALID live duplicate
frame + child, yet neither persists, and a rapid Add→Duplicate
sequence left NEITHER new frame in the settled persisted set. The
remaining unknown is entirely on the save/persistence path. This
patch observes when persisted state changes, whether new frames
appear transiently and vanish, and whether the known silent
save-failure signature fires.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`69c7abf024e2b10e68e9670518be9d128a69a120`
(`test(e2e): characterize duplicate outer-state live-scene divergence (PATCH-082)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize drawing scene save supersession (PATCH-083)`

---

## 0. Census at authoring (2026-07-18, from `69c7abf`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Drawing scene save supersession diagnosis (Flows A/B/C, persisted time series + console listener)** | defect diagnosis | **SELECTED (this patch)** — final evidence gate before the persistence/deep-clone fix |
| 2 | Duplicate deep-clone production fix (semantics bound: PATCH-076 §0.B.2 OPTION A) | defect | BLOCKED on #1 — live clone construction is proven GOOD (082); the save-path owner is unproven |
| 3 | Rapid successive slide-action save supersession (Add lost when immediately followed by Duplicate) | defect (uncharacterized) | FOLDED INTO #1 (Flow A vs Flow B comparison) |
| 4 | Stale React-`elements` source in slide-menu handlers (post-drag scene replacement risk) | defect (uncharacterized) | related to #1's candidate mechanisms; do NOT fix here |
| 5 | Save debounce / serialization overwrite ownership (silent `console.error` swallow in `saveDrawingSnapshot`) | defect (uncharacterized) | OBSERVED read-only by #1's console listener |
| 6 | Frame-geometry sidebar staleness diagnosis | defect (uncharacterized) | after the duplicate/persistence family |
| 7 | Frame-geometry/sidebar-position fix | defect | after #6 |
| 8 | Line-follow behavior | hardening | deferred |
| 9 | Uploaded-image storage cleanup | hardening | deferred (approved skip) |
| 10 | AI images in presentation | feature | deferred (approved skip) |
| 11 | Overlap fallback | hardening | deferred |
| 12 | Connections side-panel planning | feature | deferred until stabilization ruled complete |

New deterministic defect exposed by PATCH-082: the rapid
Add→Duplicate combined-settlement window contained NEITHER new frame
(#3) — folded into this patch rather than opened separately.

## 1. Question (bind) + read-only save-path facts

PATCH-082 proved: Duplicate constructs a valid live scene (frame +
child) in BOTH flows, yet the duplicate NEVER reaches settled
persistence, and in the rapid Add→Duplicate flow even Add's frame was
absent from the single combined settled set — while PATCH-080 proved
Add persists when given its own settlement window. The persistence
failure occurs AFTER valid live-scene creation.

Read-only facts established at closure of 082 (all in
`components/collabboard/canvas/layouts/DrawingLayout.tsx`, fence
blob `5455597d…`):

- The ONLY content save path is `handleChange` → `dirtyDataRef` +
  2000 ms debounce (`autoSaveTimerRef`) → `performSave` →
  `saveDrawingSnapshot` → `onUpdatePadlet(masterPadlet.id,
  {content: JSON.stringify(elements), …})`, guarded by a
  `saveGenerationRef` generation check (lines ~988–1031, ~1168–1187).
- Save failures are SILENTLY SWALLOWED into
  `console.error("Failed to save drawing to master padlet", e)`
  (two sites, ~1011 and ~1022) — invisible to every prior spec.
- `handleChange` skips arming the save when
  `isSyncingEmbeddablesRef.current` or
  `isApplyingImportedSceneRef.current` is set (~1171).
- The embeddable-sync effect re-runs only when `padlets` (or the API)
  changes (dep array ~1780) — a Duplicate alone mutates no padlet
  rows, so sync interference is NOT an obvious Flow-C explanation.
- The scene-import path (~1238–1243) cancels the pending debounce,
  clears `dirtyDataRef`, and bumps the generation — the
  cancel/supersede pattern EXISTS in this file, but that path is
  user-triggered (import dialog), not on the Duplicate path.

Candidate mechanisms (NONE proven — this patch discriminates):
(a) the programmatic `updateScene` from the slide handlers never
produces a save-arming `handleChange` (suppression/batching timing);
(b) the save fires but the server/persistence layer REJECTS the
payload → silent console.error; (c) the save fires and lands but a
LATER stale write (last-write-wins) overwrites it; (d) a rapid second
action cancels/supersedes the first pending save.

Question (bind): across three bounded flows, (1) does the persisted
frame-id set EVER change after Add and/or Duplicate, and with what
timing; (2) does any new frame id appear transiently in the persisted
set and then vanish; (3) does the exact save-failure console
signature fire; (4) does a rapid second action change whether the
first action's frame persists?

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, ONE active test, running THREE bounded
flows sequentially on THREE separate disposable harness boards (each
seeded identically to PATCH-080/081/082: two frames
Landscape/Portrait, source `PATCH-064 Portrait` with one child card +
shared padlet link; each board cleaned in its OWN try/finally; each
flow fully completed and cleaned before the next board is created):

**Console listener (bind, read-only):** at each flow's start,
register `page.on('console', …)` and record every message of type
`error` (bounded: first 50 per flow, text truncated to 500 chars)
into the evidence annotation. Derive per-flow
`…_saveErrorObserved` = at least one captured message whose text
contains the EXACT substring
`Failed to save drawing to master padlet`. This observes existing
production output; it does NOT modify production, and no assertion
may be made on unrelated console noise.

**Persisted time series (bind):** using the same persisted-content
read the settled-persistence helper uses, poll the persisted frame-id
set at ≤1000 ms intervals for a bounded window of ≥20 000 ms after
the flow's final action, recording `(elapsedMs, frameIds)` tuples.
The settled set = the value stable over the final ≥6000 ms of the
window (PATCH-076 method). `…EverPersisted` fields derive from ANY
tuple in the series; `…PersistedSettled` fields derive from the
settled set only.

**Verified fit (bind, PATCH-082 §2 methodology verbatim):** once per
flow, after the flow's final action and before the settlement window:
real empty-canvas click (elementsFromPoint-verified) + real `Shift+1`,
zoom display read before/after; live frame-label ids derived from the
POST-fit read only.

**Flow A (first board) — Add alone, full settlement:**
1. Baseline: sidebar rows (assert exactly 2), live frame-label ids,
   persisted frame ids.
2. Real `Add slide below` on the source row via the real menu (exact
   seven-item verification) → **`flowA_addRowAppeared`** (rows reach
   3, bound 15 s poll). Capture `addFrameId` via bounded live-label
   diff (≤5 s poll).
3. Verified fit → **`flowA_zoomToFitApplied`**,
   **`flowA_addFrameLiveAfterFit`** (post-fit labels contain a
   non-baseline id).
4. Persisted time series → **`flowA_addEverPersisted`**,
   **`flowA_addPersistedSettled`** (any/settled non-seeded frame id).
5. **`flowA_saveErrorObserved`** from the listener.

**Flow B (second board) — Add then IMMEDIATELY Duplicate, one
combined settlement:**
1. Baseline as Flow A.
2. Real `Add slide below` → **`flowB_addRowAppeared`** (rows 3);
   capture `addFrameId` via bounded live-label diff (≤5 s poll).
3. IMMEDIATELY (within 5 s of the Add row appearing; no settlement
   wait) real `Duplicate slide` on the freshly re-queried source row
   → **`flowB_duplicateRowAppeared`** (rows 4, exactly two
   source-title rows).
4. Verified fit → **`flowB_zoomToFitApplied`**,
   **`flowB_addFrameLiveAfterFit`** (post-fit labels contain
   `addFrameId`), **`flowB_duplicateFrameLiveAfterFit`** (post-fit
   labels contain a fresh id ∉ baseline ∪ {addFrameId}).
5. Persisted time series → **`flowB_addEverPersisted`** /
   **`flowB_addPersistedSettled`** (tuples/settled contain
   `addFrameId`), **`flowB_duplicateEverPersisted`** /
   **`flowB_duplicatePersistedSettled`** (tuples/settled contain a
   non-seeded id ≠ `addFrameId`).
6. **`flowB_saveErrorObserved`**.

**Flow C (third board) — Duplicate only, full settlement:**
1. Baseline as Flow A.
2. Real `Duplicate slide` → **`flowC_duplicateRowAppeared`** (rows 3,
   exactly two source-title rows).
3. Verified fit → **`flowC_zoomToFitApplied`**,
   **`flowC_duplicateFrameLiveAfterFit`**.
4. Persisted time series → **`flowC_duplicateEverPersisted`**,
   **`flowC_duplicatePersistedSettled`**.
5. **`flowC_saveErrorObserved`**.

PROHIBITED in every flow: `Rename slide`, `Remove slide`, reload,
deletion, FullscreenPresentation, drag/resize, scene import, direct
callback invocation, direct product-state mutation, any
`excalidrawAPI` call from the test, force click, `dispatchEvent`,
coordinate hacks beyond the bound verified-fit click, retrying
Add/Duplicate clicks, artificial waits beyond the bounded polls.

## 3. Annotation contract (bind)

PRIMARY annotation: TWENTY-SIX fields, each exactly once, every value
observation-derived (never hardcoded):

Flow A (6): `flowA_addRowAppeared`, `flowA_zoomToFitApplied`,
`flowA_addFrameLiveAfterFit`, `flowA_addEverPersisted`,
`flowA_addPersistedSettled`, `flowA_saveErrorObserved`.
Flow B (10): `flowB_addRowAppeared`, `flowB_duplicateRowAppeared`,
`flowB_zoomToFitApplied`, `flowB_addFrameLiveAfterFit`,
`flowB_duplicateFrameLiveAfterFit`, `flowB_addEverPersisted`,
`flowB_addPersistedSettled`, `flowB_duplicateEverPersisted`,
`flowB_duplicatePersistedSettled`, `flowB_saveErrorObserved`.
Flow C (6): `flowC_duplicateRowAppeared`, `flowC_zoomToFitApplied`,
`flowC_duplicateFrameLiveAfterFit`, `flowC_duplicateEverPersisted`,
`flowC_duplicatePersistedSettled`, `flowC_saveErrorObserved`.
Global (4): `classification`, `prefixA`, `prefixB`, `prefixC`.

EVIDENCE annotation (separate): per-flow baseline/post-action/post-fit
label-id sets, zoom before/after, `addFrameId`s, the FULL persisted
`(elapsedMs, frameIds)` time series, settled sets, and all captured
console-error texts (bounded per §2).

**Classification enum (bind — SEVEN values, first match in this
order, outcome NOT hardcoded):**

1. `supersession-observation-unsound` — any row-appearance
   precondition failed, any verified fit could not be applied, or
   Flow B's `addFrameId` could not be captured (attribution
   impossible).
2. `save-error-observed` — any flow's `…_saveErrorObserved` is true.
3. `duplicate-transient-then-lost` — any flow has
   `…duplicateEverPersisted` true with the matching
   `…duplicatePersistedSettled` false.
4. `add-superseded-by-rapid-duplicate` — `flowA_addPersistedSettled`
   true AND `flowB_addPersistedSettled` false.
5. `add-persists-duplicate-never` — `flowA_addPersistedSettled` AND
   `flowB_addPersistedSettled` both true, and no
   `…duplicateEverPersisted` true anywhere.
6. `no-new-frame-persists` — `flowA_addPersistedSettled` false
   (Add no longer persists even alone — contradicts PATCH-080;
   environment/regression drift, report immediately).
7. `mixed-supersession-state` — any other combination (report the
   exact tuple).

## 4. Allowed files and absence gates (bind)

EXACTLY ONE new file:
`e2e/characterization/drawing-save-supersession.spec.ts`
(prefix `patch-064-harness-patch-083-supersession-`;
`registerDrawingCleanup(test)` at module scope; per-board local
try/finally defense with the idempotent zero-assertion;
`test.setTimeout(300_000)` maximum — three flows with ≥20 s series
each exceed the prior 240 s cap; this bound is explicit and final).

Absence gates (verify before starting):
- `e2e/characterization/drawing-save-supersession.spec.ts` absent at
  base `69c7abf` and in the worktree before implementation;
- `e2e/characterization/drawing-slide-persistence.spec.ts`
  (PATCH-077) permanently absent at base, HEAD, and worktree;
- no second new file, no modification to ANY existing file.

## 5. Immutable fences (bind — 27, Git blob IDs)

Verify each with
`git rev-parse 69c7abf024e2b10e68e9670518be9d128a69a120:<path>` and
equality at the current governance HEAD with
`git rev-parse HEAD:<path>`. Do NOT use raw file-byte SHA-1 or
`Get-FileHash`. (Working-tree spot checks may additionally use
`git hash-object <path>`, which produces the same blob ID.)

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/canvas/layouts/DrawingLayout.tsx    5455597d486fd917c4983a18e47445e2b1c9314d
components/collabboard/menus/LineContextMenu.tsx           aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                       e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                  2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                            f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                    b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts    b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawingBridgeHarness.ts               7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts          ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts           7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts           87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts       5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts     50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts     fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts    513d07bfe99898455d13d7048a53da90c3b5d401
e2e/characterization/drawing-slide-add-dup-persistence.spec.ts 9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e
e2e/characterization/drawing-duplicate-clone-shape.spec.ts 147ae0aeae503a36fd5e8e42d6cd3045b34b38c3
e2e/characterization/drawing-duplicate-divergence.spec.ts  5d3cccb693f57022c9e9aa44522bee6f59552332
```

(PATCH-082's 26 fences plus its landed spec.)

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test), THREE sequential
stable runs (field drift across runs must be reported, not hidden —
timing-sensitive fields may legitimately vary; classification drift
is a STOP).
Carried (unchanged): divergence 2/1/2; clone-shape 2/1/2; add-dup
2/1/2; rename-state 2/1/2; slide-duplication 2/1/2; menu-pointer
2/1/2; harness-cleanup 2/1/2; presentation 2 passed / 2 approved
skips; duplication 2/1/2; line 4 passed / 4 skipped cred-off; helper
7/1; sanitizer 9/1; focused drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 27/27 fences.
Cleanup zeros across **SIXTEEN** prefixes: the fifteen tracked
prefixes plus `patch-064-harness-patch-083-supersession-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the
`e2e/.auth/user.json` staleness incident is environmental, SIX-times
reproduced — refresh via setup and retry); no credential contents
anywhere; sequential `verify`/`build`, never under a dev server;
never commit generated artifacts (`test-results/`,
`playwright-report/`, JSON reporter output, scratch scripts). The
known Next.js cookie-await warning in `/api/auth/login` is
pre-existing and non-blocking.

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + per-board local
`finally` defense with the idempotent zero-assertion (each board
cleaned before the next is created; a mid-flow stop must still clean
the current board). Add/Duplicate are expected to create NO new
padlet rows — if one appears, record it; the board-scoped fixture
delete covers it. NO Remove; NO deletion of any slide. Post-run
prefix-scoped residue checks must be zero for all SIXTEEN §6
prefixes. Test-timeout kill → sweep and report per the PATCH-074
rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (27/27, blob-ID method), or any §4
  absence gate differs;
- ANY existing file must change, or a SECOND new file is required;
- `'Duplicate slide'` or `'Add slide below'` cannot be driven
  deterministically through the real menu UI;
- the verified fit cannot be performed deterministically — do NOT
  substitute an unverified shortcut or any API call;
- the console listener cannot be registered read-only, or deriving
  `…_saveErrorObserved` requires anything beyond the bound exact
  substring;
- the persisted time series cannot be read with the same persistence
  channel the settled helper uses, or requires new
  credentials/endpoints;
- Flow B's `addFrameId` cannot be captured within the bounded poll
  (classify `supersession-observation-unsound` and STOP before
  Duplicate only if the row itself failed; a missing label id with a
  present row is recorded, classified via rule 1, and the flow
  completes for evidence);
- any observation requires force click, `dispatchEvent`, coordinate
  workaround (beyond the bound empty-region click), direct callback
  invocation, direct product-state mutation, or a per-test timeout
  above 300 000 ms;
- classification drifts across the three stable runs;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix);
- ANY fix, guard, instrumentation seam, or production improvement
  seems "obvious" — this patch observes; the census #2 fix is gated
  on its result.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 27/27 fences + all absence gates + one-file scope,
re-runs all §6 modes, extracts the twenty-six-field annotation from a
fresh JSON reporter run, verifies the time series is genuine —
monotonic elapsedMs, plausible cadence — the console-listener
derivation uses the exact bound substring, the verified-fit evidence
is genuine in all three flows, every field observation-derived, the
classification follows the §3 order, and the prohibited actions are
never driven); explicit PASS required; NO commit before PASS; then
commit with the bound message and push; Fable closes, rules on the
save-path mechanism, and decides whether the census #2 fix can be
authorized with a three-flow regression obligation.

**Bound commit message (verbatim):**
`test(e2e): characterize drawing scene save supersession (PATCH-083)`

## 11. Required final report

New file + blob ID; all twenty-six annotation fields with observed
values per run; per-flow label-id sets pre/post fit + zoom-display
values; per-flow FULL persisted time series + settled sets +
`addFrameId`s; all captured console-error texts; the derived
classification and what it implies for the save-path owner and the
census #2 fix's regression scope; all §6 gate totals; 27-fence result
+ all absence gates + one-file scope proof; cleanup proof across
sixteen prefixes; production-import grep; commit hash + push status
after PASS.

## 12. Closure record (CTO, 2026-07-18)

**Landed:** commit `0683b965d3821088a4ed9812693f408e0dcfa280`
(`test(e2e): characterize drawing scene save supersession
(PATCH-083)`), single new file
`e2e/characterization/drawing-save-supersession.spec.ts`, blob
`c6cc4feaa6f2320932232a993b70cda73c9e584c` (993 insertions).
Independent Sonnet review: **PASS, freshly re-derived twice** (both
passes: 27/27 fences, all absence gates, one-file scope, three stable
runs each, zero field drift, zero classification drift).

**Final twenty-six-field diagnosis (identical every run, both
passes):** Flow A (Add only): addRowAppeared/zoomToFitApplied/
addFrameLiveAfterFit/addEverPersisted/addPersistedSettled all TRUE,
saveErrorObserved FALSE. Flow B (rapid Add→Duplicate):
addRowAppeared/duplicateRowAppeared/zoomToFitApplied/
addFrameLiveAfterFit/duplicateFrameLiveAfterFit TRUE;
addEverPersisted/addPersistedSettled/duplicateEverPersisted/
duplicatePersistedSettled FALSE; saveErrorObserved FALSE. Flow C
(Duplicate only): duplicateRowAppeared/zoomToFitApplied/
duplicateFrameLiveAfterFit TRUE; duplicateEverPersisted/
duplicatePersistedSettled FALSE; saveErrorObserved FALSE.
**`classification: add-superseded-by-rapid-duplicate`**.

**Final diagnosis:** isolated Add persists reliably; rapid
Add→Duplicate prevents the Add frame from appearing in ANY persisted
snapshot; Duplicate never appears in persistence in either Duplicate
flow; no exact production drawing-save error observed; no transient
Duplicate persistence observed at the bound 1-second cadence; the
live scene is valid before the failure; the defect boundary is
narrowed to the debounced save/persistence path. "Superseded" is a
behavioral label, not proof of the exact mechanism. No production fix
implemented.

**Prefix correction (bound):** the §4/§6/§8 single bound prefix
`patch-064-harness-patch-083-supersession-` was NOT used by the
landed spec. Actual prefixes (bound here as the authoritative
record): `patch-064-harness-patch-083-flow-a-`,
`patch-064-harness-patch-083-flow-b-`,
`patch-064-harness-patch-083-flow-c-` — one per disposable board.
Corrected total tracked cleanup-prefix count: **18** (fifteen prior +
these three), not 16. Sonnet reviewed and accepted this as a
non-blocking governance-wording mismatch, not a candidate defect; all
prefixes verified zero at both review passes.

**Timing evidence (bound):** Add→Duplicate interval independently
trace-measured twice: ~1.77 s and ~1.75 s — comfortably within the
≤5 s rapid bound. Flow A's Add first appeared in persistence at
~2.1 s (matching the ~2 s debounce plus write latency — strong
corroboration that Flow A's save fired on the debounce). Flows B and
C remained at the seeded two-frame set for the ENTIRE ≥20 s window
(21 samples, one distinct snapshot); final stable tails ≥6 s
everywhere.

**PATCH-080 comparison:** 080 proved isolated Add persists after its
own settlement window; Flow A reproduces that exactly; rapid
Add→Duplicate changes the outcome and suppresses the Add save;
isolated Add is NOT broken.

**PATCH-082 comparison:** 082 proved valid live Duplicate frame and
child content in both flows; 083 proves that valid live content
still fails to become durable; the remaining boundary is between
live scene mutation and persistence.

**Closure-time read-only discovery (recorded for PATCH-084):** the
save chain is `saveDrawingSnapshot` → `onUpdatePadlet` =
`handleDrawingLayoutUpdatePadlet` (`CanvasClient.tsx` ~4948) →
`updateDrawingLayoutPadlet` (`useCanvasData.ts` 566–590) →
`canvas.updatePostFields` (`lib/domain/canvas/posts.ts` 660–665) →
`SupabasePostsRepository.updateFieldsById`
(`lib/infra/canvas/postsRepository.ts` 142–150) →
`supabase.from('padlets').update(fields)`. A RESOLVED Supabase error
becomes `code:'unavailable'` and takes `updateDrawingLayoutPadlet`'s
**silent rollback branch (NO logging of any kind)**; only a THROWN
'unknown' logs — and logs `'Failed to update padlet:'`, a DIFFERENT
string from DrawingLayout's `'Failed to save drawing to master
padlet'` (which can never fire through this path, since
`updateDrawingLayoutPadlet` never rejects). Additionally
`updateDrawingLayoutPadlet` silently returns without writing if the
target id is missing from `padletsRef` (line 568). PATCH-083's
`saveErrorObserved:false` is therefore correct but WEAKER than it
appears: a resolved-error write failure was invisible to its bound
substring. This does NOT reopen 083 (it observed exactly what it
bound); it defines 084's question.

**Final gates:** 083 spec 2/1/2, three stable runs (×2 review
passes); carried: divergence 2/1/2, clone-shape 2/1/2, add-dup
2/1/2, rename-state 2/1/2, slide-duplication 2/1/2, menu-pointer
2/1/2, harness-cleanup 2/1/2, presentation approved totals,
duplication 2/1/2, line-bridge approved totals; deterministic:
slideOrder 7/1, clonedPostMetadata 9/1, focused drawing 59/2, full
Vitest 448/43, typecheck/boundaries/`git diff --check`/sequential
verify+build green. Cleanup: 18 tracked prefixes zero; Board A
cleaned before B before C; no Remove/deletion/direct DB write; no
artifacts; port 3000 free. (Auth-staleness incident reproduced a
seventh and eighth time during the two review passes; sanctioned
`--project=setup` refresh resolved both; environmental,
non-blocking.)
