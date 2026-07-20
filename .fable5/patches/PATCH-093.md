# PATCH-093 — Comment EDIT UI Diagnosis (Drawing Layout)

**Status:** **DIAGNOSIS AUTHORIZED**. ONE new characterization
spec only. No production file may be touched. No move work, no
metadata-store migration, no `canvas_comments` scope, no TipTap
refactor.

**Implementer:** GPT-5.5. **Reviewer:** independent read-only
reviewer (explicit PASS required before commit).
**Closure:** Fable (CTO) after landing.

**Behavioral/source base commit AND implementation start HEAD (bind):**
`5f93ed54b7a643b17f0ffa849e873d71c07d1f85`
(`fix(drawing): strict comment persistence with visible failure
path (PATCH-092)`; HEAD == origin/main at authoring time)

**Bound implementation commit message (verbatim):**
`test(e2e): characterize drawing comment EDIT UI defect (PATCH-093)`

---

## 0. Fresh census (2026-07-20, from `5f93ed5`)

| # | Candidate | Class | User-visible impact | Deterministic repro | Coverage | Owner | Fix-ready? | Files | Ruling needed | Arch risk | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Comment EDIT UI defect (enabled button, editor surface doesn't appear)** | defect, root cause NOT isolated | editing an owned drawing-layout comment appears broken to the user (button responds, nothing visible happens) | reproduced twice (091 review, focused re-review) but not root-caused | 091 records symptom only; no source-level isolation yet | `CommentRow.tsx` / `EmbeddedCommentList.tsx` / possibly `DrawingLayout.tsx` wrapper | **diagnosis-first — SELECTED (this patch)** | 1 new spec | needs runtime isolation (mount lifecycle vs layout-transform vs event-propagation) before any fix is authorized | MEDIUM — could be test-timing, not a product bug | **P0** |
| 2 | Atomic cross-container move design | defect family (production) | moves can strand duplicate-parent/orphan half-states | affordance not drivable (089 Flow B); persistence path statically proven non-atomic | 089 diagnosis green | new Postgres RPC + repo/adapter/hook + `DrawingLayout` rewire | **NO — see #3** | ~4-5 files | RLS security model, migration deployment ownership | HIGH | P1 (blocked on #3) |
| 3 | Move migration/deployment tooling gap | infra/process gap, not a code defect | none directly — blocks #2/#4 | n/a — verified absent (no `supabase/config.toml`, no local CLI/Docker stack, no migration test runner) | verified again this census, unchanged since 091 closure | repo owner | **owner decision required, not implementable by this session** | 0 | owner must confirm a migration/deployment path (staging env or supervised prod window) before #2 can proceed | HIGH if bypassed | P1 (gates #2) |
| 4 | Dedicated drag-handle affordance | UI feature | move stays inaccessible until #2 lands | n/a | none yet | `RowColumnContainerCard.tsx` | prohibited before #2 (090-closure ruling, revalidated at 091 closure, still holds) | — | — | — | deferred with #2 |
| 5 | Existing-card move: source-parent removal | move-design sub-question | part of #2's atomicity contract | n/a — no current removal step exists (089/090 findings) | 089 static proof | future RPC | part of #2's design, not separable | — | must be specified in the future move-design patch | part of #2 | deferred with #2 |
| 6 | Destination-parent append | move-design sub-question | part of #2's atomicity contract | n/a | 089 static proof (`childPadletIds` append exists today, non-atomic) | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 7 | Child `parentId` update | move-design sub-question | part of #2's atomicity contract | n/a | not separately characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 8 | Duplicate-parent prevention | move-design sub-question | prevents a child from ending up double-linked mid-move | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 9 | Same-parent no-op | move-design sub-question | dropping a child back on its own container shouldn't write | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 10 | Failed-move atomic rollback | move-design sub-question | a failed move must not leave a half-applied state | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 11 | Rapid move serialization | move-design sub-question | two rapid moves of the same child must not race | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 12 | Reload after move | move-design sub-question | reload must reflect the confirmed post-move state | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 13 | Move cancellation | move-design sub-question | user must be able to cancel a drag without a write | n/a | not characterized | future RPC | part of #2 | — | same | part of #2 | deferred with #2 |
| 14 | PATCH-088 runner browser/context-close setup flakiness | infra reliability | none (test-infra only) | occurred a THIRD time this session (092 review); still self-recovers on immediate retry every time, still not reproduced on demand | runner already correctly refuses to misclassify it | `e2e/run-carried-groups.mjs` / `auth.setup.ts` | not yet — see §10 for the bounded-signature assessment | — | needs a stable, narrow signature before any retry logic is added | a premature broad retry could mask real failures | LOW — record only, reassessed §10 |
| 15 | Remaining non-strict callers (`onUpdatePadlet` at DrawingLayout ~956/966, best-effort position writes) | design, intentional | none — deliberately best-effort per 088 §4 ruling | n/a | 088 §4 ruling | `DrawingLayout.tsx` | DEFER by design (unchanged) | — | — | — | deferred |
| 16 | Broader seven-site canvas-ops error swallowing | design | mixed | n/a | none | multiple (`lib/domain/canvas/*`) | later dedicated contract patch | — | Result/throw consistency-wide ruling | MEDIUM | deferred |
| 17 | Result-versus-throw consistency (repo-wide) | design | none directly | n/a | none | multiple | later dedicated contract patch, same as #16 | — | one repo-wide convention ruling | MEDIUM | deferred |
| 18 | PATCH-081 | governance | none | n/a | RETIRED-BY-NOTE | — | n/a | — | — | none | no action, held (see §12) |
| 19 | Frame/sidebar sync | no characterized defect | none observed | no repro | 079/080 green | — | n/a | — | — | none | deferred |
| 20 | Line-follow behavior | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 21 | Uploaded-image storage cleanup | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 22 | AI images in presentation | feature | n/a | fixture-blocked | none | — | n/a | — | — | none | deferred |
| 23 | Overlap fallback | hardening | low | n/a | none | — | n/a | — | — | low | deferred |
| 24 | Connections side-panel planning | feature | n/a | n/a | none | — | n/a | — | — | none | deferred |
| 25 | New issue exposed by PATCH-092 | — | — | — | — | — | — | — | — | — | NONE — review found zero new issues |

## 1. Comment EDIT root-cause assessment (read-only inspection, bind)

Re-inspected `CommentRow.tsx` in full at this base (unchanged since
091, blob `4d9774a1030d67d67f192d97b81e7c56770fa02e`) and
`CommentEditor.tsx` (unchanged, blob
`e135acddbf067b0a63ada6f1a0412a5ac1361e0b`) — a SEPARATE modal
comment editor also used elsewhere in the app, not the drawing-
layout inline row UI. Confirmed `EmbeddedCommentList.tsx` (blob
`7d116a289efa10a58a1a7f1d036f5e5b0db30e00`) — which renders
`CommentRow` — is used by BOTH `DrawingLayout.tsx` (inside a
pan/zoom CSS-transformed canvas ancestor) AND `RowCanvas.tsx`
(`components/canvas/RowCanvas.tsx`, the older/separate canvas
system, NOT confirmed to sit inside an equivalent transform
ancestor) — this is new evidence not available at the 092 census
and directly bears on classification D below.

**Findings (read-only, no runtime seam used):**

- `CommentRow.tsx:59-76` — `useEditor({ immediatelyRender: false,
  ... })`. This defers the ProseMirror DOM view's creation by at
  least one render tick after hook initialization; the `editEditor`
  hook-return value itself is not gated on `isEditing`.
- `CommentRow.tsx:165-181` — `EditorContent` is rendered ONLY
  inside the `isEditing` conditional branch (not always-mounted-
  but-hidden). Entering edit mode therefore mounts a FRESH
  `EditorContent` DOM node against the SAME persistent `editEditor`
  instance on every edit-entry, rather than toggling visibility of
  an already-mounted node.
- `CommentRow.tsx:81-88` — a `useEffect` keyed on `[isEditing,
  comment.text, editEditor]` calls `editEditor.commands.setContent`
  then `setTimeout(() => editEditor.commands.focus('end'), 50)`
  when `isEditing` becomes true. This assumes `editEditor` is
  already non-null and its view is attached by the time this effect
  fires — plausible under normal render timing, but the 50ms
  `setTimeout` for focus is an unverified timing assumption that
  could interact badly with (a) the fresh `EditorContent` mount
  above still completing its own DOM attachment, or (b) the 60ms
  `shouldSelectText` timer in the adjacent effect (91-99) racing
  the same editor instance.
- `CommentRow.tsx:168-169` — `onMouseDown`/`onPointerDown` on the
  editing wrapper call `e.stopPropagation()`, but NOT
  `preventDefault()`. If any ancestor (the pan/zoom canvas transform
  layer in `DrawingLayout`, or a drag-handling listener on the card)
  attaches its own capture-phase pointer listener above this node,
  `stopPropagation` on the bubble phase would NOT stop it — a
  capture-phase canvas pan/drag listener could still fire and
  potentially blur or reset the newly-mounted editor before the
  operator/test observes it. This was NOT confirmed (would require
  runtime DOM/event-listener inspection), but it is a plausible
  DrawingLayout-specific mechanism consistent with classification D.
- `CommentRow.tsx:170-174` — `onBlur` auto-saves
  (`handleSaveEdit()`) whenever focus leaves the editing wrapper AND
  the new focus target is not a descendant. If the editor's DOM
  view attaches asynchronously (per `immediatelyRender: false`)
  AFTER the click that triggered `onStartEdit`, the initial focus
  could land nowhere inside the wrapper, then a subsequent
  browser-internal blur/focus cycle could fire `onBlur` before the
  editor is meaningfully visible — this is a plausible mechanism
  for classification E (state reset via event propagation), also
  not confirmed at the source level alone.
- No portal usage was found in either file — `EditorContent` mounts
  in-place in the DOM tree, so classification "editor mounted
  outside the expected subtree" (a portal-related cause) is
  UNLIKELY but not fully excluded without a runtime DOM query.
- No memoization (`React.memo`, custom `useMemo`-wrapped row
  components) was found wrapping `CommentRow` at its `EmbeddedCommentList`
  call site that would explain a stale-props-masking-a-remount
  effect; `key={comment.id}` usage was not independently re-verified
  at the `EmbeddedCommentList` call site in this pass — flagged as
  an open question for the diagnosis spec's source-inspection flow,
  not resolved here.

**Cause classification:** NOT deterministically isolated by static
reading alone. The most plausible mechanisms are **C (TipTap mount
lifecycle: fresh `EditorContent` mount + `immediatelyRender:false`
deferred view creation, racing the 50ms/60ms `setTimeout` calls)**
and **D (transformed-canvas / capture-phase event-propagation
interaction, DrawingLayout-specific — supported by the new
`RowCanvas` contrast evidence above, since `RowCanvas` does not
share the same pan/zoom ancestor)**. **B (091's own selector/timing
defect)** is considered LESS likely after the corrected 091 review
already ruled out the ownership artifact and used real UI
interactions, but is not fully excluded without re-deriving the
091/092-era selector logic against actual runtime DOM state. **A**
(deterministic product defect unrelated to timing/environment) and
**F** (editing genuinely unsupported in this layout by design) are
NOT supported by any evidence gathered — nothing in the source
indicates editing was deliberately disabled for this layout; the
`canEdit`/`disabled` gate exists specifically to ALLOW self-owned
editing.

**Per Task 4's binding instruction, a production fix is NOT
authorized** — the cause is not isolated to a single deterministic
mechanism. This patch authorizes DIAGNOSIS ONLY.

## 2. Intended comment EDIT invariant (bind, for future fix work)

**Initial state:** self-owned comment exists; Edit control enabled;
comment text visible.

**Editing state:** click Edit enters edit mode; the editor is
visible AND focusable within a bounded wait; current text is
loaded into it; Save and Cancel (Enter/blur-to-save, Escape-to-
cancel per current handlers) controls are usable; no unrelated
comment changes occur as a side effect of entering edit mode.

**Successful save:** comment `id` remains stable; only `text`
changes (no product contract observed that allows a timestamp
update on edit — none is currently implemented, and none is
authorized by this patch); `metadata.comments` persists the edited
text; `detachedComments` remains unchanged; reload preserves the
edited text; exactly one comment-bearing write or one coherent
persistence sequence occurs; no duplicate comment is created.

**Cancel:** original text is restored; no persistence write occurs;
no local divergence between UI and persisted state results.

**Failure:** the last confirmed text remains visible; exactly one
visible error is emitted; no silent loss occurs; no automatic
retry occurs.

This invariant is recorded for whichever future patch authorizes a
production fix (Option B territory, NOT this patch) — it is NOT
implemented or verified as a regression contract by PATCH-093,
which only characterizes the current (broken) behavior.

## 3. Selected option (bind)

**OPTION A — comment EDIT UI diagnosis.** Per Task 6's decision
rule and the standing instruction not to authorize a fix without an
isolated cause, and per the census's own P0 ranking (§0 row 1).
Options C/D/E/F are not selected: move design (#2/#3 in the census)
remains correctly blocked on the owner's deployment-plan decision
per the 091/092 closures — nothing in this census changes that;
runner hardening (Option E) is assessed in §10 below and does not
yet meet the bounded-signature bar; no other strict-caller
candidate was found smaller or more urgent than the EDIT defect
(§11 below).

## 4. Regression/diagnosis spec (bind)

ONE new spec: `e2e/characterization/drawing-comment-edit.spec.ts`
(absent at base — absence gate). ONE active test, no `.only`,
`test.setTimeout(300_000)`, existing harness only
(`drawingBridgeHarness.ts`, unchanged), `registerDrawingCleanup(test)`
at module scope, per-board try/finally + zero-assertion cleanup.
Bound prefixes: `patch-064-harness-patch-093-comment-edit-a-` /
`-b-`.

- **Flow A (board a, DrawingLayout) — self-owned EDIT drivability:**
  seed a self-owned comment through a real ADD action (091/092
  precedent — never seed ownership artificially); prove
  self-ownership via `hasCurrentUserId` (`supabase.auth.getUser()`,
  091/092 precedent); assert the Edit button is present and
  `enabled=true`; real click on Edit; observe and record (without
  assuming success) whether: (a) the TipTap/ProseMirror editor DOM
  node (`.ProseMirror` or the `EditorContent` wrapper class) appears
  anywhere in the page within a bounded wait; (b) if it appears,
  whether it is focusable and whether the original comment text is
  loaded into it; (c) whether `isEditing`-adjacent UI state (the
  Save/Cancel-equivalent affordances — this UI auto-saves on blur
  and auto-cancels on Escape, there are no dedicated Save/Cancel
  buttons, per the current source) responds to a real keystroke; (d)
  whether a comment-bearing `PATCH` occurs at all during this flow.
  No hidden-handler invocation, no synthetic event dispatch — every
  interaction goes through the real DOM via the harness's existing
  Playwright locators.
- **Flow B (board b, contrast layout) — DrawingLayout-specific vs.
  global:** repeat the same self-owned-ADD-then-EDIT sequence
  against a comment rendered through a DIFFERENT call site of
  `EmbeddedCommentList`/`CommentRow` if one is reachable through the
  existing e2e harness without adding new fixtures or a new
  authorized surface (e.g. a non-drawing board's row/column
  container, if the harness can reach one already) — this flow is
  CONTRAST-ONLY and MUST be recorded as `not-reachable-through-existing-harness`
  rather than fabricating a new entry point if no such surface is
  already drivable by the current harness. Do not add scaffolding
  to force a contrast surface into existence — record `not-reachable`
  and rely on Flow C's static analysis instead if so.
- **Flow C (source inspection, recorded in the review — not
  browser-driven):** re-derive from the fenced sources (`CommentRow.tsx`,
  `CommentEditor.tsx`, `EmbeddedCommentList.tsx`) the exact findings
  in this patch's §1 — `immediatelyRender: false`, the conditional
  `EditorContent` mount, the `setTimeout` calls and their durations,
  the `stopPropagation`-without-`preventDefault` pattern, the
  `onBlur` auto-save condition — and confirm none of these sources
  changed from the blobs bound in §6. Explicitly do NOT attempt to
  add a capture-phase listener, a DOM mutation observer hook, or any
  other instrumentation seam not already present — if isolating the
  exact mechanism requires such a seam, STOP and report it as a
  hard-stop condition (see §9) rather than adding one.
- **Flow D (boards a and b) — cleanup zero-assertions**
  (`assertDrawingFixtureCleanup` 0/0/0 on both boards).

**Allowed classifications (bind — do not invent new ones without
governance approval):** `editor-mounts-and-is-drivable` |
`edit-state-set-but-editor-not-mounted` |
`editor-mounted-outside-expected-subtree` |
`edit-state-immediately-reset` | `drawing-layout-only-edit-defect` |
`global-comment-edit-defect` | `action-not-drivable` |
`mixed-edit-state`.

No `page.route`, no auth capture, no hidden-handler invocation, no
synthetic event dispatch, no failure injection, no `canvas_comments`
access, no attempt to FIX the defect (diagnosis only — record
findings, do not patch `CommentRow.tsx`/`CommentEditor.tsx`/
`EmbeddedCommentList.tsx`/`DrawingLayout.tsx`).

## 5. Allowed files (bind)

| File | Role | Starting state at base `5f93ed5` |
|---|---|---|
| `e2e/characterization/drawing-comment-edit.spec.ts` | NEW diagnosis spec | absent at base (absence gate) |

ONE file total. NO production file may be touched — this is a
hard stop condition (§9), not merely a preference. NO harness
change, NO config change, NO CanvasClient/useCanvasData/repository
change, NO package/lockfile change, NO migration/RPC.

**Absence gates:** the new spec absent at base and worktree before
implementation; `e2e/characterization/drawing-slide-persistence.spec.ts`
AND `.fable5/patches/PATCH-077-draft.md` permanently absent at
base, HEAD, and worktree (verified again at this authoring —
confirmed absent); PATCH-094 not started (not yet reserved for any
specific successor — see §12).

## 6. Immutable fences (bind — 45, Git blob IDs)

Verify each with `git rev-parse 5f93ed5:<path>` and equality at the
current governance HEAD. Blob-ID method only. The 092 fence set
(40) PLUS the landed 092 production file and spec (2), PLUS the
three comment-UI files newly read during this census
(`CommentRow.tsx`, `CommentEditor.tsx`, `EmbeddedCommentList.tsx`)
— all of which this patch reads but must NOT modify. **40 + 2 + 3 =
45.**

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
components/collabboard/canvas/hooks/useCanvasData.ts            2e158f1278a395b5028083e8f387a22e4daf5b60
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
components/collabboard/CommentRow.tsx                           4d9774a1030d67d67f192d97b81e7c56770fa02e
components/collabboard/editors/CommentEditor.tsx                e135acddbf067b0a63ada6f1a0412a5ac1361e0b
components/collabboard/EmbeddedCommentList.tsx                  7d116a289efa10a58a1a7f1d036f5e5b0db30e00
```

## 7. Atomic move design status (revalidated, bind — unchanged)

Revalidated from current HEAD: the existing three-write client
move sequence remains unsafe/non-atomic (089/090 findings, unchanged
— DrawingLayout is byte-identical on this path since 090); a
dedicated drag handle remains preferred over whole-card drag once
atomicity lands (090-closure ruling, still holds — no new evidence
changes it); MODEL C (atomic Postgres RPC) remains the preferred
design; this repository still has NO local Supabase CLI/config/
migration-test tooling (re-verified: `supabase/config.toml` absent,
no `.supabase/` directory, no migration test script in
`package.json`); no deployment/test ownership has been confirmed by
the owner since the 091 closure; SECURITY INVOKER remains preferred
over SECURITY DEFINER for the future RPC (unchanged rationale —
existing `padlets` UPDATE RLS already scopes access via
`auth.uid()`). **A design-only governance patch for move-atomicity
remains DEFERRED behind the comment EDIT diagnosis** — nothing in
this census raises its priority above P1, and the comment EDIT
defect (P0, user-visible, currently blocking a core interaction)
remains the more urgent unresolved item. The move track resumes as
soon as (a) this diagnosis-then-fix cycle for comment EDIT
completes, AND (b) the owner confirms a deployment plan.

## 8. Migration/deployment ruling (bind — unchanged)

No change from the 092-closure ruling: no `supabase/config.toml`,
no local Supabase CLI/Docker stack, no migration test runner wired
into `package.json` or CI, as re-verified at this base. The standing
rule stands unmodified — no patch may be authorized that assumes an
RPC exists in production without an owner-confirmed migration/
deployment plan.

## 9. Runner-hardening assessment (bind)

The `page/context/browser closed` during setup-authentication
failure has now been observed on THREE separate occasions across
the 090, 091, and 092 independent reviews — always on the FIRST
attempt of a fresh run, always cleared by an immediate retry, never
matching the bound `AUTH-EXPIRY (INFRASTRUCTURE)` signature (which
requires a timeout marker + locator/wait context +
`getByTitle('Back to Dashboard')` + harness/`openDrawingBoard`
context — none of which co-occur with this failure). This is now a
STABLE, repeatedly-observed signature: `auth.setup.ts` project,
`page.goto`/context-close error text, occurring before any product
spec starts, self-resolving on one retry every time it has been
seen. Per Task 10's bound conditions (setup/auth project only, no
product spec started, one retry maximum, no masking of arbitrary
failures), this candidate is CLOSE to meeting the bounded-signature
bar. It is NOT selected for PATCH-093 (the comment EDIT defect is
higher priority and unrelated in mechanism), but it is now
RE-RANKED from "insufficient signal" to "ready for a narrowly-
scoped hardening patch" — a future PATCH may add exactly ONE bounded
retry to `e2e/run-carried-groups.mjs`'s (or `auth.setup.ts`'s own)
setup step, gated on this exact signature, with a hard cap of one
retry and no broadening beyond the setup/auth project. This is
recorded as the SECOND priority candidate after comment EDIT (see
§0 row 14, priority raised from LOW to a recorded "ready" state, not
yet actioned).

## 10. Remaining strict-caller census (bind)

Searched `DrawingLayout.tsx` at this HEAD for all `onUpdatePadlet(`/
`onUpdatePadletStrict(` call sites:

| Line(s) | Channel | User action | Failure consequence | Characterization | Strict channel available? | Scope | Priority |
|---|---|---|---|---|---|---|---|
| ~522, ~531 | non-strict `onUpdatePadlet`, awaited | existing-card cross-container MOVE (two-write parent update sequence) | can strand duplicate-parent/orphan half-states on failure | 089 diagnosis (`mixed-drop-state`) | yes, but rewiring this IS the move-atomicity redesign (#2 in §0), not a standalone strict-caller swap | part of #2, not separable | deferred with #2 |
| ~956, ~966 | non-strict `onUpdatePadlet`, fire-and-forget | free-drag position updates (`position_x`/`position_y`) | a lost position write silently reverts on next load; intentionally best-effort per 088 §4 | 088 §4 ruling | yes, but a strict rewire here would add latency to every drag frame — explicitly ruled out by design at 088 | DEFER by design (unchanged) | deferred |
| ~282, ~1027, ~1531, ~1964 | `onUpdatePadletStrict`, awaited | container link (090), snapshot save (087), duplicate/clone (086-era), comment persistence (092) | already strict — no candidate here | 086/087/090/092 all reviewed PASS | n/a | n/a | n/a — already fixed |

No new un-flagged silent-loss caller was found in `DrawingLayout.tsx`
beyond the two already-known and already-ruled-on families (#2 move,
and the by-design best-effort position writes). No bundling is
proposed — both remaining candidates are either gated on a larger
design decision (#2) or explicitly excluded by an existing ruling
(088 §4).

## 11. PATCH-081 and other deferred items (bind — unchanged)

`PATCH-081`: kept `RETIRED-BY-NOTE`, no action. Frame/sidebar sync:
kept deferred, no deterministic repro since 079/080. Kept deferred,
unchanged, absent new proof: line-follow behavior, uploaded-image
storage cleanup, AI images in presentation, overlap fallback,
Connections side-panel feature planning.

## 12. Hard stop conditions (bind)

STOP immediately, report, do not commit, if:

- base commit, any §6 fence (45/45), or any §5 absence gate differs;
- the diagnosis spec touches ANY production file (`CommentRow.tsx`,
  `CommentEditor.tsx`, `EmbeddedCommentList.tsx`, `DrawingLayout.tsx`,
  or any other) — comment-persistence scope must NOT drift into
  EDIT-diagnosis scope by accident and vice versa;
- a metadata-store migration or `canvas_comments` enters scope;
- move work enters comment-EDIT scope;
- a hidden-handler call or synthetic event dispatch is needed to
  drive the flow;
- failure injection or an instrumentation seam (mutation observer,
  capture-phase listener, etc.) is needed to isolate the mechanism —
  record the limitation and STOP instead;
- a broad TipTap refactor is required to observe the defect;
- more than the one bound file is touched;
- any carried spec's totals (089, 090, 091, 092) drift from their
  bound values;
- cleanup cannot reach zero for any board;
- 091's or 092's evidence would need to be weakened or reinterpreted
  to make this spec pass.

## 13. Exclusions (bind — unchanged)

Do not combine PATCH-093 with: move persistence work; comment
persistence rewrite (092 is closed and must not be reopened absent
a real regression); broad Result/throw error-contract migration;
frame/sidebar; line-follow; storage cleanup; AI images; overlap
fallback; Connections side-panel feature work; auth infrastructure
changes; deep-clone work; PATCH-081 cleanup. Do not revive
`e2e/characterization/drawing-slide-persistence.spec.ts` or
`.fable5/patches/PATCH-077-draft.md`.

## 14. Environment contract (binding, unchanged)

Self-started `npm run dev -- --port 3000` + explicit `PW_BASE_URL`;
port discipline; auth refresh only via `--project=setup` or the
PATCH-088 runner's bounded recovery; no credential contents; passive
listeners only (no `page.route`, no auth headers); sequential
`verify`/`build`, never under a dev server; never commit generated
artifacts.

## 15. Review and commit flow (bind)

Implementer delivers the uncommitted ONE-file diagnosis spec +
report (blob re-derived; Flow A/B/C/D results; carried totals;
deterministic totals; 45-fence result; cleanup proof). The
independent read-only reviewer re-derives everything and must
return an explicit PASS before the implementer commits with the
bound message and pushes. CTO closes; a future production-fix patch
(Option B territory) is authored separately ONLY if this diagnosis
isolates a deterministic, boundable cause.

## 16. Required final report

Exact one new path + final blob; Flow A/B/C/D results including the
exact classification chosen (from §4's bound list only); carried
totals (089/090/091/092 unchanged); deterministic totals; 45-fence
result + absence gates; cleanup proof; explicit confirmations (no
production file touched, no move-path edit, no comment-persistence-
path edit, no CanvasClient/hook/config/harness/migration change, no
injection, no fabricated contrast surface); commit hash + push
status after PASS.
