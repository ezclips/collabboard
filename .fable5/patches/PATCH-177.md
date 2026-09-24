# PATCH-177 — select text directly on the PDF page, and it becomes the same exact selection

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

The owner wants to highlight text directly on the PDF page in the reader, the way most PDF
viewers allow.

Today the page in the reader is a PICTURE (a server-rendered WebP, drawn by
`KnowledgeDocumentPageImage` inside `KnowledgeDocumentPageRegionSelector`). All text work
happens in the page's TEXT paragraph below it (`PAGE_TEXT_ROOT`): highlights, "Create Note
from selection", Ask AI, and drag-to-canvas. Git history confirms the reader never had a text
layer.

**All of those actions start from ONE value: the captured selection**
`{ pageNumber, charStart, charEnd, selectedText }`. Its offsets index the stored page text
(`page.text`, extracted server-side by OpenDataLoader). `activeSelection` re-proves it on every
render (`page.text.slice(charStart, charEnd) === selectedText`).

**The design:**
1. Draw pdf.js's invisible, selectable **text layer** exactly over the page image.
2. When the user finishes selecting on it, FIND the selected words in `page.text` with a pure,
   tested matcher.
3. Hand the result to the SAME `setCapturedSelection`.

Every existing action then works unchanged, and the saved highlight paints in the text view
as it does today. Nothing new is stored, and there's no new route.

**Why match, not map.** The layer's text comes from pdf.js, while `page.text` comes from
OpenDataLoader. The two agree on the words but not on spacing, line breaks or order across
columns. Matching the words, and refusing when they can't be matched exactly, keeps the
existing rule: a selection is exact or it is nothing.

## 2. The matcher — `lib/domain/knowledge/knowledgePageLayerSelection.ts` (new, pure)

```ts
matchLayerSelectionToPageText(
  pageText: string,
  selectedText: string,
  positionHint: number,          // 0..1: where the selection starts within the layer's text
): { charStart: number; charEnd: number } | null
```

- **Normalize both strings for comparison only.**
  - Apply Unicode NFKC, so the ligature `ﬁ` becomes `fi`.
  - Remove soft hyphens (U+00AD).
  - Then REMOVE ALL WHITESPACE.

  Keep an index map from each character of the normalized page text back to its offset in
  `pageText`.
- **Reject short selections.** The normalized selection must have at least 2 characters;
  otherwise return `null`.
- **Find every occurrence** of the normalized selection in the normalized page text.
  - None → `null`.
  - Exactly one → use it.
  - Several → choose the one whose start, as a fraction of the normalized page text's length,
    is nearest `positionHint`. On an exact tie, choose the earliest.
- **Map back** to `pageText` offsets. `charStart` is the original offset of the first matched
  character. `charEnd` is the original offset of the last matched character plus 1. The result
  therefore starts and ends on non-whitespace; inner whitespace is whatever `pageText` has.
- **Length cap.** Refuse (`null`) when `charEnd - charStart` exceeds
  `MAX_SOURCE_REFERENCE_QUOTE_LENGTH`. That's the same cap the text selection enforces. Check
  how `captureExactSelection` applies it, and mirror it exactly.
- No DOM and no React.

## 3. The layer — `components/collabboard/KnowledgePdfPageTextLayer.tsx` (new, client-only)

**Props:** `{ boardId, documentId, pageNumber, rotation, box: { left, top, width, height } }`.
`box` is the page image's content box relative to its wrapper, which is the `overlay` value
`KnowledgeDocumentPageRegionSelector` already computes.

**Loading the PDF.** A small module cache in
`components/collabboard/knowledgePdfDocumentCache.ts` (new):
- `getPdfDocument(boardId, documentId)` returns one promise per document, reused by every page
  and every mount.
- It loads `pdfjs-dist` DYNAMICALLY (`await import('pdfjs-dist')`) inside the call, never at
  module top level. That keeps server rendering and tests free of it.
- Set `GlobalWorkerOptions.workerSrc` once, to
  `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`.
- Fetch the file from the EXISTING route
  `/api/boards/{boardId}/knowledge/{documentId}/original`, which authorizes and then redirects to
  a signed URL. Pass that URL to `getDocument({ url })`. Invent no new route or storage read.
- A failed load is cached as a failure for that mount's lifetime, so there are no retry loops.

**Rendering:**
- `page.getViewport({ scale, rotation })`, where `rotation` is the stored page rotation. The
  image has that rotation baked in (see `knowledgePageRegionGeometry.ts`), and
  `scale = box.width / viewportAtScale1.width`.
- Draw the layer with pdf.js 4.10's `TextLayer` class (`new TextLayer({ textContentSource:
  await page.getTextContent(), container, viewport }).render()`).
- The container is an absolutely positioned div at `box`, with
  `data-knowledge-page-text-layer={pageNumber}` and the `--scale-factor` CSS variable pdf.js
  expects.
- Styles, scoped to `[data-knowledge-page-text-layer]` in the component (a `<style>` element or
  a CSS module; NOT a global stylesheet change):
  - spans are `position:absolute; white-space:pre; color:transparent; transform-origin:0 0;
    cursor:text; line-height:1`;
  - `::selection` is `rgba(59,130,246,0.3)`.
- When `box` changes size (the reader resizes), re-render the layer at the new scale and cancel
  the previous render.
- If loading or rendering fails, or the page has no text items (a scanned page), render NOTHING
  and log nothing to the user. The reader then behaves exactly as today.

**When it is off:** while area selection (`regionMode`) is enabled, don't render the layer, so
the crosshair drag works as now.

## 4. Wiring

**`KnowledgeDocumentPageRegionSelector.tsx`**
- New optional props: `textLayerEnabled?: boolean` and `rotation` (already present).
- When `textLayerEnabled && !enabled && overlay !== null`, render
  `<KnowledgePdfPageTextLayer … box={overlay} />` inside the wrapper, after the image.
- Nothing else changes.

**`KnowledgeDocumentDetails.tsx`**
- Pass `textLayerEnabled` (true when `boardId && documentId`).
- Extend `settleSelectionFrom`. Before the existing `captureExactSelection` call:
  1. If the browser selection's start AND end both sit inside the SAME
     `[data-knowledge-page-text-layer]` element, handle it as a layer selection:
     - `pageNumber` comes from that attribute;
     - `selectedText = range.toString()`;
     - `positionHint` = (the character length of the layer's text before the range start) ÷
       (the layer's total text length), measured with a Range from the layer's start, the same
       way `captureExactSelection` measures;
     - find the page in `pages`, and call the matcher.
     - On a match: `setCapturedSelection({ pageNumber, charStart, charEnd, selectedText:
       page.text.slice(charStart, charEnd) })`.
     - No match: `setCapturedSelection(null)`, and show a small transient notice near the
       reader toolbar, for 4 s or until the next selection: `Couldn't match this to the page
       text. Select it in the text below instead.` (`data-knowledge-layer-selection-miss`).
  2. A selection that spans a layer and anything outside it → `setCapturedSelection(null)`.
  3. Otherwise, exactly today's path.
- The existing selection chip and actions are positioned from the browser selection, so they
  appear next to the text selected on the page. Nothing to change. Verify it.
- Existing drag protection: `suppressNativePageTextDrag` covers the pages container, which
  contains the layer. Dragging selected layer text must behave like dragging selected
  paragraph text: allowed ONLY from inside a re-proved selection, carrying the same
  authoritative payload. Check `dragStartsInsideSelection` handles a range inside the layer. If
  it only looks at `PAGE_TEXT_ROOT`, extend it minimally to accept the layer too.

**Not in this patch:** the canvas PDF card's page view (`KnowledgePdfCanvasSurface.tsx`), and
painting saved highlights ON the page image. Both are possible follow-ups.

## 5. Tests

**`lib/domain/knowledge/knowledgePageLayerSelection.test.ts`** (new)
- An exact match gives the right offsets.
- Spacing differences are ignored:
  - the layer has no spaces between words, while the page text has spaces and newlines;
  - the reverse;
  - line breaks inside the selection.
- `ﬁ` ligature and soft-hyphen normalization.
- Repeated phrases: `positionHint` near the start picks the first, near the end picks the last;
  an exact tie picks the earliest.
- Refusals: no match, fewer than 2 characters, whitespace only, over the length cap.
- The result never starts or ends on whitespace.
- **The core promise:** `pageText.slice(charStart, charEnd)`, compared without whitespace, equals
  the selection compared without whitespace.

**`components/collabboard/KnowledgeDocumentDetails.pageLayer.test.tsx`** (new)
- Mock `KnowledgePdfPageTextLayer` to render a plain div with
  `data-knowledge-page-text-layer="1"` holding given text, so no pdf.js runs in jsdom. Use the
  harness of `KnowledgeDocumentDetails.test.tsx`.
- Selecting text inside the fake layer and firing `mouseup` makes the selection actions appear
  (e.g. `Create Note from selection on page 1`). The captured offsets index `page.text`: assert
  through what an action emits, e.g. the `onSaveSelectionAsNote` or `onCreateNoteFromPage`
  payload, the way the existing tests do.
- A layer selection that doesn't match shows the miss notice and no actions.
- Region mode on: the layer is not rendered.
- A selection spanning the layer and the text paragraph → no actions.

**`lib/domain/knowledge/knowledgePdfDocumentCache.test.ts`** is NOT required. Keep the cache
trivial. If you do test it, mock the dynamic import.

All existing `KnowledgeDocumentDetails*`, `knowledgePdfCard*` and region-selector tests must
pass UNCHANGED. The pre-existing baseline failure in `knowledgePdfCard.test.tsx` (24-26) stays
as it is.

## 6. Allowed files

```
lib/domain/knowledge/knowledgePageLayerSelection.ts, .test.ts        (new)
components/collabboard/KnowledgePdfPageTextLayer.tsx                  (new)
components/collabboard/knowledgePdfDocumentCache.ts                   (new)
components/collabboard/KnowledgeDocumentPageRegionSelector.tsx        (one prop + render the layer)
components/collabboard/KnowledgeDocumentDetails.tsx                   (settleSelectionFrom + prop + notice)
components/collabboard/knowledgeSourceTextSelection.ts                (only if dragStartsInsideSelection-style
                                                                       helpers live here and need the layer)
components/collabboard/KnowledgeDocumentDetails.pageLayer.test.tsx    (new)
next.config.ts                                                        (ONLY if pdfjs-dist will not bundle
                                                                       for the client without it; report
                                                                       exactly what and why)
```

Everything else is forbidden: `package.json` (pdfjs-dist 4.10.38 is already a dependency),
other tests, migrations, routes, and drawing-canvas code. Never use git stash, reset, restore,
checkout, clean, commit or push. **Never run a production build: the dev server is running.**

## 7. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/knowledge components/collabboard/KnowledgeDocumentDetails components/collabboard/knowledgePdfCard components/collabboard/KnowledgeDocumentPageRegion
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- whether `next.config.ts` was needed;
- **the path a real mouseup takes**: layer div → `settleSelectionFrom` → matcher →
  `setCapturedSelection` → which button renders.

Do not commit. The CTO verifies live on a real PDF.

## 8. Commit message (verbatim)

```
feat(pdf): select text directly on the PDF page in the reader

The reader showed each PDF page as a picture, so text could only be selected in the page
text underneath it. Each page now carries an invisible, selectable text layer drawn by
PDF.js over the picture. Selecting words on the page finds those same words in the stored
page text and becomes the exact same selection the text view makes, so highlighting,
Create Note, Ask AI and dragging to the canvas all work from the page, and a highlight made
there shows in the text view.

The match ignores spacing and line breaks, uses where on the page the selection started to
choose between repeated phrases, and refuses rather than guesses: if the words cannot be
found exactly, nothing is captured and the reader says so. A PDF whose file cannot be loaded,
or a scanned page with no text, simply shows no layer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
