# PATCH-178 — Readable transcripts: smaller passages, one retry, and a batch route

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Read first: `lib/domain/knowledge/transcriptPunctuationProjection.ts`,
`components/collabboard/KnowledgeTextSourceView.tsx` (the Readable toggle, PATCH-160/162),
`app/api/ai/table-plan/route.ts` (the route pattern to copy)

---

## 1. Why — the owner's report

On the chess transcript, the top third stayed unpunctuated: "1 of 3 passages kept their
original wording."

**The cause is known.** The captions misheard "knight" as "night". The model corrected the
word, and `projectTranscriptPunctuation` correctly REFUSED the passage. That refusal is the
safety rule: a readable transcript can never contain a word that wasn't said. **Do not weaken
it.**

Two problems make it costly:
1. **Passages are ~3,000 characters,** so one misheard word leaves a third of this video raw.
2. **Each passage is its own call to `/api/ai/text-action`,** whose limit is 10 requests per
   minute per IP. Smaller passages, or any video over ~30,000 characters (about 30 minutes),
   run past the limit. The extra requests come back 429 and those passages silently stay raw.

## 2. The design

- **Passages of at most 900 characters,** still cut only at cue (newline) boundaries. The chess
  transcript becomes about 10 passages, so a misheard word costs a sentence or two.
- **A dedicated batch route** punctuates up to 12 passages per request, in parallel on the
  server. A 60-minute video needs about 6 requests, not 60.
- **One retry per refused passage,** on the server, with a stricter instruction that names the
  failure.
- **The safety rule is unchanged:** every result is projected through the SAME
  `projectTranscriptPunctuation`.

### 2.1 Domain — `lib/domain/knowledge/transcriptPunctuationProjection.ts`

- Add `export const TRANSCRIPT_PUNCTUATION_CHUNK_CHARS = 900;` and make it the default of
  `transcriptPunctuationChunks`, which is 3000 today.
- Change nothing else in this file. The partition invariant and the projection stay as they
  are.
- Existing tests call the chunker with explicit sizes, so they keep passing. Add ONE test: with
  no size argument, no passage exceeds 900 characters, unless it is a single line longer than
  that (such a line stands alone).

### 2.2 Instructions — `lib/domain/knowledge/transcriptPunctuationInstructions.ts` (new)

- Move `PUNCTUATE_INSTRUCTION` out of `KnowledgeTextSourceView.tsx`, verbatim, and export it as
  `TRANSCRIPT_PUNCTUATE_INSTRUCTION`.
- Add `TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION`: the same text, plus this sentence:

  > Keep every word exactly as written, even when it looks misheard or misspelled (for
  > example, keep "night" even if "knight" was meant); a wrong-looking word must stay wrong.

### 2.3 The route — `app/api/ai/transcript-punctuate/route.ts` (new)

Copy the structure of `app/api/ai/table-plan/route.ts`:
- session gate → 401;
- rate limit per USER: 6 requests per minute → 429;
- a `.strict()` zod request schema;
- the model from `resolveAIModelForRole(…, AI_ROLE_SOURCE, …)`, the role `text-action` uses
  for this today;
- `reasoning: 'off'` (PATCH-162: a thinking model returns nothing here);
- provider errors mapped the same way, 502 for anything else.

**Request:** `{ passages: string[] }`, 1 to 12 passages, each 1 to 1,200 characters, 12,000 in
total. Nothing is stored, and no board or document is read. The client sends the text, exactly
as `text-action` does today.

**For each passage, in parallel** (at most 4 at a time):
1. Call the model:
   - system: the punctuate instruction;
   - user: the passage;
   - `maxTokens`: 1500.
2. Project the answer: `projectTranscriptPunctuation(passage, answer)`.
3. If the projection is refused, **retry ONCE** with the retry instruction, and project again.
4. The passage's outcome is one of:
   - `{ status: 'projected', text }`, the projected text;
   - `{ status: 'refused' }`, after the retry was refused as well;
   - `{ status: 'failed' }`, because a model call threw or timed out. A failure is never
     retried, and it never fails the other passages.

**Time:** one AbortController for the whole request, with a **45 s** abort. When it fires, any
passage still unfinished becomes `failed`.

**Response (200):** `{ results: Outcome[] }`, the same length and order as `passages`. The
response is 200 even when every passage failed; the client decides what that means (§2.4).

**Wiring tests.** These are the only edits to existing tests besides §2.1 and §2.4:
- `lib/ai/aiTimeBudgets.ts`: add `{ feature: 'Readable transcript', seconds: 45 }`, plus the
  route in the comment list;
- `lib/ai/aiTimeBudgets.source.test.ts`: add the matching case;
- `lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts`: add `'transcript-punctuate'` to
  the sorted route list, with a one-line comment. Its assertion that the PDF Source AI panel
  uses only `text-action` must still hold.

### 2.4 The client — `components/collabboard/KnowledgeTextSourceView.tsx`

- `runPunctuation`:
  1. Split the text with `transcriptPunctuationChunks(text)`, which now makes 900-character
     passages.
  2. Send them in batches of 12 to `/api/ai/transcript-punctuate`, ONE batch at a time, in
     order.
  3. Map each outcome to the existing per-passage result: `projected` → its text; `refused` and
     `failed` → `null`.
  4. A batch whose REQUEST fails (not 200, a network error or timeout) marks all of its
     passages `failed`, and the remaining batches still run.
  5. Client abort: 50 s per batch.
- **Keep every existing rule:**
  - if EVERY passage failed → the error state, as today;
  - otherwise the partial notice, `{n} of {total} passages kept their original wording.`;
  - the generation and abort guards;
  - the text-root `textContent` invariant.
- **Keep the client-side projection as a second check:** re-project each returned `text` with
  `projectTranscriptPunctuation(passage, text)`. If that ever refuses (it can't, since the server
  projected the same text), treat the passage as refused. Everything that reaches the screen has
  then passed the projection in this file too.
- Remove the component's direct use of `/api/ai/text-action` for Readable. The component must
  not reference `text-action` any more.

## 3. Tests

**`lib/server/ai/transcriptPunctuateRoute.test.ts`** (new; the harness of
`tablePlanRoute.test.ts`)
- Access and limits:
  - 401 without a session;
  - the 7th request in a minute → 429;
  - invalid bodies → 400: 0 passages, 13 passages, a 1,201-character passage, more than 12,000
    characters in total, an extra key.
- The model call:
  - `AI_ROLE_SOURCE`;
  - `reasoning: 'off'`;
  - the system prompt is `TRANSCRIPT_PUNCTUATE_INSTRUCTION`;
  - the user message is the passage.
- Outcomes:
  - a faithful answer → `projected`, with the text the projection produces;
  - an answer that changes a word ("night" → "knight"), then a faithful retry → `projected`;
    exactly 2 calls, and the second uses `TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION`;
  - an answer that changes a word twice → `refused`, with exactly 2 calls;
  - a model throw → `failed`, with no retry and the other passages unaffected;
  - order is kept, and never more than 4 calls run at once (count concurrent calls in the mock).
- A provider error on EVERY passage → 200 with all `failed`.

**`components/collabboard/KnowledgeTextSourceView.test.tsx`** — only the Readable describe
block changes, and only where it mocks `/api/ai/text-action`. Point those mocks at
`/api/ai/transcript-punctuate` and its batch shape, deliberately and mechanically. Keep every
assertion about the result.

ADD:
- a transcript of about 2,500 characters is sent as ONE batch of 3 passages or fewer (900 each);
- a transcript with more than 12 passages is sent as 2 batches, in order;
- a batch request failure leaves its passages raw while the other batch's passages are
  readable, and the notice counts them;
- the component no longer references `text-action` (source-level).

**`lib/domain/knowledge/transcriptPunctuationProjection.test.ts`**: the one default-size test
from §2.1.

## 4. Allowed files

```
lib/domain/knowledge/transcriptPunctuationProjection.ts, .test.ts        (default size + one test)
lib/domain/knowledge/transcriptPunctuationInstructions.ts                (new)
app/api/ai/transcript-punctuate/route.ts                                  (new)
lib/server/ai/transcriptPunctuateRoute.test.ts                            (new)
components/collabboard/KnowledgeTextSourceView.tsx
components/collabboard/KnowledgeTextSourceView.test.tsx                   (Readable block only)
lib/ai/aiTimeBudgets.ts, lib/ai/aiTimeBudgets.source.test.ts              (one entry, one case)
lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts                (route list only)
```

Everything else is forbidden, including `text-action` itself, other tests, `package.json` and
migrations. Never use git stash, reset, restore, checkout, clean, commit or push. Never run a
production build. If another existing test pins the Readable feature to `text-action`, STOP and
ask.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/knowledge lib/server/ai/transcriptPunctuateRoute.test.ts lib/ai lib/infra/knowledge/knowledgeSourceAiWiring.source.test.ts components/collabboard/KnowledgeTextSourceView.test.tsx components/collabboard/knowledgeReaderWorkspace.test.tsx
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report the files you changed, the tests
you added, and the output. Do not commit. The CTO verifies live on the chess transcript and
reports the acceptance rate.

## 6. Commit message (verbatim)

```
feat(transcript): readable transcripts in smaller passages, with one careful retry

Making a transcript readable refused a whole third of the chess video because the captions
said "night" where the speaker meant "knight": the model corrected the word, and the rule
that a readable transcript may never contain a word that was not said correctly threw the
passage out. That rule is unchanged. What changed is how much one misheard word costs:
passages are now about 900 characters instead of 3,000, and a refused passage is retried
once with an instruction to keep every word exactly as written, even a wrong-looking one.

Passages now go to one batch route, twelve at a time, instead of one request each, so a long
video no longer runs past the per-minute limit and leaves passages raw without saying why.
Every result still passes the same word-for-word projection, on the server and again in the
reader.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
