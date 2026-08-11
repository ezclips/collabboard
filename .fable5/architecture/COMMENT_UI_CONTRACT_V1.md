# Comment UI Contract v1

## Status

FROZEN
CHARACTERIZATION ONLY -- NO PRODUCTION BEHAVIOR CHANGED IN THIS PATCH

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
