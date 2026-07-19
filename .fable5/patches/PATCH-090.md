# PATCH-090 — Atomic Container Child Create-and-Append (Library + Draft Drops)

**Status:** **FIX AUTHORIZED** (production fix — the shared
library/draft create-and-append operation ONLY; existing-card
MOVE semantics are OUT OF SCOPE, see §3). ONE production file +
ONE new regression spec.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`92d742f27c550cf3d62b6ad8a1563b0ad09de5a2`
(`test(e2e): characterize container-drop relationship persistence (PATCH-089)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): atomic container child create-and-append with compensation (PATCH-090)`

---

## 0. Census at authoring (2026-07-19, from `92d742f`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Library-drop + draft-drop create-and-append atomicity (DrawingLayout ~292–311 header-strip library fallback; ~501–526 draft path)** | defect (production) | **SELECTED (this patch)** — same shape at both sites, one shared helper covers both without touching move semantics; runtime drivability of the draft path PROVEN by 089 Flows A/C; strict + compensation channels already wired to DrawingLayout (086) |
| 2 | Existing-card cross-container move (append ~487, parentId ~496; no old-parent removal) | defect family (production) | **DEFERRED — drivability defect gates it.** 089 Flow B: not drivable; closure inspection: NO live component sets `text/padlet-id` anywhere (setters survive only in `.bak`/`.backup` files). Restore-affordance patch must precede any move-correctness fix (§3 ruling) |
| 3 | Old-parent removal / new-parent append / child parentId for MOVE | defect states | subsumed by #2 — separate invariant already bound (089 §2); NOT touched here |
| 4 | Strict vs non-strict persistence channels (remaining non-strict callers: positions ~932/942; comments ~1939) | defect family | positions: best-effort BY DESIGN (088 §4 ruling, defer); comments: store-duality-entangled (Phase 3) |
| 5 | Duplicate child references (cross-container) | defect state | structurally possible only via #2's move path — deferred with it; same-container duplicates guarded at drop target (089-verified) |
| 6 | Rapid repeated drop serialization | hardening | 089 Flow C observed consistent persistence for the real repeatable action; ghost is consumed per drop (natural serialization); no characterized defect — deferred |
| 7 | Drag cancellation after partial persistence | hardening | no cancellation handling exists; requires failure-injection seam to characterize — deferred (no seam authorized) |
| 8 | Reload after partial relationship failure | defect state | consequence of #1/#2; #1's half becomes unreachable after this patch (compensation removes the orphan); #2's half deferred with the move |
| 9 | Remaining container-drop silent catch (~286–311 site catch) | defect mechanics | IN SCOPE — the library-site silent catch is replaced by the single visible error path of this fix |
| 10 | Comments/store duality | design | Phase 3 (bound decision, unchanged) |
| 11 | Broader seven-site canvas-ops error swallowing | design | later dedicated contract patch (decisions table stands) |
| 12 | PATCH-081 retirement note | governance | RETIRED-BY-NOTE stands; spec untouched/green; no action |
| 13 | Frame/sidebar sync | no characterized defect | deferred unless a repro appears |
| 14 | Line-follow | hardening | deferred |
| 15 | Uploaded-image storage cleanup | hardening | deferred |
| 16 | AI images in presentation | feature | deferred (fixture-blocked) |
| 17 | Overlap fallback | hardening | low, deferred |
| 18 | Connections side-panel planning | feature | deferred |
| 19 | New issue exposed by 089 | spec robustness | non-blocking reviewer observation only (ghost-consumed-but-no-row fallback labels as `action-not-drivable`); branch never fired; recorded in 089 §12; NOT production evidence; no action this patch |

## 1. Defect, product ruling, and the bound invariant

### Defect (statically proven at 089; runtime path proven drivable)

Both create-and-append sites in `DrawingLayout.tsx` (inside the
`DrawingEmbeddableCard` wrapper component) persist the child row
first (`onAddPadlet`, `parentId` set in the create payload) and
then append to the container's `childPadletIds` via the NON-STRICT
void `onUpdatePadlet` channel, whose failures are silently
swallowed (hook-level rollback + catch). At the library
header-strip site the whole sequence additionally sits inside
`catch { /* silent */ }`. A create-success/append-failure leaves
an ORPHAN: a persisted child row carrying `parentId` that no
parent lists — invisible until reload divergence.

The runtime wire order (089, stable ×2 flows ×3 runs):
child `POST` → 201, parent `childPadletIds` `PATCH` → 204, child
content `PATCH` → 204. The fix must keep this create-then-append
order and make the append's failure VISIBLE and COMPENSATED.

Create-failure is ALREADY safe: `addDrawingLayoutPadlet`
(useCanvasData) catches both failure channels, logs once, rolls
back the optimistic local row, returns `null`; both sites check
`if (created)`. No server row exists on create failure — no orphan
possible from that half. This patch does NOT change the create
channel.

### Bound invariant (create-and-append; the §2 excerpt of 089
scoped to this operation)

On success, ALL THREE persist together: child row exists;
`parent.childPadletIds` contains the child id EXACTLY ONCE;
`child.metadata.parentId` equals the parent id. On parent-append
failure: the newly created child row is DELETED (compensation) —
no orphan, no parent reference, source/container state otherwise
unchanged, exactly ONE visible error is emitted, and the child
does not remain in local UI. No swallowed resolved error; no
swallowed thrown error. The pre-existing optimistic-create
rollback contract (PATCH-041/051 semantics: transient local row,
removed on failure) is the ACCEPTED explicit rollback contract
for the transient window; FINAL states must satisfy
both-or-neither.

**Move invariant (bound at 089 §2) is NOT implemented here** and
must not enter scope (stop condition).

### Transactional model (bind): MODEL A — persistence-first with
compensation (the 086 precedent). MODEL B rejected (no rollback
contract for the append half; building one is broader). No mixing.

## 2. Exact production change (bind)

ONE production file: `components/collabboard/canvas/layouts/DrawingLayout.tsx`
(starting blob `a2fb3aebf0f66967c40c1765b5bf69b2e853d05c`).

1. **Extend `DrawingEmbeddableCardProps`** (~203–222) with the two
   already-available channels:
   `onUpdatePadletStrict: (id: string, updates: Partial<Padlet>) => Promise<void>`
   and `onDeletePadlet?: (id: string) => Promise<void>`; pass both
   at the single `DrawingEmbeddableCard` instantiation (~1957
   region) from the outer DrawingLayout props (mounted from
   CanvasClient at ~6789–6792 — NO CanvasClient change needed).
2. **ONE shared local helper** inside DrawingLayout.tsx (e.g.
   `linkCreatedChildToContainer(containerId, createdId)`), used by
   BOTH sites, that:
   - reads the container row from `allPadlets` (existing lookup
     idiom);
   - appends via `onUpdatePadletStrict(containerId, { metadata:
     { ...container.metadata, childPadletIds: [...current,
     createdId] } })` — the THROWING channel (its post-success
     `setPadlets` merge in CanvasClient is the confirmed local
     mutation point);
   - on throw: best-effort compensation
     `await onDeletePadlet?.(createdId)` guarded so a compensation
     failure cannot itself throw out of the handler
     (`Promise.allSettled` or try/catch — the 086 idiom), then
     emits EXACTLY ONE
     `console.error('Failed to link child to container', …)`;
     compensation is bounded to the NEWLY CREATED row id only;
   - never retries, adds no timer, shows no unconfirmed child
     (successful `onDeletePadlet` removes the optimistic row from
     local state via its existing `setPadlets` filter).
3. **Library header-strip site (~292–311):** route the append
   through the helper; the site's `catch { /* silent */ }` is
   REPLACED by the helper's single visible error path (the
   payload-parse guard may keep a narrow catch, but it must log —
   no empty catch remains).
4. **Draft site (~501–526):** route the append through the helper.
   No other change.

**Untouched (bind):** `onDropExistingPadlet` (~482–499) BYTE-KEPT
— move semantics out of scope. Create payloads (parentId at
creation) unchanged. `saveDrawingSnapshot`, positions, comments,
duplication paths unchanged. No repository/hook/CanvasClient
change; no new dependency.

**Error contract (bind):** thrown-error contract only (no Result
mixing at the call sites); resolved repository failures already
reject inside `updatePostFieldsOrThrow`; exactly one visible error
per failed operation; no duplicate console/toast reporting added
by this patch (the compensation channel `deletePadletById`'s own
pre-existing toasts are channel behavior, not counted — the 086
closure precedent); no automatic product-action retry; no new
timer; newer local state not clobbered.

## 3. Existing-card move ruling (bind)

Cross-container move is ruled **intended but currently
inaccessible** — a SEPARATE UI-drivability defect: the handler and
the `text/padlet-id` drop-zone read exist deliberately
(RowColumnContainerCard ~314–319), but NO live component sets
`text/padlet-id` (setters survive only in `.bak`/`.backup` files —
closure-time repo-wide grep). Consequence: a future patch must
restore a genuine draggable affordance FIRST; only then can
move-relationship correctness (old-parent removal, duplicate-parent
guard, 089 §2 move invariant) be fixed and runtime-verified. Any
move-semantics edit in THIS patch is a STOP condition. No runtime
move-correctness claim is made from static reasoning.

## 4. Regression matrix (bind) and the new spec

ONE new spec `e2e/characterization/drawing-container-link.spec.ts`
(ONE active test, up to THREE sequential disposable boards,
existing harness only, `registerDrawingCleanup(test)` at module
scope, per-board try/finally + zero-assertion,
`test.setTimeout(420_000)`; bound prefixes
`patch-064-harness-patch-090-link-a-` / `-b-` / `-c-`).

The driven action is the 089-PROVEN
`toolbar-note-editor-save-placement-prompt-add-to-existing-ghost-drag`
(the draft path — which is also where RowColumnContainerCard
routes library/SVG/json payload drops on the card body). The
header-strip library fallback shares the same helper and is
covered by source inspection (Flow E) — driving a real Personal
Library drag is NOT bound (unproven drivability; the 089 lesson:
never fabricate an action).

- **Flow A (board a)** — real ghost-drag drop succeeds: fresh
  child id; `parent.childPadletIds` contains the child EXACTLY
  once; `child.parentId` == parent; reload preserves the
  relationship both directions.
- **Flow B (board b)** — second real drop into the SAME container
  (sequential ghost-drags): both children linked exactly once,
  both `parentId`s correct, order preserved, no duplicate
  references, reload consistent.
- **Flow C (board c)** — rapid repeated real drops (≤5 s apart):
  no duplicate child reference, no orphan rows (every child row on
  the board with `parentId` == container is listed by the
  container exactly once), all resulting children have matching
  `parentId`, reload consistent.
- **Flow D (all boards)** — passive wire order (089 method): child
  create `POST` 2xx confirmed BEFORE the parent append `PATCH`
  2xx; append confirmed before settlement; statuses recorded; no
  `page.route`, no auth capture.
- **Flow E (source inspection, recorded in the review)** — the
  reviewer re-derives from the fenced/allowed sources: helper used
  by BOTH sites; strict append channel; compensation bounded to
  the created id; single visible error; no empty catch; library
  header-strip site routed through the helper; move handler
  byte-kept.
- **Flow F (all boards)** — per-board cleanup zero-assertions
  (`assertDrawingFixtureCleanup` 0/0/0).

The failure path (append-fails → compensation) is verified by
SOURCE INSPECTION (Flow E), NOT by runtime failure injection — no
injection seam is authorized (stop condition).

## 5. Allowed files (bind)

| File | Role | Starting state at base `92d742f` |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | production fix | blob `a2fb3aebf0f66967c40c1765b5bf69b2e853d05c` |
| `e2e/characterization/drawing-container-link.spec.ts` | NEW regression spec | absent at base (absence gate) |

TWO files total. NO harness change, NO config change, NO
CanvasClient/useCanvasData/repository change, NO package/lockfile
change. Absence gates: the new spec absent at base and worktree
before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-091 not started.

## 6. Immutable fences (bind — 38, Git blob IDs)

Verify each with `git rev-parse 92d742f…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 089 set with
DrawingLayout MOVED to §5 (allowed), PLUS the landed 089 spec and
`RowColumnContainerCard.tsx` (read-only drop-zone dependency).

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
components/collabboard/RowColumnContainerCard.tsx              e58167d51324ef9bf9d928251ad91d60756616a7
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
e2e/characterization/drawing-container-drop.spec.ts            32750636c1146f5bf8da3e7f9987838b26c5169b
e2e/run-carried-groups.mjs                                     6a04d94e6bcc71fdd6e647f5961707607ad1317d
```

## 7. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` /
2 skipped credential-off**, THREE sequential stable dependency
runs. Carried: all 14 runner specs' totals UNCHANGED (via the
PATCH-088 grouped runner; bounded recovery only) **PLUS a separate
dependency-mode invocation of
`e2e/characterization/drawing-container-drop.spec.ts` = 2 passed**
(the 089 spec joins the carried set; the runner's bound group list
is NOT modified this patch — runner-list extension is a future
infra mini-change). The 089 spec's observational classifications
remain valid post-fix (successful drops still classify
`drop-persists-consistently`; Flow B stays `action-not-drivable`).
Deterministic: helper 7/1; sanitizer 9/1; focused drawing 59/2;
full Vitest **448/43**; diff-check/tsc/boundaries/sequential
verify+build green; zero production imports in specs; 38/38
fences. Cleanup zeros across **THIRTY-FIVE** prefixes (the
thirty-two tracked plus this patch's three §4 prefixes).

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents;
passive listeners only (no `page.route`, no auth headers);
sequential `verify`/`build`, never under a dev server; never
commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (38/38), or any §5 absence gate differs;
- the fix requires touching a SECOND unrelated operation, ANY
  edit to `onDropExistingPadlet`/move semantics, old-parent
  removal, CanvasClient, useCanvasData, the harness, config, or a
  repository file;
- compensation cannot be bounded to the newly created row id;
- the container/source parent row could be damaged on any path;
- the UI must show an unconfirmed child beyond the pre-existing
  optimistic-create rollback contract;
- the regression flows cannot be driven through the real ghost-drag
  action (no hidden handler, no synthetic event — record and STOP,
  do not fabricate);
- verifying the failure path would require failure injection or an
  instrumentation seam;
- any carried spec's totals change (including the separate 089
  spec invocation);
- cleanup cannot reach zero for any board;
- the PATCH-089 diagnosis would have to be weakened/edited to pass.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted TWO-file diff + report (blobs
re-derived; production hunk audit against §2; per-flow recorded
values; three-run stability; carried totals via the runner + the
separate 089-spec run; deterministic totals; fence result; cleanup
proof). The independent read-only reviewer re-derives everything
(including Flow E source inspection) and must return an explicit
PASS before the implementer commits with the bound message and
pushes. CTO closes.

## 11. Required final report

Exact two changed paths + final blobs; production diff summary
(hunks vs §2); per-flow results; wire-order evidence; three-run
stability; carried totals (runner 14/14 + 089 spec 2 passed);
deterministic totals; 38-fence result + absence gates; cleanup
across thirty-five prefixes; explicit confirmations (no move-path
edit, no CanvasClient/hook/config/harness change, no injection, no
retry/timer, single visible error path, compensation bounded to
created rows); commit hash + push status after PASS.
