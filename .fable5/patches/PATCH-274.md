# PATCH-274 — Edits stay on the right item when items are added, removed or reordered

Status: AUTHORIZED (owner delegates to the CTO as PM; Codex REVIEW-266 finding F4 (HIGH), patch 7 second half).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-273 (9e497e48). Read `.fable5/reviews/REVIEW-266-visualisation-stability.md` F4 and patch 7
("Add stable item IDs, versioned role mapping … Migrate old positional keys conservatively; until safe, retain
incompatible edits as recoverable data instead of silently retargeting them").

## Why
Element override keys are POSITIONAL: `type@<data-indexes>` (e.g. `shape@1#0`, `item-label@0,1` on hierarchy
designs), see `elementKey` / key lookup in `lib/ai/antv/elementOverrides.ts` (~L302). Structural edits (Edit text
panel add/remove/reorder, AntV's +/− item buttons via `applyAntvChange` `lib/ai/antv/mapOutline.ts` ~L633, the native
tree edits) shift item positions, but the keys stay. Codex F4 (pure reproduction): recolour/hide item B at index 1,
remove item A at index 0 → the override still targets index 1, which is now item C. B loses its edit, C silently
gains it — in every design's entry (PATCH-273 map).

## Design
### A. Stable item ids (`lib/ai/outline.ts`)
- `VisualOutlineItem` gains `id?: string` (`/^[a-z0-9]{6,12}$/`). `withItemIds(outline)` gives every item without a
  valid id a new random id (pure apart from randomness; existing ids kept; duplicate ids → later duplicates get new
  ids). Children (`VisualOutlineChild`) get no ids in this patch.
- The MODEL path of `parseOutline` drops ids (the model never sets them); the STORED path (PATCH-272) keeps valid ids.
- Ids are assigned when an outline enters editing: wherever the generator / Edit window receives an outline (fresh
  generation, stored post loaded for editing, regeneration) — call `withItemIds` there (wiring only in the two big
  files). Saved posts then carry ids. Legacy posts without ids get ids on first load for editing; their positional keys
  are valid for the CURRENT order, so nothing is lost.
- Every path that adds an item (Edit text "add item", AntV + button, native tree add branch, Add-sub-point if it creates
  items) must produce an item WITHOUT an id or with a new id; `withItemIds` runs on the result.
### B. Remap on structural change (new `lib/ai/antv/remapOverrides.ts`, + test)
- `remapOverridesForItems(prev: VisualOutline, next: VisualOutline): VisualOutline` — if the sequence of item ids
  differs between `prev` and `next`, rewrite EVERY template entry in `elementOverridesByTemplate` (and the mirrored
  `elementOverrides`):
  - a key whose item-level index (the first index for flat designs; the index AFTER the root for hierarchy designs —
    reuse the existing hierarchy/root-offset knowledge from `mapOutline.ts`, do not invent a second mapping) points to
    item id X → rewritten to X's new index (child indexes after it unchanged);
  - X no longer exists → the override is removed from the live entry and kept in that entry's
    `orphaned?: Record<string, ElementOverride>` (max 50, sanitized, never applied) — "recoverable data instead of
    silently retargeting";
  - keys without an item index (`type#n` ordinals, e.g. the title) are left unchanged;
  - additions are untouched (they are not tied to items).
  Pure, never mutates; identity when the id sequence is unchanged.
- Apply it at the single places where a UI-returned outline becomes the source: `applyEditedOutline` in
  `AIComponentEditor.tsx` (after `withoutExampleValues`, PATCH-268) and the Edit window's equivalent in
  `AIContentEditModal.tsx` — wiring only. Both files are > 800 lines.
- The element editor's own history entries (PATCH-270) store keys; when a structural change remaps keys, clear the
  editor history for that design (document it) rather than replaying stale keys.

## Tests
- `outline` tests: `withItemIds` assigns, keeps, de-duplicates; model path drops ids; stored path keeps them.
- `remapOverrides.test.ts`: Codex's case (colour B@1, remove A@0 → B's colour now at index 0, C has none); insert
  before B → B's key moves to index 2; reorder (swap 1 and 2); remove B → B's override goes to `orphaned`, C gets
  nothing; hierarchy design keys (`@0,i`) remap on the item index after the root; ordinal keys untouched; every
  template entry and the mirror are remapped; identity when nothing changed.
- Through the real generator: colour item B (element editor) → Edit text: remove item A → the preview shows B's
  colour on B (DOM fill on B's shape) and none on C; AntV + button inserting before B → B keeps its colour.
- Save + reload keeps ids and the remapped keys.
- Mutation (revert with Edit): skip the remap in `applyEditedOutline` → Codex's case through the generator fails.

## Allowed files
```
lib/ai/outline.ts (+ tests)
lib/ai/antv/remapOverrides.ts (+ test)                       new
lib/ai/antv/templateOverrides.ts, lib/ai/antv/elementOverrides.ts (+ tests)   `orphaned` in the type + sanitizer
lib/ai/antv/mapOutline.ts (+ tests)                          only to export the existing hierarchy index helper
components/collabboard/editors/AIComponentEditor.tsx        wiring only
components/ai/editors/AIContentEditModal.tsx                wiring only
components/ai/renderers/AntvElementEditor.tsx (+ tests)     only the history reset on a structural remap
new test files next to these
```
Forbidden: everything else, the database. Real tool calls only (never write a tool call as plain text); one test file
at a time with `--reporter=dot`, never pipe vitest into grep/head, NEVER compare results with diff/process
substitution, no test files outside the repo; revert mutations with your Edit tool; no git writes; no production
build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard/editors app/api/ai --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-274.json
```
The CTO compares failing files AND failing test names. Report: every file changed and every place ids are assigned.
Do not commit.

**Live (CTO):** list design: colour item 2's card red → Edit text: remove item 1 → the red card is still the same item
(by label), the next item not red; AntV + button / Edit text add item before it → still on the same item; mind map
(AntV hierarchy) the same; save + reload; existing board AI posts render identically (signature script); delete the
test post.

## Commit message (verbatim)
```
fix(ai): picture edits stay on the right item when items change

Colours, moves and hidden parts were tied to an item's position, so
removing or adding an item moved those edits onto a different item.
Every item now has a stable id and its edits follow it; edits of a
removed item are kept aside instead of landing on another one.
```

## Final result (CTO, 2026-10-03, live)
Own tab, list-grid-badge-card: Travel's card filled #ff0000 → Edit text: remove Venue → red stays on Travel (Codex
F4 fixed; the next item is not red) → switch to the AntV mind map and remove Food there → back to the list: red still
on Travel (now index 0 — the list's own entry was remapped by a structural edit made on another design) → save →
reload: board shows Travel red, every item carries an id. Existing board AI posts: signatures identical to the
pre-272 recording. Test post deleted; no console errors. Gate `.opencode-vitest-274.json`: failing test names
identical to PATCH-273 (59/59); tsc clean.
Not exercised live: AntV's own + button (hidden, 0x0, until its item is hovered — covered by the unit tests); a
colour on a mind-map node box (my script selected the label).
Found, not caused by this patch (→ follow-up): when a selected element sits at the edge of a zoomed-in preview, the
selection bar (Colour/Undo/…) is drawn outside the visible preview area and cannot be clicked — the bar is clamped
to the picture layer, not to the visible stage (Codex: "the horizontal clamp alone does not prove vertical
containment").
