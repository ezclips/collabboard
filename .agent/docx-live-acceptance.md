# Stage 2 — DOCX live acceptance

What was run against a running application, what it showed, and what is still
owed. Recorded in the repository because a result that exists only in a relay
message is not evidence anyone can check later.

**Build tested: `next dev` on `localhost:3000`, driven through the persistent
Chromium over CDP 9333. NOT a production build.** No production build has been
made since the DOCX work began; the standing rule is that dev is stopped first,
and it has not been. Everything below is a dev-server reading.

Date: 2026-09-20. Board `af02972f-dfde-4545-9fc8-5fcbccb007c3`.

---

## Documents uploaded

Both through the real file input in the board's own toolbar, not through the API.

| Document | Id | Input | Extracted | Upload → ready |
|---|---|---|---|---|
| `tidewater-loom-manual.docx` | `d6885681-8019-4d63-93ae-5299e708355b` | 30,566 B | 462 code units | ~2.0 s |
| `tidewater-loom-manual.docx` (second upload, disclosure capture) | `c55418b7-d105-4373-8fad-02220ac15aad` | 30,566 B | 462 code units | 1.6 s |
| `tidewater-handbook.docx` | `67cd2990-fba6-4356-a903-62633aed470c` | 8,815 B | 9,517 code units | 1.6 s |

Both are **generated** specimens, not Word-produced — see *Still owed*.

Timings are end-to-end from `setInputFiles` to the uploader's terminal notice,
and therefore include the request, extraction, chunking, persistence and the
promotion to ready.

---

## What the extraction produced, live

`tidewater-loom-manual.docx`, read back through `/pages`:

```
# Tidewater loom manual
The tidewater warping procedure keeps tension even across the back beam.
## Sett and reed
For 8/2 cotton the recommended sett is twenty ends per inch.[^1]
- Raddle
- Lease sticks
  - Reed hook
## Yarn table

Yarn | Sett
8/2 cotton | 20 epi
16/2 linen | 30 epi


Beam the warp under even tension before threading the heddles.
The tidewater sett is normally twenty ends per inch.

[^1]: Measured with a sley hook on a four-shaft table loom.
```

Every contract rule visible at once: ATX heading markers, list markers with one
nested level, table rows joined and bounded, the footnote reference inline and
its body appended, the tracked **insertion** kept (`normally`) and the
**deletion** gone (`rarely` appears nowhere), and `kind: 'text'` with
`pageCount: null`.

## Disclosure, live

The uploader's own notice, captured while the upload ran:

> tidewater-loom-manual.docx is ready. This document contains 1 image. Text
> inside images is not read. This document has tracked changes. It was read
> with the changes accepted: insertions are included and deletions are not.

**Negative control:** `tidewater-handbook.docx` has no images and no revisions,
and its notice is `tidewater-handbook.docx is ready.` — nothing appended. A
disclosure that always fires discloses nothing.

## Retrieval and citation, live

A board question answered from the DOCX, quoting both the **table row** and the
**footnote body** — the two things mammoth's raw-text mode drops or mangles.

Citations emitted in one answer:

```
knowledge-selection:d6885681-…:undefined:0:462       range 0:462
knowledge-selection:67cd2990-…:undefined:0:795       range 0:795
knowledge-selection:67cd2990-…:undefined:795:1590    range 795:1590
knowledge-page:a968dba0-…:1                          PDF, page 1
```

**Decision 0's control passes on a DOCX:** two different passages of one
document produced **two** citations with different ranges, not one collapsed
identity. The literal `undefined` in the key is documented at
`boardAiCitationIdentityKey` and left alone — the range is still in the key,
which is what keeps the two distinct.

## Range navigation — exact substring, docked

Marked text compared **character for character** against
`canonicalText.slice(start, end)`, not by length:

| Citation | Presentation | renderedRange | marks | exact match |
|---|---|---|---|---|
| `0:795` | `side-panel` | `0:795` | 1 | **yes** (795 = 795) |
| `795:1590` | `side-panel` | `795:1590` | 1 | **yes** (795 = 795) |

Document length 9,517, so both are proper subsets rather than the whole text.

## PDF regression control — navigation, not generation

The PDF citation in the same answer was **clicked**. The reader opened docked
on `bicycle_drivetrain_maintenance.pdf`, page indicator `1 / 1` against a cited
page of 1, and `data-knowledge-text-source` was **absent** — the PDF took the
PDF branch, not the text branch, which is the regression that mattered.

## Wiki — the second consumer

`Refresh from sources` on a new page compiled a proposal citing `[S1.1]`,
`[S1.2]` and `[S1.3]`, drawing on both DOCX sources, and reproducing the
accepted tracked-change text, the footnote body and a table row. After
**Apply to draft** and **Save**, the page's `COMPILED FROM` chain records:

```
tidewater-loom-manual.docx
tidewater-handbook.docx
tidewater-handbook.docx
```

---

## Not verified, and why

### Range navigation in the FOCUSED workspace

Attempted and **not achieved**, consistent with `retrieval-followups.md` item
16. The focused workspace opened correctly on the DOCX
(`data-knowledge-text-source-presentation="workspace"`), its AI dock opened,
and the panel reported
`data-board-ai-chat-document-scope="67cd2990-…"` — document-scoped, so it runs
no board search and yields no search passage's range.

**Stated precisely, because this is weaker than a clean negative:** in that run
the panel recorded **zero chat messages**, so the question may not have been
submitted at all. It therefore confirms the host is document-scoped; it does
**not** independently prove what a document-scoped panel would cite. The
routing gap is unchanged and no route was added.

### The `knowledge/search` endpoint returns `{"results":[]}` for every query

Audited, as asked, before proposing anything:

- The **only** caller in the codebase is `KnowledgeDocumentsList.tsx`.
- `KnowledgeDocumentsList` is imported by **nothing except its own test** — it
  is not mounted anywhere in the product.
- The same is true of `/knowledge/warm`, its other endpoint.
- `KNOWLEDGE_QUERY_SERVICE_URL` **is** set here, which is why the proxy answers
  `200 {"results":[]}` rather than `503`: it reaches an upstream that returns
  nothing. Text and DOCX chunks have no embeddings — only PDF chunks are
  embedded — so an embedding query has nothing to match.

**User-visible impact: none.** No product surface calls it. It is also not a
Stage 2 regression: the same query returns nothing for Stage 1 `.md` sources
and for board posts. Board AI's own search does not use this path; it calls the
text RPC directly, which is what every citation above came from. **No change
proposed.**

### Still owed before Stage 2 closes

1. **Word-produced specimens.** Exactly what is missing: a **table**, a
   **multi-level list**, a **footnote**, and **tracked changes**, in files
   Microsoft Word itself wrote. The two real Word files available on this
   machine are simple — no `w:pStyle`, no table, no footnote, no revisions —
   and their content is personal, so only structural counts were ever reported
   from them. Generated fixtures are **not** a substitute and are not counted
   as one.
2. **A real-document timing measurement**, on one of those files, at a size
   worth measuring.
3. **A production build reading.** Everything here is `next dev`. Extraction now
   runs in a worker loaded by path, and `next.config.ts` names it in
   `outputFileTracingIncludes` so a traced build carries it — that arrangement
   has not been exercised by an actual build yet.
