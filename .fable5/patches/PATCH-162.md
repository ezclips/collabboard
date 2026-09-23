# PATCH-162 — thinking off for quick text actions; apostrophes and hyphens allowed in a readable transcript

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Follows: PATCH-160 (readable transcript), PATCH-161 (OpenCode Go)

---

## 1. What live testing found (2026-09-23), the reason for this patch

PATCH-160's "Readable" button had never made a real AI call. Tested live today on
the owner's 8,653-character chess transcript (3 sections):

**Finding A — thinking models spend the whole budget thinking.** `/api/ai/text-action`
calls the provider with `maxTokens: 1500` and a 20 s timeout. Measured with a
temporary log:

```
deepseek (CollabBoard Default, model deepseek-flash):
  finish=length  contentLen=0  reasoningLen=6849  reasoning_tokens=1500
openrouter z-ai/glm-5.2:free:
  every section aborted at ~20.3 s -- the route's own timeout
```

DeepSeek thought for all 1,500 tokens and never wrote the answer; the empty content
became `request_failed`. GLM thought past 20 s. DeepSeek's docs confirm the model
**thinks by default unless told not to**
(https://api-docs.deepseek.com/guides/thinking_mode/).

With thinking disabled (temporary probe, since reverted), DeepSeek finished each
section in **~3.5 s** and GLM in ~10 s.

**This affects every quick action on this route**, not only the transcript: Improve,
Shorten, Fix grammar, Summarize, Explain and custom prompts all share the same 1,500
token / 20 s budget. They are fast edits; thinking buys them nothing and costs them
the answer.

**Finding B — the safety check refused good punctuation.** With thinking off,
DeepSeek returned the right number of words, and all three sections were still
refused, because it corrected spelling:

```
scholars mate   ->  scholar's mate
setup based     ->  setup-based
kings pawn      ->  king's pawn
```

PATCH-160's rule is "every character of every word comes from the original", so an
apostrophe or hyphen inside a word is refused like an invented word. **The owner has
decided** (2026-09-23, on the CTO's recommendation): a transcript is speech, and
"kings pawn" and "king's pawn" are the same spoken words. Apostrophes and hyphens
are spelling, not words.

---

## 2. Part 1 — thinking off for the text-action route

1. **`lib/server/ai/providers/types.ts`** — add to `AIGenerateTextInput`:
   ```ts
   /** 'off' asks a thinking model to answer directly. Absent = provider default. */
   readonly reasoning?: 'off';
   ```
   Document it like the other fields: a REQUEST, which an adapter that has no such
   switch may ignore, and must say so in its own file.
2. **`lib/server/ai/providers/chatCompletions.ts`** — accept an optional extra body
   object from the adapter (e.g. a 4th parameter `extraBody?: Record<string, unknown>`)
   and spread it into the request body. **With no extra body, the request must be
   byte-identical to today** — the file already makes that promise for images, and
   this change must keep it. Test it.
3. **`lib/server/ai/providers/deepSeek.ts`** — when `input.reasoning === 'off'`, send
   `{ thinking: { type: 'disabled' } }`.
4. **`lib/server/ai/providers/openRouter.ts`** — when `input.reasoning === 'off'`,
   send `{ reasoning: { enabled: false } }` (OpenRouter's documented switch).
5. **OpenAI, Anthropic, Gemini, OpenCode Go** — ignore the field this patch. State
   it in a one-line comment in each adapter: not measured, so no switch is sent. Do
   NOT guess parameters for them.
6. **`app/api/ai/text-action/route.ts`** — pass `reasoning: 'off'` in its
   `adapter.generateText` call. Nothing else in the route changes. Update its header
   comment with Finding A and the numbers above.

Do not touch any other caller of `generateText` (Board chat, wiki compilation,
component generation). They have their own budgets and were measured separately.

---

## 3. Part 2 — the projection allows apostrophes and hyphens

`lib/domain/knowledge/transcriptPunctuationProjection.ts`.

**THE NEW GUARANTEE, stated exactly — the tests pin this, not a paraphrase:**

> Every letter and digit in the output comes from the original, in the same order,
> with no letter or digit added, removed, reordered or substituted. The only
> characters the model contributes are: the punctuation marks already allowed,
> apostrophes and hyphens placed between letters, spaces, and the upper/lower case
> of the first letter of a word.

Concretely:

- **Comparison.** Split BOTH strings into word parts on whitespace AND hyphens;
  reduce each part to its letters and digits only (apostrophes and hyphens dropped),
  lowercased. The two sequences must be exactly equal — same length, same order.
  - `setup based` vs `setup-based` → `[setup, based]` both sides → **accepted**.
  - `kings` vs `king's` → `[kings]` both sides → **accepted**.
  - `setup based` vs `setupbased` (joined WITHOUT a hyphen) → `[setup, based]` vs
    `[setupbased]` → **refused**. Merging words is a word change.
  - `bishop` vs `bish op` → **refused**. Splitting is a word change.
  - `bishop` vs `rook`, dropped/added/reordered words → **refused**, as before.
- **Reconstruction.** Build the output so every letter and digit is the ORIGINAL's
  character (so a model cannot alter a letter even in a way the comparison would
  forgive), taking from the model only: allowed marks, apostrophes and hyphens
  inside or between the matched letters, word spacing, and the case of each word
  part's first letter. Anything else the model emitted is dropped, as today.
- The **allowed-mark set stays a `Record`**, and apostrophe and hyphen are added to
  the set of in-word characters as a second exhaustive `Record` — not an array.
- Straight and curly apostrophes (`'` and `’`) are both accepted. Hyphen means `-`
  only; an en or em dash between words stays governed by the existing mark rules.

**`components/collabboard/KnowledgeTextSourceView.tsx`** — update
`PUNCTUATE_INSTRUCTION` so it no longer forbids apostrophes, and says apostrophes
and hyphens may be added but no word may be added, removed, reordered, merged or
split. Change only that string.

---

## 4. Tests

**Part 1**
- `chatCompletions`: with no extra body, the serialized request is byte-identical to
  the current one (snapshot the body string for a text-only call).
- `deepSeek`: `reasoning: 'off'` → body contains `thinking: {type:'disabled'}`;
  absent → body does not contain `thinking`.
- `openRouter`: `reasoning: 'off'` → `reasoning: {enabled:false}`; absent → absent.
- A test that OpenAI, Anthropic and Gemini request bodies are unchanged when
  `reasoning: 'off'` is passed.
- `text-action` route test: the adapter is called with `reasoning: 'off'`.

**Part 2** — extend `transcriptPunctuationProjection.test.ts`:
- The three real cases above (`scholar's`, `setup-based`, `king's`) are **accepted**
  and the output contains the model's apostrophe/hyphen.
- Joining without a hyphen, splitting a word, substituting ONE letter (`bishop` →
  `biship`), and every earlier refusal case are **refused**.
- A pre-hyphenated original word (`theory-based`) survives whether the model keeps
  or drops the hyphen, and the letters are unchanged.
- **The property test is updated to the new guarantee and stays a property test**:
  over hundreds of generated adversarial outputs, every ACCEPTED output's letter and
  digit stream equals the original's exactly. Add adversaries that insert
  apostrophes/hyphens (must pass) and that alter one letter, merge, or split (must
  fail).

## 5. Allowed files

```
lib/server/ai/providers/types.ts
lib/server/ai/providers/chatCompletions.ts
lib/server/ai/providers/deepSeek.ts, deepSeek.test.ts
lib/server/ai/providers/openRouter.ts, openRouter.test.ts
lib/server/ai/providers/openAI.ts, anthropic.ts, gemini.ts, openCodeGo.ts   (comment only)
lib/server/ai/providers/<a new or existing chatCompletions test file>
app/api/ai/text-action/route.ts, and its existing test file
lib/domain/knowledge/transcriptPunctuationProjection.ts, .test.ts
components/collabboard/KnowledgeTextSourceView.tsx   (PUNCTUATE_INSTRUCTION only)
components/collabboard/KnowledgeTextSourceView.test.tsx   (only if the instruction text is asserted)
```

Forbidden: Board chat, wiki compilation, component generation, any migration,
`package.json`.

## 6. Verification

```
npx tsc --noEmit
npx vitest run lib/server/ai
npx vitest run lib/domain/knowledge/transcriptPunctuationProjection.test.ts
npx vitest run app/api/ai
npx vitest run
```

Failing FILE set equal to the 26 baseline. Do not commit. The CTO runs the live test
on the owner's transcript afterwards — a passing suite is not the acceptance.

## 7. Commit message (verbatim)

```
fix(ai): quick text actions answer instead of thinking; a readable transcript may add apostrophes and hyphens

Measured live on a real 8,653-character transcript. The text-action route gives
the provider 1,500 tokens and 20 seconds. DeepSeek's default model thinks unless
told not to, and spent all 1,500 tokens thinking (reasoning 6,849 chars, content 0,
finish=length); GLM on OpenRouter thought past the 20 s timeout. Every quick action
on this route -- improve, shorten, grammar, summarize, the readable transcript --
shares that budget. The route now asks for no thinking; DeepSeek and OpenRouter
honour it with their documented switches, and the other adapters are unchanged
because nothing was measured for them. With it, a section took ~3.5 s.

The readable transcript then refused all three sections, because the model
corrected "kings pawn" to "king's pawn" and "setup based" to "setup-based". The
guarantee was every CHARACTER of every word; it is now every LETTER and DIGIT, in
order, with nothing added, dropped, reordered, merged or split. Apostrophes and
hyphens are spelling, not words -- a transcript is speech, and the speaker said
the same thing either way. Decided by the owner.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
