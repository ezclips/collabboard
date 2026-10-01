# PATCH-242 — New items stay on the side you clicked; + / − never cover words; controls on frameless posts

Status: AUTHORIZED (owner, 2026-10-01: "make sure all the new function work … why do these graphs add a new
speech bubble left, then right, then left again and not just on one side? … if you have the frame removed you
don't see the editing and the other buttons, we might want to address that"; the owner delegates the design).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-241 (`1de1248e`, committed, not pushed)

## Why (CTO live audit, 2026-10-01, test posts `553029f5`, `6f93e1bd`)
1. **Sides jump.** The hub design (`lib/ai/infographic/hub.ts` ~22) puts even items right, odd items left; the
   tree mind map (`lib/ai/mindmapLayout.ts` ~106) puts the first half right, the rest left. So inserting or
   removing one item moves every later item to the other side (owner's screenshots: + on a right-hand card adds the
   new card on the LEFT; a 5th branch moves "Food" from left to right).
2. **Handles cover words.** Tree mind map handles are centred ON the node edges (`MindmapTreeRenderer` ~58-70):
   "Venue" reads "Venu", "Food" is half hidden. The + is always on the right edge, even on left-side branches
   whose leaves grow to the left. While a word's rename input is open, it covers the neighbouring handles (the
   root's + could not be clicked).
3. **Frameless posts lose their controls.** "Hide frame" (`metadata.fullView`) hides the whole top strip
   (`FreeformPadletCards` ~3646 `if (isFullView) return null;`), and with it Edit, Regen, Convert, Export, Expand
   and the post pencil. New drawings are frameless by default (PATCH-220), so they have no Edit either. Live: test
   post `6f93e1bd` after Hide frame had no Edit button (double-click still opened the editor).

## Design
### A. A stored side, so nothing moves (pure, `lib/ai/infographic/edit.ts` + layouts)
- `VisualOutlineItem` gains optional `side?: 'left' | 'right'`; `MindmapTree` branches (`children[i]`) gain the
  same optional `side`. Validators/`parseOutline` keep a valid value and drop anything else (lenient, never fails a
  stored post). Mermaid code generation ignores `side`.
- **Drawing:** `effectiveSides(...)` = each item's/branch's stored `side`, else today's default (hub: even → right,
  odd → left; tree: first `ceil(n/2)` → right, rest → left). Each side lists its items in outline order, top to
  bottom. With no `side` anywhere the geometry is IDENTICAL to today (snapshot test) — stored pictures unchanged.
- **Editing freezes sides first.** `insertItem`, `removeItem` (hub-capable outlines) and `addChild`/`removeNode`
  (tree, branch level) first write every item's/branch's CURRENT effective side into the data, then change it, so
  no other item can move. New signatures (old call shapes keep working):
  - `insertItem(outline, index, { side? })` — the new item gets `side` if given, else the side of the item
    before it (`index - 1`), else `right`.
  - `addChild(tree, [], { side })` for a branch — appended after the last branch of that side; `addChild(tree,
    [b])` adds a leaf (unchanged).
  - the forms' "Add item" / "+ Add branch" (`OutlineTextEditor`, `MindmapTreeEditor`) add on the side that has
    fewer items (tie → right), after freezing.
  - Only the hub and the tree use `side`; every other layout ignores it (a test pins it).
### B. Handles where Napkin puts them (`MindmapTreeRenderer`, `InfographicRenderer` hub, `PictureEditOverlay`)
- **Tree:** every handle sits fully OUTSIDE its node's box (centre at edge ± (radius + 3px)), so no handle overlaps
  any label (test: no handle box intersects any node text box, for a fixture with short labels "Food", "Venue").
  The **+** goes on the OUTER edge (the side the children grow toward: right for right-side nodes, left for
  left-side nodes), the **−** on the inner edge. The **root gets two +** (`data-ai-edit-add="root:left"` and
  `"root:right"`), each adding a branch on its own side.
- **Hub:** the + after an item adds directly BELOW it on the same side (`insertItem(outline, i + 1, { side: that
  item's side })`). The centre gets two + (left/right edges of the centre circle) that append on that side.
- While a rename input is open, all + / − handles are hidden (they come back on commit/cancel).
### C. Controls on frameless posts (`FreeformPadletCards`)
- When `isFullView` is true, the card shows a small floating action bar on hover (and while selected): white,
  rounded, shadow, absolutely positioned at the card's top-right OUTSIDE the picture (`-top-8 right-0`),
  `data-frameless-actions`. It holds exactly the controls the hidden strip would have shown for that post, with the
  same handlers and the same permission gates (`canUseFreeformEditButton`, not in line/graph-connect mode):
  AI post → Expand, Edit, Regen, Convert (when targets exist), Export, and the post pencil; Drawing → the post
  pencil (and whatever the strip shows for drawings today). A viewer sees nothing new.
- Reuse, do not copy: move the strip's AI action cluster into one small local component (e.g.
  `AIPostStripActions`) rendered by both the strip and the floating bar. The strip itself stays exactly as it is
  (`if (isFullView) return null;` and the other pinned strings stay; see Forbidden).
- `data-no-drag` and `onPointerDown` stopPropagation on the bar, like the strip's buttons.
- Image/Clipart "Hide frame" is out of scope (different branch); say in the report what it hides.

## Tests
- `edit.test.ts`: insert after a right-side hub item → new item right, directly below it, every other item's
  side unchanged (compare effective sides before/after); remove → no other item changes side; tree root + left /
  right adds on that side and nothing else moves; frozen inputs untouched (deep-frozen).
- Layouts: no `side` → geometry equals the current snapshot (hub, tree); with sides → items on their stored side in
  outline order; other layouts ignore `side`.
- Validators/parseOutline: valid side kept, `'up'` dropped, the post still validates.
- Renderers: tree handles never intersect a node label box; + on the outer edge for a left branch; two root +;
  handles hidden while an input is open. Hub: + after item 0 inserts at 1 with item 0's side.
- Forms: "Add item"/"+ Add branch" picks the side with fewer items.
- Card (behaviour or source test): a frameless AI post renders `data-frameless-actions` with Edit/Regen/Export for
  an editor; NOT for a viewer; a framed AI post renders no floating bar; Edit in the bar opens the same modal as the
  strip's Edit.
- **Mutations:** insert without freezing sides → the "nothing else moves" test fails; handles back on the node edge
  → the overlap test fails; the bar rendered for a viewer → the viewer test fails.

## Allowed files
```
lib/ai/outline.ts (+ test), lib/ai/validators.ts (+ test)            (optional side only)
lib/ai/infographic/** (+ tests), lib/ai/mindmapLayout.ts (+ test)
components/ai/renderers/InfographicRenderer.tsx, MindmapTreeRenderer.tsx, PictureEditOverlay.tsx (+ tests)
components/ai/editors/MindmapTreeEditor.tsx, components/collabboard/editors/OutlineTextEditor.tsx (+ tests)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the floating bar + the extracted action cluster only)
lib/infra/canvas/*.source.test.ts, components/collabboard/*.test.tsx (new tests only, or pins of this patch)
```
Forbidden: the database, `package.json`, every AI route, `lib/ai/antv/**`, `AntvInfographicRenderer.tsx`,
`CodeDiagramRenderer.tsx`, the DOMPurify profile. Existing census strings in `freeformFullViewFrame.test.tsx`,
`freeformDrawingViewWiring.source.test.ts`, `newDrawingHiddenFrame.source.test.ts`,
`containerResizeB3.characterization.test.tsx`, `freeformHideFrame.behavior.test.tsx` must keep passing UNCHANGED; if
one cannot, STOP and ask. Every new test path must be collected by `vitest.config.ts` (check; STOP if not).
Real tool calls only (never write a tool call as plain text); `timeout 600 npx vitest run …`; no git writes; no
production build; no curl of the dev server. Revert every mutation and confirm `git diff` has no mutation text.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/ai components/ai components/collabboard lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-242.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** test posts only. Hub: + on a right card adds below it on the right, nothing else moves; centre
left/right +. Tree: root left/right +, branch + adds a leaf outward, no handle covers a word. A stored older picture
looks the same. Hide frame on an AI post → hover shows Edit/Regen/Export; Edit opens the modal. Delete the test
posts.

## Commit message (verbatim)
```
fix(ai): new picture items stay on the side you clicked

Adding an item to a hub picture or a mind map put it on alternating
sides and pushed other items across. Each item now keeps its side, and
+ adds right below the item you clicked. The + and - circles sit
outside the boxes so they never cover words. Posts with the frame
hidden now show Edit, Regen and Export when you hover them.
```

## Addendum 1 (CTO, 2026-10-01): review + live result
Review: the floating bar first also hid on position-locked posts (the strip does not) → gate aligned with the strip;
a locked frameless post shows the bar (test added). Census files `freeformFullViewFrame`/`containerResizeB3.
characterization` fail exactly the same single pre-existing test as in `.opencode-vitest-241b.json`.
Live: tree mind map (test post `553029f5`) root right+, right+, left+ → new branches on the clicked side, Venue/
Agenda stayed right and Food/Travel left; no handle box overlaps a label. Hub (Show options, test post `5df940df`):
+ after "Venue" (right) → "New item" directly below it on the right, no other card moved; centre left+ → left.
Frameless AI post `6f93e1bd`: hover shows Expand/Edit/Regen/Export/pencil above the picture; Edit opens the modal.
One `generate-outline` request (new hub); none for edits. Gate `.opencode-vitest-242.json`: extra [] missing [];
tsc clean; no mutation text.
