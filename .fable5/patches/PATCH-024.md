# PATCH-024 — Scavenger normalization: token acquisition moves to the real cookie session (AUTHORIZED BEHAVIOR CHANGE)

**Status:** READY — Amendment 1 applied 2026-07-09 (pre-edit importer
census rebound to cover all import-path spellings; implementer resumes from
the start of the pre-edit census)
**Complexity:** medium-high (four pages + the quarantine + one new infra
module + two characterization specs REBOUND to repaired behavior; the
mechanism is identical everywhere, but two of the four pages change from
broken-for-cookie-sessions to WORKING, and those repaired states cannot be
probed before implementation)
**Assigned model:** **GPT-5.5 — REQUIRED, not GPT-5.4.** Ruling: this patch
deliberately changes auth/session behavior (the standing plan's authorized
functional repair), and the two repaired pages' new characterization
assertions are EXPECTED-UNPROBED (nothing can drive the repaired state
until the repair exists). Per the owner's criterion — "GPT-5.5 if any
auth/session behavior is touched in a way not fully characterized" — this
is the definitional case. GPT-5.4 is not authorized for this patch.
**Pattern:** none new — this is the plan's one authorized behavior-change
patch (queued since PATCH-017 Amendment 1 as a FUNCTIONAL REPAIR: the
settings-root and profile pages are unusable for cookie-session users
today, and cookie sessions are how this app's login works).
**Depends on:** PATCH-018/019/020 (quarantine centralized the scavengers);
PATCH-023 (numbering; corrects the stale header reference).

## The authorized behavior changes (exhaustive — anything else is drift)
1. **settings-root** (`app/dashboard/settings/page.tsx`): REPAIRED. The
   in-page localStorage scavenger dies; tokens come from the cookie
   session. Cookie users stop hitting "Not authenticated — please log in
   again" and the page loads/saves. Its two manual
   `JSON.parse(atob(token.split('.')[1]))` decodes are replaced by the
   tested `decodeJwtPayload` (base64url-safe — strictly more correct).
2. **profile** (`app/dashboard/settings/profile/page.tsx`): REPAIRED. Same
   token-source swap at five call sites; the bearer-client machinery
   downstream (repository, storage gateway, auth passthroughs) is KEPT —
   it takes a token argument and works identically with a session token.
3. **password** (`app/dashboard/settings/password/page.tsx`): silent-defect
   repair. `emitSecurityNotification` no-ops for cookie users today (no
   token → no security email); with session-sourced tokens it fires.
   `resolveAccountEmail`'s token fallback likewise becomes reachable.
4. **integrations** (`app/dashboard/settings/integrations/page.tsx`): the
   deep-scan localStorage fallback (third cascade step) is REMOVED. Cookie
   users never reached it (step 1 serves them); only pre-cookie legacy
   localStorage sessions did, and retiring those is the point of this
   patch.
5. **Quarantine** (`legacyToken.ts`): all four scavenger functions deleted;
   `decodeJwtPayload`/`JwtPayload` move to the new `sessionToken.ts`;
   the header comment is rewritten (including the owner-required correction
   of the stale "PATCH-023" removal reference — the plan renumbered).

NOT in scope: share-link service-role→RLS (deliberately deferred to its own
server-side patch — different risk class, nothing couples them);
CanvasClient/FreeformPadletCards/PostCardContent (untouched); type-only
de-linting (forbidden, PATCH-022 ruling); any UI/toast-text change beyond
the reachability repairs above; `workspaceMembers.ts`/`passwordSecurity.ts`
(their doc comments mention legacyToken but import nothing from it — leave
byte-untouched).

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash**. Numeric gates are shell-bound (PATCH-019 Amendment 1);
line counts state all-lines (`wc -l`) with blank-line counts so PowerShell
`Measure-Object -Line` equivalents are derivable.
```bash
# 1. Quarantine surface (132 lines, 13 blank; PS Measure-Object -> 119):
wc -l lib/infra/supabase/legacyToken.ts          # 132
grep -c "^export" lib/infra/supabase/legacyToken.ts   # 8
# 2. Consumers (import lines only where noted):
# AMENDMENT 1 (2026-07-09): the importers spell the path THREE ways (alias /
# '../supabase/...' / './...'); the original single alias-form grep printed 3
# and could never print the intended 4. All three gates below were MEASURED
# on the pre-edit tree before binding.
grep -rln "from '@/lib/infra/supabase/legacyToken'" app lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 3 files: the three settings pages (profile, password,
#   integrations) - alias imports
grep -rln "from '\.\./supabase/legacyToken'" app lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 1 file: lib/infra/profile/profilesRepository.ts
#   (relative import, line 7)
grep -rln "legacyToken'" app lib --include="*.ts" --include="*.tsx"
# union of ALL import spellings - expected EXACTLY 5 files: the 4 importers
#   above + lib/infra/supabase/legacyToken.test.ts (imports './legacyToken').
#   (workspaceMembers.ts/passwordSecurity.ts mention legacyToken only in
#   comments, written 'legacyToken.ts' with NO trailing quote - they MUST
#   NOT appear in any of these three gates)
# 3. Per-file symbol counts (post-edit gates are derived from THESE):
grep -c "getAccessToken" app/dashboard/settings/page.tsx            # 4 (in-page def L45 + calls L62/L121/L162)
grep -c "atob" app/dashboard/settings/page.tsx                      # 2 (manual decodes L123/L164)
grep -c "getAccessToken" app/dashboard/settings/profile/page.tsx    # 6 (1 import + 5 calls L85/L141/L209/L285/L353)
grep -c "decodeJwtPayload" app/dashboard/settings/profile/page.tsx  # 4 (1 import + 3 calls L148/L212/L355)
grep -c "getAccessToken" app/dashboard/settings/password/page.tsx   # 3 (1 import + 2 calls)
grep -c "decodeJwtPayload" app/dashboard/settings/password/page.tsx # 2 (1 import + 1 call)
grep -c "resolveLegacySessionToken" app/dashboard/settings/integrations/page.tsx # 2 (1 import + 1 call)
grep -c "makeAuthedClient" lib/infra/profile/profilesRepository.ts  # 2 (1 import + 1 call) - UNTOUCHED by this patch
# 4. The unit-test file to be renamed:
grep -n "from './legacyToken'" lib/infra/supabase/legacyToken.test.ts
# expected EXACTLY 1 line (imports decodeJwtPayload only)
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. NEW file — `lib/infra/supabase/sessionToken.ts` (exact, whole file; CTO compile-verified against installed types on 2026-07-09)
```ts
import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-024: normalized token acquisition. The session lives in the
 * auth-helpers cookie; getSession reads it and refreshSession recovers an
 * expired one. This replaces every localStorage token scavenger the
 * legacy pages used (they predate the cookie-session login and failed
 * closed for cookie users). decodeJwtPayload moved here verbatim from
 * legacyToken.ts - it decodes, it does not scavenge.
 */

export type JwtPayload = {
    sub?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
};

export const decodeJwtPayload = (token: string): JwtPayload => {
    const [, payload = ''] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
};

export async function getSessionAccessToken(): Promise<string | null> {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) return refreshed.session.access_token;
    return null;
}
```
(The cascade is PATCH-019's `resolveLegacySessionToken` minus its deep-scan
third step — the surviving two steps have run in production on the
integrations page since PATCH-019 landed. `decodeJwtPayload` is
byte-identical to the current export.)

### 2. REWRITE — `lib/infra/supabase/legacyToken.ts` (exact, whole file — replaces the current 132 lines)
```ts
import { createClient } from '@supabase/supabase-js';
import type { StorageGateway, StorageSupabaseClient } from './storage';
import { SupabaseStorageGateway } from './storage';

/**
 * LEGACY BEARER-CLIENT MACHINERY (post-PATCH-024). The localStorage token
 * scavengers that used to live here were REMOVED by PATCH-024 (scavenger
 * normalization - tokens now come from the real cookie session via
 * sessionToken.ts). What remains is the per-call bearer-client
 * construction and the raw auth passthroughs the profile page still
 * consumes; they take a session token as an ARGUMENT and make no
 * assumption about where it came from. Scheduled for replacement when
 * profile auth gets a real domain command (post-canvas program); until
 * then do not "improve" these, and do not add consumers beyond the pages
 * the patches name.
 *
 * (This header once said "PATCH-023 removes this file" - the plan was
 * renumbered on 2026-07-09: 023 became the v1-vertical deletion and the
 * normalization patch is PATCH-024, this one.)
 *
 * DELIBERATE house-style exception: the auth helpers below return RAW
 * supabase shapes (not Result) - the legacy pages' error handling and
 * toast texts consume those shapes directly.
 */

// Create a supabase client with the access token explicitly set so RLS sees auth.uid()
export const makeAuthedClient = (token: string) => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
);

/** Raw passthrough (quarantine ruling 2): same return shape as supabase. */
export function legacyReauthenticateWithPassword(token: string, email: string, password: string) {
    return makeAuthedClient(token).auth.signInWithPassword({ email, password });
}

/** Raw passthrough (quarantine ruling 2): same return shape as supabase. */
export function legacyRequestEmailChange(token: string, newEmail: string, emailRedirectTo: string) {
    return makeAuthedClient(token).auth.updateUser({ email: newEmail }, { emailRedirectTo });
}

/** Pattern H reuse: the PATCH-017 gateway class over the legacy client. */
export function createLegacyTokenStorageGateway(token: string): StorageGateway {
    return new SupabaseStorageGateway(
        makeAuthedClient(token) as unknown as StorageSupabaseClient,
    );
}
```
(Every surviving line is byte-identical to today's file except the header
comment; the four scavenger functions, `decodeJwtPayload`/`JwtPayload`, and
the now-unused `browserClient` import are gone. Deletion-only plus comment —
the remaining code compiles today and its dependencies are unchanged.
Reviewer will require byte-equality to THIS block.)

### 3. Unit tests — rename + one import line
`git mv lib/infra/supabase/legacyToken.test.ts lib/infra/supabase/sessionToken.test.ts`
then change its line 2:
`import { decodeJwtPayload } from './legacyToken';` →
`import { decodeJwtPayload } from './sessionToken';`
Nothing else in the file changes. Suite stays **76 tests / 18 files**.

### 4. Page — `app/dashboard/settings/page.tsx` (settings-root, REPAIR)
- ADD immediately after the `createStorageGateway` import (old line 10):
  `import { decodeJwtPayload, getSessionAccessToken } from '@/lib/infra/supabase/sessionToken';`
- DELETE lines 44–57 (the comment line "// auth-helpers uses cookies but
  this project stores session in localStorage" AND the whole in-page
  `getAccessToken` definition — the comment is factually the bug).
- `loadSettings` (old L62): `const token = getAccessToken();` →
  `const token = await getSessionAccessToken();` (fn is already async).
  The guard, toast text, and everything after stay byte-identical.
- `saveSettings` (old L121–125):
  ```
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const payload = JSON.parse(atob(token.split('.')[1]));
  const userId: string = payload?.sub;
  if (!userId) throw new Error('Could not resolve user id');
  ```
  →
  ```
  const token = await getSessionAccessToken();
  if (!token) throw new Error('Not authenticated');
  const payload = decodeJwtPayload(token);
  const userId = payload.sub;
  if (!userId) throw new Error('Could not resolve user id');
  ```
  (CTO compile-verified: `userId` narrows to `string` for the
  `asUserId(userId)` call two lines later.)
- `uploadLogoFile` (old L162–166): the IDENTICAL five-line replacement.
- EVERYTHING else byte-identical (both error messages, all toasts, the
  fallback chain, all rendering).

### 5. Page — `app/dashboard/settings/profile/page.tsx` (REPAIR)
- Import block: REMOVE `decodeJwtPayload` and `getAccessToken` from the
  `legacyToken` import (three symbols remain:
  `createLegacyTokenStorageGateway`, `legacyReauthenticateWithPassword`,
  `legacyRequestEmailChange`). ADD:
  `import { decodeJwtPayload, getSessionAccessToken } from '@/lib/infra/supabase/sessionToken';`
- FIVE call-site swaps, each `const token = getAccessToken();` →
  `const token = await getSessionAccessToken();` — old L85
  (`emitNotificationEvent`, already async), L141 (`loadProfile`), L209
  (`persistProfilePatch`), L285 (email-change handler), L353 (avatar
  upload). Every guard and everything downstream (decode calls, repository
  construction with `token`, gateways, passthroughs) stays byte-identical.
- EVERYTHING else byte-identical.

### 6. Page — `app/dashboard/settings/password/page.tsx`
- Import line 4 becomes:
  `import { decodeJwtPayload, getSessionAccessToken } from '@/lib/infra/supabase/sessionToken';`
  (the `legacyToken` import disappears — both its symbols moved).
- TWO call-site swaps: old L33 (`emitSecurityNotification`) and old L183
  (`resolveAccountEmail`): `const token = getAccessToken();` →
  `const token = await getSessionAccessToken();`. Guards and everything
  downstream byte-identical.

### 7. Page — `app/dashboard/settings/integrations/page.tsx`
- Import line 6 becomes:
  `import { getSessionAccessToken } from '@/lib/infra/supabase/sessionToken';`
- Old L76: `const resolveAccessToken = async (): Promise<string | null> => resolveLegacySessionToken();`
  → `const resolveAccessToken = async (): Promise<string | null> => getSessionAccessToken();`
- Nothing else.

### 8. Characterization — TWO specs REBOUND, two suites untouched
The e2e account is cookie-only — it IS the repaired class, so the two
failure-state specs must be rewritten to the repaired behavior. **These
assertions are EXPECTED-UNPROBED** (the repaired state cannot exist before
implementation — PATCH-003 "unexecuted spec" precedent): if ANY assertion
fails against the implemented page, STOP and report the observed state for
a CTO amendment; do not loosen an assertion yourself.

REWRITE `e2e/characterization/workspace-settings-root.spec.ts` to exactly:
```ts
import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('workspace settings root (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the repaired cookie-session settings form without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'domcontentloaded' });

    // PATCH-024 repaired this page for cookie sessions: the token now comes
    // from the real session, so loadSettings completes instead of dying on
    // the localStorage guard.
    const nameInput = page.getByPlaceholder('Enter workspace name');
    await expect(nameInput).toBeVisible({ timeout: 30_000 });
    await expect(nameInput).toBeEnabled();          // e2e account owns its workspace
    await expect(nameInput).not.toHaveValue('');    // fallback chain guarantees a name ('My Workspace' floor)
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0); // esp. no 'Not authenticated'
  });
});
```
REWRITE `e2e/characterization/profile-page.spec.ts` to exactly:
```ts
import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('profile page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the repaired cookie-session profile without mutating shared state', async ({ page }) => {
    await page.goto('/dashboard/settings/profile', { waitUntil: 'domcontentloaded' });

    // Email comes from the session JWT regardless of whether a profiles row
    // exists; .first() because the page may render the email in more than
    // one field (layout unprobeable before the repair exists).
    await expect(page.getByText('e2e.causal793@silomails.com').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0); // no 'Not authenticated', no 'Profile load failed'
  });
});
```
UNTOUCHED: `integrations-page.spec.ts` (3 tests) and `password-page.spec.ts`
(2 tests) — cookie-session behavior on those pages is identical before and
after (the removed deep-scan step and the repaired emit path are not
exercised by any existing assertion). They must pass UNCHANGED in Phase B —
that is the regression net proving the swaps preserved working behavior.
Suite total stays **27 tests / 18 files** (two files rewritten in place,
zero added or removed).

## Verification sequence (paste real output for every step)
Operational rules — ALL binding: banner-port rule; one client at a time;
quota-via-DB on board failures; shell-bound numeric gates; getByText/raw
textContent (never innerText); scoped locators only; report every off-spec
line or NUMBER including whitespace; **stale `.next/types` rule: if tsc
names a file absent from `git ls-files`, stop the server, delete `.next`,
restart, re-probe, rerun tsc before suspecting source**; before ANY commit,
read `git status` — a staged line you did not create is a STOP signal.

```bash
# Phase A — OLD pages (dev server running, banner port verified = 3000):
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/workspace-settings-root.spec.ts e2e/characterization/profile-page.spec.ts e2e/characterization/integrations-page.spec.ts e2e/characterization/password-page.spec.ts
# expected: 8 passed — arithmetic: 1+1+3+2 characterization tests + 1 setup
# (the setup project runs on any characterization invocation, established
# PATCH-020/021 reviews). This is the OLD-page baseline including the two
# failure-state specs. If the number differs, REPORT it.

# Phase B — implement §1–§7 + §8's two spec rewrites, then:
npm run test:unit          # unchanged: 76 tests / 18 files (test file renamed, count identical) — state it
npx tsc --noEmit           # 0 errors, zero new casts
# per-file greps (Git Bash) — derived from the measured pre-edit counts:
grep -c "getAccessToken" app/dashboard/settings/page.tsx             # 4 -> 0 (exit 1)
# NOTE on the gate above and its siblings below: the NEW symbol
# 'getSessionAccessToken' does NOT contain the substring 'getAccessToken'
# ('Session' sits between 'get' and 'AccessToken'), so these gates cannot
# collide with the replacement — checked at authoring per the
# substring-collision rule (PATCH-020/021 lessons).
grep -c "getSessionAccessToken" app/dashboard/settings/page.tsx      # 0 -> 4 (1 import + 3 calls)
grep -c "atob" app/dashboard/settings/page.tsx                       # 2 -> 0 (exit 1)
grep -c "decodeJwtPayload" app/dashboard/settings/page.tsx           # 0 -> 3 (1 import + 2 calls)
grep -c "getAccessToken" app/dashboard/settings/profile/page.tsx     # 6 -> 0 (exit 1)
grep -c "getSessionAccessToken" app/dashboard/settings/profile/page.tsx  # 0 -> 6 (1 import + 5 calls)
grep -c "decodeJwtPayload" app/dashboard/settings/profile/page.tsx   # 4 -> 4 (SAME count, new composition: sessionToken import + 3 calls)
grep -c "legacyToken" app/dashboard/settings/profile/page.tsx        # 1 -> 1 (import stays for the 3 bearer symbols)
grep -c "getAccessToken" app/dashboard/settings/password/page.tsx    # 3 -> 0 (exit 1)
grep -c "getSessionAccessToken" app/dashboard/settings/password/page.tsx # 0 -> 3 (1 import + 2 calls)
grep -c "legacyToken" app/dashboard/settings/password/page.tsx       # 1 -> 0 (exit 1; both symbols moved)
grep -c "resolveLegacySessionToken" app/dashboard/settings/integrations/page.tsx # 2 -> 0 (exit 1)
grep -c "getSessionAccessToken" app/dashboard/settings/integrations/page.tsx     # 0 -> 2 (1 import + 1 call)
# quarantine + repo-wide scavenger extinction:
grep -c "^export" lib/infra/supabase/legacyToken.ts                  # 8 -> 4
grep -rn "getAccessTokenFromStorage\|findAccessTokenDeep\|resolveLegacySessionToken" app components lib --include="*.ts" --include="*.tsx"
# expected: NO output, exit 1 (the scavengers are extinct)
grep -rn "getAccessToken" app components lib --include="*.ts" --include="*.tsx" | grep -v "getSessionAccessToken"
# expected: NO output, exit 1 (no bare getAccessToken anywhere; the -v guard
# excludes the new symbol's lines, which do NOT contain the bare substring
# anyway - belt and suspenders)
# importer census, post-edit (AMENDMENT 1; derived from the measured 5):
grep -rln "legacyToken'" app lib --include="*.ts" --include="*.tsx"
# expected EXACTLY 2 files (5 measured pre-edit - password import removed
#   - integrations import removed - test file renamed to sessionToken.test.ts):
#   app/dashboard/settings/profile/page.tsx (keeps the 3-bearer-symbol import)
#   lib/infra/profile/profilesRepository.ts (relative import, byte-untouched)
# lib/infra/profile/profilesRepository.ts must be BYTE-UNTOUCHED:
git diff --ignore-space-at-eol -- lib/infra/profile/profilesRepository.ts   # empty
git diff --ignore-space-at-eol -- lib/infra/supabase/workspaceMembers.ts lib/infra/supabase/passwordSecurity.ts   # empty

# Phase C — e2e (dev server, banner port verified; canvas route warmed first):
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/board-lifecycle.spec.ts
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected: 27 passed / 18 files (1 setup + 4 smoke + 22 characterization) —
# including the TWO REBOUND specs now asserting repaired behavior and the
# UNCHANGED integrations/password specs. If either rebound spec fails:
# STOP, paste the observed state, request a CTO amendment (expected-unprobed
# assertions; do not loosen them yourself).

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # 0 — this gate, no other port check
npm run verify             # typecheck + production build + boundaries
git status --porcelain     # clean after the commit
```
No boundaries-config change in this patch (no grandfather movement — all
four pages are already off the list; the boundary lint is untouched).

## Deviation rule (binding)
Report EVERY line that differs from the bindings — casts, import order,
whitespace, and any gate NUMBER that comes out different. Expected
deviations: **NONE**. The two rebound specs failing is NOT a deviation —
it is the bound STOP-and-report path.

## Commit
ONE atomic commit (implementation + both spec rewrites + test rename).
Before staging: read `git status --short` — any entry you did not create is
a STOP. Commit message:
  fix(auth): replace localStorage token scavengers with cookie-session reads -- repairs settings-root and profile for cookie sessions (authorized, PATCH-024)

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted, matches ALL blocks
- [ ] Phase A: all four existing spec files green against OLD pages (total pasted)
- [ ] `sessionToken.ts` byte-equal to §1; `legacyToken.ts` byte-equal to §2
- [ ] Test rename per §3; `npm run test:unit` 76/18 unchanged, stated
- [ ] All per-file greps exact per the derived post-edit values
- [ ] Repo-wide scavenger-extinction greps empty
- [ ] `profilesRepository.ts`, `workspaceMembers.ts`, `passwordSecurity.ts` diffs EMPTY
- [ ] `npx tsc --noEmit` 0 errors (stale `.next/types` rule applied if routes ghost)
- [ ] Full suite 27/18 green incl. both rebound specs; integrations/password specs UNCHANGED and green
- [ ] Stopped-server gate 0; `npm run verify` green; status clean
- [ ] Single atomic commit; hash reported; every off-spec line disclosed (expected: none)

## Reviewer checklist (CTO or successor; §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; the ONLY page changes
      are the bound import edits + token-acquisition swaps + the two
      settings-root decode replacements — guards, toasts, fallback chains,
      and all rendering byte-identical
- [ ] §2 byte-equality: the four scavengers, decodeJwtPayload/JwtPayload,
      and the browserClient import are GONE; the four survivors are
      byte-identical to before; header says PATCH-024 and explains the
      renumbering
- [ ] The five profile swaps feed the SAME token variable into the
      unchanged repository/gateway/passthrough calls — no signature drift
- [ ] Both rebound specs match §8 exactly; if amended mid-implementation,
      the amendment chain is in the spec file
- [ ] Integrations + password specs byte-untouched (git diff)
- [ ] At review closeout: CURRENT_TASK batch row + security-flag section
      CLOSED (the standing "023/024 inventory" addenda are now historical);
      health per §12 — this patch is the ops/product repair the ledger has
      been waiting on (cookie users regain two pages + security emails);
      LESSONS_LEARNED only if something new surfaced

## Handoff (owner: paste this to GPT-5.5)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 024,
`{{TITLE}}` = scavenger normalization (authorized behavior change). Add:
"Read `.fable5/docs/PATCH_REFERENCE.md` §6 first. This patch AUTHORIZES
exactly five behavior changes (spec §'The authorized behavior changes') —
anything else you change is drift, and anything on that list you soften is
an unfinished repair. The two rebound characterization specs assert states
nobody has ever observed (the repair creates them): if one fails, STOP and
paste the observed state — the CTO amends; you never loosen. Token swaps
are `await getSessionAccessToken()` — the surrounding guards and toasts
stay byte-identical everywhere. Read the dev-server banner port; warm the
canvas route before the full suite; if tsc names a ghost file, apply the
stale-`.next/types` rule before touching source; read `git status` before
staging — a line you didn't create is a STOP. Report every off-spec line
and number. E2E credentials are in `.env.local` — never print them. Final
`npm run verify` only after the owner stops the server."

## Estimated Difficulty
medium — eleven token-swap call sites (3 settings-root + 5 profile + 2
password + 1 integrations) that are individually trivial; the risk
concentrates in the two whole-file bindings (byte-equality required) and in
resisting the urge to "fix" anything adjacent on four legacy pages
mid-swap.

## Amendment 1 — pre-edit importer census rebound (2026-07-09)
**Blocker (correct STOP; zero edits, zero commits):** census gate #2 bound
one instrument — `grep -rln "from '@/lib/infra/supabase/legacyToken'"` —
but expected 4 files. The instrument only sees the alias spelling;
`lib/infra/profile/profilesRepository.ts` imports
`'../supabase/legacyToken'` (relative, line 7), so the gate printed 3 and
could never print 4. The intended FACT (4 importer files) was correct; the
bound instrument could not observe it. Same defect family as the
wc/Measure-Object, innerText/getByText, and diff/--cached splits: the
number was right, the measuring tool was bound wrong.
**CTO reproduction (2026-07-09, Git Bash, pre-edit tree):** alias grep →
exactly the 3 settings pages; relative grep → exactly
profilesRepository.ts; union `legacyToken'` → exactly 5 files (the 4
importers + the test file's `'./legacyToken'`). The comment-only mentions
in workspaceMembers.ts/passwordSecurity.ts are written `legacyToken.ts`
with no trailing quote and match none of the three gates — verified.
**Fix:** census gate #2 split into three measured gates (3 alias + 1
relative + 5 union); one derived post-edit union gate added
(5 → 2: password import removed, integrations import removed, test file
renamed; profile keeps its bearer-symbol import, profilesRepository
byte-untouched). No binding outside the two census blocks changed; the
per-file symbol gates and byte-untouched diffs were already
spelling-independent.
**Worktree ruling:** nothing to rule on — no edits were made. Resume from
the START of the pre-edit census, exactly as the implementer proposed.
**Lesson:** an importer census must use an instrument that sees every
import spelling (alias, `../` relative, `./` same-dir). Bind the union
pattern (`moduleName'`) alongside any per-spelling counts, and measure
every count on the real tree — never derive it from the file list you
happen to know about. Recorded in LESSONS_LEARNED.
