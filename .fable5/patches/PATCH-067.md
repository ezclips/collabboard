# PATCH-067 - Diagnose Back-Line Context Menu Routing

Status: APPROVED - diagnosis/characterization patch, test-only. No
production change is authorized by this patch; if the census proves a
single smallest production cause, the FIX is a separate future patch
authorized by Fable on this patch's evidence.
Approved by the Fable CTO 2026-07-15.
Role: implementation engineer after Fable approval.
Sequencing: starts ONLY after the PATCH-066 test correction is committed
following an explicit independent Sonnet PASS. Base commit: the PATCH-066
implementation commit (re-derive and record its hash at pre-flight; if
PATCH-066 has not landed, STOP).

**Bound commit message (use verbatim):**

```
test(drawing): characterize back-line context menu routing (PATCH-067)
```

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
  Baseline: the hash landed by the PATCH-066 test-correction commit
  (re-derive at pre-flight and record it in the report).

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

- baseline before editing: full Vitest 424/41 (or the counts recorded at
  the PATCH-066 landing, if rebound there), credentialed line spec green
  per its post-066 state, presentation spec 2 passed / 2 approved skips;
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

- PATCH-066 test correction not landed with a Sonnet PASS;
- any fence mismatch at any point;
- the diagnosis cannot be reduced to one of R1–R6 with direct evidence;
- characterizing the behavior would require any production change,
  instrumentation, endpoint, flag, or hook;
- a second file appears necessary;
- cleanup stops being deterministic;
- auth/setup failure persisting after one clean regeneration per
  PATCH-066 Amendment 1's bound procedure (which remains in force).

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
