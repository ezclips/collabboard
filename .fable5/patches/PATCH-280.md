# PATCH-280 — Remove "Visualize…" from Note and Document posts

Status: AUTHORIZED (owner, 2026-10-05: "I want to stop 'Visualize' at the Note Post!"; 280–284 delegated to the CTO).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-279 (ef11db07).

## Why
The picture direction changed (owner, 2026-10-05): AntV becomes a no-AI library inside the drawing post, and the AI post
becomes a fully AI-drawn picture (PATCH-283/284). The "Visualize…" right-click item (PATCH-235) opens the old AI
generator pre-filled from a Note/Document. The owner wants it gone. Remove the whole feature, not only the menu item,
so no dead code is left behind.

## What to remove (all of PATCH-235's Visualize path)
1. `components/collabboard/menus/NotePostContextMenu.tsx`: the `onVisualize` prop, its comment and the "Visualize…" item
   (drop the `Sparkles` import if it becomes unused).
2. `components/collabboard/canvas/ui/FreeformPadletCards.tsx`: the `onVisualizePost` prop + comment, the `onVisualize={…}`
   block passed to `NotePostContextMenu`, and the `visualizeSourceText` / `isDocumentPost` imports if they become unused.
3. `app/dashboard/canvas/[id]/CanvasClient.tsx`:
   - the `visualizeRequest` state, `visualizeLinkRef`, `handleVisualizePost`, the clearing effect and the "join source →
     new picture" effect (incl. its toast);
   - `handleSaveAIComponent`: pass `saveAIComponent` directly as `saveAIComponent={saveAIComponent}` (or keep a guarded
     equivalent if one already wraps it — do not drop the board-edit guard if there is one);
   - the props `initialVisualize`, `visualizePrompt`, `onVisualizePost`;
   - the imports `findVisualizeSpot`, `visualizeSourceText`, and any import that becomes unused (e.g.
     `createFreeformGraphRepo` only if nothing else uses it).
4. `components/collabboard/canvas/ui/CanvasModals.tsx`: the `initialVisualize` and `visualizePrompt` props;
   `initialPrompt={padletToEdit?.metadata?.aiPrompt || ''}`.
5. `components/collabboard/editors/AIComponentEditor.tsx`: the `initialVisualize` prop, `visualizeAutoRanRef`, the
   "opens straight into Diagram + Show options" block, the auto-run effect, and `initialVisualize` in the dependency list.
6. `hooks/canvas/usePadletSave.ts`: the optional `placement` parameter of `saveAIComponent` (Visualize was its only
   caller); new AI posts land at `newPostPosition` as before PATCH-235.
7. Delete: `lib/ai/visualizePlacement.ts` (+ test), `lib/ai/visualizeSource.ts` (+ test) **only if** no other file imports
   them; `lib/infra/canvas/visualizeWiring.source.test.ts`; `components/collabboard/editors/AIComponentEditor.visualize.test.tsx`;
   `components/collabboard/NotePostContextMenu.visualize.test.tsx`;
   `components/collabboard/canvas/hooks/usePadletSave.visualizePlacement.test.tsx`.
8. Nothing else changes. The AI generator from the toolbar works exactly as before.

## Tests
- New `lib/infra/canvas/visualizeRemoved.source.test.ts` (source-level pins, like the deleted census test):
  - no file under `app/`, `components/`, `hooks/`, `lib/` (excluding tests and `excalidraw_fork`) contains
    `Visualize…`, `onVisualize`, `initialVisualize`, `visualizePrompt` or `findVisualizeSpot`;
  - `NotePostContextMenu` still renders "Edit Post" (render it, as the deleted test did) and has no "Visualize" item.
- Existing tests that referenced these props are updated, not deleted, unless listed in step 7.
- Mutation: put the "Visualize…" string back into `NotePostContextMenu.tsx` → the new test fails; revert with Edit.

## Allowed files
Those named above, their existing tests, and the new test. Forbidden: everything else, the database.
- Make real tool calls only.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep or head.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server.
- Put `timeout` on every long command.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard hooks/canvas lib/ai lib/infra/canvas --reporter=dot
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-280.json
```
Do not commit.

**Live (CTO):** right-click a Note and a Document post on board af02972f: no "Visualize…" item, the other items work;
the toolbar AI generator still opens and generates.

## Commit message (verbatim)
```
feat(ai): remove "Visualize…" from note and document posts

The right-click "Visualize…" item opened the old AI picture generator
pre-filled from a note. Pictures are moving to an AntV library in the
drawing post and a fully AI-drawn picture post, so the item and all of
its plumbing are removed.
```

## Final result (CTO, 2026-10-05, live)
- Board af02972f, own tab, write-locked: right-click on 12 posts (Notes, Documents, images, link) — no "Visualize…"
  anywhere; "Edit Post", Duplicate, Add to Library etc. unchanged. Toolbar AI generator opens.
- 769 lines removed, 5 added (8 files deleted). tsc clean.
- Gate `.opencode-vitest-280.json`: baseline failures identical; 4 extra files were load timeouts — each passes alone
  (architecture 25/25, patch248 13/13, patch250 1/1, context-menu characterization 34/34).
- Implementer disclosed one rule deviation (vitest piped into `tail` once).
