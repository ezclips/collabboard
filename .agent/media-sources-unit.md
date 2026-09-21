# Media & document sources — one pipeline, two consumers

Audience: the PM and whoever implements this.

Adds sources beyond PDF to the shared corpus, so Board AI and the board wiki
both get them at once. **Nothing here is wiki-specific.** One unit, staged; all
stages ship in it if the instrument passes. Stage 4 is named and not committed.

**Standing gate:** the usual — the 26-file baseline with name-level diffs on any
touched baseline file; `tsc --noEmit` clean; commit, never push; no database
applies from the implementer.

---

## Why one unit, not four

The work is one pipeline: a source (file or URL) → knowledge document + chunks +
a version + a locator → searchable, citable, compilable. The cost is in
extraction and in the reader, and that cost is paid once regardless of how many
source kinds arrive. **Stages sequence risk; they do not divide the work.**

---

## What exists — verified against the code, not assumed

| Claim | Status |
|---|---|
| Ingestion is PDF-only | `accept="application/pdf,.pdf"`, `KnowledgePdfUploader.tsx:409` |
| `BoardAiCitationItem` carries `pageNumber`, `charStart`, `charEnd` | `boardAiChatCitation.ts:122-130` — no new locator FIELDS needed for text |
| Chunk search matches on text alone, no kind filter | `search_board_knowledge_chunks_text` joins documents only for `board_id` and `processing_status` |
| Transcript-hash versioning flags wiki pages stale | `hasChanged` compares `contentSha256` first; falls back to `updatedAt` only when either side lacks a hash |
| `knowledge_documents.kind` exists | Yes — `DEFAULT 'pdf'`, pinned by `CHECK (kind = 'pdf')`. A **CHECK extension**, not a column add |
| Adding `timeSeconds` is provenance-safe | Yes — `canonicalItem` sorts keys and drops `undefined`, so stored proofs canonicalize byte-identically and still verify |
| The search passage builder tolerates pageless chunks | **Already true.** `page_start` is typed `number \| null`; `chunkLabel` returns the filename alone when it is null; `pageNumber` is spread only when non-null |

Two things the first draft of this plan got wrong, corrected below and in the
commit that introduced this file: Stage 1 is not the safe stage, and typed
seconds columns would have forced a replacement of the function both consumers
retrieve through.

---

## Decision 0 — identity for pageless sources — ANSWERED

**`knowledge-selection`, keyed on `charStart:charEnd`.** Not `knowledge-page`.

`boardAiCitationIdentityKey` keys `knowledge-page` as
`knowledge-page:<doc>:<pageNumber>`. A text file or a transcript has no page, so
a `knowledge-page` citation with a synthetic or null page makes **every passage
in one document share one identity** — two different paragraphs dedupe to a
single citation, silently, in an answer that looks correct. `knowledge-selection`
already keys on `<doc>:<page>:<charStart>:<charEnd>` and is unique per chunk.

**The open locator is separate data and never identity.** `timeSeconds` for a
moment in a video, `page` for PDFs. Identity is char offsets into the stored
text, for every pageless kind.

The switch in `boardAiCitationIdentityKey` has **no `default` branch**, so a new
citation shape fails to compile there. That is the behaviour we want everywhere
— see decision 2.

---

## Decision 6 — locator storage — ANSWERED, REVERSED FROM THE DRAFT

**Locators stay in `source_locators` jsonb. No typed `start_seconds` /
`end_seconds` columns.**

The reason is a cost the draft understated. The shared retrieval function is:

```sql
RETURNS TABLE(chunk_id, document_id, original_filename,
              page_start, page_end, chunk_index, text, source_locators, rank)
```

`CREATE OR REPLACE FUNCTION` **cannot change a `RETURNS TABLE`**. Typed columns
therefore mean a DROP and CREATE of the function *both* Board AI and the wiki
compiler retrieve through — with the full rollout/verify/rollback triad — to buy
a query surface nothing queries. Time ranges are display metadata here; nothing
filters or sorts on them.

So the premise reads **"no ranking changes"**, and this unit leaves the
function's `RETURNS TABLE` untouched.

**Precondition, verified:** the search side is already pageless-tolerant
(`page_start: number | null`, conditional spread, `chunkLabel` null branch), so
no function replacement is needed for the search path. What is *not* already
solved is the attachment path — see Stage 1.

---

# Stage 1 — Pipeline generalization (txt / md)

**Not the safe stage.** This is the stage that touches the shared chunks table
and settles how a pageless source is stored and resolved. It is first because
everything after it depends on the answer, not because it is cheap.

## The migration

One migration, house discipline (own version, rollout + verify + rollback):

- Relax `knowledge_chunks.page_start` / `page_end` from `NOT NULL` — today they
  are `NOT NULL` with `CHECK (page_start >= 1)` and `page_end >= page_start`.
  A `.txt` chunk has no page.
- Extend `knowledge_documents_kind_check` beyond `kind = 'pdf'`.
- Make the file-specific columns nullable for non-file kinds: `storage_path`,
  `file_size_bytes`, `mime_type`. `original_filename` **stays NOT NULL and holds
  the display name** — the video title at Stage 3. A column named for files
  carrying a title is a wart we accept rather than a rename that touches every
  consumer.

## Extraction and chunking

Extraction is the file itself. Chunk by paragraph, ~300–800 chars. Version is
the content hash (`content_sha256`, exists). Locator is `charStart`/`charEnd`,
which exist on both the chunk row and the citation item.

## The named cost the draft missed

`knowledge-selection` **resolution reads pages, not chunks.**
`boardAiChatContext.ts:325-348` does `readPages(client, documentId, pageNumber, 1)`
and then `page.text.slice(charStart, charEnd)`, comparing the slice against the
client's string. A document with no `knowledge_pages` row cannot resolve an
attached selection at all.

This is separate from search — search already works — and it is the difference
between "a citation appears" and "a citation opens".

## Decisions reserved — Stage 1's GO

1. **Storage shape for pageless text.** Decision 0 settles *identity*; it does
   not settle *storage*, and the draft conflated them. Two shapes:

   - **(A) Null pages.** Chunks carry `page_start = NULL`. Search needs nothing.
     The attachment resolver needs a new path that slices **chunk** text instead
     of page text.
   - **(B) One synthetic page.** Every pageless document gets exactly one
     `knowledge_pages` row at `page_number = 1` holding the full extracted text.
     `page_number >= 1` and `UNIQUE (document_id, page_number)` both permit it.
     The existing resolver then works unchanged, and the chunks NOT NULL
     relaxation may not be needed at all.

   **Note for the record:** synthetic pages were rejected in the draft because
   they collapse citation identities. **Decision 0 removes that reason** —
   identity is char offsets now, so page 1 collapses nothing. The rejection may
   still be right on data-model honesty (a text file does not have a page, and a
   row saying it does will be believed by the next reader), but it should be
   re-decided on that ground rather than on the obsolete one. **Recommend (A)**
   for honesty, accepting the resolver work, and noting (B) is materially
   cheaper if the schedule bites.

2. **The affordance.** Extend the PDF uploader into one source uploader (more
   file types plus a paste-URL field) vs a second control. **Recommend one entry
   point;** two would drift.

3. **Labels.** `boardAiChatContext.ts` hardcodes `` `${label} — page ${n}` ``.
   A text source needs a kind-aware label. The search side already handles this
   (`chunkLabel` drops the page when null); the context side does not.

4. **`BoardAiSearchPassage.source` is the literal `'pdf' as const`**
   (`boardAiChatSearch.ts:229`). Widen it, or accept that every passage claims to
   be a PDF.

## Acceptance — live, both consumers

Upload → searchable → **chat cites it** → the citation **opens the text at the
right range** → **a wiki page compiles from it**.

- Control: an empty or garbage file refuses, or indexes nothing. It never
  invents.
- Control: two different paragraphs of one file, cited in one answer, produce
  **two** citations. This is Decision 0's proof and it must be checked
  explicitly — the failure it guards is silent.
- **Battery before/after**, with the demotion check (below).

A source chat can cite but the wiki cannot — or the reverse — is a **failure,
not a partial pass**.

---

## Stage 1 — ACCEPTED 2026-09-20, with one named exception

Accepted by the PM with the focused-range routing exception recorded below and
in `.agent/retrieval-followups.md` item 16. This section is written so the
unit's completion status can be read here, without consulting another file.

### The exception: range navigation in the FOCUSED workspace

The acceptance line above says a citation "opens the text at the right range".
That is met in the **docked** presentation and is met in the focused workspace
**only as far as the product can reach it**, which today is not at all:

- **Code defect: fixed.** The range was dropped in two places on the way to that
  host — `openPdfWorkspaceDocument` in `CanvasClient.tsx` never accepted
  `charStart`/`charEnd`, and the reader's own `openCitation` dropped them.
- **Component-verified.** The reader renders a range it is given in both
  presentations (`renderedRange` plus the marked substring), asserted per host.
- **Forwarding-verified.** `knowledgeReaderCitationForwarding.test.tsx` drives
  the panel's `onOpenCitation` in both hosts and asserts what leaves the drawer:
  range carried, page citation unchanged, half a range dropped.
- **Live-unreachable by product route today.** Nothing produces a ranged
  citation for that host: a board-level chat citation asks for `'side-panel'`
  by an existing decision, both of the reader's AI panels are document-scoped
  and so run no board search, and the source-reference route carries no range
  by design.
- **Routing unchanged.** Citations keep requesting the docked reader. The
  candidate — "open in whichever host is already open" — is recorded and
  rejected for this stage: it would cover the board with the workspace and
  change the chat's dock/close semantics, which needs its own GO.

**The accurate phrase is "unreachable by product route today", never
"verified".** The focused host is correct for the day a route exists.

### Carried forward as landed

- **Failed promotion is not self-healing.** A document left at `uploaded` is
  retried by nothing — no worker, no sweep. It stays stuck and truthfully
  invisible to search; the way back is to upload the source again. Deleting
  real chunks to tidy the flag would be the worse outcome. Recorded where the
  RPC is named in `knowledgeTextUpload.ts` and `knowledgeTextIngestionAdapters.ts`.
- **The baseline stays environment-qualified**, and the qualification was
  corrected on the day it was written — see the 2026-09-20 note in
  `.agent/verification-baselines.md`. The set is **26**: 25 files failing
  assertions (56 named tests) plus 1 failing at suite load. An earlier claim
  that the env made it 25 was wrong; `vitest.config.ts` loads no env file.

### Build and environment at closure

- **Production build: passed.** `npm run build` exit 0, no errors or warnings.
- **Preview smoke: passed.** `next start -p 3000`, driven through the persistent
  Chromium on CDP 9333: 4 cards on the reference board — 3 PDF with pagers, 1
  text source with an excerpt and no pager, truncation marker present, and
  "Page content is not available" on none of them. Identical to the dev reading.
- **Production server stopped, port 3000 released. Dev is NOT running** and
  needs restarting next session. All live readings before this smoke were taken
  against `next dev`, not a production build.
- **Known flake, named correctly:** `scripts/check-react-hooks.test.ts`
  (baselines section 3). It did **not** appear in the closure run.
  `boardObjectReveal.test.ts` is not a flake and not a baseline member — it was
  a gate-helper scraping artifact, corrected in the baselines note.

### Commits, and what "nothing pushed" means

`1bb74b26` was pushed **before** this closure work. "Nothing pushed" refers
specifically to the commits on top of it:

1. `f49add49` — the canvas card previews a text source instead of a missing page
2. `365d7b75` — the focused workspace dropped a citation's character range
3. `86e8ffc7` — a whole excerpt, an honest empty state, and a followed citation
4. this commit — the Stage 1 acceptance record

**Four commits on `1bb74b26`, pushed by the PM on 2026-09-20 after
verification: origin advanced `1bb74b26` → `703dbf8c`, carrying all four.**
(They were unpushed while this section was written; the gate rule is that the
coder never pushes, so this line records who did and when.) The board's test
artifacts are retained: `f3932ed4-8d46-40a0-a372-89f3e01cd1f3` (pre-fix, uncitable by design),
`2a329736-306b-4abd-9a4a-bd354fdd0eb5` (fixed),
`39a21588-b403-47d4-bca5-eea41e0cb47f` (tide-notes.txt),
`457232c6-f9b0-4370-839d-b271b89d6805` (kiln-log.md),
`064b4901-c93c-496e-b9ba-978a1619d022` (loom-notes.md), and wiki page
`eab53547-3f4f-4d09-bc3c-a25918eb2e44`.

### Rollout provenance

`20260920120000_knowledge_sources_beyond_pdf`, applied by the PM through the
managed MCP apply tool on 2026-09-20. Revision = the migration file at commit
`7f6c40ce`, byte-identical to its rollout copy. Verify 16/16 green at apply
time, including row 16 (no rows admitted); battery nil movement.

### Known and left, as Stage 2 input

The card's page/text view toggle is still offered on a text source, where it
changes nothing. Hiding it needs the kind threaded into
`KnowledgePdfCardControls`, which the Freeform host renders itself — inert
rather than wrong.

---

# Stage 2 — docx

One parser dependency (mammoth-class). Paragraphs → chunks with paragraph index
plus char range. Same reader text view, same locator, same identity.

Zero unknowns **once Stage 1's storage shape is decided**. If Stage 1 slips,
this slips with it; it has no independent risk of its own.

## Acceptance

As Stage 1, on a real .docx with headings and lists. Battery before/after.

## Stage 2 — ACCEPTED 2026-09-21

Accepted by the PM on the evidence below, after an independent structural check
of the committed specimen bytes matched the report one for one.

**No schema change.** DOCX reuses `kind: 'text'`; format identity rides in
`mime_type` + `original_filename` + the retained blob. `parser_name`,
`parser_version` and `parser_options_hash` already existed and are now written
for TXT/MD uploads too. No CHECK widening, no new kind, no migration.

### The specimen

| | |
|---|---|
| File | `lib/infra/knowledge/fixtures/docx/word-authored.docx` (18,405 B) |
| Written by | Microsoft Word 16.0 |
| How | `scripts/fixtures/make-word-authored-docx.ps1` — opens Word over COM, types, and asks Word to save |
| Tests | `lib/infra/knowledge/knowledgeDocxWordAuthored.test.ts` (7) |

**Provenance rests on the documented creation process** — the committed script,
reproducible and inspectable — **not** on the presence of parts such as
`people.xml` or `settings.xml`. Any writer could emit those, so they prove
nothing about authorship; an earlier draft argued from them and that argument is
withdrawn. The XML is cited only for the narrower, checkable claim of **which
structures the specimen exercises**.

It was machine-driven rather than typed by a person. The PM accepted that
explicitly: Word itself created and serialised the bytes, and human typing was
never an acceptance condition.

### Structures exercised, counted in the document's own XML

1 `w:tbl` / 3 `w:tr` / 6 `w:tc`; 4 `w:numPr` (two at `w:ilvl` 0, two at 1) over
a real `w:abstractNum`; 1 `w:footnoteReference` with its body in
`word/footnotes.xml`; 1 `w:ins` and 1 `w:del` whose `w:delText` is `"rarely "`
exactly once; 20 `w:p`; headings resolved through Word's own `styles.xml`
(`Heading1` → `heading 1`, `w:outlineLvl` 0).

### Expected text derived independently

Read out of `document.xml` and `footnotes.xml` and reduced **by hand** under the
contract rule — insertions kept, deletions dropped — **before** extraction was
run, so the test is a check on the parser rather than a transcript of it. The
extractor produced exactly that: **551 code units**, nesting preserved with the
inner level restarting at 1 and the outer continuing at 2, table rows joined,
footnote inline with its body appended, and the sentence reading *"The tidewater
sett is twenty ends per inch."* with `rarely` nowhere. The `w:delText` trap is
closed on a real Word document.

### Timing

Five consecutive runs through the whole pipeline, including the bounded archive
scan and the extraction worker: **199, 161, 180, 167, 201 ms**. Input 18,405 B,
**86,352 B inflated (measured)**, 551 code units. Dominated by worker startup.

**Scope of that figure:** it is documented at this 18 KB specimen's scale and is
not a claim about larger documents.

### Live persistence

Uploaded through the real file input on `next dev`: stored canonical text
**551 code units, identical to the offline extraction**. The tracked-changes
disclosure fired; the image disclosure was **correctly silent** — a negative
control on a real Word file.

Full record, including the production-build readings and the bounded-inflation
work: `.agent/docx-live-acceptance.md`.

### Carried forward, unchanged

- **The focused-workspace range exception**, as accepted at Stage 1 and recorded
  in `retrieval-followups.md` item 16. Not reopened.
- The deferred **page/text toggle** wart.
- The `knowledge/search` endpoint audit (unmounted caller, no user-visible
  impact) and the documented, untouched citation identity key — both accepted as
  recorded, with no change proposed.

---

# Stage 3 — YouTube (the risky one)

## 3a — Fetch-path instrument FIRST, and it gates the rest

A script that attempts caption acquisition across a set — public with captions,
auto-generated, disabled, non-English, long — through the candidate paths
(official Data API vs `timedtext` vs a transcript service), recording success
rate, formats, and segment quality.

**No production code until this reports.** If every path is unreliable, the
honest outcome is paste-a-transcript or STT-only, and that is better learned
from an instrument than from a feature that breaks weekly. Same pattern as the
verify-harness: build the thing that can say no before building the thing that
assumes yes.

The ToS and quota reasoning goes in the commit that lands the chosen path.

## 3a — REPORTED 2026-09-21, and accepted

Findings: `.agent/youtube-caption-paths.md`. Instrument:
`tools/youtube-caption-probe/`.

Outcome: **automatic acquisition is deferred by product decision.** It was not
universally disproven — the third-party library acquired captions for 6 of 6
captioned videos, and the official API's authenticated behaviour was never
measured. Rejecting the working path is a maintenance-risk judgement about a
false client identity against a private endpoint, and it could be reopened
without contradicting anything measured.

**3b–3d below are superseded by the amendment that follows, pending its
approval.**

---

## AMENDMENT — transcript import (PROPOSED, REVIEW ONLY)

**NOT APPROVED AND NOT IMPLEMENTED.** This is the revised scope, completed for
implementation approval. No code is written against it, and Stage 3b does not
begin until it is approved. STT remains separately gated under Stage 4.

**Settled within it:** the **fallback scope** (the ingestion table below) and
the **versioning decision** — that a transcript's version hash covers cue
timing, so a timing-only correction marks dependent wiki pages stale. Both were
approved 2026-09-21; the specification of the second is below, along with the
audit of existing `content_sha256` consumers it required.

Everything else here — serialisation layout, limits, cue rules — is proposed
and awaits this document's approval as a whole.

### What may be ingested, and what may be claimed

| Input | Ingested | Honest citation behaviour |
|---|---|---|
| Plain transcript text | yes | character-range citations into the transcript **only** |
| SRT/VTT **+** a supplied video URL | yes | transcript ranges **and** timestamp links derived from cues |
| A URL alone | **no** | refused until an acquisition path is approved |

**A URL alone is refused, not attempted.** No fetch, no "best effort", no
partial ingestion. The refusal names the workaround, and says nothing about why
captions could not be obtained, because nothing was tried.

### Provenance: the transcript is user-provided, and says so

Every transcript ingested this way is **labelled user-provided** wherever it is
surfaced — reader, citation, wiki compilation. This is not a disclaimer to bury.

**A supplied video URL is an association, not evidence.** **The importer cannot
verify that the transcript belongs to the video** — a user may paste any text
beside any URL, and no check available to the software distinguishes the cases.
**A person can verify it**, by watching the video at a cue's timestamp and
reading what the cue says; that is exactly what the known-example acceptance
does. Consequences the implementation may not soften:

- The association is recorded as **claimed**, never as verified.
- Timestamp links are **offered on the user's assertion** that the cues match
  the video.
- **The timestamp path must be accepted against a known example** — a video and
  its real caption file, where a cue's timestamp is checked **by a person** to
  land at the moment it claims. Until that acceptance runs, timestamp links are
  not shipped.

### Language and track provenance, recorded explicitly

The instrument found that the measured library returns the **first** track
rather than a chosen one, which silently produced Arabic and Chinese
transcripts for English videos. A supplied file has the same hazard in a
different form: nothing about an `.srt` states its language.

So the importer records, per source, as data rather than inference:

- **language** — declared by the user, or read from the file when the format
  carries it (VTT `Language:` header); never guessed from the text.
- **track kind** — whether the user says this is human-authored or
  machine-generated, **unknown** when not stated.
- **format** — plain / SRT / VTT, and the parser version, exactly as Stage 2
  records `parser_name` and `parser_version`.

`unknown` is a legitimate value and must not be defaulted into a claim.

### Cue handling — the rules the measurements force

- **Absolute cue timestamps are preserved**, as given. Never recomputed by
  accumulating durations: measured cues overlap on 99.9% of one ASR track, and
  arithmetic would drift the whole way through a long video.
- **Overlaps are preserved, not normalised away.** The overlap is what the
  source says.
- **Windows are cut on absolute offsets.** ~30–60 s is the target the
  measurements *support trying*, not a guarantee.
- **An oversized cue — longer than a window — is defined behaviour, not an
  assumption.** The observed maximum was 12.7 s, but nothing bounds it. A cue
  longer than a window becomes its own window rather than being split, so a
  citation's range never straddles a boundary that has no cue.
- **Repeated cue text is PRESERVED VERBATIM in v1. No automatic
  de-duplication.** This supersedes an earlier proposal here that a cue
  contained in its predecessor would contribute timing but not text. Removing
  repetition can change meaning — a line genuinely said twice is not a rolling
  artefact — and it breaks the character-to-time mapping, because a cue with no
  text of its own has no character range to key a citation on. Any later
  de-duplication is a **separately measured and separately versioned** change,
  not a v1 default.

### Oversized and malformed cues — defined, not assumed

- A cue **longer than a window becomes its own window**, never split. A window
  boundary inside a cue would give a citation a character range with no cue
  behind part of it.
- `endMs < startMs` is **malformed**: the file is refused. Not repaired, not
  reordered — a file whose timings contradict themselves is not one whose
  timestamps should be offered to a reader.
- `endMs === startMs` (zero duration) is **accepted and preserved**. It occurs
  legitimately and carries a position.
- Cues are kept in **file order**. Order is not sorted by start time, because
  re-sorting would silently rewrite a file whose cues overlap.

### Resource limits — chosen deliberately, and tested at the boundary

The instrument measured a 31-hour video at **46,959 cues and 1.7 MB** of text.
**That is an observed workload, not a justified maximum**, and the limits below
are not derived from it by arithmetic. They are choices, each with its headroom
over the observed case stated so the choice can be argued with:

| Limit | Proposed | Observed worst case | Reasoning |
|---|---|---|---|
| Payload bytes (paste or upload) | **8 MiB** | ~1.7 MB text, larger as SRT | ~4× headroom; refusal is cheap and pre-parse |
| Cue count | **100,000** | 46,959 | ~2× headroom; cue count drives per-cue work that bytes do not predict |
| Canonical text units | **4,000,000** | 1,696,642 | same ceiling DOCX extraction already enforces, so one number governs stored text |

**Each limit gets a boundary test**: a case at the limit that is accepted, and
a case one unit past it that is refused. A limit with no test at its edge is a
number, not a limit.

Refusal happens **before** the cost, as Stage 2's do: payload bytes before
parsing, cue count as cues are produced, text length before persistence.

### Versioning: timing is part of the version — APPROVED, specified here

**The problem.** Stage 3's staleness proof reuses `content_sha256`. If cue
timings sat outside it, re-importing a corrected caption file whose words are
identical but whose timings shifted would **not** change the hash: every citing
wiki page would keep a timestamp now pointing at the wrong moment, and nothing
would be flagged stale.

**Approved resolution.** The transcript's version hash covers a deterministic,
versioned representation of:

1. the **canonical transcript text**;
2. each cue's **character range** and **start/end time in integer
   milliseconds**;
3. **cue order, preserving overlaps**;
4. the **associated video identity**, when timestamp links depend on it.

#### What "normalised" means, and what it must never do

Normalisation is **units and serialisation only**. It must **never**:

- shift a timestamp,
- remove or merge an overlap,
- reorder cues,
- round away precision the source format supports.

Integer milliseconds is lossless for both formats: SRT writes
`HH:MM:SS,mmm` and VTT `HH:MM:SS.mmm`, both millisecond-precision. So parsing
to integer ms discards nothing either format can express. **A format that later
carries finer precision would need a new representation version, not silent
rounding.**

Consequences that must hold:

- **Equivalent spellings hash identically.** `00:00:01,500` (SRT) and
  `00:00:01.500` (VTT) are the same instant; so are `0:00:01.500`,
  `00:00:01.5`, and the same file with CRLF instead of LF line endings, or a
  trailing newline. All parse to `1500` and serialise one way.
- **Changed timing changes the hash**, even by one millisecond, even when every
  word is identical.
- **A changed video association changes the hash**, because timestamp links
  mean something different against a different video.

#### The serialised representation

A single UTF-8 byte string, fed to sha256. Written out here because "hash the
transcript and its timings" is not a specification:

```
line 1   knowledge-transcript\t<representationVersion>
line 2   video\t<videoIdentity | ->
line 3   text\t<utf8ByteLength>\n<canonicalText>
line 4   cues\t<cueCount>
then     <charStart>\t<charEnd>\t<startMs>\t<endMs>   -- one line per cue,
                                                          in file order
```

**Why the text is length-prefixed:** without it, a transcript whose own text
contains newlines and tabs could serialise to the same bytes as a different
transcript with a different cue layout — a collision built in by construction.
The length prefix makes the text opaque to the framing.

`representationVersion` is an integer inside the hashed bytes, so a future
change to this layout is a new version rather than a silent re-interpretation
of stored hashes — the same rule the extraction contract already follows.

**Everything needed to recompute the hash is stored**: canonical text, the cue
array with character ranges and integer-ms times in order, the claimed video
identity, and the representation version. A stored row can be re-hashed and
compared without re-parsing the original upload — and a test asserts exactly
that round trip.

#### Audit of existing `content_sha256` consumers

Done before proposing the change, because compatibility is a claim about code
that exists.

**The column is already an opaque per-kind fingerprint, not "the hash of the
text".** Two producers already disagree about what it hashes, which is the
finding that makes this a compatible extension rather than a redefinition:

| Producer | Hashes |
|---|---|
| PDF (`knowledgeIngestion.ts`) | the **raw uploaded file bytes** |
| Text / DOCX (`knowledgeTextUpload.ts`) | **UTF-8 of the canonical text**, via `knowledgeTextHashInput` |

Consumers, all of which treat it as opaque:

| Consumer | Use | Compatible? |
|---|---|---|
| `boardWikiPageSources.ts` `hasChanged` | inequality between recorded and current | **yes** — the staleness proof needs only "differs" |
| `boardWikiEditing.ts`, `boardWikiSourceVersions.ts` | record / read the value | **yes** |
| `knowledgePdfRenderPolicy.ts` `knowledgePageImageETag` | opaque ETag component | **yes**, and PDF-only |
| `knowledgeExtractionAdapters.ts` `p_expected_content_sha256` | optimistic concurrency, stored vs stored | **yes** |
| Database | `content_sha256 text NOT NULL` — no generated column, no CHECK, no unique index | **yes** |

**No consumer recomputes `content_sha256` from text**, so none needs an
adjustment. Had one existed it would have needed an explicit change, and this
row is what that audit was for.

`knowledgeTextHashInput` is the natural extension point: transcripts get their
own hash-input builder beside it, and the text and PDF paths are untouched.

**One consequence to accept knowingly, stated as what it is.** A transcript
imported as plain text hashes through the transcript representation (with zero
cues), **not** as bare canonical text. So the same characters uploaded as
`.txt` and pasted as a transcript produce different version hashes.

This is a **representation distinction, not a difference of source kind.** The
two may well share the same storage kind — as DOCX already shares `kind:
'text'` — and the differing hash reflects only that one was hashed through the
transcript representation and the other through the plain-text one. It is
deliberate, and flagged rather than buried, but it should not be read as a
claim that the two are different kinds of thing in the schema.

### Tests owed before this ships

| Test | Asserts |
|---|---|
| Equivalent formatting | SRT `,` vs VTT `.`, leading zeros, CRLF vs LF, trailing newline → **identical hash** |
| Timing-only change | identical words, one cue moved 1 ms → **different hash** |
| Changed video association | identical text and cues, different video → **different hash** |
| Text-only change (control) | identical timings, one word changed → different hash |
| Cue order | two cues swapped → different hash |
| Overlap preserved | overlapping cues survive a round trip unchanged |
| Repeated cue text | a repeated line is stored twice, verbatim |
| Reproducibility | re-hashing from the stored representation alone equals the stored hash |
| Boundary | each resource limit accepted at the limit, refused one past it |
| Staleness, end to end | timing-only re-import marks a citing wiki page **stale** |

### What this amendment does not include

- **No acquisition of any kind.** No fetch path, no URL-alone ingestion.
- **No STT.** Stage 4 stays separately gated.
- **No timestamp links** until the known-example acceptance passes.

---

## 3b — Ingestion (SUPERSEDED by the amendment above, pending approval)

Paste URL → validate id → fetch captions → document (`kind = 'youtube'`, url,
title, channel, duration) + chunks as caption segments grouped to ~30–60s
windows + version = transcript hash, reusing `content_sha256`. For a video, the
content **is** the transcript; the column's name is honest about what it hashes.

Char offsets into the stored transcript text are the identity, per Decision 0.
Segment start/end seconds go in `source_locators` jsonb, per Decision 6.

## 3c — Locator, reader, exporter

- The citation item gains `timeSeconds` — provenance-safe, verified above.
- **`okfResourceUri` loses its `default:` branch.** Today a new citation shape
  falls through to a bare `collabboard://board/<id>` — a valid-looking OKF
  `resource` pointing at the whole board instead of the moment in the video, with
  no compile error. After this, a new shape is a build failure, matching
  `boardAiCitationIdentityKey`. A video resource carries its moment.
- Open behaviour: **new tab at `t=` in v1.** No player state, no third-party
  embed in the app shell. Embed later if asked.

## 3d — No captions

Refuse with a sentence, never a summary. The message names the workaround
(upload the file — Stage 4).

## Acceptance — live, both consumers

A real video ingested; **chat cites it with a timestamp that lands at the right
moment**; the wiki compiles a page citing it; **re-ingesting after the transcript
changes flags the citing page stale** — the versioning proof, which works via
`content_sha256` as verified above.

- Control: a no-captions video is **refused with the message, not summarized**.
- Control: the OKF export of that wiki page carries the video's own resource URI,
  not the board's.
- Battery before/after, with the demotion check.

---

# Stage 4 — STT fallback (candidate, NOT committed)

Uploaded audio/video → transcription → the same chunks with time locators. This
is the door that covers a downloaded TikTok / IG / X file.

Named here so it is not re-asked. The provider decision belongs to its own GO.

---

# Decision 2 — the reader — reserved, with two things already known

Extend the existing drawer with kind-specific renderers vs new surfaces.
**Recommend extend;** citations already route through one callback.

Two facts the implementer needs before estimating:

1. **`KnowledgeSourceReaderDrawer` has TWO renderings, and one is an early
   return.** For the focused presentation it returns `PdfWorkspaceChrome`
   (`data-pdf-workspace="true"`) and never emits its own
   `<aside data-knowledge-reader="true">`. A kind-specific renderer added to the
   docked aside alone will show nothing in the workspace. Found live, not in
   review.
2. **Exporter exhaustiveness travels with this** — see 3c. It is a two-line
   change that converts a silent export defect into a build failure, and it
   belongs to whoever adds the citation shape.

---

# The battery is this unit's instrument

`scripts/db/boardSearchRankingPairs.test.ts` already carries stale constants and
an open question recorded in-file: **q02 sits exactly AT the per-source limit of
4**, so a fifth relevant row is silently dropped.

Every stage here adds competitors for those slots. That makes the limit question
**no longer deferrable** — it is this unit's instrument, not a person-step parked
for later.

**Every stage's acceptance carries battery before/after and states whether any
answer was demoted.** Same shape as the image admission in
`.agent/canvas-retrieval-units.md` Unit 2, which is the precedent for admitting a
new class of rows to a shared corpus and proving nothing already found was lost.

Regeneration will need the limit raised temporarily to see what the fifth row
would have been. A green run cannot distinguish "four was enough" from "four was
the ceiling", and that is the measurement the in-file note is asking for.

---

# Order and rationale

**1 → 2 → 3a (gate) → 3b/3c/3d → 4 parked.**

Stage 1 first because it settles storage and resolution for every kind after it.
Stage 2 second because it exercises the generalized pipeline and the reader
against a second real format at near-zero marginal risk. 3a gates YouTube
absolutely: if the instrument says the fetch paths are unreliable, 3b–3d do not
ship in this unit.

---

# Out of scope, stated

- **Direct TikTok / Instagram / X ingestion.** No caption API, and scraping
  violates ToS on a schedule. The universal door is Stage 4: any file →
  transcript.
- **Indexing link posts by title.** The same overclaim risk Unit 1 refused for
  images — a title is not content, and a citation to one asserts more than the
  corpus holds.
