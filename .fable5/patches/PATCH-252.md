# PATCH-252 — A side panel docked to the right of the AI window; the preview gets the full height

Status: AUTHORIZED (owner, 2026-10-02, Napkin "Colors & Fonts" side panel + two annotated screenshots marking the
empty area right of the window: "we should open a side panel like this. We should in general integrate everything in
the side panels, even the templates. Napkin has the buttons on the side, we move them to the top, so we can dock the
side panel on the side, which gives extra flexibility and extra space below the preview").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-251 (`2f7c0b2a`). The left column (mode, subtype buttons, text, Generate) stays exactly as it is.
Full colour/font control is the NEXT patch (253); this patch only moves today's content.

## Why
After PATCH-251 the designs still sit under the preview and get ~1.5 rows; the pop-ups cover the picture; the chips
overlap the picture's title, and "≈ Estimated" stays on screen after switching to a Flowchart (owner screenshot).

## Design
### A. Three columns when the panel is open
- `AIComponentEditor.tsx`: the modal is `w-[980px]` today (~1112). When the side panel is open it becomes
  `w-[1320px] max-w-[96vw]` (transition on width is fine), and a third column appears on the RIGHT of the preview
  column: `data-ai-side-panel-host`, width 340px, `border-l`, full height, white. Closed → back to 980px, no column.
- The panel's content is rendered by `OutlineSuggestionsPanel` into that host with `ReactDOM.createPortal` (new prop
  `sidePanelHost?: HTMLElement | null`; the editor keeps the host element in state via a callback ref). When
  `sidePanelHost` is not given (unit tests, other callers) the panel renders the side panel INLINE as a right-hand
  column inside its own root — same markup, same data attributes.
- New prop `onSidePanelChange?: (open: boolean) => void` so the editor sizes the modal.
### B. The side panel
- One panel `data-ai-side-panel="<id>"`: a header (icon + title + close `×` button `data-ai-side-panel-close`,
  `aria-label="Close panel"`), then a scrolling body (`overflow-y: auto`, padding 16px). Ids and contents:
  - `designs` — **Designs** (`LayoutGrid`): the whole design list moved from under the preview: the no-numbers note
    (`data-ai-chart-note`) at the top when it applies, the family chip (see C), "Suggested", the categories and
    "Show more". Tiles in a **2-column grid** that fills the panel width (ThumbButton gets a `fullWidth` prop →
    `w-full` instead of `w-[160px]`; thumbnail scale computed from the real width as today). Keep
    `data-ai-outline-tiles` on the scrolling list and `pb-4`. Hover preview (PATCH-250) unchanged.
  - `edit` — **Edit text** (`Pencil`): `OutlineTextEditor`.
  - `similar` — **Similar visuals** (`Shapes`): today's similar buttons.
  - `colours` — **Colours** (`Palette`): today's swatches.
  - `customize` — **Customize** (`SlidersHorizontal`): today's Customize body incl. Flow direction.
- Remove the PATCH-251 pop-ups (`data-ai-preview-popover`) — their content now lives in the panel. All existing data
  attributes inside the content stay the same.
- Open/close: the toolbar icon of the open panel looks pressed; clicking it again closes the panel; clicking another
  icon switches the panel content; the `×` closes; Escape closes. A pointerdown outside does NOT close it (it is
  docked, not a pop-up). Picking a design, a colour or a similar design keeps it open.
- **Default:** when designs first arrive (new outline), the panel opens on `designs`. If the user closed the panel,
  a later re-rank/theme change does not re-open it; a NEW Generate/Regenerate does.
### C. Toolbar and chips
- The preview toolbar (top-right, PATCH-251 look) gets a FIRST icon **Designs** (`LayoutGrid`, keeps hints). Order:
  Designs, Edit text, Similar visuals (only when present), Colours, Customize.
- The family chip moves into the Designs panel header row: "Pie Chart ✕" (`data-ai-family-filter`,
  `data-ai-show-all` on the ✕, hint "Show all designs").
- The estimated chip moves INTO the toolbar, left of the icons, as a small text badge "≈ Estimated"
  (`data-ai-values-estimated`, same hint), and shows ONLY when `outline.valuesEstimated` AND the design shown in the
  preview (hovered or selected) is a numeric chart (`isNumericChartKey`). Nothing is overlaid at the preview's
  top-left any more (`data-ai-preview-chips` removed).
### D. The preview
- With the list gone, the preview container takes the whole panel height (`flex-1`, no 60 % cap). Zoom/Fit
  unchanged; the toolbar stays top-right over it.

## Tests
- Update existing tests ONLY as far as the move requires (open the right panel first instead of a pop-up; 60 % → full
  height). List each changed file and why.
- New `OutlineSuggestionsPanel.patch252.test.tsx` (panel without host → inline):
  - after mount with options the Designs panel is open and holds `data-ai-outline-tiles` with a 2-column grid;
  - toolbar order Designs, Edit text, (Similar), Colours, Customize; clicking Edit text switches the panel to `edit`;
    clicking it again closes the panel; `×` and Escape close; a pointerdown outside does NOT close;
  - `onSidePanelChange` is called with true/false accordingly;
  - estimated badge: shown for a selected chart-pie design with `valuesEstimated`; hidden when a flow design is
    selected with the same outline; hidden without the flag;
  - no `data-ai-preview-popover` and no `data-ai-preview-chips` remain.
- Editor test (`AIComponentEditor.patch252.test.tsx`): with the panel open the modal has the wide class and
  `data-ai-side-panel-host` exists and contains the panel (portal); closing it restores `w-[980px]`.
- **Mutations** (revert with Edit): (1) close the panel on outside pointerdown → a test fails; (2) show the estimated
  badge for every design → a test fails.

## Allowed files
```
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ new OutlineSuggestionsPanel.patch252.test.tsx)
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch252.test.tsx)
existing tests under components/collabboard/editors that break ONLY because content moved into the side panel
```
If `OutlineSuggestionsPanel.tsx` would pass 800 lines, move the side-panel parts into a new
`components/collabboard/editors/OutlineSidePanel.tsx` (allowed). Forbidden: everything else (PictureStage,
renderers, OutlineTextEditor, themes, the database, `package.json`, AI routes). Real tool calls only (never write a
tool call as plain text); one test file at a time with `--reporter=dot`, never pipe vitest into grep/head, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors components/ai lib/ai
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-252.json
```
Failing FILE set must equal the 26-file baseline. Compact report listing every test file changed. Do not commit.

**Live (CTO):** Generate → the window widens and the Designs panel is docked on the right with 2 columns; the
preview fills the height; hover preview works; each icon switches the panel; × closes and the window shrinks;
"≈ Estimated" shows only on pie/bar designs after Make pie chart; nothing overlaps the picture's title.

## Commit message (verbatim)
```
feat(ai): dock the design tools in a side panel

Designs, Edit text, Similar visuals, Colours and Customize now open in a
panel docked to the right of the AI window, so the preview uses the
full height. The designs show two per row. The "estimated" label only
appears on charts.
```

## Addendum 1 (CTO, 2026-10-02): two live defects fixed, live result
Live #1: the host was rendered INSIDE the dashed preview box (landed below it, invisible) → moved to a third column
of the editor row, test pins its parent and order. Live #2: the panel grew to its content (4464 px) and could not
scroll (`h-full` does not resolve under a max-height modal) → host `relative` (row stretch), portalled root
`absolute inset-0`, body `min-h-0 flex-1 overflow-y-auto`; class pins + mutation.
Final live at 1600×900 (own tab, nothing saved): window 980 → 1320 px with the Designs panel docked right (340×719),
8 tiles fully visible in 2 columns, the list scrolls to the last "Show more"; hover preview works; Edit text switches
the panel; × closes and the window returns to 980 px; after Make pie chart "≈ Estimated" shows on the pie and is
gone on Flowchart. 2 generate-outline calls, 0 padlet writes, 0 console errors. Gate `.opencode-vitest-252.json`:
extra [] missing [].
