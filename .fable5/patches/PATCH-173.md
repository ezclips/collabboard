# PATCH-173 — Fill this row with AI, a ✨ on AI-filled cells, Undo, a real instruction box

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-172 (column titles, right-click menus)

---

## 1. Why

The owner's use case: type a car's brand and model in a row, and have the AI fill that row's
other cells — oil capacity, tank capacity, coolant capacity — each from its COLUMN TITLE, in
one go. Today Fill with AI works one column at a time. Plus three owner-approved refinements:
a ✨ marker on cells the AI filled, an Undo after accepting, and a multi-line instruction box.

Honesty rule, stated in the UI: the model answers from what it learned, not a live search. Every
value is still a reviewed suggestion, and the prompt tells the model to leave a cell empty rather
than guess.

## 2. The design

### 2.1 No new route — reuse `/api/ai/table-fill`

The route's contract is `{ preset, detail, items: {row, input}[] }` → `{ values: {row, value}[] }`
where `row` is just an item KEY. A row fill sends ONE item per target cell, keyed by COLUMN
index, with `preset: 'custom'`:

- `detail` = `ROW_FILL_INSTRUCTION` (≤ 300 chars incl. the optional extra): "Each input
  describes one item and names one field after 'Find:'. Answer with only that field's value for
  that item, with its unit if it has one. If you are not confident, answer an empty string. Do
  not guess." + (if given) ` Also: {extra}` — the extra is capped so the whole stays ≤ 300.
- each item `{ row: colIndex, input: "{Title}: {value} | {Title}: {value} | Find: {target title}" }`
  built from the row's NON-empty cells other than the target (same `Name: value` form as the
  column fill), capped as the column fill caps.

Pure helper in `lib/domain/ai/tableFill.ts`:
`buildRowFillItems(grid, rowIndex, replaceExisting): { items, skippedForLimit, defaultTitleCount }`
- targets = that row's empty cells (or all cells with the checkbox), EXCLUDING columns that are
  the only non-empty source (a row must keep at least one filled cell to describe the item);
- a row with no non-empty cell → no items;
- `defaultTitleCount` = targets whose column title is still a default name (a pure A–Z / AA…
  letter name, i.e. matches `^[A-Z]{1,3}$`).
And `rowFillInstruction(extra?: string): string`.

### 2.2 The row menu item and panel

- Row menu gains `Fill row with AI…` (lucide `Sparkles`) after Align, before the separator.
- It opens a panel (same placement and one-panel-at-a-time rule as Fill with AI / Ask AI):
  - title `Fill row with AI`, one muted line: `Fills {n} empty cells in row {r} from each
    column's title.`
  - if `defaultTitleCount > 0`: an amber hint `Give your columns titles first — the AI uses them
    to know what to fill. (Double-click a column letter.)` — Generate stays enabled.
  - a muted note: `Answers come from the AI's knowledge, not a web search — check them.`
  - `Extra instruction (optional)` textarea (3 rows, max 150 chars), e.g. "Use litres".
  - the same `Also replace cells that already have text` checkbox.
  - Cancel / Generate (Generating…), errors shown, timeout message as the column panel.
- The response's `row` keys are COLUMN indices for this request; map them back.

### 2.3 One suggestion model for both fills — `TableEditor.tsx`

Generalize the pending suggestions from `{ column, values: {row,value}[] }` to
`{ cells: { row: number; col: number; value: string }[] }`. The column fill maps its values to
`{row, col: targetColumn}`; the row fill to `{row: targetRow, col}`. Rendering (purple italic,
`data-table-fill-suggestion`), the lock, `Accept all`, `Discard`, and save-and-close-drops-them
all work on the cell list. Behaviour of the column fill must not change (its tests stay green).

### 2.4 ✨ on AI-filled cells

- `TableCellStyle` gains `aiFilled?: true` (in `tableStructure.ts` and the editor's `CellStyle`),
  so every structural function moves it with its cell for free.
- `Accept all` (column fill AND row fill) sets `aiFilled: true` on every accepted cell.
- Editing a cell's text by hand (the cell input's change handler), `Clear contents`, Cut, Paste
  and Ask AI's `Insert into cell` REMOVE `aiFilled` from that cell (it is no longer the AI's
  text). An empty style object is removed, as elsewhere.
- Rendering: a small `✨` (or lucide `Sparkles` 10px), gray-400, `aria-label="Filled by AI"`,
  `title="Filled by AI"`, in the cell's BOTTOM-right corner (top-right holds the menu triangle),
  `pointer-events-none`. Same on the card on the board (`FreeformPadletCards.tsx` table branch),
  scaled down.

### 2.5 Undo after Accept all

- On `Accept all`, keep a snapshot of the table (rows, cellStyles) from just before, and show a
  small bar/toast inside the editor: `Filled {n} cells · Undo`, for 10 seconds.
- `Undo` restores the snapshot exactly and removes the toast.
- The toast (and the snapshot) disappear after 10 s, or as soon as ANY other change is made to the
  table (typing, structure, style, width, title) — so Undo can never overwrite later work.

### 2.6 The column panel's instruction box

In `TableFillPanel.tsx`, the Custom `Instruction` field becomes a `<textarea>` (3 rows, resize
vertical, max 300 chars, same id/label). Categories and Language stay single-line inputs.

## 3. Tests

**`lib/domain/ai/tableFill.test.ts`** — ADD `buildRowFillItems`: targets = empty cells; replace
option; the only filled cell is never a target; empty row → no items; input format with
`Find:`; caps; `defaultTitleCount`; `rowFillInstruction` with/without extra and ≤ 300.

**`components/collabboard/editors/TableEditor.rowfill.test.tsx`** (new; harness of the fill test;
open menus by RIGHT-click as since PATCH-172; mock fetch):
- the row menu shows `Fill row with AI…`; the column menu does not;
- Generate posts `preset:'custom'` with `ROW_FILL_INSTRUCTION` and one item per empty cell keyed
  by column index with the exact `Find:` input;
- suggestions appear in that ROW's cells; Accept all writes them and sets `aiFilled`; Discard
  does not;
- the default-title hint shows for A/B/C and not after renaming;
- ✨ renders on accepted cells; typing in one removes its ✨ (and `aiFilled` in saved JSON);
- Undo restores the previous content; Undo disappears after another edit; after 10 s (fake
  timers);
- column fill still works and also sets `aiFilled` (one case).

**`TableEditor.fill.test.tsx`** — must pass UNCHANGED except where it inspects the old
`{column, values}` state shape directly (report any such change).

**Card** — ADD to `freeformTableCellSize.test.tsx` (source-level): the table branch renders the ✨
only when `aiFilled`.

## 4. Allowed files

```
lib/domain/ai/tableFill.ts, tableFill.test.ts
lib/domain/canvas/tableStructure.ts                            (type only)
components/collabboard/editors/TableEditor.tsx
components/collabboard/editors/TableFillPanel.tsx
components/collabboard/editors/TableRowFillPanel.tsx            (new)
components/collabboard/menus/TableAxisMenu.tsx
components/collabboard/canvas/ui/FreeformPadletCards.tsx        (the table branch only)
components/collabboard/editors/TableEditor.rowfill.test.tsx     (new)
components/collabboard/editors/TableEditor.fill.test.tsx        (only if the state shape is inspected)
components/collabboard/freeformTableCellSize.test.tsx           (additions only)
```
Forbidden: the table-fill ROUTE and its test (unchanged contract), other existing tests,
migrations, `package.json`. Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/ai lib/domain/canvas lib/server/ai/tableFillRoute.test.ts components/collabboard/editors components/collabboard/freeformTableCellSize.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live with a real call.

## 6. Commit message (verbatim)

```
feat(table): fill a whole row with AI from the column titles, mark AI cells, undo a fill

A row's menu now has "Fill row with AI…": type what the row is about (a car's brand and
model, say), and the AI suggests every empty cell from its column title in one request. The
answers are suggestions, reviewed before anything is written; the panel says they come from
the AI's knowledge rather than a search, and the model is told to leave a cell empty rather
than guess.

Cells the AI filled now show a small sparkle until someone edits them, on the card too.
After "Accept all", an Undo is offered for ten seconds, and disappears as soon as anything
else changes. The custom instruction for a column fill is now a multi-line box.

It reuses the table-fill route unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
