# PATCH-065 - Drawing Bridge Hardening: back-line pointer investigation and ordering-fixture discrimination

Status: APPROVED - test-only investigation/characterization patch.
Approved by the Fable CTO 2026-07-15. Drawing Bridge Hardening Program
patch 4. Closes the two non-blocking findings accepted in the PATCH-064
final independent review (verdict: PASS, implementation commit `2ed1455`).
Role: implementation engineer after Fable approval.
Base commit: 2ed1455ebd90cf31e12903bf96be27e19309091e

**Bound commit message (use verbatim):**

```
test(drawing): characterize back-line pointer routing and ordering fixture (PATCH-065)
```

## 1. Purpose

Two narrow goals, both test-only:

A. **Back-line pointer-interaction investigation.** PATCH-064 shipped with an
   evidence-backed narrow skip: a trial click on the real
   `[data-line-id][data-line-role="hit-path"]` element timed out, attributed
   to the Excalidraw canvas intercepting pointer events. This patch must turn
   that attribution into a verified diagnosis and real characterization
   coverage.

B. **Restore the discriminating presentation-ordering fixture.** The final
   PATCH-064 harness seeds frames landscape-first, which coincides with the
   real sidebar sort order (`order ?? +Infinity`, then `y`, then `x`) — the
   ordering assertion currently passes even if sorting silently degraded to
   raw insertion order. Restore the portrait-first seed so the assertion
   discriminates.

This patch must introduce no deliberate production behavior change. If the
investigation proves a product defect, the finding comes BACK to Fable as a
report; the fix is a separate, explicitly-amended or separately-authored
patch.

## 2. Investigation A — back-line pointer interaction

### 2.1 Current census (verified during PATCH-062/064 reviews)

- `components/collabboard/canvas/layouts/DrawingLayout.tsx` owns the
  back-line event bridge: `DRAWING_BRIDGE_LOG_PREFIX =
  '[DrawingLayout:back-line-bridge]'`, `BACK_LINE_INTERACTIVE_ROLE_PRIORITY`
  (line ~94), and `findBackLineInteractiveTargetAtPoint` (line ~2213), which
  iterates role priority × `document.elementsFromPoint()` and redispatches
  canvas-surface mouse events to back-line targets.
- `components/collabboard/SimpleLineRenderer.tsx` renders `hit-path` with
  `pointerEvents:'auto'` and a wide transparent stroke; `visible-path` has
  `pointerEvents:'none'`.
- The bridge exists precisely because the Excalidraw canvas sits above the
  back-plane SVG; direct clicks land on the canvas layer first.
- PATCH-064's trial click (Playwright `click()` on the hit-path element)
  timed out — consistent with the canvas intercepting, but not yet proven.

### 2.2 Required investigation steps

Using the existing `drawingBridgeHarness` fixture (real board, real
containers, real attached back-plane lines):

1. **Identify the real pointer-event path.** At the screen coordinates of a
   seeded line's hit-path midpoint, record (via read-only
   `page.evaluate(() => document.elementsFromPoint(x, y).map(describe))`)
   the actual element stack: which element is topmost, where the Excalidraw
   canvas sits, where the back-line SVG sits, and whether the hit-path
   appears in the stack at all.
2. **Identify which layer receives the event.** Attach temporary read-only
   listeners (capture phase, in-page, removed afterward) OR observe the
   bridge's own `[DrawingLayout:back-line-bridge]` console diagnostics while
   dispatching a real `page.mouse.click(x, y)` at those coordinates — NOT an
   element-handle `.click()` (which is exactly the interaction that times
   out because Playwright's actionability check waits for the hit-path to
   receive the event directly).
3. **Classify the PATCH-064 timeout** as exactly one of:
   - real product defect (bridge does not route clicks that should select)
   - incorrect selector/interaction in the test (e.g. element-handle click
     vs. coordinate click against a bridge that expects canvas-surface
     events)
   - overlay/z-index issue (some other layer above the canvas eats the event)
   - event-bridge timing issue (bridge attaches late; a settled wait fixes it)
4. **Characterize the observed behavior** with real assertions:
   - if `page.mouse.click(x, y)` at hit-path coordinates DOES select the
     line (selection visible via edit handles appearing — role counts for
     `start-handle`/`end-handle`/`control-handle`/etc. transitioning 0 → >0,
     or another real DOM selection signal), assert that path and also
     characterize right-click context-menu routing and post-selection
     edit-handle appearance;
   - if it does NOT select, record the observed element stack and event
     routing as diagnostics (test annotations, as in the PATCH-064
     natural-height pattern) and assert the honest current outcome.
5. Either way, the prior blanket `test.skip` must be replaced by real
   coverage: a passing characterization test (selection works — cover
   selection, handles, context menu) or a narrower evidence-carrying
   characterization of the failure (selection unreachable — assert the
   recorded stack/routing facts, keep only the genuinely-unreachable
   sub-interactions skipped with the new evidence in the reason).

### 2.3 Explicitly protected (must not regress)

- existing line creation/seeding coverage
- line persistence (reload / dashboard-return)
- container movement characterization (drag; line geometry + row unchanged)
- natural-height characterization (editor-driven growth; line unchanged)
- line deletion characterization
- multiple-line / multi-container independence
- the 8-role DOM presence matrix
- all PATCH-064 hash fences (§6) unless this spec is explicitly amended

## 3. Fix B — discriminating ordering fixture

In `drawingBridgeHarness.ts` `seedPresentationScene`:

- insert the **portrait** frame element BEFORE the landscape frame element in
  the master-scene elements array (and order `fixture.frameIds` to match the
  insertion order actually used);
- the expected sidebar order remains landscape first, portrait second
  (landscape `x=0,y=0` sorts before portrait `x=1400,y=0` under the live
  `order → y → x` rule);
- the sidebar assertion in `drawing-presentation.spec.ts` must therefore FAIL
  if raw insertion order were displayed — that is the point;
- keep the corrected active-slide assertions exactly as landed: Slide 1
  (landscape) asserts child A; Slide 2 (portrait) asserts child B — verify
  the seed change does not silently flip which frame is Slide 1;
- fullscreen/raw scene-order behavior stays separately characterized (the
  unit layer's `characterizeFrameSlides` source-order tests are untouched).

This is test-only. Production ordering code must not change.

## 4. Allowed files

Modify only:

- `e2e/characterization/drawing-line-bridge.spec.ts`
- `e2e/characterization/drawing-presentation.spec.ts`
- `e2e/characterization/drawingBridgeHarness.ts`

No additional file is pre-authorized. If the investigation genuinely requires
one more test-only file, STOP and request an amendment naming the exact path.

Do NOT modify:

- any production Drawing / presentation / line source
- `lib/infra/drawing/lineBridge.ts` / `.test.ts`
- `lib/infra/drawing/presentationBridge.ts` / `.test.ts`
- `e2e/helpers/env.ts` (reuse it; never copy it)
- Excalidraw fork files
- schema, migrations, config, dependencies, package/lockfiles, middleware
- `.fable5` files (CTO-only)

Explicitly NOT authorized: broad Drawing bridge refactoring, membership-rule
changes, slide-ordering production changes, container/comment/table work,
production pointer-routing changes. If the root cause of the pointer timeout
is a proven product defect, report it; do not fix it here.

## 5. Harness discipline (carried from PATCH-064 Amendment 5 §5.3)

All PATCH-064 harness rules remain binding: disposable uniquely-prefixed
records only (`patch-064-harness-` prefix stays — do not fork a second
prefix), never touch an existing user board, exact-ID tracking, resilient
independent cleanup steps with aggregate failure reporting, cleanup proof
asserting `{boards: 0, padlets: 0, canvasLines: 0}`, credential-aware
skipping via `hasE2ECredentials`, no hardcoded credentials, `PW_BASE_URL`
discipline, no new production endpoint/flag/hook.

Read-only in-page inspection (`elementsFromPoint`, temporary capture-phase
listeners that are removed, reading bridge console diagnostics) is permitted;
`page.evaluate` must never manufacture the behavior under test (no synthetic
event dispatch to simulate selection, no fabricated DOM).

## 6. Hash fences

All 31 PATCH-064 fences carry forward unchanged (verify before editing and
after verification; the authoritative list is PATCH-064 §11 — re-derive from
that spec text, do not trust this summary). Additionally fenced by this
patch (the frozen unit layer and env helper):

```text
lib/infra/drawing/lineBridge.ts f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/lineBridge.test.ts 559087550bf4a0304501ad479555ab4f4ad636a4
lib/infra/drawing/presentationBridge.ts b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/presentationBridge.test.ts dff458de747d673868b1eae2b695e41b4c3424d2
e2e/helpers/env.ts 9514723cde157f7ae6e6815d4c142a0f430a1292
```

The three allowed e2e files start from these base hashes at `2ed1455` (for
diff attribution only — they are the modifiable set, not fences):

```text
e2e/characterization/drawingBridgeHarness.ts 79d24512dfc9f5fdcb92b9ef88d4e0cc9587956c
e2e/characterization/drawing-line-bridge.spec.ts fc9eb32f7d1d43a0d19513ebc533ad237b9fa64b
e2e/characterization/drawing-presentation.spec.ts e078be06892ef89ed32a9ceef14cb1f9d8e2b132
```

## 7. Verification gates

```bash
git status --short --branch
git rev-parse HEAD          # must be 2ed1455… before editing
git diff --check
npx vitest run lib/infra/drawing/lineBridge.test.ts lib/infra/drawing/presentationBridge.test.ts   # 51 / 2, unchanged
npx tsc --noEmit
npm run check:boundaries
npx vitest run              # 424 / 41, unchanged — this patch adds no unit tests
npx playwright test e2e/characterization/drawing-line-bridge.spec.ts --project=characterization
npx playwright test e2e/characterization/drawing-presentation.spec.ts --project=characterization
npm run verify
npm run build
```

Runtime/config gate: LESSONS_LEARNED port discipline (inspect port 3000
first, attribute any listener, never kill an unrelated process, warmed dev
server + `PW_BASE_URL`, stop cleanly, confirm the port is free after).

Required Playwright evidence:

- credentialed line spec: the pointer-interaction outcome is either a real
  passing selection/handles/context-menu characterization OR an
  evidence-carrying characterization of the failure with recorded element
  stack — the blanket skip text from PATCH-064 must be gone;
- credentialed presentation spec: sidebar ordering passes WITH the
  portrait-first seed (discriminating), Slide 1/child A and Slide 2/child B
  assertions still pass;
- credential-off (`E2E_SKIP_CREDENTIALS=1`): both specs skip cleanly;
- cleanup proof: `{boards: 0, padlets: 0, canvasLines: 0}` after each spec,
  plus a global `patch-064-harness-%` zero-leftover check.

Acceptance greps (all must remain empty):

```bash
rg -n "from ['\"]@/lib/infra/drawing/(lineBridge|presentationBridge)|from ['\"]\.*/(lineBridge|presentationBridge)" app components lib --glob "!lib/infra/drawing/*.test.ts"
rg -n "drawingBridgeHarness" app components lib
```

Independent Sonnet review is required before commit.

## 8. Stop conditions

Stop before/while editing if:

- `git rev-parse HEAD` is not `2ed1455ebd90cf31e12903bf96be27e19309091e`
- any PATCH-064 §11 fence or §6 fence above mismatches before implementation
- the unit baseline is no longer 424 / 41
- the investigation appears to require ANY production source change
- the investigation appears to require a new file not named in §4
- deterministic fixture cleanup can no longer be guaranteed
- a real user board would be touched
- the pointer-interaction diagnosis cannot distinguish the four §2.2.3
  classifications without production instrumentation — report what WAS
  established and stop

## 9. Rollback

Test-only, three modifiable files, additive-or-modify within them.
`git revert <implementation commit>` restores `2ed1455` exactly; the fences
prove nothing else moved.

## 10. Required final report

- pointer-event path findings: element stack at hit-path coordinates, which
  layer receives real clicks
- the §2.2.3 classification with concrete evidence
- whether a product defect was found (report-only if so — proposed as the
  target of the first production Drawing Bridge refactor patch)
- ordering fixture: seed order used, proof the assertion now discriminates
- Playwright pass/skip totals (credentialed + credential-off), per spec
- cleanup proof results
- fence verification before/after (31 carried + 5 new)
- unit totals (must be unchanged: 51/2 focused, 424/41 full)
- production-import grep results
- commit hash and push status, if authorized after Sonnet review

## 11. After PATCH-065 — program direction (informational, not authorized here)

The next patch is expected to be the FIRST PRODUCTION Drawing Bridge change
of the program. It must address exactly ONE root cause chosen from the
characterized defect inventory (duplicate `padlet://` embeddable links,
overlap-fallback slide membership, native text/shape blank-raster rendering,
pointer routing IF PATCH-065 proves a defect, or the movement/resize
line-follow gap), ride the PATCH-062 + PATCH-064 regression net unchanged,
and must not combine membership, duplication, presentation, and pointer
routing in one patch. Authoring that patch requires a fresh Fable census and
a new spec; nothing in PATCH-065 pre-authorizes it.
