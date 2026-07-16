# PATCH-070 - Restore Fullscreen Native Above-Band Raster (staged, diagnosis-first)

**Status:** AUTHORIZED — **Stage 1** (composition planner lossless band
closure; see §0.2 Amendment 2). Stage 0 is DONE (commit `b9b754c`, row
**F4**). Stage 0B is DONE (commit `514b1d9`, row **G1d**, Sonnet PASS).
Stage 1 is bound to §0.2.5's design EXACTLY; §5's original per-row designs
are superseded for the F4/G1d path by Amendment 2.

**Base commit (bind, verify before editing):**
`05e913ef84c802b999bc4411d960873e4b21bb23`
(`test(drawing): characterize blank native slide raster (PATCH-069)`)

**Bound commit messages (use verbatim):**

- Stage 0: `test(drawing): probe fullscreen above-band export runtime (PATCH-070 Stage 0)`
- Stage 1 (reserved; re-bound by the Stage-1 amendment):
  `fix(presentation): restore fullscreen native raster (PATCH-070)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before each stage's commit).
**Closure:** Fable (CTO) after each stage lands.

---

## 0.1 Amendment 1 (2026-07-16) — Stage 0 closed at F4; Stage 0B authorized

### 0.1.1 Stage 0 result (DONE, commit `b9b754cefccd6569ed4e5ce858090609c6b76567`)

Bound Stage-0 message used verbatim. Sole file:
`e2e/characterization/drawing-presentation.spec.ts` (now at
`ee2d3adb968051cd7d761d6bbcc3b67439046a58`). Review history: initial Sonnet
review PASS WITH REQUIRED CHANGES (blocker: the test-owned pixel-analysis
canvas contaminated production-export attribution); corrected via explicit
`markHarnessCanvas` provenance + hard exclusion; focused re-review PASS,
reproduced identically in two fresh dev-server sessions.

Proven row: **F4** — after excluding test-owned canvases, exactly one
production export canvas exists in the fullscreen window (the below band,
stack-fingerprinted into the fork's `exportToCanvas`), `aboveExportBegan =
false`, no above-attributable `toDataURL` call/return/throw, no above-band
img mount (raw MutationObserver timeline — not only final DOM state),
persisted scene and Node-side plan stable before/after
(`nativeAboveIds=[text-landscape, shape-landscape]`, padlet indexes [2,3]).
F4 is a STOP row: **no production fix may be derived from F4 alone.**

### 0.1.2 Live-runtime census (fresh, at base `b9b754c`)

The runtime data path, end to end:

- **Presentation start** — `handleStartPresentation`
  (`DrawingLayout.tsx:1503-1508`): pure state
  (`setPresentationStartId`/`setPresentationActive`); no scene snapshot, no
  scene mutation. `FullscreenPresentation` mounts inline (`:3047-3056`) with
  `slides={frames}` and `runtimeHelpers={runtimeSlideHelpers}`.
- **Runtime props** — `FullscreenPresentation.tsx:229-231` calls
  `runtimeHelpers.getSceneElements()/getPadlets()/getFiles()` on every
  render; the helpers (`DrawingLayout.tsx:1916-1920`) read
  `runtimeSceneElementsRef/runtimePadletsRef`, re-synced from state on every
  DrawingLayout render (`:695-697`). `RuntimeSlideRenderer` receives the FULL
  element array (no precomputed subset) plus `slide` (a `frames` entry,
  `:1934-1945`, derived from the same `elements` state).
- **THE LOAD-BEARING WIRING FACT** — `elements` state starts `[]`
  (`DrawingLayout.tsx:671`) and is committed from Excalidraw's change
  callback ONLY when the ACTIVE ELEMENT COUNT changes (`:1083-1089`,
  `activeElementCountRef` gate — an explicit 60fps-GC optimization). Any
  Excalidraw-side change that preserves the count — reordering, fractional
  index normalization, frame-membership normalization, in-place element
  mutation, the documented one-shot embeddable refresh (`updateScene`,
  autosave-suppressed) — is NEVER committed to React state, never
  re-renders DrawingLayout, never regenerates render signatures, and never
  invalidates cached thumbnails. The state array's CONTENT can therefore
  diverge from what the thumbnails captured, and from the true live scene,
  without any observable React-side signal.
- **Runtime plan** — `RuntimeSlideRenderer.tsx:53-61`: `useMemo` over
  `[slide?.id, sceneElements, allPadlets]` calling the real
  `planSlideComposition`. Recomputes at the Next-click (slide id changes),
  reading whatever the state array holds at that instant.
- **Band arithmetic is order-sensitive at two points** —
  `resolveSlidePadlets.ts:15` assigns each padlet embeddable `zIndex` = its
  RAW INDEX in the live input array (membership: `frameId` match, else
  geometric overlap, `:34`); `planSlideComposition.ts:39-47` band-splits
  native members by live `findIndex` against `firstPadletIndex`/
  `lastPadletIndex`. Native membership requires live `frameId ===
  slideFrame.id` and `!isDeleted` (`:8-15`).
- **Export effect** — `RuntimeSlideRenderer.tsx:99-149`: guards are exactly
  `!slide || !compositionPlan` (top) and
  `compositionPlan.nativeAboveElements.length > 0` (`:130`). Both band
  export chains are created SYNCHRONOUSLY in one effect body — no await, no
  cleanup point, no state read between them. Render sequence: render → memo
  plan → effect (token claim → below chain created → above chain created if
  non-empty) → async resolutions gated by `!cancelled && canvas && token`.
- **No remount hazard** — `RuntimeSlideRenderer` is rendered without a
  `key` (`FullscreenPresentation.tsx:249-256`); slide navigation re-renders
  the same instance.

### 0.1.3 Reconciling F4 with source — row-by-row

- **F4-C (guard prevents invocation): RULED OUT as an independent row.**
  The only pre-invocation guards are the two above. Stage 0 proved the
  below export ran and committed, so `slide` and `compositionPlan` were
  truthy; the sole remaining guard IS the empty-above condition — F4-C
  collapses into F4-A/F4-B.
- **F4-D (cleanup/cancellation before the above call is created): RULED
  OUT.** Both chains are created in the same synchronous effect body;
  React cannot run cleanup mid-body. The below chain's existence (Stage 0)
  proves the body executed past the above branch.
- **F4-E (slide identity/key remount): RULED OUT.** No `key`; parent stays
  mounted (`presentationActive` constant during the window).
- **F4-F (StrictMode double-effect or other): RULED OUT as a cause of
  "never began".** A double-invoked effect schedules both chains twice;
  it cannot schedule only the below chain.
- **F4-A (live plan has `nativeAboveElements=[]` at every effect run):
  SUPPORTED and not yet discriminated.** Since below ran and above never
  began, every effect run in the window had an empty above band. Consistent
  live-input shapes (each individually possible under the `:1083-1089`
  stale-state gate): (a) live array order diverged so the natives sit
  strictly between the padlet indexes (mid-band gap live — the only order
  shape also consistent with the BLANK below PNG); (b) natives' live
  `frameId` no longer equals `frame-landscape` (Excalidraw normalization);
  (c) natives absent from the state array; (d) `resolveSlidePadlets`
  resolves different embeddable indexes live (e.g., `emb-slide-b` at a
  shifted index widening the padlet range).
- **F4-B (stale input array — populated plan never reaches the effect):
  SUPPORTED and not yet discriminated.** The count-gated `setElements`
  makes a stale state array a first-class mechanism; the thumbnail's
  correct render (cached from panel-open time) vs. the fullscreen failure
  (computed at Next-click) brackets a mutation window that React state
  never observed.

**Which mechanism is live is NOT source-determinable**, and the
discriminating values (the plan's inputs and outputs as computed INSIDE
`RuntimeSlideRenderer` at fullscreen time) are React-local: nothing exposes
the live scene to the browser (grep: no `window` handle in
`DrawingLayout.tsx`), and no DOM attribute reflects plan counts. Test-only
observation cannot reach them. Per §4-alternatives, a narrow
development-only diagnostic in `RuntimeSlideRenderer.tsx` is REQUIRED.

### 0.1.4 Stage 0B — Observe Live Runtime Composition and Effect Invocation (AUTHORIZED)

Diagnosis-only. **No fix of any kind rides this stage.**

**Allowed files (exactly two):**

| File | Pre-edit hash (bind) | Role |
|---|---|---|
| `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` | `a407cccc230ca74a36a443b5f701767856754230` | development-only diagnostic record ONLY (shape bound in §0.1.5) |
| `e2e/characterization/drawing-presentation.spec.ts` | `ee2d3adb968051cd7d761d6bbcc3b67439046a58` | read the record, map to §0.1.6, annotate |

**Bound Stage-0B commit message (verbatim):**
`test(drawing): observe live slide composition inputs (PATCH-070 Stage 0B)`

### 0.1.5 Bound diagnostic shape (RuntimeSlideRenderer.tsx)

- Every diagnostic statement is guarded by a single module-level constant
  `const DEV_RUNTIME_SLIDE_DIAGNOSTICS = process.env.NODE_ENV !==
  'production';` (the established pattern). Production builds must be
  byte-behavior-identical: no record, no global, no timing change.
- Records push synchronously (allocation + `Array.push` only) into a
  dev-only global `window.__fable5RuntimeSlideDiagnostics` (array), capped
  at 200 entries (drop beyond cap); no network, no persistence, no console
  requirement, no `CustomEvent` needed.
- Exactly four record kinds, at exactly four insertion points:
  1. `plan-computed` — inside the existing `useMemo` callback (`:53-61`),
     after `planSlideComposition` returns: `{ kind, timestamp, slideId,
     sceneElementCount, sceneElementIds (capped 50), nativeMemberSummaries
     (for the seeded native ids when present: id, frameId, isDeleted, x, y,
     width, height), resolvedPadlets ([{embeddableId, zIndex}]),
     nativeBelowIds, nativeAboveIds, frameElementFound }`.
  2. `effect-run` — inside the export effect (`:99-149`) immediately after
     the token claim: `{ kind, timestamp, token, slideId, belowCount,
     aboveCount, aboveBranchTaken, scale }`.
  3. `effect-cleanup` — inside the existing cleanup function: `{ kind,
     timestamp, token }`.
  4. `band-commit` — inside each existing `.then`, recording the guard
     outcome WITHOUT changing it: `{ kind, timestamp, token, band
     ('below'|'above'), committed, suppressedBy ('cancelled'|'stale-token'|
     'null-canvas'|null) }`.
- Prohibited: any change to guards, deps, state, JSX, ordering, or
  control flow; any `await`; any read that mutates; monkey-patching React,
  Promise, `useEffect`, or imported modules; logging credentials or scene
  text content beyond the two seeded native ids' geometry fields listed
  above. Element ids and numeric geometry only.
- The diagnostic is temporary: the eventual Stage 1 amendment either
  removes it or explicitly converts it; it may not silently persist.

**Spec side:** after the existing Stage-0 landscape window, read the global
via `page.evaluate`, filter records for `slideId === 'frame-landscape'`,
assert exactly one §0.1.6 row via fixed assertions, and attach a
`patch-070-stage0b-probe` annotation carrying the raw records (capped) plus
the selected row. All Stage-0 and PATCH-069 assertions remain intact and
green (the defect is still present in Stage 0B).

### 0.1.6 Stage 0B decision table (bind; exactly one row or STOP)

| Row | Meaning | Bound discrimination (from `plan-computed`/`effect-run` records for the landscape slide) |
|---|---|---|
| **G1a** | live mid-band order divergence (F4-A/a) | natives present with correct `frameId`, but their live indexes fall inside `[min,max]` of `resolvedPadlets[].zIndex`; `nativeAboveIds=[]`, `nativeBelowIds=[]` |
| **G1b** | natives absent from the live array (F4-A/c) | seeded native ids not in `sceneElementIds` / no `nativeMemberSummaries` |
| **G1c** | native `frameId`/deletion divergence (F4-A/b) | natives present but `frameId !== 'frame-landscape'` or `isDeleted === true` |
| **G1d** | padlet-resolution divergence (F4-A/d) | natives present + correct, but `resolvedPadlets` indexes/membership differ from `[2,3]` such that the band split empties |
| **G2** | stale input array (F4-B) | `plan-computed` inputs contradict the SAME session's proven-good thumbnail content in a way attributable to the `:1083-1089` count gate (e.g., ids/order matching an earlier scene generation), with `effect-run.aboveCount === 0` throughout |
| **G3** | anomaly: `aboveCount > 0` and/or `aboveBranchTaken === true` at any landscape `effect-run` | contradicts Stage 0 → STOP, report, no classification |
| **G4** | another narrow deterministic mechanism | only with explicit record evidence naming it |

Ambiguous, zero-row, or multi-row results → STOP. Each G-row maps to a §5
design class ONLY via the next named amendment; G1a/G1d may implicate the
planner or the caller wiring, which would require a STOP-and-redesign since
`planSlideComposition.ts` and `DrawingLayout.tsx` remain fenced.

### 0.1.7 Stage 0B stop conditions (additional to §10)

- any production-visible behavior change from the diagnostic (guards,
  timing, rendering, state);
- the diagnostic requires touching any file beyond the two allowed;
- records are empty/absent while the fullscreen window demonstrably ran;
- G3 or any unlisted/multi-row result;
- the temptation to fix anything in the same stage.

### 0.1.8 Fences and gates for Stage 0B

The 43-path immutable fence set of §8 is UNCHANGED and was re-verified
43/43 at base `b9b754c`. All §11 gates apply to Stage 0B verbatim
(including `tsc`, boundaries, focused 51/2, full 424/41, setup 1, line 4,
presentation 2 passed / 2 approved skips, credential-off 4+4, cleanup
zeros, zero production imports, sequential verify/build). The §9
environment contract and §12 review flow apply verbatim; Sonnet must
additionally verify the diagnostic's §0.1.5 shape compliance and
production-inertness.

---

## 0.2 Amendment 2 (2026-07-16) — Stage 0B closed at G1d; Stage 1 authorized (composition planner)

### 0.2.1 Stage 0B result (DONE, commit `514b1d9ab8f387d3a39d39ed7a13ae87fb36a07e`)

Bound Stage-0B message used verbatim; Sonnet PASS (independent gates, build
inspection proved the diagnostic minifies to a hard no-op in production).
Files landed: `RuntimeSlideRenderer.tsx` → `c4b4b80fa5d3fb71d0874db74580ceee83012b86`,
`drawing-presentation.spec.ts` → `bbeb16c14cdcbc5c1c7be7eca50cabb1de8c33f8`.

Proven row: **G1d** (single-row match, fixed assertions). Live landscape
plan input: the 7 seeded elements in persisted order PLUS one live-only
embeddable `177f9190-e7c3-4dd0-bc4a-b616305f6e97` (type `embeddable`,
`frameId: null`, `isDeleted: false`, link `padlet://a12ed29e-…`, live scene
index 7). Live resolved padlet zIndexes `[2,3,7]` vs Node-side `[2,3]`;
both seeded natives (indexes 4, 5) fall strictly inside the widened
interval → `nativeBelowIds=[]`, `nativeAboveIds=[]`, above branch false,
zero above commits; token/cleanup timeline clean; persisted scene and
Node-side plan stable throughout. G1a excluded by padlet-COUNT divergence
(3 vs 2), G1b/G1c by native presence/validity, G2 by state freshness
(count-gate passed: 7→8 IS a count change), G3 absent.

### 0.2.2 Origin census of the live-only embeddable (fresh, at base `514b1d9`)

The element's full lifecycle, traced to source:

- **Identity:** it represents padlet `a12ed29e-…` = the harness's
  **Container C** (`drawingBridgeHarness.ts:304-315`: real `container` row,
  position 160,460, size 320×220, one child note) — a REAL padlet, seeded
  in the DB, that `seedPresentationScene` (`:472-480`) deliberately gave
  NO persisted scene embeddable (only containers A/B and the uploaded
  image got one).
- **Creation + insertion:** DrawingLayout's padlet↔scene reconciliation
  effect (`DrawingLayout.tsx:1596-1762`) computes `missingEmbeddables` =
  every non-drawing root padlet with no live scene embeddable
  (`:1627-1629`) and inserts one via
  `createEmbeddableElementForPadlet` (`:1540-1574`) — **`frameId: null`
  by construction** (`:1565`), positioned at the padlet's stored
  `position_x/y`, fresh random element id per session (hence `177f9190…`
  is session-local). This is the documented self-healing scene sync, not
  a test artifact.
- **State visibility:** the synthetic `updateScene` fires `handleChange`;
  the count gate (`:1086-1089`) PASSES because 7→8 is a count change, so
  React state (and both presentation data paths — thumbnail getters
  `:1903-1907` and runtime refs `:695-697`) truthfully hold 8 elements.
  The `:1083-1089` count-gate staleness mechanism (F4-B/G2) was NOT the
  live mechanism.
- **Persistence exclusion — intentional:** the reconciliation write sets
  `isSyncingEmbeddablesRef.current = true` (`:1746`) and
  `commitToHistory: false` (`:1753`), so autosave is suppressed by design
  (the standing guardrail against sync-triggered save cascades). The
  element persists only when a later REAL user edit saves the scene; the
  post-run DB re-fetch showing 7 elements is therefore correct behavior,
  not data loss.
- **Cleanup:** the same effect's orphan sweep (`:1615-1625`) removes
  scene embeddables whose padlet is gone/child/drawing — the inverse
  direction of the same invariant.
- **Membership:** with `frameId: null`, slide membership comes from
  `resolveSlidePadlets.ts:29-34`'s geometric-overlap fallback; Container
  C's bbox (160..480 × 460..680) lies inside the landscape frame
  (0,0,1280,720), so it resolves onto that slide — the same rule any
  legitimate unframed post uses.

**Ruling: the element is LEGITIMATE.** It is the canonical live
representation of a real board post (not a duplicate — `a12ed29e` has
exactly one live embeddable; not a placeholder, refresh copy, stale
artifact, or upload helper). Its absence from the persisted scene is
intentional and transient. It SHOULD exist during presentation: the live
padlet layer correctly shows Container C on the landscape slide. The
fixture's incomplete scene seeding is not a fixture bug — it reproduces a
real product state (any padlet created outside the drawing scene, or
before a scene save lands) and stays byte-untouched as the regression
fixture for this defect.

### 0.2.3 Ownership resolution — one defect, owned by the planner

- **A. Runtime input/state ownership — NOT the owner.** Presentation must
  consume the live element array as-is: it is the product truth, and the
  extra embeddable is real content. There is no invalid artifact to
  filter; filtering unpersisted embeddables would hide every freshly
  reconciled/created post from presentation. No DrawingLayout change is
  authorized.
- **B. Padlet resolution — NOT the owner.** `resolveSlidePadlets`
  correctly applies the membership model (frameId match, else geometric
  overlap) to a legitimate element. Scene elements carry no persistence
  provenance, and none should be invented: excluding "runtime-only"
  embeddables would break legitimate unframed padlets and freshly created
  posts. It does not dedupe duplicate links (measured, §0.2.4 S5) — noted,
  but duplicates cannot arise from DrawingLayout's guarded paths and no
  resolver change is authorized.
- **C. Composition planning — THE owner.** Given this legitimate input,
  `planSlideComposition.ts:39-47` drops every native member whose index
  falls strictly between `firstPadletIndex` and `lastPadletIndex` from
  BOTH bands — silently. The defect is GENERIC (any native between two
  padlets; measured S3), strictly broader than the fixture, and affects
  fullscreen AND thumbnail identically (same shared planner). A second
  lossy shape lives in the same lines: resolved padlet zIndexes are
  computed over `activeElements` while the native band split uses raw
  `sceneElements.findIndex` — a deleted element preceding a native
  inflates its raw index and can drop it outright (measured S7).

**Defect count: ONE (Task-4 outcome 2).** "Defect A" (live-only embeddable
enters presentation) is not a defect — that behavior is correct. No split
patch; no further diagnosis stage; the origin and legitimacy are fully
determined above.

### 0.2.4 Measured planner scenario census (CTO dry-run of the REAL
`planSlideComposition` at base `514b1d9`; scratch runner deleted after use)

| # | Scene (active order) | resolved z | below | above | DROPPED |
|---|---|---|---|---|---|
| S1 | native, padlet, native | [2] | n-before | n-after | — |
| S2 | native, padlet, padlet, native | [2,3] | n-before | n-after | — |
| S3 | padlet, native, native, padlet | [1,4] | — | — | **n-mid1, n-mid2** |
| S4 | padlet, padlet, native, native, unframed-overlap padlet (live G1d shape) | [1,2,5] | — | — | **n1, n2** |
| S5 | padlet, native, dup-link padlet (same padlet id twice) | [1,3] | — | — | **n-mid** |
| S6 | deleted el, padlet, native | [1] | — | n-after | — (raw-index bias, correct here) |
| S7 | deleted el, native, padlet | [2] | — | — | **n-real** (domain mismatch) |

S1/S2/S6 are lossless today and must stay byte-equal in outcome. S3–S5 and
S7 are the defect surface. None of these scenarios exist in current unit
coverage (`presentationBridge.test.ts` census: no mid-band, no
range-widening, no duplicate-link, no deleted-element-shift test) — the
bound unit tests of §0.2.6 close that gap inside Stage 1 itself; no
separate characterization patch is needed because the lossy pre-fix
behavior is the authorized change, not a behavior to freeze.

### 0.2.5 Stage 1 — Composition Planner Lossless Band Closure (AUTHORIZED)

**This amendment is the §5-F4 "planner ruling" and the §0.1.6
STOP-and-redesign outcome: census has now proven planner output wrong on
legitimate live input, so `planSlideComposition.ts` moves from fenced to
authorized-change for exactly this design.**

Bound design (exactly this; no latitude on semantics):

1. Inside `planSlideComposition` only: compute ONE index domain — the
   position of each element within the SAME `activeElements` array passed
   to `resolveSlidePadlets` (e.g., one `Map<id, activeIndex>` built once).
   The raw-`sceneElements` `findIndex` calls are removed.
2. Band rule: `nativeBelowElements` = native members with
   `activeIndex < firstPadletIndex`; `nativeAboveElements` = ALL other
   native members (`activeIndex > firstPadletIndex`; equality is
   impossible — padlet indexes belong to embeddables). Mid-interval
   natives therefore raster in the ABOVE band.
3. Invariant (bind as a unit test): for every input,
   `nativeBelowElements ∪ nativeAboveElements` = the full
   `nativeFrameElements` set — **no native member is ever dropped**.
4. `SlideCompositionPlan` shape unchanged; `resolveSlidePadlets` unchanged;
   the zero-padlet early return unchanged; element order within each band
   preserved (activeElements order).
5. Required scenario outcomes after the fix: S1/S2/S6 identical to
   §0.2.4; S3 → above = [n-mid1, n-mid2]; S4 → above = [n1, n2];
   S5 → above = [n-mid]; S7 → above = [n-real]. On the live fixture:
   landscape natives land in the above band and the above PNG mounts with
   content.

Layering semantics, stated honestly: a mid-interval native paints above
ALL live padlet cards, not interleaved between them. Exact interleaving is
unrepresentable in the two-raster model; the above band is chosen because
it guarantees content VISIBILITY (P3 — the current behavior is total
loss; a below-band assignment could hide a native entirely behind a card
it legally sits above). Scenes that are lossless today render identically.

Rejected explicitly: full multi-band/segmentation plan (changes the plan
shape and both consumers incl. the fenced thumbnail files — broad
composition architecture, its own future patch if ever needed); any
resolver provenance rule; any DrawingLayout/runtime filtering; any
consumer-side compensation in `RuntimeSlideRenderer.tsx`; fixture edits.

Thumbnail note: thumbnail FILES stay fenced and byte-untouched; thumbnail
BEHAVIOR for mid-band scenes changes with the shared planner — that is the
same defect healed at its root, and the fixture's N5 assertions remain
green either way (7-element plan: natives above, unchanged; 8-element
plan: natives now above instead of dropped).

### 0.2.6 Stage 1 allowed files (exactly four) and bound requirements

| File | Pre-edit hash (bind, at `514b1d9`) | Authorized change |
|---|---|---|
| `components/presentation/slide-renderer/planSlideComposition.ts` | `9524e6397e623fef905f213e80953b2a22e2423d` | the §0.2.5 design, nothing else |
| `lib/infra/drawing/presentationBridge.test.ts` | `dff458de747d673868b1eae2b695e41b4c3424d2` | ADDITIVE only: new `it` blocks covering S1–S7 outcomes + the no-drop invariant via the existing `characterizeSlideComposition`; no existing test modified or deleted |
| `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` | `c4b4b80fa5d3fb71d0874db74580ceee83012b86` | Stage-0B diagnostic REMOVAL ONLY — final file must be byte-identical to `a407cccc230ca74a36a443b5f701767856754230`; restore via `git cat-file blob b9b754c:components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` written binary (never `git checkout` — CRLF smudge, see LESSONS), then `git hash-object` must print `a407cccc…` |
| `e2e/characterization/drawing-presentation.spec.ts` | `bbeb16c14cdcbc5c1c7be7eca50cabb1de8c33f8` | evolve to the §7 fixed-state regression (details §0.2.7) |

Unit-test placement is FORCED: vitest's include globs are
`lib/domain/**/*.test.ts` + `lib/infra/**/*.test.ts` (measured at
authoring) — a test file under `components/**` would silently never run.
`presentationBridge.ts` itself stays fenced: `characterizeSlideComposition`
already exposes `nativeBelowIds`/`nativeAboveIds`/`resolvedPadlets`, which
is sufficient for all seven scenarios.

Diagnostic removal policy (bind): remove `DEV_RUNTIME_SLIDE_DIAGNOSTICS`,
the record type, `recordRuntimeSlideDiagnostic`, all four call sites, and
the spec's diagnostic reads/classification block (`__fable5RuntimeSlideDiagnostics`
must have zero references in production code after Stage 1; the byte-identity
gate above enforces the production side maximally). No conversion to a
permanent contract is approved.

**Bound Stage-1 commit message (verbatim, unchanged from §12):**
`fix(presentation): restore fullscreen native raster (PATCH-070)`

### 0.2.7 Stage 1 required behavior and regression

Production behavior: §7 applies verbatim (above-band PNG present, loaded,
non-zero dims, native text+shape visible; below band unchanged; thumbnail
N5 unchanged; persisted scene untouched; ordering untouched).

E2e evolution (sole spec file): the N2-era defect assertions and the
Stage-0/0B probe classifications that assert the DEFECT state (`F4` row
selection, `G1d` row selection, `aboveExportBegan=false`, absent above
img, all-zero native raster counts) FLIP or are superseded by fixed-state
assertions; `patch-069-classification` evolves into
`patch-070-native-raster-fix` exactly as §7 specifies, additionally
recording: Stage 0 row F4, Stage 0B row G1d, the extra embeddable's
padlet id + provenance (reconciliation-inserted, unpersisted), live padlet
zIndexes, and the post-fix above-band evidence. Harness-canvas provenance
plumbing (`markHarnessCanvas`) and any probe evidence the regression still
needs MAY remain; the Stage-0B diagnostic reads MUST go (§0.2.6).
Persisted-scene and Node-side-plan invariants stay green: the Node plan
over the persisted 7-element scene is UNCHANGED by the fix (natives above,
range [2,3] — no mid-interval natives there).

Unit gates: focused Vitest becomes 51+N passed / 2 skipped and full
becomes 424+N passed / 41 skipped, where N = the number of added `it`
blocks (N ≥ 8: seven scenario tests + the no-drop invariant; exact N is
declared in the implementation report and re-derived by the reviewer —
these two totals are DERIVED baselines, not measured; a mismatch against
the implementer's own declared N is a STOP, not an improvisation point).
All other §11 gates and totals carry unchanged (setup 1, line 4,
presentation 2 passed / 2 approved skips, credential-off 4+4, tsc,
boundaries, sequential verify/build, cleanup zeros, zero production
imports, §9 environment contract, §12 review flow with Sonnet PASS
required before commit).

### 0.2.8 Stage 1 fences (42 unique immutable paths)

Delta from the §8 43-path set, all other 41 entries carried verbatim and
re-verified 43/43 at base `514b1d9` during this amendment's census:

- REMOVED (now authorized-change): `components/presentation/slide-renderer/planSlideComposition.ts`,
  `lib/infra/drawing/presentationBridge.test.ts`
- ADDED (plan-shape loophole closed):
  `components/presentation/slide-renderer/types.ts a2825c8b4438cbb29e2ee1df2f94c1d3a4ff5fd5`

`RuntimeSlideRenderer.tsx` and `drawing-presentation.spec.ts` remain
authorized-change (per-file bindings in §0.2.6). `resolveSlidePadlets.ts`
(`5dc7aa98…`), `DrawingLayout.tsx` (`93e5900f…`), all fork files, all
thumbnail files, and the harness remain IMMUTABLE.

### 0.2.9 Stage 1 stop conditions (additional to §10, which applies less
its now-satisfied "planner change appears necessary" row — that row is
superseded by this authorization; every other §10 row stands)

STOP immediately, report, do not commit, if:

- the fix requires touching ANY consumer (`RuntimeSlideRenderer.tsx`
  beyond the bound byte-identity restoration, `createSlideRenderer.tsx`,
  `mergeSlideLayers.ts`) or the plan shape in `types.ts`;
- `resolveSlidePadlets.ts` requires any change;
- any S1/S2/S6 outcome changes;
- the above-band PNG is STILL absent after the planner fix on the live
  fixture (a second defect — do not bundle a further fix);
- thumbnail N5, persisted-scene, or Node-plan invariants break;
- `RuntimeSlideRenderer.tsx` cannot reach byte-identity `a407cccc…`;
- any existing test in `presentationBridge.test.ts` must be modified
  (additive-only violation);
- frame-order, AI-image, or uploaded-image scope appears.

---

## 1. Purpose — exactly one subsystem

PATCH-069 proved (classification **N2**, live evidence, Sonnet PASS):

- persisted scene matches seed exactly (text `text-landscape` scene index 4,
  shape `shape-landscape` scene index 5; visible, non-deleted, opaque,
  non-zero size);
- the pure composition plan over the **persisted** scene returns
  `nativeBelowIds=[]`, `nativeAboveIds=[text-landscape, shape-landscape]`,
  padlet range 2..3, expected native band `above`, nothing dropped;
- fullscreen shows exactly one loaded data PNG — the **below** band
  (1280×720, blank for the native regions); the required **above-band PNG
  never materializes in the DOM**;
- the thumbnail surface (N5) renders the same native content correctly,
  proving the content is exportable.

PATCH-070 restores the fullscreen above-band raster. The census below
(§2) narrows the failure to the fullscreen runtime path but **cannot
discriminate the exact mechanism from source alone** — three live
mechanisms survive. Per governance, this patch is therefore **staged**:
Stage 0 adds a deterministic, test-only runtime probe that maps the live
behavior onto exactly one decision row (§3); a named amendment then
authorizes the row-bound smallest fix (§5) as Stage 1.

No production file may change in Stage 0. No fix may be attempted before
the amendment.

---

## 2. Census (fresh, 2026-07-15, at base `05e913e`; all files below are
fenced except the two authorized-change files in §6)

### 2.A RuntimeSlideRenderer lifecycle
(`components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`,
233 lines, hash `a407cccc…`)

- Props (`:12-19`): `slide: FrameSlide | undefined`,
  `sceneElements: readonly any[]`, `allPadlets: Padlet[]`, `files: any`,
  `vpW`, `vpH`.
- Composition plan (`:53-61`): `useMemo` calling the real
  `planSlideComposition(slide, sceneElements, allPadlets)`; deps
  `[slide?.id, sceneElements, allPadlets]` (array identity).
- State (`:42-45`): `belowPng`, `abovePng` (both `string | null`),
  `hasCommittedInitialBase`, `isPadletLayerReady`.
- Export effect (`:99-149`): deps `[compositionPlan, files, scale]`.
  Each run claims a monotonic token (`renderTokenRef`, `:49`, `:104`) and
  a per-run `cancelled` flag; cleanup sets `cancelled = true` (`:147`).
- **Below and above exports are fully independent promise chains**
  (`:114-127` and `:130-145`), each with its own
  `.catch(() => { /* silent */ })` (`:127`, `:144`). **One band's failure
  cannot structurally suppress the other** — design class 1 of the
  original candidate list ("shared try/catch loses the second export")
  is IMPOSSIBLE in this code and is closed by census.
- The above export **starts only if**
  `compositionPlan.nativeAboveElements.length > 0` (`:130`).
- Commit guards (three per band, `:123`, `:140`):
  `!cancelled && canvas && renderTokenRef.current === token`.
- Old PNGs are deliberately NOT cleared on plan change (`:112-113`
  comment) — stale previous-slide rasters persist transiently by design.
- Above-band `<img>` is conditionally mounted `{abovePng && (…)}`
  (`:213`) at `zIndex: 3` (`:227`); below at `zIndex: 1` (`:188`).
  PATCH-069's "above PNG absent from DOM" therefore means **`setAbovePng`
  was never called with a value**, not "present but blank".
- Exhaustive absence mechanisms (this list is closed):
  1. `nativeAboveElements` empty at runtime → export never starts (§3 F4);
  2. the above export promise rejects → silent catch (§3 F1);
  3. `canvas.toDataURL` throws inside `.then` → rejection → same silent
     catch (§3 F2);
  4. commit suppressed by `cancelled`/token mismatch on every run whose
     above export resolves (§3 F3);
  5. zero-area/invalid export bounds (§3 F6 — would usually still mount a
     degenerate img; discriminated by dimensions).

### 2.B renderExcalidrawSlideBase
(`components/presentation/slide-renderer/renderExcalidrawSlideBase.ts`,
hash `8e088e9f…`, fenced)

- Returns `null` ONLY when `!frameElement && elements.length === 0 &&
  !includeBackground` (`:21-23`). With a live frame element it can never
  return null for the above band — the `canvas` truthiness commit guard
  is not the suppressor when the frame resolves.
- Dynamically imports `exportToCanvas` from `@excalidraw/excalidraw`
  (`:25`) → the vendored fork (`package.json:24`, `file:` dependency).
- `appState` (`:29-33`): above band gets `exportBackground: false`,
  `viewBackgroundColor: "transparent"`; `exportingFrame: frameElement`
  (`:35`); `getDimensions` multiplies by `opts.scale` (`:36-43`);
  `exportPadding: opts.paddingPx ?? 0` (`:44`) — neutralized anyway by
  the fork for frame exports (§2.C).
- Accepts `slide` but never uses it. No special-casing of empty element
  arrays beyond the null gate; text and rectangle enter identically.
  **The above-band input differs from the (succeeding) thumbnail
  above-band input only in the numeric `opts.scale`** (thumbnail's
  `paddingPx: 20` is discarded for frame exports).
- No error handling — rejections propagate to the caller.

### 2.C exportToCanvas fork path

- Wrapper (`…/excalidraw_fork/packages/utils/src/export.ts:40-100`,
  hash `e29e3963…`): `restoreElements(elements, null,
  { deleteInvisibleElements: true })` + `restoreAppState`, then delegates
  to the scene implementation with a `createCanvas` honoring
  `getDimensions`.
- Core (`…/packages/excalidraw/scene/export.ts:172-276`, hash
  `7cf111f6…`):
  - `await loadFonts()` FIRST (`:196-201`), default
    `Fonts.loadElementsFonts(elements)`. Empty element array (below
    band) → zero families → no-op. Rectangle carries no font; only the
    text element induces font loading.
  - `prepareElementsForRender` with `exportingFrame` →
    `getElementsOverlappingFrame(elements, frame)` (`:159-160`).
  - Canvas sized from the FRAME's bounds when `exportingFrame` is set
    (`:224-227`) — this is why PATCH-069's below PNG measured exactly
    1280×720 at scale 1, which **proves `compositionPlan.frameElement`
    resolved live at fullscreen time** (the frame was present in the
    live element array).
  - `exportPadding` forced to 0 for frame exports (`:220-222`).
  - `updateImageCache` is a no-op without image elements.
  - `renderStaticScene` is synchronous (`:241-273`); any throw inside it
    rejects the async `exportToCanvas`.
- Frame membership filter
  (`…/packages/element/src/frame.ts:920-934`, hash `3c820995…`):
  geometric bbox overlap plus `!el.frameId || el.frameId === frame.id`.
  The frame element does NOT need to be inside `elements`. Elements
  outside frame bounds are excluded (would yield a present-but-blank
  above PNG — contradicted by the absent img, so not the live shape).
- **Font loading cannot reject the export**
  (`…/packages/excalidraw/fonts/Fonts.ts:237-271`, hash `195fb51f…`):
  each `document.fonts.load` is wrapped in try/catch that
  `console.error`s and continues ("don't let it all fail if just one
  font fails to load", `:260`). Text with an unloaded font renders with
  fallback metrics — visible, not blank, not a rejection.

### 2.D Fullscreen versus thumbnail path

- Thumbnail (`components/presentation/slide-renderer/
  createSlideRenderer.tsx:216-235`, hash `ce236e91…`, fenced): calls the
  SAME `planSlideComposition` and the SAME `renderExcalidrawSlideBase`
  for below AND above inside one `Promise.all`, merges via
  `mergeSlideLayers`. A rejection of ANY band rejects the whole
  thumbnail. PATCH-069's thumbnail EXISTS and shows the native content;
  since the below band is empty for this fixture, **the visible native
  text+shape in the thumbnail can only have come from the above-band
  canvas** → the shared export pipeline demonstrably succeeds for these
  exact elements under thumbnail-time conditions.
- Data sources: thumbnail getters read React state directly
  (`DrawingLayout.tsx:1903-1907` — `() => elements`, `() => padlets`);
  the fullscreen `runtimeSlideHelpers` read refs (`:1916-1920`) that are
  re-synced from the SAME state on every DrawingLayout render
  (`:695-697`). Same data, different indirection — not stale by
  construction. `FullscreenPresentation.tsx:229-231` (hash `caea1141…`)
  invokes the getters on every render; `RuntimeSlideRenderer` memoizes
  the plan on prop identity.
- Timing: thumbnails are generated once at panel-mount settle
  (double-RAF, `useSlideThumbnails.ts:87-100`) and CACHED by render
  signature; the fullscreen plan is computed at fullscreen-open. Any
  scene mutation between those moments diverges the two plans while the
  thumbnail stays stale-good.
- `handleStartPresentation` (`DrawingLayout.tsx:1503-1508`) is pure
  state (`setPresentationStartId`/`setPresentationActive`) — no scene
  mutation at open.
- Harness-seeded elements carry `index: null`
  (`drawingBridgeHarness.ts:101/:136/:167/:209`); Excalidraw restore
  assigns fractional indices in array order, so initial live order =
  persisted order. A later reorder could only come from a live
  `onChange`/scene reconciliation (e.g., the documented one-shot
  embeddable refresh) — unproven either way from source.
- Error-handling asymmetry: a thumbnail-path rejection is VISIBLE
  (missing thumbnail — none observed); a fullscreen-path rejection is
  silently swallowed.
- Consequence for the plan-divergence hypothesis (F4): the only
  runtime-plan shape consistent with BOTH the blank below PNG and the
  absent above PNG is the **mid-band gap** (natives ordered strictly
  between the first and last padlet index at runtime → dropped from
  BOTH bands). Natives migrating to the below band would have appeared
  in the below PNG — excluded by the observed blank.

### 2.E Font CORS evidence — ruling

The live run recorded a Virgil font CORS failure from unpkg.com plus one
`net::ERR_FAILED`. Source census (§2.C) proves the fork's font loader
swallows load failures; a font failure cannot reject the export, and
text renders with fallback. **Ruling: unrelated noise for the
missing-PNG defect** (at most a cosmetic glyph-fidelity contributor).
Row F5 is retained in §3 only as a cross-check; it can be reopened only
by Stage-0 evidence directly contradicting this census (which would be
an anomaly → STOP).

### 2.F Silent failure boundary — closed enumeration

Given §2.A–2.D, the above-band PNG can be absent only via:
`(i)` plan-empty at runtime (never starts) — F4;
`(ii)` export promise rejects — F1;
`(iii)` `toDataURL` throws — F2;
`(iv)` commit suppressed by `cancelled`/token on every resolving run — F3;
`(v)` degenerate bounds — F6.
Font readiness (F5) is closed at source. Nothing else in the pipeline
can produce this symptom without contradicting an observed fact (frame
dims prove frame resolution; thumbnail proves element exportability).
**Which of (i)–(iv) is live is NOT source-determinable** — hence Stage 0.

---

## 3. Decision table — Stage 0 must prove exactly one row

Stage 0 binds these observables (all test-only, gathered in the existing
sole allowed spec file via Playwright `addInitScript`/`evaluate`/network
interception — no production instrumentation):

- **O1** — every `HTMLCanvasElement.prototype.toDataURL` invocation
  inside the fullscreen window (probe log reset immediately before
  entering fullscreen): timestamp, canvas width/height, success or
  thrown error.
- **O2** — deterministic evidence whether the above-band
  `exportToCanvas` invocation BEGAN in the fullscreen window (probe
  design is implementer latitude — e.g., export-canvas creation/dimension
  tracing at the `document.createElement("canvas")`/property level —
  but Sonnet must verify it discriminates deterministically and cannot
  be confused by unrelated canvases; scoping the log window and
  filtering by canvas dimensions are the expected tools).
- **O3** — post-run persisted-scene re-fetch (Node side, service role):
  element order compared to seed order, plus a rerun of the real
  `planSlideComposition` against the post-run persisted scene.
- **O4** — `document.fonts.load` call/result log (cross-check only).
- **O5** — the existing above-img DOM census (presence + dimensions).

| Row | Meaning | Bound discrimination |
|---|---|---|
| **F1** | above export promise rejects | O2: above export began; O1: exactly one successful `toDataURL` (below); O5: absent |
| **F2** | export succeeds, `toDataURL` fails | O1: a second `toDataURL` invocation recorded as THROWN; O5: absent |
| **F3** | `setAbovePng` suppressed by cancellation/stale token | O1: ≥2 successful `toDataURL` (above canvas produced a data URL); O5: absent |
| **F4** | above input invalid / runtime plan divergence (incl. mid-band gap live) | O2: above export never began; corroborated by O3 order divergence and/or plan rerun dropping the natives |
| **F5** | font readiness (closed by §2.C census) | reopened ONLY if O4 shows a load failure PROPAGATING as a rejection — treat as anomaly, STOP |
| **F6** | crop/bounds produce invalid export | O1: second `toDataURL` on a zero-area canvas, or O5: img present with invalid dimensions |
| **F7** | another narrow deterministic cause | only with explicit probe evidence naming the mechanism |

**Any result not mapping cleanly onto exactly one row, or mapping onto
two rows simultaneously → STOP. Do not guess. Report and wait for an
amendment.**

Stage 0 must record the proven row (and the raw observables) in a
structured annotation `patch-070-stage0-probe` and must leave every
existing PATCH-069 assertion intact and green (the defect is still
present during Stage 0; N2/N5, all-zero `nativeRasterCounts`, and the
band censuses still hold).

---

## 4. Stage protocol

1. **Stage 0 (authorized now):** GPT-5.5 edits ONLY
   `e2e/characterization/drawing-presentation.spec.ts` to add the probe
   (§3). Must reproduce PATCH-069's N2 behavior first (stop condition if
   not). Sonnet reviews the uncommitted diff; on PASS, GPT-5.5 commits
   with the bound Stage-0 message and pushes. Fable records the proven
   row.
2. **Amendment gate:** the CTO issues a named amendment binding the
   proven row to exactly one Stage-1 design (§5), re-verifying the
   `RuntimeSlideRenderer.tsx` authorized hash. No production edit before
   this amendment exists.
3. **Stage 1 (locked):** GPT-5.5 implements the bound fix in
   `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` and
   evolves the spec into the post-fix regression (§7). Sonnet reviews;
   on PASS, commit with the bound Stage-1 message; push; Fable closes.

---

## 5. Stage-1 design classes — bound per row (accepted/rejected)

Accepted, one per row (the amendment picks exactly one):

- **F3 → lifecycle-race fix only** (design class 5): correct the proven
  suppression (e.g., commit-guard/token interaction), preserving
  cleanup, stale-slide protection, and the no-blank-frames behavior.
- **F1/F2 → root-repair at the proven throwing site's INPUT** (design
  class 2): normalize only the export input inside
  `RuntimeSlideRenderer.tsx` (never mutate persisted scene, preserve
  element IDs/geometry). Note: blanket error isolation is already
  structurally present (§2.A) and is NOT an accepted fix on its own.
- **F4 → STOP at amendment level**: the CTO decides between export-input
  normalization inside `RuntimeSlideRenderer.tsx` (class 2) and a
  planner ruling — `planSlideComposition.ts` remains PROHIBITED under
  this patch and would require its own authorization if census then
  proves planner output wrong.
- **F5 → font-readiness fix** (class 3: await the same readiness path the
  thumbnail uses; no sleeps; no remote-font dependency) — only if Stage 0
  overturns the §2.E census; treat as anomaly first.
- **F6 → bounds correction for the fullscreen band export only**
  (class 4): preserve slide coordinates; no frame-order work.

Rejected explicitly:

- any speculative combination of the above;
- splitting/reworking the promise chains "for safety" (already isolated);
- removing the silent `.catch` in favor of user-facing errors (out of
  scope; escalate separately if desired);
- frame ordering, AI-image, uploaded-image cleanup, slide-overlap
  fallback, mid-band planner gap repair, ANY thumbnail-path change;
- retry loops, arbitrary timeouts, or `setTimeout`-based sequencing.

---

## 6. Scope — allowed files

**Stage 0 (now):** exactly one file:

- `e2e/characterization/drawing-presentation.spec.ts`
  — authorized pre-edit hash `3ddcc987d894703144ede9c19b2aae0cdf6fe53b`

**Stage 1 (locked until amendment):** exactly two files:

- `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx`
  — authorized pre-edit hash `a407cccc230ca74a36a443b5f701767856754230`
  (IMMUTABLE during Stage 0; any Stage-0 drift is a stop condition)
- `e2e/characterization/drawing-presentation.spec.ts` (hash re-bound by
  the amendment to the committed Stage-0 state)

No helper or unit-test file is authorized: the census found none
necessary (the probe lives in the spec; the fix is a component-local
lifecycle/input change testable through the existing e2e regression). If
implementation proves one necessary → STOP and report.

Prohibited outright (fenced, §8): `planSlideComposition.ts` (unless a
future census proves planner output wrong — separate authorization),
every Excalidraw fork file, the thumbnail/preview path
(`createSlideRenderer.tsx`, `useSlideThumbnails.ts`,
`SlideThumbnail.tsx`, `PresentationPreviewModal.tsx`),
`presentationBridge.ts` + tests, `drawingBridgeHarness.ts`,
`drawing-line-bridge.spec.ts`, `DrawingLayout.tsx`,
`SimpleLineRenderer.tsx`, `CanvasClient.tsx`, `LineContextMenu.tsx`,
`e2e/helpers/env.ts`, schema/config/dependencies, new
endpoints/flags/hooks, all line-related files.

---

## 7. Required fixed behavior and regression (Stage 1)

After Stage 1, on the seeded landscape fixture:

**Fullscreen:** below-band PNG present as before; **above-band PNG
present, loaded, valid non-zero dimensions**; native text and shape
visible — meaningful pixel analysis non-zero, seeded text/shape regions
non-blank, seeded colors detectable where deterministic; no duplicate
raster; no blank overlay; no stale previous-slide raster.

**Thumbnail:** unchanged, still shows native content (N5 invariants).
**Planner:** unchanged. **Persisted scene:** unchanged. **Ordering:**
unchanged, even if currently divergent.

Regression requirements (evolve the PATCH-069 characterization; the
N2-era assertions that characterize the DEFECT — absent above img,
all-zero `nativeRasterCounts`, `primaryRow === 'N2'` — must FLIP to
their fixed-state counterparts; thumbnail N5 assertions stay):

- persisted scene still matches seed;
- plan still returns `nativeAboveIds = [text-landscape, shape-landscape]`;
- fullscreen now has BOTH required band PNGs; above-band PNG loaded with
  valid dimensions; above-band pixel analysis shows meaningful content;
  seeded text and shape regions non-blank; seeded colors detected where
  deterministic;
- thumbnail remains visible and unchanged;
- no duplicate PNGs;
- no new frame-order assertions beyond existing coverage; no AI-image or
  uploaded-image changes;
- structured history preserved: `patch-069-*` annotations may be kept or
  superseded, and `patch-069-classification` evolves into
  **`patch-070-native-raster-fix`** recording: original diagnosis N2,
  proven root cause (decision row + evidence), fixed production path,
  fullscreen band count, above-band PNG dimensions, pixel analysis,
  thumbnail invariant, planner invariant, persisted-scene invariant.

Stage-0 probe scaffolding that would contradict the fixed state is
removed or evolved in Stage 1; probe evidence needed by the regression
may remain.

---

## 8. Baselines and fences

**Authorized-change baselines (bind, verify before editing):**

| File | Pre-edit hash | Editable in |
|---|---|---|
| `e2e/characterization/drawing-presentation.spec.ts` | `3ddcc987d894703144ede9c19b2aae0cdf6fe53b` | Stage 0 (+ Stage 1 after amendment) |
| `components/presentation/runtime-slide/RuntimeSlideRenderer.tsx` | `a407cccc230ca74a36a443b5f701767856754230` | Stage 1 ONLY (immutable during Stage 0) |

**Immutable fences — 43 unique paths** (freshly hashed and verified at
base `05e913e`; 39 carried from PATCH-069 — its 40 minus
`RuntimeSlideRenderer.tsx`, now authorized-change — plus 4 fork files
newly read in this census):

```
lib/infra/drawing/bridge.ts ed26c312610a386711f658662e82d29dd48c5890
lib/infra/drawing/bridge.test.ts b6f3e674328e06304e08d6f079a553df4d36464e
components/presentation/slide-renderer/resolveSlidePadlets.ts 5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 9524e6397e623fef905f213e80953b2a22e2423d
components/presentation/slide-renderer/getSlideRenderSignature.ts da903ed4c9b7cd9b9ff86657fa2c44fa27e4665d
components/presentation/slide-renderer/createSlideRenderer.tsx ce236e91196ef36c5491a053072acc3e981ed80d
components/presentation/slide-renderer/mergeSlideLayers.ts 91ab266825b8b47b1035c09c6072e6cb23d69620
components/presentation/slide-renderer/renderExcalidrawSlideBase.ts 8e088e9f2da6bbe6f6e565104a4a8cf90c5eb1f7
components/presentation/slide-renderer/PresentationContainerCard.tsx 3876eeba810484fcf01437d477fe682dec2aa32b
components/presentation/slide-renderer/PresentationPadletCard.tsx bbcef06c8b8de29e455ec4748e7ea2762f0c1052
components/presentation/PresentationPanel.tsx 926f43cec98fadc610976081b58cb246ba00d501
components/presentation/useSlideThumbnails.ts 19801ae2c2b0ddc8841e358ad0fbc7cde96708f3
components/presentation/FullscreenPresentation.tsx caea11414929b0291e8d5d54513d50f55daf73b3
components/presentation/runtime-slide/RuntimePadletLayer.tsx 7baee436b9a63313cbb157444ff846b2bd1c26aa
components/presentation/runtime-slide/expandRuntimeContainerItems.ts 14e7573c53e2ab85c36d74d2e1afe22cf64c8da1
components/presentation/runtime-slide/resolveRuntimeContainerChildren.ts 71a878350b66b464bd693960e778b6a4fa73a4a0
components/presentation/PresentationPreviewModal.tsx 5116031b27f73bb7616f4024b197824c6718aa17
components/presentation/SlideThumbnail.tsx b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/collabboard/SimpleLineRenderer.tsx a38572a499d6aadf3002fa34f7a8e0e321220ea6
components/collabboard/canvas/ui/FreeformPadletCards.tsx 1c12d24a42c45a279efb4da0de785b478e4ca385
components/collabboard/canvas/ui/OverlayLayer.tsx 8940a6b1baa1e825139a026c3bb8f37e04ee7afb
components/collabboard/canvas/hooks/useCanvasLines.ts 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
components/collabboard/canvas/hooks/useCanvasData.ts 2e158f1278a395b5028083e8f387a22e4daf5b60
lib/infra/canvas/linesRepository.ts 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
lib/domain/canvas/lines.ts 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
types/collabboard.ts ea46b79cf0e4392f7141017943c74733e1e87be2
components/collabboard/canvas/excalidraw_fork/packages/element/src/binding.ts 8a977611d22d9c6cb7f50f1c7c245c31d9764cea
components/collabboard/canvas/excalidraw_fork/packages/element/src/arrows/focus.ts fa8018adbe2ea3279836371c4466e8e64d091a3c
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx cd34ff6ddb838e1bc3f21a7d01bf82106556d362
lib/infra/drawing/lineBridge.ts f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/lineBridge.test.ts 559087550bf4a0304501ad479555ab4f4ad636a4
lib/infra/drawing/presentationBridge.ts b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/presentationBridge.test.ts dff458de747d673868b1eae2b695e41b4c3424d2
e2e/helpers/env.ts 9514723cde157f7ae6e6815d4c142a0f430a1292
e2e/characterization/drawingBridgeHarness.ts 85a6566dbb8cd16f19151133ed33b9872a97ff11
app/dashboard/canvas/[id]/CanvasClient.tsx 1c6864b46e1c5c9a52f9e771ee2e51793898ecd8
components/collabboard/menus/LineContextMenu.tsx aaf16af230a76139377c4250f93485824000593e
components/collabboard/canvas/layouts/DrawingLayout.tsx 93e5900f8df6468a466f8bfd0318f813393336a1
e2e/characterization/drawing-line-bridge.spec.ts 3e690d20614dee1c0b6c60a791f4031e9aa53833
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/fonts/Fonts.ts 195fb51f47d3c36bdd00e6f391e96edbf0f9b850
components/collabboard/canvas/excalidraw_fork/packages/excalidraw/scene/export.ts 7cf111f6ce57920a40252786d782c81d572a0105
components/collabboard/canvas/excalidraw_fork/packages/utils/src/export.ts e29e396300cdf360e040fa52db62e9536f238ee7
components/collabboard/canvas/excalidraw_fork/packages/element/src/frame.ts 3c8209954616f57f45e7060e4d54a7affbfcc68b
```

Verify every fence before editing and again before each commit.

**Bound pre-flight baselines (all reconfirmed green at `05e913e` during
the PATCH-069 acceptance review):** focused Vitest 51 passed / 2
skipped; full Vitest 424 passed / 41 skipped; Playwright setup 1 passed;
line spec 4 passed; presentation spec 2 passed / 2 approved skips;
credential-off line 4 skipped; credential-off presentation 4 skipped;
cleanup zeros (`boards=0, padlets=0, canvasLines=0`, independent
service-role query); zero production imports of
`lineBridge`/`presentationBridge`/`drawingBridgeHarness` outside `e2e/`.

---

## 9. Diagnostic environment contract (binding, unchanged)

- Self-start `npm run dev`; confirm the `next dev` + `Ready` banner.
- Run all diagnostic Playwright with explicit `PW_BASE_URL` (no
  Playwright-managed `next start` webServer for diagnostics; its
  failures are environment errors, not evidence).
- Port discipline: inspect the target port first; attribute listeners
  (`Get-NetTCPConnection`/`Get-CimInstance`); never kill an unrelated
  process; stop only the server you started; verify the port is free
  afterward.
- `e2e/.auth/user.json` regenerates ONLY via
  `npx playwright test --project=setup`; never hand-edit; never log or
  print credential/cookie contents anywhere (reports, annotations,
  probe logs included).
- `verify`/`build` run sequentially, never concurrently, never under a
  running dev server.
- Never commit generated artifacts (`.next`, test-results,
  playwright-report, auth state, screenshots/videos/traces/logs).

---

## 10. Stop conditions

STOP immediately, report, do not commit, if:

- base commit or any authorized pre-edit hash differs;
- any of the 43 immutable fences differs at any point;
- `RuntimeSlideRenderer.tsx` differs from `a407cccc…` at any point
  during Stage 0;
- PATCH-069's N2 behavior cannot be reproduced BEFORE adding the probe;
- the probe result maps onto zero rows or more than one row of §3;
- Stage 1 is attempted without a named amendment binding the row;
- the root cause remains ambiguous after Stage 0;
- any additional production file appears necessary;
- a fork change appears necessary;
- a planner (`planSlideComposition.ts`) change appears necessary;
- thumbnail behavior must change;
- a font/network dependency cannot be made deterministic;
- the fix would affect frame ordering, or AI-image/uploaded-image scope
  appears;
- cleanup becomes nondeterministic, or a real user board would be
  touched;
- a second defect would ride along.

---

## 11. Verification gates (each stage, all bound)

1. Fence + authorized-hash verification (§8) before editing and before
   committing.
2. `npx playwright test --project=setup` (1 passed) under the §9
   contract, then the line spec (4 passed — untouched-file regression)
   and the presentation spec (2 passed / 2 approved skips) with
   credentials; credential-off proofs (4 skipped / 4 skipped).
3. Focused Vitest (51/2), full Vitest (424/41), `tsc --noEmit`,
   `npm run check:boundaries`, `npm run verify` (sequential) — all green.
4. Independent cleanup verification via service-role query
   (`patch-064-harness-%` prefixes): boards=0, padlets=0, canvasLines=0.
5. Zero production imports of the test-only bridge modules outside `e2e/`.
6. `git status` clean except the allowed file(s); repository level with
   `origin/main` after push.
7. Stage 0 additionally: the `patch-070-stage0-probe` annotation present
   with raw observables + exactly one proven row; all PATCH-069
   assertions still green. Stage 1 additionally: the flipped fixed-state
   assertions of §7 green and the `patch-070-native-raster-fix`
   annotation complete.

---

## 12. Review and commit flow (bind)

- GPT-5.5 implements each stage WITHOUT committing.
- Sonnet independently reviews the uncommitted diff (read-only; reruns
  all gates; re-derives all hashes; extracts annotations from a JSON
  reporter run rather than trusting prose).
- Explicit Sonnet PASS required per stage; only then GPT-5.5 commits
  with the stage's bound message and pushes.
- Fable (CTO) closes each stage in `CURRENT_TASK.md`; the Stage-1
  amendment is CTO-only and precedes any production edit.

---

## 13. Rollback

Each stage is one commit touching at most the allowed files; revert the
stage commit to roll back. Stage 0 carries zero production risk (test
file only). Stage 1's revert restores `a407cccc…` behavior (silent
above-band absence) without data impact — no schema, no persisted-scene
writes anywhere in this patch.

---

## 14. Required final report (per stage)

- exact files changed with pre/post hashes;
- Stage 0: raw O1–O5 observables, the proven decision row, and the
  verbatim `patch-070-stage0-probe` annotation content;
- Stage 1: the bound row + amendment reference, the exact production
  diff summary, above-band PNG dimensions and pixel analysis,
  thumbnail/planner/persisted-scene invariants;
- all gate totals (setup/line/presentation/credential-off, focused/full
  Vitest, tsc/boundaries/verify), cleanup proof, 43-fence results,
  production-import grep;
- commit hash and push status, only after Sonnet PASS.
