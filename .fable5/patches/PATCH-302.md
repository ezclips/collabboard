# PATCH-302 — The Research template: a PDF drop zone in the middle, and Board AI opens with it

Status: AUTHORIZED (owner, 2026-10-06: "we need on first place in freeform templated a resarch templated my in the
mittle of it upload you pdf here or upload yout resarch here and have board Ai open or so").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-301 (template `summary` / `contents`, the gallery, `?template=` auto-apply).

## Facts (CTO)
1. A PDF reaches a Freeform board through `KnowledgePdfUploader` (`components/collabboard/KnowledgePdfUploader.tsx`).
   Its handle has `openPicker()` and `uploadFile(file)` (L109–118); both go through the same authority gate, size
   check, upload, placement and polling. On the board it is mounted by `CanvasSidebar.tsx` L447 with
   `ref={knowledgeUploaderRef}` and `inputId={KNOWLEDGE_PDF_TOOLBAR_INPUT_ID}` — ONLY for a user allowed to add PDFs
   (`canAddBoardContentPdf`), i.e. editors on Freeform. Placement: `handleKnowledgePdfUploaded` in `CanvasClient.tsx`
   (normal new-post position).
2. Dropping a file from the computer onto the board does NOT upload it today (the canvas `onDrop` only handles posts
   and clips).
3. Board AI opens through `toggleBoardAiChat` in `CanvasClient.tsx` (L2274; sets `isBoardAiChatOpen` and claims the
   dock). `BoardTemplatePicker` calls `onApplied?.()` after a successful apply (L102); CanvasClient passes
   `onApplied={() => { void fetchData(); }}`.
4. Template post kinds: column, section, note, todo, table, image, clipart (`schema.ts`); rows in `rows.ts`
   (a note → `type: 'text'`, `content: html`). `FreeformPadletCards.tsx` (6312 lines) renders freeform posts.
5. Assets are ready (CTO) in `public/templates/freeform/research/` with `credits.json`: `library-reading-room.jpg`,
   `highlighting.jpg`, `taking-notes.jpg` (Pexels), `magnifier.svg`, `light-bulb.svg`, `books.svg`,
   `bookmark-tabs.svg`, `speech-balloon.svg`, `inbox-tray.svg` (Iconify Fluent Emoji, MIT). The CTO adds
   `preview.jpg` after the live apply.

## Design
1. **New template post kind `upload`** (`schema.ts`): `{ kind: 'upload', title, html, x, y, width, height }` — allowed
   only in freeform templates, only at root level (no `parent`), at most one per template; schema errors otherwise.
   `rows.ts`: → `type: 'text'`, `content: html` (the instructions, so any other renderer still shows readable text),
   `metadata: { ...placement, uploadDropZone: true, startExpanded: true }`.
2. **Template fields:** optional `openBoardAiAfterApply: boolean` on `boardTemplateSchema`.
3. **Upload bridge — `lib/collabboard/boardUploadBridge.ts` (new, browser-only, no React):**
   `registerBoardPdfUploader(handle | null)`, `isBoardPdfUploadAvailable()`, `openBoardPdfPicker()`,
   `uploadBoardPdfs(files: File[]) → { accepted: number; rejected: number }` (PDF = `application/pdf` or `.pdf`;
   each accepted file → `handle.uploadFile(file)`). Register in `CanvasSidebar.tsx` where the uploader is mounted
   (a ref callback that forwards to `knowledgeUploaderRef` AND registers; unregister on unmount) — net ≤ +6 there.
4. **`components/collabboard/canvas/ui/ResearchDropZone.tsx` (new, ≤ 160 lines):** fills its card. Dashed 2 px
   `#93c5fd` border, `#eff6ff` background, rounded; centred: `inbox-tray.svg` (56 px), title "Upload your research"
   (from the post title), text "Drop a PDF here or choose a file. It lands on this board, and Board AI can read it with
   you.", button "Choose a PDF" (blue). Drag over → border `#2563eb`, background `#dbeafe`. Drop → `uploadBoardPdfs`;
   if any non-PDF was dropped: `toast.error('Only PDF files can be added here.')`; stop the drop from reaching the
   canvas. When `isBoardPdfUploadAvailable()` is false (viewer, other layout): no button, text "PDFs added by the board's
   editors appear here." `data-research-drop-zone`.
   `FreeformPadletCards.tsx`: a post with `metadata.uploadDropZone === true` renders `ResearchDropZone` as its body
   instead of the note body — one branch, net ≤ +4 lines. Moving, resizing and deleting the card work as for any note.
5. **Board AI opens after apply:** `BoardTemplatePicker` calls `onApplied?.(template)`; `CanvasClient.tsx` mount
   becomes `onApplied={(t) => { void fetchData(); if (t?.openBoardAiAfterApply && !isBoardAiChatOpen) toggleBoardAiChat(); }}`
   on the existing line (net 0; keep it one line). Works for both the manual Apply and the `?template=` auto-apply.
6. **The template — `lib/collabboard/templates/freeform/research.ts`**, registered FIRST in the freeform group:
   ```
   id 'research', name 'Research', layout 'freeform', previewUrl '/templates/freeform/research/preview.jpg',
   openBoardAiAfterApply true,
   summary 'Upload a PDF and explore it with Board AI.',
   contents ['A drop zone for your PDFs in the middle', 'Research question and key findings',
             'Sources table and open questions', 'Board AI opens with the board']
   ```
   Posts (all paths `/templates/freeform/research/…`):
   - column `question` "Your question" x 60 y 60 w 360 h 820 topStrip `#6366f1`, children:
     clipart "Question" `magnifier.svg` bg `#c7d2fe`;
     note "Research question" html `<p><strong>Research question</strong></p><p>What do you want to find out? Write it
     as one clear question.</p><p><em>Example: How does sleep affect how well students remember what they
     learn?</em></p>`;
     note "Why it matters" html `<p><strong>Why it matters</strong></p><ul><li>Who is affected?</li><li>What will you do
     with the answer?</li><li>What do you already know?</li></ul>`;
     image "Where the sources are" `library-reading-room.jpg`.
   - image "Read, mark, collect" `highlighting.jpg` x 470 y 60 w 560 h 220.
   - **upload** "Upload your research" x 470 y 300 w 560 h 340, html `<p><strong>Upload your research</strong></p><p>Drop
     a PDF here or choose a file. It lands on this board, and Board AI can read it with you.</p>`.
   - note "Ask Board AI" x 470 y 670 w 560 h 210 html `<p><strong>Ask Board AI</strong> — it opens on the right.</p><ul>
     <li>“Summarise this PDF in five points.”</li><li>“What evidence answers my question?”</li><li>“Which sources
     does it cite?”</li><li>“Find quotes about …, with page numbers.”</li></ul>`.
   - column `findings` "Findings" x 1080 y 60 w 360 h 820 topStrip `#10b981`, children:
     clipart "Findings" `light-bulb.svg` bg `#bbf7d0`;
     todo "Key findings" tasks "Finding 1 — note the page", "Finding 2 — note the page", "Finding 3 — note the page"
     (not done);
     note "Quotes and evidence" html `<p><strong>Quotes and evidence</strong></p><blockquote>“Paste a quote here.” —
     Author, p. 12</blockquote>`;
     clipart "Open questions" `bookmark-tabs.svg` bg `#fde68a`;
     todo "Open questions" tasks "What is still unclear?", "What should I read next?" (not done).
   - table "Sources" x 1490 y 60 w 440 h 220 rows `[['Title','Author','Year','Pages'],['Your first PDF','','',''],
     ['','','',''],['','','','']]`.
   - image "Taking notes" `taking-notes.jpg` x 1490 y 310 w 440 h 294.
   - clipart "Reading list" `books.svg` bg `#fecaca` x 1490 y 640.
   - clipart "Ask Board AI" `speech-balloon.svg` bg `#bfdbfe` x 1700 y 640.
   If the schema rejects a value above (sizes, missing x/y for clipart), adjust minimally and report it.

## Tests
- Schema: `upload` accepted at freeform root; rejected in another layout, with a parent, and twice.
- Rows: `upload` → `type 'text'`, html content, `uploadDropZone: true`, `startExpanded: true`, manual size.
- Registry: `research` is the FIRST freeform template; every asset path it references exists under `public/`
  (read the file system in the test); `credits.json` lists every asset file.
- Bridge: no handle → unavailable, upload rejects; PDFs forwarded, non-PDFs counted as rejected; unregister.
- `ResearchDropZone`: button calls `openBoardPdfPicker`; a drop with one PDF and one PNG → one upload + the error toast;
  unavailable → no button and the viewer text; drop does not propagate.
- `FreeformPadletCards`: a post with `uploadDropZone` renders `[data-research-drop-zone]` (source or render test).
- Picker: `onApplied` receives the template (manual and auto-apply).
- CanvasClient source test: the mount opens Board AI when `openBoardAiAfterApply`.
- Mutation: forward non-PDF files in the bridge → a test fails; revert with the Edit tool.

## Allowed files
```
lib/domain/canvas/boardTemplates/schema.ts, rows.ts (+ tests)
lib/collabboard/templates/freeform/research.ts (new), lib/collabboard/templates/registry.ts (+ tests)
lib/collabboard/boardUploadBridge.ts (new, + test)
components/collabboard/canvas/ui/ResearchDropZone.tsx (new, + test)
components/collabboard/canvas/ui/FreeformPadletCards.tsx            one branch, net <= +4
components/collabboard/canvas/ui/CanvasSidebar.tsx                  register the uploader, net <= +6
components/collabboard/templates/BoardTemplatePicker.tsx (+ tests)
app/dashboard/canvas/[id]/CanvasClient.tsx                          the onApplied line only, net 0
new test files next to these; vitest.config.ts include lines only if a new test would not run
```
Forbidden: everything else, `public/` (the CTO owns the assets), the database.
- Make real tool calls only. Do not use shell listing commands (ls/find/dir) — use your read/glob/grep tools.
- Run one test file at a time with `--reporter=dot`. Never pipe vitest into grep, head or tail.
- Never compare results with diff or process substitution.
- Revert mutations with your Edit tool.
- No git writes, no production build, no curl of the dev server, no browser. Do not read `.env` files.
- Put `timeout` on every long command.
- Never `cd` into another directory.
- Mark anything you could not verify as "not verified".

## Verification
```
timeout 600 npx tsc --noEmit
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-302.json
```
Do not commit.

**Live (CTO):** create a Freeform board from "Research" on the New board page → it opens filled, Board AI open; the drop
zone sits in the middle; "Choose a PDF" opens the file picker; dropping a small PDF places it on the board and it
becomes readable; dropping a PNG shows the error; images load; preview.jpg made; test board and PDF deleted.

## Commit message (verbatim)
```
feat(board): a Research template with a PDF drop zone

The first freeform template is now Research: drop a PDF into the
middle of the board, note your question, findings and sources, and
Board AI opens alongside so you can ask about what you uploaded.
```

## Addendum 1 (CTO live, 2026-10-06)
Live (kit, own tab, board deleted): "Research" is the FIRST freeform template in the gallery; a board created from it
opens with 18/18 inserts, Board AI OPEN, 9/9 template images loaded, the drop zone rendered; a dropped PNG shows "Only
PDF files can be added here." **Defects:**
1. **The template is not in view.** The freeform view opens at 80 % with the template in the bottom-right corner
   (the "Your question" column starts at x 1065, y 517 of a 1920×889 window) and the Board AI panel (right, ~420 px)
   covers half of the drop zone — "Choose a PDF" sits under the panel, so the live click never opened a file chooser.
   Every freeform template has the same problem; Research makes it critical.
   **Fix:** new `lib/collabboard/templates/revealAppliedTemplate.ts` (browser-only): after a SUCCESSFUL apply on a
   freeform board, wait (poll ≤ 5 s, every 100 ms) until the template's posts are rendered, then scroll the freeform
   scroll container (the nearest scrollable ancestor of the posts) so that the focus target is centred in the
   VISIBLE canvas area — the area left of the Board AI panel when `[data-board-ai-chat]` is visible. Focus target =
   `[data-research-drop-zone]`'s card when present, else the union rectangle of all `[data-padlet-id]` cards; if that
   rectangle is larger than the visible area, align its top-left 40 px inside the visible area instead. Smooth scroll
   unless `prefers-reduced-motion`. `BoardTemplatePicker` calls it after `onApplied` (manual and auto-apply), for
   layout `freeform` only. No change to zoom.
   Tests: the focus target choice (drop zone vs union), centring maths with and without the panel, the
   too-large case, the 5 s give-up (no throw), not called for non-freeform.
2. **`TemplateGalleryModal.test.tsx`** hard-codes the counts 18 / 8; derive them from `BOARD_TEMPLATE_GROUPS` instead
   (allowed now, that test file only).
3. Keep the `PENDING_PREVIEWS` exception for now; the CTO adds `preview.jpg` and Addendum 2 removes it.
Allowed: `revealAppliedTemplate.ts` (new, + test), `BoardTemplatePicker.tsx` (+ tests),
`components/collabboard/create/TemplateGalleryModal.test.tsx`. Same rules; never pipe vitest; run touched files + tsc
only.

## Addendum 2 (CTO live, 2026-10-06, after Addendum 1)
Live (kit, own tab, boards deleted): after apply the view now centres the drop zone left of the Board AI panel (zone at
x 536–963 of 1920, fully in view); 18/18 inserts; Board AI open; images 9/9; PNG drop → the error toast. The CTO made
`public/templates/freeform/research/preview.jpg` (720×345) from the live board.
**Defects:**
1. **"Choose a PDF" does nothing.** Live event trace on the button: `pointerdown`, `mousedown` — then NO `pointerup`
   and NO `click`: the freeform card's drag handling takes the pointer on press, so the button's `onClick` never runs
   (clicking the toolbar input directly does open the chooser, so the uploader is fine). `FreeformPadletCards.tsx`
   keeps interactive controls out of card dragging with `data-no-drag="true"` (e.g. L524–575, L1661).
   **Fix (`ResearchDropZone.tsx`):** `data-no-drag="true"` on the button (and stop `pointerdown`/`mousedown`
   propagation on it if the attribute alone is not enough — check the card's pointer handler and say which it needs).
   Test: the button carries `data-no-drag="true"`; a pointerdown on it does not reach a parent listener if you add the
   stopPropagation.
2. **Remove the `PENDING_PREVIEWS` exception** in `registry.test.ts` — the preview now exists.
3. **Sources table:** only "Title, Author, Year" fit in 440 px ("Pages" is cut off). Make it three columns
   `['Title','Author','Year']` (rows `['Your first PDF','',''], ['','',''], ['','','']`) and update its tests.
Allowed: `ResearchDropZone.tsx` (+ test), `lib/collabboard/templates/registry.test.ts`,
`lib/collabboard/templates/freeform/research.ts` (+ test). Same rules; touched tests + tsc only.

## Final result (CTO, 2026-10-06, live after Addenda 1–2)
Gate `.opencode-vitest-302.json` (run by the CTO): 26 failing files, identical by name to 301c; tsc clean. Live (kit,
own tab; every test board and Knowledge document deleted, 200): "Research" is the first freeform template; a board
created from it on the New board page opens with 18/18 inserts, Board AI open, 9/9 images, and the view centred on
the drop zone left of the Board AI panel; a dropped PNG → "Only PDF files can be added here."; "Choose a PDF" opens the
file chooser and the chosen PDF uploads (knowledge POST 201) and appears on the board; DROPPING a PDF does the same;
no request to an outside host. The CTO added `preview.jpg` and its credit line. Line counts: FreeformPadletCards +3,
CanvasSidebar +6, CanvasClient 0. `vitest.config.ts` now runs `components/collabboard/canvas/ui` tests (no new failures).
