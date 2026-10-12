# PATCH-345 — Token counter for Board AI on your own key

## Why
Owner, 2026-10-12, looking at Board AI on their Premium board with their Claude
key: "where is this token counter". PATCH-343 shows only "Using your own AI key
— no credits used" there, because own-key calls cost no credits. The owner
wants to see what their own key is spending. Owner chose this over the custom
provider for PATCH-345.

PM decisions:
- **Tokens, not money.** Prices differ per model and change; a wrong "$" is
  worse than none. Show tokens (in / out). A cost estimate can come later with a
  maintained price table.
- **v1 scope: Board AI chat, per conversation.** That is where the line is. A
  monthly total across all features needs every AI route to record usage and is
  a later patch.
- **Providers already send usage in every response**; the adapters discard it
  ("no usage accounting" in `providers/types.ts`). Widen the contract by ONE
  optional callback so the ~20 existing `generateText` call sites stay
  untouched.

## Design

### 1. Adapter contract (`lib/server/ai/providers/types.ts`)
- `export interface AITokenUsage { readonly inputTokens: number; readonly outputTokens: number; }`
- `AIGenerateTextInput.onUsage?: (usage: AITokenUsage) => void` — called at
  most once, after a successful response, ONLY when the provider reported
  usage. Never called on an error. Return type of `generateText` is unchanged.
- Update the header comment: usage is reported, never returned.
- A throwing `onUsage` must not fail the call (wrap in try/catch inside a tiny
  shared helper `reportUsage(input, usage)` so every adapter does it the same
  way; non-finite or negative numbers → not reported).

### 2. Each adapter reads its provider's usage field
| Adapter | Field |
|---|---|
| `anthropic.ts` (Messages API) | `usage.input_tokens` (+ `cache_creation_input_tokens` + `cache_read_input_tokens` when present) / `usage.output_tokens` |
| `openAI.ts` (Responses API) | `usage.input_tokens` / `usage.output_tokens` |
| `chatCompletions.ts` (DeepSeek, OpenRouter) | `usage.prompt_tokens` / `usage.completion_tokens` |
| `gemini.ts` | `usageMetadata.promptTokenCount` / `candidatesTokenCount` (+ `thoughtsTokenCount` when present) |
Fixtures for the tests must be **real captured response bodies** from the
provider docs' shape — and the PM will make a live call per adapter before this
is called done (AGENTS.md §4: a fixture is not a live call).

### 3. Chat execution and storage
- `lib/server/ai/boardAiChatExecution.ts`: pass `onUsage` and return
  `usage: AITokenUsage | null` in the result.
- Migration (written by the PM, applied by the owner BEFORE this code runs):
  `supabase/migrations/20261012120000_board_ai_messages_token_usage.sql` adds
  nullable `input_tokens`, `output_tokens` (≥ 0) to `board_ai_messages`.
- `lib/infra/ai/boardAiThreadRepository.ts` `appendMessage`: accept and store
  `inputTokens`/`outputTokens` (omit the columns when null); the message read
  maps them back.
- `app/api/boards/[id]/ai/chat/route.ts`: store `result.usage` on the assistant
  row; include `inputTokens`/`outputTokens` (number | null) in the POST
  response message and in the GET thread messages. Nothing else changes in
  the route (credits, citations, errors stay as they are).

### 4. Display
- Pure helper `conversationTokenTotals(messages)` in
  `lib/domain/ai/conversationTokens.ts` → `{ input, output, total, counted,
  uncounted }` (assistant messages with counts vs without).
- `components/billing/AiCreditBar.tsx`: new optional prop
  `conversationTokens?: { input: number; output: number; total: number } | null`.
  In the **own-key** state only, the line reads:
  `Your own AI key · this chat: 12,431 tokens (9,820 in · 2,611 out)` —
  `toLocaleString()`; `title` explains "Counted from what your AI provider
  reported. No CollabBoard credits used." With no counted messages yet (new
  chat, or only older answers) it keeps PATCH-343's text unchanged.
  Credit states (ok/low/empty/free) are unchanged.
- `BoardAiChatDrawer.tsx` (2,353 lines — wiring only, ~2 lines): compute
  `conversationTokenTotals(messages)` and pass it to `<AiCreditBar>`. The
  message view type gains the two optional fields.

## Tests
- Adapters: each reports the right numbers from a realistic body; no usage
  field → `onUsage` not called; error response → not called; a throwing
  `onUsage` does not fail `generateText`; existing adapter tests stay green.
- Execution: result carries usage / null.
- Repository: tokens written and read back; null omitted.
- Route: POST stores and returns the counts; GET returns them; a run with no
  usage stores nulls.
- `conversationTokenTotals`: sums only assistant messages, counts uncounted.
- `AiCreditBar`: own-key line with tokens; without tokens unchanged; credit
  states unchanged.

## Verification
tsc, focused tests, full gate. Live (PM), after the owner applies the SQL:
a throwaway Freeform board, two Board AI turns on the owner's Claude key → the
line shows a growing total that matches the sum of the two stored rows; one
live call each through the OpenAI, OpenRouter and managed DeepSeek adapters
reports non-zero usage (Gemini: no key saved — stated as not live-tested).

## Allowed files
`lib/server/ai/providers/{types,anthropic,openAI,chatCompletions,gemini}.ts`
(+ their tests; NOT `anthropic.test.ts` if it has unrelated local changes —
add new cases in a new `anthropic.usage.test.ts`), a new shared helper under
`lib/server/ai/providers/`, `lib/server/ai/boardAiChatExecution.ts` (+ test),
`lib/infra/ai/boardAiThreadRepository.ts` (+ test),
`app/api/boards/[id]/ai/chat/route.ts` (+ its test),
new `lib/domain/ai/conversationTokens.ts` (+ test),
`components/billing/AiCreditBar.tsx` (+ test),
`components/collabboard/BoardAiChatDrawer.tsx` (wiring only) and the message
view type it imports. No SQL (the PM wrote it), no git.

## Addendum 1 — PM review (2026-10-12)
1. **HIGH — Gemini reads the wrong usage field.** `gemini.ts` calls the
   **Interactions API** (`/v1beta/interactions`), but the patch reads
   `usageMetadata.promptTokenCount/candidatesTokenCount/thoughtsTokenCount`,
   which is the *generateContent* response shape. Per the Interactions API
   reference (https://ai.google.dev/api/interactions-api, Interaction
   resource) usage is `usage.total_input_tokens`, `usage.total_output_tokens`
   and `usage.total_thought_tokens`. Fix: read those (thought tokens count as
   output). Rewrite `gemini.usage.test.ts` fixtures to the Interactions shape
   (`{ "steps": [...], "usage": { "total_input_tokens": …, … } }`) and add one
   case proving a `usageMetadata`-only body reports nothing. This is the exact
   failure the comment above `InteractionsPayload` describes — a fixture
   written from the wrong API. Gemini stays NOT live-tested (no key saved).
2. Deploy order (no code change): `MESSAGE_COLUMNS` now selects the two new
   columns on every chat read, so Board AI history fails entirely until the
   migration is applied. The owner applies the SQL before this ships; the PM
   verifies the columns exist before the live test.
Allowed files: `lib/server/ai/providers/gemini.ts`,
`lib/server/ai/providers/gemini.usage.test.ts`.
