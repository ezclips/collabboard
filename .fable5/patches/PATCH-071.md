# PATCH-071 - Sanitize Membership Metadata on Drawing-Canvas Clone (staged, repro-first)

**Status:** Stage 0 **DONE** (commit
`af04779b9a8864d5bb9b75eb1f14d7888f7861d9`, Sonnet PASS, no required
changes, **Stage 1 census CONFIRMED**). Stage 1 **ACTIVE — implementation
authorized** under §0.1 Amendment 1 (rebased base, exact contract, exact
test matrix). The §4 contingency is satisfied; the design is UNCHANGED
from §3.

**Base commit (bind, verify before editing):**
Stage 0 base was `115a977…`. **Stage 1 base (bind):**
`af04779b9a8864d5bb9b75eb1f14d7888f7861d9`
(`test(drawing): characterize clone membership corruption (PATCH-071 Stage 0)`)

**Bound commit messages (verbatim):**

- Stage 0: `test(drawing): characterize clone membership corruption (PATCH-071 Stage 0)`
- Stage 1: `fix(drawing): sanitize membership metadata on canvas clone (PATCH-071)`

**Implementer:** GPT-5.5. **Reviewer:** Sonnet (independent, read-only,
uncommitted diff, explicit PASS required before each stage's commit).
**Closure:** Fable (CTO) after each stage lands.

---

## 0.1 Amendment 1 (2026-07-16) — Stage 0 closed; Stage 1 ACTIVE

### 0.1.1 Stage 0 result (DONE, commit `af04779b9a8864d5bb9b75eb1f14d7888f7861d9`)

Bound Stage-0 message used verbatim; sole file
`e2e/characterization/drawing-duplication.spec.ts` at
`e786e91743681cfe7b49fcf0fbac28691eeaf8d0`; Sonnet PASS, no required
changes, no governance amendment required. Evidence: exactly one active
characterization test; real Duplicate AND Copy/Paste UI paths reachable
(hover card → right-click the Edit pencil `data-post-menu-trigger` →
labeled items `Duplicate`/`Copy`/`Paste`); clone identification DB-driven
(title match excluding known ids); Duplicate → exactly one persisted
clone; Copy alone → none; Paste → exactly one; originals byte-stable;
ordinary metadata preserved; ALL SIX membership keys copied verbatim in
BOTH paths (`parentId`, `childPadletIds` (array preserved), `sectionId`,
`sectionPosition`, `position_in_timeline`, `wallPosition` (object
preserved)); child rows still point at the ORIGINAL containers;
classification `clone-membership-metadata-copied-verbatim`; command layer
confirmed as fix owner; no second defect or production owner surfaced.
**ParentId caveat (recorded, non-blocking):** the seeded `parentId` is
intentionally falsy (`""`) because a truthy value classifies the row as a
child and removes the root-card trigger; Stage 0 claims no
truthy-parentId UI coverage; non-blocking because §0.1.4 strips the key
regardless of truthiness. Stage-0 gates all green (setup 1; duplication
2-with-deps / 1-no-deps; line 4; presentation 2+2; cred-off 2/4/4;
focused 59/2; full 432/41; tsc/boundaries/verify/build; cleanup zeros
incl. PATCH-071-specific; 48/48 fences; zero prod imports; repo
clean/synced).

### 0.1.2 Stage 1 activation and rebased bindings (at base `af04779`)

The §4 gate is SATISFIED; Stage 1 is ACTIVE. Design unchanged from §3 —
no redesign, no scope growth, no second defect. Fresh bindings, all
measured at `af04779` this session:

| File | Hash / check at `af04779` | Stage 1 role |
|---|---|---|
| `components/collabboard/canvas/hooks/useCanvasActions.ts` | `ee33f91794e48c479a1062e5a0aceaec612d1f63` (unchanged) | exactly two call-site edits + one import |
| `e2e/characterization/drawing-duplication.spec.ts` | `e786e91743681cfe7b49fcf0fbac28691eeaf8d0` | fixed-state assertion flip |
| `lib/infra/collabboard/clonedPostMetadata.ts` | ABSENT (verified) | NEW pure sanitizer |
| `lib/infra/collabboard/clonedPostMetadata.test.ts` | ABSENT (verified) | NEW bound unit tests |

No fifth file. The committed Stage-0 spec remains AUTHORIZED-CHANGE (it
carries the flip), so the immutable-fence set is UNCHANGED: **48 unique
paths, re-verified 48/48 at `af04779`**. Prohibitions restated:
`DrawingLayout.tsx`, `CanvasContextMenu.tsx`, `RowColumnContainerCard.tsx`,
`drawingBridgeHarness.ts`, resolver/schema/comment files,
package/config/lock files, and `.fable5/**` during implementation.

### 0.1.3 Exact sanitizer contract (binds §3, made precise)

`sanitizeClonedPostMetadata(metadata)`:

- accepts possibly-nullish metadata; `undefined` and `null` are returned
  UNCHANGED (same value);
- non-null object input returns a NEW SHALLOW object: every own
  enumerable key copied by reference EXCEPT exactly the six bound keys,
  which are removed REGARDLESS OF VALUE (must hold for `""`, `null`,
  `false`, `0`, and truthy values alike): `parentId`, `childPadletIds`,
  `sectionId`, `sectionPosition`, `position_in_timeline`, `wallPosition`;
- unrelated nested objects keep their REFERENCES (no deep clone, no
  recursion, no JSON round-trip);
- the source object is never mutated;
- no other key is removed or altered (comment keys, `zIndex`,
  style/layout keys, `padlet://` links, ids all pass through untouched);
- the six-key list follows the `sanitizeLibraryMetadata` precedent;
  `sanitizeLibraryMetadata` itself is NOT modified (fenced file).

Rejected (restated): JSON-serialization or deep cloning, schema
validation, allowlisting, comment-key deletion, zIndex/style deletion,
link changes, id changes, graph reconstruction, resolver dedupe,
section/timeline/wall relayout.

### 0.1.4 Exact call-site edits (useCanvasActions.ts)

Exactly two production edits plus the import:

1. `handleDuplicatePadlet`: `metadata: padlet.metadata` →
   `metadata: sanitizeClonedPostMetadata(padlet.metadata)`.
2. `handlePastePadlet`: `metadata: clipboard.metadata` →
   `metadata: sanitizeClonedPostMetadata(clipboard.metadata)`.

Everything else in the hook byte-identical: no refactor, no renaming, no
toast/UI/layout changes, no clipboard redesign, no dependency-array
changes beyond what the import mechanically requires (none expected —
the sanitizer is a module-level pure import, not a hook value).

### 0.1.5 Bound unit-test matrix (exact N = 9)

`clonedPostMetadata.test.ts` contains EXACTLY these nine `it` blocks:

1. returns `undefined` unchanged;
2. returns `null` unchanged;
3. returns a NEW empty object for an empty-object input (result not the
   same reference);
4. strips all six membership keys together (truthy values);
5. strips each of the six keys regardless of value — table-driven over
   the falsy values `""`, `null`, `false`, `0` and one truthy value per
   key;
6. preserves ordinary metadata keys verbatim (incl. a comment-like key
   and a `zIndex` key passing through untouched);
7. preserves unrelated nested object REFERENCES (same-identity
   assertion — proves no deep clone);
8. does not mutate the source object (snapshot/deep-freeze proof);
9. removes no keys beyond the bound six (key-set equality on a mixed
   input).

**Updated bound totals:** new-helper gate
`npx vitest run lib/infra/collabboard/clonedPostMetadata.test.ts` = 9
passed / 1 file; historic focused gate unchanged 59/2; full Vitest
becomes **441 passed / 42 files** (432+9, 41+1 — exact, no longer "N ≥ 6").

### 0.1.6 E2E fixed-state flip (both Duplicate and Paste)

The Stage-0 spec keeps its real UI trigger machinery UNWEAKENED (hover →
pencil right-click → labeled items) and flips the metadata expectations:

- clone ids remain new; originals remain byte-stable; child rows still
  point at the ORIGINAL containers;
- ordinary metadata preserved (`patch071OrdinaryMetadata`, `topStrip`,
  harness marker) and visible content preserved (title-based clone
  discovery keeps working);
- ALL SIX membership keys ABSENT from both persisted clone rows
  (key-presence assertions, not just value checks);
- no graph repair attempted, no comment-store key in scope;
- classification flips to `clone-membership-metadata-sanitized` with
  `stage1Status: 'fixed'`; annotation evolves to
  `patch-071-clone-membership-fix` (records: Stage-0 census reference,
  both clone snapshots, absent-key census, originals-stable proof,
  survivor-key proof, trigger paths).

### 0.1.7 Stage 1 stop conditions (additional to §9)

STOP if: Stage 0 behavior no longer reproduces at `af04779` before the
fix is applied; any of the six keys differs from the confirmed census; a
seventh key is proposed for removal; a comment-store key enters scope;
more than two production call sites need edits; a fifth file is
required; sanitizer ownership moves outside the command layer;
DrawingLayout/CanvasContextMenu need changes; resolver or schema changes
become necessary; ordinary metadata cannot remain preserved; child
pointers would be rewritten; `padlet://` links would change; the e2e
cannot prove persisted clone metadata; any of the 48 fences changes; a
second defect is discovered.

### 0.1.8 Baselines (verified fresh at `af04779` this session) and flow

Setup 1; duplication spec 2-with-deps / 1-no-deps; line 4; presentation
2 passed / 2 approved skips; cred-off duplication 2 skipped, line 4
skipped, presentation 4 skipped; focused 59/2; full 432/41 (becomes
441/42 after Stage 1); cleanup zeros (harness-scoped AND
PATCH-071-specific); zero production imports; 48/48 fences. §8
environment contract and §10 review flow apply verbatim; Sonnet PASS
required before the Stage-1 commit. **Bound Stage-1 commit message
(verbatim, unchanged):**
`fix(drawing): sanitize membership metadata on canvas clone (PATCH-071)`

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
