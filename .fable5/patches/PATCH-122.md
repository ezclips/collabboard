# PATCH-122 - Align Clipart draft comments panel and card badge

**Status:** AUTHORIZED - OPEN - NOT STARTED - UNCOMMITTED
**Authored:** 2026-07-29 (CTO)
**Base commit:** `d2dbb80102048db0bb36139c716f14b2c2e6741a`
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews.
The authoring CTO neither implements nor reviews this candidate.

---

## 0. Repository state at authoring

- **PATCH-121: CLOSED**, independent review PASS.
- **PATCH-120: CLOSED.**
- **PATCH-117: CLOSED.**
- **PATCH-116: CANCELLED and retired.**
- **PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
- **PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
- **PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
- Five unrelated pending paths remain dirty and are **protected**:
  `.gitignore`, the three `app/api/ai/*` routes, and
  `scripts/live-access-login.mjs`.

PATCH-122 is independent of PATCH-118 and PATCH-119. Do not begin either.

---

## 1. Subject

Two visual consistency defects remain in the Library clipart draft modal after
PATCH-120 and PATCH-121:

1. The left toolbar shows the Comment count badge, but the main **Clipart Card**
   panel has no matching top-right comment-count badge. Working saved
   Image/Card/Table surfaces in `FreeformPadletCards.tsx` render this badge on
   the card surface itself.
2. The toolbar, main Clipart Card panel and Comments panel start at different
   vertical coordinates. The visible defect to fix is that the main Clipart
   Card panel and the Comments panel do not share a common top edge.

---

## 2. Source findings

### 2a. Clipart draft current state

`components/collabboard/editors/ClipartCardDraftModal.tsx` already derives:

```
commentCount
commentBadgeColor
```

and passes both to `CardActionsToolbar`. Those values are the correct shared
local values for PATCH-122. They must be reused for the new main-panel badge;
do not independently recalculate the count for that badge.

The modal layout currently has three separate vertical starts:

```
toolbar wrapper:       <div className="pt-6">
main panel wrapper:    <div className="relative w-[320px] ...">
Comments wrapper:      <div className="relative pt-6 min-w-[320px]">
```

That means the main panel starts 24px above the toolbar and Comments panel.
This is the source-proven alignment defect.

### 2b. Working reference

The working saved-card/Image/Table badge pattern in `FreeformPadletCards.tsx`
places the count badge on a relative card surface:

```
absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full
border-2 border-white shadow-md flex items-center justify-center
text-xs font-bold text-gray-800
```

with background `metadata.badgeColor || '#facc15'` and only when the count is
greater than zero.

The working comment-panel relationship uses a common positioned card/comment
surface with the popup anchored at `top-0` or a flex row with `items-start`.
It does not require unrelated per-panel magic offsets.

### 2c. Existing tests

The runner-included Vitest suite is:

```
components/collabboard/ClipartCardDraftModal.test.tsx
```

It already uses the repository's node Vitest environment with
`renderToStaticMarkup` and direct handler invocation. No DOM dependency is
available or authorized.

The live characterization suite is:

```
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

It already covers normal clicks, immediate draft metadata updates, PATCH-121
palette geometry and persistence.

---

## 3. Production allowlist - maximum 1 file

Authorized production file:

```
components/collabboard/editors/ClipartCardDraftModal.tsx
```

No second production file is authorized.

**Prohibited - must remain byte-for-byte unchanged:**

```
components/collabboard/editors/CardActionsToolbar.tsx
components/collabboard/editors/CommentPopup.tsx
components/collabboard/editors/EmojiReactionPicker.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
app/dashboard/canvas/[id]/CanvasClient.tsx
```

Also prohibited: repositories, schema, RLS, `vitest.config.ts`, test
dependencies, and any shared toolbar behavior.

If source inspection appears to require changing any prohibited file, stop and
return for a ruling. Do not widen scope locally.

---

## 4. Test allowlist - maximum 2 files

Authorized test files:

```
components/collabboard/ClipartCardDraftModal.test.tsx
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

No test may be weakened, skipped or deleted. No new test file is authorized.
No DOM Vitest environment, per-file environment docblock, temporary Vitest
config, or new test dependency is authorized.

---

## 5. Required implementation

### 5a. Shared local values

Use the already-derived values:

```
commentCount
commentBadgeColor
```

for both:

```
CardActionsToolbar
main-panel top-right badge
```

Do not duplicate or independently recalculate the count for the main-panel
badge. Do not write any metadata from the badge.

### 5b. Main-panel badge

Add a top-right numeric badge to the main Clipart Card panel:

- Render only when `commentCount > 0`.
- Display the exact same count supplied to the toolbar.
- Use `commentBadgeColor`, whose semantics are
  `metadata.badgeColor || '#facc15'`.
- Update immediately when a comment is added.
- Update immediately when badge colour changes.
- Do not write a new metadata field.
- Do not change the PATCH-120 comment-count formula or metadata write contract.
- Do not change `metadata.badgeColor` semantics.

Preferred markup should mirror the saved card/Image/Table surface badge enough
for visual consistency:

```
absolute -top-2 -right-2 ... w-6 h-6 rounded-full ...
style={{ backgroundColor: commentBadgeColor }}
```

Add a stable test hook for the main-panel badge, for example:

```
data-testid="clipart-main-comment-badge"
```

Add a stable test hook for the main panel if needed for geometry assertions,
for example:

```
data-testid="clipart-main-panel"
```

### 5c. Top alignment

Align the top edge of the main Clipart Card panel and the Comments panel to
the same horizontal line.

Binding:

- Use one shared layout/top-alignment rule.
- Prefer moving the main Clipart panel upward/downward by changing the common
  flex-row alignment/wrapper structure, not by inventing unrelated offsets.
- The toolbar may remain offset to the left, but its relationship to the main
  panel must be intentional and stable.
- Opening Reaction, Comment or badge-colour palette must not shift the main
  panel.
- Closing and reopening Comments must preserve alignment.
- Do not redesign modal dimensions.

The source-proven low-risk path is to remove the independent `pt-6` offset
from the Comments wrapper and make the main panel and Comments panel direct
`items-start` siblings at the same row top. If viewport evidence shows that
clips or regresses the modal, use an equivalent shared wrapper rule instead
and record the evidence.

### 5d. Unchanged behavior

Must remain unchanged:

- colour set and order
- PATCH-121 palette width, fixed tracks, gap, padding and swatch sizing
- palette position relative to the badge-colour swatch, unless changed only
  as a consequence of the shared Comments-panel top alignment
- propagation guards
- `metadata.badgeColor` semantics
- `metadata.detachedComments` write path
- `metadata.comments` non-write rule
- reaction behavior
- save/discard flow

---

## 6. Required tests

### 6a. Vitest

Extend `components/collabboard/ClipartCardDraftModal.test.tsx` using the
existing node-compatible style (`renderToStaticMarkup`, direct handler
invocation, source/static assertions). Cover:

1. Main-panel badge is absent when `commentCount` is zero.
2. Main-panel badge shows the correct count.
3. Main-panel badge uses `metadata.badgeColor`.
4. Adding a comment updates the shared count value used by both toolbar and
   main-panel badge. This may be proven by invoking `CommentPopup.onSubmit`,
   rendering with the returned metadata, and asserting both surfaces.
5. Changing badge colour updates both toolbar and main-panel badge. This may
   be proven by invoking a palette swatch, rendering with the returned
   metadata, and asserting both surfaces.
6. Main-panel badge markup is inside the main panel subtree, not in the toolbar
   subtree.
7. The source uses the shared `commentCount` / `commentBadgeColor` values for
   the main-panel badge rather than a second local count calculation.
8. The source does not introduce a new metadata field and still does not write
   `metadata.comments`.

### 6b. Playwright

Extend `e2e/characterization/clipart-draft-reactions-comments.spec.ts` with
real geometry assertions and normal clicks only. No `force: true`; no
compensating coordinate offsets.

Required live assertions:

1. Main-panel badge absent when count is zero.
2. Main-panel badge shows the correct count after adding a comment.
3. Main-panel badge uses `metadata.badgeColor`.
4. Adding a comment updates both toolbar and main-panel badges.
5. Changing badge colour updates both badges.
6. Main-panel badge is inside the top-right bounds of the card panel.
7. Main Clipart panel and Comments panel top coordinates differ by no more
   than `1px`.
8. Opening the badge-colour palette does not change that alignment.
9. Closing/reopening Comments preserves alignment.
10. Screenshot evidence of the aligned layout, for example
    `patch-122-aligned-clipart-comments.png`.

Add stable selectors in the production file as needed for reliable geometry:

```
data-testid="clipart-main-panel"
data-testid="clipart-main-comment-badge"
```

If a stable selector is needed for the Comments panel wrapper, add it in
`ClipartCardDraftModal.tsx` only, for example:

```
data-testid="clipart-comments-panel"
```

---

## 7. Characterization order

Before implementation:

1. Run or add failing-by-construction assertions showing that the main panel
   currently has no badge when toolbar count is positive.
2. Record current top-coordinate mismatch in Playwright before fixing, if the
   live harness is executable.

After implementation:

3. Run the focused Vitest suite.
4. Run the focused Playwright characterization when credentials/environment
   are available.
5. Run `git diff --check`.
6. Run `npx tsc --noEmit`.
7. Run full Vitest.
8. Run ESLint.

If E2E credentials are unavailable, report the skip exactly; do not replace
the live geometry assertions with weaker unit-only coverage.

---

## 8. Acceptance criteria

PATCH-122 is acceptable only when:

- The main Clipart Card panel renders a top-right numeric badge exactly when
  `commentCount > 0`.
- Toolbar badge and main-panel badge display the same count and colour.
- Badge colour changes update both badges immediately.
- Adding a comment updates both badges immediately.
- Main-panel badge sits inside the main panel top-right geometry.
- Main panel and Comments panel top edges differ by no more than `1px` at the
  tested viewport.
- Opening Reaction, Comment and badge-colour palette does not shift the main
  panel.
- Closing/reopening Comments preserves top alignment.
- No new metadata field is written.
- `metadata.comments` remains unwritten by this modal.
- No prohibited file changes.
- PATCH-118 and PATCH-119 remain untouched.

---

## 9. Bound implementation commit message

Use verbatim, and only after independent review passes:

```
fix(canvas): align clipart comments panel and card badge (PATCH-122)
```

Do not append extra text.

---

## 10. Hard stops

Stop and return for a ruling if any of these occur:

1. A production file other than `ClipartCardDraftModal.tsx` appears necessary.
2. `CardActionsToolbar`, `CommentPopup`, `FreeformPadletCards`, `CanvasClient`,
   repositories, schema or RLS appears to require modification.
3. A test file outside the two-file test allowlist appears necessary.
4. Any test must be weakened, skipped or deleted.
5. The fix requires changing comment-count semantics from PATCH-120.
6. The fix requires changing PATCH-121 palette geometry.
7. Any protected pending path becomes staged or modified.
8. PATCH-118 or PATCH-119 work appears in the diff.

---

## 11. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-122 in full first - it is
> authoritative. Do not issue governance rulings, edit `.fable5`, or touch
> PATCH-118/PATCH-119. Do not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). The five protected paths - `.gitignore`, the three
> `app/api/ai/*` routes, `scripts/live-access-login.mjs` - must remain dirty,
> unstaged and unmodified. `.env.local` untouched.
>
> Implement only in
> `components/collabboard/editors/ClipartCardDraftModal.tsx`. Reuse the existing
> `commentCount` and `commentBadgeColor` local values for both the toolbar and
> the new main-panel badge. Render the main-panel badge only when count is
> positive. Align the main panel and Comments panel top edges with one shared
> layout rule. Do not change shared toolbar behavior, `CommentPopup`,
> `FreeformPadletCards`, `CanvasClient`, persistence, schema or metadata
> semantics.
>
> Extend only:
>
> ```
> components/collabboard/ClipartCardDraftModal.test.tsx
> e2e/characterization/clipart-draft-reactions-comments.spec.ts
> ```
>
> Add real geometry assertions and screenshot evidence in Playwright. Use normal
> clicks only; no `force: true` or coordinate compensation.
>
> Run the validation matrix from section 7 and report actual output. Leave the
> candidate uncommitted and unstaged for independent review.

---

## 12. Status

**PATCH-122: AUTHORIZED - OPEN - NOT STARTED - UNCOMMITTED.**
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED.**
**PATCH-116: CANCELLED and retired.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 13. Amendment — the compact Freeform visual contract (2026-07-29, CTO)

Issued at base `d2dbb80102048db0bb36139c716f14b2c2e6741a`. **PATCH-122 is NOT
approved and NOT closed.** The candidate satisfied §1's alignment defect but
implemented the badge against the wrong visual contract: it retained the large
rounded shell and placed the counter deep inside it.

### 13a. Scope stays local — no scope amendment is required

`ClipartCardDraftModal.tsx` owns its **entire** shell, with no parent
involvement:

- `:125` its own `fixed inset-0 z-[160]` backdrop layer
- `:133` its own row container, currently
  `relative flex min-h-[520px] max-w-5xl items-start gap-4`
- `:162-163` its own panel,
  `relative w-[320px] rounded-[28px] bg-white p-5 shadow-2xl`

Nothing about this geometry comes from a parent. **The §10 stop-condition
("if the compact layout is controlled by a parent") does not trigger.** The
production allowlist stays at one file; `CardActionsToolbar`, `CommentPopup`,
`FreeformPadletCards` and `CanvasClient` remain prohibited.

### 13b. The reference is TWO different places — do not conflate them

This matters, because looking for both in one place will waste a cycle.

**(1) Compact editor geometry — `FreeformPadletCards.tsx:5960-6056`,
the "Card Post Modal":**

```jsx
<div className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm" onClick={close}>
  <div className="relative flex max-h-[calc(100vh-80px)] max-w-[calc(100vw-80px)] items-start gap-6"
       onClick={stopPropagation}>
    <button className="absolute right-3 top-3 ... rounded-full" title="Close">…</button>
    {/* Left: CardActionsToolbar */}
    <CardActionsToolbar … />
    {/* Middle: CardPreview */}
    <div className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
         style={{ width: '220px', minHeight: '200px', backgroundColor }}>
      <CardPreview padlet={…} isSelected={false} />
    </div>
    {/* panels follow as siblings */}
  </div>
</div>
```

Note what the reference card wrapper is **not**: no `rounded-*`, no `p-5`, no
`bg-white` utility, no `w-[320px]`. It is a **220 × ≥200 square-cornered
bordered card**, and the toolbar is a **flex sibling** at `gap-6`.

**(2) Corner badge — `FreeformPadletCards.tsx:985-1016`, the canvas card
badge:**

```jsx
className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white
           shadow-md flex items-center justify-center text-xs font-bold text-gray-800
           hover:brightness-110 transition-all pointer-events-auto"
style={{ backgroundColor: badgeColor }}
```

**There is no corner badge on the reference *editor* preview.** The badge
exists on the **canvas** card. So this pattern is being **ported** to the draft
editor, not copied from a like-for-like precedent. The implementer must not
spend time hunting for one on the Card Post Modal — it is not there.

### 13c. Two source traps that will otherwise break requirement 6

**Trap 1 — `overflow-hidden` clips the badge.** The reference card wrapper
carries `overflow-hidden` (`:6046`). It works there because that wrapper holds
no badge. **If the badge is placed inside a wrapper carrying
`overflow-hidden`, the portion that must sit outside the card will be clipped**
— silently satisfying "badge present" while failing "partially outside".

**Binding:** the badge must be positioned against a **non-clipping `relative`
container**. Either place the badge as a sibling of the `overflow-hidden` card
wrapper inside a `relative` box sized to the card, or drop `overflow-hidden`
from that wrapper — but only if `CardPreview` does not rely on it to clip its
own top strip. **Prove which, from source, before choosing.**

**Trap 2 — the caption has nowhere to go.** The reference compact editor has
**no caption input**; the draft modal's caption lives inside the rounded shell
being removed (`:190-200` region). Requirement 2 (remove the shell) and
requirement 11 (caption keeps working) therefore conflict unless the caption is
relocated.

**Ruling:** the caption input is **retained and relocated below the card
wrapper**, outside it, as a sibling in the same column — no rounded shell, no
`p-5`, no reinstated panel. **It may not be deleted**, and it must not be used
as a reason to keep the shell.

### 13d. Required geometry — exact, so tests can assert numbers

- Card wrapper: `width: 220px`, `minHeight: 200px`, square corners,
  `border border-gray-200 shadow-2xl`, background from
  `metadata.backgroundColor` defaulting to `#ffffff`.
- Row container: `relative flex items-start gap-6`, toolbar as the first
  flex child, card second.
- **`min-h-[520px]` is REMOVED** (`:133`). It exists only to stabilise the
  rounded shell that is being deleted, and would leave dead empty height in
  the compact layout. `max-w-5xl` should follow it out unless source shows it
  still constrains something real. The reference's
  `max-h-[calc(100vh-80px)] max-w-[calc(100vw-80px)]` is the pattern to
  adopt if a bound is still wanted.
- **`rounded-[28px] bg-white p-5 w-[320px]` are REMOVED** from the main panel
  (`:163`).
- Badge: 24 × 24 (`w-6 h-6`) at `-top-2 -right-2` (−8px each), so relative to
  the card box its **right edge sits 8px outside**, its **left edge 16px
  inside**, its **top edge 8px outside**, its **bottom edge 16px inside**;
  centre lands 4px inside the corner on both axes. `border-2 border-white`
  and `rounded-full` are part of the contract — the white ring is what makes
  it read as overlapping.
- Badge renders **only when `commentCount > 0`**, using the existing
  `commentCount` and `commentBadgeColor` locals. **Do not recompute the
  count**, and do not introduce a second colour source.

### 13e. Preserved behaviour — unchanged from §5

`metadata.badgeColor` and `metadata.detachedComments` semantics; the dual-field
rule (write `detachedComments` only, never `metadata.comments`, never sum);
`updateMetadata`/`onChange` persistence with no repository call; propagation
guards so panels do not close the draft; PATCH-121's palette geometry; the
reaction row; saved cards and non-Freeform layouts untouched.

### 13f. Amended tests — all 14 adopted, with two additions

Items 1–14 of the request are adopted as written. Two additions, because the
listed set can pass while the defect survives:

**15. The badge must not be clipped.** Assert its rendered bounding box
extends **beyond** the card wrapper's box by ≈8px on both the top and right
axes. Requirement 6 ("partially outside") is otherwise satisfiable by an
element that is positioned outside but painted clipped — trap 1.

**16. Assert the removals explicitly.** `min-h-[520px]`, `rounded-[28px]`,
`w-[320px]` and `p-5` must be absent from the main panel path, asserted
directly rather than inferred from a screenshot. A screenshot cannot fail a
build.

Vitest carries the structural assertions (absence of the shell, presence of the
compact wrapper, badge attached to the card preview rather than the outer
shell, conditional rendering, count/colour wiring). Playwright carries the
geometry (bounding boxes, corner overlap, non-clipping, viewport containment,
toolbar adjacency, Comments-panel top alignment, no card movement when panels
open, caption editing, screenshot evidence).

**An induced-failure proof is required**: restoring the rounded shell must fail
the new tests.

### 13g. Status

**PATCH-122: OPEN · AUTHORIZED · AMENDED · NOT APPROVED · NOT CLOSED.**
Production allowlist unchanged at
`components/collabboard/editors/ClipartCardDraftModal.tsx`; test allowlist
unchanged at `components/collabboard/ClipartCardDraftModal.test.tsx` and
`e2e/characterization/clipart-draft-reactions-comments.spec.ts`.
The §9 bound commit message stands and is used **only** after the compact
contract is implemented and independently reviewed.
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

### 13h. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-122 §13 first — it amends
> §5 and §6. Do not edit `.fable5`, do not begin PATCH-118 or PATCH-119, do
> not commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). The five protected paths stay dirty, unstaged,
> unmodified. `.env.local` untouched. No worktree.
>
> **Exactly one production file may change:**
> `components/collabboard/editors/ClipartCardDraftModal.tsx`.
>
> 1. Replace the rounded shell with the §13b(1) compact layout: remove
>    `min-h-[520px]`, `rounded-[28px]`, `bg-white`, `p-5`, `w-[320px]`; adopt
>    a 220 × ≥200 square-cornered `border border-gray-200 shadow-2xl` card
>    wrapper with the toolbar as a flex sibling at `gap-6`.
> 2. Relocate the caption input **below** the card wrapper (§13c trap 2). Do
>    not delete it.
> 3. Port the §13b(2) badge onto the card preview's top-right corner, using
>    the existing `commentCount` and `commentBadgeColor`, rendering only when
>    the count exceeds zero.
> 4. **Resolve trap 1 first and state your finding**: report from source
>    whether `CardPreview` needs `overflow-hidden` on its wrapper. Then either
>    position the badge against a non-clipping `relative` sibling container or
>    drop `overflow-hidden`. Do not guess.
> 5. Keep the Comments panel top-aligned with the compact card, and ensure
>    opening Reaction, Comment or the badge palette does not move the card.
>
> Add tests 1–16 of §13f, including the induced-failure proof. Run
> `git diff --check`, `npx tsc --noEmit`, focused Vitest, full Vitest,
> ESLint, and the focused Playwright characterization; report actual output
> for each.
>
> If any prohibited file appears necessary, **stop and return** for a scope
> ruling. Leave the candidate uncommitted and unstaged for independent
> review.

---

## 14. Second amendment — group centring and badge actionability (2026-07-29, CTO)

**PATCH-122 remains NOT approved and NOT closed.** §13's compact contract is
substantially met; two governed behaviours are still wrong.

### 14a. Defect 2 source check — ANSWERED. No toolbar change is authorized

The toolbar badge **is nested inside the Comment button's hit area.**
`CardActionsToolbar.tsx`:

- `:96-102` the tool `<button>` carries
  `onClick={(e) => { e.stopPropagation(); tool.onClick(e); }}`
- `:105-112` the badge `<span>` is a **DOM child of that button**
- the button's className is `relative w-10 h-10 flex …` with **no
  `overflow-hidden`**, so the `-top-1 -right-1` overhang is painted and
  hit-testable, and a click on it bubbles to the button

So a click anywhere on the toolbar badge already reaches `onComment()`, and
the button already stops propagation so the backdrop cannot fire.

**Ruling: `CardActionsToolbar` is NOT to be modified. No scope amendment is
required or granted for it.** It remains prohibited.

**But structure is not proof of hit-testing.** PATCH-117 §26 established that
in this codebase — an element that is a DOM descendant still failed to
receive the interaction for retargeting reasons that took six sections to
pin down. **A real click test is mandatory**, and it is the only acceptable
evidence that this entry point works. If a real click does **not** reach
`onComment`, that is a hard stop: return for a ruling, do not edit the
toolbar.

### 14b. The card-corner badge is inert — that is the real defect-2 work

`ClipartCardDraftModal.tsx:184-185` renders the corner badge with
`data-testid="clipart-main-comment-badge"` and **no `onClick` at all.** It is
decoration.

**Required:** make it a real `<button type="button">` wired to the **same
`openCommentPanel`** already used by the toolbar's `onComment`
(`:118-122`), calling `e.stopPropagation()` so the backdrop `onClose` at
`:126-131` — which **saves and closes the draft** — cannot fire.

**No new comments-panel state.** `isCommentPanelOpen` is the single source of
truth; a second flag is a defect, not an implementation detail.
**No metadata write from a badge click.** Opening a panel must not change
`detachedComments`, `comments`, `reactions` or `badgeColor`.

**Open, never toggle.** `openCommentPanel` (`:118-122`) sets
`setIsCommentPanelOpen(true)` unconditionally — it is **not** toggle-based.
Under the request's own rule, all three entry points therefore **open** the
panel and leave it open when it is already open. Do not introduce toggling.

### 14c. Defect 1 root cause — `items-start` at `:125`

```
:125  <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-auto p-4">
```

`justify-center` still centres horizontally, which is why only the **vertical**
axis is wrong. `items-start` pins the composition to the top of the viewport —
that is the whole of "the compact card begins too high". The pre-PATCH-122
root was `flex items-center justify-center p-4`; the candidate replaced
`items-center` with `items-start` and added `overflow-auto`.

**Do not simply restore `items-center` — that reintroduces a known trap.**

**Trap: `align-items: center` on a scroll container makes overflow
unreachable.** When the composition is taller than the viewport (Comments
open on a short window), centring overflows it equally in both directions and
the **top becomes unscrollable** — the content is clipped with no way to
reach it, violating requirement 6.

**Binding fix:** centre with **auto margins on the flex child** (`m-auto` on
the composition row) rather than `align-items: center` on the scrolling
parent. Auto margins centre when there is spare space and collapse to normal
flow when there is not, so overflow stays scrollable in both directions.
Keep `overflow-auto` and `justify-center` on the root.

### 14d. Residual `pt-6` — remove it; alignment comes from the row

Four `pt-6` residues survive from the deleted rounded-shell geometry:
`:134` (toolbar wrapper), `:224` (colour panel), `:240` (reaction panel), and
the comments-panel wrapper region near `:258`.

These are per-child compensation for a layout that no longer exists. They
push the toolbar 24px below the card top and make requirement 3 (tops within
1px) and requirement 5 (no jump on open/close) fragile by construction.

**Binding:** top alignment comes from `items-start` on the **composition row**
(`:133`), which the reference already uses
(`FreeformPadletCards.tsx:5973`). Remove each `pt-6` unless a specific one is
proven necessary from source — and state which, if any, survives and why.

### 14e. Centring must be pure layout — no measurement

Requirement 2 (centring accounts for the open right-side panel) is satisfied
**automatically** by putting the toolbar, card and optional panel in **one
centred flex row**: the row's height and width include whichever panel is
mounted, so the browser recentres on every open and close.

**Explicitly prohibited:** any hardcoded `top`, any value derived from a
screenshot, any JS measurement of panel size feeding a style, any
`useEffect`-driven repositioning. One centred container, no arithmetic.
This satisfies requirements 7 and 8 together.

### 14f. Amended tests

**Layout — all 12 adopted as written**, plus:

**13.** With Comments open **and a short viewport** (force a viewport small
enough that the composition exceeds it), the top of the composition must
remain **reachable** — not clipped above the scroll origin. This is the
direct test for the 14c trap; requirements 6 and 11 are otherwise satisfiable
by a layout that clips unreachably.

**14.** No residual `pt-6` on any composition child (§14d), asserted in
source, and toolbar/card/Comments top edges all within 1px of one another.

**Interaction — all 8 adopted as written**, plus:

**9.** The toolbar-badge click must be proven to reach `onComment` by a
**real click on the badge's own overhanging area** (not the button centre),
since that overhang is the part whose hit-testing §14a reasons about but does
not prove.

**10.** A badge click must leave `metadata` byte-identical — assert no
`onChange` fires (§14b).

Screenshot evidence required for all three states named in layout item 12.

### 14g. Scope — unchanged

**Production, one file:**
`components/collabboard/editors/ClipartCardDraftModal.tsx`.
**Tests:** `components/collabboard/ClipartCardDraftModal.test.tsx`,
`e2e/characterization/clipart-draft-reactions-comments.spec.ts`.
**Prohibited, unchanged:** `CardActionsToolbar` (§14a), `CommentPopup`,
`FreeformPadletCards`, `CanvasClient`, repositories, schema, RLS,
`vitest.config.ts`. §13's rulings — compact geometry, badge overlap and
non-clipping, relocated caption, removed `min-h-[520px]` — all stand.

### 14h. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-122 §§13–14 first — §14
> amends §13. Do not edit `.fable5`, begin PATCH-118/119, or commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). Five protected paths stay dirty and unmodified.
> `.env.local` untouched. No worktree. **`CardActionsToolbar.tsx` must be
> byte-for-byte unchanged — verify its hash before and after.**
>
> **Exactly one production file may change:** `ClipartCardDraftModal.tsx`.
>
> 1. Centre the whole composition with **`m-auto` on the row** (`:133`), not
>    `items-center` on the root (`:125`) — see §14c. Keep `overflow-auto` and
>    `justify-center`. No hardcoded top, no measurement, no effect-driven
>    repositioning.
> 2. Remove the `pt-6` residues at `:134`, `:224`, `:240` and the
>    comments-panel wrapper; rely on `items-start` on the row. State any that
>    must survive, with source reasoning.
> 3. Make the corner badge at `:184-185` a real `<button type="button">`
>    calling the existing `openCommentPanel` with `e.stopPropagation()`. No
>    new state, no metadata write, open-not-toggle.
> 4. Do **not** touch the toolbar badge — §14a proves it already reaches
>    `onComment`. Prove it with a real click on its **overhanging** area. If
>    that click does not reach `onComment`, **stop and return**.
>
> Add layout tests 1–14 and interaction tests 1–10 of §14f, with the
> short-viewport reachability test and the three screenshots. Include an
> induced-failure proof: restoring `items-start` on the root must fail the
> centring tests.
>
> Run `git diff --check`, `npx tsc --noEmit`, focused Vitest, full Vitest,
> ESLint and the focused Playwright characterization; report actual output
> for each, plus the `CardActionsToolbar.tsx` hash before and after. Leave
> the candidate uncommitted and unstaged for independent review.

### 14i. Status

**PATCH-122: OPEN · AUTHORIZED · AMENDED TWICE · NOT APPROVED · NOT CLOSED.**
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 15. Third amendment — inline caption, Image-post pattern (2026-07-29, CTO)

**PATCH-122 remains NOT approved and NOT closed.**

### 15a. Scope check — ANSWERED: the toolbar does NOT support Caption

`CardActionsToolbar.tsx:34-65` builds a **hardcoded five-entry `tools` array**:
Color, Icon, Card view, Reaction, Comment. There is no Caption action and no
prop that could produce one.

**Per the request's own instruction, the narrowest additive shared-toolbar
extension is AUTHORIZED.** The production allowlist becomes **2 of 2**:

```
components/collabboard/editors/ClipartCardDraftModal.tsx
components/collabboard/editors/CardActionsToolbar.tsx      (additive only)
```

`CardActionsToolbar` may gain **only**:

- `onCaption?: () => void`
- `isCaptionActive?: boolean`

The Caption tool is appended **only when `onCaption` is supplied**, so every
existing call site renders **byte-identically** when it is omitted — the same
additive discipline PATCH-120 §17d applied to `commentCount`. Position:
**immediately after `Icon`**. No other change to the component: no layout
change, no reordering of existing tools, no restyling.

**Faking Caption outside the toolbar is prohibited.** So is touching Image
post code, `FreeformPadletCards`, `CanvasClient`, `CommentPopup`,
repositories, schema, RLS or `vitest.config.ts`.

### 15b. Icon and label contract — from the Image post

`ImageActionsToolbar.tsx:145`:

```
{ id: 'caption', icon: TextCursor, label: 'Caption', onClick: …, active: isCaptionMode }
```

**Icon `TextCursor` (lucide-react); label `'Caption'`; `active` reflects
caption-editing state.** Reuse exactly that icon and label.

**Do NOT copy the Image toolbar's mode-switching.** `handleToggleMode`
(`:125-130`) swaps the entire toolbar between `image` and `caption` tool sets.
That is Image-specific chrome the Clipart draft does not have and must not
grow. Clipart's Caption action only toggles inline caption editing.

### 15c. Caption field — the request's premise is CORRECTED

The Image post stores its caption in **`metadata.caption`**, with
**`metadata.captionStyle`** for colour, highlight and typography
(`FreeformPadletCards.tsx:1470-1483`, `:846`, `:865`).

**The Clipart draft's caption is not that field.** `ClipartCardDraftModal.tsx:223`
binds the caption input to **`previewPadlet.title`**:

```
:218  <div data-testid="clipart-caption-editor" className="mt-3 w-[220px]">
:220    Caption
:223    value={previewPadlet.title || ''}
:226    placeholder="Optional caption"
```

and `CardPreview` renders `padlet.title` as the card's visible name — which is
why the screenshots show the same `arrow-solid` in both the card and the
caption box.

**Ruling: the field is `padlet.title`.** It is "the existing caption field
already consumed by `ClipartCardDraftModal` and the saved card path", and
requirement 12 forbids a second one.

**Switching to `metadata.caption` is PROHIBITED**, because it would:

1. create a parallel value alongside `title` — exactly the second caption
   field requirement 12 forbids;
2. leave `title` with **no editor at all** in the draft, since this input is
   its only one; and
3. make the saved card's displayed name diverge from what the user typed.

**`metadata.captionStyle` must not be introduced.** Caption colour,
highlight and typography are Image-post features and are out of scope. If
the shared component requires those props, pass `undefined`.

### 15d. §13c is SUPERSEDED

§13c ruled the caption "retained and relocated **below the card wrapper,
outside it**". **That is superseded by this section:** the caption now sits
**inside** the compact 220px card, directly below the preview, matching the
Image post. Where the two conflict, §15 governs.

### 15e. Component — reuse `InlineCaption`

`components/collabboard/editors/InlineCaption.tsx` is a complete shared
component and is **consumed as-is**:

```
value, placeholder = "Write a caption...", isEditing, onChange, onCommit,
color, backgroundColor, textStyle
```

Its default placeholder is already exactly the string requirement 6 demands.
It focuses on entering edit mode with the cursor at the end (`:27-39`),
auto-resizes (`:41-47`), renders `readOnly` when not editing so existing text
stays visible, and calls `onCommit` on blur — which satisfies requirement 10
without new keyboard handling.

**If `InlineCaption` needs a prop it does not expose, stop and return.** Do
not fork or copy it.

### 15f. Required implementation

1. **Delete** the separate caption block at `:218-227` — the `CAPTION` label,
   the rounded input, and the `"Optional caption"` placeholder.
2. Add a `captionEditing` boolean to the modal's local state. **No second
   caption state, no second field.**
3. Pass `onCaption` and `isCaptionActive` to `CardActionsToolbar`.
4. Render `InlineCaption` **inside** the 220px card wrapper, directly below
   `CardPreview`, with `value={previewPadlet.title || ''}`,
   `isEditing={captionEditing}`, `onChange` routing to the existing
   `onChange({ ...previewPadlet, title: next })` flow, and `onCommit`
   ending editing.
5. Opening Caption must close the other panels the way `openReactionPicker`
   and `openCommentPanel` already do, and must **not** move the composition
   (§14c centring is layout-only, so a correctly built caption inside the
   card cannot move it off-centre — prove it, do not assume it).
6. Preserve all unrelated metadata. No `captionStyle`. No repository call.

**Visual contract:** inside the 220px card, square-card language, no rounded
standalone input, no second white panel, no width increase.

### 15g. Amended tests

All 16 items adopted as written, with these bindings:

- Item 1/2 assert the **absence** of `data-testid="clipart-caption-editor"`,
  the `CAPTION` label and the `"Optional caption"` placeholder — asserted in
  source and DOM, not inferred from a screenshot.
- Item 4's "same icon/label contract" means **`TextCursor` + `'Caption'`**
  (§15b), asserted against the Image post's values rather than hardcoded
  twice.
- Item 7 asserts typing updates **`title`** and that **no new metadata key
  appears** — in particular neither `metadata.caption` nor
  `metadata.captionStyle`.

Two additions:

**17.** `CardActionsToolbar` rendered **without** `onCaption` produces
byte-identical markup to today — the additive-extension proof, exactly as
PATCH-120 required for `commentCount`.

**18.** The caption element sits **within the 220px card's bounding box**,
and the composition width is unchanged with the caption both empty and
filled. Requirement "not increase the composition width" is otherwise
untested.

**Induced-failure proof required:** restoring the separate caption block must
fail the new tests.

### 15h. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-122 §§13–15 first; §15
> supersedes §13c and extends the allowlist to two production files. Do not
> edit `.fable5`, begin PATCH-118/119, or commit.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). Five protected paths stay dirty and unmodified.
> `.env.local` untouched. No worktree.
>
> **Two production files may change:** `ClipartCardDraftModal.tsx`, and
> `CardActionsToolbar.tsx` **additively only** — optional `onCaption?` and
> `isCaptionActive?`, Caption tool appended immediately after `Icon` and
> rendered only when `onCaption` is supplied, icon `TextCursor`, label
> `'Caption'`. Prove existing call sites render byte-identically when the
> props are omitted.
>
> In the modal: delete the `:218-227` caption block; add `captionEditing`
> state; render `InlineCaption` **inside** the 220px card below
> `CardPreview`, bound to **`previewPadlet.title`** — **not**
> `metadata.caption`, and **do not** add `captionStyle` or any new field.
> Wire `onCaption` to toggle editing and close sibling panels the way the
> existing open* handlers do.
>
> Add tests 1–18 of §15g plus the induced-failure proof. Run
> `git diff --check`, `npx tsc --noEmit`, focused Vitest, full Vitest,
> ESLint and the focused Playwright characterization; report actual output
> for each. If `InlineCaption` needs a prop it lacks, or any other
> prohibited file appears necessary, **stop and return**. Leave the
> candidate uncommitted and unstaged for independent review.

### 15i. Status

**PATCH-122: OPEN · AUTHORIZED · AMENDED THREE TIMES · NOT APPROVED · NOT
CLOSED.** Production allowlist **2 of 2**. §§13–14 rulings stand except
§13c, superseded by §15d.
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 16. HARD STOP — caption style has no saved-card reader (2026-07-29, CTO)

**The §16 hard stop is TRIGGERED. Implementation of the caption style panel is
NOT authorized.** PATCH-122 remains NOT approved and NOT closed. A scope
ruling is required before any of this section is built.

### 16a. The reusable panel exists and needs no edit

`components/collabboard/editors/TextStylePopup.tsx` is the component the Image
post uses, and it is importable **as-is**:

```
isOpen, onOpenChange,
onSelectHeading: (level: 'h1'|'h2'|'normal'|'small'|'code'|'callout'|'quote') => void,
onSelectColor, onSelectHighlight,
currentHeading?, currentColor?, currentHighlight?, hideHeadingSelect?
```

It already offers exactly the seven presets requested (`:39-45`): Large
heading, Normal heading, Normal text, Small text, Code block, Callout, Quote
block — and passes `hasOpacity={true}` to its colour control (`:151`).

**So the panel itself is not the blocker, and the allowlist does not need to
grow for it.** Note also `hideHeadingSelect?` — an existing affordance for
rendering the panel without the preset list. That matters below.

### 16b. The Image caption style field

`metadata.captionStyle`, shaped
`{ color, backgroundColor, fontSize, fontWeight, fontStyle, fontFamily,
lineHeight }` (`FreeformPadletCards.tsx:1475-1482`, `:883`, `:897`).

### 16c. THE BLOCKER — saved Clipart cards do not read `captionStyle`

**Exact missing reader: `components/collabboard/CardPreview.tsx`.**

- `:27` destructures only `{ metadata, title, content }`.
- `:33` `const textColor = metadata?.textColor || '#1F2937'; // Title text color`
- `:90-92` and `:136-138` render the title as
  `<div className="text-center text-xs font-semibold" style={{ color: textColor }}>`

The classes are **hardcoded**. There is no heading level, no font size,
weight, style or family, no line height, no highlight, no opacity.
**`captionStyle` appears nowhere in `CardPreview.tsx`, `CardEditor.tsx` or
`ClipartCardDraftModal.tsx`.**

Consequence: every style dimension in the requested panel — all seven
presets, highlight and opacity — would be **written by the draft and silently
discarded by the saved card**. That is exactly the draft-only style the hard
stop exists to prevent, and it would fail the amendment's own test 12
("saved/reopened card retains caption text and supported style").

**A second, independent mismatch:** the one style dimension the saved card
*does* render is text colour, and it reads **`metadata.textColor`** (`:33`) —
**not** `captionStyle.color`. So wiring `TextStylePopup.onSelectColor` to
`captionStyle.color` would create a parallel colour the card ignores while
leaving the field it actually renders unwritten. Colour would appear to work
in the draft and revert on save.

### 16d. Scope ruling required — three options, with a recommendation

**No implementation is authorized until the owner picks one.**

**Option A — narrowest; RECOMMENDED. Allowlist unchanged (2 files).**
Ship only the dimension the saved card already renders: **text colour via
`metadata.textColor`**. Import `TextStylePopup` with `hideHeadingSelect`
so unsupported presets are not offered, and do **not** wire
`onSelectHighlight` — the card cannot render a highlight. Nothing written is
discarded; nothing offered is a lie. The panel opens to the right of the
compact card and satisfies the entire §16 layout contract.
**Cost:** the user sees a colour panel, not the seven presets.

**Option B — full parity. Requires a THIRD production file and its own
patch.** Teach `CardPreview.tsx` to consume `captionStyle`. This changes
saved-card rendering for **every card type that uses `CardPreview`**, not just
Clipart drafts, and it must reconcile `captionStyle.color` against the
existing `metadata.textColor`. That blast radius does not belong in
PATCH-122, whose subject is the Clipart draft editor. **If full parity is
wanted, it should be a successor patch** with its own characterization of
existing card rendering.

**Option C — defer.** Ship §15's inline caption alone (text via
`padlet.title`, no style panel) and route the whole style-panel contract to a
successor patch alongside Option B's renderer work.

**Prohibited under every option:** creating a new style field; writing
`captionStyle` while `CardPreview` ignores it; moving the Clipart text value
off `padlet.title`; editing `TextStylePopup`, the Image post, saved-card
renderers, `FreeformPadletCards`, `CanvasClient`, repositories, schema or RLS
without a fresh ruling.

### 16e. What carries forward regardless of the choice

These §16 requirements are accepted and will bind whichever option is chosen,
because they are layout and exclusivity rules independent of which style
fields exist:

- The style panel, when present, is the third child of the **same centred
  composition row** — toolbar, card, panel — so opening and closing it
  recentres automatically (§14e). **No hardcoded top, no JS measurement**; the
  `m-auto` scroll-safe centring from §14c stays intact.
- Toolbar, card and panel top edges within **1px**.
- Panel stays inside the viewport; short-viewport top-reachability preserved.
- Closing the panel must not close or save the draft — it must not reach the
  backdrop `onClose`.
- Caption is mutually exclusive with Reaction, Comments, colour and
  badge-colour panels, following the existing `open*` handlers rather than a
  new exclusivity contract.
- The panel stays open while typing.
- `padlet.title` remains the text source; `metadata.caption` is never
  created; no duplicate caption text field; unrelated metadata preserved.

§15's rulings are unaffected: `TextCursor` + `'Caption'`, `InlineCaption`
consumed as-is, the caption inside the 220px card, `CardActionsToolbar`
additive-only.

### 16f. Next instruction (bind)

> **No implementation of the caption style panel. Do not edit any file for
> §16 until the owner selects Option A, B or C.**
>
> §15's work — the Caption toolbar action, `InlineCaption` bound to
> `padlet.title`, and removal of the separate caption block — **remains
> authorized and may proceed**, provided the Caption click does **not** yet
> open a style panel. If that separation is impractical, stop and report
> rather than implementing §16 speculatively.
>
> Report back only: confirmation you have read §16c, and the owner's option
> choice. Do not write `metadata.captionStyle` under any circumstances until
> a reader exists.

### 16g. Status

**PATCH-122: OPEN · AUTHORIZED FOR §§13–15 ONLY · §16 BLOCKED PENDING SCOPE
RULING · NOT APPROVED · NOT CLOSED.**
Production allowlist remains **2 of 2**: `ClipartCardDraftModal.tsx`,
`CardActionsToolbar.tsx`. `CardPreview.tsx` is **not** authorized.
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 17. Scope ruling on §16 — OPTION C, defer (2026-07-29, owner decision)

### 17a. Decision

**The owner selected Option C.** The caption style panel is **DEFERRED**.

PATCH-122 ships **§15's inline caption only**: the Caption toolbar action,
`InlineCaption` bound to `padlet.title`, and removal of the separate caption
block. **Clicking Caption toggles inline caption editing and does NOT open a
style panel.**

### 17b. What is now out of scope for PATCH-122

- `TextStylePopup` is **not** imported or rendered by the Clipart draft.
- **`metadata.captionStyle` is never written.** No style field of any kind is
  written by the caption interaction.
- `metadata.textColor` is **not** wired to a caption control in this patch.
- `CardPreview.tsx` remains **prohibited** and unchanged.
- §16's tests 2–8, 17 and 18 (style panel presence, position, option set,
  preset/colour/opacity writes, centring with the panel open) are **withdrawn
  from PATCH-122**. §16's remaining items survive only where they already
  duplicate §§14–15 coverage.

Production allowlist stays **2 of 2**: `ClipartCardDraftModal.tsx`,
`CardActionsToolbar.tsx`.

### 17c. Deferred to a successor patch — recorded, not lost

A successor patch owns the whole contract, and must do both halves together
or neither:

1. **Reader first.** Teach `CardPreview.tsx` to consume caption style, and
   reconcile `captionStyle.color` against the existing `metadata.textColor`
   (`CardPreview.tsx:33`), which is the field it renders today. This changes
   saved-card rendering for **every** card type using `CardPreview`, so it
   needs its own characterization of current card rendering before any
   change.
2. **Then the panel.** Import `TextStylePopup` (reusable as-is, §16a) into
   the Clipart draft as the third child of the centred composition row, under
   §16e's layout and exclusivity rules.

**Binding rule for that successor:** no style metadata may be written before
its reader exists. Writing a field the saved card discards is the defect this
hard stop prevented, and it must not be reintroduced by doing the panel half
first.

Also carried forward from §16c, for whoever takes it: `CardPreview` renders
the title with **hardcoded** `text-center text-xs font-semibold`
(`:90-92`, `:136-138`), so heading level, font size/weight/style/family,
line-height, highlight and opacity have no rendering path at all today —
not merely an unwired one.

### 17d. §16e layout rules — retained where they still apply

The composition row remains toolbar + card, centred by `m-auto` with
scroll-safe overflow (§14c), tops within 1px, short-viewport reachability
intact, panels mutually exclusive through the existing `open*` handlers, and
no panel interaction reaching the backdrop `onClose`. The Comments, Reaction
and badge-colour panels remain the only right-side children.

### 17e. Next GPT-5.5 instruction (bind)

> **§16 is closed as deferred. Implement §§13–15 only.** Do not import
> `TextStylePopup`, do not write `metadata.captionStyle` or any style field
> from the caption interaction, and do not touch `CardPreview.tsx`.
>
> The Caption toolbar action toggles inline caption editing and closes the
> other mutually exclusive panels — nothing more. Everything else in §15h
> stands unchanged, including the additive-only `CardActionsToolbar`
> extension and the induced-failure proof.
>
> Leave the candidate uncommitted and unstaged for independent review.

### 17f. Status

**PATCH-122: OPEN · AUTHORIZED FOR §§13–15 · §16 DEFERRED BY OWNER RULING ·
NOT APPROVED · NOT CLOSED.**
Production allowlist **2 of 2**. `CardPreview.tsx` prohibited.
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 18. Option C confirmed; successor designated PATCH-123 (2026-07-29, owner ruling)

### 18a. Confirmation and rationale, bound

Option C is **confirmed**. The owner's stated reason is recorded as the
governing rationale: `CardPreview` currently ignores
`metadata.captionStyle`, so implementing the full Image-style panel inside
PATCH-122 would create **draft-only styling that disappears after save**,
violating the saved/reopened behaviour requirement.

**PATCH-122 retains**, unchanged from §§13–15:

- the Caption toolbar action (`TextCursor` + `'Caption'`, additive-only
  `CardActionsToolbar` extension);
- inline editing of **`padlet.title`** via `InlineCaption`;
- **no external caption textbox** — the separate `CAPTION` label, rounded
  input and `"Optional caption"` placeholder are removed;
- the compact layout and interaction fixes from §§13–14 (compact 220px card,
  corner badge overlap and actionability, `m-auto` scroll-safe centring,
  removed `pt-6` residues, panel exclusivity).

### 18b. Successor designated: **PATCH-123**

The full caption style panel and the `CardPreview` renderer support are
**deferred to PATCH-123**, which is hereby **DESIGNATED but UNAUTHORED and
UNAUTHORIZED**. It is not begun by this ruling, and PATCH-122 confers no
authority over it.

This designation supersedes §17c's unnumbered "successor patch" reference.

### 18c. Mandatory characterization before any renderer change

**PATCH-123 must characterize every `CardPreview` consumer before changing
the renderer.** The change affects every card type using `CardPreview`, not
only the Clipart draft.

Consumers as of this ruling — **3 render sites across 2 files**, plus one
importer to verify:

```
components/collabboard/canvas/ui/FreeformPadletCards.tsx:1754   canvas card
components/collabboard/canvas/ui/FreeformPadletCards.tsx:6052   Card Post Modal preview
components/collabboard/editors/ClipartCardDraftModal.tsx:189    Clipart draft preview
components/collabboard/ContainerCardPreviewFull.tsx             references CardPreview — confirm whether it renders it
```

**This list is a starting point, not the characterization.** PATCH-123 must
re-derive it at its own base commit — this repository has already produced
one dead call site behind a `{false && …}` guard
(`FreeformPadletCards.tsx:779`, recorded in §13b), so a grep result is not
by itself proof that a site is reachable. Each site must be characterized as
reachable or dead, with its current title rendering captured **before** any
renderer change.

### 18d. Binding constraints carried into PATCH-123

1. **Reader before writer.** No style metadata may be written until
   `CardPreview` renders it. Doing the panel half first recreates exactly the
   defect this hard stop caught.
2. **Reconcile the colour fields.** `CardPreview.tsx:33` renders
   `metadata.textColor`; the Image post writes `captionStyle.color`. PATCH-123
   must rule which wins and how they coexist — it must not introduce a third.
3. **The title has no style path today.** `CardPreview.tsx:90-92` and
   `:136-138` hardcode `text-center text-xs font-semibold`. Heading level,
   font size, weight, style, family, line-height, highlight and opacity have
   **no rendering path at all** — this is new rendering capability, not
   rewiring.
4. **`TextStylePopup` is reusable as-is** (§16a) and must not be edited.
5. The Clipart text value stays **`padlet.title`**; `metadata.caption` is
   never created.

### 18e. Status

**PATCH-122: OPEN · AUTHORIZED FOR §§13–15 · §16 DEFERRED TO PATCH-123 · NOT
APPROVED · NOT CLOSED.** Production allowlist **2 of 2**:
`ClipartCardDraftModal.tsx`, `CardActionsToolbar.tsx`. `CardPreview.tsx`
prohibited.
**PATCH-123: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-121: CLOSED. PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116:
CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 19. CLOSURE (2026-07-29, CTO)

### 19a. Independent review

**PASS.** Performed by an independent reviewer. The authoring CTO neither
implemented nor reviewed this candidate.

### 19b. Compact Freeform visual contract (§13)

- The large rounded Clipart editor shell is **removed** — `rounded-[28px]`,
  `bg-white`, `p-5`, `w-[320px]` and `min-h-[520px]` are all gone.
- The **compact 220px square-cornered Freeform card editor** is adopted,
  matching `FreeformPadletCards.tsx:6046`.
- The caption's separate external form is removed; §13c's "caption below the
  card wrapper" was superseded by §15d and the caption now sits **inside**
  the card.

### 19c. Centring and layout (§14)

- The composition row is centred with **`m-auto`**
  (`ClipartCardDraftModal.tsx:147`), **not** `items-center` on the scroll
  container — so overflow stays reachable.
- **Short viewport remains top-reachable**, the trap §14c identified.
- Toolbar, card and any optional right-side panel align on **one top edge**;
  the `pt-6` residues from the deleted shell are removed.
- Centring is pure layout: no hardcoded offsets, no JS measurement, no
  effect-driven repositioning. Opening or closing a panel recentres the
  composition automatically.

### 19d. Badge actionability (§14a–14b)

- The **card-corner badge is actionable** — it was inert decoration with no
  `onClick`.
- The **toolbar badge overhang is actionable**; §14a proved the badge is a
  DOM child of the Comment button, and a real click on the overhang proved
  it in the browser rather than by inference.
- The **Comment icon, the toolbar badge and the card badge open the same
  Comments panel** through one shared `openCommentPanel` — no duplicate
  panel state.
- **Badge-open clicks do not mutate metadata**, asserted directly.
- Comment count and badge colour remain the **shared** `commentCount` /
  `commentBadgeColor` values; neither is recomputed.

### 19e. Caption (§15)

- **Caption added additively** to `CardActionsToolbar`: optional
  `onCaption?` and `isCaptionActive?`.
- Uses **`TextCursor`**, labelled `Caption`, spread in **after `Icon`** and
  **only when `onCaption` is supplied** — verified in the diff as a
  conditional array spread.
- **Existing toolbar rendering is unchanged when the Caption props are
  omitted**; every existing call site is unaffected.
- `InlineCaption` is placed **inside the compact card**, consumed as-is.
- **Caption text remains `previewPadlet.title`** (`:200-201`).
- **`metadata.caption` is not created. `metadata.captionStyle` is not
  created.** Verified: neither string, nor `TextStylePopup`, nor
  `updatePadletMetadata`, appears anywhere in the modal.

### 19f. Deferred, deliberately

The caption **style panel is explicitly deferred to PATCH-123** (§§16–18),
because `CardPreview` does not consume `metadata.captionStyle` and writing
it here would have produced draft-only styling that disappears on save.
**`CardPreview.tsx` and `TextStylePopup.tsx` are untouched by this patch.**

### 19g. Final validation

```
git diff --check              PASS
npx tsc --noEmit              PASS
focused Vitest                34 PASS
full Vitest                   56 files / 639 tests PASS
ESLint                        PASS
Playwright characterization   PASS
independent review            PASS
```

### 19h. Committed file list

**Production — 2 of 2:**

```
components/collabboard/editors/CardActionsToolbar.tsx        +11 / -0
components/collabboard/editors/ClipartCardDraftModal.tsx     +83 / -41
```

**Tests — 2:**

```
components/collabboard/ClipartCardDraftModal.test.tsx
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

**Governance — 1:** `.fable5/patches/PATCH-122.md`

### 19i. Excluded

**Protected paths — not staged, not committed, still dirty:**

```
.gitignore
app/api/ai/classify-intent/route.ts
app/api/ai/convert-component/route.ts
app/api/ai/generate-component/route.ts
scripts/live-access-login.mjs
```

**`.fable5/patches/PATCH-123.md` — excluded and untouched.** It is a
governance-only untracked file belonging to a different patch and forms no
part of this commit.

`.env.local` untouched. No worktree. No stash. `vitest.config.ts` unchanged.
`CardPreview.tsx`, `TextStylePopup.tsx`, `InlineCaption.tsx`,
`FreeformPadletCards.tsx` and `CanvasClient.tsx` unchanged.

### 19j. PATCH-122 — **CLOSED**

All §§13–15 acceptance criteria met; §16 deferred by owner ruling to
PATCH-123. Independent review PASS. Scope verified at 2 production and 2 test
files, within the amended maxima. No protected path included.

**PATCH-122 is CLOSED.**

**PATCH-123: DESIGNATED, UNAUTHORED IMPLEMENTATION-WISE, UNAUTHORIZED,
UNTOUCHED.** Its governance document exists but confers no implementation
authority.
**PATCH-121 / 120 / 117: CLOSED. PATCH-116: CANCELLED and retired.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**
