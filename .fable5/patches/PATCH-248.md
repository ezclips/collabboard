# PATCH-248 — The diagram buttons jump to the matching designs (no scrolling, no new AI call)

Status: AUTHORIZED (owner, 2026-10-02, with an annotated screenshot linking each Diagram subtype button to the
designs on the right: "can we not link the filters to the corresponding diagrams?" … "yes … the user can pick … pie
chart then … the section with pie charts opens up and the user doesn't have to scroll through the templates").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-247 (`383f2010`). PATCH-246 (a new window) was REVERTED at the owner's request (`4f1e2fd4`):
the owner keeps today's layout ("Choose a mode", the "Diagram subtype" buttons, the text box). Do NOT bring back
anything of PATCH-246's layout (no single text box window, no "Other formats", no chip row).

## Why
In `components/collabboard/editors/AIComponentEditor.tsx` (~1173-1240) "Show options" shows every design, but
Flowchart, Mindmap, Pie Chart, Bar Chart, Timeline and Comparison each switch to an older generator that returns one
fixed picture, and the designs disappear. The owner wants these buttons to be the way into the matching designs.

## Design
### A. Family of a design (pure; restore from the reverted commit)
- Restore `lib/ai/pictureFamilies.ts` and `lib/ai/pictureFamilies.test.ts` exactly as in `ad6efde6`
  (`git show ad6efde6:lib/ai/pictureFamilies.ts` — read it with git show; no git writes). `pictureFamily(option)`
  maps every design (ours + all 276 AntV names) to `flow | mindmap | hierarchy | list | timeline | comparison | chart`.
- New `familyForSubtype(subtype)`: `flowchart → flow`, `mindmap → mindmap`, `timeline → timeline`,
  `comparison → comparison`, `pie_chart | bar_chart → chart`; anything else → `null` (= all designs).
### B. The subtype buttons drive the design list
- The button row stays exactly as it looks today. New behaviour of a button click (Flowchart, Mindmap, Pie Chart, Bar
  Chart, Timeline, Comparison):
  - **Designs already on screen** (an outline exists): the design list shows ONLY that family's designs (local, NO
    fetch), scrolled to the top, and the best-ranked design of that family is selected in the large preview. The
    clicked button looks selected. **Show options** shows all designs again (and keeps the current selection if it
    is still visible).
  - **No designs yet:** the click just remembers the family (button selected); **Generate** runs the outline call
    exactly like Show options (1 credit) and opens on that family's designs.
  - Flowchart/Mindmap/Timeline/Comparison never switch to their old single-picture generator from these buttons any
    more. The old generators stay in the code for Regen of stored posts (`lockedMode`/`lockedSubtype`), which is
    unchanged.
- **Pie Chart / Bar Chart:** if chart designs exist for this text, show them like any family. If none: show a short
  note in the design list — "Charts need numbers. Make one from your text:" — with one button **Make pie chart** /
  **Make bar chart** (`data-ai-make-chart="pie|bar"`, whichever was clicked) that runs TODAY's chart generator for
  that subtype with the same prompt (1 credit, same route, same validation) and shows the result in the large
  preview; Save works as today.
- Families without a button (hierarchy, lists) are visible under Show options only.
- A small line above the design list says what is shown, e.g. "Showing: Flowchart designs · Show all"
  (`data-ai-family-filter`, the "Show all" link = Show options). Hidden when showing all.
- Visualize (PATCH-235) unchanged: opens on Show options and generates once.

## Tests
- `pictureFamilies.test.ts` (restored): every base key and all 276 AntV names map to exactly one family;
  `familyForSubtype` cases.
- Editor: with designs on screen, clicking Timeline shows only timeline designs, makes NO fetch, selects a timeline
  design, and the design list's scrollTop is 0; Show options restores all; clicking Mindmap before Generate → Generate
  calls `generate-outline` once and opens on mind-map designs; Comparison never calls `generate-component`; Pie Chart
  with no chart designs shows the note + "Make pie chart", which posts once to the chart route with `pie_chart`;
  "Showing: … · Show all" appears/disappears correctly. Regen of a stored flowchart (locked) still uses the old path.
- Update any existing test that pinned the old "subtype click switches generator" behaviour; say exactly which and
  why. If a test outside `components/collabboard/editors/` or `lib/ai/` pins it, STOP and ask.
- **Mutations:** a subtype click that fetches when designs exist → the no-fetch test fails; `familyForSubtype` maps
  timeline to flow → the timeline test fails; the design list not scrolled to the top → the scrollTop test fails.

## Allowed files
```
lib/ai/pictureFamilies.ts (+ test)                                   (restored from ad6efde6, + familyForSubtype)
components/collabboard/editors/AIComponentEditor.tsx (+ its tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its tests)   (family filter + chart note only)
```
Forbidden: the database, `package.json`, every AI route and credit cost, `MODE_REGISTRY` semantics, `CanvasModals.tsx`,
`CanvasClient.tsx`, the renderers, the DOMPurify profile, anything of PATCH-246's layout. Every new test path must be
collected by `vitest.config.ts`. Real tool calls only (never write a tool call as plain text); one test file at a time
with `--reporter=dot`, never pipe vitest into grep/head, no test files outside the repo; revert mutations with your
Edit tool; no git writes (`git show` to read is fine); no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-248.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** toolbar AI → Diagram → Show options → Generate (1 call); click Timeline, Mindmap, Comparison,
Flowchart → only those designs, list at the top, preview switches, no AI request; Pie Chart → designs or the note +
Make pie chart (1 call); Show options → all. Before Generate: click Flowchart → Generate → opens on flow designs.
Visualize unchanged. Save one picture; delete the test posts.

## Commit message (verbatim)
```
feat(ai): diagram buttons jump to the matching designs

Flowchart, Mindmap, Timeline, Comparison, Pie Chart and Bar Chart in the
AI window now show the matching designs straight away instead of
switching to a separate generator that hid them, so there is no
scrolling through every design and no new AI call. Show options shows
them all again. When a chart needs numbers that the text does not have,
a Make chart button builds one.
```

## Addendum 1 (CTO, 2026-10-02): owner's live feedback — charts and empty states
Owner, testing the work in progress: (1) toolbar AI → Diagram → Pie Chart before Generate: "it doesn't switch" —
nothing visible changes; (2) Visualize on a note without numbers → Pie Chart shows "Charts need numbers" above an
EMPTY dotted picture box: "Is there really no pie chart template or can't it find it?"
Code read: AntV ships 6 pie designs (`chart-pie-*`), `chart-bar-plain-text`, `chart-column-simple`,
`chart-line-plain-text` and 2 word clouds, but `lib/ai/antv/catalog.ts` `shapeAllows` (~61) rejects every `chart-*`,
because the outline never carries numbers (`OUTLINE_SYSTEM_PROMPT` has no value field).
Add to PATCH-248:
1. **Keep numbers.** `VisualOutlineItem` gains optional `value?: number` (finite, ≥ 0; anything else dropped by
   `parseOutline`/validators). `OUTLINE_SYSTEM_PROMPT` gains ONE rule: "When the text gives a number, amount or
   percentage for a point, put it in \"value\" as a plain number (40% → 40). Never invent a value." and the example
   item shows `"value": 40` as optional. Route, credits and request shape unchanged (`app/api/ai/generate-outline/
   route.ts` is NOT edited unless its test pins the prompt text — then update that pin only).
2. **Offer the charts when there are numbers.** `shapeAllows`: `chart-pie-*`, `chart-bar-*`, `chart-column-*`,
   `chart-line-*` fit when at least 2 items have a `value` (and 2..8 items); `chart-wordcloud*` fits any outline with
   ≥ 3 items. `toAntvOptions` passes `value` into each AntV datum (read AntV's chart structures for the field name).
   Family `chart` as already mapped. Editing a value on the picture is out of scope (List view keeps it).
3. **No numbers:** the chart note reads "Your text has no numbers to split into slices. Add some (e.g. “Venue 40%,
   Food 30%”) and press Generate again, or let the AI estimate them:" + the Make pie/bar chart button.
4. **No empty picture box:** when the selected family has no designs, the large preview area is replaced by the
   note (no empty dotted stage).
5. **Visible before Generate:** clicking a subtype before any designs exist shows in the empty preview "Pie Chart
   selected – write or paste your text and press Generate." (the subtype's label).
Tests: value parsing (40 kept, "40%" string → dropped by the schema unless numeric, -1/NaN dropped); prompt contains
the value rule; an outline with 4 valued items → `antvTemplatesFor` includes all 6 `chart-pie-*` and the bar/column/
line ones; without values → none of them, word cloud only with ≥ 3 items; `toAntvOptions` carries `value`; the
editor shows the note instead of an empty stage and the pre-Generate message. Mutation: `shapeAllows` ignoring the
value count → the no-values test fails.
Allowed files: as before plus `lib/ai/outline.ts` (+ test), `lib/ai/validators.ts` (+ tests), `lib/ai/antv/**`
(+ tests), and the generate-outline route TEST only if it pins the prompt. Re-run the verification and the full gate
(`--outputFile=.opencode-vitest-248b.json`).

## Addendum 2 (CTO, 2026-10-02): live review — two small fixes
Live: Pie Chart before Generate → "Pie Chart selected – write or paste your text and press Generate."; budget text
("venue 40%, food 30%, travel 20%, activities 10%") → one `generate-outline` → opens on 11 chart designs (6 pies,
bar, column, line, 2 word clouds) with "Showing: Pie Chart designs · Show all" and a correct bar chart (40/30/20/10);
Timeline 5 / Mindmap 12 / Comparison 1 / Flowchart 16 designs with no further AI request; the two-line note without
numbers → Pie Chart shows the no-numbers note + Make pie chart and no empty picture box. Fixes:
1. **The clicked chart type leads.** Pie Chart → the 6 `chart-pie-*` first (best one selected), then the others;
   Bar Chart → `chart-bar-*`, `chart-column-*` first, then line, then pies. Word clouds always last. If the text has
   no numbers but word clouds fit (≥ 3 items), Pie/Bar Chart still shows the no-numbers note ABOVE the word clouds
   (the note decides by "no numeric chart design", not "no design").
2. **The line under the prompt matches the selected button.** In the screenshot it said "Step-by-step process
   visualization." (Flowchart) while Pie Chart was selected: show the description of the selected subtype button
   ("Part-to-whole chart for proportions." for Pie Chart), and Show options' own description when Show options is
   selected.
Tests: ordering for pie/bar; note shown above word clouds for a 3-item value-less outline; helper line text per
button. Re-run the verification and the full gate (`--outputFile=.opencode-vitest-248c.json`).

## Addendum 3 (CTO, 2026-10-02): live result after Addendum 2
Pie Chart before Generate → the "selected" message and helper "Part-to-whole chart for proportions."; budget text →
one `generate-outline` → 11 chart designs with the 6 pies first (best: a correct pie 40/30/20/10 %), word clouds last;
Timeline 5 / Mindmap 12 / Comparison 1 / Flowchart 16; Show options → 61; no further AI request. Saved the pie
(POST 201): the board draws it ("Venue" visible, render done). Test post `db2c553a` deleted (DELETE 204). Gate
`.opencode-vitest-248c.json`: extra [] missing []; tsc clean; no mutation text.
