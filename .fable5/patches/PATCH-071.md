# PATCH-071 - Sanitize Membership Metadata on Drawing-Canvas Clone (staged, repro-first)

**Status:** AUTHORIZED — Stage 0 (defect reproduction, test-only). Stage 1
(the production fix) is pre-authorized CONTINGENT on Stage 0 confirming the
censused defect exactly (§4); any divergence is a STOP, not latitude.

**Base commit (bind, verify before editing):**
`115a977be1797ce01811f7ed13beec3c682331cd`
(`fix(presentation): restore fullscreen native raster (PATCH-070)`)

**Bound commit messages (verbatim):**

- Stage 0: `test(drawing): characterize clone membership corruption (PATCH-071 Stage 0)`
- Stage 1: `fix(drawing): sanitize membership metadata on canvas clone (PATCH-071)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before each stage's commit).
**Closure:** Fable (CTO) after each stage lands.

---

## 1. Purpose — exactly one defect

**PATCH-062 RC-2, drawing-canvas surface:** the Drawing canvas clone
actions copy membership metadata verbatim into the new post row. Fresh
census at base `115a977`:

- `useCanvasActions.ts:110-126` (`handleDuplicatePadlet`) and `:178-198`
  (`handlePastePadlet`) both pass `metadata: <source>.metadata` UNCHANGED
  into `onAddPadlet`.
- A cloned CONTAINER therefore keeps the original's
  `metadata.childPadletIds`: the copy renders the ORIGINAL's children via
  the membership union (RC-3 sites), editing "the copy's" child edits the
  original's, and the DB holds two containers claiming one child while the
  child's `parentId` still points at the original — silent cross-link
  corruption (P3 family).
- The product already has the correct rule THREE times over: the library
  path sanitizer `sanitizeLibraryMetadata`
  (`RowColumnContainerCard.tsx:27-37`) strips exactly `parentId`,
  `childPadletIds`, `sectionId`, `sectionPosition`, `position_in_timeline`,
  `wallPosition` before creating a post from existing data.
- Consumer census: `useCanvasActions` is imported ONLY by
  `DrawingLayout.tsx` (`:27`); the actions fire ONLY from the card context
  menu (`DrawingLayout.tsx:3076-3079` → `CanvasContextMenu.tsx:203-220`:
  labeled items `Cut`/`Copy`/`Paste` (disabled without clipboard)/
  `Duplicate`). The menu opens via `handleContextMenu` (`:1513-1519`),
  reachable ONLY by a contextmenu event whose target lies inside the
  card's `[data-post-menu-trigger="true"]` element (`:254-259`) — the
  hover pencil button (`:414-430`). Only ROOT non-drawing posts have cards
  (children and drawing-master posts get no embeddable), so the reachable
  clone surface is root posts; the container-clone corruption is the
  user-visible defect.
- Not in scope (recorded, separate roots): Excalidraw-native element
  duplication copying `padlet://` links (RC-1, element-level, fork-adjacent);
  resolver duplicate-link dedupe (downstream of RC-1); membership-union
  consolidation (RC-3, P6 cleanup); comment-store contents riding the
  metadata copy (fenced duality — the fix must NOT touch comment keys).

## 2. Stage 0 — reproduce the defect (test-only, own commit)

**Sole allowed file (NEW):**
`e2e/characterization/drawing-duplication.spec.ts`

Reuse the existing fenced harness UNMODIFIED
(`drawingBridgeHarness.ts`: `createDrawingFixture`/`seedDrawingContainers`/
`seedLineScene`/`openDrawingBoard`/cleanup + assert helpers; cleanup covers
clone rows via the board-id delete and the title-prefix assert — clones
copy the prefixed title). If any harness change appears necessary → STOP.

Bound observables (credentialed; credential-off must skip cleanly):

- O1 — open the seeded board; cards visible. Dispatch a contextmenu on
  Container A's card menu-trigger
  (`[data-padlet-id="<containerA>"] [data-post-menu-trigger="true"]`);
  assert the app context menu opens (menu item `Duplicate` visible).
- O2 — click `Duplicate`; assert a NEW post row appears (service-role
  fetch by board id): title copies the original (harness prefix retained),
  and `metadata.childPadletIds` EQUALS the original's `[childA]`
  (defect frozen), while child A's own `parentId` still names the
  ORIGINAL container.
- O3 — `Copy` on Container B's card, then `Paste` from a card menu;
  assert the pasted row's `metadata.childPadletIds` equals B's original
  list (same defect through the clipboard path).
- O4 — record (annotation, not hard assertion) whether each copy's card
  visibly renders the original's child content on the drawing canvas.
- O5 — original rows byte-stable: containers A/B and children A/B
  metadata unchanged by the clone operations.
- Structured annotation `patch-071-stage0-clone-census` carrying O1–O5
  raw evidence. All existing specs stay untouched and green.

**Stage 0 stop conditions:** the menu cannot be opened deterministically
from the bound trigger; `Duplicate`/`Paste` creates no row; the created
row's metadata does NOT copy `childPadletIds` verbatim (contradicts the
census); any second defect surfaces; any harness/production edit appears
necessary.

## 3. Stage 1 — the fix (contingent, own commit)

**Accepted design — sanitize at the clone boundary, precedent rule:**

- NEW pure helper `lib/infra/collabboard/clonedPostMetadata.ts`
  (P7-neutral naming; sibling of the PATCH-063 `postTitle.ts` precedent):
  `sanitizeClonedPostMetadata(metadata)` — nullish input returned
  UNCHANGED (preserves today's write shape for metadata-less posts);
  object input returns a NEW object (no input mutation) with EXACTLY the
  six precedent keys removed: `parentId`, `childPadletIds`, `sectionId`,
  `sectionPosition`, `position_in_timeline`, `wallPosition`; every other
  key preserved verbatim (colors, comments, flags, render inputs).
- NEW `lib/infra/collabboard/clonedPostMetadata.test.ts` (vitest include
  covers `lib/infra/**` — measured): ≥6 tests — six-key strip, unknown-key
  preservation, nullish passthrough (undefined and null), input
  non-mutation, empty-object identity of behavior.
- `useCanvasActions.ts`: exactly two call-site edits + one import —
  `metadata: sanitizeClonedPostMetadata(padlet.metadata)` in
  `handleDuplicatePadlet`, `metadata: sanitizeClonedPostMetadata(
  clipboard.metadata)` in `handlePastePadlet`. Nothing else in the hook
  changes (cut/copy/reorder/PNG/positions byte-identical).
- Spec evolves: O2/O3 defect assertions FLIP (cloned rows carry NONE of
  the six keys; a survivor key — the harness marker — remains, proving
  preservation); O5 originals-stable assertions stay; the copy renders as
  an EMPTY container while the original still renders its child;
  annotation evolves to `patch-071-clone-membership-fix` (records: RC-2
  origin, fixed rows' metadata key census, originals-stable proof,
  survivor-key proof).

**Rejected alternatives:** deep-copying children (a feature, not this
defect); sanitizing inside `onAddPadlet`/the create command (alters every
legitimate metadata write, far too broad); consolidating the three
existing sanitizer sites onto the new helper (P6 cleanup with UI blast
radius — queued separately; `sanitizeLibraryMetadata` and the library
drop paths stay byte-untouched); touching RC-1 element-level duplication
or resolver dedupe; adding keyboard shortcuts (none exist for these
actions — menu only); stripping or rewriting comment keys (fenced
duality).

## 4. Stage gate between 0 and 1

Stage 1 may begin ONLY if Stage 0's committed annotation shows: menu
reachable from the bound trigger AND both clone paths copy
`childPadletIds` verbatim AND originals stable. Anything else → STOP and
report for a named amendment.

## 5. Scope — allowed files

| Stage | File | Pre-edit hash | Role |
|---|---|---|---|
| 0 | `e2e/characterization/drawing-duplication.spec.ts` | NEW (must not exist at base) | repro spec |
| 1 | `lib/infra/collabboard/clonedPostMetadata.ts` | NEW | pure sanitizer |
| 1 | `lib/infra/collabboard/clonedPostMetadata.test.ts` | NEW | bound unit tests |
| 1 | `components/collabboard/canvas/hooks/useCanvasActions.ts` | `ee33f91794e48c479a1062e5a0aceaec612d1f63` | two call-site edits + import |
| 1 | `e2e/characterization/drawing-duplication.spec.ts` | re-bound to committed Stage-0 hash | assertion flip |

No other file. `DrawingLayout.tsx`, `CanvasContextMenu.tsx`,
`RowColumnContainerCard.tsx`, the harness, all presentation/line files,
fork, schema, config, dependencies: FENCED (§7).

## 6. Baselines (bind; verified fresh at `115a977` this session)

Focused Vitest 59 passed / 2 files; full 432 passed / 41 files (Stage 1:
full becomes 432+N passed / 42 files, N = new helper tests, N ≥ 6,
declared in the report and re-derived by the reviewer; the historic
two-file focused gate stays 59/2, plus a new gate
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` = N
passed). Playwright: setup 1; line 4; presentation 2 passed / 2 approved
skips; credential-off 4+4 skipped; the NEW spec declares its own counts
(credentialed all-passed, credential-off all-skipped) in each report.
Cleanup zeros (boards=0, padlets=0, canvasLines=0, harness-scoped
service-role query). Zero production imports of test-only bridge modules.
`tsc`, boundaries, sequential `verify`/`build` green.

## 7. Immutable fences — 48 unique paths

The PATCH-070 Stage-1 42-path set carried verbatim, PLUS the four
PATCH-070 files re-frozen at their committed hashes and two new fences:

```
components/presentation/slide-renderer/planSlideComposition.ts 2d3b0dc3c46cdc03fde5aa0b8a949cd94e5d0d89
lib/infra/drawing/presentationBridge.test.ts 8a503122ee72316a89b2add308ec2ea0189dc7eb
components/presentation/runtime-slide/RuntimeSlideRenderer.tsx a407cccc230ca74a36a443b5f701767856754230
e2e/characterization/drawing-presentation.spec.ts 19d6e86495dc06f677d6efd88a59e6e07566f02c
components/collabboard/canvas/ui/CanvasContextMenu.tsx 904f97ba2f264d87a8d073b7b69fcda346da50b5
components/collabboard/RowColumnContainerCard.tsx e58167d51324ef9bf9d928251ad91d60756616a7
```

All 48 verified 48/48 at base `115a977` during authoring. Verify before
editing and before each commit.

## 8. Environment contract (binding, unchanged from PATCH-070 §9)

Self-started `npm run dev` + explicit `PW_BASE_URL` for all diagnostic
Playwright; port discipline (inspect → attribute → stop only your own →
verify free); `e2e/.auth/user.json` only via `--project=setup`; no
credential/cookie contents anywhere; sequential `verify`/`build`, never
under a running dev server; never commit generated artifacts.

## 9. Stop conditions (both stages, additional to §2's)

- base commit, any authorized pre-edit hash, or any of the 48 fences
  differs at any point;
- the Stage-0 spec file already exists at base;
- Stage 1 attempted before Stage 0's commit + Sonnet PASS + §4 gate;
- any production file beyond `useCanvasActions.ts` appears necessary;
- the two call-site edits do not suffice (e.g., a consumer depends on the
  copied membership keys);
- any existing test must be weakened;
- comment-store keys would be touched;
- cleanup becomes nondeterministic or a real user board would be touched;
- a second defect would ride along (incl. RC-1 element duplication).

## 10. Review and commit flow (bind)

GPT-5.5 implements each stage WITHOUT committing; Sonnet independently
reviews the uncommitted diff (re-runs gates, re-derives hashes, extracts
annotations from a JSON reporter run); explicit PASS per stage; commit
with the stage's bound message; push; Fable closes in CURRENT_TASK.md.

## 11. Rollback

Each stage is one commit; revert restores the prior state. Stage 0 is
test-only. Stage 1's revert restores verbatim-copy clone behavior with no
data impact (no schema, no migration; rows created during tests are
harness-cleaned).

## 12. Required final report (per stage)

Files + pre/post hashes; Stage 0: O1–O5 evidence + annotation verbatim;
Stage 1: unit N + full totals, flipped assertions, fixed-row metadata key
census, originals-stable proof; all gate totals; cleanup proof; 48-fence
result; production-import grep; commit hash + push status after PASS.
