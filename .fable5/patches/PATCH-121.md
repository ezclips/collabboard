# PATCH-121 — Widen the Clipart draft comment badge-colour palette

**Status:** AUTHORIZED · IMPLEMENTED · UNCOMMITTED · AWAITING INDEPENDENT REVIEW
**Authored:** 2026-07-29
**Base commit:** `c23f665e7c2f4e4e7956822ff0216b5cd3516d64` (PATCH-120 closure)

---

## 0. Role note

This patch was **authored and implemented by the same model at the owner's
explicit direction**, departing from the standing separation in which the CTO
authors and GPT-5.5 implements. The remaining separation is preserved: **the
candidate is left uncommitted for an independent reviewer**, and the authoring
model does **not** review or approve it.

Repository state at authoring: PATCH-120 CLOSED and pushed (`c23f665`);
PATCH-117 CLOSED; PATCH-115 OPEN/BLOCKED/LANDED (`215ea81`); PATCH-116
CANCELLED; PATCH-118 RESERVED; PATCH-119 DESIGNATED, unauthored.
Five protected pending paths remain dirty and untouched.

---

## 1. Observed defect

In the Library clipart draft Comments panel, the badge-colour palette opened
too narrow: columns compressed, swatches overlapping and clipped, visibly
narrower than the Note/Table/Image reference.

---

## 2. Root cause — CONFIRMED, and it is positional, not a missing width alone

Three source differences from the working reference
(`FreeformPadletCards.tsx:1095-1110`), in order of importance:

1. **The palette's containing block is the 28px swatch button wrapper.**
   `ClipartCardDraftModal.tsx:227` opens
   `<div className="absolute right-10 top-8 z-10">`, which shrink-wraps to the
   7×7 (28px) button. The palette at `:244` was `absolute right-0 top-9` with
   **no stated width**, so its shrink-to-fit width resolved against that 28px
   containing block. **This is the primary cause.**
2. **`grid-cols-6` expands to `repeat(6, minmax(0, 1fr))`.** The `minmax(0, …)`
   floor lets tracks become narrower than their contents, so the compressed
   grid squeezed the columns rather than overflowing cleanly.
3. **The swatches carried `minWidth: 22px` / `minHeight: 22px` alongside
   `width/height: 20px`.** A minimum larger than the width made each swatch
   overflow its own track — the direct cause of the **overlap**. The reference
   has no such minimum. The gap was also `gap-3` (12px) against the
   reference's `gap-1.5` (6px).

So the defect is a compound of *missing explicit width*, *shrinkable grid
children*, and *a conflicting swatch minimum* — not any one of them alone.
Parent `overflow` was ruled out: no ancestor in the chain clips.

---

## 3. Fix

`ClipartCardDraftModal.tsx` only. Geometry is now stated once as named
constants (`:29-36`) rather than scattered magic numbers:

```
BADGE_PALETTE_COLUMNS = 6
BADGE_SWATCH_SIZE_PX  = 20
BADGE_SWATCH_GAP_PX   = 6
BADGE_PALETTE_PADDING_PX = 8
BADGE_PALETTE_WIDTH_PX = 6*20 + 5*6 + 8*2 = 166
```

- Palette states `width: 166px` — it no longer shrink-fits against the 28px
  containing block.
- Grid uses explicit fixed tracks
  `gridTemplateColumns: repeat(6, 20px)`, replacing `grid-cols-6`'s
  `minmax(0, 1fr)`.
- Gap matched to the reference: `gap-1.5`.
- Swatch `minWidth`/`minHeight` **removed**; `shrink-0` added.
- Test hooks added: `data-testid="clipart-badge-color-palette"`,
  `data-testid="clipart-badge-color-grid"`, `data-badge-color-swatch={color}`.

**Unchanged, as required:** the 48-colour set and ordering; `p-2` padding;
`absolute right-0 top-9 z-20` positioning; the `onClick`/`onMouseDown`
propagation guards; `metadata.badgeColor` semantics via `updateMetadata`;
no redesign.

---

## 4. Scope

**Production — 1 file:**
`components/collabboard/editors/ClipartCardDraftModal.tsx` (+26 / −6)

**Tests — 2 files:**
`components/collabboard/ClipartCardDraftModal.test.tsx`,
`e2e/characterization/clipart-draft-reactions-comments.spec.ts`

**Untouched:** `CardActionsToolbar`, `CommentPopup`, `EmojiReactionPicker`,
`FreeformPadletCards`, `CanvasClient`, repositories, schema, RLS,
`vitest.config.ts`, persistence and metadata semantics, and the five
protected paths.

---

## 5. A workaround the fix retires

The PATCH-120 Playwright test clicked the target swatch with
`position: { x: 4, y: 10 }` — a corner offset that only worked *because* the
palette was compressed and swatches overlapped. **That offset is removed**;
the test now uses a plain centre click, which is itself a regression assertion
that the overlap is gone.

---

## 6. Tests added

**Vitest** (7 new; suite 11 → 18): explicit palette width; six fixed 20px
tracks with `1fr`/`grid-cols-6` explicitly rejected; 48 equal non-shrinking
swatches with no `minWidth`/`minHeight`; six columns fit the stated width;
colour set and ordering preserved and rendered in order; propagation guards
retained; a widened swatch still writes only `metadata.badgeColor`.

**Playwright**: computed `grid-template-columns` is six 20px tracks; palette
bounding box ≥166px; all 48 swatch bounding boxes captured; every swatch
inside the palette box (no clipping); pairwise no-overlap across all 48;
exactly six distinct column origins at a uniform 26px pitch; palette
screenshot to `patch-121-badge-color-palette.png`; centre click selects;
Comments panel and draft both remain open; badge colour updates.

**Induced-failure proof:** restoring the pre-fix geometry (`grid-cols-6
gap-3`, no stated width) makes **2 of the 18** Vitest tests fail. The suite
detects the defect rather than merely describing the fix.

---

## 7. Validation

```
git diff --check        PASS
npx tsc --noEmit        PASS
focused Vitest          18 PASS (was 11)
full Vitest             see report
ESLint                  see report
focused Playwright      see report
```

---

## 8. Bound commit message

```
fix(canvas): widen clipart comment badge color palette (PATCH-121)
```

Used verbatim, **only after independent review passes**.

---

## 9. Status

**PATCH-121: IMPLEMENTED · UNCOMMITTED · UNSTAGED · AWAITING INDEPENDENT
REVIEW. NOT APPROVED, NOT CLOSED.**
**PATCH-120: CLOSED. PATCH-117: CLOSED. PATCH-116: CANCELLED.**
**PATCH-115: OPEN, BLOCKED, LANDED (`215ea81`), NOT CLOSED.**
**PATCH-118: RESERVED, UNAUTHORIZED, UNTOUCHED.**
**PATCH-119: DESIGNATED, UNAUTHORED, UNAUTHORIZED, UNTOUCHED.**

---

## 10. Final closure (2026-07-29)

### 10a. Root cause

- The absolute badge-colour palette shrink-wrapped against a 28px trigger.
- `grid-cols-6` allowed collapsing tracks.
- Swatch `minWidth` exceeded its assigned width.
- The oversized gap compounded the overlap.

### 10b. Fix

- Explicit palette width: `166px`.
- Fixed tracks: `repeat(6, 20px)`.
- Gap: `6px`.
- Horizontal padding: `8px`.
- Swatches: `20x20`, non-shrinking.
- No conflicting minimum dimensions.

### 10c. Preserved behavior

- Colour set and order unchanged.
- Position and propagation guards unchanged.
- `metadata.badgeColor` semantics unchanged.
- Comments panel and draft remain open during palette interaction.
- Centre click now works without compensating offset.

### 10d. Verification

- Geometry tests cover width, six columns, containment and non-overlap.
- `git diff --check`: PASS.
- `npx tsc --noEmit`: PASS.
- Focused Vitest: 18 PASS.
- Full Vitest: 56 files / 623 tests PASS.
- ESLint: PASS.
- Playwright characterization/listing: PASS.
- Independent review report: PASS.

### 10e. Final candidate file list

```
.fable5/patches/PATCH-121.md
components/collabboard/editors/ClipartCardDraftModal.tsx
components/collabboard/ClipartCardDraftModal.test.tsx
e2e/characterization/clipart-draft-reactions-comments.spec.ts
```

### 10f. Protected paths

Excluded from staging and commit:

```
.gitignore
app/api/ai/classify-intent/route.ts
app/api/ai/convert-component/route.ts
app/api/ai/generate-component/route.ts
scripts/live-access-login.mjs
```

### 10g. Adjacent patch state

- PATCH-121 is CLOSED.
- PATCH-120 remains CLOSED.
- PATCH-118 remains RESERVED and UNTOUCHED.
- PATCH-119 remains DESIGNATED, UNAUTHORED and UNAUTHORIZED.
- PATCH-117 remains CLOSED.
- PATCH-115 remains OPEN, BLOCKED, LANDED (`215ea81`) and NOT CLOSED.
