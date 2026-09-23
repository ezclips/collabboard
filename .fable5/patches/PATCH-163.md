# PATCH-163 — remove OpenCode Go; show each AI feature's real time limit when adding a provider

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Reverses: PATCH-161 (code only — its migration stays; see §2.3)

---

## 1. Why

**OpenCode Go.** Tested live on 2026-09-23: every request returned HTTP 400
`MissingSessionID` — "Request is missing x-opencode-session". The header is one line,
but OpenCode's own docs say Go "is designed for OpenCode and other coding agents that
produce similar types of requests" and that "traffic is monitored for abuse". CollabBoard's
AI features are not coding-agent traffic, and making them look like it would put the owner's
subscription — the one that also runs their coding — at risk. The owner decided to remove
it. An option in the provider dropdown that can never succeed is a trap, so the code goes.

The owner's saved OpenCode connection has ALREADY been deleted (through the app's own DELETE
endpoint, 2026-09-23). No role referenced it.

**The limits warning.** The owner wants to know, when choosing a provider and model, what
CollabBoard will wait for. Today that is invisible, and it caused a day of failures: thinking
models ran past 20 s, or spent the whole token budget thinking.

## 2. Part 1 — remove OpenCode Go

1. `lib/domain/settings/aiProviderConnection.ts` — remove `'opencode-go'` from
   `AI_PROVIDER_TYPES` (back to four).
2. `lib/server/ai/providers/types.ts` — remove it from `AI_EXECUTION_PROVIDERS`.
3. `lib/server/ai/providers/registry.ts` — unregister it. Delete
   `lib/server/ai/providers/openCodeGo.ts` and `openCodeGo.test.ts`.
4. `components/settings/ai/aiSettingsClient.ts` — remove the label.
5. Tests: `aiProviderConnection.test.ts` and `aiSettingsPage.test.tsx` go back to the four
   providers ("four" in their titles). `registry.test.ts` drops the mapping.
   `userDeclaredVisionCapability.test.ts`: remove test 12 (it names `opencode-go`), and
   **keep** test 11's per-provider agreement loop and its SUBSET check exactly as they are —
   the subset form is the correct rule regardless of which providers exist.
   Keep `reasoning?: 'off'` and everything else PATCH-162 added; only OpenCode's own
   comment disappears with its file.
6. Anything else tsc points at. Stop and report if it points outside §4.

### 2.3 The database: a NEW migration, the old one stays

`20260923120000_ai_provider_opencode_go.sql` has been APPLIED (the owner's connection saved
through it). An applied migration is history and **must not be edited or deleted**.

Add `supabase/migrations/20260923150000_ai_provider_remove_opencode_go.sql`:

- First, a `DO $$ ... $$` block that **raises an exception** with a clear message if any row
  in `public.ai_provider_connections` still has `provider_type = 'opencode-go'`. Never delete
  user rows in a migration; a row left behind is the operator's to remove, knowingly.
- Then `DROP CONSTRAINT IF EXISTS ai_provider_connections_provider_type_check` and re-add it
  with the four values `('openai', 'anthropic', 'gemini', 'openrouter')`.
- Header comment: why (§1), and that it is not applied here.

The existing source test ("the LATEST provider_type CHECK lists exactly AI_PROVIDER_TYPES")
must then pass **unchanged** — it reads the newest migration, which is this one.

## 3. Part 2 — the limits, shown where the model is chosen

### 3.1 One client-safe table of the real numbers — `lib/ai/aiTimeBudgets.ts` (new)

The settings UI is a `'use client'` bundle and must not import server modules. So the
numbers are restated in one client-safe table, and a test binds it to the server's real
values so the two cannot drift.

```ts
export interface AITimeBudget {
  readonly feature: string;   // as the user knows it
  readonly seconds: number;
}
export const AI_TIME_BUDGETS: readonly AITimeBudget[] = [
  { feature: 'Source AI and Edit & Rewrite (quick actions)', seconds: 20 },
  { feature: 'Board Chat', seconds: 20 },
  { feature: 'AI cards (generate and convert)', seconds: 25 },
  { feature: 'Auto mode classifier', seconds: 10 },
  { feature: 'Board wiki', seconds: 60 },
];
```

These values were read from the code on 2026-09-23:

```
app/api/ai/text-action/route.ts          setTimeout(... , 20_000), maxTokens 1500
lib/server/ai/boardAiChatExecution.ts    BOARD_AI_CHAT_TIMEOUT_MS = 20_000
app/api/ai/generate-component/route.ts   timeoutMs: 25_000
app/api/ai/convert-component/route.ts    timeoutMs: 25_000
app/api/ai/classify-intent/route.ts      timeoutMs: 10_000
lib/server/ai/boardWikiCompilation.ts    WIKI_COMPILE_TIMEOUT_MS = 60_000
```

**A source test** (`lib/ai/aiTimeBudgets.source.test.ts`) reads each of those files and
asserts the literal it finds equals the table's value. If someone changes a timeout without
updating the table, the test fails. Match on the literal text shown above.

### 3.2 The note in the Add/Edit provider dialog

`components/settings/ai/AIProviderDialog.tsx`, directly under the Model field, a compact,
quiet note (small grey text, same style as the existing helper text there). Exact copy:

> **How long CollabBoard waits for an answer:** then the table as a short list —
> "Source AI and Edit & Rewrite (quick actions) — 20 s", and so on, from `AI_TIME_BUDGETS`.
>
> Models that "think" before answering can run past these limits and fail. For quick
> actions, CollabBoard asks DeepSeek and OpenRouter models not to think; other providers
> are not asked. Free models are often overloaded and may be refused. Use a text chat
> model, not an image, audio or embedding model.

Render the list FROM `AI_TIME_BUDGETS`; never hardcode the numbers in the component.

## 4. Allowed files

```
lib/domain/settings/aiProviderConnection.ts, .test.ts
lib/server/ai/providers/types.ts
lib/server/ai/providers/registry.ts, registry.test.ts
lib/server/ai/providers/openCodeGo.ts, openCodeGo.test.ts          (DELETE)
components/settings/ai/aiSettingsClient.ts
components/settings/ai/aiSettingsPage.test.tsx
components/settings/ai/AIProviderDialog.tsx
lib/server/ai/userDeclaredVisionCapability.test.ts                  (remove test 12 only)
lib/ai/aiTimeBudgets.ts, aiTimeBudgets.source.test.ts               (new)
supabase/migrations/20260923150000_ai_provider_remove_opencode_go.sql (new)
plus one existing AIProviderDialog/settings test file if you add a test for the note
```

Forbidden: editing or deleting `20260923120000_ai_provider_opencode_go.sql`; any server
timeout or budget value (this patch DISPLAYS them, it does not change them); applying any
migration; `package.json`.

## 5. Tests

- The provider dropdown offers exactly the four providers again.
- `getAIProviderAdapter('opencode-go' as never)` throws `invalid_configuration` (a stale row
  must fail closed, not crash).
- The note renders every `AI_TIME_BUDGETS` entry, and its text contains no number that is
  not in the table.
- `aiTimeBudgets.source.test.ts` as §3.1 — and confirm it FAILS if one table value is
  changed (change one temporarily, report the failure, restore).
- The latest-migration test passes unchanged.

## 6. Verification

```
npx tsc --noEmit
npx vitest run lib/server/ai lib/domain/settings lib/ai components/settings lib/infra/settings
npx vitest run
```

Failing FILE set equal to the 26 baseline. `grep -rn "opencode" lib app components` returns
nothing outside the two migration files and comments that explain the removal. Do not commit.

## 7. Commit message (verbatim)

```
fix(ai): remove OpenCode Go; show each AI feature's time limit where a model is chosen

OpenCode Go refused every live request (400 MissingSessionID). Its docs reserve it for
coding agents and say traffic is monitored; CollabBoard's features are not that, and
dressing them up as a coding agent would risk the owner's subscription. Removed at the
owner's decision. The applied migration that admitted it stays as history; a new one
narrows the CHECK back to four and refuses to run while any opencode-go row exists,
rather than deleting user data. The owner's own connection was deleted through the app
first.

The Add provider dialog now says how long each feature waits -- 20 s for quick actions
and Board Chat, 25 s for AI cards, 10 s for the Auto classifier, 60 s for the wiki --
and that thinking models and overloaded free models can fail against those limits.
That was invisible, and it cost a day of failures. The numbers live in one client-safe
table bound to the server's real values by a source test, so they cannot drift.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
