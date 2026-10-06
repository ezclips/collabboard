# PATCH-300 — Board AI and Board wiki buttons on Freeform boards only

Status: AUTHORIZED (owner, 2026-10-06: "we dont need the Board AI and Board Wiki button in any other canvas execpt
freefrom canvas remove all other canvases thes two buttons").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO, source)
1. Both floating buttons are rendered in `app/dashboard/canvas/[id]/CanvasClient.tsx`:
   - wiki: `data-board-wiki-open="true"` (~L11549), condition
     `!isBlockingEditorModalOpen && !isBoardWikiOpen && !isBoardAiChatOpen && !isKnowledgeReaderOpen`;
   - Board AI: `data-board-ai-chat-open="true"` (~L11575), condition
     `enableBoardAiChat && !isBlockingEditorModalOpen && !isBoardAiChatOpen && !isKnowledgeReaderOpen && !isBoardWikiOpen`.
   They show on every layout (Wall, Columns, Kanban, Gantt, Scheduler, Grid, Drawing, Timeline, Map, Freeform).
2. `isFreeformLayout` (L1531) is `canvas?.layout === 'freeform'` OR "no other layout matched" — so it is also true
   while `canvas` is still `null` (loading). Using it alone would flash the buttons on other boards during load.
3. On the Drawing canvas the two buttons cover Excalidraw's library trigger and the library sidebar's top-right
   controls (PATCH-299 final result). PATCH-297 moved the Timeline "Layout" button to `right-16` only to clear them.
4. `scripts/live/kit.mjs` `openBoard` (L195) waits for `[data-board-wiki-open="true"]` as its "board loaded" marker —
   it would hang on every non-freeform board after this change.

## Design
1. **Buttons.** One new boolean next to the existing layout flags (one line):
   `const showBoardAssistantButtons = !!canvas && isFreeformLayout;` and prefix BOTH button conditions with
   `showBoardAssistantButtons &&` (existing lines). Nothing else changes: the drawers (`BoardAiChatDrawer`,
   `BoardWikiDrawer`) stay mounted on every layout, so other entry points that open them (the PDF reader's AI dock,
   "Save to wiki", citations) keep working.
2. **Load marker for the kit.** Add `data-canvas-layout={canvas?.layout ?? ''}` to an element that is rendered on
   every layout once the board has loaded, for editors and viewers alike, ON AN EXISTING LINE (net 0); name the
   element in the report. `kit.mjs` `openBoard` waits for `[data-canvas-layout]:not([data-canvas-layout=""])`
   instead of the wiki button; keep the rest of `openBoard` as is.
3. **Timeline header back in the corner.** `components/canvas/TimelineHeaderBar.tsx`: `right-16` → `right-2` (the
   column it avoided is gone on Timeline boards). Update its PATCH-297 test and comment accordingly.
4. `CanvasClient.tsx` net growth ≤ +1.

## Tests
- A source/structure test (at `components/collabboard/*.test.tsx` level) that both button conditions include
  `showBoardAssistantButtons` and that it is defined as `!!canvas && isFreeformLayout`.
- `boardAiChatWiring.test.tsx` and any other existing test that pins the buttons' conditions: keep green, adjusting
  only the expectations this change makes wrong; list every edited assertion in the report.
- `TimelineHeaderBar` test: root has `right-2`, not `right-16`.
- Kit test: `openBoard` waits for the `data-canvas-layout` marker (fake page).
- Mutation: drop `showBoardAssistantButtons &&` from the Board AI condition → a test fails; revert with the Edit tool.

## Allowed files
```
app/dashboard/canvas/[id]/CanvasClient.tsx           one new line + condition prefixes + one attribute on an existing line
components/canvas/TimelineHeaderBar.tsx (+ test)
scripts/live/kit.mjs (+ kit.test.ts)
components/collabboard/boardAiChatWiring.test.tsx and other existing tests pinning these buttons (expectations only)
one new test file under components/collabboard/
```
Forbidden: everything else, the database.
- Make real tool calls only. Do not use shell listing commands (ls/find/dir) — use your read/glob/grep tools.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser. Do not read `.env` files.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-300.json
```
Do not commit.

**Live (CTO):** Freeform board af02972f shows both buttons; Drawing canvas 0c65aa8e and one new board of each other
layout show neither (also not during load); on the Drawing canvas the library trigger is clickable; the Timeline
"Layout" button sits top-right; the PDF reader's AI still opens on a non-freeform board if one is at hand; test
boards deleted.

## Commit message (verbatim)
```
feat(board): Board AI and wiki buttons on freeform boards only

The Board AI and Board wiki buttons now appear only on freeform
boards. Other board types no longer have them covering their own
controls, and the timeline's layout button moves back to the corner.
```

## Final result (CTO, 2026-10-06, live)
Gate `.opencode-vitest-300.json`: 26 failing files, identical by name to 299b; tsc clean. Live (kit, own tab, DOM
sampled every 250 ms for 20 s from the first byte, so the load phase is included): Freeform af02972f shows both
buttons once loaded; Drawing 0c65aa8e and new Wall, Columns, Scheduler, Grid, Timeline and Map boards show neither in
any sample (0/~75 each); `data-canvas-layout` carries the right layout on each. On the Drawing canvas Excalidraw's own
library trigger is now clickable and opens the library. The Timeline "Layout" button sits 8 px from the right and top.
All six test boards deleted (200). Kanban and Gantt render their own shells and never had the buttons.
Not verified live: the PDF reader's AI dock on a non-freeform board (no such board with a PDF at hand); the drawers
are still mounted on every layout, unchanged by this patch.
