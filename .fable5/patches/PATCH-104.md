# PATCH-104 — Extract the Column-Layout Container-Creation Command Family from CanvasClient

**Status:** **DONE (closed 2026-07-23, commit
`684651a7d2ca15ce45a1b68220cf3fdfc0d0fb43`) — CTO post-landing
verification PASSED. See §10 for closure record.**

**Implementer:** GPT-5.5. **Reviewer:** independent read-only reviewer
(Kepler primary, Gemini 3.1 Pro fallback, DeepSeek acceptable
alternate) — PASS required before commit. Sonnet (CTO/governance
owner) authored/authorized this patch and must NOT perform its review.
**Authored:** Sonnet (CTO), 2026-07-23.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`43948e4e095706c186f0f12600bc1dc52e254350`
(`docs(fable): close PATCH-102 after independent PASS`; HEAD ==
origin/main at authoring time)

**Starting blob (bind):** `app/dashboard/canvas/[id]/CanvasClient.tsx`
= `a028dd65c1935068a7206a67db869a8f5345011a` (8,436 lines).

**Bound implementation commit message (verbatim):**
`refactor(canvas): extract the container-creation group onto the canvas ops seam -- 4 commands, Pattern K (PATCH-104)`

---

## 0. Why this group, and why not the alternatives (bind)

A fresh census of `CanvasClient.tsx` (this session, re-run, not stale)
confirms: `GRANDFATHERED_UI_FILES` is empty (closed by PATCH-061);
`check:boundaries` already reports zero direct-Supabase-import
violations in this file; the file's only remaining `supabase`
references are a vestigial unused `useMemo` client (line 200, flagged
in PATCH-061's own closure as its own future small cleanup, NOT this
patch) and 22 dead `useCallback` dependency-array mentions (kept
intentionally — removing them would change memoization identity, an
unauthorized behavior change). **There is no remaining raw-Supabase
call site to extract.** What remains is business-rule ORCHESTRATION
still inline in the component, on top of an already-domain-backed
primitive layer (`lib/domain/canvas/posts.ts` +
`lib/infra/canvas/postsRepository.ts`, seam opened PATCH-025,
generalized through PATCH-026-061).

Candidates surveyed (all still inline in `CanvasClient.tsx`):

| Candidate | Lines (approx.) | Verdict |
|---|---|---|
| **Container creation (Column Layout)** | 531-660 | **Selected** — see below |
| Column reorder (`handleColumnReorder`) | 862-925 | Rejected: a single function (position-math + one repository call), not a cohesive multi-command family; closer to a "generic helper extraction" the governing instruction explicitly said not to prefer solely on size |
| `persistFreeformBoardAppearance` | ~1140-1250 | Rejected: mixes a domain command with a raw `localStorage` write — a smaller but more awkwardly mixed-concern extraction, lower value |
| Timeline container/order family | 4232-4521 | Rejected for PATCH-104: medium difficulty, touches timeline-specific ordering state not needed to prove out the pattern again |
| Scheduler family | 4523-4858 | Rejected for PATCH-104: medium-high difficulty — slot-overlap matching is real, non-trivial business logic entangled with drag/drop and `padlets` state; bigger than the smallest-safe-next bar |
| Drawing-layout CRUD/cascade family | 4862-5099+ | Rejected for PATCH-104: high difficulty — this is the area PATCH-090-095 already worked in, and PATCH-095's cross-container-move contract is explicitly **DESIGN COMPLETE / IMPLEMENTATION BLOCKED**, signaling live design risk. Do not reopen it under this patch. |
| Clipboard paste/undo (`handlePaste`/`handleUndoPaste`) | 3453-3520 | Rejected for PATCH-104: undo-state entanglement raises behavioral risk above the container-creation group for comparable size |

**Selected: the Column-Layout Container-Creation family**, delimited
in the current file by its own comment block, `// --- Container
Creation Logic (Column Layout) ---` (line 530) through `// --- End
Container Creation Logic ---` (line 660) — a self-contained, four-
function, single-concern group, structurally the closest match in this
codebase today to the `board_sections` shape PATCH-026 extracted:
clear boundaries, no realtime/drag-and-drop state machine entanglement
beyond a single drop handler, and a business rule (child-id append on
drop) that is genuinely absent from the domain layer today — not a
duplicate of any existing command (`canvas.createContainerWithPost` and
`canvas.groupPostIntoContainer` both create container+post TOGETHER in
one call and differ in every material behavioral respect from this
group's four functions — see §2; no P6 violation).

## 1. Established pattern this patch must follow exactly (bind, from PATCH-026/PATCH_REFERENCE §5.11 "Pattern K")

- **Naming:** new domain file `lib/domain/canvas/containers.ts` (NEW —
  confirmed absent from `lib/domain/canvas/` today); NO new repository
  file — reuse the existing `lib/infra/canvas/postsRepository.ts` and
  its existing `PostsRepository` interface methods (`insert`,
  `insertReturning`, `updateFieldsById`) exactly as `posts.ts`'s
  existing commands already do. One repository per table (P6) — do
  not create a second `padlets`-table repository.
- **Dependency direction:** `lib/domain/canvas/containers.ts` imports
  only from `lib/domain/core/*` and `lib/domain/canvas/posts.ts` (for
  the shared `PostsRepository` interface/`postRowSchema` type re-use,
  if convenient) — never React/Next/`@supabase/*`/`components`/`app`
  (enforced by the existing domain-purity ESLint block, unchanged).
- **Commands:** `defineCommand({ name: 'canvas.<verb>', input:
  zodSchema, execute })`, returning `Promise<Result<T, DomainError>>`,
  matching the exact shape of every neighboring command in `posts.ts`.
- **Error handling:** faithfully port each function's EXISTING error
  behavior (see §2's per-function contract) — do not unify or
  "improve" the three different failure-handling shapes present today.
  At the UI boundary, the pre-existing `try { await x(); toast.success
  } catch (err) { console.error; toast.error; rollback }` shape in
  `CanvasClient.tsx`/its calling hook stays exactly as-is; only what it
  calls changes (a thin hook wrapper, matching `useCanvasData.ts`'s
  existing `insertPostOrThrow`/`updatePostFieldsSwallowResolved`
  pattern — see §3).
- **Unit tests:** co-located `lib/domain/canvas/containers.test.ts`,
  written and passing GREEN before any implementation model touches
  `CanvasClient.tsx` — bound tests, never edited to make failing code
  pass.
- **Characterization:** **no existing spec covers this behavior** —
  confirmed by direct grep of `e2e/characterization/` for "container":
  the only hits (`drawing-container-drop.spec.ts`,
  `drawing-container-link.spec.ts`) cover the UNRELATED Excalidraw
  drawing-canvas container/frame system, not the Column-Layout board
  view's container-creation family. `board-lifecycle.spec.ts` does not
  touch container creation either. **A new characterization spec is
  required** (unlike most PATCH-026-family patches, which relied on a
  pre-existing net) — see §4.
- **Absence gates:** bind as printed text, never a bare exit code —
  `test -e lib/domain/canvas/containers.ts && echo EXISTS || echo
  ABSENT` (pre-edit: must print `ABSENT`; post-edit: must print
  `EXISTS`).
- **Commit convention:** `refactor(canvas): extract the <group> group
  onto the canvas ops seam -- <n> commands, Pattern K (PATCH-0NN)`,
  staged with an explicit `:(literal)` pathspec for the `[id]` route
  segment (`git add ':(literal)app/dashboard/canvas/[id]/CanvasClient.tsx'`).
- **Monolith shrink reporting:** report the exact CanvasClient.tsx
  before→after line count in the closure summary (currently 8,436).

## 2. Exact current behavior contract (bind — prove before extracting; do not "fix" any of the below)

### `handleTriggerContainerCreation(sectionId, position)` (lines 531-534)

Pure UI-state setter — sets `containerCreationLocation` and opens
`containerCreationPromptOpen`. **No command needed; stays in
`CanvasClient.tsx` verbatim.**

### `handleCreateContainerFromPrompt()` (lines 536-584)

- **Success path:** builds an empty `Padlet` of `type: 'container'`
  with a fresh `crypto.randomUUID()`, fixed `280×200` size, `position_x/y:
  0`, `metadata: { childPadletIds: [], sectionId: String(sectionId),
  sectionPosition: position, kind: 'container', isContainer: true,
  cardColor: '#ffffff', zIndex: Date.now() }`; optimistically appends
  it to local `padlets` state; closes the creation prompt; persists via
  `insertPostOrThrow`; on success shows `toast.success('Container
  created')`.
- **Failure path:** `console.error` the raw error, `toast.error('Failed
  to create container')`, and **rolls back** the optimistic insert
  (`setPadlets(prev => prev.filter(p => p.id !== newContainer.id))`).
- **Null/not-found path:** if `containerCreationLocation` or `canvasId`
  is falsy, returns immediately — no UI change, no persistence attempt.
- **Authorization path:** none beyond whatever `insertPostOrThrow`'s
  underlying command already enforces (`userId: null` today, matching
  every other call site in this file — do not add new authorization
  logic).

### `handleCreateContainerAt(sectionId, position)` (lines 593-626)

Identical container-row shape and optimistic-update/rollback behavior
to `handleCreateContainerFromPrompt`, with two behavioral differences
that MUST be preserved exactly: (a) no prompt-close/location-reset
side effects (there is no prompt state to close in this path), (b) no
success toast is shown on this path today (silent success) — only the
failure path shows `toast.error`.

### `handleDropDraftIntoContainer(containerId, draftPayload)` (lines 627-659)

- **Success path:** spreads `draftPayload` into a new post row with
  `board_id`, `position_x/y: 0`, fresh timestamps, and
  `metadata: { ...draftPayload.metadata, parentId: containerId }`;
  inserts it via `insertPostAndSelectOrThrow` (throws if the insert
  fails OR returns no row); appends the returned row to local `padlets`
  state; **then**, only if the target container is found in the
  CURRENT local `padlets` array (`padlets.find(p => p.id ===
  containerId)`), reads that container's CURRENT
  `metadata.childPadletIds` (defaulting to `[]`) and calls
  `updatePostFieldsSwallowResolved(containerId, { metadata: {
  ...container.metadata, childPadletIds: [...currentChildren,
  created.id] } })` — this is a full-metadata-object overwrite using
  the CURRENT locally-held container metadata as its base, not a
  targeted single-field patch.
- **Container-not-found path (preserved quirk — do not "fix"):** if the
  container is not present in local `padlets` state at the moment this
  runs, the childPadletIds update is silently skipped entirely — the
  new post is still created and still appears in local state (now
  visually parented via its own `metadata.parentId`, but NOT listed in
  any container's `childPadletIds`). This is the exact production
  behavior today; PATCH-104 must not add a fetch-and-retry or an error
  in this branch.
- **Failure path:** if the initial `insertPostAndSelectOrThrow` throws
  (including its own "no data returned" case), `console.error` the raw
  error and `toast.error('Failed to add to container')` — no rollback
  of anything (nothing has been added to state yet at that point). If
  the SUBSEQUENT `updatePostFieldsSwallowResolved` call throws (its
  swallow only covers `code !== 'unknown'` resolved errors — a genuine
  thrown/`unknown` error still propagates), that exception is caught by
  the SAME outer `catch`, producing the SAME `toast.error('Failed to
  add to container')` — even though the post itself was already
  successfully created and is already visible in local state. **This
  exact "successful post, silently-unlinked-looking toast" quirk is
  preserved, not repaired, by this patch.**
- **Null/not-found path:** if `canvasId` is falsy, returns immediately.

### `handleDragToExistingFromPrompt()` (line 586-590)

Pure UI-state setter + `toast.info` — **stays in `CanvasClient.tsx`
verbatim, no command needed.**

## 3. Exact allowed files (bind)

**New files (create):**
- `lib/domain/canvas/containers.ts` — new commands
  `createCreateContainerCommand` (`canvas.createContainer`, used by
  BOTH `handleCreateContainerFromPrompt` and `handleCreateContainerAt`
  — their container-row shape and single-`insert` persistence step are
  identical; only the caller-side toast/prompt-close behavior differs,
  which stays in the hook/component layer) and
  `createDropDraftIntoContainerCommand` (`canvas.dropDraftIntoContainer`
  — insert-and-return the post, then conditionally update the
  container's metadata; the "container not found locally" branch stays
  a CALLER-side decision, since the command only receives what the
  caller already looked up — see exact input shape below).
- `lib/domain/canvas/containers.test.ts` — unit tests for both
  commands, covering: success (container created / post created +
  container metadata updated), the container-update's own failure
  after a successful post insert (verify the command surfaces this
  exactly as `updatePostFieldsSwallowResolved`'s existing swallow rule
  requires — do not add a NEW swallow rule; replicate the existing
  `code !== 'unknown'` semantics faithfully if the new command wraps
  the same generic update path, or bind an equivalent explicit contract
  if it does not), and schema validation.

**Modified files:**
- `components/collabboard/canvas/hooks/useCanvasData.ts` — add two new
  thin wrapper functions (naming convention matching existing
  neighbors, e.g. `createContainerOrThrow`,
  `dropDraftIntoContainerOrThrow` or equivalent — implementer's exact
  naming is not bound, but MUST follow the file's existing
  `<verb>PostOrThrow`/`<verb>PostFieldsSwallowResolved` naming shape and
  MUST be exported from the hook's return object alongside the existing
  `insertPostOrThrow` family), each composing
  `createCreateContainerCommand(createPostsRepository())` /
  `createDropDraftIntoContainerCommand(createPostsRepository())`
  exactly as every neighboring wrapper in this file already does.
- `app/dashboard/canvas/[id]/CanvasClient.tsx` — ONLY within the
  existing `// --- Container Creation Logic (Column Layout) ---` /
  `// --- End Container Creation Logic ---` comment block (lines
  530-660): `handleCreateContainerFromPrompt`, `handleCreateContainerAt`,
  and `handleDropDraftIntoContainer` are rewritten to call the two new
  hook wrappers in place of their current inline row-construction +
  direct `insertPostOrThrow`/`insertPostAndSelectOrThrow`/
  `updatePostFieldsSwallowResolved` calls, preserving every optimistic-
  update, rollback, toast, and conditional-branch behavior documented
  in §2 EXACTLY. `handleTriggerContainerCreation` and
  `handleDragToExistingFromPrompt` are NOT touched (no command needed).
  No line outside lines 530-660 changes. The two hook-destructure lines
  (350-359) gain the two new wrapper names, matching the existing
  comma-separated list style — this is the only permitted change
  outside the comment block, and only to the destructuring list itself
  (not to any other logic in that region).
- `e2e/characterization/canvas-container-creation.spec.ts` — NEW
  characterization spec (file does not exist today — confirmed via
  absence gate in §6), covering the behavior contract in §2 end to end
  through the real UI (prompt-driven creation, direct at-position
  creation, drop-into-container, and the preserved "container not
  found" quirk if it can be triggered deterministically; if it cannot
  be triggered deterministically through the UI, document that
  explicitly in the spec file as a comment and cover it at the unit
  level in `containers.test.ts` instead — do not skip it silently).

**Prohibited files (must NOT change):**
- `components/canvas/layouts/ColumnContainerCreationPrompt.tsx` (pure
  presentational, confirmed no Supabase references, no changes needed)
- `lib/domain/canvas/posts.ts`, `lib/infra/canvas/postsRepository.ts`
  (reused as-is; no new repository methods required — `insert`,
  `insertReturning`, and the existing generic
  `updateFieldsById`-backed `canvas.updatePostFields` path already
  cover this group's persistence needs)
- Any file under `components/collabboard/canvas/ui/`,
  `components/collabboard/canvas/layouts/`, or the drawing-layout/
  scheduler/timeline command families
- `eslint.boundaries.config.mjs` (no grandfather changes needed — this
  file was never grandfathered)
- Any other line in `CanvasClient.tsx` outside lines 530-660 and the
  destructure list at lines 350-359

## 4. Required characterization test (bind)

New spec `e2e/characterization/canvas-container-creation.spec.ts`
(authenticated, following the existing
`createDisposableDrawingBoard`/`registerDrawingCleanup`-style fixture
pattern used throughout `e2e/characterization/`, adapted for a
Column-Layout board rather than a Drawing board — reuse or extend the
existing harness helpers if a Column-Layout equivalent already exists;
if not, a minimal board+section fixture is acceptable, scoped ONLY to
what this test needs). Must assert, through real UI interaction:

1. Creating a container via the prompt flow (`onAddContainerAt` →
   `ColumnContainerCreationPrompt` → "New Container" choice) persists a
   `type: 'container'` row with the exact metadata shape in §2 and
   shows the success toast.
2. Creating a container via `handleCreateContainerAt` (direct
   at-position path) persists identically but WITHOUT a success toast
   (preserving the documented asymmetry).
3. Dropping a draft into an existing container persists the new post
   AND updates the container's `childPadletIds` to include it.
4. A forced persistence failure (e.g. a `page.route` abort on the
   relevant Supabase REST call, matching the existing pattern used in
   `presentation-snapshot-image-readiness.spec.ts`'s error-injection
   tests) on the container-create path triggers the failure toast AND
   the optimistic-insert rollback (the container disappears from the
   UI).
5. Zero regression in the "container not found locally" quirk — either
   demonstrated through the UI or explicitly deferred to the unit test
   with a comment explaining why the UI cannot deterministically
   trigger it.

## 5. Required unit/repository tests (bind)

- `lib/domain/canvas/containers.test.ts`: both new commands, covering
  every branch in §2's contract (success, the container-update
  failure-after-post-success ordering, schema validation rejecting
  malformed input). Follow the exact `describe`/`it` and
  `Result`-assertion style already used in `posts.test.ts`.
- No new repository test file is required (no new repository methods
  are introduced); if the implementer determines a new repository
  method IS in fact needed to preserve some nuance discovered during
  implementation that this document did not anticipate, STOP and
  report back for a scope amendment rather than adding one silently.

## 6. Absence gates (bind — run and paste printed output, not exit codes)

Pre-implementation (must print `ABSENT` for all):
```
test -e lib/domain/canvas/containers.ts && echo EXISTS || echo ABSENT
test -e lib/domain/canvas/containers.test.ts && echo EXISTS || echo ABSENT
test -e e2e/characterization/canvas-container-creation.spec.ts && echo EXISTS || echo ABSENT
```

Post-implementation (must print `EXISTS` for all three above, plus):
```
git diff --stat ':(literal)app/dashboard/canvas/[id]/CanvasClient.tsx'
```
— confirm the diff touches ONLY lines within 530-660 and the
destructure list at 350-359 (report the exact line ranges touched;
any line outside those ranges is a hard-stop).

## 7. Required validation matrix (bind)

1. `lib/domain/canvas/containers.test.ts` — all new tests passing,
   run and shown green BEFORE any `CanvasClient.tsx` edit (bound-test
   discipline).
2. New `canvas-container-creation.spec.ts` — full run, all scenarios
   from §4 passing.
3. `npx tsc --noEmit` — clean.
4. `npm run check:boundaries` — clean, zero new violations.
5. Full `npx vitest run` — must remain 448+ tests / 43+ files passing
   (report the exact new total; it must only GROW from the new
   `containers.test.ts` file, never shrink or newly fail elsewhere).
6. `board-lifecycle.spec.ts` (the cross-page regression net this
   pattern normally relies on) — full run, zero regressions, even
   though it does not directly exercise this feature.
7. PATCH-096 grouped runner — 14/14/14, zero non-signature failures,
   exit code 0.
8. `npm run verify` (typecheck + boundaries + unit + build) — full
   green.
9. `npm run build` — clean.
10. Cleanup/process state: no repository-owned dev server or listening
    process left running; ports 3000/4000 free; no `test-results/`/
    `.next/trace` residue (or removed via the same scoped
    `Remove-Item`/Node-script pattern bound in PATCH-102 §24/§25 if
    policy blocks direct deletion).
11. Fresh independent review (Kepler primary, Gemini 3.1 Pro fallback,
    DeepSeek acceptable alternate — NOT Sonnet) required before commit.

## 8. Hard-stop conditions (bind)

STOP, report, do not commit, if:
- any file outside §3's allowed list is touched;
- any line in `CanvasClient.tsx` outside 530-660 and the 350-359
  destructure list changes;
- `handleTriggerContainerCreation` or `handleDragToExistingFromPrompt`
  gain a command call (they are pure UI-state setters and must stay
  that way);
- any of the §2-documented behaviors (including the two preserved
  quirks: the asymmetric success toast, and the "container not found
  locally" silent skip) is "fixed," unified, or silently changed;
- a new repository method is added without a scope-amendment report
  first (§5);
- `eslint.boundaries.config.mjs` is touched;
- any existing test (unit, characterization, or PATCH-096 grouped) is
  weakened or skipped to make this patch pass;
- the absence gates in §6 do not print exactly the required text;
- credentials are printed, logged, or committed anywhere.

## 9. Health ledger (bind)

The numeric health score last recorded in `CTO_PLAYBOOK.md` §12 (76,
dated to the PATCH-030 era) is **not** carried forward or reused for
this patch's authoring turn — see the governance closure note in
`CURRENT_TASK.md` (2026-07-23) ruling it stale pending a full 5-axis
re-score with operational-integrity evidence not yet re-verified this
session. This patch's own closure report must not assert a new numeric
score either, unless a dedicated rescoring pass (its own governance
action, out of scope here) has run first.

**Do not authorize PATCH-105.**

## §10 — post-landing verification and closure (bind, 2026-07-23)

**Landed commit:** `684651a7d2ca15ce45a1b68220cf3fdfc0d0fb43`
(`refactor(canvas): extract the container-creation group onto the
canvas ops seam -- 4 commands, Pattern K (PATCH-104)`), branch `main`,
HEAD == origin/main at verification time.

**Verified (bind):** `git status --short --untracked-files=all` empty
(clean tree); exactly the five governed files landed
(`CanvasClient.tsx`, `useCanvasData.ts`,
`canvas-container-creation.spec.ts`, `containers.test.ts`,
`containers.ts`); `git diff HEAD^ HEAD --check` clean; zero staged,
zero untracked; stash empty. `git diff HEAD^ HEAD -- ':(literal)app/dashboard/canvas/[id]/CanvasClient.tsx'`
inspected directly and confirmed confined to exactly the two bound
regions — the 350-359 hook-destructure list (adds
`createContainerOrThrow`, `dropDraftIntoContainerOrThrow`) and lines
within 530-660 (`handleCreateContainerFromPrompt`,
`handleCreateContainerAt`, `handleDropDraftIntoContainer`) — no line
outside those ranges changed. `lib/domain/canvas/containers.ts`
inspected directly: reuses only the pre-existing `insertReturning`/
`updateFieldsById`/`insert` repository methods (no new repository
method added, per §3's prohibition); `dropDraftIntoContainerSchema`'s
`containerMetadata: z.record(...).nullable()` and the execute body's
`created` value carried through the error's `details` on a subsequent
`updateFieldsById` failure faithfully preserve both documented quirks
(§2): the "container not found locally" skip (`containerMetadata ===
null` short-circuits to `ok(created)` with no update attempt) and the
"post created but container-update failed" case (the error carries
`created` in its `details`, letting the caller still add it to local
state — matching `CanvasClient.tsx`'s new `catch` block reading
`(err as { created?: Padlet } | null)?.created`).

**Independent review:** PASS (Kepler/Gemini/DeepSeek-class, not
Sonnet), confirming exact repository identity, exact five candidate
blobs, allowed-file/line fences, domain-command purity, thin hook
wrappers, preserved toast asymmetry, preserved silent
missing-container behavior, 10 domain tests, PATCH-104 E2E
characterization, `board-lifecycle.spec.ts` regression, PATCH-096
grouped runner 14/14/14, TypeScript, boundaries, full Vitest 458
tests/44 files (+10 tests/+1 file over the pre-patch 448/43 baseline,
consistent with exactly one new test file), `verify`, `build`, cleanup
and final Git state — reported to this governance turn by the user,
not independently re-executed live by Sonnet in this closure turn.

**PATCH-104 status: DONE.** No remaining implementation blocker. Both
deliberately-preserved behavioral quirks (asymmetric success toast;
silent skip on missing-container) confirmed intact in the landed code.
**No follow-on patch (PATCH-105) has been implemented by this
closure.**
