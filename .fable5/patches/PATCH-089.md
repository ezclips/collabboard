# PATCH-089 — Container-Drop Relationship Persistence Diagnosis

**Status:** **DIAGNOSIS AUTHORIZED** (diagnosis-only — NO
production fix in this patch). ONE new characterization spec. NO
production change, NO harness change, NO config change, NO
failure injection, NO instrumentation seam.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing — the closure ruling gates
the container-drop production fix (leading PATCH-090 candidate).

**Behavioral/source base commit AND implementation start HEAD (bind):**
`22d3f1fc18cfbed3ffad372ed67aa71de8d0cfab`
(`test(e2e): grouped carried-suite runner with auth-expiry classification (PATCH-088)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize container-drop relationship persistence (PATCH-089)`

---

## 0. Census at authoring (2026-07-19, from `22d3f1f`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Container-drop non-atomic relationship updates (cluster ~307/487/496/520)** | defect family (production) | **SELECTED — diagnosis first (this patch)**; statically proven hazards (§1) but runtime reachability/semantics unproven; fix would be speculative without evidence |
| 2 | Parent `childPadletIds` / child `parentId` consistency + orphan/half-link states | defect states | the SUBJECT of #1's characterization (§2 invariant vs current behavior) |
| 3 | Silent catches + rollback/compensation ordering in the cluster | defect mechanics | recorded statically (§1/§5); runtime confirmation via Flow D/E |
| 4 | Remaining non-strict `onUpdatePadlet` callers (positions ~932/942; comments ~1939) | defect family | positions: intentionally best-effort (DEFER by design ruling, 088 §4); comments: HIGH severity but store-duality-entangled (Phase 3) — after the cluster |
| 5 | Broader seven-site canvas-ops error swallowing + Result/throw consistency | design | later dedicated patch; decisions-table entry stands |
| 6 | PATCH-081 | RETIRED-BY-NOTE (confirmed) | spec untouched/green; deep-clone spec authoritative; no acceptance gate depends on the stale label; no bundling |
| 7 | Frame/sidebar geometry/position sync | no characterized defect | 079/080 green post-085/086; deferred unless a repro appears |
| 8 | Line-follow | hardening | deferred |
| 9 | Uploaded-image storage cleanup | hardening | deferred |
| 10 | AI images in presentation | feature | deferred (fixture-blocked) |
| 11 | Overlap fallback | hardening | low, deferred |
| 12 | Connections side-panel planning | feature | deferred |
| 13 | New issue exposed by 088 | — | NONE (review PASS; runner exercised its bounded branch under a real incident without masking) |

## 1. Exact defect surface (bind — statically proven; runtime
evidence is this patch's product)

All four cluster sites live in `DrawingLayout.tsx` (blob
`a2fb3ae…`, FENCED — read-only this patch):

1. **~307 (library-item drop into container card):** create child
   row (`parentId` set at creation) → append to container
   `childPadletIds` via NON-STRICT `onUpdatePadlet` — the entire
   sequence is wrapped in `catch { /* silent */ }`, which would
   swallow even a thrown failure. Failure → created row exists but
   no parent references it (ORPHAN on reload).
2. **~487/​~496 (drag existing card into container —
   `onDropExistingPadlet`):** TWO sequential non-strict writes:
   append to new parent's `childPadletIds`, then set child
   `parentId`. Non-atomic; either half can silently fail
   (half-linked state). **CRITICAL STATIC FINDING:** the handler
   NEVER removes the child from a PREVIOUS parent's
   `childPadletIds`; the drop target
   (`RowColumnContainerCard.tsx` ~314–319, FENCED... NOT in the
   fence list — read-only regardless) only guards self-drop and
   same-container duplicates. If a drag can be initiated from a
   card already inside another container, a move A→B leaves the
   child referenced by BOTH parents with `parentId = B`
   (duplicate-parent state). Whether that drag is actually
   drivable in the drawing layout is UNPROVEN — a core question of
   this diagnosis.
3. **~520 (draft drop into container):** create row (parentId at
   creation) → append to container list via non-strict update —
   same orphan hazard as #1 (no site-level silent catch here, but
   the void channel swallows everything anyway).

Persistence channels available for a future fix (recorded at §5):
strict throwing channel `onUpdatePadletStrict` already passed to
DrawingLayout (086); `onAddPadlet` throws on create failure;
`onDeletePadlet` available for compensation — a MODEL A fix can
stay inside DrawingLayout.

## 2. Bound relationship invariant (product ruling — the TARGET;
this diagnosis measures the current gap)

- `parent.childPadletIds` contains the child id ⟺
  `child.metadata.parentId` equals that parent id (BOTH or
  NEITHER persist — never a half-link);
- a child has AT MOST ONE parent (multi-parent is NOT supported);
- `childPadletIds` order is preserved;
- moving a child between parents REMOVES it from the old parent
  and ADDS it to the new one, atomically-or-compensated;
- a failed move leaves the ORIGINAL relationship intact;
- a failed add leaves NO orphan row;
- no duplicate child references;
- local UI reflects confirmed persistence, or an explicit
  optimistic-rollback contract (none exists today).

**Bound transactional TARGET model: MODEL A — persistence-first
with compensation** (the 086 precedent: persist all relationship
writes via throwing channels, confirm, mutate local scene/UI only
after confirmation, compensate intermediate writes on failure).
MODEL B (optimistic + deterministic rollback) is REJECTED as the
target — no rollback contract exists and building one is broader
than the MODEL A path. Implementation is NOT authorized here; the
PATCH-090 fix must bind to this invariant unless this diagnosis
disproves an assumption.

## 3. Bound failure-mode inventory (static; runtime columns are
this patch's output)

| # | Mode | Statically expected current behavior |
|---|---|---|
| 1 | child create ok, parent append fails | orphan row; silent (site 1: even throws swallowed) |
| 2 | parent append ok, child `parentId` fails | parent lists child, child unowned; silent |
| 3 | old-parent removal | DOES NOT EXIST — moves never remove from old parent |
| 4 | child reparented, old parent still lists it | structurally guaranteed on any cross-container move |
| 5 | local UI updated, persistence failed | hook-level silent rollback ⇒ reload divergence |
| 6 | rollback attempt fails | no rollback exists at cluster sites |
| 7 | duplicate child reference | same-container guarded at drop target; cross-container NOT guarded |
| 8 | rapid repeated drop | unserialized async handlers; interleaving unproven |
| 9 | drag cancel after partial persistence | no cancellation handling |
| 10 | reload after partial failure | renders whatever half-state persisted |

## 4. Diagnosis matrix (bind) and the new spec

ONE new spec `e2e/characterization/drawing-container-drop.spec.ts`
(ONE active test, up to THREE sequential disposable boards,
existing harness only, `registerDrawingCleanup(test)` at module
scope, per-board try/finally + zero-assertion,
`test.setTimeout(420_000)`; bound prefixes
`patch-064-harness-patch-089-drop-a-` / `-b-` / `-c-`).

This is an OBSERVATIONAL diagnosis: outcomes are RECORDED in bound
annotation fields, not asserted as product-correct. Per flow, if
the driving user action proves NOT drivable through the real UI
(e.g., no drag source exists in the drawing layout), record the
bound value `action-not-drivable` for that flow WITH the probing
evidence — that is a valid diagnostic result, NOT a failure.

- **Flow A (board a)** — drop an existing card into a container
  through the real UI (HTML5 drag of a card exposing
  `text/padlet-id` onto the container drop zone). Record: both
  relationship directions in settled persistence
  (`parent.childPadletIds` contains child; `child.parentId` ==
  parent), reload state, and whether each direction persisted.
- **Flow B (board b)** — move a child from container A to
  container B (if drivable). Record: whether A still lists the
  child (the §1 duplicate-parent hazard), whether B lists it,
  `child.parentId`, reload state, count of parents referencing the
  child.
- **Flow C (board c)** — rapid repeated drop/move (≤5 s apart).
  Record: final reference counts, duplicate references, settled
  consistency.
- **Flow D (all boards)** — passive wire ordering (084/085
  method): record the parent/child PATCH sequence, payload field
  presence (childPadletIds vs metadata.parentId), and 2xx
  statuses. No `page.route`, no auth capture.
- **Flow E (source inspection, recorded in the patch review — not
  browser-driven)** — the §1/§3 static findings; the reviewer
  re-derives them from the fenced sources.
- **Flow F (all boards)** — per-board cleanup zero-assertions
  (`assertDrawingFixtureCleanup` 0/0/0) — no orphan rows escape
  the fixtures even when half-links are recorded.

Bound classification field (single, derived in bound order):
`drop-persists-consistently` |
`drop-half-link-observed` |
`move-leaves-duplicate-parent` |
`action-not-drivable` |
`mixed-drop-state`.

## 5. Allowed files (bind)

| File | Role | Starting state at base `22d3f1f` |
|---|---|---|
| `e2e/characterization/drawing-container-drop.spec.ts` | NEW diagnosis spec | absent at base (absence gate) |

ONE file. NO production file is authorized. Absence gates: the new
spec absent at base and worktree before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-090 not started.

## 6. Immutable fences (bind — 37, Git blob IDs)

Verify each with `git rev-parse 22d3f1f…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 088 fence set
PLUS the landed runner.

```text
playwright.config.ts                                           5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                             9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx                  02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                     b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx             655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/menus/LineContextMenu.tsx               aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                           e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                      2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                                f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                        b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                    ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                    7d6b6ee6e127a0db8161c09afdf31a54f44ac575
lib/infra/collabboard/clonedPostMetadata.test.ts               5b53e839d66e399c1357a7656109496c65a2e5d1
components/collabboard/canvas/hooks/useCanvasActions.ts        b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
components/collabboard/canvas/hooks/useCanvasData.ts           2e158f1278a395b5028083e8f387a22e4daf5b60
lib/domain/canvas/posts.ts                                     5af51ef0cec14c014072529eda673e81a87c4b8b
lib/infra/canvas/postsRepository.ts                            3a74731730ef047f023465dd65d86700fe878e74
app/dashboard/canvas/[id]/CanvasClient.tsx                     a028dd65c1935068a7206a67db869a8f5345011a
components/collabboard/canvas/layouts/DrawingLayout.tsx        a2fb3aebf0f66967c40c1765b5bf69b2e853d05c
e2e/characterization/drawingBridgeHarness.ts                   7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts              6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f
e2e/characterization/drawing-line-bridge.spec.ts               7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts               87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts           5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts         50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts         fc20ef8160417b6eeb59f4662ab89ceb1af5a167
e2e/characterization/drawing-slide-rename-state.spec.ts        513d07bfe99898455d13d7048a53da90c3b5d401
e2e/characterization/drawing-slide-add-dup-persistence.spec.ts 9a6c7b42a6b476fe74d74483a7fa057a4cf61e7e
e2e/characterization/drawing-duplicate-clone-shape.spec.ts     147ae0aeae503a36fd5e8e42d6cd3045b34b38c3
e2e/characterization/drawing-duplicate-divergence.spec.ts      5d3cccb693f57022c9e9aa44522bee6f59552332
e2e/characterization/drawing-save-supersession.spec.ts         c6cc4feaa6f2320932232a993b70cda73c9e584c
e2e/characterization/drawing-save-wire.spec.ts                 280d37545e9d638c5eb8d883ffa99beefa5da308
e2e/characterization/drawing-duplicate-persistence.spec.ts     b0ab5ea55195e3aab5a43aa8e73e88cd136723f4
e2e/characterization/drawing-duplicate-deep-clone.spec.ts      0644447cc2bea1b21c9b47ba03b7d69de2617fb7
e2e/run-carried-groups.mjs                                     6a04d94e6bcc71fdd6e647f5961707607ad1317d
```

## 7. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` /
2 skipped credential-off** (setup + one active test), THREE
sequential stable dependency runs — recorded VALUES must be
coherent across runs; `action-not-drivable`, if it occurs, must be
deterministic (same flows, all three runs). Carried: all 14
existing specs' totals UNCHANGED (run via the PATCH-088 grouped
runner; any auth-expiry incident uses the runner's bounded
recovery and is reported as infrastructure). Deterministic: helper
7/1; sanitizer 9/1; focused drawing 59/2; full Vitest **448/43**;
diff-check/tsc/boundaries/sequential verify+build green; zero
production imports; 37/37 fences. Cleanup zeros across
**THIRTY-TWO** prefixes (the twenty-nine tracked plus this patch's
three §4 prefixes).

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents;
passive listeners only (no `page.route`, no auth headers);
sequential `verify`/`build`, never under a dev server; never
commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (37/37), or any §5 absence gate differs;
- the diagnosis requires ANY production edit, harness edit, config
  edit, second file, failure injection, or instrumentation seam;
- driving a flow requires simulating DOM events synthetically in a
  way that bypasses the real drop-zone handlers (record
  `action-not-drivable` instead — do NOT fabricate the action);
- recorded values are incoherent across the three runs;
- any carried spec's totals change;
- cleanup cannot reach zero for any board.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diff + report (blob
re-derived; per-flow recorded values; three-run stability; carried
totals via the runner; deterministic totals; fence result; cleanup
proof). The independent read-only reviewer re-derives everything,
re-runs the spec three times, re-derives the §1 static findings
from the fenced sources, and must return an explicit PASS before
the implementer commits with the bound message and pushes. CTO
closes with the container-drop fix ruling (PATCH-090 candidate)
based on the recorded evidence.

## 11. Required final report

Exact one changed path + final blob; per-flow recorded values and
classification; duplicate-parent verdict (observed / not-drivable /
consistent); wire-order evidence; three-run stability; carried
totals; deterministic totals; 37-fence result + absence gates;
cleanup across thirty-two prefixes; explicit confirmations (no
production/harness/config change, no injection, no seam, no auth
capture); commit hash + push status after PASS.
