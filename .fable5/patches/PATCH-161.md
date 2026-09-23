# PATCH-161 — OpenCode Go as an AI provider

Status: AUTHORIZED
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

---

## 1. Why

The owner wants to use their OpenCode Go subscription for the app's AI features
(Board AI, Source AI, and — once it can make a live call — PATCH-160's readable
transcript, which is currently blocked on a provider returning 502).

The provider list is closed today, deliberately, in three places: the code's type
list, the settings dropdown, and a database CHECK constraint. The model ID is
already free text, so no model-list work is needed — only the provider.

## 2. Why this does not reopen the hole the design closed

`lib/domain/settings/aiProviderConnection.ts` says a user-supplied base URL is
absent by design because it is an SSRF surface. **This patch adds no
user-supplied URL.** OpenCode Go's endpoint is a fixed constant in code, exactly
like `OPENROUTER_ENDPOINT`. The user supplies a key and a model id, as for every
other provider.

Verified from the official docs (https://opencode.ai/docs/go/):

```
https://opencode.ai/zen/go/v1/chat/completions      OpenAI-compatible, Bearer key
```

Models on that endpoint include GLM-5.x, Kimi K3 / K2.x, DeepSeek V4.1 Flash /
V4 Pro / V4 Flash, MiMo, Qwen3.8 Flash. **Some OpenCode Go models are NOT on it**:
MiniMax and Qwen Max/Plus use `/v1/messages` (Anthropic-style); Grok and GPT use
`/v1/responses`. This adapter serves the chat-completions family only. A model id
from the other families will fail at the provider and surface as the normal
provider error — the model id stays opaque, per the contract in `types.ts`; do
**not** add a model allow-list or sniff the id.

## 3. What to build

Provider id: **`opencode-go`**. Display label: **`OpenCode Go`**.

1. **`lib/domain/settings/aiProviderConnection.ts`** — add `'opencode-go'` to
   `AI_PROVIDER_TYPES`. Do **NOT** add it to `IMAGE_CAPABLE_PROVIDER_TYPES`: only
   one model on the endpoint reads images, and claiming the capability for the
   provider would let the image checkbox send private PDF crops to models that
   cannot read them. Text-only.
2. **`lib/server/ai/providers/types.ts`** — add `'opencode-go'` to
   `AI_EXECUTION_PROVIDERS` (the type widens automatically via `AIProviderType`).
3. **`lib/server/ai/providers/openCodeGo.ts`** (new) — mirror `openRouter.ts`
   exactly: an exported `OPENCODE_GO_ENDPOINT` constant, and an adapter that calls
   `chatCompletionsGenerateText('opencode-go', OPENCODE_GO_ENDPOINT, input)` with
   `carriesImages: false`. Reuse the shared helper; write no new HTTP code. If the
   adapter contract requires a `carriesImages: false` adapter to refuse images,
   follow whatever the existing text-only path does — do not invent a new one.
4. **`lib/server/ai/providers/registry.ts`** — register it. The `Record` makes
   tsc enforce this; that is the point.
5. **`components/settings/ai/aiSettingsClient.ts`** — add the label to
   `AI_PROVIDER_LABELS` (also a `Record`, also enforced).
6. **`supabase/migrations/20260923120000_ai_provider_opencode_go.sql`** (new) —
   widen the CHECK on `ai_provider_connections.provider_type`. The original is an
   inline, unnamed CHECK in `20260831120000_create_ai_provider_foundation.sql`, so
   Postgres named it `ai_provider_connections_provider_type_check`. Drop that and
   re-add it with the same name and the five values. Use `DROP CONSTRAINT IF
   EXISTS`. Nothing else in the migration. **Do not apply it** — writing the file
   is the whole job; applying is the operator's.

Follow wherever else tsc points. If the compiler requires a change in a file not
listed in §5, stop and report it rather than editing it.

## 4. Tests

- `lib/server/ai/providers/openCodeGo.test.ts` (new): mirror
  `openRouter.test.ts` — the request goes to exactly `OPENCODE_GO_ENDPOINT`, with
  `Authorization: Bearer <key>`, the model id passed through untouched, and the
  provider errors normalised the same way. Mock `fetch`; no live call in tests.
- A test that an image-bearing input to `opencode-go` is refused, not silently
  sent text-only (the contract in `types.ts`: "An adapter that cannot carry images
  MUST throw").
- Extend `registry.test.ts` so `opencode-go` resolves to the new adapter.
- The existing test that pins `IMAGE_CAPABLE_PROVIDER_TYPES` to each adapter's
  `carriesImages` must pass **unchanged** — it is the check that the client list
  and the adapter agree.
- A source test (or extend an existing migration source test, if one covers
  provider types) that the new migration's CHECK lists exactly the five values in
  `AI_PROVIDER_TYPES`, so the database and the code cannot drift.

## 5. Allowed files

```
lib/domain/settings/aiProviderConnection.ts
lib/server/ai/providers/types.ts
lib/server/ai/providers/openCodeGo.ts              (new)
lib/server/ai/providers/openCodeGo.test.ts         (new)
lib/server/ai/providers/registry.ts
lib/server/ai/providers/registry.test.ts
components/settings/ai/aiSettingsClient.ts
supabase/migrations/20260923120000_ai_provider_opencode_go.sql   (new)
plus at most one existing test file that pins provider types or migrations, named in your report
```

Forbidden: a user-supplied base URL in any form; `chatCompletions.ts` (reuse,
do not modify); `package.json`; any other migration; applying any migration.

## 6. Verification

```
npx tsc --noEmit
npx vitest run lib/server/ai/providers
npx vitest run lib/domain/settings
npx vitest run
```

Failing file set must equal the 26 baseline. Report which existing test pins the
image-capability agreement and that it passed unchanged.

**As in PATCH-159/160:** state the path by which the settings dropdown gets the new
option and by which a saved `opencode-go` connection reaches the adapter at call
time — quote the code. A passing test is not evidence the product reaches it.

Do not commit.

## 7. Commit message (verbatim)

```
feat(ai): OpenCode Go as a provider

The owner wants the app's AI features to run on their OpenCode Go subscription.
Its chat endpoint is OpenAI-compatible at a FIXED address, so it joins the
closed provider list the same way OpenRouter did: a constant endpoint in code, a
key and a model id from the user, the shared chat-completions helper for the
call. No user-supplied base URL, so the SSRF reason the list is closed still
holds.

Text-only by declaration. One model on the endpoint reads images; claiming the
capability for the provider would let the image checkbox send private PDF crops
to models that cannot read them.

Serves the chat-completions family (GLM, Kimi, DeepSeek, MiMo, Qwen3.8 Flash).
MiniMax, Qwen Max/Plus, Grok and GPT sit on other OpenCode endpoints and will
fail at the provider; the model id stays opaque, as the contract requires.

The database CHECK on provider_type is widened by a new migration that is NOT
applied here -- saving an OpenCode Go connection fails until the operator
applies it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
