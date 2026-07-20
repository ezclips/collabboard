# PATCH-094 — Comment EDIT Save-Persistence Diagnosis (Drawing Layout)

**Status:** **DONE** (commit `aee4322aa36dcaac7a3b28443a21e19285e6db60`,
independent read-only review PASS). ONE new characterization spec
landed, exactly as bound. No production file was touched. No move
work, no metadata-store migration, no `canvas_comments` scope, no
TipTap refactor, no PATCH-092 strict-channel change.

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`4dc94a7bab9a57d9143a8fe77bcd9e94cf87f33f`
(`test(e2e): characterize drawing comment EDIT UI defect (PATCH-093)`;
HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize drawing comment EDIT save persistence (PATCH-094)`

---

## 0. Fresh census (2026-07-20, from `4dc94a7`)

| # | Candidate | Class | User-visible impact | Deterministic repro | Coverage | Owner | Fix-ready? | Files | Ruling needed | Arch risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Comment EDIT save persistence (does a real Enter-save round-trip through metadata.comments correctly?)** | uncharacterized — NOT yet proven either way | unknown — could be fine, could silently lose an edit, since the editor exits display BEFORE the strict update confirms (`EmbeddedCommentList.tsx:139-142`) | fully reachable — 093 proved the editor mounts and is drivable | none — 093 explicitly stopped at Escape-cancel, never pressed Enter | `CommentRow.tsx` (Enter/Escape wiring) / `EmbeddedCommentList.tsx` (`onSaveEdit` closes edit mode synchronously) / `DrawingLayout.tsx:577-582` (`onEditComment` → `handleUpdateChildComments`, already strict since 092) | **diagnosis-first — SELECTED (this patch)** | 1 new spec | needs runtime proof of the full save round-trip, ID/author stability, reload, and Escape contrast | MEDIUM — could reveal a real silent-loss window, or could confirm it's fine | **P0** |
| 2 | Comment EDIT Enter-to-save behavior | sub-question of #1 | part of #1 | reachable | none | `CommentRow.tsx:124-128` | part of #1, not separable | — | part of #1 | part of #1 | folded into #1 |
| 3 | Comment EDIT Escape cancellation | sub-question of #1 | part of #1 | reachable (093 already exercised Escape, but only on an unedited comment) | 093 proved Escape-after-no-change; Escape-after-a-text-change is untested | `CommentRow.tsx:129-134` | part of #1 | — | part of #1 | part of #1 | folded into #1 |
| 4 | Comment EDIT failure behavior | sub-question of #1 | if the strict update rejects, is the failure honest, and does the editor's early exit (before confirmation) ever show a false "saved" appearance? | not directly reproducible without failure injection (prohibited) — addressed by SOURCE inspection only, same precedent as 090/092 | none | `DrawingLayout.tsx` `handleUpdateChildComments` catch (092, unchanged) | source-inspection only, no injection | — | confirm PATCH-092's single-error-path guarantee still applies to the EDIT caller specifically | LOW — 092 already proved the catch is singular and honest | folded into #1 |
| 5 | Comment EDIT duplicate/lost-write behavior | sub-question of #1 | rapid Enter or blur-before-Enter-resolves could theoretically double-fire `onEditComment` | reachable if the spec drives a rapid double-Enter or Enter-then-blur sequence | none | `CommentRow.tsx` (`onBlur` auto-save + `onKeyDown` Enter both call `handleSaveEdit`) | part of #1 (Flow scope decision, see §4) | — | part of #1 | MEDIUM — `onBlur` and `onKeyDown` could both fire for one edit if focus leaves right after Enter | folded into #1 |
| 6 | Comment EDIT reload after successful save | sub-question of #1 | confirms whether an edit is durable, not just locally displayed | reachable | none | same as #1 | part of #1 | — | part of #1 | part of #1 | folded into #1 |
| 7 | Delayed editor mount / PATCH-091 probe wording | governance/historical, not a code defect | none — already reconciled at 093 closure | n/a | 091/093 evidence stands as recorded | — | n/a — reconciliation already complete | 0 | 091's wording already says "did not appear within the observed window" (bounded, Interpretation A) — NO rewrite needed, see §9 | none | resolved, no action |
| 8 | PATCH-091 retirement, amendment, or retained historical characterization | governance | none | n/a | — | — | **RETAIN AS-IS** — 091's ADD/REMOVE/RAPID evidence and its correctly-bounded EDIT finding are NOT retired or reopened | 0 | none — already correctly scoped | none | resolved, no action (see §9) |
| 9 | Atomic cross-container move design | defect family (production) | moves can strand duplicate-parent/orphan half-states | affordance not drivable (089); persistence path statically proven non-atomic | 089 diagnosis green | new Postgres RPC + repo/adapter/hook + `DrawingLayout` rewire | **NO — see #10** | ~4-5 files | RLS security model, migration deployment ownership | HIGH | P1 (blocked on #10) |
| 10 | Move migration/deployment tooling gap | infra/process gap | none directly — blocks #9/#11 | n/a — verified absent again this census (still no `supabase/config.toml`, no local CLI/Docker stack, no migration test runner) | unchanged since 091/092/093 | repo owner | **owner decision required** | 0 | owner must confirm a migration/deployment path before #9 can proceed | HIGH if bypassed | P1 (gates #9) |
| 11 | Dedicated drag-handle affordance | UI feature | move stays inaccessible until #9 lands | n/a | none yet | `RowColumnContainerCard.tsx` | prohibited before #9 (090/091 rulings, unchanged) | — | — | — | deferred with #9 |
| 12 | Existing-card move: source-parent removal | move-design sub-question | part of #9's atomicity contract | n/a | 089/090 findings | future RPC | part of #9 | — | must be specified in the future move-design patch | part of #9 | deferred with #9 |
| 13 | Destination-parent append | move-design sub-question | part of #9's atomicity contract | n/a | 089 static proof | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 14 | Child `parentId` update | move-design sub-question | part of #9's atomicity contract | n/a | not separately characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 15 | Duplicate-parent prevention | move-design sub-question | prevents a child from ending up double-linked mid-move | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 16 | Same-parent no-op | move-design sub-question | dropping a child back on its own container shouldn't write | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 17 | Failed-move atomic rollback | move-design sub-question | a failed move must not leave a half-applied state | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 18 | Rapid move serialization | move-design sub-question | two rapid moves of the same child must not race | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 19 | Reload after move | move-design sub-question | reload must reflect confirmed post-move state | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 20 | Move cancellation | move-design sub-question | user must be able to cancel a drag without a write | n/a | not characterized | future RPC | part of #9 | — | same | part of #9 | deferred with #9 |
| 21 | PATCH-088 runner browser/context-close setup flakiness | infra reliability | none (test-infra only) | still self-recovers on immediate retry every time it has genuinely occurred; NOT reproduced on demand; this review's own `ERR_CONNECTION_REFUSED` was reviewer/operator error, NOT this signature | runner correctly refuses to misclassify either kind | `e2e/run-carried-groups.mjs` / `auth.setup.ts` | not yet — see §11 | — | needs a stable, narrow signature distinguishable from operator error before any retry logic is added | a premature broad retry could mask real failures OR mask operator mistakes as product flakiness | LOW — record only |
| 22 | Remaining non-strict callers (position writes) | design, intentional | none — deliberately best-effort per 088 §4 | n/a | 088 §4 ruling | `DrawingLayout.tsx` ~956/966 | DEFER by design (unchanged) | — | — | — | deferred |
| 23 | Position-write best-effort family | design, intentional | same as #22 | n/a | 088 §4 ruling | `DrawingLayout.tsx` | DEFER by design (unchanged) | — | — | — | deferred |
| 24 | Broader seven-site canvas-ops error swallowing | design | mixed | n/a | none | multiple (`lib/domain/canvas/*`) | later dedicated contract patch | — | Result/throw consistency-wide ruling | MEDIUM | deferred |
| 25 | Result-versus-throw consistency (repo-wide) | design | none directly | n/a | none | multiple | later dedicated contract patch, same as #24 | — | one repo-wide convention ruling | MEDIUM | deferred |
| 26 | PATCH-081 | governance | none | n/a | RETIRED-BY-NOTE | — | n/a | — | — | none | no action, held (see §13) |
| 27 | Frame/sidebar sync | no characterized defect | none observed | no repro | 079/080 green | — | n/a | — | — | none | deferred |
| 28 | Line-follow behavior | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 29 | Uploaded-image storage cleanup | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 30 | AI images in presentation | feature | n/a | fixture-blocked | none | — | n/a | — | — | none | deferred |
| 31 | Overlap fallback | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 32 | Connections side-panel planning | feature | n/a | n/a | none | — | n/a | — | — | none | deferred — **explicitly NOT begun during stabilization** |
| 33 | New issue exposed by PATCH-093 | — | see #1 | — | — | — | — | — | — | — | folded into #1 (the only new issue: save-persistence is unverified) |

## 1. Comment EDIT save-persistence assessment (read-only inspection, bind)

Re-inspected `CommentRow.tsx` (unchanged since 091/093, blob
`4d9774a1030d67d67f192d97b81e7c56770fa02e`), `EmbeddedCommentList.tsx`
(unchanged, blob `7d116a289efa10a58a1a7f1d036f5e5b0db30e00`), and
`DrawingLayout.tsx` (unchanged since 092, blob
`ad4e8fd56fee633cd6322352f8a8d6310ca7e823`) at this base.

**Findings (read-only, no runtime seam used):**

- `CommentRow.tsx:116-122` (`handleSaveEdit`) — reads
  `editEditor.getHTML()`/`getText().trim()`; if the trimmed text is
  empty, returns WITHOUT calling `onSaveEdit` (empty/whitespace-only
  text is silently NOT saved — editing mode is left open, not
  cancelled). Otherwise calls `onSaveEdit(htmlContent)`.
- `CommentRow.tsx:124-128` (`handleKeyDown`) — `Enter` (no Shift)
  calls `e.preventDefault()` then `handleSaveEdit()`; `Escape` calls
  `onCancelEdit()` and clears the editor content. `Shift+Enter` is
  NOT intercepted — it falls through to TipTap/ProseMirror's own
  default Enter handling (expected to insert a newline via
  StarterKit, NOT confirmed at runtime by any prior patch).
- `CommentRow.tsx:170-174` (`onBlur`) — ALSO calls `handleSaveEdit()`
  whenever focus leaves the editing wrapper to a non-descendant
  target. This means BOTH `Enter` and a blur event can independently
  trigger a save — if a user presses Enter and focus then also
  shifts away (e.g. because the row remounts as `isEditing` flips to
  `false`), there is a PLAUSIBLE double-invocation window. This is
  bounded as a HYPOTHESIS requiring runtime characterization, not
  assumed as a proven defect.
- `EmbeddedCommentList.tsx:139-142` (`onSaveEdit` wiring) — calls
  `onEditComment?.(comment.id, text)` and IMMEDIATELY (synchronously,
  in the same tick) sets `editingCommentId` to `null`, closing edit
  mode. This happens BEFORE `handleUpdateChildComments` (an `async`
  function since 092) resolves — the editor visually closes and the
  row reverts to display mode showing the OLD (pre-edit) text until
  the strict update confirms and the parent's `comments` prop
  updates. This is the exact "editor exits before persistence
  confirmation" pattern Task 5 flagged for inspection. It is
  consistent with PATCH-092's confirm-then-show contract (no
  optimistic local mutation happens ANYWHERE in this chain — the
  only settlement point remains `onUpdatePadletStrict`'s own
  post-success merge) — but it has never been runtime-verified for
  the EDIT path specifically; 092 only proved this contract for ADD/
  REMOVE/RAPID.
- `DrawingLayout.tsx:577-582` (`onEditComment` wiring) — reads
  `existing` from the CURRENT `padlet.metadata.comments` closure
  value, maps the target comment's `text` to `newText` (spread,
  preserving `id`/`userId`/`userName`/`timestamp`/all other fields
  byte-for-byte), and calls
  `onUpdateChildComments(padlet.id, updatedArray, { field: 'comments' })`
  → `handleUpdateChildComments` (092's strict, awaited,
  single-catch handler, UNCHANGED by this patch). Only `text`
  changes; author/timestamp fields are structurally preserved by the
  spread, not independently reconstructed.
- `DrawingLayout.tsx:1959-1969` (`handleUpdateChildComments`, 092,
  unchanged) — the strict update is awaited; on throw, exactly ONE
  `console.error('Failed to update comment', error)`; no local
  mutation on failure; `metadata.comments` (or `detachedComments` per
  the `field` selector) is the only store touched — same channel and
  same contract 092 already proved for ADD/REMOVE/RAPID, now the
  EDIT caller specifically.

**Determination:** a one-file diagnosis spec CAN drive the full
Enter-to-save round-trip through real UI: visible edit → changed
text via the real contenteditable editor → Enter → passive wire
capture of the resulting comment-bearing write → persisted
`metadata.comments` readback → reload → comment ID/author-field
stability check → a SEPARATE Escape-after-a-real-text-change
contrast (093 only tested Escape on an UNedited comment). No failure
injection is required or authorized — the failure/error-ownership
question is answered by SOURCE inspection alone (Flow D below),
exactly the 090/092 precedent.

## 2. Intended edit-save invariant (bind, restated from PATCH-093 §2
for this patch's regression matrix)

**Initial:** self-owned comment exists; original text visible;
editor opens through a real Edit click; current text is loaded into
the editor (via `editEditor.commands.setContent(comment.text)`).

**Successful edit:** the user changes text through the real
contenteditable editor; `Enter` (no Shift) saves; comment `id`
remains stable; `userId`/`userName`/`timestamp` remain stable (no
product contract observed that updates a timestamp on edit — none
is authorized to be added by this patch); only the intended `text`
changes; exactly ONE coherent comment-bearing persistence write (or
one coherent sequence, if a double-invocation is found — see §1's
`onBlur`-plus-`Enter` hypothesis, which this spec must characterize
rather than assume away); local display settles consistently with
the strict channel's own post-success merge (confirm-then-show, 092
precedent); reload preserves the new text; no duplicate comment; no
lost write; `detachedComments` unchanged (untouched by this field).

**Shift+Enter:** inserts a newline if TipTap/StarterKit's default
behavior supports it (to be OBSERVED, not assumed); must NOT
prematurely save — `CommentRow.tsx`'s `handleKeyDown` does not
intercept `Shift+Enter`, so no explicit save call fires for it,
but the ACTUAL resulting DOM/editor content behavior is unverified
by any prior patch and must be recorded as an observation, not
skipped, IF this flow is included (see §4 — inclusion is
conditional, not mandatory).

**Escape:** cancels; the original CONFIRMED (persisted) text
remains — NOT a discarded in-progress edit masquerading as a save;
no comment-bearing write occurs. This must be tested AFTER a real
text change (093 only tested Escape with no text change made).

**Failure:** the last confirmed text remains visible (092's
existing invariant, now verified for this specific caller by source
inspection only — no injection); exactly one visible failure path
(`console.error`) through the UNCHANGED PATCH-092 channel; the
editor/display state must not falsely claim success (i.e., the
editor's synchronous close on `onSaveEdit` must NOT be
misinterpreted by an operator as proof of persistence — this patch
records that distinction explicitly in its evidence); no automatic
retry; no duplicate write.

## 3. Selected option (bind)

**OPTION A — comment EDIT save-persistence diagnosis.** Per Task
7's decision rule and this census's own P0 ranking (§0 row 1): the
real UI is fully reachable (093 proved the editor mounts and is
drivable); one new spec can characterize Enter-save, reload, ID/
author stability, and Escape-after-a-real-change cancellation; no
production change is needed to observe any of this; failure
injection is not required (the failure/error-ownership question is
answered by source inspection alone, reusing the already-proven 092
contract); the PATCH-092 strict channel is observed passively, not
modified. **Option C (PATCH-091 reconciliation) is NOT selected as
a separate patch** — per §9 below, PATCH-091's own wording already
scopes its EDIT finding to "did not appear within the observed
window," which is Interpretation A (bounded by the test's own
probe), not Interpretation B (a categorical claim) — no rewrite is
needed or authorized. Move design (#9/#10) remains correctly
deferred (§10). Runner hardening (Option F) does not meet the
bounded-signature bar and is further complicated by this review's
own operator-caused `ERR_CONNECTION_REFUSED`, which must NOT be
used as evidence (§11).

## 4. Regression/diagnosis spec (bind)

ONE new spec: `e2e/characterization/drawing-comment-edit-save.spec.ts`
(absent at base — absence gate). ONE active test, no `.only`,
`test.setTimeout(300_000)`, existing harness only
(`drawingBridgeHarness.ts`, unchanged), `registerDrawingCleanup(test)`
at module scope, per-board try/finally + zero-assertion cleanup.
Bound prefixes: `patch-064-harness-patch-094-comment-edit-save-a-` /
`-b-`.

- **Flow A (board a) — successful save:** real self-owned setup (a
  real ADD, `hasCurrentUserId` proof, 091/093 precedent); real Edit
  click; wait for the drivable editor (reuse 093's bounded-checkpoint
  pattern — do not assume immediate mount); change the text through
  the real contenteditable editor (a real keyboard/selection
  interaction, NOT `page.evaluate` DOM mutation); press `Enter`;
  passively capture the resulting comment-bearing write(s) (record
  the COUNT — do not assume exactly one, since §1's `onBlur`/`Enter`
  double-invocation hypothesis must be characterized, not assumed
  away); verify local display eventually shows the new text
  (confirm-then-show — do not assert an absolute timing claim that
  local display could not have updated before confirmation, same
  hedge as 092); verify persisted `metadata.comments` contains the
  new text; verify comment `id`/`userId`/`userName`/`timestamp`
  unchanged; reload; verify the new text persisted.
- **Flow B (board b) — Escape cancellation after a real text
  change:** real self-owned setup; real Edit click; change text
  through the real editor (same mechanism as Flow A); press
  `Escape`; assert ZERO comment-bearing writes occurred; assert the
  ORIGINAL (pre-edit) text remains displayed and persisted; reload;
  assert the original text, unchanged.
- **Flow C (optional, board a or b, CONDITIONAL) — Shift+Enter:**
  include ONLY if it can be added without destabilizing Flow A/B or
  exceeding the two-board bound; if included, verify no
  comment-bearing write occurs from the Shift+Enter keystroke alone
  and record whether a newline was observed in the editor content;
  if this flow would require a third board or risks exceeding the
  bound scope, SKIP it and record `not-attempted-within-bound-scope`
  rather than fabricating a result.
- **Flow D (source inspection, recorded in the review — not
  browser-driven):** re-derive from the fenced sources (`CommentRow.tsx`,
  `EmbeddedCommentList.tsx`, `DrawingLayout.tsx`) the exact findings
  in this patch's §1 — the `onBlur`/`Enter` dual-invocation
  possibility, the synchronous `editingCommentId` reset preceding
  persistence confirmation, the unchanged PATCH-092 single-catch
  contract for this caller specifically. Explicitly do NOT add a
  capture-phase listener, mutation observer, or any other
  instrumentation seam — if isolating a mechanism requires one, STOP
  and report it as a hard-stop condition (§15) instead.
- **Flow E (boards a and b) — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0 on both boards).

**Allowed classifications (bind — do not invent new ones without
governance approval):** `edit-save-consistent` |
`edit-save-lost-write` | `edit-save-duplicate-write` |
`edit-save-local-persisted-divergence` | `edit-cancel-consistent` |
`edit-cancel-writes-unexpectedly` | `edit-save-action-not-drivable` |
`mixed-edit-save-state`.

No `page.route`, no auth capture, no hidden-handler invocation, no
synthetic event dispatch, no failure injection, no `canvas_comments`
access, no attempt to FIX anything (diagnosis only — record
findings; do not patch `CommentRow.tsx`/`EmbeddedCommentList.tsx`/
`DrawingLayout.tsx`/PATCH-092's strict channel).

## 5. Allowed files (bind)

| File | Role | Starting state at base `4dc94a7` |
|---|---|---|
| `e2e/characterization/drawing-comment-edit-save.spec.ts` | NEW diagnosis spec | absent at base (absence gate) |

ONE file total. NO production file may be touched — this is a hard
stop condition (§15), not merely a preference. NO harness change, NO
config change, NO CanvasClient/useCanvasData/repository change, NO
package/lockfile change, NO migration/RPC, NO change to PATCH-092's
strict channel.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent at base,
HEAD, and worktree (verified again at this authoring — confirmed
absent); PATCH-095 not started (not yet reserved for any specific
successor).

## 6. Immutable fences (bind — count verified programmatically below)

Verify each with `git rev-parse 4dc94a7:<path>` and equality at the
current governance HEAD. Blob-ID method only. The 093 fence set (45)
PLUS the landed 093 spec itself (now must stay unchanged while this
patch runs) = **46**.

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
components/collabboard/canvas/layouts/DrawingLayout.tsx        ad4e8fd56fee633cd6322352f8a8d6310ca7e823
e2e/characterization/drawing-comment-strict-persistence.spec.ts f57b46ccf913244f85cbc206f70f6da34d439db6
components/collabboard/CommentRow.tsx                          4d9774a1030d67d67f192d97b81e7c56770fa02e
components/collabboard/editors/CommentEditor.tsx               e135acddbf067b0a63ada6f1a0412a5ac1361e0b
components/collabboard/EmbeddedCommentList.tsx                 7d116a289efa10a58a1a7f1d036f5e5b0db30e00
e2e/characterization/drawing-comment-edit.spec.ts              cdc90628ecdb12e70e5fa41d444688d1b3ccb481
```

**Fence-count consistency (bind — verified before authorization):**
raw entries = 46; unique paths = 46; unique path/blob pairs = 46;
duplicates = 0; malformed = 0. This count (46) is used consistently
in this header, §5's absence-gate cross-reference, the hard-stop
list (§15), and the final-report requirement (§17) — no other count
appears anywhere in this document.

## 7. Assessment: is a one-file diagnosis sufficient? (bind, per
Task 5's determination)

Yes. See §1's determination — the real UI is fully reachable for
Enter-save, Escape-after-a-change, passive wire capture, persisted
readback, reload, and ID/author stability; the failure/error-
ownership question is answered by source inspection alone (Flow D),
reusing PATCH-092's already-proven single-catch contract rather than
re-injecting a failure. No production change and no more than one
new file are required to characterize this fully.

## 8. Product interpretation carried forward (bind, unchanged from
PATCH-093 §17)

PATCH-093 disproved the earlier provisional assumption that the
DrawingLayout comment editor was categorically non-drivable — it
mounts and is drivable. This patch does NOT reopen that question. A
TipTap/transform/event-propagation/CSS production fix remains NOT
authorized absent a separately-proven user-visible failure. This
patch exists ONLY to close the remaining gap PATCH-093 explicitly
left open: PATCH-093 entered edit mode and cancelled via Escape on
an UNCHANGED comment — it never changed text and pressed Enter to
save, so the save round-trip itself remains unverified.

## 9. PATCH-091 reconciliation (bind)

Inspected PATCH-091.md's exact wording (unchanged, blob confirmed
via the §6 fence table): "the TipTap/ProseMirror editor surface did
not appear **within the observed window** — action-not-drivable for
a genuine UI reason" (PATCH-091.md, Final runtime findings, Flow B —
EDIT). This is **Interpretation A** — the editor was not observed
within THAT test's bounded probe — NOT Interpretation B (a
categorical claim that the product editor is non-drivable). **No
governance rewrite of PATCH-091 is authorized or needed.** PATCH-091's
ADD/REMOVE/RAPID evidence and its correctly-bounded EDIT observation
are RETAINED, unchanged, as historically accurate. PATCH-093's
closure record already contains the full cross-reference explaining
why 091 and 093 coexist without contradiction; this patch does not
duplicate that explanation, it only confirms — by direct re-reading
of 091's own text — that no further reconciliation action is
required. **Option C from the prior authorization protocol is
explicitly NOT selected or needed.**

## 10. Atomic move design status (revalidated, bind — unchanged)

Revalidated from current HEAD: the existing three-write client move
sequence remains unsafe/non-atomic (089/090 findings, unchanged); a
dedicated drag handle remains preferred once atomicity lands
(090-closure ruling, still holds); MODEL C (atomic Postgres RPC)
remains the preferred design; this repository still has NO local
Supabase CLI/config/migration-test tooling (re-verified again at
this census); no deployment/test ownership has been confirmed by the
owner since the 093 closure; SECURITY INVOKER remains preferred over
SECURITY DEFINER (unchanged rationale). **Move-atomicity design
remains DEFERRED, and stays behind comment EDIT save-persistence
characterization** — nothing in this census raises move's priority
above P1, and the comment EDIT save gap (P0, directly following from
093's own explicit scope limitation) remains more urgent.

## 11. Runner-hardening status (bind)

Separated per Task 11: (a) the GENUINE `page/context/browser closed`
setup-authentication failures recorded across the 090/091/092
reviews (three occurrences, always self-recovering on one retry, all
correctly NOT classified as auth-expiry) remain a STABLE, real
signature, re-ranked at the 092 closure as "ready for a narrowly-
scoped hardening patch" but not yet actioned; (b) the PATCH-093
review's `ERR_CONNECTION_REFUSED` was **NOT** this signature — it was
caused by the reviewer stopping the dev server before invoking the
runner (an operator/process-management error, not a browser/context/
page-close event, and not occurring against a live server at all).
**This operator error is explicitly excluded from consideration as
evidence for retry logic** — including it would risk building
hardening that masks server-unavailable conditions, which is exactly
the kind of arbitrary-failure-masking Task 11 prohibits. The genuine
signature from (a) remains at "ready" status; still not selected for
this patch (comment EDIT save-persistence is higher priority and
unrelated in mechanism).

## 12. Remaining strict-caller census (bind)

Re-searched `DrawingLayout.tsx` at this HEAD — no change from the
093 census: the two known families remain (a) the move-write
non-strict `onUpdatePadlet` calls at ~522/531 (part of the deferred
move-atomicity redesign, #9, not separable), and (b) the
intentionally best-effort position-write calls at ~956/966 (DEFER by
design per 088 §4, unchanged). No new un-flagged silent-loss caller
was found. The comment EDIT caller (`onEditComment` →
`handleUpdateChildComments`) is ALREADY on the strict channel since
092 — it is not a "remaining" candidate for a strict-channel swap;
this patch's question is whether that already-strict channel behaves
correctly end-to-end for EDIT specifically, which is a
characterization question, not a missing-strict-channel defect.

## 13. PATCH-081 and other deferred items (bind — unchanged)

`PATCH-081`: kept `RETIRED-BY-NOTE`, no action. Frame/sidebar sync,
line-follow behavior, uploaded-image storage cleanup, AI images in
presentation, overlap fallback, and Connections side-panel planning
all remain deferred, unchanged, absent new proof. **Connections
feature implementation is explicitly NOT begun during stabilization.**

## 14. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents; passive
listeners only (no `page.route`, no auth headers); sequential
`verify`/`build`, never under a dev server; never commit generated
artifacts; **stop the dev server only AFTER all Playwright-dependent
gates (focused spec, carried specs, the PATCH-088 runner) are
complete** — restated explicitly here because of the 093 review's
own operator-ordering mistake.

## 15. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (46/46), or any §5 absence gate differs;
- the diagnosis spec touches ANY production file (`CommentRow.tsx`,
  `EmbeddedCommentList.tsx`, `CommentEditor.tsx`, `DrawingLayout.tsx`,
  or any other);
- PATCH-092's strict channel (`onUpdatePadletStrict`,
  `handleUpdateChildComments`) is modified in any way;
- a hidden-handler call, `page.evaluate` state mutation, or synthetic
  event dispatch is needed to drive the edit-and-save flow;
- a direct database write is used as a substitute for the EDIT/save
  action itself (setup-only writes, as in prior patches, remain
  permitted for creating the target comment);
- failure injection or an instrumentation seam is needed to isolate
  a mechanism — record the limitation and STOP instead;
- a metadata-store migration or `canvas_comments` enters scope;
- move work enters comment-EDIT scope, or comment work enters move
  scope;
- more than the one bound file is touched;
- any carried spec's totals (089, 090, 091, 092, 093) drift from
  their bound values;
- cleanup cannot reach zero for any board;
- 091's or 092's or 093's evidence would need to be weakened or
  reinterpreted to make this spec pass;
- the §6 fence count disagrees between the raw block, this header,
  the absence-gate cross-reference, or the final-report requirement;
- `PATCH-095.md` exists before this patch is authorized to close.

## 16. Exclusions (bind)

Do not combine PATCH-094 with: atomic move implementation; broad
Result/throw error-contract migration; frame/sidebar; line-follow;
storage cleanup; AI images; overlap fallback; Connections side-panel
feature work; auth infrastructure changes; deep-clone work;
PATCH-081 cleanup. Do not revive
`e2e/characterization/drawing-slide-persistence.spec.ts` or
`.fable5/patches/PATCH-077-draft.md`.

## 17. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diagnosis spec +
report (blob re-derived; Flow A/B/C/D/E results; carried totals;
deterministic totals; 46-fence result; cleanup proof). The
independent read-only reviewer re-derives everything and must return
an explicit PASS before the implementer commits with the bound
message and pushes. CTO closes; a future production-fix patch
(Option B territory) is authored separately ONLY if this diagnosis
isolates a deterministic, boundable defect in the save round-trip.

## 18. Required final report

Exact one new path + final blob; Flow A/B/(C if attempted)/D/E
results including the exact classification chosen (from §4's bound
list only); carried totals (089/090/091/092/093 unchanged);
deterministic totals; 46-fence result + absence gates; cleanup
proof; explicit confirmations (no production file touched, no
PATCH-092 strict-channel change, no move-path edit, no injection, no
fabricated contrast surface, no hidden handler); commit hash + push
status after PASS.

## 19. Closure record (2026-07-20)

**Landed:** commit `aee4322aa36dcaac7a3b28443a21e19285e6db60`
(`test(e2e): characterize drawing comment EDIT save persistence
(PATCH-094)`), HEAD == origin/main at closure time. One file, exactly
as bound: `e2e/characterization/drawing-comment-edit-save.spec.ts`
(blob `7e7d8e05ef8203b87e011a16acfcdc912a7dbc70`, 891 lines).
Independent read-only review: **PASS**.

**Diagnosis question (carried from 093):** 093 proved the self-owned
DrawingLayout comment editor mounts and is genuinely drivable, but
093 only entered edit mode and cancelled via Escape — it never
changed text and pressed Enter to save. 094 was authorized to
characterize the real Enter-to-save round trip and an
Escape-after-a-real-change cancellation, while PATCH-092's strict
persistence channel had to remain completely untouched.

**Flow A — Enter save (final result):** the target comment was
created through real visible Add + Send actions; self-ownership
proven against `currentUserId`; Edit visible and enabled; a real
Edit click occurred; row-local `.ProseMirror[contenteditable="true"]`
mounted and was drivable; text was changed through the real
contenteditable editor; a real `Enter` key was used; **exactly one
comment-bearing PATCH occurred, response status 204**, in every one
of four independent live executions (1 dependency-mode + 1 no-deps/
JSON + 3 stability runs) — no duplicate Enter-plus-blur save
manifested in any run; comment `id` remained stable; `userId`
remained stable; `userName`/author representation remained stable;
timestamp presence remained stable; `detachedComments` remained
unchanged; local, persisted, and reload states agreed on the edited
text in every run; no duplicate comment; no lost write; no local/
persisted divergence. **Flow A classification: `edit-save-consistent`**,
stable across all runs.

**Flow B — Escape cancel (final result):** the editor was reopened
through the real visible Edit control; text was changed to a
genuinely different value through the real editor; a real `Escape`
key was used; **zero comment-bearing writes occurred** in every run;
the confirmed (originally saved) text was restored and remained
displayed; persisted `metadata.comments` remained unchanged; reload
remained unchanged; comment `id` remained stable; author remained
stable; `detachedComments` remained unchanged. **Flow B
classification: `edit-cancel-consistent`**, stable across all runs.

**Shift+Enter:** honestly recorded as `not-attempted-within-bound-scope`
in every run — no product-support claim was fabricated; skipping it
did not weaken Flow A or Flow B evidence, both of which were fully
driven through real UI independent of this flow.

**Final classification: `edit-save-consistent`**, stable across all
four independent executions performed during the review.

**Annotation:** `patch-094-drawing-comment-edit-save-evidence`,
present with all required fields in every run; no full HTML, auth
material, or unrelated payloads printed.

**Synchronous edit-mode-close ordering ruling (bind, precisely
worded):** source inspection (re-confirmed against the fenced,
unchanged `EmbeddedCommentList.tsx:139-142`) proves that `onSaveEdit`
invokes `onEditComment` and then SYNCHRONOUSLY clears
`editingCommentId` — the source does NOT await the downstream
strict persistence result before leaving edit mode. Runtime evidence
did NOT prove any failure arising from this ordering: across every
accepted run, the real Enter-save round-trip, persistence, and
reload were fully consistent. **This synchronous close is therefore
a CHARACTERIZED DESIGN RISK, not a proven user-visible defect** — no
production fix is authorized based on this ordering alone; a future
fix would require either a new proven failure or an explicit product
decision to await persistence before closing edit mode (neither
exists yet).

**Duplicate-save ruling (bind, precisely worded):** source inspection
found a plausible `Enter`-plus-`onBlur` double-invocation path (both
independently call `handleSaveEdit`). Runtime evidence across every
accepted run (4 independent executions) showed **exactly one
comment-bearing write** for the Enter-save action — the
double-invocation hypothesis did NOT manifest under real interaction
in this environment. **No duplicate-save fix is authorized** absent
a deterministic reproduction, which does not currently exist.

**Source/runtime separation:**
- *Runtime:* real Add/Edit/Enter/Escape actions in every run; one
  Enter comment-bearing PATCH with 204; zero Escape comment-bearing
  writes; stable ID, author, and timestamp-presence results; local/
  persisted/reload consistency; no duplicate, lost-write, or
  divergence evidence; `detachedComments` unchanged throughout.
- *Source:* Enter/Escape handling in `CommentRow.tsx`; `onSaveEdit`
  callback ordering and the synchronous `editingCommentId` clear in
  `EmbeddedCommentList.tsx`; the strict, awaited, single-catch
  `DrawingLayout.tsx` update path (092, unchanged); `metadata.comments`
  routing (unchanged); the possible Enter/`onBlur` double-save path
  (characterized as a risk, not confirmed as a defect); failure
  behavior remained source-only, since failure injection was
  correctly never authorized or used.

**Architecture preservation (confirmed):** diagnosis-only; one new
spec; zero production changes; `CommentRow.tsx`/`EmbeddedCommentList.tsx`/
`CommentEditor.tsx`/`DrawingLayout.tsx` byte-unchanged; PATCH-092's
strict channel untouched; no comment-persistence-store change; no
harness/config/package/lockfile change; no `page.route` or network
mutation; no hidden handler; no synthetic event dispatch; no failure
injection; zero `canvas_comments` access; no auth material captured.

**Final verification totals:**
- Focused PATCH-094: dependency mode 2 passed; `--no-deps` 1 passed;
  credential-off (`E2E_SKIP_CREDENTIALS=1`) 1 skipped; JSON reporter
  1 passed (output removed); three additional stable dependency-
  backed runs, all passed. One Enter comment-bearing write stable
  (204) in every run; zero Escape comment-bearing writes stable in
  every run; final classification stable at `edit-save-consistent`;
  zero cleanup residue in every run.
- Carried 093: passed; `editor-mounts-and-is-drivable`,
  `inside-comment-row`, and `not-reachable-through-existing-harness`
  all preserved exactly, no weakening of timing evidence.
- Carried 092: passed, strict comment persistence intact.
- Carried 091: passed; `mixed-comment-state` preserved; the original
  narrower EDIT probe remains unchanged; self-owned ownership proof
  remains valid.
- Carried 090: passed, atomic create-and-link intact.
- Carried 089: passed; `mixed-drop-state` preserved.
- PATCH-088 runner: 14/14 groups, 14/14 specs, all passed first try,
  0 auth-expiry incidents, 0 non-signature failures (the dev server
  was correctly kept running throughout this review's runner
  invocation — no operator error recurred).
- Deterministic: `git diff --check` passed; `tsc --noEmit` passed;
  `check:boundaries` passed; slideOrder 7/1; clonedPostMetadata 9/1;
  focused drawing 59/2; full Vitest 448/43; `npm run verify` passed;
  `npm run build` passed.
- Cleanup: all PATCH-094 prefixes reached zero (boards 0, padlets 0,
  canvasLines 0) in every run; no test-created comments or orphan
  rows remained; generated `test-results/.last-run.json` removed
  before commit; no other artifacts remained; ports 3000/4000 free;
  no repo-owned runtime process active at closure.

**46/46 fences:** unaffected by this patch's landing (the new spec is
the allowed file, not a fence entry); verified again at closure — 0
mismatches.

**Product interpretation (bind):** normal comment EDIT save is
CURRENTLY WORKING; normal Escape cancellation is CURRENTLY WORKING.
No production comment-EDIT fix is justified. No duplicate-save fix
is justified. No strict-persistence fix is required. No comment-store
migration is required. **PATCH-091, PATCH-093, and PATCH-094 together
now form a complete, non-contradictory evidence chain:** 091's
narrower probe genuinely did not observe the editor within its own
timeout/selector combination; 093 added timing checkpoints and
proved the editor mounts (with latency) and is drivable; 094 proved
a real save and a real cancel both round-trip correctly through
PATCH-092's strict channel. No historical runtime evidence from 091
or 093 is retired or rewritten by this closure — this closure adds a
cross-reference, it does not revise the record.

**Governance commit for this closure:** see CURRENT_TASK.md log
entry dated 2026-07-20 (PATCH-094 closure + PATCH-095 authorization).
