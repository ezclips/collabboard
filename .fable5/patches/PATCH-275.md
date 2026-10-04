# PATCH-275 — Each picture element gets its own side panel

Status: AUTHORIZED (owner request 2026-10-04: "if you do such a split in function you might as well open it as a side
panel … the color you have should be selected … add the customisation for the text and that diagram object together
in one panel. So each diagram object opens its individual side panel").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-274 (eca0a099).

## Why (reproduced live by the CTO, own write-locked tab, list-grid-badge-card, card 2 selected)
The colour editor is a floating popover (`AntvElementColourMenu.tsx`) under the selection bar. Measured:
1. **Shuffling.** Each pick puts the colour at the FRONT of a "recent" list that is appended to every row
   (`useAntvElementColour.ts` `setRecent`, also on every `onInput` tick of the native picker). The popover grew
   324 → 344 → 364 → 384 → 404 px over four picks; it is clamped to the right edge, so its left side moved
   703 → 663 → 643 px. The swatches slide sideways under the cursor between clicks. Palette colours also reappear as
   "recent" duplicates.
2. **The current colour is not shown.** On open every row showed the picker as `#000000` with an empty hex field and
   no swatch marked, although the card's real fill is `#4f9d8f1a`. For a whole-card selection `colourCurrent` reads only
   `overrides.items[keys[0]]` (the shape), so after picking a Text colour the Text row still showed nothing selected.
3. **The popover covers the card.** `elementFromPoint` at the centre of `item-label@1` hit the popover, so the text
   cannot be clicked or edited while the colours are open; its "Reset colour" row was clipped by the preview's bottom
   edge (owner's screenshot).

## Goal
Selecting an element on an AntV picture opens THAT element's own panel in the docked side-panel column (where
Designs / Edit text / Add already live). The panel contains everything for the element in one place: its text
(content and style), its shape colours, its icon. No floating popovers remain over the picture.

## Design
### A. One docked column, shared (`components/ai/renderers/PictureSidePanel.tsx`, new)
- Move the docked panel SHELL out of `OutlineSuggestionsPanel.tsx` (the `<section data-ai-side-panel>` with its
  44 px header: icon, title, extra header content, close button `data-ai-side-panel-close`, and the scrolling body) into
  `DockedPanelShell` in this new file. `OutlineSuggestionsPanel` uses it for its own panels with identical markup and
  attributes (existing tests must keep passing). This also brings that file well below 800 lines; it is at 788 now and
  must not grow past 800.
- `PictureSidePanelContext` with `{ host: HTMLElement | null; elementPanelOpen: boolean; setElementPanelOpen(open) }`
  and `usePictureSidePanel()`, which returns `null` when there is no provider.
- The provider is created by the component that owns the docked column:
  - **Generator:** `OutlineSuggestionsPanel` holds `elementPanelOpen` state and provides the context around its
    content, with `host = sidePanelHost`. In inline mode (no `sidePanelHost`), its existing inline 340 px column becomes
    the host through a callback ref, so both modes behave the same.
  - **Edit window:** `AIContentEditModal.tsx` (wiring only; the file is > 800 lines) provides it. A host column
    `<div data-ai-side-panel-host="true" class="relative w-[320px] shrink-0 border-l …">` is added as the LAST child of
    `data-ai-modal-body` and is rendered only while `elementPanelOpen` is true, in picture-first and in List view.
- **One panel at a time.**
  - While `elementPanelOpen` is true, `OutlineSuggestionsPanel` does not render its own panel. It keeps its `panel`
    state, so when the element panel closes, the panel that was open before comes back.
  - Clicking any dock toolbar button (Designs, Edit text, …) calls `setElementPanelOpen(false)` first. The selection
    stays, with the bar visible.
  - `onSidePanelChange` reports `panel !== null || elementPanelOpen`, so the generator's host column is mounted while
    only the element panel is open.

### B. The element panel (`components/ai/renderers/AntvElementPanel.tsx`, new)
Root `<section data-ai-element-panel="true" data-picture-control="true">`, rendered in `DockedPanelShell` and portalled
into `host`. Every control stops `pointerdown` propagation. If there is no provider, nothing is rendered. Clicking or
typing in the panel never deselects. Only the EDITABLE layer's editor owns the panel; the hover preview layer of
PATCH-271 never does.

**Opening and closing**
- Selecting an element (first click = whole item, second = one part, as now) opens the panel for it and calls
  `setElementPanelOpen(true)`.
- Selecting another element switches the panel's content in place; the panel does not close and reopen.
- Deselecting closes it, by Escape outside an input or by a click on empty picture.
- The panel's close button closes the panel and keeps the selection.
- The bar's palette button (keep `data-ai-element-colour-toggle`, label "Edit") reopens a closed panel and closes an
  open one.
- Double-click on a shape or icon opens the panel, as it opened the popover before.

**Header title**: what the user selected, e.g. "Card 2 · Travel", "Title", "Label · Travel", "Description · Travel",
"Circle", "Arrow", "Text", "Icon · Travel". Use the item's label from the outline, never an element key.

**Sections**, each `data-ai-element-panel-section="<name>"`, shown only when the selection has such parts, in this order:
1. **Text** (`text`). The selection contains text parts, or is the title or an added text.
   - Content field(s), one per text part, labelled "Label", "Description", "Value" or "Title" (`data-ai-element-text-field="label|detail|value|title|child|addition"`):
     - whole item: label, plus detail and value when the item has them or the design draws `item-desc` / `item-value`;
     - a single text part: only that one field;
     - title: `outline.title`;
     - a mind-map child node (path [i,j]): `items[i].children[j].label`;
     - added text: the addition's `label`.
   - Field rules:
     - text is plain, `<input>` or `<textarea>` for the description;
     - Value is a number input (≥ 0; empty removes the value) and clears `valueExample` on that item, because an edited value is real (PATCH-268);
     - live updates are debounced 250 ms;
     - the field records ONE history entry per field per focus (`item-field` / `title` entries, the existing kinds in `editHistory.ts`);
     - Escape inside a field reverts it to its value at focus time and blurs, but does not deselect.
   - Style, for item label/detail (`items[i].textStyle.label|detail`) and the title (`outline.titleStyle`). This is
     the existing PATCH-244 `TextStyle`, so it follows the item to every design. Add NO new override fields:
     - Size: a number input (8–72) with − and + buttons (`data-ai-element-font-size`);
     - Font: a select over the allowed families (export the `TEXT_STYLE_FONT_FAMILIES` list from `lib/ai/outline.ts` with readable names) (`data-ai-element-font-family`);
     - Align: left, centre, right (`data-ai-element-align`).
     For added text: Size only, through the addition's `fontSize` (8–72). Child nodes have no style controls.
   - Colour: one colour field "Text colour" (see C), written as before through the per-design override `text`
     (PATCH-261). Reset of that field removes the override, so any `textStyle.fill` set from AntV's own toolbar
     shows again.
2. **Shape** (`shape`): "Fill" and "Border" colour fields: the same rows and keys as today (`fill`, `border`).
3. **Icon** (`icon`): the "Icon colour" field, plus the icon grid inline (`AntvIconSearch` from `AntvIconPicker.tsx`,
   highlighting the current icon) when the item has an icon (today's `iconItemIndex` condition). The floating
   "Change icon" popover and its bar button are removed.
4. **Footer**: "Reset element" (the existing `commitReset`: position, size and colours) and "Delete" (the existing
   `commitHidden`).

### C. Colour fields that show the truth and never move (`AntvColourField.tsx` new; `useAntvElementColour.ts`)
Keep the existing attributes so existing tests and scripts still find them: the row `data-ai-element-colour-row`,
the swatches `data-ai-element-swatch` plus `data-ai-element-swatch-value`, the picker `data-ai-element-colour-input`,
the hex field `data-ai-element-hex` and `data-ai-element-colour-reset`.

**Current colour**
- The current colour of a row is read from the DOM, from the parts it applies to: the override if one is set, else
  AntV's own colour (`data-ai-base-*`, else the attribute or style). Write this as a pure helper in
  `lib/ai/antv/effectiveColour.ts` with tests.
- Normalise to `#rrggbb` lower case. Accept `#rgb`, `#rrggbb`, `#rrggbbaa` (keep the alpha separately) and `rgb()`/`rgba()`. Return `null` for `none`, `transparent` or `url(…)`.
- If the parts the row applies to have different colours, the row is **Mixed**: no swatch marked, the hex field
  empty with placeholder "Mixed", the picker grey.

**Swatch row, fixed order**
1. **Original**, `data-ai-element-swatch-original`: AntV's own colour, drawn WITH its alpha, so a 10 %-tint card looks
   like the card. Clicking it removes that override field. It is the only per-row reset; keep the panel-wide "Reset
   colours" as well.
2. The picture's six palette colours.
3. A separate "Recent" line under them (`data-ai-element-recent`), at most 6, newest first, never a palette colour or
   the Original.

**Selected state**
- The swatch equal to the current colour gets the selected ring. When there is no override, Original gets it.
- The picker and hex field always show the current colour (upper-case hex).

**Recent never reorders while you work.** The recent list changes only when a colour session ends: the selection
changes or the panel closes. Picks are collected during the session and merged then. The native picker's `onInput`
updates the element live, but never touches the recent list.

**History**: unchanged. One entry per row per session, then live updates (PATCH-270). The session is "this panel on
this selection".

### D. Removed
- `AntvElementColourMenu.tsx` (the floating popover) and the floating icon popover (`AntvIconPicker` default export,
  if nothing else uses it; `AntvIconSearch` stays).
- The `colourOpen` / `iconOpen` popover branches in `AntvElementEditor.tsx`.
- Escape order: an Escape inside a panel field is handled by the field. Otherwise Escape deselects, which closes the
  panel. `preventDefault` in the capture phase stays, so the dock's own close-on-Escape still yields (PATCH-265).
- `AntvElementEditor.tsx` (686 lines) must stay ≤ 700: put the panel state and commits in
  `useAntvElementPanel.ts` / `useAntvElementText.ts` (new).

### E. Pure text helpers (`lib/ai/antv/elementText.ts`, new, + test)
- `textFieldsForSelection(outline, template, keys)` → the list of `{ field, path, value, styleTarget }` for section B.1.
  Map element type to field: `item-label` → label, `item-desc` → detail, `item-value` → value, `title` → title, depth-2
  hierarchy path → child label. Use `outlineItemIndexForElementPath` (mapOutline.ts); do not write a second mapping.
- `outlineWithTextField(outline, path, field, value)` and `outlineWithTextStyle(outline, target, patch)`: pure,
  never mutate, and sanitise with `sanitizeTextStyle`.

## Tests
- `effectiveColour.test.ts`: override vs base; `#rgb` / `#rrggbbaa` / `rgb()` / `rgba()` / `none` / `url(#g)`;
  mixed parts.
- `elementText.test.ts`: whole item → label + detail + value; single `item-desc`; title; hierarchy `@0,i` and child
  `@0,i,j`; added text; `outlineWithTextField` value edit clears `valueExample`; empty value removes it; style
  sanitised (size 99 dropped); immutability.
- `AntvElementPanel` / editor through the real renderer (jsdom, like the existing `AntvElementEditor*.test.tsx`):
  - selecting a card opens `[data-ai-element-panel]` in the provided host with Text + Shape sections, and nothing is
    rendered inside the picture overlay except the box, handles and bar;
  - the Original swatch carries the ring on open; the hex field shows the base colour;
  - pick palette #2, then #4, then #1: the swatch order and the panel's `getBoundingClientRect` are identical after each
    pick, and the ring follows the pick;
  - the Recent line is unchanged until the selection changes, then lists 3 colours newest first, with no palette
    duplicates;
  - pick a Text colour on a whole-card selection: the Text row shows it while Fill keeps its own;
  - a mixed selection shows "Mixed";
  - typing in Label updates `items[i].label` after the debounce, and one Ctrl+Z restores the whole word;
  - Size + updates `textStyle.label.fontSize` and the drawn text's font-size;
  - Escape in a field reverts the field and keeps the selection; Escape outside deselects and closes the panel;
  - the icon grid in the panel swaps the icon; Reset element / Delete work.
- Dock coordination:
  - with Designs open, selecting an element hides Designs and shows the element panel;
  - deselecting brings Designs back;
  - clicking Edit text in the toolbar closes the element panel and keeps the selection;
  - `onSidePanelChange` is true while only the element panel is open.
- Edit window: the host column appears only while an element is selected, and the panel renders in it.
- Mutation (revert with your Edit tool):
  - make the recent list update on every pick: the "order identical" test fails;
  - read `colourCurrent` from `keys[0]` only: the whole-card Text test fails.
- Update the existing tests that targeted the popover (`data-ai-element-colour="true"`) to the panel. Do not
  delete their assertions; move them.

## Allowed files
```
components/ai/renderers/PictureSidePanel.tsx (+ test)                       new
components/ai/renderers/AntvElementPanel.tsx, AntvColourField.tsx (+ tests)  new
components/ai/renderers/useAntvElementPanel.ts, useAntvElementText.ts        new
lib/ai/antv/effectiveColour.ts, lib/ai/antv/elementText.ts (+ tests)        new
components/ai/renderers/AntvElementEditor.tsx, AntvElementChrome.tsx, useAntvElementColour.ts,
  useAntvElementSelection.ts, useAntvIconSwap.ts, AntvIconPicker.tsx (+ tests)
components/ai/renderers/AntvElementColourMenu.tsx                           delete
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)              only if the panel needs a prop from it
lib/ai/outline.ts (+ tests)                                                 only to export the font-family list
lib/ai/antv/editHistory.ts (+ tests)                                        only if a text entry needs a helper
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests)       shell extraction + coordination, ≤ 800
components/ai/editors/AIContentEditModal.tsx                                wiring only (provider + host column)
existing tests of the files above
```
Forbidden: everything else, the database, `AIComponentEditor.tsx` (it already provides `sidePanelHost`).
- Make real tool calls only; never write a tool call as plain text.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- NEVER compare results with diff or process substitution.
- Put no test files outside the repo.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors app/api/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-275.json
```
The CTO compares failing files AND failing test names. Report:
- every file changed, with its line count;
- every place that opens or closes the element panel;
- which existing popover tests were moved where.

Do not commit.

**Live (CTO, own write-locked tab):**
1. Card 2 selected: the panel docks on the right, the Designs panel is hidden, and the picture is not covered.
2. Original is ringed on open.
3. Four picks: no swatch moves, and the ring follows each pick.
4. Text colour, size and font change on the card; the label edit shows on the card.
5. Deselect: Designs is back.
6. Edit window: the same panel appears in its column.
7. Save and reload: colours and text style kept.
8. Board signatures identical; test post deleted.

## Commit message (verbatim)
```
feat(ai): each picture element opens its own side panel

Clicking a part of a picture now opens a panel on the right with
everything for that part: its text, text size and font, fill, border
and icon. The colour you have is shown as selected, and swatches no
longer jump around while you pick. Nothing covers the picture anymore.
```

## Final result (CTO, 2026-10-04, live)
Own tab, list-grid-badge-card, write-locked except generate-outline (unlocked only for the save):
- Card 2 selected: the panel "Card 2 · Food" docks in the side-panel host with Text / Shape / footer; Designs hidden;
  the card's label is no longer covered (`elementFromPoint` hits the picture).
- Fill opens with ONLY Original ringed and hex #4F9D8F (AntV #4f9d8f1a); Border (no stroke) shows "None" and a grey
  picker; a whole card whose label and value differ shows Text = Mixed (grey picker); a single label shows its own colour.
- Four palette picks: every swatch at the identical position after each pick (was: popover 324→404 px wide, sliding
  60 px left); the ring follows the pick.
- Two custom hexes: Recent stays empty while the card is selected; after deselecting, Recent = [#654321, #123456].
- Size + ×4: label 14 → 22 px; Label "Food Edited" shows on the card and in the panel title; Escape deselects and
  Designs returns; re-select, part-select ("Shape · Food", "Label · Food") and switching cards update the panel in place.
- Saved → reload: the board shows "Food Edited", 22 px, the chosen fill. Edit window: the 320 px host column appears
  only once an element is selected and holds the panel. No render loop (0 DOM mutations/s while selected).
- Test post 85903088 deleted.
Addenda: 1 — current colour shown with no override, single ring, None placeholder; 2 — the colour session ended on
every pick because `endSession` depended on a palette array rebuilt every render (Recent changed mid-session, history
split per pick); now identity-stable; Mixed picker grey.
Gate `.opencode-vitest-275c.json`: failing test names identical to PATCH-274 (59/59); tsc clean.
Note: Undo after a colour session reverses the whole session for that row (PATCH-270 design: one entry per row per
session), now that a session really lasts while the card stays selected.
