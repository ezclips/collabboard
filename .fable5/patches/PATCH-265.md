# PATCH-265 — Keep the user's zoom when the preview changes size; Escape deselects before it closes the panel

Status: AUTHORIZED (owner, 2026-10-03: "continue with the implementation from the patches"; owner earlier: "Zoom is
all over the place! You click on the text and the zoom jumps back"). CTO bug fix found in the PATCH-263 live pass.
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-264.

## Why (CTO live finding, Chrome, 2026-10-03)
Mind map in the generator, zoomed in to 54%, designs side panel open. Pressing Escape: zoom 54% → 37% and the viewBox
changes from `174,-384,982,911` to `-54,-585,1438,1333` (a full re-fit). Chain:
1. `OutlineSuggestionsPanel.tsx:462-469` closes the docked panel on ANY Escape keydown on `document` — also when the
   user meant "deselect the picture element" or "leave the colour popover".
2. Closing the panel widens the preview; `PictureStage.tsx:267-279` (window `resize` and the `ResizeObserver`) then
   calls `fit()` unconditionally, throwing away the user's zoom and position — although the stage already knows
   whether the view is at Fit (`atFitRef`).
The same re-fit hits every other preview resize: opening/closing any side panel (Designs, Edit, Similar, Colours,
Customize), resizing the window, the modal switching width 980 ↔ 1320.

## Design
### A. `components/ai/renderers/PictureStage.tsx` — resize keeps a user-chosen view
- On a stage resize: if `atFitRef.current` is true (the user has not zoomed or panned since the last Fit) → `fit()` as
  today. Otherwise keep the user's view: same on-screen scale and the same content point at the stage centre.
  - antv mode: `scale = oldStageW / oldBox.width` (content-to-screen); new box = `{ width: newStageW / scale, height:
    newStageH / scale }` centred on the old box centre; `applyBox`.
  - CSS mode (our own renderers): keep `zoom`; adjust `pan` so the content point that was at the old stage centre is
    at the new stage centre.
- Make sure every user zoom/pan path (wheel/Ctrl+wheel, +/−, drag-pan, Space+drag, zoom-at-point) sets
  `atFitRef.current = false`, and Fit sets it true (check what exists; add only what is missing).
- The zoom % shown stays the user's value after a resize (no jump in the display either).
### B. Escape priority
- `components/ai/renderers/AntvElementEditor.tsx`: when its Escape handling consumes the key (closes the colour
  popover, or deselects), it calls `event.preventDefault()`; register that keydown listener in the capture phase on
  `window` so it runs before document listeners.
- `components/collabboard/editors/OutlineSuggestionsPanel.tsx`: the panel's Escape handler ignores an event that is
  `defaultPrevented`, and ignores Escape while focus is in an input/textarea/contenteditable (e.g. AntV's inline text
  editor, the hex field) — those use Escape themselves.
- Result: first Escape closes the popover, next deselects, only then does Escape close the panel.

## Tests
- `PictureStage.test.tsx`: (antv mode) zoom in (+), then the stage resizes (mock ResizeObserver callback / sizes) →
  the box keeps the content-to-screen scale and the centre point, the zoom display is unchanged; after Fit, a resize
  re-fits as today. (CSS mode) the same for zoom/pan. Mutation (revert with Edit): always `fit()` on resize → the
  zoom-kept test fails.
- `AntvElementEditor.test.tsx`: Escape with a selection → `defaultPrevented === true` and a document keydown listener
  sees it prevented; with the popover open → popover closes, selection stays; with nothing selected → not prevented.
- `OutlineSuggestionsPanel` test: a prevented Escape keeps the panel open; Escape from an input keeps it open; a
  plain Escape closes it.

## Allowed files
```
components/ai/renderers/PictureStage.tsx (+ test)
components/ai/renderers/AntvElementEditor.tsx (+ test)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its test)
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/ai/renderers components/collabboard/editors lib/ai/antv --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-265.json
```
The CTO compares the gate. Short report listing every file changed. Do not commit.

**Live (CTO):** mind map and list: zoom to ~55%, pan a bit, open and close the Designs / Edit / Colours panels, press
Escape with a selection (deselects, panel stays), Escape again (panel closes) — the zoom % and the visible region
stay; Fit then resize the window → re-fits.

## Commit message (verbatim)
```
fix(ai): opening or closing a side panel keeps your zoom

The picture used to jump back to "Fit" whenever the preview changed
size, for example when a side panel opened or closed or Escape closed
it. Your zoom and position now stay, and Escape first deselects the
picture before it closes the panel.
```

## Final result (CTO, 2026-10-03, live round 1)
Own tab, generator, AntV mind map and list-grid-badge: zoom in (49% / 101%), select a node, Escape → deselected,
panel stays, zoom/centre unchanged; Escape again → panel closes, zoom/centre unchanged; opening and closing the
Designs, Edit and Colours panels keeps zoom and centre; zoomed in, a real stage resize (window 1460 → 1000, stage
492 → 472 px) keeps the zoom % and the centre point; after Fit, the same resize re-fits (37 → 36%, 76 → 73%) and back.
No console errors. Gate `.opencode-vitest-265.json`: extra [] missing [] (path-format duplicate only); tsc clean.
