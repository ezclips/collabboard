# PATCH-068 - Route Back-Line Context Menu from Selected Edit Handles

Status: APPROVED — production fix patch, authored 2026-07-15 from a
fresh source census (not copied from PATCH-067's diagnosis).
Approved by the Fable CTO 2026-07-15.
Role: GPT-5.5 implements; may NOT commit or push. Independent Sonnet
review of the uncommitted diff is required with an explicit PASS
before any commit. Fable closes this patch afterward.
Base commit: `a181cdea2317a0d8a1602261c571d8a93721fcf8`
(`test(drawing): characterize back-line context menu routing
(PATCH-067)`). Re-derive and record this hash at pre-flight; if HEAD
is not this commit, STOP.

**Bound commit message (use verbatim):**

```
fix(drawing): route selected line handles to context menu (PATCH-068)
```

## 1. Purpose — exactly one root cause

PATCH-067 (R6, Sonnet PASS, `a181cde`) proved the back-line context
menu opens correctly through the hit-path when a line is UNSELECTED
(State U) but stays closed when the line is selected and in edit mode
(State S), because the interactive-role lookup used for ALL bridge
phases resolves a higher-priority edit handle (`midpoint-handle` /
`point-handle`) at that coordinate, and no handle role owns the line
`onContextMenu` callback. PATCH-068 makes State S match State U's
existing working result by normalizing the CONTEXTMENU DISPATCH
TARGET ONLY — nothing else changes.

## 2. Fresh production census (2026-07-15, base `a181cde`)

### 2.A DrawingLayout role resolution

- `BACK_LINE_INTERACTIVE_ROLE_PRIORITY` (`DrawingLayout.tsx:94-102`):
  `['point-handle', 'midpoint-handle', 'start-handle', 'control-handle',
  'end-handle', 'label-handle', 'hit-path']` — ranks every edit-handle
  role and `label-handle` above `hit-path`, by design, so drag/edit
  interactions land on the handle rather than the line body.
- `findBackLineInteractiveTargetAtPoint` (`:2213-2248`): walks
  `document.elementsFromPoint(clientX, clientY)` once per priority
  role, filtering on `data-line-renderer === 'back'` and
  `data-line-role === role`, returns the FIRST element matching the
  highest-priority role present in the stack. This single function is
  shared verbatim by mousedown-capture, click-capture,
  doubleclick-capture, AND contextmenu-capture — it is a general
  target-at-point resolver, not contextmenu-specific. **This patch
  does not modify this function.**
- Line ID extraction: always `resolvedTarget.getAttribute('data-line-id')`
  — every interactive role (`hit-path`, `midpoint-handle`,
  `point-handle`, `start-handle`, `control-handle`, `end-handle`,
  `label-handle`) carries `data-line-id` for its own owning line
  (confirmed per-role in SimpleLineRenderer, §2.B).
- `handleBackLineBridgeContextMenuCapture` (`:2573-2671`): guard chain
  (reentrancy → `activeToolType !== 'selection'` → target
  `HTMLCanvasElement` → `excalidraw__canvas` class) → fresh
  `findBackLineInteractiveTargetAtPoint` lookup → on success, NULLS
  `bridgedBackLineInteractiveTargetRef`, `preventDefault()` +
  `stopPropagation()` the REAL contextmenu, sets the reentrancy ref,
  dispatches a synthetic bubbling `MouseEvent('contextmenu', {
  clientX: event.clientX, clientY: event.clientY, button, buttons,
  ctrlKey, shiftKey, altKey, metaKey })` at `interactiveTarget`
  (**the raw lookup result — this is the exact line PATCH-068
  changes**), clears the reentrancy ref in `finally`.
- Mousedown-capture (`:2250-2361`), click-capture (`:2363-2461`),
  doubleclick-capture (`:2463-2571`) — read-only census, confirmed
  structurally independent handlers with their own guard chains and
  dispatch calls; NONE of them read or are affected by any change
  inside the contextmenu handler. `bridgedBackLineInteractiveTargetRef`
  is written by mousedown-capture and read by click-capture for THEIR
  own pairing; contextmenu-capture already nulls it unconditionally
  and does its own independent fresh lookup — confirmed unused by
  contextmenu today and will remain unused by this patch.

### 2.B SimpleLineRenderer structure (read-only; per interactive role)

| role | element | data-line-id | onContextMenu | notes |
|---|---|---|---|---|
| `hit-path` | `<path>` (`:693-722`) | yes | **yes** (`:708-721`: preventDefault+stopPropagation+`onSelectLine(line.id)`+`onContextMenu?.(line.id, e.clientX, e.clientY)`) | only role with the line contextmenu callback |
| `visible-path` | `<path>` (`:739-...`) | yes | no | `pointerEvents:'none'` — excluded, out of scope |
| `label-handle` | `<div>` in `foreignObject` (`:799-807`) | yes | no (`onMouseDown`/`onClick`/`onDoubleClick` only, all `stopPropagation`) | excluded per §3 — distinct UI affordance, no live evidence it should open the line menu |
| `point-handle` | `<circle>` (`:818-840`) | yes | no (`onMouseDown`/`onClick` only) | drag-and-shift-to-toggle-corner; candidate |
| `midpoint-handle` | `<circle>` (`:844-858`) | yes | no (`onMouseDown`/`onClick` only) | insert-point-on-drag; candidate; sits at the segment midpoint, provably the same coordinate the test right-clicks on a 2-point line |
| `start-handle` / `control-handle` / `end-handle` | `<circle>` (`:863-865`) | yes | no (`onMouseDown`/`onClick` only) | legacy quadratic-curve model (lines without a `points` array); structurally identical to point/midpoint-handle but **excluded from this patch — see §3** |
| SVG root | `<svg>` (`:618-632`) | n/a | yes, SUPPRESS-ONLY (`:626-631`: `if (isEditMode || isLineMode) { e.preventDefault(); e.stopPropagation(); }`) | this is what currently swallows the synthetic event when dispatched at a handle — the deaf end of State S's path |

All roles are children of the SAME per-renderer SVG root
(`rendererLabel: 'back'`), confirming the SVG-root suppress path is
reachable from every handle circle via normal DOM bubbling. No handle
role's pointer/drag behavior (`onMouseDown`, `onClick`) is touched by
this census or by the proposed fix.

### 2.C Context-menu callback path (read-only)

`hit-path onContextMenu` (`SimpleLineRenderer.tsx:708-721`) →
`onSelectLine(line.id)` + `onContextMenu?.(line.id, e.clientX,
e.clientY)` → back-plane renderer prop wiring
(`CanvasClient.tsx:6322`, `onContextMenu={handleLineContextMenu}`) →
`handleLineContextMenu` (`CanvasClient.tsx:3275-3278`): early-returns
unless `canUseFreeformEditButton` (`= canEditWorkspace(
currentWorkspaceRole)`, `:274`), else `setLineContextMenuState({
lineId, x, y })` → `LineContextMenu` renders via CanvasModals
(`:7793-7794`) at the stored `x`/`y`. PATCH-067 State U proved this
ENTIRE chain functional end-to-end (permission gate passes, state
sets, menu renders at the click position). **None of this path is
touched by PATCH-068** — the fix acts purely upstream, at which DOM
node the bridge's synthetic event lands on.

### 2.D Event-coordinate requirements

- The hit-path callback uses `e.clientX`/`e.clientY` from the
  synthetic event it receives — NOT the hit-path element's own
  bounding box or any handle geometry. `LineContextMenu` renders at
  the coordinates passed through `setLineContextMenuState({ x, y })`.
- The bridge's synthetic `MouseEvent` constructor already always uses
  the REAL event's `clientX`/`clientY` (`DrawingLayout.tsx:2659-2660`)
  regardless of which element it targets — so redirecting the dispatch
  target from the handle to the hit-path does NOT change the
  coordinates delivered to the callback; the menu opens at the actual
  cursor position exactly as it does today in State U.
- Dispatching to a different DOM node changes only which element's own
  handlers fire and how the event bubbles — it does not alter
  `clientX`/`clientY`, which are properties of the constructed event
  itself.
- A direct callback invocation (bypassing dispatch entirely) would skip
  `preventDefault`/`stopPropagation` semantics on the hit-path's own
  handler and the renderer's own `onSelectLine` call ordering — census
  confirms this must remain prohibited; the fix must keep using
  `dispatchEvent` at a resolved DOM node, per Task 3's "Reject: calling
  CanvasClient's menu callback directly" ruling.

### 2.E Selection and edit-mode safety (read-only)

`findBackLineInteractiveTargetAtPoint` — shared resolver, UNCHANGED.
Mousedown/click/doubleclick-capture handlers — structurally
independent, UNCHANGED, not called by or dependent on the contextmenu
handler. Handle `onMouseDown`/`onClick` drag and point-insert/shift
logic in SimpleLineRenderer — UNCHANGED (SimpleLineRenderer.tsx is not
an allowed file). Excalidraw pointer handling and front-plane/native
lines — untouched; the change is confined to one `back`-renderer-only
branch inside one already-guarded capture handler.

### 2.F Multiple-line and overlap behavior

- Owning line ID is always `interactiveTarget.getAttribute('data-line-id')`
  — the ID of whichever element the ROLE-PRIORITY lookup actually
  resolved at the click point (unchanged resolution).
- The line-scoped hit-path lookup MUST use an exact-match selector:
  `` `[data-line-id="${lineId}"][data-line-role="hit-path"][data-line-renderer="back"]` ``
  (consistent with the existing `querySelector` idiom already used
  elsewhere in this file, e.g. `:724-726`, `:780`) — this returns
  ONLY that line's own hit-path, never another line's.
- Overlap risk: if two back-plane lines' hit-paths or handles overlap
  at the same screen coordinate, a coordinate-based
  `elementsFromPoint` fallback could resolve a DIFFERENT line's
  hit-path than the one whose handle was actually right-clicked — this
  is exactly why Task 3's design (Reject #4) prohibits an unscoped
  `elementsFromPoint`-based fallback for normalization. The ID-scoped
  `querySelector` design is immune to this: it targets the SAME
  `data-line-id` the priority lookup already resolved, regardless of
  what else is visually present at that coordinate.
- Failure mode: if the ID-scoped query finds no matching hit-path
  (e.g., a transient DOM state), the fix MUST fall back to dispatching
  at the originally resolved `interactiveTarget` (today's
  characterized non-opening behavior) rather than guess at another
  element — no new failure mode is introduced.

## 3. Selected fix design (authorized)

**Contextmenu-only normalization inside
`handleBackLineBridgeContextMenuCapture`.** After
`findBackLineInteractiveTargetAtPoint` resolves `interactiveTarget`
(unchanged call, unchanged resolution):

1. If `interactiveTarget.getAttribute('data-line-role')` is exactly
   `'midpoint-handle'` or `'point-handle'`, and
   `interactiveTarget.getAttribute('data-line-id')` is non-null:
   query `` document.querySelector(`[data-line-id="${lineId}"][data-line-role="hit-path"][data-line-renderer="back"]`) ``
   scoped to that exact line ID.
2. If found, use that hit-path element as the CONTEXTMENU DISPATCH
   TARGET instead of `interactiveTarget` — the diagnostics
   (`foundTargetLineId`/`foundTargetLineRole` in
   `logBackLineBridgeDiagnostics`) MAY additionally record the
   normalized target's role for observability, but the ORIGINALLY
   RESOLVED role (from `findBackLineInteractiveTargetAtPoint`) remains
   what `contextmenu-capture:target-lookup` reports — the lookup
   result itself is not altered, only which element receives the
   dispatch.
3. If not found, dispatch at `interactiveTarget` exactly as today
   (unchanged failure-mode behavior).
4. `clientX`/`clientY`/`button`/`buttons`/`ctrlKey`/`shiftKey`/
   `altKey`/`metaKey` on the constructed `MouseEvent` are UNCHANGED —
   still taken from the real event.
5. `preventDefault()`/`stopPropagation()` on the REAL event, and the
   reentrancy-ref guard around the dispatch, are UNCHANGED.
6. Global `BACK_LINE_INTERACTIVE_ROLE_PRIORITY` ordering is UNCHANGED.
   Mousedown-capture, click-capture, and doubleclick-capture are
   UNCHANGED — this normalization exists ONLY inside
   `handleBackLineBridgeContextMenuCapture`.

**Authorized contextmenu-normalizable roles: exactly `midpoint-handle`
and `point-handle`.**

`label-handle`, `visible-path`, container targets, and front-plane/
native lines are explicitly NOT included (per Task 3's binding and no
live evidence they should open the line menu). `start-handle`,
`control-handle`, `end-handle` are structurally identical (same
missing-`onContextMenu` shape, §2.B) but are explicitly EXCLUDED from
this patch's scope: the current harness (`drawingBridgeHarness.ts`,
fenced, read-only) only seeds multi-point lines, so there is no live
regression path to prove this role set — a normalization added without
test evidence would violate the smallest-safe-change principle. If the
legacy quadratic-curve line path is ever exercised in production, a
follow-up patch with fresh harness/test evidence is required; do not
add these three roles here.

**Why this design is narrower and safer than the alternatives
(binding rejections):**

1. *Globally lowering handle role priority below hit-path* — REJECTED.
   Would change resolution for mousedown/click/dblclick too (the
   priority list is shared), breaking handle dragging and edit-point
   interaction, which the census confirms depends on handles
   outranking hit-path. PATCH-068 changes zero bytes of the priority
   list.
2. *Adding `onContextMenu` to every handle in SimpleLineRenderer* —
   REJECTED. Requires editing a fenced, non-allowed file
   (`SimpleLineRenderer.tsx`), duplicates the exact same callback
   logic across 6 roles instead of reusing the one hit-path
   implementation, and risks divergent behavior per role over time.
3. *Calling CanvasClient's menu callback directly from DrawingLayout*
   — REJECTED. Bypasses the hit-path's own `onSelectLine` call and its
   `preventDefault`/`stopPropagation` ordering (§2.D), and reaches
   into a different component's internals instead of going through the
   existing owned event path — violates component ownership and is not
   confined to DrawingLayout.tsx's existing dispatch idiom.
4. *Unscoped `document.elementsFromPoint` fallback for normalization*
   — REJECTED. Re-introduces exactly the overlap risk the ID-scoped
   design eliminates (§2.F) — could route the menu to the WRONG line
   when hit-paths/handles from different lines overlap.
5. *Letting the event fall through to Excalidraw* — REJECTED. Census
   (PATCH-067 §0.1.2 point 5) shows Excalidraw's `handleCanvasContextMenu`
   only runs when the bridge's own lookup fails; deliberately letting a
   SUCCESSFUL back-line resolution fall through would open the wrong
   (Excalidraw) menu instead of the app's line menu — contradicts the
   patch's own goal.

## 4. Scope

**Allowed files — exactly two:**

- Production: `components/collabboard/canvas/layouts/DrawingLayout.tsx`
  (authorized-change baseline `b3684e4c6226ec2ad77fbff3265de25339a7f471`).
  A tiny, local, unexported helper function inside this file (e.g. a
  single function resolving the normalized dispatch target from a
  resolved interactive element) is permitted if it stays local to the
  contextmenu handler, does not touch any other event type, and is
  independently understandable in isolation — no broader refactor, no
  new file, no exported utility.
- Test: `e2e/characterization/drawing-line-bridge.spec.ts`
  (authorized-change baseline `cdffcd794ad3fae743a97a25ccb4572a72c4080a`
  — the PATCH-067 landed hash; the PATCH-066 hash `075360ab…` is now
  ALSO dead).

**Not authorized under any circumstance without a new Fable
amendment:** `SimpleLineRenderer.tsx`, `CanvasClient.tsx`,
`LineContextMenu.tsx`, the Excalidraw fork, `drawingBridgeHarness.ts`,
`drawing-presentation.spec.ts`, any schema/config/dependency file, any
new endpoint/flag/hook, any presentation-related file, any new file.

If the census had proven DrawingLayout-only normalization impossible
(e.g. if the callback required data only SimpleLineRenderer holds),
this patch would STOP and request a redesign — it does not; the fix is
confined to one file as designed above.

## 5. Required production behavior

State U (unselected) MUST remain byte-identical to PATCH-067's proof:
lookup resolves `hit-path`, line menu opens, Excalidraw menu absent.

State S (selected + edit mode) after the fix MUST become:

- initial target-lookup resolution MAY still identify `midpoint-handle`
  or `point-handle` (role priority is unchanged — do not require the
  lookup itself to stop finding the handle);
- the contextmenu-only normalization resolves that SAME line's
  `hit-path` as the dispatch target;
- `hit-path-contextmenu:before-stop` / `after-stop` NOW fire (they
  currently do not — this is the behavior change);
- the app line context menu OPENS;
- Excalidraw's menu remains absent;
- the line remains selected, edit mode remains active, and
  `midpoint-handle: 1` / `point-handle: 2` remain visible after the
  menu interaction (handles are not perturbed by opening the menu).

## 6. Required regression coverage (single test file)

Update the committed PATCH-067 State-S block (and its `patch-067-*`
annotations) to prove the fix, not merely re-record the old failure:

1. State U: unchanged coverage, still passing (canvas topmost,
   physical target canvas, hit-path lookup, line menu opens,
   Excalidraw absent, invariants unchanged).
2. State S: edit-mode role-priority lookup still resolves
   `midpoint-handle` or `point-handle` at the click point (unchanged
   resolution — assert this, do not weaken it away);
   assert the NORMALIZED dispatch target's owning line ID equals the
   originally resolved handle's line ID (line-scoped proof — e.g. by
   asserting the post-fix `hit-path-contextmenu:before-stop`/
   `after-stop` diagnostics carry `lineId === primaryLineId`, the SAME
   id the handle lookup reported);
   `hit-path-contextmenu:before-stop`/`after-stop` NOW fire (flip the
   PATCH-067 absence assertions to presence assertions);
   the app line menu NOW opens (flip `stateSLineMenuVisible` from
   `false` to `true`);
   Excalidraw's menu remains absent;
   the line remains selected, handles remain visible
   (`midpoint-handle: 1`, `point-handle: 2` after the interaction);
   geometry and the full persisted-row array remain unchanged.
3. Overlap/scoping proof: seed or reuse the existing multi-line
   fixture (`seedAttachedCanvasLines` already seeds 3 lines via the
   allowed harness — read-only, no harness change); assert the OTHER
   seeded lines' role matrices, selection state, and geometry are
   unchanged after State S's context-menu interaction on the primary
   line (no unrelated line's menu opens, no unrelated line becomes
   selected) — this is the harness-backed proof that normalization is
   ID-scoped, not coordinate-scoped.
4. Replace the `patch-067-classification` annotation's role (or add a
   sibling) with `patch-068-contextmenu-fix`, recording: original
   resolved role (`midpoint-handle`/`point-handle`), normalized
   dispatch role (`hit-path`), owning line ID (equality proof), menu
   result (before/after), and the full invariant results. Do not
   silently delete the PATCH-067 R6 annotation — evolve it into the
   post-fix regression record so the historical diagnosis remains
   readable from the test.
5. Preserve unweakened: canvas-topmost stack evidence, physical target
   evidence, fixed left-click selection assertions, settle-aware
   persistence, fixed double-click edit-mode assertions and role
   counts, movement characterization (test 1), natural-height
   characterization (test 2), reload/dashboard-round-trip persistence,
   deletion-leaves-container, multi-container/multi-line independence,
   cleanup assertions, credential-aware skip discipline. Presentation
   regression spec is untouched (read-only, fenced) and must still pass.

## 7. Diagnostics contract (Amendment 2, unchanged, binding)

All diagnostic Playwright runs MUST use a self-started `npm run dev`
with an explicit `PW_BASE_URL`, confirmed via the `next dev` + `Ready`
banner, following LESSONS_LEARNED port discipline (inspect the target
port first, attribute any listener, never kill an unrelated process,
stop only the server started for this work). The Playwright-default
production webServer (`:3100`) remains unsupported for diagnostic
assertions; its failure is an environment error, not evidence. No
production logging/instrumentation change is authorized for test
convenience. Diagnostic assertions must not be weakened to tolerate
`next start`.

## 8. Baselines and fences

Base commit: `a181cdea2317a0d8a1602261c571d8a93721fcf8`.

Authorized-change baselines (the only two modifiable files):

```text
components/collabboard/canvas/layouts/DrawingLayout.tsx b3684e4c6226ec2ad77fbff3265de25339a7f471
e2e/characterization/drawing-line-bridge.spec.ts cdffcd794ad3fae743a97a25ccb4572a72c4080a
```

Both PATCH-064 (`b3684e4c…` was already the DrawingLayout hash) and
PATCH-066/067 dead hashes (`9853d10d…`, `075360ab…`) are VOID — any
tree matching them means this patch's predecessors are not landed;
STOP.

**Immutable fences — 39 unique paths** (freshly counted; do not carry
forward the stale "38" label from PATCH-067). This is the PATCH-067
immutable set (39 unique paths) with `DrawingLayout.tsx` REMOVED
(moved to authorized-change above) and `components/collabboard/menus/
LineContextMenu.tsx` ADDED (directly in the call chain, was not
previously enumerated):

```text
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
components/presentation/runtime-slide/RuntimeSlideRenderer.tsx a407cccc230ca74a36a443b5f701767856754230
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
e2e/characterization/drawing-presentation.spec.ts c6bfb4f01b0b4e5bd7654ee1405b6070141fbc09
app/dashboard/canvas/[id]/CanvasClient.tsx 1c6864b46e1c5c9a52f9e771ee2e51793898ecd8
components/collabboard/menus/LineContextMenu.tsx aaf16af230a76139377c4250f93485824000593e
```

39/39 independently verified matching at base `a181cde` (2026-07-15).
Re-verify before editing and after all gates; STOP on any mismatch.

**Bound baselines (pre-flight, all reconfirmed at `a181cde`):**

- focused Vitest: 51 passed / 2 files
- full Vitest: 424 passed / 41 files
- setup: 1 passed
- credentialed line: 4 passed (setup + 3 active)
- credentialed presentation: 2 passed / 2 approved skips
- credential-off line: 4 skipped
- credential-off presentation: 4 skipped
- cleanup: boards=0, padlets=0, canvasLines=0
- zero production imports of lineBridge / presentationBridge /
  drawingBridgeHarness
- tsc / boundaries / verify / build green

## 9. Stop conditions

- base commit or either authorized hash differs at pre-flight;
- any of the 39 immutable fences differs at any point;
- State U no longer works before editing (regression evidence, not
  something to patch around silently — report it);
- State S no longer reproduces the R6 pattern before editing;
- a third production or test file appears necessary;
- `SimpleLineRenderer.tsx`, `CanvasClient.tsx`, `LineContextMenu.tsx`,
  or the Excalidraw fork appear to require a change;
- the line-scoped hit-path resolution is ambiguous for any seeded
  fixture (more than one match, or a match that doesn't correspond to
  the resolved handle's line);
- overlapping-line behavior cannot be proven safe with the existing
  harness;
- existing event coordinates cannot be preserved unchanged;
- left-click, double-click, or handle dragging would be affected by
  the change;
- production instrumentation/logging is required beyond what already
  exists;
- cleanup becomes nondeterministic;
- any real (non-harness) user board would be touched;
- the dev-server diagnostic baseline is not green before editing;
- scope expands beyond contextmenu dispatch-target routing (e.g. any
  temptation to also "fix" role priority, label-handle, or the legacy
  start/control/end-handle roles — STOP and request a new patch
  instead of expanding this one).

## 10. Verification gates

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts   # 51/2 unchanged
npx tsc --noEmit
npm run check:boundaries
npx vitest run                                                                                      # 424/41 unless a tiny local helper is added (report if so)
npm run verify
npm run build
```

Diagnostic Playwright — self-started dev server, explicit `PW_BASE_URL`,
confirmed `next dev` + `Ready`:

```bash
npx playwright test --project=setup
npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization   # regression: untouched file, still 2 passed / 2 skips
E2E_SKIP_CREDENTIALS=1 npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
E2E_SKIP_CREDENTIALS=1 npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization
```

Also required: cleanup proof (boards/padlets/canvasLines = 0) via the
harness assertion AND an independent service-role query; production-
import greps (lineBridge, presentationBridge, drawingBridgeHarness —
zero); 39-fence verification before and after; generated-artifact
check (nothing staged); dev-server port discipline per
LESSONS_LEARNED.

**Manual acceptance (after automated gates, real browser, dev
server):**

1. Unselected back-line right-click opens the line menu.
2. Selected (non-edit-mode) back-line right-click opens the line menu.
3. Edit-mode midpoint-handle right-click opens the OWNING line's menu.
4. Edit-mode point-handle right-click opens the owning line's menu.
5. Edit handles remain draggable/usable after closing the menu.
6. Left-click selection behavior is unchanged.
7. Double-click edit-mode entry is unchanged.
8. No Excalidraw context menu appears in any of the above.
9. No unrelated/overlapping seeded line becomes selected or has its
   menu opened.
10. Geometry and persisted rows are unchanged before/after.

Independent Sonnet review of the uncommitted diff is required; commit
is prohibited until an explicit PASS.

## 11. Review and commit rules

- GPT-5.5 implements; does NOT commit or push.
- Independent Sonnet review of the uncommitted diff; explicit PASS
  required.
- Only after PASS may GPT-5.5 commit (bound message above) and push.
- Fable (CTO) closes PATCH-068 in CURRENT_TASK.md afterward.

## 12. Rollback

Two files (one production, one test). `git revert` of the
implementation commit restores the PATCH-067 tree (`a181cde`) exactly;
the 39 immutable fences prove nothing else moved.

## 13. Required final report

- confirmation State U remains unchanged and State S now matches it;
- the exact normalization logic added (file:line) and why it is
  confined to the contextmenu handler only;
- line-scoped-resolution proof (owning ID equality) from the live test
  run;
- overlap/multi-line proof (unrelated lines unchanged);
- Playwright totals (credentialed + credential-off, both specs), unit
  totals, cleanup proof, 39-fence verification results, production-
  import grep results;
- manual acceptance matrix results;
- commit hash and push status, only after Sonnet PASS.
