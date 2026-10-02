# PATCH-245 — Zoom and move the picture while editing, like the board

Status: AUTHORIZED (owner, 2026-10-01: "the AntV windows are large but the content very small … if you want to edit
something can you make the canvas interactive in terms of moving and zoom in and out similar to the actual canvas.
Maybe do our editing window as well"; the owner delegates the design).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-244 (`38844693`)

## Why (CTO)
- The picture is sized to the window's WIDTH only (`width: 100%`, height auto). A wide picture (mind map, hub) in the
  large Edit window becomes a thin strip with ~9px words inside a mostly empty frame (owner's screenshots; live 2026-
  10-01). Nothing can be enlarged.
- AntV already has viewBox zoom (Ctrl/Shift+wheel) and pan (Space+drag) built in (`runtime/options.ts` default
  interactions `ZoomWheel`, `DragCanvas`), but nothing on screen says so, and our own designs have none.
- The board itself zooms with Ctrl+wheel and a − / % / + control (bottom-left); the editor should feel the same.

## Design — one shared `PictureStage` (new `components/ai/renderers/PictureStage.tsx`)
Used in exactly three places: the Edit window's picture-first view and its "Live preview" (`AIContentEditModal`,
~1019 and ~1042), and the large preview of Show options (`OutlineSuggestionsPanel`, `data-ai-outline-preview`). Not
on the board, not in thumbnails.
- **Fills the space.** The stage takes the full height and width of its box (no inner scrollbars), with a light
  dotted background like the board, and the picture is fitted on open: scale = min(stageW / pictureW, stageH /
  pictureH), clamped to 25%–200% — so a small picture is drawn BIG, not tiny.
- **Controls** bottom-right, the board's look: `−`, the percentage (click = Fit), `+`, and a "Fit" button
  (`data-picture-zoom-out|in|fit`, `data-picture-zoom-value`). Steps of 10% (×1.1 / ÷1.1 is fine), range 25%–400%.
- **Mouse/trackpad, like the board:** Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms around
  the pointer; plain wheel pans; dragging on EMPTY stage background pans (not on a word, shape, handle, input or
  AntV element — `closest('[data-ai-edit-ref],[data-ai-edit-add],[data-ai-edit-remove],[data-ai-edit-shape],input,
  [data-element-type]')` blocks it); Space + drag pans anywhere. Cursor `grab`/`grabbing` while panning.
- **View only.** Zoom/pan is never saved, makes no request, and resets to Fit when the design or theme changes.
  Keyboard: `+`/`-`/`0` (fit) when the stage has focus and no input is focused.
- **How it scales:**
  - Our designs and the tree mind map: a CSS `transform: translate(x,y) scale(s)` on one inner wrapper that holds
    the SVG AND its `PictureEditOverlay` (handles/inputs are percent-positioned inside it, so they move with it).
    Check the rename input and the colour popover land on the right word at 50%, 100% and 250% (tests + live).
  - AntV pictures: do NOT CSS-scale them (AntV's edit bar and popovers position themselves from
    `getBoundingClientRect` against their offset parent and would be scaled twice). Instead drive the SVG's own
    `viewBox` — the mechanism AntV's `ZoomWheel`/`DragCanvas` use — with the SVG sized to the full stage (width and
    height 100%, `preserveAspectRatio="xMidYMid meet"`). Read AntV's `zoom-wheel.ts`/`drag-canvas.ts`/
    `reset-viewbox.ts` and use the same commands or attribute so AntV's own state stays consistent; AntV's built-in
    Ctrl+wheel/Space+drag must not fight ours (disable the duplicates via the `interactions` option if needed, keeping
    `DblClickEditText`, `ClickSelect`, `BrushSelect`, `DragElement`, `HotkeyHistory`, `SelectHighlight`). Our
    PATCH-243 mind-map overlay handles recompute their positions on every viewBox change. A viewBox change must not
    call `edit.onChange` (it is not outline data; the PATCH-244 no-op guard covers it — test it).
  - If AntV cannot be driven this way without editing `node_modules`, STOP and report.

## Tests
- `PictureStage` (jsdom with mocked sizes): fit scale for a wide and a tall picture (clamped 25–200%); `+`/`−`
  change the scale by one step and clamp at 25%/400%; the value click → fit; ctrl+wheel zooms around the pointer (the
  point under the pointer stays fixed — assert the transform math); plain wheel pans; drag on background pans; drag
  starting on `[data-ai-edit-ref]` does NOT pan; no fetch; nothing written to the outline.
- Our designs inside the stage: clicking a word at scale 2 still opens the input for THAT word; + handle still
  inserts the right item.
- AntV: zoom sets the SVG `viewBox` (not a CSS transform on the AntV container); a viewBox change does not call
  `onChange`; the mind-map overlay handles move with the viewBox.
- Modal and panel use `PictureStage` (DOM test for `data-picture-zoom-value` in the three places); the board card
  renders no stage.
- **Mutations:** zoom not anchored at the pointer → the anchor test fails; drag on a word pans → that test fails;
  AntV zoom by CSS transform → the viewBox test fails.

## Allowed files
```
components/ai/renderers/PictureStage.tsx (+ test)                      (new)
components/ai/renderers/AntvInfographicRenderer.tsx, InfographicRenderer.tsx, MindmapTreeRenderer.tsx,
  PictureEditOverlay.tsx (+ tests)                                      (only what the stage needs)
lib/ai/antv/** (+ tests)                                                (interactions option / viewBox helpers)
components/ai/editors/AIContentEditModal.tsx (+ tests)                  (use the stage; drop the inner scrollbars)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests)    (use the stage in the large preview)
```
Forbidden: the database, `package.json`/lockfile, `node_modules`, every AI route, `FreeformPadletCards.tsx`, the board
canvas, `CodeDiagramRenderer.tsx`, the DOMPurify profile. Every new test path must be collected by `vitest.config.ts`
(check; STOP if not). Real tool calls only (never write a tool call as plain text); one test file at a time with
`--reporter=dot`, never pipe vitest into grep/head; revert mutations with your Edit tool; no git writes; no
production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-245.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** test posts only. Edit window on an AntV mind map: opens fitted and big; Ctrl+wheel zooms at the
pointer, drag on empty space moves it, − / % / + / Fit work; at 250% click a word → AntV's toolbar sits next to it,
colour still saves; + handle still adds a branch. Same on a Hub (our design): rename and + at 250%. Show options large
preview zooms too. No AI request, no outside request. Delete the test posts.

## Commit message (verbatim)
```
feat(ai): zoom and move AI pictures while editing

In the Edit window and the Show options preview the picture now fills
the space instead of shrinking to a thin strip, and it can be zoomed and
moved like the board: Ctrl+wheel or pinch to zoom, drag the empty space
or use the wheel to move, and - / + / Fit buttons in the corner. Editing
words, colours and items works at any zoom.
```

## Addendum 1 (CTO, 2026-10-01): live review — fixes
Live: Show options Hub opened fitted at 156%; + ×6 → 277%; Ctrl+wheel at "Food" → 304% with "Food" fixed under the
pointer (0 px drift); clicking "Food" at 304% opened the input on it and the rename saved. One `generate-outline`,
no outside request. Test post `2a53a3ba` deleted. Defects:
1. **BLOCKER — the Edit window's picture is gone.** On double-click the picture-first area renders with ZERO height
   (only a line under the header, then Cancel/Save): the stage fills a parent whose height comes from its content, so
   0. Give the picture area a definite height in the modal (e.g. the modal body `h-[min(78vh,820px)]` or the
   picture-first box `min-h-[60vh]` — the stage must get a real pixel height) in BOTH modal places, and the same check
   for the Show-options preview. Test: in jsdom assert the class/style that gives the stage's container a definite
   height; live I will measure it.
2. **Wheel must be non-passive.** Console: "Unable to preventDefault inside passive event listener invocation" — a
   React `onWheel` is passive, so Ctrl+wheel also zooms the browser page and plain wheel scrolls the modal. Attach the
   wheel listener with `addEventListener('wheel', fn, { passive: false })` in an effect (and remove it), call
   `preventDefault()` for every wheel over the stage. Test: the listener is registered with `passive: false` and a
   ctrl+wheel event gets `defaultPrevented`.
3. **Handles keep their size.** Our + / − circles (and the AntV mind-map overlay handles) scale with the zoom (huge at
   300%). Keep them 18px on screen at any zoom (counter-scale by 1/scale, positions unchanged); the rename input keeps
   a readable 13–14px font. Test at scale 3: handle rendered size 18px.
Re-run the verification and the full gate (`--outputFile=.opencode-vitest-245b.json`).

## Addendum 2 (CTO, 2026-10-01): live review after Addendum 1
Fixed live: the Edit window's picture area is 1020×600; no passive-listener warning; Ctrl+wheel at "Food" → 304%
with 0 px drift; AntV toolbar opens on a word at fit and at 146%. One defect left:
**AntV pictures do not fill the stage.** The AntV `<svg>` keeps `height="auto"` (measured 928×227 inside a 600px-high
stage, viewBox `-38 -48 1867 456`), so "Fit" reports 100% and the picture stays a thin strip in the top third with
~11px words — the owner's original complaint. In stage mode the AntV svg must be `width="100%" height="100%"` of the
stage (after every AntV render/update — AntV may rewrite the attributes, so re-apply on `rendered`/`loaded`), and
Fit computes the viewBox so the content fills the stage (meet), giving words ≥ 16px for this mind map in a 1020×600
stage. The board renderer (no stage) keeps `height: auto`. Test: in stage mode the svg's height attribute/style is
100%; Fit's viewBox makes content-to-stage scale = min(stageW/contentW, stageH/contentH) (clamped 25–200%); outside
the stage it stays auto. Re-run the verification and the full gate (`--outputFile=.opencode-vitest-245c.json`).

## Addendum 3 (CTO, 2026-10-01): live review after Addendum 2 — three fixes
Live (test post `ca2e3f3e`, AntV capsule mind map, Edit window): zoom buttons, toolbar at zoom (colour green saved to
the board), 20px handles, + at zoom all work; no AI request, no console error. Defects:
1. **Raw CSS text is visible** in the picture area: "[data-antv-editable]:hover [data-element-type="btns-group"] {
   display: inline; } …" is printed above the picture. The new flex chain makes the renderer's `<style>` element
   (PATCH-243's scoped rules) render as a box. Never style `<style>` as content: target only real wrapper elements
   (e.g. by data attribute), or move the rules out of the stage's flex children; keep `style { display: none }`
   semantics. Test: no element whose textContent contains "data-antv-editable" is visible (computed display none or
   not a layout child) inside the stage.
2. **BUG (from PATCH-243): the first + on an older AntV mind map flips every branch.** Before: Venue/Food left,
   Agenda/Travel right; after root:right + → Agenda/Travel left, Venue/Food/New item right. Cause: the freeze uses
   our hub's default (`lib/ai/infographic/edit.ts` ~56: even → right) but AntV's mind map default is even → LEFT
   (`hierarchy-mindmap.tsx` getSide; our `stableMindmap.tsx` fallback). Make the default rule a parameter of the
   freezing helpers (`'hub'` even→right, `'antv-mindmap'` even→left; tree keeps its own half split) and pass the AntV
   rule on every AntV mind-map path (`applyAntvButton`, root:left/right, removes, PATCH-244 style edits that go
   through `cloneItem`). Test: an AntV mind-map outline WITHOUT any `side` → root:right + → every existing branch keeps
   the side it was drawn on (compare the drawn sides from `stableMindmap` before/after), new branch right. Mutation:
   pass the hub rule → the test fails.
3. **Drag-pan does not follow the pointer** in AntV mode: a drag of (+90, +30) moved the content (+140, −35). Pan
   must move the content exactly with the pointer (screen delta / current scale in viewBox units, same sign on both
   axes, accounting for `meet` letterboxing). Test: a drag of (dx, dy) moves a known point by (dx, dy) ± 1px in AntV
   mode and in CSS mode.
(Fit at 52% for this very wide mind map is correct — it is width-limited.) Allowed files as before plus
`lib/ai/infographic/edit.ts` (+ test) for item 2. Re-run the verification and the full gate
(`--outputFile=.opencode-vitest-245d.json`).

## Addendum 4 (CTO, 2026-10-01): live result after Addendum 3
Edit window (test post `ca2e3f3e`, AntV capsule mind map): no raw CSS text; a drag of (+90, +30) on empty space moved
"Food" by exactly (90, 30); root right + and root left + added on their sides with every branch keeping its side;
cancelled without saving. Earlier rounds: 1020×600 picture area, Ctrl+wheel anchored (0 px drift), no passive-
listener warning, 20px handles at zoom, toolbar colour at zoom saved to the board, + at zoom saved. No AI request for
any edit, no console error. Test post deleted (DELETE 204).
NOT verified live: the side fix on a FRESH side-less AntV mind map — `generate-outline` failed three times with 502
("The provider request failed", provider stage, ~25 s) during this check; covered by the real-engine test in
`AntvInfographicRenderer.mindmap.test.tsx` (side-less map → root right + keeps every drawn side). Re-check live when
the provider is back. Gate `.opencode-vitest-245d.json`: extra [] missing []; tsc clean; no mutation text.

## Addendum 5 (CTO, 2026-10-02): deferred live check done
Provider back. Fresh side-less AntV capsule mind map (test post `f72a95c9`): sides before Venue/Food left,
Agenda/Travel right; root right + → new branch right, root left + → new branch left, every existing branch kept its
side; drag (+90, +30) moved "Food" by (90, 30); saved (PATCH 204) and the board showed the same sides. Test post
deleted (DELETE 204).
