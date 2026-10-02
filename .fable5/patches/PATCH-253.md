# PATCH-253 — "Colours & Fonts": every colour of the picture and its fonts can be changed

Status: AUTHORIZED (owner, 2026-10-02, Napkin "Colors & Fonts" panel screenshot: "We have to enable that all colors
in the diagram are changeable like in napkin, we should open a side panel like this").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-252 (`78cea826`, the docked side panel).

## Why
Today the Colours panel only offers 7 fixed themes. Napkin lets the user change the background, each element colour
and the fonts of title / label / description. Our AntV designs support this (`themeConfig.colorBg`,
`themeConfig.palette` accepts a `string[]`, `title` / `desc` / `item.label` / `item.desc` text attributes); our own
designs read every colour from one `VisualTheme`.

## Design
### A. A stored style (new, pure: `lib/ai/visualStyle.ts`)
```ts
export type FontRole = 'title' | 'label' | 'desc';
export interface VisualFont { family: VisualFontId; weight: 400 | 500 | 700 }
export interface VisualStyle {
  background?: string;              // '#rrggbb'
  colors?: string[];                // 1..6 × '#rrggbb', palette slots in order
  fonts?: Partial<Record<FontRole, VisualFont>>;
}
```
- `VISUAL_FONTS`: a fixed list of SYSTEM font stacks only (no web font is loaded — nothing from Google):
  `sans` "Sans" (`system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`), `serif` "Serif"
  (`Georgia, "Times New Roman", serif`), `rounded` "Rounded" (`ui-rounded, "Arial Rounded MT Bold", system-ui,
  sans-serif`), `mono` "Mono" (`ui-monospace, Menlo, Consolas, monospace`), `hand` "Handwritten" (`"Segoe Print",
  "Bradley Hand", "Comic Sans MS", cursive`). `fontStack(id)` returns the stack.
- `sanitizeVisualStyle(raw: unknown): VisualStyle | undefined` — lenient, never throws: keeps only `#rrggbb`
  (case-insensitive, stored lower-case), at most 6 colours, known font ids, weights 400/500/700; returns `undefined`
  when nothing valid remains.
- `themeWithStyle(theme: VisualTheme, style?: VisualStyle): VisualTheme` — returns a NEW theme (no mutation):
  `background` replaced; for each given colour i the palette slot i becomes `{ stroke: c, fill: mix(c, background,
  0.85), text: readable(c, fill) }` where `readable` darkens (light ground) or lightens (dark ground) `c` until
  `contrastRatio(text, fill) >= 4.5` (use the existing `contrastRatio`); title/text/muted are re-checked against the
  new background the same way (keep the theme's colour when it already reaches 4.5). Add an OPTIONAL
  `fonts?: Partial<Record<FontRole, { family: string; weight: number }>>` field to `VisualTheme` in
  `lib/ai/visualThemes.ts` (the only change there) and fill it with the resolved stacks.
### B. Stored with the picture
- `lib/ai/contracts.ts`: every diagram data type that has `theme?` gets `style?: VisualStyle`.
- `lib/ai/validators.ts`: the same schemas get `style: z.unknown().optional().transform(sanitizeVisualStyle)`.
- `AIComponentEditor.tsx`: new state `visualStyle` (undefined by default), applied next to the theme where
  `applyThemeToData(option.envelopeData, visualTheme)` is used today (~519, ~528) so the previews, the thumbnails and
  the saved post all carry it. Choosing a preset theme clears `visualStyle`. A new Generate keeps it.
### C. Drawing it
- `lib/ai/antv/mapOutline.ts` `toAntvOptions(outline, template, themeId, style?)`: with a style, `themeConfig`
  gets `colorBg` (background), `palette: colors` (the array, when given; otherwise today's registered palette name),
  and `title` / `desc` / `item.label` / `item.desc` `{ fontFamily, fontWeight }` from the fonts (title → `title`,
  label → `item.label`, desc → `desc` and `item.desc`). Without a style the options are byte-identical to today.
  Per-item colours and text styles from PATCH-240/244 still win over the style.
- `AntvInfographicRenderer.tsx`: pass `data.style`; the background div uses `themeWithStyle(...).background`;
  re-render when the style changes (add it to the effect keys like `data.theme`).
- Our renderers (`InfographicRenderer.tsx` and the design components it dispatches to, `MindmapTreeRenderer.tsx`):
  use `themeWithStyle(themeById(data.theme), data.style)` wherever they call `themeById(data.theme)` today, and
  apply `theme.fonts` (fontFamily + fontWeight) to the title, the item labels and the details when present.
  Flow (Mermaid), Timeline, Comparison and the old charts ignore `style` (they already "keep their colours").
### D. The panel: "Colours & Fonts"
- The `colours` side panel (title "Colours & Fonts", hint on the toolbar icon "Colours & Fonts") shows, top to bottom:
  1. **Themes** — today's preset swatches (unchanged attributes); picking one clears the custom style.
  2. **Background** — one round swatch (24 px) showing the current background; clicking opens the native colour
     picker (`<input type="color">`, `data-ai-style-background`).
  3. **Elements** — one round swatch per palette slot actually used by the selected design (number of outline items,
     max 6), each with its own native picker (`data-ai-style-color={i}`).
  4. **Fonts** — Title, Label, Description: each a font select (`data-ai-style-font={role}`, the 5 names) and a weight
     select (`data-ai-style-weight={role}`: Regular/Medium/Bold).
  5. **Reset to theme** link (`data-ai-style-reset`) — clears the style.
- Every change updates the preview immediately (no AI call, no credit). Rapid colour-picker input is fine to apply
  on every `input` event (local only).
- The panel's props: `visualStyle`, `onVisualStyleChange` (new on `OutlineSuggestionsPanel`).

## Tests
- `lib/ai/visualStyle.test.ts`: sanitize keeps/drops (bad hex, 7 colours, unknown font, weight 600, empty → undefined);
  `themeWithStyle` never mutates, replaces the background and slots, keeps contrast ≥ 4.5 for text on fill and
  title on background for a light and a dark background.
- `lib/ai/antv/mapOutline` test: with a style → `themeConfig.colorBg`, `palette` array, font attributes; without →
  identical output to before (deep-equal against the current result).
- `lib/ai/validators` test: a stored infographic with a valid style keeps it; a hostile style
  (`background: "url(javascript:1)"`, `colors: ["red;x"]`, `fonts: {title: {family: "Comic</style>"}}`) is dropped.
- Panel test: the Colours & Fonts panel shows the 5 sections; changing the background input calls
  `onVisualStyleChange` with `{ background: '#112233' }`; a theme swatch click clears it; Reset clears it.
- Editor test: a style change reaches the saved envelope (`onSave` payload contains `data.style`), no fetch is made.
- **Mutations** (revert with Edit): (1) skip the contrast fix in `readable` → the contrast test fails; (2) let the
  sanitizer keep a non-hex colour → the validator test fails.

## Allowed files
```
lib/ai/visualStyle.ts (+ test)                         new
lib/ai/visualThemes.ts                                 optional `fonts` field only
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)
lib/ai/antv/mapOutline.ts (+ test)
components/ai/renderers/AntvInfographicRenderer.tsx, InfographicRenderer.tsx (+ the design components it renders),
  MindmapTreeRenderer.tsx (+ their tests)
components/collabboard/editors/AIComponentEditor.tsx, OutlineSuggestionsPanel.tsx (+ tests; split the panel body
  into a new components/collabboard/editors/ColoursFontsPanel.tsx if OutlineSuggestionsPanel.tsx would pass 800 lines)
```
Forbidden: everything else (Mermaid/flow, timeline, comparison and chart renderers, AIContentEditModal, the database,
`package.json`, AI routes, web fonts). Real tool calls only (never write a tool call as plain text); one test file at
a time with `--reporter=dot`, never pipe vitest into grep/head, no test files outside the repo; revert mutations with
your Edit tool; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-253.json
```
Failing FILE set must equal the 26-file baseline. Compact report listing every file changed. Do not commit.

**Live (CTO):** Show options → Colours & Fonts: change background, each element colour and the three fonts on an AntV
pie, an AntV mind map and our Hub; the preview and the thumbnails follow; Save to Canvas keeps them on the board after
a reload; Reset returns to the theme; then delete my test post.

## Commit message (verbatim)
```
feat(ai): change every colour and font of an AI picture

The Colours panel is now "Colours & Fonts": pick the background, each
element colour and the fonts for title, labels and descriptions, like
Napkin. Changes show at once, cost no AI credit and are saved with the
picture.
```

## Addendum 1 (CTO, 2026-10-03): review and live result
The implementer's own gate comparison hung (a `diff` with process substitution) and was aborted; the CTO gate on
`.opencode-vitest-253.json` shows extra [] missing []. Implementer: tsc clean, both mutations red then reverted.
Live (own tab): budget text → Hub → Colours & Fonts shows Themes / Background / Elements (4 swatches for 4 items) /
Fonts / Reset. Background #112233, element 1 #ff0000, title Serif Bold: our Hub, the AntV pie and the AntV mind map
redraw with them; the pie thumbnail follows; Save to Canvas → after a reload the board post still has the background,
the red slice and the serif title. 1 generate-outline call (only the first Generate), 0 console errors. Test post
3a7c0f97 deleted (DELETE 204).
Known gap → PATCH-254 C: AntV mind maps have no separate title element (the title is the root bubble), so the Title
font does not reach them.
