# PATCH-238 — Colour themes for AI pictures (light and dark), switched with no AI call

Status: AUTHORIZED (owner, 2026-10-01: "start patch 238").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-237 (`cff659ad`, committed, not pushed)

## Why (CTO)
Napkin lets the user restyle a visual (its style picker, Custom Brands) without regenerating; the owner's own
Napkin picture uses a dark teal style. Our pictures have one fixed palette on white. Our designs are our own SVG
(and React for comparison/timeline), so a theme is just a different set of colours: free, instant, no AI call.

## Design
### 1. Themes (`lib/ai/visualThemes.ts`, new, pure)
```ts
type VisualThemeId = 'classic' | 'ocean' | 'sunset' | 'forest' | 'mono' | 'teal-night' | 'midnight';
interface VisualTheme {
  id: VisualThemeId; name: string; dark: boolean;
  background: string;   // the picture's ground
  title: string;        // title / header text
  text: string;         // neutral text (details, leader labels, centre labels)
  muted: string;        // small labels, the "INFOGRAPHIC" eyebrow
  line: string;         // arrows, leader lines, links
  centreFill: string; centreText: string;  // hub / mind-map root
  palette: readonly VisualColor[];          // 6 entries, { stroke, fill, text }
}
```
- `classic` = today's exact colours (`VISUAL_PALETTE`, white ground, `#1F2937` root) — so every stored picture
  looks identical. `paletteAt` stays and keeps returning the classic palette.
- `ocean` (blues/teals), `sunset` (amber/coral/rose), `forest` (greens/olive), `mono` (greys with one indigo accent)
  on light grounds; `teal-night` (ground ≈ `#1E4D46`, mint/aqua strokes, light fills with dark text OR dark fills
  with light text — DeepSeek chooses, contrast rules below decide) and `midnight` (navy ground) as dark themes.
- `themeById(id?: string): VisualTheme` → unknown/missing → `classic`.
- **Contrast rule (tested):** for every theme and palette entry, `text` on `fill` ≥ 4.5:1; theme `text` and `title`
  on `background` ≥ 4.5:1; `muted` on `background` ≥ 3:1; `stroke` vs `background` ≥ 1.5:1 so shapes stay visible.
  A small pure `contrastRatio(a, b)` (WCAG relative luminance) lives in the same file.

### 2. Stored data (optional, so old posts are unchanged)
- `lib/ai/contracts.ts` + `validators.ts`: optional `theme?: VisualThemeId` on `InfographicDiagramData`,
  `MindmapDiagramData` (used by the tree renderer only), `ComparisonDiagramData`, `TimelineDiagramData`.
  Validators accept a known id; an unknown string is dropped to `undefined` (lenient, never fails a stored post).
- Flow (Mermaid) and the Mermaid mind map are out of scope: they keep their colours (the panel says so, §4).

### 3. Drawing with a theme
- Every infographic layout takes `(outline, theme = themeById())` and uses `theme.palette[i % 6]` instead of
  `paletteAt(i)`, `theme.line` for arrows/leaders, `theme.text`/`theme.muted` for non-card text, `theme.centreFill`/
  `theme.centreText` for the hub centre and cycle title. Geometry is unchanged (a test compares geometry across
  themes: identical except colours).
- `mindmapLayout` / `MindmapTreeRenderer`, `ComparisonDiagramRenderer`, `TimelineDiagramRenderer`: read
  `data.theme` → `themeById` → same mapping. `InfographicRenderer` and these three set the picture block's background
  to `theme.background` and the header (eyebrow/title/explanation) to `muted`/`title`/`text`, with rounded corners and
  padding so a dark ground reads as one picture inside the post card.
- No colour literal remains in those files except via the theme (a source test greps the six layout files and the
  four renderers for `#[0-9a-fA-F]{3,6}` and allows none outside `visualThemes.ts`/`visualPalette.ts`).

### 4. Picking a theme (no AI call)
- `OutlineSuggestionsPanel`: a **"Colours"** row (next to Flow) with one swatch button per theme
  (`data-ai-theme="<id>"`, a small circle split into the theme's background and two palette colours, `aria-label`
  = theme name, `aria-pressed` for the selected one). Selecting re-derives every option locally with that theme
  (the infographic, tree mind map, comparison and timeline options carry `theme`); the large preview and thumbnails
  update; NO fetch. Flow's tile shows a small "keeps its colours" note when a non-classic theme is chosen.
- The editor keeps the chosen theme across Edit text and Customize re-ranks in the same session; Save stores it.
- Reopening a saved picture preselects its stored theme (default `classic`).

## Tests
- `visualThemes.test.ts`: every theme has 6 palette entries; the contrast rules above for every theme; `classic`
  equals `VISUAL_PALETTE` and today's root colour; `themeById` fallback.
- Layouts: geometry identical across all themes for the same outline (only colours differ); each layout's shapes
  use the given theme's palette.
- Validators: a stored post without `theme` validates; with a known theme validates and keeps it; an unknown theme
  is dropped, the post still validates.
- Renderers: `teal-night` sets the picture background to the theme's background; labels still render as text;
  the hostile-label tests still pass.
- Source test: no hex colour literals in the six layouts and four renderers (outside the theme/palette files).
- Panel/editor: clicking `data-ai-theme="teal-night"` changes the preview's background and makes NO fetch; Save
  passes `theme: 'teal-night'` in the envelope; reopening a stored themed infographic shows that swatch pressed.
- **Mutations:** a layout ignores the theme and uses `paletteAt` → the theme-palette test fails; the panel's theme
  click triggers a fetch → the no-fetch test fails; a theme with low-contrast text → the contrast test fails.

## Allowed files
```
lib/ai/visualThemes.ts (+ test)                                                    (new)
lib/ai/visualPalette.ts                                                            (only if needed to share types)
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)                                (the optional theme only)
lib/ai/infographic/** (+ tests), lib/ai/mindmapLayout.ts (+ test), lib/ai/outlineToVisuals.ts (+ test)
components/ai/renderers/InfographicRenderer.tsx, MindmapTreeRenderer.tsx, ComparisonDiagramRenderer.tsx,
  TimelineDiagramRenderer.tsx (+ their tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx, AIComponentEditor.tsx (+ its tests)  (wiring only)
lib/ai/*.source.test.ts or components/ai/renderers/*.source.test.ts                (the no-literal pin)
```
Forbidden: the database, `package.json`, every AI route, `CodeDiagramRenderer.tsx`, `diagram-engine.ts`, the
DOMPurify profile, credit costs. If a census pins a renderer's markup or colours, STOP and ask. Every new test path
must be collected by `vitest.config.ts` (check; STOP if not).
Real tool calls only (never write a tool call as plain text); `timeout 600 npx vitest run …`; no git writes; no
production build; no curl of the dev server. Revert every mutation and confirm `git diff` has no mutation text.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai app/api/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-238.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** seasons text → switch through all seven themes on cycle, hub, pyramid, comparison, the tree mind map
and timeline (no AI request after the first); teal-night and midnight readable; save a teal-night picture, check it
on the board, reopen (teal-night pressed), delete the test post.

## Commit message (verbatim)
```
feat(ai): colour themes for AI pictures

Seven colour themes -- classic, ocean, sunset, forest, mono and two dark
ones, teal night and midnight -- for the designs, the mind map, the
comparison and the timeline. Picking a theme redraws at once with no AI
call, is saved with the picture and can be changed later. Every theme
is checked for readable contrast.
```

## Addendum 1 (CTO, live review): text inside a card must contrast with THAT card
Live (seasons text, one `generate-outline` request, then all 7 themes and 6 designs with NO further AI request):
classic/ocean/sunset/forest/mono and teal-night read well on cycle, comparison and the tree mind map; save stored
`teal-night` (POST 201), the board shows it, reopening pressed the teal-night swatch with no AI request. Test post
`b0b050d7` deleted (DELETE 204).
**Defect:** on the dark themes the hub cards' DETAIL text is nearly invisible (midnight: light text on a light card).
Detail lines inside a card are drawn in `theme.text` (meant for the dark ground) instead of a colour that contrasts
with the card's own fill. The contrast tests only compare `text` with `background`.
Fix:
1. Any text drawn INSIDE a shape (it has `insideShapeId`, or it is a comparison/timeline card's body, or a mind-map
   node label) uses the colours of that shape's palette entry: label = `entry.text`, detail = a new
   `entry.detail` (add it to each palette entry of every theme; for classic it is today's detail colour so classic is
   unchanged). Texts outside shapes keep `theme.text`/`theme.muted` on `theme.background`.
2. **Rendered-contrast test (the real check):** for every theme × every layout (fixture outline with labels,
   details and icons), every text with `insideShapeId` has contrast ≥ 4.5:1 against its shape's `fill`, and every
   other text ≥ 4.5:1 (detail ≥ 4.5, muted ≥ 3) against `theme.background`. Icons inside shapes ≥ 3:1 against the
   shape fill. Same idea for the comparison/timeline/mind-map tree renderers (assert the colours they pass to card
   bodies from the theme for each theme).
   Mutation: draw in-card details with `theme.text` again → the test fails for `midnight` and `teal-night`.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-238b.json`).

## Addendum 2 (CTO, 2026-10-01): live result after Addendum 1
Midnight and teal-night hub cards now show their details in the card's own dark text (readable); the teal-night
timeline cards read well. One `generate-outline` request, no request on theme switches; nothing saved in this run.
Gate `.opencode-vitest-238b.json`: extra [] missing []; tsc clean; no mutation text left.
