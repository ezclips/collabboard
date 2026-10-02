# PATCH-246 — One simple AI picture window: text first, then a gallery with filters

Status: AUTHORIZED (owner, 2026-10-02: "yes start with patch improve the user friendliness" — after the CTO's review
of the generator window; the owner delegates the design).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-245 (`af885df1`, pushed)

## Why (owner's screenshots + CTO code read)
`components/collabboard/editors/AIComponentEditor.tsx` ("AI Component Generator"):
1. **Two doors, two rooms.** The toolbar's AI button opens Diagram with **Flowchart** preselected
   (`getDefaultDiagramSubtype`, ~625) and an empty preview; "Visualize…" opens **Show options** and generates at once
   (~413, ~804).
2. **The designs live in only one of seven buttons.** The "Diagram subtype" grid (~1173-1240) has "Show options"
   plus Flowchart, Mindmap, Pie Chart, Bar Chart, Timeline, Comparison. Each of those is a different, older generator
   that returns ONE fixed picture — clicking one makes the design gallery disappear (owner: "the templates won't
   appear again").
3. **Choose before you see.** 5 modes × 7 subtypes before any result. Napkin, Miro, FigJam and Canva all put the
   content first and let the user pick the look from results. Our engine already works that way (one outline call →
   every design, PATCH-233..245); only the window still asks first.

## Design
### A. One layout for every NEW picture (toolbar button and Visualize alike)
- Left column, top to bottom:
  1. **"What do you want to visualize?"** — the prompt textarea (as today; Visualize pre-fills it with the note text),
     placeholder "Paste or type your text, e.g. the steps of a morning routine".
  2. **Generate** button (primary) — runs the outline call exactly like today's Show options (1 credit). Visualize
     still auto-runs once (PATCH-235).
  3. The model chooser (unchanged).
  4. A small, closed **"Other formats"** disclosure (`data-ai-other-formats`) holding the non-picture products:
     Lesson Board, Workshop Board, Photo Card (same cards/descriptions as today). Choosing one switches the window to
     today's flow for that mode (its own Generate, its own preview); a "← Back to pictures" link returns.
- Removed from the main view: the "Choose a mode" list, the "Auto" card and the whole "Diagram subtype" grid. The
  code paths behind them stay (they are still used by Other formats, Regen and stored posts); only the buttons go.
  `MODE_REGISTRY`, routes and credit costs are untouched.
- Right column: the design gallery (`OutlineSuggestionsPanel`) as today, PLUS the filter row (B). Before the first
  Generate it shows today's empty state with the hint "Your pictures will appear here".
### B. Filters instead of generators (pure `lib/ai/pictureFamilies.ts` + panel)
- `pictureFamily(option): PictureFamily`, one of `'flow' | 'mindmap' | 'hierarchy' | 'list' | 'timeline' |
  'comparison' | 'chart'`, from the option key and its category:
  - ours: `flow`, `infographic:stairs|funnel|cycle` → flow; `mindmap`, `infographic:hub` → mindmap;
    `infographic:pyramid|stack` → hierarchy; `timeline` → timeline; `comparison` → comparison;
  - AntV (by catalogue category/family): `sequence-*` timeline families (name contains `timeline`) → timeline, other
    `sequence` → flow; `hierarchy-mindmap*` → mindmap, other `hierarchy` → hierarchy; `list`, `quadrant`, `relation`
    → list; `compare` → comparison; `chart` → chart. Unknown → list. Tested for every one of the 276 catalogue names
    (each maps to exactly one family).
- A chip row above the gallery (`data-ai-family-chip="all|flow|…"`, labels **All · Flow & steps · Mind map ·
  Hierarchy · Lists · Timeline · Comparison · Chart**), "All" selected by default; a chip with no designs for this
  text is hidden. Clicking filters the tiles locally — NO fetch, the outline and selection are kept, the large
  preview keeps the selected design unless it is filtered out (then the first visible one is selected). The
  gallery's group headings use the same family names (replacing today's mixed "Process"/"sequence"/"Timelines").
- "Make it a… <design>" (Customize) and Best match keep working; a hint that names a family also selects that chip.
### C. Charts need numbers
- The **Chart** chip is always shown once there are results. When it is selected and no chart design fits, it shows
  a short note "Charts need numbers. Make a pie or bar chart from your text:" with two buttons **Pie chart** /
  **Bar chart** (`data-ai-make-chart="pie|bar"`). Each runs TODAY's chart generator for that subtype with the same
  prompt (1 credit, same route, same validation) and shows the result as the selected design in the large preview;
  Save works as today. Nothing else about charts changes.
### D. Unchanged on purpose
- Regen of an existing post (`lockedMode`/`lockedSubtype`, `CanvasModals` ~190) keeps today's behaviour for every
  locked type; reopening a stored infographic keeps PATCH-236's no-AI reopening (and now shows the chips).
- Edit text, Customize, Colours/themes, Similar visuals, zoom (PATCH-245), on-picture editing, Save — unchanged.

## Tests
- `pictureFamilies.test.ts`: every base key and every one of the 276 AntV names maps to exactly one family (snapshot
  of the counts per family); timeline/mind-map special cases.
- Editor (`AIComponentEditor.*.test.tsx`): a new picture (toolbar entry) shows the prompt, Generate, Other formats
  (closed) and NO mode list / subtype grid; Generate calls `/api/ai/generate-outline` once; Visualize still auto-runs
  once; Other formats → Lesson Board → its generator; Back → pictures. Regen of a stored flowchart (locked) still
  shows today's locked UI.
- Panel: chips render only for families present; clicking "Timeline" shows only timeline tiles and makes NO fetch;
  the selected design survives a chip change when visible; "All" restores everything.
- Charts: Chart chip with no chart designs shows the note and both buttons; "Pie chart" posts to the existing chart
  route with subtype `pie` and shows the result.
- Update the existing tests that pin the removed grid (`AIComponentEditor.options.test.tsx` uses
  `data-ai-subtype-chip`) — say exactly which assertions changed and why. If any test OUTSIDE
  `components/collabboard/editors/` or `lib/ai/` pins the grid or the "Choose a mode" markup, STOP and ask.
- **Mutations:** a chip click that fetches → the no-fetch test fails; a family map with an unmapped AntV name → the
  276-names test fails; the subtype grid still rendered → the "no grid" test fails.

## Allowed files
```
components/collabboard/editors/AIComponentEditor.tsx (+ its tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ its tests)
lib/ai/pictureFamilies.ts (+ test)                                    (new)
lib/ai/infographic/suggest.ts (+ test)                                (only to expose the family / headings)
```
Forbidden: the database, `package.json`, every AI route and credit cost, `MODE_REGISTRY` semantics,
`CanvasModals.tsx`, `CanvasClient.tsx`, the renderers, the DOMPurify profile. Every new test path must be collected by
`vitest.config.ts` (check; STOP if not). Real tool calls only (never write a tool call as plain text); one test file at
a time with `--reporter=dot`, never pipe vitest into grep/head; revert mutations with your Edit tool; no git writes;
no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-246.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** toolbar AI button → text box + Generate + Other formats, no mode/subtype lists; Generate → gallery
with chips; Timeline / Mind map / Comparison chips filter with no AI request and the designs never disappear; Chart →
Pie chart makes one chart request; Visualize on a note opens the same window and runs once; Other formats → Lesson
Board still works; Regen on an old flowchart still works. Save one picture, check the board, delete the test posts.

## Commit message (verbatim)
```
feat(ai): one simple window for AI pictures

The AI picture window asked for a mode and a diagram type before
showing anything, and choosing a type hid all the designs. Now both the
toolbar button and Visualize open the same window: type or paste your
text, press Generate, and pick from the designs. Filters (flow, mind
map, timeline, comparison, chart, ...) narrow the gallery without a new
AI call. Lesson and workshop boards and photo cards are under Other
formats.
```

## Addendum 1 (CTO, 2026-10-02): live result
Toolbar AI button → "What do you want to visualize?", Generate, model, closed "Other formats"; no "Choose a mode", no
subtype grid. Other formats → Lesson Board → "← Back to pictures" works. Generate → one `generate-outline` (200),
53 designs, chips All · Flow & steps · Mind map · Hierarchy · Lists · Timeline · Chart (Comparison hidden: no design
for this text); each chip filtered locally (16/12/16/16/5 tiles), "All" restored 53, no AI request. Chart → no chart
design → note + Pie/Bar; Pie chart → one `generate-component` (200) → correct pie (Venue 40 / Food 30 / Travel 20 /
Activities 10); Save → POST 201; test post `8f4fea2c` deleted. Review fix: the old Flowchart description under the
prompt removed (test added). Gate `.opencode-vitest-246.json`: extra [] missing []; tsc clean; no mutation text.
Not live-checked: Visualize from a note (unit test covers the single auto-run) and Regen of a stored flowchart
(locked path unchanged; tests cover).
