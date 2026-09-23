# PATCH-157 — A transcript reads as prose, not as caption fragments

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. The complaint

The owner opened an imported YouTube transcript in the PDF reader and said the
text is hard to read. It is. The screenshot shows lines like:

```
if you're looking for openings  advice you've come to the right place
throughout the course of this video we're going  to cover basic intermediate and
advanced opening
concepts and so whatever your current rating  level is you're going to get something
out of it
```

Three defects, all presentational:

1. **A hard line break after every caption cue**, so sentences break mid-phrase
   and at a width nobody chose.
2. **Doubled spaces** inside lines — an artefact of YouTube's two-line cue
   layout being copied as one string.
3. **12px text on a 20px line** (`text-xs leading-5`), sized for a dense PDF
   page, across the reader's full width. No comfortable measure.

---

## 2. Why it looks like that (the mechanism, so nobody re-derives it)

A transcript's canonical text is built in
`lib/domain/knowledge/knowledgeTranscriptDocument.ts`:

```ts
export const KNOWLEDGE_TRANSCRIPT_CUE_SEPARATOR = '\n';
// ... canonicalText += KNOWLEDGE_TRANSCRIPT_CUE_SEPARATOR; canonicalText += cue.text;
```

One cue, one line. That string is then rendered by
`components/collabboard/KnowledgeDocumentDetails.tsx` in the page text root:

```tsx
<p {...{ [PAGE_TEXT_ROOT]: page.pageNumber }}
   className="select-text whitespace-pre-wrap text-xs leading-5 text-gray-700">
```

`whitespace-pre-wrap` honours every `\n` and every doubled space. That is
**correct for a PDF page**, whose line structure carries meaning, and wrong for
a transcript, whose line structure is an accident of how captions are timed.

---

## 3. THE CONSTRAINT THAT GOVERNS THIS PATCH

> **The canonical text must not change, and the DOM `textContent` of the page
> text root must still reconstruct `page.text` verbatim, character for
> character.**

This is not a style preference. Character offsets into that exact string are the
coordinate space for, at least:

- exact text selections (`captureExactSelection` measures against this root's
  `textContent` — the file says so, and the page visual is deliberately a
  *sibling* of the root for this reason);
- stored source references and standalone highlights (`charStart`/`charEnd`);
- Board AI citations and their arrival focus;
- **and, for a transcript only, the cue mapping** — `charStart`/`charEnd` on each
  placed cue is what turns a cited passage back into a timestamp, which is what
  makes a citation seek the video. A one-character drift silently sends a
  citation to the wrong second, and a wrong second is the failure a reader is
  least able to detect.

So: **reformat the rendering, never the string.** Anything that rewrites,
trims, joins or re-punctuates the text is out of scope and will be rejected.

This is also why the fix is CSS-and-grouping rather than text processing:
`white-space: normal` collapses the cue newlines and the doubled spaces
*visually*, and leaves the DOM text nodes — and therefore every offset —
byte-identical.

---

## 4. What to build

### 4.1 New pure module — `lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts`

```ts
export interface KnowledgeTranscriptReadingBlock {
  readonly charStart: number;
  readonly charEnd: number;
}

export const KNOWLEDGE_TRANSCRIPT_READING_BLOCK_TARGET_CHARS = 450;

export function knowledgeTranscriptReadingBlocks(
  text: string,
  targetChars?: number,
): readonly KnowledgeTranscriptReadingBlock[];
```

Behaviour:

- Cuts **only at line boundaries** (`\n`). Never mid-line, therefore never
  mid-cue, therefore never mid-word.
- Accumulates consecutive lines until the block would reach `targetChars`, then
  starts the next block at the following line.
- A single line longer than `targetChars` is its own block. Never split.
- **THE PARTITION INVARIANT, which is the whole safety argument:** the returned
  blocks are contiguous and in ascending order; `blocks[0].charStart === 0`;
  each `charStart` equals the previous `charEnd`; the last `charEnd ===
  text.length`. Every separator character belongs to exactly one block (the one
  it terminates). Consequently
  `blocks.map(b => text.slice(b.charStart, b.charEnd)).join('') === text`.
- Empty text returns an empty array.

No table name, no I/O, no React. Pure function over a string.

> Do **not** write the strings `knowledge_documents` or
> `knowledge_document_chunks` anywhere in the new files. A source tripwire
> (`knowledgeTranscriptWriters.source.test.ts`) pins the set of files naming
> those tables; this module is not a writer and must not join that set.

### 4.2 `highlightedText` gains a range, and keeps absolute offsets

In `components/collabboard/KnowledgeDocumentDetails.tsx`, add two optional
parameters to `highlightedText`: `rangeStart` and `rangeEnd`, defaulting to the
whole text.

- It emits **only** the pieces falling inside `[rangeStart, rangeEnd)`.
- **All offsets stay absolute against the full `text`.** Do not slice the string
  and rebase — rebasing is exactly where an off-by-one would hide, and the
  segments, matches and preview it receives are all in absolute coordinates
  already. Clamp, do not translate.
- React keys stay derived from the absolute offsets, so they remain unique
  across blocks.
- Called with the default range, its output must be **identical** to today's.

### 4.3 The page text root renders blocks for a transcript only

The root element, its tag, and the `PAGE_TEXT_ROOT` attribute **stay exactly
where they are** — that attribute *is* the coordinate root.

- **Not a transcript** (`transcriptRepresentation` is null/undefined): render
  precisely as today. One `highlightedText` call, `whitespace-pre-wrap
  text-xs leading-5`. The rendered DOM must be unchanged.
- **A transcript**: the root gets `whitespace-normal text-sm leading-7
  max-w-[68ch]`, and its children are one `<span data-transcript-reading-block="">`
  per block, `className="block"` plus bottom spacing (`mb-3` on all but the
  last), each rendering `highlightedText(..., block.charStart, block.charEnd)`.

`<span>` with `display:block` rather than a real block element, because the root
is a `<p>` and a `<p>` may not contain block-level children — and changing the
root's tag is off limits under §3.

The transcript flag is already available: `transcriptRepresentation` is an
existing prop on `KnowledgeDocumentDetailsProps`, and its comment already
explains that identifying a transcript belongs to the caller, not to a guess by
the reader. Use it; do not add a new prop and do not sniff the text.

---

## 5. Tests required

**`lib/domain/knowledge/knowledgeTranscriptReadingLayout.test.ts` (new)**

1. The partition invariant holds — `join('') === text` — for each of: empty
   string; one line with no newline; many short lines; a trailing newline;
   consecutive newlines (an empty cue); one line far longer than the target.
2. Blocks are contiguous and ascending, first starts at 0, last ends at
   `text.length`.
3. No block boundary falls inside a line: every `charEnd` except the last is
   immediately after a `\n` (or at `text.length`).
4. A line longer than the target is its own single block.
5. Grouping actually groups: a transcript of 40 short lines yields more than one
   block and fewer than 40.

**`components/collabboard/KnowledgeDocumentDetails.test.tsx` (extend)**

6. **THE GATE TEST.** For a document rendered *with* a
   `transcriptRepresentation`, the page text root's `textContent` equals
   `page.text` exactly — including its `\n` characters and doubled spaces.
   Write it so it would fail if a block dropped, duplicated or reordered a
   character.
7. That same render emits more than one `[data-transcript-reading-block]`.
8. A document rendered *without* a `transcriptRepresentation` emits **zero**
   `[data-transcript-reading-block]` elements, and its root still carries
   `whitespace-pre-wrap`.
9. A search match inside a transcript still renders its `<mark>`, and the root's
   `textContent` is still verbatim with the mark present.
10. A highlight/source segment spanning a block boundary still renders, and the
    root's `textContent` is still verbatim.

---

## 6. Allowed files

```
lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts        (new)
lib/domain/knowledge/knowledgeTranscriptReadingLayout.test.ts   (new)
components/collabboard/KnowledgeDocumentDetails.tsx
components/collabboard/KnowledgeDocumentDetails.test.tsx
```

**Forbidden — touching any of these is a hard stop:**
`lib/domain/knowledge/knowledgeTranscriptDocument.ts`,
`components/collabboard/knowledgeSourceTextSelection.ts`,
`components/collabboard/BoardAiChatDrawer.tsx`, anything under `lib/infra/`,
`app/api/`, `supabase/migrations/`, `package.json`, `package-lock.json`, and any
test file not listed above.

---

## 7. Verification

Run and report each, verbatim:

```
npx tsc --noEmit
npx vitest run lib/domain/knowledge/knowledgeTranscriptReadingLayout.test.ts
npx vitest run components/collabboard/KnowledgeDocumentDetails.test.tsx
npx vitest run
```

Gate on the full run: the set of **failing test files** must equal the 26 in
`.agent/verification-baselines.md` — counts may move, the set may not.
`KnowledgeDocumentDetails.test.tsx` is **not** a baseline member, so it must pass
outright.

Do not start a production build; a dev server is running.

---

## 8. Hard stops — stop and report, do not improvise

- Any change to `page.text`, or any `textContent` mismatch in test 6.
- The tripwire `knowledgeTranscriptWriters.source.test.ts` failing.
- A failing-file set that differs from the 26.
- Needing to edit a file outside §6.

---

## 9. Commit message (verbatim)

```
fix(knowledge): a transcript reads as paragraphs instead of caption fragments

An imported transcript is one cue per line, joined by "\n", which the reader
rendered with whitespace-pre-wrap at 12px -- so sentences broke mid-phrase and
YouTube's doubled spaces showed through.

The text itself is untouched, and that is the point: character offsets into it
are the coordinate space for selections, highlights, citations, and the cue
mapping that turns a cited passage back into a moment in the video. Only the
rendering changes. The page text root's textContent still reconstructs page.text
verbatim, which test 6 pins.

A transcript now renders as reading blocks cut at cue boundaries, with collapsed
whitespace and a comfortable measure. A PDF page renders exactly as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
