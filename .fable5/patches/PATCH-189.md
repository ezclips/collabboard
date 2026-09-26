# PATCH-189 — billing: the 7-day Premium trial, and the small Free plan after it

Status: AUTHORIZED (owner, 2026-09-26: chose "Mix: small Free stays"; "Push it and start 189")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-188 (`284c56b8`)
Read first:
- `.fable5/docs/PRICING.md` §2 **Rule 4** (new) and the §3 table (the Free column changed);
- `lib/domain/billing/plans.ts` (all of it: `PLANS`, `effectivePlanId`, `aiCreditPeriod`,
  `aiCreditBalance`, the `plan_limit_` messages);
- `lib/server/billing/boardPlan.ts` (`resolveBoardPlan`, `BoardPlan`, `subscriptionPeriod`) and
  `lib/server/billing/aiCredits.ts`;
- `lib/auth/permissions.ts` (`getWorkspaceEntitlements`, `getBoardLimitForEntitlements`,
  `canCreateBoardForEntitlements`), and their callers `app/dashboard/page.tsx` and
  `lib/collabboard/templates/template1.ts`;
- `lib/server/knowledge/knowledgeUploadRoute.ts` (the document gate from PATCH-185);
- `lib/server/billing/stripeBilling.ts` (`findLivePaidSubscription`);
- `app/dashboard/settings/billing/page.tsx` and `app/dashboard/settings/subscription/page.tsx`;
- the `workspaces` table (`created_at`) in `supabase/migrations/20260309_normalize_workspace_roles.sql`.

---

## 1. What changes

**The trial.** A workspace with no paying subscription is on a **Premium trial for 7 days**, counted
from `workspaces.created_at`. No card is needed, and Stripe is not involved. During the trial:
- the workspace has every Premium limit (boards, file size, documents, pages per PDF, model
  tier);
- **except AI credits: 100 for the whole trial, not 2,000.** A new workspace can be opened every
  week, so the trial allowance must be small; 100 answers are plenty to evaluate. The credit
  period is the trial window `[created_at, created_at + 7 days)`.

**Free, after the trial**, per PRICING.md §3:
- boards stay usable and shareable, with the same board limit of 3;
- **AI is off:** 0 monthly credits and no welcome grant. Board chat does NOT keep answering at 0
  on Free (`boardChatWhenOutOfCredits` stays false);
- **no new documents are processed:** `processedDocuments: 0`. Documents that already exist stay
  readable. Nothing is deleted or hidden;
- the file size of 20 MB and the page limit of 50 are unchanged.

**A paying subscription always wins over the trial.** A workspace that subscribes on day 2 is on
its paid plan from then on.

## 2. The design

### 2.1 The domain — `lib/domain/billing/plans.ts` (pure)

- `PLANS.free.limits`: `processedDocuments: 0`, `monthlyAiCredits: 0`, `welcomeAiCredits: 0`.
  - Keep the `welcomeAiCredits` field and the grant bucket: top-up packs will use them.
  - Update the Free `tagline` to fit: something like "Share boards with anyone, free".
- Add:
  ```ts
  export const PLAN_TRIAL_DAYS = 7;
  export const TRIAL_AI_CREDITS = 100;

  export interface WorkspacePlan {
    readonly planId: PlanId;                    // 'premium' during the trial
    readonly limits: PlanLimits;                // the trial's: Premium's, with monthlyAiCredits = TRIAL_AI_CREDITS
    readonly trial: { readonly endsAt: Date } | null;   // non-null only while the trial applies
    readonly creditPeriod: { start: string | null; end: string | null } | null;
  }

  /** The plan a workspace actually has now: a paying subscription, else the trial window, else Free. */
  export function workspacePlan(
    subscription: { plan?: string | null; status?: string | null;
                    current_period_start?: string | null; current_period_end?: string | null } | null,
    workspaceCreatedAt: string | null,
    now: Date,
  ): WorkspacePlan;
  ```
- Rules:
  - paid (`effectivePlanId(...) !== 'free'`) → that plan, `trial: null`, and `creditPeriod` = the
    subscription period;
  - otherwise, when `workspaceCreatedAt` is a valid date and `now < createdAt + 7 days` → the
    trial, with `creditPeriod` = the trial window;
  - otherwise Free, with `trial: null` and `creditPeriod: null`;
  - a missing or unparseable `workspaceCreatedAt` → no trial (fail closed toward Free).
- **`effectivePlanId` does not change.** It keeps meaning "the plan the SUBSCRIPTION grants", which
  checkout and `findLivePaidSubscription` depend on: a trial is not a live paid subscription, so
  a trialing workspace can still check out.
- The document refusal for a limit of 0 must read naturally. When `processedDocuments === 0` the
  upload route's message is:
  `"Processing documents needs a paid plan. Your trial has ended -- upgrade to add more."`
  with the same code `plan_limit_documents`. Put the text in `plans.ts`. The non-zero wording from
  PATCH-185 stays for any future non-zero limit.

### 2.2 The server — `lib/server/billing/boardPlan.ts`

- `resolveBoardPlan` also reads the workspace's `created_at` (`workspaces`, by id, with the admin
  client; an error THROWS), and builds the result with `workspacePlan(..., new Date())`.
- `BoardPlan` gains `trial: { endsAt: string } | null`.
- `subscriptionPeriod` becomes the `creditPeriod` above, so `aiCreditPeriod` keeps working
  unchanged: the trial window is simply the credit period.
  - Rename the field to `creditPeriod` only if every use is inside the allowed files. Otherwise
    keep the name and document that it now also holds the trial window.
- Inject `now` if the existing tests need determinism. Everything that consumes `BoardPlan` (the
  upload route, the worker's page limit, the AI credits) then follows the trial with no further
  change.
- **Check that the worker still bundles:** `boardPlan.ts` may only use relative imports (see
  PATCH-186).

### 2.3 Board limits — `lib/auth/permissions.ts`

- `getWorkspaceEntitlements` also reads the workspace's `created_at` through the SAME client it is
  given (the members' RLS already lets a member read their workspace; check this in the
  migrations and say how).
- It returns the effective plan through `workspacePlan`, so a trialing workspace has Premium's
  unlimited boards.
- Keep `EntitlementsContext`'s existing fields and add `trialEndsAt: string | null`.
- `hasProEntitlements` / `hasPremiumEntitlements` / `getBoardLimitForEntitlements` follow the trial.
- After the trial, a workspace with more than 3 boards keeps them all, usable. It only cannot
  create a new one. Confirm that `canCreateBoardForEntitlements` does exactly that, and change
  nothing else there.

### 2.4 The billing pages

On `app/dashboard/settings/billing/page.tsx`, and on `.../subscription/page.tsx` if it shows the
current plan:
- **during the trial:** "Premium trial — 5 days left" (whole days, rounded up; "1 day left" on the
  last day), with the plan cards still offering Pro and Premium checkout;
- **after the trial on Free:** "Your Premium trial has ended. You're on Free: boards and sharing
  stay; AI and new documents need a plan.";
- the Free plan card's feature list follows the new limits: no "5 Knowledge documents", no "30
  welcome credits", and "No AI" or its equivalent. Keep the existing card structure.
- The pages read the plan the way they do today; where they need `created_at`, read it with the
  client they already use.

## 3. Tests

- **`plans.test.ts`:**
  - update the Free limit assertions (0 / 0 / 0);
  - `workspacePlan`:
    - created 2 days ago with no subscription → premium, trial `endsAt` = created + 7 days, and
      `limits.monthlyAiCredits === 100`;
    - created 8 days ago → free, trial null;
    - exactly at `created + 7 days` → free (the window is half-open);
    - pro active on day 2 → pro, trial null, with the subscription period;
    - pro canceled on day 2 → trial;
    - a null or garbage `createdAt` → free;
    - the trial's `creditPeriod` is the trial window;
  - `aiCreditBalance` on the trial → 100 remaining;
  - the limit-0 document message text.
- **`boardPlan.test.ts`** (keep every assertion, adjusting only fixtures for the added
  `workspaces` read):
  - a trialing board → premium with `trial`;
  - an expired one → free;
  - a `workspaces` read error THROWS.
- **`aiCredits.test.ts`:**
  - a trialing workspace allows up to 100 credits, then refuses;
  - an expired Free workspace refuses every managed call with `plan_limit_credits`;
  - board chat on expired Free is refused, not free.
- **Upload route:** Free after the trial → 403 `plan_limit_documents` with the limit-0 text, before
  `formData()`; a trialing workspace passes.
- **`permissions`** (its existing test file):
  - a trialing workspace has unlimited boards;
  - after the trial the limit is 3;
  - 5 existing boards after the trial → cannot create, and nothing else changes.
- **Billing page** (its existing test, if any; otherwise the smallest render test in the style of
  the other settings tests): the trial line with days left; the ended line.
- **Unchanged, and must still pass:** `findLivePaidSubscription` and checkout tests. A trial is
  not a paid subscription.

## 4. Allowed files

```
lib/domain/billing/plans.ts, plans.test.ts
lib/server/billing/boardPlan.ts, boardPlan.test.ts
lib/server/billing/aiCredits.test.ts            (fixtures and the §3 cases; aiCredits.ts only if a type forces it)
lib/auth/permissions.ts and its existing test
lib/server/knowledge/knowledgeUploadRoute.ts and its test   (the limit-0 message only)
app/dashboard/settings/billing/page.tsx, app/dashboard/settings/subscription/page.tsx, their tests
test files that build a BoardPlan / PlanLimits fixture and break on the new field (fixture-only edits)
```

Everything else is forbidden:
- migrations. `workspaces.created_at` already exists; if it does not, STOP and ask;
- Stripe checkout, the webhook and `stripeBilling.ts`;
- the AI routes;
- the worker except through `boardPlan.ts`;
- `package.json`.

**Never touch the database.** If a census or wiring test needs a change, STOP and ask. Never use
git stash, reset, restore, checkout, clean, commit or push. Never run a production build. Make
every edit with a real tool call; never write a tool call, a `<bash>` block or a command out as
text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/billing lib/server/billing lib/auth lib/server/knowledge app/dashboard/settings workers/knowledge-pdf
npx vitest run --reporter=json --outputFile=.opencode-vitest-189.json
```

Also bundle the worker the way its Dockerfile does and confirm it builds. This is esbuild, not a
Next production build.

The failing FILE set must equal the 26-file baseline. Report:
- the files changed and the tests added;
- the output;
- how `permissions.ts` reads `created_at` and why RLS allows it;
- whether you renamed `subscriptionPeriod`;
- the worker bundle result.

Do not commit.

The CTO verifies live:
- the owner's workspace, which is on Pro, is unaffected;
- the billing page's lines;
- a trial workspace, if one can be created without touching the database.

## 6. Commit message (verbatim)

```
feat(billing): a 7-day Premium trial, then a small Free plan for sharing

Free is for evaluating (PRICING.md Rule 4). A new workspace now gets seven days at Premium
level, with no card -- every Premium limit except AI, which is capped at 100 credits for the
trial so a fresh workspace each week is not a free Premium plan. When the trial ends without
a payment, the workspace keeps its boards, sharing and free contributors, but AI is off and
no new documents are processed; documents processed during the trial stay readable. A
paying subscription always wins over the trial, and a trial never counts as a live paid
subscription, so checkout works during it. The billing page says how many trial days are
left, and what Free keeps once it ends.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
