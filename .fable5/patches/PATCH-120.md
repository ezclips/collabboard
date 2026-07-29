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

---

## 16. Test-discovery ruling — relocation alone does not work (2026-07-29, CTO)

Issued at governance base `8cb0b804b46e0f1fcae9b7e28739630701f815c7`.

### 16a. The blocker is deeper than the include glob

`vitest.config.ts` is four lines of relevant configuration:

```ts
include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts',
          'scripts/harness/**/*.test.ts', 'components/collabboard/*.test.tsx'],
environment: 'node',
```

Two facts follow, and the second is the one that decides this ruling:

1. `components/collabboard/*.test.tsx` matches **only the top level** of
   `components/collabboard/`, not `editors/`. That alone would make
   relocation sufficient.
2. **`environment: 'node'`, and the repository has no DOM environment at
   all.** `package.json` contains **no `jsdom`, no `happy-dom`, and no
   `@testing-library/react`**. The only included component test,
   `components/collabboard/SimpleLineRenderer.test.tsx`, renders with
   **`renderToStaticMarkup` from `react-dom/server`** (`:2`) — static
   server markup, no DOM, no events.

**Therefore relocation makes the file discovered but cannot make it click.**
A test that must click Reaction and assert `EmojiReactionPicker` opens
requires a DOM and an event system that this repository does not have
installed.

**A is REJECTED** — it does not preserve the coverage, which was the stated
precondition for preferring it. **B is REJECTED** for the identical reason;
an included editor/component test file runs in the same environment.
**C is REJECTED and remains prohibited** — adding
`components/collabboard/editors/*.test.tsx` to `include` would cause the
relocated file to run under `environment: 'node'`, where its interactive
assertions cannot work. The include glob was never the whole blocker, so
changing it does not fix the problem.

### 16b. An unexplained result that must be resolved before acceptance

The report states "focused temporary-config test run: 8 PASS". **No DOM
environment package exists in this repository**, so that result is not yet
explained. Exactly one of these is true:

1. the tests do not actually click, and assert something weaker; or
2. a dependency was added or transiently installed.

**If (2), that is a hard stop under §13.5-adjacent reasoning** — adding
`jsdom` or `@testing-library/react` is a repository-wide test-infrastructure
decision with its own blast radius, and **PATCH-120 does not authorize it.**

**The implementer must state which of (1) or (2) occurred, and show the
temporary config, before any acceptance evidence is credited.** The 8 PASS
result is **not accepted** until then.

### 16c. Classification: **D**

The coverage splits along what each existing, already-conforming harness can
actually prove:

- **Included Vitest suite** (node environment, `renderToStaticMarkup`
  precedent) — metadata behaviour and static guarantees.
- **Playwright characterization** (`e2e/characterization/`, the repository's
  established interactive harness, exercised heavily throughout PATCH-117) —
  the real clicking.

This is **not** weakening the test into source inspection. The four required
click assertions are preserved in full; they move to the harness that drives
a real browser, which is **stronger** evidence of user-facing behaviour than
a synthetic DOM would be.

**E is not needed**; D is source-backed and conforms to existing convention
without new dependencies or config changes.

### 16d. Authorized test paths — exact

**Vitest (permanent, included by the existing glob):**

```
components/collabboard/ClipartCardDraftModal.test.tsx
```

This matches `components/collabboard/*.test.tsx` and follows the
`SimpleLineRenderer.test.tsx` precedent in the same directory. **It must run
under `environment: 'node'` using `renderToStaticMarkup` and direct handler
invocation — no DOM APIs, no new dependency, no per-file environment
docblock.**

**Playwright (permanent, focused):**

```
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

**Deleted:**

```
components/collabboard/editors/ClipartCardDraftModal.test.tsx
```

Its contents move to the two paths above so there is **one authoritative
focused suite per harness**. Leaving an excluded test in place is worse than
having none — it reads as coverage while never running.

**`vitest.config.ts` remains PROHIBITED.** So does adding any test
dependency.

**§4 of this patch is amended** to the two paths above; the production
allowlist in §3 is unchanged, and no production file beyond
`ClipartCardDraftModal.tsx` is authorized.

### 16e. Required assertions, by harness

**Vitest — `components/collabboard/ClipartCardDraftModal.test.tsx`:**

1. Selecting an emoji produces `metadata.reactions` containing it, via the
   `onChange` payload.
2. **Duplicate reaction prevention** — selecting an existing emoji leaves
   `metadata.reactions` unchanged.
3. **Existing reactions preserved** when a new one is added.
4. Submitting a comment produces `metadata.detachedComments` containing it,
   via the `onChange` payload.
5. **Existing comments preserved** when a new one is added.
6. **`metadata.comments` untouched** by both flows — asserted explicitly,
   per §6's dual-field rule.
7. All pre-existing metadata fields preserved across both flows.
8. **Static guard** — no empty callback (`() => {}`, `() => undefined`,
   `() => null`, empty-bodied arrow or function expression) is passed to any
   interactive toolbar prop in `ClipartCardDraftModal.tsx`. Scoped to that
   file; must fail loudly if the file cannot be read, never skip.

Handlers may be invoked directly through rendered props; that is a
legitimate unit-level technique and is not "source inspection only".

**Playwright — `e2e/characterization/clipart-draft-reactions-comments.spec.ts`:**

9. Click **Reaction** → `EmojiReactionPicker` opens.
10. Click an emoji → the reaction is visible on the draft card.
11. Click **Comment** → `CommentPopup` opens.
12. Submit a comment → the comment is visible and any indicator/count
    updates.
13. **Closing either subpanel leaves the draft modal open** — and, per §8.13,
    must not reach the backdrop `onClose` at
    `ClipartCardDraftModal.tsx:55-60`, which **saves** the card.
14. **Color, Icon and Card view paths remain intact.**
15. Save and reopen retains both reactions and comments.

All standing live rules from PATCH-117 apply unchanged: `--no-deps` only
with a fresh storage state; identity assertion per PATCH-117 §31; user ids
only, never a credential or token; one disposable fixture; real board data
untouched; `.env.local` untouched; no worktree; no `force: true`.

### 16f. Acceptance

Both must pass with **ordinary repository commands and no temporary
config**:

```
npx vitest run components/collabboard/ClipartCardDraftModal.test.tsx
npx vitest run                      # must include the new file; expect 56 files
npx tsc --noEmit
npx eslint <changed files>
npx playwright test e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

The full Vitest run must show the file count rise from **55 to 56**. A run
that still reports 55 means the file is still not discovered — that is a
failure, not a rounding detail.

### 16g. Independent review

**Independent review may begin only after** the ordinary focused Vitest run,
the full Vitest run at 56 files, TypeScript, ESLint, and the focused
Playwright spec all pass **without a temporary config**, and after §16b is
resolved in writing.

Until then the candidate is **not review-ready**. The temporary-config
result is not acceptance evidence and must not be presented as such.

### 16h. Next GPT-5.5 correction instruction (bind)

> **Implementation engineer role only. Read PATCH-120 §16 first —
> authoritative; it amends §4. Do not issue governance rulings, edit
> `.fable5`, or touch PATCH-118 or PATCH-119. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). The five protected paths must remain dirty,
> unstaged and unmodified. **No worktree. `.env.local` untouched.**
>
> **Step 0 — answer §16b in writing before anything else.** The repository
> has no `jsdom`, no `happy-dom` and no `@testing-library/react`. State how
> the 8 tests passed: either they do not actually click, or a dependency was
> added. Show the temporary config. **If a dependency was added, remove it
> and stop — that is a hard stop requiring a fresh ruling.**
>
> **Step 1** — move the metadata and static-guard assertions to
> `components/collabboard/ClipartCardDraftModal.test.tsx`, written for
> `environment: 'node'` using `renderToStaticMarkup` and direct handler
> invocation. **No DOM APIs. No new dependency. No per-file environment
> docblock. Do not modify `vitest.config.ts`.** Cover §16e items 1–8.
>
> **Step 2** — move the interaction assertions to
> `e2e/characterization/clipart-draft-reactions-comments.spec.ts`, covering
> §16e items 9–15, under all standing PATCH-117 live rules.
>
> **Step 3** — **delete**
> `components/collabboard/editors/ClipartCardDraftModal.test.tsx`. Delete
> the temporary Vitest config. No excluded test file may remain.
>
> **Step 4** — run every command in §16f and report actual output. The full
> Vitest run must report **56 files**; if it reports 55, the file is not
> discovered and the correction has failed.
>
> Report: the §16b answer; both final test paths; confirmation
> `vitest.config.ts` is byte-for-byte unchanged; confirmation no test
> dependency was added; the 55→56 file count; and the final safety-gate
> results. **Leave the candidate uncommitted and unstaged for independent
> review.**

### 16i. Status

**PATCH-120: AUTHORIZED · OPEN · IN CORRECTION · UNCOMMITTED · NOT
REVIEW-READY.** Production allowlist unchanged at
`ClipartCardDraftModal.tsx`. `vitest.config.ts` prohibited. No new test
dependency authorized.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-117: CLOSED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**

---

## 17. Amendment — comment badge and badge-colour control (2026-07-29, CTO)

### 17a. The requested behaviour cannot be built inside the modal alone

`CardActionsToolbar` — the toolbar `ClipartCardDraftModal` uses — has **no
comment-count prop, no badge-colour prop, and renders no badge**. Its
complete prop set is `padlet, onColorClick, onReplaceIcon, onToggleCardView,
onAddReaction, onComment, onDelete?, isColorPickerOpen?, isCardView?`
(`CardActionsToolbar.tsx:12-22`), and its `tools` array (`:34-65`) renders
five plain icon buttons with a text label and nothing else.

**Source inspection therefore proves the condition the request set for a
shared-component correction: the Clipart modal cannot consume the existing
public props, because the props do not exist.**

### 17b. Where the "working reference" actually lives — and a dead reference

The reference cited by the request resolves to two different things, and one
of them is unreachable code:

- **`ImageActionsToolbar`** does take `commentCount` and `commentBadgeColor`
  (`FreeformPadletCards.tsx:786-787`) — but that call site is inside a block
  gated `{false && imageToolbarPadletId === padlet.id && …}`
  (`FreeformPadletCards.tsx:779`). **It is dead code and cannot be the
  behaviour being observed.**
- **The badge the user is actually seeing is inline JSX in
  `FreeformPadletCards`**, not a shared component:
  `:663-704`, `:987-1014`, `:1927-1952`, `:3838-3865`.
- **The badge-colour control is likewise inline**, at `:1077-1105`: a swatch
  rendered from `metadata.badgeColor || '#facc15'` whose click handler calls
  `updatePadletMetadata(padlet.id, { badgeColor: color })` (`:1102`).

So there is **no shared badge component and no shared badge-colour palette
to reuse.** Requirements 4 and 5 of the amendment cannot be met by "reusing
the existing shared control", because none exists.

### 17c. Source answers to the seven required questions

1. **Badge renderer** — inline JSX in `FreeformPadletCards`, not a
   component. `ImageActionsToolbar` has the props but is dead-coded.
2. **Prop into the toolbar** — **none** on `CardActionsToolbar`.
   `ImageActionsToolbar` uses `commentCount` and `commentBadgeColor`.
3. **Colour metadata field** — **`metadata.badgeColor`**, default
   `'#facc15'`. Confirmed at `FreeformPadletCards.tsx:665`, `:787`, `:989`,
   `:1077`, `:1102`, `:1929`, `:2289` and `CanvasModals.tsx:145`, `:174`,
   `:210`, `:343`.
4. **Palette opener** — inline swatch list at
   `FreeformPadletCards.tsx:1077-1105`; the separate `commentColorPopupId`
   state is **per-comment text/highlight colour** (`:1054-1055`, `:1244`)
   and is **not** the badge colour. These two must not be conflated.
5. **Persistence (saved card)** — `updatePadletMetadata(padlet.id, {
   badgeColor })` at `:1102`.
6. **Count derivation** — inconsistent; see 7.
7. **Which fields are counted — the working paths DISAGREE:**
   - `:663` — `detachedComments.length + comments.length` (**sum**)
   - `:987`, `:1927` — `detachedComments.length` only
   - `:3838` — `(detachedComments || comments).length` (**fallback**)

   There is no single "as the working saved-card path specifies". **This is
   a pre-existing inconsistency**, recorded here and assigned to a successor
   patch; PATCH-120 does not fix it.

**Ruling on the formula:** use **`(metadata.detachedComments || metadata.comments || []).length`** — the `:3838` fallback form. The `:663`
sum is **excluded by the amendment's own acceptance criterion** ("no double
count when both exist"), which the sum would violate. This preserves the
dual-field rule: write only `detachedComments`, never copy or migrate,
never double-count.

### 17d. Scope amendment — AUTHORIZED, narrowly

**Production allowlist becomes 2 of a maximum 2:**

```
components/collabboard/editors/ClipartCardDraftModal.tsx
components/collabboard/editors/CardActionsToolbar.tsx      (NEWLY AUTHORIZED)
```

`CardActionsToolbar` is authorized for an **additive, optional-prop change
only**:

1. Add **optional** props `commentCount?: number` and
   `commentBadgeColor?: string`, mirroring `ImageActionsToolbar`'s existing
   names so the two toolbars do not diverge.
2. Render a numeric badge on the **Comment** action **only when
   `commentCount` is greater than zero**, coloured by `commentBadgeColor`
   with the established `'#facc15'` default.
3. **Every existing call site must remain unchanged and visually
   identical.** Omitting both props must render exactly today's output. This
   is the acceptance test for the change being additive.

**Still prohibited, unchanged:** `CommentPopup`, `FreeformPadletCards`,
`CanvasClient`, `EmojiReactionPicker`, `CardPreview`, `CanvasModals`,
`NoteEditor`, `NoteEditorToolbar`, repositories, schema, RLS,
`vitest.config.ts`, and any new test dependency. **No third production file
is authorized.**

### 17e. Badge-colour control in the draft

Since no shared palette exists (§17b), the control is rendered **inside
`ClipartCardDraftModal`**, in the Comments panel header region, matching the
inline pattern at `FreeformPadletCards.tsx:1077-1105`.

Binding constraints:

- **Field is `metadata.badgeColor`. No new colour metadata field may be
  invented.** Default `'#facc15'`.
- **Persistence goes through the existing `updateMetadata` helper
  (`ClipartCardDraftModal.tsx:43-51`) and `onChange`.** It must **not** call
  `updatePadletMetadata` — that is the saved-card path and would be the
  separate persistence route prohibited by §8.11.
- Closing the palette must not close the Comments panel or the draft, and
  must never reach the backdrop `onClose` at `:55-60`, which **saves** the
  card.
- Do **not** reuse or extend the per-comment `commentColorPopupId`
  text/highlight mechanism; it is a different feature (§17c.4).

### 17f. Amended acceptance criteria

All ten items of the amendment request are adopted, with these bindings
applied: the count formula is the `:3838` fallback form (§17c); the colour
field is `metadata.badgeColor` (§17e); the badge lives on
`CardActionsToolbar` behind optional props (§17d); and draft persistence
stays on `onChange` (§17e).

Added, and required: **omitting the two new props from `CardActionsToolbar`
must produce byte-identical rendering to today**, proven by test.

### 17g. Amended tests

Extend the §16d suites. **Vitest** (`components/collabboard/ClipartCardDraftModal.test.tsx`,
`environment: 'node'`, `renderToStaticMarkup` + direct handler invocation):
initial count; count after posting; **no double count when both
`metadata.comments` and `metadata.detachedComments` exist**; selecting a
colour writes `metadata.badgeColor` through `onChange`; the field matches
the saved-card field exactly; `metadata.comments` still untouched; and a
`CardActionsToolbar` test proving that **omitting the new props renders
exactly as before**.

**Playwright** (`e2e/characterization/clipart-draft-reactions-comments.spec.ts`):
badge visible with the right number; badge updates immediately after
posting; colour control visible in the Comments panel header; **palette
opens after a real click**; selecting a colour updates the badge colour
immediately; the Comments panel and the draft both remain open after palette
interaction.

**Presence-only checks remain insufficient.** Controls must be clicked and
state changes asserted.

### 17h. Recorded for a successor patch — not fixed here

1. **`CardActionsToolbar` silently drops `onDelete`.** It is declared in the
   props interface (`:19`) but **not destructured** (`:24-33`), and no
   Delete tool exists in the `tools` array (`:34-65`).
   `ClipartCardDraftModal.tsx:78` passes `onDelete={onDiscard}` — **a third
   dead callback in the very modal under patch**. Out of scope; must not be
   fixed opportunistically.
2. The dead `ImageActionsToolbar` call site at
   `FreeformPadletCards.tsx:779`.
3. The three-way comment-count inconsistency (§17c.7).

### 17i. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-120 §§16–17 first —
> authoritative; §17 amends the production allowlist to two files. Do not
> issue governance rulings, edit `.fable5`, or touch PATCH-118/119. Do not
> commit.**
>
> Safety gate before and after as in §16h; the five protected paths stay
> dirty, unstaged, unmodified. **No worktree. `.env.local` untouched.**
> Complete §16h Step 0 first if it is still unanswered.
>
> 1. `CardActionsToolbar.tsx`: add **optional** `commentCount?` and
>    `commentBadgeColor?`; render a numeric badge on the Comment action only
>    when the count exceeds zero, defaulting the colour to `'#facc15'`.
>    **Change nothing else** — no layout change, no reordering, no other
>    prop. Prove existing call sites render identically when the props are
>    omitted.
> 2. `ClipartCardDraftModal.tsx`: pass the count as
>    `(metadata.detachedComments || metadata.comments || []).length` and the
>    colour as `metadata.badgeColor || '#facc15'`. Add the badge-colour
>    swatch in the Comments panel header, writing `metadata.badgeColor`
>    **through the existing `updateMetadata` helper at `:43-51`**. Never call
>    `updatePadletMetadata`. Never write `metadata.comments`. Do not invent a
>    colour field. Do not reuse `commentColorPopupId`.
> 3. Extend both test suites per §17g, clicking controls and asserting state.
> 4. Run every §16f command and report actual output; full Vitest must
>    report **56 files**.
>
> Any prohibited file beyond these two, or any need for a third production
> file, is a **hard stop** — return for a ruling.
>
> Report the diff scope, both test paths, confirmation `vitest.config.ts` is
> unchanged and no test dependency was added, the 55→56 count, and the final
> safety-gate results. **Leave the candidate uncommitted and unstaged.**

### 17j. Status

**PATCH-120: AUTHORIZED · OPEN · IN CORRECTION · UNCOMMITTED · NOT
REVIEW-READY. NOT APPROVED, NOT CLOSED** — the two missing behaviours must
land first.
Production allowlist **2 of 2**. `vitest.config.ts` prohibited; no new test
dependency.
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-117: CLOSED. PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT
CLOSED.**
