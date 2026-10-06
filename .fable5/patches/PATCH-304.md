# PATCH-304 — Research template: room for Board AI, and say what the board can do

Status: AUTHORIZED (owner, 2026-10-06, screenshot of the Research preview with the right-hand column crossed out:
"Place in the red x the Board AI panel. You are not mentioning the Board Wiki and the function like heptabase or
scrintal does").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Facts (CTO)
- `lib/collabboard/templates/freeform/research.ts` has a fourth column of free posts at x=1490 (Sources table, Taking
  notes photo, Reading list clipart, Ask Board AI clipart). Board AI opens on the right and covers exactly that strip,
  so those posts sit under the panel. The owner wants that space to be Board AI's.
- The board never says what makes it a research board. These functions exist today and are the Heptabase/Scrintal
  workflow (checked in code):
  - a PDF card opens its pages in a reader beside the board;
  - selected text → **Save as Note** (`KnowledgeDocumentDetails.tsx`), a Note linked back to its page;
  - a selected area of a page → **Create Note from area**;
  - the reader's **Library** lists the Notes, images and highlights of that PDF;
  - Board AI answers with page citations; each answer has **Save as Note** and **Save to wiki**
    (`BoardAiChatDrawer.tsx`);
  - the **Board Wiki** keeps pages that list their sources.
- The UI must describe the functions, never name other products.

## Design (`research.ts`, its test, `credits.json`)
1. Remove the four posts at x=1490/1700 (`Sources` table, `Taking notes`, `Reading list`, the `Ask Board AI` clipart).
2. Move the `Sources` table (same rows, three columns, no x/y/width/height) into the `findings` column as its LAST
   child, `parent: 'findings'`.
3. Both columns: `height: 1100` (was 820). Everything else on them unchanged.
4. Middle, under the upload zone (x 470, width 560, unchanged above it):
   - replace the `Ask Board AI` note (y 670) with a note titled **`Read it beside your board`**, `x: 470, y: 670,
     width: 560, height: 240`, html exactly:
     ```
     <p><strong>Read it beside your board</strong></p><ol><li>Open the PDF card. Its pages open next to the board.</li><li>Select a sentence and press <strong>Save as Note</strong>. The Note links back to its page.</li><li>Select an area, like a chart or a picture, and press <strong>Create Note from area</strong>.</li><li>Drag your Notes into Findings. The reader’s <strong>Library</strong> keeps every Note, image and highlight of that PDF.</li></ol>
     ```
   - add a note titled **`Ask Board AI, keep it in the wiki`**, `x: 470, y: 930, width: 560, height: 230`, html
     exactly:
     ```
     <p><strong>Ask Board AI</strong> — it is open on the right.</p><ul><li>“Summarise this PDF in five points.”</li><li>“What evidence answers my question?”</li><li>“Find quotes about …, with page numbers.”</li></ul><p>Answers name their pages. <strong>Save as Note</strong> puts an answer on the board; <strong>Save to wiki</strong> keeps it in the <strong>Board Wiki</strong>, as a page that lists its sources.</p>
     ```
5. `summary`: `'Read PDFs beside your board, turn passages into linked Notes, and pull it together with Board AI and the
   Board Wiki.'`
6. `contents` (exactly, in this order):
   - `'A drop zone for your PDFs in the middle'`
   - `'The PDF opens beside the board: a selected passage or area becomes a Note linked to its page'`
   - `'Research question, findings and a sources table'`
   - `'Board AI opens on the right and answers with page numbers'`
   - `'Save answers to the Board Wiki, as pages that list their sources'`
7. `public/templates/freeform/research/credits.json`: remove the entries for `taking-notes.jpg`, `books.svg` and
   `speech-balloon.svg`. Do NOT delete any file (the CTO removes them and remakes `preview.jpg`).

## Tests (`lib/collabboard/templates/freeform/research.test.ts`)
- Children of `findings` end with `'Sources'`; children of `question` unchanged; both columns `height` 1100.
- Free posts, exactly: `['Read, mark, collect', 470, 60]`, `['Upload your research', 470, 300]`,
  `['Read it beside your board', 470, 670]`, `['Ask Board AI, keep it in the wiki', 470, 930]`.
- No post has `x >= 1440` (nothing under the Board AI panel); no free post's right edge (x + width) passes 1440.
- The Sources table test still holds (4 rows × 3 columns, header Title/Author/Year).
- The wiki note's html contains `Board Wiki` and `Save to wiki`; the reading note's html contains `Save as Note` and
  `Create Note from area`.
- `contents` has 5 entries and one of them contains `Board Wiki`.
- Every credited file is referenced by a post or is `preview.jpg` or `inbox-tray.svg` (no stale credits).
- Keep the schema and asset tests.

## Allowed files
`lib/collabboard/templates/freeform/research.ts`, `lib/collabboard/templates/freeform/research.test.ts`,
`public/templates/freeform/research/credits.json`. Forbidden: everything else.
- Real tool calls only; no shell listing; never pipe vitest into anything; `timeout` on long commands.
- No git writes, no build, no browser, no curl. Do not read `.env` files. Never `cd`. Do not delete files.
- Run only `research.test.ts`, `lib/collabboard/templates/registry.test.ts` and `npx tsc --noEmit`.

## Commit message (verbatim)
```
feat(board): Research template makes room for Board AI and explains the reading workflow

The column under the Board AI panel is gone; its Sources table moves into
Findings. Two notes explain how to read a PDF beside the board, turn
passages into linked Notes, and keep Board AI answers in the Board Wiki.
```

## Addendum 1 (CTO, live finding 2026-10-06): a new PDF card lands on top of the drop zone
Live: a PDF chosen in the Research drop zone is placed at the viewport centre (`getNewPostPosition`,
`CanvasClient.tsx` ~L1760), which is exactly where the drop zone is, so the 260×320 card covers half of it. The centre
also ignores the open Board AI panel. Fix the PDF placement only (every other new post keeps `getNewPostPosition`).

**1. New pure module `lib/domain/canvas/freeformFreeSpot.ts`** (no React, no DOM):
```ts
export interface WorldRect { x: number; y: number; width: number; height: number }
export function findFreeSpot(
  preferred: WorldRect,            // the card at its wanted place (width/height = card size)
  occupied: readonly WorldRect[],
  area: WorldRect,                 // the visible part of the board, in world coordinates
  options?: { gap?: number; step?: number },  // defaults gap 24, step 24
): { x: number; y: number }
```
- A candidate is free when the card rect grown by `gap` on every side intersects no occupied rect (touching edges is
  not an intersection) and the card lies fully inside `area`.
- If `preferred` is free, return its x/y unchanged.
- Otherwise scan candidates on a `step` grid covering `area`; return the free one whose centre is nearest the preferred
  centre (squared distance; ties: smaller y, then smaller x). Deterministic.
- At most 20 000 candidates: if the grid is larger, grow the step until it fits.
- No free candidate (or `area` smaller than the card) → return `preferred` x/y.
- Round results to integers. Never mutate inputs.

**2. New module `lib/collabboard/freeformOccupancy.ts`** (DOM, no React):
```ts
export function readFreeformVisibleArea(container: HTMLElement, toWorld: (cx: number, cy: number) => {x: number; y: number}): WorldRect
export function readFreeformOccupiedRects(container: HTMLElement, toWorld: ...): WorldRect[]
```
- Visible area: the container's client rect, its right edge cut at the left edge of `[data-board-ai-chat]` when that
  element exists and has a width > 0 and its left is inside the container; then both corners through `toWorld`.
- Occupied: every `[data-padlet-id]` inside `container` whose client rect has width and height > 0 and intersects the
  container rect; each rect's two corners through `toWorld`.

**3. `CanvasClient.tsx`** (only these lines): a `getFreePdfPosition(width, height)` callback next to
`getNewPostPosition`. When `freeformWorldOriginRef.current` or `containerRef.current` is missing, return
`getNewPostPosition(width, height)`. Otherwise: `area = readFreeformVisibleArea(...)`, `preferred` = the card centred in
`area`, `findFreeSpot(preferred, readFreeformOccupiedRects(...), area)`, then `clampRectPositionToFreeformBounds`.
`handleKnowledgePdfUploaded` uses `getFreePdfPosition` instead of `getNewPostPosition`; nothing else in it changes.
Keep the addition under 25 lines.

**Tests**
- `lib/domain/canvas/freeformFreeSpot.test.ts`: preferred free → unchanged; preferred covered → result does not
  overlap (with the gap) and is the nearest free spot; the result stays inside `area`; a full area → preferred;
  same input → same output; inputs not mutated; the 20 000-candidate cap holds on a huge area.
- `lib/collabboard/freeformOccupancy.test.ts` (jsdom, stubbed `getBoundingClientRect`): the AI panel cuts the area; a
  hidden AI panel (width 0) does not; posts outside the container or with zero size are ignored.
- A source test (pattern: `lib/domain/canvas/freeformDocumentPlacement.source.test.ts`): `handleKnowledgePdfUploaded`
  calls `getFreePdfPosition(` and no longer `getNewPostPosition(`.

**Allowed files:** the four new files above, `app/dashboard/canvas/[id]/CanvasClient.tsx`, and
`lib/domain/canvas/freeformDocumentPlacement.source.test.ts` only if it pins `getNewPostPosition` in that handler.
Same rules as above. Run only the new tests, `freeformDocumentPlacement.source.test.ts`, and `npx tsc --noEmit`.

**Commit message (verbatim)**
```
fix(board): a new PDF card lands in free space

A PDF added on a freeform board was placed at the window's centre, on top
of whatever was there, such as the Research drop zone, and partly under
an open Board AI panel. It now goes to the nearest free spot in the
visible part of the board.
```

Addendum 1 result (CTO, live): a PDF chosen in the Research drop zone now lands in free space beside the template
(no overlap, left of Board AI, in view). Unit tests 22/22, tsc clean.

## Addendum 2 (CTO, live findings 2026-10-06)
Live, on a Research board with a PDF in the side-panel reader:
- **Save as Note** works (POST 201, "Saved", the Library lists the Note), but the Note is placed by
  `getNewPostPosition`, i.e. at the window centre, and landed on top of the template's photo and drop zone. Board AI's
  **Save as Note** (`savePdfAssistantAnswerAsNote`) uses the same centre placement.
- The side-panel reader (`[data-knowledge-reader-presentation="side-panel"]`, 880 px wide at the right) covers the
  board like Board AI does, but the visible area does not account for it.
- The note's step 1 is wrong: the card's **Open** opens the PDF full screen; its **Add to side panel** button is what
  puts the pages next to the board. Step 3: an area is drawn after pressing the reader's **Select area** tool.

**Changes**
1. `CanvasClient.tsx`: rename `getFreePdfPosition` → `getFreePostPosition` (comment: used by a PDF card and by the two
   Save as Note paths). `savePdfAssistantAnswerAsNote` and `saveKnowledgeSelectionAsNote` use it instead of
   `getNewPostPosition`; update their dependency arrays. Nothing else in them changes.
2. `freeformOccupancy.ts` `readFreeformVisibleArea`: the right edge is cut at the LEFTMOST left edge among
   `[data-board-ai-chat]` and `[data-knowledge-reader-presentation="side-panel"]`, each counted only when it has a
   width > 0 and its left is inside the container.
3. `research.ts`, the `Read it beside your board` html — replace steps 1 and 3 so the html is exactly:
   ```
   <p><strong>Read it beside your board</strong></p><ol><li>On the PDF card, press <strong>Add to side panel</strong>. Its pages open next to the board.</li><li>Select a sentence and press <strong>Save as Note</strong>. The Note links back to its page.</li><li>Press <strong>Select area</strong>, frame a chart or a picture, then press <strong>Create Note from area</strong>.</li><li>Drag your Notes into Findings. The reader’s <strong>Library</strong> keeps every Note, image and highlight of that PDF.</li></ol>
   ```

**Tests**
- `freeformOccupancy.test.ts`: a side-panel reader cuts the area; with both panels open the leftmost edge wins; a
  reader whose presentation is not `side-panel` does not cut.
- `freeformDocumentPlacement.source.test.ts`: the PDF handler and both Save as Note callbacks call
  `getFreePostPosition(` and not `getNewPostPosition(`.
- `research.test.ts`: the reading note's html contains `Add to side panel` and `Select area`.

**Allowed files:** `app/dashboard/canvas/[id]/CanvasClient.tsx`, `lib/collabboard/freeformOccupancy.ts` and its test,
`lib/domain/canvas/freeformDocumentPlacement.source.test.ts`, `lib/collabboard/templates/freeform/research.ts` and its
test. Same rules. Run only those tests and `npx tsc --noEmit`.

Commit: this addendum is folded into the two commits above — the placement parts into the `fix(board): a new PDF card
lands in free space` commit, whose message becomes:
```
fix(board): new PDF cards and saved Notes land in free space

A PDF added on a freeform board, and a Note saved from the PDF reader or
from a Board AI answer, were placed at the window's centre, on top of
whatever was there, such as the Research drop zone, and partly under an
open Board AI panel or PDF reader. They now go to the nearest free spot in
the visible part of the board.
```

Addendum 2 result (CTO, live): a PDF card and a Note saved from the side-panel reader both land in free space (0
overlaps, left of Board AI / the reader, in view); Save as Note POST 201, "Saved", Library lists it.

## Addendum 3 (CTO, full-suite gate): two older tests pin the old placement name
- `lib/infra/knowledge/knowledgeSelectionNoteWiring.source.test.ts` L87 expects
  `getNewPostPosition(width, height)` in `saveKnowledgeSelectionAsNote` → expect `getFreePostPosition(width, height)`
  (and keep the rest of that test unchanged).
- `components/collabboard/knowledgePdfSpatialScope.test.tsx` ~L369 builds the PDF handler with `new Function(...)`
  and injects `getNewPostPosition` → inject `getFreePostPosition` under that name instead (same stub
  `() => ({ x: 10, y: 20 })`, same position in the argument list). Change nothing else.
Allowed files: those two tests only. Run only those two files. Same rules.

Addendum 3 result: both tests pass (60/60).

## Final result (CTO, 2026-10-07, live)
Research board from the New board page: 16/16 posts, Board AI open on the right with nothing under it, upload area in
view, 6/6 images. A PDF from the drop zone lands in free space (0 overlaps, left of Board AI); **Add to side panel**
opens it beside the board; selecting text → **Save as Note** saves (POST 201, "Saved", listed in the Library) and the
Note lands in free space left of the reader. CTO asset work: `highlighting.jpg` cropped to a 1000×340 banner (freeform
image cards keep the photo's own shape, so the 3:2 photo covered the top of the upload area); `preview.jpg` remade
with the Board AI panel beside Findings; `taking-notes.jpg`, `books.svg`, `speech-balloon.svg` removed. Gate
`.opencode-vitest-304b.json`: 26 = 26 by name; tsc clean. All test boards and documents deleted.
