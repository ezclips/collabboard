# PATCH-234 — Napkin-quality pictures: our own colourful mind map, coloured flow/comparison/timeline, big preview

Status: AUTHORIZED (owner, 2026-10-01: "yes please you are the PM" — the design pass after PATCH-233).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-233 (`8031c392`)

## Why (CTO, measured on blank pages with Mermaid 11.13.0 + DOMPurify)
- Our Show-options pictures are correct but plain (grey boxes, thin lines) next to napkin.ai.
- **Flowchart**: Mermaid with rounded nodes `A("…")`, per-node `classDef` colours and `curve: 'basis'` looks
  good (soft tinted fills, coloured borders) and keeps SVG text. Keep Mermaid for it.
- **Mind map**: Mermaid can colour branches (`cScale0..11`), but with SVG text (`htmlLabels: false`, needed since
  PATCH-232 because the sanitiser strips HTML labels) its labels sit off-centre and the root text overflows its
  circle. Allowing `foreignObject` + the HTML profile in DOMPurify is XSS-safe (probe: no onerror/script/
  javascript: survives) but the labels still come out empty. So we draw the mind map ourselves.

## Design
### 1. Palette (new `lib/ai/visualPalette.ts`)
Six colour pairs, index-cycled: `{ stroke, fill, text }` —
amber `#E9A23B/#FCEFD9/#5A3B06`, teal `#4F9D8F/#DDF0EC/#1D4A42`, coral `#D9644A/#F9E0DA/#6B2415`,
indigo `#6A7FDB/#E3E8FA/#1F2A6B`, violet `#8E6AC8/#EDE5F7/#3B2463`, green `#5BA35B/#E1F1E1/#1F4A1F`.
`paletteAt(i)`.

### 2. Our own mind map
- Contract (`lib/ai/contracts.ts` + `lib/ai/validators.ts`): `MindmapDiagramData` gains OPTIONAL
  `tree?: { label: string; children?: Array<{ label: string; children?: Array<{ label: string }> }> }` (root →
  branches → leaves; max 8 branches, 6 leaves each). `code` stays required, so every stored post stays valid and
  the Mermaid path still works for old posts and the plain "Mindmap" subtype.
- `lib/ai/outlineToVisuals.ts`: the mind-map option also sets `tree` (root = title, branches = items, leaves =
  children) besides `code`.
- Pure layout `lib/ai/mindmapLayout.ts`: `layoutMindmap(tree) → { width, height, nodes: [{ id, depth, x, y, w, h,
  lines: string[], colorIndex }], links: [{ fromId, toId, d, colorIndex, depth }] }`.
  - Two-sided: the first ceil(n/2) branches to the RIGHT of the root, the rest to the LEFT, each side stacked
    vertically and centred on the root; leaves further out on the same side, stacked under their branch.
  - Text wrap by an estimated width (7.2px per char at 13px; root 15px, 8.4px per char), max line widths: root
    200, branch 170, leaf 150; padding 12px x 8px; line height 18px. Never overlap: vertical gap 12px between
    leaves, 20px between branch groups; horizontal gap 48px between levels.
  - Links: cubic Bézier from the parent's side edge midpoint to the child's facing side edge midpoint.
  - Branch colour = palette index of the branch; leaves inherit it. Root is neutral (`#1F2937` fill, white text).
- Renderer `components/ai/renderers/MindmapTreeRenderer.tsx`: the same header as the other diagram renderers
  (subtype label + title + optional explanation), then an `<svg viewBox>` (width 100%, height auto) drawing links
  (depth-1 width 3, depth-2 width 2, the branch stroke colour, round caps) UNDER the nodes; nodes as `<rect rx=10>`
  (branch: fill + 1.5px stroke; leaf: white fill + 1.5px stroke) with centred `<text>`/`<tspan>` lines in the
  palette text colour, font 13px/600 for branches, 12px/500 for leaves. All text via React children (escaped);
  no `dangerouslySetInnerHTML`.
- `components/ai/AIContentRenderer.tsx` dispatch: `case 'mindmap'`: `data.tree` → `MindmapTreeRenderer`, else
  `CodeDiagramRenderer` (unchanged).

### 3. Coloured flow (Mermaid)
- `outlineToVisuals` flow option: nodes rounded `N0("…")`, one `classDef c{i} fill:{fill},stroke:{stroke},color:{text}`
  per used palette index and `class N{i} c{i}` lines (labels still through `mermaidLabel`).
- `lib/ai/diagram-engine.ts`: `flowchart: { htmlLabels: false, curve: 'basis' }` (keep `htmlLabels: false`,
  `securityLevel: 'strict'`); `lineColor: '#9CA3AF'`.

### 4. Coloured comparison and timeline
- `ComparisonDiagramRenderer`: each column a rounded card with a palette-coloured top band (fill = palette fill,
  heading in palette text colour, 4px top border in stroke colour) and bullet dots in the stroke colour; the
  grid stays responsive. Title block unchanged.
- `TimelineDiagramRenderer`: each item's marker/dot and date label in its palette stroke colour (index-cycled);
  layout unchanged.

### 5. The options screen (`AIComponentEditor.tsx`, Show options only)
- Replace the 2-column grid of tiny previews with: ONE large preview of the selected option (full width of the
  Preview pane, max height 460px, scrollable) and, under it, a row of option buttons (label + a small scaled
  thumbnail, 160px wide). Clicking a button selects it. Save behaviour unchanged.

## Tests
- `lib/ai/mindmapLayout.test.ts`: 3 branches → 2 right, 1 left; 8 branches split 4/4; no two node rects overlap
  (all pairs) for 8 branches × 6 leaves with long labels; long labels wrap to several lines within the max width;
  leaves share their branch's colour index; links start/end on node edges.
- `components/ai/renderers/MindmapTreeRenderer.test.tsx` (the renderers folder is included since PATCH-232): renders
  every label as text; a label with `<img onerror>` appears as literal text with no `img` element; the branch rect
  uses the palette fill.
- `components/ai/...` dispatch test: mindmap with `tree` → tree renderer; without → code renderer.
- `lib/ai/outlineToVisuals.test.ts`: the mind-map option has `tree` AND `code`; the flow code has `classDef` and
  `class` lines and rounded nodes; hostile labels still neutralised.
- `validators` test: a stored mindmap without `tree` still validates; with a valid `tree` validates; a `tree` with
  9 branches is rejected (or trimmed — say which, and be consistent with `parseOutline`).
- Editor options test (extend PATCH-233's): the large preview shows the selected option; clicking another button
  switches it; Save saves the selected one.
- **Mutations:** layout ignores the left side (all right) → the split test fails; renderer uses innerHTML for
  labels → the hostile-label test fails.

## Allowed files
```
lib/ai/visualPalette.ts, lib/ai/mindmapLayout.ts (+ tests)                     (new)
components/ai/renderers/MindmapTreeRenderer.tsx (+ test)                        (new)
components/ai/AIContentRenderer.tsx                                             (the mindmap dispatch only)
components/ai/renderers/ComparisonDiagramRenderer.tsx, TimelineDiagramRenderer.tsx (+ tests)
lib/ai/contracts.ts, lib/ai/validators.ts                                       (the optional `tree` only)
lib/ai/outlineToVisuals.ts (+ test), lib/ai/diagram-engine.ts (+ its source test)
components/collabboard/editors/AIComponentEditor.tsx (+ its options test)       (the options screen only)
```
Forbidden: the database, `package.json`, the generate/convert routes, `CodeDiagramRenderer.tsx`, the DOMPurify
profile. Every new test path must be collected by `vitest.config.ts` (check; STOP if not). If a census pins the
renderers' markup or the editor's options grid, STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai app/api/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-234.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Show options with the Napkin example text → a large coloured two-sided mind map, a coloured
comparison, a coloured flow; save one test post, see it on the board, delete it. An old-style Mindmap
(subtype chip, Mermaid) still renders.

## Commit message (verbatim)
```
feat(ai): colourful, Napkin-style pictures for AI diagrams

Show options now draws its mind map with our own renderer -- a two-sided
map with a colour per branch, rounded cards and curved links -- and the
flow, comparison and timeline use the same six-colour palette. The
chosen option is shown large, with the other options as buttons below.
Older AI mind maps keep rendering as before.
```

## Addendum (CTO, 2026-10-01): live result
Show options, Napkin example text: one `generate-outline` call → Mind map (our renderer: two-sided, a colour per
branch, rounded cards, curved links, every label), Comparison (coloured column bands and bullets), Flow (rounded
tinted Mermaid nodes). Ordered "History of the web" text → Mind map, Flow and Timeline (coloured dates/markers).
The large-preview + option-buttons screen works. The plain Mindmap chip (Mermaid) still renders with labels.
A saved Show-options mind map renders with the new renderer on the board; the CTO's test post `0d69844a` was
deleted (DELETE 204). Gate `.opencode-vitest-234.json`: extra [] missing []; tsc clean; all new test files ran.
Noted: a 5-step Flow is wide and its boxes small in the preview (acceptable; can wrap to two rows later).
