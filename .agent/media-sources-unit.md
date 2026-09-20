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

## 3b — Ingestion

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
