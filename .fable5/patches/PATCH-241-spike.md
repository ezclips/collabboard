# PATCH-241 spike — AntV Infographic as the drawing engine for AI pictures (result)

Status: SPIKE DONE (owner, 2026-10-01: "yes run spike"). No product code changed; nothing installed in the repo.
Author: CTO (PM)

## Question
Can `@antv/infographic` (MIT, antvis/Infographic, 6.9k stars, ~35k npm downloads/week, v0.2.20) draw our
stored outline (title + items with label/detail/icon/children) with its ~276 templates, edit on the picture, and
hand edits back to us — without calling outside services — at an acceptable size?

## Method
Standalone scratch install (outside the repo, deleted afterwards): `@antv/infographic@0.2.20` bundled with esbuild
(minified IIFE), a test page rendered in the CTO's own tab on the persistent browser; outside requests recorded.

## Results
| Check | Result |
|---|---|
| Templates | 276, categories compare, list, chart, relation, sequence, quadrant, hierarchy; themes light, dark, hand-drawn |
| Our outline → templates | 9/9 rendered the seasons outline (list arrows, steps, trees, mind map, pyramid cards, compare) without errors; data shape is `{ title, items: [{ label, desc, icon, children }] }` — a direct mapping of our outline |
| On-picture editing | `editable: true`: click selects with a toolbar (colour, font, align, text); double-click edits a word; the edit emitted `options:change` `{op:'update', path:'data.items', indexes:[i], value:{label:'Hot summer\n'}}` and `getOptions().data` held the new label → we can persist edits (trim the trailing newline) |
| Size | whole engine 915 KB minified / **299 KB gzip** (antv 420 KB, @antv/layout 119, measury 73, postcss 55, culori 48, lodash-es 34, roughjs 27 …) — about Mermaid's size; load it lazily only when a picture is shown |
| Module format | ships CJS `main` + ESM `module` + types (not ESM-only) |
| **Outside requests, default** | **23** — it loads ALL registered fonts (6 font CSS + woff2 files) from `assets.antv.antgroup.com` on every render; icons without our loader fall back to `www.weavefox.cn/api/v1/infographic/icon` (search by label) |
| **Outside requests, configured** | **0** — after `getFonts().forEach(f => { f.fontWeight = {}; f.baseUrl = '' })`, `setDefaultFont('Inter, system-ui, sans-serif')` and `registerResourceLoader(our loader)` returning an inline SVG symbol for every icon (so the search fallback is never reached) |
| Hand-drawn theme | works offline; it wants a handwriting font (we would self-host one; without it text falls back to serif) |

## Risks
- Pre-1.0 (0.2.x; odd parallel 0.3/0.4 tags on npm): pin the exact version; wrap it behind our own adapter.
- The font switch-off uses the font objects returned by `getFonts()` (no public `unregisterFont` export) — pin a
  test that asserts zero outside requests.
- Some templates expect specific data (compare-* needs two groups; hierarchy/mind map need `children`): our
  `suggestDesigns` must offer only templates whose data shape matches the outline.
- Not yet proven: compiling inside our Next.js app (webpack, `'use client'`, dynamic import) — first step of the
  integration patch.

## Recommendation (CTO)
Adopt it as the drawing engine behind our own outline (the AI step, stored outline, Visualize…, themes picker and
credits stay ours). Integration patch (needs the owner's OK to add the dependency):
1. Add `@antv/infographic@0.2.20` (exact pin); a client-only adapter `lib/ai/antv/` that disables fonts, sets our
   font, and supplies Lucide icons through `registerResourceLoader`; lazy-loaded.
2. Map outline ↔ AntV data; a template catalogue filtered by outline shape; "Similar visuals" = same structure.
3. `editable` in the Edit window and Show options; `options:change` → our outline → save.
4. Keep our six designs + tree mind map for existing posts; new pictures use AntV templates; Mermaid only to read
   old posts.
5. Test: zero outside requests (network-mocked render test + a live check).
