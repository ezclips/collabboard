# PATCH-014 — Extraction: delete-account page (auth-only swap)

**Status:** draft (awaiting owner approval — execute after 011)
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

## Files to Create
- `e2e/characterization/delete-account-page.spec.ts` — Phase A first, and
  **read-only by design**: login → open the page → assert the warning copy
  and the confirmation input render → type a WRONG confirmation ("NOPE") →
  assert the error toast/message → assert the account still works (navigate
  to `/dashboard`, it loads). **NEVER type DELETE, never submit a valid
  confirmation — this page destroys the test account.** The spec must not
  exercise the success path; the sign-out swap is covered by review + the
  unchanged code path shape.

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

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches
- [ ] New e2e spec green against OLD page first, then NEW (pasted) — and it
      contains NO valid-confirmation submission (reviewer will check)
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
