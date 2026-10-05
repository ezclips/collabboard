# PATCH-284 — The AI post draws its own pictures (Napkin-style), with Shuffle

Status: AUTHORIZED (owner, 2026-10-05: "As for the AI Post ... Napkin AI generated diagrams based on user text and
buttons selected (pie chart would use your prompts and go through it in a shuffle manner ...)"; 280–284+ delegated to
the CTO). Conditional on the PATCH-283 GO (see its Final result).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-283 (`lib/ai/drawn/**`, `/api/ai/draw-picture`).

## Why
PATCH-283 measured AI-drawn pictures live and they pass. The owner's split: AntV lives in the drawing library (282, no
AI); the AI post is 100 % AI-drawn. This patch puts the drawn picture into the real AI post generator: the type
buttons stay, every Generate draws 3 options of the chosen type, and **Shuffle** draws 3 more. Editing of single
picture elements (colours down to the background, text) is PATCH-285; this patch must already let the user save, reopen
and "Edit as drawing" a drawn picture.

## Design
### 1. Stored type (`lib/ai/contracts.ts`, `lib/ai/validators.ts`)
```ts
interface DrawnDiagramData extends DiagramDataBase {
  subtype: 'drawn';
  renderer: 'drawn';
  outline: VisualOutline;
  kind: DrawnKind;
  seed: number;
  picture: DrawnPicture;   // the REPAIRED picture as returned by the route
}
```
`'drawn'` joins `DiagramSubtype`, but — like `'infographic'` — it is never shown as a type button. The stored-data
validator runs `parseDrawnPicture` on `picture` (stored rows are user-writable: never trust them) and `parseOutline`
(stored path) on `outline`; an invalid picture makes the content invalid (the existing "unsupported content" path).

### 2. Renderer (`components/ai/renderers/DrawnPictureRenderer.tsx`, `components/ai/AIContentRenderer.tsx`)
`case 'drawn'` → `DrawnPictureRenderer`: `parseDrawnPicture` → `drawnToScene` → `sceneToSvg`, shown responsive (width
100 %, aspect ratio from the picture), root marked `data-ai-drawn="true"`. Rendering the SVG string with
`dangerouslySetInnerHTML` is allowed ONLY because `sceneToSvg` escapes every text and only emits `data:image/svg+xml`
hrefs it built itself; keep a test that a stored picture with `<script>`/`onload=`/`javascript:` in text or ids renders
inert.

### 3. Fetching drawn options (`components/collabboard/editors/useDrawnOptions.ts`, new)
`useDrawnOptions({ boardId })` → `{ options, status, error, draw(outline, kind), shuffle() }`:
- `draw` asks `/api/ai/draw-picture` for **3** pictures (`seed = base, base+1, base+2`, `base` random 0..9996),
  at most 2 requests in flight, and fills `options` as they arrive (each a `DesignSuggestion` with key
  `drawn:<kind>:<seed>`, label "Option 1/2/3", category = the kind label, envelope = `DrawnDiagramData`).
- `shuffle()` = `draw` again with the same outline and kind and a NEW base (never repeat a seed of this session).
- Errors per request: a failed request leaves its slot out; if all 3 fail, `error` carries the route's message
  (402 plan/credits and 429 rate-limit messages shown as the route words them). Aborts on unmount/close.
- Pure helpers (seed choice, response → suggestion) in a small separate module with tests.

### 4. Generator wiring (`AIComponentEditor.tsx` — wiring only, it is far over the file ceiling: net growth ≤ 40
lines; put logic in the hook/helpers)
- **Diagram + Show options, after the outline arrives**: instead of `suggestDesigns(outline)` the options are
  `useDrawnOptions.draw(outline, kind)` where `kind` = the clicked type button (Flowchart→flowchart, Mindmap→mindmap,
  Pie Chart→pie, Bar Chart→bar, Timeline→timeline, Comparison→comparison) or, for "Show options",
  `kindForOutline(outline)`. Pie/Bar keep `estimateValues: true` on the outline request (PATCH-250 behaviour) so text
  without numbers still gets values.
- **A type button clicked when an outline is already on screen** draws 3 new pictures of that kind from the same
  outline (no new outline call).
- **Shuffle** button (`data-ai-drawn-shuffle`, label "Shuffle", disabled while drawing) next to the options; it calls
  `shuffle()`.
- The first option that arrives is selected; the preview shows the selected option via the renderer.
- While drawing: 3 placeholder cards with a spinner ("Drawing…") in the options column; the existing loading/error UI
  for the outline call stays as is.
- **Save** stores the selected `DrawnDiagramData` exactly like an infographic is stored today (same save path,
  `aiComponentJson` envelope); title = Post name, else `outline.title`.
- The AntV/our-own design options are NO LONGER offered in the generator (they stay renderable for existing posts;
  their code is removed in a later patch). Theme/style controls that only apply to AntV/our designs are hidden for a
  drawn option.
- **Edit as drawing** for a drawn option: lossless, from the data — see 6.

### 5. Edit window (`AIContentEditModal.tsx` — wiring only, net growth ≤ 25 lines)
A stored drawn post opens in the Edit window showing the picture (renderer), with Save, Cancel and **Edit as drawing**.
No element editing yet (PATCH-285). Nothing else in the Edit window changes for other content.

### 6. Edit as drawing, lossless (`lib/ai/antv/toExcalidraw/drawingPost.ts`, `EditAsDrawingButton.tsx`)
Split `buildDrawingPostData` into a scene-based core `buildDrawingPostDataFromScene(scene, opts)` (toSkeleton →
convertToExcalidrawElements → preview → `DrawingPostData`) and the existing SVG entry (convert, then the core).
`EditAsDrawingButton` accepts either `getSvg` (AntV, unchanged) or `getScene` (drawn: `drawnToScene(picture)`), so a
drawn picture never round-trips through the DOM. Title fallback as in PATCH-279.

## Tests
- validators: a valid stored drawn envelope passes; a picture with 151 elements / bad colours / unknown icons is
  cleaned by `parseDrawnPicture`; a non-object picture → invalid content.
- renderer: renders `data-ai-drawn`; escapes hostile text/ids (no `<script>`, no `on*=` attribute, no `javascript:`).
- `useDrawnOptions` (fetch mocked): 3 requests with 3 distinct seeds and the board id; max 2 in flight; partial
  failure keeps the good ones; all fail → the route's message; `shuffle` uses new seeds never seen before; abort on
  unmount.
- Generator: Show options → outline then 3 draw requests with `kindForOutline`; Pie Chart button → `kind: 'pie'` and
  `estimateValues`; a second type button with an outline on screen → 3 draws, no outline call; Shuffle → 3 more draws;
  Save stores `subtype: 'drawn'` with the picture; no AntV/our-own option appears.
- Edit window: a stored drawn post renders; Save keeps it byte-identical when nothing changed.
- `buildDrawingPostDataFromScene`: a drawn pie → elements with 5 closed filled wedges (polygon true after the fork's
  `restoreElements`), the icon images present in `files`.
- Mutation: route `kind` ignored (always flowchart) → the Pie Chart test fails.

## Allowed files
```
lib/ai/contracts.ts, lib/ai/validators.ts (+ tests)
lib/ai/mode-registry.ts / diagram subtype config ONLY if 'drawn' must be registered (never as a button)
components/ai/AIContentRenderer.tsx, components/ai/renderers/DrawnPictureRenderer.tsx (+ tests)
components/collabboard/editors/useDrawnOptions.ts (+ helpers, tests)       new
components/collabboard/editors/AIComponentEditor.tsx                       wiring, net <= +40
components/collabboard/editors/OutlineSuggestionsPanel.tsx                 Shuffle + placeholders, net <= +40
components/ai/editors/AIContentEditModal.tsx                               wiring, net <= +25
lib/ai/antv/toExcalidraw/drawingPost.ts, components/ai/renderers/EditAsDrawingButton.tsx (+ tests)
existing tests of these files (update, do not delete, unless they test AntV/our options IN THE GENERATOR, which no
longer exist there — list every such test you change and why)
```
Forbidden: everything else, the database, `lib/ai/drawn/**` (except reading), the route.
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
timeout 600 npx vitest run components/ai components/collabboard/editors lib/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-284.json
```
Do not commit.

**Live (CTO), board af02972f, own tab.** The board owner's AI credits for October ran out during the 283 battery
(renew 25 Oct), so the live UI check answers `/api/ai/generate-outline` and `/api/ai/draw-picture` from RECORDED real
responses of the 283 battery (Playwright `route.fulfill` in the CTO's own tab only); everything else — rendering,
saving to the board, reload, Edit window, Edit as drawing — is real. The live AI call itself was already proven in 283.
Generate with a pie request, the Pie Chart button, a flowchart text with Show
options; 3 drawn options each; Shuffle gives 3 different ones; Save → the post shows the drawn picture on the board and
after reload; the Edit window opens it; Edit as drawing gives an editable drawing with the donut filled after reopening;
existing AntV/our-own AI posts on the board still render unchanged. Test posts deleted.

## Commit message (verbatim)
```
feat(ai): the AI post draws its own pictures

Generate now asks the AI to draw three pictures of the chosen type
(flowchart, mind map, pie, bar, timeline, comparison, or its own choice)
and Shuffle draws three more. Pictures are saved as drawings the app can
check and repair, so text fits and charts match their numbers, and they
convert into an editable drawing without loss.
```

## Addendum 1 (CTO, 2026-10-05, live with recorded responses)
Live flow works end to end (outline → 3 pie draws with the board id; Shuffle → 3 new seeds; Flowchart button → 3
flowchart draws, no outline call; Save 201 with `subtype: drawn`; after reload the picture is on the board; Edit window
shows it; Edit as drawing → drawing post "Budget split" with 5 closed filled wedges; no write to the AI post).
**But every pie shows NO slices** in the generator preview, the option tiles, the board card and the Edit window (ring
outline, labels and leaders only). Cause: `DrawnPictureRenderer` does `parseDrawnPicture(data.picture)` →
`drawnToScene`. The parser (correctly) strips the fields the model may not set — `startAngle`/`endAngle` and the text
`lines`/`boxHeight` — so the wedges have no angles and texts lose their wrapping. The stored envelope carries the
outline, which is the source of truth for the data.
Fix: one helper `lib/ai/drawn/stored.ts` → `sceneFromStored(data: DrawnDiagramData): PictureScene` =
`parseDrawnPicture(data.picture)` → `repairPicture(picture, data.outline, data.kind)` → `drawnToScene`. Use it
everywhere a stored or received drawn picture is shown or converted: `DrawnPictureRenderer`, the option tiles, Edit as
drawing (`getScene`), and anything else that compiles a drawn picture for display. (This file is allowed now.)
Tests: a stored pie whose wedges have NO angles renders 5 wedge paths in the 5 item colours with angles proportional
to the outline values (24/40/26/10 → 86.4°/144°/93.6°/36° …); a card text with no `lines` is wrapped; the renderer's
output for a picture equals the output for the same picture after a JSON round-trip through the parser (idempotent).
Mutation: render with `parseDrawnPicture` only → the wedge test fails.
Gate `--outputFile=.opencode-vitest-284a.json`.

## Final result (CTO, 2026-10-05, live with recorded AI responses)
Board af02972f, own tab; `/api/ai/generate-outline` and `/api/ai/draw-picture` answered from recorded real 283
responses (the board owner's October credits are used up); everything else real.
- Pie Chart + Generate → 1 outline call, 3 pie drawings with the board id; preview and tiles show donuts with all 5
  slices (after Addendum 1). Shuffle → 3 new seeds. Flowchart button with an outline on screen → 3 flowchart drawings,
  no outline call.
- Save 201, stored `subtype: drawn` with the picture; after reload the drawn picture is on the board; the Edit window
  shows it (slices present); Edit as drawing → drawing post "Budget split", 17 elements, 5 closed filled wedges; no write
  to the AI post. Test posts 3aed1ac4, 1a92cc2a (and the first run's d5ae5e6d, be4f5d8a) deleted.
- Addendum 1 fixed MY spec error: section 2 said "parseDrawnPicture → drawnToScene", which strips the computed slice
  angles; stored pictures now always go parse → repair (from the stored outline) → compile (`lib/ai/drawn/stored.ts`).
- Deleted generator tests (9 files) covered AntV/our-own options in the generator, which no longer exist there. Two
  guarantees lost with them are re-added in PATCH-285: the PATCH-279 title rule for Edit as drawing, and "type buttons
  never call the old single-picture generator".
- Known UI flaw for 285: after clicking a type button with pictures on screen, "Show options" stays highlighted.
- Gate `.opencode-vitest-284a.json`: 59/59 identical to the baseline. tsc clean. Net growth: AIComponentEditor +34,
  OutlineSuggestionsPanel +34, AIContentEditModal +14.
