# PATCH-169 — table: select a row by its number, text sizes in the Text style panel, no surprise panel

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why — three owner reports, each reproduced by the CTO

1. **"You can select a column but you cannot select a row."** Clicking a column LETTER selects
   the column. Clicking a row NUMBER opens the row menu instead, because the PATCH-165 row grip
   is `absolute inset-0` — it covers the whole row-number cell. There is no way to select a row.
2. **"The text style panel is missing the top half where you select the different font
   styles."** Every other Text style panel uses `TextStylePopup`, whose top section lists text
   sizes (Large heading, Normal heading, Normal text, Small text, …). The table's own panel was
   built without it — its code comment says "(absent here) font-size section".
3. **"A simple click opens the text style panel … only when you highlight the text."**
   Reproduced: clicking a column letter over a column that has text auto-opens Text style. An
   effect in `TableEditor.tsx` (the block with `isMultiCell && !pinnedTextStyle && !aiPanelOpen
   && activeSubmenu !== "textStyle"` → `setActiveSubmenu("textStyle")`) opens it for ANY
   multi-cell selection containing text. The highlight path (`checkTextHighlight`) is correct
   and stays.

## 2. The changes

### 2.1 Row selection — `TableEditor.tsx`

- Add `handleRowHeaderClick(rowIndex, e)`, the exact mirror of `handleColumnHeaderClick`:
  selects the whole row (`start {row, col:0}` → `end {row, col: columns.length-1}`), sets
  `selectedCell` to `{row, col:0}`, `toolbarMode 'inside'`, closes submenus; with Shift and an
  existing range it extends from the range's start row to this row (all columns).
- The row-number `<td>` gets `onClick={(e) => handleRowHeaderClick(row.index, e)}`,
  `cursor-pointer hover:bg-gray-200`, and the same selected look the column header has
  (`bg-purple-100 text-purple-700` when the selection covers that entire row).
- The row grip stops covering the cell: make it the same small bordered button the column grip
  is, placed at the LEFT edge of the row-number cell, vertically centered
  (`absolute left-0.5 top-1/2 -translate-y-1/2`), revealed on row hover / focus / while its
  menu is open. Its click `stopPropagation`s so it never also selects the row. The row NUMBER
  stays visible at all times.
- `fillLocked` still makes both the row-number click and the grip inert.

### 2.2 No auto-open — `TableEditor.tsx`

Remove the auto-open in that effect: a multi-cell selection (drag, column letter, row number)
never opens Text style by itself. Keep everything else the effect does, if anything; if the
whole effect exists only to auto-open, delete it. Text style still opens (a) when text inside a
cell is highlighted (`checkTextHighlight`, unchanged) and (b) from the toolbar's Text style
button (unchanged).

### 2.3 Text sizes — cell style `size`

- `TableCellStyle` (in `lib/domain/canvas/tableStructure.ts`) and the editor's `CellStyle` gain
  `size?: 'h1' | 'h2' | 'small'`. ABSENT means normal text — "Normal text" REMOVES the key, so
  existing tables are unchanged and no `normal` value is ever stored.
- The table's Text style panel gains, ABOVE the formatting buttons, the same size list
  `TextStylePopup` shows, restricted to the four that fit a single-line cell, in this order:
  `Large heading`, `Normal heading`, `Normal text`, `Small text`, with the same row look and
  checkmark for the current value (take the labels/classNames from `TextStylePopup`'s list —
  export that list from `TextStylePopup.tsx` as a named constant rather than copying it; do not
  change its values or the popup's behaviour). Code block / Callout / Quote are NOT offered.
- Choosing one applies to the whole selection through the existing `applyStyleToSelection`.
- Shown only when the panel targets a CELL; hidden when it targets the Post name.
- Editor cell rendering (the `<td>` style that already applies bold/italic/color):
  `h1` → `fontSize 18px, fontWeight 700`; `h2` → `16px, 600`; `small` → `12px`, color
  `#6b7280` unless the cell has its own color; absent → unchanged (14px). Bold still wins
  (`bold` → 700).
- Canvas card (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`, ONLY the table
  branch that already reads `cellStyles`): the same sizes RELATIVE to the card's own base size —
  `h1` `1.3em`/700, `h2` `1.15em`/600, `small` `0.85em` — so the card looks like the editor,
  just smaller.

## 3. Tests

**`components/collabboard/editors/TableEditor.rows.test.tsx`** (new; harness of
`TableEditor.handles.test.tsx`):
- clicking row number 2 selects that whole row (verify via the row's cells' selected look and
  that a Color action from the toolbar/cell menu applies to all cells of that row — or via a
  save-and-close JSON after applying a style to the selection);
- Shift-click on row 3 after row 1 selects rows 1–3;
- the row number stays in the DOM text while hovering; clicking the row grip opens the row
  menu and does NOT select the row (the mirror of the PATCH-165 column-grip test);
- clicking a column letter over a column with text does NOT open Text style (no
  `Editing: Cell` in the DOM); a row-number click does not either; highlighting text in a cell
  input (selectionStart < selectionEnd, then mouseup) DOES open it;
- the Text style panel shows `Large heading`, `Normal heading`, `Normal text`, `Small text` in
  that order for a cell, and not for the Post name; choosing Large heading on a selected row
  saves `size: 'h1'` for every cell of the row; Normal text removes the key.

**`lib/domain/canvas/tableStructure.test.ts`** — ADD: a style with `size` moves with its cell on
insert/delete/duplicate (one case is enough).

**Canvas card** — ADD a focused test (new file
`components/collabboard/freeformTableCellSize.test.tsx`, or a source-level test if rendering
FreeformPadletCards is impractical — say which) that a cell with `size: 'h1'` renders with the
relative size above.

Existing suites pass untouched, especially the PATCH-165/166/168 table tests, the
characterization suite, and `freeformTableSelection.characterization.test.tsx` (a baseline
member — diff its failing test NAMES before and after; they must be identical).

## 4. Allowed files

```
components/collabboard/editors/TableEditor.tsx
components/collabboard/editors/TextStylePopup.tsx          (export the list only)
lib/domain/canvas/tableStructure.ts, tableStructure.test.ts (type + one added case)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the table branch only)
components/collabboard/editors/TableEditor.rows.test.tsx    (new)
components/collabboard/freeformTableCellSize.test.tsx       (new)
```

Forbidden: any drawing-canvas code, other existing tests, migrations, `package.json`.
Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/editors lib/domain/canvas components/collabboard/freeformTableCellSize.test.tsx components/collabboard/freeformTableSelection.characterization.test.tsx components/collabboard/tableCellContextMenu.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live.

## 6. Commit message (verbatim)

```
fix(table): select a row by its number, text sizes in Text style, no surprise panel

Three reports from the owner. A row could not be selected: its number was covered by the row
menu's handle. Clicking a row number now selects the row, as clicking a column letter selects
the column, and the handle is a small button beside the number.

The table's Text style panel lacked the text sizes every other Text style panel has. It now
offers Large heading, Normal heading, Normal text and Small text for the selected cells, and
the card on the board shows them too.

Selecting a column or several cells no longer opens Text style by itself; it opens when text
is highlighted, or from the toolbar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
