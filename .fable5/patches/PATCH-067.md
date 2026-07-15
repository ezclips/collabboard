# PATCH-067 - Diagnose Back-Line Context Menu Routing

Status: APPROVED — ACTIVATED 2026-07-15 (base rebound, census refreshed —
see §0.1); AMENDED 2026-07-15 (§0.2: selected-state divergence accepted
as R6 after a correct pre-edit STOP — State U success + State S failure
is now the expected, unambiguously classified outcome).
Diagnosis/characterization patch, test-only. No production
change is authorized by this patch; if the census proves a single
smallest production cause, the FIX is a separate future patch
(PATCH-068) authorized by Fable on this patch's evidence, with a fresh
production census.
Approved by the Fable CTO 2026-07-15.
Role: implementation engineer after Fable approval.
Sequencing: PATCH-066 test correction has LANDED with an explicit
independent Sonnet PASS. **Base commit:
`b1f4e1ace9f1665fbdada3eab7769a7b69f002fb`**
(`test(drawing): freeze working back-line selection routing
(PATCH-066)`). If HEAD at pre-flight is not this commit, re-derive and
STOP on any fence mismatch.

**Bound commit message (use verbatim):**

```
test(drawing): characterize back-line context menu routing (PATCH-067)
```

## 0.1 Activation (2026-07-15) — base rebound, census refreshed at b1f4e1a

PATCH-066 landed as a test-only correction (commit `b1f4e1a`, Sonnet
PASS, exactly one file: `e2e/characterization/drawing-line-bridge.spec.ts`,
232 insertions / 80 deletions). The CTO re-read the COMMITTED test and
re-derived the context-menu census from live source before activating
this patch. Everything below in this section is bound and supersedes any
conflicting detail in the original §2 census where noted.

### 0.1.1 Committed-test facts (confirmed by reading the landed spec)

- Left-click and double-click assertions are FIXED (unconditional
  `toMatchObject`), settle-aware (`expect.poll` + double-rAF cycle wait),
  and IMMUTABLE for this patch — a regression must FAIL, never be
  absorbed.
- No adaptive routing branch remains (the PATCH-065
  `PointerClassification` union and its three-way accept-anything block
  are gone).
- The frozen role matrices: after left-click selection all handle roles
  are 0 (label-handle 1); after DOUBLE-CLICK (edit-mode entry) the seeded
  2-point line renders `midpoint-handle: 1, point-handle: 2`
  (legacy start/control/end stay 0).
- The committed right-click occurs AFTER the dblclick, and its frozen
  evidence is: `contextmenu-capture` guardPassed true, lookup resolves
  `midpoint-handle`, line menu absent (`contextMenuVisible: false`).

### 0.1.2 Census corrections/additions (from live source at b1f4e1a)

1. **Handles are an EDIT-MODE phenomenon, not a selection phenomenon.**
   `SimpleLineRenderer.tsx:813`: edit handles render under
   `isEditMode && isSelected`. A line selected by left-click alone
   renders NO point/midpoint handles (frozen matrix confirms). The
   Stage-0 `midpoint-handle` resolution therefore occurred in the
   post-dblclick EDIT-MODE state — and for a 2-point line the midpoint
   handle sits exactly at the segment midpoint, which IS the hit-path
   center the test clicks. §2.2's "selected" wording is refined
   accordingly; the required states in §3 are re-specified below.
2. **The bridge contextmenu handler has NO button guard.**
   `DrawingLayout.tsx:2573-2671` guard chain is exactly: reentrancy ref →
   `activeToolType !== 'selection'` → target instanceof
   HTMLCanvasElement → `excalidraw__canvas` class → fresh
   `findBackLineInteractiveTargetAtPoint` lookup. Unlike
   mousedown/click-capture there is no `event.button !== 0` rejection,
   and the handler NULLS `bridgedBackLineInteractiveTargetRef` before
   dispatch. On success it `preventDefault()`s + `stopPropagation()`s
   the REAL contextmenu (suppressing both the native browser menu and —
   via capture-phase stop — Excalidraw's own React `onContextMenu`
   bubble handler), then dispatches a synthetic bubbling
   `MouseEvent('contextmenu')` at the resolved element.
3. **Only the hit-path is context-menu-capable.**
   `SimpleLineRenderer.tsx:708-721` (hit-path): preventDefault +
   stopPropagation + `onSelectLine(line.id)` +
   `onContextMenu?.(line.id, e.clientX, e.clientY)`. NO handle role
   (point/midpoint/start/control/end/label) registers `onContextMenu`
   (verified per-role at `:801-865`). A synthetic contextmenu dispatched
   at a handle bubbles up to the SVG ROOT's `onContextMenu`
   (`SimpleLineRenderer.tsx:626-631`), which in edit/line mode only
   `preventDefault()`s + `stopPropagation()`s — it opens nothing. That
   is the deaf-element path.
4. **CanvasClient menu state has a permission gate.**
   `handleLineContextMenu` (`CanvasClient.tsx:3275-3278`) returns early
   unless `canUseFreeformEditButton`
   (= `canEditWorkspace(currentWorkspaceRole)`, `CanvasClient.tsx:274`)
   — expected TRUE for the authenticated harness owner, but the
   diagnosis must confirm it (an unexpectedly false gate is an R4-class
   cause, not R1). Menu state `lineContextMenuState` renders via
   CanvasModals (`CanvasClient.tsx:7793-7794`); the back-plane renderer
   receives `onContextMenu={handleLineContextMenu}` at
   `CanvasClient.tsx:6322`.
5. **Excalidraw's own contextmenu path.** `handleCanvasContextMenu`
   (fork `App.tsx:11673`) `preventDefault()`s and opens Excalidraw's
   menu — but it is a BUBBLE-phase React handler on the canvas
   (`App.tsx:1962/2287`), so whenever the bridge's capture handler
   resolves a target and stops propagation, Excalidraw's menu never
   runs. It can only race the app menu when the bridge lookup FAILS
   (guard exit) and propagation continues.

### 0.1.3 Refreshed fences and baselines (all re-derived at b1f4e1a)

Authorized-change baseline (the ONLY modifiable file):

```text
e2e/characterization/drawing-line-bridge.spec.ts 075360ab6a764b034ef7703e22ecdbaf34c135c1
```

The pre-PATCH-066 hash `9853d10d…` is DEAD — any tree matching it means
PATCH-066 is not landed; STOP.

Immutable fences — 38 files, ALL verified matching at `b1f4e1a`
(re-verify at pre-flight and after gates). The set is exactly PATCH-066
§9's immutable set WITH DrawingLayout.tsx (Amendment 2), i.e. the 31
PATCH-064 §11 fences (including
`components/collabboard/canvas/layouts/DrawingLayout.tsx
b3684e4c6226ec2ad77fbff3265de25339a7f471`,
`components/collabboard/SimpleLineRenderer.tsx
a38572a499d6aadf3002fa34f7a8e0e321220ea6`,
`components/collabboard/canvas/ui/FreeformPadletCards.tsx
1c12d24a42c45a279efb4da0de785b478e4ca385`, and the three Excalidraw fork
files) plus:

```text
lib/infra/drawing/lineBridge.ts f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/lineBridge.test.ts 559087550bf4a0304501ad479555ab4f4ad636a4
lib/infra/drawing/presentationBridge.ts b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/presentationBridge.test.ts dff458de747d673868b1eae2b695e41b4c3424d2
e2e/helpers/env.ts 9514723cde157f7ae6e6815d4c142a0f430a1292
e2e/characterization/drawingBridgeHarness.ts 85a6566dbb8cd16f19151133ed33b9872a97ff11
e2e/characterization/drawing-presentation.spec.ts c6bfb4f01b0b4e5bd7654ee1405b6070141fbc09
app/dashboard/canvas/[id]/CanvasClient.tsx 1c6864b46e1c5c9a52f9e771ee2e51793898ecd8
```

Bound pre-flight baselines (all reconfirmed on the PATCH-066 acceptance
run at this base): setup 1 passed; credentialed line 4 passed;
credentialed presentation 2 passed / 2 approved skips; credential-off
line 4 skipped / presentation 4 skipped; focused Vitest 51/2; full
Vitest 424/41; cleanup boards=0 / padlets=0 / canvasLines=0 (verified by
an independent service-role query, not only the harness assertion);
tsc / boundaries / verify / build green; zero production imports of
lineBridge / presentationBridge / drawingBridgeHarness. PATCH-066
Amendment 1's auth-state regeneration procedure remains in force.

### 0.1.4 Required test states (supersedes the two-state wording in §2.2/§3)

- **State U — unselected:** line starts unselected; only
  visible-path / hit-path / label-handle exist (frozen pre-click
  matrix). Right-click at the hit-path center. Expected lookup input has
  no handles; record what the lookup resolves (census predicts
  `hit-path` unless the label overlaps the center), the synthetic
  dispatch target, whether the hit-path handler fires
  (`[SimpleLineRenderer:event]` contextmenu diagnostics if emitted, plus
  CanvasClient menu visibility), and whether the line menu opens.
- **State S — selected + edit mode (Stage-0 reproduction):** establish
  selection and edit mode STRICTLY through the frozen working sequence
  (left-click → settle → dblclick → settle; assertions per the
  committed test remain untouched). Verify `midpoint-handle: 1,
  point-handle: 2` per the frozen matrix. Right-click the same
  coordinate; record role-priority resolution (census predicts
  `midpoint-handle` — it sits at the click point on a 2-point line),
  synthetic dispatch target, any handler receipt, and menu visibility.
- The intermediate plain-selected state (post left-click, pre dblclick,
  no handles) needs no separate right-click; if the implementer can
  record its lookup outcome without weakening the frozen assertions,
  annotate it as supplementary evidence only.
- The diagnosis MUST state whether the failure depends on the
  selected/edit-mode state (different lookup resolutions per state) or
  is state-independent (menu fails in both states).

### 0.1.5 Classification table — revalidated (naming preserved, coverage bound)

Exactly one row (or an evidence-ordered chain) must be proven per state,
with console/DOM evidence:

- **R1** — lookup resolves a handle role that has no contextmenu handler
  (State S deaf-element path: synthetic event lands on
  midpoint/point-handle, bubbles to the suppress-only SVG root, menu
  never opens). Includes the sub-case where the non-left-button
  mousedown rejection (`non-left-button`, by design) is load-bearing
  for some required pre-contextmenu setup — record explicitly if the
  evidence shows the bridged-target ref or any mousedown side effect is
  actually needed by the contextmenu path (census says it is not: the
  contextmenu handler does its own fresh lookup).
- **R2** — the failure is ALSO present in State U where the lookup
  resolves `hit-path`: the synthetic dispatch reaches the hit-path
  handler (or fails to), yet the menu still does not open — cause is
  deeper than role priority. Record which link breaks (dispatch,
  handler receipt, callback invocation).
- **R3** — the hit-path handler RUNS and calls the callbacks, but the
  menu is suppressed or immediately cleared by a later handler
  (document-level click-away, Excalidraw state write, overlay
  unmount). Evidence: handler diagnostics fire AND
  `lineContextMenuState` visibly sets then clears, or menu flashes.
- **R4** — the callback chain is not wired or is gated off for
  back-plane lines in the Drawing layout (e.g.
  `canUseFreeformEditButton` false, `onContextMenu` prop absent on the
  back-plane renderer instance, or `handleLineContextMenu` early
  return). Evidence: handler fires, callback provably does not set
  state.
- **R5** — Excalidraw consumes the REAL contextmenu before the bridge
  (capture-order evidence required — census predicts impossible while
  the bridge guard passes, since the bridge stops propagation in
  capture phase; only reachable on a bridge guard exit).
- **R6** — the two states have DIFFERENT exits not jointly covered by
  R1–R5, or another narrowly evidenced cause — report precisely, per
  state.

Any exit not reducible to R1–R6 with direct evidence: STOP, no
implementation expansion, return to Fable.

## 0.2 Amendment 1 (2026-07-15) — selected-state divergence accepted as R6

**Trigger.** The implementer ran the live diagnosis at base `6693843`
(all §0.1.3 pre-flight gates passed, 38/38 fences, spec still at
`075360ab…`, zero files changed) and observed an outcome the activated
table did not explicitly accept: **State U SUCCEEDS** (right-click on
the unselected line opens the line context menu) while **State S
FAILS** (edit-mode right-click resolves `midpoint-handle`, no menu).
§0.1.5 was failure-oriented — R2 presumed State U also fails, and R6's
"different exits" wording did not enumerate a *success* as an
acceptable exit — so under the bound stop conditions the implementer
correctly STOPPED with nothing edited. This amendment closes the gap.
The STOP discipline worked as designed; the evidence is accepted.

**Accepted live evidence (2026-07-15, base `6693843`).**

- State U (fully unselected; no midpoint/point handles): right-click at
  the line-body coordinate → `contextmenu-capture` guard passes →
  lookup resolves `hit-path` → SimpleLineRenderer logs
  `hit-path-contextmenu:before-stop` / `after-stop`
  (`SimpleLineRenderer.tsx:709/715`) → `onSelectLine` +
  `onContextMenu(lineId, x, y)` fire (`:719-720`) → the line becomes
  selected AND the line context menu OPENS; Excalidraw's menu stays
  absent. **The unselected back-line context-menu route works.**
- State S (selected + edit mode via the frozen left-click → dblclick
  sequence; `midpoint-handle: 1`, `point-handle: 2`): right-click at
  the same coordinate → lookup resolves `midpoint-handle` → line menu
  absent, Excalidraw menu absent. Matches Stage-0 and the frozen
  committed evidence.

**Root-cause boundary — re-confirmed from live source (all ten):**

1. Only the hit-path carries the line `onContextMenu` callback
   (`SimpleLineRenderer.tsx:708-721`).
2. `midpoint-handle` (`:844-858`) and `point-handle` (`:818-840`) carry
   only `onMouseDown`/`onClick` — no contextmenu handler.
3. `BACK_LINE_INTERACTIVE_ROLE_PRIORITY` (`DrawingLayout.tsx:94-102`)
   intentionally ranks point/midpoint/start/control/end/label handles
   above `hit-path` (correct for drag routing).
4. State U renders no edit handles (`isEditMode && isSelected` gate,
   `SimpleLineRenderer.tsx:813`), so the lookup can only resolve
   `hit-path`.
5. State S (edit mode) renders the midpoint/point handles.
6. The midpoint handle is positioned at the segment midpoint
   (`cx/cy` averages, `:846-847`) — which IS the hit-path center the
   test right-clicks on a 2-point line.
7. Therefore the State-S lookup deterministically resolves
   `midpoint-handle`.
8. The synthetic contextmenu dispatched at that handle bubbles only to
   the SVG root's suppress-only `onContextMenu`
   (`SimpleLineRenderer.tsx:626-631`) — never to the line-menu
   callback. Deaf-element path.
9. The CanvasClient permission gate (`canUseFreeformEditButton`,
   `CanvasClient.tsx:274`, consumed at `:3275-3278`) is proven
   FUNCTIONAL by State U opening the menu — R4 is eliminated for this
   environment.
10. Excalidraw is not the primary failure: its menu is absent in BOTH
    states (the bridge's capture-phase `stopPropagation`,
    `DrawingLayout.tsx:2651-2652`, keeps `handleCanvasContextMenu`,
    fork `App.tsx:11673`, out whenever the lookup succeeds), and
    State U proves the app menu path end-to-end.

**Amended classification table (supersedes §0.1.5's row definitions;
names stable).** Exactly one row must be proven, with per-state
console/DOM evidence:

- **R1** — State S resolves a deaf edit handle instead of `hit-path`
  AND State U ALSO fails (both states broken, S via role shadowing).
- **R2** — State U resolves `hit-path` but the hit-path handler chain
  fails (dispatch, handler receipt, or callback breaks) — menu does
  not open in State U.
- **R3** — the hit-path handler runs and the callbacks fire, but the
  menu is suppressed or immediately cleared by a later handler.
- **R4** — the CanvasClient callback is unwired or permission-gated
  off (`canUseFreeformEditButton` false or `onContextMenu` prop
  absent).
- **R5** — a bridge guard exits and Excalidraw consumes the native
  contextmenu (capture-order evidence required).
- **R6 — selected-state divergence (the observed and expected row):**
  State U resolves the context-menu-capable `hit-path`, the synthetic
  dispatch reaches the hit-path handler, the CanvasClient callback
  opens the line menu; State S resolves a higher-priority
  `midpoint-handle` (or `point-handle`) that has NO line contextmenu
  handler, so the dispatch never reaches the hit-path path, the line
  menu stays absent, and Excalidraw's menu also stays absent because
  the bridge consumed the real event. Root cause: edit-handle role
  priority — correct for drag routing — shadows the only
  contextmenu-capable role once edit mode renders handles over the
  click point.

Any outcome outside this amended table — including State U failing to
open the menu, or State S unexpectedly opening it — remains a STOP.

**Bound test outcomes (refines §0.1.4 and §3; fixed assertions, not
adaptive).** The diagnosis test(s) in the single allowed file must
deterministically prove BOTH states and classify the result as R6 in
the annotation:

- State U: line starts unselected; lookup/stack evidence; bridge
  `contextmenu-capture` guardPassed with `foundTargetLineRole:
  'hit-path'`; `hit-path-contextmenu:before-stop`/`after-stop`
  diagnostics observed; line becomes selected; the LINE MENU OPENS
  (real menu UI assertion); Excalidraw menu absent; geometry and
  persisted rows unchanged.
- State S: established ONLY via the frozen left-click → dblclick
  sequence with its assertions intact; `midpoint-handle: 1` +
  `point-handle: 2` present; right-click lookup resolves
  `midpoint-handle` (or `point-handle` — record which); NO
  `hit-path-contextmenu:*` diagnostic fires for that right-click; line
  menu absent; Excalidraw menu absent; geometry and persisted rows
  unchanged.
- The test MUST FAIL if: State U's menu does not open; State U does
  not resolve `hit-path`; State S unexpectedly resolves `hit-path`;
  State S's menu unexpectedly opens; the edit handles are absent in
  State S; geometry or persisted rows change; or any frozen PATCH-066
  left-click/double-click assertion regresses. No
  both-outcomes-acceptable branching.
- §1's "the context menu does not open" purpose statement is refined:
  the defect is CONFINED to the selected/edit-mode state; the
  unselected route works and must now be frozen as working.

**Informational only — likely PATCH-068 production candidate (NOT
authorized here; a fresh PATCH-068 census and spec are mandatory):**
preserve handle role priority for mousedown/drag routing, and for the
CONTEXTMENU path only either route a handle-resolved lookup to the
owning line's existing context-menu callback or deliberately fall back
to the owning line's `hit-path` — without globally lowering handle
priority, without touching left-click/double-click selection, and
without altering geometry, persistence, or presentation. Do not
implement any of this in PATCH-067.

**Base/baseline continuity.** Governance base moves forward with this
amendment's commit; the IMPLEMENTATION baselines are unchanged: sole
allowed file `e2e/characterization/drawing-line-bridge.spec.ts` at
`075360ab6a764b034ef7703e22ecdbaf34c135c1`, 38/38 immutable fences,
§0.1.3 gate totals, cleanup zeros, PATCH-066 Amendment 1 auth
procedure still in force, Sonnet PASS required before the
implementation commit.

**Additional stop conditions (extend §7):** State U no longer opens the
line menu on rerun; State S no longer resolves an edit handle; evidence
maps outside the amended table; any production fix is attempted.

## 1. Purpose — exactly one subsystem

The back-line CONTEXT MENU does not open on right-click, while left-click
selection and double-click edit-mode entry are proven working
(PATCH-066 Amendment 2). PATCH-067 produces a verified census and a
deterministic diagnosis of the context-menu route only, plus honest
characterization coverage. Nothing is repaired.

Seed evidence from PATCH-066 Stage 0 (to be re-verified, not assumed):

- bridge `mouse-down-capture` rejects right-button with
  `guardFailedReason: 'non-left-button'` (by design — the bridged-target
  ref is therefore never set by a right-click);
- bridge `contextmenu-capture` passes guards, but
  `findBackLineInteractiveTargetAtPoint` resolves **`midpoint-handle`**
  rather than `hit-path`;
- the line was ALREADY SELECTED at right-click time (earlier left-click),
  and a selected multi-point line renders point/midpoint handles, which
  OUTRANK `hit-path` in `BACK_LINE_INTERACTIVE_ROLE_PRIORITY`
  (`DrawingLayout.tsx:94`);
- census: only the hit-path carries an `onContextMenu` handler
  (`SimpleLineRenderer.tsx:708-721` — preventDefault + stopPropagation +
  `onSelectLine` + `onContextMenu(lineId, x, y)`); no handle-role element
  registers a contextmenu handler;
- the line context menu itself is `LineContextMenu`
  (`components/collabboard/menus/LineContextMenu.tsx`), driven by
  CanvasClient's `handleLineContextMenu` (passed at
  `CanvasClient.tsx:6322`).

## 2. Required census (fresh, with file:line references)

### 2.1 Right-button event sequence

- the real ordered sequence at the canvas for a right-click:
  pointerdown(button=2) → mousedown(button=2) → contextmenu — capture and
  bubble ordering through the bridge div;
- exact button values observed at each bridge phase;
- which bridge handlers intentionally reject non-left-button events
  (mouse-down-capture `event.button !== 0`; click-capture ditto) and
  whether that rejection is load-bearing or incidental for the
  contextmenu path (contextmenu-capture does its own fresh lookup and
  does not read the bridged-target ref).

### 2.2 Target mutation between events

- reproduce BOTH states: right-click on an UNSELECTED line (no handles
  rendered — what does the lookup resolve?) and on a SELECTED line
  (handles rendered — Stage 0 observed `midpoint-handle`);
- establish whether the role-priority list (designed for
  mousedown/drag routing, where handles SHOULD outrank the hit path) is
  correct for contextmenu routing, where the only element with a
  contextmenu handler is the hit path;
- record which element the synthetic `contextmenu` is dispatched at in
  each state, and whether any handler receives it (SimpleLineRenderer
  `[SimpleLineRenderer:event]` diagnostics).

### 2.3 Context-menu state path

- owner and open-condition of `LineContextMenu` (CanvasClient state via
  `handleLineContextMenu`);
- the expected callback chain: hit-path `onContextMenu` → `onSelectLine`
  + `onContextMenu(lineId, clientX, clientY)` → CanvasClient state →
  menu renders;
- whether the bridge's `preventDefault`/`stopPropagation` on the REAL
  contextmenu event, or Excalidraw's own `handleCanvasContextMenu`
  (`App.tsx:1962/2287`), suppresses or races the app menu;
- whether a native browser context menu or Excalidraw menu appears
  instead, in either state.

### 2.4 Root-cause determination

Classify the failure as exactly one (or an evidence-ordered chain) of:

- R1: contextmenu lookup resolving a handle role that has no contextmenu
  handler (selected-line state) — routing reaches a deaf element;
- R2: same failure also present on an UNSELECTED line (lookup resolves
  hit-path but the menu still fails) — cause deeper than role priority;
- R3: synthetic contextmenu dispatched but SimpleLineRenderer handler
  runs and CanvasClient state sets, yet the menu is suppressed/closed by
  a later handler (Excalidraw or document-level click-away);
- R4: context-menu callback not wired for back-plane lines in the
  drawing layout;
- R5: Excalidraw consuming the real contextmenu before the bridge
  (capture-order evidence required);
- R6: another narrowly evidenced cause — report precisely.

The diagnosis must state which of R1–R6 is proven, with the console/DOM
evidence per state (selected vs unselected).

## 3. Required characterization coverage

Extend the pointer test (or add a sibling test in the SAME file) to
freeze, per current behavior:

1. right-click on an UNSELECTED back-plane line: record lookup role,
   dispatch target, handler receipt, and menu visibility;
2. right-click on a SELECTED back-plane line: same records (Stage-0
   reproduction);
3. assert the CURRENT outcomes honestly (menu does not open — until a
   future fix patch changes that, this is the frozen truth; if either
   state DOES open the menu, freeze that instead and say so);
4. no fabricated DOM, no z-index/pointer-events tampering, no direct
   state setting, no direct production-callback invocation;
5. left-click selection, double-click, and all other existing coverage
   remain passing and unweakened;
6. preserve the diagnosis records as test annotations.

## 4. Explicit exclusions

No left-click selection changes; no double-click changes; no geometry,
persistence, movement, or natural-height changes; no presentation,
membership, or duplication work; no Excalidraw fork changes (a fork
necessity is a STOP requiring a new Fable amendment); no production
source changes of any kind; no role-priority edits (that is a candidate
FIX, reserved for the follow-up patch if R1 is proven); no schema/config/
dependency/middleware changes; no new files.

## 5. Allowed files

- `e2e/characterization/drawing-line-bridge.spec.ts` — ONLY file.
  Baseline: `075360ab6a764b034ef7703e22ecdbaf34c135c1` (landed by
  PATCH-066 commit `b1f4e1a`; bound in §0.1.3 — do not use the dead
  pre-066 hash).

Read-only and fenced: everything in PATCH-066 §9's immutable set INCLUDING
`components/collabboard/canvas/layouts/DrawingLayout.tsx`
(`b3684e4c6226ec2ad77fbff3265de25339a7f471`), `SimpleLineRenderer.tsx`,
`CanvasClient.tsx` (`1c6864b46e1c5c9a52f9e771ee2e51793898ecd8`),
`drawingBridgeHarness.ts` (`85a6566dbb8cd16f19151133ed33b9872a97ff11`),
`drawing-presentation.spec.ts`
(`c6bfb4f01b0b4e5bd7654ee1405b6070141fbc09`), the four PATCH-064 unit
helper files, `e2e/helpers/env.ts`, and the Excalidraw fork files —
re-derive the full set from PATCH-066 §9 at pre-flight.

## 6. Verification gates

- baseline before editing: exactly the §0.1.3 bound totals (full Vitest
  424/41, focused 51/2, setup 1 passed, credentialed line 4 passed,
  presentation 2 passed / 2 approved skips, credential-off 4+4 skipped,
  cleanup zeros);
- after editing: same unit counts (test-only patch, no unit change);
  credentialed line spec green including the new context-menu
  characterization; presentation regression untouched and green;
  credential-off proofs for both specs; cleanup zeros per spec and
  globally; fence verification before/after; production-import greps
  (lineBridge, presentationBridge, drawingBridgeHarness — zero);
  tsc / boundaries / verify / build green; generated-artifact check;
  dev-server port discipline per LESSONS_LEARNED;
- independent Sonnet review of the uncommitted change; commit prohibited
  until explicit PASS.

## 7. Stop conditions

- HEAD at pre-flight is not `b1f4e1a`, or the committed line spec does
  not hash to `075360ab…` before editing;
- any of the 38 immutable fences differs at any point;
- baseline totals (§0.1.3) differ materially;
- the diagnosis cannot be reduced to one of R1–R6 (§0.1.5) with direct
  evidence, per state;
- State U and State S cannot be exercised independently in the one
  allowed file;
- characterizing the behavior would require any production change,
  instrumentation, endpoint, flag, or hook;
- the PATCH-066 frozen left-click/double-click assertions would need
  weakening;
- a second file appears necessary;
- cleanup stops being deterministic, or a real (non-harness) user board
  would be touched;
- auth/setup failure persisting after one clean regeneration per
  PATCH-066 Amendment 1's bound procedure (which remains in force);
- any production fix is attempted (the fix is PATCH-068, requiring a
  fresh production census and separate Fable authorization).

## 8. Rollback

Single test file; `git revert` of the implementation commit restores the
PATCH-066 tree exactly.

## 9. Required final report

- the verified right-button event sequence with button values per phase;
- lookup resolution and dispatch target in BOTH selected and unselected
  states;
- handler receipt evidence (SimpleLineRenderer diagnostics) per state;
- menu visibility outcome per state (app menu, Excalidraw menu, native
  menu);
- the proven R1–R6 classification with evidence;
- the recommended smallest production fix for the FOLLOW-UP patch (not
  implemented here);
- Playwright totals (credentialed + credential-off), unit totals,
  cleanup proof, fence results, grep results;
- commit hash and push status, only after Sonnet PASS.
