# PATCH-183 — billing step 1: one source of truth for plans, and the Premium plan

Status: AUTHORIZED (owner, 2026-09-25: "yes push and start with billing"; plans decided in
`.fable5/docs/PRICING.md` on the owner's delegation)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Read first:
- `.fable5/docs/PRICING.md` (§3 is the table this patch encodes);
- `lib/auth/permissions.ts`;
- `types/permissions.ts`;
- `lib/stripe/client.ts`;
- `app/api/stripe/checkout/route.ts`;
- `app/api/webhooks/stripe/route.ts`;
- `app/dashboard/settings/billing/page.tsx`;
- `app/dashboard/settings/subscription/page.tsx`;
- `supabase/migrations/20260310_add_billing_schema.sql`.

---

## 1. Why

`PRICING.md` decides three plans: Free, Pro and Premium. The code knows two, `free` and `pro`,
and each place that cares repeats them:
- the database enum `billing_plan`;
- `getStripePriceId`;
- the webhook's `resolvePlanFromPrice`;
- `FREE_PLAN_BOARD_LIMIT` in `permissions.ts`;
- two settings pages, each with its own hard-coded plan list.

Before any limit can depend on the plan (steps 2 to 5), there must be ONE place that says what
each plan is and allows.

**This patch enforces nothing new.** The only limit in force today is 3 boards on Free, and it
stays in force, now read from the new module. File sizes, pages, documents and AI credits are
DECLARED here and enforced in later patches.

## 2. The design

### 2.1 `lib/domain/billing/plans.ts` (new, pure: no I/O, no env)

```ts
export type PlanId = 'free' | 'pro' | 'premium';
export type ModelTier = 'basic' | 'premium';

export interface PlanLimits {
  readonly boards: number | null;               // null = unlimited
  readonly fileSizeBytes: number;               // per file
  readonly processedDocuments: number | null;   // Knowledge documents processed in total; null = unlimited
  readonly pagesPerPdf: number;
  readonly monthlyAiCredits: number;
  readonly welcomeAiCredits: number;            // once, on a new workspace
  readonly modelTier: ModelTier;
}

export interface PlanDefinition {
  readonly id: PlanId;
  readonly name: string;                        // "Free" | "Pro" | "Premium"
  readonly priceUsd: { readonly monthly: number; readonly yearly: number };
  readonly tagline: string;                     // one short line for the plan card
  readonly limits: PlanLimits;
}

export const PLANS: Readonly<Record<PlanId, PlanDefinition>>;
export const PLAN_ORDER: readonly PlanId[];     // ['free', 'pro', 'premium']
export const PAID_PLAN_IDS: readonly PlanId[];  // ['pro', 'premium']

export function isPlanId(value: unknown): value is PlanId;
/** A subscription status that grants its plan: active, trialing, past_due. Anything else → Free. */
export function statusGrantsPlan(status: string | null | undefined): boolean;
/** The plan whose limits apply NOW: the stored plan when the status grants it, otherwise 'free'. An unknown plan string → 'free'. */
export function effectivePlanId(plan: string | null | undefined, status: string | null | undefined): PlanId;
export function planLimits(planId: PlanId): PlanLimits;
/** True when `planId` is at least `required` in PLAN_ORDER (premium ⊇ pro ⊇ free). */
export function planIncludes(planId: PlanId, required: PlanId): boolean;
```

**The values are EXACTLY `PRICING.md` §3**, with MB = 1024 × 1024 and GB = 1024 MB:

| | free | pro | premium |
|---|---|---|---|
| price monthly / yearly | 0 / 0 | 9 / 90 | 19 / 190 |
| boards | 3 | null | null |
| fileSizeBytes | 20 MB | 250 MB | 1 GB |
| processedDocuments | 5 | null | null |
| pagesPerPdf | 50 | 500 | 2000 |
| monthlyAiCredits | 10 | 500 | 2000 |
| welcomeAiCredits | 30 | 0 | 0 |
| modelTier | basic | basic | premium |

- Import `MB` from `lib/domain/storage/uploadLimits.ts`; don't redefine it.
- Freeze the objects.
- The header comment says: every limit lives here; `PRICING.md` is the rationale; later
  patches enforce.

### 2.2 `permissions.ts` and `types/permissions.ts` — read from the module

- `BillingPlan` becomes `PlanId` (re-export or alias, so every existing import keeps
  compiling).
- **`hasProEntitlements`** is true for `pro` OR `premium` with a granting status; its behaviour
  for `free` and `pro` is unchanged. Implement it with `planIncludes(effectivePlanId(...), 'pro')`.
- **Add `hasPremiumEntitlements`.**
- **`FREE_PLAN_BOARD_LIMIT`** stays exported (callers use it) and equals
  `PLANS.free.limits.boards`. `getBoardLimitForEntitlements` returns `'unlimited'` when the
  effective plan's `boards` is null, and otherwise the number.
  - Behaviour today: Free → 3, Pro (granting status) → unlimited. It must be IDENTICAL.
  - New: Premium → unlimited.
- `getWorkspaceEntitlements`: a stored plan that is not a `PlanId` → `'free'`. Today it casts
  blindly.

### 2.3 The database — a migration the OWNER applies

`supabase/migrations/20260926100000_billing_plan_premium.sql` (new; the CTO and DeepSeek never
apply it):

```sql
-- PATCH-183. The Premium plan (.fable5/docs/PRICING.md). ADD VALUE is additive and
-- idempotent; no row changes. It cannot run inside a transaction block on older
-- Postgres, so this file contains nothing else.
ALTER TYPE billing_plan ADD VALUE IF NOT EXISTS 'premium';
-- Rollback: an enum value cannot be dropped in place; to undo, no row may use 'premium'
-- and the type must be recreated. Nothing depends on it until a Premium checkout.
```

Check whether a repo test enumerates migrations, and make it pass if one does.

### 2.4 Stripe — two products × two intervals

- **`lib/stripe/client.ts`:** add `premiumMonthly` and `premiumYearly` from
  `STRIPE_PRICE_PREMIUM_MONTHLY` and `STRIPE_PRICE_PREMIUM_YEARLY`.
  `getStripePriceId(plan, interval)` returns the price for `pro` and `premium`, and `null` for
  anything else, including `free`.
  - Add `planForStripePrice(priceId): PlanId`: the ONE reverse mapping.
  - It returns `'free'` for an unknown, empty or missing price.
  - An env var that is EMPTY never matches: an empty string must not map an empty price id
    to a paid plan.
- **Webhook:** `resolvePlanFromPrice` is deleted and replaced by `planForStripePrice`, and the
  row's `plan` type becomes `PlanId`. Nothing else in the webhook changes.
- **Checkout:** `body.plan` must be a PAID `PlanId`, or 400 `{ error: 'Unknown plan' }`. It no
  longer silently defaults to `'pro'`. `interval` handling is unchanged.
- **`.env.example`**, if it exists: add the two new variable names with empty values. No real
  ids anywhere.

### 2.5 The two settings pages — one plan list

`app/dashboard/settings/billing/page.tsx` and `app/dashboard/settings/subscription/page.tsx`
both hard-code a Free/Pro list. Both now build their plan cards from `PLAN_ORDER` and `PLANS`.

- Each card shows:
  - the name, the monthly price and the tagline;
  - a short feature list generated from `limits`: boards, file size (via `formatBytes`), pages
    per PDF, documents processed, AI credits per month, and "Premium AI models" for the premium
    tier.
- The plan state type becomes `PlanId`, so a Premium workspace displays as Premium.
- The upgrade button sends `{ plan: <that card's id>, interval: 'monthly' }`.
- There is no button on the current plan, and none on Free.
- Keep each page's existing layout, styling and flows (portal, checkout redirect, status
  display). Only the plan data and the types change.
- Do NOT merge the two pages in this patch.

## 3. Tests

- **`lib/domain/billing/plans.test.ts`:**
  - every value in the §2.1 table, asserted one by one;
  - `PLAN_ORDER` and `PAID_PLAN_IDS`;
  - `isPlanId`;
  - `statusGrantsPlan` for each status plus `null` and `'weird'`;
  - `effectivePlanId`:
    - pro + active → pro;
    - premium + trialing → premium;
    - premium + canceled → free;
    - pro + null → free;
    - `'enterprise'` + active → free;
  - `planIncludes` over the full 3×3 matrix;
  - the objects are frozen.
- **`permissions`** (find its test file or add `lib/auth/permissions.plans.test.ts`):
  - `hasProEntitlements`:
    - true for pro and premium with active, trialing and past_due;
    - false for free, and false for canceled.
  - `hasPremiumEntitlements`: true only for premium with a granting status.
  - `getBoardLimitForEntitlements`:
    - free → 3;
    - pro active → unlimited;
    - premium active → unlimited;
    - premium canceled → 3.
  - `FREE_PLAN_BOARD_LIMIT === 3`.
- **Stripe** (`lib/stripe/client.test.ts`, new):
  - `getStripePriceId` for 2 plans × 2 intervals, reading env set in the test;
  - free → null;
  - `planForStripePrice` maps each of the 4 prices;
  - an unknown price → free;
  - with a premium env var set to `''`, `planForStripePrice('')` → free.
- **Checkout route** (a test in the style of the repo's route tests, mocking Stripe and
  Supabase):
  - `plan: 'premium'` uses the premium price;
  - `plan: 'free'` → 400;
  - a missing plan → 400;
  - `plan: 'gold'` → 400.
- **Source-level** (new): `resolvePlanFromPrice` no longer exists anywhere, and neither
  settings page contains a literal `'free' | 'pro'` union.

## 4. Allowed files

```
lib/domain/billing/plans.ts, plans.test.ts                               (new)
lib/auth/permissions.ts (+ its test, or a new permissions.plans.test.ts)
types/permissions.ts
lib/stripe/client.ts, lib/stripe/client.test.ts                          (test new)
app/api/stripe/checkout/route.ts (+ a new route test)
app/api/webhooks/stripe/route.ts
app/dashboard/settings/billing/page.tsx, app/dashboard/settings/subscription/page.tsx
supabase/migrations/20260926100000_billing_plan_premium.sql              (new; NOT applied)
.env.example                                                              (names only, if it exists)
one new source-level test
```

Everything else is forbidden: upload limits, AI routes, the marketing `components/ui-kit`
pricing sections and `package.json`. **Never apply a migration or touch the database.** Never
put a real Stripe id or key anywhere. If a census or wiring test outside these files needs a
change, or anything is unclear, STOP and ask. Never use git stash, reset, restore, checkout,
clean, commit or push. Never run a production build. Make every edit with a real tool call;
never write a tool call out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/domain/billing lib/auth lib/stripe app/api/stripe
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- every caller of `hasProEntitlements`, `getBoardLimitForEntitlements` and `BillingPlan` that
  you checked still behaves identically.

Do not commit.

## 6. Commit message (verbatim)

```
feat(billing): one source of truth for plans, and the Premium plan

The plans the product decided -- Free, Pro and Premium (.fable5/docs/PRICING.md) -- now live
in one module: price, boards, file size, pages per PDF, documents processed, AI credits and
model tier. Permissions, the Stripe checkout and webhook, and both settings pages read from
it instead of each repeating "free or pro". Premium joins as a paid plan that includes
everything Pro has; a migration (applied by the owner) adds it to the database.

Nothing new is enforced yet: the only limit in force is still three boards on Free. File
size, pages, documents and AI credits are declared here and enforced in the next patches.
Checkout now refuses an unknown plan instead of quietly selling Pro.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
