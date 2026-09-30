# PATCH-217 — Three clear Media buttons: Image, Document, Cloud import

Status: AUTHORIZED (owner, 2026-09-30: "yes"; the owner proposed the consolidation).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-216 (`b38aa513`)
Followed by: PATCH-218 (a Recommended free-image feed on open, plus multi-image upload).

## Why (the owner, with Milanote as the model)
The Media group has four overlapping buttons:
- **Add image** (`type: 'image'`) and **Upload** (`type: 'upload'`) open the SAME `ImageEditor`.
  One starts on the "Search Pexels" tab and the other on "Upload File"
  (`CanvasClient.tsx` `case 'image'` / `case 'upload'` ~8670-8714). Both take images only.
- **PDF** (`knowledge-pdf`) is the document uploader, and it also accepts Word (.docx), .txt and .md.
  The name hides that; the owner did not know Word worked.
- **Import** (`import`) is Google Drive / OneDrive.

## Design
1. **Toolbar** (`components/collabboard/canvas/ui/canvasToolbarRegistry.tsx`, the Media group):
   - `Add image` → label **`Image`**, `type: 'image'` unchanged, with description
     `Free images or upload your own`.
   - **Remove** the `Upload` entry (`type: 'upload'`) from the toolbar. Its window is the Image
     button's "Upload your own" tab. Keep `case 'upload'` in `handleToolClick` (the map-container
     flow and other callers still use it).
   - `PDF` → label **`Document`**, the SAME type, `pinned` and `activatesInputId` (do not touch
     those; the comment above them explains why). Description:
     `PDF, Word or text — the wiki and AI can read it`. The icon may stay `FileUp`.
   - `Import` → label **`Cloud import`**, `type: 'import'` unchanged, with description
     `Google Drive or OneDrive`.
2. **Tooltips:** add an optional `description?: string` to `SidebarToolItem`
   (`CanvasSidebar.tsx`). Every place that renders a tool's `title={tool.label}` uses
   `title={tool.description ? `${tool.label} — ${tool.description}` : tool.label}`. If the More
   (overflow) menu renders tools, show the description there too only if that is a one-line change;
   otherwise the label alone.
3. **The board's right-click menu** (`FreeformCanvasBoardMenu.tsx` `FREEFORM_BOARD_TOOL_ITEMS`):
   - remove `{ label: 'New Upload', type: 'upload' }`;
   - `New Import` → `New Cloud import`;
   - `New Image` stays.
4. **Image window tabs** (`components/collabboard/editors/ImageEditor.tsx`): `Search Pexels` →
   **`Free images`**, `Upload File` → **`Upload your own`**. The tab values (`'search'` /
   `'upload'`) do NOT change.
5. **Cloud import window title** (`components/collabboard/imports/ImportsDialog.tsx`): `Import File` →
   **`Cloud import`**, in both places.
6. Do not touch `AddPadletButton.tsx` (a different, older surface).

## Tests (authorized pin updates, listed exactly)
These pins change deliberately; update only these lines:
- `components/collabboard/knowledgePdfSpatialScope.test.tsx:131`: `'PDF'` → `'Document'`.
- `components/collabboard/knowledgePdfSpatialScope.test.tsx:158`: the Media group no longer contains
  `upload`. Invert the assertion to `false`, and keep the test's intent in its name or comment.
- `components/collabboard/PdfWorkspaceChrome.test.tsx:566`: `'PDF'` → `'Document'`.
- `components/collabboard/noteCreationBoardAuthority.behavior.test.tsx:292`: this is a list of tool
  types.
  - If it lists the types the TOOLBAR renders, remove `'upload'`.
  - If it lists the types `handleToolClick` gates (the handler still has `case 'upload'`), keep it.
  - Read the test and say which it is.
- `components/collabboard/freeformCanvasBoardMenu.characterization.test.tsx:207`: remove `'upload'`
  if it mirrors `FREEFORM_BOARD_TOOL_ITEMS`.
- Any other test that fails ONLY because of these renames: STOP and list it (file:line, the
  assertion) before changing it.

New tests:
- registry:
  - the Media group's labels, in order, are `Link`, `Image`, `Document` (a direct-PDF layout only),
    `Cloud import`;
  - there is no `upload` tool;
  - `Document` keeps `pinned` and `activatesInputId`;
  - each has its description.
- `CanvasSidebar`: a tool with a description renders `title="Document — PDF, Word or text — the wiki and AI can read it"`.
- `ImageEditor`: the tabs read `Free images` / `Upload your own`, and `defaultTab="upload"` still
  opens the upload tab.
- **Mutation:** put the `Upload` entry back → the "no upload tool" test fails.

## Allowed files
```
components/collabboard/canvas/ui/canvasToolbarRegistry.tsx
components/collabboard/canvas/ui/CanvasSidebar.tsx            (the description field and its title only)
components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx  (the item list only)
components/collabboard/editors/ImageEditor.tsx                (the two tab labels only)
components/collabboard/imports/ImportsDialog.tsx              (the title only)
the tests listed above, plus new tests next to the registry, CanvasSidebar and ImageEditor
```
Forbidden: `CanvasClient.tsx`, the database, `package.json`, `next.config.ts`, `.env*`,
`AddPadletButton.tsx`, and the `pinned` / `activatesInputId` mechanics. **Do not touch the comments
inside `isBlockingEditorModalOpen`.** If a census pins anything beyond the lines listed, STOP and
ask (spec line, code at file:line, proposed resolution).

Use the Grep/Read tools, or `rg` with `timeout 30`. Every test command is
`timeout 600 npx vitest run …`. No `ls` on the repo root, no curl of the dev server. Delete temp
files (bash: `/dev/null`, never `nul`). No stash/reset/restore/checkout/clean/commit/push; no
production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/knowledgePdfSpatialScope components/collabboard/PdfWorkspaceChrome components/collabboard/noteCreationBoardAuthority components/collabboard/freeformCanvasBoardMenu components/collabboard/editors components/collabboard/imports components/collabboard/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-217.json
```
The failing FILE set must equal the 26-file baseline, and the new test files must be present.
Compact report. Do not commit.

**Live (CTO, own tab):**
- the Media group shows Link, Image, Document, Cloud import;
- hovering over Document shows the description;
- Document still opens the file dialog;
- Image opens on "Free images", with an "Upload your own" tab;
- Cloud import opens Drive/OneDrive;
- the right-click menu has no "New Upload".

## Commit message (verbatim)
```
feat(canvas): three clear Media buttons -- Image, Document, Cloud import

"Add image" and "Upload" opened the same image window on different tabs,
and "PDF" hid that it also takes Word and text files. The Media group is
now Image (free images or upload your own), Document (PDF, Word or text
the wiki and AI can read) and Cloud import (Google Drive or OneDrive),
each with a tooltip saying what it does.
```
