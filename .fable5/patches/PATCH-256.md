# PATCH-256 — Short texts get designs again; a failed attempt is shown where the user looks

Status: AUTHORIZED (owner, 2026-10-03, two screenshots: Visualize shows "Reading your text…" with placeholder tiles,
then the window falls back to the empty "Your component will appear here": "no it is not fixed and then switches
back to").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-255 (`4b0bbb2f`).

## Why (CTO reproduction, 2026-10-03)
Visualize on the owner's note "My fancy padlet-slideshow.pdf / It is watson.ch": `generate-outline` → **422 "The AI
outline needs at least two usable points."** 1 s later the preview is back to the empty placeholder. The error IS
rendered, but only at the bottom of the LEFT column (`AIComponentEditor.tsx` ~1425), scrolled out of view.
Regression from PATCH-254: without thinking, `deepseek-flash` returns ONE item for a very short text (before 254 the
same note produced designs). Direct calls, thinking off, 2 runs each:

| text | today | with the extra rule below |
|---|---|---|
| "My fancy padlet-slideshow.pdf / It is watson.ch" | FAIL, FAIL | 2 items, 2 items (1.4 s / 1.0 s) |
| "Buy milk" | FAIL, FAIL | 2 items, 2 items |
| "Quarterly review meeting next Tuesday" | FAIL, FAIL | 2 items, 2 items |
| event costs (normal text) | 3 items | 3 items (unchanged) |

## Design
### A. One rule in the outline prompt
`lib/ai/outline.ts` `OUTLINE_SYSTEM_PROMPT`: directly after the line `- Give 2 to 8 items. Keep every label short.`
add exactly:
`- If the text is very short or has only one idea, still return at least 2 items: split it into its parts (for example the main subject, its source or link, and what it says).`
Nothing else in the prompt changes. (The route test that compares the system prompt to `OUTLINE_SYSTEM_PROMPT`
keeps passing because it imports the constant.)
### B. A failed outline attempt is shown in the preview
`AIComponentEditor.tsx`: when an outline request (the Show options path) ends in an error and no designs are shown,
the preview area shows the message instead of the "Your component will appear here" placeholder:
`data-ai-preview-error`, a calm card: the error text (or the plan-limit notice as today), plus a **Try again** button
(`data-ai-preview-retry`) that re-runs the same generate (1 credit, same as Generate). The existing error block in the
left column stays. Errors in other modes keep today's behaviour.

## Tests
- `lib/ai/outline.test.ts`: the prompt contains the new rule line, directly after the "Give 2 to 8 items" line.
- Editor test (`AIComponentEditor.patch256.test.tsx`, mocked fetch): an outline 422 → `data-ai-preview-error` with
  the message is inside the preview column and the empty placeholder is NOT shown; Try again → a second
  `generate-outline` fetch; a success afterwards shows designs and no error card.
- **Mutation** (revert with Edit): render the error card only in the left column → the editor test fails.

## Allowed files
```
lib/ai/outline.ts (+ outline.test.ts)
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch256.test.tsx)
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai app/api/ai/generate-outline components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-256.json
```
The CTO compares the gate. Compact report. Do not commit.

**Live (CTO):** Visualize on the owner's note → designs (no 422); a normal text still gives the same points.

## Commit message (verbatim)
```
fix(ai): very short texts get diagram designs again

After the speed-up the AI returned a single point for very short notes,
which is too little to draw, and the window fell back to empty. The AI
is now told to split a short text into its parts. If an attempt still
fails, the message and a Try again button appear in the preview.
```

## Addendum 1 (CTO, 2026-10-03): live result
Visualize on the owner's note "My fancy padlet-slideshow.pdf / It is watson.ch" (own tab, nothing saved):
`generate-outline` 200 after 1.5 s, 42 designs (before: 422 and the empty placeholder). The first run after the
change waited >6 s while the dev server recompiled the route. Gate `.opencode-vitest-256.json`: extra [] missing [];
tsc clean; the mutation (error card only in the left column) failed the editor test and was reverted.
