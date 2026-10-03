# PATCH-270 — Undo reverses only its own change (one history per picture)

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F3 (HIGH), reproduced live by Codex).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-269 (64718b0a). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F3, section
"AntV integration and event ownership", and patch 4 of section 5.

## Why
- **F3, live (Codex step 8):** add a circle → Edit text: change the title → element-editor Undo → the circle disappears
  AND the title reverts. `AntvElementEditor.tsx` stores history entries as WHOLE snapshots
  `{ overrides, content: withoutElementOverrides(outline) }` (`snapshot()` ~L214, `commit` ~L286, `commitDrag`,
  `commitContent` ~L311, the Add-panel insertion ~L262) and `restore()` (~L320) re-emits `snap.content`, overwriting
  every content change made after it elsewhere (side panel text, values, AntV text edits).
- A second, independent history exists: AntV's `HotkeyHistory` interaction (`lib/ai/antv/interactions.ts`) undoes AntV
  text edits by restoring AntV's whole options, which `applyAntvChange` maps back into the outline — the same
  "whole-state restore" class. Which history receives Ctrl+Z depends on whether an element is selected.
- `AntvElementEditor.tsx` is 799 lines (ceiling 800): the history must move out of it.

## Design
### A. A pure, scoped history (new `lib/ai/antv/editHistory.ts`, + test)
- Entries describe ONLY what changed, with both sides:
  ```ts
  type EditEntry =
    | { kind: 'overrides'; before: ElementOverrides | undefined; after: ElementOverrides | undefined }  // move, resize,
        // hide, colour, additions (add / move / edit / delete) — everything that lives in elementOverrides
    | { kind: 'item-field'; path: number[]; field: 'icon' | 'label' | 'detail' | 'textStyle'; before: unknown; after: unknown }
    | { kind: 'title'; before: string; after: string }
    | { kind: 'group'; entries: EditEntry[] };   // several field changes from one AntV edit
  ```
- `applyEntry(outline, entry, direction: 'undo' | 'redo'): VisualOutline` — applies ONE side to the CURRENT outline:
  `overrides` replaces only `elementOverrides` (content untouched); `item-field` sets only that field on the item at
  `path` (if the path no longer exists, the entry is skipped and reported as not applicable — never applied to another
  item); `title` sets only the title. Pure, never mutates.
- `diffContentEntries(prev, next): EditEntry[]` — the field-level differences between two outlines' content (title,
  and per item label / detail / icon / textStyle, matched by path), used to record AntV edits.
- A small stack helper (past/future, max 50) — or keep the stacks in the editor but store `EditEntry` only.
### B. One history for the picture
- `AntvElementEditor.tsx`: every commit (overrides commits, drags, Add-panel insertion, icon swap) records an
  `EditEntry`; Undo/Redo call `applyEntry` on the CURRENT outline (`outlineRef.current`) and emit the result. No more
  whole-content snapshots.
- AntV text edits (`emitOutline(next, 'antv-change')` in `AntvInfographicRenderer.tsx`) are recorded into the same
  history as a `group` of `diffContentEntries(previous, next)` (pass them to the editor through a small callback/ref).
- Remove `HotkeyHistory` from the stage interactions (`lib/ai/antv/interactions.ts`) so Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  reach ONLY our history — with or without a selection (the editor's keyboard handler must work when nothing is
  selected too, while focus is not in an input / contenteditable / AntV's inline editor). The bar's Undo/Redo buttons
  use the same history.
- Undo of a content entry changes content → the renderer's normal update path redraws (PATCH-263 keeps the zoom);
  undo of an overrides entry takes the no-redraw path (PATCH-260).
- Keep `AntvElementEditor.tsx` under 700 lines after this (move the history code out; split more if needed).

## Tests
- `editHistory.test.ts`: overrides entry undo/redo leaves content untouched; item-field entry changes only that field
  and that item; a stale path is skipped (never applied to another item); title entry; group entry reverses in
  order; `diffContentEntries` finds title/label/detail/icon/textStyle changes and nothing else.
- `AntvElementEditor` / renderer tests (through the real editor): (1) Codex's sequence — add a circle → an outline
  change from outside the editor (simulate the side panel: new outline prop with a new title) → Undo → the circle is
  gone AND the new title stays; Redo → the circle is back, title unchanged. (2) AntV text edit (simulated
  `options:change` label change) → move an element → Undo → the move is undone, the text edit stays → Undo → the text
  edit is undone → Redo twice restores both. (3) Ctrl+Z with nothing selected undoes the last entry. (4) Icon swap undo
  restores only that icon while a later side-panel label edit on another item stays.
- `interactions.test.ts`: `HotkeyHistory` is no longer in the stage list.
- Mutation (revert with Edit): make undo re-emit a whole snapshot → test (1) fails.

## Allowed files
```
lib/ai/antv/editHistory.ts (+ test)                                  new
components/ai/renderers/AntvElementEditor.tsx (+ tests)               must end < 700 lines
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)         only to report AntV content edits to the history
lib/ai/antv/interactions.ts (+ test)                                  remove HotkeyHistory
new small files next to AntvElementEditor.tsx if the split needs them
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-270.json
```
The CTO compares failing files AND failing test names. Short report listing every file changed and the final line count
of AntvElementEditor.tsx. Do not commit.

**Live (CTO, write-locked, nothing saved):** Codex step 8 (add circle → side-panel title → Undo: circle gone, title
stays; Redo); AntV double-click text edit → move → Undo/Undo/Redo/Redo; Ctrl+Z with nothing selected; icon swap undo;
the PATCH-260/261 move/resize/colour/undo checks still pass; zoom stays through content undo.

## Commit message (verbatim)
```
fix(ai): Undo in a picture only reverses its own change

Undo used to restore an older copy of the whole picture, so undoing a
move or an added shape also threw away later edits such as a new title.
Every change is now recorded on its own in one shared history, and Undo
and Redo reverse exactly that change.
```

## Addendum 1 (CTO, 2026-10-03, live round 1)
Live (own tab, write-locked, list-grid-badge zoomed to 92%): Codex step 8 is FIXED (add circle → side-panel title →
Ctrl+Z: circle gone, title stays; Ctrl+Shift+Z: circle back). AntV text edit → move → Undo/Undo/Redo/Redo reverses in
the right order, zoom constant. **New defect:** sequence add circle → Ctrl+Z → Ctrl+Shift+Z (circle back) → AntV text
edit on item 2 → move item 3 → Ctrl+Z: the move is undone **and the circle disappears too** (additions 1 → 0); the
next Ctrl+Shift+Z brings back both. So an `overrides` entry still restores the WHOLE elementOverrides map, and its
`before` was captured from state that did not include the redone circle (stale base — e.g. the drag base or
`overridesRef` not refreshed after redo/applyEntry, or the editor's local overrides lagging the outline).
Fix:
1. `overrides` entries store only what changed: per override key `{ before, after }` for `items`, and per addition id
   `{ before, after }` for `additions` (undefined = absent). `applyEntry` applies only those keys/ids onto the
   CURRENT outline's elementOverrides (template unchanged), so undoing a move can never touch an addition or another
   element, and vice versa.
2. Every commit captures `before` from the current outline's elementOverrides at commit time (for drags: the value at
   drag start of the keys being dragged), and undo/redo/applyEntry keep the editor's overrides ref/state in sync with
   the emitted outline.
Test (through the real editor): add circle → Ctrl+Z → Ctrl+Shift+Z → content edit → move another element → Ctrl+Z →
the move is undone, the circle stays; Ctrl+Shift+Z → move back, circle still there; plus a pure test that an overrides
entry for key A leaves key B and every addition untouched. Mutation: make the entry restore the whole map → fails.

## Final result (CTO, 2026-10-03, live round 2)
Own tab, write-locked, list-grid-badge at 92%: Codex step 8 (add circle → side-panel title → Ctrl+Z: circle gone,
title stays; Ctrl+Shift+Z: back); AntV text edit → move item 3 → Ctrl+Z undoes ONLY the move (the redone circle
stays — Addendum 1 fixed) → Ctrl+Z undoes the text → two redos restore both; icon swap on item 0 → side-panel label
edit on item 1 → Ctrl+Z restores only the icon, the label edit stays; zoom 92% throughout; no console errors.
Regression: the full PATCH-261 colour script passes (fill/border/icon/text, invalid hex, undo/redo, drag selection,
constant viewBox, theme change, save + reload on the board); its test post was deleted. Gate
`.opencode-vitest-270.json`: failing test names identical to PATCH-269 (59/59); tsc clean. AntvElementEditor.tsx 669
lines (from 799), history in `lib/ai/antv/editHistory.ts`; `HotkeyHistory` removed from the stage interactions.
