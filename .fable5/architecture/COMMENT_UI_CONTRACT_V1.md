# Canonical Comment UI Contract v1

## Rollout status (updated PATCH 8AL, 2026-08-13)

NORMAL UI CANONICALIZATION = **CLOSED**
COMMENT PERMISSION SAFETY = **CLOSED**
SPECIAL UI CONSOLIDATION = **NOT CLOSED / NOT YET DECIDED**
DEAD CODE CLEANUP = **PARTIAL -- proven-unreachable comment surfaces removed (PATCH 8AF); the dead Card Post Modal wrapper's non-comment remainder removed (PATCH 8AG); RowCanvas.tsx (whole file) and the "Left Toolbar" false block removed (PATCH 8AI); the superseded CommentList/FreeformCommentRow pilot removed (PATCH 8AK); the dormant COMMENT tier's "shelve vs activate" decision was resolved as SHELVE/RETAIN DORMANT (PATCH 8AL, not a deletion) -- no comment-related cleanup items remain open**
KANBAN COMMENT SYSTEM = **OUTSIDE CURRENT COLLABBOARD CONTRACT**
COMMENTER-ONLY / COMMENT TIER = **SHELVED -- NOT LIVE** (PATCH 8AL)
COMMENT TIER SECURITY READINESS = **NOT READY** (PATCH 8AL)
COMMENT TIER ACTIVATION = **PROJECT-SCALE FUTURE PRODUCT/AUTHORIZATION WORK** (PATCH 8AL)

"COMMENT PERMISSION SAFETY = CLOSED" means: every live CollabBoard/Padlet
comment surface (normal/detached, special/primary-thread, special/anchored,
and both embedded-child renderer families, including the Map layout closed
by PATCH 8AE.1) enforces the same READ/MANAGE model, the dormant COMMENT
tier has exactly one producer and it is never fed a live `boardPermission`,
and no live hardcoded identity write remains. It does **not** mean every
comment UI shares one implementation -- see "SPECIAL UI CONSOLIDATION" below,
and the "Embedded-renderer matrix"/"Next-phase backlog" sections for the
architectural (not security) decisions still open. See the "Map layout
permission gap" and the closing PATCH 8AE.2 section near the end of this
document for the full closure audit trail.

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
for the permission-wiring proof at all three Category-A sites. Note's OTHER
`CommentPopup` (the selected-text/anchored-thread popup) was later
permission-wired too, in PATCH 8AB (2026-08-13, see "Note anchored/highlighted
comments were permission-wired in PATCH 8AB" further below) -- it is no
longer unwired or unconditionally writable.

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

## NORMAL COMMENT ROLLOUT — CLOSED

**PATCH 8Y (2026-08-13)** performed a repository-wide closure audit,
independently re-deriving the live post-type registry and comment-surface
inventory from source rather than trusting this document, and added
`components/collabboard/normalCommentRolloutClosure.contract.test.tsx` as the
permanent enumeration guard. Result: **the normal/detached comment UI
rollout for the padlets/collabboard canvas is CLOSED.** Every live post type
is classified below; no unaccounted-for live `<CommentPopup>` usage exists;
the closure guard passes.

### Live post-type registry (independently re-derived)

`Padlet['type']` (`types/collabboard.ts`) is `'text' | 'image' | 'file' |
'table' | 'link' | 'todo' | 'container' | 'comment' | 'drawing' | 'card' |
'note' | 'ai-component'`. Of these, `'file'` is dead -- it appears only
inside `lib/PadletTemplates.ts`'s `getPadletTemplate()`, which is itself
never imported or called anywhere in the app (confirmed via a repo-wide
`getPadletTemplate` reference search returning only its own definition
file) -- and is not a live post family. `'text'` and `'note'` are two
literal type values for the SAME live Note family: `useCanvasActions.ts`'s
`handleAddPostAtViewportCenter` creates new posts with `type: "note"` by
default, while `FreeformPadletCards.tsx:3058` explicitly treats
`padlet.type === 'text'` and `(padlet.type as string) === 'note'`
identically for editor dispatch -- both routed through the same, already-
canonical `NoteEditor.tsx`. `'card'` covers two distinct product-facing
families disambiguated by metadata, per `lib/domain/canvas/documentPost.ts`:
`isDocumentPost = post.type === 'card' && !post.metadata?.svgUrl` (Document);
a `'card'` post WITH `metadata.svgUrl` is Clipart. This yields 11 live
product-facing post families for 10 live type literals (`'file'` excluded).

### Closure matrix

| Post type | Live type value(s) | Normal/detached? | Status | Special system | Permission note |
| --- | --- | --- | --- | --- | --- |
| Clipart | `card` (+ `svgUrl`) | yes | CANONICAL | none | guarded |
| Image | `image` | yes | CANONICAL | none | guarded (3 entry points) |
| Note | `text` / `note` | yes | CANONICAL | anchored/highlighted threads | normal tier guarded; anchored tier **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AB) |
| Drawing | `drawing` | yes | CANONICAL | none | guarded |
| Todo | `todo` | yes | CANONICAL | none | guarded |
| AI Component | `ai-component` | yes | CANONICAL | none | guarded |
| Link | `link` | yes | CANONICAL | none | guarded |
| Table | `table` | yes | CANONICAL | none | guarded (storage: `padlet.content` JSON, not `metadata`) |
| Document | `card` (no `svgUrl`) | no | N/A (PATCH 8Q) | anchored/highlighted threads | N/A normal; anchored tier **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AA) |
| Container | `container` | no | N/A (PATCH 8W) | embedded child `CommentPopup` renderer | N/A normal; child renderer **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AC) |
| Comment post | `comment` | no (its entire body IS the comment thread) | SPECIAL / PRIMARY THREAD (PATCH 8X) | is itself the special system | all 3 live surfaces UNGATED |

### Special-system matrix

| Special system | Live surfaces | Permission status |
| --- | --- | --- |
| Note anchored/highlighted threads | `NoteEditor.tsx` (in-modal), `OverlayLayer.tsx` (on-canvas, shared with Document) | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AB, 2026-08-13) |
| Document anchored/highlighted threads | `DocumentEditor.tsx` (in-modal), `OverlayLayer.tsx` (on-canvas, shared with Note) | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AA, 2026-08-13) |
| Comment post primary thread | `CommentPost.tsx`, `FreeformPadletCards.tsx`'s collapsed-marker inline block, `CommentEditor.tsx` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8Z, 2026-08-13) |
| Container embedded child `CommentPopup` renderer | `ContainerEditor.tsx`'s `SortableChildItem` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AC, 2026-08-13) |
| `EmbeddedCommentList` (compact child renderer) | `RowColumnContainerCard.tsx`, `PostCardContent.tsx`, `DrawingLayout.tsx` (standalone comment posts on the Drawing canvas -- a 3rd host discovered during PATCH 8AD's inventory, not previously listed here), `components/map/PostPopup.tsx` (Map layout pin popup -- a 4th host discovered during PATCH 8AE's audit, missed by PATCH 8AD because Map was not among the layouts that patch traced) | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AD, 2026-08-13 for the first 3 hosts; PATCH 8AE.1, 2026-08-13 for the Map host) |

None of these was fixed by PATCH 8Y itself -- verification only, per that
patch's own instruction not to redesign permissions. At the time PATCH 8Y
closed, all five surfaces shared the same underlying gap: real identity was
generally present, but no caller wrapped its mutation callbacks in
`guardCommentMutation`/checked `accessMode`, so a workspace-readonly user
could mutate any of them. Each has since been closed by its own dedicated
patch -- Note (PATCH 8AB), Document (PATCH 8AA), Comment post (PATCH 8Z),
Container's embedded child `CommentPopup` renderer (PATCH 8AC), and
`EmbeddedCommentList` (PATCH 8AD) are all now **PERMISSION SAFE -- READ /
MANAGE**.

**PATCH 8AE's own repo-wide closure audit (2026-08-13) found this table was
still incomplete**: `EmbeddedCommentList` had a 4th live host --
`components/map/PostPopup.tsx`, reached via `CanvasClient.tsx` ->
`components/map/MapCanvas.tsx` -> `PostPopup.tsx` -> `RowColumnContainerCard.tsx`/
`PostCardContent.tsx` -- that PATCH 8AD's own inventory never traced, because
that patch's layout sweep did not include the Map layout. `MapCanvas.tsx`
passed its (real, Supabase-backed) `onUpdateChildComments` callback down
unconditionally, but neither `MapCanvas.tsx` nor `PostPopup.tsx` threaded an
`accessMode`, so `RowColumnContainerCard`/`PostCardContent` silently fell back
to their own `'manage'` default regardless of the viewer's actual
`WorkspaceRole` -- a workspace-readonly user could mutate a Map container
pin's child comments. PATCH 8AE did not fix this (audit-only, per its own
STOP-condition instructions); **PATCH 8AE.1 (2026-08-13) closed it** by
threading `commentAccessMode` through the same three-link chain used by every
other layout: `CanvasClient.tsx` -> `MapCanvas.tsx` (`commentAccessMode` prop)
-> `PostPopup.tsx` (`accessMode` prop, forwarded to both
`RowColumnContainerCard` and `PostCardContent`). No new access-mode producer
was introduced -- `resolveCommentAccessMode(currentWorkspaceRole)` remains the
sole live call site.

Every special-system surface in this table is now closed. **PATCH 8AE.2
(2026-08-13)** performed the agreed second, independent closure audit: a
fresh repo-wide surface search (not derived from this document), a durable
`components/collabboard/commentPermissionClosure.contract.test.tsx` closure
guard (completeness search over every live `<CommentPopup>`/
`<EmbeddedCommentList>` JSX usage, per-block `accessMode` gating, the full
Map chain, single-producer/dormant-COMMENT proof, dead-surface
re-verification, and a child-id ownership proof covering all five mutation
types across all three `EmbeddedCommentList` host files), and 20 negative
controls (A-T) -- each run for real (backup/mutate/observe-failure/restore),
not merely source-inspected. Two controls (R: a hand-rolled duplicate
composer added next to an already-gated `EmbeddedCommentList` block; S: one
mutation handler, `onColorChange`, retargeted to the parent Container's id)
were not caught by the guard as first written -- both were genuine gaps in
guard *coverage*, not live production defects (production code was correct
in both cases; the negative control revealed what a regression there would
have looked like), and both were closed by strengthening the guard in the
same session before re-running the control to confirm it now fails
correctly. No unexpected live surface and no unexpected permission gap were
found. Full validation (2251 tests, typecheck, boundaries, `git diff
--check`) passed clean with zero production code changes. **SPECIAL COMMENT
PERMISSION ROLLOUT is now declared CLOSED** -- see the status block at the
top of this document.

### Embedded-renderer matrix

| Host component | Child post types served | Read/write | Storage field | Permission | Why not full `CommentPopup` |
| --- | --- | --- | --- | --- | --- |
| `RowColumnContainerCard.tsx` | any child (via `detachedComments`) + comment-type children (via `comments`) | both | child's own `metadata.comments` / `metadata.detachedComments` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AD) | intentionally compact, narrow-width embedded presentation (own header/counter/composer sized for a container card slot) -- full `CommentPopup` would change the embedded layout model, not just its implementation |
| `PostCardContent.tsx` (Drawing-in-container image binding, plus a comment-type-child rendering path reused for nested containers) | any child (via `detachedComments`) | both | child's own `metadata.detachedComments` / `metadata.comments` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AD) | same reasoning as above |
| `DrawingLayout.tsx` (standalone comment posts on the Drawing canvas, not a container child at all) | N/A -- root-level comment post | both | the post's own `metadata.comments` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AD) | Drawing layout renders standalone Comment-type posts through this compact embeddable renderer rather than the canonical `CommentPost.tsx`/`CommentEditor.tsx` pair every other layout uses -- an existing architectural inconsistency, not something PATCH 8AD's permissions-only scope corrects |
| `components/map/PostPopup.tsx` (Map layout pin popup -- container branch renders `RowColumnContainerCard`, non-container branch renders `PostCardContent`) | any child (via `detachedComments`) + comment-type children (via `comments`) | both | child's own `metadata.comments` / `metadata.detachedComments` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AE.1, 2026-08-13; PATCH 8AD missed this host entirely) | delegates to the same two hosts as the row above (`RowColumnContainerCard.tsx`/`PostCardContent.tsx`), just reached through the Map layout's own popup shell instead of an on-canvas card -- same compact-presentation reasoning applies |
| `ContainerEditor.tsx`'s `SortableChildItem` | comment-type children only | both | child's own `metadata.comments` | **PERMISSION SAFE -- READ / MANAGE** (PATCH 8AC) | already uses canonical `CommentPopup` directly (`embedded`/`fullWidth` props), unlike the three hosts above -- a pre-existing inconsistency between the two embedded-child code paths, noted here as a fact, not reconciled by either PATCH 8AC or PATCH 8AD (see next-phase backlog item 4) |

None of these was migrated to canonical `CommentPopup`. `EmbeddedCommentList`/
`CommentRow.tsx` remain a fourth, independent, genuinely-editable comment UI
implementation, intentionally distinct from `CommentPopup` -- legitimate per
this rollout's own architecture rule (storage differences belong below the UI
boundary; UI *presentation* differences for a deliberately compact embedded
context are a separate, accepted exception, not a duplicate to eliminate).
PATCH 8AD added an `accessMode?: CommentAccessMode` prop (default `'manage'`)
to `EmbeddedCommentList.tsx` and its sole caller `CommentRow.tsx`, and to
`RowColumnContainerCard.tsx`/`PostCardContent.tsx`/`DrawingLayout.tsx` --
permission wiring only, this compact presentation itself is unchanged.

**PATCH 8AO (2026-08-13) fixed a permission-semantics bug in `CommentRow.tsx`
found by PATCH 8AN's consolidation audit**: Edit had derived its ownership
check from an ad hoc `canManage && comment.userId === currentUserId` rule --
STRICTER than canonical semantics, since it blocked a MANAGE-mode user from
editing another user's comment through this compact renderer (every other
canonical comment surface lets MANAGE edit any comment). Replaced with the
same domain authority every other surface already uses,
`canMutateComment(accessMode, comment, currentUserId)` (`lib/domain/canvas/
comments.ts`), applied uniformly to Edit, Color (transitively, via the same
edit-entry gate), Strikethrough, and Delete. The row's outer render gate
changed from `accessMode === 'manage'` to `accessMode !== 'read'` so the
already-existing (but still dormant-live) COMMENT tier is representable here
too, matching every other canonical surface -- this does not make COMMENT
live; `resolveCommentAccessMode` still has exactly one call site and it is
still never passed a `boardPermission`. No storage, chrome, or embedded-vs-
canonical shell decision changed.

### Dead/orphaned comment code inventory

**REMOVED DEAD CODE (PATCH 8AF, 2026-08-13)** -- all three items below were
independently re-proven unreachable (not merely re-cited from this
document), then deleted:

1. `CommentViewPopup.tsx` (`components/collabboard/editors/CommentViewPopup.tsx`)
   -- zero production importers, zero test importers, zero dynamic/barrel
   references anywhere in the repo. Deleted entirely.
2. Container's own `detachedComments`/`commentPopupOpen`/`commentPopupPosition`/
   `handleComment`/`handleAddComment` skeleton in `ContainerEditor.tsx`
   (found PATCH 8W) -- round-tripped through `onSave`/`saveContainer` but
   never reachable from any live UI trigger. `commentPopupOpen`/
   `commentPopupPosition`/`handleComment`/`handleAddComment` were deleted;
   `detachedComments`/`setDetachedComments`/`initialDetachedComments` were
   kept as-is (unrelated to the dead trigger -- they exist to round-trip any
   pre-existing `metadata.detachedComments` through `onSave` non-destructively,
   and deleting them would have silently dropped that data on next save, a
   storage change this patch's own scope forbids).
3. The "Todo Comments Popup - Right side" mislabeled block inside
   `FreeformPadletCards.tsx`'s `padlet.type === 'comment'` branch (first
   flagged PATCH 8S/8U, confirmed genuinely dead PATCH 8X via a grep-complete
   audit of every `setCardCommentPopupPadletId(padlet.id)` call site).
   Deleted, along with its directly-adjacent, equally-unreachable
   `commentColorPopupId` color-popup companion block (same
   `cardCommentPopupPadletId === padlet.id` guard). The live `<CommentPost>`
   rendering and the live collapsed-marker popup in the same branch were
   untouched.
4. **Correction to this document's own prior classification**: the item
   previously listed here as "the toolbar-open Clipart block... gated on
   `cardToolbarPadletId`" was re-investigated in full during PATCH 8AF.
   `cardToolbarPadletId` does have zero live non-null setters anywhere in the
   codebase (independently re-confirmed), so the entire "Card Post Modal"
   wrapper in `FreeformPadletCards.tsx` (`cardToolbarPadletId &&
   activeCardToolbarPadlet && (...)`) is unreachable -- but its comment
   sub-block is not, and never was, Clipart-specific. Its own anchor comment
   ("Note detached comments use the canonical panel; this toolbar shell owns
   placement only.") and `canonicalCommentPermission.contract.test.tsx`'s own
   PATCH 8P-era test title ("Note -- two detached-comment entry points...
   toolbar popup") both identify it as the *second* of Note's two
   PATCH 8P detached-comment entry points -- a duplicate of the live
   "on-canvas badge popup" that, it turns out, was never actually reachable
   at runtime (its own test only ever checked prop-wiring correctness of the
   JSX source, never reachability -- exactly the class of gap this cleanup
   patch exists to close). The "Clipart" label in the original freeze
   appears to have been an inference from `CardActionsToolbar`/
   `CardColorPanel` also being used by the live, untouched
   `ClipartCardDraftModal.tsx`, not from the block's own actual comment
   content. Only the comment sub-block (the `<CommentPopup>` render, gated
   on `cardCommentPopupPadletId === activeCardToolbarPadlet.id`) was
   deleted, matching this patch's comment-only scope; the rest of the
   Card Post Modal wrapper -- `CardActionsToolbar`/`CardColorPanel`/
   `EmojiReactionPicker`, all non-comment, all also unreachable via the same
   dead `cardToolbarPadletId` gate -- was deliberately left untouched and is
   recorded below as a new, separate, **not-yet-actioned** finding.

**REMOVED in PATCH 8AG (2026-08-13)**: the rest of the "Card Post Modal"
wrapper in `FreeformPadletCards.tsx` -- the `cardToolbarPadletId`/
`activeCardToolbarPadlet`-gated `CardActionsToolbar`/`CardColorPanel`/
`EmojiReactionPicker`/`CardPreview` instantiation left in place by PATCH
8AF as an out-of-scope (non-comment) finding. PATCH 8AG independently
re-confirmed `cardToolbarPadletId` has zero live non-null setters anywhere
in the codebase (all four `setCardToolbarPadletId(` call sites, across
`CanvasClient.tsx` and `FreeformPadletCards.tsx`, set it only to `null`),
then deleted the entire wrapper (including the `activeCardToolbarPadlet`
derived const, its sole remaining consumer) while leaving
`CardActionsToolbar`/`CardColorPanel`/`EmojiReactionPicker` themselves
untouched -- all three remain live via `ClipartCardDraftModal.tsx` (and
`EmojiReactionPicker` additionally via `CanvasClient.tsx`/`NoteEditor.tsx`/
`DrawingEditor.tsx`/`LinkEditor.tsx`/`TodoEditor.tsx`/`AIComponentEditor.tsx`),
and `cardToolbarPadletId`/`setCardToolbarPadletId` themselves were kept --
neither is "fully unused": `cardToolbarPadletId` still gates three live,
pre-existing guards elsewhere in `FreeformPadletCards.tsx` (the on-canvas
color picker, emoji picker, and comment-popup panels each check
`!cardToolbarPadletId` before rendering), and `setCardToolbarPadletId` is
still called from `CanvasClient.tsx`'s own "close every overlay" reset
functions regardless of this wrapper's existence.

**REMOVED in PATCH 8AI (2026-08-13)**: the second, separate dead block in
`FreeformPadletCards.tsx` found during PATCH 8AG's own audit, the "Left
Toolbar - moved to card modal" block (`{false && cardToolbarPadletId ===
padlet.id && (...)}`), permanently unreachable via a hardcoded `false &&`
short-circuit. It contained the file's last remaining `<CardActionsToolbar>`
instance; that import is now removed from `FreeformPadletCards.tsx` too
(the component itself stays live via `ClipartCardDraftModal.tsx`).
`cardToolbarPadletId`/`setCardToolbarPadletId` were kept (still gate three
live guards elsewhere in this file; `setCardToolbarPadletId` is still called
from `CanvasClient.tsx`'s reset-all-overlays functions), per the same
non-fully-unused reasoning as PATCH 8AG.

**REMOVED in PATCH 8AI (2026-08-13)**: `RowCanvas.tsx`
(`components/canvas/RowCanvas.tsx`, 979 lines), left untouched through
PATCH 8AF/8AG as an explicit scope decision (its comment renderer was dead,
but the file was a complete standalone alternate canvas implementation --
deleting it was ruled out-of-scope for a "dead comment code cleanup" patch).
PATCH 8AI independently re-confirmed zero production importers, zero
dynamic/lazy references, and zero route/layout registry entries, then
deleted the file whole. Its five component dependencies
(`WallContainerContextMenu`, `PostCardContent`, `PostPreviewCard`,
`SafeHtmlContent`, `EmbeddedCommentList`) were re-audited and confirmed live
via other callers -- none were touched. The live grid/row renderer remains
`components/collabboard/row/RowCanvasDnD.tsx` → `RowLane.tsx`, unaffected.

**REMOVED in PATCH 8AK (2026-08-13)**: the `CommentList`/`FreeformCommentRow`
pilot foundation (`components/collabboard/comments/{CommentList,
FreeformCommentRow}.tsx` and their three pilot-only tests). Formerly listed
here as DORMANT / PILOT -- PRESENT; PATCH 8AJ's disposition audit found it
SUPERSEDED, not merely unadopted (git history shows it was genuinely live
for Site A/Image for ~23 hours, commits `1ac73ac`→`cd35d76`, before Image
migrated again onto canonical `CommentPopup`), predating the
`CommentAccessMode` permission architecture entirely, and offering no
capability not already duplicated or exceeded by `CommentPopup`/
`CommentRow.tsx`. See "Next-phase backlog" item 3b below for the full
corrected history. `lib/domain/canvas/comments.ts` (independently live via
`NoteEditor.tsx` and other canonical callers) was not touched.

### Storage ownership audit

| Storage location | Owner post type(s) | Normal or special | Write path | Read path |
| --- | --- | --- | --- | --- |
| `metadata.detachedComments` | Note, Drawing, Todo, AI Component, Link | normal (Category A) | `updatePadletMetadata` / editor `onSave` | same |
| `metadata.comments` (primary) | Comment post; a Container child of type `comment`; read/written generically by `EmbeddedCommentList` for any comment-type child | special (Category B primary thread) / embedded child | `updatePadletMetadata`, `saveComment`, `onUpdateChildComments` | same |
| `padlet.content` JSON blob fields (`comments`/`badgeColor`/`commentTitle`/`commentTitleStyle`) | Table | normal (Category A), uniquely NOT in `metadata` | `updatePadletContent` / `TableEditor`'s own `JSON.stringify` payload | same |
| TipTap `comment` mark (`extensions/Comment.ts`) + associated thread data | Note anchored threads, Document anchored threads | special (Category B anchored) | `NoteEditor.tsx`/`DocumentEditor.tsx`/`OverlayLayer.tsx`'s anchored `CommentPopup` sites | same |
| `kanban_comments` (separate Supabase table) | kanban-canvas cards | **not part of this system at all** (see below) | `lib/kanban/supabaseAdapter.ts` | same |

No canonical normal migration (Note/Drawing/Todo/AI Component/Link/Table)
changed its pre-existing authoritative storage field -- each migration's own
patch report explicitly proved this (most rigorously for Table, whose
`padlet.content`-based storage is unique among all migrated types).

### A system found outside this rollout's frame: kanban-canvas

The PATCH 8Y full-repo sweep (`components/kanban-canvas`) found a complete,
independent, live normal-comment feature: `Editor.tsx`'s inline comment
list/composer and `Card.tsx`'s count badge, against the `kanban_comments`
Supabase table via `lib/kanban/supabaseAdapter.ts` -- not `padlets.metadata`,
not `CommentPopup`, not `EmbeddedCommentList`. Its own permission model is a
simple boolean (`readOnly` disables `addComment`/`deleteComment` entirely),
structurally unrelated to `CommentAccessMode`/`guardCommentMutation`.

**This does not block "NORMAL COMMENT ROLLOUT -- CLOSED" above and was not
treated as PATCH 8Y's "unexpected live normal/detached implementation" stop
condition.** That stop condition, and every patch in the 8-series before it,
is scoped to `Padlet['type']` -- the padlets/collabboard canvas post-type
registry enumerated above. Kanban cards are not `Padlet` rows; they live in
an entirely separate vertical (`kanban_*` tables, `components/kanban-canvas`,
per `.fable5/CLAUDE.md`'s own architecture notes) with a different board
model (columns/swimlanes, not the freeform canvas) that has never been in
scope for this rollout at any point. Treating it as an in-scope gap would be
exactly the kind of scope creep this whole series has consistently avoided
(compare: Link's migration deliberately left the post's own URL fields
untouched; Container's investigation deliberately left child-post ownership
untouched). `normalCommentRolloutClosure.contract.test.tsx` records the
finding permanently (two structural tests proving the two verticals import
neither module) so it is not silently lost, without pretending it was ever
this rollout's job to fix. Whether to unify kanban's comment UX with
`CommentPopup` someday is a real, separate product decision for a
differently-scoped future initiative -- not a numbered follow-up in the
8-series, since it was never a member of the post-type registry this series
migrates.

### Next-phase backlog (priority order, not implemented)

1. ~~**Permission wiring for the remaining UNGATED special surfaces**~~ --
   **CLOSED.** Note anchored threads (PATCH 8AB), Document anchored threads
   (PATCH 8AA), Comment post primary thread (PATCH 8Z), Container's embedded
   child `CommentPopup` renderer (PATCH 8AC), `EmbeddedCommentList` at its
   `RowColumnContainerCard.tsx`/`PostCardContent.tsx`/`DrawingLayout.tsx`
   hosts (PATCH 8AD), and `EmbeddedCommentList` at its
   `components/map/PostPopup.tsx` host (discovered missing by PATCH 8AE,
   closed by PATCH 8AE.1) are all **PERMISSION SAFE -- READ / MANAGE**.
   **PATCH 8AE.2 (2026-08-13)** ran the agreed second, independent closure
   audit -- fresh inventory, a durable closure guard, and 20 real (not
   source-inspected) negative controls -- found no further gap, and declared
   **SPECIAL COMMENT PERMISSION ROLLOUT -- CLOSED**. This item is fully
   closed; there is no further permission-wiring patch pending.
2. **Comment post primary-thread dedicated adapter patch** (per PATCH 8X) --
   whether to bring its rich TipTap composer capability (Bold/Italic/
   Underline/lists/code/align/emoji) INTO `CommentPopup` as an opt-in
   richer mode, or to formally document it as a permanently separate
   surface with its own frozen contract, is a real product decision this
   audit surfaces but does not make.
3. **Dead/orphaned comment code cleanup** (four items -- see the "Dead/orphaned
   comment code inventory" section above, including
   `components/collabboard/editors/CommentViewPopup.tsx`, found by PATCH 8AE
   to have zero importers anywhere, including its own tests) -- low risk, no
   live behavior change, but currently dead code that could confuse a future
   patch (as the "Todo Comments Popup" mislabel already did twice). The
   dormant `commentMutations.ts`/COMMENT-tier RPC path is a related but
   separate decision (item 3c below), since deleting a fully-built-but-
   dormant tier is a different call than deleting truly dead code.
   - 3b. **`CommentList`/`FreeformCommentRow` pilot foundation -- REMOVED /
     SUPERSEDED (PATCH 8AK, 2026-08-13).** Corrected history (the prior
     version of this document claimed the pilot was "never actually swapped
     into live rendering" -- independently re-checked via git history for
     PATCH 8AJ and found factually wrong): commit `227558d` built the shared
     `CommentList`/`FreeformCommentRow` foundation to reproduce Site A
     (image-post badge-triggered comments) 1:1; commit `1ac73ac`, ~1 hour
     later, genuinely migrated Site A to live-consume it -- it was real,
     wired production code for roughly 23 hours. Commit `cd35d76`
     ("migrate image posts to canonical comments") then moved Site A again,
     this time onto canonical `CommentPopup`, leaving the pilot with zero
     production importers from that point on. PATCH 8AJ's audit found every
     pilot capability now duplicated or exceeded by live foundations
     (`CommentPopup`'s permission/identity/title/badge-color/per-row/Link
     support; `CommentRow.tsx`'s per-row/anchored-popup/TipTap/ownership
     model), no unique reusable abstraction, and that the pilot predates the
     `CommentAccessMode` permission architecture entirely (its whole live
     window, 2026-08-11, precedes the first permission-enforcement commits
     on 2026-08-12). PATCH 8AK deleted `CommentList.tsx`,
     `FreeformCommentRow.tsx`, and their three pilot-only tests
     (`CommentList.test.tsx`, `FreeformCommentRow.test.tsx`,
     `siteA.pilotParity.test.tsx` -- the last of these was itself a
     deliberate historical BEFORE/AFTER record, preserved in git history
     rather than converted into a new live contract). `lib/domain/canvas/
     comments.ts` (independently live via `NoteEditor.tsx` and many other
     canonical callers) was not touched.
   - 3c. **Dormant COMMENT tier** (`comments.ts`'s `'comment'` mode,
     `commentMutations.ts`, `CommentPopup.commentMode.test.tsx`) -- fully
     built and tested but unreachable (no live `boardPermission` producer).
     Decide: wire up a real board-level commenter role, or formally shelve/
     remove the dormant tier.
4. **Reconcile the embedded-child-renderer code paths** (`ContainerEditor.tsx`'s
   direct `CommentPopup` usage vs. `RowColumnContainerCard.tsx`/`PostCardContent.tsx`/
   `DrawingLayout.tsx`/`components/map/PostPopup.tsx`'s shared `EmbeddedCommentList`
   usage) -- an existing inconsistency, not a regression, and NOT resolved by
   PATCH 8AC, 8AD, 8AE.1, or 8AE.2 (all explicitly permissions-only; PATCH
   8AD's own spec named this exact question -- "should EmbeddedCommentList
   eventually be consolidated with CommentPopup" -- as deliberately out of
   scope). All paths are now equally permission-safe, so this item is purely
   an architecture/consistency decision, no longer a security question. This
   is "SPECIAL UI CONSOLIDATION" in the rollout-status block at the top of
   this document -- explicitly NOT closed by the permission rollout.
5. **kanban-canvas comment system** -- out of this rollout's frame entirely
   (see above); listed last because it requires its own scoping decision
   (does the product want unified comment UX across both verticals at all?)
   before any implementation planning is meaningful.

### Closure architecture guard

`components/collabboard/normalCommentRolloutClosure.contract.test.tsx`
enumerates every live `<CommentPopup>` usage across `components/collabboard`
(excluding the vendored Excalidraw fork) and
`app/dashboard/canvas/[id]/CanvasClient.tsx`, and asserts the total (20) and
per-file breakdown against the classified inventory above -- structurally,
via string counts, not line numbers. It fails if: a known canonical post
regains a local comment implementation or drops `accessMode=`; an N/A post
type (Document, Container) gains a second `<CommentPopup>` usage; a live
Container on-canvas comment badge appears (the `padlet.type === 'container'`
branch is asserted to contain zero `<CommentPopup>` usages); the single live
`resolveCommentAccessMode(` call site gains a `boardPermission` argument
(which would silently end the dormant-COMMENT-tier characterization); or an
entirely new file gains a `<CommentPopup>` usage the map doesn't know about.
Verified by two negative controls during PATCH 8Y (a fake `<CommentPopup`
string injected into the Container branch; `accessMode={accessMode}` deleted
from `DrawingEditor.tsx`) -- both caught, both restored exactly.

## Comment post primary thread -- PERMISSION SAFE (PATCH 8Z)

**PATCH 8Z (2026-08-13)** wired the READ/MANAGE permission contract into all
three live Comment-post primary-thread surfaces identified as PERMISSION
UNGATED by PATCH 8Y's audit -- closing item 1 of that audit's next-phase
backlog for this specific surface. This is a permissions-only patch: Comment
post remains classified **SPECIAL / PRIMARY THREAD** (PATCH 8X) and was not
migrated to canonical `CommentPopup`, its `metadata.comments` storage
ownership is unchanged, and `CommentEditor.tsx`'s TipTap extension set
(Bold/Italic/Underline/lists/CodeBlock/TextAlign/emoji, strictly richer than
canonical `CommentPopup`) is byte-for-byte unchanged.

All three surfaces gained an `accessMode?: CommentAccessMode` prop (default
`'manage'`), threaded from the same existing `commentAccessMode` signal every
canonical caller already uses (`FreeformPadletCards.tsx` for the two
on-canvas surfaces, `CanvasModals.tsx` for `CommentEditor.tsx` -- no new
authorization lookup was added anywhere). COMMENT mode stays dormant here
too: each surface treats any `accessMode !== 'manage'` as read-only, matching
`guardCommentMutation`'s own semantics, since only `'read'` and `'manage'`
are ever live.

Two-layer defense at every mutation entry point, matching the pattern
established for every canonical `CommentPopup` caller:

1. **UI affordance unavailable in READ** -- the composer, per-row Edit/
   Color/Strikethrough/Delete actions, badge-color trigger, and title-edit
   entry point are none of them *rendered* in read-only (not merely
   disabled), at all three surfaces. `CommentEditorToolbar.tsx` gained a
   `readOnly` prop that disables (via its existing disabled-styling
   mechanism) only the Text-style/Link/React tools that mutate comment
   content -- Card Color and Collapse remain available in READ, since
   they are post presentation/view-state, not comment mutations, and this
   patch deliberately does not gate controls outside the comment-thread
   capability (see "Scope note" below).
2. **Handler cannot execute in READ** -- every internal handler that
   mutates `comments`/`commentTitle`/`badgeColor` (`startEdit`, `commitEdit`,
   `handleAddComment`, `handleEditComment`, `handleSaveEdit`,
   `handleRemoveComment`, `handleLink`, `handleApplyLink`, `handleTextColor`,
   `handleHighlight`, the strikethrough/color/badge inline handlers) checks
   `isReadOnly`/`accessMode` as its own first statement, independent of
   whether the UI path that would normally reach it is rendered. At the two
   `FreeformPadletCards.tsx` call sites (the `<CommentPost>` instance and the
   collapsed-marker's inline handlers), every caller-defined mutation
   callback is additionally wrapped with `guardCommentMutation(commentAccessMode,
   ...)` at the JSX boundary, the same call-boundary pattern used by every
   canonical caller elsewhere in this contract.

**Scope note (post-presentation vs. comment mutation):** `cardColor`/
`topStrip` (card background/top-strip color) and `isCollapsed`
(expanded-card vs. pin-marker view state) are classified POST PRESENTATION /
NAVIGATION, not comment mutations, per this patch's own instruction not to
gate controls outside the comment-thread capability. They remain reachable
by any role through `CommentEditor.tsx`'s Card Color/Collapse toolbar tools
exactly as before this patch -- unchanged, not a new gap introduced here.
`FreeformPadletCards.tsx`'s `onMenuClick` (the pencil icon that opens
`CommentEditor.tsx`) is also unguarded by the general `canUseFreeformEditButton`
workspace-edit gate that blocks the card's `onDoubleClick` -- a pre-existing
navigation inconsistency, not introduced by this patch and not a security
gap, since `CommentEditor.tsx` itself now gates every actual mutation
regardless of how it was opened.

A dead code path was found and defensively guarded rather than left as a
gap-in-waiting: `CommentPost.tsx` accepts an `onBadgeClick` prop but never
attaches it to any element in its own render body, and grep-confirmed no
other code path ever sets `internalBadgeColorPopupId`/`internalBadgePopupPosition`
to a truthy value either -- the badge-color swatch handler in
`FreeformPadletCards.tsx` this feeds is genuinely unreachable today. It was
still wrapped in `guardCommentMutation(commentAccessMode, ...)` for
consistency and to prevent a future re-wire from accidentally landing
ungated.

Real identity was independently re-verified (not merely trusted from PATCH
8Y's finding): all three surfaces already receive real `user?.id`/resolved
display names from their callers; `CommentEditor.tsx`'s own prop defaults
(`"user1"`/`"R"`) are unreachable placeholders, never supplied by the live
`CanvasModals.tsx` caller.

Storage ownership proof: `metadata.comments` remains the sole authoritative
field at all three surfaces -- a structural guard in
`canonicalCommentPermission.contract.test.tsx` asserts `CommentPost.tsx`,
`CommentEditor.tsx`, and the collapsed-marker block never reference
`detachedComments`.

Ten negative controls (A-J) were run and restored exactly: removing
`accessMode` from each of the three surfaces (A, F, and the collapsed-marker
gate count), exposing a READ composer (B), bypassing a handler guard while
its UI stayed hidden to prove the callback-layer defense is independent of
DOM state (C, G), exposing collapsed-marker READ row actions (D/E),
introducing a `detachedComments` reference (H), removing an extension from
`CommentEditor.tsx`'s TipTap configuration (I), and dropping `accessMode`
from an unrelated canonical caller (`TableEditor.tsx`) to prove the PATCH 8Y
closure guard still catches real regressions in canonical callers, unaffected
by this patch's changes (J). Control J also required a genuine fix to the
PATCH 8Y closure guard itself: its per-file `accessMode=` count was a raw
whole-file string count, which `<CommentPost>`'s new, legitimate
`accessMode={commentAccessMode}` occurrence would have silently inflated
against a non-`CommentPopup` site. The guard now scopes that count to text
inside `<CommentPopup ... />` blocks specifically
(`countGuardedCommentPopupUsages`), which is a strictly more correct
signal than before this patch, not a weakened one.

Remaining PERMISSION UNGATED special surfaces after PATCH 8Z, PATCH 8AA, and
PATCH 8AB (at the time this paragraph was written): Container's embedded
child `CommentPopup` renderer and `EmbeddedCommentList` -- each a candidate
for its own dedicated permission-wiring patch, per PATCH 8Y's next-phase
backlog. Both have since been closed: Container's embedded child
`CommentPopup` renderer by PATCH 8AC (below), `EmbeddedCommentList` by
PATCH 8AD (see the dedicated section at the end of this document).

**Document anchored/highlighted comments were permission-wired in PATCH 8AA**
(2026-08-13). This remains a SPECIAL / ANCHORED / HIGHLIGHTED controller, not
a normal/detached comment tier and not a `detachedComments` migration. The live
source of truth is still the TipTap `comment` mark (`data-comment-id`,
`data-comment-text`, `data-comment-thread`, `data-user-id`, `data-user-name`,
`data-timestamp`, `data-color`) persisted through `padlet.content`. The patch
only threads the existing `CommentAccessMode` from `CanvasClient.tsx` into
`CanvasModals.tsx -> DocumentEditor.tsx` and into `OverlayLayer.tsx`, normalizes
the dormant COMMENT tier to READ for this surface, and wraps every Document
anchored write path in `guardCommentMutation(...)`. `OverlayLayer.tsx` is shared
with Note anchored threads, so PATCH 8AA gated it only when the active padlet
matched `isDocumentPost(...)`; Note anchored threads were explicitly left
outside that Document-only permission patch, to be closed separately.

**Document anchored/highlighted comment wiring was completed in PATCH 8AP**
(2026-08-13). PATCH 8AN's consolidation audit found `DocumentEditor.tsx` only
wired 2 of the mutation-capable `CommentPopup` props Note already wires
(`onSubmit`, `onCommentColor`), and that the popup's `accessMode` was
incorrectly coupled to `savedSelection` (`canManageAnchoredComments &&
savedSelection ? 'manage' : 'read'`), so a MANAGE user opening an EXISTING
thread by clicking its mark (which never sets `savedSelection`) incorrectly
received READ. Both are fixed. `accessMode` is now the direct
`anchoredAccessMode` value, matching Note and OverlayLayer exactly.
`updateCommentThreadInDoc`/`removeCommentThreadFromDoc` (ported narrowly from
`NoteEditor.tsx`, locating a mark by `commentId` via `doc.descendants`) now
back `handleEditComment`, `handleRemoveComment`, `handleRemoveThread`,
`handleToggleCommentStrikethrough`, and the existing-thread paths of
`handleAddComment`/`handleCommentColor` -- `savedSelection` is consulted only
in `handleAddComment`'s fallback branch, for genuinely NEW anchor creation,
never as an authorization signal. Classification is unchanged: still SPECIAL
/ ANCHORED / HIGHLIGHTED, still TipTap `comment`-mark storage, no
`detachedComments` migration. Anchor-span color (`onColor`, the
text-span-highlight analog of Note's `handleColorComment`) remains
deliberately unwired -- `DocumentEditor.tsx` has no existing handler or state
for it (unlike `OverlayLayer.tsx`, which independently supports it for the
same padlet type via a separate on-canvas code path); inventing one was
explicitly out of this patch's scope. `OverlayLayer.tsx` was re-audited and
found to already supply correct, non-`savedSelection`-coupled `accessMode`
and every mutation callback (including `onRemoveThread` and `onColor`) --
no changes were needed there.

**A shared Link-authoring primitive was extracted in PATCH 8AR** (2026-08-13),
in response to PATCH 8AQ's audit finding that `CommentPopup.tsx` and
`CommentEditor.tsx` independently duplicated their TipTap `Link` extension
config, URL normalization (`example.com` -> `https://example.com`), and
apply/update/remove-Link command logic. `components/collabboard/commentLinkAuthoring.ts`
now exports `createCommentLinkExtension()` (a factory, not a shared instance,
so each editor's own `useEditor` extensions array still declares its own
Link extension exactly as it always has), `normalizeCommentLinkUrl(url)`
(pure prefixer; does not trim or treat `''` specially -- CommentPopup's own
pre-existing trim-before-call and CommentEditor's own pre-existing
no-trim-before-call behaviors are both preserved unchanged, not unified),
and `applyCommentLink(editor, rawUrl, selection)` (the full apply/unset/
collapsed-selection-insert branching, now the single implementation both
callers delegate to). `components/collabboard/CommentLinkPopover.tsx` shares
the URL-input+Add-button JSX; each caller still supplies its own
`inputClassName`/`applyButtonClassName` (sizes differ: CommentPopup's is
`text-xs`/`w-56`, CommentEditor's is `text-sm`/`w-64`) and still owns its own
positioned wrapper (CommentPopup: portaled fixed box via `useAnchoredPopover`;
CommentEditor: static absolute box) -- only the inner input/button pair and
Enter/Escape handling are shared. Selection ownership (`savedLinkSelectionRef`/
`savedLinkEditorRef` in CommentPopup; `savedSelectionRef`/`getActiveEditor()`
in CommentEditor) and all permission checks (`isReadOnly`,
`canMutateCommentById` in CommentPopup; `isReadOnly` in CommentEditor)
deliberately stayed local to each caller -- the shared primitive receives
only an already-resolved editor instance, URL string, and selection range,
and assumes the caller has already authorized the action. CommentPopup's and
CommentEditor's user-visible Link behavior is unchanged (characterized
before extraction, re-verified after); `CommentEditor.link.test.tsx` was
added as new behavioral coverage since no such test previously existed for
CommentEditor's Link flow. `CommentRow.tsx`/`EmbeddedCommentList.tsx` do
**not** consume this primitive yet -- embedded Link authoring remains
pending PATCH 8AS.

**EmbeddedCommentList / CommentRow gained Link authoring in PATCH 8AS**
(2026-08-13), closing the capability gap PATCH 8AQ's audit found (the same
comment data could author Links through `CommentPopup` -- including
ContainerEditor's embedded `CommentPopup` -- but not through the compact
`EmbeddedCommentList` renderer). Disposition is unchanged from PATCH 8AN:
**COMPACT EMBEDDED SPECIAL PRESENTATION -> SHARE LOWER-LEVEL PRIMITIVES**, not
a `CommentPopup embedded` consolidation. `CommentRow.tsx` now consumes the
PATCH 8AR primitives as-is (`createCommentLinkExtension()` added to its edit
editor's extensions, with `link: false` added to its `StarterKit.configure`
call to avoid a duplicate mark; `applyCommentLink(...)` backs its own
`handleApplyLink`; `CommentLinkPopover` renders its Link popover, portaled via
the same `useAnchoredPopover` + `createPortal(document.body)` pattern already
used for its Color popup). The Link button appears only while editing,
immediately after Color and before Strikethrough, and is mutually exclusive
with the Color popup (opening one closes the other). Selection capture
(`savedLinkSelectionRef`) and permission checks (`canMutateThisComment`,
independently re-verified in both `openLinkPopover` and `handleApplyLink`)
stayed local to `CommentRow.tsx`, per PATCH 8AR's own selection-ownership
boundary. Unlike `CommentPopup` (which persists a Link immediately on Add),
`CommentRow` persists through its existing blur/Enter-commit path -- Add only
updates the live edit editor; `onSaveEdit` (already CommentRow's sole
persistence callback) fires on the next blur or Enter exactly as a plain text
edit already does, so no new callback (`onAddLink`/`onUpdateLink`) was
introduced. No storage change: Link persistence remains
`comment.text = HTML string`. Verified end-to-end through
`RowColumnContainerCard`, `PostCardContent` (nested-container child), and the
Map `PostPopup` host with zero host production changes. `DrawingLayout.tsx`
was not independently negative-control-tested (no existing test harness for
its Excalidraw-canvas code path, matching the precedent already set by
`PostPopup.commentPermission.test.tsx` mounting `PostPopup` directly rather
than `MapCanvas`/Mapbox) -- its safety is structural: the Link trigger reuses
byte-for-byte the same `onMouseDown` preventDefault/stopPropagation pattern
the Color button already relies on successfully inside it, and zero
`DrawingLayout.tsx` changes were made. `CommentPopup.tsx`, `CommentEditor.tsx`,
and `commentLinkAuthoring.ts`/`CommentLinkPopover.tsx` themselves were not
modified.

**Note anchored/highlighted comments were permission-wired in PATCH 8AB**
(2026-08-13). Same SPECIAL / ANCHORED / HIGHLIGHTED classification, same
TipTap `comment` mark storage (`NoteEditor.tsx`'s own extension registry,
unchanged), no migration to `detachedComments`. Two live surfaces:

- `NoteEditor.tsx`'s own in-modal anchored `CommentPopup` (selected-text
  thread popup, distinct from its already-canonical detached-comment popup).
  Derives `anchoredAccessMode`/`canManageAnchoredComments` from the same
  `accessMode` prop already threaded in for the detached tier (no new signal).
  Every anchored handler (`handleTextComment`, `handleAddComment`,
  `handleEditComment`, `handleRemoveComment`, `handleRemoveThread`,
  `handleToggleCommentStrikethrough`, `handleColorComment`,
  `handleCommentColor`) self-guards with `canManageAnchoredComments`, and the
  `<CommentPopup>` call site wraps every mutation prop in
  `guardCommentMutation(anchoredAccessMode, ...)` plus passes
  `accessMode={anchoredAccessMode}` -- the same two-layer defense pattern
  used throughout this rollout. The toolbar's "Comment" (new-thread) button is
  omitted (`onTextComment: canManageAnchoredComments ? handleTextComment :
  undefined`), not merely disabled, matching Document's own pattern; clicking
  an EXISTING highlighted mark to open/read its thread remains unconditional
  (the `editorProps.handleClick` DOM-click-to-open path carries no accessMode
  gate at all -- reading an existing thread is always allowed).
- `OverlayLayer.tsx` (on-canvas, shared with Document): the existing PATCH 8AA
  `isDocumentPost(...)` branch is extended with a sibling `isNoteAnchoredPost(...)`
  check (`post.type === 'text' || (post.type as string) === 'note'`, matching
  the established Note-family discriminator used elsewhere), so
  `anchoredAccessMode` now resolves to the real board-level accessMode for
  BOTH Document and Note padlets, and stays `'manage'` for anything else
  (unchanged fallback). No other OverlayLayer logic changed -- broadening this
  one condition automatically extended every already-existing
  `guardCommentMutation`/`canManageAnchoredComments` gate in the file to Note.

**Identity correction (PATCH 8AB):** `NoteEditor.tsx`'s anchored `CommentPopup`
call site previously hardcoded `currentUserId="user1"` / `currentUserName="R"`
regardless of the real authenticated user already available via its own
`currentUserId`/`currentUserName` props (used correctly by the detached tier
since PATCH 8P.1). New anchored threads/replies now persist the real
authenticated identity. Historical anchored comments already persisted with
the placeholder identity are left untouched (`buildThreadFromAttrs`'s
`attrs.userId || 'user1'` fallback is a read-time label for legacy marks
lacking the attribute, not a write path, and is unchanged). `OverlayLayer.tsx`
already used real identity (`user?.id`/`user?.email`) before this patch --
no change needed there.

READ users may open and read existing Note anchored threads (via either
surface); they cannot create a new thread, add/edit/delete a reply, delete a
whole thread, remove the source-text mark, or invoke the text-span highlight
picker. MANAGE keeps every existing capability, unchanged.

**Container's embedded child `CommentPopup` renderer was permission-wired in
PATCH 8AC** (2026-08-13). This surface concerns comments belonging to CHILD
POSTS, not the Container itself -- Container's own N/A normal/detached
classification (PATCH 8W) is unchanged, and this patch does not create any
Container-owned comment tier. Live surface: `ContainerEditor.tsx`'s
`SortableChildItem`, which renders a `CommentPopup` (embedded, no
portal/position) for any `comment`-type child padlet, reading/writing that
child's own `metadata.comments` -- never `detachedComments`, never a
Container-level field. `ContainerEditor` now accepts an `accessMode` prop
(defaulting to `'manage'`), threaded from `CanvasModals.tsx`'s existing
`commentAccessMode` (no new signal, same convention as every other canonical
caller) down through `SortableChildItem` into the embedded `CommentPopup`'s
own `accessMode` prop. All four live mutation props at that call site
(`onSubmit`, `onEditComment`, `onRemoveComment`, `onCommentColor`) are wrapped
with `guardCommentMutation(accessMode, ...)`; every mutation inside that block
targets `child.id` exclusively (never a Container id, never a sibling child,
never Container metadata/order) -- verified structurally and by mounted
child-ownership/sibling-isolation/Container-isolation tests. Real identity
(`currentUserId`/`currentUserName`) was already threaded correctly from
`CanvasModals.tsx` before this patch (`user?.id` /
`user?.user_metadata?.full_name || user?.email`) -- unchanged, verified.
`EmbeddedCommentList.tsx`, `RowColumnContainerCard.tsx`, and
`PostCardContent.tsx` are explicitly out of scope for PATCH 8AC (their own
patch is PATCH 8AD) and were not modified.

READ users may see and read a child post's existing comments; they cannot
Add/Send, Edit, Color, Strikethrough-toggle, or Delete a child comment (Link
authoring, handled internally by `CommentPopup`'s own per-row action rail,
is likewise gated by the same `accessMode`). MANAGE keeps every existing
capability, unchanged.

## EmbeddedCommentList permission wiring -- PERMISSION SAFE (PATCH 8AD)

**PATCH 8AD (2026-08-13)** wired the READ/MANAGE permission contract into
every live `EmbeddedCommentList` caller -- closing the last item on the
special-system matrix's PERMISSION UNGATED list. Permissions-only: this
compact, intentionally-different-from-`CommentPopup` embedded presentation
(own header/counter, own `CommentRow.tsx` per-row Edit/Color/Strikethrough/
Delete, own composer/Send) was NOT replaced, redesigned, or migrated to
`CommentPopup`, and no storage field changed ownership.

**Live callers (7 JSX call sites across 4 files), classified:**

- `RowColumnContainerCard.tsx` -- two call sites. Comment-type children
  (`child.type === "comment"`) store `metadata.comments`; any other child's
  detached-comment toggle stores `metadata.detachedComments`. Both are
  reachable from every live top-level layout that renders a Container
  (`WallCanvas.tsx`, `ColumnsCanvasRow.tsx`, `RowLane.tsx`,
  `ChronoTimelineCanvas.tsx`, `DrawingLayout.tsx`'s `AutoHeightContainer`,
  `FreeformPadletCards.tsx`).
- `PostCardContent.tsx` -- three call sites, one theoretically-reachable,
  one live-but-narrow, one dead:
  - COMMENT TYPE (`padlet.type === 'comment' && onUpdateChildComments`) --
    confirmed **unreachable** in the live app: `RowColumnContainerCard.tsx`
    always intercepts comment-type children itself before ever delegating to
    `PostCardContent`, and no top-level layout passes `onUpdateChildComments`
    to its own top-level (non-container) `PostCardContent` call. Wired
    anyway, uniformly, since the gate costs nothing and the branch is one
    routing change away from becoming live.
  - IMAGE TYPE / drawing-container image binding
    (`useDrawingContainerImageBinding = canvasContext === 'drawing' &&
    isInContainer`) storing `metadata.detachedComments` -- **live**, reached
    only via `DrawingLayout.tsx`'s `AutoHeightContainer ->
    RowColumnContainerCard -> PostCardContent` chain (no other layout ever
    sets `canvasContext="drawing"`).
  - CONTAINER TYPE's own `children.map` (a container padlet's children,
    rendered when `PostCardContent` itself is given a `type === 'container'`
    padlet) -- reachable only if a container child is itself a container
    (nested container-in-container); no live creation flow builds this today,
    but the render path forwards `onUpdateChildComments` unconditionally, so
    it is wired rather than left as a silent, unverified exception.
- `DrawingLayout.tsx`'s own direct `<EmbeddedCommentList>` call (inside
  `DrawingEmbeddableCard`, the non-container branch) -- a **newly discovered
  root-level surface**, not a container child at all: standalone Comment-type
  posts placed on the Drawing canvas render through this compact embeddable
  renderer, not the canonical `CommentPost.tsx`/`CommentEditor.tsx` pair
  every other layout uses for a standalone comment post. Storage:
  `metadata.comments`. `onUpdateChildComments` here is
  `DrawingLayout.tsx`'s own local `handleUpdateChildComments` (persists via
  `onUpdatePadletStrict`), unconditionally supplied -- not the optional prop
  other layouts thread from `CanvasClient.tsx`.
- `components/canvas/RowCanvas.tsx`'s own `<EmbeddedCommentList>` call --
  confirmed **dead/orphaned**: this file has zero importers anywhere in
  production code (the live Grid-layout component is `components/collabboard/row/RowCanvasDnD.tsx`,
  an entirely different file). Left untouched -- gating unreachable code
  provides no live security benefit and this patch's own scope is
  permissions for LIVE callers.

**accessMode flow:** `EmbeddedCommentList.tsx` and its sole caller
`CommentRow.tsx` each gained an `accessMode?: CommentAccessMode` prop
(default `'manage'`). `RowColumnContainerCard.tsx` and `PostCardContent.tsx`
gained the same prop and forward it to every `EmbeddedCommentList` they
render (including `RowColumnContainerCard`'s own recursive `PostCardContent`
child-rendering call, and `PostCardContent`'s own recursive
container-children call). `DrawingLayout.tsx` gained a `commentAccessMode`
prop threaded into `AutoHeightContainer -> RowColumnContainerCard` (as
`accessMode`) and into its own direct `EmbeddedCommentList`/`PostCardContent`
calls. The existing `commentAccessMode` signal from `CanvasClient.tsx` (no
new authorization lookup) is now threaded into all six top-level layout
components (`ColumnsLayout.tsx`, `RowCanvasDnD.tsx`, `WallCanvas.tsx`,
`DrawingLayout.tsx`, `ChronoTimelineCanvas.tsx`, and `FreeformPadletCards.tsx`,
which already received it from PATCH 8Z and only needed forwarding into its
own `RowColumnContainerCard`/`PostCardContent` calls), each of which forwards
it to `RowColumnContainerCard` as `accessMode={commentAccessMode}`.

**Two-layer defense, same pattern as every prior patch in this series:**

1. **Render gate (layer 1):** `EmbeddedCommentList.tsx` omits its composer
   entirely outside `'manage'` (`showComposer && onSubmit && canManage`).
   `CommentRow.tsx` omits its ENTIRE per-row actions column (Edit/Color/
   Strikethrough/Delete) outside `'manage'`, and folds the access check into
   `canEdit` (`canManage && comment.userId === currentUserId`) so the
   double-click-to-edit path (which does not go through the actions column at
   all -- it is the row wrapper's own `onDoubleClick`) cannot bypass the
   gate. This closes a genuine bypass this patch found: before the fix,
   `canEdit` checked ownership only, so a READ-mode user who happened to
   "own" a legacy comment (or any comment authored under their own id) could
   double-click it open and edit inline, entirely independent of the hidden
   actions column.
2. **Callback defense (layer 2):** every mutation callback
   (`onSubmit`/`onEditComment`/`onRemoveComment`/`onToggleStrikethrough`/
   `onColorChange`) passed into `EmbeddedCommentList` at all five live/wired
   caller sites is wrapped with `guardCommentMutation(accessMode, ...)` at
   the JSX boundary -- independent of whatever `EmbeddedCommentList`/
   `CommentRow` do internally.

**Identity:** already real at every live mutation site before this patch
(`currentUserId`/`currentUserName` sourced from the authenticated `user`
object at `CanvasClient.tsx`'s top of the prop chain) -- unchanged, verified.
No placeholder identity (`'user1'`, `'anon'`, `'You'`) was found or persisted
by any of the wired call sites.

**Storage ownership:** unchanged and NOT normalized -- comment-type children
keep `metadata.comments`, detached-comment children keep
`metadata.detachedComments`, verified structurally (each call site's block
contains its own field literal and never the other).

**Child-id ownership:** every mutation targets the owning child's id
exclusively -- verified structurally (regex over `onUpdateChildComments(`
calls) and by mounted two-sibling isolation tests (`RowColumnContainerCard.embeddedCommentPermission.test.tsx`).
Container-level state (`onEditContainer`, `onDropExistingPadlet`,
`onScanChild`) is never touched by a child comment mutation, proven by a
dedicated isolation test.

READ users may see and read existing comments at every wired surface; they
cannot Add/Send, Edit (including via double-click), Color, Strikethrough-toggle,
or Delete a comment, and no hidden callback can be reached by interacting with
the row directly. MANAGE keeps every existing capability, unchanged.

**Not answered by this patch** (explicitly out of scope, per its own spec):
whether `EmbeddedCommentList` should eventually be consolidated with
`CommentPopup`. Both are now equally permission-safe; which presentation the
product keeps is a separate architecture decision -- see next-phase backlog
item 4.

## Map layout permission gap -- found by PATCH 8AE, closed by PATCH 8AE.1

PATCH 8AE was a repo-wide, independent **Special Comment Permission Closure
Audit** -- it re-derived the entire live comment surface inventory from
source rather than trusting this document, specifically to catch anything
PATCH 8AD's own inventory might have missed. It found one: the **Map layout**
(`canvas.layout === 'map'`, a real, user-selectable layout) was never among
the layouts PATCH 8AD traced when threading `commentAccessMode`.

**The gap.** `CanvasClient.tsx` renders `components/map/MapCanvas.tsx`
whenever `isMapLayout` is true. Clicking a container pin opens
`components/map/PostPopup.tsx`, whose container branch renders
`RowColumnContainerCard` (and whose non-container branch renders
`PostCardContent`) for that pin's children -- the exact same two hosts PATCH
8AD had already wired everywhere else. `MapCanvas.tsx` passed its
`onUpdateChildComments` callback down **unconditionally** (unlike its sibling
handlers `onEditPinPost`/`onDeletePinContainer`/etc., all of which were
already gated behind `canUseFreeformEditButton`), and that callback was a
genuine, live, Supabase-backed write (`createUpdatePostCommentsCommand`).
But neither `MapCanvas.tsx` nor `PostPopup.tsx` accepted or threaded an
`accessMode`/`commentAccessMode` prop, so `RowColumnContainerCard.tsx`/
`PostCardContent.tsx` silently fell back to their own `'manage'` default --
meaning a workspace-**readonly** user viewing the Map layout could still
Add/Edit/Delete/Color/Strikethrough a container pin's child comments. This
was a pure permission-propagation defect, not a storage or identity defect:
`currentUserId`/`currentUserName` already reached the child renderer
correctly, and comments were written to the correct child's
`metadata.comments`/`metadata.detachedComments`.

PATCH 8AE did not fix this itself, per its own explicit STOP-condition
instruction not to silently patch a gap discovered mid-audit. It recommended
a dedicated follow-up.

**The fix (PATCH 8AE.1, 2026-08-13).** Threaded the same three-link chain
every other layout already uses, with no new permission producer:

```
CanvasClient.tsx
  commentAccessMode (already existed -- resolveCommentAccessMode(currentWorkspaceRole))
    -> <MapCanvas commentAccessMode={commentAccessMode} ... />

MapCanvas.tsx
  commentAccessMode?: CommentAccessMode  (new prop, default 'manage', transport only)
    -> <PostPopup accessMode={commentAccessMode} ... />

PostPopup.tsx
  accessMode?: CommentAccessMode  (new prop, default 'manage')
    -> <RowColumnContainerCard accessMode={accessMode} ... />
    -> <PostCardContent accessMode={accessMode} ... />
```

`MapCanvas.tsx` and `PostPopup.tsx` never call `resolveCommentAccessMode`
themselves and never inspect `WorkspaceRole` -- both are pure transport, per
the patch's own scope constraint. `resolveCommentAccessMode(currentWorkspaceRole)`
remains the sole live call site in the entire codebase (verified structurally
in `PostPopup.commentPermission.test.tsx`).

Both `RowColumnContainerCard.tsx` and `PostCardContent.tsx` already had their
own `guardCommentMutation(accessMode, ...)` wraps from PATCH 8AD -- they were
never missing a guard, only a real `accessMode` value to guard with. No
changes were made to either file, nor to `EmbeddedCommentList.tsx` or
`CommentRow.tsx`; the fix is 100% permission-propagation plumbing in
`CanvasClient.tsx`/`MapCanvas.tsx`/`PostPopup.tsx`.

**Test coverage:** `components/map/PostPopup.commentPermission.test.tsx` (new,
12 tests) mounts `PostPopup` directly (not `MapCanvas`, which pulls in
Mapbox) -- MANAGE (comments visible, Add/Edit both target the owning child
only, a child comment mutation never touches `onEditContainer`/
`onDeleteContainer`/`onChangeContainerColor`/`onEditLocation` or the
container/pin id); READ (composer/Edit/Delete/Color absent, no callback
fires on row interaction, including for the non-container `PostCardContent`
branch); and five structural "closure-blocker" tests asserting each of the
three chain links independently plus the single-producer/dormant-COMMENT
proof, so that removing any one link fails the suite without needing a full
Mapbox-backed mount. `components/map/*.test.tsx` was also added to
`vitest.config.ts`'s `include` list -- `components/map/` had no test
coverage of any kind before this patch, so without this the new suite would
have silently never run under `npx vitest run`.

**Negative controls run:** A (removed `commentAccessMode` from
`CanvasClient.tsx` -> `MapCanvas`), B (removed `accessMode` from `MapCanvas`
-> `PostPopup`), C (removed `accessMode` from `PostPopup` -> `RowColumnContainerCard`),
D (removed `accessMode` from `PostPopup` -> `PostCardContent`), E (forced
`accessMode = 'manage'` inside `PostPopup` regardless of the prop), and I
(introduced a second `resolveCommentAccessMode(...)` call inside `MapCanvas`)
-- each caught by the new suite, each restored and diff-verified byte-identical.
Controls F/G/H/J/K/L exercise pre-existing guards (`EmbeddedCommentList`'s own
callback defense, ownership/sibling isolation, dormant-COMMENT proof, normal
rollout closure, frozen `CommentPopup`) already covered by PATCH 8AD's and
earlier patches' own suites, all of which stayed green throughout this patch.

**Frozen foundation:** `CommentPopup.tsx`, `useAnchoredPopover.ts`,
`TextStylePopup.tsx`, `commentLinkSafety.ts`, `extensions/Comment.ts` --
byte-identical to PATCH 8AE's recorded hashes; none were touched.

**Closure status:** this closes the one gap PATCH 8AE found. It does **not**
by itself authorize declaring **SPECIAL COMMENT PERMISSION ROLLOUT --
CLOSED** -- PATCH 8AE's own audit is proof that a single inventory pass can
miss a live surface, so a second, independent **PATCH 8AE.2 Special Comment
Permission Closure Audit** is the agreed gate before that declaration.

## PATCH 8AE.2 -- second independent closure audit -- SPECIAL COMMENT PERMISSION ROLLOUT CLOSED

PATCH 8AE.2 (2026-08-13) performed the agreed second, independent audit --
re-deriving the live post-type/layout registry from `types/collabboard.ts`
and `CanvasClient.tsx`'s own `isXLayout` flags rather than trusting this
document, then a fresh repo-wide `<CommentPopup>`/`<EmbeddedCommentList>`
search -- before authorizing the closure declaration at the top of this
document.

**Findings.** No new live surface and no new live permission gap. The
complete live surface list matches this document's existing matrices exactly
(12 `<CommentPopup>` production callers, 4 `<EmbeddedCommentList>` production
callers of which 1 -- `components/canvas/RowCanvas.tsx` -- is confirmed dead).
Scheduler, Gantt, and kanban layouts render no CollabBoard comment UI at all
(a product gap, not a permission gap -- "not every surface supports every
capability"). `resolveCommentAccessMode(` re-confirmed as exactly one live
call site (`CanvasClient.tsx`, `currentWorkspaceRole` only). The Map route
PATCH 8AE.1 fixed was re-verified independently, link by link. A new dead
surface was confirmed beyond PATCH 8AE's own list:
`components/collabboard/editors/CommentViewPopup.tsx` has zero references
anywhere in the repo, including its own tests -- a "Comment-post right-side
popup" superseded by `CommentPopup`/`CommentEditor`, never deleted.

**Durable closure guard.** Added
`components/collabboard/commentPermissionClosure.contract.test.tsx` (37
tests) -- the single file intended to catch the *next* PATCH-8Y/8AD/8AE-style
miss automatically instead of waiting for a fourth audit patch:
- **Completeness**: `git grep`-enumerates every live `<CommentPopup>`/
  `<EmbeddedCommentList>` JSX usage and asserts the file set matches a
  reviewed allowlist exactly -- a comment renderer added to any new file
  fails this test until classified.
- **Per-block gating**: for every allowlisted file, extracts every
  self-closing `<CommentPopup .../>`/`<EmbeddedCommentList .../>` block
  (not just "the file contains accessMode somewhere") and asserts each one
  carries an explicit `accessMode`.
- **Map route**: the exact four-link chain (`CanvasClient` ->`MapCanvas`
  ->`PostPopup` ->`RowColumnContainerCard`/`PostCardContent`) asserted both
  per-link and as one combined chain proof.
- **COMMENT dormancy**: single live `resolveCommentAccessMode(` producer, no
  `boardPermission` argument, no second producer anywhere else in the repo.
- **Dead/dormant surfaces**: `RowCanvas.tsx`, `CommentViewPopup.tsx`, and the
  `CommentList`/`FreeformCommentRow` pilot foundation re-verified non-live.
- **Composer-duplication guard**: no allowlisted file may hand-roll the
  literal `placeholder="Add a comment..."` string -- that affordance exists
  in exactly one place in the whole codebase (`EmbeddedCommentList.tsx`'s own
  composer), so any other occurrence proves an un-vetted duplicate composer
  was added outside the shared, gated component.
- **Child-id ownership**: for each of the three live `EmbeddedCommentList`
  host files, counts every `onUpdateChildComments(...)` call and asserts the
  count of calls targeting the correct identifier (`child.id` for
  `RowColumnContainerCard.tsx`; `padlet.id`/`child.id` split for
  `PostCardContent.tsx`'s three blocks; `padlet.id` for `DrawingLayout.tsx`)
  equals the total call count -- a single mutation handler silently
  retargeted to the wrong id (sibling or parent Container) fails this test
  even though every other handler in the same block is correct.

**Negative controls -- 20 run for real (A-T), not source-inspected.** Each
was applied via backup/mutate/observe-failure/restore-and-diff-verify:

- A-L (remove `accessMode` from: a canonical normal caller `TableEditor.tsx`;
  `CommentPost.tsx`'s own READ guard; Document anchored; Note anchored;
  ContainerEditor embedded; `RowColumnContainerCard.tsx`;
  `PostCardContent.tsx`; `DrawingLayout.tsx`; and all four Map-route links)
  -- all caught by the closure guard and/or the relevant existing permission
  suite.
- M (restored `CommentRow.tsx`'s ownership-only double-click-to-edit bypass)
  -- caught by `EmbeddedCommentList.permission.test.tsx`.
- N (a second live `resolveCommentAccessMode(...)` call, added to
  `MapCanvas.tsx`) and O (a live `boardPermission` argument added to the one
  legitimate producer) -- both caught by the dormancy tests.
- P (a live hardcoded `userId: 'user1'` in `ClipartCardDraftModal.tsx`'s own
  comment-submit path) -- caught by real behavioral assertions in
  `canonicalCommentPermission.contract.test.tsx` and
  `ClipartCardDraftModal.test.tsx` (not merely a source-string check).
- Q (a fake `<EmbeddedCommentList` mention added to `ChronoTimelineCanvas.tsx`,
  a live layout not in the allowlist) -- caught by the completeness guard.
- **R and S were not caught on first attempt** -- both were genuine gaps in
  the *guard's own coverage*, discovered and closed within this same audit
  session, not live production defects (production code was correct in both
  cases before and after):
  - R: a hand-rolled `<input placeholder="Add a comment...">` added directly
    inside `PostCardContent.tsx`'s COMMENT TYPE branch, alongside its
    already-gated `EmbeddedCommentList`, was invisible to every existing
    test (that branch is provably unreachable in production today, so no
    behavioral test exercises it). Closed by adding the composer-duplication
    guard described above, which is a pure source-text check and does not
    depend on the branch being reachable.
  - S: `RowColumnContainerCard.tsx`'s `onColorChange` handler retargeted from
    `child.id` to `padlet.id` (the parent Container's own id) passed the
    full existing test suite, because no existing test specifically checked
    ownership for the Color mutation -- only Add/Edit/Delete were covered.
    Closed by adding the child-id ownership guard described above, which
    counts ALL five mutation handlers uniformly instead of spot-checking a
    subset.
- T (appended a line to `CommentPopup.tsx`) -- hash changed as expected,
  confirming the frozen-foundation proof mechanism works; the file was
  restored and reconfirmed byte-identical to the recorded hash immediately.

Every mutation was restored and diff-verified byte-identical; `git status`
and `git diff --check` confirmed zero residue before validation.

**Frozen foundation:** `CommentPopup.tsx`, `useAnchoredPopover.ts`,
`TextStylePopup.tsx`, `commentLinkSafety.ts`, `extensions/Comment.ts` --
all five byte-identical to PATCH 8AE/8AE.1's recorded hashes.

**Full validation:** 135 test files / 2251 tests passing, `npx tsc --noEmit`
clean, `npm run check:boundaries` clean, `git diff --check` clean. Zero
production code changes this patch -- only the new closure guard test file
was added (production files were mutated and restored during negative
controls, each diff-verified byte-identical).

**Declaration: SPECIAL COMMENT PERMISSION ROLLOUT -- CLOSED.** See the
rollout-status block at the top of this document. This declaration covers
comment *permission safety* specifically -- it does not close SPECIAL UI
CONSOLIDATION (next-phase backlog item 4) or DEAD CODE CLEANUP (item 3),
both of which remain open, ranked, architecture/product decisions.

## PATCH 8AF -- dead/orphaned comment code cleanup

Starting HEAD `0536bd9`. Deletes comment-related production code proven
unreachable by the 8Y/8AE/8AE.2 audits -- re-proven independently here, not
merely re-cited -- while leaving both closed phases (NORMAL UI
CANONICALIZATION, COMMENT PERMISSION SAFETY) untouched and green.

### What was removed

1. **`CommentViewPopup.tsx`** (`components/collabboard/editors/`) -- zero
   production importers, zero test importers, zero dynamic/barrel
   references anywhere. Deleted entirely.
2. **`ContainerEditor.tsx`'s dead Container-own comment skeleton** --
   `commentPopupOpen`/`commentPopupPosition`/`handleComment`/
   `handleAddComment`. None had a live caller (`handleComment`/
   `handleAddComment` were declared but never invoked from any button or
   JSX anywhere in the file). `detachedComments`/`setDetachedComments`/
   `initialDetachedComments` were deliberately kept -- they round-trip any
   pre-existing `metadata.detachedComments` through `onSave` non-
   destructively; deleting them would have silently dropped that data on
   next save.
3. **`FreeformPadletCards.tsx`'s dead "Todo Comments Popup - Right side"
   block** (mislabeled, actually inside the Comment-post branch) and its
   directly-adjacent, equally-dead `commentColorPopupId` color-popup
   companion -- both gated on `cardCommentPopupPadletId === padlet.id`,
   which is never set to a comment-type padlet's id anywhere in the file
   (only ever reset to `null` within that branch). The live `<CommentPost>`
   rendering and the live collapsed-marker popup in the same branch are
   untouched.
4. **`FreeformPadletCards.tsx`'s dead Card-toolbar `<CommentPopup>` block**
   -- gated on `cardCommentPopupPadletId === activeCardToolbarPadlet.id`,
   itself nested inside a wrapper gated on `cardToolbarPadletId`, which has
   zero live non-null setters anywhere in the codebase (re-confirmed via an
   exhaustive repo-wide search of every `setCardToolbarPadletId(` call
   site -- all four, across `CanvasClient.tsx` and this file, set it only
   to `null`). See "Correction to this document's own prior classification"
   above: this block was previously (mis)labeled "Clipart" in this
   document's original freeze; it is actually PATCH 8P's second, never-
   reachable "Note toolbar popup" detached-comment entry point, discovered
   via its own exact-match anchor comment and a pre-existing
   `canonicalCommentPermission.contract.test.tsx` test title. Only this
   `<CommentPopup>` sub-block was removed; the rest of the Card Post Modal
   wrapper (`CardActionsToolbar`/`CardColorPanel`/`EmojiReactionPicker`,
   also unreachable but non-comment) was left in place, per this patch's
   comment-only scope -- recorded as a new, not-yet-actioned finding above.

### What was explicitly NOT touched

- `CommentList.tsx`/`FreeformCommentRow.tsx` (dormant pilot) and their
  tests -- untouched.
- `lib/infra/canvas/commentMutations.ts` and the dormant COMMENT access
  tier -- untouched; both require a later "shelve vs activate" decision,
  not a dead-code deletion.
- `components/canvas/RowCanvas.tsx` -- zero production importers (re-
  confirmed), and therefore its `<EmbeddedCommentList>` call site is also
  dead, but the 979-line file is a complete standalone alternate canvas
  implementation with substantial non-comment product code. Deleting it (or
  even just its comment renderer) would broaden this patch into general
  obsolete-layout cleanup, which this patch's own spec explicitly forbids.
  Left fully untouched.
- `CommentPost.tsx`/`CommentEditor.tsx` (Comment post primary thread),
  `DocumentEditor.tsx`/`NoteEditor.tsx`/`OverlayLayer.tsx` anchored threads,
  `ContainerEditor.tsx`'s live embedded child `CommentPopup`, `Row-
  ColumnContainerCard.tsx`/`PostCardContent.tsx`/`DrawingLayout.tsx`'s
  `EmbeddedCommentList` renderers, and every canonical normal-comment
  editor -- all unchanged, all re-verified still green.

### Incidental fixes (found during validation, unrelated to comment dead code)

Two pre-existing, unrelated test bugs were found and fixed while getting to
a fully green suite (both predate this patch -- reproduced against HEAD
`0536bd9` unmodified before being attributed here): `commentPermissionClosure.
contract.test.tsx` and `components/collabboard/comments/siteA.pilotParity.
test.tsx` each search `git grep` for the literal import string
`from '@/components/collabboard/comments/CommentList'` to prove no new
production importer of the dormant pilot foundation exists -- but each
file's own source contains that exact string as its own search-pattern
literal, causing a false-positive self/cross match neither file's allowlist
excluded. Fixed by explicitly excluding `commentPermissionClosure.contract.
test.tsx` from both checks' offender lists (with an inline comment
explaining why), rather than a blanket `.test.` filter, since some of the
genuinely allowed importers are themselves test files.

### Closure guard updates

`commentPermissionClosure.contract.test.tsx` gained a new "PATCH 8AF dead
comment code cleanup" describe block (7 tests) asserting the DELETED/ABSENT
post-cleanup state for every item removed above, plus that every
still-live surface (Container's child `CommentPopup`, `FreeformPadletCards.
tsx`'s `<CommentPost>`, `ClipartCardDraftModal.tsx`'s canonical entry point)
is unaffected. Its pre-existing dead-surface tests for `CommentViewPopup.tsx`
and `ContainerEditor.tsx`'s skeleton were strengthened from "still present,
still dead" to "no longer exists at all". `commentPermissionClosure.
contract.test.tsx`'s `<CommentPopup>` block-count expectation for
`FreeformPadletCards.tsx` dropped from 8 to 7; the parallel counts in
`normalCommentRolloutClosure.contract.test.tsx` (usages/guarded 8->7, total
20->19) and `canonicalCommentPermission.contract.test.tsx`
(`guardCommentMutation(` raw count 79->71) were updated to match, each with
an inline note explaining the delta. Three pre-existing tests that had
explicitly asserted the now-deleted surfaces REMAIN dead (not merely
present) were rewritten to assert their absence:
`canonicalCommentPermission.contract.test.tsx`'s "Todo Comments Popup"
and "toolbar popup" tests, and `noteDetachedCommentUIContract.test.tsx`'s
three assertions that used to expect two live Note detached-comment entry
points (now one).

### Negative controls (A-K, all run for real: backup/mutate/observe/restore)

All eleven controls confirmed caught by the expected guard, then restored
byte-identical (`diff` confirmed): A (CommentViewPopup.tsx restored) and J
(the same check deliberately weakened first, confirmed the restored file
THEN slipped through undetected, proving the removed assertion was
load-bearing, then both reverted) -- CommentViewPopup dead-surface guard. B
(Container skeleton restored) and C (live child `CommentPopup`'s
`accessMode` prop removed) -- ContainerEditor guards (4 tests failed for C,
including the permission suite). D (dead Comment-post block restored) and F
(dead Card-toolbar block restored) -- both the new PATCH 8AF closure-guard
tests AND the pre-existing `canonicalCommentPermission.contract.test.tsx`
tests caught each. E (`CommentPost.tsx`'s `isReadOnly` hardcoded to `false`)
-- special permission test caught it. G (Clipart's live `accessMode` prop
removed) -- three `normalCommentRolloutClosure.contract.test.tsx` tests
caught it. H (`<CommentList` literal inserted into `FreeformPadletCards.
tsx`) -- the CommentList scope guard caught it. I (`commentMutations.ts`'s
export renamed) -- caught by both the strengthened closure-guard assertion
and `tsc --noEmit`. K (`CommentPopup.tsx` appended) -- hash changed as
expected, confirming the frozen-foundation mechanism works.

### Validation

**Full suite:** 135 test files / 2257 tests passing (up from the PATCH
8AE.2 baseline of 135/2251 -- net +6 from this patch's own new/split tests,
after the 8 raw test-count changes from combining/splitting existing ones).
`npx tsc --noEmit` clean. `npm run check:boundaries` clean. `git diff
--check` clean (only harmless CRLF-conversion warnings, zero actual
whitespace errors).

**Frozen foundation:** `CommentPopup.tsx`, `useAnchoredPopover.ts`,
`TextStylePopup.tsx`, `commentLinkSafety.ts`, `extensions/Comment.ts` --
all five byte-identical to the hashes recorded since PATCH 8AE/8AE.1/8AE.2.

**Live-data actions:** none. Source-only changes; no storage migration, no
`metadata.comments`/`metadata.detachedComments`/`padlet.content`/TipTap
mark changes.

**Declaration: DEAD/ORPHANED COMMENT CODE CLEANUP -- PARTIAL, not fully
CLOSED.** Four proven-dead comment surfaces were removed. Three items
remain deliberately open, each requiring a product/architecture decision
this patch's own scope forbids making unilaterally: (1) the non-comment
remainder of the dead Card Post Modal wrapper in `FreeformPadletCards.tsx`
(a new finding from this patch), (2) `RowCanvas.tsx`'s whole-file
disposition, (3) the `CommentList`/`FreeformCommentRow` pilot and dormant
COMMENT-tier "shelve vs activate" decisions (pre-existing, unchanged by
this patch). See the rollout-status block at the top of this document.

## PATCH 8AL -- dormant COMMENT permission tier disposition audit -- SHELVE / RETAIN DORMANT

PATCH 8AL (2026-08-13, starting HEAD `4a81cd2`) was a read-only audit -- zero
production files changed -- answering the last open item from PATCH 8AF's
list: whether the dormant `CommentAccessMode = 'comment'` tier should be
Activated, Shelved, Removed, Redesigned, or left for a product decision.

**Verdict: SHELVE / RETAIN DORMANT.** The client-side design (three-tier
model, ownership semantics via `canMutateComment`/`isOwnComment`, fail-safe
persistence in `lib/infra/canvas/commentMutations.ts`, ~76 dedicated tests) is
coherent, well-isolated, and worth preserving as a documented dormant
contract. It is not being removed. It is also not activation-ready, and
nothing in this codebase should treat its existence as evidence that it can
be safely turned on.

**Why not activate.** Of the six criteria this audit judged activation
against, five fail:

- No current, explicit product requirement was found for a commenter-only
  role (only historical intent, from the PATCH 8O.2 design/revert).
- The live authorization model cannot represent a board-level commenter:
  `get_board_permission()` targets the dead `canvases` schema vertical, not
  the live `boards`/`padlets` tables (independently re-confirmed this patch;
  see "BoardPermission wiring was attempted in PATCH 8O.2 and REVERTED in
  PATCH 8O.2a" above and `LESSONS_LEARNED.md`).
- No credible server-side enforcement exists: `padlets_insert`/`update`/
  `delete` RLS excludes `'commenter'` from all writes, and the one RPC
  designed to bypass that safely (`comment_mutate`) is quarantined and, per
  its own header, has known-wrong permission-resolution logic.
- Storage coverage is incomplete: the dormant persistence path only reaches
  `metadata.detachedComments` -- not `metadata.comments` (primary thread),
  `padlet.content` (Table), TipTap anchored marks, or Map-layer paths.
- No live product flow can grant real commenter access: workspace-invite
  acceptance (the only live writer of `canvas_collaborators.board_permission`)
  can structurally never produce `'commenter'` (it derives from
  `WorkspaceRole`, which has no commenter-equivalent tier), and share-link
  redemption's `'comment'` option is a cosmetic UI label only, never wired to
  `resolveCommentAccessMode` or any real grant.

Only ownership semantics (own-comment-only mutation rights) are fully solid
today.

**Why not remove.** Removal cost is real but moderate, and would discard a
genuinely reusable, already-tested ownership/fail-safe contract for no
current benefit. The dormant branches are provably inert and well-isolated
(this document's own closure guards -- `commentPermissionClosure.contract.
test.tsx`'s "COMMENT dormancy" checks -- already prove exactly one live
`resolveCommentAccessMode(` producer with no `boardPermission` argument), so
retaining them costs ongoing patch-scope discipline, not runtime risk.

**Explicit anti-reactivation warning.** The existence of
`CommentAccessMode = 'comment'`, the comment-mode client tests,
`commentMutations.ts`, `BoardPermission = 'commenter'`, and the quarantined
`comment_mutate` draft must **not** be read as evidence that commenter access
can be safely enabled by passing a `boardPermission` value into
`resolveCommentAccessMode`. That exact wiring was attempted in PATCH 8O.2 and
reverted in PATCH 8O.2a after live testing exposed the dead-schema
dependency above -- see "Activation requirements for COMMENT" earlier in
this document for the five conditions that must all hold before any future
re-wiring, none of which hold today.

**What future activation actually requires**, in order -- not "restore the
second `resolveCommentAccessMode` argument" or "deploy the quarantined RPC":

```text
PRODUCT REQUIREMENT
  -> AUTHORIZATION MODEL (board-level commenter, against live `boards`)
  -> LIVE SCHEMA (a real collaborator-role table wired to `boards`, not `canvases`)
  -> SERVER ENFORCEMENT (RLS/RPC rebuilt and reviewed against that schema)
  -> STORAGE COVERAGE (every live comment surface, not just detachedComments)
  -> UI GRANT FLOW (a real path that assigns commenter, not a cosmetic label)
  -> CLIENT ACTIVATION (only then, resolveCommentAccessMode's second argument)
```

This is project-scale future product/authorization work, not a wiring patch.

**Quarantined RPC status, unchanged**: `.fable5/drafts/
comment_mutate_rpc_20260812.sql` remains design reference / quarantined --
not an active migration, not a production RPC, not activation-ready. It was
not modified, moved, or executed by this patch.

**Validation:** focused suite (6 files, 293 tests) and full suite (132 files,
2245 tests) both green, unchanged from the PATCH 8AK baseline. `npx tsc
--noEmit`, `npm run check:boundaries`, and `git diff --check` all clean.
Zero production files changed; zero migration/RLS/RPC changes; zero
live-data actions.
