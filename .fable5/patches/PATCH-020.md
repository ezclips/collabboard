# PATCH-020 — Extraction: password/passkey page; auth+MFA surface behind a raw-passthrough facade

**Status:** draft (awaiting owner approval — first patch of batch 020–021)
**Amendment 3 issued: the AAL-badge characterization assertion was bound to
the CSS-rendered casing (`AAL1`, via `.innerText()`), not the DOM text
Playwright's `getByText` actually matches (`aal1`) — a probe-methodology
error, not a page behavior question. Assertion corrected to match the raw
text; no page behavior changed.**
**Complexity:** medium (nine call-site swaps, five of them MFA/webauthn; zero
of the five passkey paths are exercisable by test, so DIFF FIDELITY IS THE
ONLY NET on them)
**Assigned model:** **GPT-5.5 — REQUIRED, not GPT-5.4.** Ruling: the page
mutates account credentials (`updateUser({password})`), performs a real
re-authentication (`signInWithPassword`), and wraps five WebAuthn/MFA calls
that characterization can NEVER exercise (clicking any passkey button
triggers a real platform ceremony or a real factor mutation). On every prior
patch a behavior slip would fail a test; here five of the nine swapped call
sites have no test behind them — the implementer's fidelity is the only
guarantee. That inverts the delegation calculus: GPT-5.4 is safe where the
net catches drift; this patch needs the stronger implementer plus the
strictest verbatim bindings (provided below). GPT-5.4 is acceptable ONLY as
an owner-authorized fallback if GPT-5.5 is unavailable, with the reviewer
treating every wrapper diff as suspect.
**Pattern:** C-family (auth-only swap) extended with an MFA/webauthn
passthrough facade — candidate Pattern J, enters the catalog at review, not
before. Plus Pattern I REUSE as a consumer only: the page imports the
quarantine's existing `getAccessToken` + `decodeJwtPayload`; **zero new code
enters `legacyToken.ts`** (one header-comment sentence only).
**Depends on:** PATCH-018 (`legacyToken.ts` exports exist). Independent of
PATCH-021.

## Purpose
Move `app/dashboard/settings/password/page.tsx` (505 lines) off direct
Supabase. Its surface: five MFA/passkey calls (`mfa.listFactors`,
`mfa.getAuthenticatorAssuranceLevel`, `mfa.webauthn.register`,
`mfa.webauthn.authenticate`, `mfa.unenroll`), three auth calls (`getUser`,
`signInWithPassword` reauth, `updateUser({password})`), one `profiles` table
read (email fallback), and in-page duplicates of the quarantine's narrow
`getAccessToken` scavenger + `decodeJwtPayload`. All nine Supabase call
sites move behind ONE new raw-passthrough facade file; the two duplicated
helpers are DELETED and re-imported from the quarantine (CTO byte-compared
2026-07-09: `getAccessToken` identical modulo the `export` keyword;
`decodeJwtPayload` identical logic, return annotation widens to the
quarantine's `JwtPayload` supertype — call sites read only `.sub`/`.email`,
zero runtime difference, pre-authorized here). Grandfather 6 → 5.

## What this patch is NOT
- NOT a behavior change. The scavenger-fed `emitSecurityNotification`
  silently no-ops for cookie-session users today (empty localStorage → no
  token → early return, no security email). That is an EXISTING defect in
  023's inventory. Preserve it exactly.
- NOT a domain-layer patch. No commands, no repositories, no Result shapes —
  see the facade's header comment for the deliberate raw-shape ruling.
- NOT an MFA improvement. Do not touch factor handling, AAL logic, ceremony
  options, error texts, or `console.error` lines.

## CTO note — why §0 "escalate" APIs are executable here
`signInWithPassword`, `updateUser`, and the entire `mfa.*` namespace are
escalation APIs because credential semantics need CTO judgment. That
judgment is exercised HERE: every wrapper below is bound verbatim, the page
diffs are bound verbatim, and the implementer makes no auth decisions.
Verified 2026-07-09: installed `@supabase/supabase-js` 2.93.1 fully types
`auth.mfa.webauthn` (auth-js `WebAuthnApi`) — no casts are needed or
permitted. Rejected alternatives, for the record: reusing Result-shaped
`getCurrentUser` (currentUser.ts) would change the getUser error path the
page deliberately ignores; reusing `ProfilesRepository.findById` would
change client (bearer vs standard) and query shape (`*` vs `email`). Both
rejected for behavior fidelity — raw passthroughs only.

## Pre-edit census (paste ALL output; STOP on any mismatch)
Run in **Git Bash** (this is a `bash` block). Shell-explicit equivalents for
the numeric gates are bound inline per PATCH-019 Amendment 1.
```bash
f="app/dashboard/settings/password/page.tsx"
# 1. @supabase surface:
grep -n "@supabase" "$f"
# expected EXACTLY 1 line: L4 createClientComponentClient import
# 2. Supabase call sites (the ONLY direct-supabase lines on the page):
grep -n "supabase\.auth" "$f"
# expected EXACTLY 9 lines:
#   L87  supabase.auth.mfa.listFactors(),
#   L88  supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
#   L108 }, [supabase.auth.mfa]);          <- useCallback dep array
#   L120 supabase.auth.mfa.webauthn.register({
#   L148 supabase.auth.mfa.webauthn.authenticate({
#   L175 supabase.auth.mfa.unenroll({ factorId });
#   L196 supabase.auth.getUser();
#   L239 supabase.auth.signInWithPassword({
#   L247 supabase.auth.updateUser({
grep -n "\.from('profiles')" "$f"
# expected EXACTLY 1 line: L207 (email-fallback read inside resolveAccountEmail)
grep -nE "\.storage\b|\.rpc\(" "$f"
# expected: NO output, exit 1
# 3. Helper/duplicate counts (defs DELETED, calls REBOUND to quarantine imports):
grep -c "getAccessToken" "$f"     # expected: 3 (def L21; calls L43, L199)
grep -c "decodeJwtPayload" "$f"   # expected: 2 (def L35; call L201)
grep -c "resolveAccountEmail" "$f" # expected: 3 (def L195; calls L233, L269)
# 4. API fetches (UNTOUCHED):
grep -n "fetch('/api" "$f"
# expected EXACTLY 2 lines: L47 (/api/settings/notifications/emit),
#                           L275 (/api/auth/password-reset)
# 5. Line count — Git Bash wc -l counts ALL lines incl. the file's 58 blank
#    lines. PowerShell equivalents (PATCH-019 Amendment 1 rule):
#      (Get-Content $f).Count                          -> 505  ACCEPTED
#      (Get-Content $f | Measure-Object -Line).Lines   -> 447  (skips blanks) ACCEPTED
#    Any other value: STOP.
wc -l "$f"   # expected: 505
```
Anything more, less, or different: STOP, report, change nothing.

## Amendment 3 (2026-07-09) — the AAL badge's DOM text is lowercase; `AAL1` was a probe-tooling artifact, not the page's actual behavior · CTO/spec-reviewer decision

**Dispute (Codex/GPT-5.5, correct stop — no edits, clean git status):**
Phase A characterization against the OLD page failed —
`getByText(/Current session: AAL1/)` found no element; Playwright's error
context showed the actual text as `Current session: aal1`. The other bound
test (short-password validation, zero network) passed.

**Finding (re-reading the OLD page, `app/dashboard/settings/password/page.tsx`
line 385):**
```tsx
Current session: <span className="font-medium uppercase">{currentAal ?? 'unknown'}</span>
```
`currentAal` is Supabase's own AAL value, typed `'aal1' | 'aal2' | 'aal3' |
null` — always lowercase at the source. The `uppercase` class is Tailwind's
`text-transform: uppercase`, a purely visual CSS effect: the DOM text node
and the accessible name stay `aal1`; only the painted pixels are capitals.

**Root cause of the spec defect:** the original characterization probe read
the badge with Playwright's `.innerText()`, which is layout-aware and
DOES reflect CSS `text-transform` in Chromium — so the probe correctly
printed `"Current session: AAL1"` and I bound the assertion to what I saw.
But `getByText()` (used in the actual spec, correctly per house style)
matches against raw text content / accessible name, which CSS
`text-transform` does NOT alter. The probe tool and the assertion tool
disagree on what "the text" is for a CSS-transformed element — the same
family of defect as PATCH-019 Amendment 1 (two tools, two numbers, same
underlying bytes), here applied to rendered text instead of a line count.

**Decision: the assertion is corrected to the raw-text baseline
(`Current session: aal1`); no page behavior changed, nothing further to
verify.** The OLD page has always rendered `aal1` in its DOM; this was
never in dispute — only which representation of that text a probe should
trust when the element carries a CSS text-transform. **Codex/GPT-5.5 may
resume Phase A with the corrected assertion; the rest of the spec
(including the passed zero-network validation test) is unaffected.**

## Bindings

### 1. New file — `lib/infra/supabase/passwordSecurity.ts` (exact, whole file)
```ts
import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-020: narrow raw-passthrough wrappers for the password/passkey
 * settings page. All calls run on the STANDARD cookie/browser client -
 * never the legacy bearer client.
 *
 * DELIBERATE house-style exception (same ruling as the legacy-token
 * quarantine): these return RAW supabase shapes, not Result - the page's
 * error handling and toast texts consume { data, error } directly, and a
 * behavior-preserving extraction must not translate them. When password/MFA
 * gets a real domain command (post-023 program), these become its infra
 * edge or are replaced by it. Do not add consumers beyond the pages the
 * patches name.
 */

export function listMfaFactors() {
    return createBrowserSupabaseClient().auth.mfa.listFactors();
}

export function getAuthenticatorAssuranceLevel() {
    return createBrowserSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
}

export function registerWebauthnPasskey(friendlyName: string) {
    return createBrowserSupabaseClient().auth.mfa.webauthn.register({ friendlyName });
}

export function authenticateWebauthnPasskey(factorId: string) {
    return createBrowserSupabaseClient().auth.mfa.webauthn.authenticate({ factorId });
}

export function unenrollMfaFactor(factorId: string) {
    return createBrowserSupabaseClient().auth.mfa.unenroll({ factorId });
}

export function getCurrentAuthUser() {
    return createBrowserSupabaseClient().auth.getUser();
}

export function reauthenticateWithPassword(email: string, password: string) {
    return createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
}

export function updateCurrentUserPassword(password: string) {
    return createBrowserSupabaseClient().auth.updateUser({ password });
}

export function findProfileEmailById(userId: string) {
    return createBrowserSupabaseClient()
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
}
```
(`createBrowserSupabaseClient()` wraps the SAME `createClientComponentClient`
singleton the page constructed — identical client instance, no behavior
change. Established by PATCH-019 for `getSession`/`refreshSession`; extends
to the `mfa` namespace unchanged because it is the same runtime object.)

### 2. Quarantine header — `lib/infra/supabase/legacyToken.ts` (ONE sentence; no code)
After the sentence ending `(settings-root's stayed in-page, 017-frozen).`,
append exactly:
`PATCH-020 adds the password page as a consumer of getAccessToken +
decodeJwtPayload (its in-page duplicates deleted) - no new code.`
EVERYTHING else in the file byte-untouched. The reviewer will diff this file
expecting exactly one comment-line change.

### 3. Page rewrite — `app/dashboard/settings/password/page.tsx`
- REPLACE line 4 (the `@supabase/auth-helpers-nextjs` import) with:
  ```ts
  import { decodeJwtPayload, getAccessToken } from '@/lib/infra/supabase/legacyToken';
  import {
      authenticateWebauthnPasskey,
      findProfileEmailById,
      getAuthenticatorAssuranceLevel,
      getCurrentAuthUser,
      listMfaFactors,
      reauthenticateWithPassword,
      registerWebauthnPasskey,
      unenrollMfaFactor,
      updateCurrentUserPassword,
  } from '@/lib/infra/supabase/passwordSecurity';
  ```
- DELETE lines 21–33 (`getAccessToken` definition) and lines 35–40
  (`decodeJwtPayload` definition), plus the now-doubled blank line between
  them (one blank line remains between the `AALLevel` type and
  `emitSecurityNotification`). The call sites at old L43, L199, L201 keep
  their exact text — they now resolve to the quarantine imports.
- DELETE line 67 (`const supabase = createClientComponentClient();`) and its
  following blank line (L68).
- In `loadPasskeyState`: replace the two `Promise.all` entries
  `supabase.auth.mfa.listFactors(),` → `listMfaFactors(),` and
  `supabase.auth.mfa.getAuthenticatorAssuranceLevel(),` →
  `getAuthenticatorAssuranceLevel(),`. Replace the dep array
  `}, [supabase.auth.mfa]);` → `}, []);` (the imports are module-stable;
  the old dep was a stable singleton property — callback identity is
  unchanged: created once, never recreated).
- `handleRegisterPasskey`: `const { data, error } = await supabase.auth.mfa.webauthn.register({\n                friendlyName,\n            });`
  → `const { data, error } = await registerWebauthnPasskey(friendlyName);`
- `handleVerifyWithPasskey`: `const { data, error } = await supabase.auth.mfa.webauthn.authenticate({\n                factorId,\n            });`
  → `const { data, error } = await authenticateWebauthnPasskey(factorId);`
- `handleRemovePasskey`: `const { error } = await supabase.auth.mfa.unenroll({ factorId });`
  → `const { error } = await unenrollMfaFactor(factorId);`
- `resolveAccountEmail`:
  `const { data: { user } } = await supabase.auth.getUser();`
  → `const { data: { user } } = await getCurrentAuthUser();`
  and the five-line profiles read (old L206–210)
  ```
  const { data: profileRow } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
  ```
  → `const { data: profileRow } = await findProfileEmailById(userId);`
  The final return line (old L211) stays byte-identical.
- `handleUpdatePassword`:
  ```
  const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
  });
  ```
  → `const { error: reauthError } = await reauthenticateWithPassword(email, currentPassword);`
  and
  ```
  const { error } = await supabase.auth.updateUser({
      password: newPassword
  });
  ```
  → `const { error } = await updateCurrentUserPassword(newPassword);`
- EVERYTHING else byte-identical: `MIN_PASSWORD_LENGTH`,
  `DEFAULT_PASSKEY_NAME`, the `PasskeyFactor`/`AALLevel` types and their
  in-page casts (`as PasskeyFactor[]`, `as AALLevel`),
  `emitSecurityNotification` (including its silent-no-op token guard), all
  validation order in `handleUpdatePassword` (three toasts BEFORE any
  network), every `console.error`, every toast text, both fetch handlers,
  all rendering.

## Files to Create
- `lib/infra/supabase/passwordSecurity.ts` (§1)
- `e2e/characterization/password-page.spec.ts` (below)

## Files to Modify
- `app/dashboard/settings/password/page.tsx` (§3)
- `lib/infra/supabase/legacyToken.ts` (§2 — one comment sentence; zero code)
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/password/page.tsx',`

## MUST NOT touch
`app/api/**` (both fetch targets hard-forbidden);
`lib/infra/supabase/storage.ts`/`browserClient.ts`/`currentUser.ts`/
`authState.ts`/`serverClient.ts`; ALL existing code in `legacyToken.ts`
(comment sentence only); `lib/infra/profile/**`; `lib/domain/**`; all other
pages/components/specs; `.fable5/`; `.claude/`. No new dependencies.

## Unit tests
NONE new — every wrapper binds the real browser client (same ruling as
PATCH-018/019 helpers; not constructible in the node test env).
`npm run test:unit` must stay green at **76 tests / 18 files** (state the
unchanged count; if it differs, STOP and report — do not reconcile).

## Characterization — `e2e/characterization/password-page.spec.ts`
**Every assertion below was CTO-probed against the OLD page with the real
e2e storage state on 2026-07-09.** Observed: unique `Password` and
`Passkeys` headings (count 1 each — no strict-mode collision); Update
disabled while either field is empty; passkey load settles to the empty
state (`No passkeys registered yet.`, zero `Verify session` buttons) with NO
error toast — the cookie session satisfies `mfa.listFactors` via a single
`GET /auth/v1/user`; AAL badge's underlying DOM text reads
`Current session: aal1` — the badge is visually uppercased by a CSS
`uppercase` class (Tailwind `text-transform`), which is why it LOOKS like
`AAL1` on screen and in `.innerText()` (render-aware) but is lowercase in
the raw text content Playwright's `getByText` matches (see Amendment 3);
the
short-password branch fires the toast `Password must be at least 15
characters` with ZERO network (validation precedes `resolveAccountEmail`).

**NEVER click:** `Reset password by email` (sends a REAL email),
`Add passkey` (real WebAuthn platform ceremony), `Verify session`,
`Remove` (real factor mutation). The ONLY permitted click is
`Update password` with the bound too-short new password — rejected
client-side before any network call.

```ts
import { test, expect } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';

test.describe('password page (characterization)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('renders the password form and the current passkey-free state without mutating anything', async ({ page }) => {
    await page.goto('/dashboard/settings/password', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Password', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Enter current password')).toBeVisible();
    await expect(page.getByPlaceholder('Enter new password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update password' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reset password by email' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Passkeys', exact: true })).toBeVisible();
    // This encodes the test account's current passkey-free state; rebind if the account ever enrolls one.
    await expect(page.getByText('No passkeys registered yet.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Verify session' })).toHaveCount(0);
    await expect(page.getByText(/Current session: aal1/)).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('rejects a too-short new password client-side with zero network', async ({ page }) => {
    await page.goto('/dashboard/settings/password', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No passkeys registered yet.')).toBeVisible({ timeout: 30_000 });

    const forbidden: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/auth/v1/') || url.includes('/rest/v1/') || url.includes('/api/')) {
        forbidden.push(`${request.method()} ${url}`);
      }
    });

    await page.getByPlaceholder('Enter current password').fill('characterization-probe');
    await page.getByPlaceholder('Enter new password').fill('short');
    await expect(page.getByRole('button', { name: 'Update password' })).toBeEnabled();

    // Hydration-acknowledged click (PATCH-014 Amendment 2 idiom): retry the
    // click until the toast confirms the handler ran. Re-clicks stay in the
    // zero-network validation branch, so the listener assertion is unaffected.
    await expect(async () => {
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(
        page.locator('[data-sonner-toast]', { hasText: 'Password must be at least 15 characters' }).first(),
      ).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

    expect(forbidden).toEqual([]);
  });
});
```
Two tests EXACTLY as bound — no additions, no variations. The network
listener attaches only AFTER the passkey load settles, so the page's own
`GET /auth/v1/user` does not pollute the zero-network window.

## Verification sequence (paste real output for every step)
Operational rules bound from PATCH-018/019 (PATCH_REFERENCE §6):
1. **Dev-server banner rule (NEW, incident 2026-07-09):** when starting or
   using a dev server, READ the Next.js startup banner. If it says
   `Port 3000 is in use ... using available port 3001 instead`, STOP — you
   are about to test the WRONG server. Reconcile with the owner which server
   is authoritative before running anything. `PW_BASE_URL` must match the
   banner port of the server you were told to use.
2. ONE client at a time against the dev server — no probes, curls, or
   second suites while Playwright runs.
3. Warm the canvas route before the full suite (board-lifecycle
   participates): run
   `PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/board-lifecycle.spec.ts`
   once and let it pass BEFORE the timed full run. If board creation fails,
   apply rule 4 before touching any code.
4. Board-creation failures during e2e are diagnosed via DB FIRST: count the
   e2e workspace's ACTIVE boards (`deleted_at IS NULL`) against
   `FREE_PLAN_BOARD_LIMIT = 3` and report to the owner for cleanup —
   quota pollution is an environment fault, never a reason to edit code.
5. Numeric gates are shell-bound (PATCH-019 Amendment 1): every expected
   number below states its producing command; a mismatch from a DIFFERENT
   command is not a gate result — run the bound command.

```bash
# Phase A — OLD page (dev server running, banner port verified = 3000):
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/password-page.spec.ts
# expected: 2 passed — paste output

# Phase B — implement §1, §2, §3 (NOT the boundaries line yet), then:
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/password-page.spec.ts
# expected: 2 passed — paste output
npm run test:unit          # unchanged: 76 tests / 18 files — state it
npx tsc --noEmit           # 0 errors
# post-edit greps (Git Bash), page:
f="app/dashboard/settings/password/page.tsx"
grep -c "@supabase" "$f"             # 0  (package import gone; exit 1 expected)
grep -c "supabase\." "$f"            # 0  (client identifier gone; the new import PATHS
                                     #     contain "supabase/" with a SLASH — that is why
                                     #     this gate binds the DOT; exit 1 expected)
grep -c "passwordSecurity" "$f"      # 1  (the import)
grep -c "getAccessToken" "$f"        # 3  (SAME count as pre-edit, NEW composition: 1 import + calls at old L43/L199; def deleted)
grep -c "decodeJwtPayload" "$f"      # 2  (SAME count, NEW composition: 1 import + call at old L201; def deleted)
grep -c "resolveAccountEmail" "$f"   # 3  (unchanged: def + 2 calls)
grep -c "profiles" "$f"              # 0  (exit 1 expected)
grep -n "fetch('/api" "$f"           # still EXACTLY 2 lines, same two routes
# facade:
grep -c "createBrowserSupabaseClient" lib/infra/supabase/passwordSecurity.ts   # 10 (1 import + 9 calls)
grep -c "export function" lib/infra/supabase/passwordSecurity.ts               # 9
# quarantine (comment-only change):
git diff --ignore-space-at-eol -- lib/infra/supabase/legacyToken.ts
# expected: ONLY the one header-comment sentence added

# Phase C — boundaries line removed, then:
npm run check:boundaries   # green; grandfather list = 5 entries (count them)
# Full suite — warm-up rule 3 first, then:
PW_BASE_URL=http://localhost:3000 npx playwright test
# expected total: 26 tests (arithmetic: 24 pre-patch per `npx playwright
# test --list` [1 setup + 4 smoke + 19 characterization] + 2 new = 26 in 17
# files). If the count differs, REPORT it (rule: report every off-spec
# number) — do not reconcile silently.

# FINAL (owner stops the dev server first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"
# must print 0 — this gate and no other port check (Windows/WSL disagree);
# ALSO confirm no strays: same command for -LocalPort 3001 must print 0
npm run verify             # typecheck + production build + boundaries
git status --porcelain     # clean after the commit
```
Local e2e runs use the config's 2 workers — never override with `--workers`.

## Deviation rule (binding)
Report EVERY line that differs from the bindings above — including casts
tsc forces, import-order changes a formatter makes, and any gate number
that comes out different (test counts included). "No runtime effect" is the
reviewer's conclusion to draw, never grounds to skip reporting
(LESSONS_LEARNED, PATCH-018/019). Expected deviations: **NONE**.

## Commit
ONE atomic commit (implementation + spec + grandfather line).
  Commit message:
  refactor(password): extract auth+MFA surface behind passwordSecurity facade

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL blocks (shell-bound numbers)
- [ ] New e2e spec green against OLD page first, then NEW (both pasted);
      it never clicks Reset-by-email/Add passkey/Verify session/Remove;
      the two probed tests only
- [ ] `npm run test:unit` green at 76/18 — unchanged, stated
- [ ] `npx tsc --noEmit` 0 errors, zero new casts anywhere
- [ ] `npm run check:boundaries` green with the entry removed (list = 5)
- [ ] Full e2e suite green, 26 tests (24 + 2 arithmetic stated), canvas
      route warmed first, banner port verified
- [ ] Post-edit greps exact per the bound commands, compositions stated
      for the two same-count gates (`getAccessToken` 3, `decodeJwtPayload` 2)
- [ ] `legacyToken.ts` diff = one comment sentence; zero code lines
- [ ] `passwordSecurity.ts` byte-equal to §1
- [ ] Grandfather list = 5 (count stated)
- [ ] Single atomic commit; hash reported; every off-spec line disclosed
      (expected: none)

## Reviewer checklist (CTO or successor; CTO_PLAYBOOK §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; page changes are ONLY:
      the import-block swap, two deleted helper defs, deleted client line,
      nine call-site swaps, one dep-array change
- [ ] **The five MFA wrappers get line-by-line scrutiny — no test covers
      them.** Each must pass EXACTLY the original argument shape
      (`{ friendlyName }`, `{ factorId }`) and return the raw promise
      untouched — no awaiting, no destructuring, no error mapping inside
      the facade
- [ ] Validation order in `handleUpdatePassword` unchanged: three client
      toasts precede `resolveAccountEmail`; reauth precedes `updateUser`;
      `emitSecurityNotification` fires only after a successful update
- [ ] `resolveAccountEmail` cascade order unchanged: getUser email → token
      scavenger → JWT payload email → profiles fallback; the
      `user?.id || payload.sub` precedence preserved
- [ ] Dep-array change verified: `[supabase.auth.mfa]` → `[]` and nothing
      else in any hook changed
- [ ] `legacyToken.ts` diff is the single comment sentence
- [ ] e2e spec never clicks the four forbidden buttons; network listener
      attaches after load settles; toPass idiom on the only click
- [ ] At review closeout: §7 row for 020 (+ Pattern J catalog entry if
      accepted); CURRENT_TASK batch-4 row; health ledger per §12; rule on
      whether GPT-5.5 vs GPT-5.4 actually implemented it and record the
      outcome for the 021 assignment

## Expected grandfather reduction
6 → 5 (`app/dashboard/settings/password/page.tsx` removed; count re-verified
at review). Remaining 5: members (021), PostCardContent, FreeformPadletCards,
CanvasClient, collabboard canvas page.

## Handoff (owner: paste this to GPT-5.5)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 020,
`{{TITLE}}` = password/passkey auth+MFA facade extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 and §6 first. Five of the nine swapped
call sites (all MFA/webauthn) have NO test coverage possible — your diff
fidelity is the only net; copy the bindings exactly. The e2e spec must NEVER
click Reset-by-email, Add passkey, Verify session, or Remove; the only
permitted click is the bound too-short-password Update. Read the dev-server
startup banner: if Next says it fell back to port 3001, stop and reconcile —
never test a port you didn't verify. Report every off-spec line and every
off-spec NUMBER (test counts included); zero deviations are expected. Warm
the canvas route before the full suite; one client at a time against the dev
server; board-creation failures are diagnosed via DB quota first; the
stopped-server gate is the PowerShell listener count. E2E credentials are in
`.env.local` — never print them. Final `npm run verify` only after the owner
stops the server."

## Estimated Difficulty
medium — mechanically simple swaps, but five of them are beyond the reach of
any test, the page mutates credentials, and the traps are argument-shape
drift inside the facade, the dep-array change, and the four buttons the spec
must never click.
