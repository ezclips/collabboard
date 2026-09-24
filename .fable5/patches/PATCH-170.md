# PATCH-170 — table column widths: drag to resize, fit to content, distribute evenly

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

Every table column is a fixed 100px (`TABLE_CELL_WIDTH` in `TableEditor.tsx`). Longer text —
and every AI answer from Fill with AI / Ask AI — is cut off ("Guten Mor…"). The owner's
reference (AppFlowy's table) resizes columns and has "Distribute columns evenly" in the column
menu. Their "Set to page width" does not translate to a canvas post (there is no page), so it
is replaced by the spreadsheet-standard **Fit to content**.

## 2. The design

### 2.1 Data — widths per column, saved with the table

- Saved content gains `columnWidths?: number[]`, aligned index-for-index with `columns`.
- Missing, wrong length, or any non-finite entry → every column is 100 (old tables open exactly
  as today). Each width is clamped to **60..600** px on read and on write.
- Saved ONLY when some width differs from 100; a table whose widths are all 100 saves without
  the key, so untouched tables keep byte-identical content.

### 2.2 Structure functions keep widths aligned — `lib/domain/canvas/tableStructure.ts`

`TableGrid` gains optional `columnWidths?: readonly number[]`. Every function keeps it aligned
when present (and leaves it absent when absent):
`insertColumn` → inserts 100 at the position; `deleteColumn` → removes that entry;
`duplicateColumn` → copies the source column's width; row functions and style functions leave
it unchanged. Add pure helpers:
- `normalizeColumnWidths(widths: unknown, columnCount: number): number[]` (2.1's rules);
- `distributeColumnWidths(widths): number[]` — every column gets the average of the current
  total (rounded down; clamped);
- `fitColumnWidth(texts: readonly string[], headerText: string): number` — estimate: longest
  of the texts and the header, `ceil(length × 7.5) + 24`, clamped 60..600. (A character-count
  estimate on purpose: it is deterministic and testable; say so in the comment.)

The editor's `applyGrid` / `currentGrid` carry widths as the fourth part of the one table value,
so a structural change can never leave widths misaligned.

### 2.3 Resizing in the editor — `TableEditor.tsx`

- Each column header gets a resize handle on its RIGHT edge: a 6px-wide absolutely positioned
  strip, `cursor-col-resize`, visible as a blue line on hover and while dragging,
  `data-table-column-resize={i}`, `aria-label="Resize column {name}"`.
- Drag: pointerdown on the handle captures the pointer; pointermove sets that column's width to
  `startWidth + (x - startX)`, clamped; pointerup ends. The handle's pointerdown must
  `stopPropagation` so it never selects the column or starts a cell selection.
- **Double-click** the handle → Fit to content for that column.
- Header cells and body cells use the column's width instead of `TABLE_CELL_WIDTH`
  (`width`, `minWidth`, `maxWidth` all = the column width).
- Keyboard: when the handle is focused, ArrowLeft/ArrowRight change the width by 10px.
- Locked while AI fill suggestions are pending (`fillLocked`), like every other structure edit.

### 2.4 Column menu — `TableAxisMenu.tsx`

Column menu only, a new group after Align (before Duplicate's separator):
```
Fit to content              (lucide MoveHorizontal)
Distribute columns evenly   (lucide Columns3)
```
`Fit to content` fits THAT column; `Distribute columns evenly` applies to all columns. The row
menu does not get them. New `TableAxisAction` values `'fit-width'` and `'distribute-widths'`.

### 2.5 The card on the board — `FreeformPadletCards.tsx` (table branch only)

The card keeps its current overall size. Columns get PROPORTIONAL widths via a `<colgroup>`:
each column `width: {w / total × 100}%`, with `table-layout: fixed`, so a wide column is wide on
the card too. With no `columnWidths`, render exactly as today (no colgroup).

## 3. Tests

**`lib/domain/canvas/tableStructure.test.ts`** — ADD: widths stay aligned through
insert/delete/duplicate column (and are untouched by row ops); absent stays absent;
`normalizeColumnWidths` (missing, wrong length, NaN, clamp); `distributeColumnWidths`;
`fitColumnWidth` (short → 60, long → clamped 600, header counts).

**`components/collabboard/editors/TableEditor.widths.test.tsx`** (new; harness of
`TableEditor.handles.test.tsx`; simulate pointer events the way a browser sends them):
- an old table (no `columnWidths`) renders 100px columns and saves WITHOUT `columnWidths`;
- dragging a handle +80px saves that column at 180, others absent-as-default (the array is
  saved with 100s for the rest); dragging far left clamps to 60;
- pointerdown on the handle does not select the column (header selected look unchanged);
- double-click fits to content; ArrowRight on a focused handle adds 10;
- column menu shows `Fit to content` and `Distribute columns evenly`; the row menu does not;
- Distribute evenly → all equal to the average;
- insert a column left of a 180px column → the 180 moves with its column;
- while fill suggestions are pending, dragging does nothing.

**Canvas card** — ADD to `components/collabboard/freeformTableCellSize.test.tsx` (source-level,
as that file already is): the table branch emits a colgroup with percentage widths only when
`columnWidths` is present.

All existing table suites pass untouched (handles, fill, askai, rows, commentCanonicalization,
characterization; `freeformTableSelection` baseline member — same failing test name).

## 4. Allowed files

```
lib/domain/canvas/tableStructure.ts, tableStructure.test.ts
components/collabboard/editors/TableEditor.tsx
components/collabboard/menus/TableAxisMenu.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the table branch only)
components/collabboard/editors/TableEditor.widths.test.tsx  (new)
components/collabboard/freeformTableCellSize.test.tsx       (additions only)
```

Forbidden: drawing-canvas code, other existing tests, migrations, `package.json`.
Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/canvas components/collabboard/editors components/collabboard/freeformTableCellSize.test.tsx components/collabboard/tableCellContextMenu.characterization.test.tsx components/collabboard/freeformTableSelection.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live.

## 6. Commit message (verbatim)

```
feat(table): resize columns, fit a column to its content, distribute widths evenly

Every table column was a fixed 100px, so longer text and AI answers were cut off. A column
now has a resize handle on the right edge of its header: drag it, double-click it to fit the
column to its content, or use the arrow keys. The column menu gains "Fit to content" and
"Distribute columns evenly". Widths are saved with the table and shown proportionally on the
card on the board; a table nobody resized saves exactly as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
