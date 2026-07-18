# PATCH-081 — Duplicate Slide Live-Scene Clone-Shape Diagnosis

**Status:** DONE — closed 2026-07-18 (closure record in §12).
Implementation commit `718c99127adb6a39a7ed185e68b9817a5cea5b25`,
blob `147ae0aeae503a36fd5e8e42d6cd3045b34b38c3`, Sonnet independent
PASS. Was: SPEC READY — **diagnosis-only** (NO production change, NO
harness change, NO fork change, NO fix — the PATCH-076 §0.B.2
deep-clone ruling may NOT be implemented under this patch). Successor
question to PATCH-080: the suppression is Duplicate-specific or
clone-shape-specific; this patch determines WHAT the Duplicate action
actually places in (and keeps in) the live scene, isolating the
divergence point between the statically-complete clone emission in
`handleDuplicateSlide` and the observed nothing-renders /
nothing-persists outcome.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`34d9d54371a0bcc6dd360dc06394130fad918afe`
(`test(e2e): characterize add/duplicate slide persistence boundary (PATCH-080)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize duplicate-slide live clone shape (PATCH-081)`

---

## 0. Census at authoring (2026-07-18, from `34d9d54`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Duplicate live-scene clone-shape diagnosis** | defect diagnosis | **SELECTED (this patch)** — final gate before the deep-clone fix |
| 2 | Duplicate deep-clone production fix (semantics bound: PATCH-076 §0.B.2 OPTION A) | defect | BLOCKED on #1 — divergence point still unobserved; row-cloning insertion point depends on it |
| 3 | Frame-geometry sidebar staleness diagnosis | defect (uncharacterized) | next family after #1/#2 |
| 4 | Frame-geometry/sidebar-position fix | defect | after #3 |
| 5 | Stale React-`elements` base in menu handlers after frame drag (flagged at PATCH-079 closure — potential silent position revert) | defect (uncharacterized) | census #3 family; do NOT touch here |
| 6 | Line-follow behavior | hardening | deferred |
| 7 | Uploaded-image storage cleanup | hardening | deferred (approved skip documents it) |
| 8 | AI images in presentation | feature | deferred (approved skip documents it) |
| 9 | Overlap fallback | hardening | deferred |
| 10 | Connections side-panel planning | feature | deferred until stabilization ruled complete |

New defect exposed by PATCH-080: none beyond the documented
PATCH-076/PATCH-080 rendering-pipeline discrepancy, which is folded
into this patch's question.

## 1. Question (bind) — where does the clone diverge?

Statically, `handleDuplicateSlide` (`DrawingLayout.tsx:1425-1452`)
emits a COMPLETE clone: fresh `crypto.randomUUID()` frame id, fresh
child ids, `frameId` reassigned to the new frame, `x` shifted, links
copied, all appended to the React-state `elements` base and passed to
`updateScene`. Yet PATCH-080 proved: the duplicate sidebar row and a
live frame-name label with the fresh frame id DO appear, while NO
second drawing-canvas embeddable ever renders and NOTHING of the
duplicate ever reaches the persisted scene (not even transiently).
Fork facts established read-only at authoring (bind as derivation
context): `renderEmbeddables()` renders one
`.excalidraw__embeddable-container` per embeddable ELEMENT in the
live scene, gated by `embedsValidationStatus.get(el.id)`
(fork `App.tsx:1463-1501`), and `updateEmbeddables()` runs on EVERY
`componentDidUpdate` (`:3240-3241`) auto-validating any new
embeddable whose link passes `validateEmbeddable` (the app passes
`link.startsWith('padlet://')`, `DrawingLayout.tsx:2799`) — so a
scene-present duplicate child SHOULD render a container promptly.
Container count and frame-label presence are therefore bound as the
live-scene proxies. This diagnosis must answer, immediately after the
real Duplicate action and again after settlement: does the duplicate
frame exist live? do duplicate CHILD elements exist live (render
containers), and do they remain? does anything of the duplicate reach
persistence, and with which identities? Is the sidebar row derived
from an actual live frame or from another state representation?

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, ONE active test, standard PATCH-064
harness board (two seeded frames; `PATCH-064 Portrait` = source),
driving ONLY the real presentation-sidebar Duplicate flow (row menu →
exact seven-item verification → `'Duplicate slide'`; no direct state
mutation, no callback invocation, no `dispatchEvent`, no
force/coordinate click), in this bound order:

1. **Baseline (pre-Duplicate):** record sidebar row count/titles,
   live frame-label ids, board-scoped
   `[data-padlet-id="<sourceContainerId>"]` count, total
   `[data-padlet-id]` count, and total
   `.excalidraw__embeddable-container` count.
2. **Act:** open the source row's menu; activate `'Duplicate slide'`.
   Derive **`duplicateRowAppeared`** — sidebar row count reaches 3
   with exactly two rows bearing the source title, within a bound
   15 s poll.
3. **Immediate live observation (bounded 10 s poll):** derive
   **`duplicateFrameInLiveSceneImmediate`** — a live frame-name label
   with a NEW frame id (diff against baseline label ids) appears.
   Derive **`duplicateChildRenderedImmediate`** — EITHER the
   board-scoped source-padlet card count reaches 2 OR the total
   embeddable-container count exceeds baseline (record both signals
   separately as supplementary evidence; the field is the OR).
4. **Settled persistence (PATCH-076 method):** poll the persisted
   master scene at ≤ 1 000 ms intervals across a ≥ 6 000 ms window;
   the settled final read is the SOLE persistence-derivation basis.
   Derive **`duplicatePersistedSettled`** — the settled persisted
   active frame-id set contains the new frame id — and
   **`duplicateChildrenPersistedSettled`** — the settled persisted
   scene contains ≥ 1 active embeddable whose `frameId` equals the
   new frame id. Record persisted duplicate-child scene ids and links
   (vs the source child's scene id/link) as supplementary evidence —
   this is the only channel where child-identity (shared vs cloned)
   is observable; record `null` when nothing persists.
5. **Post-settlement live stability re-read:** derive
   **`duplicateFrameLiveStable`** — the duplicate frame-name label is
   STILL present; **`duplicateChildRenderedStable`** — the §2.3 child
   signal (either variant) still holds; **`sourceChildStillRendered`**
   — the source's own card is still present exactly once. Also
   re-record sidebar row count/titles (supplementary).

PROHIBITED in this spec: `'Add slide below'`, `'Rename slide'`,
`'Remove slide'`, deleting the duplicate or any slide, page reload
(PATCH-080 already characterized reload), dragging/resizing any frame
or element, entering FullscreenPresentation, any Excalidraw canvas
mutation outside the single bound Duplicate action.

**Annotation contract (bind — exactly TEN literal fields):**

| Field | Definition |
|---|---|
| `duplicateRowAppeared` | §2.2 boolean |
| `duplicateFrameInLiveSceneImmediate` | §2.3 boolean (new frame-label id) |
| `duplicateChildRenderedImmediate` | §2.3 boolean (card-count OR container-count signal) |
| `duplicateFrameLiveStable` | §2.5 boolean |
| `duplicateChildRenderedStable` | §2.5 boolean |
| `sourceChildStillRendered` | §2.5 boolean (exactly one source card) |
| `duplicatePersistedSettled` | §2.4 settled-read boolean |
| `duplicateChildrenPersistedSettled` | §2.4 settled-read boolean |
| `classification` | derived, exactly one §3 enum value |
| `prefix` | real fixture prefix (must start with `patch-064-harness-patch-081-dupshape-`) |

No eleventh field. Supplementary raw evidence (baseline/post counts
for every signal, new frame id, persisted child ids/links, window and
interval values, post-settlement sidebar state) is welcome. All ten
values observation-derived; any outcome is a valid diagnosis.

## 3. Classification enum (bind, complete — derived in this order)

1. `!duplicateRowAppeared` → **`mixed-duplicate-clone-state`**
   (the action's flow itself misbehaved; claims unsound)
2. `!duplicateFrameInLiveSceneImmediate` →
   **`sidebar-only-duplicate`** (the row derives from a non-scene
   representation)
3. `duplicatePersistedSettled && duplicateChildrenPersistedSettled`
   AND every persisted duplicate-child scene id equals a SOURCE child
   scene id → **`frame-with-shared-child-identities`**
4. `duplicateChildRenderedStable && !duplicatePersistedSettled` →
   **`complete-live-clone-unpersisted`** (full live clone survives in
   scene; persistence alone drops it)
5. `duplicateChildRenderedImmediate && !duplicateChildRenderedStable`
   → **`frame-with-cloned-children-unpersisted`** (children appeared
   live then vanished before settlement)
6. `!duplicateChildRenderedImmediate && !duplicatePersistedSettled` →
   **`frame-only-duplicate`** (the frame reaches the live scene;
   children never render at all and nothing persists)
7. anything else → **`mixed-duplicate-clone-state`**

Six literals total (`mixed-duplicate-clone-state` closes both ends).
Do NOT hardcode the expected outcome — PATCH-080's evidence predicts
branch 6, but a different observation is a valid diagnosis and must
be recorded faithfully.

## 4. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-duplicate-clone-shape.spec.ts` | NEW file (absence verified at base `34d9d54` and worktree 2026-07-18 — confirm again before editing and before commit). One active test implementing §2. Existing harness (`createDisposableDrawingBoard('patch-081-dupshape')` → prefix `patch-064-harness-patch-081-dupshape-`), `registerDrawingCleanup(test)` + local `finally` per convention. Local UI helpers in-file, mirroring `drawing-slide-add-dup-persistence.spec.ts` idioms — do NOT edit that spec or the harness. Per-test timeout ≤ 240 000 ms. |

Absence gates (all, at base AND worktree, before editing and before
commit): `e2e/characterization/drawing-duplicate-clone-shape.spec.ts`
(the new file) and `e2e/characterization/drawing-slide-persistence.spec.ts`
(PATCH-077's never-created path — permanently absent; recreating it
is prohibited). No other new file may appear anywhere.

NO other file may change. Production source, the Excalidraw fork, the
harness, all existing specs, `playwright.config.ts`, and all `.fable5`
docs are PROHIBITED (governance files are CTO-only).

## 5. Immutable fences — 25 unique paths (Git blob IDs at base `34d9d54`)

Verification method (bind): fences are Git blob IDs — verify with
`git rev-parse 34d9d54371a0bcc6dd360dc06394130fad918afe:<path>` and
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
```

(PATCH-080's 24 fences plus its landed spec. The Excalidraw fork —
including `App.tsx`, whose §1 facts are context, not fence — is
protected by the §4 prohibition.)

## 6. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test), THREE sequential
stable runs.
Carried (unchanged): add-dup persistence 2/1/2; rename-state 2/1/2;
slide-duplication 2/1/2; menu-pointer 2/1/2; harness-cleanup 2/1/2;
presentation 2 passed / 2 approved skips; duplication 2/1/2; line 4
passed / 4 skipped cred-off; helper 7/1; sanitizer 9/1; focused
drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 25/25 fences.
Cleanup zeros across **FOURTEEN** prefixes: the thirteen tracked
prefixes plus `patch-064-harness-patch-081-dupshape-`.

## 7. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup` (the
`e2e/.auth/user.json` staleness incident is environmental and
four-times reproduced — refresh via setup and retry); no credential
contents anywhere; sequential `verify`/`build`, never under a dev
server; never commit generated artifacts (`test-results/`,
`playwright-report/`, JSON reporter output, scratch scripts).

## 8. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + local `finally`
defense with the idempotent zero-assertion. Duplicate is expected to
create NO new padlet rows (PATCH-076/080 evidence) — if one appears,
record it as evidence; the board-scoped fixture delete covers it. NO
Remove action; NO deletion of the duplicate. Post-run prefix-scoped
residue checks must be zero for all FOURTEEN §6 prefixes.
Test-timeout kill → sweep and report per the PATCH-074 rule.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (25/25, blob-ID method), or any §4
  absence gate differs;
- ANY existing file must change, or a SECOND new file is required;
- `'Duplicate slide'` cannot be driven deterministically through the
  real menu UI;
- `'Add slide below'`, `'Rename slide'`, `'Remove slide'`, a reload,
  FullscreenPresentation, or any deletion would need to be exercised;
- any observation requires force click, `dispatchEvent`, coordinate
  workaround, direct callback invocation, direct product-state
  mutation, or a per-test timeout above 240 000 ms;
- persistence settlement or the live-stability re-read cannot be
  observed deterministically;
- the observed combination requires a classification outside the §3
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix) — in
  particular census #3/#5 geometry/stale-base behavior;
- ANY fix, guard, or production improvement seems "obvious" —
  including any part of the deep-clone design. This patch observes;
  the census #2 fix is gated on its result.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the blob ID,
re-verifies 25/25 fences + all absence gates + one-file scope,
re-runs all §6 modes, extracts the ten-field annotation from a fresh
JSON reporter run, verifies every field is observation-derived, the
classification follows the §3 order, and the prohibited actions are
never driven); explicit PASS required; NO commit before PASS; then
commit with the bound message and push; Fable closes, rules on the
divergence point, and decides whether the census #2 deep-clone fix
can now be authorized with a proven owner.

**Bound commit message (verbatim):**
`test(e2e): characterize duplicate-slide live clone shape (PATCH-081)`

## 11. Required final report

New file + blob ID; all ten annotation fields with observed values;
baseline vs immediate vs stable counts for every live signal (frame
labels, source-scoped cards, total cards, embeddable containers);
settled persisted frame/child identity evidence (ids + links, or
null); the derived classification and what it implies for the exact
divergence point and the deep-clone fix owner; all §6 gate totals;
25-fence result + all absence gates + one-file scope proof; cleanup
proof across fourteen prefixes; production-import grep; commit hash +
push status after PASS.

## 12. Closure record (Fable CTO, 2026-07-18)

**Landed:** commit `718c99127adb6a39a7ed185e68b9817a5cea5b25`
(`test(e2e): characterize duplicate-slide live clone shape
(PATCH-081)`), exactly one new file at blob
`147ae0aeae503a36fd5e8e42d6cd3045b34b38c3`. HEAD == origin/main.
Sonnet independent review: **PASS** (25/25 blob-ID fences, all
absence gates, one-file scope, three live reproductions
byte-identical — zero drift; the no-live-frame result independently
re-verified via a throwaway zoom-to-fit check).

**Final ten-field diagnosis (all runs):**
`duplicateRowAppeared: true`,
`duplicateFrameInLiveSceneImmediate: false`,
`duplicateChildRenderedImmediate: false`,
`duplicateFrameLiveStable: false`,
`duplicateChildRenderedStable: false`,
`sourceChildStillRendered: true`, `duplicatePersistedSettled: false`,
`duplicateChildrenPersistedSettled: false`,
**`classification: sidebar-only-duplicate`**, `prefix`:
fixture-specific. `duplicateFrameId` was `null` in every run — no
fresh frame-label id EVER appeared.

**Diagnosis summary:** the real Duplicate action creates a third
presentation-sidebar row; no fresh drawing-canvas frame-label id
appears; no duplicate child/card render appears; the source frame and
child remain fully intact; nothing of the duplicate reaches
persistence; the duplicate row remains visible after settlement. The
narrowest PROVEN divergence boundary is between the sidebar/outer
React `elements` state (which must hold the duplicate frame — the
sidebar derives from it) and the direct Excalidraw live-scene
observables. The exact internal cause remains unresolved. No
production fix was implemented.

**State-dependent PATCH-080 refinement (recorded):** PATCH-080's
Add-then-Duplicate flow observed a fresh live frame-label id for the
duplicate; PATCH-081's Duplicate-only flow consistently observed
none. Both specs faithfully measured their bounded flows; this is a
real state-dependent divergence, not a locator or viewport defect in
either spec. Likely relevance: a prior Add action refreshes or
alters the outer React `elements` state before Duplicate runs.
(Residual caveat for the successor: the flow-A zoom-to-fit spot
checks used an unverified keyboard shortcut — PATCH-082 binds a
VERIFIED fit before label derivation to close this.)

**PATCH-076 interpretation (recorded):** 076 measured
FullscreenPresentation content resolution; 081 measured direct
drawing live-scene frame/child existence — distinct layers. 081
neither disproves nor fully confirms 076; it sharpens the five-way
separation among presentation sidebar state, outer React `elements`
state, Excalidraw live scene, FullscreenPresentation resolver
output, and persisted scene.

**Gates (all bound totals met):** new spec 2/1/2 ×3 stable; carried —
add-dup 2/1/2, rename-state 2/1/2, slide-duplication 2/1/2,
menu-pointer 2/1/2, harness-cleanup 2/1/2, presentation approved
totals, duplication 2/1/2, line-bridge approved totals; deterministic
— helper 7/1, sanitizer 9/1, focused drawing 59/2, full Vitest
448/43, typecheck/boundaries/verify/build/`git diff --check` green.
Cleanup: all FOURTEEN tracked prefixes 0/0/0; no Remove; no duplicate
deletion; no direct padlet-row creation; no artifacts; port 3000
free. The `e2e/.auth/user.json` staleness incident recurred a fifth
time (four specs in one `--no-deps` batch); resolved via the
sanctioned `--project=setup` refresh — environmental.
