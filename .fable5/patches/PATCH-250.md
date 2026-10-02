# PATCH-250 — "Make pie/bar chart" estimates the numbers and opens the chart designs; hover previews a design

Status: AUTHORIZED (owner, 2026-10-02: "I want the same as napkin.ai … Your text has no numbers … a selection of pie
designs … as you go over the design the preview window will display the actual design with the info"; then "You are
the PM I follow you").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-249 (`31793bf3`). Keep today's window layout (PATCH-246 stays reverted): preview on top, design
list underneath.

## Why (CTO live check, 2026-10-02)
Text without numbers ("venue is the biggest cost, then food, and some miscellaneous items"), Show options, Pie Chart:
only the 2 word clouds show plus the note. "Make pie chart" (`AIComponentEditor.tsx` `makeChart`, ~682) runs the OLD
single-picture chart generator, so the 6 AntV pie designs never appear. Asking the AI via Customize ("pie chart with
estimated percentages") still returns no values, because `OUTLINE_SYSTEM_PROMPT` says "Never invent a value".
Hovering a design tile changes nothing; only a click shows it.

## Design
### A. The outline call can be asked to estimate values (server)
- `app/api/ai/generate-outline/route.ts`: `OutlineOptions` gains `estimateValues?: boolean`. Parse strictly like
  `keepWording` (non-boolean → 400 "options.estimateValues must be a boolean."); only `true` is kept.
- `buildPreferenceBlock`: when `estimateValues`, add this FIXED line (no user text in it):
  `The user asked for a chart. Give EVERY item a "value": your best estimate of its share in percent, based on the text, all values together about 100. This replaces the rule "Never invent a value" for this request.`
- After `parseOutline`, when `estimateValues` was requested AND at least 2 items have a `value`, the route returns
  the outline with `valuesEstimated: true`. The model can NEVER set this flag itself (see B).
- A plain request (no options) keeps a byte-identical system prompt (existing tests must still pass).

### B. Outline type
- `lib/ai/outline.ts`: `VisualOutline` gains `valuesEstimated?: boolean` (doc comment: "set by the server when the
  AI estimated the values; never read from the model"). `parseOutline` IGNORES any `valuesEstimated` in the model's
  JSON (do not add it to `OutlineSchema`'s output). Add a small exported pure helper
  `withValuesEstimated(outline): VisualOutline` returning a NEW object with the flag (no mutation), used by the route.
- The flag is for the open window only. Saved posts re-read the outline through `parseOutline`
  (`lib/ai/validators.ts:213`), which drops it; that is intended. Do NOT touch `validators.ts`.

### C. "Make pie chart / Make bar chart" uses the designs (client)
- `AIComponentEditor.tsx` `makeChart(chartSubtype)`: no longer resets the family or switches to the old generator.
  It keeps Show options and the chart family, keeps `chartMakeSubtype` (so pies, or bars, come first), and calls the
  outline path: `generate({ estimateValues: true })` (1 credit, same as Generate). `generate`'s
  `outlineOptionsBody` type gains `estimateValues?: boolean`. The family filter must still be `chart` after the
  result arrives, so the list opens on the pie (or bar) designs with the first pie (bar) selected in the preview.
- The old single-picture chart generator stays in the code (Regen of stored chart posts uses it); only this button
  stops calling it.

### D. "Estimated" note and editable numbers
- `OutlineSuggestionsPanel.tsx`: when `outline?.valuesEstimated`, show one line directly above the design list
  (below the preview), `data-ai-values-estimated`: "The AI estimated these numbers. Check them under Edit text."
  Nothing is added to the picture itself.
- `OutlineTextEditor.tsx`: when ANY item has a `value`, every item row gets a small number input
  (`data-ai-outline-item-value={index}`, `type="number"`, `min=0`, `step="any"`, width ~5rem, label "Value").
  Empty → `value` removed; a valid number ≥ 0 → set; anything else ignored. Immutable updates like the other fields.
  Editing a value does not change `valuesEstimated`.

### E. Hover preview
- `OutlineSuggestionsPanel.tsx`: hovering a design tile (`pointerenter` with `pointerType === 'mouse'`, after a
  120 ms delay so sweeping across tiles does not redraw every tile) shows that design in the large preview,
  read-only (plain `AIContentRenderer`, no edit handles), with the user's text. `pointerleave` (no delay) returns
  the preview to the selected design. A click selects as today and ends the hover. Touch/pen: unchanged.
- While hovering: the selection, `onSelect`, the "Similar visuals" row and Edit text do NOT change; the preview's
  zoom resets for the hovered design the same way it does on selection (use the hovered key in `resetKey`).
- The preview gets `data-ai-preview-hover="<key>"` while a hover is shown (absent otherwise), for tests.
- Clean up the delay timer on unmount and when the list changes.

## Tests
- Route (`app/api/ai/generate-outline/route.test.ts`): `estimateValues: true` adds the fixed line to the prompt;
  `estimateValues: "yes"` → 400; no options → prompt byte-identical; with estimateValues and ≥2 values → response
  `valuesEstimated: true`; with estimateValues and <2 values → no flag; a model JSON containing
  `"valuesEstimated": true` WITHOUT the option → no flag.
- `lib/ai/outline` test: `withValuesEstimated` does not mutate its input; `parseOutline` drops a model-supplied flag.
- Editor (new `AIComponentEditor.patch250.test.tsx`, mocked fetch): no-numbers outline → Pie Chart → note → "Make
  pie chart" → exactly one fetch to `/api/ai/generate-outline` whose body has `options.estimateValues === true`, NO
  call to the old chart route; the response (pie values) shows pie tiles first and the family line still says Pie
  Chart; the estimated note is visible.
- Panel: hover a tile (mouse pointer, fake timers 120 ms) → `data-ai-preview-hover` = that key and `onSelect` NOT
  called; leave → attribute gone; a pen/touch pointer → no hover.
- OutlineTextEditor: value inputs appear only when some item has a value; typing 25 sets `value: 25`; clearing removes
  it; the input outline object is never mutated.
- **Mutations** (revert each with your Edit tool): (1) remove `estimateValues` from the makeChart call → the editor
  test fails; (2) let the route copy `valuesEstimated` from the model → the route test fails; (3) call `onSelect` on
  hover → the panel test fails.

## Allowed files
```
app/api/ai/generate-outline/route.ts (+ route.test.ts)
lib/ai/outline.ts (+ its test)
components/collabboard/editors/AIComponentEditor.tsx (+ new AIComponentEditor.patch250.test.tsx)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its tests)
components/collabboard/editors/OutlineTextEditor.tsx (+ its test)
```
Forbidden: everything else (the AntV catalog, mapOutline, renderers, the database, `package.json`, other AI routes,
the old chart generator). Real tool calls only (never write a tool call as plain text); one test file at a time with
`--reporter=dot`, never pipe vitest into grep/head, no test files outside the repo; revert mutations with your Edit
tool; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors app/api/ai/generate-outline
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-250.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** no-numbers text → Pie Chart → Make pie chart: one `generate-outline` call, pie designs first with
estimated shares, the estimated note, values editable under Edit text and the picture follows; hovering tiles
previews them, leaving returns to the selected one, nothing saved by hovering.

## Commit message (verbatim)
```
feat(ai): make a pie or bar chart from text without numbers

"Make pie chart" now asks the AI to estimate each point's share and
opens the pie designs, instead of drawing one plain chart. The window
says the numbers were estimated, and they can be changed under Edit
text. Hovering a design shows it in the large preview straight away.
```

## Addendum 1 (CTO, 2026-10-02): review and live result
Implementer deviation accepted: the two PATCH-248 tests in `AIComponentEditor.patch248.test.tsx` that asserted the
old "Make pie chart → generate-component" path were updated to the new behaviour (the other 11 untouched).
Live (own tab, nothing saved): text without numbers → Pie Chart → note + 2 word clouds → Make pie chart → ONE
`generate-outline` with `options.estimateValues: true` (no generate-component call) → 11 chart tiles, the 6 pies
first, family line "Pie Chart", estimated note shown, preview "Venue 55% / Food 30% / Misc 15%". Hovering a donut tile
previews it (`data-ai-preview-hover`), the selection stays; leaving returns to the selected design. Edit text shows
3 value fields (55/30/15); 55 → 70 redraws the pie (60.9 / 26.1 / 13.0 %). 0 console errors, 0 padlet writes.
Gate `.opencode-vitest-250.json`: extra [] missing []; tsc clean (implementer).
