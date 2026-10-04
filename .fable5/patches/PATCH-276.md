# PATCH-276 — One panel per picture object, and AntV icons draw again

Status: AUTHORIZED (owner, 2026-10-04, two screenshots of the mind map "watson.ch" node: "why are there still 2
windows for the same diagram object … I thought we only have one side panel for one diagram object??? Also the icon
don't show").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-275 (b2e034f8).

## Why
### A. Two panels for one object (PATCH-275 behaviour)
First click on a node selects the whole item → panel "Card 2 · watson.ch" (Text, Shape, Icon). Second click drills
into one part → a DIFFERENT panel "Shape · watson.ch" with only Fill/Border — the same controls a second time, under a
second title. To the owner these are two windows for the same object. Rule from now on: **one object, one panel**.

### B. AntV's own item icons have never been drawn (CTO, live, root cause confirmed)
- Every AntV design draws its item icon as `<use href="#rsc-…">` pointing at a `<symbol>` that our resource loader
  creates (`lib/ai/antv/setup.ts` `makeAntvResourceLoader` → `mod.parseSVG(iconSymbolSvg(name))`).
- `iconSymbolSvg` (`lib/ai/antv/icons.ts` L188) returns `<symbol viewBox=…>` with NO `xmlns`. AntV's
  `parseSVG` uses `DOMParser.parseFromString(svg, 'image/svg+xml')`, so the symbol and its paths are created in the
  NULL namespace (live: `symbol.namespaceURI === null`, constructor `Element`). The browser does not treat them as
  SVG, so every `<use>` draws nothing (live: `getBBox().width === 0` on the board post 108dffef and in 20 designs; a
  control symbol with the SVG namespace on the same page measures 30).
- The white circle on the owner's node is the empty icon badge. Present since PATCH-241 (1de1248e); the unit tests
  passed because they check the string, never the parsed namespace.
- Added icons (Add panel, `additions.ts`) use `createElementNS` and draw correctly: not affected.

### C. Icon colour shows "None"
On the same node the panel's "Icon colour" row showed hex "None", although the `<use>` has `fill="#4f9d8f"` and
`color: rgb(79,157,143)`. The row reads the wrong part (the `item-icon-group`, whose ellipse is the white badge).

## Design
### A. One panel per object (`AntvElementPanel.tsx`, `AntvElementEditor.tsx`, `useAntvElementColour.ts`, …)
- **The panel's subject is the OBJECT, not the clicked part.**
  - Object = the selected item scope (`selection.scope`, e.g. the item, or the mind-map node `0,i` / child `0,i,j`).
  - An addition is its own object; the title is its own object.
  - Whether the user selected the whole item (first click) or drilled into one part (second click), the panel is the
    same:
    - the same title, e.g. "Card 2 · watson.ch" (a mind-map node: "Node · watson.ch");
    - the same sections;
    - the same controls;
    - the same `data-ai-element-panel` element, not remounted.
- Drilling into a part still selects that part on the PICTURE: its box and handles let you move and resize just that
  part. In the panel, it only:
  - highlights that part's section (`data-ai-element-panel-section-active="true"`, a subtle left accent);
  - scrolls that section into view.
  It never removes the other sections.
- **Colour rows always apply to the object's parts of that kind**, whatever is drilled:
  - Fill and Border: the object's shape parts;
  - Text colour: its text parts;
  - Icon colour: its icon;
  - Icon background: the badge (B below).
  - Compute this from the item scope's members, the list the whole-item selection uses today. The current-colour
    display (PATCH-275 C) uses the same part lists, so a drill-down does not change what a row shows.
- **Text fields** are always the object's fields: label, description, value. The size, font and align block stays per
  field, as in PATCH-275.
- Keyboard and bar actions keep acting on the current selection on the picture: Delete, Reset element, arrows, and the
  bar's Undo/Redo/Reset/Delete. The panel footer's "Reset element" and "Delete" act on the OBJECT (the whole item).
  Their labels say so: "Reset card", "Delete card", or "node" for a mind-map node.

### B. Icons draw (`lib/ai/antv/icons.ts`)
- `iconSymbolSvg` emits `<symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" …>`.
- Nothing else changes; the paths inherit the namespace.
- Test with a REAL `DOMParser` (`image/svg+xml`, as AntV's `parseSVG` does):
  - the root is an `SVGSymbolElement` with `namespaceURI === 'http://www.w3.org/2000/svg'`;
  - every child is in the SVG namespace;
  - the same holds for the fallback dot (unknown name).
  - Mutation: drop the `xmlns` → the test fails.
- Through `makeAntvResourceLoader` with a stub module whose `parseSVG` is AntV's real implementation (import it from
  `@antv/infographic`'s utils if exported; otherwise reproduce the two-line DOMParser call and say so in a comment):
  the loader returns an `SVGSymbolElement`.

### C. Icon rows read and write the right part
- The **Icon colour** row reads and writes the `item-icon` (the `<use>`):
  - read: override, else its `fill` attribute, else computed `color`;
  - write: the existing PATCH-261 icon path (fill + currentColor).
  It must show `#4F9D8F` on the owner's node.
- New row **Icon background** (`data-ai-element-colour-row="badge"`): the fill of the badge shape inside
  `item-icon-group` (its `ellipse` / `circle` / `rect`, the first non-`use` shape child).
  - Store it in a NEW override key for that badge element: `item-icon-group@<path>#badge`, with `fill`.
  - Apply it through `applyElementColours` on that child. Reuse the existing `data-ai-base-fill` restore, so Original
    and Reset work.
  - Shown only when the object's icon group has such a shape.
  - `remapOverridesForItems` (PATCH-274) must remap this key like any other item key; add a test.
  - The sanitizer, the stored schema and the per-design map accept the key format; if they already accept any key of
    this shape, add a test that proves it.

## Tests
- Pure / jsdom:
  - icons namespace (B);
  - badge key apply, restore and remap;
  - Icon colour reads the `<use>`'s fill.
- Through the real editor and panel, on a hierarchy (mind-map) fixture AND a list fixture:
  - first click → panel title "Node · …" / "Card 2 · …" with Text, Shape and Icon;
  - second click on the shape → the SAME panel element (identity: keep a reference and compare), the same title, the
    same section list, and Shape marked active;
  - a Fill pick after the drill-down recolours the object's shape exactly as it would from the first click;
  - a second click on the label → Text marked active, panel unchanged;
  - Icon colour shows the icon's fill; Icon background shows the badge's fill and changes it;
  - footer "Delete card" hides the whole item even when one part is drilled.
- Existing PATCH-275 tests that asserted a different panel per part ("Shape · Food", "Label · Food") are updated to the
  one-panel rule. Do not delete their colour, Mixed or session assertions.
- Mutation: build the panel from the drilled part's keys instead of the scope's members → the "same sections after
  drill-down" test fails.

## Allowed files
```
lib/ai/antv/icons.ts (+ tests)
lib/ai/antv/setup.ts (+ tests)                       only if the loader test needs it
lib/ai/antv/elementColours.ts, lib/ai/antv/effectiveColour.ts (+ tests)
lib/ai/antv/elementOverrides.ts, lib/ai/antv/remapOverrides.ts, lib/ai/antv/templateOverrides.ts (+ tests)  badge key
components/ai/renderers/AntvElementPanel.tsx, AntvColourField.tsx, AntvElementEditor.tsx (≤ 700 lines),
  AntvElementChrome.tsx, useAntvElementColour.ts, useAntvElementPanel.ts, useAntvElementText.ts,
  useAntvElementSelection.ts (+ tests)
lib/ai/validators.ts (+ tests)                       only if the stored schema rejects the badge key
```
Forbidden: everything else, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors app/api/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-276.json
```
The CTO compares failing files AND failing test names. Report:
- every file changed, with its line count;
- how the object scope is derived for each selection kind (item, part, mind-map node, child, addition, title).

Do not commit.

**Live (CTO, own write-locked tab):**
1. Icons visible:
   - `getBBox().width > 0` on every `item-icon` in several designs;
   - a close-up screenshot of the badge;
   - the board post 108dffef shows its icon after reload.
2. Mind-map node, first click then second click: one panel, unchanged title, Shape active.
3. Fill after the drill-down recolours the node.
4. Icon colour shows `#4F9D8F`; Icon background changes the circle.
5. Save and reload keep the edits; existing board AI posts render identically apart from their icons, which now
   appear.
6. Test post deleted.

## Commit message (verbatim)
```
fix(ai): one panel per picture object, and icons show again

Clicking a part of an object a second time opened a second, smaller
panel for the same object. Each object now has exactly one panel; the
part you clicked is highlighted in it. Icons in the AI picture designs
were never drawn because they were built outside the SVG namespace;
they now appear, and the icon's circle can be coloured too.
```

## Final result (CTO, 2026-10-04, live)
Own tab, write-locked except generate-outline (unlocked only for the save):
- Icons: the board's existing AntV post 108dffef now draws its icon (`getBBox` width 0 → 34); all 22 AntV designs with
  icons in a fresh generation draw every icon (no 0-width icon); a saved + reloaded post draws 4/4 icons. Close-up
  screenshot: book / dollar icons visible in the mind-map badges.
- One panel: mind-map node first click → "Node · watson.ch" (Text, Shape, Icon); second click → the SAME panel element,
  same title and sections, Text marked active. Icon colour shows the icon's #D9644A (was "None"); Icon background
  recolours the badge circle (#ffffff → #8e6ac8); footer "Reset node" / "Delete node".
- Addendum 1: label and description style blocks had the same React key (`style:item:1`), so their state could swap;
  now keyed by part and labelled "Label style" / "Description style".
- First DeepSeek run hung 3 h on a shell command without editing anything; aborted and rerun (waiter now has a
  20-minute stall alarm). Test post 04205fd6 deleted. Gate `.opencode-vitest-276b.json`: failing test names identical
  to PATCH-275 (59/59); tsc clean.
