# PATCH-255 — The AI window no longer stays wide with an empty right column

Status: AUTHORIZED (owner, 2026-10-03, screenshot of the AI window at full width with an empty right column and an
empty preview: "it is empty no preview").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-254 (`04e15420`).

## Why (CTO reproduction, 2026-10-03)
Diagram → Show options → Generate (designs + docked panel, window 1320 px) → click another mode (Lesson Board) →
the side panel unmounts but the window stays wide: `data-ai-side-panel-host` present with 0 children, `w-[1320px]`.
Back to Diagram: still wide and empty. Cause: `AIComponentEditor.tsx` keeps `sidePanelOpen` true because
`OutlineSuggestionsPanel` is unmounted (its render condition becomes false) without ever calling
`onSidePanelChange(false)`.

## Design
- `AIComponentEditor.tsx`: the window is wide and the host column exists ONLY while the suggestions panel is actually
  mounted AND reports open: compute `const suggestionsMounted = <the exact condition under which
  OutlineSuggestionsPanel is rendered, including the PATCH-254 loading case>` and use
  `const sidePanelVisible = sidePanelOpen && suggestionsMounted` for the width class and the host column.
- `OutlineSuggestionsPanel.tsx`: on unmount, call `onSidePanelChange?.(false)` (effect cleanup), so the state is also
  correct for the next mount.
- Nothing else changes (the panel still opens on Designs when designs arrive; closing/opening as in PATCH-252).

## Tests
- `AIComponentEditor.patch255.test.tsx` (mocked fetch): generate designs → wide + host with the panel; switch to
  another mode → NOT wide (`w-[980px]`) and no `data-ai-side-panel-host`; back to Diagram → still not wide while no
  designs show; generate again → wide again with the panel.
- Panel unit test: unmounting an open panel calls `onSidePanelChange(false)`.
- **Mutation** (revert with Edit): use `sidePanelOpen` alone for the width → the editor test fails.

## Allowed files
```
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch255.test.tsx)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ a test)
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-255.json
```
The CTO compares the gate. Compact report. Do not commit.

## Commit message (verbatim)
```
fix(ai): the AI window no longer stays wide with an empty side column

Switching to another mode after designs were shown left the window at
full width with an empty column on the right. The window now only
widens while the design panel is really shown.
```

## Addendum 1 (CTO, 2026-10-03): live result
Same reproduction, own tab: designs → wide + panel; Lesson Board → narrow, no host; back to Diagram → narrow; Generate
again → wide + Designs panel; reopen → narrow. Gate `.opencode-vitest-255.json`: extra [] missing []; tsc clean.
Implementer note accepted: with the panel's unmount report in place, the width-only mutation is masked after effects
flush (two independent guards), so the editor test proves the pair, not each alone.
