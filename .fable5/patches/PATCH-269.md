# PATCH-269 — Editing the mind map keeps every item's numbers and styles

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F2 (HIGH), reproduced live by Codex).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-268 (ea5fcf60). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F2 and step 10 of 2b.

## Why (Codex, live)
Text "Budget: Venue 40%, Food 30%, Travel 20%, Activities 10%." → Pie shows 40/30/20/10 → Mindmap → select the native
`mindmap` design → rename "Venue" in the preview → back to Pie: **the real values are gone** (four 25% example
sectors, Save disabled). Cause: `lib/ai/outlineToVisuals.ts` `mindmapTree()` (~L109) and `outlineFromMindmapTree()`
(~L129) copy an explicit list of item fields (side, detail, date, icon, color) to the tree and back; `value` and
`textStyle` (and any field added later, e.g. `valueExample`, future ids) are dropped. The panel calls it on every
native mind-map edit (`OutlineSuggestionsPanel.tsx` ~L667).

## Design (`lib/ai/outlineToVisuals.ts`)
- Carry fields generically, so they travel WITH their node through renames, additions, removals and reorders (no
  index-merging):
  - `mindmapTree`: each branch = `{ ...restOfItem, label, children }` where `restOfItem` is every item field except
    `label` and `children` (children stay `{ label }` as today — `VisualOutlineChild` has only a label).
  - `outlineFromMindmapTree`: each branch → `{ ...restOfBranch, label, children }`, then run the result through the
    same item validation/sanitising the outline already uses for items (unknown or invalid fields dropped — do not
    let arbitrary tree fields into the outline). A NEW branch added in the tree has only a label (no value).
- Verify the tree edit helpers used by the native mind-map editor (rename / add branch / remove branch / any reorder,
  in `MindmapTreeRenderer` / `lib/ai/mindmapLayout.ts` or wherever they live) keep a node's extra fields on rename and
  move; if one rebuilds nodes from `{label}` only, fix it there (allowed file) and say so.
- The AntV mind map (`antv:hierarchy-mindmap-*`) edits go through `applyAntvChange` (`lib/ai/antv/mapOutline.ts`):
  check that a label edit there also keeps `value` / `textStyle` on that item; add a test either way.

## Tests
- `outlineToVisuals.test.ts`: an outline whose items have `value`, `textStyle`, `icon`, `side`, `detail`, `color`:
  tree → outline round-trip with no edit is lossless (deep-equal on items); rename item 1 → item 1 keeps its value and
  textStyle; add a branch between 1 and 2 → the old items keep their own values (none shifted), the new one has none;
  remove item 1 → item 2 still has ITS value (not item 1's); an unknown/invalid field injected on a tree node does not
  reach the outline.
- Through the real flow (generator or panel test): 40/30/20/10 → native mind-map rename → Pie family: the preview
  envelope has 40/30/20/10, no `valuesExample`, Save enabled.
- AntV mind map: a label `options:change` keeps that item's value/textStyle.
- Mutation (revert with Edit): drop the generic carry in `outlineFromMindmapTree` → the round-trip test fails.

## Allowed files
```
lib/ai/outlineToVisuals.ts (+ test)
lib/ai/mindmapLayout.ts and the native mind-map edit helpers (+ tests) — only if they drop node fields
lib/ai/antv/mapOutline.ts (+ test) — only if the AntV label path drops value/textStyle
components/collabboard/editors/*.test.tsx — a new flow test file (e.g. AIComponentEditor.patch269.test.tsx)
```
Forbidden: everything else (no changes to AIComponentEditor.tsx / OutlineSuggestionsPanel.tsx are expected; if you
believe one is needed, stop and say why in the report). Real tool calls only; one test file at a time with
`--reporter=dot`; never pipe vitest; NEVER compare results with diff/process substitution; no test files outside the
repo; revert mutations with Edit; no git writes; no production build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-269.json
```
The CTO compares failing files AND failing test names. Short report listing every file changed. Do not commit.

**Live (CTO, write-locked, nothing saved):** Codex's step 10 exactly (40/30/20/10 → native mindmap rename → Pie keeps
40/30/20/10, Save enabled); add and remove a branch in the native mind map → the remaining items keep their numbers;
the same rename on an AntV mind map design.

## Commit message (verbatim)
```
fix(ai): editing a mind map no longer wipes the chart numbers

Renaming, adding or removing a branch in the mind map design dropped
every item's number and text style, so switching back to a pie showed
example numbers instead of yours. Every item now keeps all its details
through mind map edits.
```

## Final result (CTO, 2026-10-03, live, write-locked tab, 1 generation, nothing saved)
"Budget: Venue 40%, Food 30%, Travel 20%, Activities 10%." → Pie 40/30/20/10, Save on. Native mind map: rename
"Venue" → Pie keeps 40/30/20/10 with "Venue renamed", Save on (Codex step 10 fixed). Add a branch + remove "Food" →
Pie: Venue renamed 40 / Travel 20 / Activities 10 (no value shifted) / New branch 23 example (PATCH-268 mean) with Save
off as designed. AntV mind map: rename "Travel" → "Travel trip" keeps 20. Gate `.opencode-vitest-269.json`: failing
test names identical to PATCH-268 (59/59); tsc clean. Accepted deviation: `lib/ai/outline.test.ts` PATCH-244 assertion
updated (the tree now carries textStyle by design; the six native layouts are still checked to ignore it). Cleanup
candidate: `sanitizeTreeBranch` validates one branch by running `parseOutline` with a padding item — an exported
per-item sanitizer in `outline.ts` would be cleaner.
