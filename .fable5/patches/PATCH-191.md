# PATCH-191 — billing: usage meters on the billing page

Status: AUTHORIZED (owner, 2026-09-26: "Yes push and continue")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-190 (`395c9b8e`)
Read first:
- `.fable5/docs/PRICING.md` §5 step 5 ("usage meters");
- `lib/server/billing/boardPlan.ts` (`resolveBoardPlan`, `countWorkspaceKnowledgeDocuments`);
- `lib/server/billing/aiCredits.ts` (`readAiCreditBalance`);
- `lib/domain/billing/plans.ts` (`workspacePlan`, `aiCreditBalance`, `PLANS`);
- `lib/server/billing/stripeBilling.ts` (`getBillingActor`, `resolveActorWorkspace`);
- `lib/server/billing/checkoutRoute.ts` and `app/api/stripe/checkout/route.ts` (the route-factory
  style to copy);
- `app/dashboard/settings/billing/page.tsx` and its test (from PATCH-189);
- `lib/auth/permissions.ts` (`getWorkspaceEntitlements`, `getBoardLimitForEntitlements`: how the
  page already counts boards).

---

## 1. Why

The plans are enforced, but nobody can see where they stand until something is refused. The
billing page gets one "Usage" section, answering "how much do I have left, and when does it
renew":

| Meter | Paid plan / trial | Free after the trial |
|---|---|---|
| AI credits | "7 of 500 used · renews on 25 October" (trial: "of 100 · trial ends on 3 October") | "No AI on Free" and a See plans link, with no bar |
| Knowledge documents | "38 processed" (unlimited: count only, no bar) | "38 processed · no new documents on Free" |
| Boards | "12 boards" (unlimited) | "3 of 3 boards" with a bar |

These numbers are the SAME ones the server enforces: they come from the same functions, so the
meter and the refusal cannot disagree.

## 2. The design

### 2.1 One plan resolver for a workspace — `boardPlan.ts`

- Extract the part of `resolveBoardPlan` that works from a workspace id into
  `resolveWorkspacePlanById(admin, workspaceId): Promise<BoardPlan>`: read the subscription and
  `created_at`, then `workspacePlan`.
- `resolveBoardPlan` then does `boards.workspace_id` → `resolveWorkspacePlanById`.
- Behaviour and every existing test stay identical. The worker must still bundle, so use relative
  imports only.

### 2.2 The route — `GET /api/billing/usage`

- Add a factory `lib/server/billing/usageRoute.ts` in the style of `checkoutRoute.ts`, and
  `app/api/billing/usage/route.ts` wiring it.
- Order:
  1. `getBillingActor` → null → 401;
  2. `resolveActorWorkspace` → null → 400 `{ error: 'No active workspace' }`;
  3. **membership:** the actor must be a member of that workspace, via the `get_workspace_role` RPC
     through the actor's OWN client. Any role may READ usage; only owners/admins manage billing,
     and that is unchanged. No role → 403;
  4. with the admin client, read:
     - the plan (`resolveWorkspacePlanById`);
     - the balance (`readAiCreditBalance`);
     - the document count (`countWorkspaceKnowledgeDocuments`);
     - the board count (`boards` where `workspace_id`, with `count: 'exact', head: true`);
  5. any read throws → 503 `{ error: 'Usage is unavailable right now.' }`.
- Response (all numbers, no ids beyond what the page already has):
  ```json
  {
    "planId": "pro", "trialEndsAt": null,
    "credits": { "used": 7, "total": 500, "remaining": 493, "renewsOn": "2026-10-25T17:35:45.000Z" },
    "documents": { "used": 38, "limit": null },
    "boards": { "used": 12, "limit": null }
  }
  ```
  - `credits.total` = allowance + grant total; `used` = allowance used + grant used, capped so
    `used <= total`; `renewsOn` = `balance.period.end`.
  - On Free after the trial, `credits` is `{ "used": 0, "total": 0, "remaining": 0, "renewsOn": null }`.
- `Cache-Control: no-store`.

### 2.3 The page

- A "Usage" section on `app/dashboard/settings/billing/page.tsx`, above the plan cards. It
  fetches `/api/billing/usage` the way the page already fetches, and renders the three meters of
  §1.
- A bar only where there is a limit, drawn as a simple div with a width percentage and accessible
  text: `role="meter"` with `aria-valuenow`, `aria-valuemin` and `aria-valuemax`, or a visually
  equivalent label.
- At 80% used or more the bar turns to the warning colour the page already uses (or amber); at
  100% it turns to the error colour.
- Dates in English, day and month (`25 October`), UTC, the same formatter as
  `planCreditsExhaustedError`. Reuse it; do not add a second one.
- Loading → a small skeleton or "Loading usage…". An error → "Usage is unavailable right now." The
  rest of the page still works.
- Every member sees the section, and only owners/admins see the plan buttons, as today.

## 3. Tests

- **`boardPlan.test.ts`:** `resolveWorkspacePlanById` for paid, trial and free, and that a read
  error throws. Keep every existing `resolveBoardPlan` test green, unchanged.
- **`usageRoute.test.ts`** (new, injected deps):
  - 401;
  - 400 with no workspace;
  - 403 for a non-member;
  - a member (not the owner) gets 200;
  - the exact shape for Pro, for the trial (total 100, `trialEndsAt` set) and for Free after the
    trial (credits zero, `renewsOn` null);
  - `used` capped at `total` when overspent;
  - a read throw → 503;
  - `Cache-Control: no-store`.
- **Billing page test:**
  - the three meters for Pro, with "7 of 500" and "renews on 25 October";
  - the trial wording;
  - Free's "No AI on Free" with the See plans link and no credits bar;
  - 3 of 3 boards shows a full bar with the error colour class;
  - an error response shows the message and the plan cards still render.

## 4. Allowed files

```
lib/server/billing/boardPlan.ts, boardPlan.test.ts                 (§2.1 extraction only)
lib/server/billing/usageRoute.ts, usageRoute.test.ts               (new)
app/api/billing/usage/route.ts                                     (new)
app/dashboard/settings/billing/page.tsx, page.test.tsx
lib/domain/billing/plans.ts, plans.test.ts                         (only to export the date formatter, if it is not already)
```

Everything else is forbidden:
- migrations;
- the database;
- Stripe;
- the AI routes;
- the worker beyond `boardPlan.ts` bundling;
- `package.json`.

If a census or wiring test needs a change, or anything is unclear, STOP and ask, with the
conflict written out: the spec line, the code at file:line, and your proposed resolution. Never
use git stash, reset, restore, checkout, clean, commit or push. Never run a production build.
Make every edit with a real tool call; never write a tool call, a `<bash>` block or a command out
as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/server/billing lib/domain/billing app/dashboard/settings workers/knowledge-pdf
npx vitest run --reporter=json --outputFile=.opencode-vitest-191.json
```

Also bundle the worker as its Dockerfile does, to a temp outfile, and delete that output
afterwards.

The failing FILE set must equal the 26-file baseline. Report:
- the files changed and the tests added;
- the output;
- the worker bundle result.

Do not commit.

The CTO verifies live on the owner's workspace (Pro): the meters show the real numbers (credits
used this period, 38-ish documents, the board count), matching the ledger rows.

## 6. Commit message (verbatim)

```
feat(billing): usage meters -- credits, documents and boards on the billing page

The plans were enforced, but nobody could see where they stood until something was
refused. The billing page now shows how many AI credits are used and when they renew (or
when the trial ends), how many documents have been processed, and how many boards exist
against the plan's limit, with a bar that turns amber near the limit and red at it. The
numbers come from the same functions the server enforces with, so a meter and a refusal
cannot disagree. Any member of the workspace can see usage; only owners and admins can
change the plan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
