# PATCH-240 — Edit on the picture itself (Napkin-style): click a word, + / − items, recolour a shape

Status: AUTHORIZED (owner, 2026-10-01: "no start with 240" — i.e. start PATCH-240, do not push PATCH-239).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-239 (`13d42c8a`, committed, not pushed)

## Why (CTO, owner's Napkin screenshots)
In Napkin you edit the visual directly: click a word and retype it (with a small text toolbar), blue **+** circles
between items add one, blue **−** circles remove one, and clicking a shape opens a colour/style popover. Since
PATCH-236/239 our designs and the tree mind map are drawn from a stored outline/tree by our own SVG, so every word
and shape on the picture maps to one field: direct editing is a thin layer over the PATCH-239 form state.

## Scope
- Interactive on: the six infographic designs and the tree mind map (`MindmapTreeRenderer`).
- Where: the **live preview** of the Edit window (`AIContentEditModal`) and the large preview of Show options
  (`OutlineSuggestionsPanel`). On the board, a **double-click on an AI picture** opens the Edit window with the
  double-clicked word already in edit mode (no in-place editing on the board itself: board drag/selection stay as
  they are).
- Not interactive: Flow (Mermaid), comparison, timeline, charts (they keep the PATCH-239 form). Out of scope:
  fonts/sizes/bold (Napkin's text toolbar), shape styles/patterns/opacity.
- Small fix carried from PATCH-239: Flow → Connections, the "to" select overflows the left column (make the row
  wrap or the selects shrink: `min-w-0 flex-1`).

## Design
### 1. The layout says what each mark is
- `InfographicText` gains `ref?: { field: 'title' } | { field: 'label' | 'detail'; item: number }`;
  `InfographicShape` gains `item?: number` (the item it belongs to). Every layout sets them (the centre/title text
  of hub/cycle → `title`). `layoutMindmap` nodes gain `path: number[]` (`[]` root, `[b]` branch, `[b, l]` leaf).
- Pure helpers `lib/ai/infographic/edit.ts`: `renameOutline(outline, ref, text)`, `insertItem(outline, index)`
  (a new item "New item" at `index`, respecting 2..8 and the template's max), `removeItem(outline, index)`
  (min 2), `recolorItem(outline, index, colorIndex | null)`; for the tree: `renameNode(tree, path, text)`,
  `addChild(tree, path)`, `removeNode(tree, path)` with the PATCH-239 limits. All return NEW objects (no mutation;
  tested). Lengths are capped by `OUTLINE_LIMITS`.
- Per-item colour: `VisualOutlineItem` gains optional `color?: number` (0..5 palette slot, validated; invalid →
  dropped). Layouts use `item.color ?? index` for the palette entry. Stored outlines without it look unchanged.

### 2. `editable` renderers
- `InfographicRenderer` and `MindmapTreeRenderer` get an optional `edit?: { onChange(next): void }` prop
  (`next` = new outline / new tree). Without it they render exactly as today (no handlers, no extra elements).
- With it:
  - **Words:** each text with a `ref` (each mind-map node label) gets `cursor: text`, a hover outline, and on click
    an absolutely-positioned HTML `<input>` overlay at the text's on-screen box (from `getBoundingClientRect`),
    prefilled, auto-focused, `maxLength` from the limits; Enter/blur commits via the helper, Escape cancels. Only one
    open at a time. `data-ai-edit-ref="label:2"` etc. on the text for tests.
  - **+ / −:** small blue circles (Napkin style, 18px, white +/−): a **−** on each item's shape (left-middle; hidden
    when at the minimum) and a **+** after each item (between it and the next; after the last), hidden at the
    template's maximum. Mind map: **+** on the root (add branch) and on each branch (add leaf), **−** on each
    branch/leaf. `data-ai-edit-add`, `data-ai-edit-remove` attributes. Handles appear on hover of the picture and
    are never part of the saved picture.
  - **Colour:** clicking an item's SHAPE (not its text) opens a small popover with the theme's 6 palette swatches
    and "Auto" (`data-ai-edit-color="<n>|auto"`); choosing applies `recolorItem`. Mind map: branch colour.
  - All overlays are portalled/positioned inside the preview container; the preview scrolls with them.
- The Edit window wires `edit` to the same draft state as its PATCH-239 form, so the form and the picture stay in
  sync both ways. Show options wires it to the active outline (like Edit text; no AI call).
### 3. Double-click on the board
- `FreeformPadletCards`: on an `ai-component` post whose content is an infographic or a tree mind map, when
  `canUseFreeformEditButton` and not locked, `onDoubleClick` on the picture opens `AIContentEditModal` (the same
  state the card's **Edit** button sets) and passes `initialEditRef` = the `data-ai-edit-ref` of the double-clicked
  text (if any), so that word opens in edit mode. Board renderers carry `data-ai-edit-ref` attributes even when not
  editable (attributes only; no handlers). Single click, drag and selection unchanged.

## Tests
- `edit.test.ts`: every helper returns a new object and leaves the input untouched (deep-frozen inputs);
  limits (2..8 items, template max, 8 branches / 6 leaves); rename caps length; `recolorItem` null → removes
  `color`; tree helpers by path.
- Layouts: every text that shows an item's label/detail carries the right `ref`; every item shape carries `item`;
  `item.color` overrides the palette slot; without `color` the geometry/colours equal today's (snapshot).
- Renderers (editable): clicking `data-ai-edit-ref="label:1"` shows an input with that text; typing + Enter calls
  `onChange` with the renamed outline; Escape calls nothing; **+** after item 0 inserts at 1; **−** on item 2
  removes it; + hidden at max, − hidden at min; shape click → popover → swatch 3 sets `color: 3`; a hostile label
  typed into the input is rendered as text (no element injection). Non-editable render has NO `data-ai-edit-add`/
  `-remove` elements and no click handlers (snapshot of the DOM equals today's apart from `data-ai-edit-ref`).
- Modal: editing a word on the picture updates the form's field and vice versa; Save stores it.
- Board (FreeformPadletCards source/behaviour test): double-clicking an infographic AI post opens the edit modal
  with `initialEditRef`; a read-only viewer's double-click does nothing.
- Flow connections row: the selects have `min-w-0` / the row wraps (DOM test).
- **Mutations:** a helper mutates its input → the frozen-input test fails; the non-editable renderer still renders
  handles → the snapshot test fails; double-click opens the modal for a read-only viewer → that test fails.

## Allowed files
```
lib/ai/infographic/** (+ tests), lib/ai/mindmapLayout.ts (+ test), lib/ai/outline.ts (+ test)   (ref/item/color)
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)                       (optional item color only)
components/ai/renderers/InfographicRenderer.tsx, MindmapTreeRenderer.tsx (+ tests)
components/ai/renderers/PictureEditOverlay.tsx (new: input overlay, +/− handles, colour popover)
components/ai/editors/AIContentEditModal.tsx, FlowStepsEditor.tsx (+ tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx, AIComponentEditor.tsx (+ tests)   (wiring only)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the ai-component double-click + passing initialEditRef only)
components/collabboard/canvas/ui/CanvasModals.tsx          (passing initialEditRef to AIContentEditModal only)
app/dashboard/canvas/[id]/CanvasClient.tsx                 (ONLY if the ref must travel through it; say why)
lib/infra/canvas/*.source.test.ts                           (wiring pins)
```
Forbidden: the database, `package.json`, every AI route, `CodeDiagramRenderer.tsx`, `diagram-engine.ts`, the
DOMPurify profile. If a census pins FreeformPadletCards' double-click handlers or the modal props, STOP and ask.
Every new test path must be collected by `vitest.config.ts` (check; STOP if not).
Real tool calls only (never write a tool call as plain text); `timeout 600 npx vitest run …`; no git writes; no
production build; no curl of the dev server. Revert every mutation and confirm `git diff` has no mutation text.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-240.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** test posts only. Show options → click a word on the large preview, retype, Enter → updated;
+ / − items; recolour an item. Save. On the board, double-click a word on the picture → the Edit window opens with
that word in edit mode; edit on the picture and in the form, both in sync; save → board updated. Same for a tree mind
map (rename a branch on the picture, + leaf, − leaf). No AI request after the first generation. Delete the test posts.

## Commit message (verbatim)
```
feat(ai): edit AI pictures directly on the picture

Like napkin.ai: click a word on an AI picture to retype it, use the
blue + and - circles to add or remove items, and click a shape to pick
its colour. Works for the stack, pyramid, stairs, cycle, funnel and hub
designs and the mind map, in the Edit window and in Show options.
Double-clicking a picture on the board opens it for editing at the word
you clicked. No AI call is made for any of it.
```

## Addendum (CTO, 2026-10-01): live result
Seasons text, Show options, Cycle: clicking "Summer" on the large preview opened an inline input prefilled with
"Summer" → "Hot summer" + Enter updated the picture; 4 blue + and 4 blue − handles; + after item 0 inserted "New
item". Saved (POST 201). On the board, a double-click on the word "Spring" opened the Edit window with "Spring" in
edit mode → "Fresh spring" + Enter; the form showed "Fresh spring", "New item", "Hot summer" (in sync); Save →
board updated (PATCH 204). A real click on a cycle node opened the colour popover (6 swatches + Auto); swatch 4
changed its fill `#DDF0EC` → `#EDE5F7`. Tree mind map: double-click on a branch opened it in edit mode → renamed,
+ added a leaf "New point" → board updated. One `generate-outline` per generation; no AI request for any edit.
Test posts `3c49570f`, `79ed87f8` deleted (DELETE 204). The owner's 6 graph lines untouched.
Gate `.opencode-vitest-240.json`: extra [] missing []; tsc clean; no mutation text.
