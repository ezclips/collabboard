# PATCH-251 — The preview's text links become icons with hints; the freed space goes to the preview and designs

Status: AUTHORIZED (owner, 2026-10-02, annotated screenshot: "Similar visuals" and "Edit text" / "Showing … Show all"
circled with arrows to the top-right of the preview: "Add icon with hints and use the area for the mouse over
preview").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-250 (`6e270d98`). Keep the window layout (PATCH-246 stays reverted).

## Why
In `components/collabboard/editors/OutlineSuggestionsPanel.tsx` five full-width text rows sit between the preview
and the design list ("Similar visuals", "Edit text", "Showing: … · Show all", the estimated note) and two boxes sit
below it (Colours, Customize). On a normal laptop the design list is left with about one row of tiles, so hovering
designs (PATCH-250) is cramped.

## Design
### A. One icon toolbar on the preview, top-right
- Inside the preview container (`data-ai-outline-preview`, make it `relative`), an overlay toolbar
  `data-ai-preview-toolbar`, absolutely positioned `top-2 right-2`, `z-10`, a small white rounded bar with a light
  border and shadow (same look as PictureStage's zoom bar at the bottom-right). Icons from `lucide-react`
  (already a dependency), 16 px, each a `<button type="button">` 28×28 with `aria-label`, in this order:
  1. **Edit text** — `Pencil` — keeps `data-ai-edit-text-toggle`. Only when `outline && onEditOutline`.
  2. **Similar visuals** — `Shapes` — keeps `data-ai-similar-toggle`. Only when `similarPresent.length > 0`.
  3. **Colours** — `Palette` — new `data-ai-colours-toggle`. Only when `onThemeChange`.
  4. **Customize** — `SlidersHorizontal` — keeps `data-ai-customize-toggle`.
- **Hints:** every icon shows a small dark tooltip with its name on hover AND keyboard focus (CSS only, e.g. a
  `group` + `group-hover:opacity-100 group-focus-visible:opacity-100` span placed below the icon; `pointer-events:
  none`; text exactly "Edit text", "Similar visuals", "Colours", "Customize"). Also set `title`. An open icon looks
  pressed (`aria-pressed`, purple tint).
- At most ONE popover is open at a time; opening one closes the other.
### B. Popovers instead of inline rows
- Each icon opens a popover `data-ai-preview-popover="edit|similar|colours|customize"` anchored under the toolbar at
  the right (`absolute right-2 top-11`, `z-20`), width `min(26rem, calc(100% - 1rem))`, `max-height: calc(100% -
  3.5rem)`, `overflow-y: auto`, white, rounded, border, shadow, padding 12px. Its content is EXACTLY today's content:
  - edit → `<OutlineTextEditor …>` (today's `editing` state);
  - similar → today's similar-template buttons (`data-ai-similar-row`, `data-ai-similar-template`);
  - colours → today's Colours swatches (keep `data-ai-colours` and every existing data attribute inside);
  - customize → today's Customize body including the Flow direction select (keep `data-ai-customize`,
    `data-ai-customize-*`, `data-ai-flow-direction`).
- A popover closes on: its icon clicked again, Escape, or a pointerdown outside the popover and the toolbar. Picking
  a similar design or a colour does NOT close it (the user may compare). Customize "Apply" closes it.
- The popover sits over the preview; hovering a design tile (PATCH-250) still swaps the preview behind it.
- Remove the old inline rows/boxes for these four (the Similar visuals link + row, the Edit text link + inline
  editor, the Colours box, the Customize box). No behaviour change inside them.
### C. The filter line and the estimated note become compact chips on the same toolbar's left
- A second overlay at the preview's top-LEFT, `data-ai-preview-chips`, `top-2 left-2`:
  - when `familyFilter`: a chip `data-ai-family-filter` reading "{label}" (e.g. "Pie Chart") with an `X` icon
    button `data-ai-show-all` (`aria-label="Show all designs"`, hint "Show all designs") that calls `onShowAll`;
  - when `outline?.valuesEstimated`: a chip `data-ai-values-estimated` reading "≈ Estimated" with a hint (tooltip
    and `title`) "The AI estimated these numbers. Check them under Edit text."
- Remove the old full-width "Showing: … · Show all" line and the old estimated line.
### D. Use the freed space
- The preview grows from 55 % to 60 % of the panel height (`height`/`maxHeight`); the design list keeps
  `flex-1` and gets the rest. Nothing else between the preview and the list.
- The no-numbers chart note (`data-ai-chart-note`) stays where it is (inside the list / in place of the preview).

## Tests
- Update the existing tests that click these controls (`AIComponentEditor.infographic.test.tsx`,
  `AIComponentEditor.patch248.test.tsx`, `AIComponentEditor.patch250.test.tsx`, `OutlineSuggestionsPanel.antv.test.tsx`,
  `OutlineSuggestionsPanel.patch250.test.tsx`, and any other that fails because a control moved into a popover)
  ONLY as far as needed to open the popover first; the behaviour they assert must stay the same. List each change.
- New `OutlineSuggestionsPanel.patch251.test.tsx`:
  - the toolbar shows the 4 icons with their aria-labels and hint texts; Similar visuals only when similar designs exist;
  - clicking Edit text opens `data-ai-preview-popover="edit"` with the outline editor; clicking Colours then closes
    edit and opens colours; Escape closes; a pointerdown outside closes; a click inside does not;
  - the family chip shows the label and its X calls `onShowAll`; the estimated chip appears only with
    `valuesEstimated`;
  - no element with the old texts "Showing:" or "Similar visuals" as a visible link remains outside the hints;
  - the preview container's height style is 60 %.
- **Mutations** (revert with Edit): (1) let two popovers be open at once → a test fails; (2) drop the Escape
  handler → a test fails.

## Allowed files
```
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ new OutlineSuggestionsPanel.patch251.test.tsx)
existing tests under components/collabboard/editors that break ONLY because a control moved into a popover
```
Forbidden: everything else (AIComponentEditor.tsx, PictureStage, renderers, OutlineTextEditor, the database,
`package.json`, AI routes). Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, no test files outside the repo; revert mutations with your
Edit tool; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors components/ai lib/ai
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-251.json
```
Failing FILE set must equal the 26-file baseline. Compact report listing every test file changed. Do not commit.

**Live (CTO):** Show options → the preview has the icon bar top-right with hints, chips top-left, no text rows
under it; the design list shows several rows; each popover works (edit text changes the picture, a similar design
and a colour apply, Customize Apply runs one call); hover preview still works with a popover open.

## Commit message (verbatim)
```
feat(ai): tidy the design window into icons on the preview

Edit text, Similar visuals, Colours and Customize are now small icons on
the preview with a hint on hover, and open as pop-ups. The design
filter and the "estimated" note are small labels on the preview. The
freed space makes the preview bigger and shows more designs at once.
```

## Addendum 1 (CTO, 2026-10-02): review and live result
Live at 1440×900 (own tab, nothing saved): toolbar shows Edit text / Colours / Customize (Similar visuals hidden when
the design has no similar ones, as specified) with hints; Edit text pop-up edits the title and the picture follows;
opening Colours closes Edit; picking a colour keeps Colours open; hovering a tile with the pop-up open still swaps the
preview; Escape closes. Pie Chart → Make pie chart → chips "Pie Chart ✕" and "≈ Estimated"; ✕ shows all designs.
No text rows remain between preview and list; preview 325 px, list 220 px (≈1.5 rows of tiles at this height; the
window height is now the limit). 2 generate-outline calls, 0 padlet writes, 0 console errors. Gate
`.opencode-vitest-251.json`: extra [] missing []; tsc clean (implementer). Test edits only open the pop-up first.
