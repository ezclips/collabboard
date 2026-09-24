# PATCH-171 — row/column menu: the standard color picker, and a corner-triangle button

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why — two owner reports

1. **"The new color picker … should open our standard color picker and not this new one."**
   `TableAxisMenu`'s `Color` submenu renders `CELL_COLORS` as a tall column of swatches. The
   app's standard picker is `ColorPickerContent` (hex field, default colors, opacity), which the
   table ALREADY shows in its toolbar's `Cell color` panel (`activeSubmenu === 'cellColor'` in
   `TableEditor.tsx`), applying `bg` to the current selection.
2. **"The button with the 6 dots is for drag and drop. Add a button in triangle form to one of
   the corners."** Six dots conventionally mean "drag me". The PATCH-165/169 grips use
   `GripVertical`. The menu button must look like a menu button: a small triangle in a corner.
   (The six-dot handle is reserved for a future drag-to-reorder; this patch adds no dragging.)

## 2. The changes

### 2.1 Color → the standard picker — `TableAxisMenu.tsx`, `TableEditor.tsx`

- In `TableAxisMenu`, `Color` becomes a plain item (NO submenu, keep the `Palette` icon and its
  position). Choosing it calls a new `onAction('color')`. Remove the swatch submenu and the now
  unused `colors` and `onColor` props (and `PositionedContextMenuSwatch` import if unused).
- In `TableEditor`, `applyAxisAction('color')`:
  1. selects that whole row or column — exactly what `handleRowHeaderClick` /
     `handleColumnHeaderClick` do (without Shift);
  2. opens the toolbar's existing Cell color panel: `setToolbarMode('inside')`,
     `setActiveSubmenu('cellColor')`;
  3. closes the axis menu.
  Nothing else: the Cell color panel already applies `bg` to the selection. Remove
  `applyAxisColor` if nothing else uses it.
- Respect `fillLocked` as the other axis actions do.

### 2.2 The corner-triangle menu button — `TableEditor.tsx`

Replace BOTH grips (row and column) — keep their `data-table-row-handle` /
`data-table-column-handle` attributes, `aria-label`s, click behaviour (open the axis menu,
`stopPropagation`), focus ring, and reveal rules (row/column hover, keyboard focus, or while its
own menu is open):

- Shape: a right-angled triangle filling the cell's **top-right corner**, 10×10px, drawn with
  CSS borders or an inline SVG (`fill: currentColor`), color gray-400, gray-600 on hover,
  purple-600 while its menu is open. Hit area 16×16px anchored to that corner.
- Column header: top-right corner, inset so it never overlaps the PATCH-170 resize strip
  (the strip is the rightmost 6px — anchor the triangle at `right: 6px`).
- Row-number cell: its top-right corner.
- No `GripVertical` import remains in the table editor.
- `title` tooltip: `Row options` / `Column options`.

## 3. Tests

- `components/collabboard/editors/TableEditor.handles.test.tsx`: the color case changes
  deliberately — `Color` has no swatch submenu now; choosing it selects the row (selected look on
  every cell of that row) and opens the Cell color panel (`ColorPickerContent` is in the DOM, e.g.
  its hex input). Then drive the picker the way the existing Cell color tests or the component
  expose it (a default-color swatch or the hex input) and assert via save-and-close that EVERY
  cell of the row has that `bg`. Keep every other test unchanged.
- ADD: the row and column buttons contain no six-dot grip (no `lucide-grip-vertical` class) and
  sit at the top-right (`right` anchored in their class/style) — one assertion each is enough.
- ADD: `Color` in the column menu selects the column and opens Cell color (mirror of the row case).
- All other table suites untouched (fill, askai, rows, widths, commentCanonicalization,
  characterization).

## 4. Allowed files

```
components/collabboard/menus/TableAxisMenu.tsx
components/collabboard/editors/TableEditor.tsx
components/collabboard/editors/TableEditor.handles.test.tsx   (the color case + additions)
```

Forbidden: everything else, including `ColorPicker.tsx`. Never use git stash, reset, restore,
checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/editors components/collabboard/tableCellContextMenu.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live.

## 6. Commit message (verbatim)

```
fix(table): row and column menus use the standard color picker and a corner-triangle button

Color in a row or column menu showed its own column of swatches. It now selects that row or
column and opens the table's standard Cell color panel, the same picker as everywhere else,
with hex input and opacity.

The menu button was a six-dot grip, which reads as "drag me". It is now a small triangle in
the header cell's top-right corner; the six dots stay free for drag-to-reorder later.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
