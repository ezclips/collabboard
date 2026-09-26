# PATCH-190 — billing: your own AI key is a Premium feature

Status: AUTHORIZED (owner, 2026-09-26: own key only on Premium; "Yes on both")
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-189 (`ce31e03f`)
Read first:
- `.fable5/docs/PRICING.md` §2 **Rule 3** (changed 2026-09-26) and Rule 1;
- `lib/server/ai/resolveAIModelForRole.ts` (`resolveAIModelForRole`, `resolveAIModelSourceForRole`);
- `lib/server/billing/aiCredits.ts` (`checkBoardAiCredits`, `checkAiActionCredits`,
  `checkManagedAiCredits`) and `lib/server/billing/boardPlan.ts` (`resolveBoardPlan`, which since
  PATCH-189 includes the trial);
- `lib/domain/billing/plans.ts` (`planIncludes`);
- the NINE call sites of `resolveAIModelForRole`:
  - `app/api/ai/table-fill/route.ts`;
  - `app/api/ai/table-plan/route.ts`;
  - `app/api/ai/text-action/route.ts`;
  - `app/api/ai/transcript-punctuate/route.ts`;
  - `app/api/boards/[id]/ai/chat/starter-questions/route.ts`;
  - `app/api/boards/[id]/ai/table-from-document/route.ts`;
  - `lib/server/ai/boardAiChatExecution.ts` (called from the chat route);
  - `lib/server/ai/boardWikiCompilation.ts` (called from `lib/server/wiki/boardWikiCompileSession.ts`);
  - `lib/server/ai/componentGeneration.ts`;
- the AI settings page: `app/dashboard/settings/ai/page.tsx` and `components/settings/ai/*`.

---

## 1. The rule

A person's own AI key (a BYOK connection) is used only when the board's OWNER workspace is on
**Premium**, including the 7-day Premium trial from PATCH-189. Everywhere else:
- the saved key is **ignored, never deleted, never modified**: the owner's existing OpenAI
  connection must survive untouched;
- the call runs on the CollabBoard default model and **uses the board owner's credits**, exactly
  like any managed call (the check, the charge after success, and the refusals).

On a Premium board, a byok call costs no credits and never reads the ledger, as today.

## 2. The design

### 2.1 The resolver cannot use a key it was not allowed to

- `resolveAIModelForRole(userId, role, deps, options: { allowByok: boolean })`.
  - **`options` is REQUIRED**, so every call site must decide. Forgetting it is a compile error,
    not a silent use of the key.
  - `allowByok: false` with a role that names a connection → return the CollabBoard default,
    exactly as for no connection. **The connection and the credential are never read.**
  - `allowByok: true` → today's behaviour, unchanged.
- `resolveAIModelSourceForRole` is unchanged. It still answers "what did this user configure".

### 2.2 The credit check decides whether the key is allowed

In `aiCredits.ts`, both `checkBoardAiCredits` and `checkAiActionCredits` change like this:

1. Resolve the configured source (preference only), as today.
2. **Configured `byok`:**
   - no board (`checkAiActionCredits` without `boardId`) → treat the call as managed from here on.
     It then gets today's `plan_limit_no_board` refusal. The message stays as it is: "Your own AI
     key still works" is no longer true, so change that text in `plans.ts` to: "This AI action
     isn't linked to a board, so it has no AI credits."
   - otherwise, keep the SAME order as the managed path for the board check: in
     `checkAiActionCredits` the caller must pass `canReadBoard` first, and a false answer →
     `forbidden`.
   - then `resolveBoardPlan`:
     - `planIncludes(plan.planId, 'premium')` → return `{ kind: 'byok' }`, reading no ledger;
     - otherwise → fall through to the managed path with this plan, reading the plan only once if
       practical.
3. **Managed:** exactly as today.

A throw anywhere propagates, as today; the route answers 503.

Every decision tells the execution whether the key may be used: `kind === 'byok'` means
`allowByok: true`, and every other kind means `false`. Add a small exported helper
`allowByokFor(decision)` so the nine sites read the same way.

### 2.3 The nine call sites

Each passes `{ allowByok: allowByokFor(decision) }` to `resolveAIModelForRole`.
- Where the resolver is called inside an execution module (`boardAiChatExecution`,
  `boardWikiCompilation`, `componentGeneration`), thread `allowByok` in through the module's
  existing input or deps. Required, not optional.
- **`starter-questions`** gets `allowByok` from its PATCH-187 check.
- The charge-after-success condition in every route stays keyed to the source that ACTUALLY ran.
  With `allowByok: false` that is always `'collabboard-default'`, so a Pro user with a saved key is
  now charged. That is the point.
- The "Your own AI key still works here" text in `PLAN_NO_WORKSPACE_ERROR`: on a board without a
  workspace there is no Premium plan, so the key does not work. Change it to "This board isn't in a
  workspace, so it has no AI credits."

### 2.4 The AI settings page tells the truth

On `app/dashboard/settings/ai/page.tsx` (or the component it renders), when the person's current
workspace is not Premium (`hasPremiumEntitlements`, which since PATCH-189 counts the trial), show a
short notice above the provider list:

> Your own AI keys are used on boards of Premium workspaces. On other boards, AI runs on
> CollabBoard's model and uses the board's AI credits. **See plans** (→ `/dashboard/settings/billing`)

- Saving, testing and deleting keys keep working exactly as today. Nothing is disabled or hidden:
  a Pro user may prepare a key before upgrading.
- Use the shared `PlanLimitNotice` from PATCH-188 if it fits. Otherwise use a plain paragraph with
  the link.

## 3. Tests

- **`resolveAIModelForRole.test.ts`:**
  - `allowByok: false` with a connection → the default; `getConnection` and `loadCredential` are
    NEVER called;
  - `allowByok: true` → today's byok (keep every existing test, passing `{ allowByok: true }`
    where it asserted byok, and choosing mechanically otherwise).
- **`aiCredits.test.ts`:**
  - configured byok:
    - on Premium → `byok`, no ledger read;
    - on the trial → `byok`;
    - on Pro → the managed decision (`allowed` or `refused` by the balance), and the ledger IS
      read;
    - on Free after the trial → refused `plan_limit_credits`;
    - `checkAiActionCredits` without a board → `plan_limit_no_board`;
    - an unreadable board → `forbidden`, with no plan read;
  - `allowByokFor` for each kind;
  - the two changed message texts.
- **Every route/module test** that exercises byok today (`*RouteByok.test.ts`,
  `componentRoutesByok.test.ts`, the chat and wiki tests):
  - keep their assertions under a `byok` decision;
  - ADD one case per call site: a configured-byok user on a Pro board runs on the CollabBoard
    model, is charged, and the credential is never loaded.
- **Settings page** (`aiSettingsPage.test.tsx`): the notice and link show for a non-Premium
  workspace and are absent for Premium; saving a key still works.
- **Census:** `components/settings/ai/aiSettingsSafety.source.test.ts` or another source scan may
  pin these files. If one fails on anything beyond a mechanical call-shape change, STOP and ask.

## 4. Allowed files

```
lib/server/ai/resolveAIModelForRole.ts and its test
lib/server/billing/aiCredits.ts, aiCredits.test.ts
lib/domain/billing/plans.ts, plans.test.ts             (the two message texts only)
the nine call sites above, the execution modules' callers that must pass allowByok through
  (the chat route, boardWikiCompileSession.ts, the component routes), and their existing tests
app/dashboard/settings/ai/page.tsx, components/settings/ai/* and their existing tests   (§2.4 only)
```

Everything else is forbidden:
- migrations and the database;
- the AI provider connection and credential repositories and their routes (a key is never
  modified or deleted);
- the billing pages, Stripe and `package.json`.

If anything is unclear or a census needs more than a mechanical change, STOP and ask, with the
conflict written out: the spec line, the code at file:line, and your proposed resolution. Never
use git stash, reset, restore, checkout, clean, commit or push. Never run a production build.
Make every edit with a real tool call; never write a tool call, a `<bash>` block or a command out
as text.

## 5. Verification

```
npx tsc --noEmit
npx vitest run lib/server/ai lib/server/billing lib/domain/billing lib/server/wiki components/settings/ai "app/api"
npx vitest run --reporter=json --outputFile=.opencode-vitest-190.json
```

The failing FILE set must equal the 26-file baseline. Report:
- the files changed and the tests added;
- the output;
- how each of the nine sites gets `allowByok`;
- every census assertion you changed.

Do not commit.

The CTO verifies live on the owner's workspace (Pro): a role pointed at the owner's own key now
runs on the CollabBoard model and writes a credit row, and the key is still listed in settings.

## 6. Commit message (verbatim)

```
feat(billing): your own AI key is a Premium feature

An own AI key gave every plan unlimited AI, including premium models, at no cost -- so the
heaviest AI users, the ones most likely to pay, had no reason to. A saved key is now used
only on boards whose owner is on Premium (or in the Premium trial), where it still costs no
credits. Everywhere else the call runs on CollabBoard's model and uses the board's AI
credits like any other; the key stays saved, untouched, ready for an upgrade. The model
resolver takes the permission as a required argument, so no call site can use a key it
was not allowed to, and the AI settings page says where keys apply.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
