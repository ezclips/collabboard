# Handoff to DeepSeek: the table post, after PATCH-174

Written by: CTO (PM), 2026-09-24
For: a fresh DeepSeek coding session (opencode, agent build)
Branch: `feature/board-retrieval`. HEAD is `6f287269` and in sync with origin.

This handoff tells you what the table post is today, where each part lives, and the rules you
work under. Read it and the files it names before any new patch. **Do not write code from this
document.** Code only from a `PATCH-XXX.md` spec that the CTO sends you.

## 1. How we work

- The CTO writes specs in `.fable5/patches/PATCH-XXX.md`. You implement exactly what a spec
  says, touching only its **Allowed files**. If something is unclear, ask a question; don't guess.
- **Never** run `git stash`, `reset`, `restore`, `checkout`, `clean`, `commit` or `push`.
  The CTO commits.
- Never change `package.json`, migrations, or drawing-canvas code. Never start a production
  build: the dev server is running.
- Before reporting done, run the spec's checks:
  - `npx tsc --noEmit` must be clean.
  - `npx vitest run` must fail in exactly the same **26 files** as the baseline, with no new
    failing files. Those 26 have nothing to do with the table.
- When you report back, list the files you changed, the tests you added, and the command
  output.
- Call tools as real tool calls. If you notice you are writing tool calls out as text, stop and
  say so.

## 2. Patch history (all committed)

| Patch | What it added |
|---|---|
| 165 | Row and column menus (insert, duplicate, clear, delete, color, align) |
| 166 | Fill with AI for a column; `/api/ai/table-fill` |
| 167–168 | Ask AI on a cell or a selection |
| 169 | Whole-row selection, cell text sizes |
| 170 | Column widths: resize, fit to content, distribute evenly |
| 171 | Color opens the standard picker; menu buttons became corner triangles |
| 172 | Every menu opens with a right-click; column titles (rename) |
| 173 | Fill a row with AI; ✨ on AI-filled cells; Undo after Accept all |
| 174 | Sort by a column, find & replace, summary row, Undo for sort and replace |

Read PATCH-172, 173 and 174 in `.fable5/patches/` for the exact current behaviour.

## 3. The data (saved as the post's content JSON)

- `columns: string[]`: the column titles (the old A/B/C letters until someone renames them).
- `rows: string[][]`
- `cellStyles: Record<"r-c", CellStyle>`
  - `CellStyle` fields: `bg`, `align`, `verticalAlign`, `bold`, `italic`, `underline`,
    `strikethrough`, `color`, `size?: 'h1'|'h2'|'small'`, `aiFilled?: true`.
- `columnWidths?: number[]` and `columnSummaries?: (null|'sum'|'average'|'count'|'min'|'max')[]`:
  aligned with `columns`, and saved **only** when not the default.
- Plus caption, comments and titleStyle, which don't change in table patches.

## 4. Where things live

**Pure logic.** No React; unit-tested; every structural change goes through here.

- `lib/domain/canvas/tableStructure.ts`
  - `TableGrid` type
  - insert, delete, duplicate or clear a row or column
  - `setRowStyle` and `setColumnStyle`
  - `renameColumn`
  - width helpers
  - `normalizeColumnSummaries`
  - `sortRowsByColumn`
  - `findMatchingCells` and `replaceInTable`

  Styles are re-keyed along with their cells.
- `lib/domain/canvas/tableNumbers.ts`
  - `parseCellNumber`: understands units and decimal commas; `"4,5 L"` is 4.5 and `"1,234"`
    is 1234.
  - `summarizeColumn` and `formatSummary`

  **Numbers are always computed by code, never by the AI.**
- `lib/domain/ai/tableFill.ts` (column and row fill items, response parsing, instructions)
- `lib/domain/ai/tableAskAI.ts` (selection text, Ask AI instructions)

**Server**

- `app/api/ai/table-fill/route.ts`: `/api/ai/table-fill`
  - input: preset, detail, and at most 40 items; each input at most 1000 chars, 12k in total
  - role AI_ROLE_EDIT, reasoning off, 25 s timeout
  - tests are in `lib/server/ai/tableFillRoute.test.ts`, because vitest ignores `app/**`
- Ask AI uses the existing `/api/ai/text-action`.

**UI**

- `components/collabboard/editors/TableEditor.tsx`: the editor. It is about 2400 lines, far past
  our 800 limit. **Put new UI in new files**, as the panels do, and add only wiring here.
  Key pieces:
  - `applyGrid(next)` is the single writer; `currentGrid()` reads.
  - `applyUndoableGrid(next, message)` offers Undo for 10 s. Any other change clears it
    (`data-table-undo-bar`).
  - `fillLocked`: while AI suggestions are pending, every edit and menu is blocked.
  - Only one panel is open at a time (Fill, Row fill, Ask AI, Find).
  - `activeSubmenu` holds the toolbar panels (`textStyle`, `cellColor`, …).
  - The toolbar has height 0 and a fixed width of 52px, so the editor never shifts. Keep it so.
- Panels: `TableFillPanel.tsx`, `TableRowFillPanel.tsx`, `TableAskAIPanel.tsx`,
  `TableFindReplacePanel.tsx`.
- `components/collabboard/menus/TableAxisMenu.tsx`: the row and column menus.
- `components/collabboard/menus/TableCellContextMenu.tsx`: the cell menu.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`: the card on the board. Only its
  table branch is ours. It renders sizes, widths, the ✨ and the summary footer.

**Menus open by right-click**, on the column header `th`, the row-number `td`, or a cell. The
corner triangles are cues at opacity 0.4. A keyboard activation (`click` with `detail === 0`)
opens their menu.

## 5. Tests

- Editor tests: `components/collabboard/editors/TableEditor.{handles,fill,askai,rows,widths,titles,rowfill,basics}.test.tsx`.
  They open menus by dispatching `contextmenu`. Copy the harness of the closest existing file.
- Domain tests: `lib/domain/canvas/tableStructure.test.ts`, `tableNumbers.test.ts`,
  `lib/domain/ai/tableFill.test.ts`, `tableAskAI.test.ts`.
- Card: `components/collabboard/freeformTableCellSize.test.tsx`, which checks source text.
- Cell menu: `components/collabboard/tableCellContextMenu.characterization.test.tsx`. Leave it
  untouched unless a spec says otherwise.
- The CTO checks that tests can fail: code is mutated and a test must go red. Assert on real
  output (the saved JSON, the DOM), not on "a function was called".

## 6. What's next (not yet authorized; wait for its spec)

**PATCH-175, "Ask the table":**

1. The user types a command, e.g. "sort by fuel tank, largest first".
2. The AI returns a JSON **plan** built only from our fixed actions: the pure functions above.
3. The plan is validated with zod.
4. It is applied to a **draft** copy, which the user previews.
5. The user chooses Apply or Discard, and Undo is offered after Apply.

It is one request with a bounded size. The AI never writes cells directly and never computes
numbers.

## 7. Your first reply

Reply with one short paragraph confirming you've read this and PATCH-174.md. Change no files.
