# PATCH-181 — light PDF cards: the canvas loads page text only when it is needed

Status: AUTHORIZED (owner, 2026-09-25: "1-3 is a good idea", "yes push and implement")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Read first: `components/collabboard/KnowledgePdfCanvasSurface.tsx`,
`components/collabboard/KnowledgePageCache.tsx`,
`app/api/boards/[id]/knowledge/[documentId]/pages/route.ts`

---

## 1. Why

The owner asked why every PDF card loads so much when the canvas opens. The CTO measured it.

**What is already right:**
- the PDF file itself is never loaded on the canvas;
- the page picture is lazy (`loading="lazy"`) and ETag-cached;
- only one page is shown at a time.

**What is not:** as soon as a card mounts, it fetches `/pages`, which returns **the text of
every page**, via `KnowledgePageCache.load` → `fetchKnowledgeReadyPages`. The card needs that
text only for:
- its "T" (parsed-text) view;
- the 90-character `snippet` (first page with text);
- a text source's 600-character excerpt.

On a 300-page manual that is most of a megabyte per card, per visit whenever it changed, for
text nobody opened.

## 2. The design

### 2.1 Route — `app/api/boards/[id]/knowledge/[documentId]/pages/route.ts`

Add a SUMMARY mode, `?view=summary`. Auth, board check, readiness and the kind check stay
exactly as they are, and so does everything without the parameter.

**PDF:** select `page_number, width_points, height_points, rotation`, with NO `text`.
- Return the same `document` object.
- `pages` items WITHOUT `text`.
- A top-level `snippet`: the first 90 characters, trimmed, of the first page whose trimmed
  text is non-empty.
  - Fetch that page's text with a SEPARATE, minimal query: the first page ordered by
    `page_number` whose text is not empty. Use `.neq('text', '')` with `limit(1)`, or the
    smallest correct equivalent.
  - No snippet → `snippet: null`.

**Text sources:** `pages: []`, and `text` = the first `KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS`
characters of the stitched text (the same stitching and validation as today), plus
`textTruncated: boolean`.
- Move that constant to a shared domain file so the route and the card use the same value.
- When the text fits, `textTruncated: false` and `text` is the whole text.

**Caching:** the summary's ETag must differ from the full one. Add
`knowledgePagesSummaryETag(sha, pageCount)` next to `knowledgePagesETag` in
`lib/domain/knowledge/knowledgePdfRenderPolicy.ts`, e.g. `"{sha}:pages-summary:{n}"`. The
`If-None-Match` → 304 path works for both modes. Keep the `Cache-Control` values.

### 2.2 Client cache — `components/collabboard/KnowledgePageCache.tsx`

- Add `loadSummary(boardId, documentId)` and `readSummary(documentId)`.
  - A SEPARATE map of summary entries, with its own in-flight sharing, and the same
    user-scope invalidation as today.
  - `fetchKnowledgeReadySummary` is the one summary fetcher.
- **A full entry satisfies a summary read.** If `read(documentId)` has a full entry,
  `readSummary` derives the summary from it (page metadata and snippet, or excerpt) without a
  request.
- `load` and `read` (full) are unchanged. The reader keeps using them.

### 2.3 The card — `components/collabboard/KnowledgePdfCanvasSurface.tsx`

- **On mount (expanded and ready):** load the SUMMARY, not the full pages.
  - The navigator range, page dimensions, rotation, page image, `snippet` and a text
    source's excerpt all come from it.
  - `KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS` stays the cut, and the existing `safeTextCutIndex` still
    applies to the excerpt.
- **The full pages load only when the card needs the text:** when the view switches to `text`
  (the "T" button), or when anything else in the card reads `page.text`. Find every such read
  and list them in your report. After that, the card uses the full entry, and the text view,
  its highlights, its selection → Create Note and everything else behave exactly as today.
- While the full text loads in text view, show the existing non-numeric loading state
  (`data-knowledge-pdf-loading`).
- **If the full entry is already cached** (the reader was opened), use it immediately, with no
  request.
- The 409 ("preparing") retry behaviour applies to the summary load exactly as it does today.

## 3. Tests

**Route** (find the test file that covers `/pages`, or add
`lib/server/knowledge/knowledgePagesRoute.summary.test.ts` in the style of its neighbours):
- PDF summary: pages without `text`, and the right `snippet` (first non-empty page; `null` for
  all-empty);
- text summary: excerpt with `textTruncated` true or false;
- the summary ETag differs from the full ETag, and a matching `If-None-Match` → 304;
- without `?view=summary`, the response is byte-identical to today (one assertion on the
  shape);
- a non-member → 403/404 exactly as today.

**`components/collabboard/knowledgePageCache.test.tsx`** (ADD):
- `loadSummary` shares in-flight requests;
- a cached full entry satisfies `readSummary` with no fetch;
- a user change clears summaries.

**`components/collabboard/KnowledgePdfCanvasSurface.test.tsx`** (ADD; keep every existing
assertion, and adjust only mocks that count `/pages` calls, reporting each):
- mounting fetches `/pages?view=summary` and NOT `/pages`;
- the page image and navigator work from the summary;
- clicking "Parsed text" fetches the full `/pages` once and renders the page text;
- with a full entry already cached, "Parsed text" makes no request;
- a text source card shows the excerpt from the summary.

## 4. Allowed files

```
app/api/boards/[id]/knowledge/[documentId]/pages/route.ts
lib/domain/knowledge/knowledgePdfRenderPolicy.ts                (summary ETag helper)
a shared domain constant file for KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS (new, or an existing domain file)
components/collabboard/KnowledgePageCache.tsx, knowledgePageCache.test.tsx
components/collabboard/KnowledgePdfCanvasSurface.tsx, KnowledgePdfCanvasSurface.test.tsx
the /pages route test file, or a new summary test file
```

Everything else is forbidden, including the reader (`KnowledgeDocumentDetails`,
`KnowledgeSourceReaderDrawer`), Board AI, the wiki, migrations and `package.json`. If a
source-census or wiring test names these files and needs an update, STOP and ask. Never use
git stash, reset, restore, checkout, clean, commit or push. Never run a production build.

## 5. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/KnowledgePdfCanvasSurface components/collabboard/knowledgePageCache lib/server/knowledge lib/domain/knowledge components/collabboard/knowledgePdfCard
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report the files you changed, the tests
you added, every `page.text` read you found in the card (§2.3), and the output. Do not commit.
The CTO measures live, on a reload, what the cards download.

## 6. Commit message (verbatim)

```
perf(pdf): canvas PDF cards load page text only when it is needed

A PDF card on the canvas fetched the text of every page of its document as soon as the
board opened, to show one page picture and a page count. Cards now ask for a summary --
page count, page sizes and a short snippet, or a transcript's excerpt -- and fetch the full
text only when someone switches the card to its text view. A document already opened in
the reader is reused without a request. The reader, Board AI and the wiki are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
