# PATCH-268 — Example numbers never become real data

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F1 (HIGH) + F7 (MEDIUM), both
reproduced live by Codex in Chrome on 2026-10-03).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-267 (b52842bb). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` sections 2, 2b and F1/F7.

## Why
- **F1, live:** text without numbers → Pie Chart → preview 50/50 with the "Example numbers" badge and Save disabled →
  Edit text → change ONLY the first label → the badge disappears, Save becomes enabled, values still 50/50. The edit
  panel receives `derivedOutline` (with example values, `AIComponentEditor.tsx` ~L1619) and its returned outline is
  stored as the source (`applyEditedOutline` ~L560), so the example numbers become "real"; the Save gate only counts
  numeric items (`outlineValueCount < 2`, ~L568 / ~L646). Every other path that returns a whole outline to the
  generator (element editor moves/colours, Add panel, icon swap, native mind-map edits) can do the same.
- **F7, live:** four values all 0 → labels and leader lines, zero-area sectors, **Save enabled**. Also
  `withExampleValues` on `[70, missing, missing]` gives `[70, 33, 67]` (total 170) because existing values are not
  counted; and two real values among four items already pass the gate.

## Design
### A. Per-item provenance (`lib/ai/outline.ts`)
- `VisualOutlineItem` gains `valueExample?: true` — set ONLY locally by `withExampleValues`; `parseOutline` drops it
  from model output (same as `valuesExample` / `valuesEstimated`).
- `withExampleValues(outline)`: items that already have a numeric value keep it (no flag). Missing items get a value
  and `valueExample: true`:
  - no item has a value → equal shares of 100 (today's behaviour, last item takes the rest);
  - some items have values → each missing item gets the rounded mean of the existing values (min 1).
  Outline-level `valuesExample: true` stays (the badge).
- New `withoutExampleValues(outline)`: removes `value` AND `valueExample` from every item flagged `valueExample`, and
  removes the outline-level `valuesExample`. Pure, never mutates; identity-preserving when nothing is flagged.
### B. Examples never enter the source
- In `AIComponentEditor.tsx`, EVERY place where an outline coming back from the UI becomes the source
  (`applyEditedOutline`; the renderer/element-editor `onChange` path; the Add panel; icon swap; the native mind-map
  tree edit; any other `setActiveOutline(next)` with a UI-returned outline) passes it through
  `withoutExampleValues` first. List every such entry point in the report. The file is > 800 lines: add only these
  wiring lines; put any helper in `lib/ai/outline.ts` or a new small file.
- `OutlineTextEditor.tsx`: typing a number into an item's value field makes that item real — remove its
  `valueExample` flag (clearing the field removes the value, as today). Label, detail and icon edits keep the flag.
  An example value is shown in the field with a visual "example" hint (e.g. grey/italic + `data-ai-value-example`), so
  the user can tell it apart from a real one.
### C. Save gate and zero pie
- Example mode (`showExampleValues`) is on for the chart family whenever ANY item lacks a real value (not "< 2").
- A numeric chart can be saved only when every item has a real number (no `valueExample`, no missing value).
- A **pie** additionally needs a positive total: when all real values are 0 (or the total is 0), Save is disabled with
  the reason "A pie needs at least one number above 0" and a short note in the chart info card
  (`data-ai-chart-zero-note`). Bars/columns with zeros remain saveable.
- "Make pie chart" (AI estimate, `valuesEstimated`) values are real — unchanged.

## Tests (encode the live sequences — through the real generator component, not only helpers)
1. No values → Pie → Edit text → change only item 1's label → commit: badge still shown, Save disabled, the source
   outline (`applyEditedOutline` argument after stripping / the next envelope's source) has NO values; the preview
   still shows example values.
2. Same with: an element-editor commit (PATCH-260 move) and an Add-panel addition (PATCH-262) while examples show →
   source has no values, the override/addition IS kept.
3. Type a value into item 1 only → item 1 real, item 2 still example, Save disabled; type item 2 → badge gone, Save
   enabled; the persisted payload has no `valueExample` / `valuesExample`.
4. Four real zeros → pie: Save disabled with the zero reason and the note; bar: Save enabled.
5. `withExampleValues([70, -, -])` → `[70, 70, 70]` with flags on items 2-3; `([-, -])` → `[50, 50]`;
   `withoutExampleValues` round-trip restores the original; identity when nothing flagged.
6. `parseOutline` drops a model-supplied `valueExample`.
7. Mutation (revert with Edit): skip `withoutExampleValues` in `applyEditedOutline` → test 1 fails.
Also keep the existing PATCH-257/267 tests green.

## Allowed files
```
lib/ai/outline.ts (+ outline.test.ts)
components/collabboard/editors/AIComponentEditor.tsx            wiring only
components/collabboard/editors/OutlineTextEditor.tsx (+ test)
components/collabboard/editors/OutlineSuggestionsPanel.tsx      only the zero note in the chart info card, if it lives there
components/collabboard/editors/AIComponentEditor.patch257.test.tsx or a new AIComponentEditor.patch268.test.tsx
new small helper/test files next to these
```
Forbidden: everything else. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process substitution, no test
files outside the repo; revert mutations with your Edit tool; no git writes; no production build; no curl of the dev
server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-268.json
```
The CTO compares the gate (failing file set AND failing test names). Short report listing every file changed and every
source entry point you wired. Do not commit.

**Live (CTO, write-locked tab, nothing saved):** Codex's step 5 (label-only edit keeps the badge and disabled Save);
move an element and add a circle while examples show (still example); type one value, then both (Save enabled only
then); four zeros on a pie (Save disabled + note) vs bar (enabled); "Make pie chart" still enables Save.

## Commit message (verbatim)
```
fix(ai): example chart numbers can no longer be saved as real data

A pie or bar chart drawn from example numbers stayed "example" only until
the next edit; renaming a label quietly turned the examples into real
values and enabled Save. Examples are now tracked per item and never
saved, an all-zero pie cannot be saved, and mixed examples use the
average of the real numbers.
```

## Final result (CTO, 2026-10-03, live, write-locked tab, 1 generation, nothing saved)
Owner-style text (no numbers) → Pie: badge on, Save off, preview 50ex/50ex, the value field marked example. Label-only
edit (Codex's F1 sequence): badge on, Save off, still 50ex/50ex. Element move: still example, override kept. Add
circle: still example, addition kept. Typed item 1 only → 70 / 70ex, Save off; typed both → 70/30, badge off, Save
on. Both 0 → pie: Save off + zero note; bar: Save on. Blocked writes: only the expected two. Gate
`.opencode-vitest-268.json`: failing FILES and failing TEST NAMES identical to the PATCH-267 gate (59/59, none new,
none gone); tsc clean.
