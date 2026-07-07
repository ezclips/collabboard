# PATCH-013 — Extraction: landing page (app/page.tsx) onto the auth-state helper

**Status:** draft (awaiting owner approval — execute after 012)
**Complexity:** easy (Pattern F repetition #2, plus the first `signOutCurrentUser` consumer)
**Assigned model:** **GPT-5.4**
**Pattern:** F — auth-state observer. Reference: PATCH-011.
**Depends on:** PATCH-010, PATCH-011.

## Goal
Move `app/page.tsx` (246 lines — the landing page) onto
`lib/infra/supabase/authState.ts`; grandfather list 13 → 12.

## Bindings

The page uses exactly three auth calls (CTO-verified): `getSession` (initial
check), `onAuthStateChange` (with EVENT-NAME branching), `signOut` (before
switching accounts). Mapping:

- **Initial check:** `getSessionUser()` — `!result.ok` → the existing
  `console.error('Auth error:', ...)` + `setLoading(false)` path ("don't let
  auth errors block the page" — that comment describes behavior to preserve);
  `ok` → the existing signed-in/out handling with `session?.user` → the
  result value.
- **Subscription:** `onAuthUserChanged((event, user) => { ... })`. The
  existing handler branches on `event === 'SIGNED_IN'` (and possibly other
  event names — map ALL branches verbatim; the helper passes Supabase's
  event strings through unchanged). `session.user` → `user` inside the
  branches. Effect cleanup calls the returned unsubscribe.
- **Sign-out:** the `handleSwitchAccount`-style block becomes:
  `const result = await signOutCurrentUser(); if (!result.ok) console.error('Failed to sign out before switching accounts:', result.error);`
  and the `finally { router.push('/auth?switch=1') }` stays EXACTLY —
  navigation must happen regardless of sign-out success, as today.
- User state typed `AuthUser | null`. All `@supabase` imports removed.

## Pre-edit census (paste; STOP if it shows more)
```bash
grep -oE "supabase\.auth\.[a-zA-Z]+" app/page.tsx | sort | uniq -c
# must show exactly: 1 getSession, 1 onAuthStateChange, 1 signOut
grep -oE "session(\?)?\.[a-zA-Z_.]+" app/page.tsx | sort -u
# every entry must be session.user[...] — anything else: STOP
grep -nE "event === |event ===|switch \(event" app/page.tsx
# list every event-name branch; ALL must be preserved verbatim
```

## Files to Create
- `e2e/characterization/landing-page.spec.ts` — Phase A first: (a) fresh
  unauthenticated context: `/` renders the signed-out landing content;
  (b) with storageState: `/` shows its signed-in variant (discover what that
  is — redirect to /dashboard, or signed-in CTA — dump first, assert what is
  actually there). Two-pass rule applies.

## Files to Modify
- `app/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly `'app/page.tsx',`

## MUST NOT touch
`lib/infra/supabase/authState.ts` (frozen); `lib/domain/**`; ProtectedRoute;
Navbar; all other files; `.fable5/`; `.claude/`. No new dependencies. No
unit tests (Pattern F).

## Risks
- The event-name branching is the behavioral core of this page's auth logic —
  the census enumerates the branches so none can be silently dropped.
- The sign-out `finally`-navigation ordering (navigate even on failure) is
  easy to break by "handling the error properly". Do not.
- This is the landing page — the highest-traffic page in the app. The
  Phase A/C characterization runs are not optional ceremony here.

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches (including the event-branch list)
- [ ] New e2e spec green against OLD page first, then NEW (pasted)
- [ ] `npm run test:unit` green (count unchanged — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green (smoke hits `/` directly)
- [ ] `grep -c "@supabase" app/page.tsx` → 0
- [ ] Grandfather list = 12
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/landing-page.spec.ts   # Phase A, OLD
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, NEW
grep -c "@supabase" app/page.tsx   # 0
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 013,
`{{TITLE}}` = landing page auth-state extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0; PATCH-011 is the Pattern F reference.
Preserve every auth event-name branch verbatim and the sign-out
finally-navigation. Run every verification command and paste real output;
not done until the commit exists. E2E credentials in `.env.local` — never
print them. PW_BASE_URL against the running dev server; final `npm run
verify` only after the owner stops it."

## Estimated Difficulty
easy-medium — mechanically bound, but it is the landing page; treat the
characterization evidence as the deliverable.
