# PATCH-077 — Slide-Action Persistence Boundary Diagnosis

**Status:** SUPERSEDED — closed 2026-07-18 (disposition in §0.B;
previously BLOCKED, stop record in §0.A). A deterministic
Rename-slide UI-state contradiction
entered scope during the FIRST required action, before any valid
persistence-boundary classification was possible. The §1 persistence
question is PRESERVED (not discarded) and resumes only after
PATCH-078 characterizes the rename contradiction. No implementation
file was ever created for this patch; the contract below is retained
unchanged as the historical record.
**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent,
read-only, uncommitted diff, explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit (bind, verify before editing):**
`eff21fc6eab97a45d05dd2a888e56c32d14e900b`
(`test(e2e): characterize duplicate-slide shared padlet link behavior (PATCH-076)`)

**Current governance HEAD (implementation start point):**
`b1cf263641913d17ac7b7aa4b52204204194926d`
(`docs(fable): close PATCH-076 and authorize PATCH-077`)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize slide-action persistence boundary (PATCH-077)`

---

## 0.A Blocked-stop record (Fable CTO, 2026-07-18)

**Preflight (all passed):** new-file absence at base, HEAD, and
worktree; 23/23 Git-blob fences matched at both the behavioral/source
base `eff21fc` and the governance HEAD; all base/current fenced blobs
identical; corrected `git rev-parse <commit>:<path>` verification
contract worked.

**Runtime stop (deterministic, real UI):** the implementer drove the
real Rename flow — row menu → `'Rename slide'` → real inline textbox
→ typed a deterministic replacement title → real Enter → rename mode
exited. Then: the presentation sidebar row title did NOT change
within the bound 60 s window (still `PATCH-064 Portrait`) while the
replacement title WAS visible elsewhere on the page — contradictory
title state after a single real action. STOP condition correctly
honored; draft spec deleted; artifacts removed; nothing committed.

**Stop classification (code-derived, Fable):** composite of TASK
options **B + E** — a stale slide-row **state** defect, NOT assumed
to be delayed persistence. Ownership path inspected read-only:

- `commitRename` (`PresentationPanel.tsx:117-121`) edits local
  `renameValue` and calls `onRenameSlide(id, value)`.
- `handleRenameSlide` (`DrawingLayout.tsx:1448-1454`) writes `name`
  onto the frame element and calls `excalidrawAPI.updateScene` — the
  LIVE scene receives the new title (the canvas frame label the fork
  renders from live scene is the "elsewhere" that showed it).
- The fork fires `onChange` → `handleChange`, but the React
  `elements` state refresh is **count-gated**
  (`DrawingLayout.tsx:1084-1090`: `setElements` only when the active
  element COUNT changes). Rename changes no count → `elements` state
  keeps the old name forever (the only other `setElements` site is
  the scene-import path `:1300`).
- The sidebar renders `frames: FrameSlide[]` derived from that stale
  `elements` state (`:1935-1946`) → the row title can NEVER update
  after a pure rename until a count-changing event, a scene import,
  or a reload. The 60 s window was irrelevant.
- `handleChange` still sets `dirtyDataRef` unconditionally
  (`:1155-1170`) → 2 s debounce → `performSave` — so the renamed
  title MAY well reach the persisted master scene while the sidebar
  stays stale. NOT assumed (PATCH-076 proved programmatic-updateScene
  persistence cannot be presumed); it is a bound PATCH-078
  observation.

Title representations identified in the real flow: (1) inline input
`renameValue`; (2) live scene frame `name`; (3) canvas-rendered frame
label (from live scene); (4) React `elements` state (stale); (5)
sidebar `frames` derivation (stale); (6) persisted master-scene frame
name (unknown); (7) slide thumbnail (derived — possibly stale).
(1)-(3) should equal (4)-(7) after commit; they provably do not.

**Governance ruling: OPTION B.** PATCH-077 is preserved unchanged as
a blocked historical record; **PATCH-078 — Rename-Slide
State-Ownership Diagnosis** (diagnosis-only) is authorized to
characterize the contradiction. The §1 persistence-boundary question
(do Rename/Add persist while Duplicate does not, or does the whole
menu-driven `updateScene` family fail to persist?) is explicitly
preserved and will be re-authorized after PATCH-078 lands — with the
rename step either characterized, separated from persistence, or
re-specified against the true state owner. No persistence fix and no
rename fix may be authorized before PATCH-078's diagnosis identifies
the true state owner.

## 0.B Disposition — SUPERSEDED (Fable CTO, 2026-07-18, ruled at PATCH-078 closure)

PATCH-078 landed (`e239880`, Sonnet PASS) and answered the Rename
branch of this patch's §1 question: Rename's programmatic
`updateScene` mutation DOES persist
(`count-gated-stale-sidebar-persisted`); only the in-session sidebar
model is stale. Therefore the "whole menu-driven `updateScene` family
never persists" hypothesis is FALSE, and this contract — which bound
Rename as the first of three sequenced actions, and whose fence table
predates the corrected blob-ID method's carried set — is stale in
both its action sequence and its framing.

**Ruling (TASK OPTION C): close as SUPERSEDED.** The unresolved
remainder of the §1 question is explicitly TRANSFERRED, not
discarded: a future narrower diagnosis-only patch (candidate for
PATCH-080, authored after PATCH-079 lands) must characterize the
persistence boundary for **`Add slide below`** and **`Duplicate
slide` only** (Rename removed — answered), asking specifically why
`handleDuplicateSlide`'s scene mutation does NOT reach the persisted
master scene (PATCH-076) when `handleRenameSlide`'s DOES
(PATCH-078). This spec's never-created path
`e2e/characterization/drawing-slide-persistence.spec.ts` remains
permanently prohibited; the successor patch must bind a fresh path.
No implementation ever existed for PATCH-077; nothing to revert.

**Successor authorized (2026-07-18, at PATCH-079 closure):**
**PATCH-080 — Add/Duplicate Slide Persistence Boundary Diagnosis**
(diagnosis-only, fresh path
`e2e/characterization/drawing-slide-add-dup-persistence.spec.ts`,
Rename and Remove prohibited). The residual open questions carried
there: Rename persists (PATCH-078) and its sidebar defect is fixed
(PATCH-079) — Rename is OUT of the uncertainty set; Add slide below
remains uncharacterized; Duplicate renders live but does not persist
(PATCH-076) and its removal deletes the source backing row; the
suppression mechanism is still unidentified.

---

## 0. Fresh census (from source snapshot `eff21fc`, superseding prior source censuses; implement from governance HEAD `b1cf263`)

| # | Candidate | Classification | User-visible | Deterministic repro | Characterized | Owner | Files (est.) | Design ruling needed | Diagnosis-first / fix-ready | Architecture risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Duplicate-slide production fix (deep clone) | defect (P3 family: duplicate lost on reload + deletion cascade destroys original's backing row) | yes — both consequences proven live by PATCH-076 | yes — landed spec `drawing-slide-duplication.spec.ts` reproduces end-to-end | fully characterized (PATCH-076, classification `unpersisted-duplicate-with-deletion-cascade`) | `DrawingLayout.tsx` (`handleDuplicateSlide`, autosave path, sync effect) + possibly the save/`onChange` boundary | unknown until persistence mechanism known | **semantics NOW RULED** (PATCH-076 §0.B.2: independent deep clone) but the persistence-suppression MECHANISM is undetermined — `handleChange` provably executes (the cascade fired) and the fork's `App.tsx:3382` invokes `onChange` for programmatic `updateScene`, yet nothing reaches the persisted row; owner of the suppression cannot be named from static reading | **diagnosis-first (SELECTED)** — bound the persistence boundary, then fix | medium until mechanism known | **1 (selected)** |
| 2 | New deterministic defect surfaced during PATCH-076 | (same as #1) | — | — | — | — | — | — | the never-persists finding IS the new defect; folded into #1, not a separate candidate | — | folded into 1 |
| 3 | Line-follow behavior | hardening / unclear | unconfirmed | not established | selection/hit-testing/rendering only | `lineBridge.ts` + `DrawingLayout.tsx` | unknown | yes — no attachment contract exists in code or docs (re-verified: `lineBridge.ts` still has zero attachment semantics at HEAD) | diagnosis-first, no live complaint | medium | 4 |
| 4 | AI images in presentation | diagnosis-blocked | unconfirmed | no — approved skip verbatim unchanged (`drawing-presentation.spec.ts:1357`), harness unchanged (fence `7a94d722…` matched at HEAD), no fixture capability has appeared | approved skip | presentation slide-renderer | unknown | n/a until a fixture exists | blocked — harness capability first | low | 5 |
| 5 | Overlap fallback | already-characterized intentional fallback | unconfirmed | fallback path exercised only when `frameId` missing; no evidence it is wrong | PATCH-064 census tag | `resolveSlidePadlets.ts` | unknown | possibly | diagnosis-first, low urgency | low | 6 |
| 6 | Uploaded-image storage cleanup | test-infrastructure gap | none | approved skip verbatim unchanged (`:1352`) | approved skip | harness | harness-only | n/a | test-infra only; never bundle with a product patch | none | 7 |
| 7 | Connections side-panel roadmap | **feature** | n/a | n/a | n/a | n/a | large | yes | feature, NOT stabilization — deferred; stabilization demonstrably incomplete (candidate #1 is a live proven P3-class defect pair); no roadmap decision taken here | high | deferred (feature) |

**Selection:** #1 under governance **OPTION B (diagnosis/characterization
only)**. Semantics are decided (deep clone, PATCH-076 §0.B.2); what
blocks a bounded fix is solely the undetermined persistence-suppression
mechanism. The decisive, fully-UI-drivable experiment: exercise the
OTHER menu-driven programmatic `updateScene` slide actions
(`'Rename slide'`, `'Add slide below'`) against the same persisted
master scene with the same settled-observation method PATCH-076
established, alongside a duplicate re-proof. The outcome partitions
the defect exactly: if rename/add persist but duplicate does not, the
suppression is duplicate-specific (owner: `handleDuplicateSlide`'s
interaction with the save path); if NONE persist, the entire
menu-driven `updateScene` family never autosaves (owner: the
`handleChange`→debounce→`performSave` boundary; a strictly larger
defect family that changes the fix's scope).

**Carried non-blocking follow-up (unchanged):** PATCH-074's stale
`harnessChanged: false` annotation — folds into the next patch that
touches `drawing-harness-cleanup.spec.ts`; PATCH-077 does not.

---

## 1. Diagnosis question (bind)

PATCH-076 proved the duplicated slide never reaches the persisted
master scene, while proving `handleChange` executes for the same
scene change family (the deletion cascade fired from it) and while
the fork demonstrably invokes `props.onChange` for programmatic
`updateScene` calls (`excalidraw_fork/.../App.tsx:3382`). Bound
question: **which menu-driven slide actions' scene mutations reach
the persisted master padlet row through the real autosave path, and
which do not?**

## 2. Diagnosis boundary (bind — observe, do NOT fix)

ONE new characterization spec, one active test, driving three real
per-row ⋮ menu actions on the PATCH-064 harness board and observing
the persisted master scene with the PATCH-076 settled-observation
method (poll ≤ 1 000 ms intervals across a ≥ 6 000 ms window per
action; the settled final read is the sole derivation basis; a lone
sleep-then-read is prohibited):

1. **Rename** — open the source row's menu, activate `'Rename slide'`,
   type a new deterministic name into the real inline input (the
   footer input with Enter-commit, `PresentationPanel.tsx:378-390`),
   press Enter, observe the sidebar shows the new name, then derive
   `renameSlidePersisted` from whether the settled persisted master
   scene's frame carries the new name.
2. **Add slide below** — activate `'Add slide below'` on a row,
   observe the new row appears in the sidebar, then derive
   `addSlideBelowPersisted` from whether a NEW frame id (absent from
   the pre-action persisted scene) appears in the settled persisted
   scene.
3. **Duplicate re-proof** — activate `'Duplicate slide'`, observe the
   duplicate row appears, then derive `duplicateSlidePersisted` from
   whether any second frame bearing the duplicated slide's title (or
   any new frame id vs the pre-action persisted set) appears in the
   settled persisted scene.

`'Remove slide'` is PROHIBITED in this spec (its cascade is already
fully characterized by PATCH-076; re-firing it adds destructive
surface without diagnostic value). Order the three actions so earlier
observations are not confounded (rename first, add second, duplicate
last is the bound order; each action's pre-state is re-read fresh).

**Annotation contract (bind — exactly FIVE literal fields):**

| Field | Definition |
|---|---|
| `renameSlidePersisted` | settled-read boolean per §2.1 |
| `addSlideBelowPersisted` | settled-read boolean per §2.2 |
| `duplicateSlidePersisted` | settled-read boolean per §2.3 |
| `classification` | derived, exactly one of: `duplicate-specific-persistence-suppression` (rename AND add true, duplicate false) \| `menu-scene-actions-never-persist` (all three false) \| `menu-actions-persist-duplicate-included` (all three true — contradicts PATCH-076; valid outcome, record faithfully) \| `mixed-persistence-boundary` (any other combination) |
| `prefix` | real fixture prefix (must start with `patch-064-harness-patch-077-persist-`) |

No sixth field. Supplementary raw evidence (per-action immediate vs
settled reads, frame id sets, window/interval values, ever-appeared
flags) is welcome in the payload. All five values observation-derived;
a contradictory outcome is a valid diagnosis, not a failure. Do not
improvise a fix either way.

## 3. Scope — allowed files (exactly ONE, new)

| File | Requirement |
|---|---|
| `e2e/characterization/drawing-slide-persistence.spec.ts` | NEW file (absence at base VERIFIED 2026-07-18 — confirm again before editing and before commit). One active test implementing §2. Uses the existing harness (`createDisposableDrawingBoard('patch-077-persist')` → prefix `patch-064-harness-patch-077-persist-`), `registerDrawingCleanup(test)` + local `finally` per convention. Local UI helpers may be written in-file mirroring `drawing-slide-duplication.spec.ts` idioms — do NOT edit that spec or the harness to share them. |

NO other file may change. Production source, the Excalidraw fork, the
harness, all existing specs, `playwright.config.ts`, and all `.fable5`
docs are PROHIBITED (governance files are CTO-only).

## 4. Immutable fences — 23 unique paths (full Git blob IDs at `eff21fc`, measured fresh)

```text
playwright.config.ts                                       5864c98436dde10809de67cb40c564c05e98ff6d
e2e/helpers/env.ts                                         9514723cde157f7ae6e6815d4c142a0f430a1292
components/presentation/PresentationPanel.tsx              02699748271241cacaca27fa93a8a78e7d8b2e0d
components/presentation/SlideThumbnail.tsx                 b26524ae5c02ac7d73622a02f05ecfb5145a20a8
components/presentation/FullscreenPresentation.tsx         655244b443c3869173996cb21a77f7d67c41c64b
components/presentation/slide-renderer/resolveSlidePadlets.ts  5dc7aa9868cf7b0514d66e2dfc11551b2d9085aa
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
components/collabboard/canvas/layouts/DrawingLayout.tsx    b470a888e4015e57b757ba0c57a041f1b7d8adb9
components/collabboard/menus/LineContextMenu.tsx           aaf16af230a76139377c4250f93485824000593e
lib/infra/presentation/slideOrder.ts                       e72c3de0b2ee0d2f35a4fb66af8951f35ab38058
lib/infra/presentation/slideOrder.test.ts                  2f1d79c5d2b5ff9c5c1e08b23da5f27008f25db8
lib/infra/drawing/lineBridge.ts                            f0f6a0d177c53bb0cab89b9fa1d7b5e3910a3c2d
lib/infra/drawing/presentationBridge.ts                    b9d976bda880e2fe1a28a4099fdc3eebe6f79b38
lib/infra/drawing/bridge.ts                                ed26c312610a386711f658662e82d29dd48c5890
lib/infra/collabboard/clonedPostMetadata.ts                7d6b6ee6e127a0db8161c09afdf31a54f44ac575
components/collabboard/canvas/hooks/useCanvasActions.ts    b470cc3fca2a1c10ac2b035c3d9c2ec1a9d7512e
e2e/characterization/drawingBridgeHarness.ts               7a94d7220df3d47f2fe6feefd2c8e31670af9f00
e2e/characterization/drawing-presentation.spec.ts          ddab83381605dbdcdda4d1a0cea3cafe010f55c5
e2e/characterization/drawing-line-bridge.spec.ts           7507b06af492bce7fca25a7a4daeee4400d428f3
e2e/characterization/drawing-duplication.spec.ts           87f88df19246eca5430db71987d573a1c7a5fa0b
e2e/characterization/drawing-harness-cleanup.spec.ts       5345c42d79e3c40286ba9902085977983a012e64
e2e/characterization/presentation-menu-pointer.spec.ts     50d68dff08730a231470ac48306702b02c3ca45b
e2e/characterization/drawing-slide-duplication.spec.ts     fc20ef8160417b6eeb59f4662ab89ceb1af5a167
```

New-file absence gate: `e2e/characterization/drawing-slide-persistence.spec.ts`
must NOT exist at the base tree, the current governance-HEAD tree, or the
working tree; no OTHER new file may appear.

**Fence semantics ruling (bind):**

- each hash in §4 is the full Git blob ID for that path in the tree of the
  behavioral/source base commit `eff21fc6eab97a45d05dd2a888e56c32d14e900b`
- verify each fence with
  `git rev-parse eff21fc6eab97a45d05dd2a888e56c32d14e900b:<path>`
  or an equivalent tree/blob query such as
  `git ls-tree eff21fc6eab97a45d05dd2a888e56c32d14e900b -- <path>`
- additionally verify the current implementation start point still carries
  the same blob using
  `git rev-parse b1cf263641913d17ac7b7aa4b52204204194926d:<path>`
  or `git rev-parse HEAD:<path>` when `HEAD` is that governance commit
- governance-only commits after the behavioral/source base do NOT invalidate
  PATCH-077 when all 23 fenced blobs remain identical
- working-tree byte SHA-1 values are NOT the fence identity for this patch;
  do NOT substitute `Get-FileHash`, raw file-byte SHA-1, or a working-tree
  `git hash-object` result for the bound Git blob ID unless the exact blob
  bytes are first read from Git without line-ending/filter drift

The 2026-07-18 false `0/23` stop was caused by the wrong identity check:
working-tree SHA-1/file-byte hashing was compared against Git blob IDs.
The fence table itself is correct.

Verify fences + absence before editing and before commit.

## 5. Expected totals (bind)

New spec: **2 passed with dependencies / 1 passed `--no-deps` / 2
skipped credential-off** (exactly one active test).
Carried (unchanged): PATCH-076 spec 2/1/2; menu-pointer 2/1/2;
PATCH-074 spec 2/1/2; presentation 2 passed / 2 approved skips;
duplication 2/1/2; line 4 passed / 4 skipped cred-off; helper 7/1;
sanitizer 9/1; focused drawing 59/2; full Vitest **448/43** (no unit
files change); `git diff --check`/tsc/boundaries/sequential
verify+build green; zero production imports of bridge/harness
modules; 23/23 fences.
Cleanup zeros across **ELEVEN** prefixes: the ten tracked prefixes
plus `patch-064-harness-patch-077-persist-`.

## 6. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline (inspect → attribute → stop only your own → verify
free); auth state only via `--project=setup`; no credential contents
anywhere; sequential `verify`/`build`, never under a dev server; never
commit generated artifacts (`test-results/`, `playwright-report/`,
JSON reporter output, scratch scripts).

## 7. Cleanup contract

`registerDrawingCleanup(test)` (shared owner) + local `finally`
defense. Rename/Add/Duplicate touch only the fixture's master-scene
content and create no padlet rows (expected) — but cleanup must
remain correct even if an action unexpectedly creates rows (the
board-scoped fixture delete covers them). Post-run prefix-scoped
residue checks must be zero for all ELEVEN prefixes. Test-timeout
kill → sweep and report per the PATCH-074 rule.

## 8. Stop conditions

STOP immediately, report, do not commit, if:

- the behavioral/source base commit is missing, any §4 base-tree blob differs,
  any §4 current-governance-HEAD blob differs from its base-tree blob, or the
  new-file absence check differs;
- ANY existing file must change (production, fork, harness, spec,
  config);
- a SECOND new file is required;
- `'Rename slide'`, `'Add slide below'`, or `'Duplicate slide'`
  cannot be driven deterministically through the real per-row ⋮ menu
  and real inline input;
- `'Remove slide'` would need to be exercised;
- any observation requires force click, `dispatchEvent`, coordinate
  workaround, direct callback invocation, direct product-state
  mutation, or a per-test timeout above 240 000 ms;
- persistence settlement cannot be observed deterministically;
- the observed combination requires a classification outside the §2
  enum (report, do not extend);
- a second distinct defect surfaces (report only, do not fix);
- ANY fix, guard, or production improvement seems "obvious" — this
  patch observes; the deep-clone fix is a later patch.

## 9. Review and commit flow (bind)

GPT-5.5 implements WITHOUT committing; Sonnet independently reviews
the uncommitted single-new-file diff (re-derives the hash, re-verifies
23/23 base-tree blob IDs + current-governance-HEAD equality + one-file
scope + absence gate, re-runs all §5 modes,
extracts the five-field annotation from a fresh JSON reporter run,
verifies every field is settled-read-derived and the classification
follows the bound enum); explicit PASS required; NO commit before
PASS; then commit with the bound message and push; Fable closes and
scopes the deep-clone fix patch from the findings.

**Bound commit message (verbatim):**
`test(e2e): characterize slide-action persistence boundary (PATCH-077)`

## 10. Required final report

New file + hash; all five annotation fields with observed values;
per-action immediate vs settled evidence; the derived classification
and what it implies for the deep-clone fix's ownership; all §5 gate
totals; 23-fence result + one-file scope proof; cleanup proof across
eleven prefixes; production-import grep; current implementation start
HEAD; bound behavioral/source base; commit hash + push status after PASS.
