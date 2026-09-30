# PATCH-224 — Drawings say "Hide post frame" / "Show post frame"

Status: AUTHORIZED (owner, 2026-09-30: 'Change "draw frame" to "post frame"').
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-223 (`f816217b`)

## Design
- `components/collabboard/menus/NotePostContextMenu.tsx` ~154-155: for `padlet.type === 'drawing'` the
  labels become **"Show post frame"** / **"Hide post frame"**. Other types keep "Show frame" / "Hide frame".
  Nothing else changes (action id, "View full size" placement, props).
- `components/collabboard/freeformHideFrame.behavior.test.tsx`: update every "draw frame" string
  (labels, assertion text and test titles) to "post frame"; the ai-component test asserts it does NOT
  contain "Hide post frame".

## Allowed files
```
components/collabboard/menus/NotePostContextMenu.tsx   (the two label strings only)
components/collabboard/freeformHideFrame.behavior.test.tsx
```
Forbidden: everything else. `DrawingLayout.tsx:3529` mentions "Excalidraw frame" in a comment — unrelated,
leave it. If any other test pins "draw frame", STOP and ask.

Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/freeformHideFrame components/collabboard/freeformPostContextMenus
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-224.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** right-click the owner's ellipse → "Show post frame", then "View full size".

## Commit message (verbatim)
```
feat(canvas): drawings say "Hide post frame" / "Show post frame"
```
