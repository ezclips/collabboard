# PATCH-160 — a readable transcript: the model supplies punctuation, never words

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Follows: PATCH-159 (landed, `71839465`)

---

## 1. Where this stands, and what is left

PATCH-159 made a transcript render as paragraphs. The owner looked and said the
paragraphs break mid-sentence. They do, and it is not a bug in the grouping:

- the text has **no punctuation** — YouTube's auto-captions carry none;
- and it has **no pause information** either. Measured on the owner's real
  transcript (92 cues, 8m50s): **every gap between consecutive cues is exactly
  0 ms**. All 91 of them. The captions are wall-to-wall.

So there is nothing in the data to break on, and the breaks are arbitrary by
necessity. The only way to make them mean something is to put sentences in.

---

## 2. Research, and the design it produced

Done before specifying, per `development-workflow.md` step 0.

**The task has a name:** punctuation restoration, plus truecasing. Prior art:
[punctuator2](https://github.com/ottokart/punctuator2),
[xashru/punctuation-restoration](https://github.com/xashru/punctuation-restoration),
[fullstop-punctuation-multilang](https://huggingface.co/oliverguhr/fullstop-punctuation-multilang-large),
[Cadence](https://arxiv.org/html/2506.03793v1).

**Finding 1 — the commercial path is closed to us.** Deepgram, AssemblyAI,
Whisper and Otter punctuate from the AUDIO during transcription, using acoustic
cues. We have text only, and (see §1) no timing signal in it. We are in the
text-only regime.

**Finding 2 — and this is the one that sets the design. An LLM asked to
punctuate WILL sometimes change words.** It is a documented failure, not a
hypothetical, and the guardrails shipped in the wild are loose: accept if ~60%
of content words survive, or if output length is within 0.5–1.5× of input. Both
would pass real corruption.

**Finding 3 — the robust designs never let the model write the text.** The
released models are token classifiers: for each word, predict the punctuation
that follows it. Word preservation is then structural, not checked. A variant
uses [an LLM purely as a scoring function](https://arxiv.org/html/2606.05179),
keeping the word sequence fixed by construction (0.893 F1 with no fine-tuning).

**Finding 4 — the ready-made option, considered and rejected.**
[punctuation-restore](https://github.com/jparkerweb/punctuation-restore) (MIT,
Node, ONNX) wraps
[punctuation_fullstop_truecase_english](https://huggingface.co/1-800-BAD-CODE/punctuation_fullstop_truecase_english)
(Apache-2.0). Rejected because that model is trained on news crawl and its own
card warns it "may not perform well on conversational or informal data" — the
related model's sentence-boundary F1 falls from >99.5% on news to <90% on
subtitles, and our content is casual speech, the worst case. It would also add
`onnxruntime-node` plus a runtime model download from HuggingFace.

### THE DESIGN: take the structure from finding 3, the model from what we have

The AI returns punctuated text. **We do not use its text.** We walk the
ORIGINAL words and take only its punctuation and its capitalisation, rebuilding
the output from the owner's words. If its word sequence does not match ours,
that chunk is refused and stays raw.

This is strictly stronger than "generate, verify, accept or reject": it repairs
harmless drift and still refuses real corruption, and every character of every
word in the output provably came from the original.

---

## 3. THE CONSTRAINT

> **The canonical transcript text is never modified, never replaced, and never
> written to.** The readable text is derived, held in memory for the session,
> and rendered instead of the raw text only while the reader asks for it.

Character offsets into the canonical text are the coordinate space for
selections, stored highlights, Board AI citations, and the cue mapping that
turns a cited passage into a moment in the video. The readable text has
DIFFERENT offsets by construction. Therefore:

- Nothing derived from the readable view may ever be saved as a source range.
- **While a citation or highlight is being shown, the raw view is forced.** A
  highlight is a character range in the canonical text; painting it on the
  readable text would paint the wrong words. The toggle is disabled with a short
  reason while `highlight` is non-null.

Nothing is persisted by this patch. No migration, no schema change, no new
route. (Persisting the readable text is a later decision and the operator's.)

---

## 4. What to build

### 4.1 `lib/domain/knowledge/transcriptPunctuationProjection.ts` (new, pure)

```ts
export interface PunctuationProjection {
  readonly text: string;
  /** Words whose capitalisation the model changed. Diagnostics only. */
  readonly recasedWords: number;
  readonly insertedMarks: number;
}

export function projectTranscriptPunctuation(
  original: string,
  modelOutput: string,
): Result<PunctuationProjection, DomainError>;
```

**Word comparison.** Split both on whitespace; for each token strip every
character that is not a letter, digit or apostrophe; lowercase. The two
sequences must be **exactly equal, same length, same order**. Any difference →
`err`, naming the first index that differs. No thresholds, no percentages —
finding 2 is exactly why.

**Reconstruction.** Emit, in order, for each original word:
- the ORIGINAL word's characters, except that its FIRST character may be
  upper/lower-cased to match the model's. **No other character may come from the
  model**, ever;
- then the punctuation run the model placed after that word — only from the set
  `. , ? ! ; : —` and the straight/curly apostrophe already inside words is not
  touched. Anything else the model emitted between words is DROPPED, not copied.

Spacing: single space between words; no space before a mark; sentence marks
followed by one space. Never a newline (paragraphing is §4.3's job).

**Allowed punctuation is a closed, exhaustive set declared as a `Record`**, not
an array — arrays widen silently and that is what shipped PATCH-156 Part A dead.

### 4.2 `transcriptPunctuationChunks`

In the same module:

```ts
export function transcriptPunctuationChunks(
  text: string, maxChars?: number,
): readonly { charStart: number; charEnd: number }[];
```

Cuts **only at newline (cue) boundaries**, accumulating to `maxChars`
(default 3000 — the route caps `selectedText` at
`TEXT_ACTION_SELECTED_TEXT_MAX = 4000`). Same partition invariant as
`knowledgeTranscriptReadingBlocks`: contiguous, ascending, first at 0, last at
`text.length`, `join('') === text`. Reuse that function's proven shape; do not
modify it.

Each chunk is sent, projected and accepted or refused **independently**. One bad
chunk renders raw; it never invalidates the rest.

### 4.3 `readableTranscriptParagraphs`

Also in the module. Once sentences exist, paragraphs stop being arbitrary:

```ts
export function readableTranscriptParagraphs(
  text: string, targetChars?: number,
): readonly { charStart: number; charEnd: number }[];
```

Cuts **only after a sentence-ending mark followed by a space** (`.`, `?`, `!`),
accumulating to ~600 chars. Same partition invariant. If the text contains no
sentence end, the whole text is one paragraph — never an arbitrary cut.

### 4.4 `KnowledgeTextSourceView` — the button and the two views

- Rendered **only for a transcript** (`transcriptRepresentation` non-null), so a
  Markdown or .txt source is untouched.
- A control with two states: **As spoken** (default, today's render) and
  **Readable**. First press runs the request; afterwards it is a free toggle.
- While loading: the raw text stays on screen with a quiet status. Never a blank
  pane.
- Each chunk POSTs `/api/ai/text-action` with
  `{ action: 'custom', selectedText: <chunk>, instruction: <the fixed
  instruction>, purpose: AI_ROLE_SOURCE }` — the same route and role the source
  AI panel already uses. Requests are abortable and generation-guarded, exactly
  as `KnowledgeSourceAIPanel` does it; copy that shape, do not invent another.
- The instruction states: add only punctuation and capitalisation; do not add,
  remove, reorder or change any word; return only the punctuated text.
  **The instruction is a request, not the guarantee — §4.1 is the guarantee.**
- **Refused chunks are visible, not silent.** A chunk that failed projection
  renders its raw text and the view shows a single quiet line naming how many
  chunks kept their original wording. Never present a partial result as complete.
- In Readable mode, paragraphs come from §4.3.
- The toggle is **disabled while `highlight` is non-null**, with a short reason
  (§3).

---

## 5. Tests

**`transcriptPunctuationProjection.test.ts` (new)** — the heart of the patch.

1. Punctuation only added → output words identical to input words; marks appear.
2. **A model that CHANGES a word is refused.** ("bishop" → "rook".)
3. **A model that ADDS a word is refused.** **A model that DROPS one is refused.**
4. **A model that reorders two words is refused.**
5. A model that returns a summary, an apology, or a preamble is refused.
6. Capitalisation of a word's first letter is taken; **a model altering any
   other character of a word is refused** (e.g. "openings" → "opening's" is a
   word change, not punctuation).
7. Punctuation outside the allowed set is dropped, not copied.
8. **The projected text's word sequence always equals the original's** —
   assert it as a property over several hundred generated cases, including
   adversarial model outputs. This is the patch's safety claim; test it as one.
9. `transcriptPunctuationChunks`: partition exact for empty, one line, many
   lines, trailing newline, consecutive newlines, and an over-long single line.
10. `readableTranscriptParagraphs`: cuts only after sentence ends; partition
    exact; text with no sentence end yields exactly one paragraph.

**`KnowledgeTextSourceView.test.tsx` (extend)**

11. No transcript representation → **no button at all**, render unchanged.
12. Pressing it chunks and posts; each request body carries only the four fields
    in §4.4 — assert **no document id, board id, cue data or offsets are sent**.
13. A refused chunk renders its RAW text, and the notice names the count.
14. All chunks refused → the view is the raw transcript plus the notice; it must
    NOT silently look like a successful result.
15. Toggling back to As spoken restores the canonical text verbatim
    (`textContent` equality, as PATCH-159's gate does).
16. `highlight` non-null → the toggle is disabled and the raw view is shown.
17. A failed request (non-200, timeout) leaves the raw text on screen and says so.

---

## 6. Allowed files

```
lib/domain/knowledge/transcriptPunctuationProjection.ts        (new)
lib/domain/knowledge/transcriptPunctuationProjection.test.ts   (new)
components/collabboard/KnowledgeTextSourceView.tsx
components/collabboard/KnowledgeTextSourceView.test.tsx
```

**Forbidden:** `knowledgeTranscriptReadingLayout.ts` (landed, reuse unmodified),
`app/api/`, `lib/infra/`, `supabase/migrations/`, `package.json`,
`package-lock.json`, `KnowledgeDocumentDetails.tsx`,
`KnowledgeSourceReaderDrawer.tsx`, and any test file not listed.

**No new dependency.** If you believe one is required, stop and report.

---

## 7. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/knowledge/transcriptPunctuationProjection.test.ts
npx vitest run components/collabboard/KnowledgeTextSourceView.test.tsx
npx vitest run
```

Failing FILE set equal to the 26 baseline; neither named file is a baseline
member, so both must pass outright.

**AND, AS IN PATCH-159, THE THING NO GATE CAN CHECK:** state which code path
reaches the button, quoting the routing that proves a transcript gets there. A
passing test is not evidence the product can reach the code. PATCH-157 passed
every gate and was unreachable.

No production build; a dev server is running. Do not commit.

---

## 8. Hard stops

- Any write to the canonical text, or any persistence of the readable text.
- Any path where a projected output's word sequence differs from the original's.
- Needing a new dependency, a new route, or a file outside §6.
- A failing-file set differing from the 26.

---

## 9. Commit message (verbatim)

```
feat(knowledge): a transcript can be made readable, with the words guaranteed

YouTube's captions carry no punctuation, and -- measured on a real 92-cue
transcript -- no pause information either: all 91 gaps between cues are exactly
0 ms. So paragraph breaks had nothing real to land on. Sentences have to come
from somewhere else.

Researched first. Deepgram, AssemblyAI and Whisper punctuate from the AUDIO
during transcription; we have text only, so that path is closed. An LLM asked to
punctuate text is documented to change words, and the guardrails shipped in the
wild are thresholds -- 60% of content words preserved, length within 0.5-1.5x --
which would pass real corruption. The robust designs never let the model write
the text at all.

So this one does not either. The model returns punctuated text and its text is
discarded: the output is rebuilt by walking the ORIGINAL words and taking only
the model's punctuation, and the capitalisation of a word's first letter.
Nothing else it emits is copied. A chunk whose word sequence does not match the
original exactly -- one word added, dropped, reordered or altered -- is refused
and renders raw, visibly, with a count. No thresholds.

The canonical text is untouched and nothing is persisted. It stays the
coordinate space for selections, highlights, citations and the cue mapping, so
the readable view is display-only and the raw view is forced whenever a
highlight is on screen.

An off-the-shelf ONNX restorer was considered and rejected: it is trained on
news crawl and its own card warns against conversational text, where its
sentence-boundary F1 falls from >99.5% to <90%.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
