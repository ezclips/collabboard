# PATCH-012 — Extraction: Navbar onto the auth-state helper

**Status:** draft (awaiting owner approval — execute after 011) — **Amendment 1 issued: Navbar is orphaned, not live; e2e requirement replaced**
**Complexity:** easy (Pattern F repetition #1)
**Assigned model:** **GPT-5.4**
**Pattern:** F — auth-state observer. Reference implementation: PATCH-011
(ProtectedRoute). Imitate its mapping exactly.
**Depends on:** PATCH-010 (`AuthUser`), PATCH-011 (`authState.ts`).

## Amendment 1 (2026-07-07) — `components/ui-kit/Navbar.tsx` is orphaned · CTO decision

**Blockage (GPT-5.4, correct stop):** the original spec described Navbar as
rendering on "most pages" and required an e2e spec asserting its visible
authenticated/signed-out affordances on real pages. GPT-5.4 found no page
actually mounts it.

**CTO-verified independently (2026-07-07):** repo-wide grep (incl. dynamic
`import()`/`dynamic()` calls) shows exactly one importer of
`components/ui-kit/Navbar.tsx`: `components/ui-kit/ClientWrapper.tsx`
(`import Navbar from "./Navbar"; ... <Navbar />`). `ClientWrapper.tsx` itself
has ZERO importers anywhere in the repo. The root layout chain
(`app/layout.tsx` → `components/ClientLayout.tsx`) renders neither
`ClientWrapper` nor `Navbar` directly. **The component is orphaned dead
code**, not a live, widely-rendered navbar — my original census claim
("renders on most pages") was wrong, asserted without checking mount points.

**Decision: Option 1 — proceed as an unused-component extraction; the
verification plan is corrected, not the scope.** The grandfather-list value
is unchanged (`components/ui-kit/Navbar.tsx` still imports `@supabase/*`
directly, still belongs off the grandfather list); the file is safe to
rewrite precisely BECAUSE nothing renders it — there is no live behavior to
regress. Option 2 (point to a real mounted navbar) does not apply — no such
component exists. Option 3 (restore the mount first) is REJECTED: mounting
previously-unmounted UI is a product/behavior change, not preservation, and
belongs to a product decision outside this patch's scope (ROADMAP standing
rule: new/restored UI ships as its own reviewed decision, never smuggled
into an infra patch).

**Corrected requirement — replaces the "Files to Create" e2e spec and the
Risks/Acceptance-Criteria items that assumed live rendering (all below).**
No UI characterization spec is possible or appropriate (there is no
component-testing harness in this repo — vitest is `environment: 'node'`,
domain/infra only — and Playwright drives real pages, which never mount
this component). The safety net instead is: (1) the pre-edit orphan-proof
below, pasted verbatim; (2) `tsc` proving no caller breaks; (3) the full
EXISTING e2e suite staying green, proving nothing in the live app depends on
this file's current shape.

**Mandatory orphan-proof (paste before editing; STOP if it shows a live
importer):**
```bash
# [Amendment 1a] ClientWrapper imports via the RELATIVE form `./Navbar`, so
# the pattern must cover both the path form and the import-name form:
grep -rln "ui-kit/Navbar\|import Navbar" --include="*.tsx" --include="*.ts" . \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
# expect exactly: ./components/ui-kit/ClientWrapper.tsx
grep -rln "ClientWrapper" --include="*.tsx" --include="*.ts" . \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
# expect exactly: ./components/ui-kit/ClientWrapper.tsx (itself only — no importer)
grep -rn "dynamic(\|import(" --include="*.tsx" --include="*.ts" . \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  | grep -i "clientwrapper\|navbar"
# expect: no output
```
If any of these three shows a different result than expected, STOP — the
component is not orphaned the way this amendment assumes, and the original
e2e-based verification plan must be used instead (report back to the CTO).

**Amendment 1a (2026-07-07):** the first proof command originally grepped
only `"ui-kit/Navbar"`, which cannot match ClientWrapper's actual relative
import (`import Navbar from "./Navbar"`) — the command found nothing while
its own comment expected ClientWrapper, a self-contradiction. Root cause:
the CTO's investigation used a broader pattern than what got transcribed
into the proof; the proof command was never dry-run before delegation.
Corrected pattern above is CTO-dry-run-verified (returns exactly
`./components/ui-kit/ClientWrapper.tsx`, exit 0). Architecture decision
(Amendment 1: unused-component extraction, no e2e spec, mount restoration
rejected) is UNCHANGED — resume with the corrected proof.

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
None. **[Amendment 1]** No new e2e spec — the component is orphaned (see
Amendment 1); there is no live render to characterize. The orphan-proof
census plus the existing suite's continued green state are the complete net.

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
- **[Amendment 1]** The component is orphaned, not live — do NOT restore its
  mount point as part of this patch (see Amendment 1's Option-3 rejection).
  If the orphan-proof ever fails (something DOES import it), STOP — the
  original e2e-based plan applies, not this one.

## Commit
  Commit message:
  refactor(auth): move Navbar onto the auth-state infra helper

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches (session-field gate)
- [ ] **[Amendment 1]** Orphan-proof (3 commands) pasted and matches exactly
- [ ] `npm run test:unit` green (count unchanged — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green (proves no live dependency on this file)
- [ ] `grep -c "@supabase" components/ui-kit/Navbar.tsx` → 0
- [ ] Grandfather list = 13
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census + orphan-proof above first)
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, unaffected — proves the orphan claim
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
Pattern F reference. Read Amendment 1 in this patch file BEFORE starting —
the target file is orphaned (not mounted anywhere); paste both the
pre-edit census AND the orphan-proof; no e2e spec is required. The
pre-edit census gates everything: if the session object is used beyond
`.user`, STOP. Run every verification command and paste real output; not
done until the commit exists. PW_BASE_URL against the running dev server;
final `npm run verify` only after the owner stops it."

## Estimated Difficulty
easy — Pattern F repetition with one bound state-type change.
