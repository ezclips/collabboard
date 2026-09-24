# PATCH-172 — one way to open every table menu (right-click), a triangle on cells, column titles

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why — the owner's proposal

"We have two different systems for opening the submenu in the table": a LEFT-click on the corner
triangle opens the row/column menu, but a RIGHT-click opens the cell menu, which has no triangle.
The owner's decision:
- cells get the same corner triangle (upper right);
- all triangles are made less prominent (lower opacity);
- **every** menu opens with a RIGHT-click — column header, row number, cell.

And: "can you change those letters to a title?" — column names A/B/C become editable titles.
(Titles also make Fill with AI and Ask AI better: both already send column names to the model.)

## 2. The changes (all in `TableEditor.tsx` unless named)

### 2.1 Right-click opens every menu

- Right-click (`onContextMenu`, `preventDefault`) on a column header `<th>` → the column menu at
  the pointer (`x: e.clientX, y: e.clientY`). It also selects that column first (as a
  left-click on the header does), so the menu visibly acts on the selection.
- Right-click on a row-number `<td>` → the row menu at the pointer, after selecting the row.
- Right-click on a cell → the cell menu, unchanged.
- LEFT-click on a header / row number keeps selecting, exactly as now.
- The triangles no longer open anything on a MOUSE click: a mouse click on a triangle behaves as
  a click on its header/row number (selects). KEYBOARD activation (Enter/Space on the focused
  triangle, i.e. `click` with `event.detail === 0`) still opens its menu at the triangle —
  keyboard users keep a way in. Keep `data-table-*-handle`, `aria-label`, `aria-haspopup="menu"`.
- `fillLocked` blocks all three menus, as now.

### 2.2 Triangles

- Every body cell gets the same corner triangle in its top-right corner (touching the borders,
  like the row/column ones): `aria-hidden`, `pointer-events-none`, purely a cue. Shown on cell
  hover and on the active cell.
- All triangles (header, row, cell), gray-400: revealed = `opacity 0.4`; the pointer on a
  header/row triangle itself = `0.7`; its menu open = `1` and purple-600 (as now).

### 2.3 Column titles

- **Double-click a column header** → the header text becomes an inline `<input>` (autofocus,
  text selected). Enter or blur saves; Escape cancels. Also a new column-menu item
  `Rename` (lucide `Pencil`), first item of the column menu followed by a separator, which
  starts the same inline edit. The row menu does not get it.
- Rules: trimmed; 1..60 chars; empty → cancel (keep the old title); a title equal
  (case-insensitive, trimmed) to ANOTHER column's → do not save, show a small red hint under the
  input `Another column has this title` until changed or cancelled.
- Header shows the title truncated with ellipsis inside the column width; `title` attribute =
  full title.
- Storage: titles ARE the existing `columns` array — no new field, no migration; old tables keep
  A/B/C until renamed. `nextColumnName` still names new columns (it already skips names in use).
- Everything that shows or sends column names picks titles up automatically (Fill with AI "Read
  from" list and inputs, Ask AI lines, the card on the board) — verify, don't reimplement.
- Pure helper in `lib/domain/canvas/tableStructure.ts`:
  `renameColumn(grid, index, title): { grid } | { error: 'empty' | 'duplicate' }` (trim, length
  cap 60 by truncation, duplicate check case-insensitive against other columns). Widths/styles
  untouched.

## 3. Tests

Opening menus changes from left-click-on-triangle to right-click-on-header in EVERY table test
that opens a row/column menu. Update those helpers deliberately and mechanically (e.g.
`openRowMenu(c, i)` dispatching `contextmenu` on the row-number td, `openColumnMenu(c, i)` on
the th); do not weaken any assertion that follows. Files: `TableEditor.handles.test.tsx`,
`TableEditor.fill.test.tsx`, `TableEditor.widths.test.tsx`, `TableEditor.rows.test.tsx`,
`TableEditor.askai.test.tsx` — only where they open a row/column menu.

ADD (`TableEditor.handles.test.tsx` or a new `TableEditor.titles.test.tsx`):
- right-click on a th opens the column menu AND selects the column; on a row number, the row
  menu AND selects the row; the browser's own menu is prevented (`defaultPrevented`);
- a mouse click on a triangle (`detail: 1`) selects and opens NO menu; keyboard activation
  (`detail: 0`) opens it;
- every body cell has an `aria-hidden` triangle;
- double-click renames: Enter saves (save-and-close JSON `columns` shows the title), Escape
  cancels, empty cancels, duplicate shows the hint and does not save; `Rename` in the column menu
  starts the edit; the row menu has no `Rename`;
- after renaming B to `Oil capacity`, Fill with AI's "Read from" lists `Oil capacity`.
`tableStructure.test.ts`: ADD `renameColumn` cases.

Characterization suite of the CELL menu: untouched (the cell menu does not change).

## 4. Allowed files

```
components/collabboard/editors/TableEditor.tsx
components/collabboard/menus/TableAxisMenu.tsx                (Rename item)
lib/domain/canvas/tableStructure.ts, tableStructure.test.ts
components/collabboard/editors/TableEditor.handles.test.tsx
components/collabboard/editors/TableEditor.fill.test.tsx      (menu-opening helper only)
components/collabboard/editors/TableEditor.widths.test.tsx    (menu-opening helper only)
components/collabboard/editors/TableEditor.rows.test.tsx      (menu-opening helper only)
components/collabboard/editors/TableEditor.askai.test.tsx     (menu-opening helper only)
components/collabboard/editors/TableEditor.titles.test.tsx    (new, optional)
```
Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/editors lib/domain/canvas components/collabboard/tableCellContextMenu.characterization.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit. The CTO verifies live.

## 6. Commit message (verbatim)

```
feat(table): every table menu opens with a right-click, and columns get titles

The table had two ways to open a menu: a left-click on a corner triangle for rows and
columns, and a right-click for cells, which had no triangle. Now every menu opens the same
way, with a right-click on the column header, the row number or the cell, and every cell
shows the same faint corner triangle. The triangles are quieter, and a keyboard user can
still open a menu from them.

Column letters can be replaced by titles: double-click a header, or choose Rename in the
column menu. Titles are stored where the letters were, so nothing else changes, and Fill
with AI and Ask AI now see real column names.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
