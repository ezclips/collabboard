# PATCH-011 — Extraction: auth-state infra helper; ProtectedRoute onto the seam

**Status:** draft (awaiting owner approval — execute after 010)
**Complexity:** easy
**Assigned model:** **GPT-5.4**
**Pattern:** new — "auth-state observer" (Pattern F; enters PATCH_REFERENCE
at review). Three grandfathered files share this shape
(`auth.getSession()` + `auth.onAuthStateChange()`): ProtectedRoute (this
patch, smallest at 103 lines), Navbar (PATCH-012), landing page (PATCH-013).
This patch introduces the shared helper; 012/013 are repetitions.
**Depends on:** PATCH-010 (`AuthUser` domain type).

## Goal
Create `lib/infra/supabase/authState.ts` (exact code below) and move
`components/ProtectedRoute.tsx` onto it; grandfather list 15 → 14.

## Bindings

### New infra file `lib/infra/supabase/authState.ts` — exactly:
```ts
import type { AuthUser } from '../../domain/auth/user';
import { domainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

/** Session read (no network validation — mirrors auth.getSession semantics). */
export async function getSessionUser(): Promise<Result<AuthUser | null>> {
  try {
    const {
      data: { session },
      error,
    } = await createBrowserSupabaseClient().auth.getSession();

    if (error) {
      return err(domainError('unavailable', 'Could not read auth session', { cause: error }));
    }

    return ok(session?.user ?? null);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not read auth session', { cause }));
  }
}

/**
 * Subscribe to auth state changes. Returns the unsubscribe function.
 * `event` passes through Supabase's event names ('SIGNED_IN', 'SIGNED_OUT', …).
 */
export function onAuthUserChanged(
  callback: (event: string, user: AuthUser | null) => void,
): () => void {
  const {
    data: { subscription },
  } = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
    callback(event, session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

export async function signOutCurrentUser(): Promise<Result<void>> {
  try {
    const { error } = await createBrowserSupabaseClient().auth.signOut();
    if (error) {
      return err(domainError('unavailable', 'Could not sign out', { cause: error }));
    }
    return ok(undefined);
  } catch (cause: unknown) {
    return err(domainError('unavailable', 'Could not sign out', { cause }));
  }
}
```
`signOutCurrentUser` is unused by ProtectedRoute — it is defined here once
because PATCH-013/014 need it; do not omit it. Supabase's `User` is
structurally assignable to `AuthUser` (PATCH-010) — no casts needed.

### ProtectedRoute rewrite
- Delete both `@supabase` imports (client + `User` type). User state becomes
  `useState<AuthUser | null>(null)` with `AuthUser` from
  `@/lib/domain/auth/user`.
- `checkAuth`: `getSessionUser()` — `!result.ok` → the existing
  console.error + `setUser(null)` path; otherwise `setUser(result.value)`.
  `finally { setLoading(false) }` stays.
- Subscription: `const unsubscribe = onAuthUserChanged((event, user) => { ... })`
  with the existing body mapped (`session?.user` → `user`); the effect
  cleanup calls `unsubscribe()` exactly where `subscription.unsubscribe()`
  was called. The existing `console.log('Auth state changed:', ...)` may log
  `event` and `user?.email` (console-only differences allowed).
- Redirect logic, `redirectTo` default, loading render, children render:
  UNTOUCHED.

## Pre-edit census (paste; STOP if it shows more)
```bash
grep -oE "supabase\.auth\.[a-zA-Z]+" components/ProtectedRoute.tsx | sort | uniq -c
# must show exactly: 1 getSession, 1 onAuthStateChange
grep -oE "session(\?)?\.[a-zA-Z_]+" components/ProtectedRoute.tsx | sort -u
# must show ONLY session.user (no access_token or other session fields)
```

## Files to Create
- `lib/infra/supabase/authState.ts` (verbatim above)
- `e2e/characterization/protected-route.spec.ts` — Phase A first, and it
  must cover BOTH sides of the gate: (a) with stored auth state, a protected
  page (use `/dashboard`) renders its content; (b) with a fresh
  unauthenticated context (`browser.newContext()` without `storageState`),
  visiting `/dashboard` ends at the redirect target (assert URL contains
  `/auth`). Two-pass discovery rule applies.

## Files to Modify
- `components/ProtectedRoute.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'components/ProtectedRoute.tsx',`

## MUST NOT touch
`lib/infra/supabase/browserClient.ts` and `currentUser.ts` (reuse only);
`lib/domain/**` (010's type is frozen — if `AuthUser` seems insufficient,
STOP); Navbar and app/page.tsx (they are 012/013); all other files;
`.fable5/`; `.claude/`. No new dependencies. No unit tests for the helper
(binds the real browser client — PATCH-004/007 precedent; e2e covers it).

## Risks
- Losing the unsubscribe on unmount — the cleanup mapping above is the
  critical line; the e2e net can't see a leak, only review can. Keep the
  effect structure identical.
- Semantics drift `getSession` → anything else: do NOT substitute
  `getCurrentUserId`/`getUser` (network-validating); the page reads the
  LOCAL session by design.

## Commit
  Commit message:
  refactor(auth): extract auth-state infra helper; move ProtectedRoute onto it

## Rollback
Single `git revert`. (012/013/014 depend on this helper once they land —
revert order is reverse patch order, as always.)

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches
- [ ] New e2e spec green against OLD component first, then NEW (pasted)
- [ ] `npm run test:unit` green (count unchanged — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" components/ProtectedRoute.tsx` → 0
- [ ] Grandfather list = 14
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/protected-route.spec.ts   # Phase A, OLD
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, NEW
grep -c "@supabase" components/ProtectedRoute.tsx   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 011,
`{{TITLE}}` = auth-state helper + ProtectedRoute. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 first. The helper code is verbatim in
the patch — copy it exactly. Preserve getSession semantics (do NOT use
getUser). Run every verification command and paste real output; the patch is
not done until the commit exists. E2E credentials are in `.env.local` —
never print them. PW_BASE_URL against the running dev server; final
`npm run verify` only after the owner stops it (locale-safe port check)."

## Estimated Difficulty
easy — helper given verbatim; smallest of the three observer files.
