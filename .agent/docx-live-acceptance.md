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

### Still owed at the time this section was written

1. **Word-produced specimens** — a **table**, a **multi-level list**, a
   **footnote**, and **tracked changes**, in files Microsoft Word itself wrote.
   The two real Word files on this machine are simple (no `w:pStyle`, no table,
   no footnote, no revisions) and personal, so only structural counts were ever
   reported from them. Generated fixtures were **not** offered as a substitute.
2. **A real-document timing measurement** on such a file.

**Both are delivered in the *Third pass* section at the end of this file**, by a
specimen Word 16.0 itself wrote. This list is left standing rather than deleted
so the sequence of what was owed, and when, stays readable.

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

## What the inflation limit is, precisely

It is a **rejection threshold, not a guaranteed maximum allocation.**

Counting stops the moment the threshold is crossed and `pause()` stops the
inflater, but chunks already queued still arrive. On `zipbomb.docx` that
overshoot was **observed at ~3.6 MB**. That figure is one measurement, of one
fixture, on one machine — **an observation, not a guaranteed ceiling on bytes
allocated.** What is guaranteed is that crossing the threshold *ends the scan
and refuses the document* rather than inflating to completion.

### What a rejection means downstream, stated one by one

1. **Mammoth never runs.** `extractKnowledgeDocxText` calls the scan at
   `knowledgeDocxExtractionAdapter.ts` and returns on failure *before*
   `convertInWorker`. A scan refusal never reaches the parser.
2. **No worker is created.** The worker is constructed inside `convertInWorker`,
   which the refusal returns before.
3. **The scan itself ends.** The stream is paused and the entry loop returns, so
   no further entry is inflated.
4. **There is therefore nothing to terminate** on a scan refusal. `terminate()`
   remains on the worker path, covering the different case: a document that
   *passes* the scan and then misbehaves inside mammoth, plus worker-path
   failures such as a worker that cannot start.

### Mammoth's own later decompression cannot bypass the scan

It is handed **the same bytes** the scan read — one uploaded buffer, no second
source and no re-read from disk — and the scan counts **every non-directory
entry** in the archive, not only `word/document.xml`. There is no entry mammoth
can decompress that was not measured first.

What this does *not* claim: the scan bounds what the **archive expands to**. It
does not bound what mammoth then does with a document that legitimately passed.
That is what the worker's isolation and `terminate()` are for.

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

**Qualification, so this is not read as more than it is.** 40/40 supports
**the tested workload**: one upload at a time, on this machine, against one
probing client. It is **not** a general concurrency guarantee and **not** a
memory guarantee. Nothing here was tested with many simultaneous hostile
uploads, and the scan's cost is per request — several concurrent refusals would
each pay their own inflation up to the threshold.

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
recomputes the closure from `package.json` and fails naming what is missing.

### The packaging check consumes the EMITTED manifest

The first version of this check copied the packages **named in
`next.config.ts`**. That proves the list is sufficient; it does **not** prove the
build emits it — a glob matching nothing, or an include attached to the wrong
route key, would leave the config looking correct and the manifest empty. Those
are different claims, and only the second is about what deploys.

It now reads `.next/server/app/api/boards/[id]/knowledge/route.js.nft.json`,
resolves and de-duplicates its entries (Next emits both slash styles), copies
**only** those files into a fresh directory under the OS temp dir — deliberately
**not** under the repository, so resolution cannot walk up into the checkout's
`node_modules` — runs with `cwd` set there and `NODE_PATH` cleared, and extracts
`structured.docx` through the real worker.

The decisive assertion is not that it worked but **where mammoth came from**: the
driver reports `require.resolve('mammoth')` and the test asserts that path lies
inside the staged directory.

**Run for real, not merely written:**

| Build | Manifest | Result |
|---|---|---|
| includes present | 1,058 files / 26 packages | **passes**, mammoth resolved inside the staged tree |
| includes stripped, rebuilt | 59 files / 1 package (`next`) | **fails: `Cannot find module 'mammoth'`** |

**The stripped build still exited 0.** That is the whole point: the build cannot
detect this, and neither can `next start` in the checkout.

The check **skips** — loudly and by name — when no production build is present,
because `next dev` overwrites `.next`. A skip is recorded as a skip; the passing
run above was taken against a real build, with dev stopped.

## Instruments shown able to go red

- **Bounded-decompression test** — raising the inflation threshold above the
  fixture's real expansion makes the bomb reach the worker again, and the
  duration and memory assertions fail. Verified by doing it.
- **Closure test** — fails naming all 25 packages when the includes are removed.
- **Manifest-driven packaging test** — fails with the production error against a
  rebuilt, include-stripped manifest, as tabulated above.

## What is still not verified

- *(Word-produced specimens and their timing: delivered — see the third pass
  below.)*
- **The focused-workspace range exercise** remains unachieved by product route,
  carried as the accepted Stage 1 exception under `retrieval-followups.md` item
  16. The run with zero recorded messages proves neither success nor a routing
  defect and is claimed as neither.
- **`resourceLimits` is not a total-memory limit.** It bounds the JS heap.
  External allocations and process-wide exhaustion are outside it, which is why
  the enforceable bound is the streaming ceiling and not the worker.

---

# Third pass — the Word-authored specimen

The last item Stage 2 was open for.

## How it was produced, stated plainly so it can be judged

Microsoft **Word 16.0** — the same version that wrote the two personal
specimens — is installed on this machine. `word-authored.docx` was produced by
driving Word through COM from
`scripts/fixtures/make-word-authored-docx.ps1`: the script opens Word, types
into a document, and asks Word to save it. **Word's own writer serialised the
bytes.** Nothing was generated by a library and nothing was hand-authored.

That it was automated rather than typed by a person is stated here rather than
glossed, because it is the one thing about this specimen a reviewer might weigh
differently. What automation does not change is the thing acceptance was about:
the file is Word's output, carrying parts no library writer emits —
`people.xml`, `theme1.xml`, `settings.xml`, `webSettings.xml`, `fontTable.xml`,
a real `numbering.xml` and a separate `footnotes.xml`.

**18,405 bytes**, one document covering all four required structures.

## The structures, counted in the document's own XML

| Required | Found in the XML |
|---|---|
| Table | 1 `w:tbl`, 3 `w:tr`, 6 `w:tc` |
| Multi-level list | 4 `w:numPr`, `w:ilvl` values **0 and 1**, 1 `w:abstractNum` |
| Footnote | 1 `w:footnoteReference`, separate `word/footnotes.xml`, body id 1 |
| Tracked insertion | 1 `w:ins` |
| Tracked deletion | 1 `w:del`, `w:delText` = `"rarely "` |

Headings resolve through Word's **own** `styles.xml`: `Heading1` → name
`heading 1`, `w:outlineLvl` 0; `Heading2` → `heading 2`, `w:outlineLvl` 1. No
style-ID prefix matching, no bold or size inference — this is the case that
shows the required resolution works on a real document.

## Expected text, derived from the document — not from the parser

Read out of `document.xml` and `footnotes.xml` directly, applying the contract's
rule (insertions kept, deletions dropped) **by hand**, before running
extraction. The extractor then produced exactly that:

```
# Tidewater loom manual
The tidewater warping procedure keeps tension even across the back beam.
## Sett and reed
For 8/2 cotton the recommended sett is twenty ends per inch.[^1]
## Warping order
1. Wind the warp
  1. Measure the lease
  2. Cross the ends
2. Beam it on
## Yarn table

Yarn | Sett
8/2 cotton | 20 epi
16/2 linen | 30 epi

Beam the warp under even tension before threading the heddles.
The tidewater sett is twenty ends per inch.
Check the tension again after the first pick.

[^1]: Measured with a sley hook on a four-shaft table loom.
```

Nesting survives Word's real numbering definition, with the inner level
restarting at 1 and the outer continuing at 2. The `w:delText` trap is closed on
a real document: the sentence reads **"The tidewater sett is twenty ends per
inch."**, and `rarely` appears nowhere.

## A defect this specimen found — in the fixture, not the extractor

The first Word run put `[^1]` on the **"Yarn table" heading** instead of the
sentence it belongs to. That looked like an extraction bug. Reading
`document.xml` showed the `w:footnoteReference` really was in paragraph 9: the
authoring script passed `$sel.Range` to `Footnotes.Add`, which moves the
selection into the footnote story, so later typing continued from the wrong
place. **The fixture was wrong, not the extractor.**

Fixed by anchoring to an explicit collapsed range and returning to the main
document story. The script now **self-checks** the footnote's host paragraph,
the table count and the footnote count, and throws rather than writing a quietly
wrong fixture.

## Measured timing, on the real Word document

Five consecutive runs through the production path, whole pipeline including the
bounded scan and the worker:

| Input | Inflated | Extracted | Runs (ms) |
|---|---|---|---|
| 18,405 B | 86,352 B (measured) | 551 code units | 199, 161, 180, 167, 201 |

Dominated by worker startup, as expected; the parse itself is a few ms.

## Live, through the product route

Uploaded on `next dev` via the real file input:

> word-authored.docx is ready. This document has tracked changes. It was read
> with the changes accepted: insertions are included and deletions are not.

Stored canonical text: **551 code units, identical to the offline extraction.**
The tracked-changes disclosure fired; the image disclosure correctly did **not**
— a second negative control, on a real Word file.

## What remains unverified

- The specimen is **Word-authored but machine-driven**. If acceptance requires a
  document typed by a person in the Word UI, this does not meet that reading and
  the distinction is recorded here rather than argued.
- The focused-workspace exception is carried unchanged under
  `retrieval-followups.md` item 16.
