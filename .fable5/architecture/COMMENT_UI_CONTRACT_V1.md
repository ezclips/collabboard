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

The permission suites (PATCH 8O.1) are:

- `lib/domain/canvas/comments.test.ts` -- `resolveCommentAccessMode` and
  `guardCommentMutation` unit coverage.
- `components/collabboard/editors/CommentPopup.accessMode.test.tsx` -- the
  read/manage mode mounted contract (25 items: 17 read-mode, 8 manage-mode).
- `components/collabboard/canonicalCommentPermission.contract.test.tsx` --
  every canonical caller passes an explicit `accessMode`/`commentAccessMode`
  prop and wraps its comment mutation callbacks with `guardCommentMutation`;
  fails if any canonical caller silently omits the access contract.

## Canonical comment permission contract

`COMMENT UI CONTRACT UNLOCK — PERMISSIONS ONLY` (PATCH 8O.1). Permission
gating only; no visual redesign. The frozen behavior matrix above still
describes the writable ("manage") experience byte-for-byte -- this section is
additive.

`CommentPopup` accepts an explicit `accessMode?: CommentAccessMode` prop
(`'read' | 'manage'`, defined in `lib/domain/canvas/comments.ts`), defaulted
to `'manage'` so every existing consumer that has not been updated keeps its
exact current behavior.

READ:

- view the panel, title, and comment count
- read existing comments (avatar/name/timestamp/formatted text)
- select and copy comment text
- open existing safe links (`_blank`, `noopener,noreferrer`)
- Close
- zero mutation: no composer, no Send, no Enter-to-submit, no Edit, no
  Color/Highlight, no Link authoring, no Strikethrough, no Delete, no title
  editing or title styling, no Badge Color

MANAGE:

- the current frozen canonical Comment UI v1 capabilities, unchanged

**Authorization state must be explicit. Callback presence is never
authorization.** `CommentPopup` does not infer read-only from whether a
mutation prop (`onEditComment`, `onCommentColor`, etc.) was supplied --
several existing non-canonical consumers omit props for reasons unrelated to
permission. The explicit `accessMode` prop is the only accepted signal.

Defense in depth, in order:

1. `CommentPopup` itself refuses to render mutation-affording UI in read mode
   (not disabled/hidden -- not rendered, so not keyboard/tab reachable) and
   every internal mutation function (`handleSubmit`, `handleEditCommit`,
   `applySelectedStyle`, `applySelectedStrikethrough`, `handleApplyLink`,
   `openLinkPopover`, `startTitleEditing`, `commitTitle`) independently
   returns immediately when `accessMode === 'read'`, regardless of how it was
   invoked.
2. Every canonical caller wraps each comment mutation callback passed to
   `CommentPopup` with `guardCommentMutation(accessMode, handler)`
   (`lib/domain/canvas/comments.ts`) before it reaches the caller's own
   optimistic-local-state-plus-persistence body. A read-only caller's handler
   body is therefore provably unreachable, not merely conditionally skipped
   inside it -- no optimistic local mutation, no stale UI, no later RLS
   failure surfacing to the user.
3. Supabase RLS remains the final, unweakened persistence boundary. This
   patch does not touch RLS.

`resolveCommentAccessMode(workspaceRole, boardPermission?)` resolves the mode
from the existing role/permission types (`types/permissions.ts`,
`lib/workspace/context.ts`) -- no parallel role system. `WorkspaceRole ===
'readonly'` or `BoardPermission === 'reader'` resolves to `'read'`; everything
else resolves to `'manage'`. Resolved once at the controller boundary
(`CanvasClient.tsx`, from its existing `currentWorkspaceRole` state) and
passed down as a single prop -- `CommentPopup` never queries auth or database
state itself.

**Wired at every current canonical caller**: the Clipart editor modal
(`ClipartCardDraftModal.tsx`), saved Clipart comments (Site B in
`FreeformPadletCards.tsx`), and all three live canonical Image entry points
(the Freeform Image comment badge and Freeform Image toolbar in
`FreeformPadletCards.tsx`, and the non-Freeform Image toolbar in
`CanvasClient.tsx`). Canonical Note detached comments are explicitly **not**
wired by this patch -- they remain fully writable regardless of role,
deferred to a dedicated follow-up.

**BoardPermission is not fully wired.** No client component in this canvas
view currently resolves board-level permission -- only `WorkspaceRole` is
loaded client-side. `resolveCommentAccessMode` accepts `boardPermission` for
completeness with the product's permission model and composes it correctly
the moment a caller resolves one; today it is simply never passed, so the
only live read-only trigger is `WorkspaceRole === 'readonly'`.

**COMMENTER PERSISTENCE — SEPARATE FOLLOW-UP REQUIRED.** `BoardPermission ===
'commenter'` is product-intended to permit commenting, but the padlets
`UPDATE` RLS policy requires editor-level access -- a commenter's comment
writes would resolve to `'manage'` (commenter ranks above reader) yet be
rejected by the database. This patch does not paper over that mismatch: it
does not downgrade commenter to `'read'` (product-incorrect -- commenter is
supposed to write) and does not weaken RLS to grant commenter-level padlet
metadata writes (out of scope, and risks accidentally granting post-edit
capability). The gap is real, documented, and unresolved until a dedicated
patch either grants commenter-scoped RLS for comment-only metadata writes or
introduces a distinct persistence path.

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

These controls are diagnostic procedures, not changes included in the freeze.

## Scope and release rule

The freeze portion changes tests and architecture/governance documentation
only. No production behavior is changed here. The canonical restore point is
the annotated local tag `comment-ui-canonical-v1`, created on the final freeze
commit and not pushed.
