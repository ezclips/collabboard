# SPIKE-277 — AntV pictures → native Excalidraw drawings (result)

Date: 2026-10-04. Measured by the CTO in his own browser tab (CDP 9333) on the dev server, harness
`/e2e-fixtures/antv-excalidraw` (dev only). Converter: `lib/ai/antv/toExcalidraw/` (PATCH-277 + addenda 1–4).

## Result: GO, with one known item
All 18 rows (15 designs from every AntV family, 3 of them also in the dark `midnight` theme):

| Design | Text | Shapes | Icons | Colours | Text size/colour (independent) | Time |
|---|---|---|---|---|---|---|
| hierarchy-structure | 100% | 12/12 | – | 100% | 11/11 / 11/11 | 13.8 ms |
| compare-binary-horizontal-simple-vs | 100% | 3/3 | – | 100% | 4/4 / 4/4 | 2.0 ms |
| compare-swot | 100% | 11/11 | – | 100% | 15/15 / 15/15 | 6.9 ms |
| compare-quadrant-simple-illus | 100% | 9/9 | – | 100% | 9/9 / 9/9 | 3.4 ms |
| chart-pie-donut-pill-badge (light + dark) | 100% | 21/21 | – | 100% | 16/16 / 16/16 | 49–51 ms |
| chart-column-simple | 100% | 6/6 | – | 100% | 16/16 / 16/16 | 2.0 ms |
| chart-line-plain-text | 100% | 8/8 | – | 100% | 16/16 / 16/16 | 28.9 ms |
| list-grid-badge-card (light + dark) | 100% | 11/11 | 5/5 | 100% | 16/16 / 16/16 | 3.5–5.6 ms |
| list-row-horizontal-icon-arrow | 100% | 16/16 | 5/5 | 100% | 16/16 / 16/16 | 3.5 ms |
| sequence-timeline-simple | 100% | 6/6 | 5/5 | 100% | 11/11 / 11/11 | 2.7 ms |
| sequence-roadmap-vertical-simple | 100% | 13/13 | 5/5 | 100% | 16/16 / 16/16 | **420.7 ms** |
| sequence-steps / funnel / pyramid | 100% | all | 5/5 | 100% | 11/11 / 11/11 | 1.6–2.4 ms |
| hierarchy-mindmap-branch-gradient-capsule-item (light + dark) | 100% | 30/30 | 5/5 | 100% | 15/15 / 15/15 | 13–14 ms |

- "Independent" = the CTO's own browser check: every text node's computed font size and colour in the AntV DOM
  compared with the converted Excalidraw element (not the converter's own report).
- Network: no request to any outside host caused by the conversion or by Excalidraw (fonts: Helvetica is a system
  font). Only the app's normal Supabase auth check.
- Visual: side-by-side screenshots of all 18 rows reviewed by the CTO; cards, icons, colours, charts, mind map,
  road/dashes, dark theme match. Accepted losses: gradients → one colour (bar chart), drop shadows, bold text
  (Excalidraw has none), icons become images (move/resize, not stroke-editable).

## Known item (for the build patch, not a blocker)
- `sequence-roadmap` converts in 420 ms (limit 150): its 4,824-unit road is sampled with `getPointAtLength` every
  4 units (~1,200 browser calls). Fix in the build patch: parse the path `d` and compute lines/arcs/curves
  analytically; keep `getPointAtLength` only as a fallback. It is a one-time wait on "Edit as drawing".
- `readSvgScene.ts` is 532 lines (ceiling 400 for this folder): split before it becomes product code.

## Defects found live and fixed during the spike (why the live check matters)
1. Every text the same size and black — style read from the `foreignObject`, not its inner text element.
2. The harness route returned 500 / then failed to build (Excalidraw evaluated during SSR; `ssr:false` in a server
   component). The implementer's report claimed 200 without being able to check.
3. Timer included the one-time Excalidraw module load (~800 ms on every row).
4. The roadmap road drawn as thin outlines (96-point sampling of a 4,824-unit path → self-intersecting polygon);
   dashes lost; titles wrapped (Helvetica wider); badge text not vertically centred; pills as rounded boxes.
5. My own spec error: "each text exactly once" — the source legitimately repeats texts; now a count comparison.

## Decision requested from the owner
Visual acceptance (taste call) by looking at the harness himself. If accepted, the next patches are:
1. "Edit as drawing": convert and save as a drawing post / onto the drawing canvas (incl. the analytic path fix).
2. AI chooses the design family from the request (no hard type buttons overriding it); flowcharts via the official
   `mermaid-to-excalidraw`.
3. Remove our own designs and the DOM-override picture editor.
4. Self-host Excalidraw's assets (today `EXCALIDRAW_ASSET_PATH` points at unpkg.com).
