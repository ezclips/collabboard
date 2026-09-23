# PATCH-165 — table row and column handle menus, "+" add bars, styles that follow their cell

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

The table post editor (`components/collabboard/editors/TableEditor.tsx`) only offers structure
changes through the right-click cell menu and two toolbar buttons. The owner wants the pattern
Notion/AppFlowy use: a small handle on each row and each column that opens a menu for THAT row or
column, and a "+" bar at the bottom and right edge to append a row or column.

This patch also fixes an **existing bug**: `cellStyles` is keyed by position (`"row-col"`), and
`addRowAbove`, `addRowBelow`, `addColumnLeft`, `addColumnRight`, `deleteRow`, `deleteColumn`
change `rows`/`columns` without re-keying `cellStyles`. Insert a row above a colored cell and the
color stays on the old position — it lands on the wrong cell. After this patch every structural
change moves styles with their cells.

A second existing bug, fixed in passing: new column names are `String.fromCharCode(65 + columns.length)`.
After a delete this produces a duplicate name (A,B,C → delete B → add → A,C,C).

## 2. The design

### 2.1 A pure module — `lib/domain/canvas/tableStructure.ts` (new)

All structure changes live here as pure functions over one value:

```ts
export type TableCellStyle = { bg?: string; align?: 'left'|'center'|'right';
  verticalAlign?: 'top'|'middle'|'bottom'; bold?: boolean; italic?: boolean;
  underline?: boolean; strikethrough?: boolean; color?: string };
export type TableGrid = {
  readonly rows: readonly (readonly string[])[];
  readonly columns: readonly string[];
  readonly cellStyles: Readonly<Record<string, TableCellStyle>>;   // key `${row}-${col}`
};
```

Functions (each returns a NEW `TableGrid`, never mutates its input):

| Function | Behavior |
|---|---|
| `insertRow(grid, at)` | empty row at index `at` (0..rows.length); styles at rows ≥ at shift down by one |
| `deleteRow(grid, index)` | removes it and its styles; styles below shift up. **No-op (returns the same grid) when only one row remains** |
| `duplicateRow(grid, index)` | copy of row text AND its styles inserted at `index + 1`; styles below shift |
| `clearRow(grid, index)` | text of that row set to `""`; **styles kept** |
| `insertColumn(grid, at)` | empty column at `at`, named `nextColumnName(columns)`; styles at cols ≥ at shift right |
| `deleteColumn(grid, index)` | mirror of deleteRow; no-op at one column |
| `duplicateColumn(grid, index)` | mirror of duplicateRow; the copy gets `nextColumnName` |
| `clearColumn(grid, index)` | mirror of clearRow |
| `setRowStyle(grid, index, patch)` / `setColumnStyle(grid, index, patch)` | merges `patch` into every cell style in that row/column; a patch value of `undefined` REMOVES that key; a cell style that ends up empty is removed from `cellStyles` |
| `nextColumnName(columns)` | first unused name in A, B, …, Z, AA, AB, … |

Style keys that do not parse as two non-negative integers, or that point outside the grid, are
dropped by every function (they are unreachable today and would otherwise shift incorrectly).

### 2.2 Wire the editor to it

In `TableEditor.tsx`, every existing structural path goes through the pure functions so rows,
columns and cellStyles change **together**: `addRow`, `addRowAbove`, `addRowBelow`, `addColumn`,
`addColumnLeft`, `addColumnRight`, `deleteRow`, `deleteColumn`. Keep the three `useState`s; apply
one grid result to all three in the same handler. Behavior the user sees for these actions is
unchanged except that styles now follow their cells and column names are unique.

### 2.3 Row and column handles

- **Row handle**: the existing row-number cell (first `<td>` of each body row). On hover of that
  row, show a small grip button (`GripVertical` from lucide, or the "=" look in the owner's
  screenshot) in that cell, `aria-label="Row {n} options"`. Clicking it opens the row menu.
- **Column handle**: the existing column-letter `<th>`. On hover, show a small grip button at the
  top-center of the header cell, `aria-label="Column {name} options"`. Clicking it opens the column
  menu and must `stopPropagation` so the existing header-click column selection does not also run.
  Clicking the header outside the grip keeps selecting the column exactly as today.
- Grips are visible on hover and while their own menu is open; keyboard-focusable with a visible
  focus ring.

### 2.4 The two menus — `components/collabboard/menus/TableAxisMenu.tsx` (new)

One component, `axis: 'row' | 'column'`, built from the SAME positioned primitives
`TableCellContextMenu` uses (`PositionedContextMenu`, `…Item`, `…Separator`, `…Sub`,
`…SubTrigger`, `…SubContent` from `@/components/ui/context-menu`). Opened at the grip's position.

Row menu, in order:
```
Insert above
Insert below
────
Color            ▸  (CELL_COLORS swatches + "None")
Align            ▸  Left / Center / Right   (checkmark when every cell in the row shares it)
────
Duplicate
Clear contents
Delete            (destructive variant; hidden when only one row)
```
Column menu: the same with `Insert left` / `Insert right`, and `Delete` hidden when only one column.

Icons at the left of each item as in the owner's screenshot (lucide: `ArrowUpToLine`,
`ArrowDownToLine`, `ArrowLeftToLine`, `ArrowRightToLine`, `Palette`, `AlignLeft`, `Copy`,
`Eraser`, `Trash2`). The menu receives the row/column INDEX as a prop and calls
`onAction(action)` / `onColor(bg | undefined)` / `onAlign(align)`; the editor maps those to the
pure functions for that index. The menu closes after any action.

"Set to page width" and "Distribute columns evenly" are **not** in this patch — they need column
widths, which is PATCH-167.

### 2.5 The "+" bars

- Below the table's scroll viewport: a thin full-width bar with a centered `+`, title/tooltip
  `Click to add a new row`, `aria-label="Add row"` → appends a row (`insertRow(grid, rows.length)`).
- Right of the viewport: a thin full-height bar with `+`, `Click to add a new column`,
  `aria-label="Add column"` → appends a column.
- Quiet by default (light gray), darker on hover. They sit OUTSIDE the scrolling viewport so they
  are always reachable. The toolbar's existing "Add row" / "Add column" buttons stay.

### 2.6 Untouched

- `components/collabboard/menus/TableCellContextMenu.tsx` — not one byte. Its characterization
  suite pins its action set and order; the new actions live in the handle menus.
- The saved JSON shape (`rows`, `columns`, `cellStyles`, …) — unchanged. Old tables open unchanged.
- Comments, caption, title, toolbar, cell selection, formulas, cell types.

## 3. Tests

**`lib/domain/canvas/tableStructure.test.ts`** (new) — for every function:
- text result exact;
- style re-keying exact (use a 3×3 grid with styles on several cells incl. the edited row/column,
  before and after it);
- input object and its arrays are not mutated (`Object.freeze` the input deeply);
- delete at one row / one column returns the input unchanged;
- `setRowStyle`/`setColumnStyle`: merge, `undefined` removes a key, empty style removed;
- `nextColumnName`: `[]→A`, `[A,B,C]→D`, `[A,C]→B`, `[A..Z]→AA`;
- invalid / out-of-range style keys are dropped.

**`components/collabboard/editors/TableEditor.handles.test.tsx`** (new; use the
react-dom/client + act harness of `TableEditor.commentCanonicalization.test.tsx`; assert through
`onSave`'s JSON, via the editor's existing save-and-close path):
- A row grip opens a menu with exactly the row items in order; a column grip likewise.
- Insert above on row 2 with a colored cell in row 2 → saved `cellStyles` has that color on row 3.
- **Regression for the old bug via the RIGHT-CLICK path**: right-click a cell in row 1, Add Row
  Above → the style that was on row 1 is now on row 2.
- Duplicate copies text and style; Clear contents clears text and keeps style; Delete removes.
- Delete is absent from the row menu when there is one row (and the column mirror).
- Color → sets `bg` on every cell of that row; "None" removes it. Align likewise.
- Clicking the column grip does NOT change the selection the header click would make.
- "+" bars append a row / a column; the new column name is unique after a delete.

**Existing suites must pass untouched**, specifically
`tableCellContextMenu.characterization.test.tsx`, `TableEditor.commentCanonicalization.test.tsx`,
`tableLayerActions.architecture.test.tsx`, `freeformTableSelection.characterization.test.tsx`.
If any of them fails, stop and report — do not edit them.

## 4. Allowed files

```
lib/domain/canvas/tableStructure.ts                          (new)
lib/domain/canvas/tableStructure.test.ts                     (new)
components/collabboard/menus/TableAxisMenu.tsx               (new)
components/collabboard/editors/TableEditor.tsx
components/collabboard/editors/TableEditor.handles.test.tsx  (new)
```

Forbidden: `TableCellContextMenu.tsx`, any existing test file, any drawing-canvas code,
`package.json`, migrations.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/canvas/tableStructure.test.ts components/collabboard/editors components/collabboard/tableCellContextMenu.characterization.test.tsx components/collabboard/tableLayerActions.architecture.test.tsx components/collabboard/freeformTableSelection.characterization.test.tsx
npx vitest run
```

Failing FILE set equal to the 26 baseline. Report: files changed, test counts, and quote the
handler in `TableEditor.tsx` that applies one `TableGrid` result to rows, columns and cellStyles.
Do not commit. The CTO verifies live afterwards.

## 6. Commit message (verbatim)

```
feat(table): row and column handle menus, and "+" bars to add rows and columns

Each row and column of a table now has a small handle that opens a menu for that row or
column: insert, color, align, duplicate, clear contents and delete. A "+" bar under the
table and beside it appends a row or a column. The right-click cell menu is unchanged.

Every structural change now goes through one set of pure functions, which also fixes two
old bugs: a cell's color and formatting stayed on its old position when a row or column
was inserted or deleted, so it moved to the wrong cell; and a new column could get a name
that already existed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
