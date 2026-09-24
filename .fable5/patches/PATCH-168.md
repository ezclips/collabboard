# PATCH-168 — "Ask AI…" on the selected table cells

Status: AUTHORIZED (starts after PATCH-167 is committed — same menu file)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

PATCH-166 gave a table AI for a whole COLUMN (Fill with AI). The owner approved the second half
of the plan: AI on the cells the user has SELECTED — summarize them, explain them, translate
them, or ask a question about them — from the right-click cell menu.

No new server route. The existing `/api/ai/text-action` already does exactly this shape of work
(`action: 'custom'`, `selectedText` ≤ 4,000 chars, `instruction` ≤ 1,000 chars, thinking off,
20 s), and the Note and Document editors already use it through `SelectedTextAIPanel`. The
table copies that panel's look and flow; it cannot reuse the component itself, which is bound
to a TipTap editor.

## 2. The design

### 2.1 Menu item

`TableCellContextMenu` gains ONE root item at the very top, its own group, followed by a
separator: `Ask AI…` with the lucide `Sparkles` icon, rendered like every other item after
PATCH-167. New prop `onAskAI?: () => void`. Everything else in the menu is unchanged.

### 2.2 What text is sent — a pure helper in `lib/domain/ai/tableAskAI.ts` (new)

`tableSelectionText(grid, range): { text: string; truncated: boolean }`
- `range` = the editor's normalized selection (`minRow..maxRow`, `minCol..maxCol`); a single
  selected cell is a 1×1 range.
- One line per selected row: `Row {n}: {Col}: {value} | {Col}: {value}` using the COLUMN NAMES
  and 1-based row numbers the user sees; empty cells are skipped; a row with no text is skipped.
- Capped at 4,000 chars (`TEXT_ACTION_SELECTED_TEXT_MAX`): stop at the last whole line that fits;
  `truncated: true` when anything was cut.
- Empty result → `{ text: '', truncated: false }`.

`tableAskAIInstruction(preset, detail): string` — the instruction sent as `instruction`:
- `summarize` → "Summarize these table cells in a few sentences."
- `explain` → "Explain what these table cells say, in plain language."
- `translate` → "Translate these table cells into {detail}. Keep the Row/column labels."
- `question` → "Answer this question using only these table cells: {detail}"
- (`detail` trimmed; required for translate/question.)

### 2.3 The panel — `components/collabboard/editors/TableAskAIPanel.tsx` (new)

Opened by `Ask AI…`, anchored beside the table like the Fill with AI panel (never both open:
opening one closes the other). It captures the selection text AT OPEN TIME.

- Header `Ask AI` + close button. Under it, one muted line: `{n} cells selected` and, when
  truncated, `(only the first part fits)`.
- `AIRoleModelChooser` for role `edit`, exactly as `SelectedTextAIPanel` shows it.
- Four buttons: `Summarize`, `Explain`, `Translate…`, `Ask a question…`. The two with `…`
  reveal one text field (`Language` / `Question`) and a `Go` button.
- Request: `fetch('/api/ai/text-action', { method:'POST', body: JSON.stringify({ action:'custom',
  selectedText: text, instruction, purpose: AI_ROLE_EDIT }) })`, with AbortController and a
  client timeout of 25 s; aborted on close/unmount; a stale response is ignored (generation
  counter, as `SelectedTextAIPanel` does).
- Loading: `Thinking…` text, buttons disabled.
- Result: the answer as plain TEXT (never HTML), `whitespace-pre-wrap`, scrollable if long, then:
  - `Insert into cell` — writes the answer into the CURRENTLY selected cell (the active cell at
    the moment of the click), newlines collapsed to single spaces; disabled with a hint
    `Select a cell first` when there is none. If that cell has text, the button reads
    `Replace cell text`. Goes through the editor's single writer (`applyGrid` or the existing
    cell-change path), styles untouched.
  - `Copy` — `navigator.clipboard.writeText(answer)`; shows `Copied` briefly.
  - `Ask again` — back to the four buttons.
- Errors ARE shown: the route's `error` message, or `The AI didn't answer in time.`
- Empty selection: the panel shows `The selected cells are empty.` and no buttons.
- The table is NOT locked while the panel is open (it only writes on an explicit click).

## 3. Tests

**`lib/domain/ai/tableAskAI.test.ts`** — single cell; a 2×3 range uses column names and 1-based
row numbers; empty cells and empty rows skipped; 4,000 cap stops at a whole line and reports
truncated; empty selection; each preset's instruction; detail trimmed.

**`components/collabboard/editors/TableEditor.askai.test.tsx`** (harness of
`TableEditor.fill.test.tsx`; mock `fetch`):
- right-click menu shows `Ask AI…` first; choosing it opens the panel with `{n} cells selected`;
- Summarize posts exactly `{ action:'custom', selectedText, instruction, purpose:'edit' }` with
  the expected text for a selected range;
- the answer renders as text (an answer containing `<b>x</b>` shows the literal characters);
- Insert into cell writes to the active cell (verified through save-and-close JSON), newlines
  collapsed, styles untouched; the label reads `Replace cell text` over a non-empty cell;
- a 502 shows the error; empty selection shows the empty message and sends nothing;
- opening Ask AI closes an open Fill with AI panel and vice versa.

**Characterization suite** — ADD the new root item: update the pinned root action set/order and
the separator count by exactly the one new item and one new separator, and ADD a test that
`Ask AI…` fires `onAskAI` and nothing else. No other assertion changes. Report the diff.

## 4. Allowed files

```
lib/domain/ai/tableAskAI.ts, tableAskAI.test.ts                         (new)
components/collabboard/editors/TableAskAIPanel.tsx                      (new)
components/collabboard/editors/TableEditor.askai.test.tsx               (new)
components/collabboard/editors/TableEditor.tsx
components/collabboard/menus/TableCellContextMenu.tsx
components/collabboard/tableCellContextMenu.characterization.test.tsx  (additions described above only)
```

Forbidden: any server route, `text-action`, other existing tests, migrations, `package.json`.
Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/ai/tableAskAI.test.ts components/collabboard/editors components/collabboard/tableCellContextMenu.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live with a real call.

## 6. Commit message (verbatim)

```
feat(table): ask AI about the selected cells

Right-clicking a table cell now offers "Ask AI…": summarize, explain or translate the
selected cells, or ask a question about them. The answer appears in a panel as plain text;
the user can copy it or insert it into a cell, and nothing is written until they do.

It adds no server route: it uses the same quick-action route and Edit & Rewrite model as
AI on selected text in notes and documents, with the cells sent under the column names and
row numbers the user sees.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
