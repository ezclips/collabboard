# PATCH-187 — billing step 3a: AI credits, the ledger and the board AI routes

Status: AUTHORIZED (owner, 2026-09-26: "Push e7f8862b, and go on with AI credits next")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-185 (`a4def207`), PATCH-186 (`e7f8862b`)
Read first:
- `.fable5/docs/PRICING.md` §2 (Rules 1–3), §3 (the AI credits row and "When credits run out"),
  §4 (what a credit is);
- `lib/domain/billing/plans.ts` (`monthlyAiCredits`, `welcomeAiCredits`, the page-limit helpers
  from PATCH-186 as the style for messages);
- `lib/server/billing/boardPlan.ts` (`resolveBoardPlan`);
- `lib/server/ai/resolveAIModelForRole.ts` (the two sources: `collabboard-default` and `byok`);
- `lib/server/ai/boardAiChatExecution.ts` (`executeBoardAiChat`, `BoardAiChatResult`);
- `app/api/boards/[id]/ai/chat/route.ts` (the POST, the whole of it: note that the user's turn
  is STORED before the model is called);
- `app/api/boards/[id]/ai/chat/starter-questions/route.ts`;
- `app/api/boards/[id]/ai/table-from-document/route.ts`;
- `lib/server/wiki/boardWikiCompileSession.ts` (`compileBoardWikiProposal`) and
  `lib/server/wiki/boardWikiPageRoute.ts`;
- `supabase/migrations/20260310_add_billing_schema.sql` (`subscriptions`, including
  `current_period_start` / `current_period_end`) and
  `supabase/migrations/20260310_allow_email_based_workspace_membership.sql` (`get_workspace_role`).

---

## 1. Why, and what is deliberately NOT in this patch

AI calls on the CollabBoard key cost us money and nothing meters them. PRICING.md gives each plan
a monthly allowance of AI credits. This patch builds the ledger and meters the four AI features
that are already board-scoped, so the board owner's workspace (Rule 1) is known:

| Feature | Credits (basic model) |
|---|---|
| Board AI chat message | 1, **+1 when board search was used** for that answer |
| Starter questions | 0 (see §2.5) |
| Table from a document | 3 |
| Board wiki compile (one proposal) | 10 |

**Rule 3:** a call that ran on the caller's OWN key (`source: 'byok'`) costs nothing and is never
refused for credits.

**NOT in this patch:**
- the board-less routes `/api/ai/text-action`, `table-fill`, `table-plan`,
  `transcript-punctuate`, `generate-component`, `convert-component`, `classify-intent`. They carry
  no board today, so they cannot follow the owner's plan. PATCH-188 adds a board to them. Their
  features ARE listed in the migration's check constraint now, so PATCH-188 needs no migration;
- premium-model weights (×5): the managed path runs only the basic DeepSeek model today; model
  tier by plan is a later step;
- usage meters and the billing page's credit display (a later patch);
- top-up packs.

## 2. The design

### 2.1 The domain — `lib/domain/billing/plans.ts` (pure, no I/O)

Add:

```ts
export type AiCreditFeature =
  | 'board_chat' | 'table_from_document' | 'wiki_compile'
  // PATCH-188 meters these; declared now so the ledger's constraint already allows them:
  | 'text_action' | 'table_fill' | 'table_plan' | 'transcript_punctuate' | 'component';

/** PRICING.md §4, basic model. Must be calibrated against measured costs before launch. */
export const AI_CREDIT_COSTS: Readonly<Record<AiCreditFeature, number>>;
// board_chat 1, table_from_document 3, wiki_compile 10,
// text_action 1, table_fill 1, table_plan 1, transcript_punctuate 1, component 1

export const BOARD_CHAT_SEARCH_SURCHARGE = 1;
```

and ONE new field on `PlanLimits`:

```ts
/** PRICING.md §3: on a paid plan, basic Board AI chat keeps answering when the credits run out. */
readonly boardChatWhenOutOfCredits: boolean;   // free false, pro true, premium true
```

The credit balance, as a pure function:

```ts
export interface AiCreditPeriod { readonly start: Date; readonly end: Date }   // [start, end)

/** A paid plan with a subscription period that contains `now` uses it; everything else uses the UTC calendar month. */
export function aiCreditPeriod(now: Date, subscriptionPeriod: { start: string | null; end: string | null } | null): AiCreditPeriod;

export interface AiCreditBalance {
  readonly allowance: number;        // limits.monthlyAiCredits
  readonly allowanceUsed: number;    // this period, bucket 'allowance'
  readonly grantTotal: number;       // limits.welcomeAiCredits (top-ups later add here)
  readonly grantUsed: number;        // ALL TIME, bucket 'grant'
  readonly remaining: number;        // max(0, allowance − allowanceUsed) + max(0, grantTotal − grantUsed)
  readonly period: AiCreditPeriod;
}

export function aiCreditBalance(limits: PlanLimits, period: AiCreditPeriod,
  used: { allowanceUsed: number; grantUsed: number }): AiCreditBalance;

/** The monthly allowance is spent first, then the grant. Returns 1 or 2 rows. */
export function splitAiCreditCharge(balance: AiCreditBalance, credits: number):
  ReadonlyArray<{ bucket: 'allowance' | 'grant'; credits: number }>;
```

- `splitAiCreditCharge` for a charge larger than `remaining` puts the overflow on `'allowance'`,
  so allowanceUsed can exceed the allowance. It never goes the other way: the grant is never
  overdrawn.
- A charge of 0 returns `[]`.
- The welcome grant comes from the CURRENT plan's `welcomeAiCredits`: 30 on Free, 0 on paid.
  After an upgrade it is no longer counted; after a downgrade it counts again, minus what was
  already spent from it. This is accepted: it keeps the grant a constant, with no row to create.

The refusal messages, in the style of `planPageLimitError`:

```ts
export const PLAN_CREDITS_EXHAUSTED_CODE = 'plan_limit_credits';
export function planCreditsExhaustedError(planName: string, renewsOn: Date): string;
// → "The Free plan's AI credits for this month are used up. They renew on 1 October. Upgrade for more."
//   Date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

export const PLAN_NO_WORKSPACE_CODE = 'plan_limit_no_workspace';
export const PLAN_NO_WORKSPACE_ERROR =
  "This board isn't in a workspace, so it has no AI credits. Your own AI key still works here.";
```

### 2.2 The migration — `supabase/migrations/20260926120000_ai_credit_usage.sql` (new)

Write it. **Do not apply it.** The owner applies migrations.

```sql
create table if not exists public.ai_credit_usage (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  feature      text not null check (feature in (...every AiCreditFeature...)),
  credits      integer not null check (credits > 0),
  bucket       text not null check (bucket in ('allowance', 'grant')),
  created_at   timestamptz not null default now()
);
create index if not exists ai_credit_usage_workspace_created_idx
  on public.ai_credit_usage (workspace_id, created_at desc);
alter table public.ai_credit_usage enable row level security;
-- Members can read their workspace's usage (for the meters later). No insert/update/delete
-- policy: only the server's service role writes.
create policy "ai_credit_usage_select_members" on public.ai_credit_usage
  for select using (public.get_workspace_role(workspace_id) is not null);
```

- Check that `workspaces`, `boards` and `get_workspace_role` exist under these names in the
  migrations, and match them.
- Append-only: nothing in the app updates or deletes a row.

### 2.3 The server module — `lib/server/billing/aiCredits.ts` (new)

Everything below reads and writes with the ADMIN client, for the same reason as
`resolveBoardPlan`: the caller may be a contributor.

1. **`resolveBoardPlan` gains the subscription period.**
   - Select `current_period_start, current_period_end` as well.
   - Add `subscriptionPeriod: { start: string | null; end: string | null } | null` to
     `BoardPlan`. It is null when the workspace has no row, or when `effectivePlanId` is `'free'`.
   - Keep every existing behaviour and test. The worker keeps compiling (it bundles this file).
2. **`readAiCreditBalance(admin, plan: BoardPlan, now: Date): Promise<AiCreditBalance>`**
   - Precondition: `plan.workspaceId` is not null.
   - Two reads, or one with the sum done in SQL if you find it simpler:
     - allowance used = sum of `credits` where bucket `'allowance'` and `created_at >= period.start`;
     - grant used = sum where bucket `'grant'`, all time.
   - It must not fetch unbounded rows into memory. Select only `credits`, filtered as above, and
     say in your report how you bounded it. A workspace spends at most a few thousand rows a month,
     so a filtered select of one integer column is acceptable; an RPC is NOT allowed (it needs a
     migration beyond §2.2).
   - A DB error THROWS.
3. **`checkManagedAiCredits(admin, boardId, now, cost, options?: { boardChat?: boolean })`**
   returns one of:
   ```ts
   | { kind: 'allowed'; plan: BoardPlan; balance: AiCreditBalance; charge: boolean }
   | { kind: 'refused'; status: 402; body: { error: string; code: string } }
   ```
   - A board with no workspace → refused with `PLAN_NO_WORKSPACE_CODE` / `PLAN_NO_WORKSPACE_ERROR`.
   - `remaining >= cost` → allowed, `charge: true`.
   - Otherwise, when `options.boardChat` and `limits.boardChatWhenOutOfCredits` → allowed,
     `charge: false` (PRICING.md: basic Q&A on boards stays free on paid plans).
   - Otherwise → refused with `PLAN_CREDITS_EXHAUSTED_CODE` and
     `planCreditsExhaustedError(PLANS[planId].name, balance.period.end)`.
   - Any throw from the reads PROPAGATES. The route turns it into 503 and never calls the model:
     fail closed.
4. **`recordAiCreditUsage(admin, { plan, balance, boardId, userId, feature, credits })`**
   - Inserts the rows from `splitAiCreditCharge`; nothing when credits is 0.
   - Returns normally or throws.
   - The ROUTE catches a throw here, logs `console.error('AI credit usage was not recorded', {
     boardId, feature, credits })` with no secrets and no user text, and STILL returns the answer.
     The person got the answer, and failing it now would waste the call we paid for.
   - Accepted race: two concurrent calls can both pass the check and both charge, so a workspace
     can end a few credits below zero. Say this in a comment. It is not worth a lock.

### 2.4 Knowing whether a call is managed, before and after

- **Before the call:** add to `resolveAIModelForRole.ts`:
  ```ts
  /** Reads ONLY the role preference -- no credential is loaded or decrypted. */
  export async function resolveAIModelSourceForRole(userId, role, preferences: AIRolePreferenceReader):
    Promise<AIModelResolutionSource>;
  ```
  - A null `connectionId` means `'collabboard-default'`, and a non-null one means `'byok'`: the
    same rule as `resolveAIModelForRole`.
  - A preference read error THROWS `AIProviderError('provider_unavailable')`, exactly as there.
  - `resolveAIModelForRole` itself does not change.
- **After the call:** charge ONLY if the source that ACTUALLY ran was `'collabboard-default'`.
  - If an execution result does not expose it today, add `source: AIModelResolutionSource` to
    that result type (`BoardAiChatResult`, and likewise for table-from-document and the wiki
    compile), taken from `resolved.source`.
  - A mismatch (the check saw byok and the call ran managed) is charged, not refused.
- The check runs ONLY when the pre-call source is `'collabboard-default'`. A byok caller never
  reads the ledger.

### 2.5 Wiring, per route

| Route | Where the check goes | Cost | Charged after |
|---|---|---|---|
| Board AI chat POST | after board authorization, **BEFORE the thread is created and the user's turn is stored**, so a refused message leaves nothing behind | check `cost = 1`, `boardChat: true` | a successful answer: `1 + (search was used ? 1 : 0)`, and only when `charge` |
| Starter questions | after authorization, before the model call | check `cost = 0`, `boardChat: true` (so Free pauses them at 0 credits, paid plans never do) | nothing: cost 0 |
| Table from document | after authorization, before the model call | 3 | 3 on success |
| Wiki compile (the proposal) | after authorization, before `executeBoardWikiCompilation` | 10 | 10 on success |

- "Search was used" means the answer's context actually carried the board-search block on this
  turn. Use whatever the route already knows for this; say in your report which value it is.
- Status codes:
  - a refusal → 402 with the body from `checkManagedAiCredits`;
  - a check throw → 503 `{ error: 'Unavailable' }`, or the route's existing 503 text;
  - a failed model call → no charge (the existing error path, unchanged).
- Inject the new dependencies the way each route already injects its others. Where a route is a
  factory with a deps object (the wiki page route), add a dep; where the route builds clients
  inline, build the admin client the way the Knowledge upload route does.
- For the wiki compile, if the check fits more cleanly inside `compileBoardWikiProposal`
  (`boardWikiCompileSession.ts`) as an injected dependency than in the route, put it there, and
  say which you chose.

### 2.6 The person sees why

Where each of the three features shows a failed request (the chat panel, the table-from-document
action, the wiki compile action):
- when the response has a `code` starting with `plan_limit_`, show the response's `error` text and
  a `See plans` link to `/dashboard/settings/billing`, the same way `KnowledgePdfUploader` does
  since PATCH-185 (reuse its approach; do not copy a component if one can be shared cheaply);
- every other error keeps today's text exactly.

Find these surfaces and report them. If one of them needs more than a small change, STOP and ask.

## 3. Tests

- **`plans.test.ts`:**
  - `AI_CREDIT_COSTS` values;
  - `boardChatWhenOutOfCredits` per plan;
  - `aiCreditPeriod`:
    - a paid period that contains `now` → that period;
    - no period → UTC calendar month;
    - an expired period → calendar month;
    - `now` at `2026-12-31T23:59Z` → December to 1 January;
  - `aiCreditBalance`:
    - Free, fresh → 40 remaining;
    - Free with 10 allowance used and 5 grant used → 25;
    - Pro → 500, grant 0;
    - an overspent allowance never goes negative;
  - `splitAiCreditCharge`:
    - all from the allowance;
    - allowance then grant (a 3-credit charge with 1 allowance left → 1 + 2);
    - overflow on the allowance;
    - 0 → `[]`;
  - the exact text of `planCreditsExhaustedError` and `PLAN_NO_WORKSPACE_ERROR`.
- **`aiCredits.test.ts`** (new, injected client):
  - the check:
    - allowed with `charge: true`;
    - refused 402 with `plan_limit_credits` and the renewal date;
    - board chat out of credits → Pro allowed with `charge: false`, Free refused;
    - no workspace → `plan_limit_no_workspace`;
    - a ledger read error THROWS;
  - recording:
    - one row;
    - a split into two rows;
    - 0 inserts nothing.
- **`boardPlan.test.ts`:** `subscriptionPeriod` is set on an active Pro, null on Free, and null
  with no row. Every existing assertion stays.
- **`resolveAIModelForRole.test.ts`:** `resolveAIModelSourceForRole`:
  - no row → default;
  - a null connection → default;
  - a connection → byok, and `loadCredential` is NEVER called;
  - a read error → throws.
- **Each of the four routes** (ADD to the existing test file; keep every assertion):
  - byok → the ledger is never read and nothing is recorded;
  - managed with credits → the model runs and exactly the cost is recorded;
  - refused → 402 with the code, and the model is never called;
  - check throws → 503, and the model is never called;
  - model fails → nothing is recorded;
  - recording throws → the answer is still returned.
  - **Chat only:**
    - a refusal stores NO user turn and creates NO thread;
    - with search used → 2 credits recorded;
    - Pro out of credits → the answer is returned and nothing is recorded.
- **UI:** in each surface's existing test file, a `plan_limit_credits` response shows the text and
  the link; any other error shows today's text with no link.

## 4. Allowed files

```
lib/domain/billing/plans.ts, plans.test.ts
lib/server/billing/aiCredits.ts, aiCredits.test.ts                        (new)
lib/server/billing/boardPlan.ts, boardPlan.test.ts                        (§2.3.1 only)
lib/server/ai/resolveAIModelForRole.ts, its test                          (§2.4 only)
lib/server/ai/boardAiChatExecution.ts                                     (only to expose `source`)
the table-from-document and wiki-compile execution modules                (only to expose `source`)
app/api/boards/[id]/ai/chat/route.ts, .../starter-questions/route.ts,
  .../table-from-document/route.ts, and their existing tests
lib/server/wiki/boardWikiCompileSession.ts, boardWikiPageRoute.ts, their tests
supabase/migrations/20260926120000_ai_credit_usage.sql                     (new; written, never applied)
the three UI surfaces of §2.6 and their existing tests
```

Everything else is forbidden: the board-less `/api/ai/*` routes (PATCH-188), the billing pages,
the Stripe code, the worker and `package.json`.

**Never touch the database; never apply the migration.** If a census or wiring test outside
these files needs a change, STOP and ask. That includes the transcript-writers census, the
provider-isolation tests and any source-scan of the AI routes. Never use git stash, reset,
restore, checkout, clean, commit or push. Never run a production build. Make every edit with a
real tool call; never write a tool call out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/billing lib/server/billing lib/server/ai lib/server/wiki "app/api/boards"
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- how `readAiCreditBalance` bounds its read;
- the value that means "search was used" in the chat route;
- where the wiki check lives;
- the three UI surfaces;
- anything in the migration you had to adjust to match the real table or function names.

Do not commit.

The CTO verifies live, after the owner applies the migration:
- a managed chat answer writes one `ai_credit_usage` row, with 2 credits when search was used;
- a byok answer writes nothing;
- a Free workspace at 0 credits is refused with the message and the link.

## 6. Commit message (verbatim)

```
feat(billing): AI credits -- the ledger, and the board AI features pay from the owner's plan

AI calls on the CollabBoard key cost money and nothing metered them. Each workspace now has
a monthly allowance of AI credits from its plan (Free 10 plus a 30-credit welcome, Pro 500,
Premium 2,000), recorded in an append-only ledger. Board AI chat (1, +1 with board search),
a table from a document (3) and a wiki compile (10) check the board owner's balance before
calling the model and are charged only after a successful answer. A call on the person's own
AI key costs nothing and never reads the ledger. On a paid plan, board chat keeps answering
when the credits run out; on Free, AI pauses until the month renews, with a message that
says when and links to the plans. A balance that cannot be read refuses rather than guessing.

The board-less AI actions (text actions, table fill, transcript punctuation, components)
are metered in the next patch, once they carry the board they act on.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
