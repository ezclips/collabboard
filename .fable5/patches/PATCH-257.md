# PATCH-257 — Pie Chart / Bar Chart always show designs at once (example numbers until real ones exist)

Status: AUTHORIZED (owner, 2026-10-03: "why is there no preview for Pie and Bar chart?"; earlier, 2026-10-02: "I
want the same as napkin.ai … on the right side a selection of pie designs … as you go over the design the preview
window will display the actual design").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-256 (`6a4754ce`).

## Why (CTO reproduction, 2026-10-03)
Visualize on the owner's note (no numbers, 2 points) → Pie Chart: the preview is an EMPTY dashed box, the Designs
panel shows the no-numbers note and an empty "SUGGESTED" heading, zero tiles (no chart design is allowed without
values; word clouds need ≥3 points). Bar Chart: the same, and the note still says "split into slices". Worse:
**Save to Canvas is enabled** while nothing is shown — `canSave` follows `selectedOption`, which falls back to
`outlineOptions[0]` (a non-chart design), so Save would store a picture the user never saw.

## Design
### A. Example numbers (local, no AI call, no credit)
- New pure helper in `lib/ai/outline.ts`: `withExampleValues(outline): VisualOutline` — returns a NEW outline where
  every item WITHOUT a `value` gets an equal share (`round(100 / items.length)`, last item takes the rest so the sum is
  100) and the outline gets `valuesExample: true` (new optional field, doc: "set locally when the chart family shows
  example numbers; never sent by the server or read from the model"; `parseOutline` drops it like
  `valuesEstimated`). Items that already have a value keep it.
- `AIComponentEditor.tsx`: when the active family is `chart` and the active outline has fewer than 2 items with a
  `value`, the chart designs are derived from `withExampleValues(activeOutline)` (the same `suggestDesigns`, themed and
  styled the same way), so the Pie / Bar designs appear immediately, pies first for Pie Chart, bars/columns first for
  Bar Chart (today's `chartOrder`). The real outline is untouched; leaving the chart family shows the normal designs.
### B. What the window says
- Toolbar badge (where "≈ Estimated" lives): "Example numbers" (`data-ai-values-example`, hint "These numbers are
  examples. Press Make pie chart to let the AI estimate them, or type your own under Edit text.") while the preview
  shows a chart drawn from example numbers.
- The note at the top of the Designs panel stays, worded per chart:
  - Pie: "Your text has no numbers to split into slices. These designs use example numbers. Add your own (e.g.
    "Venue 40%, Food 30%") under Edit text, or let the AI estimate them:" + **Make pie chart**;
  - Bar: "Your text has no numbers to draw bars from. These designs use example numbers. Add your own under Edit text,
    or let the AI estimate them:" + **Make bar chart**.
- No empty "SUGGESTED" heading: a heading only renders when it has tiles.
### C. Saving
- **Save to Canvas is disabled** while (a) the preview shows nothing, or (b) the shown design is a chart drawn from
  example numbers. Its `title` then says why ("Nothing to save yet" / "Make the chart or type your numbers first").
  `canSave` must follow the design actually shown in the preview, never a fallback the user cannot see.
- Typing a number for any item under Edit text turns those numbers into the user's own: the edited outline keeps the
  typed values; items still without a value get example shares; once EVERY item has a typed value (or the AI
  estimated them via Make chart) `valuesExample` is gone and Save is enabled.
- "Make pie/bar chart" (PATCH-250) still replaces the example numbers with AI estimates ("≈ Estimated").

## Tests
- `lib/ai/outline.test.ts`: `withExampleValues` — equal shares summing to 100, keeps existing values, sets the flag,
  never mutates; `parseOutline` drops a model-supplied `valuesExample`.
- `AIComponentEditor.patch257.test.tsx` (mocked fetch; outline with 2 items, no values):
  - Pie Chart → chart-pie tiles first, preview shows a pie, `data-ai-values-example` badge, NO new fetch;
  - Save to Canvas disabled; Bar Chart → bar/column tiles first and the bar wording;
  - Edit text: type values for every item → badge gone, Save enabled, `onSave` payload carries the typed values;
  - Show options → normal designs again (no example values in their envelopes);
  - no empty "SUGGESTED" heading in any state.
- Regression: with designs hidden by a family that has none (e.g. Comparison on a 2-point text, if empty) Save is
  disabled and the preview is not blank-with-Save.
- **Mutations** (revert with Edit): (1) compute `canSave` from `outlineOptions[0]` again → a test fails; (2) skip the
  example values → the "pie tiles appear" test fails.

## Allowed files
```
lib/ai/outline.ts (+ outline.test.ts)
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch257.test.tsx)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its tests)   (note wording, badge, empty headings)
existing tests that assert the old note wording (update the text only; list them)
```
Forbidden: everything else (catalog, mapOutline, renderers, routes, the database, `package.json`). Real tool calls
only (never write a tool call as plain text); one test file at a time with `--reporter=dot`, never pipe vitest into
grep/head, NEVER compare results with diff/process substitution, no test files outside the repo; revert mutations
with your Edit tool; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-257.json
```
The CTO compares the gate. Compact report. Do not commit.

**Live (CTO):** Visualize on the owner's note → Pie Chart: pie designs and a pie in the preview at once, "Example
numbers" badge, Save disabled; hover previews; Bar Chart: bars first, bar wording; type numbers under Edit text →
Save enabled; Make pie chart → "≈ Estimated"; nothing saved.

## Commit message (verbatim)
```
fix(ai): Pie and Bar Chart always show designs straight away

A text without numbers left the Pie and Bar Chart views empty, while
Save to Canvas was still active. The chart designs now appear at once
with example numbers, clearly marked, and Save waits until the numbers
are real: typed in Edit text or estimated by the AI.
```

## Addendum 1 (CTO, 2026-10-03): one live defect fixed, live result
Live #1: Pie Chart → Bar Chart listed bars first but kept the pie selected in the preview → `openFamily` now always
clears the selection so the button's first design is chosen; test + mutation added.
Final live on the owner's note (own tab, nothing saved): Pie Chart → 6 pie designs first, a 50/50 pie in the preview,
"Example numbers" badge, Save disabled ("Make the chart or type your numbers first"), hover previews; Bar Chart →
bar design selected and previewed, bar wording; typing 70/30 under Edit text → badge gone, chart redrawn, Save
enabled. 1 generate-outline call, 0 padlet writes, 0 console errors. Gate `.opencode-vitest-257.json`: extra []
missing []; tsc clean.
