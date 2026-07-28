# PATCH-120 — Restore Reaction and Comment in the Library clipart draft modal

**Status:** AUTHORIZED · OPEN · NOT STARTED
**Authored:** 2026-07-29 (CTO)
**Base commit:** `9669191d433acc78612de733c92627df2cbf2eef` (PATCH-117 closure)
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews.
The authoring CTO neither implements nor reviews this candidate.

---

## 0. Repository state at authoring

- **PATCH-117: CLOSED**, landed and pushed at `9669191`.
- **PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
- **PATCH-116: CANCELLED and retired.**
- **PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
- **PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.** PATCH-120
  is authored ahead of PATCH-119 deliberately; the two are independent and
  share no file.
- Five unrelated pending paths remain dirty and are **protected**:
  `.gitignore`, the three `app/api/ai/*` routes, and
  `scripts/live-access-login.mjs`.

---

## 1. Subject

`ClipartCardDraftModal` renders the shared `CardActionsToolbar` with working
Color, Icon, Card view and Delete actions, but passes silent no-op callbacks
for two of them:

```
components/collabboard/editors/ClipartCardDraftModal.tsx:76   onAddReaction={() => {}}
components/collabboard/editors/ClipartCardDraftModal.tsx:77   onComment={() => {}}
```

Both buttons render, accept clicks, and do nothing.

---

## 2. Root-cause classification — **A, ACCEPTED with one correction**

**Accepted:** interactive buttons are rendered with no-op callbacks. This is
a missing integration in `ClipartCardDraftModal`. It is **not** a failure of
`CardActionsToolbar`, of reaction or comment persistence globally, of
permissions, providers, card ids, clipping or modal stacking.

**Correction, from source — the premise "Note posts provide a working
reference implementation" is only half true, and acting on it as stated
would produce the wrong implementation:**

- **Reactions — the Note reference holds.** `NoteEditor.tsx:137` keeps
  `reactions: string[]`, opens a picker at `:724`
  (`onAddReaction={() => setEmojiPickerOpen(true)}`), appends without
  duplicates at `:767-768`, and writes `metadata.reactions` at `:664`.
- **Comments — the Note reference does NOT hold.** `NoteEditor`'s comments
  are **inline ProseMirror text threads** stored in document node attributes
  (`commentThread`, `:227`, `:583`), plus separately-tracked detached
  comments (`:155`). That is a different model from a card-level comments
  panel, and copying it would create a fourth comment UI system in this
  codebase rather than reuse an existing one.

**The correct comment reference is the saved-card path**, which is
read-only for this patch: `FreeformPadletCards.tsx:5479-5490` and
`:6033-6042` both open the card comment panel from
`metadata.detachedComments`.

---

## 3. Production allowlist — **maximum 2 files**

**Primary, and expected to be the only one:**

```
components/collabboard/editors/ClipartCardDraftModal.tsx
```

**One additional shared helper file is permitted ONLY** if the implementer
proves from source that the reaction/comment draft state cannot be held
safely inside the modal. If claimed, the proof must be stated in the report
before the file is created. **A helper is not expected**: the modal is 144
lines, already owns `isColorPanelOpen` / `isCardViewOpen` local state, and
already has an immutable `updateMetadata` helper at `:43-51`.

**PROHIBITED — must remain byte-for-byte unchanged:**

```
app/dashboard/canvas/[id]/CanvasClient.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/editors/NoteEditor.tsx
components/collabboard/editors/NoteEditorToolbar.tsx
components/collabboard/editors/CardActionsToolbar.tsx
components/collabboard/editors/EmojiReactionPicker.tsx
components/collabboard/editors/CommentPopup.tsx
components/collabboard/CardPreview.tsx
components/collabboard/canvas/ui/CanvasModals.tsx
```

Also prohibited: any reaction or comment repository, the database schema,
RLS policies, `CardActionsToolbar`'s visual layout, and the unrelated Color,
Icon, Card view, Title, Due date and Share actions.

`EmojiReactionPicker` and `CommentPopup` are **consumed as-is**. If either
appears to need a prop it does not have, **stop and return** — do not widen
scope.

---

## 4. Test allowlist — **maximum 3 files**

```
components/collabboard/editors/ClipartCardDraftModal.test.tsx      (new)
```

Plus, only if an existing suite must be extended rather than duplicated, up
to two of:

```
components/collabboard/editors/NoteEditor.test.tsx                 (if it exists)
e2e/characterization/<one focused Playwright spec>                 (new or existing)
```

The implementer must report which test files exist before choosing. **No
existing test may be weakened, skipped or deleted.**

---

## 5. Chosen shared components — BOUND

| Purpose | Component | Interface |
|---|---|---|
| Reaction picker | `components/collabboard/editors/EmojiReactionPicker.tsx` | `isOpen`, `onOpenChange`, `onSelectEmoji`, `inline?`, `className?` |
| Comments panel | `components/collabboard/editors/CommentPopup.tsx` | `isOpen`, `onOpenChange`, `onSubmit`, `onEditComment?`, `onRemoveComment?`, … |

**`EmojiReactionPicker` currently has zero call sites in the repository.**
It is a complete, self-contained component and is the correct choice, but it
is **unproven in use**. The implementer must verify it renders and emits
`onSelectEmoji` correctly in this modal before relying on it, and report
that verification. If it proves unusable, **stop and return** — do not
substitute a different picker without a ruling.

---

## 6. Metadata contract — BOUND, and the dual-field rule is load-bearing

**Reactions:**

```
metadata.reactions: string[]        // array of emoji characters
```

Matches `NoteEditor.tsx:107` and `:664`. Duplicates must not be added — see
`NoteEditor.tsx:767`.

**Comments:**

```
metadata.detachedComments: CommentData[]
```

`CommentData` is defined in `CommentPopup.tsx:24-33`:
`{ id, text, userId, userName, userAvatar?, timestamp, color?, isStrikethrough? }`.

**The dual-field rule — this is the single most likely way to break this
patch:**

`metadata.comments` and `metadata.detachedComments` are **two distinct
fields that coexist**. Readers do not treat them as one:

- `FreeformPadletCards.tsx:663` and `:725` compute the badge count as
  `detachedComments.length + comments.length` — **the sum of both**.
- `CanvasModals.tsx:172` and `:208` read
  `detachedComments || metadata.comments` — a fallback, not a merge.
- `FreeformPadletCards.tsx:699` reads `comments || detachedComments` — the
  **opposite** precedence.

Therefore, binding:

1. **Write `metadata.detachedComments` only.**
2. **Never write `metadata.comments`** from this modal.
3. **Never migrate, merge or copy between the two fields.** Writing both
   would double every comment count on the canvas.

---

## 7. User identity — the one requirement that cannot be met as written

The request requires "the current authenticated user information already
available to the modal or its existing parent flow." **No such information
exists on this path**, and source proves it:

- `ClipartCardDraftModal`'s props (`:10-17`) carry no user.
- `NoteEditor.tsx:803-804` passes hardcoded `currentUserId="user1"` and
  `currentUserName="R"`.
- `CommentViewPopup.tsx` defaults `currentUserId = 'user1'`.

**Ruling:** the draft must use **whatever identity source the saved-card
comment path already uses**, established from source by the implementer and
stated in the report. If that proves to be the hardcoded placeholder, the
draft **must match it** — a draft and its saved card must not disagree about
authorship.

**Prohibited:** inventing a new identity source; adding a user prop threaded
through any prohibited file; introducing an auth hook into this modal.

**If the placeholder identity is confirmed, it is recorded here as a
pre-existing defect and assigned to a successor patch. It is explicitly out
of scope for PATCH-120 and must not be "fixed along the way."**

---

## 8. Required implementation

In `ClipartCardDraftModal.tsx` only:

1. Replace `onAddReaction={() => {}}` (`:76`) with a real handler opening
   the reaction picker.
2. Replace `onComment={() => {}}` (`:77`) with a real handler opening the
   comments panel.
3. Add local open/closed state for `EmojiReactionPicker`.
4. Add local open/closed state for `CommentPopup`.
5. Initialize reactions and comments from `previewPadlet.metadata`
   (`metadata.reactions`, `metadata.detachedComments`), defaulting to `[]`.
6. Update metadata **through the existing `updateMetadata` helper at
   `:43-51`**, which already spreads immutably and routes through `onChange`.
   Do not add a second update path.
7. Preserve all existing metadata fields — `updateMetadata` already does;
   do not replace it with a whole-object assignment.
8. Preserve existing reactions and comments when adding new ones (append,
   never replace). Reactions must not duplicate.
9. Identity per §7.
10. Metadata shape per §6.
11. **No separate persistence route.** Draft persistence continues through
    the existing save-card flow. No fetch, no repository call, no route
    handler.
12. Anchor both panels beside the draft modal, consistent with how
    `CardColorPanel` is anchored at `:109-122`.
13. Closing either panel must not close or reset the draft. Note that the
    modal's backdrop button (`:55-60`) calls `onClose`, which **saves** the
    card — panel dismissal must never reach it. Opening a panel must also
    not be dismissed by an unrelated outside-click handler closing the
    modal.

**Mutual exclusivity:** opening one panel should close the other and the
color panel, matching the saved-card behaviour at
`FreeformPadletCards.tsx:6021-6042`.

---

## 9. Acceptance criteria

**Reaction** — a normal click on Reaction must: open the shared emoji
picker; allow choosing an emoji; add it to the exact draft card; update
`previewPadlet.metadata.reactions` through `onChange`; retain existing
reactions; not duplicate an existing emoji; update the visible reaction
indicator/count; close normally; and persist after saving and reopening the
card.

**Comment** — a normal click on Comment must: open the shared comments
panel; display existing draft comments; permit entering and posting a
comment; update `previewPadlet.metadata.detachedComments` through
`onChange`; retain existing comments; update the comment indicator/count;
close normally; and persist after saving and reopening the card.

**Non-regression** — Color, Icon, Card view, Delete, Caption, and the
existing save/discard flow behave exactly as before; the canvas comment
badge count is unchanged for cards with no draft comments; no
`metadata.comments` value is written or removed anywhere.

---

## 10. Required tests

1. Library clipart draft Reaction button **opens the emoji picker**.
2. Selecting an emoji **updates the draft metadata** (`metadata.reactions`).
3. Library clipart draft Comment button **opens the comments panel**.
4. Posting a comment **updates the draft metadata**
   (`metadata.detachedComments`).
5. Saving and reopening retains both values.
6. Note Reaction and Comment behaviour unchanged.
7. Saved canvas-card Reaction and Comment behaviour unchanged.
8. Color, Icon and Card view still work.
9. Closing either panel leaves the draft modal **open**.
10. No interactive toolbar action in this modal uses an empty callback.

**Tests must click the buttons and assert the panels open.**
Button-presence assertions alone are **not acceptable** and will be rejected
at review — that is precisely the gap that let this defect ship.

**Additional test, required by §6:** adding a draft comment must leave
`metadata.comments` untouched, proving the dual-field rule holds.

**Static guard, required:** a narrow source assertion over
`ClipartCardDraftModal.tsx` rejecting `onAddReaction={() => {}}`,
`onComment={() => {}}` and equivalent empty callbacks (`() => undefined`,
`() => null`, empty-bodied arrow or function expressions) passed to any
interactive toolbar prop in this file. It must be scoped to this file only
and must fail loudly rather than skip when the file cannot be read.

---

## 11. Characterization order

**Before implementation:**

1. Prove the current Library draft buttons **receive clicks but do not
   change panel state** — a failing-by-construction characterization, not a
   presence check.
2. Prove the Note and saved-card paths currently work.
3. Record the current metadata shape for reactions and comments, and
   confirm §6's dual-field reading from source.

**After implementation:**

4. Rerun the focused characterization — items 1's assertions must now
   invert.
5. `npx tsc --noEmit`
6. Relevant unit/component tests, plus the full Vitest suite for regression.
7. The focused Playwright test.
8. Existing Note and saved-card reaction/comment tests where available.

---

## 12. Bound implementation commit message

Used **verbatim**, and only after independent review passes:

```
fix(canvas): wire clipart draft reactions and comments (PATCH-120)
```

---

## 13. Hard stops

Stop and return for a ruling if any of these occur:

1. `EmojiReactionPicker` or `CommentPopup` requires a prop it does not
   currently expose.
2. A prohibited file appears to require modification.
3. The saved-card identity source cannot be established from source.
4. Writing `detachedComments` alone changes an existing canvas comment
   count.
5. A second production file appears necessary (see §3 — proof required
   first).
6. Any existing test must be weakened, skipped or deleted.
7. Any of the five protected pending paths becomes staged or modified.

---

## 14. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-120 in full first —
> authoritative. Do not issue governance rulings, edit `.fable5`, or touch
> PATCH-118 or PATCH-119. Do not commit until independent review passes.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). The five protected paths — `.gitignore`, the
> three `app/api/ai/*` routes, `scripts/live-access-login.mjs` — must remain
> dirty, unstaged and unmodified. **No worktree. `.env.local` untouched.**
>
> **Phase 1 — characterization first (§11.1–3).** Write the failing
> characterization proving the two buttons receive clicks and change no
> panel state, prove the Note and saved-card paths work, and record the
> metadata shapes from source. Report actual output **before** writing any
> implementation.
>
> **Phase 2 — implement §8 in
> `components/collabboard/editors/ClipartCardDraftModal.tsx` only.** Use
> `EmojiReactionPicker` and `CommentPopup` as-is (§5). Route every metadata
> change through the existing `updateMetadata` helper at `:43-51`. Write
> `metadata.reactions` and `metadata.detachedComments` only — **never
> `metadata.comments`** (§6). Take the comment author identity from
> whatever source the saved-card path already uses, and state that source
> and its line number in your report (§7). Do not add a persistence route.
>
> A second production file requires a stated source proof first (§3). Any
> §13 condition is a hard stop — return, do not work around it.
>
> **Phase 3 — tests (§10).** All ten, clicking the buttons and asserting the
> panels open; presence-only assertions will be rejected. Add the
> `metadata.comments`-untouched test and the narrow static guard.
>
> **Phase 4 — validation (§11.4–8).** Report actual output for every command.
>
> Report: the exact diff scope; which test files existed versus were
> created; the identity source with its line number; confirmation that
> `metadata.comments` is never written; confirmation `EmojiReactionPicker`
> renders and emits correctly in this modal; and the final safety-gate
> results. **Leave the candidate uncommitted and unstaged for independent
> review.**

---

## 15. Status

**PATCH-120: AUTHORIZED · OPEN · NOT STARTED · UNCOMMITTED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-117: CLOSED.**
**PATCH-116: CANCELLED and retired.**
