# PATCH-282 — AntV diagrams as a built-in library in the drawing editor (no AI)

Status: AUTHORIZED (owner, 2026-10-05: "I want AntV integrated into the drawing post as a library of all preconfigured
AntV diagrams"; 280–284 delegated to the CTO).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-281 (converter fixes + icons as strokes).

## Why
The owner's screenshot: the drawing editor's library panel says "No items added yet". The owner wants every
pre-configured AntV diagram available there, with no AI. Decision (CTO): use Excalidraw's own library panel (drag onto
the canvas, resize, edit) — no panel of our own.

## Facts (CTO, checked)
- Excalidraw libraries cannot hold images ("Support for adding images to the library coming soon!", fork
  `locales/en.json`); PATCH-281 therefore converts icons into line strokes for library use.
- `DrawingEditor.tsx` (~L239–249) and `DrawingLayout.tsx` (~L2069–2072) pass `initialData.libraryItems` built by
  FLATTENING the community items' elements into one element list. That is not the `LibraryItems` shape
  (`{ id, status, elements, created, name? }[]`); it is why the panel shows nothing even when the community library has
  items. Neither component passes `onLibraryChange`, so library state lives only in the open editor: built-in items are
  never written to the user's saved library.
- AntV needs a browser to render, so the library is generated ahead of time (like `catalog.data.ts`) and shipped as a
  static same-origin file: no AI, no database, no outside host.

## Design
1. **Curated list** `lib/ai/antv/toExcalidraw/libraryTemplates.ts`: `ANTV_LIBRARY_TEMPLATES: { template: string;
   name: string; section: 'Charts' | 'Lists' | 'Steps & timelines' | 'Hierarchies & mind maps' | 'Comparisons' |
   'Relations' }[]`, exactly these 74 (CTO-picked from the 276-design audit; no "animated" variants, at most 6 per
   AntV family except where listed), in this order:
   - Charts: chart-pie-donut-pill-badge, chart-pie-compact-card, chart-pie-donut-plain-text, chart-pie-pill-badge,
     chart-column-simple, chart-bar-plain-text, chart-line-plain-text, chart-wordcloud
   - Lists: list-grid-badge-card, list-grid-candy-card-lite, list-grid-circular-progress, list-grid-compact-card,
     list-grid-done-list, list-grid-ribbon-card, list-row-horizontal-icon-arrow, list-row-circular-progress,
     list-row-simple-illus, list-column-vertical-icon-arrow, list-column-done-list, list-pyramid-badge-card,
     list-sector-plain-text, list-waterfall-badge-card, list-zigzag-down-compact-card
   - Steps & timelines: sequence-steps-badge-card, sequence-steps-simple, sequence-timeline-simple,
     sequence-timeline-rounded-rect-node, sequence-timeline-done-list, sequence-roadmap-vertical-badge-card,
     sequence-roadmap-vertical-simple, sequence-snake-steps-compact-card, sequence-snake-steps-pill-badge,
     sequence-stairs-front-pill-badge, sequence-ascending-steps, sequence-funnel-simple, sequence-pyramid-simple,
     sequence-zigzag-pucks-3d-simple, sequence-horizontal-zigzag-simple, sequence-circular-simple,
     sequence-cylinders-3d-simple, sequence-color-snake-steps-horizontal-icon-line, sequence-mountain-underline-text,
     sequence-filter-mesh-simple, sequence-circle-arrows-indexed-card, sequence-interaction-default-badge-card,
     sequence-interaction-default-compact-card
   - Hierarchies & mind maps: hierarchy-mindmap-branch-gradient-capsule-item,
     hierarchy-mindmap-branch-gradient-compact-card, hierarchy-mindmap-level-gradient-rounded-rect,
     hierarchy-mindmap-branch-gradient-lined-palette, hierarchy-mindmap-level-gradient-circle-progress,
     hierarchy-structure, hierarchy-structure-mirror, hierarchy-tree-curved-line-compact-card,
     hierarchy-tree-dashed-arrow-badge-card, hierarchy-tree-lr-curved-line-badge-card,
     hierarchy-tree-tech-style-capsule-item, hierarchy-tree-distributed-origin-rounded-rect-node
   - Comparisons: compare-binary-horizontal-badge-card-vs, compare-binary-horizontal-compact-card-arrow,
     compare-binary-horizontal-simple-fold, compare-binary-horizontal-underline-text-vs, compare-swot,
     compare-quadrant-quarter-simple-card, compare-quadrant-simple-illus,
     compare-hierarchy-left-right-circle-node-pill-badge, compare-hierarchy-row-letter-card-compact-card,
     quadrant-quarter-circular
   - Relations: relation-dagre-flow-lr-badge-card, relation-dagre-flow-tb-compact-card,
     relation-dagre-flow-lr-simple-circle-node, relation-network-icon-badge, relation-circle-icon-badge,
     relation-circle-circular-progress
   `name` = the template id without its first word (chart/list/sequence/hierarchy/compare/relation/quadrant), dashes →
   spaces, first letter upper-case ("chart-pie-donut-pill-badge" → "Pie donut pill badge"; a bare family like
   "compare-swot" → "Swot", "chart-wordcloud" → "Wordcloud"). The per-family cap in the tests is 6 except
   `sequence-*` families, which are already one or two each.
2. **Export view** in the existing harness: `/e2e-fixtures/antv-excalidraw?export=library` renders every listed
   template (`HARNESS_OUTLINE`, classic theme), converts with `icons: 'strokes'`, normalises each drawing to start at
   (0, 0), and shows ONE `<pre data-antv-library>` with the complete file:
   `{ type: 'excalidrawlib', version: 2, source: 'antv', libraryItems: [{ id: 'antv:<template>', status:
   'published', created: 0, name: '<section> · <name>', elements }] }`. Element ids are stable (`stableHash`), so the
   file is reproducible. No AI call.
3. **Generated asset** `public/libraries/antv-diagrams.excalidrawlib`: written by the CTO from the export view (a
   script, not by hand). Budget ≤ 2.5 MB; the export view prints the byte size.
4. **Loader** `lib/collabboard/antvLibrary.ts`: `loadAntvLibraryItems(): Promise<LibraryItem[]>` fetches
   `/libraries/antv-diagrams.excalidrawlib` once per page (module promise cache), checks the shape (array of items with
   `id`, `status`, `elements` array), and returns `[]` plus one `console.error` on any failure (the editor still opens).
5. **Wiring** (both editors): `libraryItems = [...antvItems, ...communityItems mapped to proper LibraryItems]` where a
   community item becomes `{ id: item.id, status: 'unpublished', created: item.created, name: item.name, elements:
   item.elements }` (this also fixes the flattening bug). The editor opens without waiting for the fetch longer than
   it already waits; if the library arrives after mount, update it through `excalidrawAPI.updateLibrary({
   libraryItems, merge: false })` — use whichever the component already supports with the least change.
6. Nothing else changes: no AI, no database, no change to how drawings are saved.

## Tests
- `libraryTemplates`: exactly 74 entries; every template exists in `ANTV_TEMPLATES`; names unique; ≤ 6 per AntV
  family (catalogue `family`); every section non-empty; the name rule on the examples above.
- `antvLibrary`: valid file → items; 404 / bad JSON / wrong shape → `[]` and one `console.error`; fetched once for two
  calls.
- Wiring: `DrawingEditor` passes `libraryItems` whose entries each have `id`, `status`, `elements` (not a flat element
  list); AntV items first; a community item keeps its name.
- The generated file (once present): parses; every item's elements contain no `image` element; every element id is
  unique within its item.
- Mutation: flatten the community items again → the wiring test fails.

## Allowed files
```
lib/ai/antv/toExcalidraw/libraryTemplates.ts (+ test)       new
components/ai/dev/AntvExcalidrawHarness.tsx                 export view only
app/e2e-fixtures/antv-excalidraw/page.tsx                   pass the export param only
lib/collabboard/antvLibrary.ts (+ test)                     new
components/collabboard/editors/DrawingEditor.tsx (+ tests)  wiring only
components/collabboard/canvas/layouts/DrawingLayout.tsx     wiring only
public/libraries/antv-diagrams.excalidrawlib               generated by the CTO
```
Forbidden: everything else, the database.
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
timeout 600 npx vitest run lib/collabboard lib/ai/antv components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-282.json
```
Do not commit.

**Live (CTO):** generate the file; open a drawing post: the library panel lists the AntV sections; drag a pie, a
timeline and a mind map onto the canvas: they look like the AntV originals (icons as strokes), are editable and
resizable, Save keeps them; the same in a Drawing board; no request to any outside host; the editor opens no slower.

## Commit message (verbatim)
```
feat(drawing): AntV diagrams in the drawing library

The drawing editor's library now offers ready-made AntV diagrams (charts,
lists, timelines, mind maps, comparisons) that can be dragged onto the
canvas and edited like any drawing. No AI is involved. Community library
items now show up as separate items again instead of one flat list.
```

## Addendum 1 (CTO, 2026-10-05, live)
The export view works live (74 items, 0 images, 5 s) but the file is **5.25 MB** (budget 2.5 MB). Measured: most of it
is indentation and float noise. In the export view: serialise COMPACT (`JSON.stringify(file)` with no indent), round
every number to 1 decimal (`seed`, `versionNonce`, `version`, `updated` stay integers; `updated` may be a fixed 0), and
drop `customData` from the exported elements (converter bookkeeping, not needed in a library). CTO measurement of the
same transform on the live output: 2.34 MB raw, 190 KB gzipped. Add a test for the serialiser (a pure helper in
`libraryTemplates.ts` or a new `libraryExport.ts`): rounding, no `customData`, no indentation, integers kept.
Gate `--outputFile=.opencode-vitest-282a.json`.

## Final result (CTO, 2026-10-05, live)
- Generated `public/libraries/antv-diagrams.excalidrawlib` from `?export=library` (script, own tab): 74 items,
  2,162,283 bytes (177 KB gzipped), compact, no `customData`, 0 images, 0 open polygons.
- New drawing on board af02972f (board menu → New Draw): the library panel lists all 74 under the published section;
  the preview of "Charts · Pie donut pill badge" has 5/5 wedge colours; clicking inserts it as editable shapes (title,
  donut with % labels, pills, leader lines). Saved (201), saved data has 5 closed filled wedges; after reload the board
  card shows the coloured donut. Test post 49713989 deleted (204).
- Before PATCH-281 Addendum 2 the same insert showed NO donut (open polygon rings lose their fill on restore) — found
  only by this live check.
- No request to an outside host from the library; the editor opens as before.
- Gate `.opencode-vitest-282a.json`: 7 extra files from two concurrent full runs; all 7 pass alone (100/100).
  Implementer deviation accepted: `vitest.config.ts` include for `lib/collabboard/**/*.test.ts` (otherwise the
  loader test never runs).
- Also carries the PATCH-281 harness `?icons=` change (same files).
