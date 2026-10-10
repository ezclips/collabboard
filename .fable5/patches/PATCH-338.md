# PATCH-338 — "AI/Wiki Documents" (PDF, Word, Text) on the Scheduler board

## Why
Owner, 2026-10-10 (screenshot of the Scheduler's left toolbar): add the PDF
button to upload PDF, Word and the other files we use for AI, so they can be
put into a time slot like the other posts. Earlier the same day a Google Drive
"Add as a readable document" on the Scheduler was refused ("Documents can be
added on Freeform canvases only").

## What exists (read before coding)
- Toolbar entry `knowledge-pdf` ("AI/Wiki Documents", PDF, Word, Text) in
  `canvasToolbarRegistry.tsx`, gated by `isDirectPdfCanvasLayout(layout)` which
  allows `'freeform'` only. The uploader input is mounted by `CanvasSidebar`.
- One placement authority: `handleKnowledgePdfUploaded` (CanvasClient). It
  refuses when `!canPlaceDirectPdf`, then asks
  `requestPlacementIfRequired({ kind: 'file', title, metadata: { knowledgeDocumentId, … } })`.
- On a Scheduler board that request already starts the Scheduler placement
  flow (`onSchedulerPlacementStart`: "Drag onto a time slot to place your
  post"), the same one a Note uses; dropping on a slot creates an entry with
  the post inside, dropping on an entry puts the post inside it.
- Inside an entry the popover renders child posts through
  `RowColumnContainerCard` → `PostCardContent`, which already renders
  `KnowledgePdfCanvasSurface` for a post with a Knowledge placement.
- `importAsKnowledgeDocument` (Drive/OneDrive "Add as a readable document")
  uses the same uploader and the same `canPlaceDirectPdf` gate.
- The registry comment already names this direction: structured layouts
  "reference a Knowledge PDF from an ordinary Note/Post/Container rather than
  hold a raw PDF object" — on the Scheduler the document post always lives
  inside an entry, never loose on the board.

## Design
1. One predicate decides where the documents tool exists, used by BOTH the
   toolbar and the placement handler (no second switch): Freeform (as today)
   and Scheduler. Keep the existing name or rename it to say what it means now
   (e.g. `canAddKnowledgeDocuments`); keep Drawing excluded and its comment.
   Every other layout stays without the tool.
2. On the Scheduler the tool behaves like Note: pick the file → it uploads →
   "Drag onto a time slot to place your post" → drop on a slot (new entry with
   the document inside) or on an entry (document added inside it). If an entry
   is already targeted (context menu "Add post"), the document goes straight
   into it, the same way a Note does. Nothing is ever placed loose.
3. The document post inside an entry: shows the file card
   (`KnowledgePdfCanvasSurface` — name, page-one preview / status) in the
   entry popover; clicking it opens the same document reader as on Freeform;
   the entry's "N items" badge counts it.
4. Drive/OneDrive "Add as a readable document" works on the Scheduler through
   the same path (it shares the gate).
5. If the user abandons the drag, the uploaded document is not lost: it stays
   in the board's document library and can be placed later through the
   existing "Use existing PDF" chooser (unchanged behaviour; make sure the
   uploader does not show an error for "placement taken by the layout").
6. The duplicate guard (`alreadyPlaced` by document id) stays.

## Tests
- Registry: the `knowledge-pdf` tool is present for `freeform` and
  `scheduler`, absent for wall/columns/grid/timeline/kanban/gantt/map/drawing.
- Placement: on a Scheduler board `handleKnowledgePdfUploaded` hands a
  `kind: 'file'` draft with `knowledgeDocumentId` to the placement flow and
  inserts nothing itself; on Freeform unchanged.
- Update the existing scope tests that pin "Freeform only"
  (`knowledgePdfSpatialScope.test.tsx` and any other) deliberately, and say so.

## Verification
Focused tests, full vitest gate, `npx tsc --noEmit`. I verify live on a
throwaway Scheduler board: the button is in the toolbar; upload a small PDF;
drag it onto a time slot; the entry shows "1 item"; the popover shows the
document card; opening it opens the reader; reload keeps it. I delete my test
board AND my test document afterwards.

## Allowed files
components/collabboard/canvas/ui/canvasToolbarRegistry.tsx,
components/collabboard/canvas/ui/CanvasSidebar.tsx (only if the gate is read
there), app/dashboard/canvas/[id]/CanvasClient.tsx (the gate in
`handleKnowledgePdfUploaded` / `importAsKnowledgeDocument` and wherever
`canPlaceDirectPdf` is derived), components/collabboard/KnowledgePdfUploader.tsx
(only for point 5), and tests. No SQL, no git.
