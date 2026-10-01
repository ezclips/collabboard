# PATCH-243 — + / − on AntV pictures, AntV mind maps keep their sides, editable tree in Show options

Status: AUTHORIZED (owner, 2026-10-01: "make sure all the new function work … why do these graphs add a new speech
bubble left, then right, then left again"; the owner delegates the design).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-242 (the stored `side` and the side-freezing helpers in `lib/ai/infographic/edit.ts`)

## Why (CTO live audit, 2026-10-01)
1. **AntV pictures cannot add or remove items on the picture.** AntV 0.2.20 draws its own add/remove buttons
   (`[data-element-type="btn-add"|"btn-remove"]`, each with `data-indexes`), then hides their group
   (`renderer/composites/button.ts`: `setAttributes(group, { display: 'none' })`); its editor has no handler for
   them. Live: 8 buttons in the DOM of the AntV mind map, all `display:none`. Only List view can add items.
2. **AntV mind maps alternate sides by index** (`designs/structures/hierarchy-mindmap.tsx` ~238: `getSide` →
   `rank % 2 === 0 ? 'left' : 'right'`), not configurable. Once + works, every insert would flip later branches
   (the problem PATCH-242 fixes in our own designs).
3. Show options: the infographic designs are editable on the large preview, the tree mind map is not
   (`OutlineSuggestionsPanel` ~160 wires `edit` only for `subtype === 'infographic'`).

## Design
### A. AntV's own + / − (in `AntvInfographicRenderer`, editable mode only)
- After `loaded`, the editable container gets `data-antv-editable`; a scoped CSS rule shows the button group while
  the picture is hovered: `[data-antv-editable]:hover [data-element-type="btns-group"] { display: inline }`
  (CSS beats the SVG attribute). Not editable → nothing changes (board, thumbnails).
- One delegated `click` listener on the container: `closest('[data-element-type="btn-add"], [data-element-type=
  "btn-remove"]')` → parse `data-indexes` (comma list) → map AntV's index path to our outline (AntV's `btn-add`
  indexes are the INSERT position; read `lib/ai/antv/mapOutline.ts` and the AntV structures to confirm how the
  title/root and children map, and write the mapping as a pure, tested function in `lib/ai/antv/mapOutline.ts`) →
  `insertItem` / `removeItem` / child-level equivalents from `edit.ts` (2..8 items; children limits as the outline
  allows) → `edit.onChange`. Out-of-range or unknown indexes → no change.
- The buttons get our Napkin look (blue `#3B82F6` circle, white +/−) via the same scoped CSS (`fill`), so the AntV
  pictures match the PATCH-240 handles.
### B. AntV mind maps keep their sides
- New `lib/ai/antv/stableMindmap.tsx`: a copy of AntV's `hierarchy-mindmap` structure (MIT; keep its licence note
  and a "copied from @antv/infographic 0.2.20" header) with ONE behavioural change: `getSide` returns the datum's
  `side` when present, otherwise AntV's original rule (so stored pictures look the same). Use AntV's public API only
  (`registerStructure`, `BtnAdd`, `BtnRemove`, `BtnsGroup`, `ItemsGroup`, `FlexLayout`, `getElementBounds`,
  `getPaletteColor`, `getThemeColors`, `Defs/Group/Path`) plus small private copies of the few helpers that are not
  exported (`getItemComponent`, `getHierarchyColorIndexes`, `getColorPrimary`). JSX through the per-file pragma
  `/** @jsxImportSource @antv/infographic */` (the package exports `./jsx-runtime`), or plain `jsx()` calls.
  If this needs anything not reachable from the public entry points, STOP and report what.
- `setup.ts` registers it once as `stable-hierarchy-mindmap`; `toAntvOptions` uses it for every
  `antv:hierarchy-mindmap-*` template (same items/colours/options, only the structure type swapped) and passes each
  branch's `side` into the AntV data. Inserts/removes on these pictures go through the PATCH-242 freezing helpers,
  so a + on a right-hand branch adds below it on the right and nothing else moves.
### C. Show options: the tree mind map is editable on the large preview
- `OutlineSuggestionsPanel` wires `MindmapTreeRenderer`'s `edit` for the tree option. The tree option is derived
  from the outline (title = root, items = branches, children = leaves), so map tree edits back to the outline
  (pure helper, tested both ways; `side` carried) and call `onEditOutline`. No fetch.

## Tests
- `mapOutline.test.ts`: the index mapping for a list template and for a mind map (insert at 0, middle, end;
  remove; nested child; title/root never removed; out of range → unchanged).
- Renderer (jsdom with the AntV mock used by the PATCH-241 render tests, or a source/DOM test): editable →
  `data-antv-editable` + the CSS rule present and a click on a `btn-add` with `data-indexes="2"` calls `onChange`
  with an item inserted at 2; not editable → no listener, no attribute.
- `stableMindmap`: with `side` on every branch the branches land on their stored sides (left x < root x < right x);
  without `side` the side assignment equals AntV's original (rank parity) for the same data; registered once
  (StrictMode double effect safe).
- Panel: editing a branch name on the Show-options tree preview updates the outline (no fetch); + root right adds a
  right-side branch.
- **Mutations:** `getSide` ignores `side` → the stored-side test fails; the click listener added when not editable →
  the not-editable test fails; the index mapping off by one → the mapping test fails.

## Allowed files
```
lib/ai/antv/** (+ tests)                                   (stableMindmap.tsx new; setup, mapOutline)
components/ai/renderers/AntvInfographicRenderer.tsx (+ tests)
lib/ai/infographic/edit.ts (+ test)                        (only if a child-level helper is missing)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests)   (tree edit wiring only)
lib/ai/outlineToVisuals.ts (+ test)                        (tree ↔ outline mapping only)
```
Forbidden: the database, `package.json`/lockfile, `node_modules` (no patching the package), every AI route,
`FreeformPadletCards.tsx`, `CodeDiagramRenderer.tsx`, the DOMPurify profile. Every new test path must be collected
by `vitest.config.ts` (check; STOP if not). Real tool calls only (never write a tool call as plain text);
`timeout 600 npx vitest run …`; no git writes; no production build; no curl of the dev server. Revert every
mutation and confirm `git diff` has no mutation text.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-243.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** test posts only. AntV list design: hover → blue + / −; + adds an item, − removes one, Save → board.
AntV mind map: + on a right-hand branch adds below it on the right, nothing moves; an older AntV mind map looks the
same. Show options tree: rename a branch on the preview, + right. No AI request for any edit; no outside request.
Delete the test posts.

## Commit message (verbatim)
```
feat(ai): add and remove items on AntV pictures

The AntV designs now show the blue + and - circles when you hover the
picture, like our own designs, so items can be added or removed right
on the picture. AntV mind maps keep each branch on its side, so a new
branch appears below the one you clicked. The mind map in Show options
can now be edited on the picture too.
```

## Addendum 1 (CTO, 2026-10-01): STOP answered
AntV's `hierarchy-mindmap` computes its layout with `mindmap` from `@antv/hierarchy` (installed as a dependency of
`@antv/infographic`, lockfile 0.7.1), not re-exported. Decision: import it directly AND declare it — `package.json`
gains `"@antv/hierarchy": "0.7.1"` (exact pin, already in the lockfile) via `npm install --save-exact`; the lockfile
may change only by the root dependency entry. No other dependency change. Vendoring the layout algorithm was rejected
(large, geometry drift).

## Addendum 2 (CTO, 2026-10-01): live review — two fixes
Live (Show options, one `generate-outline`, no other AI request, no outside request): the Show-options tree is
editable (root right + → "New branch" on the right after Agenda); on an AntV list design + added "New item" and −
removed one; nothing saved. Defects:
1. **Blank squares.** AntV's buttons show as plain blue squares: no + / − mark, so add and remove look identical.
   Fix: every visible AntV button is a circle (`rx`/`ry` = half its size) and gets a white glyph drawn as a sibling
   `<path>` (a "+" for `btn-add`, a "−" for `btn-remove`, stroke white 2px, `pointer-events: none`) inserted right
   after the rect, once per render (idempotent on update). Test: after render in editable mode each `btn-add` has a
   "+" glyph sibling and each `btn-remove` a "−" one; not editable → no glyphs.
2. **Mind-map buttons pile under the boxes and cover words** (AntV stacks remove/add below each node; "Travel" was
   hidden). For `antv:hierarchy-mindmap-*` only: keep AntV's button group hidden and draw OUR handles instead
   (`PictureEditOverlay`, the PATCH-242 look), positioned from each node's on-screen box (the AntV item element and
   its `data-indexes`): − on the inner edge, + on the outer edge (away from the root), both fully outside the box;
   the root gets two + (`root:left`, `root:right`) that add a branch on that side. Clicks go through the same pure
   mapping/helpers (`applyAntvButton` or a sibling), so sides freeze and nothing moves. Positions recompute after
   each render/update and on container resize. Test: no handle intersects any node text box; root:right adds a
   branch whose stored side is right; + on a branch adds a child to that branch.
   Mutations: drop the glyphs → the glyph test fails; handles on the node box → the overlap test fails.
Allowed files as before plus `components/ai/renderers/PictureEditOverlay.tsx` (+ test). Re-run the verification and
the full gate (`--outputFile=.opencode-vitest-243b.json`).

## Addendum 3 (CTO, 2026-10-01): live result after Addendum 2
Show options (one `generate-outline`, no other AI request, no outside request, no console error): AntV list design
shows blue circles with white + / −; + added "New item", − removed one. AntV mind maps (branch-gradient-rounded-rect
and level-gradient-lined-palette) show our handles: 14 / 16 handles, none overlapping any label; root right + added
a branch on the right and every other branch kept its side. Show-options tree editable (root right + → right).
Nothing saved. Gate `.opencode-vitest-243b.json`: extra [] missing []; tsc clean; no mutation text.
