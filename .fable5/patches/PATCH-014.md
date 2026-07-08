# PATCH-014 — Extraction: delete-account page (auth-only swap)

**Status:** DONE (2026-07-08, commit `7726215`) — CTO review PASSED. **Amendment 1: e2e wrong-confirmation assertion corrected to the reachable behavior. Amendment 2: OLD-page dispute resolved as a harness artifact; characterization stood; verify-step click hardened to hydration-acknowledged.**
**Complexity:** easy (Pattern C + one `signOutCurrentUser` call)
**Assigned model:** **GPT-5.4**
**Pattern:** C — auth-only swap (reference: PATCH-007), plus the sign-out
helper from PATCH-011.
**Depends on:** PATCH-007 (`getCurrentUser`), PATCH-011 (`signOutCurrentUser`).

## CTO note — why this page is now in a GPT-5.4 batch
It was excluded from 005–009 as "security-sensitive". Re-census (2026-07-07)
showed the client page contains NO deletion logic: it renders the
confirmation form, POSTs to `/api/settings/delete-account` (a server route,
untouched by this patch), and signs out on success. The security-critical
code is server-side and out of scope here; the client extraction is a
mechanical Pattern C swap. Decision reversed openly on that evidence.
**The API route and everything under `app/api/` remain absolutely
untouchable in this patch.**

## Goal
Move `app/dashboard/settings/delete-account/page.tsx` (199 lines) off direct
Supabase; grandfather list 12 → 11.

## Bindings

The page's two auth calls (CTO-verified: exactly `1 getUser`, `1 signOut`):

- **Identity guard** (currently `auth.getUser()` → `if (!user)` → toast +
  `router.push('/login')`): becomes `getCurrentUser()` from
  `lib/infra/supabase/currentUser`. Mapping: `!result.ok` OR
  `result.value === null` → the existing toast-and-redirect path (an
  unavailable auth check and a missing user must both fail closed into the
  same "Please log in again" branch — matching today, where a getUser error
  yields a null user). NOTE: `getUser` is network-validating and this is an
  identity check before a destructive action — that is why the mapping uses
  `getCurrentUser` (which wraps `getUser`), NOT the session-read helper.
  Do not substitute `getSessionUser`.
- **Post-deletion sign-out** (`await supabase.auth.signOut()` inside the
  success path): becomes `await signOutCurrentUser();` — result deliberately
  ignored exactly as the error was implicitly ignored today (the account is
  already deleted server-side; the toast + redirect flow after it stays
  byte-identical).
- The `fetch('/api/settings/delete-account', ...)` call, the DELETE
  confirmation text logic, all toasts, and all rendering: UNTOUCHED.
- Both `@supabase` imports removed.

## Pre-edit census (paste; STOP if it shows more)
```bash
grep -oE "supabase\.(auth\.[a-zA-Z]+|from\('[^']*'\)|storage|rpc\()" app/dashboard/settings/delete-account/page.tsx | sort | uniq -c
# must show exactly: 1 auth.getUser, 1 auth.signOut — nothing else
grep -oE "\buser(\?)?\.[a-zA-Z_]+" app/dashboard/settings/delete-account/page.tsx | sort -u
# if any user field beyond a null-check is consumed (e.g. user.email rendered),
# report it — getCurrentUser provides id+email; anything MORE means STOP.
```

## Amendment 1 (2026-07-08) — the wrong-confirmation error toast is UNREACHABLE through the UI · CTO decision

**Blockage (GPT-5.4, correct stop):** the original e2e spec required typing
a wrong confirmation ("NOPE") and asserting the error toast. But the
destructive button is `disabled={deleting || deleteConfirmText !== 'DELETE'}`
(page.tsx line 166 pre-edit), so a wrong confirmation can never be
SUBMITTED — the `toast.error('Please type DELETE to confirm')` guard in
`handleDeleteAccount` (lines 43–46) is a handler-level dead branch through
the UI. **CTO-verified against the source (2026-07-08).**

**Root cause (CTO spec defect):** the e2e requirement was written from the
HANDLER code without tracing the asserted behavior to a reachable UI
trigger. Same defect family as PATCH-012 Amendment 1 (import chain not
traced to a mounted root) — an asserted behavior must be traced to a
reachable trigger, not just found in the source.

**Decision: characterize the reachable behavior.** Making the error path
reachable (e.g. enabling the button and relying on the handler guard) is a
product/behavior change and is REJECTED for the same standing reason as
PATCH-012's Option-3 rejection: behavior changes never ride an extraction
patch. The handler guard itself stays byte-untouched (Bindings already say
the confirmation-text logic is UNTOUCHED — it is legitimate defense-in-depth
even if the UI can't reach it today). Note the corrected spec is STRONGER
than the original where it counts: the verify step it now requires exercises
the exact `getUser` call this patch swaps, which the original spec never
covered.

## Amendment 2 (2026-07-08) — the disputed OLD-page behavior is REAL; the implementer's observation was a swallowed pre-hydration click · CTO decision

**Dispute (GPT-5.4, correct stop — no code changed):** running the Amendment 1
flow against the OLD page, the implementer reported that clicking the verify
step ("Log in") produced `GET /auth/v1/user → 200` but NO "Identity verified"
toast, NO "Verified" state, and no redirect — and asked that the OLD-page
characterization be weakened to match.

**CTO independent reproduction (2026-07-08, OLD page, running dev server,
same `e2e/.auth/user.json` storage state, Playwright chromium probe):**

| Probe | Click timing | Auth traffic | Outcome |
|---|---|---|---|
| 1 | after button visible + 2s settle | one `GET /auth/v1/user → 200` | "Identity verified" toast + "Verified" state, ~1.5s after click |
| 2 | the instant the button became visible | **none** | UI unchanged indefinitely — the implementer's exact symptom |

**Root cause (harness artifact, not product behavior):** on a dev server the
button renders and is clickable BEFORE React attaches its handlers; a click
in that window is silently swallowed — no request, no `verifying` spinner, no
state change, and no error. This is the same failure family the implementer
had already fixed in `e2e/auth.setup.ts` (c7b0fb1: "form can be visible
before React handlers attach"). Note the swallowed-click reproduction fired
NO `getUser` at all: the 200 the implementer attributed to the click did not
come from a running `handleVerify` (when the handler actually runs, the
success UI deterministically follows — probe 1).

**Decision: the Amendment 1 characterization STANDS unchanged.** The asserted
behavior is real and CTO-reproduced; weakening the characterization to "no UI
change" would enshrine a test-harness race as product behavior and would
leave the exact `getUser` call this patch swaps uncovered. **No behavior
change is authorized.** Instead, the spec's verify-step click becomes an
**acknowledged click**:

```ts
const verifyStep = page.getByRole('button', { name: /Log in/ });
await expect(async () => {
  await verifyStep.click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible({ timeout: 3_000 });
}).toPass({ timeout: 30_000 });
await expect(page.locator('[data-sonner-toast]', { hasText: 'Identity verified' })).toBeVisible();
```

Retry-click is safe HERE because the trigger is idempotent and read-only
(`getUser`); asserting the durable "Verified" state inside the retry and the
transient toast after it keeps both Amendment 1 assertions. **This retry-click
idiom is authorized ONLY for the verify step. It must NEVER be applied to
"Delete my account", "Permanently delete account", or any mutating control —
the existing rule stands: never click the destructive button at any point,
not even while disabled.** Rule generalized in PATCH_REFERENCE §6
(hydration-acknowledged first click).

## Files to Create
- `e2e/characterization/delete-account-page.spec.ts` — Phase A first, and
  **read-only by design**. **[Amendment 1] Corrected flow:**
  login → open the page → assert the warning copy renders → click the
  verify step ("Log in") **[Amendment 2: as an acknowledged click — the
  exact `toPass` idiom above; a bare click is swallowed pre-hydration]** →
  assert the "Identity verified" toast and the
  "Verified" state appear (this exercises the identity guard — the exact
  call this patch swaps) → click "Delete my account" → assert the
  irreversible-action panel and the confirmation input render → assert the
  "Permanently delete account" button is DISABLED while the input is empty →
  type a WRONG confirmation ("NOPE") → assert the button is STILL disabled
  (this replaces the original error-toast assertion — that toast is
  unreachable through the UI; do NOT assert it) → click "Cancel" → assert
  the confirmation panel closes → navigate to `/dashboard` and assert it
  loads. **NEVER type DELETE, never submit a valid confirmation — this page
  destroys the test account. Never click "Permanently delete account" at any
  point, not even while it is disabled.** The spec must not exercise the
  success path; the sign-out swap is covered by review + the unchanged code
  path shape.

## Files to Modify
- `app/dashboard/settings/delete-account/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/delete-account/page.tsx',`

## MUST NOT touch
**`app/api/**` (the deletion route — hard forbidden)**;
`lib/infra/supabase/**` (reuse only); `lib/domain/**`; all other files;
`.fable5/`; `.claude/`. No new dependencies. No unit tests (Pattern C).

## Risks
- The success path (real deletion + sign-out) is deliberately NOT e2e-covered
  — destructive against the shared test account. Mitigation: the changed
  lines in that path are exactly two (getUser swap is in the guard, signOut
  swap is one line) and review reads them directly. Accepted by CTO.
- Fail-closed mapping: an `err` from `getCurrentUser` must land in the SAME
  branch as a null user. Do not add a separate error branch.

## Commit
  Commit message:
  refactor(settings): extract delete-account auth swap

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches
- [ ] New e2e spec green against OLD page first, then NEW (pasted) — and it
      contains NO valid-confirmation submission and NO click on the
      destructive button, and does NOT assert the (UI-unreachable)
      wrong-confirmation error toast (reviewer will check all three)
      **[Amendment 1]**
- [ ] The verify-step click uses the Amendment 2 acknowledged-click idiom
      (`toPass` retry anchored on the durable "Verified" state); the retry
      idiom appears NOWHERE else in the spec **[Amendment 2]**
- [ ] `npm run test:unit` green (count unchanged — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" app/dashboard/settings/delete-account/page.tsx` → 0
- [ ] Grandfather list = 11
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/delete-account-page.spec.ts   # Phase A, OLD
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, NEW
grep -c "@supabase" app/dashboard/settings/delete-account/page.tsx   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 014,
`{{TITLE}}` = delete-account auth swap. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0; Pattern C reference is PATCH-007.
ABSOLUTE rule: your e2e spec must never submit a valid DELETE confirmation —
it would destroy the shared test account. `app/api/**` is untouchable. Run
every verification command and paste real output; not done until the commit
exists. E2E credentials in `.env.local` — never print them. PW_BASE_URL
against the running dev server; final `npm run verify` only after the owner
stops it."

## Estimated Difficulty
easy — two call swaps; the discipline is in what the e2e spec must NOT do.
