# PATCH-285 — Edit an AI-drawn picture: every object, down to the background colour

Status: AUTHORIZED (owner, 2026-10-05: "keep the editing function all the way down to the color picker for the
background"; 280–284+ delegated to the CTO).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-284 (stored `DrawnDiagramData`, `DrawnPictureRenderer`).

## Why
PATCH-284 puts AI-drawn pictures into the AI post, without element editing. The owner wants the editing kept: one side
panel per picture object (PATCH-275/276 lesson: ONE panel per object, the current colour shown as selected, nothing
reorders while you pick), text editing, and the picture's background colour. A drawn picture is our own JSON, so an
edit is a plain change of one element — no DOM overrides, nothing to re-apply after a re-render.

## Design
### 1. Pure edit operations `lib/ai/drawn/edit.ts` (new; immutable, each returns a NEW picture)
- `setPaint(picture, id, { fill?, stroke? })` — rect/ellipse/polygon/wedge/bar fill, line/shape stroke; `'none'`
  allowed for fill and stroke except wedge/bar fill.
- `setText(picture, id, text)` (trimmed, ≤ 300 chars, empty → refused), `setTextStyle(picture, id, { color?, size?,
  bold? })` (size clamped 9..72).
- `setIconColour(picture, id, hex)`.
- `setBackground(picture, hex)`.
- `removeElement(picture, id)` — also removes texts whose `in` is that id; data marks (wedge/bar) cannot be removed.
- Every op validates hex (`#rrggbb`), unknown id → the same picture back (no throw).
- `applyEdit(picture, outline, kind, op)` = op then `repairPicture` (text fit, de-overlap, canvas) so a longer text
  still fits its card. Data proportions are never editable here.

### 2. Selection in the renderer (`DrawnPictureRenderer.tsx`, `lib/ai/drawn/toSvg.ts`)
- `sceneToSvg` adds `data-drawn-id="<element id>"` on every drawn element (and the `item` group); ids are already
  sanitised by the parser — keep the escaping test.
- `DrawnPictureRenderer` props `editable?`, `selectedId?`, `onSelect?(id | null)`: in editable mode a click on an
  element selects it (outline highlight via a CSS class on the clicked node, `data-drawn-selected`), a click on the
  ground selects the picture itself (`null` → picture panel). Not editable → no handlers, unchanged look.

### 3. The panel `components/ai/renderers/DrawnElementPanel.tsx` (+ `DrawnColourField.tsx`), new
- Rendered through the existing `PictureSidePanelContext` host (`DockedPanelShell`, `data-ai-side-panel="element"`),
  falling back to inline when there is no host — the same mechanism the AntV panel uses.
- **Picture** (nothing selected): Background colour.
- **Shape** (rect/ellipse/polygon/wedge/bar): Fill, Border (line colour); "Remove" for decorative shapes.
- **Line/arrow**: Line colour.
- **Text**: a text box (applies on blur/Enter), Colour, Size (−/+ in steps of 2 and the number), Bold toggle.
- **Icon**: Colour.
- `DrawnColourField`: the picture's own colours as swatches (collected from the picture, de-duplicated, stable
  order = first appearance; it never reorders while the panel is open), a native colour input, a hex field; the
  current colour is ringed; fill rows offer "None" where allowed. The PATCH-275 rule holds: the current value is
  always shown, picking never reorders anything.
- Header: the element kind ("Card", "Text", "Slice", "Bar", "Line", "Icon", "Picture") and a close button.
- Footer: "Reset picture" — back to the picture as the AI drew it (kept in the editor state when the option arrived;
  one confirm built into the panel, no `window.confirm`).

### 4. Where it is editable
- Generator (`AIComponentEditor.tsx`, wiring only, net ≤ +30): the preview of the selected drawn option is editable;
  edits are kept per option key (switching options and back keeps them; Shuffle replaces the options and drops edits of
  options that are gone); Save stores the edited picture.
- Edit window (`AIContentEditModal.tsx`, wiring only, net ≤ +30): a stored drawn post is editable the same way; Save
  writes the edited picture; Cancel discards.
- Edit as drawing uses the EDITED picture.

## Tests
- edit ops: each op returns a new object (input unchanged); invalid hex / unknown id → same picture; removing a card
  removes its `in` texts; wedge/bar not removable; a longer text in a card grows the card (through `applyEdit`).
- renderer: editable → click on `[data-drawn-id="e3"]` calls `onSelect('e3')`; ground click → `onSelect(null)`;
  not editable → no handlers; hostile ids/text still inert.
- panel: picture panel shows Background with the current colour ringed; picking a swatch calls the op once and the
  swatch order is unchanged afterwards; text edit applies on blur; size +/− clamps at 9 and 72; Reset picture asks
  inside the panel, then restores.
- generator: edit the selected option → Save stores the edited picture; switch option and back → edit kept; Shuffle
  drops edits of replaced options.
- Edit window: edit + Save stores it; Cancel → stored data byte-identical.
- Mutation: make `setBackground` mutate its input → the immutability test fails.

## Allowed files
```
lib/ai/drawn/edit.ts (+ test)                         new
lib/ai/drawn/toSvg.ts (+ test)                        data-drawn-id only
components/ai/renderers/DrawnPictureRenderer.tsx (+ test)
components/ai/renderers/DrawnElementPanel.tsx, DrawnColourField.tsx (+ tests)   new
components/collabboard/editors/AIComponentEditor.tsx  wiring only, net <= +30
components/ai/editors/AIContentEditModal.tsx          wiring only, net <= +30
components/collabboard/editors/useDrawnOptions.ts     only if edits-per-option belong there
```
Forbidden: everything else, the database, the route.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai/drawn components/ai components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-285.json
```
Do not commit.

**Live (CTO)**, with recorded AI responses as in 284: select a card → one panel, change its fill (the swatch row does
not move, the new colour is ringed); edit a label (the card grows if needed); change a slice colour; change the
background; Save → after reload the post shows the edits; Edit window edit + Save; Edit as drawing shows the edits.

## Commit message (verbatim)
```
feat(ai): edit the objects of an AI-drawn picture

Click any object of an AI-drawn picture to change its colours, text, size
and boldness in one side panel, or click the background to change the
picture's background colour. Edits are kept when saving and when turning
the picture into a drawing.
```

## Also in this patch (carried over from the PATCH-284 review)
1. **Type button highlight.** After clicking a type button (e.g. Flowchart) while drawn pictures are on screen, the
   button must show as selected (`aria-pressed="true"`), not "Show options". Test it.
2. **Re-add two guarantees** whose tests were deleted with the AntV generator tests in 284:
   - Edit as drawing on a drawn option: an empty Post name → the drawing takes the picture's title
     (`outline.title`); a typed Post name wins (PATCH-279 rule);
   - no type button (Flowchart, Mindmap, Pie, Bar, Timeline, Comparison) ever calls `/api/ai/generate-component`
     (the old single-picture generator); they go outline → draw-picture.

## Addendum 1 (CTO, 2026-10-05, live)
Live with recorded responses: slice → one panel (Fill, Border); picking works and the new colour is ringed; text edit
and background (hex) work; Save stores text, background and slice colour; type button highlight fixed.
**Defect — the owner's explicit rule is broken: the swatch row REORDERS after a pick.** Live: Fill row before
`[…, #374151]`, picked `#374151`, the row afterwards differs. The swatches are recomputed from the picture's colours on
every render, so changing a colour changes the set and its order (exactly the "weird shuffling" the owner reported in
PATCH-275). Fix: the swatch list of a row is FROZEN when the panel opens for an element (or the picture) and stays
identical — same colours, same order — until the selection changes or the panel closes; a picked colour that is not
in the frozen list is NOT inserted (the native input and hex field show it, and it is ringed only if it is in the
list). Test: open the panel, record the swatch values, pick the last swatch, pick a hex not in the list, pick via the
native input → the swatch values are identical each time; selecting another element recomputes once.
Gate `--outputFile=.opencode-vitest-285a.json`.

## Final result (CTO, 2026-10-05, live with recorded AI responses)
Board af02972f, own tab (outline/draw answered from recorded 283 responses; saving and reload real):
- Pie Chart chip shows as selected (`aria-pressed=true`) with drawn options on screen.
- Click a slice → ONE side panel ("Slice": Fill, Border); pick a swatch → the slice takes the colour, the colour is
  ringed, the swatch row keeps its exact order (after Addendum 1; before it reordered — the owner's PATCH-275 rule).
- Click a legend text → "Text" panel; new text applied on Enter (wraps to two lines); size field; Bold.
- Click the ground → "Picture" panel, Background; hex `#fff7e6` → the picture's ground changes.
- Save 201 with the new text, background and slice colour; Edit window: select a slice, change it, Save changes 204
  (keeps the earlier text); Edit as drawing → drawing with the edited text and background.
- Test posts deleted (86e890c3, 70149151, 57a8e747, 15182f34, 253eeeb5).
- Known item: a free text that grows to two lines can touch the row below it (the de-overlap moves cards, not free
  texts) — a follow-up for the repair step.
- Gate `.opencode-vitest-285a.json`: 59/59 identical to the baseline; tsc clean. Net growth: AIComponentEditor +26,
  AIContentEditModal +19.
