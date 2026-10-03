# PATCH-271 — Hovering a design never disturbs the picture you are editing

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F8 (MEDIUM), reproduced live by Codex).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-270 (f4c78972). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F8 and the "Zoom/view
reset inventory" (hover row).

## Why
- **F8, live (Codex step 6):** Bar chart zoomed to 73% → hover the "column" design tile (preview shows it at 104%) →
  move away → the selected bar is back at **66%**, the user's view lost.
- Cause, `components/collabboard/editors/OutlineSuggestionsPanel.tsx` ~L236-238 and ~L660-686:
  `previewOption = hoverOption ?? effectiveSelected`, `resetKey={previewKey + theme}` on the ONE `PictureStage`, and its
  children switch from the editable renderer (`InfographicRenderer` / `MindmapTreeRenderer` with `edit`) to a
  read-only `AIContentRenderer` for the hovered design. Hover enter/leave therefore (a) resets the stage to Fit,
  (b) UNMOUNTS the editable renderer — losing the element editor's state, selection and (since PATCH-270) its whole
  undo history, and (c) uses `previewMode` derived from the selected design, so hovering an AntV design over a native
  one (or vice versa) runs the wrong stage backend.

## Design (`OutlineSuggestionsPanel.tsx`; new small component file if it keeps the panel < 800 lines)
- Two layers inside the preview box:
  1. **The selected stage** — exactly today's selected path (editable renderer, its `PictureStage`, `resetKey` from
     the SELECTED key + theme only, `mode` from the selected design). It is ALWAYS mounted while a design is selected.
     While a tile is hovered it is hidden with `visibility: hidden` (NOT `display: none`, NOT unmounted, so its size is
     unchanged, nothing re-fits, and its editor/history survive) and `aria-hidden`.
  2. **The hover stage** — rendered only while a tile is hovered: an absolutely positioned layer (`inset-0`) on top with
     its OWN read-only `PictureStage` (`mode` from the HOVERED design, `resetKey` = hovered key + theme) wrapped in
     `DiagramKickerReadOnly`, `data-ai-preview-hover-layer`. It takes no pointer events beyond what the read-only
     preview needs and never receives `edit`.
- Badges / info that depend on the shown design (example/estimated numbers, zero note, chart note) keep following the
  hovered design while hovering, as today.
- Keep `data-ai-preview-hover` on the preview root as today (live checks use it).

## Tests (`OutlineSuggestionsPanel` tests; through the real panel)
- Hover a tile then leave: the editable renderer is the SAME mounted instance (no unmount — e.g. a mount counter /
  ref identity in a mocked renderer), the selected `PictureStage` received no reset (its `resetKey` prop unchanged
  through hover), and the hover layer is gone.
- While hovering: the selected layer has `visibility: hidden` and is still in the DOM; the hover layer renders the
  hovered envelope read-only with `mode` from the hovered key (AntV hovered over a native selected design → `antv`,
  and the reverse → the native mode).
- Element-editor history survives a hover: commit an override, hover + leave, Undo → the override is undone.
- Mutation (revert with Edit): unmount the selected layer while hovering → the "same instance" test fails.

## Allowed files
```
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests)
components/collabboard/editors/<new small component>.tsx (+ test)   if extracting the two-layer preview
```
Forbidden: everything else (PictureStage, the renderers, the generator). Real tool calls only (never write a tool call
as plain text); one test file at a time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results
with diff/process substitution, no test files outside the repo; revert mutations with your Edit tool; no git writes;
no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors components/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-271.json
```
The CTO compares failing files AND failing test names. Short report listing every file changed. Do not commit.

**Live (CTO, write-locked, nothing saved):** Codex step 6 (bar zoomed → hover column tile → leave: zoom and viewBox
unchanged); AntV list zoomed + a moved element → hover several tiles (AntV and native) → leave → zoom unchanged, Ctrl+Z
still undoes the move; hovered previews render correctly (AntV hovered over native and the reverse).

## Commit message (verbatim)
```
fix(ai): hovering a design no longer resets the picture you are editing

Moving the mouse over a design tile used to swap out the picture you
were working on, which reset its zoom and forgot its undo history. The
hovered design now shows on top while your picture stays exactly as it
was underneath.
```

## Final result (CTO, 2026-10-03, live, write-locked tab, 1 generation, nothing saved)
Codex step 6: bar zoomed to 80% → hover chart-column-simple (hover layer at its own 112%, the selected layer
`visibility: hidden`) → leave: selected still 80%, viewBox identical. AntV list zoomed to 92% with item 1 moved → hover
the native mindmap, infographic:hub and an AntV hierarchy design → leave: 92%, viewBox identical, the move still
there; Ctrl+Z undoes the move (the undo history survived the hovers). Native mind map selected → hover an AntV
design: rendered in its own AntV-mode layer. No console errors; only the two expected blocked writes. Gate
`.opencode-vitest-271.json`: failing test names identical to PATCH-270 (59/59); tsc clean. Note: OutlineSuggestionsPanel.tsx
is at 798 lines — the next change there must extract first.
