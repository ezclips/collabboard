# PATCH-085 — Drawing Duplicate Persistence Fix (Element-Keyed Move Detection)

**Status:** **DONE** — landed as commit
`ef2a8234d686b8cba5c7430132affbbb552f9a63`
(`fix(drawing): key embeddable move detection by element id (PATCH-085)`),
Sonnet independent PASS, closure record in §13. First production fix
of the persistence family. Narrow scope held: ONE production file
(bounded edit sites within it) + ONE new regression spec + the
Amendment 1 characterization correction. NO harness change, NO
fork change, NO deep-clone row semantics, NO frame-geometry change,
NO presentation-mode change.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`6f9681d5f17b6770f9d08eeb110641dea24453c9`
(`test(e2e): characterize drawing save wire-level behavior (PATCH-084)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): key embeddable move detection by element id (PATCH-085)`

---

## 0. Census at authoring (2026-07-19, from `6f9681d`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Duplicate save-arming/starvation production fix (element-keyed move detection)** | defect FIX | **SELECTED (this patch)** — exact owner proven at 084 closure |
| 2 | Rapid Add→Duplicate newest-scene coalescing | defect | SUBSUMED by #1: arming/coalescing already work (newest payload re-arms); only starvation blocks firing |
| 3 | onChange suppression during Duplicate updateScene | ruled out | ELIMINATED at 084 closure (sidebar proof: handleChange fired) |
| 4 | Debounce timer replacement semantics | defect (mechanism) | the starvation channel — repaired by #1 removing its churn source; timer semantics themselves unchanged |
| 5 | Stale closure / stale scene snapshot capture | ruled out for THIS defect | payloads were correct when armed; not the blocker |
| 6 | Save/dirty guard blocking Duplicate | ruled out | arming is unconditional modulo sync/import flags; first post-Duplicate onChange armed |
| 7 | Silent Supabase resolved-error handling (P3 visibility) | defect | SEPARATE later patch — no error ever fired here; do NOT bundle |
| 8 | Deep-clone persistence/deletion safety (fresh cloned rows, PATCH-076 OPTION A) | defect | AFTER this patch — requires durable persistence first; do NOT bundle |
| 9 | Frame-geometry sidebar staleness | defect (uncharacterized) | after the persistence family |
| 10 | Line-follow behavior | hardening | deferred |
| 11 | Uploaded-image storage cleanup | hardening | deferred (approved skip) |
| 12 | AI images in presentation | feature | deferred (approved skip) |
| 13 | Overlap fallback | hardening | deferred |
| 14 | Connections side-panel planning | feature | deferred until stabilization ruled complete |
| 15 | New defect exposed by 084: shared-row position overwrite (sync can move the ORIGINAL onto the clone) | defect | same root cause — fixed by #1's keying change; observed via the same regression spec |

## 1. Exact defect (bind — proven at PATCH-084 closure)

`handleDuplicateSlide` (`DrawingLayout.tsx` 1425–1452) clones frame
children PRESERVING `link`, producing two live embeddables that
share one `padlet://<id>` at positions `dx = frame.width + 80`
apart. `handleChange`'s Excalidraw-native move detection
(1074–1091) keys its last-position map `lastEmbeddablePosRef` BY
PADLET ID. With two elements sharing one key, every onChange scan
alternates the stored position between the two elements and
therefore detects a FALSE DRAG (offset ≥ epsilon) on EVERY scan.
Consequences (all wire-evidenced by PATCH-084):

1. `schedulePadletPositionSave` fires an 800 ms-debounced position
   write storm to the shared row (~15 extra non-content
   `/rest/v1/padlets` writes per Duplicate flow; B/C ≈ 35 vs A = 20);
2. each write → `setPadlets` → embeddable-sync effect →
   `updateScene` → further onChanges — a self-sustaining churn loop
   with sub-2 s period;
3. the churn perpetually resets the 2000 ms content-save debounce
   (**starvation**) so the drawing content save NEVER fires
   (`duplicate-save-never-sent`) — the duplicate (and any
   rapidly-preceding Add) stays live-only;
4. the overwritten shared row can then pull the ORIGINAL embeddable
   onto the clone's coordinates via the sync effect (position
   corruption).

onChange emission, save arming, payload freshness, and the server
path are all PROVEN healthy (084 + Flow A control). The ONLY
authorized repair target is the false-drag oscillator's keying.

## 2. Authorized fix (bind — smallest safe scope)

In `components/collabboard/canvas/layouts/DrawingLayout.tsx` ONLY,
re-key the move-DETECTION position tracking from padlet id to
**scene-element id** at the bounded sites:

- the detection/compare/store logic inside `handleChange`
  (~1074–1091): `lastEmbeddablePosRef` reads/writes keyed by
  `el.id`; the position-save TARGET remains the padlet id parsed
  from the link (`schedulePadletPositionSave(pId, …)` unchanged);
- the sync effect's pre-update of the same map (~1751–1758): key by
  the refreshed/missing element's `id`;
- any other read/write of `lastEmbeddablePosRef` in the file must
  use the same element-id keying (the map's clear sites stay
  as-is).

PROHIBITED: changing `recentlyDraggedRef`/`pendingPosTimersRef`
keying or semantics; changing the 2000 ms or 800 ms debounce values;
changing `handleDuplicateSlide`/`handleAddSlideBelow` themselves
(link stripping, fresh rows, setElements calls, explicit
save-arming); adding any new save trigger, queue, or seam; touching
the sync effect's lock/refresh logic beyond the keying line; any
edit outside the bounded sites. If the bounded fix proves
insufficient (see §9 stop conditions), STOP and report — do NOT
widen.

## 3. Bound production semantics (acceptance meaning of "fixed")

- Duplicate-only arms AND FIRES a drawing-content save; the
  duplicate persists and survives settlement.
- Rapid Add→Duplicate persists the NEWEST COMPLETE live scene: the
  final settled persistence contains BOTH new frames; Add is not
  erased by a rapid Duplicate.
- Later mutations may replace an earlier pending save only because
  the replacement payload contains all valid prior mutations
  (existing debounce-replacement semantics — unchanged, now able to
  fire).
- Isolated Add behavior unchanged. Ordinary drag-position saves
  unchanged (detection strictly more correct per element).
- No stale baseline payload replaces a newer scene; no duplicate
  write storm (the false-drag storm disappears); no extra saves for
  metadata-only activity beyond current intended behavior.
- Save failures remain exactly as diagnosable as today (error paths
  untouched — the silent-swallow defect is census #7, later).
- No frame-geometry change, no presentation-mode change, no
  deep-clone row semantics.

## 4. Regression matrix (bind) and the new spec

ONE new characterization/regression spec:
`e2e/characterization/drawing-duplicate-persistence.spec.ts`
(ONE active test, FOUR sequential disposable boards, PATCH-083/084
fixture seeding and real-menu/verified-fit/settlement methodology;
bound prefixes `patch-064-harness-patch-085-fix-a-` / `-b-` / `-c-`
/ `-d-`; `registerDrawingCleanup(test)` at module scope; per-board
try/finally + zero-assertion; `test.setTimeout(420_000)` maximum —
explicit four-flow exception):

- **Flow A** — Add only → ASSERT Add's frame id in settled
  persistence (control unchanged).
- **Flow B** — Add then Duplicate within ≤5 s (immediately, as 083)
  → ASSERT settled persistence contains BOTH the Add frame id and
  the Duplicate frame id.
- **Flow C** — Duplicate only → ASSERT the duplicate frame id in
  settled persistence.
- **Flow D** — Add, wait ≥2.5 s (letting the Add save fire), then
  Duplicate → ASSERT both persist in the settled set.

Flow E/F observations (reported in the evidence annotation, bound
STOP threshold but no exact assert): per-flow passive
`/rest/v1/padlets` write counts (084 method, passive listeners only,
no `page.route`, no auth capture) must show NO position-write storm
— if any flow's raw write count exceeds 3× the PATCH-084 Flow A
control level (i.e. > 60), STOP and report. Flow G (save-error
visibility) is satisfied by inspection: the fix touches no error
path (Sonnet verifies the diff never touches a catch/rollback/log
site).

Settlement per flow: persisted frame-id polls ≤1000 ms cadence,
window ≥20 000 ms, settled = final ≥6000 ms stable. Live frame ids
captured via the verified-fit method before settlement. Annotation:
per-flow persisted assertions' observed ids + write counts +
`classification`-free (this is a REGRESSION spec — outcomes are
ASSERTED, not classified).

**Expected changes to CARRIED diagnostic specs (bound, expected,
non-blocking):** the observational diagnosis specs
(080/081/082/083/084 and the 076 shared-reference spec) hardcode NO
expected classification, so their pass/fail totals MUST remain
unchanged; their recorded annotations/classifications WILL change
(e.g., 083 → a `mixed-supersession-state`-family value, 084 → a
`mixed-wire-state`-family value, duplicates now persisting). Sonnet
must confirm totals unchanged and report the new classification
values as evidence of the fix, not as regressions.

## 5. Allowed files (bind)

| File | Role | Starting blob at base `6f9681d` |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | production fix (bounded §2 sites ONLY) | `5455597d486fd917c4983a18e47445e2b1c9314d` |
| `e2e/characterization/drawing-duplicate-persistence.spec.ts` | NEW regression spec | absent at base (absence gate) |
| `e2e/characterization/drawing-presentation.spec.ts` | carried-characterization correction (Amendment 1 §12 ONLY — smallest assertion/evidence update at the `:1100` persisted-scene equality) | `ddab83381605dbdcdda4d1a0cea3cafe010f55c5` |

No fourth file. No unit-test file is authorized: the touched logic is
component-internal with no exported seam, and extracting one is out
of scope for this narrow fix. (Allowed files were TWO at authoring;
expanded to THREE by Amendment 1 after the bound stop condition —
see §12.)

Absence gates: the new spec path absent at base and in the worktree
before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-086 not started.

## 6. Immutable fences (bind — 30 after Amendment 1, Git blob IDs)

Verify each with `git rev-parse 6f9681d…:<path>` and equality at the
current governance HEAD. Blob-ID method only (never raw file SHA-1 /
`Get-FileHash`). PATCH-084's fence set minus the now-allowed
`DrawingLayout.tsx`, plus 084's landed spec. **Amendment 1 (§12)
removed `e2e/characterization/drawing-presentation.spec.ts` from
this fence list (it is now the third allowed file) — the list below
retains its row for historical binding, but it is NO LONGER a fence;
effective fence count is THIRTY.**

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/menus/LineContextMenu.tsx           aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                       e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                  2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                            f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                    b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts    b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
components/collabboard/canvas/hooks/useCanvasData.ts       2e158f1278a395b5028083e8f387a22e4daf5b60
lib/domain/canvas/posts.ts                                 5af51ef0cec14c014072529eda673e81a87c4b8b
lib/infra/canvas/postsRepository.ts                        3a74731730ef047f023465dd65d86700fe878e74
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
e2e/characterization/drawing-duplicate-divergence.spec.ts  5d3cccb693f57022c9e9aa44522bee6f59552332
e2e/characterization/drawing-save-supersession.spec.ts     c6cc4feaa6f2320932232a993b70cda73c9e584c
e2e/characterization/drawing-save-wire.spec.ts             280d37545e9d638c5eb8d883ffa99beefa5da308
```

## 7. Expected totals (bind)

New regression spec: **2 passed with dependencies / 1 passed
`--no-deps` / 2 skipped credential-off**, THREE sequential stable
runs (asserted outcomes must hold every run — any failed assertion
is a STOP, not a flake to retry silently).
Carried: all 11 browser specs' pass/fail totals UNCHANGED
(annotation/classification value changes in the observational
diagnosis specs are EXPECTED per §4 and must be reported); helper
7/1; sanitizer 9/1; focused drawing 59/2; full Vitest **448/43**;
`git diff --check`/tsc/boundaries/sequential verify+build green;
zero production imports of bridge/harness modules; 31/31 fences;
DrawingLayout.tsx diff strictly within the §2 bounded sites (Sonnet
verifies the full diff hunk-by-hunk).
Cleanup zeros across **TWENTY-FIVE** prefixes: the twenty-one
tracked prefixes plus this patch's four §4 prefixes.

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` (stale-auth
incident: NINE reproductions, environmental); no credential
contents; passive network listeners only (no `page.route`, no auth
headers); sequential `verify`/`build`, never under a dev server;
never commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (31/31), or any §5 absence gate differs;
- the fix requires ANY edit outside the §2 bounded sites, a third
  file, a harness change, or a fork change;
- after the bounded fix, Flow C (or any matrix flow) still fails its
  persistence assertion — the starvation has an additional
  unidentified churn source; report the evidence, do NOT widen the
  fix;
- any flow's raw padlets write count exceeds the §4 storm threshold;
- any carried spec's pass/fail totals change;
- isolated Add (Flow A) regresses in any way;
- ordinary drag position saving demonstrably breaks;
- the diff touches any error-handling/catch/rollback/log site;
- deep-clone row semantics, link stripping, or fresh-row creation
  become "necessary" — that is census #8, a later patch;
- per-test timeout above 420 000 ms would be needed.

## 10. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted diff (re-derives both blob IDs — modified
DrawingLayout.tsx and the new spec; verifies the production diff is
STRICTLY within the §2 bounded sites hunk-by-hunk and touches no
error path; re-verifies 31/31 fences + absence gates + two-file
scope; re-runs the full §7 matrix including three stable runs of the
new spec, all carried totals, deterministic gates, cleanup across
twenty-five prefixes; confirms carried diagnostic-spec
classification changes are the EXPECTED §4 values and reports them);
explicit PASS required; NO commit before PASS; then commit with the
bound message and push; Fable closes, records the
before/after wire evidence, and re-runs the census (deep-clone row
semantics #8 and silent-error visibility #7 become the leading
candidates).

**Bound commit message (verbatim):**
`fix(drawing): key embeddable move detection by element id (PATCH-085)`

## 11. Required final report

Modified DrawingLayout.tsx blob + new spec blob; the full production
diff; per-flow asserted persistence outcomes ×3 runs; per-flow write
counts vs the 084 baseline (storm gone); carried totals (unchanged)
+ the new classification values of the observational specs; all
deterministic totals; 31-fence result + absence gates + two-file
scope proof; cleanup across twenty-five prefixes; commit hash + push
status after PASS.

## 12. Amendment 1 (CTO, 2026-07-19) — presentation characterization
correction after the bound stop condition

**Event:** the implementer correctly STOPPED on the §9 carried-totals
condition: `drawing-presentation.spec.ts` failed at `:1100`
(`expect(postRunPersistedScene.sceneElements).toEqual(
persistedScene.sceneElements)`) — persisted heights of `emb-slide-a`
and `emb-slide-b` changed 260 → 153. Candidate blobs at the stop:
DrawingLayout.tsx `a92bb25cf3608f5a74d3b27fc779c6a1b4b0a300`, new
regression spec `b0ab5ea55195e3aab5a43aa8e73e88cd136723f4`.

**CTO forensic findings (all read-only; candidate untouched):**

1. **Production diff audit:** the DrawingLayout.tsx diff is EXACTLY
   the authorized §2 identity change (three hunks, all
   `lastEmbeddablePosRef` keying pId → element id; save target
   unchanged). NO geometry, sync-application, payload, or clone code
   touched.
2. **Assertion meaning:** the `:1100` equality binds "the persisted
   scene never changes during a passive presentation session" — the
   pre-read occurs BEFORE the board is first opened.
3. **Fixture truth:** scene embeddables seeded at height 260; the
   linked container ROWS seeded at height 220; the real measured
   card content produces the natural height
   `max(28 + 22 + scrollHeight, 80)` = **153** via the
   `onNaturalHeight` path (DrawingLayout ~460–479), which calls
   `updateScene` WITHOUT the sync flag — a legitimate,
   INTENDED live scene change whose onChange arms the 2 s autosave.
   This path is untouched by the candidate; live geometry is
   identical at base and candidate.
4. **Reproduction (candidate):** deterministic ×2 — identical
   failure, ONLY the two heights 260 → 153; x/y/width/order/ids and
   every other element byte-stable; links distinct (no shared-link
   involvement in this fixture).
5. **Base comparison (detached worktree at `6f9681d`, base
   DrawingLayout blob `5455597…`):** 2 passed / 2 skipped — at base
   the SAME live conformance to 153 occurs but is NEVER persisted:
   the armed autosave is starved by the base churn defect
   (PATCH-084's proven mechanism family), so the stale seeded 260
   survives the session.
6. **Move-detection payload:** position saves write x/y only; no
   width/height is ever written by move detection (old or new). The
   260 value was NOT produced by geometry writes — it was seeded
   JSON preserved by the persistence defect.

**Classification: B — defect correction exposes previously
defect-frozen characterized geometry.** 153 is the product-correct
conformed height (natural-height subsystem, intended, untouched);
260 was the seeded value that persisted ONLY because the old defect
prevented the autosave from ever firing during a session. The
carried characterization encoded the DEFECT (frozen persistence) as
an invariant. This is a characterization correction, NOT a product
geometry change.

**Governance action: OPTION B.**
`e2e/characterization/drawing-presentation.spec.ts` becomes the
THIRD allowed file, starting blob (bind, verified against base with
`git rev-parse 6f9681d…:e2e/characterization/drawing-presentation.spec.ts`):
`ddab83381605dbdcdda4d1a0cea3cafe010f55c5`.
Authorized change: the SMALLEST assertion/evidence update at the
`:1100` equality region ONLY:

- keep asserting element ORDER, ids, types, frameIds, links,
  isDeleted, x, y, and width byte-stable pre→post;
- for `emb-slide-a` and `emb-slide-b` HEIGHTS only: assert the
  post-run persisted height equals the natural-height-conformed
  LIVE value — derived from the live scene (or the deterministic
  observed value 153 with the derivation recorded in the evidence
  annotation); the pre-run seeded value remains 260 and must be
  recorded, not asserted as the post-run expectation;
- update/extend the nearby evidence annotation minimally to record
  both values and the derivation;
- NO other assertion, fixture, flow, or helper change.

**Bound geometry invariant (for this patch and Sonnet review):** the
re-keying changes tracking identity only; persisted x/y/width and
all non-slide-embeddable geometry must remain byte-stable through
the presentation session; the two slide-embeddable heights must
persist at the conformed natural height (observed deterministic
value 153) — NOT at the stale seeded 260, and NOT at any third
value. If any run shows a third value, non-deterministic heights, or
any OTHER element changing: STOP (that would be classification A/C
territory, not this amendment).

**Effective contract changes:** allowed files 2 → 3 (§5); fences
31 → 30 (§6 — presentation spec removed); §7/§9 carried-totals
language now reads: all carried pass/fail totals green WITH the
amended presentation spec (its totals must RETURN to
2 passed / 2 skipped); Sonnet reviews ALL THREE files and must
independently re-derive the base-vs-candidate geometry evidence
(base preservation of 260 need not be re-run in a worktree; the CTO
base run is recorded here, but Sonnet must verify the candidate-side
determinism and the smallest-change property of the spec edit).

**Resumption:** implementation resumes FROM the current candidate
blobs (`a92bb25…` production, `b0ab5ea…` regression spec — both
UNCHANGED by this amendment and NOT to be reverted). Remaining work:
the §12 spec correction, then rerun: focused PATCH-085 gates (already
green — rerun the presentation spec to 2/2 ×2 stable + one full
three-run stability pass of the regression spec), the remaining
carried gates (drawing-duplication, drawing-line-bridge, plus a full
carried batch re-confirmation), the deterministic closeout chain,
cleanup across twenty-five prefixes, then Sonnet review.

## 13. Closure record (CTO, 2026-07-19)

**Landed:** commit `ef2a8234d686b8cba5c7430132affbbb552f9a63`
(`fix(drawing): key embeddable move detection by element id (PATCH-085)`),
HEAD == origin/main at closure. Three files, exact blobs:
`components/collabboard/canvas/layouts/DrawingLayout.tsx`
`a92bb25cf3608f5a74d3b27fc779c6a1b4b0a300`;
`e2e/characterization/drawing-duplicate-persistence.spec.ts`
`b0ab5ea55195e3aab5a43aa8e73e88cd136723f4`;
`e2e/characterization/drawing-presentation.spec.ts`
`6bbd6deb83106d38a0a524253ee95ac3f6bdaa2f`. **Sonnet independent
review: PASS** (full 27-task protocol, all facts re-derived from
scratch, three independent stability runs, own carried batch + gates).

**Exact production fix:** move-detection identity re-keyed —
`lastEmbeddablePosRef` reads/writes keyed by Excalidraw ELEMENT id
(`el.id`) instead of padlet id, at the three bounded sites
(handleChange detection ~1074-1092 and the sync-effect pre-seed
~1755-1758). The persistence target remains the padlet id parsed
from the `padlet://` link (`schedulePadletPositionSave(pId, …)`
byte-unchanged). Final technical ruling: duplicated embeddables can
share one padlet link; padlet-keyed tracking conflated distinct
scene elements; their differing coordinates re-appeared as movement
on every scan; the repeated position writes drove sync churn; the
churn perpetually reset the 2000 ms content-save debounce
(starvation); element-keyed tracking gives each scene element an
independent movement baseline, so Duplicate-touching scenes now
reach drawing-content persistence. Debounce timing unchanged; save
scheduling not broadened; persistence identity unchanged.

**Final behavioral results (regression spec, three-run stable in
BOTH implementer and Sonnet passes):** Flow A isolated Add persists
(control, no regression). Flow B rapid Add→Duplicate — both
persisted, no stale overwrite; Sonnet-measured intervals 1023 / 987
/ 858 ms (implementer: 1088 / 898 / 983 ms), all ≤5 s bound. Flow C
Duplicate-only persists, duplicate child rendered, content save
fired. Flow D settled-Add then Duplicate — Add persisted before
Duplicate (Sonnet waits 2692 / 3282 / 2745 ms, all ≥2.5 s), final
persistence contains both. Write-storm result: raw writes A/B/C/D =
18/18/18/19 every run (threshold ≤60), content writes 10/10/10/11
every run, ≥1 content-bearing save in every mutating flow, zero
starvation, zero bound console errors, zero product-action retries.

**Amendment 1 geometry ruling (final):** seeded emb-slide-a/b
heights 260/260; live natural-height-conformed value 153
(`max(28+22+content, 80)` via untouched `onNaturalHeight`);
persisted post-fix value 153 for both, deterministic in every run.
Only those two heights change; order/ids/types/frameIds/links/
isDeleted/x/y/width and all other heights byte-stable. 260 persisted
before this patch ONLY because autosave starvation froze the seeded
JSON; 153 is product-correct; the production fix did not alter any
geometry algorithm; the spec was corrected only to remove the stale
defect-frozen invariant.

**Carried characterization shifts (evidence of the fix, not
regressions; no diagnosis spec was edited; totals all unchanged):**
083 → `mixed-supersession-state`; 084 → `mixed-wire-state`; 080 →
`mixed-slide-persistence-state`; 076 →
`shared-reference-with-deletion-cascade` with
`duplicatePersistedToDatabase: true`; 073 →
`pointer-reachable-all-items`; 082 →
`unexpected-duplicate-persistence`; 081 label remains
`sidebar-only-duplicate` (its detector requires fresh independent
cloned rows) while its raw evidence now shows the duplicated frame
persisted-and-settled and shared-link count 2 — deep-clone
independence remains unresolved and out of PATCH-085 scope
(census #8 → PATCH-086).

**Gates at closure:** regression spec 2 passed dep / 1 passed
`--no-deps` / 2 skipped credential-off, three stable dependency runs
(twice over: implementer + Sonnet). Presentation spec 2 passed /
2 skipped ×2 with 260/153/153 stable. All 12 carried specs green;
the known auth-token-expiry incident during long batches was
recovered ONLY via sanctioned `--project=setup` refreshes + per-spec
reruns (no source edits; artifact remains untracked). Deterministic:
`git diff --check`, tsc, boundaries, slideOrder 7/1,
clonedPostMetadata 9/1, focused drawing 59/2, full Vitest 448/43,
verify, standalone build, production-import grep — all green.
Cleanup: all 25 bound prefixes zero + legacy `patch-077-persist-`
zero + umbrella `patch-064-harness-` sweep zero (boards/padlets/
canvasLines 0/0/0); no artifacts; port 3000 free.

**Exclusions preserved:** no debounce change, no broader save-path
change, no geometry-algorithm change, no presentation-mode change,
no deep-clone semantic change, no harness change, no Playwright
config change, no package/lockfile change, no instrumentation seam,
no auth material captured.
