# PATCH-236 — Napkin-style design library: store the shape, six new designs, a Suggestions panel

Status: AUTHORIZED (owner, 2026-10-01: "wait on push implemend patch 236").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-235 (`1a86b7aa`, committed, not pushed)

## Why (CTO, checked live in napkin.ai's AI Suggestions panel)
Napkin's AI never draws. It extracts the text's SHAPE once (title, items with label + short description, and what
KIND of text it is: steps, levels, a cycle, parts of a whole, a comparison...). The Suggestions panel then lists
every designed template that can hold that shape, grouped into categories (Mindmap, Process, Timelines, Comparison,
Hierarchy, Parts of a whole, Visual Metaphors...). Switching designs keeps the words and costs no AI call.
We already extract the shape (PATCH-233), but we have only four designs, we do not know the kind of text, and we
store the finished picture, so a different design means a new generation.

## Design
### 1. The outline learns its kind (`lib/ai/outline.ts`)
- `VisualOutline` gains `kind: OutlineKind`, where
  `type OutlineKind = 'list' | 'steps' | 'levels' | 'cycle' | 'parts' | 'comparison' | 'timeline' | 'cause_effect'`.
- `OUTLINE_SYSTEM_PROMPT` asks for `"kind"` with one line per value explaining when to use it (levels = ranked or
  nested from broad to specific; parts = components of one whole; cycle = repeats back to the start; etc.).
  The rest of the prompt is unchanged.
- `parseOutline`: a missing or unknown `kind` becomes `'timeline'` when any item has a `date` and `ordered` is true,
  else `'steps'` when `ordered`, else `'list'`. Never throws for `kind`.

### 2. A new stored diagram subtype that keeps the shape: `infographic`
- `lib/ai/contracts.ts`: `DiagramSubtype` gains `'infographic'`; `AIRendererKey` gains `'infographic'`; new
  ```ts
  type InfographicTemplate = 'stack' | 'pyramid' | 'stairs' | 'cycle' | 'funnel' | 'hub';
  interface InfographicDiagramData extends DiagramDataBase {
    subtype: 'infographic'; renderer: 'infographic';
    template: InfographicTemplate;
    outline: VisualOutline;      // the extracted shape, stored so the design can be switched later
    explanation?: string;
  }
  ```
- `lib/ai/validators.ts`: a schema for it. `outline` is validated through the same limits as `parseOutline` (reuse
  it, do not duplicate the limits); an unknown `template` is rejected.
- `infographic` is NOT added to the editor's generic subtype chips, golden prompts or the generate-component route:
  it is only produced by Show options. `lib/ai/conversion-matrix.ts`: `'diagram:infographic': []`.
- Every existing switch over `DiagramSubtype` that must stay exhaustive gets an `infographic` arm (tsc will list
  them). In `components/ai/AIContentRenderer.tsx`: `case 'infographic'` → `InfographicRenderer`.

### 3. Six designs drawn by our own code (`lib/ai/infographic/`)
One pure layout per template: `layoutX(outline) → { width, height, shapes, texts }`, plus a shared
`lib/ai/infographic/text.ts` with the label-wrapping estimate (move `wrapLabel` out of `mindmapLayout.ts` and import
it there too; behaviour unchanged). Colours come from `paletteAt(i)` (PATCH-234). Item `label` is the heading,
`detail` the description (both wrapped, never clipped; the box grows instead).
- **stack**: layers on top of each other (rounded bands, the first item on top), label inside the band, detail to
  its right. 2–8 items.
- **pyramid**: a triangle cut into horizontal bands, the FIRST item at the narrow top; labels inside, details to the
  right with a thin leader line. 3–7 items.
- **stairs**: rising steps left→right, one item per step (number badge, label on the step, detail under it). 3–7.
- **cycle**: items on a circle with curved arrows between neighbours, the last back to the first; title in the
  middle. 3–8.
- **funnel**: bands narrowing downward, first item widest; label inside, detail to the right. 3–6.
- **hub**: the title in a centre circle, items around it on spokes, alternating left/right like the PATCH-234 mind
  map but with each item a card (label + detail). 3–8.
Renderer `components/ai/renderers/InfographicRenderer.tsx`: the same header as the other diagram renderers, then
`<svg viewBox>` (width 100%, height auto) from the layout. All text as React children; no `dangerouslySetInnerHTML`.

### 4. Which designs fit, best first (`lib/ai/infographic/suggest.ts`, pure)
`suggestDesigns(outline): Array<{ key, label, category, fit: number, envelopeData: DiagramData }>`, built from the
four existing options (`outlineToVisuals`, unchanged) plus every infographic template whose item count fits.
- Categories: `Hierarchy` (stack, pyramid), `Process` (stairs, funnel, flow), `Cycle` (cycle), `Mindmap`
  (mind map, hub), `Comparison` (comparison), `Timelines` (timeline).
- `fit` from the kind: levels → pyramid, stack, funnel first; steps → stairs, flow, funnel; cycle → cycle first;
  parts → hub, mind map; comparison → comparison; timeline → timeline, stairs; cause_effect → flow, stairs; list →
  mind map, hub, stack. Everything else that fits follows. Sorted by fit, stable.
- Each infographic option's `envelopeData` is an `InfographicDiagramData` carrying the outline.

### 5. The Suggestions panel (`components/collabboard/editors/OutlineSuggestionsPanel.tsx`, new)
- Move the Show-options screen out of `AIComponentEditor.tsx` (1,379 lines) into this component; the editor passes
  the options, the selected key and `onSelect`.
- Layout: the large preview of the selected design (as now), and under it **"Suggested"** (the top 4 by fit, the
  first with a small "Best match" badge) followed by the remaining designs grouped under their category headings.
  Each design is a thumbnail button (`data-ai-outline-option`, as now) with its label.
- The editor's Show options uses `suggestDesigns` instead of `outlineToVisuals`. One AI call, as before.

### 6. "Change design" without a new AI call
When the AI editor opens an existing post whose content is an `infographic` (it carries the outline), the editor
opens straight in Show options with `suggestDesigns(stored outline)`, the stored template preselected, and NO AI
call. Saving updates the same post (the existing edit-save path). Older posts behave exactly as today.

## Tests
- `outline.test.ts`: `kind` parsed; unknown/missing `kind` falls back as specified.
- One layout test per template (`lib/ai/infographic/*.test.ts`): item count limits; every label and detail present
  in `texts`; no two text boxes overlap; boxes stay inside `width/height`; long labels wrap within the max width;
  the first item sits where specified (top of the pyramid/stack/funnel, first step at the left, cycle starts at
  12 o'clock).
- `suggest.test.ts`: each kind's first choice; item counts outside a template's range exclude it; the four old
  options still appear; each infographic option carries the outline.
- `validators`: a valid infographic validates; unknown template rejected; a stored mindmap/comparison/flow/timeline
  from before still validates.
- `InfographicRenderer.test.tsx`: renders all labels as text; a hostile label (`<img onerror=...>`) appears as
  literal text with no `img`; one test per template that it renders without throwing.
- `AIContentRenderer` dispatch: `infographic` → the new renderer.
- Editor: Show options shows "Suggested" with "Best match" first and the category headings; picking a pyramid and
  saving passes an infographic envelope with the outline; opening an existing infographic shows the designs with
  its template selected and makes NO fetch.
- **Mutations:** pyramid puts the first item at the bottom → its layout test fails; `suggestDesigns` ignores `kind`
  → the first-choice test fails; the editor fetches when opening a stored infographic → the no-fetch test fails.

## Allowed files
```
lib/ai/outline.ts (+ test)
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)               (the infographic subtype only)
lib/ai/conversion-matrix.ts                                       (the empty infographic entry only)
lib/ai/mindmapLayout.ts                                           (import wrapLabel from the shared text.ts only)
lib/ai/infographic/** (+ tests)                                   (new)
components/ai/renderers/InfographicRenderer.tsx (+ test)          (new)
components/ai/AIContentRenderer.tsx                               (the infographic case only)
components/collabboard/editors/OutlineSuggestionsPanel.tsx        (new)
components/collabboard/editors/AIComponentEditor.tsx (+ its tests)
any file tsc names for a missing infographic arm in an exhaustive DiagramSubtype switch (the arm only; list them)
```
Forbidden: the database, `package.json`, the AI routes (the outline route's code is unchanged; only the shared
prompt/parse change), `CodeDiagramRenderer.tsx`, the DOMPurify profile, the PATCH-235 Visualize wiring. If a census
pins the DiagramSubtype list, the renderer list, the mode registry or the conversion matrix, STOP and ask. Every new
test path must be collected by `vitest.config.ts` (check `lib/ai/infographic/`; STOP if not).
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai app/api/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-236.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Show options with the "heading levels" text (levels → pyramid/stack first), a morning-routine text
(steps → stairs first) and a seasons text (cycle first): the Suggested row, category headings, every design renders
with all labels; save a pyramid as a test post, reopen it, switch to stairs with no AI request, save, check the
board, delete the test post.

## Commit message (verbatim)
```
feat(ai): Napkin-style design library for AI pictures

The AI now also says what kind of text it read -- steps, levels, a
cycle, parts of a whole -- and Show options suggests the designs that
fit best: six new ones drawn by our own code (layered stack, pyramid,
stairs, cycle, funnel, hub) next to the mind map, flow, comparison and
timeline, grouped by category. A saved picture keeps the extracted
shape, so its design can be changed later without another AI call.
```

Addendum 1 (CTO): authorized - add ONLY `lib/ai/infographic/**/*.test.ts` to the vitest.config.ts include list (next to `lib/ai/*.test.ts`). If other existing files start running and fail, STOP and list them.

## Addendum 2 (CTO review): two gaps from the mode-registry entry
The `infographic` entry in `MODE_REGISTRY.diagram.subtypes` is fine for the type, but:
1. **It shows as a chip.** The editor maps every key of `diagramConfig.subtypes` to a chip (~1142). Filter
   `infographic` out of that list (one `.filter`). Test: Diagram mode shows no "Infographic" chip.
2. **The routes would accept it.** `generate-component`, `convert-component` and `classify-intent` each have an
   `isDiagramSubtype` that accepts any key of `DIAGRAM_SUBTYPE_SCHEMAS`, so a client could request
   `subtype: 'infographic'` and run the model with an EMPTY system prompt. Authorized (route files, this line
   only): each `isDiagramSubtype` also requires `value !== 'infographic'`. Effects: generate-component answers
   400 "Diagram subtype is required." as for any unknown subtype; classify-intent falls back to flowchart as for an
   invalid subtype; convert-component refuses it as a target. Tests: generate-component route returns 400 for
   `subtype: 'infographic'` and never calls `generateComponentText` (extend its existing test file); a
   classify-intent reply with `"subtype":"infographic"` falls back to flowchart if a test file for it exists,
   else a source pin in `lib/ai/` asserting all three guards. Mutation: remove the generate-component guard →
   its test fails.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-236b.json`).

## Addendum 3 (CTO, live review): text sizing is wrong in every design; stairs and cycle are broken
Live (heading levels / morning routine / seasons texts; one `generate-outline` call each; no "Infographic" chip):
the kind→best-match ranking is right (pyramid / stairs / cycle first). But the pictures have these defects:
- Words split mid-word: "Headi ng 1" (pyramid top), "Headi ng 6" (funnel), "breakfa st", "importa nt" (stairs),
  "Sprin g", "Winte r", "Summe r" (cycle).
- Stairs: labels spill above their boxes and overlap the detail text under the previous step.
- Cycle: the arrows cut through the centre across the title, instead of running along the ring.
- Thumbnails occupy about a third of their tile.

**Root cause:** `shared.ts textBlock` calls `wrapLabel(heading, maxWidth, LABEL_FONT)`: it passes the FONT SIZE
(13 / 12) as the CHARACTER WIDTH, so every label wraps at about half the room it has, and `wrapLabel` then slices
words longer than that. The tests could not see it because they check the layout against the same wrong estimate.

Fixes:
1. **One character-width estimate per font size**, in `text.ts`: `charWidthFor(fontSize, fontWeight)`
   (≈ 0.56 × fontSize for weight ≤ 500, 0.6 × fontSize for 600+). Every infographic layout uses it for wrapping AND
   for the measured line widths; never the font size itself. `INFO_CHAR` goes away (or becomes `charWidthFor(13,600)`).
2. **Never split a word.** `wrapLabel` in the infographic layouts wraps only at spaces; a single word wider than the
   max width stays whole on its own line, and the containing box/band/circle GROWS to fit the widest line (the
   mind map keeps its current behaviour: give `wrapLabel` an option `{ breakWords: boolean }`, default true for the
   mind map caller, false for infographics).
3. **Every label sits inside its shape.** Each text produced to sit inside a shape carries `insideShapeId`. New test
   helper used for all six layouts: for every such text, its estimated box (widest line × `charWidthFor`, lines ×
   line height) lies inside that shape's bounds (for a polygon band: inside the band's width at that row; for a
   circle: inside the inscribed square). Labels are never placed outside their shape except as below.
4. **Pyramid / funnel narrow bands:** if a label cannot fit inside its band at that row even with whole words, it
   is drawn OUTSIDE, as the bold first line of the detail block on the right (the band stays, with its number
   instead: "1", "2", …). Test with the six "Heading N" items: no label is split, all inside or moved out.
5. **Stairs:** each step's box is sized to its wrapped label (box height grows), steps rise by a fixed amount, the
   detail text sits UNDER its own box and never overlaps the next box or any other text (the existing no-overlap
   test must use the corrected estimate). The canvas height includes the tallest column.
6. **Cycle:** node radius = fit of the widest whole-word line (min 34). The ring radius grows so neighbouring nodes
   (plus their detail blocks) do not overlap. Each arrow is an ARC ALONG THE RING (SVG `A` with the ring radius,
   clockwise) from just past one node's edge to just before the next node's edge, with an arrowhead; never a
   path through the centre. Detail text is placed OUTWARD from the centre (right-hand nodes left-aligned to their
   right, left-hand nodes right-aligned to their left, top/bottom above/below). Test: every arrow path's points lie
   at ring radius ± 2 px from the centre (sample the arc: start, end, and its flag/radius parameters).
7. **Hub:** the same whole-word and inside-shape rules (it gets the helper test like the others).
8. **Thumbnails:** the scaled preview in each `OutlineSuggestionsPanel` tile fills the tile's width (scale =
   tileWidth / rendered width, measured), not a fixed small factor.
Mutations: pass the font size as the char width again → the inside-shape test fails; draw the cycle arrow through
the centre → the ring-radius test fails.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-236c.json`). The CTO will check the
pictures live again.

## Addendum 4 (CTO, live review 2): five finishing fixes
Live after Addendum 3: hub and funnel are clean; no word is split anywhere; cycle arrows run along the ring;
best-match ranking still right. Remaining:
1. **Thumbnails are scaled UP**, so each tile shows only the giant header ("Markdown Heading"). Render each tile's
   preview at a fixed natural width (560px) inside a clipped box and scale it by `tileWidth / 560` (always ≤ 1),
   origin top-left, tile height = 560 × aspect × scale capped at 120px. Test: the thumbnail's transform scale is < 1
   for a 160px tile, and the tile contains the svg.
2. **Clicking a tile scrolls the large preview out of view.** Keep the large preview visible: make the preview the
   non-scrolling top part of the panel and only the tiles area scroll (or scroll the preview into view on select).
   Test: selecting a tile does not change the preview container's position in the panel (source/DOM structure
   test: the tiles list is the scroll container, not the whole panel).
3. **Cycle details clipped at the left/right edges** ("old and days", "Warm with lo"). The layout's bounds ignore
   the text anchor: a text with `anchor: 'end'` extends LEFT of x, `middle` both ways. Compute every text's
   estimated box anchor-aware, and size the canvas (shift everything right/down if needed) so all boxes fit with
   16px padding. Apply the same anchor-aware box in the in-bounds test helper for all six layouts. Mutation:
   treat every anchor as `start` → the cycle in-bounds test fails.
4. **Stairs: the first step's detail overlaps its own box.** A step's detail block starts at its box's bottom + 8px
   and never overlaps any box (extend the no-overlap test to text-vs-shape for stairs).
5. **Pyramid outside label wraps "Heading / 1".** A label moved outside the band is wrapped at the detail column's
   width (the same width as its detail), so "Heading 1" stays on one line.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-236d.json`).

## Addendum 5 (CTO, 2026-10-01): live result
Three texts, one `generate-outline` call each, no "Infographic" chip. Best match follows the kind: heading levels →
Pyramid (then stack, funnel), morning routine → Stairs, four seasons → Cycle. All six designs render with whole
words and every label inside its shape or beside it (pyramid/funnel narrow bands); cycle arrows run along the ring,
details not clipped; stairs details under their own step; thumbnails show the whole picture; the preview stays in
view. Save → a pyramid post on the board (POST 201); Edit Post reopened it in Show options with 9 designs and NO
AI request; switching to Stairs and saving updated the same post (PATCH 204, still no AI request) and the board
shows stairs. The CTO's test post `6acd8b21` was deleted (DELETE 204); the owner's 5 lines untouched.
Gate `.opencode-vitest-236d.json`: extra [] missing []; tsc clean.
Noted (not blocking): a tile's label row can be partly hidden under a tall thumbnail; new pictures from the toolbar
still land at the default spot (may sit under other posts on a crowded board, as before).
