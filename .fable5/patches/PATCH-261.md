# PATCH-261 — A colour menu for every element (fill, border, text, any hex)

Status: AUTHORIZED (owner, 2026-10-03: "implement Patch 259 - 262"; CTO plan: "PATCH-261: per-element colour menu
(fill, border, text, hex)").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-260 (element selection layer, `ElementOverride`).

## Why
Napkin ("Visuals Customization"): "Double-click on any element (text, icons, shapes) to bring up the color menu …
text color, border color, or background color … from the palette or adding custom hex codes." Ours: Colours & Fonts
(PATCH-253) changes the whole palette only; one box or one word cannot get its own colour.

## Design
### A. Data (`lib/ai/antv/elementOverrides.ts`)
`ElementOverride` gains `fill?`, `stroke?`, `text?` — each `#rrggbb` (lower-case; anything else dropped by the
sanitizer). `applyElementOverrides` applies them:
- `fill` → the element's `fill` attribute; for an `item-icon` (`<use>`) and an icon group, set `fill` AND
  `color` (lucide icons draw with `currentColor`/stroke — set `stroke` too when the icon is stroke-drawn, i.e. its
  symbol paths have `stroke="currentColor"`; set `color` on the element so `currentColor` resolves);
- `stroke` → the `stroke` attribute (shapes; for icons it is the line colour);
- `text` → for text elements (`title`, `item-label`, `item-value`, `item-desc`, any `foreignObject` text) the CSS
  `color` of the element's inner text node (the first element inside the foreignObject), and `fill` for an SVG
  `<text>`.
- Keep AntV's original values in `data-ai-base-*` attributes so "Reset colour" and a removed override restore them;
  idempotent.
### B. The menu (`components/ai/renderers/AntvElementEditor.tsx`)
- The selection bar (PATCH-260) gets a **Colour** button (`Palette` icon, hint "Colour",
  `data-ai-element-colour-toggle`) that opens a small popover `data-ai-element-colour` under the bar.
- **Double-click on a shape or an icon** opens the same popover (Napkin's gesture). Double-click on TEXT keeps
  opening AntV's inline text editor (do not change that).
- The popover shows only the rows that apply: shapes → **Fill**, **Border**; icons → **Icon colour** (fill/stroke as
  above); text → **Text**. Each row: the 6 swatches of the picture's current palette (theme or Colours & Fonts
  style), up to 6 recently used colours, a native colour picker, and a hex field (`data-ai-element-hex={row}`,
  accepts `#rgb`/`#rrggbb`, normalised; invalid input shows a red outline and does nothing). Plus **Reset colour**
  (`data-ai-element-colour-reset`) which removes `fill/stroke/text` from that element's override.
- Each change commits through the same history as PATCH-260 (undo/redo work), calls `edit.onChange` (no AI call).
- Multiple quick picker `input` events may apply live; one history entry per popover session per row is enough.

## Tests
- `elementOverrides.test.ts`: sanitize keeps hex, drops `red`, `#12`, `url(x)`, `#1234567`; apply sets/restores
  fill, stroke, text colour on a fixture (rect, use-icon, foreignObject text, svg text); idempotent; reset restores
  the base values.
- `AntvElementEditor.test.tsx`: selecting a shape → Colour → Fill swatch commits `{fill}`; hex field `#ABC` →
  `#aabbcc`; invalid hex → no commit; text element shows only the Text row; icon shows only Icon colour; double-click
  on a shape opens the popover, on a text does NOT (the event still reaches the svg); Reset colour removes the keys;
  undo restores the previous colour.
- **Mutation** (revert with Edit): let the sanitizer keep `red` → a test fails.

## Allowed files
```
lib/ai/antv/elementOverrides.ts (+ test)
components/ai/renderers/AntvElementEditor.tsx (+ test; split into a new AntvElementColourMenu.tsx if it would pass 800 lines)
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests) ONLY to pass the current palette to the editor
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-261.json
```
The CTO compares the gate. Compact report. Do not commit.

**Live (CTO):** an AntV list, pie and mind map: give one box a red fill and a black border, one icon a blue colour,
one label a green text via hex; undo/redo; change the theme (the element colours stay); save, reload: kept; then
delete my test post.

## Commit message (verbatim)
```
feat(ai): give any part of an AI picture its own colour

Select a box, icon or text and press the colour button (or double-click
a box or icon) to change its fill, border or text colour, from the
picture's palette or any hex code. Free, undoable and saved with the
picture.
```

## Addendum 1 (CTO, 2026-10-03, before implementation): two additions from PATCH-260
1. `components/ai/renderers/AntvElementEditor.tsx` is 818 lines (over the 800 ceiling). Put the colour menu in a NEW
   `AntvElementColourMenu.tsx` and move at least the pure geometry/hit-test helpers or the handle/bar markup out of
   `AntvElementEditor.tsx` so it ends below 700 lines. No behaviour change from the split.
2. While dragging (move or resize) the page must not create a browser text selection (live: the "INFOGRAPHIC" label
   got highlighted after a drag): set `user-select: none` on the document body for the duration of a drag and restore
   it on drag end; also `preventDefault` the `selectstart` event during a drag. Test: during a drag
   `document.body.style.userSelect === 'none'`, restored after pointerup.
Lessons from PATCH-260 that apply here: AntV's own interactions can stop events — keep the PATCH-260 capture-phase
listeners; a change that only touches elementOverrides must NOT call `instance.update` (the colour overrides live in
the same map, so they take the same no-redraw path); icons are `<use>` elements with 0x0 boxes (use the existing
geometry helpers). The CTO verifies live with the debug attributes `data-ai-last-emit` / `data-ai-outline-overrides`.

## Addendum 2 (CTO, 2026-10-03): three live rounds, final result
jsdom passed every round; Chrome found three defects, each fixed with a test that models the real browser:
1. AntV's editor appends `<g data-element-type="transient-container">` (its own selection/hover overlay) to the
   picture svg; it won the smallest-box hit test, so a click selected `transient-container#0` and the popover had no
   rows → the container and its subtree are never selectable or keyed, and keying skips it so real keys never shift.
2. A real click on the bar's Colour button did nothing: PictureStage's pan `setPointerCapture`d every pointerdown
   outside `PAN_BLOCK_SELECTOR`, retargeting pointerup/click to its div (the PATCH-260 bar buttons had the same
   latent bug; its live pass used only the keyboard) → bar and popover roots carry `data-picture-control` and stop
   pointerdown; the test wraps the editor in a stage that captures like PictureStage.
3. For a text selection AntV's own text toolbar (z-index 9999) sat exactly over our bar → text selections put the bar
   below the box; overlays at z-index 10000.
Final live (own tab): list-grid-badge — box fill #ff0000 + border #000000 via hex, invalid hex outlined and ignored,
icon blue via double-click (rows: icon), label green via Colour (rows: text), double-click on text still opens AntV's
editor ("Travel" → "Travel Z"), undo/redo of the green, drag sets body user-select none and leaves no selection,
viewBox constant, theme → ocean keeps all three, save + reload keeps all three on the board; pie slice `shape@3#0`
fill via hex; mind map node colour at item scope. Gate `.opencode-vitest-261.json`: extra [] missing [] (the one
listed file is the same baseline file written with and without an absolute path); tsc clean.
Found, NOT caused by this patch (→ PATCH-263): on a mind map every node click makes AntV fire `options:change` with a
payload our mapper turns into a different outline, so the picture redraws (`data-ai-last-emit=antv-change`, nodes
shift ~100 px); the selection then resets to the whole node, a second click never narrows, and double-click text edit
does not work on mind maps. Also noted: the badge circle behind an AntV icon has no `data-element-type`, so it cannot
be selected or recoloured.
