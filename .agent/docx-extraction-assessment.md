# Stage 2 assessment — what text a DOCX becomes

**Assessment only.** No production integration, no database applies, no
dependency added to `package.json`. Everything below that is labelled VERIFIED
was produced by running a parser on a specimen during this assessment;
everything labelled INTENDED is a proposal that no code implements yet.

Written 2026-09-20, against the Stage 2 GO's pinned constraints.

---

## Summary of what this assessment concludes

1. **Point 3 comes back POSITIVE.** `kind: 'text'` can carry DOCX format
   identity with **no schema change**. The columns already exist and already
   mean the right things. Two hardcoded values in the text upload path need
   changing, and neither is a migration.
2. **`mammoth.extractRawText` is not a candidate.** It silently drops footnote
   content entirely and welds words together across a line break. Both were
   verified, not inferred.
3. **The extractor should be ours, over `mammoth.convertToHtml`'s structured
   output** — or over the XML directly. The structure Stage 1's contract needs
   is present in the file and is available from mammoth's HTML; it is only the
   raw-text convenience function that throws it away.
4. **Extraction must happen BEFORE canonicalisation**, which is an ordering
   change to the existing pipeline, not an addition to it.
5. **The heading rule cannot be "detect `w:pStyle`".** Verified against the
   only two real Word-authored documents available here: neither contains a
   single `w:pStyle` element.

---

## Specimens

Three synthetic fixtures, authored for this assessment, plus two real
Word-authored documents.

| Specimen | Origin | Carries |
|---|---|---|
| `structured.docx` | authored with the `docx` writer (v9.6.1) | H1/H2, paragraphs, bulleted list with a nested level, numbered list, 2×2 table, footnote, one empty paragraph |
| `revisions.docx` | the above, with hand-written OOXML injected | tracked insertion, tracked deletion, comment anchored over a range, comment body |
| `breaks.docx` | the above, with hand-written OOXML injected | `<w:br/>`, `<w:tab/>`, trailing spaces, smart quotes, em dash, NBSP, an astral character |
| two real files | Microsoft Office Word 16.0 (`docProps/app.xml`) | see the structural note below — **their content is deliberately not reproduced anywhere in this document or in the repo** |

The fixtures live in the session scratchpad, not in the repo. If Stage 2 is
implemented, the generators should be committed as test fixtures — that is a
decision for the implementation GO, not something this assessment does.

**`docx` (v9.6.1, already a dependency) is a WRITER, not a reader.** It appears
here only as a specimen generator. It is not a candidate extractor.

### How expected text was established

Per the GO: **the expected text was derived by reading each document's own
XML**, not by reading any parser's output. `word/document.xml` was unzipped and
read paragraph by paragraph — style, numbering reference and level, and the
ordered `w:t` pieces — with tables, `word/footnotes.xml` and `word/comments.xml`
enumerated separately. Parser output was then compared against that reading.

One thing that check caught immediately, and a parser-first method would not
have: **the empty paragraph is written `<w:p/>`, self-closing.** A reader that
matches `<w:p …>…</w:p>` misses it, counts 17 paragraphs instead of 18, and
every offset after that point is wrong while the text still looks plausible.

---

## VERIFIED — `mammoth` 1.12.3, run on the specimens

Installed into the scratchpad with `--no-save`. `package.json` is untouched.

| Feature | `extractRawText` | `convertToHtml` |
|---|---|---|
| Paragraph separator | `\n\n` | `<p>` |
| Heading level | **LOST** — identical to a paragraph | `<h1>`, `<h2>` |
| List marker | **LOST** — no bullet, no number | `<ul>`, `<ol>` |
| List nesting | **LOST** — level 1 identical to level 0 | nested `<ul>` |
| Table boundaries | **LOST** — cells become paragraphs in row-major order | `<table><tr><td>` |
| Footnote body | **DROPPED ENTIRELY** | present, as a trailing `<ol><li>` |
| Comment body | dropped | dropped |
| Tracked insertion | **included** (correct) | included |
| Tracked deletion | **excluded** (correct) | excluded |
| `<w:br/>` | **NO SEPARATOR — words weld together** | `<br />` |
| `<w:tab/>` | `\t` | preserved |
| Empty paragraph | an extra `\n\n` | `<p></p>` |
| NBSP (U+00A0) | preserved as U+00A0 | preserved |
| Astral character | preserved as a surrogate pair | preserved |
| Trailing spaces | preserved | preserved |

Exact observed output for the line-break case:

```
"Line oneLine two"
```

and for the table, which is the shape a citation would land in:

```
"Sett table\n\nYarn\n\nSett\n\n8/2 cotton\n\n20 epi\n\nAfter the table."
```

A passage cited out of that cannot tell a header cell from a value, and
`Yarn` reads as a one-word paragraph of prose.

**The footnote loss is the disqualifying one.** `Measured on a four-shaft table
loom.` exists in the document, is visible in `convertToHtml`, and does not
appear in `extractRawText` at all. A source ingested that way is searchable and
quotable in every part except the ones the author footnoted, with nothing
anywhere saying so. That is the same defect shape this unit has hit three times
— a confident answer drawn from less than the reader believes it has.

### VERIFIED — the trap a naive extractor falls into

Scraping every text node, rather than `w:t` only, includes `w:delText` —
the text the author **deleted**:

```
naive (w:t + w:delText) : "The sett is usually never 20 epi."
w:t only                 : "The sett is usually 20 epi."
```

The document says the sett is usually 20 epi. The naive reading says it is
never 20 epi. **An extractor that gets this wrong does not produce garbage; it
produces a fluent sentence asserting the opposite of the source**, and it would
be cited with a character range pointing exactly at it.

### VERIFIED — the two real Word documents

Reported structurally only; no content from either file appears here, in the
repo, or in any committed artifact.

| | File A | File B |
|---|---|---|
| Producer | Microsoft Office Word 16.0 | Microsoft Office Word 16.0 |
| `w:p` | 24 | 13 |
| `w:pStyle` | **0** | **0** |
| `w:numPr` / `w:ilvl` | 0 | 5 / 5 |
| direct bold runs | 0 | 7 |
| explicit `w:sz` | 0 | 41 |
| `w:br`, `w:tab`, `w:hyperlink`, `w:instrText` | 0 | 0 |

**Neither real document contains one `w:pStyle`.** File B has a list and formats
its emphasis directly. A heading rule written as *"`w:pStyle` beginning
`Heading` becomes `#`"* would produce a completely flat document for both, and
would look correct on every synthetic fixture.

Two files is a small sample and I am not generalising from it. What it
establishes is narrower and sufficient: **style-based heading detection cannot
be assumed to work, and the contract must say what happens when it finds
nothing.**

---

## Point 3 — format identity without a schema change

**VERIFIED by reading the schema and the Stage 1 migration.**

`knowledge_documents` already carries, and the Stage 1 migration's own column
comments already define:

| Column | Comment as shipped | Carries for DOCX |
|---|---|---|
| `original_filename` | "the DISPLAY NAME of the source… for an uploaded file it is the filename" | `notes.docx` |
| `mime_type` | "the uploaded file's media type, or NULL for a kind that has no uploaded file" | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `storage_path` | "where the uploaded bytes live" | the retained original blob |
| `file_size_bytes` | size of the uploaded file | as uploaded |
| `content_sha256` | — | hash of the canonical text, as Stage 1 |
| `parser_name`, `parser_version`, `parser_options_hash` | present since the 2026-08-20 foundation | see point 5 below |

**So the recommendation is: reuse `kind: 'text'`. Do not widen the CHECK and do
not add a kind.** `kind` answers *how is this read* — pageless, character
ranges, the text reader — and a DOCX answers that identically to a `.md`. The
format is answered by `mime_type`, and the bytes are still there.

This also supersedes the lost GO line "docx gets its own kind", as directed.

### The two code-level changes it needs — neither is a migration

**VERIFIED by reading `lib/domain/knowledge/knowledgeTextUpload.ts`:**

1. `buildKnowledgeTextStoragePath` returns `knowledge/{board}/{doc}/original.txt`
   — a **hardcoded `.txt`**. A retained `.docx` blob would be stored under a
   filename claiming to be plain text.
2. The upload call is `deps.storage.upload(storagePath, bytes, 'text/plain')` —
   a **hardcoded content type**. The retained blob would be served as
   `text/plain`, which is wrong for a zip container and would break any future
   download-the-original affordance.

Both should take the source's real extension and media type. Neither touches
the database.

### The ordering change, which is the real architectural point

**VERIFIED:** `canonicalizeKnowledgeText` decodes with
`new TextDecoder('utf-8', { fatal: true })`. A DOCX is a ZIP container, so it
**will throw** on that decode — correctly, and by a rule Stage 1 chose
deliberately.

So the pipeline cannot be "route `.docx` into the existing text path". It must
be:

```
bytes → [extract to text]  → canonicalise → hash → chunk → persist
         ^ new step, per format
```

For `.txt`/`.md` the extraction step is the identity function, which keeps
Stage 1's behaviour bit-for-bit. **INTENDED:** this ordering is worth stating in
the implementation GO explicitly, because the tempting shortcut — canonicalise
first, extract on failure — would make a corrupt DOCX indistinguishable from a
mis-encoded text file.

---

## INTENDED — the proposed extraction contract

Nothing below is implemented. Every rule is stated so it can be argued with
before it becomes offsets.

**Proposed extractor:** our own module over `mammoth.convertToHtml`'s output,
or over `word/document.xml` directly via `jszip` (3.10.1, already a dependency)
and `@xmldom/xmldom` (0.8.11, already present). Recommendation:
**own the XML walk.** Reasons: the contract below needs footnote bodies, table
boundaries and list levels, which means post-processing mammoth's HTML anyway;
going through HTML adds an escaping/unescaping round-trip between the source
and the offsets; and the `w:delText` trap must be handled explicitly whichever
route is taken. `mammoth` remains the better choice if breadth of real-world
Word quirks matters more than contract control — that is the trade to decide at
the implementation GO, and I am not deciding it here.

### Block order and separators

- Blocks are emitted in **document order**, exactly as `word/document.xml`
  gives them. No reordering, no hoisting.
- Blocks are separated by **exactly one `\n`**. Stage 1's canonical form has no
  concept of a paragraph; it has lines. `\n\n` would double every gap after
  normalisation and inflate every offset.
- An **empty paragraph emits an empty block** — one more `\n`. It is in the
  document and it changes the offsets; dropping it is a silent shift.
- `<w:br/>` emits `\n`. **Verified as the concrete defect** in
  `extractRawText`, which emits nothing.
- `<w:tab/>` emits `\t`.
- Text inside `w:t` is taken verbatim: trailing spaces, NBSP, smart quotes, em
  dashes and astral characters all survive. Stage 1's canonicaliser then does
  its own normalisation, and it is the only thing allowed to.

### Headings

- **Proposed:** a heading emits `#`×level + space + its text, matching what the
  text reader already renders for Markdown.
- Detected by `w:pStyle` matching `Heading{n}` / `Title`.
- **When no styles are present — the real-document case — no heading is
  detected and every paragraph is a paragraph.** Explicitly NOT inferred from
  bold or font size: that is a guess about intent, and a wrong guess puts a
  structural marker in the middle of the offsets.
- The contract must say this out loud, because the failure is invisible: a flat
  document reads as a document with no headings.

### Lists

- **Proposed:** `- ` for a bulleted item, `1. ` for a numbered item, indented
  two spaces per `w:ilvl` level.
- The emitted number is the **item's ordinal within its level**, not Word's
  computed label. Word's label depends on `numbering.xml` restart rules, and
  reproducing it exactly is a rendering problem, not an extraction one.
- **Open question for the GO:** whether the marker belongs in the text at all.
  It is inside the citable range, so a citation covering a list item includes
  `- `. Markdown-shaped is the recommendation because the reader already reads
  the rest of the corpus that way.

### Tables

- **Proposed:** each row emits one block; cells are joined by ` | `; the cell
  text has internal newlines collapsed to a space.
- A table emits a **blank block before and after**, so a cited passage cannot
  silently run from prose into tabular data.
- No header detection. Word does not reliably mark one.
- **The honest limitation to state:** a table is prose-shaped after this, and a
  wide table will chunk badly. It is legible, it is citable, and it is not a
  table any more.

### Footnotes and endnotes

- **Proposed:** the reference emits `[^n]` inline; the bodies are emitted as a
  block at the **end of the document**, each as `[^n]: text`.
- `n` is the sequence in document order, not the Word footnote id (which is
  arbitrary and reuses `-1`/`0` for separators).
- **This is the part `extractRawText` gets wrong and it is why it is
  disqualified.** Footnotes carry the qualifications and sources — precisely
  the content a citation-first product must not lose.
- Endnotes follow the same rule, in their own trailing block.

### Comments

- **Proposed: excluded from the canonical text**, with the anchored body text
  kept (it is ordinary document text and is unaffected).
- Rationale: a comment is discussion *about* the document, by someone who may
  not be its author, and admitting it would let a reviewer's aside be cited as
  the document's own assertion.
- This matches mammoth's behaviour in both modes, **verified** — but it is
  being adopted as a decision, not inherited as a default.

### Tracked changes

- **Proposed: the ACCEPTED state.** Insertions (`w:ins`) are included;
  deletions (`w:del`/`w:delText`) are excluded.
- **Verified** as mammoth's behaviour in both modes, and verified as the trap a
  naive all-text-node walk falls into.
- An own-the-XML extractor must handle this explicitly, with the negative test
  the trap above provides: the specimen must not produce the word `never`.

### Unsupported content

- **Proposed:** content with no text — images, charts, shapes, embedded
  objects, equations — **emits nothing at all**, not a placeholder.
- A placeholder is text that is not in the document, and every character of it
  shifts every offset after it while looking like content.
- **Open question for the GO:** whether a document that is *mostly* such
  content should be refused at upload the way empty text already is. A DOCX of
  30 screenshots currently extracts to almost nothing and would be admitted as
  a nearly-empty source. Stage 1 already refuses empty text; this is the same
  decision one step out, and it is the one I would most want answered before
  implementation.
- Field codes (`w:instrText`) emit nothing; their displayed result is ordinary
  `w:t` and is kept. Neither real specimen contains any, so this rule is
  **INTENDED and untested** — flagged as such.
- Headers, footers and footnote separators are excluded. Page furniture repeats
  on every page and has no place in a pageless document.

---

## Point 5 — where the versions are recorded

**VERIFIED:** `knowledge_documents` already has `parser_name`,
`parser_version` and `parser_options_hash`, present since the 2026-08-20
foundation, already mapped through `mapKnowledgeDocumentRow`, and already
written by the PDF path through its extraction RPC. **The text path writes none
of them** — they are NULL for every Stage 1 text document.

**Proposed, no schema change:**

| Column | Holds | Example |
|---|---|---|
| `parser_name` | the extractor module's stable id | `knowledge-docx-ooxml` |
| `parser_version` | the extractor's own version | `1` |
| `parser_options_hash` | **the extraction-contract version** | `docx-contract-1` |

The third is the one that matters for offsets. Every rule in this document is
part of a numbered contract; **changing any of them changes what the text is,
and therefore invalidates every stored range against documents extracted under
the old rules.** Recording the contract version per document is what makes that
detectable later instead of silently wrong — an existing range and a re-extracted
document either agree on the contract id or they do not.

**Proposed for Stage 1 parity:** the text path should start writing these too
(`knowledge-text-identity` / contract `text-contract-1`), so a text document
and a DOCX are distinguishable after the fact by more than their filename.

---

## What this assessment did NOT establish

- **No real Word document with a table, a footnote, a comment or a tracked
  change was available.** Those behaviours are verified against
  hand-authored OOXML only. The XML is valid and matches the ECMA-376 element
  names, but Word's own output may carry structures these fixtures do not.
- **The two real specimens are simple**, and both lack `w:pStyle`. That is
  evidence about one authoring style, not about Word generally.
- **No performance measurement.** Nothing here says what a 200-page DOCX costs
  to extract, or whether it belongs in the request path — and Stage 1's
  extraction is synchronous inside the upload.
- **Field codes, hyperlinks, `w:sdt` content controls and equations are
  untested** — absent from every specimen.
- **Nothing was run against the database, and no dependency was added.**

---

## What the implementation GO needs to answer

1. **Extractor:** own the XML walk, or post-process `mammoth.convertToHtml`?
   Recommendation: own the walk, for contract control.
2. **List markers in the citable text** — yes (Markdown-shaped) or no?
3. **Refuse a DOCX that extracts to almost nothing?** The Stage 1 empty-text
   refusal already exists; this is the same decision for a document whose
   content is images.
4. **Does the text path start writing `parser_*` too**, for parity?
5. If any of this needs a column after all, that is a migration — **and I do not
   apply migrations.**
