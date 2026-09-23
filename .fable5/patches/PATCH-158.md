# PATCH-158 — the transcript reads as paragraphs on the CANVAS CARD too

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Follows: PATCH-157 (landed, `4d9a3e3a`)

---

## 1. What PATCH-157 missed, and how

PATCH-157 made a transcript read as paragraphs in the reader. The owner looked
and said there was no difference — and they were right, because **this codebase
has TWO components that render a knowledge document's page text**, and 157 only
touched one:

```
components/collabboard/KnowledgeDocumentDetails.tsx   <- the reader. FIXED by 157.
components/collabboard/KnowledgePdfCanvasSurface.tsx  <- the CARD on the canvas. NOT fixed.
```

Both mark their paragraph with the same `PAGE_TEXT_ROOT` attribute — that is how
the second one was found, and it is the reliable way to find every one of them:

```
$ rg PAGE_TEXT_ROOT --glob '!*.test.*'
```

The card renders text through `data-knowledge-pdf-action="parsed-content"` (its
"parsed content" view) with:

```tsx
className="whitespace-pre-wrap break-words text-[9px] leading-snug text-gray-700"
```

`whitespace-pre-wrap` at **9px** — worse than the reader's 12px — and the file
contains no reference to a transcript at all. So a transcript shown on the card
still reads as ragged caption fragments.

**The lesson, and it is the point of this patch's existence:** a fix scoped by
*the file I happened to be reading* is not scoped by *the behaviour*. 157's spec
named one file because I looked for one renderer and stopped at the first. Before
declaring any rendering change complete, enumerate every renderer of that data by
its shared marker.

---

## 2. THE SAME CONSTRAINT, UNCHANGED

> **The canonical text must not change, and the DOM `textContent` of the page
> text root must still reconstruct the page's text verbatim.**

The card's paragraph is a coordinate root exactly as the reader's is — its own
comment says so:

> PAGE_TEXT_ROOT is the reader's coordinate-space marker: the capture measures
> offsets from this paragraph's start and reads its page number straight off this
> attribute.

So the card can create source clips and selections from this text, and the same
rule applies: **group and restyle, never rewrite.** See PATCH-157 §3 for the full
argument; it is not repeated here, it is inherited.

---

## 3. What to build

Reuse what 157 already built. Write no new domain logic.

### 3.1 The card learns whether it is showing a transcript

`KnowledgePdfCanvasSurface` already reads from `useKnowledgePageCache`, and the
cache entry already carries `transcriptRepresentation` (added before 157;
`knowledgeDocumentMetadata` validates it structurally in `KnowledgePageCache.tsx`).
Take it from there — the same source the reader's host uses.

Do **not** add a new prop threaded from the canvas, and do **not** infer
"transcript" from the absence of page images or from the text's shape. The
representation is the only flag, for the reason `KnowledgeDocumentDetailsProps`
already records: a guess would eventually call a pageless text file a transcript.

### 3.2 The text view renders reading blocks for a transcript only

Import `knowledgeTranscriptReadingBlocks` from
`lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts` (built and tested in
157 — do not modify it).

- **Not a transcript:** render exactly as today. Byte-identical DOM.
- **A transcript:** the root keeps its tag, its `PAGE_TEXT_ROOT` attribute, its
  `data-no-drag="true"` and its `data-knowledge-pdf-page-text="true"` exactly
  where they are, and gains `whitespace-normal` in place of `whitespace-pre-wrap`,
  with a readable size for a card — `text-[11px] leading-6` — keeping
  `break-words`. Its children become one
  `<span data-transcript-reading-block="" className="block">` per block
  (`mb-2` on all but the last).

`data-no-drag` is load-bearing and must stay on the root: the card's comment
explains it is what stops a text selection from dragging the card.

### 3.3 The segment renderer takes a range

The card renders its highlight segments inline in the JSX via
`knowledgeStandaloneHighlightSegments(...).map(...)`. Give that mapping a range
the same way 157 did in the reader:

- Emit only pieces inside `[blockStart, blockEnd)`.
- **Offsets stay ABSOLUTE and are clamped, never rebased.** A rebased offset is a
  clip or a citation pointing at the wrong character.
- Extract the mapping into a small local helper if that keeps it readable; keep it
  inside this file.

If any arrival/focus ref or emphasis exists on this surface, apply 157's settled
split: **emphasis on every piece, the scroll anchor only on the piece holding the
true start.** If no such ref exists here, say so in the report rather than
inventing one.

---

## 4. Tests

Extend `components/collabboard/KnowledgePdfCanvasSurface.test.tsx`.

1. **THE GATE.** With a transcript representation and the card in its text view,
   the page text root's `textContent` equals the page text exactly — every `\n`,
   every doubled space. Use a fixture long enough to produce **at least 3 blocks**,
   asserted by calling `knowledgeTranscriptReadingBlocks` in the test, so the test
   fails loudly if the target constant or the fixture drifts into the one-block
   case. (157's first attempt used a 304-character fixture that silently produced
   one block and exercised none of the new path. Do not repeat it.)
2. More than one `[data-transcript-reading-block]` is emitted.
3. Without a transcript representation: **zero** blocks, root still carries
   `whitespace-pre-wrap` and `text-[9px]`, `textContent` verbatim.
4. The root still carries `data-no-drag="true"` and `PAGE_TEXT_ROOT` in the
   transcript case.
5. A highlight segment straddling a block boundary still renders, in more than one
   block, with `textContent` still verbatim. Derive the range from the computed
   block boundaries — do not hardcode offsets.

Test 3 must fail if the transcript branch is applied unconditionally. Confirm it
does, by temporarily forcing the branch, exactly as you confirmed 157's test 12.

---

## 5. Allowed files

```
components/collabboard/KnowledgePdfCanvasSurface.tsx
components/collabboard/KnowledgePdfCanvasSurface.test.tsx
```

**Forbidden:** `lib/domain/knowledge/knowledgeTranscriptReadingLayout.ts` (landed
and tested — reuse, do not touch), `KnowledgeDocumentDetails.tsx`,
`KnowledgePageCache.tsx`, `knowledgeSourceTextSelection.ts`, anything under
`lib/infra/`, `app/api/`, `supabase/migrations/`, `package.json`, and any test file
not listed above.

---

## 6. Verification

```
npx tsc --noEmit
npx vitest run components/collabboard/KnowledgePdfCanvasSurface.test.tsx
npx vitest run
```

**Note:** `KnowledgePdfCanvasSurface.test.tsx` **IS** a member of the 26-file
baseline. So the file-set gate is blind here by construction — §1 of
`.agent/verification-baselines.md` requires it: **diff that file's failing test
NAMES against the baseline's 56 and confirm they are the same ones**, and report
the names. A new failure inside it would otherwise pass the gate unnoticed.

No production build; a dev server is running.

---

## 7. Hard stops

- Any `textContent` mismatch, or any change to the page text.
- A failing-file set differing from the 26, or new failing test NAMES inside
  `KnowledgePdfCanvasSurface.test.tsx`.
- Needing a file outside §5.

---

## 8. Commit message (verbatim)

```
fix(knowledge): the transcript reads as paragraphs on the canvas card too

PATCH-157 fixed the reader and the owner saw no change, because this codebase has
TWO renderers of a document's page text and 157 touched one. The card's parsed-
content view rendered whitespace-pre-wrap at 9px with no transcript awareness at
all. Both roots carry PAGE_TEXT_ROOT, which is how the second one was found and
how the next one should be.

Same constraint as 157, inherited not restated: the text is untouched and the
root's textContent still reconstructs it verbatim, because this paragraph is a
coordinate root too -- source clips and selections measure offsets from it. Only
grouping and CSS change, reusing 157's reading-layout module unmodified.

The test fixture is asserted to produce at least three blocks, so it cannot
silently collapse to the one-block case that left 157's first attempt exercising
none of its own new code.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
