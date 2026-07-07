# PATCH-012 — Extraction: Navbar onto the auth-state helper

**Status:** draft (awaiting owner approval — execute after 011)
**Complexity:** easy (Pattern F repetition #1)
**Assigned model:** **GPT-5.4**
**Pattern:** F — auth-state observer. Reference implementation: PATCH-011
(ProtectedRoute). Imitate its mapping exactly.
**Depends on:** PATCH-010 (`AuthUser`), PATCH-011 (`authState.ts`).

## Goal
Move `components/ui-kit/Navbar.tsx` (156 lines) onto
`lib/infra/supabase/authState.ts`; grandfather list 14 → 13.

## Bindings — the one difference from PATCH-011
The Navbar stores the SESSION object in state (`setSession(session)`), not
the user. Mapping (CTO-decided):
- State becomes `useState<AuthUser | null>(null)` (rename the state variable
  to `user`/`setUser` or keep `session`/`setSession` naming — naming is free,
  the TYPE change is not).
- Initial load: `getSessionUser()` — `!result.ok` → the existing
  `console.error("Error getting session:", ...)` path; the `isMounted` guard
  and `setIsLoading(false)` flow stay exactly as they are.
- Subscription: `onAuthUserChanged((event, user) => { ... })` with the
  existing body mapped: `setSession(session)` → set the user value;
  `session?.user?.X` → `user?.X`. The `console.log('Navbar auth event:', ...)`
  may log `event` and `user?.id` (console-only differences allowed).
  Effect cleanup calls the returned unsubscribe function.
- Every render-time read of `session?.user?.FIELD` becomes `user?.FIELD`;
  truthiness checks `session ? … : …` become `user ? … : …` (a session
  always has a user in this app's flows — the pre-edit census below proves
  the file reads nothing else from the session).
- Both `@supabase` imports (client + any types) are removed.

## Pre-edit census (paste; STOP if it shows more)
```bash
grep -oE "supabase\.auth\.[a-zA-Z]+" components/ui-kit/Navbar.tsx | sort | uniq -c
# must show exactly: 1 getSession, 1 onAuthStateChange
grep -oE "session(\?)?\.[a-zA-Z_.]+" components/ui-kit/Navbar.tsx | sort -u
# every entry must start with "session.user" or "session?.user" — if ANY other
# session field appears (access_token, expires_at, …), STOP and report.
grep -n "@supabase" components/ui-kit/Navbar.tsx
```

## Files to Create
- `e2e/characterization/navbar-auth.spec.ts` — Phase A first: (a) signed in
  (storageState), open `/dashboard`, assert the navbar shows its
  authenticated affordances (discover: avatar/menu/sign-out — dump first);
  (b) fresh unauthenticated context, open `/`, assert the navbar shows its
  signed-out affordances (sign-in link or equivalent). Two-pass rule applies.

## Files to Modify
- `components/ui-kit/Navbar.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'components/ui-kit/Navbar.tsx',`

## MUST NOT touch
`lib/infra/supabase/authState.ts` (frozen — if it seems insufficient, STOP);
`lib/domain/**`; ProtectedRoute; app/page.tsx; all other files; `.fable5/`;
`.claude/`. No new dependencies. No unit tests (Pattern F has none — e2e is
the net).

## Risks
- The session→user state mapping is the entire patch; the census gate above
  is what makes it mechanical. If the census is clean, every remaining edit
  is a find/replace the spec has already decided.
- Navbar renders on most pages — the full e2e suite doubles as its
  regression net; watch for incidental failures in unrelated specs (they are
  signal, not noise).

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches
- [ ] New e2e spec green against OLD navbar first, then NEW (pasted)
- [ ] `npm run test:unit` green (count unchanged — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" components/ui-kit/Navbar.tsx` → 0
- [ ] Grandfather list = 13
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/navbar-auth.spec.ts   # Phase A, OLD
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, NEW
grep -c "@supabase" components/ui-kit/Navbar.tsx   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 012,
`{{TITLE}}` = Navbar auth-state extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0, then PATCH-011's implementation as the
Pattern F reference. The pre-edit census gates everything: if the session
object is used beyond `.user`, STOP. Run every verification command and
paste real output; not done until the commit exists. E2E credentials in
`.env.local` — never print them. PW_BASE_URL against the running dev server;
final `npm run verify` only after the owner stops it."

## Estimated Difficulty
easy — Pattern F repetition with one bound state-type change.
