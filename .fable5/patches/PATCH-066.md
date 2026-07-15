# PATCH-066 - Back-Line Pointer Routing: Stage-0 Disproof and Test Correction

Status: AMENDED TO TEST-ONLY (Amendment 2, 2026-07-15). The original
production repair mandate is REVOKED — Stage 0 landed on an unlisted exit
that DISPROVES the deterministic left-click routing defect this patch was
authorized to fix. No DrawingLayout.tsx change is authorized. The patch's
remaining deliverable is the §8-A corrected pointer characterization test.
Role: implementation engineer after Fable approval.
Base commit: 77998fcbd2966e1c2e5d7b6ea4b0f0bf2b3035ce

**Bound commit message (use verbatim; replaces the original fix() message,
which is void):**

```
test(drawing): freeze working back-line selection routing (PATCH-066)
```

## 0.6 Amendment 2 (2026-07-15) — Stage-0 disproof; production scope revoked

**Stage-0 outcome (implementer report, accepted).** All Amendment-1
prerequisites passed (auth regenerated via the setup project, JSON valid,
file ignored/unstaged, git clean; baselines: line 4 passed, presentation
2 passed / 2 approved skips, credential-off 4+4 skipped, cleanup zeros).
The console-captured diagnosis then showed, for a real coordinate left
click at the hit-path center: pointer-down-capture logged; activeToolType
`"selection"`; mouse-down-capture target lookup `backTargetFound: true`
(role `hit-path`); `guardPassed: true`; SimpleLineRenderer received
`line-drag-start:entry` → `drag-branch`; click-capture `guardPassed:
true`; SimpleLineRenderer received `path-click:before-stop`/`after-stop`;
the line became selected, REMAINED selected after the full Excalidraw
event cycle, applicable handles appeared, geometry unchanged
(`M 480 250 L 620 270` / `#dc2626` / 3). Double-click also routed and
settled selected with handles visible.

**Ruling.**

1. The alleged deterministic left-click selection defect is DISPROVEN
   under deterministic diagnostic observation. The bridge routes
   left-click end-to-end: guards pass, dispatch fires, SimpleLineRenderer
   receives, selection persists.
2. This maps to none of §5 Rows B/C/D/E — under this patch's own rules it
   is an unlisted exit and the production mandate terminates. NO
   production change is authorized. `DrawingLayout.tsx` is REMOVED from
   §7 allowed files and returns to the immutable fence set at
   `b3684e4c6226ec2ad77fbff3265de25339a7f471`.
3. **PATCH-065 vs Stage-0 discrepancy — bound explanation.** The CTO
   re-read the committed pointer test before ruling. Two facts hold
   simultaneously: (a) the committed test's success probes are real but
   narrow (`selected` = visibility of the `Edit Points` button, which
   lives in `LineToolbar`, mounted by `CanvasClient.tsx:7333` for
   `!isMapLayout && selectedLineId` — so it CAN observe a true
   selection); (b) in the PATCH-065 runs and the PATCH-066 baseline run,
   both the recorder (no synthetic re-dispatch) and the probes (no
   selection) consistently reported the non-working state, while Stage 0
   — with identical source, 36/36 fences held — observed the working
   state. The honest conclusion is the Task-1D "diagnostics/timing
   changed observation without any source change" class: the earlier
   characterizations captured a real but NON-DETERMINISTIC non-routing
   state (environment/timing-sensitive, e.g. dev-server warmup or
   hydration-order effects), not a stable production defect. No single
   guard/dispatch line is provably wrong; therefore no Row B–E fix
   exists to apply, and any production edit would be speculative —
   prohibited.
4. Context-menu failure is a SEPARATE root cause and is EXCLUDED from
   this patch: Stage 0 shows mousedown-capture correctly rejects
   right-button (`non-left-button` — by design), contextmenu-capture
   passes guards, but the target lookup resolves `midpoint-handle`
   (present only because selection succeeded first and the selected line
   renders handles that outrank `hit-path` in
   `BACK_LINE_INTERACTIVE_ROLE_PRIORITY`), and the census shows only the
   hit-path carries an `onContextMenu` handler
   (`SimpleLineRenderer.tsx:708-721`). Diagnosed in PATCH-067, not here.
5. Double-click currently works and is NOT part of any repair; the
   corrected test records it as working.
6. If the corrected test ever observes the non-routing state again, that
   is a legitimate FAILURE (flake evidence), not something to absorb with
   adaptive branches — see §8-A. Such a failure is new evidence for a
   future patch and must be reported, not patched around.

**Superseded sections.** §4 (Stage 0) is COMPLETE — its diagnosis is
recorded above and must be preserved as a test annotation. §5 (decision
table) is VOID — no row applies; the table must not be used to justify
any edit. §6 exclusions remain in force. §8 is replaced by §8-A below.
§7 allowed files are replaced by: ONLY
`e2e/characterization/drawing-line-bridge.spec.ts` (baseline
`9853d10d4a030ff615222825c02d0a16478e31a5`). §9's immutable set gains
DrawingLayout.tsx back (38 immutable fences; one modifiable test file).
§11 stop conditions apply unchanged except references to production
editing, which is now categorically prohibited. §12 gates apply
unchanged (unit counts must stay 51/2 and 424/41 — no unit files may
change under test-only scope).

## 8-A. Required test correction (replaces §8)

Rework the pointer-routing test in
`e2e/characterization/drawing-line-bridge.spec.ts` from adaptive
classification branches to FIXED assertions of the Stage-0-proven working
behavior:

1. Keep, unweakened: the `elementsFromPoint` stack evidence (canvas
   topmost, hit-path beneath), the physical-target proof (real
   `page.mouse.click` events target the canvas), and the before 8-role
   matrix.
2. Assert left-click selection WORKS: after the coordinate click, the
   line becomes selected in real DOM/state (LineToolbar / `Edit Points`
   visibility and/or the selection affordances the current UI actually
   renders), using a settle-aware wait (poll with an adequate timeout,
   then re-assert after the event cycle completes to prove persistence —
   the Stage-0 "still selected after the full cycle" fact).
3. Assert applicable handles appear per current behavior (the seeded
   multi-point line renders point/midpoint handles when selected/edit
   mode — assert the roles the CURRENT implementation actually emits; do
   not assert legacy start/control/end roles the seeded line never
   renders).
4. Record double-click as working (routes, settles selected, handles
   visible).
5. Keep the context-menu failure explicitly characterized (right-click
   does not open the line menu; the contextmenu lookup resolves a handle
   role on a selected line), with its Stage-0 evidence in the annotation
   — do NOT hide, fix, or absorb it.
6. Assert geometry and the persisted row remain unchanged throughout.
7. Assert no unrelated selection (other lines' matrices unchanged;
   containers unselected).
8. Preserve the Stage-0 diagnosis (bridge + renderer console records) as
   a committed test annotation; capturing bridge console diagnostics
   live in the test is permitted (dev server, read-only listener).
9. The test must NOT: fabricate DOM; alter pointer-events or z-index;
   set selection state directly; invoke production callbacks directly;
   keep any stale assertion that left-click routing fails; or use
   adaptive both-outcomes-pass branching for the left-click path (a
   regression back to non-routing must FAIL the test).
10. All other tests in the file (rendering, matrix, movement,
    natural-height, persistence, deletion, independence, cleanup,
    credential skip) remain passing and unweakened.

Independent Sonnet review of the uncommitted test correction is required;
commit prohibited until explicit PASS.

## 0.5 Amendment 1 (2026-07-15) — local auth storage-state regeneration

**Context.** The implementer correctly hit a bound stop before Stage 0: the
credentialed baseline cannot start because the LOCAL, GENERATED, IGNORED
artifact `e2e/.auth/user.json` is malformed JSON (one extra trailing `}`;
parse error at position 1070 / line 15 col 2). No files were changed.
Verified for this amendment: the file is written by
`e2e/auth.setup.ts:33` via `page.context().storageState({ path:
AUTH_STATE_PATH })`, ignored by `.gitignore:58` (`e2e/.auth/`), untracked
(`git ls-files` empty; `git check-ignore` matches), and consumed by the
`characterization` project (`playwright.config.ts:45`).

**Ruling.** Regeneration through the existing authenticated setup workflow
is authorized. Manual editing of the file — including removing the single
trailing brace — is NOT authorized, because an authoritative regeneration
workflow exists (`setup` project). Hand-editing authentication artifacts is
banned on principle: no cookie or credential content may ever be edited,
inspected into reports, or logged.

Bound rules:

1. `e2e/.auth/user.json` is an ignored local test artifact, not an
   implementation file. It is NOT added to §7 allowed files.
2. It may be deleted (or moved aside) and regenerated ONLY by the existing
   setup project: `npx playwright test --project=setup` (with
   `PW_BASE_URL` per §12 port discipline), or implicitly via a
   characterization run's `setup` dependency.
3. It must never be staged or committed. `git status` must remain clean
   throughout (the path is ignored; if it ever shows as tracked/staged —
   STOP).
4. Credentials come only from the existing approved mechanism
   (`e2e/helpers/env.ts`: env vars / `.env.local`). No new credential
   plumbing.
5. No credential or cookie values may be printed in reports, logs, or
   diagnostics — record only the file path and the parse result.
6. The regenerated file must pass a JSON parse check (read + `JSON.parse`
   succeeds; do not print contents).
7. The `setup` project must complete with a pass (not a skip) in the
   credentialed environment.
8. The §10 baselines must then be rerun and match exactly: line 4 passed;
   presentation 2 passed / 2 approved skips; credential-off line 4
   skipped / presentation 4 skipped; cleanup zeros.
9. Stage 0 remains prohibited until those baselines match.
10. Any continuing auth/setup failure after one clean regeneration attempt
    is a NEW stop condition — report to Fable; do not iterate.
11. This amendment authorizes NO production or test source change of any
    kind.
12. The §7 two-file implementation boundary is unchanged:
    `components/collabboard/canvas/layouts/DrawingLayout.tsx` and
    `e2e/characterization/drawing-line-bridge.spec.ts`.

Bound repair sequence: (1) confirm ignored + unstaged; (2) record path +
parse failure only; (3) delete/move aside the malformed artifact; (4) run
the setup project; (5) JSON-parse-check the regenerated file; (6) confirm
`git status` clean; (7)–(9) rerun the §10 credentialed and credential-off
baselines; (10) confirm cleanup zeros; (11) only then resume Stage 0.

Additional stop conditions (extend §11): the file is tracked or staged;
regeneration would require changing source/config; approved credentials
are unavailable; setup writes credential values to logs; regenerated JSON
is still malformed; credentialed baselines differ; cleanup fails; any
implementation file changes before Stage 0.

## 1. Purpose — exactly one root cause

The Drawing back-line event bridge fails to route real pointer interaction
from the topmost Excalidraw canvas to the underlying back-plane line
selection path. PATCH-065 proved the end-to-end failure with real events
(coordinate click targets the canvas; no selection, no handles, no context
menu; no synthetic re-dispatch ever observed). PATCH-066 repairs that one
route with the smallest possible production change and upgrades the
Playwright characterization from freezing the failure to proving the fix.

Nothing else. §6 lists the explicit exclusions.

## 2. Fable approval

Required and granted for the scope below only. The decision table in §5 is
part of the approval: an observed diagnosis outcome that is not in the
table means STOP and return to Fable — it is not an invitation to improvise.

## 3. Census (re-derived from live code, 2026-07-15)

### 3.1 Pointer event source

- The Excalidraw interactive canvas registers `onPointerDown` (React prop,
  `InteractiveCanvas.tsx:219` → `App.tsx:1960/2292
  handleCanvasPointerDown`) and `onContextMenu` (`App.tsx:1962/2287`).
- `handleCanvasPointerDown` (`App.tsx:7146`) converts viewport→scene
  coords and calls `target.setPointerCapture(event.pointerId)`
  (`App.tsx:7159-7160`) — subsequent pointer events are captured to the
  canvas until pointer-up.
- Excalidraw operates on POINTER events; the app bridge operates on MOUSE
  (compatibility) events, which the browser fires after the corresponding
  pointer events. PATCH-065 proved the compatibility `mousedown` and
  `click` DO fire and DO target the canvas (recorder evidence).
- No native document/window CAPTURE listeners for
  mousedown/click/contextmenu are active during a plain canvas click:
  fork-wide grep found only `textWysiwyg.tsx:813` (window pointerdown
  capture, active only while editing text) and `Popover.tsx:158`
  (document pointerdown, bubble phase, only while a popover is open).
  App-side grep found only bubble-phase click-outside listeners in menus.

### 3.2 The back-line bridge (DrawingLayout.tsx)

- Wrapper div `className="flex-1 w-full h-full absolute inset-0
  bg-transparent"` (`DrawingLayout.tsx:2730-2738`) carries five React
  CAPTURE handlers and CONTAINS the Excalidraw canvas (confirmed by the
  PATCH-065 stack: bridge div at index 3, canvas at index 0):
  - `onPointerDownCapture` → `handleBackLineBridgePointerDownCapture`
    (`:2562`) — **LOG-ONLY**; pointerdown always reaches Excalidraw.
  - `onMouseDownCapture` → `handleBackLineBridgeMouseDownCapture`
    (`:2250`) — guards in order: reentrancy ref → `activeToolType !==
    'selection'` (from `appStateRef.current?.activeTool?.type ??
    'selection'`) → `event.button !== 0` → `event.target instanceof
    HTMLCanvasElement` → `classList.contains('excalidraw__canvas')` →
    `findBackLineInteractiveTargetAtPoint(clientX, clientY)`. On success:
    stores the target in `bridgedBackLineInteractiveTargetRef`,
    `preventDefault()` + `stopPropagation()`, re-dispatches a synthetic
    bubbling `MouseEvent('mousedown')` at the hit-path.
  - `onClickCapture` (`:2363`) — same shape; requires the STORED
    `bridgedBackLineInteractiveTargetRef` from the preceding mousedown
    ('missing-bridged-target' guard), re-dispatches `MouseEvent('click')`.
  - `onDoubleClickCapture` (`:2463`) and `onContextMenuCapture` (`:2573`)
    — same guard shape, fresh target lookup, re-dispatch.
- `findBackLineInteractiveTargetAtPoint` (`:2213`) =
  `document.elementsFromPoint` × `BACK_LINE_INTERACTIVE_ROLE_PRIORITY`
  (`:94`), first `data-line-renderer="back"` match by role priority.
  PATCH-065 proved the hit-path IS present in that stack at the click
  coordinate — the lookup input is sound.
- `DEV_DRAWING_BRIDGE_DIAGNOSTICS = process.env.NODE_ENV !== 'production'`
  (`:91`): in dev, EVERY handler invocation and every guard exit logs
  `console.debug('[DrawingLayout:back-line-bridge]', { phase,
  guardPassed, guardFailedReason, ... })`. This is the discriminator.
- `appStateRef` = `drawingAppStateRef ?? localAppStateRef`
  (`:667`); `drawingAppStateRef` starts `null` (CanvasClient:5011) and is
  written only by Excalidraw `onChange` (`:1029`), so `?? 'selection'`
  covers the pre-first-change window. Note the vocabulary trap: the
  app-level toolbar state uses `'select'` (`:672`) while Excalidraw uses
  `'selection'` — the guard compares against the Excalidraw value.

### 3.3 Rendered line DOM (SimpleLineRenderer.tsx — read-only)

- Back-plane SVG mounted by CanvasClient (`CanvasClient.tsx:6308-6326`)
  in a `pointer-events: none` wrapper at z-0; the SVG re-enables its own
  pointer events (`forcePointerEvents`), hit-path `pointerEvents: 'auto'`
  with 20px transparent stroke (`SimpleLineRenderer.tsx:693-704`),
  visible-path `pointerEvents: 'none'`.
- Hit-path React handlers: `onMouseDown` → `handleLineDragStart`
  (`:304`), `onClick` → `handlePathClick` (`:543`), `onDoubleClick` →
  `handlePathDoubleClick` (`:579`), `onContextMenu` inline (`:708-721`).
  All log `[SimpleLineRenderer:event]` console.debug diagnostics in dev.
- Because these are React handlers and the hit-path is an app-React node,
  synthetic `dispatchEvent`ed bubbling MouseEvents DO reach them (React
  processes untrusted events via root delegation).

### 3.4 Selection model

- `handlePathClick` first clears Excalidraw's own selection via
  `excalidrawAPIRef.current.updateScene({ appState: { selectedElementIds:
  {}, ... } })` (`SimpleLineRenderer.tsx:555-566` — the reason
  CanvasClient passes `drawingExcalidrawAPIRef` at `:6324`), then calls
  `onSelectLine(line.id)` → CanvasClient `handleLineSelect` →
  `selectedLineId` state → selection box + handles render.
- Ordering risk (bound census fact): the bridge cannot and does not block
  `pointerdown`, so Excalidraw ALWAYS processes pointerdown at the canvas
  (potentially starting a selection box / clearing state) before the
  bridged mousedown/click runs. If Stage 0 shows the dispatch fires and
  selection is set but immediately lost, the fight is between
  `handlePathClick`'s updateScene and Excalidraw's own
  pointerup/click-cycle state writes.

### 3.5 Context menu

- Right-click path: bridge `onContextMenuCapture` → synthetic
  `contextmenu` at hit-path → inline handler (`SimpleLineRenderer.tsx:708`)
  → `onSelectLine` + `onContextMenu(lineId, x, y)` → `LineContextMenu`.
  Same guard structure as selection; PATCH-065 showed the identical
  no-dispatch failure signature.

### 3.6 What the census could NOT determine statically — and why that is bound

Capture-phase propagation analysis eliminates every mechanism that would
prevent the bridge handler from being invoked (nothing deeper than the
bridge div can block an outer capture handler; no active native capture
listeners; single React instance). Yet PATCH-065 proves no re-dispatch
occurred. The contradiction is resolvable only by reading the bridge's own
dev diagnostics during a real click — which PATCH-065 never captured. The
exits are a CLOSED, code-enumerated set (every `guardFailedReason` string
plus "no log at all" plus "dispatch logged but no selection"), so Stage 0
below discriminates the smallest cause deterministically in one run.

## 4. Stage 0 — bound diagnosis (mandatory, before any production edit)

Using the existing harness fixture (real board, containers, attached
back-plane lines) and a dev server (`NODE_ENV !== 'production'` so the
diagnostics are live):

1. Attach a Playwright `page.on('console')` listener BEFORE navigation;
   collect all messages containing `[DrawingLayout:back-line-bridge]` and
   `[SimpleLineRenderer:event]`.
2. Perform the exact PATCH-065 interaction: `page.mouse.click(cx, cy)` at
   the hit-path center; also right-click and dblclick.
3. Record, per interaction, which bridge phases logged and with what
   `guardPassed` / `guardFailedReason`, and whether SimpleLineRenderer
   logged any hit-path event.
4. Map the observation onto the §5 table. The Stage-0 observation MUST be
   included verbatim in the final report and preserved as a test
   annotation.

Stage 0 is diagnosis, not license: only the row actually observed is
authorized for implementation.

## 5. Decision table — observed exit → the ONE authorized minimal fix

| # | Stage-0 observation | Proven smallest cause | Authorized minimal fix (DrawingLayout.tsx only) |
|---|---|---|---|
| A | No `[DrawingLayout:back-line-bridge]` mousedown-capture log at all during the click | Bridge handler never invoked — propagation blocker not identified by this census | **STOP.** Report findings; a new Fable census is required. No fix is authorized. |
| B | `guardFailedReason: 'missing-selection-tool'` | activeTool guard rejects the real idle tool value (e.g. app/fork tool vocabulary or restored appState) | Correct ONLY the guard's accepted-tool condition in the four bridge handlers to match the actually-observed idle tool value(s), preserving the intent "bridge only when no drawing tool is active". No appState writes, no new state. |
| C | `guardFailedReason: 'no-back-line-target-found'` | In-handler `elementsFromPoint` diverges from the test-time stack | Fix ONLY `findBackLineInteractiveTargetAtPoint` (coordinate source or stack filtering) to resolve the target the PATCH-065 stack proves is present. |
| D | `guardFailedReason: 'target-not-canvas'` or `'target-missing-excalidraw-canvas-class'` | The real event target differs from the guard's expectation | Adjust ONLY the target guard to the actually-observed target shape, keeping it narrow (must still exclude clicks on app cards/UI). |
| E | Bridge logs `guardPassed: true` + dispatch, SimpleLineRenderer logs the event, but selection does not appear or is immediately cleared | Dispatch works; the selection state is overwritten by Excalidraw's own pointer-cycle handling | Smallest ordering fix INSIDE the existing bridge/dispatch block (e.g. dispatch after Excalidraw's cycle completes, or suppress the specific competing Excalidraw state write for bridged interactions). Must not modify SimpleLineRenderer, CanvasClient, or the fork. If confinement to DrawingLayout is impossible — STOP. |
| F | `guardFailedReason: 'reentrant-bridge-guard'` on the FIRST event, or any exit not listed above | Stale/foreign state; cause set is open | **STOP.** Report; no fix authorized. |

Context menu and double-click: authorized to ride along ONLY if Stage 0
shows the IDENTICAL exit for them as for left-click selection (the census
predicts this — same guard structure). If their exits differ, fix
selection only and record the deferral explicitly.

## 6. Explicit exclusions

Not touched by this patch, regardless of temptation: container membership
resolution, duplicate `padlet://` links, slide membership/ordering,
thumbnails, presentation rendering, native raster rendering, AI-image
behavior, natural-height line-follow (stays characterized as
line-does-not-follow), container-movement line-follow (same), line
geometry/persistence/creation/deletion semantics, broad DrawingLayout
refactor, bridge unification with FreeformPadletCards' parallel freeform
bridge (`FreeformPadletCards.tsx:626-629` — read-only, out of scope),
Excalidraw fork changes, schema/config/dependency/middleware changes, new
endpoints, feature flags, hidden test hooks.

## 7. Allowed files

Production (authorized-change baseline `b3684e4c6226ec2ad77fbff3265de25339a7f471`):

- `components/collabboard/canvas/layouts/DrawingLayout.tsx`

Test (baseline `9853d10d4a030ff615222825c02d0a16478e31a5`):

- `e2e/characterization/drawing-line-bridge.spec.ts`

No other file may change. If the live root cause proves another file is
essential (per table row E's confinement clause or otherwise), STOP and
request a named amendment. `SimpleLineRenderer.tsx`, `CanvasClient.tsx`,
`drawingBridgeHarness.ts`, and `drawing-presentation.spec.ts` are
explicitly READ-ONLY and fenced (§9).

Unit tests: add a unit file ONLY if a pure event-routing helper is
genuinely extracted for the fix; do not extract a helper to satisfy a
count; do not import test helpers into production. Expected default: no
unit-count change (424/41 stays; if a helper+tests are added, report the
new counts and the reason).

## 8. Required test changes (drawing-line-bridge.spec.ts)

Upgrade the pointer-routing test from freezing the failure to proving the
fix, keeping ALL of:

- the `elementsFromPoint` stack evidence (canvas must STILL be topmost at
  the hit coordinate after the fix — the fix is routing, not z-order);
- the real `page.mouse.click` at the hit-path center physically targeting
  the canvas (recorder or equivalent);
- the before/after 8-role matrix.

New required assertions (credentialed run):

1. after the coordinate click, the line becomes selected in real DOM/state
   (selection box / `Edit Points` affordance / role transitions per
   current behavior — assert whatever the CURRENT design renders on
   selection, do not invent);
2. applicable edit-handle roles appear per existing behavior after the
   interaction that currently reveals them (dblclick edit-mode entry rides
   along only under the §5 ride-along rule);
3. selection persists past the Excalidraw event cycle (not cleared one
   frame later);
4. no unrelated selection: other lines' role matrices unchanged, container
   cards not selected, Excalidraw elements not selected;
5. context menu opens on right-click IF in scope per §5; otherwise its
   current non-opening behavior stays explicitly characterized;
6. existing coverage in the file (rendering, matrix, movement,
   natural-height, persistence, deletion, independence, cleanup,
   credential skip) remains passing and unweakened;
7. Stage-0 console-diagnosis capture is preserved in the committed test as
   an annotation (the diagnosis is part of the regression record).

## 9. Hash fences

Immutable (verify before editing and after verification — 37 files):

The 30 PATCH-064 §11 fences EXCLUDING DrawingLayout.tsx (re-derive from
PATCH-064 §11; DrawingLayout moves to authorized-change baseline status),
plus:

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

Authorized-change baselines (attribution, not immutability):

```text
components/collabboard/canvas/layouts/DrawingLayout.tsx b3684e4c6226ec2ad77fbff3265de25339a7f471
e2e/characterization/drawing-line-bridge.spec.ts 9853d10d4a030ff615222825c02d0a16478e31a5
```

## 10. Required baseline before implementation

- `git rev-parse HEAD` = `77998fcbd2966e1c2e5d7b6ea4b0f0bf2b3035ce`
- full Vitest: 424 tests / 41 files
- credentialed line Playwright: 4 passed
- credentialed presentation Playwright: 2 passed / 2 approved skips
- cleanup proof: boards=0, padlets=0, canvasLines=0
- all §9 fences and baselines match

## 11. Stop conditions

Stop (no production edit, report to Fable) if:

- Stage 0 lands on table row A or F, or on any unlisted exit
- context menu / selection / double-click show DIFFERENT exits and the
  implementer is tempted to fix more than the selection exit
- the fix cannot be confined to `DrawingLayout.tsx`
- a fork modification appears necessary (separate CTO amendment required)
- fixing selection would require touching geometry, persistence,
  SimpleLineRenderer, CanvasClient, or the harness
- production instrumentation (new logging, flags, hooks) is required
- any §9 immutable fence differs at any point
- baseline (§10) differs materially
- cleanup stops being deterministic
- the change would alter any characterized defect outside pointer routing

## 12. Verification gates

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts   # 51/2 unchanged
npx tsc --noEmit
npm run check:boundaries
npx vitest run                                                                                      # 424/41 unless a §7 helper was added
npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization   # regression: 2 passed / 2 skips, untouched file
npm run verify
npm run build
```

Also required:

- credential-off proof (`E2E_SKIP_CREDENTIALS=1`) for both specs
- cleanup proof after each spec and globally (boards/padlets/canvasLines = 0)
- production-import greps (lineBridge, presentationBridge,
  drawingBridgeHarness — all still zero production matches)
- §9 fence verification before and after
- generated-artifact check (nothing staged)
- dev-server port discipline per LESSONS_LEARNED (inspect port 3000,
  attribute any listener, never kill an unrelated process, stop own server,
  confirm port free)

Independent Sonnet review of the UNCOMMITTED implementation is required;
commit is prohibited until an explicit PASS.

## 13. Manual acceptance (after automated gates)

- select a back-plane line at normal zoom
- select at a changed zoom level
- select after panning the canvas
- open the line context menu (if in scope per §5)
- container header drag still works; line still does not follow (current
  characterized behavior preserved)
- natural-height growth still produces the characterized
  line-does-not-follow behavior
- no front-plane/native Excalidraw line regression
- no app-card interaction regression (inner card controls still win)

## 14. Rollback

One production file + one test file. `git revert <implementation commit>`
restores `77998fc` exactly; §9 fences prove nothing else moved. No schema,
dependency, fork, or config surface involved.

## 15. Required final report

- Stage-0 diagnosis: verbatim bridge/renderer console records per
  interaction, and the §5 row selected
- exact production diff summary (which guard/dispatch lines changed and why
  that is the smallest change)
- whether selection, context menu, and double-click shared one exit; what
  was fixed vs deferred
- post-fix Playwright evidence: canvas still topmost, click still
  physically targets canvas, selection now occurs and persists, handles
  appear, no unrelated selection
- line and presentation Playwright totals; credential-off totals
- unit totals (and justification if not 424/41)
- cleanup proof results
- fence verification before/after (37 immutable + 2 baselines)
- production-import grep results
- manual matrix results
- commit hash and push status, only after Sonnet PASS
