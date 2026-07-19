# PATCH-086 — Duplicate Slide Deep-Clone Independence (MODEL A)

**Status:** **DONE** — landed as commit
`7dab2086bfde47178c0b50ce48aa74905ef0fc51`
(`fix(drawing): deep-clone linked rows on duplicate slide (PATCH-086)`),
independent read-only reviewer (Kepler) PASS after Amendment 1;
closure record in §13. Second production fix of the duplicate
family. Final scope: TWO production files (DrawingLayout clone
orchestration + the Amendment 1 CanvasClient strict-prop wiring) +
ONE new regression spec. NO harness change, NO fork change, NO
deletion-path redesign, NO error-path (useCanvasData) change, NO
frame-geometry change, NO presentation-mode change.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`ef2a8234d686b8cba5c7430132affbbb552f9a63`
(`fix(drawing): key embeddable move detection by element id (PATCH-085)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): deep-clone linked rows on duplicate slide (PATCH-086)`

---

## 0. Census at authoring (2026-07-19, from `ef2a823`)

| # | Candidate | Class | Status |
|---|---|---|---|
| 1 | **Duplicate deep-clone independence (fresh linked rows, PATCH-076 OPTION A / MODEL A)** | defect FIX | **SELECTED (this patch)** — persistence no longer blocks it (085); owner statically proven (§1) |
| 2 | Shared linked-padlet row semantics | defect | SUBSUMED by #1 — the shared row IS the defect |
| 3 | Duplicate deletion cascade (removing duplicate deletes original's row) | defect | SUBSUMED by #1 — fresh rows make the cascade structurally impossible; asserted by Flows G/H |
| 4 | Fresh cloned padlet-row creation | mechanism | the implementation of #1 (existing `sanitizeClonedPostMetadata` + `onAddPadlet` idiom) |
| 5 | Original/duplicate deletion isolation | assertion | acceptance criterion of #1 (Flows G/H) |
| 6 | PATCH-081 stale `sidebar-only-duplicate` classification | observation | resolves BY OBSERVATION after #1 (its fresh-row detector flips true); no spec edit; report the shift at closure |
| 7 | Silent Supabase resolved-error handling (P3 visibility) | defect | SEPARATE later patch — NOT required here: the drawing row-CREATE path (`addDrawingLayoutPadlet` → `createPost`) already THROWS on failure, a visible channel Flow K binds to. Do NOT bundle (§9) |
| 8 | Frame-geometry sidebar staleness | defect (uncharacterized) | after the duplicate family |
| 9 | Frame/sidebar position synchronization | defect (uncharacterized) | after the duplicate family |
| 10 | Line-follow behavior | hardening | deferred — still no attachment contract |
| 11 | Uploaded-image storage cleanup | hardening | deferred — clone copies `file_url` POINTER only (no new storage objects), so #1 adds no cleanup burden |
| 12 | AI images in presentation | feature | deferred (fixture-blocked, approved skip) |
| 13 | Overlap fallback | hardening | low, deferred |
| 14 | Connections side-panel planning | feature | deferred until stabilization ruled complete |
| 15 | Long-batch auth-token expiry (test infra) | environment | DEFERRED as a future infra patch; sanctioned per-spec `--project=setup` recovery documented; NOT a product defect; not bundled |
| 16 | New defect exposed by 085 | — | NONE observed (all gates green at closure; only the known auth incident) |

## 1. Exact defect (bind — statically proven at 085/086 census)

`handleDuplicateSlide` (`DrawingLayout.tsx` ~1426–1453 at base)
clones the frame and its children with fresh ELEMENT ids but the
`...child` spread PRESERVES `link` — the duplicate's embeddables
reference the SAME `padlet://<id>` container row as the source. No
row is created. Consequences (076/081/084/085 evidence):

1. duplicate and original render the same backing row — an edit to
   either's row content is visible in both (P3 surprise mutation);
2. `handleRemoveSlide` on the duplicate marks its embeddables
   `isDeleted` → `handleChange`'s deleted-embeddable branch
   (~1109–1124) fires `onDeletePadlet` on the SHARED id (container
   rows have no `metadata.parentId`, so the guard does not protect
   them) → the ORIGINAL's backing row is deleted while the original
   still links to it (the PATCH-076 deletion cascade, rows 8→7);
3. PATCH-081's fresh-row detector stays false
   (`settledSharedLinkCount: 2`) — its `sidebar-only-duplicate`
   label is stale evidence of this defect.

Persistence itself is healthy since 085 (duplicate frame + link-
sharing children persist and settle). The ONLY authorized repair is
giving the duplicate its own rows.

## 2. Bound product semantic — MODEL A (independent deep clone)

Confirmed against repository product intent: PATCH-076 §0.B.2
already ruled this BINDINGLY (OPTION A — independent deep clone;
canvas Ctrl+D defines duplicate-as-deep-clone, P6; reference
counting would be new unowned architecture; P3 forbids
edit-one-edits-both). MODEL B (shared reference) and MODEL C
(presentation-only) are REJECTED.

Meaning of "Duplicate slide" (bind):

- fresh frame ELEMENT id (already true);
- fresh child ELEMENT ids (already true);
- fresh linked CONTAINER ROW per linked child, cloned from the
  source row; the duplicate's scene child `link` points at the NEW
  row id;
- fresh CHILD-CARD rows for the source container's
  `metadata.childPadletIds`, cloned with `parentId` rewritten to the
  new container row; the new container's `childPadletIds` lists the
  fresh child ids IN SOURCE ORDER (one level deep — a child that is
  itself a container gets the shell-clone Ctrl+D semantic);
- independent future edits (Flows E/F);
- deleting the duplicate touches ONLY its cloned rows (Flow G);
  deleting the original leaves the duplicate intact (Flow H).

Bound data treatment for cloned rows (Ctrl+D precedent, P6 — the
`sanitizeClonedPostMetadata` idiom is the single sanctioned
sanitizer; do NOT write a second one):

| Data | Treatment |
|---|---|
| `content`, `title`, `type`, `color`, `width`/`height` | copied |
| metadata (display) | copied via `sanitizeClonedPostMetadata`, then `parentId`/`childPadletIds` explicitly REWIRED to the fresh ids |
| embedded metadata comments/votes/assignees | follow the metadata copy exactly as Ctrl+D does (copied); DETACHED comment stores keyed by padlet id remain with the SOURCE (not migrated) |
| uploads (`file_url`/`file_name`/`file_type`/`file_size`) | pointer copied; NO storage object duplication |
| timestamps | new (server defaults) |
| ownership/author | the inserting user (server default) |
| card order | source `childPadletIds` order preserved |
| position (`position_x/y`) | source values offset consistently with the scene `dx` where applicable; child rows keep source-relative placement |
| nested relations beyond one level | NOT cloned (shell semantic), bind and report |

## 3. Authorized fix (bind — smallest safe scope)

In `components/collabboard/canvas/layouts/DrawingLayout.tsx` ONLY
(starting blob `a92bb25cf3608f5a74d3b27fc779c6a1b4b0a300`):

- extend `handleDuplicateSlide` (and at most ONE new local async
  helper in the same file) to: (1) for each child with a
  `padlet://` link, CREATE the cloned container row and its cloned
  child-card rows via the EXISTING `onAddPadlet` prop +
  `sanitizeClonedPostMetadata` import (row creation BEFORE any
  scene mutation); (2) only after ALL rows are created, call
  `updateScene` with the duplicate elements whose `link` values
  point at the fresh row ids;
- transactional bind (Supabase has no client transaction): on ANY
  row-creation failure — the create path throws — do NOT modify the
  scene at all, best-effort delete any already-created clone rows
  via the existing `onDeletePadlet` prop, and surface ONE
  `console.error` in the existing DrawingLayout error style. The
  scene must never be half-mutated (Flow K, verified by inspection);
- the 085 landed hunks (element-keyed `lastEmbeddablePosRef`) must
  remain byte-intact.

PROHIBITED: touching `handleRemoveSlide`/the deleted-embeddable
branch or any deletion logic (isolation must come from fresh rows
alone); touching move detection, debounces, save scheduling, locks,
or the sync effect; modifying `useCanvasData`/`useCanvasActions`/
`clonedPostMetadata` (all fenced); any new save trigger or seam;
`page.route`-style test seams; harness edits; edits outside the
bounded region. If fresh-row cloning proves insufficient without
deletion-path changes, STOP and report (§9) — do NOT widen.

## 4. Regression matrix (bind) and the new spec

ONE new spec `e2e/characterization/drawing-duplicate-deep-clone.spec.ts`
(ONE active test, FOUR sequential disposable boards, existing
harness only, `registerDrawingCleanup(test)` at module scope,
per-board try/finally + zero-assertion, `test.setTimeout(420_000)`;
bound prefixes `patch-064-harness-patch-086-clone-a-` / `-b-` /
`-c-` / `-d-`):

- **Board A (Flows A–D)** — real Duplicate; ASSERT fresh frame id,
  fresh child element ids, fresh linked row id (persisted link ≠
  source row id; shared-link count for the source row returns to 1
  in the settled scene), cloned container row + cloned child rows
  exist with rewired `parentId`/`childPadletIds`, and source and
  duplicate initially render equivalent content (child card text
  visible in both).
- **Board B (Flows E–F)** — edit the duplicate's row content via the
  real UI; ASSERT source row/render unchanged; edit the source;
  ASSERT duplicate unchanged.
- **Board C (Flows G–H)** — real Remove slide on the duplicate;
  ASSERT the SOURCE row survives (exact-id poll, ≥2 s stable
  presence) and source still renders after reload; separately
  duplicate again, remove the ORIGINAL; ASSERT the duplicate's
  cloned rows survive and render after reload.
- **Board D (Flow I)** — rapid Add→Duplicate (≤5 s); ASSERT both
  persist settled (085 semantics carried) AND the duplicate's links
  are fresh.
- **Flow J** — per-board cleanup zero-assertions prove no orphan
  cloned rows escape the fixture (`assertDrawingFixtureCleanup`
  0/0/0 per board, cleanup owned by the local finally blocks).
- **Flow K (inspection, no browser flow)** — clone failure
  visibility: Sonnet verifies from the diff that rows are created
  before any scene mutation, that the failure path deletes created
  clones best-effort, surfaces a `console.error`, and never
  half-mutates the scene. No failure injection (no `page.route`).

Passive write counts per board (084/085 method): raw
`/rest/v1/padlets` writes must stay ≤60 (STOP threshold); expected
elevation over 085 levels is the +N row-create POSTs (bounded by
1 container + its child count per duplicate).

Settlement method: persisted polls ≤1000 ms cadence, window
≥20 000 ms, settled = final ≥6000 ms stable (085 method).

**Expected carried shifts (bound, non-blocking, totals unchanged):**
081 clone-shape — fresh-row detector flips TRUE
(`duplicateChildIdsAreFresh: true`, shared-link count 1); its
derived label leaves `sidebar-only-duplicate`. 076 slide-duplication
— deletion-cascade observation disappears (exact-row poll survives);
classification shifts again. 085 regression spec — write counts rise
by the row-create POSTs but stay ≪60; all assertions must remain
green. Report every shift at review and closure.

## 5. Allowed files (bind)

| File | Role | Starting blob at base `ef2a823` |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | production fix (§3 bounded region ONLY) | `a92bb25cf3608f5a74d3b27fc779c6a1b4b0a300` — **Amendment 1: resume from candidate blob `d47b2f00640df8f426d9fb1b30d142179cbeb870`** |
| `e2e/characterization/drawing-duplicate-deep-clone.spec.ts` | NEW regression spec | absent at base (absence gate) — **Amendment 1: resume from candidate blob `b618a8ce01b3836b2afffba77a66dd8fb99559e8`** |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | **Amendment 1 (§12) ONLY** — strict rewire prop wiring, bounded to ONE new handler + ONE prop pass, ≤20 added lines | `1c6864b46e1c5c9a52f9e771ee2e51793898ecd8` |

No fourth file (Amendment 1 expanded TWO → THREE after the
correctly-honored §9 stop; see §12). No unit-test file: the
orchestration is component-internal with no exported seam (085
precedent); the sanitizer's own tests are fenced and already green.

Absence gates: the new spec path absent at base and worktree before
implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-087 not started.

## 6. Immutable fences (bind — 33, Git blob IDs)

Verify each with `git rev-parse ef2a823…:<path>` and equality at the
current governance HEAD. Blob-ID method only (never raw file SHA-1 /
`Get-FileHash`). The 085 fence set, PLUS both 085 landed specs, PLUS
`clonedPostMetadata.test.ts` (the clone idiom's tests now guard this
patch's central dependency). `DrawingLayout.tsx` is NOT fenced (it
is the allowed production file).

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
```

## 7. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` /
2 skipped credential-off**, THREE sequential stable dependency runs
(any failed assertion is a STOP, not a flake to retry silently).
Carried: all 13 browser specs' pass/fail totals UNCHANGED (the 12
carried + the 085 regression spec; §4 classification/evidence
shifts are EXPECTED and must be reported); helper 7/1; sanitizer
9/1; focused drawing 59/2; full Vitest **448/43**; `git diff
--check`/tsc/boundaries/sequential verify+build green; zero
production imports of bridge/harness modules; 33/33 fences;
DrawingLayout.tsx diff strictly within the §3 bounded region
(Sonnet verifies hunk-by-hunk, including that the 085 hunks remain
byte-intact).
Cleanup zeros across **TWENTY-NINE** prefixes: the twenty-five
tracked prefixes plus this patch's four §4 prefixes.

## 8. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` (long-batch
token expiry is a KNOWN environmental incident — recover ONLY by
sanctioned refresh + per-spec reruns, report separately from
product results); no credential contents; passive network listeners
only (no `page.route`, no auth headers); sequential `verify`/
`build`, never under a dev server; never commit generated artifacts.

## 9. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (33/33), or any §5 absence gate differs;
- the fix requires ANY edit outside the §3 bounded region, a third
  file, a harness change, a fork change, or ANY deletion-path edit;
- Flow G or H fails after the bounded fix (deletion isolation does
  not follow from fresh rows alone) — report the evidence, do NOT
  patch the deletion branch;
- any flow's raw write count exceeds 60;
- the 085 regression spec regresses in ANY assertion;
- any carried spec's pass/fail totals change;
- the clone orchestration requires touching useCanvasData error
  handling (census #7 stays separate) or a new seam;
- the scene can be half-mutated on a row-creation failure;
- comments/votes/uploads demand storage duplication or a metadata
  treatment outside the §2 table — that is a product decision, not
  an implementation call.

## 10. Review and commit flow (bind)

Implementer delivers the uncommitted two-file diff + full report
(both blob IDs re-derived; three-run stability; carried totals;
deterministic totals; fence result; cleanup proof). Sonnet performs
the independent read-only review (re-derives everything, runs its
own three stability passes, audits Flow K by inspection, verifies
the 085 hunks byte-intact) and must return an explicit PASS before
the implementer commits with the bound message and pushes. CTO
closes with a fresh census afterward.

## 11. Required final report

Exact two changed paths + final blobs; full production diff; §2
semantic-table conformance; per-flow evidence (fresh ids, isolation
polls, equivalence checks, write counts); three-run stability;
carried totals + classification shifts (081/076/085 expected);
deterministic totals; 33-fence result + absence gates; cleanup
across twenty-nine prefixes; explicit confirmations (no deletion-
path edit, no debounce/move-detection edit, 085 hunks intact, no
seam, no auth capture); commit hash + push status after PASS.

## 12. Amendment 1 (CTO, 2026-07-19) — error-propagation scope for the parent rewire

**Trigger (correctly honored):** Sonnet returned FAIL twice on one
scope-level defect: the §3 contract requires NO half-mutated scene
on ANY failed required persistence step, and the parent
`childPadletIds` REWIRE is such a step — but the candidate's only
available channel, the `onUpdatePadlet` prop, RESOLVES VOID on
every failure (`useCanvasData.updateDrawingLayoutPadlet` 566–590:
a resolved Supabase error takes the silent-rollback branch, a
thrown error is caught/logged/rolled back — neither rejects to the
caller). The implementer correctly refused to widen scope (§9 stop
condition). The candidate is otherwise conformant: rows before
scene, reverse-order `Promise.allSettled` compensation over
`createdIds`, one `console.error`, source rows untouched, 085 hunks
intact, all green gates.

**CTO chain ruling (read-only derived):**
`DrawingLayout.onUpdatePadlet: (id, updates) => Promise<void>` ←
`CanvasClient.handleDrawingLayoutUpdatePadlet` (4948–4957) ←
`useCanvasData.updateDrawingLayoutPadlet` (566–590, the silent
point) → `canvas.updatePostFields` → `postsRepository.updateFieldsById`.
The repository ALREADY owns the visible-failure primitive:
`useCanvasData.updatePostFieldsOrThrow` (655–661, PATCH-051 idiom
family) throws on BOTH resolved and thrown failures, is exported
(739), and is already destructured by CanvasClient (358; used as
`updatePadletById` at 5941). **Classification B — candidate
incomplete; narrow callback-contract expansion required. Governance
OPTION A — amend scope.** No prerequisite patch: census #7 (the
BROAD silent-error family) remains a later dedicated patch;
PATCH-086 consumes the existing throwing channel AS-IS.

**Chosen error contract (bind — thrown-error, repo `*OrThrow`
convention; do NOT mix with a Result return):**

- `app/dashboard/canvas/[id]/CanvasClient.tsx` (starting blob
  `1c6864b46e1c5c9a52f9e771ee2e51793898ecd8`): add ONE handler
  `handleDrawingLayoutUpdatePadletStrict(id, updates)` that
  (1) normalizes exactly as `handleDrawingLayoutUpdatePadlet` does,
  (2) `await updatePostFieldsOrThrow(id, normalizedUpdates)` — NO
  catch-and-continue, failures propagate to the caller,
  (3) ONLY AFTER the confirmed success applies the local
  `setPadlets` merge (same shape as the optimistic path's merge —
  but post-confirmation, so NO rollback branch); plus ONE prop pass
  `onUpdatePadletStrict={handleDrawingLayoutUpdatePadletStrict}` at
  the DrawingLayout mount. **≤20 added lines total, NO other
  CanvasClient change** (bounded exception to the over-ceiling
  file-growth rule, acknowledged strangler debt).
- `DrawingLayout.tsx` (resume from candidate `d47b2f0…`): add the
  REQUIRED prop `onUpdatePadletStrict: (id: string, updates:
  Partial<Padlet>) => Promise<void>` to BOTH prop-type blocks +
  destructuring, and switch ONLY the clone rewire call in
  `cloneLinkedRowsForDuplicateSlide` from `onUpdatePadlet` to
  `onUpdatePadletStrict`. NO fallback to `onUpdatePadlet` for the
  rewire; every other call site keeps `onUpdatePadlet` unchanged.
- `useCanvasData.ts`, `posts.ts`, `postsRepository.ts`: UNTOUCHED
  (all remain fenced; `updatePostFieldsOrThrow` is consumed as-is).

**Failure/compensation semantics (bind, unchanged in spirit, now
truthful):** all row creations AND the parent rewire must be
confirmed (throwing channels) BEFORE `updateScene`; any failure →
no scene mutation at all, reverse-order best-effort deletes of the
rows created by THIS attempt, exactly ONE `console.error`
(`'Failed to duplicate drawing slide:'`), source rows never
mutated.

**Regression additions (bind):** the new spec (resume from
candidate `b618a8c…`) adds the SMALLEST additive passive-wire
assertion: a 2xx `/rest/v1/padlets` PATCH carrying the cloned
container id AND the rewired `childPadletIds` is observed before
settlement (positive-path rewire confirmation). The negative path
(rewire failure → no scene mutation, compensation, one error)
remains Flow K BY INSPECTION — no failure injection, no
`page.route`, no instrumentation seam. Sonnet additionally verifies
by inspection: the rewire call site has no catch-and-continue; the
existing `onUpdatePadlet` callers are byte-unchanged; the 085 hunks
remain byte-intact.

**Effective contract changes:** allowed files 2 → 3 (§5); fences
UNCHANGED at 33/33 (CanvasClient was never fenced; the fenced
update-path files stay fenced AND untouched); §7 carried totals now
also require the amended spec's rewire-confirmation assertion
green; §9 gains: any CanvasClient edit beyond the bounded handler +
prop pass, any catch around the strict rewire call, or any
`useCanvasData`/`posts.ts`/`postsRepository.ts` modification = STOP.
Commit message UNCHANGED:
`fix(drawing): deep-clone linked rows on duplicate slide (PATCH-086)`.
Sonnet reviews ALL THREE files; NO commit before explicit PASS.

**Resumption:** implementation resumes FROM the current candidate
blobs (`d47b2f0…` production, `b618a8c…` spec — ACCEPTED as the
starting point, not reverted). Remaining work: the §12 strict-prop
wiring + rewire call-site switch + spec assertion, then rerun:
focused 086 gates (2/1/2 + three-run stability), carried 13-spec
totals, deterministic closeout, cleanup across twenty-nine
prefixes, then Sonnet review of all three files.

## 13. Closure record (CTO, 2026-07-19)

**Landed:** commit `7dab2086bfde47178c0b50ce48aa74905ef0fc51`
(`fix(drawing): deep-clone linked rows on duplicate slide (PATCH-086)`),
HEAD == origin/main at closure. Three files, exact blobs:
`app/dashboard/canvas/[id]/CanvasClient.tsx`
`a028dd65c1935068a7206a67db869a8f5345011a` (+13 lines);
`components/collabboard/canvas/layouts/DrawingLayout.tsx`
`a7b81a1915cbe570cb57850c17088e30d4daf81c`;
`e2e/characterization/drawing-duplicate-deep-clone.spec.ts`
`0644447cc2bea1b21c9b47ba03b7d69de2617fb7` (804 lines).
**Independent review history:** two FAILs on the pre-Amendment
candidate — the parent-rewire failure could not propagate through
the void `onUpdatePadlet` callback; Amendment 1 (§12) expanded
scope narrowly to CanvasClient (strict throwing callback); final
independent read-only review (Kepler): **PASS**.

**Final product semantic (MODEL A, delivered):** Duplicate slide
now creates a fresh frame element id, fresh child element ids, a
fresh cloned container row, fresh cloned child-card rows, rewired
`parentId`/`childPadletIds`, preserved child order, equivalent
initial visible content, independent future edits, and deletion
isolation in BOTH directions. Metadata per the bound §2 table:
visible content + display metadata copied
(`sanitizeClonedPostMetadata`), upload/file POINTERS copied (no
storage-object duplication), comments not cloned (detached stores
stay with the source), fresh timestamps, inserting user owns the
clones, excluded relations remain source-attached.

**Exact production changes:** CanvasClient — ONE strict handler
(`handleDrawingLayoutUpdatePadletStrict`: normalizes exactly like
the non-strict path, `await updatePostFieldsOrThrow` with NO
catch-and-continue, local `setPadlets` merge only AFTER confirmed
success) + the `onUpdatePadletStrict` prop pass. DrawingLayout —
clone orchestration creates ALL rows before scene mutation; the
parent rewire uses the STRICT callback and must confirm before
`updateScene`; failure enters compensation (reverse creation order,
only this attempt's rows), exactly ONE visible `console.error`,
source rows untouched, no half-created duplicate ever enters the
scene. Ordinary `onUpdatePadlet` callers byte-unchanged. UNTOUCHED:
`useCanvasData.ts`, `posts.ts`, `postsRepository.ts`, all deletion
production paths. **PATCH-085 preserved:** element-keyed move
tracking intact, persistence target still padlet id, debounce and
save scheduling unchanged, no write-storm regression, duplicate
persistence healthy.

**Flow results (three-run stable):** A fresh frame id ✓; B fresh
child element ids ✓; C fresh cloned container + child-card row ids,
scene links point at cloned rows ✓; D initial equivalence, order
preserved, metadata per table ✓; E duplicate edit does not alter
source ✓; F source edit does not alter duplicate ✓; G deleting the
duplicate leaves the source intact and reloadable ✓; H deleting the
source leaves the duplicate intact and reloadable ✓; I rapid
Add→Duplicate persists both with fresh linked rows ✓; J no orphan
cloned rows after cleanup ✓; K failure path confirmed by
inspection: strict rewire failure propagates, no scene mutation
before confirmed persistence, narrow compensation, one visible
error, source untouched ✓. **Passive wire evidence:** a 2xx
`/rest/v1/padlets` PATCH targeting/containing the cloned container
id, payload carrying `childPadletIds` with the fresh cloned
child-row ids, observed BEFORE settlement.

**Gates at closure:** focused — dependency 2 passed / `--no-deps`
1 passed / credential-off 2 skipped; JSON reporter expected 2,
unexpected 0, flaky 0; three stable dependency runs. Carried — all
13 specs green (known auth expiry recovered ONLY via sanctioned
setup refresh; affected specs rerun individually, `--no-deps` where
required; no source edits; no totals changed). Deterministic —
diff-check, tsc, boundaries, focused Vitest, full **448/43**,
verify, standalone build all green. Cleanup — all 29 tracked
prefixes zero (boards/padlets/canvasLines 0), cloned child rows 0,
no orphan cloned containers, no source rows deleted, no artifacts,
port 3000 free.

**Exclusions preserved:** no deletion-path production changes, no
debounce changes, no broader save-path changes, no geometry or
presentation changes, no storage-object duplication, no comment
cloning, no auth-material capture, no instrumentation seam, no
harness changes, no Playwright config changes, no package/lockfile
changes.
