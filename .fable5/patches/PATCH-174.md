# PATCH-174 — table basics: sort by column, find & replace, column summary

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

Researched ExcelFlow, excel-ai-assistant and Univer (ideas only, no code). All of them rest on a
set of plain table operations the AI then drives. Our table lacks three that every spreadsheet
user expects — sort, find & replace, a column total. This patch adds them as ordinary features,
built as PURE functions, because the next patch ("Ask the table") will let the AI plan with
exactly these functions. Numbers are always computed by code, never by the AI.

## 2. The design

### 2.1 Numbers in cells — `lib/domain/canvas/tableNumbers.ts` (new, pure)

`parseCellNumber(text: string): { value: number; unit: string } | null`
- trims; accepts an optional leading sign, digits with thousands separators, an optional
  decimal part, then an optional unit (any trailing non-numeric text, trimmed, ≤ 12 chars):
  `"50"`, `"4.5 L"`, `"1,234.5"`, `"-3"`, `"12%"` (unit `%`), `"4,5 L"`.
- Decimal comma rule (the owner's region writes `4,5`): a single comma with no dot and 1–2
  digits after it is a DECIMAL comma (`4,5` → 4.5); otherwise commas are thousands separators
  (`1,234` → 1234). Dots are always decimal points. State the rule in the code comment.
- Anything else (empty, text first, two numbers) → `null`.

`summarizeColumn(texts: readonly string[], kind): { value: number | null; unit: string; counted: number }`
for `kind` ∈ `'sum' | 'average' | 'count' | 'min' | 'max'`:
- `count` = number of NON-EMPTY cells (text or number).
- the others use the cells that parse; `value: null` when none do.
- `unit` = the shared unit when every parsed cell has the same unit, else `''`.
`formatSummary(kind, result)`: e.g. `Sum 54.5 L`, `Average 18.17`, `Count 3`, `Min —` when null;
up to 2 decimals, trailing zeros dropped.

### 2.2 Sort — `lib/domain/canvas/tableStructure.ts`

`sortRowsByColumn(grid, col, direction: 'asc' | 'desc'): TableGrid`
- If every non-empty cell in the column parses (`parseCellNumber`), sort numerically; otherwise
  text sort with `localeCompare(undefined, { numeric: true, sensitivity: 'base' })`.
- Empty cells ALWAYS last, in both directions. Stable for equal keys.
- Whole rows move with their `cellStyles` (re-keyed by the new row order, including `size` and
  `aiFilled`). Columns, widths and summaries unchanged.

Column menu, after `Distribute columns evenly`, a new group:
`Sort A → Z` (lucide `ArrowDownAZ`) and `Sort Z → A` (lucide `ArrowUpZA`). Actions `'sort-asc'`,
`'sort-desc'`.

### 2.3 Column summary

- Saved content gains `columnSummaries?: (null | 'sum' | 'average' | 'count' | 'min' | 'max')[]`,
  aligned with `columns` exactly like `columnWidths` (PATCH-170): missing/wrong length → all
  `null`; saved only when some entry is non-null. `TableGrid` carries it; insert/delete/duplicate
  column keep it aligned (duplicate copies it, insert adds `null`).
- Column menu: `Summary ▸` (lucide `Sigma`) submenu: `None`, `Sum`, `Average`, `Count`, `Min`,
  `Max`, checkmark on the current one.
- The editor shows a footer row under the table when any column has a summary: a gray-50 row,
  small muted text, each cell `formatSummary(...)` for its column (empty for `null`). Not
  editable, not selectable, not part of `rows`. Recomputed on every change.
- The card on the board shows the same footer row (table branch of `FreeformPadletCards.tsx`),
  computed with the same pure functions.

### 2.4 Find & replace

- The inside toolbar gains `Find` (lucide `Search`), after `Alignment`. Also `Ctrl/Cmd+F` while
  the table editor is open opens it (prevent the browser's find only inside the editor).
- Panel (same placement and one-panel-at-a-time rule as the AI panels): `Find` input, `Replace
  with` input, `Match case` checkbox, `Whole cell only` checkbox, `Only in selection` checkbox
  (disabled when there is no multi-cell selection).
- While typing in Find: matching cells get a yellow-300 inset outline
  (`data-table-find-match`), and the panel shows `{n} cells match`.
- `Replace all` → pure `replaceInTable(grid, { find, replace, matchCase, wholeCell, range? })`
  returning `{ grid, replaced: number }` (counts cells changed). Replacing clears `aiFilled` on
  every cell it changed (the text is no longer the AI's). Panel shows `Replaced in {n} cells`.
- Empty `Find` → nothing highlighted, Replace all disabled.

### 2.5 Undo for sort and replace

Generalize PATCH-173's Accept-all Undo into one helper: `offerUndo(message, snapshot)` showing
`{message} · Undo` for 10 s, cleared by any other change. Use it for: Accept all (message as
today), Sort (`Sorted by {column title}`), Replace all (`Replaced in {n} cells`). The snapshot
covers rows, cellStyles, columnWidths, columnSummaries.

`fillLocked` blocks sort, summary changes and replace, like every other edit.

## 3. Tests

**`lib/domain/canvas/tableNumbers.test.ts`** (new): each accepted form incl. `4,5 L`, `1,234`,
`1,234.5`, `-3`, `12%`; rejects; `summarizeColumn` for every kind incl. shared/mixed units, count
of text cells, all-empty → null; `formatSummary` rounding and `—`.

**`lib/domain/canvas/tableStructure.test.ts`** — ADD: numeric vs text sort, empties last both
ways, stability, styles move with rows (incl. `aiFilled`), widths/summaries untouched;
`replaceInTable` (case, whole cell, range, count, `aiFilled` cleared only on changed cells);
summaries aligned through insert/delete/duplicate column.

**`components/collabboard/editors/TableEditor.basics.test.tsx`** (new; right-click opens menus):
- Sort A→Z / Z→A on a numeric column with units and an empty cell (saved JSON order);
- Summary ▸ Sum shows `Sum … L` in the footer and saves `columnSummaries`; None removes it;
  a table with no summaries saves without the key;
- Find highlights matching cells and shows the count; Replace all changes them, shows the
  message, and Undo restores; Ctrl+F opens the panel;
- sort offers Undo; any other change clears it.

**Card** — ADD to `freeformTableCellSize.test.tsx` (source-level): the footer row renders only
when `columnSummaries` has a non-null entry.

All existing table suites pass untouched.

## 4. Allowed files

```
lib/domain/canvas/tableNumbers.ts, tableNumbers.test.ts                 (new)
lib/domain/canvas/tableStructure.ts, tableStructure.test.ts
components/collabboard/editors/TableEditor.tsx
components/collabboard/editors/TableFindReplacePanel.tsx                 (new)
components/collabboard/menus/TableAxisMenu.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx                 (the table branch only)
components/collabboard/editors/TableEditor.basics.test.tsx               (new)
components/collabboard/freeformTableCellSize.test.tsx                    (additions only)
```
Forbidden: other existing tests, drawing-canvas code, migrations, `package.json`.
Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/canvas components/collabboard/editors components/collabboard/freeformTableCellSize.test.tsx components/collabboard/tableCellContextMenu.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live.

## 6. Commit message (verbatim)

```
feat(table): sort by a column, find and replace, and a summary row

Three basics every spreadsheet user reaches for. A column's menu can sort the table by it,
A to Z or Z to A: numbers sort as numbers (units such as "4.5 L" and decimal commas are
understood), empty cells stay last, and whole rows move with their formatting. The same menu
can add a summary under the column (sum, average, count, min, max), shown on the card too.
Find and replace highlights matching cells as you type and replaces them all at once. Sort
and replace can be undone for ten seconds, like accepting AI suggestions.

All three are pure functions, so the coming "Ask the table" AI can plan with exactly these
operations; the numbers are always computed by code, never by the AI.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
