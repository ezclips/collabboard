# PATCH-267 — Pie and Bar charts draw their example numbers again

Status: AUTHORIZED (owner, 2026-10-03, screenshot of a Pie Chart preview with no slices: "There are no pie
showing!" … "they are after F5 still missing").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-262 (c6a618b0).

## Why (CTO live reproduction, Chrome, 2026-10-03)
Generator → Diagram → Show options, text without numbers ("My fancy padlet-slideshow.pdf: the slideshow file itself,
and watson.ch, the website associated with the file.") → **Pie Chart**. The "Example numbers" badge is shown
(`[data-ai-values-example]` present), the tiles are `antv:chart-pie-*`, but the AntV renderer of the main preview
receives `items: ["My fancy padlet-slideshow.pdf=undefined", "watson.ch=undefined"]` — no values — so AntV draws the
labels and leader lines and **no slices**; the tiles likewise.

Root cause — a PATCH-260 regression (`2db4e203`), `components/collabboard/editors/AIComponentEditor.tsx` ~L613-617:
```ts
const optionEnvelope = (option) => {
  const baseData =
    option.envelopeData.subtype === 'infographic' && activeOutline
      ? { ...option.envelopeData, outline: activeOutline }   // <- drops the example values
      : option.envelopeData;
```
PATCH-257 builds example designs from `derivedOutline = withExampleValues(activeOutline)` (`themedOptions` uses
`derivedOptions` when `needsExampleEnvelopes`), but PATCH-260 then overwrites every AntV envelope's outline with the
raw `activeOutline` (to keep element overrides current). Both the main preview and the tiles (`envelopeFor={(option) =>
optionEnvelope(option)}`) go through it.

## Design
- In `optionEnvelope`, the outline that replaces the envelope's outline is
  `needsExampleEnvelopes && derivedOutline ? derivedOutline : activeOutline`. `derivedOutline` is derived from
  `activeOutline` on every render, so it carries the same current `elementOverrides` / `additions` — the PATCH-260
  intent is kept.
- Nothing else changes: Save stays disabled while example numbers are shown (PATCH-257), real values from the text or
  "Make pie chart" still win (`withExampleValues` keeps existing values).
- Check every other place that builds an envelope or passes an outline to a renderer in this file (the main preview,
  the hover preview, the tiles, `selectedOptionEnvelope`, `persistedContent`, the Edit-text side panel) and list them
  in the report with which outline each one uses after the fix.

## Tests (`components/collabboard/editors/AIComponentEditor.*.test.tsx` — extend the PATCH-257 test file)
Encode the real path, not a helper: render the generator with an outline of two items without values, open the Pie
Chart family →
- the envelope rendered in the main preview has `data.outline.items[*].value` = 50 / 50 and `valuesExample: true`;
- every tile envelope (`envelopeFor`) of the pie family has values;
- the same for Bar Chart;
- with an element override present on `activeOutline` (simulate one PATCH-260 commit), the pie preview envelope
  carries BOTH the example values and that override;
- a non-chart family (e.g. Show options → a list design) still gets `activeOutline` unchanged (no example values).
- Mutation (revert with Edit): restore `outline: activeOutline` → the pie tests fail.

## Allowed files
```
components/collabboard/editors/AIComponentEditor.tsx            the one condition (file is >800 lines: change only this)
components/collabboard/editors/AIComponentEditor.patch257.test.tsx (or a new AIComponentEditor.patch267.test.tsx)
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/editors components/ai lib/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-267.json
```
The CTO compares the gate. Short report. Do not commit.

**Live (CTO):** the owner's text → Pie Chart: slices in the preview and in every pie tile; Bar Chart: bars; "Make pie
chart" (AI estimate) still replaces the example numbers; a list design unchanged; Save disabled while example numbers
show; nothing saved.

## Commit message (verbatim)
```
fix(ai): Pie and Bar Chart show their slices and bars again

A picture with no numbers in its text showed "Example numbers" but drew
an empty pie. The example numbers now reach the preview and every
design tile again.
```

## Final result (CTO, 2026-10-03, live)
Own tab, write-locked, nothing saved. The owner's kind of text (no numbers) → Pie Chart: the preview's AntV renderer
now receives `valuesExample: true` and 50 / 50, draws the two slices with "50.0%" labels, and every pie tile shows its
pie or donut (screenshot); Save stays disabled. Bar Chart: two bars of 50 with axis, tiles show bars/columns/pies.
"Make pie chart" (AI estimate): the Example badge goes, the Estimated badge shows, Save is enabled. Gate
`.opencode-vitest-267.json`: extra [] missing []; tsc clean.
Lesson: PATCH-260's live pass covered move/resize/colour on a list but not the chart family; a change to
`optionEnvelope` affects every design family — the chart path must be in the live pass of any patch that touches it.
