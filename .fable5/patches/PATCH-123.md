# PATCH-123 — Persist and render Clipart card caption styles

**Status:** AUTHORIZED · OPEN · NOT STARTED · UNCOMMITTED
**Authored:** 2026-07-29 (CTO)
**Base commit:** `d2dbb80102048db0bb36139c716f14b2c2e6741a` (PATCH-121 closure)
**Model assignment:** GPT-5.5 implements. Independent reviewer reviews.
The authoring CTO neither implements nor reviews this candidate.

Designated by PATCH-122 §18b. Owns the caption style panel and the
`CardPreview` renderer support deferred from PATCH-122 §16.

---

## 0. Repository state

- **PATCH-122: OPEN**, authorized for its §§13–15, not approved, not closed.
  **PATCH-123 must not land before PATCH-122**, because it builds on
  PATCH-122's Caption toolbar action and inline caption.
- **PATCH-121 / 120 / 117: CLOSED. PATCH-116: CANCELLED.**
- **PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
- **PATCH-118: RESERVED. PATCH-119: DESIGNATED, unauthored.**
- Five protected pending paths: `.gitignore`, the three `app/api/ai/*`
  routes, `scripts/live-access-login.mjs`.

---

## 1. CardPreview consumer characterization — REQUIRED §18c work, done

Re-derived at this base commit. **Three render sites, and one reported
consumer that is not one.**

| Site | Classification |
|---|---|
| `FreeformPadletCards.tsx:1754` — canvas card | **REACHABLE.** Inside the live card wrapper; no guard. Renders every freeform card on canvas. |
| `FreeformPadletCards.tsx:6052` — Card Post Modal preview | **REACHABLE.** Gated by `cardToolbarPadletId && activeCardToolbarPadlet` (`:5960`); reached whenever the card editor opens. |
| `ClipartCardDraftModal.tsx:189` — draft preview | **REACHABLE.** |
| `ContainerCardPreviewFull.tsx` | **NOT A CONSUMER — false positive.** The only match is `:20`, the component's own name; `CardPreview` is a substring of `ContainerCardPreviewFull`. It neither imports nor renders `CardPreview`. **Removed from the consumer list.** |

This is exactly why §18c required re-derivation: a grep hit is not proof of
consumption, and the starting list contained a substring artefact.

**Current title rendering at every reachable site** is identical, because all
three delegate to the same component (`CardPreview.tsx:90-92` and
`:136-138`):

```jsx
<div className="text-center text-xs font-semibold" style={{ color: textColor }}>
  {title}
</div>
```

with `const textColor = metadata?.textColor || '#1F2937';` (`:33`).
**Hardcoded `text-xs` (12px) and `font-semibold` (600).** No heading level, no
font family, no line-height, no highlight, no alpha. Compatibility
requirement for all three sites is therefore the same, and is stated in §5.

---

## 2. `metadata.captionStyle` schema — existing, authoritative

Derived from the only existing writer, `FreeformPadletCards.tsx:1512-1596`,
and the only existing reader, `:1470-1483`:

```ts
metadata.captionStyle = {
  heading?: 'h1' | 'h2' | 'normal' | 'small' | 'code' | 'callout' | 'quote';
  fontSize?: string;        // e.g. '18px'
  fontWeight?: string;      // e.g. '700'
  fontStyle?: string;       // 'normal' | 'italic'
  fontFamily?: string | undefined;
  lineHeight?: string;      // e.g. '1.3'
  color?: string;           // '#RRGGBB' | '#RRGGBBAA' | 'transparent'
  backgroundColor?: string; // highlight; callout defaults '#fef3c7'
}
```

**No new key may be added to this shape.**

### 2a. Preset table — reuse verbatim, do not re-invent

`FreeformPadletCards.tsx:1514-1585` is the authoritative mapping and must be
reproduced exactly:

| level | fontSize | fontWeight | fontStyle | fontFamily | lineHeight | other |
|---|---|---|---|---|---|---|
| `h1` | 18px | 700 | normal | undefined | 1.3 | |
| `h2` | 16px | 600 | normal | undefined | 1.35 | |
| `normal` | 14px | 400 | normal | undefined | 1.4 | default branch |
| `small` | 12px | 400 | normal | undefined | 1.4 | |
| `code` | 13px | 400 | normal | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | 1.4 | |
| `quote` | 14px | 400 | **italic** | undefined | 1.45 | |
| `callout` | 14px | 500 | normal | undefined | 1.4 | `backgroundColor: baseStyle.backgroundColor \|\| '#fef3c7'` |

Every branch spreads the previous `captionStyle` first and sets
`heading: <level>`.

**The table lives inline inside a prohibited file.** PATCH-123 may create
**one** new shared module holding it (§4), consumed by the Clipart writer.
`FreeformPadletCards` is **not** rewired to that module in this patch — that
would require editing a prohibited file. **The resulting duplication is
recorded as debt for a successor**, and the new module must be a
byte-faithful copy so the two cannot diverge silently.

### 2b. Opacity — a stated requirement is CORRECTED

**There is no `captionStyle.opacity`, and none may be created.**

`TextStylePopup` exposes only `onSelectColor` / `onSelectHighlight`
(`:10-11`) and renders `ColorPickerContent` with `hasOpacity={true}`
(`:149-153`). That control emits **a single colour string**:

- `#RRGGBBAA` (8-digit) when opacity < 100 — `ColorPicker.tsx:134`, `:294`
- `#RRGGBB` (6-digit) at 100%
- the literal `'transparent'` — `:120`, `:147`

**Opacity is the alpha channel of `captionStyle.color`.** Requirement 3's
"opacity" and test 5 are therefore restated: *selecting opacity changes
`captionStyle.color` to an 8-digit hex or `'transparent'`.* A separate
opacity field would contradict §2's "no new key" rule and could not be
produced by the panel anyway.

**`CardPreview` must accept all three colour forms**, including
`'transparent'`.

---

## 3. Colour precedence — RULED

```
captionStyle.color  (when present and non-empty)
  → else metadata.textColor
    → else '#1F2937'
```

The preferred rule from the request is adopted unchanged. **No third colour
field.** `metadata.textColor` is neither removed nor migrated.

**Unrelated cards must not change.** A card with no `captionStyle` continues
to resolve through `metadata.textColor` exactly as today — see §5.

---

## 4. Production allowlist — maximum 3

```
components/collabboard/CardPreview.tsx                        (renderer — READER FIRST)
components/collabboard/editors/ClipartCardDraftModal.tsx      (writer + panel)
lib/domain/canvas/captionStyle.ts                             (new; preset table + resolver)
```

The third file is **optional but preferred**: it holds the §2a preset table
and the §3 colour resolver so the writer and the renderer share one
definition. If the implementer can satisfy §2a and §3 without it, they may,
with a stated reason.

**PROHIBITED — byte-for-byte unchanged:**

```
components/collabboard/editors/TextStylePopup.tsx     (reusable as-is)
components/collabboard/editors/InlineCaption.tsx      (reusable as-is)
components/collabboard/editors/CardActionsToolbar.tsx (PATCH-122 owns it)
components/collabboard/editors/ImageActionsToolbar.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx
components/collabboard/ContainerCardPreviewFull.tsx
app/dashboard/canvas/[id]/CanvasClient.tsx
components/collabboard/ColorPicker.tsx
```

Also prohibited: repositories, database schema, RLS, `vitest.config.ts`, and
any new test dependency.

**Test allowlist — maximum 3:**

```
components/collabboard/ClipartCardDraftModal.test.tsx
components/collabboard/CardPreview.test.tsx                   (new)
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

---

## 5. Reader-before-writer — binding order

**`CardPreview` support lands and is proven before the editor writes any
style metadata.** This is the rule PATCH-122 §16 was stopped for; it is not
negotiable and not reorderable.

`CardPreview` must:

1. Resolve colour per §3 and accept `#RRGGBB`, `#RRGGBBAA` and
   `'transparent'`.
2. Apply `fontSize`, `fontWeight`, `fontStyle`, `fontFamily`, `lineHeight`
   and `backgroundColor` from `captionStyle` when present.
3. **Preserve legacy appearance exactly when `captionStyle` is absent or
   empty** — `text-center text-xs font-semibold` with
   `color: metadata.textColor || '#1F2937'`. Assert this as **byte-identical
   markup**, not "looks similar".
4. **Preserve card dimensions and layout bounds.** `h1` at 18px and
   `callout` with a background must not change the card's width or its
   overall height contract. State how this is bounded.
5. Apply styling to the **title only**. `content`, the counter and the icon
   are untouched.

---

## 6. Editor behaviour

`ClipartCardDraftModal`:

- Caption click activates `InlineCaption` **and** opens `TextStylePopup` to
  the right, as the third child of the centred composition row.
- Closes the mutually exclusive Reaction, Comments, colour and badge-colour
  panels through the existing `open*` handlers — no new exclusivity contract.
- Caption active state stays visible on the toolbar
  (`isCaptionActive`, added by PATCH-122).
- Preset, colour and highlight selections write `metadata.captionStyle`
  through the existing `updateMetadata`/`onChange` flow. **No repository
  call. No new persistence route.**
- **Caption text remains `padlet.title`.** `metadata.caption` is never
  created.
- `TextStylePopup` is consumed unchanged. If it needs a prop it lacks, **stop
  and return**.
- Opening the panel with no selection made must **not** write
  `captionStyle` — only an explicit selection writes.

---

## 7. Layout

The style panel participates in the **same centred flex row** as the toolbar
and card, so opening and closing it recentres automatically. Top edges within
**1px**. `m-auto` scroll-safe centring from PATCH-122 §14c stays intact;
short-viewport top-reachability preserved; the panel stays in the viewport.
**No hardcoded offsets, no JS measurement, no effect-driven repositioning.**
Closing the panel must not reach the backdrop `onClose`, which saves and
closes the draft.

---

## 8. Tests

Items 1–16 of the request are adopted, with **test 5 restated per §2b**:
selecting opacity yields an 8-digit hex or `'transparent'` in
`captionStyle.color` — there is no `captionStyle.opacity` to assert.

Additions, required:

**17.** Legacy compatibility is proven as **byte-identical `CardPreview`
markup** with `captionStyle` absent, and separately with `captionStyle: {}`.

**18.** All three colour forms render: 6-digit, 8-digit and `'transparent'`.

**19.** The §2a preset table is asserted **value-by-value** against the seven
levels, so a typo in a font size cannot pass.

**20.** `ContainerCardPreviewFull.tsx` is asserted **not** to be a
`CardPreview` consumer, so the §1 false positive cannot silently return.

**21.** Opening the Caption panel without selecting anything writes **no**
metadata.

**Induced-failure proof required** for both halves: reverting the
`CardPreview` reader must fail the render tests, and reverting the writer must
fail the persistence tests.

`CardPreview.test.tsx` runs under `environment: 'node'` with
`renderToStaticMarkup`, matching the existing included suite; it is covered by
the existing `components/collabboard/*.test.tsx` glob, so
**`vitest.config.ts` must not change** and the full run must rise to **57
files**.

---

## 9. Bound commit message

```
feat(canvas): persist and render clipart caption styles (PATCH-123)
```

Verbatim, only after independent review passes.

---

## 10. Hard stops

1. `TextStylePopup` or `InlineCaption` needs a prop it does not expose.
2. Any prohibited file appears to require modification.
3. Legacy `CardPreview` markup cannot be preserved byte-identically.
4. A fourth production file appears necessary.
5. Applying `captionStyle` changes card dimensions at any reachable site.
6. Any protected path becomes staged or modified.
7. PATCH-122 has not landed — PATCH-123 depends on its Caption action.

---

## 11. Next GPT-5.5 instruction (bind)

> **Implementation engineer role only. Read PATCH-123 in full first. Do not
> edit `.fable5`, do not begin PATCH-118/119, do not commit until independent
> review passes.**
>
> Safety gate before and after: `git status --porcelain` (full list),
> `git diff --cached --name-status` (empty), `git worktree list` (one),
> `git stash list` (empty). The five protected paths stay dirty, unstaged and
> unmodified. `.env.local` untouched. No worktree. Record hashes of the
> prohibited files before and after — any change is a hard stop.
>
> **Phase 1 — READER FIRST.** Implement `CardPreview` `captionStyle` support
> per §5 and §3, plus `CardPreview.test.tsx` covering tests 11, 12, 17, 18
> and 19. **Report actual output and stop for confirmation before Phase 2.**
> Do not touch `ClipartCardDraftModal` in Phase 1.
>
> **Phase 2 — writer.** Wire Caption to open `TextStylePopup` per §6 and §7,
> writing `metadata.captionStyle` through the existing
> `updateMetadata`/`onChange` flow. Reuse the §2a table verbatim — copy the
> values, do not re-derive them. Caption text stays `padlet.title`;
> `metadata.caption` is never created; **there is no `captionStyle.opacity`**
> (§2b).
>
> Add the remaining tests of §8 with the induced-failure proofs. Run
> `git diff --check`, `npx tsc --noEmit`, focused Vitest, full Vitest
> (**expect 57 files**), ESLint and the focused Playwright characterization;
> report actual output for each.
>
> Any §10 condition is a **hard stop** — return, do not work around it. Leave
> the candidate uncommitted and unstaged for independent review.

---

## 12. Status

**PATCH-123: AUTHORIZED · OPEN · NOT STARTED · UNCOMMITTED.**
Production allowlist **3 max**; test allowlist **3**.
**PATCH-122: OPEN, authorized for §§13–15, not approved, not closed — must
land first.**
**PATCH-121 / 120 / 117: CLOSED. PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED. PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**

---

## 13. Amendment — Image-post parity for Caption AND Reaction (2026-07-29, CTO)

PATCH-123 gains a second half. The caption contract in §§1–8 is unchanged and
already satisfies the caption-parity requirement. This section adds reaction
parity, and it retires one earlier ruling of mine.

### 13a. Reaction parity is achievable with ZERO new files

`CardPreview` **already renders the parity display.** `CardPreview.tsx`:

```
:4    import ReactionDisplay from './editors/ReactionDisplay';
:13   reactions?: string[];
:14   onAddReaction?: () => void;
:146  {reactions.length > 0 && (
:148     <ReactionDisplay reactions={reactions} onAddClick={onAddReaction} … />
```

`reactions` is a **prop**, not read from `metadata`. `ClipartCardDraftModal.tsx:189`
renders `<CardPreview padlet={previewPadlet} isSelected={false} />` **without
it**, so it defaults to `[]`, the built-in display never appears — and that is
precisely why the modal grew its own bespoke chips row.

**Ruling: pass `reactions` and `onAddReaction` to `CardPreview`, and delete
the modal's custom chips row.** No new component, no new file, and
`CardPreview`'s reaction path needs no change. The reaction half consumes
**none** of the §4 allowlist beyond `ClipartCardDraftModal.tsx`.

### 13b. The picker must change — and my PATCH-120 §5 choice was wrong

The Image post uses **`EmojiPicker` from `emoji-picker-react`**
(`FreeformPadletCards.tsx:20`, `:6093-6105`), not the in-repo
`EmojiReactionPicker` the Clipart draft currently uses.

**PATCH-120 §5 bound `EmojiReactionPicker` and recorded that it had zero call
sites in the repository. That zero was the signal, and I read it as merely
"unproven" rather than "not the product's picker."** It is the wrong
component for parity. Recorded plainly so the next reader does not repeat it.

Adopt the Image markup exactly (`:6085-6106`):

```jsx
<div className="relative shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
  <button className="absolute top-2 right-2 translate-x-1 z-10 w-4 h-4 rounded hover:bg-gray-100 flex items-center justify-center"
          onClick={close} title="Close"><X className="w-3 h-3 text-gray-400" /></button>
  <EmojiPicker onEmojiClick={…} width={300} height={400} lazyLoadEmojis={true} />
</div>
```

The picker **closes on selection**, matching `:6100`.
`emoji-picker-react` is already a dependency (imported by
`FreeformPadletCards` and `CanvasClient`) — **no new dependency is
authorized.**

### 13c. PATCH-120's de-duplication rule is RETIRED

**This is the load-bearing behavioural change, and it must not be applied
silently.**

`ReactionDisplay` **derives counts from repetition** (`:18-21`):

```ts
const groupedReactions = reactions.reduce((acc, emoji) => {
  acc[emoji] = (acc[emoji] || 0) + 1; return acc;
}, {});
```

and the Image post appends **without de-duplicating** (`:6097`):
`const newReactions = [...currentReactions, emojiData.emoji];`

PATCH-120 §6 ruled "duplicates must not be added", with an acceptance
criterion and a passing test. **Under parity that rule is wrong**: dedup pins
every count at 1 and defeats the display's entire purpose.

**Ruled: PATCH-120's dedup rule, its acceptance criterion and its test are
WITHDRAWN.** Selecting the same emoji twice must append twice and show a
count of 2. The withdrawal is explicit, and the test must be **removed or
inverted**, not left passing against retired behaviour.

### 13d. Reaction contract — bound

- Field: **`metadata.reactions: string[]`**, unchanged. **Duplicates are
  meaningful** (they are the count).
- Removal: `onReactionClick` removes **one instance**, mirroring
  `FreeformPadletCards.tsx:5524-5533` (find index, splice one).
- Display renders only when `reactions.length > 0`.
- **Draft persistence stays on `updateMetadata`/`onChange`.** The Image post
  calls `updatePadletMetadata` / `updatePostFieldsPreservingFailureChannels`
  because it edits a **saved** card; the draft must **not** — that is the
  separate persistence route PATCH-120 §8.11 prohibits. **Parity is visual
  and behavioural, not a persistence-route copy.**
- **Do not edit Image-post behaviour**, `FreeformPadletCards`,
  `ReactionDisplay` or `EmojiReactionPicker`.

`EmojiReactionPicker` becomes unused by this modal. **Do not delete it** —
removal is out of scope and other work may adopt it.

### 13e. Single right-side panel slot

The composition row's optional right-side slot hosts **exactly one** of:
Caption `TextStylePopup`, Reaction picker, Comments panel, badge-colour
palette. All four: top-aligned to the compact card within **1px**; part of
the `m-auto`-centred row; viewport-safe; short-viewport top-reachable;
mutually exclusive through the existing `open*` handlers; and never moving
the card to an unrelated vertical position. No hardcoded offsets, no JS
measurement.

### 13f. Allowlist — re-evaluated, unchanged

```
components/collabboard/CardPreview.tsx                    (caption reader only)
components/collabboard/editors/ClipartCardDraftModal.tsx  (caption + reaction)
lib/domain/canvas/captionStyle.ts                         (optional; caption presets)
```

**No shared reaction component needs authorizing** — §13a proves the Clipart
modal consumes `CardPreview`'s existing props without modification, so the
"only if it cannot be consumed unmodified" condition does not trigger.

`ReactionDisplay.tsx`, `EmojiReactionPicker.tsx`, `TextStylePopup.tsx`,
`InlineCaption.tsx`, `FreeformPadletCards.tsx`, `CanvasClient.tsx`,
`CardActionsToolbar.tsx` and `ImageActionsToolbar.tsx` remain **prohibited**.

### 13g. Amended tests

Parity items 1–10 adopted as written. Additions, required:

**11.** Selecting the same emoji twice yields `reactions.length === 2` and a
displayed count of **2** — the direct test for §13c, and the one that
prevents the retired dedup rule creeping back.
**12.** `CardPreview` receives `reactions` and `onAddReaction` from the
Clipart modal, and the modal's bespoke chips row is **absent**.
**13.** Clicking a displayed reaction removes **one** instance, not all.
**14.** The draft writes reactions through `onChange` only — assert
`updatePadletMetadata` is never called from the modal.
**15.** The retired PATCH-120 dedup test is removed or inverted; no test
asserts dedup.

Parity item 4 ("equivalent caption appearance") and item 7 ("equivalent
reaction display") must compare **computed styles and rendered structure**,
not screenshots alone; screenshots are corroboration, not the assertion.

### 13h. Hard stops — added to §10

8. `EmojiPicker`, `ReactionDisplay` or `CardPreview`'s reaction path cannot
   be consumed without modification.
9. Parity would require changing Image-post behaviour.
10. Any parity requirement can only be met by a persistence-route change in
    the draft.

### 13i. Status

**PATCH-123: AUTHORIZED · OPEN · NOT STARTED · AMENDED · UNCOMMITTED.**
Production allowlist **3 max**, unchanged. Reader-before-writer phasing (§11)
still governs the caption half; the reaction half has no reader dependency
and may land in either phase.
**PATCH-122: CLOSED. PATCH-121 / 120 / 117: CLOSED** — PATCH-120's dedup
rule is retired by §13c, which does not reopen that patch.
**PATCH-116: CANCELLED. PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT
CLOSED.**
**PATCH-118: RESERVED. PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED.**
