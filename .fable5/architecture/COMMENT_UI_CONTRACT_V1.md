# Comment UI Contract v1

## Status

FROZEN, behavior unchanged throughout PATCHES 8A-8C, with one deliberate,
labeled behavior change in PATCH 8E (Site B only).

- **SITE A: FROZEN -- shared implementation pilot completed (PATCH 8C).**
  Its inline row/action-rail JSX is gone from `FreeformPadletCards.tsx`;
  the same frozen behavior is now produced by
  `components/collabboard/comments/CommentList.tsx` +
  `FreeformCommentRow.tsx` (`SITE_A_PROFILE`), proven equivalent by
  `components/collabboard/comments/siteA.pilotParity.test.tsx`. No
  `COMMENT UI CONTRACT UNLOCK` was used -- this is implementation
  consolidation, not a behavior change.
- **SITE B: COMMENT UI CONTRACT UNLOCK -- CLIPART SITE B (PATCH 8E).**
  Its old, frozen-as-of-8A shared-action-rail behavior (documented in the
  "v1 frozen behavior" section below, left intact as historical record) is
  **deliberately superseded**. Site B's inline row/action-rail JSX is gone
  from `FreeformPadletCards.tsx`; it now renders through
  `components/collabboard/editors/CommentPopup.tsx` -- the exact same
  canonical component the Clipart edit modal (`ClipartCardDraftModal.tsx`)
  already used, closing the two-Clipart-comment-UX duality PATCH 8D's audit
  surfaced. See "PATCH 8E -- Clipart entry-point unification" below for the
  full before/after and the specific frozen items this unlock changes.
- Sites C, D, F: unchanged, still inline, exactly as PATCH 8A froze them
  below.
- **Site E is dead code**, confirmed by PATCH 8E's trace: `cardToolbarPadletId`
  is never set to a non-null value anywhere in the codebase (`grep -rn
  "setCardToolbarPadletId(" components/ app/` finds only `null` calls), so
  `activeCardToolbarPadlet` (`cardToolbarPadletId ? padlets.find(...) : null`)
  is always `null` and Site E's entire gated block
  (`{cardToolbarPadletId && activeCardToolbarPadlet && (...)}`) never
  renders. It is characterized below exactly as PATCH 8A found it (frozen
  source, not touched by 8E), not because a user can reach it today.

Established by PATCH 8A, against baseline commit `8a19325c9fbe163e5d9760fc558c74dace39b98d`
(itself created by committing the color/link feature work that was sitting
uncommitted on top of `2102e1d2274d34c2b901c3e6b347113fb90260a7`, the SHA
originally named as this patch's baseline -- see "Baseline correction" below).

Cross-reference: `.fable5/CLAUDE.md` rule 9 already lists "three comment
stores" among the known dualities not to be fixed opportunistically. This
document makes that duality concrete and precise -- it is finer-grained than
"three": there are (at minimum) **six distinct inline UI implementations**
across **three storage backings**, described below.

---

## Baseline correction (reported, not silently absorbed)

The patch's required starting HEAD (`2102e1d...`) was not clean at run time:
16 modified files + 6 new files (404 insertions) from the color/link feature
implemented and tested earlier in this session were sitting uncommitted on
top of it. Per explicit user instruction, that work was committed first
(`8a19325c...`, `feat(comments): per-comment color/link controls, safe link
handling across surfaces`), establishing a new clean baseline, and PATCH 8A
was run against that instead. See the return report for full detail.

---

## Correction to the prior audit: SIX sites, not five

The prior report (this same session, before this patch) identified "5
freeform copies" by searching for `dangerouslySetInnerHTML` occurrences in
`FreeformPadletCards.tsx`. That search was accurate for what it measured (5
sites use `dangerouslySetInnerHTML` + `DOMPurify`) but missed a 6th site that
renders comment text as plain `{c.text}` instead -- so it never matched that
search. All 6 are catalogued below.

| Site | Post type / trigger | State variable family | Storage field |
|---|---|---|---|
| A | `image`, badge click (toolbar closed) | `cardComment*` / `activeCardComment` | `metadata.detachedComments` |
| B | `card` (Clipart), badge click (toolbar closed) | `cardComment*` / `activeCardComment` | `metadata.detachedComments` |
| C | `comment`, collapsed pin marker click | `collapsed*` | `metadata.comments` |
| D | `image`, toolbar-open popup (`activeImageToolbarPadlet`) | `cardComment*` / `activeCardComment` (shared with A) | `metadata.detachedComments` |
| E | `card` (Clipart), toolbar-open popup (`activeCardToolbarPadlet`) | `cardComment*` / `activeCardComment` (shared with B) | `metadata.detachedComments` |
| F | generic fallback -- `note`, `drawing`, `ai-component`, and any type not specifically branched | `cardComment*` / `activeCardComment` (shared with A, D) | `metadata.detachedComments` |

All 6 live in `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
(currently ~6.4k lines, already over this repo's 800-line file ceiling per
`.fable5/CLAUDE.md`).

Beyond this file, three more independent comment implementations exist and
are explicitly OUT OF SCOPE for this contract (not characterized here):
`CommentPost.tsx` (standalone Comment post, non-collapsed), `CommentEditor.tsx`
(its full-screen editor), and `CommentRow.tsx`/`EmbeddedCommentList.tsx` (used
by container children and several row-based layouts). A prior consolidation
plan proposed for those three separately; this contract does not cover them.

---

## Frozen behavior (v1) -- do not change without an explicit UNLOCK

### Action cluster

- Every site presents exactly this action set, in this exact order:
  **(Color | Edit toggle), Strikethrough, Delete.** Color and Edit occupy the
  same slot -- Color shown while editing, Edit shown otherwise.
- Every action button is individually `disabled` when nothing is active
  (no silent no-op clicks).
- **Icon drift (frozen as-is):** every site's Edit icon is `PenTool` **except
  site B**, which uses `Edit2`. Notably, **B and E are the same post type**
  (card/Clipart) and still disagree with each other (B: `Edit2`, E: `PenTool`)
  -- this is drift within one post type's own two comment panels, not just
  across post types.
- **Badge Color button:** present on A, C, D, E, F. **Absent on B** (the
  card/Clipart expanded/badge-triggered view has no Badge Color button; its
  toolbar-collapsed sibling, E, does).

### Storage backing

- A, B, D, E, F write through `metadata.detachedComments`.
- C writes through `metadata.comments`.
- Comment record fields in current use: `id`, `text`, `userId`, `userName`,
  `timestamp`, `textColor`, `backgroundColor`, `isStrikethrough`. A legacy
  `color` field is also read as a fallback everywhere (`c.textColor ||
  c.color`).
- **Color-write field shape drift (frozen as-is):** sites A and C write
  **both** `textColor` and the legacy `color` field on every text-color
  change (`{ ...comment, textColor: color, color }`). Site B writes
  `textColor` only. (D, E have no working color popup at all -- see defect
  below. F was not independently re-verified for this specific shape beyond
  what the characterization test asserts: `textColor` only, no legacy
  `color`.)
- Delete always filters by exact target id (`activeCardComment.id` for
  A/B/D/E/F, `collapsedActiveCommentId` for C) and never touches other
  comments.
- Strikethrough is a record-level boolean field (`isStrikethrough`) on every
  site -- never a TipTap mark. This is the canonical representation per prior
  product decision; a future shared implementation must not silently convert
  it to a mark.

### Editing engine and composer

- Every site edits via a plain `<textarea>`. None use TipTap/`useEditor`.
- Every site's composer is a single-line `<input type="text">` that submits
  only on Enter. No Send button, no Shift+Enter newline, anywhere.
- Double-click-to-edit is wired on the row for A, B, C, D, E. **Site F has no
  double-click-to-edit** -- only its Edit button works.

### Link authoring and rendering (current state -- do not upgrade silently)

- **No site can author a link.** There is no Link button and no TipTap Link
  extension anywhere in this file's inline comment code.
- **5 of 6 sites (A-E) render comment text as HTML** via
  `dangerouslySetInnerHTML` + `DOMPurify.sanitize`, so a link authored
  elsewhere (e.g. via `CommentPopup`) and later viewed here still renders as
  a clickable anchor, routed through the shared `handleSafeCommentLinkClick`
  (opens `_blank` with `noopener,noreferrer`, http/https only).
- **Site F renders comment text as plain `{c.text}`.** No HTML
  interpretation at all -- a comment containing a `<a href>` tag from
  elsewhere would show literal escaped markup, not a link, on Note/Drawing/
  AI-component posts. This is a real, currently-shipping display gap, not
  something introduced by this patch.

### Known pre-existing defect (frozen, not fixed)

**Sites D and E have a Color button that does nothing visible.** Clicking it
sets `commentColorPopupId`, but no `TextStylePopup` is ever rendered for
either scope: A's and B's color popups are explicitly gated **off** while
their respective toolbar is open (`!imageToolbarPadletId` /
`!cardToolbarPadletId`), and no replacement popup exists for the
toolbar-open state. This means: open an image or Clipart card's toolbar,
open its comment panel, click Color on a comment -- nothing happens. This
defect is characterized and asserted by a dedicated test
(`freeformCommentUIContract.characterization.test.tsx`, "KNOWN DEFECT"), so
consolidation must either preserve it explicitly (rare) or fix it as a
labeled, deliberate `COMMENT UI CONTRACT UNLOCK` -- not as a silent
side-effect of unifying the six sites into one component.

### Interaction boundaries

- Every read-only comment-text node (A-E) stops `mousedown` propagation, so
  a click inside comment text cannot start a card drag.
- The Color toggle button on every site explicitly calls
  `stopPropagation()` in both `onMouseDown` and `onClick` (>= 2 calls),
  guarding against the popover-open focus race.
- Each site's row click sets only its own active-comment id
  (`setActiveCardCommentId` for A/B/D/E/F, `setCollapsedActiveCommentId` for
  C) -- never a cross-site setter.

---

## Explicitly NOT frozen as one universal behavior

- Shell/chrome (floating popup vs. pin-marker side-popup vs. toolbar-anchored
  popup).
- Panel size/positioning class names.
- Badge Color button presence (already inconsistent -- see above).
- Edit icon identity (already inconsistent -- see above).
- The D/E dead Color button (a defect, not a design decision worth
  preserving on principle).
- Anything about `CommentPost.tsx`, `CommentEditor.tsx`, `CommentRow.tsx`, or
  `EmbeddedCommentList.tsx` -- out of scope for this contract entirely.

---

## Future rule

Any intentional change to a frozen behavior listed above must be labeled in
its commit message and PR description as:

```
COMMENT UI CONTRACT UNLOCK: <exact item being changed>
```

and name the exact contract item (e.g. "COMMENT UI CONTRACT UNLOCK: unify
Edit icon to PenTool across all sites" or "COMMENT UI CONTRACT UNLOCK: fix
D/E dead Color button"). Ordinary patches -- including the eventual
consolidation into `CommentRow`/`CommentList` -- must otherwise preserve v1
exactly, or explicitly unlock each item they intentionally change one at a
time.

---

## Test coverage

`components/collabboard/freeformCommentUIContract.characterization.test.tsx`
-- 19 source-level characterization tests, following this repo's established
convention for this specific file (source-string assertions via
`fs.readFileSync`, not direct mounting). `FreeformPadletCards.tsx` is not
mounted directly anywhere in this suite; per
`freeformDocumentPersistence.integration.test.tsx`, it is a 300KB+ monolith
requiring `CanvasEditorContext`/`CanvasConfigContext` and dozens of unrelated
action-map callbacks unrelated to comment behavior. The same source-string
technique is already used against this exact file by `CardPreview.test.tsx`,
`documentCardPreview.behavior.test.tsx`, `EmojiReactionPicker.test.tsx`, and
`freeformCanvasBoardMenu.characterization.test.tsx`.

All 19 tests were proven non-vacuous via 6 negative controls (temporarily
breaking production code, confirming the relevant test fails, then restoring
exactly via `git checkout`) -- see the PATCH 8A return report for each
control's result. Visual-regression coverage was not added: no Playwright
screenshot/visual-snapshot infrastructure exists in this repository
(confirmed via search of `e2e/` and `package.json`), and this patch was
scoped not to introduce one.

---

## PATCH 8B/8C -- shared foundation and Site A pilot

**Foundation (8B):** `lib/domain/canvas/comments.ts` (pure, immutable comment
operations -- `editCommentText`, `removeComment`, `toggleCommentStrikethrough`,
`setCommentTextColor`/`setCommentBackgroundColor`, the latter with an explicit
`mirrorLegacyColor` policy so the A/C-vs-B color-write-shape drift documented
above is carried as typed config, not silently unified) plus
`components/collabboard/comments/{CommentList,FreeformCommentRow}.tsx`.

**Pilot (8C):** Site A now renders through this foundation
(`<CommentList profile={SITE_A_PROFILE} .../>` inside its unchanged shell).
Two corrections were made to the 8B design once Site A's real source was
traced (PATCH 8C spec step 1), both driven by observed behavior, not
speculative generalization:

- `CommentList`'s active/editing/color-popup identity became a **controlled**
  prop (lifted to the caller) instead of internal `useState`. Site A's state
  (`activeCardCommentId`/`editingCardCommentId`/`editingCardCommentText`/
  `commentColorPopupId`/`cardCommentList`) is the exact same state family Site
  D's separate toolbar-open comment panel reads (see "shared with A" in the
  site table above) -- owning it internally would have desynced D from A the
  moment an image's toolbar opened or closed mid-edit.
- `CommentList` stopped rendering the `TextStylePopup` color popup itself.
  In Site A's real DOM that popup is a **sibling** of the whole comment
  panel (anchored to the padlet via `absolute right-full top-0 mr-3`), not
  nested inside the row list -- nesting it inside `CommentList` would have
  silently moved its anchor point. The popup stays shell-owned, unchanged,
  in `FreeformPadletCards.tsx`; `CommentList` only exposes
  `colorPopupCommentId`/`onColorPopupCommentIdChange` so its Color button can
  toggle the same state the shell's popup reads.

Sites B, C, D, E, F are untouched inline implementations; only Site A moved.
See `components/collabboard/comments/siteA.pilotParity.test.tsx` for the
mounted BEFORE/AFTER contract proof, and the "PATCH 8C -- Site A migration
wiring" block in the characterization suite for the source-level migration
proof. **No `COMMENT UI CONTRACT UNLOCK` was used or required** -- 8B/8C are
implementation consolidation, not a behavior change.

---

## PATCH 8E -- Clipart entry-point unification (Site B, `COMMENT UI CONTRACT UNLOCK`)

**Problem.** PATCH 8D's January-recovery audit found the SAME Clipart post
had two different comment experiences: the edit modal
(`ClipartCardDraftModal.tsx` -> `CommentPopup.tsx`, per-comment
Edit/Color/Link/Strikethrough/Delete) and the on-canvas badge (Site B,
frozen since 8A: a single shared action column, no Color, no Link). Product
decision: the modal's richer per-comment design is canonical; the on-canvas
badge must be unified onto it, not the other way around, and not onto Site
A's `CommentList`/`FreeformCommentRow` foundation either (that foundation's
shared-action-rail shape is exactly what the product decision rejects for
Clipart).

**Trace (before changing anything).** Both entry points were read in full
before any edit:

- Canonical: `ClipartCardDraftModal.tsx`'s `<CommentPopup isOpen
  onOpenChange={...} onSubmit={...} onEditComment={...}
  onRemoveComment={...} onToggleCommentStrikethrough={...}
  onCommentColor={...} comments={detachedComments}
  currentUserId={draftCommentUserId} currentUserName={draftCommentUserName}
  />`, each callback reading/writing `previewPadlet.metadata.detachedComments`
  through the modal's own local `updateMetadata`/`onChange` (the modal owns
  no network call itself; persistence happens wherever the caller's
  `onChange` eventually lands).
- Old Site B (`FreeformPadletCards.tsx`, `padlet.type === 'card'` block,
  badge `onClick` -> `cardCommentPopupPadletId === padlet.id &&
  !cardToolbarPadletId`): a duplicated inline row list with its own
  Edit2/Palette(absent)/Strikethrough/Delete buttons, a plain `<textarea>`
  editor (no TipTap, no Link), and its own gated `TextStylePopup` color
  popup, persisting via `updatePadletMetadata(padlet.id, {
  detachedComments: nextComments })` (the real async Supabase write) plus an
  optimistic `cardCommentList` local-mirror `setState` -- the same
  `cardComment*`/`activeCardComment` state family Sites A, D, E, F all read
  from a single `useCanvasEditor()` context instance.

**Callback/storage mapping.**

| Canonical (`CommentPopup` prop) | Old Site B (inline) | New Site B | Same semantics? |
|---|---|---|---|
| `onSubmit` | inline `<input>` Enter-key handler appending to `detachedComments` | `CommentPopup`'s own composer, same `onSubmit` prop | Yes -- same field, same append shape |
| `onEditComment(id, html)` | `<textarea>` blur/Enter committing plain trimmed text | `onEditComment(id, html)` via TipTap `getHTML()` | Storage field same; **content is now rich HTML, not plain text** (labeled change, see below) |
| `onRemoveComment(id)` | Delete button, filter by `activeCardComment.id` | Delete button, filter by exact row `comment.id` | Yes, and now targets the clicked row directly instead of indirecting through a separately-tracked "active" id |
| `onToggleCommentStrikethrough(id)` | Strikethrough button on shared action column | Strikethrough button per row | Yes, same `isStrikethrough` boolean field |
| `onCommentColor(id, textColor, bg)` | Two `onSelectColor`/`onSelectHighlight` handlers writing `textColor` only (no legacy `color` mirror) | `onCommentColor` writing `{textColor, backgroundColor}` together | **Shape changed** (see below) |
| *(none -- Link did not exist)* | -- | `openLinkPopover`/`handleApplyLink` (TipTap Link mark) | **New capability** |

**Reuse, not copy.** `FreeformPadletCards.tsx` now imports and renders
`CommentPopup` directly (`import CommentPopup from
'@/components/collabboard/editors/CommentPopup';`) -- the identical
component instance type `ClipartCardDraftModal.tsx` renders, not a fork, not
a new `ClipartCanvasCommentPopup`/`ClipartCommentRow2`. `CommentPopup.tsx`
itself was **not modified**: its `isOpen`/`onOpenChange` + per-comment
callback props already worked for a non-modal caller with no changes
needed, so no extraction into a smaller shared sub-component was necessary
(the "if the whole component owns modal-specific chrome" branch in the
patch spec did not apply -- `CommentPopup` already renders bare when given
no `position` prop, which is exactly what a caller-positioned canvas popup
needs).

**Storage: unchanged.** Same `metadata.detachedComments` field, same
comment record shape (`id`/`text`/`userId`/`userName`/`timestamp`/
`textColor`/`backgroundColor`/`isStrikethrough`), same
`updatePadletMetadata` + optimistic `cardCommentList` mirror pattern PATCH
8C already established for Site A. No schema migration, no ID/timestamp
changes, no dropped fields.

**Explicitly unlocked items (frozen v1 behavior this patch deliberately
changes, Site B only):**

- **Edit icon.** Was `Edit2` (site B's own frozen drift item). Now
  `CommentPopup`'s own hardcoded pencil `<svg>` -- neither `Edit2` nor
  `PenTool`. Site E (the only site that still shares this post type) is
  dead code, so this does not reintroduce cross-post-type drift in
  practice.
- **Color-write shape.** Was `{ ...comment, textColor: color }` (textColor
  only, two separate handlers for text vs. highlight color). Now
  `{ ...comment, textColor, backgroundColor }` written together by
  `CommentPopup`'s single `onCommentColor` callback -- matching the shape
  the canonical modal already used, not matching A/C's legacy
  `{ textColor, color }` mirror shape either (that mirror is a Site
  A/C-specific historical quirk `CommentList`'s `mirrorLegacyColor: true`
  config also intentionally preserves only for A; Site B was never part of
  that mirror and still isn't).
- **Editing engine.** Was a plain `<textarea>`, plain-text commit. Now
  TipTap (`useEditor`), HTML commit -- required for Link authoring, and
  matching what the canonical modal already did.
- **Link.** Was entirely absent (no button, no extension). Now full Link
  authoring/rendering/safe-click-open, identical to the canonical modal,
  because it now IS the canonical modal's own component.
- **Color popup gating.** Old Site B rendered its own `TextStylePopup`,
  explicitly gated off while `cardToolbarPadletId` was set (a gate that,
  per the dead-code finding above, could never actually fire). New Site B
  has no such gate at all -- `CommentPopup`'s per-row color popover is a
  viewport-anchored portal (`useAnchoredPopover`), independent of
  `cardToolbarPadletId`/`imageToolbarPadletId` entirely.
- **Row selection state.** Old Site B wrote the shared
  `activeCardCommentId`/`editingCardCommentId`/`editingCardCommentText`
  context state on every open/select/edit (the same family Sites A, D, E, F
  read). New Site B does not touch these at all -- `CommentPopup` manages
  its own internal `activeCommentId`/`editingCommentId` state, scoped to
  itself. This is safe specifically because Site E, the only other
  consumer of that shared state for the Clipart post type, is confirmed
  dead code (see Status above): there is no live sibling panel left that
  could desync from Site B no longer writing that shared state. (This is
  the inverse of PATCH 8C's reasoning for Site A, where the state HAD to
  stay lifted/controlled because Site D is real and reachable.)
- **Badge Color button.** Deliberately left absent, matching Site B's
  pre-8E state and the canonical modal's own Comments panel (which also
  does not pass `badgeColor`/`onBadgeColorChange` into `CommentPopup` --
  its own Badge Color button is separate modal chrome, not part of
  `CommentPopup` itself). Out of scope for the per-comment-controls duality
  this patch fixes; the contract already listed Badge Color presence as
  "already inconsistent," not frozen.

**Not changed:** shell/chrome (Site B's popup is still an absolutely
positioned canvas overlay, `left-full top-0 ml-3`, not a modal panel); the
open/close trigger (still the on-canvas comment-count badge, still
`cardCommentPopupPadletId`); Sites A, C, D, F (untouched); Site E source
(untouched, still dead).

**Proof.** See `components/collabboard/freeformCommentUIContract.
characterization.test.tsx`, "PATCH 8E -- Site B migration wiring" (migration
correctness, storage/callback wiring, each explicitly-unlocked item) and
"PATCH 8E -- architectural anti-duplication guard" (fails if a second local
Clipart comment-action implementation is reintroduced). Both entry points'
shared behavior (Add/Edit/Color/Link/Strikethrough/Delete, real DOM events)
is additionally covered by the pre-existing
`components/collabboard/editors/CommentPopup.clipartContract.test.tsx` and
`CommentPopup.colorAndLink.test.tsx` (unchanged by this patch -- they
already exercised the exact component Site B now also renders).
