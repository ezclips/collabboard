# PATCH-082 — Duplicate Outer-State/Live-Scene Divergence Diagnosis

**Status:** SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix, NO instrumentation seam — the
question must be answered with real-UI E2E observation only; if that
proves impossible, STOP and report rather than adding a seam).
Successor to PATCH-081: the Duplicate action's outcome is
state-dependent (Add-then-Duplicate showed a live duplicate frame
label in PATCH-080; Duplicate-only showed none in PATCH-081). This
patch compares the two flows under hardened, VERIFIED-viewport
observation to prove or refute the state dependence and close the
residual fit-verification caveat.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`718c99127adb6a39a7ed185e68b9817a5cea5b25`
(`test(e2e): characterize duplicate-slide live clone shape (PATCH-081)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize duplicate outer-state live-scene divergence (PATCH-082)`

---

## 0. Census at authoring (2026-07-18, from `718c991`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Duplicate outer-state/live-scene divergence diagnosis (Flow A vs Flow B)** | defect diagnosis | **SELECTED (this patch)** — final evidence gate before the deep-clone fix |
| 2 | Duplicate deep-clone production fix (semantics bound: PATCH-076 §0.B.2 OPTION A) | defect | BLOCKED on #1 — mechanism unproven; regression scope must cover BOTH flows |
| 3 | Stale React-`elements` source in slide-menu handlers (post-drag scene replacement risk, flagged at 079 closure) | defect (uncharacterized) | related to #1's likely mechanism; do NOT fix here |
| 4 | Frame-geometry sidebar staleness diagnosis | defect (uncharacterized) | after the duplicate family |
| 5 | Frame-geometry/sidebar-position fix | defect | after #4 |
| 6 | Line-follow behavior | hardening | deferred |
| 7 | Uploaded-image storage cleanup | hardening | deferred (approved skip) |
| 8 | AI images in presentation | feature | deferred (approved skip) |
| 9 | Overlap fallback | hardening | deferred |
| 10 | Connections side-panel planning | feature | deferred until stabilization ruled complete |

New deterministic defect exposed by PATCH-081: none — the
state-dependent flow divergence is the finding, folded into this
patch.

## 1. Question (bind)

PATCH-081 proved (Duplicate-only): sidebar gains a third row (so the
outer React `elements` state must carry the duplicate frame — the
sidebar derives from that state and only `handleChange`'s gate or the
import path can refresh it), yet NO fresh frame-label id ever appears
in the drawing canvas and nothing persists. PATCH-080's supplementary
evidence (Add-then-Duplicate) showed the duplicate frame label DID
appear live. Both specs were faithful; the divergence is
state-dependent. Residual caveat: the flow-A fit checks used an
unverified `Shift+1`, so a far-offset duplicate frame
(source.x + width + 80) with viewport-gated labels is not fully
excluded. This patch must answer, with VERIFIED zoom-to-fit before
every label derivation: does a prior `Add slide below` change whether
the Duplicate frame becomes live-scene-visible? And does persistence
differ between the flows? The answer bounds the deep-clone fix's
owner (stale outer-state emission vs fork-side drop vs viewport
artifact) and its mandatory regression scope.

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, ONE active test, running TWO bounded
flows sequentially on TWO separate disposable harness boards (each
seeded identically; each cleaned in its OWN try/finally; Flow A fully
completed and cleaned before Flow B's board is created):

**Flow A (first board) — Duplicate only:**
1. Baseline: sidebar rows (assert exactly 2, titles
   Landscape/Portrait), live frame-label ids, source-card count,
   total `[data-padlet-id]` count, `.excalidraw__embeddable-container`
   count, zoom-display value.
2. Real Duplicate on the source row (`PATCH-064 Portrait`) via the
   real menu (exact seven-item verification). Derive
   **`flowA_duplicateRowAppeared`** — rows reach 3 with exactly two
   source-title rows (bound 15 s poll).
3. **Verified fit:** real left-click on an empty canvas region
   (selection-only; must not hit any card, frame label, or sidebar),
   then real `Shift+1`; read the zoom-percent display before and
   after (both recorded). Derive **`flowA_zoomToFitApplied`** — both
   interactions performed AND the zoom display was readable at both
   reads. Then derive **`flowA_duplicateFrameLabelAfterFit`** — a
   frame-label id NOT in the baseline set is present in the POST-fit
   label read (pre-fit read recorded as evidence only) — and
   **`flowA_duplicateChildRenderAfterFit`** — post-fit, source-card
   count ≥ 2 OR container count > baseline.
4. Settled persistence (PATCH-076 method: ≤ 1 000 ms poll, ≥ 6 000 ms
   window, settled read sole basis). Derive
   **`flowA_duplicatePersistedSettled`** — any settled persisted
   active frame id outside the seeded pair.
5. Clean up board A (local finally; zero-assert).

**Flow B (second board) — Add slide below, then Duplicate:**
1. Same baseline.
2. Real `Add slide below` on the source row. Derive
   **`flowB_addRowAppeared`** — rows reach 3 (bound 15 s poll).
   Record post-Add live frame-label ids (the Add frame id is derived
   from this diff, as in PATCH-080).
3. Real Duplicate on the source row. Derive
   **`flowB_duplicateRowAppeared`** — rows reach 4 with exactly two
   source-title rows (bound 15 s poll).
4. Verified fit exactly as Flow A §2.3. Derive
   **`flowB_zoomToFitApplied`**,
   **`flowB_duplicateFrameLabelAfterFit`** (a label id not in the
   baseline set AND not the Add frame id), and
   **`flowB_duplicateChildRenderAfterFit`** (same signals).
5. Settled persistence as Flow A §2.4. Derive
   **`flowB_duplicatePersistedSettled`** — any settled persisted
   active frame id outside the seeded pair AND not the Add frame id.
6. Clean up board B (local finally; zero-assert).

PROHIBITED in this spec: `'Rename slide'`, `'Remove slide'`, deleting
any slide, page reload, FullscreenPresentation, dragging/resizing any
element, and ANY canvas interaction beyond the two bound ones (one
empty-region selection click + one real `Shift+1` per flow). Flow A
must not perform Add; Flow B's Add is its ONLY extra action.

**Annotation contract (bind — exactly FOURTEEN literal fields):**

| Field | Definition |
|---|---|
| `flowA_duplicateRowAppeared` | Flow A §2 boolean |
| `flowA_zoomToFitApplied` | Flow A §3 boolean |
| `flowA_duplicateFrameLabelAfterFit` | Flow A §3 boolean (post-fit only) |
| `flowA_duplicateChildRenderAfterFit` | Flow A §3 boolean (post-fit only) |
| `flowA_duplicatePersistedSettled` | Flow A §4 settled boolean |
| `flowB_addRowAppeared` | Flow B §2 boolean |
| `flowB_duplicateRowAppeared` | Flow B §3 boolean |
| `flowB_zoomToFitApplied` | Flow B §4 boolean |
| `flowB_duplicateFrameLabelAfterFit` | Flow B §4 boolean (post-fit, excludes Add frame id) |
| `flowB_duplicateChildRenderAfterFit` | Flow B §4 boolean (post-fit only) |
| `flowB_duplicatePersistedSettled` | Flow B §5 settled boolean |
| `classification` | derived, exactly one §3 enum value |
| `prefixA` | Flow A fixture prefix (starts with `patch-064-harness-patch-082-divergence-`) |
| `prefixB` | Flow B fixture prefix (same root; distinct value) |

No fifteenth field. Supplementary raw evidence (all label-id sets
pre/post fit, zoom-display values, count snapshots, persisted
frame-id sets, Add frame id, window/interval values) is welcome. All
fourteen values observation-derived; any outcome — including one
contradicting PATCH-080 or PATCH-081 — is a valid diagnosis.

## 3. Classification enum (bind, complete — derived in this order)

1. `!flowA_duplicateRowAppeared || !flowB_addRowAppeared ||
   !flowB_duplicateRowAppeared || !flowA_zoomToFitApplied ||
   !flowB_zoomToFitApplied` → **`divergence-observation-unsound`**
   (a flow or its verified fit failed; comparison would be unsound)
2. `flowA_duplicatePersistedSettled || flowB_duplicatePersistedSettled`
   → **`unexpected-duplicate-persistence`** (contradicts
   PATCH-076/080/081 — valid, record faithfully)
3. `!flowA_duplicateFrameLabelAfterFit && flowB_duplicateFrameLabelAfterFit`
   → **`prior-add-enables-live-frame`** (state dependence CONFIRMED)
4. `!flowA_duplicateFrameLabelAfterFit && !flowB_duplicateFrameLabelAfterFit`
   → **`no-live-frame-in-either-flow`** (PATCH-080's label sighting
   does not reproduce under verified fit)
5. `flowA_duplicateFrameLabelAfterFit && flowB_duplicateFrameLabelAfterFit`
   → **`live-frame-in-both-flows`** (PATCH-081's flow-A absence was
   viewport/fit-gated after all)
6. `flowA_duplicateFrameLabelAfterFit && !flowB_duplicateFrameLabelAfterFit`
   → **`inverse-state-dependence`**
7. anything else → **`mixed-divergence-state`** (safety terminal;
   branches 3–6 are exhaustive over the two booleans)

Seven literals. Do NOT hardcode the expected outcome.

## 4. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-duplicate-divergence.spec.ts` | NEW file (absence verified at base `718c991` and worktree 2026-07-18 — confirm again before editing and before commit). One active test implementing §2 (both flows inside it, sequential boards, per-board try/finally). Existing harness (`createDisposableDrawingBoard('patch-082-divergence')` twice → both prefixes start `patch-064-harness-patch-082-divergence-`), `registerDrawingCleanup(test)` once at module scope. Local UI helpers in-file, mirroring `drawing-duplicate-clone-shape.spec.ts` idioms — do NOT edit that spec or the harness. Per-test timeout ≤ 240 000 ms. |

Absence gates (all, at base AND worktree, before editing and before
commit): `e2e/characterization/drawing-duplicate-divergence.spec.ts`
(the new file) and `e2e/characterization/drawing-slide-persistence.spec.ts`
(PATCH-077's never-created path — permanently absent; recreating it
is prohibited). No other new file may appear anywhere.

NO other file may change. Production source, the Excalidraw fork, the
harness, all existing specs, `playwright.config.ts`, and all `.fable5`
docs are PROHIBITED (governance files are CTO-only).

## 5. Immutable fences — 26 unique paths (Git blob IDs at base `718c991`)

Verification method (bind): fences are Git blob IDs — verify with
`git rev-parse 718c99127adb6a39a7ed185e68b9817a5cea5b25:<path>` and
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
```

(PATCH-081's 25 fences plus its landed spec.)

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test), THREE sequential
stable runs.
Carried (unchanged): clone-shape 2/1/2; add-dup 2/1/2; rename-state
2/1/2; slide-duplication 2/1/2; menu-pointer 2/1/2; harness-cleanup
2/1/2; presentation 2 passed / 2 approved skips; duplication 2/1/2;
line 4 passed / 4 skipped cred-off; helper 7/1; sanitizer 9/1;
focused drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 26/26 fences.
Cleanup zeros across **FIFTEEN** prefixes: the fourteen tracked
prefixes plus `patch-064-harness-patch-082-divergence-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the
`e2e/.auth/user.json` staleness incident is environmental,
five-times reproduced — refresh via setup and retry); no credential
contents anywhere; sequential `verify`/`build`, never under a dev
server; never commit generated artifacts (`test-results/`,
`playwright-report/`, JSON reporter output, scratch scripts).

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + per-board local
`finally` defense with the idempotent zero-assertion (board A cleaned
before board B is created; board B cleaned at test end; a Flow A stop
must still clean board A). Duplicate/Add are expected to create NO
new padlet rows — if one appears, record it; the board-scoped fixture
delete covers it. NO Remove; NO deletion of any slide. Post-run
prefix-scoped residue checks must be zero for all FIFTEEN §6
prefixes. Test-timeout kill → sweep and report per the PATCH-074
rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (26/26, blob-ID method), or any §4
  absence gate differs;
- ANY existing file must change, or a SECOND new file is required;
- `'Duplicate slide'` or `'Add slide below'` cannot be driven
  deterministically through the real menu UI;
- the verified fit cannot be performed deterministically (no
  empty-canvas region reachable, zoom display unreadable) — do NOT
  substitute an unverified shortcut, a coordinate hack on cards, or
  any API call;
- `'Rename slide'`, `'Remove slide'`, a reload, deletion,
  FullscreenPresentation, or any further canvas interaction would be
  needed;
- any observation requires force click, `dispatchEvent`, coordinate
  workaround (beyond the bound empty-region click), direct callback
  invocation, direct product-state mutation, or a per-test timeout
  above 240 000 ms;
- persistence settlement cannot be observed deterministically;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix);
- ANY fix, guard, instrumentation seam, or production improvement
  seems "obvious" — this patch observes; the census #2 fix is gated
  on its result.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 26/26 fences + all absence gates + one-file scope,
re-runs all §6 modes, extracts the fourteen-field annotation from a
fresh JSON reporter run, verifies the verified-fit evidence is
genuine — zoom display read before/after in both flows — every field
observation-derived, the classification follows the §3 order, and the
prohibited actions are never driven); explicit PASS required; NO
commit before PASS; then commit with the bound message and push;
Fable closes, rules on the divergence mechanism, and decides whether
the census #2 deep-clone fix can be authorized with a
both-flows regression obligation.

**Bound commit message (verbatim):**
`test(e2e): characterize duplicate outer-state live-scene divergence (PATCH-082)`

## 11. Required final report

New file + blob ID; all fourteen annotation fields with observed
values; per-flow label-id sets pre/post fit + zoom-display values +
count snapshots; per-flow settled persisted frame-id evidence; the
derived classification and what it implies for the divergence
mechanism and the deep-clone fix's regression scope; all §6 gate
totals; 26-fence result + all absence gates + one-file scope proof;
cleanup proof across fifteen prefixes; production-import grep;
commit hash + push status after PASS.
