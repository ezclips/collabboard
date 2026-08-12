# Canonical Comment UI Contract v1

## Freeze status

CANONICAL NORMAL COMMENT UI: **FROZEN**
REFERENCE IMPLEMENTATION: **CLIPART**
CANONICAL COMPONENT: `components/collabboard/editors/CommentPopup.tsx`
CANONICAL IMPLEMENTATION SHA: `6ddc31c84f1574387d6dc51a4c43ab3e8e261136`
FREEZE DATE: **2026-08-12**

This document freezes the current accepted Clipart behavior. It is a product
and architecture contract, not a redesign proposal. The implementation SHA is
the last accepted production checkpoint; the freeze commit contains only this
contract and regression/architecture guards.

## Canonical ownership

The two live Clipart entry points use one implementation:

1. Clipart editor: `components/collabboard/editors/ClipartCardDraftModal.tsx`
   renders `CommentPopup` for the draft's `metadata.detachedComments`.
2. Saved Clipart comment counter: the card/Clipart branch in
   `components/collabboard/canvas/ui/FreeformPadletCards.tsx` renders the same
   `CommentPopup` beside the post and persists through the same detached
   comments adapter.

The shell and persistence callbacks are caller-owned. The comment rows,
composer, editing, selection styling, picker, link authoring, and action
behavior are owned by `CommentPopup`. Supporting shared ownership is:

- `components/collabboard/editors/useAnchoredPopover.ts`
- `components/collabboard/editors/TextStylePopup.tsx`
- `components/collabboard/commentLinkSafety.ts`
- `@tiptap/extension-link` and the TipTap extensions in `CommentPopup.tsx`

The toolbar-open Clipart block in `FreeformPadletCards.tsx` is retained as
historical/dead source characterization: `cardToolbarPadletId` has no live
non-null setter. It is not a third live Clipart entry point.

## Frozen behavior matrix

| Area | Frozen contract |
| --- | --- |
| Panel shell | Saved Clipart's counter opens Comments directly beside the post, at the accepted small gap and final position. Opening/closing does not move or resize the post, pan the canvas, or center/reposition the panel. The panel may extend beyond the viewport and remains normally scrollable. |
| Interaction island | The panel and its controls stop the click/mousedown/pointer interaction paths that would drag/select the post, pan the canvas, open the editor, or close Comments. Wheel, selection, links, pickers, buttons, and composer remain inside the island. |
| Title | Defaults to `Comments`; supports inline editing, Enter/blur save, Escape cancel, empty fallback, persisted text color and highlight, and the same `TextStylePopup` used by comment styling. |
| Composer | `[ Add a comment... ] [ Send ]`; Send is immediately beside the input, has accessible name/title `Send`, and Enter and Send share submission behavior. Trimmed non-empty text is persisted, displayed immediately, clears the input, updates the count, and leaves the panel open. Whitespace is not submitted. |
| Row | Each row owns its avatar/initial, user/name, relative timestamp, content, spacing, and action controls. Delete and all mutations target the clicked comment id; sibling rows remain unchanged. |
| Direct selection | Saved read-only comment text can be selected directly without entering Edit. The selection belongs to one row, does not edit/delete text, activates the relevant styling state, and cannot move the post. |
| Edit/style transition | With no valid selection, Edit is available. A non-empty selection changes the relevant action to Color/Text Style. Clearing the selection returns to Edit. The former Edit → Color → select workflow is not canonical. |
| Foreground color | Applies immediately to the selected range only; unselected text is unchanged and no second click or reopen is required. |
| Highlight | Applies to the selected range and coexists with foreground color. Changing one does not erase the other. |
| Link | Selected text is preserved and linked while the rest of the comment is preserved. URLs persist as rendered anchors, open safely in a new tab with `_blank` and `noopener,noreferrer`, and link clicks do not reach the post/canvas. The popover remains attached to the Comments panel and flips at the viewport edge. |
| Strikethrough | Uses the current selected-range TipTap behavior and persists immediately through the comment update callback. No alternate Clipart implementation may replace it. |
| Delete | Deletes only the selected row, persists, and leaves the panel stable/open. |
| Pickers | Foreground and highlight use the shared `TextStylePopup`, existing palette and opacity behavior, and the accepted panel-edge gap/flip. They remain attached to Comments rather than becoming independent surface-specific pickers. |
| Position invariant | Opening, using, and closing Comments must preserve the Clipart post's x/y position. |

## Architecture rules

Normal post comments have one canonical UI. A future post supplies only comment
data, persistence/update callbacks, and any genuinely post-specific shell or
anchor. It must not recreate comment-row JSX, an action rail, composer, Send,
selection engine, color picker, link editor, or link popover.

Storage differences belong below the UI boundary:

```text
post-specific storage → thin adapter/callbacks → CommentPopup
```

Highlighted/source-text anchored comment threads remain a special controller
and persistence case. They are not declared equivalent to normal post
comments by this freeze and are a later adapter migration.

### Migration status

CANONICAL:

- Clipart
- Image
- Note — normal/detached comments

NOT YET MIGRATED:

- Note — anchored/highlighted threads (special storage adapter required)
- Document
- Drawing
- AI Component
- Link
- Todo
- Comment post
- Container
- other normal-comment surfaces identified by future audits

Image is now canonical at all three live entry points: the Freeform Image
comment badge, the Freeform Image toolbar, and the non-Freeform Image toolbar
in `app/dashboard/canvas/[id]/CanvasClient.tsx`. All three retain the existing
`metadata.detachedComments` storage through thin callbacks and use the
canonical component for comment content and controls.

Normal Note detached comments are now canonical at the Note editor popup, the
Freeform Note badge popup, and the Freeform Note toolbar popup. They retain
`metadata.detachedComments` through thin callbacks and use `CommentPopup` for
all normal comment rows, editing, composer, styling, links, and deletion.
Highlighted/anchored Note threads remain on their TipTap mark/thread storage
and controller path and are intentionally not part of this migration.

Other non-Clipart surfaces are intentionally not made to comply by this patch.
A migration moves a post from the second list to the first only after all of
its live entry points, adapters, and contract tests are added.

## Governance unlock rule

Any intentional modification to the frozen normal comment UI must declare:

`COMMENT UI CONTRACT UNLOCK`

and state exactly what changes. Examples:

- `COMMENT UI CONTRACT UNLOCK — COMPOSER`
- `COMMENT UI CONTRACT UNLOCK — LINK`
- `COMMENT UI CONTRACT UNLOCK — TITLE`
- `COMMENT UI CONTRACT UNLOCK — COLOR PICKER`

Without an explicit unlock, changes to frozen behavior are prohibited.

## Permanent guards and master suite

The master architecture/contract suite is:

- `components/collabboard/canonicalCommentPanel.contract.test.tsx`

It guards both Clipart entry points, one `CommentPopup` ownership, absence of
local Clipart row/action/composer/color/link implementations, the migration
allowlist, and the existence of the focused behavioral suites. The focused
behavior suites remain the executable coverage for composer/Send and Enter
parity, title, interaction isolation, direct selection, Edit/Color switching,
range color/highlight/strikethrough, links and safe opening, delete isolation,
picker/link anchoring, and height/position discipline:

- `components/collabboard/editors/CommentPopup.clipartContract.test.tsx`
- `components/collabboard/editors/CommentPopup.colorAndLink.test.tsx`
- `components/collabboard/editors/CommentPopup.colorHighlightReactivity.test.tsx`
- `components/collabboard/editors/CommentPopup.heightDiscipline.test.tsx`
- `components/collabboard/editors/useAnchoredPopover.test.tsx`
- `components/collabboard/commentLinkSafety.test.tsx`

The migration characterization suites are:
`components/collabboard/freeformCommentUIContract.characterization.test.tsx`
for Image and `components/collabboard/noteDetachedCommentUIContract.test.tsx`
for normal/detached Note comments. The Note suite explicitly guards the
anchored/highlighted thread boundary.

The permission suites (PATCH 8O.1 / 8O.2) are:

- `lib/domain/canvas/comments.test.ts` -- `resolveCommentAccessMode`,
  `isOwnComment`, `canMutateComment`, `guardCommentMutation`,
  `guardCommentComposition`, and `guardOwnCommentMutation` unit coverage.
- `components/collabboard/editors/CommentPopup.accessMode.test.tsx` -- the
  read/manage mode mounted contract (25 items: 17 read-mode, 8 manage-mode).
- `components/collabboard/editors/CommentPopup.commentMode.test.tsx` -- the
  'comment'-mode mounted contract (23 items: own-comment capabilities,
  other-user restrictions, panel-level restrictions, legacy/forged-call
  safety).
- `lib/infra/canvas/commentMutations.test.ts` -- the RPC-backed persistence
  path for 'comment'-mode mutations: correct payload shape, fail-safe
  behavior (no optimistic mutation before the RPC resolves, `toast.error` on
  failure, server-truth application on success).
- `components/collabboard/canonicalCommentPermission.contract.test.tsx` --
  every canonical caller passes an explicit `accessMode`/`commentAccessMode`
  prop and wraps its comment mutation callbacks with the correct guard
  (`guardCommentMutation` for manage-only panel props,
  `guardCommentComposition` for composing a new comment,
  `guardOwnCommentMutation` for mutating an existing one); fails if any
  canonical caller silently omits the access contract.

## Canonical comment permission contract

`COMMENT UI CONTRACT UNLOCK — PERMISSIONS ONLY` (PATCH 8O.1, extended by
PATCH 8O.2). Permission gating only; no visual redesign. The frozen behavior
matrix above still describes the writable ("manage") experience byte-for-byte
-- this section is additive.

`CommentPopup` accepts an explicit `accessMode?: CommentAccessMode` prop
(`'read' | 'comment' | 'manage'`, defined in `lib/domain/canvas/comments.ts`),
defaulted to `'manage'` so every existing consumer that has not been updated
keeps its exact current behavior.

READ:

- view the panel, title, and comment count
- read existing comments (avatar/name/timestamp/formatted text)
- select and copy comment text
- open existing safe links (`_blank`, `noopener,noreferrer`)
- Close
- zero mutation: no composer, no Send, no Enter-to-submit, no Edit, no
  Color/Highlight, no Link authoring, no Strikethrough, no Delete, no title
  editing or title styling, no Badge Color

COMMENT (PATCH 8O.2):

- everything READ allows, for every comment regardless of author
- composer and Send are visible; a new comment can be added
- for a comment this user themselves authored ("own"): Edit, Color/Highlight,
  Link authoring, Strikethrough, and Delete are all available
- for another user's comment: none of the above are reachable -- the entire
  per-row actions rail does not render for that row (same "not rendered, not
  merely disabled" principle as READ mode), and every internal mutation path
  independently re-checks ownership too (see Defense in depth below)
- title editing, title styling, and Badge Color remain unavailable (MANAGE-only)

MANAGE:

- the current frozen canonical Comment UI v1 capabilities, unchanged: full
  authoring rights over every comment regardless of author, plus title
  editing/styling and Badge Color

### Ownership semantics

Ownership is decided by `canMutateComment(accessMode, comment, currentUserId)`
(`lib/domain/canvas/comments.ts`), which in turn calls `isOwnComment`. The
rule is based ONLY on persisted identity:

```text
comment.userId === currentUserId
```

Never inferred from displayed user name, avatar, comment index/position, or
any other browser-observable state. A legacy comment with a missing or
empty-string `userId` can be read by a COMMENT-mode user but never mutated,
even if `currentUserId` also happens to be falsy -- two absent ids are never
treated as a match. `canMutateComment('manage', ...)` is unconditionally
`true` regardless of ownership (frozen management rights); `canMutateComment
('read', ...)` is unconditionally `false`.

**Authorization state must be explicit. Callback presence is never
authorization.** `CommentPopup` does not infer read-only (or comment-only, or
ownership) from whether a mutation prop (`onEditComment`, `onCommentColor`,
etc.) was supplied -- several existing non-canonical consumers omit props for
reasons unrelated to permission. The explicit `accessMode` prop (plus
`currentUserId`, already an existing prop, now load-bearing for ownership) is
the only accepted signal. **COMMENT mode cannot manage panel-level
presentation** -- title/title-style/Badge Color stay MANAGE-only regardless
of ownership; there is no "own the panel" concept.

Defense in depth, in order:

1. `CommentPopup` itself refuses to render mutation-affording UI outside the
   mode/ownership that allows it (not disabled/hidden -- not rendered, so not
   keyboard/tab reachable):
   - `canManagePanel` (`accessMode === 'manage'`) gates title
     editing/styling and Badge Color.
   - `canManageThisRow` (`!isReadOnly && (accessMode !== 'comment' ||
     canMutateCommentById(comment.id))`) gates the entire per-row actions
     rail, per row.
   - Every internal mutation function (`handleSubmit`, `handleEditCommit`,
     `applySelectedStyle`, `applySelectedStrikethrough`, `handleApplyLink`,
     `openLinkPopover`, `startTitleEditing`, `commitTitle`) independently
     re-checks `isReadOnly`/`canManagePanel`/ownership as its own first
     statement(s), regardless of how it was invoked.
2. Every canonical caller wraps each comment mutation callback passed to
   `CommentPopup` with the guard matching that prop's mode reach
   (`lib/domain/canvas/comments.ts`):
   - `guardCommentMutation(accessMode, handler)` -- MANAGE-only props
     (`onCommentTitleChange`, `onCommentTitleStyleChange`,
     `onBadgeColorChange`). Unchanged from PATCH 8O.1, now also rejects
     `'comment'` (only `'manage'` passes).
   - `guardCommentComposition(accessMode, handler)` -- composing a new
     comment (`onSubmit`). Allowed in `'comment'` and `'manage'`, rejected
     only in `'read'`.
   - `guardOwnCommentMutation(accessMode, currentUserId, findComment,
     handler)` -- mutating an EXISTING comment (`onEditComment`,
     `onRemoveComment`, `onToggleCommentStrikethrough`, `onCommentColor`).
     `'manage'` passes through unconditionally; `'comment'` passes through
     only when `findComment(commentId)` resolves to a comment this caller
     owns; `'read'` is always a no-op.
   Whichever guard applies, the caller's own handler body (and its optimistic
   local-state update) is therefore provably unreachable when not authorized,
   not merely conditionally skipped inside it -- no optimistic local
   mutation, no stale UI, no later RLS failure surfacing to the user.
3. Supabase RLS remains the final, unweakened persistence boundary for
   MANAGE-mode writes (the existing `updatePadletMetadata`/bulk-metadata-write
   path, untouched). COMMENT-mode writes route through a SEPARATE, narrowly
   scoped path -- see Commenter persistence architecture below.

`resolveCommentAccessMode(workspaceRole, boardPermission?)` resolves the mode
from the existing role/permission types (`types/permissions.ts`,
`lib/workspace/context.ts`) -- no parallel role system. Workspace-level
restriction is the OUTER bound: `WorkspaceRole === 'readonly'` always resolves
to `'read'` regardless of `boardPermission`. Otherwise, `BoardPermission ===
'reader'` resolves to `'read'`, `BoardPermission === 'commenter'` resolves to
`'comment'`, and everything else (including no `boardPermission` supplied --
e.g. workspace owner/admin/member with no explicit board-level signal)
resolves to `'manage'`, the pre-8O.1 default every existing caller already
depended on.

Resolved once at the controller boundary (`CanvasClient.tsx`) and passed down
as a single prop -- `CommentPopup` never queries auth or database state
itself.

**BoardPermission is now wired (PATCH 8O.2).** `CanvasClient.tsx` resolves
`currentBoardPermission` client-side via the existing `get_board_permission`
RPC (already `GRANT EXECUTE TO authenticated`, already used server-side in
`lib/auth/permissions.ts`'s helper of the same name; its `user_uuid` argument
defaults to `auth.uid()`, so it is safe to call from the browser client naming
only `board_uuid`). No new database object was needed for this half of the
gap PATCH 8O.1 left open.

**Wired at every current canonical caller**: the Clipart editor modal
(`ClipartCardDraftModal.tsx`, now also receiving real `currentUserId`/
`currentUserName` instead of the pre-8O.2 hardcoded `'anon'`/`'You'` literal
every comment added through that modal used to get), saved Clipart comments
(Site B in `FreeformPadletCards.tsx`), and all three live canonical Image
entry points (the Freeform Image comment badge and Freeform Image toolbar in
`FreeformPadletCards.tsx`, and the non-Freeform Image toolbar in
`CanvasClient.tsx`). Canonical Note detached comments are explicitly **not**
wired by this patch -- they remain fully writable regardless of role,
deferred to a dedicated follow-up.

### Commenter persistence architecture (PATCH 8O.2)

PATCH 8O.1 identified but did not solve: `BoardPermission === 'commenter'`
writes would be accepted by the UI/domain layer yet rejected by the padlets
`UPDATE` RLS policy (editor-level access required). PATCH 8O.2 solves the
UI/ownership half of this in full (above) and designs -- but does **not
apply** -- the persistence half:

- **Why not `GRANT commenter UPDATE ON padlets`:** `padlets.metadata` is one
  jsonb column holding the whole post's metadata. A client UPDATE necessarily
  replaces the entire value it sends -- there is no column- or key-level RLS
  for jsonb in Postgres. Granting blanket UPDATE would let a commenter submit
  ANY replacement metadata: rewrite another user's comment, delete another
  user's comment, forge `comment.userId`, or edit unrelated fields entirely
  (cardColor, container membership, ...).
- **The actual design**: a narrowly scoped `comment_mutate` SECURITY DEFINER
  RPC (drafted at
  `supabase/migrations/20260812_000000_add_comment_mutate_rpc.sql`) that
  resolves the authenticated user, the effective board permission, and the
  target comment server-side, and permits exactly four operations --
  `ADD_COMMENT`, `EDIT_OWN_COMMENT`, `STYLE_OWN_COMMENT`,
  `DELETE_OWN_COMMENT` -- each of which touches only
  `metadata.detachedComments`, never arbitrary metadata, and never trusts a
  client-supplied identity for `comment.userId`. The padlets `UPDATE` RLS
  policy itself is not modified or weakened.
- **Client wiring**: `lib/infra/canvas/commentMutations.ts` calls this RPC
  and is already wired into every 'comment'-mode caller
  (`CanvasClient.tsx`'s `commentModeMutations`, threaded to
  `FreeformPadletCards.tsx`'s three canonical sites). It deliberately does
  NOT reuse the existing `updatePadletMetadata`/`commitPadletMeta` path: that
  path applies its optimistic local update synchronously and swallows every
  persistence error silently by design (a pre-existing, deliberate,
  whole-app pattern -- see `commitPadletMeta`'s own comment in
  `CanvasClient.tsx`), which combined would show a commenter FAKE local
  success for a write the database silently discarded. The RPC-backed path
  never optimistically mutates local state before the call resolves, and
  surfaces a failure via the existing `toast.error` mechanism (no new
  notification system).
- **STATUS: the migration is DRAFTED, NOT APPLIED.** There is no local
  Supabase instance or db-test harness in this repository to validate it
  against -- the only way to test it is against the live project. Until a
  human reviews and applies it (see the migration file's own header for the
  required review checklist), every COMMENT-mode write attempt fails
  immediately with a clean "function comment_mutate(...) does not exist"
  error, caught by `commentMutations.ts` and surfaced via `toast.error` --
  fail-safe (no fake success), not fake-fixed. `ClipartCardDraftModal.tsx`'s
  draft-then-batch-save architecture is a separate case: its own-comment
  mutations stay on its existing `updateMetadata`-then-`saveCard` draft path
  (now ownership-gated via `guardOwnCommentMutation`), since persistence
  there already only happens on modal close through the same RLS boundary as
  every other draft field -- wiring the RPC into a mid-draft mutation would
  fight that architecture rather than fit it. A commenter opening this ONE
  entry point specifically will still see the pre-existing RLS rejection
  (silently, per that path's existing error handling) until either this RPC
  ships and the modal is re-wired to use it, or RLS is otherwise addressed.

`BoardPermission === 'commenter'` no longer risks resolving to `'manage'` UI
with rejected writes (PATCH 8O.1's exact documented gap) -- it now resolves
to the correct `'comment'` UI, and writes either succeed through the RPC (once
applied) or fail loudly and safely (until then).

## Historical notes

PATCH 8A recorded that normal comment surfaces differed in storage fields,
shell/anchor, action rails, composer shape, selection behavior, link support,
and picker ownership. PATCH 8C consolidated the Site A foundation while
preserving its surface-specific shell. PATCH 8E then explicitly unlocked and
unified the saved Clipart badge onto `CommentPopup`, closing the two live
Clipart implementations. Subsequent accepted fixes through PATCH 8M corrected
anchoring, viewport-space positioning, panel height discipline, title,
composer, picker, link, and interaction-isolation behavior. This freeze
preserves those historical notes and records Clipart as the reference. Image's
PATCH 8O migration and normal Note detached-comment PATCH 8P migration are
recorded above; Note anchored/highlighted threads, Document, Drawing, AI
Component, Link, Todo, Comment post, and Container remain unmigrated.

## Negative controls

The permanent guards are intended to fail under each temporary mutation below
and pass after exact restoration:

A. Remove Send → composer contract fails.
B. Add a local Clipart row/action → anti-duplication guard fails.
C. Break safe new-tab Link handling → link contract fails.
D. Apply foreground color to the whole comment → range-color test fails.
E. Let Comments pointerdown reach the post → isolation test fails.
F. Change post y while opening Comments → position invariant fails.
G. Detach the picker coordinates → anchoring test fails.
H. Route one Clipart entry point away from `CommentPopup` → parity guard fails.
I. Show Send/Edit/Color/Link/Strikethrough/Delete/title-editing to a reader →
   read-mode contract fails.
J. Invoke a mutation callback directly while accessMode is 'read' (bypassing
   the UI entirely) → zero-callback-fires assertion fails if the internal
   guard is removed.
K. Let a caller's optimistic local-state update run before its permission
   check (unwrap `guardCommentMutation`) → caller-guard test fails.
L. Allow title editing/styling for a reader → read-mode title test fails.
M. Disable safe-link opening in read mode → read-link test fails (existing
   links must stay openable).
N. Remove a control from manage mode (e.g. drop Send or Color) → canonical
   manage contract fails.
O. Omit `accessMode` from a canonical caller's `<CommentPopup>` → the
   architecture guard requiring every canonical caller to pass the prop fails.
P. COMMENT edits/deletes/styles/link-authors another user's comment → the
   comment-mode ownership contract fails (mounted) and the caller-guard
   forged-call test fails (structural).
Q. Client submits a forged `userId` on ADD_COMMENT → `comment_mutate` uses
   `auth.uid()` only, never a client-supplied argument, so a forged value is
   never even read (proof lives in the migration's own `ADD_COMMENT` branch
   and its header comment, not a mounted test -- the RPC is not applied).
R. COMMENT changes arbitrary padlet metadata via the commenter path →
   `comment_mutate` only ever touches `metadata.detachedComments` (proof: its
   own `UPDATE padlets SET metadata = jsonb_set(..., '{detachedComments}',
   ...)` statement, the only mutation the function performs).
S. COMMENT changes the Comments title → panel-level `canManagePanel` contract
   fails (mounted, item 17 in `CommentPopup.commentMode.test.tsx`).
T. COMMENT changes Badge Color → panel-level `canManagePanel` contract fails
   (mounted, item 19).
U. READ submits a comment → PATCH 8O.1's read-mode contract fails (unchanged
   by this patch).
V. A COMMENT-mode persistence rejection leaves a fake optimistic comment in
   local state → `lib/infra/canvas/commentMutations.test.ts`'s fail-safe-path
   tests fail (no `setPadlets` call before the RPC resolves; state
   byte-identical after a rejected call).
W. A legacy comment with no reliable `userId` is mutated by a COMMENT-mode
   user → `canMutateComment`/`isOwnComment` unit tests fail, and
   `CommentPopup.commentMode.test.tsx` item 20 fails.

These controls are diagnostic procedures, not changes included in the freeze.

## Scope and release rule

The freeze portion changes tests and architecture/governance documentation
only. No production behavior is changed here. The canonical restore point is
the annotated local tag `comment-ui-canonical-v1`, created on the final freeze
commit and not pushed.
