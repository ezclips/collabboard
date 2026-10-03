# PATCH-273 — Each design keeps its own edits

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F5 (HIGH, source-confirmed), patch 7
of Codex's sequence, first half; the stable-item-id half (F4) follows as PATCH-274).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-272 (4e43d15a). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F5 and patch 7.

## Why
`VisualOutline.elementOverrides` is ONE slot `{ template, items, additions }`. Edits apply only when its `template`
matches the drawn design (`initialOverrides`, `AntvElementChrome.tsx` ~L142; `applyElementOverrides`). Codex F5: edit
design A (move, colour, add a circle) → switch to design B → make any element edit or addition on B → the slot is
REPLACED by B's → back to A: all of A's work is gone, silently, and the next save stores only B's.

## Design
### A. Data (`lib/ai/outline.ts`, `lib/ai/antv/elementOverrides.ts`)
- `VisualOutline` gains `elementOverridesByTemplate?: Record<string, ElementOverrides>` — one entry per design,
  key === entry.template; at most 12 entries (when a 13th is written, drop the least recently written; keep insertion
  order = recency by re-inserting the edited key last). Each entry sanitized with the existing
  `sanitizeElementOverrides`; a key that does not match its entry's template, or an invalid template name, is dropped.
- Keep `elementOverrides` as well: it always mirrors the entry of the most recently edited design, so every existing
  reader, stored post and old client keeps working.
- Two helpers, the ONLY way to read/write per-design edits:
  - `overridesForTemplate(outline, template)` → `elementOverridesByTemplate?.[template]` ?? (`elementOverrides` if its
    template === template) ?? undefined. (Legacy posts with only `elementOverrides` therefore keep their edits.)
  - `outlineWithTemplateOverrides(outline, template, overrides | undefined)` → new outline with that entry set (or
    removed when empty), the legacy slot seeded into the map first if it was the only copy, and `elementOverrides`
    mirroring this entry. Pure.
- `withoutElementOverrides` (content comparison) strips BOTH fields. `parseOutline` model path strips both; the stored
  path (PATCH-272) sanitizes both. The three generate routes' model-output strips include `elementOverridesByTemplate`.
### B. Use the helpers everywhere
Replace every direct read/write of `outline.elementOverrides` for the drawn design: `initialOverrides`
(`AntvElementChrome.tsx`), `AntvInfographicRenderer.tsx` (apply after render/update, the overrides-only no-redraw
check, debug attributes), `AntvElementEditor.tsx` + its hooks (emit / `outlineWithOverrides`), the Add panel insertion
(`OutlineSuggestionsPanel.tsx` — it is at 798 lines: move the insertion code into a helper file FIRST, then change it),
icon swap, and `editHistory.ts` (`applyEntry`'s overrides case writes the entry's own template slot — record the
template in the entry). List every call site changed in the report.
### C. No migration
Old posts are read through the fallback; the map is created on the first edit. Nothing in the database changes.

## Tests
- Pure: `overridesForTemplate` legacy fallback / map hit / miss; `outlineWithTemplateOverrides` sets, removes, seeds
  the legacy slot, mirrors `elementOverrides`, enforces the 12-entry limit by recency; sanitizer drops mismatched keys;
  model path strips the map; stored path keeps and sanitizes it.
- Through the real generator/editor (Codex's scenario): design A: move an element + colour + add a circle → switch to
  design B → colour an element + add an arrow → back to A: A's move/colour/circle are applied (DOM transform/fill/
  addition present) and B's are not → back to B: B's arrow and colour → the saved payload's outline has BOTH entries,
  `elementOverrides` = the last edited design's.
- Legacy: an outline with only `elementOverrides` for A → A shows its edits; editing B keeps A's entry.
- Undo after switching: edit A, switch to B, edit B, switch back to A, Ctrl+Z → undoes B's edit in B's slot (A
  unchanged) — or, if the history is per-design, document the behaviour you chose and test it.
- Mutation (revert with Edit): make `outlineWithTemplateOverrides` replace the whole map → the A→B→A test fails.

## Allowed files
```
lib/ai/outline.ts (+ tests), lib/ai/antv/elementOverrides.ts (+ tests), lib/ai/antv/editHistory.ts (+ tests)
lib/ai/antv/additions.ts (+ tests)                                   only if it reads/writes the slot
components/ai/renderers/AntvElementChrome.tsx, AntvElementEditor.tsx, useAntvElement*.ts, useAntvIconSwap.ts,
  AntvInfographicRenderer.tsx (+ tests)
components/collabboard/editors/OutlineSuggestionsPanel.tsx (+ tests) — extract the insertion helper first (< 800 lines)
components/collabboard/editors/<new helper file>.ts (+ test)
lib/ai/validators.ts (+ tests)                                       the stored schema accepts the new field
app/api/ai/generate-outline|generate-component|convert-component/route.ts (+ tests)   only the strip
```
Forbidden: everything else, the database. Real tool calls only (never write a tool call as plain text); one test file
at a time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process
substitution, no test files outside the repo; revert mutations with your Edit tool; no git writes; no production
build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors app/api/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-273.json
```
The CTO compares failing files AND failing test names. Report: every file changed and every call site switched to the
helpers. Do not commit.

**Live (CTO):** list design A: move + red fill + circle → switch to another AntV design B: colour + arrow → back to
A (A's edits shown) → back to B (B's shown) → save → reload: the board shows the saved design with its edits; the
board's existing AI posts still render identically (signature script); then delete the test post.

## Commit message (verbatim)
```
fix(ai): each picture design keeps its own edits

Moving, colouring or adding shapes on one design and then editing
another design used to silently throw away the first design's work.
Every design now keeps its own edits, so switching back and forth loses
nothing.
```

## Final result (CTO, 2026-10-03, live)
Own tab. A = antv:list-grid-badge-card, B = antv:list-grid-candy-card-lite. A: move item 1 + fill #ff0000 + circle →
B starts clean → B: fill #0000ff + arrow → back to A: red, moved, circle (Codex F5 fixed) → back to B: blue, arrow →
save on A → reload: the board shows A's red/moved/circle; the stored outline has both entries
(badge-card 4 keys / 1 addition, candy-card-lite 1 key / 1 addition). Note: `elementOverrides` mirrors the most
recently EDITED design (B here), not the saved one — harmless (a reader without the map applies nothing because the
template differs) and as specified. Existing board AI posts: signatures identical to the pre-272 recording. Test post
deleted; no console errors. Follow-up split: per-design helpers moved to `lib/ai/antv/templateOverrides.ts`
(elementOverrides.ts 857 → 745 lines). Gate `.opencode-vitest-273.json`: failing test names identical to PATCH-272
(59/59); tsc clean. Undo across a design switch: the history resets on switch (documented and tested).
