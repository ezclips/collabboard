# PATCH-184 — billing correctness: plan changes without double charges, no silent failures

Status: AUTHORIZED (owner, 2026-09-25: "yes" to the next billing step)
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-183 (`713ad5c2`), `3d4d64fe` (the subscriptions unique keys, applied)
Read first:
- `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`,
  `app/api/webhooks/stripe/route.ts`;
- `lib/stripe/client.ts`, `lib/stripe/admin.ts`;
- `lib/domain/billing/plans.ts`, `lib/auth/permissions.ts` (`get_workspace_role` usage);
- `app/dashboard/settings/billing/page.tsx`, `app/dashboard/settings/subscription/page.tsx`;
- `lib/domain/storage/uploadLimits.ts` (`formatBytes`).

---

## 1. Why — found by the first live test checkout (Stripe sandbox, 2026-09-25)

1. **Upgrading charges twice.** The Upgrade button always opens a NEW Checkout subscription. A
   Pro workspace that upgrades to Premium ends up with two live subscriptions, Pro and Premium,
   both billing. The webhook upserts one row per workspace, so the app only remembers the last
   one.
2. **Failures are silent, and permanently.**
   - The webhook's `checkout.session.completed` branch catches every error, logs a warning and
     answers 200. That is how a missing unique key lost every paid plan without anyone
     noticing.
   - Worse, `recordWebhookEvent` inserts the event into `webhook_events` BEFORE processing it.
     So even a 500 would not help: Stripe's retry finds the event "Already processed" and
     skips it forever.
3. **Anyone in a workspace can start billing.** The checkout and portal routes check that the
   user is logged in and has a current workspace, but not their ROLE in it. Any member could
   open a subscription for the workspace or reach its billing portal.
4. **Wrong currency on screen.** Stripe charges CHF, but both pages print "$".
5. **"1024.0 MB"**: `formatBytes` has no GB.

## 2. The design

### 2.1 One server-side billing module — `lib/server/billing/stripeBilling.ts` (new)

Move the webhook's `upsertCustomerFromStripe`, `upsertSubscriptionFromStripe` and
`markSubscriptionCanceled` here UNCHANGED in behaviour, and export them. The webhook and the new
plan-change route both import them, so there is ONE sync implementation. Add:

```ts
/** Only a workspace owner or admin may manage billing. */
export async function canManageWorkspaceBilling(supabase, workspaceId: string, userId: string): Promise<boolean>;
// via the existing `get_workspace_role` RPC (see getPermissionContext); true only for 'owner' | 'admin'

/** The workspace's live paid subscription, or null. "Live" = a stored stripe_subscription_id AND statusGrantsPlan(status) AND effective plan is paid. */
export async function findLivePaidSubscription(supabaseAdmin, workspaceId: string): Promise<{ stripeSubscriptionId: string; plan: PlanId; priceId: string | null } | null>;
```

Before coding, check the role values `get_workspace_role` actually returns (the
`WorkspaceRole` type) and use the real names. If "admin" is not one of them, STOP and ask.

### 2.2 Checkout refuses a second subscription; a new route changes the plan

**`app/api/stripe/checkout/route.ts`:**
- after resolving the workspace, `canManageWorkspaceBilling` → otherwise 403
  `{ error: 'Only a workspace owner or admin can manage billing.' }`;
- then, if `findLivePaidSubscription` is not null → 409
  `{ error: 'This workspace already has a subscription. Change the plan instead.', code: 'already_subscribed' }`.

Nothing else changes.

**`app/api/stripe/portal/route.ts`:** the same 403 check. Nothing else changes.

**`app/api/stripe/change-plan/route.ts` (new), `POST { plan, interval }`:**
1. Parse the body with `parseCheckoutRequest`: 400 on a bad plan.
2. Auth → 401. Resolve the workspace → 400 as checkout does. `canManageWorkspaceBilling` → 403.
3. `findLivePaidSubscription` → null → 409
   `{ error: 'No active subscription to change.', code: 'no_subscription' }`.
4. `getStripePriceId(plan, interval)` → null → 400 `Unknown pricing configuration`. If it
   equals the subscription's current price → 400 `{ error: 'This is already your plan.' }`.
5. Retrieve the Stripe subscription. It must have exactly ONE item, or 409
   `{ error: 'This subscription cannot be changed here. Use the billing portal.' }`.
6. Update it:
   ```ts
   stripe.subscriptions.update(id, {
     items: [{ id: itemId, price: newPriceId }],
     proration_behavior: 'create_prorations',
     metadata: { ...sub.metadata, workspaceId },
   });
   ```
7. Sync the RETURNED subscription immediately with `upsertSubscriptionFromStripe`, so the page
   is right before the webhook arrives. The webhook's later sync is idempotent.
8. 200 `{ plan: <the plan now stored>, status }`.

Any Stripe error → 502 `{ error: 'Stripe could not change the plan. Nothing was changed.' }`.
Log it with `console.error`, and log no ids beyond the event or subscription id.

### 2.3 The webhook — errors surface, and retries are honoured

In `app/api/webhooks/stripe/route.ts`:
- **Split `recordWebhookEvent`:**
  - `alreadyProcessed(event)`: the existing SELECT;
  - `markProcessed(event)`: the existing INSERT, where a 23505 is fine.
- **Order:** signature → `alreadyProcessed` → 200 "Already processed" → process →
  `markProcessed` → 200 "ok".
  - A processing error → 500, and the event is NOT marked, so Stripe's retry processes it.
- **`checkout.session.completed`:** remove the try/catch that swallows. An error propagates to
  the outer handler → 500.
- **Add `customer.subscription.created`,** handled exactly like `updated`.
- Use the functions from §2.1. The webhook no longer defines its own copies.

### 2.4 The pages — CHF, "Switch to", and a confirmation

**`lib/domain/billing/plans.ts`:**
- rename `priceUsd` → `price`;
- add `export const PLAN_CURRENCY = 'CHF' as const;`
- add `export function formatPlanPrice(amount: number): string`, which returns `CHF 9` or
  `CHF 190`: no decimals when whole, otherwise two.

The values are unchanged: 9/90 and 19/190. Update every reader and the plan tests.

**`lib/domain/storage/uploadLimits.ts` — `formatBytes`:** bytes ≥ 1 GB (1024 MB) → `"1 GB"`, or
`"1.5 GB"` with one decimal and a trailing `.0` dropped. Below 1 GB it is unchanged, so every
existing MB/KB assertion still holds.

**Both settings pages:**
- Prices use `formatPlanPrice`: `CHF 9 /month`, `CHF 90 /year`.
- **The workspace is on Free:** a paid card's button stays "Upgrade" → checkout, as today.
- **The workspace is on a paid plan:**
  - the OTHER paid card's button says `Switch to Premium` or `Switch to Pro`;
  - clicking it opens an INLINE confirmation in that card, not a browser `confirm()`:
    > Your plan changes now. The price difference is settled on your next invoice.

    with the buttons `Confirm` and `Cancel`;
  - Confirm → `POST /api/stripe/change-plan` → on success reload the plan state; on error
    show `error` in the card.
  - Free's card shows no button. Leaving a paid plan is done in the billing portal.
- **A 409 `already_subscribed` from checkout** (for example a stale page) shows the message in
  the card and reloads the plan state.
- **A 403** shows its message. Hide the buttons entirely when the page already knows the role is
  not owner or admin; the billing page already shows "Role: …".

## 3. Tests

- **`lib/server/billing/stripeBilling.test.ts`** (injected clients):
  - `canManageWorkspaceBilling` for owner, admin, member, viewer and an RPC error (→ false);
  - `findLivePaidSubscription`:
    - pro active → found;
    - premium past_due → found;
    - pro canceled → null;
    - free active → null;
    - no row → null;
    - no stripe id → null.
- **The change-plan route**, as a handler factory in `lib/server/billing/changePlanRoute.ts`
  with the app route a thin wrapper, in the style of `lib/server/knowledge/*Route.ts`:
  - 401 / 403 / 400 bad plan / 409 no subscription;
  - 400 same price;
  - 409 when the subscription has more than one item;
  - success calls `subscriptions.update` with exactly one item `{ id, price }` and
    `create_prorations`, then syncs the RETURNED subscription;
  - a Stripe error → 502, with no sync.
- **Checkout** (move its core into `lib/server/billing/checkoutRoute.ts` the same way, if that
  is the smallest route to a test; otherwise test the helpers it calls):
  - 403 for a member;
  - 409 `already_subscribed` when a live paid subscription exists, with no Stripe session
    created.
- **Webhook** (`lib/server/billing/stripeWebhookRoute.ts` as a handler factory, with the app
  route a thin wrapper):
  - a processing error → 500 AND the event is not marked;
  - the retry of that event then processes;
  - an already-marked event → 200 "Already processed", with no processing;
  - `customer.subscription.created` syncs;
  - `checkout.session.completed` with a failing sync → 500.
- **`formatBytes`:** 1 GB → `1 GB`; 1.5 GB → `1.5 GB`; 1023.9 MB unchanged in MB; every
  existing assertion unchanged.
- **`formatPlanPrice`:** 9 → `CHF 9`; 9.5 → `CHF 9.50`; 0 → `CHF 0`.
- **Source-level:**
  - no `$` price literal in either settings page;
  - the webhook contains no `console.warn("Stripe checkout session sync warning"`;
  - `upsertSubscriptionFromStripe` is defined in exactly one file.

`lib/server/billing/**` is under the included `lib/server/**` glob, so no test-config change is
needed.

## 4. Allowed files

```
lib/server/billing/stripeBilling.ts, changePlanRoute.ts, stripeWebhookRoute.ts,
  checkoutRoute.ts (if used) and their tests                               (new)
app/api/stripe/change-plan/route.ts                                        (new, thin)
app/api/stripe/checkout/route.ts, app/api/stripe/portal/route.ts, app/api/webhooks/stripe/route.ts
lib/stripe/client.ts and its test                                          (only if a helper must move)
lib/domain/billing/plans.ts and its tests
lib/domain/storage/uploadLimits.ts and its test                           (formatBytes GB only)
app/dashboard/settings/billing/page.tsx, app/dashboard/settings/subscription/page.tsx
one new source-level test
```

Everything else is forbidden, including migrations, `package.json`, the marketing pricing
components and every non-billing route. **Never call the real Stripe API or the database from a
test.** Never put a real Stripe id or key anywhere. If a census or wiring test outside these
files needs a change, or anything is unclear, STOP and ask. Never use git stash, reset, restore,
checkout, clean, commit or push. Never run a production build. Make every edit with a real tool
call; never write a tool call out as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/server/billing lib/domain/billing lib/domain/storage lib/stripe lib/auth
npx vitest run
```

The failing FILE set must equal the 26-file baseline. Report:
- the files you changed and the tests you added;
- the output;
- the `WorkspaceRole` values you found.

Do not commit.

The CTO then tests live in the Stripe sandbox:
- Pro → Premium switch: ONE subscription, with its price changed;
- Premium → Pro;
- a second checkout is refused;
- a webhook failure followed by its retry.

## 6. Commit message (verbatim)

```
fix(billing): plan changes without double charges, and no silent webhook failures

Found by the first live test checkout. Upgrading a paid workspace opened a second Stripe
subscription, so Pro and Premium would both have billed; the plan is now changed on the
existing subscription, with the difference settled on the next invoice, and checkout
refuses to open a second one. The webhook swallowed sync errors and marked every event
processed before handling it, so a failure was answered "ok" and never retried; errors now
return 500 and an event is marked only once it has been handled. Only a workspace owner or
admin may start a checkout, change the plan or open the billing portal. Prices show in CHF,
the currency Stripe charges, and a gigabyte reads as "1 GB".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
