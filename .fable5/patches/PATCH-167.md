# PATCH-167 — the table's right-click cell menu matches the row and column menus

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

The owner: "change the right click menu to the others." Since PATCH-165 a table has two menu
styles side by side. The row/column handle menus (`TableAxisMenu`) have an icon on every item
and sentence-case wording ("Insert above"). The right-click cell menu (`TableCellContextMenu`)
has no icons and Title Case wording ("Add Row Above"). Both already share the same frame
(border, shadow, background) — verified live — so this is about icons and wording only.

## 2. The change — `components/collabboard/menus/TableCellContextMenu.tsx`

Same actions, same ORDER, same groups and separators, same callbacks, same destructive
variant, same alignment behaviour and checkmark rules. Only labels and leading icons change:

| Old label | New label | lucide icon |
|---|---|---|
| Cut | Cut | `Scissors` |
| Copy | Copy | `Copy` |
| Paste | Paste | `ClipboardPaste` |
| Add Row Above | Insert row above | `ArrowUpToLine` |
| Add Row Below | Insert row below | `ArrowDownToLine` |
| Add Column Left | Insert column left | `ArrowLeftToLine` |
| Add Column Right | Insert column right | `ArrowRightToLine` |
| Delete Row | Delete row | `Trash2` |
| Delete Column | Delete column | `Trash2` |
| Change Alignment... | Align | `AlignLeft` |
| (submenu) Left / Center / Right | unchanged | `AlignLeft` / `AlignCenter` / `AlignRight` |
| (submenu) Top / Middle / Bottom | unchanged | `AlignVerticalJustifyStart` / `AlignVerticalJustifyCenter` / `AlignVerticalJustifyEnd` |

Render every item exactly the way `TableAxisMenu.tsx` does: a
`<span className="flex w-full items-center gap-2">` holding the icon
(`w-3.5 h-3.5 shrink-0 text-gray-500`, `aria-hidden`) and the label; the trailing checkmark
stays as it is. The submenu trigger's existing chevron stays.

## 3. Tests

The existing characterization suite is updated for the NEW LABELS ONLY. Every other assertion
(order, separators count, destructive variant, callbacks fired, keyboard behaviour, closing,
z-index, classes, primitives used) must stay exactly as strong as it is. Concretely:

- `components/collabboard/tableCellContextMenu.characterization.test.tsx` — replace the old
  label strings with the new ones; change nothing else. If an assertion compares full
  `textContent` of an item, the icon adds no text, so it should still hold.
- `components/collabboard/editors/TableEditor.handles.test.tsx` — the two mentions of the old
  right-click labels become the new ones.
- `components/ui/context-menu.test.tsx` — two mentions: read them first. If they refer to the
  table menu's labels, update them; if they are independent fixtures that merely share the
  words, leave them.
- ADD one test to the characterization suite: every root item and every alignment submenu
  item renders exactly one `svg` icon before its label.

Report the diff of each test file and confirm no assertion other than label strings changed.

## 4. Allowed files

```
components/collabboard/menus/TableCellContextMenu.tsx
components/collabboard/tableCellContextMenu.characterization.test.tsx
components/collabboard/editors/TableEditor.handles.test.tsx
components/ui/context-menu.test.tsx            (only if its two mentions are the table's labels)
```

Forbidden: everything else. Never use git stash, reset, restore, checkout or clean.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/tableCellContextMenu.characterization.test.tsx components/collabboard/editors components/ui/context-menu.test.tsx
npx vitest run
```
Failing FILE set equal to the 26 baseline. Do not commit.

## 6. Commit message (verbatim)

```
fix(table): the right-click cell menu looks and reads like the row and column menus

The table now had two menu styles side by side: the row and column menus with an icon on
every item and sentence-case wording, and the right-click cell menu with neither. The cell
menu gains the same icons and wording ("Insert row above", "Delete column", "Align"). Its
actions, order and behaviour are unchanged; its characterization tests changed only in the
label strings they expect.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
