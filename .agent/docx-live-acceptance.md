# Stage 2 — DOCX live acceptance

What was run against a running application, what it showed, and what is still
owed. Recorded in the repository because a result that exists only in a relay
message is not evidence anyone can check later.

**Build tested in this first section: `next dev` on `localhost:3000`, driven
through the persistent Chromium over CDP 9333. NOT a production build.**
Everything down to the *Second pass* heading is a dev-server reading, and is
left as written rather than restated, because it is what was true when it was
recorded.

**Superseded in part.** The *Second pass* section at the end of this file
carries a production-build reading, and withdraws this record's claim that the
worker's heap ceiling is what stops a decompression bomb. Where the two
disagree, the second pass is correct.

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

*(Item 3, the production build reading, is no longer owed — see below.)*

---

# Second pass — enforceable bounds, and a production reading

Everything above this line was `next dev`. Everything below was run after dev
was stopped, against `npx next build` + `npx next start` on the same port.

## The memory-bound claim was wrong, and is withdrawn

The previous record said the extraction worker's V8 heap ceiling stops
`zipbomb.docx`. **It does not.** Measured on this machine, three ways:

| Path | Time | Peak RSS | What actually stopped it |
|---|---|---|---|
| Old preflight's `document.xml` read | 879 ms | 482 MB | jszip's own size-mismatch throw |
| Worker alone, as shipped in `81d8c06c` | 755 ms | 402 MB | the same jszip throw, via the worker |
| Bounded streaming scan (now) | 86 ms | 75 MB | **our ceiling, during inflation** |

Two things follow, and both were missed before:

- **The heap ceiling never fired.** Node's `resourceLimits` bounds the JS engine
  only; external allocations and process-wide exhaustion sit outside it.
- **What stopped the bomb was luck.** jszip complained because this fixture
  *lies* about its declared size. An archive that declares its expansion
  truthfully inflates in full, silently.
- **The old preflight inflated in the request process** — its tracked-changes
  read pulled all 335 MB *before* the worker was ever created, so the isolation
  downstream of it protected nothing.

## What enforces the bound now

`lib/infra/knowledge/knowledgeDocxArchiveScan.ts`. Every entry is inflated as a
**stream**, bytes counted as they are produced, per entry (32 MB) and across the
archive (64 MB). Chunks are counted and discarded, never concatenated, so the
peak cost of reading an entry is one chunk. The tracked-changes scan runs over
the same stream with a 16-byte seam carried between chunks, so it no longer
needs the document in memory at all.

**Stated exactly:** the ceiling is a ceiling, not a tripwire. `pause()` stops the
inflater, but already-queued chunks still arrive — measured at **~3.6 MB past
the limit**. Counting stops at the limit; inflation winds down just after it.

The declared-size and entry-count checks are **kept as supplementary**: they
refuse an *honest* oversized archive for free, and are not trusted for the
dishonest one.

The worker is kept too, for the reason that survives measurement: `terminate()`
genuinely stops work, which a promise race cannot, since mammoth offers no
cancellation.

## Live, on the PRODUCTION build

`npx next build` (exit 0), dev stopped first, then `npx next start -p 3000`,
driven through the same persistent Chromium over CDP 9333.

| Run | Result | Server probes during upload | Slowest probe |
|---|---|---|---|
| `zipbomb.docx` via the real file input | refused, `This document is too large to read` in **949 ms** | **40/40 answered** | 286 ms |
| `tidewater-handbook.docx` immediately after | **ready in 1,846 ms** | **40/40 answered** | 240 ms |
| `tidewater-loom-manual.docx` | **ready in 958 ms**, both disclosures fired | — | — |

The same two uploads on `next dev`, for comparison: bomb refused in 10.4 s,
normal DOCX ready in 2.0 s, also 40/40 probes answered.

**The parent server stays responsive and usable.** The probe is a second page
issuing authenticated `GET /api/boards/{id}/knowledge` requests every 250 ms
while the upload is in flight. An earlier version of this probe reported 0/40 on
*both* runs — that was the instrument, not the server: it fetched from
`about:blank`. The control is why it was caught, and the fixed probe answers
40/40 on both.

Extraction on the production build produced **byte-identical text** to dev — 462
code units, headings, nested list markers, joined table rows, the footnote
reference and body, the tracked insertion kept and the deletion gone.

## A real defect found in deployment tracing

Looking where the PM said to look, rather than at whether the build passed.

The route's trace manifest after `81d8c06c` carried the worker file and **exactly
one package: `next`**. The application's own libraries are bundled into
`route.js` by webpack and need no tracing — but **the worker is not bundled**.
It is plain CommonJS calling `require('mammoth')` at runtime, invisible to both
webpack and the tracer.

**A packaged deployment would have shipped a worker with nothing to load**, and
every DOCX upload would have failed *in production only*, with the same "could
not be read" message a corrupt file gets. The build passes. `next start` in the
full checkout passes, because the checkout has `node_modules`. Neither detects
this — exactly as the PM said.

Fixed by naming mammoth's **whole 25-package runtime closure** in
`outputFileTracingIncludes`. The trace manifest went from **59 files / 1 package
to 1,058 files / 26 packages**.

Guarded, because a hand-written list rots: `knowledgeDocxDeployment.test.ts`
recomputes the closure from `package.json` and fails naming what is missing, and
a second test copies **only** the named packages plus the worker into an empty
temporary directory and runs a real DOCX extraction there, with `cwd` set to
that directory so nothing can resolve back into the repo.

**Shown able to go red:** with the `node_modules` entries stripped, that test
fails with `Cannot find module 'mammoth'` — the production failure itself.

## Instruments shown able to go red

- **Bounded-decompression test** — raising the inflation ceiling above the
  fixture's real expansion makes the bomb reach the worker again, and the
  duration and memory assertions fail. Verified by doing it.
- **Deployment packaging test** — above.

## What is still not verified

- **Word-produced specimens stay pending.** Still exactly: a **table**, a
  **multi-level list**, a **footnote**, and **tracked changes**, in files
  Microsoft Word itself wrote. No generated fixture is offered as a substitute
  and none is counted as one. The gate stays open.
- **Real-document timing** on such a file, at a size worth measuring.
- **The focused-workspace range exercise** remains unachieved by product route,
  carried as the accepted Stage 1 exception under `retrieval-followups.md` item
  16. The run with zero recorded messages proves neither success nor a routing
  defect and is claimed as neither.
- **`resourceLimits` is not a total-memory limit.** It bounds the JS heap.
  External allocations and process-wide exhaustion are outside it, which is why
  the enforceable bound is the streaming ceiling and not the worker.
