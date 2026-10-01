# PATCH-241 — AntV Infographic as the drawing engine for AI pictures (276 designs, on-picture editing, offline)

Status: AUTHORIZED (owner, 2026-10-01: "yes add this package and go ahead with next patch").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-240 (`ade6cb60`, committed, not pushed). Read `.fable5/patches/PATCH-241-spike.md` first.

## Why
The spike proved `@antv/infographic@0.2.20` (MIT) draws our stored outline with ~276 templates, edits on the
picture and reports edits back (`options:change`), at 299 KB gzip — and makes ZERO outside requests once its fonts
are switched off and icons come from our own loader. The owner wants Napkin-like breadth and on-picture editing
instead of rigid forms. Our AI step, outline, Visualize…, credits and themes stay ours; AntV only draws.

## Design
### 1. Dependency (authorized)
`npm install --save-exact @antv/infographic@0.2.20`. Only `package.json`/`package-lock.json` change for it. If
Next.js needs `transpilePackages` for it, add ONLY that entry in `next.config.ts` (say so). No production build.

### 2. Client-only adapter `lib/ai/antv/` (lazy)
- `setup.ts` — `configureAntv(mod)` run once per page before the first render:
  - fonts OFF: `mod.getFonts().forEach(f => { f.fontWeight = {}; f.baseUrl = '' })`; `mod.setDefaultFont(` our
    UI font stack `)`; for the hand-drawn theme a LOCAL-only stack (`'Segoe Print', 'Comic Sans MS', 'Bradley Hand',
    cursive`).
  - icons: `mod.registerResourceLoader(loader)` where every icon reference is `lucide/<name>` with `<name>` from
    `VISUAL_ICON_NAMES`; the loader builds an SVG `<symbol viewBox="0 0 24 24">` from the Lucide icon's
    `__iconNode` data (stroke icons: `fill="none" stroke="currentColor" stroke-width="2"`, round caps/joins). It
    NEVER returns null (unknown/missing → a neutral dot symbol) so AntV's remote icon search is never reached.
- `load.ts` — `loadAntv()` = `import('@antv/infographic')` + `configureAntv`, memoised.
- Nothing from AntV is imported at module top level anywhere outside `lib/ai/antv/` (keeps it out of the main
  bundle and out of server code).

### 3. Mapping (pure, `lib/ai/antv/mapOutline.ts`)
- `toAntvOptions(outline, templateName, theme)` → `{ template, theme, palette, data: { title, items } }` where
  flat templates get `items = outline.items.map(i => ({ label, desc: detail, icon: 'lucide/'+icon }))` and
  hierarchy/mind-map templates get `items = [{ label: title, children: items with their children }]`. Icon omitted
  when the item has none.
- `applyAntvChange(outline, templateName, change)` → a NEW outline for `options:change` changes (`update` label/desc
  by indexes, `add`, `remove`, respecting 2..8 and `OUTLINE_LIMITS`; trailing newlines/whitespace trimmed;
  hierarchy indexes mapped back through the root). Unknown changes are ignored.
- Themes: `antvThemeFor(themeId)` — classic/ocean/sunset/forest/mono → `light` + a registered palette from our
  theme's 6 stroke colours; teal-night/midnight → `dark` + palette; new theme id `hand-drawn` → `hand-drawn` +
  classic palette. Register our palettes once (`registerPalette`). Add `hand-drawn` to `VisualThemeId` and the
  Colours row (its contrast rule: text on its light ground ≥ 4.5).

### 4. Template catalogue (pure, `lib/ai/antv/catalog.ts`)
- Read the template names from the installed package at test time and commit a generated list
  (`catalog.data.ts`: name, category = first segment, family = first two/three segments). Never fetch it at runtime.
- `antvTemplatesFor(outline)` → the templates whose data shape fits: `list-*`/`sequence-*` need 2..8 flat items;
  `hierarchy-*` (incl. mind maps) need ≥2 items (children optional); `compare-*` only for `kind === 'comparison'`
  with exactly 2 items (each item's children become that side); `quadrant-*` exactly 4 items; `chart-*` and
  `relation-*` excluded (no numeric data / graph edges yet). Ranked by kind: steps → sequence then list-row;
  levels → list-pyramid, hierarchy; cycle → templates whose name contains `circle`/`cycle`/`ring` first; parts →
  hierarchy, list-grid; comparison → compare; timeline → sequence-timeline* first; list → list-grid, list-row.
- `similarTemplates(name)` → same family, excluding itself.

### 5. Stored data & rendering
- `InfographicDiagramData.template` also accepts `antv:<template-name>` (validator: `/^antv:[a-z0-9-]{3,80}$/` AND
  present in the catalogue; unknown → the post still validates with the default `antv:list-grid-badge-card` or the
  nearest existing name — say which). Our six designs keep their names and renderer.
- New `components/ai/renderers/AntvInfographicRenderer.tsx` (client): same header/box as `InfographicRenderer`,
  a container div; `loadAntv()` then `new Infographic({ container, width: '100%', height: 'auto' or measured,
  editable: !!edit, ...toAntvOptions(...) })`, `render()`; `destroy()` on unmount; StrictMode-safe (cancel flag,
  no "already rendered" ref — see PATCH-232); `data-ai-render-state` loading/done/failed like the others; on
  `options:change` → `edit.onChange(applyAntvChange(...))`. Re-render via `update()` when outline/theme/template change.
- `InfographicRenderer`: `template.startsWith('antv:')` → `AntvInfographicRenderer`, else today's path.
- Text safety: labels must render as text. Test with a hostile label; if AntV injects HTML from data, STOP.

### 6. Suggestions & editing UI
- `suggestDesigns(outline)` gains the AntV options (`key: 'antv:<name>'`, `label` = a readable name from the
  template id, category from §4), ranked with ours; the panel shows at most 12 tiles initially per category plus
  "Show more"; thumbnails render lazily (only when visible).
- **"Similar visuals"** button on the selected tile → a row with `similarTemplates(selected)`.
- **Picture-first editing** for infographic posts (ours and AntV) in `AIContentEditModal`: the picture fills the
  window and is edited directly (AntV editable / PATCH-240 overlay); the PATCH-239 form moves behind a
  **"List view"** toggle (closed by default). `MindmapTreeEditor`: remove the separate "Centre topic" field — the
  title IS the centre (keep them equal in saved data).
- Board double-click (PATCH-240) also opens AntV pictures.

## Tests
- `setup`: after `configureAntv`, `getFonts()` yield no URLs; the loader returns a symbol for every
  `VISUAL_ICON_NAMES` entry and for an unknown one (never null).
- **Zero network:** render 10 catalogue templates (fixture outline with icons) with `global.fetch` spied and
  `document.head.appendChild` spied: no fetch, no `<link>`/`<script>`/`<img>` with an http(s) URL. Use whatever
  environment renders AntV in tests (jsdom, or its `/ssr` export) — say which; if neither works, STOP and ask.
- `mapOutline`: flat and hierarchy mapping; `applyAntvChange` update/add/remove, trimming, limits, hierarchy index
  mapping; returns new objects (frozen inputs).
- `catalog`: shape filters (compare only for 2-item comparison, quadrant only for 4, no chart/relation); ranking
  first choice per kind; every catalogue name exists in the installed package; `similarTemplates` same family.
- Every template `antvTemplatesFor` can return renders without an `error` event for 3 fixture outlines (2, 4, 8
  items) — in the same environment as the zero-network test.
- Validators: `antv:<known>` valid; `antv:unknown` handled as specified; our six still valid; old posts unchanged.
- Renderer: hostile label rendered as literal text; StrictMode → `done`; unmount calls `destroy`; edit change →
  `onChange` with the new outline.
- Modal: an AntV picture opens picture-first, "List view" toggles the form; the mind map form has no "Centre topic".
- **Mutations:** the icon loader returns null for unknown names → the zero-network test fails; fonts left on → the
  zero-network test fails; `applyAntvChange` mutates its input → the frozen test fails.

## Allowed files
```
package.json, package-lock.json                       (the @antv/infographic dependency only)
next.config.ts                                         (transpilePackages entry only, if needed)
lib/ai/antv/** (+ tests)                               (new)
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)    (antv template + hand-drawn theme id only)
lib/ai/visualThemes.ts (+ test)                        (hand-drawn theme only)
lib/ai/infographic/suggest.ts (+ test)                 (AntV options)
components/ai/renderers/AntvInfographicRenderer.tsx (+ test), InfographicRenderer.tsx (dispatch only)
components/ai/editors/AIContentEditModal.tsx, MindmapTreeEditor.tsx (+ tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx, AIComponentEditor.tsx (+ tests)
components/collabboard/canvas/ui/FreeformPadletCards.tsx  (only if the double-click needs a change for antv)
vitest.config.ts                                       (include lib/ai/antv/** only, if not collected)
```
Forbidden: the database, every AI route, `CodeDiagramRenderer.tsx`, `diagram-engine.ts`, the DOMPurify profile,
credit costs, any other dependency. If a census pins package.json dependencies, the renderer dispatch or the modal
markup, STOP and ask. Real tool calls only (never write a tool call as plain text); `timeout 600 npx vitest run …`;
no git writes; NO production build (the dev server is running); no curl of the dev server. Revert every mutation and
confirm `git diff` has no mutation text.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-241.json
```
Failing FILE set must equal the 26-file baseline. Compact report (incl. which test environment renders AntV,
whether transpilePackages was needed, the unknown-template rule chosen). Do not commit.

**Live (CTO):** in the running dev app: Show options with the seasons text → AntV designs among the suggestions,
"Similar visuals", hand-drawn theme; ZERO requests to any host other than localhost/Supabase while rendering;
hostile label test; save an AntV picture; double-click → picture-first edit, retype a word, save → board updated;
List view still works; the mind map form has no Centre topic; delete the test posts.

## Commit message (verbatim)
```
feat(ai): AntV Infographic designs for AI pictures

AI pictures can now use AntV Infographic's design library (lists,
steps, pyramids, trees, mind maps, comparisons) with a hand-drawn
style, "Similar visuals", and editing directly on the picture. It is
loaded only when a picture is shown, uses our own fonts and icons, and
makes no requests to outside servers. Our own designs and older
pictures keep working.
```

## Addendum 1 (CTO, live review)
Live (morning-routine text, one `generate-outline` request): 46 suggestion tiles, 37 AntV; the first AntV pick
(`sequence-ascending-stairs-3d-simple`) rendered (`done`); "Similar visuals" listed 2 of its family; the hand-drawn
theme draws real hand-drawn stairs; a hostile label `<img src=x onerror=…>` rendered as literal text (no img, no
script run); save POST 201, the board shows it (`done`); a board double-click opened the Edit window
picture-first with "List view"; List view showed 5 item fields; an edit there saved (PATCH 204) and the board updated.
No AntV request to antgroup/weavefox. Two fixes:
1. **Font stack names Inter.** `ANTV_FONT_STACK` starts with `Inter`, which our canvas page only gets from the
   Gantt stylesheet (`gantt/codebase/dhtmlxgantt.css` declares Inter from fonts.gstatic.com), so drawing an AntV
   picture made the browser fetch 2 font files from Google. Use a system-only stack:
   `system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif` (no Inter, no Roboto). Pin it in the setup
   test (no `Inter`/`Roboto` in either stack).
2. **The title shows twice.** `AntvInfographicRenderer` prints our header title AND AntV draws `data.title` inside
   the picture. For AntV pictures, keep the small eyebrow but do not render our header title (AntV's own title is
   the one shown and edited on the picture). Test: the renderer has the title text once.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-241b.json`).

## Addendum 2 (CTO, 2026-10-01): live result after Addendum 1
The saved AntV test post rendered on the board and opened picture-first by double-click with ZERO requests to any
host other than localhost/Supabase (CDP network log; before: 2 Inter files from fonts.gstatic.com via the Gantt
stylesheet). Our header title is gone; AntV's own title is the only one. Editing a text directly on the AntV picture
(double-click, type, click away) and Save updated the post (PATCH 204) and the board; no AI request.
Noted: inside AntV's text editor Ctrl+A does not select the whole text (it inserts at the caret) — an AntV quirk.
Test post `8d3d5335` deleted (DELETE 204); the owner's 6 graph lines untouched.
Gate `.opencode-vitest-241b.json`: extra [] missing []; tsc clean; no mutation text.
Separate finding (not changed): `gantt/codebase/dhtmlxgantt.css` loads Inter from fonts.gstatic.com whenever Inter
is used on the canvas page.
