# PATCH-249 — Drawing a Mermaid picture no longer makes the board jump; "Show more" not cut off

Status: AUTHORIZED (owner, 2026-10-02: "after F5 this point still lets the canvas jolt" with a screenshot of the
Show options design list around "Show more (100)"; and "the text is being cut off … when you scroll down").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-248 (`1c6ea801`)

## Why (CTO live measurement, 2026-10-02)
Visualize on the owner's note "It is watson.ch", scroll the design list: the browser's Layout Instability API records
board image posts (`group/image-container`) shifting **dx −8 px and back +8 px** — the board "jolts". The page's
scroll height goes 1000 → **1150** for a few frames, so `body` (`overflow-y: auto`) briefly shows a scrollbar
(8 px). Cause: each Mermaid thumbnail (Flow, Mermaid mind map) calls `mermaid.render(id, code)`
(`lib/ai/diagram-engine.ts:76`) WITHOUT a container, so Mermaid appends its temporary 150 px element
(`#dai-diagram-N`) to `<body>`, below the viewport. The same happens for every Mermaid picture drawn on the board.
Second defect: the design list's last line ("Show more (N)") ends flush with the list's scroll edge and is clipped by
the dashed preview frame (`OutlineSuggestionsPanel.tsx` ~447).

## Design
1. `lib/ai/diagram-engine.ts`: one lazily-created offscreen host element (module-level; created on first render in
   the browser, reused, never removed while the page lives), e.g. `data-ai-mermaid-host`, styled `position: fixed;
   left: -10000px; top: 0; width: 1200px; height: 0; overflow: hidden; visibility: hidden; pointer-events: none;
   contain: layout size;`, appended to `document.body`. Pass it as Mermaid 11's third argument:
   `mermaid.render(id, code, host)`. A fixed, offscreen element never adds to the page's scroll size. Do not use
   `display: none` (Mermaid measures text with getBBox). Keep everything else (ids, strict security level,
   `htmlLabels: false`, the hold hook) unchanged; the PATCH-232 source pins must still pass.
2. `components/collabboard/editors/OutlineSuggestionsPanel.tsx`: give the scrolling design list bottom padding
   (`pb-4` or equivalent) so its last element ("Show more", the Colours row) is fully visible at the end of the scroll.

## Tests
- `lib/ai/diagram-engine` test (jsdom, mocked mermaid): `render` is called with a third argument that is a single
  shared host element with `position: fixed` and visibility hidden, attached to `document.body`; two renders reuse the
  same host; `document.body`'s direct children grow by at most that one host across many renders.
- Panel: the scrolling list has the bottom padding class.
- **Mutation:** call `mermaid.render(id, code)` without the host → the host test fails.

## Allowed files
```
lib/ai/diagram-engine.ts (+ a new lib/ai/diagramEngineHost.test.ts)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its tests)   (bottom padding only)
```
Forbidden: everything else (`CodeDiagramRenderer.tsx`, the DOMPurify profile, the database, `package.json`, AI
routes). Real tool calls only (never write a tool call as plain text); one test file at a time with `--reporter=dot`,
never pipe vitest into grep/head, no test files outside the repo; revert mutations with your Edit tool; no git writes;
no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-249.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Visualize on the owner's note, scroll the design list incl. Show more: zero layout shifts outside the
window, the page height stays 1000, no `#dai-diagram-*` under `<body>` directly; "Show more" fully visible; Mermaid
pictures (Flow, Mermaid mind map) still draw in thumbnails, the preview and on the board.

## Commit message (verbatim)
```
fix(ai): stop the board jumping while diagrams are drawn

Every Mermaid diagram (flowcharts, older mind maps) was drawn in a
temporary box at the bottom of the page, which made the page taller for
a moment and flashed a scrollbar, so the whole board jumped sideways
while scrolling the AI designs. Diagrams are now drawn in a hidden box
outside the page. The last line of the design list is no longer cut off.
```

## Addendum 1 (CTO, 2026-10-02): live result
Visualize on the owner's note (one `generate-outline`, nothing saved), scrolling the design list incl. Show more:
layout shifts OUTSIDE the window 0 (before: board image posts dx −8/+8); frames with the page taller than the window
0 (before: 1150/1000); no `#dai-diagram-*` directly under `<body>`, one hidden `data-ai-mermaid-host` instead; the
Flow thumbnail still draws with its labels. Gate `.opencode-vitest-249.json`: extra [] missing []; tsc clean; no
mutation text.
