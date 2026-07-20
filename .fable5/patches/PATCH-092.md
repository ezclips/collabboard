# PATCH-092 — Strict Drawing-Layout Comment Persistence

**Status:** **FIX AUTHORIZED** (production fix — the drawing-layout
comment ADD/EDIT/REMOVE persistence channel ONLY; existing-card
MOVE atomicity is OUT OF SCOPE and its sequencing is REVISED at
this closure, see §0; the comment EDIT UI-not-drivable defect is
OUT OF SCOPE, see §0). ONE production file + ONE new regression
spec.
**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`e4ac7e63b114b8ba5289cab56e7adbcd0e4d8cdb`
(`test(e2e): characterize drawing comment persistence (PATCH-091)`;
HEAD == origin/main == base at authoring time)

**Bound implementation commit message (verbatim):**
`fix(drawing): strict comment persistence with visible failure path (PATCH-092)`

---

## 0. Census at authoring (2026-07-20, from `e4ac7e6`)

| # | Candidate | Class | User-visible impact | Deterministic repro | Coverage | Owner | Fix-ready? | Files | Ruling needed | Arch risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Drawing-layout comment persistence (`handleUpdateChildComments` ~1959–1964, non-strict/un-awaited)** | defect (silent-loss, P3) | comment edits/adds/removes can silently roll back on failure with zero user notice | yes (091 static+runtime evidence; strict channel already proven safe by 087/090) | 091 diagnosis spec (green) | DrawingLayout.tsx | **YES — SELECTED (this patch)** | 1 prod + 1 spec | none — MODEL A rewire, existing precedent | LOW (byte-identical shape to 087/090) | **P0** |
| 2 | Existing-card cross-container move atomicity | defect family (production) | moves can strand duplicate-parent/orphan half-states | affordance not drivable (089 Flow B); persistence path statically proven non-atomic | 089 diagnosis (green, `mixed-drop-state`) | new Postgres RPC + repository + DrawingLayout rewire | **NO — see §6/§7: no local Supabase CLI/config, no migration test/deploy path in this repo/session** | RPC migration + repo/adapter/hook + prod file (~4-5 files) | RLS security model (SECURITY INVOKER vs DEFINER), migration deployment ownership | HIGH (new backend surface, RLS-sensitive, undeployable from this session) | P1 (blocked on deployment plan) |
| 3 | Move affordance (dedicated drag handle) | UI feature | move stays inaccessible until #2 lands | n/a | none yet | RowColumnContainerCard | prohibited before #2 (090-closure ruling) | — | — | — | deferred with #2 |
| 4 | Comment EDIT UI (enabled button, editor doesn't surface) | defect, unclear root cause | editing an owned comment may be broken or merely slow/flaky under test | genuinely reproduced once (091), root cause NOT deterministically isolated by static read (see §12 inspection below) | 091 records the symptom only | CommentRow.tsx / EmbeddedCommentList.tsx | **diagnosis-first** | TBD | needs runtime isolation (timing vs layout vs transform-ancestor) | MEDIUM — could be test-timing, not a product bug | P2 (next diagnosis candidate after this patch) |
| 5 | PATCH-088 runner browser/context-close flakiness | infra reliability | none (test-infra only); one observed transient non-signature failure, self-recovered on retry | NOT reproduced on demand (1 occurrence in dozens of runs) | runner already correctly refuses to misclassify it | e2e/run-carried-groups.mjs | **not yet — insufficient signal** | — | needs a second occurrence with a stable signature before any retry logic is added | a premature broad retry could mask real failures | LOW — record only |
| 6 | Remaining non-strict callers: positions ~957/967 | design | none — intentionally best-effort | n/a | 088 §4 ruling | DrawingLayout.tsx | DEFER by design | — | — | — | deferred |
| 7 | Broader seven-site canvas-ops error swallowing | design | mixed | n/a | none | multiple | later dedicated contract patch | — | Result/throw consistency-wide ruling | MEDIUM | deferred |
| 8 | PATCH-081 | governance | none | n/a | RETIRED-BY-NOTE | — | n/a | — | — | none | no action |
| 9 | Frame/sidebar sync | no characterized defect | none observed | no repro | 079/080 green | — | n/a | — | — | none | deferred |
| 10 | Line-follow | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 11 | Uploaded-image storage cleanup | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 12 | AI images in presentation | feature | n/a | fixture-blocked | none | — | n/a | — | — | none | deferred |
| 13 | Overlap fallback | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 14 | Connections side-panel planning | feature | n/a | n/a | none | — | n/a | — | — | none | deferred |
| 15 | New issue exposed by 091 | — | — | — | — | — | — | — | — | — | NONE beyond #4 (already ranked) |

### Move sequencing — REVISED at this closure (bind; not silent)

The 090-closure ruling bound `PATCH-092 = atomic move persistence,
PATCH-093 = restore the drag handle + full move regression`. This
closure **revises that sequencing** on new evidence gathered this
session (§6/§7 below): the repo has **no `supabase/config.toml`,
no local Supabase CLI stack, and no migration test/deploy tooling**
— a new RPC migration cannot be tested or deployed from this
governance session, so MODEL C (the preferred atomic-move model)
is **not implementation-ready**. Authorizing move-atomicity
implementation now would violate Task 10's deployment-risk
contract ("do not authorize a patch that assumes an RPC exists in
production without a migration/deployment plan"). Per the standing
decision rule ("choose the smallest fully bounded, user-visible
correctness fix; do not let roadmap preference override patch
safety"), move-atomicity is **deferred pending an owner-approved
migration/deployment plan** (tracked as candidate #2, still P1, not
downgraded — only re-sequenced). **PATCH-092 targets candidate #1
instead** (strict comment persistence): fully bounded, reuses
existing infrastructure, zero new backend surface, testable
end-to-end in this environment. The move track resumes as a
dedicated design patch once deployment ownership is confirmed by
the repository owner; **PATCH-093 remains reserved for the drag
handle + move regression, unchanged, contingent on that design
patch landing first.**

## 1. Defect, product ruling, and the bound invariant

### Defect (proven at 091; unchanged at this base)

`DrawingLayout.tsx`'s `handleUpdateChildComments` (~1959–1964)
calls the NON-STRICT, un-awaited `onUpdatePadlet` for every
comment ADD/EDIT/REMOVE. `useCanvasData.updateDrawingLayoutPadlet`
(the channel `onUpdatePadlet` resolves to) applies the metadata
change to local state OPTIMISTICALLY before the network call
resolves, then silently ROLLS BACK on a resolved repository
failure (no message) or logs-deep-and-rolls-back on a thrown
failure — in both cases the drawing-layout caller has zero
visibility. 091 proved ADD/REMOVE/RAPID persist correctly under
normal conditions; the invisible-failure path itself was
statically proven, not runtime-injected (no seam authorized).

### Bound invariant (bind)

On success: `metadata.comments` (or `metadata.detachedComments`
per the caller's existing `options.field` selector — UNCHANGED,
this patch does not alter field routing) persists the full
updated array; local UI reflects the confirmed array, not an
optimistic pre-confirmation guess. On failure: NO local mutation
is shown (the pre-change comment list remains visible); exactly
ONE visible error is emitted; no duplicate console/toast
reporting; no retry; no new timer; the underlying padlet row is
otherwise untouched (comments is a full-array replacement field,
same shape as today — no partial-write risk). `detachedComments`
routing, `canvas_comments` (out of scope, untouched),
`EmbeddedCommentList`/`CommentRow` UI, and the comment EDIT
UI-drivability defect (#4, deferred) are ALL byte-unchanged.

**Bound transactional model: MODEL A — persistence-first,
confirm-then-settle** (the 086/087/090 precedent): call the
already-existing throwing channel `onUpdatePadletStrict`, await
it, mutate local UI only after confirmation (the strict channel's
own post-success `setPadlets` merge, per 086/090 convention),
catch and report exactly one error on failure. This is a
BEHAVIOR CHANGE from today's optimistic-then-silent-rollback to
confirm-then-show — the same latency/correctness tradeoff already
accepted for the drawing snapshot save (087) and container link
(090). No Result contract introduced; the thrown-error convention
stays consistent with every other DrawingLayout strict call site.

## 2. Exact production change (bind)

ONE production file: `components/collabboard/canvas/layouts/DrawingLayout.tsx`
(starting blob `965fcd721390484aa674bbec9994bb48c45b84ff`).

1. Convert `handleUpdateChildComments` (~1959–1964) to `async`.
2. Replace the `onUpdatePadlet(...)` call with
   `await onUpdatePadletStrict(childId, { metadata: { ...(child.metadata as any), [field]: comments } })`
   inside a `try`.
3. On throw: exactly ONE
   `console.error('Failed to update comment', error)` (or the
   established message-text convention — implementer binds the
   exact string in the delivered report; reviewer verifies it is
   singular and the ONLY visible signal); no compensation needed
   (comments is a plain field replacement — there is no "created
   row" to roll back, unlike 090's create-and-append case). No
   toast is REQUIRED but MAY be added if it mirrors the existing
   `console.error`-plus-optional-toast idiom used elsewhere in
   DrawingLayout — implementer's choice, reviewer confirms
   singular reporting either way.
4. `useCallback` dependency array updates from `[onUpdatePadlet]`
   to `[onUpdatePadletStrict]` (the prop is already destructured
   at the outer `DrawingLayout` component from existing 086/090
   plumbing — NO new prop threading required, NO CanvasClient
   change).
5. `onUpdateChildComments={handleUpdateChildComments}` prop
   wiring (~1988) stays byte-identical — the call site remains
   fire-and-forget from `EmbeddedCommentList`'s synchronous
   callbacks (`onSubmit`/`onSaveEdit`/`onRemoveComment`), unchanged
   by design; only the INSIDE of `handleUpdateChildComments`
   changes.

**Untouched (bind):** `onDropExistingPadlet` (move handler,
byte-kept); `createAndLinkChildToContainer` and its two call
sites (090, byte-kept); `options.field` routing logic (`comments`
vs `detachedComments`, byte-kept); `EmbeddedCommentList.tsx`,
`CommentRow.tsx`, `CommentEditor.tsx` (the EDIT UI-drivability
defect, #4, is explicitly NOT touched — no attempt to fix or
explain it in this patch); CanvasClient, hooks, repositories,
harness, config, package/lockfiles.

**Error contract (bind):** thrown-error contract only (no Result
mixing); `updatePostFieldsOrThrow`'s existing reject-on-failure
behavior is already visible-by-throw; exactly one visible error
per failed comment operation; no automatic retry; no new timer;
newer local state (e.g. a second comment action started before
the first confirms) must not be clobbered — implementer verifies
this against the existing `onUpdatePadletStrict` merge semantics
(last-confirmed-write wins, same as every other strict caller).

## 3. Regression matrix (bind) and the new spec

ONE new spec `e2e/characterization/drawing-comment-strict-persistence.spec.ts`
(ONE active test, up to TWO sequential disposable boards, existing
harness only, `registerDrawingCleanup(test)` at module scope,
per-board try/finally + zero-assertion, `test.setTimeout(300_000)`;
bound prefixes `patch-064-harness-patch-092-comment-a-` /
`-b-`). Reuses the 091 harness idioms (real Note/comment UI
driving, passive wire capture, `readCommentStore`,
`hasCurrentUserId` ownership proof for any self-owned action).

Because no failure-injection seam is authorized, the failure path
is verified by **source inspection only** (Flow C below) — exactly
the 090 precedent for its compensation path.

- **Flow A (board a) — ADD/REMOVE round-trip under the strict
  channel:** real visible ADD, confirm settled persistence + local
  UI shows the confirmed (not pre-confirmation-optimistic) state,
  reload consistent; real visible REMOVE, same confirm-then-show
  proof. Record passive wire: `PATCH`→204 comment-bearing, and
  that local UI update timing is NOT observably ahead of the
  confirmed write (i.e., no assertion that would fail under
  confirm-then-show but would have passed under the old
  optimistic-then-rollback shape — this is the behavioral tripwire
  proving the rewire actually took effect).
- **Flow B (board b) — RAPID two real ADDs:** unchanged from 091's
  proof shape; both persist, no lost write, no duplicate, reload
  consistent, no product-action retry.
- **Flow C (source inspection, recorded in the review — not
  browser-driven):** the reviewer re-derives from the fenced
  sources that `handleUpdateChildComments` now calls
  `onUpdatePadletStrict` (throwing), is `await`ed, has exactly one
  catch with exactly one visible error emission, and that no local
  `setPadlets` mutation for the comment array happens outside the
  strict channel's own post-success merge (i.e., no residual
  optimistic pre-mutation remains in `handleUpdateChildComments`
  itself). Reviewer also re-confirms the move handler and the
  EDIT UI-drivability defect are untouched.
- **Flow D (board a and b) — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0 on both boards).

No `page.route`, no auth capture, no hidden-handler invocation, no
synthetic event dispatch, no failure injection, no `canvas_comments`
access, no attempt to drive or fix the EDIT UI defect (record
`action-not-drivable` if incidentally touched — do not fabricate).

## 4. Allowed files (bind)

| File | Role | Starting state at base `e4ac7e6` |
|---|---|---|
| `components/collabboard/canvas/layouts/DrawingLayout.tsx` | production fix | blob `965fcd721390484aa674bbec9994bb48c45b84ff` |
| `e2e/characterization/drawing-comment-strict-persistence.spec.ts` | NEW regression spec | absent at base (absence gate) |

TWO files total. NO harness change, NO config change, NO
CanvasClient/useCanvasData/repository change, NO package/lockfile
change, NO migration/RPC. Absence gates: the new spec absent at
base and worktree before implementation;
`e2e/characterization/drawing-slide-persistence.spec.ts` AND
`.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree; PATCH-093 not started (reserved for the move
drag-handle + regression, contingent on a separate move-atomicity
design patch landing first — NOT this patch).

## 5. Immutable fences (bind — 40, Git blob IDs)

Verify each with `git rev-parse e4ac7e6…:<path>` and equality at
the current governance HEAD. Blob-ID method only. The 091 fence
set with DrawingLayout MOVED to §4 (allowed), PLUS the landed 091
regression spec.

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
components/collabboard/RowColumnContainerCard.tsx              e58167d51324ef9bf9d928251ad91d60756616a7
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
e2e/characterization/drawing-container-drop.spec.ts            32750636c1146f5bf8da3e7f9987838b26c5169b
e2e/run-carried-groups.mjs                                     6a04d94e6bcc71fdd6e647f5961707607ad1317d
e2e/characterization/drawing-container-link.spec.ts            07ec5ad379e53b11764c0ac7fd48a26ae4e365a3
e2e/characterization/drawing-comment-persistence.spec.ts       c8b32bc2ba7c8b34b8e5a8279a693e0736411bcf
```

## 6. Repository/API ownership and RLS ruling (bind — informational,
this patch needs neither)

For the DEFERRED move-atomicity work (#2): the narrowest safe
architecture is a Supabase migration exposing ONE Postgres RPC
(e.g. `move_child_between_containers(child_id, source_parent_id,
destination_parent_id)`), called via `supabase.rpc(...)` from a
new `postsRepository` method (hand-rolled narrow type interface —
this repo has NO generated `database.types.ts`; every existing
`.rpc()` call site, e.g. `lib/auth/permissions.ts`,
`lib/import/restore.ts`, `lib/kanban/supabaseAdapter.ts`, types its
own call inline — no generated-type churn risk), exposed through
`useCanvasData` as a new throwing method, consumed by a
`CanvasClient` strict callback, consumed by a rewired
`onDropExistingPadlet`. Direct Supabase/RPC calls from
`DrawingLayout` or any UI component remain PROHIBITED (rule #1).
**Security model:** existing `padlets` RLS
(`supabase/migrations/20260706_fix_blanket_permissive_policies.sql`)
already scopes UPDATE to board owner/collaborator via
`auth.uid()`; since a move only touches three rows the caller
already has UPDATE access to (all in the same board), **SECURITY
INVOKER is preferred** over SECURITY DEFINER — it needs no
privilege escalation and inherits the caller's existing RLS
checks per-statement, unlike the `get_board_members_with_profile`
precedent (SECURITY DEFINER + explicit auth check) which exists
because it reads `auth.users`, a table normal RLS can't reach.
**Contract: throwing atomic-move channel** (Option A of the
review's ownership task), consistent with every other DrawingLayout
strict call site — no Result mixing.

## 7. Migration/deployment risk ruling (bind — why #2 is deferred)

This repository has NO `supabase/config.toml`, NO local Supabase
CLI/Docker stack, and NO migration test runner wired into
`package.json` or CI as observed at this base. A new RPC migration
authored in this session could not be locally tested, and this
governance session has no authority or path to deploy a migration
to the live Supabase project. Per the standing rule ("do not
authorize a patch that assumes an RPC exists in production without
a migration/deployment plan"), move-atomicity implementation is
NOT authorized until the repository owner confirms a deployment
path (owner-run `supabase db push`/dashboard SQL editor equivalent
NEVER — migrations only, per `.fable5/CLAUDE.md` rule #5 — plus
either a staging environment or an owner-supervised production
migration window). This ruling gates PATCH-093's prerequisite
design patch, not PATCH-092.

## 8. Comment EDIT UI defect — inspection notes (bind — diagnosis
candidate, NOT this patch)

Read-only inspection of `CommentRow.tsx` found plausible
CONTRIBUTING factors, none conclusively isolated: (a) the TipTap
editor is created with `immediatelyRender: false`, deferring the
actual ProseMirror DOM mount by at least one render cycle; (b)
`EditorContent` is rendered ONLY inside the `isEditing` conditional
branch (not always-mounted-but-hidden), so entering edit mode
triggers a fresh mount rather than a visibility toggle; (c)
DrawingLayout renders this UI inside a CSS-transformed
(pan/zoom-scaled) canvas ancestor, a known class of environment
where some rich-text editors have DOM/measurement quirks. No
single cause was confirmed from static reading alone. Per the
standing instruction to rank diagnosis-first absent a deterministic
source cause, this candidate is NOT selected for a production fix
in PATCH-092 and is NOT bundled with the comment-strict-persistence
fix (they do not share a mechanism — the strict-persistence fix
touches the write path; this defect is about editor-surface
mounting, a render-path concern).

## 9. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents;
passive listeners only (no `page.route`, no auth headers);
sequential `verify`/`build`, never under a dev server; never
commit generated artifacts.

## 10. Stop conditions

STOP immediately, report, do not commit, if:

- base commit, any §5 fence (40/40), or any §4 absence gate differs;
- the fix requires touching a SECOND unrelated operation, ANY edit
  to `onDropExistingPadlet`/move semantics, `createAndLinkChildToContainer`,
  `EmbeddedCommentList.tsx`/`CommentRow.tsx` (the EDIT UI defect),
  CanvasClient, useCanvasData, the harness, config, or a
  repository/migration file;
- a visible move affordance or any RPC/migration enters scope
  accidentally;
- the regression cannot be driven through the real comment UI (no
  hidden handler, no synthetic event — record and STOP);
- verifying the failure path would require failure injection or an
  instrumentation seam;
- any carried spec's totals change (089, 090, or 091's own re-run);
- cleanup cannot reach zero for any board;
- more than one visible error path results from the rewire.

## 11. Review and commit flow (bind)

Implementer delivers the uncommitted TWO-file diff + report (blobs
re-derived; production hunk audit against §2; regression results;
carried totals; deterministic totals; fence result; cleanup proof).
The independent read-only reviewer re-derives everything (including
Flow C source inspection) and must return an explicit PASS before
the implementer commits with the bound message and pushes. CTO
closes; the move-atomicity design patch (successor to the deferred
candidate #2) is authored separately once a deployment plan is
confirmed by the owner.

## 12. Required final report

Exact two changed paths + final blobs; production diff summary
(hunks vs §2, confirming the confirm-then-show behavior change);
regression results (Flow A/B/C/D); carried totals (089 unchanged
classification, 090 passed, 091 re-run passed); deterministic
totals; 40-fence result + absence gates; cleanup proof; explicit
confirmations (no move-path edit, no EDIT-UI-defect edit, no
CanvasClient/hook/config/harness/migration change, no injection,
no retry/timer, single visible error path); commit hash + push
status after PASS.
