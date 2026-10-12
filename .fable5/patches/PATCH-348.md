# PATCH-348 — Library tabs (no "All") and no duplicate page-notes list

## Why
Owner, 2026-10-12, with two screenshots of the PDF reader:
1. Under the PDF, "Notes on this page · 2" lists the same Notes the Library
   panel shows beside it — "do we need both?"
2. The Library's chips `All 4 · Notes 2 · Images 0 · Highlights 2` with every
   section shown at once — "Can we turn these into buttons and only the content
   of the button is showing. So Notes only shows Notes and Images only images."

The chips already filter (`PdfWorkspaceLibraryPanel.tsx`, `filter` state,
default `'all'`), but with "All" pre-selected they read as labels.

PM decisions:
- Drop "All". Three tabs, **Notes · Images · Highlights** with counts; default
  **Notes**. Only the selected tab's content is shown.
- "Notes on this page" is hidden ONLY while the Library tab is open beside the
  document (it duplicates it there). With the panel closed or on AI it stays —
  it is then the only place those Notes are visible, and on a long PDF it is
  the page-local list.

## Design

### 1. `components/collabboard/PdfWorkspaceLibraryPanel.tsx`
- `PdfWorkspaceLibraryFilter` becomes `'notes' | 'images' | 'highlights'`;
  remove the `'all'` entry and the `setFilter('all')` path (~L351 — read what it
  does first; if it is an "empty state → show all" escape, replace it with the
  per-tab empty state below). Default `'notes'`.
- The chips become a tab row: `role="tablist"`, each `role="tab"` with
  `aria-selected`; keep the existing chip look (pill buttons, the selected one
  `bg-blue-600 text-white`, others `bg-gray-100 text-gray-600`) and the counts
  ("Notes 2").
- Render ONLY the selected section, without its uppercase heading
  ("NOTES"/"IMAGES"/"HIGHLIGHTS" at ~L360/381/433 go — the tab names it).
- Per-tab empty state in plain words: "No notes from this PDF yet." / the
  existing images text ("No PDF-derived images for this PDF yet.") / "No
  highlights in this PDF yet."
- Images are still loaded the way they are today (do not change when or how
  the images fetch runs) — only what is displayed changes.

### 2. "Notes on this page" (`KnowledgeDocumentDetails.tsx`, `UsedInNotes
scope="page"` ~L1779)
- New optional prop `hidePageNotes?: boolean` (default false). When true, the
  page-scoped `UsedInNotes` list under the toolbar is not rendered.
- `KnowledgeSourceReaderDrawer.tsx` passes
  `hidePageNotes={sidePanelRightPanel === 'library'}` (only where the Library
  panel is beside the document). Do not change anything else in either file;
  `KnowledgeDocumentDetails.tsx` (2,010 lines) must not grow by more than the
  prop.

## Tests
- Library panel: no "All" tab; default Notes shows only notes; Images tab shows
  only images; Highlights only highlights; counts unchanged; aria-selected;
  empty states per tab; no uppercase section headings.
- Details: `hidePageNotes` hides the page list; default still shows it.
- Reader drawer: Library open → no `data-knowledge-used-in-notes="page"`;
  AI open or panel closed → it is shown.
- Update existing tests that relied on `'all'`; keep what they prove.

## Verification
tsc, focused tests, full gate. Live (PM) on the owner's Audi PDF: Library opens
on Notes (2 notes, no headings), Images shows the empty text, Highlights shows
2; "Notes on this page" absent with Library open, present with AI open and
with the panel closed.

## Allowed files
`components/collabboard/PdfWorkspaceLibraryPanel.tsx` (+ its tests),
`components/collabboard/KnowledgeDocumentDetails.tsx` (the prop only, + its
tests), `components/collabboard/KnowledgeSourceReaderDrawer.tsx` (one prop, +
its tests). No SQL, no git.
