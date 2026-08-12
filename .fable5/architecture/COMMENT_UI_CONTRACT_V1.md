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
- Drawing — normal/detached comments
- Todo — normal/detached comments
- AI Component — normal/detached comments
- Link — normal/detached comments
- Table — normal/detached comments

NOT YET MIGRATED:

- Note — anchored/highlighted threads (special storage adapter required)
- Document — **has no normal/detached comment tier at all** (see below)
- Comment post — **primary-thread comment UI, classified SPECIAL; not a
  CommentPopup migration candidate** (see below)
- Container — **has no live normal/detached comment tier at all** (see below)
- other normal-comment surfaces identified by future audits

**Document is not a pending Category-A migration.** PATCH 8Q's inventory
(2026-08-12) confirmed, and `.fable5/patches/PATCH-152.md` §20.4 row 14
independently records ("Post-level comment | Note only | ... | none for
Document"), that `DocumentEditor.tsx` was never given a
`detachedComments`/badge-style normal comment tier — Note is the only post
type that has one. Document's sole comment mechanism is its anchored/
highlighted text-selection `CommentPopup` (`DocumentEditor.tsx:431-443`,
triggered only with an active text selection, backed by the shared TipTap
`comment` mark in `extensions/Comment.ts`), which is Category B and
therefore out of scope for a Category-A canonical migration by definition.
Note as a fact for any future patch: that anchored `CommentPopup` call is
also the one live canonical caller with **no `accessMode`/
`guardCommentMutation` wiring at all** (every mutation is unconditionally
reachable regardless of workspace role) — a real gap, but a Category-B
permission-wiring task, not a UI migration, and it is a separate,
independently-scoped patch from this list.

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

**Todo normal/detached comments were migrated in PATCH 8S** (2026-08-12) --
unlike Drawing (PATCH 8R, wiring-only) and Document (PATCH 8Q, N/A), Todo's
inventory found TWO live entry points that were each a fully local,
hand-rolled comment implementation (row JSX, composer, per-comment color
popup, badge-color picker) with no relationship to `CommentPopup` at all:
`TodoEditor.tsx`'s own left-toolbar Comment panel, and
`FreeformPadletCards.tsx`'s single on-canvas badge popup (Todo has no
separate toolbar-triggered popup the way Note/Image do). Both were rewritten
to delegate entirely to canonical `CommentPopup`, wired the same way as
Note's own-editor and on-canvas sites: `guardCommentMutation(accessMode, ...)`
directly at every prop (COMMENT stays dormant for Todo too), real identity
threaded from `CanvasModals.tsx`'s existing `commentAccessMode`/`user` props
into `TodoEditor.tsx` (the on-canvas site already used real `user?.id ||
'anon'` identity pre-migration; `TodoEditor.tsx`'s own site previously
hardcoded `userId: 'user1', userName: 'You'` and now uses real identity too).
`commentTitle`/`commentTitleStyle` were newly added to both sites (previously
a fixed, non-editable "Comments" header). All local state that is now owned
internally by `CommentPopup` (per-comment edit/color-popup state, badge-color
picker open state, composer text) was deleted from both callers rather than
kept as an unused duplicate. A `padlet.type === 'comment'` (the standalone
"Comment" post family, out of scope) branch elsewhere in
`FreeformPadletCards.tsx` contains a copy-pasted, MISLABELED "Todo Comments
Popup - Right side" comment above its own unrelated local implementation --
noted so a future patch does not mistake it for a second live Todo site.

**AI Component normal/detached comments were migrated in PATCH 8T**
(2026-08-12) — like Drawing (PATCH 8R), this was a wiring-only migration, not
a UI replacement: `AIComponentEditor.tsx`'s single left-toolbar Comment
button/badge/panel already delegated to canonical `CommentPopup` before this
patch, it was just under-wired (no `accessMode`, no `onEditComment`/
`onRemoveComment`/`onToggleCommentStrikethrough`/`onCommentTitleChange`/
`onCommentTitleStyleChange`, hardcoded `userId: 'anon', userName: 'You'`
identity, `onSubmit`/`onCommentColor`/`onBadgeColorChange` unguarded, and no
`commentTitle`/`commentTitleStyle` metadata fields at all). Phase 1 inventory
confirmed AI Component has exactly one live entry point — `FreeformPadletCards.tsx`
has no `if (padlet.type === 'ai-component')` `CommentPopup` branch the way
Note/Clipart/Image/Todo do, and unlike Drawing there is no separate read-only
lightbox route either; a single modal (`CanvasModals.tsx` → `CanvasClient.tsx`)
serves both MANAGE and READ workspace roles, with `accessMode` alone
governing which controls are reachable — the same shape as Note/Todo's
own-editor sites. Wired the same way: `guardCommentMutation(accessMode, ...)`
directly at every prop (COMMENT stays dormant here too), real identity and
`commentTitle`/`commentTitleStyle` threaded from `CanvasModals.tsx`'s existing
`commentAccessMode`/`user` props. `usePadletSave.ts`'s `saveAIComponent`
already spreads `data.metadata` wholesale into the persisted row, so — unlike
the Note/Todo `usePadletSave.ts` gaps found in PATCH 8P.1/8S — no separate
persistence-layer fix was needed for `commentTitle`/`commentTitleStyle` to
reach the database. AI Component has no anchored/highlighted (Category B)
comment system; the AI generation/regeneration lifecycle (`generate`/`cancel`/
`stage`/`abortRef`) is untouched and structurally isolated from the Comments
panel (portaled to `document.body`, own `stopPropagation` wrapper).

**Link normal/detached comments were migrated in PATCH 8U** (2026-08-12) —
like Todo (PATCH 8S), this was a genuine UI migration off local hand-rolled
JSX, not a wiring-only fix: Phase 1 inventory found TWO live entry points,
each a fully local implementation (row JSX, composer, per-comment color
popup, badge-color picker) with no relationship to `CommentPopup` at all —
`LinkEditor.tsx`'s own left-toolbar Comments panel, and
`FreeformPadletCards.tsx`'s single on-canvas badge popup (Link has no
separate toolbar-triggered popup, same shape as Todo). Both were rewritten to
delegate entirely to canonical `CommentPopup`, wired the same way as Todo's
sites: `guardCommentMutation(accessMode, ...)` directly at every prop
(COMMENT stays dormant for Link too), real identity threaded from
`CanvasModals.tsx`'s existing `commentAccessMode`/`user` props into
`LinkEditor.tsx` (previously hardcoded `userId: 'current-user', userName:
'You'`; the on-canvas site already used real `user?.id || 'anon'` identity
pre-migration). `commentTitle`/`commentTitleStyle` were newly added to both
sites. `usePadletSave.ts`'s `saveLink`/`SaveLinkData` had the same
persistence-layer gap found for Note (PATCH 8P.1) and Todo (PATCH 8S) —
`commentTitle`/`commentTitleStyle` were silently dropped before the Supabase
write despite both editor sites sending them correctly — and were fixed the
same way. All local state now owned internally by `CommentPopup` (per-comment
edit/color-popup state, badge-color picker open state, composer text) was
deleted from both callers rather than kept as an unused duplicate, along with
the now-dead `BADGE_COLORS`/`TextStylePopup`/`PenTool` imports in
`LinkEditor.tsx`.

This patch carried an explicit high-risk requirement not present in prior
migrations: Comments must be a complete interaction island relative to the
Link post's own destination-URL behavior (click-to-navigate). This is proven
two ways. First, structurally: both entry points' `CommentPopup` wrapper
stops `click`/`mousedown` propagation before it can reach the post's own
click/select/navigate handlers, and neither comment site's source references
any of the Link post's own URL/title/preview metadata fields (`linkUrl`,
`linkTitle`, `linkImage`, `linkFavicon`, `linkDomain`) — asserted directly in
the contract test suite. Second, behaviorally: the frozen, pre-existing
`commentLinkSafety.ts` (`handleSafeCommentLinkClick`) already calls
`event.preventDefault()`/`event.stopPropagation()` before opening a clicked
comment-authored link via `window.open(url, '_blank', 'noopener,noreferrer')`
— a mounted `LinkEditor.commentCanonicalization.test.tsx` test proves that
clicking a comment's own authored link (e.g. `https://docs.example.com`)
opens exactly that URL and never the Link post's own destination (e.g.
`https://example.com/product`), and that doing so does not mutate any of the
post's own URL/title/preview fields on save. Comment Link *authoring*
(TipTap's `Link` extension) was already part of `CommentPopup`'s canonical
behavior before this patch (added for Clipart's `enableCanonicalSelectionStyling`
rollout) — Link post migration required no changes to that shared
infrastructure, only wiring the two entry points onto it.

**Table normal/detached comments were migrated in PATCH 8V** (2026-08-12) —
PATCH 8U's discovery was confirmed independently: Table had exactly two live
entry points, each a fully local, hand-rolled comment implementation
(row JSX, composer, per-comment color popup, badge-color picker) with no
relationship to `CommentPopup` — `TableEditor.tsx`'s own left-toolbar
Comment panel, and `FreeformPadletCards.tsx`'s single on-canvas badge popup
inside the `padlet.type === 'table'` branch. No Category B (row/cell/
selection-bound) comment system exists for Table at all —
`TableCellContextMenu.tsx` contains zero comment-related code — so there was
nothing to freeze.

Table's storage architecture is unique among every post type migrated so
far: `comments`/`badgeColor` (and now `commentTitle`/`commentTitleStyle`)
live inside `padlet.content` — a single JSON blob shared with `rows`/
`columns`/`cellStyles`/`caption`/`titleStyle` — not `padlet.metadata`. Both
sites were rewritten to delegate to canonical `CommentPopup` while
preserving this exact storage shape: the on-canvas site persists via
`updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments:
nextComments, ... }))` (never `updatePadletMetadata`), and
`TableEditor.tsx`'s `handleSaveAndClose` includes `commentTitle`/
`commentTitleStyle` in the same `JSON.stringify(...)` payload as `rows`/
`columns`/`comments`. Because `TableEditor`'s `onSave` already passes the
whole serialized JSON string through as an opaque `content` field (unlike
every other migrated editor, which passes individual named fields),
`usePadletSave.ts`'s `saveTable` needed no equivalent fix to the
Note/Todo/Link `commentTitle`/`commentTitleStyle`-dropped-silently bug —
there is no field-by-field mapping for it to omit.

Both sites wired the same way as Todo/Link: `guardCommentMutation(accessMode,
...)` directly at every prop (COMMENT stays dormant for Table too), real
identity threaded from `CanvasModals.tsx`'s existing `commentAccessMode`/
`user` props into `TableEditor.tsx` (previously hardcoded `userId:
"current-user", userName: "You"`; the on-canvas site already used real
`user?.id || 'anon'` identity pre-migration). While removing
`TableEditor.tsx`'s local per-comment color-popup state, the left toolbar's
own wrapper `className` was found to still conditionally apply
`"opacity-0 pointer-events-none"` keyed on that now-deleted state — the
exact same latent bug pattern caught live during Todo's migration (PATCH
8S) that made its entire toolbar unclickable. Caught and fixed here
structurally before any live check was needed, with a dedicated regression
test guarding against its reintroduction.

Interaction isolation for Table carried extra risk relative to every prior
migration: Table has rich in-editor keyboard/mouse interaction (cell
selection, cell editing, row/column selection) that a naive comment
composer could bleed into. Both entry points' `CommentPopup` wrapper stops
`click`/`mousedown` propagation before it can reach any table-cell/row
handler, and dedicated mounted tests prove opening Comments, typing in the
composer, and pressing Enter to submit a comment never selects a table cell
(`.ring-purple-500` count stays zero) and never adds a row or changes a
cell's value — Enter submits the comment only, exactly as canonical
behavior requires, and never commits/advances a table cell the way Enter
does inside the grid itself.

**Container was classified N/A in PATCH 8W** (2026-08-13) — no production
code was changed. Phase 1 inventory found that `ContainerEditor.tsx` carries
a complete but entirely dead Category-A skeleton for the Container's own
whole-post comments: `detachedComments` state, an `initialDetachedComments`
prop threaded from `CanvasModals.tsx` (`liveContainer?.metadata?.
detachedComments`), a `handleComment`/`handleAddComment` pair, and
`commentPopupOpen`/`commentPopupPosition` state, with `detachedComments`
correctly round-tripped through `onSave` → `usePadletSave.ts`'s
`saveContainer` (`metadata.detachedComments: data.detachedComments`). None of
it is reachable: `ContainerEditor.tsx`'s left toolbar has exactly three
buttons (Close, Color, Title) and no Comment trigger; `commentPopupOpen` is
never read by any `<CommentPopup isOpen=...>` render anywhere in the file (no
such JSX exists at all); and the on-canvas site
(`FreeformPadletCards.tsx`'s `if (padlet.type === 'container') { ... }`
branch, line ~4250) returns its own `<ColumnPostContextMenu>` shell before
reaching the generic comment-badge/`CommentPopup` block that every
fallback-branch post type (Note, Clipart, Image, etc.) gets for free — so
Container padlets never render a comment badge on canvas either. There is no
button, menu item, keyboard shortcut, or badge anywhere in the live product
that opens, reads, or writes a Container's own comment. This is Category D
(dead/orphaned), not Category A, and per this patch's own decision gate nothing
was migrated, wired, or deleted — the dead state/props/save-mapping were left
exactly as found, since removing them was out of scope for a
classification-only patch.

Two genuinely live comment systems exist for content placed *inside* a
Container, and both are Category B (child-post comments), explicitly out of
scope: (1) `ContainerEditor.tsx`'s `SortableChildItem` renders a canonical
`CommentPopup` directly for a child padlet whose `type === "comment"`,
reading/writing that child's own `metadata.comments` via
`onUpdateChildComments` — this is the standalone Comment-post family
rendered inline inside the container editor's list, not a Container comment.
(2) `RowColumnContainerCard.tsx` (used by the on-canvas Row/Column container
layout) and `PostCardContent.tsx` (the Drawing-in-container image-binding
case) both render `EmbeddedCommentList` — a third, distinct hand-rolled
comment UI, never `CommentPopup` — against `metadata.comments` (for
comment-type children) or `metadata.detachedComments` (for any other child's
own comments), via the same `onUpdateChildComments(childId, comments, {
field })` callback contract. In every case the mutation target is provably
the *child's* padlet id and metadata field, never the Container's own row —
`onUpdateChildComments` in `FreeformPadletCards.tsx` calls
`updatePostFieldsPreservingFailureChannels(childId, { metadata: {
...childPadlet.metadata, comments } })`, keyed off the child's id looked up
by `padlets.find(p => p.id === childId)`, with no code path that substitutes
the container's own id or metadata. No Category C (header-bound/object-bound/
selection-bound) comment tier exists for Container at all — there is nothing
resembling Note's anchored threads or Document's text-selection comments
anywhere in `ContainerEditor.tsx`, `RowColumnContainerCard.tsx`, or the
Wall/Column/Grid container context-menu files. Because Category A is empty,
none of the frozen foundation files were touched and no negative controls
apply beyond confirming the dead code stayed byte-identical (verified via
`git diff` showing zero changes to any `.tsx`/`.ts` production file).

**Comment post was classified SPECIAL / PRIMARY THREAD in PATCH 8X**
(2026-08-13) — no production code was changed. Phase 1 inventory confirmed
the standalone Comment post has no separate "body" at all: `metadata.comments`
IS its entire primary content (`usePadletSave.ts`'s `saveComment`/
`SaveCommentData` has no `detachedComments` field whatsoever — there is
nothing for a secondary/Category-A comment tier to attach to). This rules out
Decision Gate 1 (no Category A exists) and puts the whole family under
Decision Gate 2: is the primary-thread UI safely canonicalizable (B1), or is
it a genuinely different product surface that CommentPopup would regress
(B2)?

Three live standalone entry points were found, all Category B (primary
thread, not child-post rendering):

1. `CommentPost.tsx` — the on-canvas card body when `metadata.isCollapsed` is
   falsy. The comment list, its composer, and its title/badge chrome ARE the
   entire card.
2. `FreeformPadletCards.tsx`'s inline "Collapsed Marker" popup (~line 2070-2417,
   inside the `padlet.type === 'comment' || 'Comment'` branch) — a second,
   independently hand-rolled implementation of the same row/composer/color-popup
   pattern, used only when `metadata.isCollapsed` is true (the post renders as a
   numbered pin/marker instead of a card).
3. `CommentEditor.tsx` — the double-click/Edit modal (`isCommentEditorOpen` in
   `CanvasModals.tsx`), a full rich editor: per-row Edit/Color/Strikethrough/
   Delete (same conceptual shape as `CommentPopup`), PLUS a composer with a
   complete TipTap toolbar CommentPopup does not have at all — Bold, Italic,
   Underline, Bullet List, Ordered List, Code Block, Text Align, and an emoji
   picker (`CommentEditorToolbar.tsx`) — plus card background/top-strip color
   and badge color pickers. `CommentPopup.tsx`'s own `COMMENT_POPUP_EXTENSIONS`
   is confirmed to carry none of Underline/BulletList/OrderedList/CodeBlock/
   TextAlign/emoji (`StarterKit.configure({ heading: false, codeBlock: false,
   link: false })` plus `TextStyle`/`Color`/`Highlight`/`Link` only) — routing
   Comment post through `CommentPopup` as-is would be a real product capability
   regression, not a like-for-like UI swap.

A fourth block exists inside the same `padlet.type === 'comment'` branch,
copy-pasted from Todo's pre-migration on-canvas popup and still carrying the
stale, MISLABELED "Todo Comments Popup - Right side" comment first flagged in
PATCH 8S/8U — confirmed this patch to be genuinely **dead** (Category D), not
a fourth live entry point: it renders only when `cardCommentPopupPadletId ===
padlet.id`, and every live call site that ever sets `cardCommentPopupPadletId`
to a truthy id (grep-verified across the whole file) lives inside other post
types' branches (Image, Link, Todo, Table, and the generic Note/Clipart-style
fallback badge) — none of them, and nothing inside the Comment-post branch
itself, ever sets it to a Comment post's own id. It was left untouched, same
disposition as the Container investigation's dead `detachedComments` skeleton
(PATCH 8W) and the "cardToolbarPadletId has no live non-null setter" Clipart
note above.

Given CommentEditor's composer is a strictly richer authoring surface than
canonical `CommentPopup` today, and `metadata.comments` is this post type's
entire reason to exist rather than a bolted-on panel, this is **B2**: forcing
canonical `CommentPopup` here would change the Comment post's product model,
not just its implementation. Per this patch's own decision gate, no migration
was performed and no production code was touched — **COMMENT POST = SPECIAL
/ PRIMARY THREAD**, recorded for a future dedicated adapter patch rather than
folded into the normal-comment rollout. None of the three live surfaces has
`accessMode`/`guardCommentMutation` wiring today (every mutation is
unconditionally reachable regardless of workspace role) — real identity IS
already threaded correctly (`CanvasModals.tsx` passes `user?.id`/a resolved
display name into `CommentEditor.tsx`; `FreeformPadletCards.tsx`'s two
on-canvas sites already use `user?.id || 'anon'`), so this is a real
permission-wiring gap but, like Document's anchored `CommentPopup`, a
separate Category-B-shaped follow-up from a UI migration, not something to
retrofit into a classification-only patch.

Two Category-C embedded child-renderer surfaces were re-examined (first
identified in PATCH 8W): `RowColumnContainerCard.tsx` and `PostCardContent.tsx`
both render a comment-type child's `metadata.comments` through
`EmbeddedCommentList.tsx` — a fourth, independent, genuinely editable comment
UI (own header/counter, own `CommentRow.tsx` per-row Edit/Color/Strikethrough/
Delete, own composer/Send), intentionally compact for embedding inside a
container card rather than a truncated read-only preview. Per this patch's
own instruction not to replace `EmbeddedCommentList` without justification,
it was characterized, not touched. Separately, `ContainerEditor.tsx`'s own
`SortableChildItem` (PATCH 8W) already renders a comment-type child directly
through canonical `CommentPopup` instead of `EmbeddedCommentList` — an
existing inconsistency between the two embedded-child code paths, noted here
as a fact for a future patch but out of scope to reconcile in PATCH 8X.

Other non-Clipart/Image/Note/Drawing/Todo/AI-Component/Link/Table surfaces
are intentionally not made to comply by this patch. A migration moves a post
from the second list to the first only after all of its live entry points,
adapters, and contract tests are added.

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

**Live status (PATCH 8O.3, 2026-08-12):**

| Tier | Status |
|---|---|
| READ | live -- `WorkspaceRole === 'readonly'` resolves to `'read'` today |
| MANAGE | live -- every normal writable workspace user resolves to `'manage'` today (unchanged default) |
| COMMENT | **implemented in domain/UI but DORMANT** -- fully built and tested (`comments.ts`, `CommentPopup.commentMode.test.tsx`, `commentMutations.ts`), but has no live permission producer and cannot currently be reached by any real user |

`resolveCommentAccessMode(currentWorkspaceRole)` is the only call live in
`CanvasClient.tsx` today (its optional `boardPermission` parameter is never
passed a value by any live caller -- see "Commenter persistence architecture"
below for why the PATCH 8O.2 attempt to wire it was reverted).

**Activation requirements for COMMENT** -- all of the following must be true
before COMMENT can be wired to a live permission source again, in order:

1. a real, live board-level "commenter" permission signal exists (i.e. an
   actual board-sharing feature, built against the live `boards`/`padlets`
   model, not the dead `canvases` vertical);
2. that signal is resolved authoritatively server-side against
   `boards`/`padlets`, not client-guessed;
3. a secure, reviewed persistence path exists for commenter-tier writes
   (the drafted `comment_mutate` design in `.fable5/drafts/` is a starting
   point, not a finished answer -- its permission-resolution steps are
   known-wrong for the live schema and must be rebuilt, see that file's own
   DORMANT banner);
4. that persistence path has been through a real database/security review
   against the live schema (not the `canvases` schema it was originally
   written against);
5. commenter-role behavior has been end-to-end validated with a real
   'commenter'-permission test account against the live product.

**Explicit rule: COMMENT must never be activated merely by passing a
synthetic/hand-constructed `BoardPermission` value into
`resolveCommentAccessMode`.** Wiring a fake or convenience signal in to make
the tier "work" without satisfying all five requirements above would silently
reintroduce the exact failure PATCH 8O.2a found and reverted -- a permission
tier with no authoritative, live-schema-backed producer behind it.

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

**BoardPermission wiring was attempted in PATCH 8O.2 and REVERTED in PATCH
8O.2a.** `CanvasClient.tsx` briefly resolved `currentBoardPermission`
client-side via the existing `get_board_permission` RPC (already `GRANT
EXECUTE TO authenticated`, already used server-side in
`lib/auth/permissions.ts`'s helper of the same name). Live testing
(2026-08-12, authenticated Playwright session against a real board)
found this RPC always fails against the live product: it queries the
`canvases` table, which belongs to the nav-orphaned, zero-live-data
`app/collabboard/**` vertical documented in
`.fable5/docs/CURRENT_TASK.md`'s PATCH-022 census -- confirmed live via
PostgREST returning `42703 column "canvases.workspace_id" does not exist`.
The actual live board system (`boards`/`padlets`, everything CanvasClient
and FreeformPadletCards touch) has no per-board collaborator-role feature
wired to any reachable UI; `board_collaborators` has zero live writers
either. Calling `get_board_permission` from the canonical comment surfaces
therefore never resolved a real permission (`currentBoardPermission` was
always `null`, failing closed to `'manage'` -- no security regression) while
spamming `console.error` on every canvas load. The call was removed rather
than kept as silent, permanently-failing scaffolding. See
`LESSONS_LEARNED.md`'s "get_board_permission is scoped to a dead schema"
entry. `resolveCommentAccessMode`'s `boardPermission` parameter remains and
is fully tested (`comments.test.ts`) -- it is simply not passed a value by
any live caller today. Re-wiring it is a real, separate follow-up gated on
an actual board-level sharing feature being built against the live
`boards` table (or an equivalent live-schema-aware permission source),
not on fixing `get_board_permission` itself, which is scoped to a vertical
tracked for deletion.

**Wired at every current canonical caller**: the Clipart editor modal
(`ClipartCardDraftModal.tsx`, now also receiving real `currentUserId`/
`currentUserName` instead of the pre-8O.2 hardcoded `'anon'`/`'You'` literal
every comment added through that modal used to get), saved Clipart comments
(Site B in `FreeformPadletCards.tsx`), and all three live canonical Image
entry points (the Freeform Image comment badge and Freeform Image toolbar in
`FreeformPadletCards.tsx`, and the non-Freeform Image toolbar in
`CanvasClient.tsx`).

**Note normal/detached comments were wired in PATCH 8P** (2026-08-12) --
the UI migration to canonical `CommentPopup` happened earlier (pre-8O.1), but
permission wiring was explicitly deferred at the time. All three normal/
detached Note entry points now receive an explicit `accessMode`: the two
`FreeformPadletCards.tsx` sites (on-canvas badge popup, toolbar popup) receive
`commentAccessMode` directly like every other canonical caller there; the
Note editor modal's own detached-comment popup (`NoteEditor.tsx`) receives a
new `accessMode` prop threaded from `CanvasClient.tsx` -> `CanvasModals.tsx`
-> `NoteEditor.tsx`. Every mutation callback at all three sites is wrapped
with `guardCommentMutation(accessMode, ...)` directly -- simpler than
Clipart/Image's ternary (`guardCommentComposition`/`guardOwnCommentMutation`
routed through `commentModeMutations`), because COMMENT mode stays dormant
for Note: with only 'read' and 'manage' ever reachable in practice,
`guardCommentMutation` alone (reject read, allow manage) is the complete
contract, matching the "Live status" table above and the explicit rule
against wiring any live caller to COMMENT mode. Note's OTHER `CommentPopup`
(the selected-text/anchored-thread popup, `panels.open.comment` in
`NoteEditor.tsx`) is explicitly out of scope for PATCH 8P and remains
completely unwired -- it stays on its pre-existing, always-writable path,
same as before this patch. See `noteDetachedCommentUIContract.test.tsx` for
the anchored-thread freeze proof and `canonicalCommentPermission.contract.test.tsx`
for the permission-wiring proof at all three Category-A sites.

### Commenter persistence architecture (PATCH 8O.2, quarantined PATCH 8O.3)

PATCH 8O.1 identified but did not solve: `BoardPermission === 'commenter'`
writes would be accepted by the UI/domain layer yet rejected by the padlets
`UPDATE` RLS policy (editor-level access required). PATCH 8O.2 solved the
UI/ownership half of this in full (above) and designed -- but never applied --
a persistence half. PATCH 8O.2a live-tested the permission-resolution
approach that design depended on (`get_board_permission`) and found it
inoperable against the live product (see "Live status" above and
`LESSONS_LEARNED.md`). PATCH 8O.3 formally quarantined the design as
**DORMANT / NOT DEPLOYABLE**:

- **Where it lives now**: `.fable5/drafts/comment_mutate_rpc_20260812.sql`
  (moved out of `supabase/migrations/` so migration tooling cannot apply it;
  see that file's own DORMANT banner for the full reasoning). It is design
  reference for a future board-sharing feature, not a pending deployment.
- **Why not `GRANT commenter UPDATE ON padlets`** (still valid reasoning,
  preserved): `padlets.metadata` is one jsonb column holding the whole post's
  metadata. A client UPDATE necessarily replaces the entire value it sends --
  there is no column- or key-level RLS for jsonb in Postgres. Granting
  blanket UPDATE would let a commenter submit ANY replacement metadata:
  rewrite another user's comment, delete another user's comment, forge
  `comment.userId`, or edit unrelated fields entirely (cardColor, container
  membership, ...). This principle still holds for whenever persistence is
  rebuilt.
- **What's still valid in the dormant design**: the narrow-operation shape
  (`ADD_COMMENT`, `EDIT_OWN_COMMENT`, `STYLE_OWN_COMMENT`,
  `DELETE_OWN_COMMENT`), touching only `metadata.detachedComments`, never
  trusting a client-supplied identity for `comment.userId`, and the
  REVOKE/GRANT EXECUTE privilege hardening from PATCH 8O.2a.
- **What's known-wrong and must be rebuilt**: the PERMISSION-RESOLUTION steps
  -- `get_board_permission(v_padlet.canvas_id, ...)` targets the dead
  `canvases` vertical, and the `board_collaborators` legacy-path fallback
  assumes rows that live workspace-authorized users routinely don't have
  (their access comes from workspace membership, not per-board collaborator
  rows). Any future revival must resolve permission against the live
  `boards`/`padlets`/workspace-membership model instead, satisfying the five
  "Activation requirements" listed under "Live status" above.
- **Client wiring stays in place, still inert**: `lib/infra/canvas/
  commentMutations.ts` still calls a `comment_mutate` RPC that does not exist
  in the live database -- every call fails immediately and safely with
  "function comment_mutate(...) does not exist", caught and surfaced via
  `toast.error` (no fake success). This is intentional and unchanged by
  PATCH 8O.3: quarantining the SQL file doesn't require touching the client
  module, since it was already designed to fail safe against an absent
  function. `ClipartCardDraftModal.tsx`'s own-comment mutations similarly
  stay on their pre-existing `updateMetadata`-then-`saveCard` draft path
  (ownership-gated via `guardOwnCommentMutation`), unaffected by this patch.

`BoardPermission === 'commenter'` is not reachable by any live user today
(see "Live status" above), so the RLS-rejection gap PATCH 8O.1 originally
documented is currently moot in practice -- but the domain/UI/persistence
design that will close it once a real commenter signal exists remains fully
built, tested, and now clearly quarantined rather than silently stale.

**Drawing normal/detached comments were wired in PATCH 8R** (2026-08-12) --
unlike Document, Drawing's inventory found a genuine, incomplete Category-A
tier: `DrawingEditor.tsx`'s own left-toolbar Comment button/badge/panel is
the ONLY live normal/detached comment entry point (no on-canvas badge/
toolbar CommentPopup exists for Drawing in `FreeformPadletCards.tsx` or
`CanvasClient.tsx`, unlike Note/Clipart/Image), and it was missing
`accessMode`, `onEditComment`/`onRemoveComment`/`onToggleCommentStrikethrough`,
`commentTitle`/`commentTitleStyle`, and real identity (hardcoded
`userId: 'anon', userName: 'You'`) -- all now wired the same way as Note's
own-editor site: `guardCommentMutation(accessMode, ...)` directly at every
prop (COMMENT mode stays dormant for Drawing too), `accessMode`/
`currentUserId`/`currentUserName` threaded from `CanvasModals.tsx`'s existing
`user`/`commentAccessMode` props into both live `DrawingEditor` instances
(the edit modal and the read-only lightbox). The Comment button/badge/panel
were also pulled out of the `{!readOnly && (...)}` gate that previously hid
the ENTIRE left toolbar in the read-only lightbox -- previously a reader
could not even see that a Drawing had comments; Text style/Color/Reaction/
Caption remain hidden in read-only, unaffected, since they are unrelated to
comments. `accessMode` is intentionally independent of the modal's own
`readOnly` prop: a writable-workspace user previewing a Drawing through the
read-only lightbox still has full comment rights (`commentAccessMode` is
resolved from workspace role, not from which modal route opened the
Drawing). Drawing has no anchored/highlighted (Category B) comment system at
all -- `ExcalidrawWrapper.tsx` and the wider Excalidraw fork contain zero
comment-related code -- so there is no freeze guard required for this
migration. See `canonicalCommentPermission.contract.test.tsx`'s "Drawing --
DrawingEditor.tsx own detached-comment CommentPopup" block for the
permission-wiring proof and `DrawingEditor.commentCanonicalization.test.tsx`
for the mounted MANAGE/READ/identity/persistence behavioral proof.

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
recorded above; Note anchored/highlighted threads remain unmigrated. Document
(PATCH 8Q) and Container (PATCH 8W) were classified N/A -- neither has a live
Category-A comment tier to migrate. Comment post (PATCH 8X) was classified
SPECIAL / PRIMARY THREAD -- its comment list is the post's entire primary
content, and its own editor UI is strictly richer than canonical CommentPopup
today, so it is deliberately not folded into this rollout.

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
