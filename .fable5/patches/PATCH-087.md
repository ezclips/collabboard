# PATCH-087 — Drawing Content-Save Failure Visibility (Strict Update Channel)

**Status:** **DONE** — landed as commit
`ba0c8f904d71f255045261497bf2803698ac206f`
(`fix(drawing): surface content-save failures via strict update channel (PATCH-087)`),
independent read-only review PASS; closure record in §12. First fix
of the silent-error family, scoped to its single highest-risk
caller: the drawing CONTENT save. Narrowest scope yet: ONE
production file (6 insertions / 7 deletions), bounded to the
`saveDrawingSnapshot`/`performSave` region. NO new spec file,
NO new prefixes, NO harness change, NO CanvasClient change, NO
useCanvasData change, NO retry timer or new save trigger.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`7dab2086bfde47178c0b50ce48aa74905ef0fc51`
(`fix(drawing): deep-clone linked rows on duplicate slide (PATCH-086)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): surface content-save failures via strict update channel (PATCH-087)`

---

## 0. Census at authoring (2026-07-19, from `7dab208`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Drawing content-save silent failure (`saveDrawingSnapshot` via void `onUpdatePadlet`)** | defect FIX | **SELECTED (this patch)** — highest-risk caller of the silent family; owner statically proven (§1); strict channel already plumbed by 086 |
| 2 | Remaining non-strict `onUpdatePadlet` callers (DrawingLayout comments/container-drop sites ~307/487/496/520) | defect family | AFTER this patch — medium severity, mixed semantics; migrate per-caller with per-caller rulings |
| 3 | Result/throw contract consistency (CanvasClient/useCanvasData `*OrThrow` vs swallow family incl. the seven-site canvas-ops list) | design | LATER dedicated patch — broad conversion unsafe to bundle; decisions-table entry stands |
| 4 | Clone compensation robustness/observability | adequate | post-086: one visible error + narrow compensation; no further work now |
| 5 | PATCH-081 stale classification | RETIRED-BY-NOTE | derivation is timing-stale (immediate probe races the now-async duplicate); spec stays untouched and green; `drawing-duplicate-deep-clone.spec.ts` is the authoritative duplicate characterization |
| 6 | Frame-geometry sidebar staleness | no current characterized defect | 079 green (`sidebar-updates-correctly`), 080 both-persist; diagnosis-first IF a user-visible repro appears |
| 7 | Frame/sidebar position synchronization | uncharacterized | deferred with #6 |
| 8 | Line-follow behavior | hardening | deferred — no attachment contract |
| 9 | Uploaded-image storage cleanup | hardening | deferred |
| 10 | AI images in presentation | feature | deferred (fixture-blocked) |
| 11 | Overlap fallback | hardening | low, deferred |
| 12 | Connections side-panel planning | feature | deferred |
| 13 | Long-batch auth-token expiry | test infra | justified as a DEDICATED infra patch (clearer expiry diagnostics + grouped refresh) but ranked BELOW this production P3 fix; deferred, sanctioned recovery documented |
| 14 | New defect exposed by 086 | — | NONE (Kepler PASS; all gates green) |

## 1. Exact defect (bind — statically proven at this census)

`saveDrawingSnapshot` (`DrawingLayout.tsx` ~991–1027 at base) is
the DRAWING CONTENT SAVE — the persistence core this whole family
exists to protect. It calls the VOID channel `onUpdatePadlet`
(→ `handleDrawingLayoutUpdatePadlet` →
`useCanvasData.updateDrawingLayoutPadlet` 566–590), which NEVER
rejects: a resolved Supabase failure takes a silent local rollback
and a thrown failure is caught/logged/rolled back inside the hook.
Consequences:

1. both catch sites carrying the bound substring
   `"Failed to save drawing to master padlet"` are DEAD CODE for
   persistence failures — they can never fire;
2. `performSave` clears `dirtyDataRef` BEFORE awaiting the save
   (~1029–1034), so a failed save silently DROPS the snapshot: the
   user keeps drawing over unsaved state and loses work on reload
   with ZERO signal (P3 violation, silent);
3. the local padlets rollback inside the hook leaves UI and
   persistence silently divergent.

The strict throwing channel (`onUpdatePadletStrict` →
`updatePostFieldsOrThrow`, PATCH-051 idiom) is ALREADY passed to
DrawingLayout since 086. The ONLY authorized repair is switching
the content save to it and making failure re-arm the dirty state.

## 2. Authorized fix (bind — smallest safe scope)

In `components/collabboard/canvas/layouts/DrawingLayout.tsx` ONLY
(starting blob `a7b81a1915cbe570cb57850c17088e30d4daf81c`), inside
`saveDrawingSnapshot` (and, only if needed for the re-arm,
`performSave`):

- switch the content-save call from `onUpdatePadlet` to the
  EXISTING `onUpdatePadletStrict` prop (no signature change, no new
  prop, no fallback);
- on failure (the strict channel rejects): the EXISTING bound
  console.error substring fires EXACTLY ONCE per failed attempt
  (deduplicate the current double-catch structure so one failure
  cannot log twice), AND the snapshot is RE-ARMED:
  `dirtyDataRef.current = snapshot` ONLY IF `dirtyDataRef.current`
  is still null (never clobber a newer snapshot). No new timer, no
  new trigger — the existing debounce/unmount saves provide the
  retry;
- the generation guard, empty-canvas guard, `saveInFlightRef`
  semantics, and every OTHER `onUpdatePadlet` call site stay
  byte-unchanged; the 085 (element-key) and 086 (deep-clone +
  strict rewire) regions stay byte-intact.

PROHIBITED: migrating any other caller; touching CanvasClient,
useCanvasData, posts.ts, postsRepository.ts, deletion paths,
debounces, move detection, or the sync effect; adding any retry
timer, queue, toast, or seam; changing the bound error substring;
any edit outside the two named functions.

## 3. Bound semantics (acceptance meaning of "fixed")

- A successful content save behaves exactly as today (plus the
  strict handler's post-success local merge, landed in 086).
- A FAILED content save (resolved OR thrown repository error) is
  VISIBLE: the bound substring logs exactly once per attempt.
- No false success: the failed snapshot is not dropped — it is
  re-armed for the existing debounce/unmount retry unless a newer
  snapshot already superseded it.
- No swallowed resolved error, no swallowed thrown error, no
  duplicate reporting, no source-of-truth mutation (the live scene
  remains authoritative; no rollback of the editor).
- Ordinary (non-content) `onUpdatePadlet` callers keep today's
  semantics — their migration is census #2, NOT this patch.

## 4. Acceptance evidence (bind — no new spec file)

The failure path cannot be triggered without mocking (prohibited),
so acceptance is:

- **Positive path (browser):** ALL 14 carried specs green — the 12
  carried + `drawing-duplicate-persistence.spec.ts` +
  `drawing-duplicate-deep-clone.spec.ts`. Their existing
  `saveErrorLogged`/`SAVE_ERROR_SUBSTRING` watchers MUST stay
  false/silent on healthy runs (proves no false errors from the
  strict switch), and their content-write 2xx observations prove
  the strict channel saves.
- **Negative path (inspection):** the reviewer verifies from the
  diff: the strict call site has no catch-and-continue that
  restores false success; exactly one log per failure; the re-arm
  never clobbers a newer snapshot; the clear-then-save ordering in
  `performSave` plus the re-arm cannot lose a snapshot; no other
  call site changed.
- Three sequential stable dependency runs of
  `drawing-duplicate-persistence.spec.ts` (the content-save-heavy
  spec) as the focused stability gate.

## 5. Allowed files (bind)

| File | Role | Starting blob at base `7dab208` |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | production fix (§2 bounded region ONLY) | `a7b81a1915cbe570cb57850c17088e30d4daf81c` |

ONE file. No new spec (§4), no unit-test file (component-internal,
085/086 precedent). Absence gates:
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-088 not started.

## 6. Immutable fences (bind — 35, Git blob IDs)

Verify each with `git rev-parse 7dab208…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 086 fence set
PLUS `CanvasClient.tsx` (its strict handler must not change) PLUS
both 086-landed spec files. `DrawingLayout.tsx` is NOT fenced (the
allowed file).

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
```

## 7. Expected totals (bind)

Carried: all 14 browser specs' pass/fail totals UNCHANGED;
`drawing-duplicate-persistence.spec.ts` three sequential stable
dependency runs (2 passed each; credential-off 2 skipped;
`--no-deps` 1 passed). Deterministic: helper 7/1; sanitizer 9/1;
focused drawing 59/2; full Vitest **448/43**; `git diff --check`/
tsc/boundaries/sequential verify+build green; zero production
imports of bridge/harness modules; 35/35 fences; DrawingLayout diff
strictly within §2 (reviewer verifies hunk-by-hunk, including 085 +
086 regions byte-intact). Cleanup zeros across the **TWENTY-NINE**
tracked prefixes (no new prefixes).

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` (known
long-batch expiry → sanctioned refresh + per-spec reruns, reported
separately); no credential contents; passive listeners only;
sequential `verify`/`build`, never under a dev server; never commit
generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (35/35), or any §5 absence gate differs;
- the fix requires ANY edit outside `saveDrawingSnapshot`/
  `performSave`, a second file, or a prop/signature change;
- any OTHER `onUpdatePadlet` call site changes;
- healthy runs start logging the bound substring (false errors);
- any carried spec's pass/fail totals change;
- the re-arm requires a new timer/trigger/queue to be correct;
- double-logging cannot be removed without restructuring beyond §2.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diff + report (blob
re-derived; carried totals; three-run stability; deterministic
totals; fence result; cleanup proof). The independent read-only
reviewer re-derives everything, audits the failure path by
inspection (§4), and must return an explicit PASS before the
implementer commits with the bound message and pushes. CTO closes
with a fresh census.

## 11. Required final report

Exact one changed path + final blob; full diff; §3 semantics
conformance; carried totals + stability runs; deterministic totals;
35-fence result + absence gates; cleanup across twenty-nine
prefixes; explicit confirmations (no other caller migrated, one log
per failure, re-arm never clobbers newer snapshots, 085/086 regions
intact, no seam, no timer); commit hash + push status after PASS.

## 12. Closure record (CTO, 2026-07-19)

**Landed:** commit `ba0c8f904d71f255045261497bf2803698ac206f`
(`fix(drawing): surface content-save failures via strict update channel (PATCH-087)`),
HEAD == origin/main at closure. ONE file, exact blob:
`components/collabboard/canvas/layouts/DrawingLayout.tsx`
`a2fb3aebf0f66967c40c1765b5bf69b2e853d05c` (+6/−7 lines).
**Independent read-only review: PASS.**

**Exact defect (final):** the drawing-content persistence used the
non-strict update channel; resolved repository failures and caught
thrown failures never rejected to DrawingLayout, so
`saveDrawingSnapshot`'s failure catch could not observe a real
persistence failure; `performSave` cleared `dirtyDataRef` before
awaiting persistence — a failed content save silently dropped the
snapshot and user changes could disappear after reload with no
visible signal.

**Exact fix (final):** `saveDrawingSnapshot` now uses
`onUpdatePadletStrict` (propagates resolved AND thrown failures);
the redundant inner catch was removed — ONE failure path remains
and the existing exact message
`Failed to save drawing to master padlet` logs ONCE per failed
attempt; the failed snapshot is restored to `dirtyDataRef` ONLY
when it is still null (a newer snapshot is never overwritten);
`performSave` still clears before awaiting; NO retry loop, NO new
timer/trigger, NO immediate forced retry; the editor scene remains
authoritative and is never rolled back. Success semantics
unchanged: no false error logging, no duplicate writes, no
save-target/payload/debounce change.

**Preserved:** every other `onUpdatePadlet` caller byte-unchanged;
CanvasClient.tsx, useCanvasData.ts, posts.ts, postsRepository.ts
untouched; 085 element-key tracking intact; 086 deep-clone +
strict-rewire intact; no deletion/geometry/presentation/deep-clone
semantic change; no auth material; no instrumentation seam.

**Verification at closure:** focused —
`drawing-duplicate-persistence` 2 passed dep / 1 passed
`--no-deps` / 2 skipped credential-off; three stable dependency
runs (2 passed each); no save-error substring on healthy runs;
content-bearing 2xx writes present. Carried — all 14 specs green;
the initial long batch hit the KNOWN auth-expiry signature,
recovered ONLY via sanctioned setup refresh + individual
`--no-deps` reruns (no source edits; no totals changed).
Deterministic — diff-check, tsc, boundaries, slideOrder 7/1,
clonedPostMetadata 9/1, focused drawing 59/2, full Vitest
**448/43**, verify, standalone build. Cleanup — 29 prefixes zero
(boards/padlets/canvasLines/cloned child rows 0, no orphans), no
artifacts, ports 3000/4000 free, no repo-owned runtime process.
