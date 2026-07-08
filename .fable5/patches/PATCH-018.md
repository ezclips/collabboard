# PATCH-018 — Extraction: profile page; introduce the legacy-token quarantine seam

**Status:** draft (awaiting owner approval — third patch of batch 016–019)
**Complexity:** medium-high (largest client page extracted so far; every
decision pre-made below)
**Assigned model:** **GPT-5.4**
**Pattern:** A/E composition (repository + command, references: PATCH-004,
PATCH-009, PATCH-017) + **Pattern H reuse via class injection** (the
PATCH-017 `SupabaseStorageGateway` wrapped around the legacy client — no new
storage code) + **NEW: legacy-token quarantine file** (`legacyToken.ts` —
catalog entry decided at review; this patch is the complete spec).
**Depends on:** PATCH-017 (storage gateway class). PATCH-019 reuses
`legacyToken.ts`. PATCH-023 is the authorized patch that REMOVES the
quarantine — nothing in this patch anticipates it.

## Purpose
Move `app/dashboard/settings/profile/page.tsx` (861 lines) off direct
Supabase: `profiles` read/update/insert behind a domain command + repository,
the avatars upload behind the existing Pattern H gateway class, and the
page's token-scavenger machinery (`getAccessToken`/`makeAuthedClient`/
`decodeJwtPayload`) moved VERBATIM into ONE audited quarantine file that
PATCH-019 reuses and PATCH-023 later replaces. Grandfather list 8 → 7.

## Scope
Exactly nine Supabase call sites in one file (census below): one `profiles`
maybeSingle read, one `profiles` update-returning-id, one `profiles` insert,
two storage calls (upload + getPublicUrl), two auth calls
(signInWithPassword reauth + updateUser email change), plus the two
`@supabase` imports and the module-level scavenger/client/JWT helpers.

## Explicit NON-goals (owner-bound; violating any fails review)
- **No normalization, no security improvement, no scavenger replacement, no
  auth change, no UX change, no behavior change.** The scavenger MOVES
  verbatim; it does not get fixed. (It shares settings-root's cookie-only
  blindness — that is PATCH-023's functional repair.)
- The `fetch('/api/settings/notifications/emit', ...)` helper
  (`emitNotificationEvent`) stays IN THE PAGE byte-identical — after the
  move it calls the imported `getAccessToken` with the same name, so its
  body does not change by one byte.
- settings-root's own private `getAccessToken` copy (frozen by PATCH-017)
  is NOT consolidated onto the new helper. Not here (023).
- The `FORCE_REAUTH_EMAIL_CHANGE` / `STRICT_MFA` env flags and every branch
  they gate: untouched.
- No zod tightening: the profile patch payload is a DYNAMIC key/value
  record today (`{ [field]: value }`, `{ avatar_url }`, `{ beta_features }`,
  sometimes `{ email }`) — the schema must be `z.record(z.unknown())`.
  Do NOT enumerate keys, do NOT constrain values.

## CTO rulings bound into this patch (do not re-litigate)
1. **All Supabase traffic on this page rides `makeAuthedClient(token)`** —
   a per-call anon client with an explicit `Authorization: Bearer` header
   from the scavenged token (`persistSession: false`). The extraction MUST
   preserve that client for every call: repositories/gateway are built over
   the LEGACY client via injection. Using `createBrowserSupabaseClient()`
   anywhere on this page would CHANGE the auth context (cookie session vs
   scavenged token) — forbidden here, that swap is PATCH-023.
2. **`legacyToken.ts` auth helpers are RAW passthroughs** (they return the
   supabase `{ error }` shapes untranslated, NOT `Result`). Deliberate
   quarantine exception to house style: the page's downstream error handling
   (`getErrorMessage` reading `.message`/`.details`/`.hint`, exact toast
   texts) consumes the raw shapes, and 023 will re-route these helpers
   anyway. Wrapping them in `Result` today would force lossy re-translation
   at every call site.
3. **Repository/command errors carry the raw supabase error as `cause`,
   and the page RETHROWS the cause** (bound below) so `getErrorMessage`
   and every toast stay byte-identical.
4. **Pattern H is reused, not re-implemented:** `SupabaseStorageGateway`
   (class, client-injected) gets a second factory that binds the legacy
   client. `storage.ts` receives EXACTLY ONE authorized change: the
   `StorageSupabaseClient` interface becomes `export`ed (one keyword). This
   is the §5.8 freeze-exception process working as designed — reviewed,
   explicit, minimal.
5. The command guard (`ctx.userId` required) and zod parse are additions
   the page can never trigger (its own guards throw first) — same accepted
   shape as PATCH-017 deviation 3.

## Pre-edit census (paste ALL output; STOP on any mismatch)
```bash
f="app/dashboard/settings/profile/page.tsx"
# 1. @supabase surface:
grep -n "@supabase" "$f"
# expected EXACTLY 2 lines: L4 createClient import, L5 `import type { User }`
# 2. Table/storage call sites (line-anchored — chains are multi-line):
grep -nE "\.from\('[^']*'\)" "$f"
# expected EXACTLY 5 lines:
#   L184 .from('profiles')   (maybeSingle read)
#   L250 .from('profiles')   (update ... .select('id').maybeSingle())
#   L264 .from('profiles')   (insert)
#   L412 .from('avatars')    (storage upload)
#   L418 .from('avatars')    (storage getPublicUrl)
grep -nE "\.storage\b" "$f"
# expected EXACTLY 2 lines: L411 and L417 (both `db.storage`)
grep -nE "\.auth\.|\.rpc\(" "$f"
# expected EXACTLY 2 lines:
#   L339 db.auth.signInWithPassword  (reauth, only under FORCE_REAUTH_EMAIL_CHANGE)
#   L348 db.auth.updateUser          (email change request)
# 3. Scavenger machinery counts (these MOVE; composition changes post-edit):
grep -c "makeAuthedClient" "$f"    # expected: 5 (def L67; calls L182/L247/L336/L405)
grep -c "getAccessToken" "$f"      # expected: 6 (def L52; calls L111/L167/L236/L332/L401)
grep -c "decodeJwtPayload" "$f"    # expected: 4 (def L79; calls L174/L239/L403)
# 4. Consumed row fields (must stay within the bound ProfileRow):
grep -oE "profileData\??\.[a-zA-Z_]+" "$f" | sort -u
# expected EXACTLY: about account_type avatar_url beta_features class_info
#                   display_name id language username   (9 fields)
grep -oE "\buser\?\.[a-zA-Z_]+" "$f" | sort -u
# expected EXACTLY: user?.email  user?.id
wc -l "$f"   # expected: 861
```
Anything more, less, or different: STOP, report, change nothing.

## Bindings

### 1. Infra — `lib/infra/supabase/legacyToken.ts` — exactly:
```ts
import { createClient } from '@supabase/supabase-js';
import type { StorageGateway, StorageSupabaseClient } from './storage';
import { SupabaseStorageGateway } from './storage';

/**
 * LEGACY-TOKEN QUARANTINE (PATCH-018). This file centralizes the profile
 * page's localStorage token scavenging + bearer-token client construction
 * VERBATIM so it exists in exactly one audited place. It is scheduled for
 * removal by PATCH-023 (scavenger normalization — a functional repair:
 * cookie-session users get an empty localStorage, so these helpers fail
 * closed for them today). PATCH-019 reuses this file. Do not "improve" it;
 * do not add consumers beyond the pages the patches name.
 *
 * DELIBERATE house-style exception: the auth helpers below return RAW
 * supabase shapes (not Result) — the legacy pages' error handling and toast
 * texts consume those shapes directly, and 023 replaces the helpers anyway.
 */

// Session is in localStorage, not cookies. Read the token directly.
export const getAccessToken = (): string | null => {
    try {
        const lsKeys = Object.keys(localStorage).filter(k => k.includes('auth-token'));
        for (const key of lsKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const token = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
            if (token) return token;
        }
    } catch { /* ignore */ }
    return null;
};

// Create a supabase client with the access token explicitly set so RLS sees auth.uid()
export const makeAuthedClient = (token: string) => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
);

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
The three moved bodies (`getAccessToken`, `makeAuthedClient`,
`decodeJwtPayload`) are byte-identical to page lines 51–84 except the added
`export` keywords and `export type` — reviewer diffs them against the old
page directly.

### 2. Infra — `lib/infra/supabase/storage.ts` — ONE authorized change:
Line 16: `interface StorageSupabaseClient {` →
`export interface StorageSupabaseClient {`. NOTHING else in the file
changes (reviewer verifies the diff is exactly one keyword).

### 3. Domain — `lib/domain/profile/profile.ts` — exactly:
```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

/**
 * Mirrors the nine columns the profile page consumes today (select('*'),
 * consumption census PATCH-018). Loose by design; snake_case kept
 * deliberately — the page maps these fields into its own state shape.
 */
export interface ProfileRow {
  readonly id: string;
  readonly display_name: string | null;
  readonly username: string | null;
  readonly about: string | null;
  readonly class_info: string | null;
  readonly language: string | null;
  readonly account_type: string | null;
  readonly avatar_url: string | null;
  readonly beta_features: boolean | null;
}

export interface ProfilesRepository {
  /** null = no profiles row yet (maybeSingle semantics, not an error). */
  findById(userId: UserId): Promise<Result<ProfileRow | null, DomainError>>;
  /** true = an existing row was updated; false = no row matched. */
  updatePatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<boolean, DomainError>>;
  insertPatch(
    userId: UserId,
    email: string,
    patch: Record<string, unknown>,
    now: string,
  ): Promise<Result<void, DomainError>>;
}

/** Dynamic by design — the legacy page sends arbitrary field patches. */
export const saveProfilePatchSchema = z.object({
  email: z.string(),
  patch: z.record(z.unknown()),
});

export const createSaveProfilePatchCommand = (repository: ProfilesRepository) =>
  defineCommand({
    name: 'profile.savePatch',
    input: saveProfilePatchSchema,
    execute: async (input, ctx) => {
      if (!ctx.userId) {
        return err(
          domainError('permission_denied', 'A signed-in user is required to save the profile'),
        );
      }
      // ONE timestamp - the legacy page used a single `now` for update AND
      // for insert's created_at + updated_at.
      const now = new Date().toISOString();
      // Legacy control flow preserved (PATCH-018): update first; only when
      // NO row matched, insert. Errors pass through untouched so the raw
      // supabase error stays available as `cause` for the page's toasts.
      const updated = await repository.updatePatch(ctx.userId, input.email, input.patch, now);
      if (!updated.ok) return updated;
      if (updated.value) return ok(undefined);
      return repository.insertPatch(ctx.userId, input.email, input.patch, now);
    },
  });
```

### 4. Infra — `lib/infra/profile/profilesRepository.ts`
PATCH-004/-015 structure (SupabaseErrorLike, narrow structural client
interface, class, factory). The factory is LEGACY-bound:
```ts
export function createLegacyProfilesRepository(token: string): ProfilesRepository {
  return new SupabaseProfilesRepository(
    makeAuthedClient(token) as unknown as ProfilesSupabaseClient,
  );
}
```
(`makeAuthedClient` imported from `../supabase/legacyToken`.) The structural
client interface types the DYNAMIC payloads as `Record<string, unknown>`
for both `update(...)` and `insert(...)` (the patch has arbitrary keys —
do not enumerate them in the interface). Exact query shapes — payload
construction is the CONTRACT, spread order included:
- `findById(userId)`:
  `from('profiles').select('*').eq('id', userId).maybeSingle()`
  error → `err(domainError('unavailable', 'Could not load profile', { cause: error }))`;
  else `ok(data ?? null)` (row passed through as-is — select('*') superset
  is fine, `ProfileRow` types the consumed fields).
- `updatePatch(userId, email, patch, now)`:
  `from('profiles').update({ email, ...patch, updated_at: now }).eq('id', userId).select('id').maybeSingle()`
  — payload literal EXACTLY `{ email, ...patch, updated_at: now }` (spread
  ORDER preserved from the legacy page). error →
  `err(domainError('unavailable', 'Could not save profile', { cause: error }))`;
  else `ok(Boolean(data))`.
- `insertPatch(userId, email, patch, now)`:
  `from('profiles').insert({ id: userId, email, created_at: now, ...patch, updated_at: now })`
  — payload literal EXACTLY that, spread order preserved. Same error
  mapping; else `ok(undefined)`.

### 5. Page rewrite — `app/dashboard/settings/profile/page.tsx`
- Imports: DELETE lines 4–5 (`createClient`, `type User`). ADD:
  ```ts
  import type { AuthUser } from '@/lib/domain/auth/user';
  import { asUserId } from '@/lib/domain/core/ids';
  import { createSaveProfilePatchCommand } from '@/lib/domain/profile/profile';
  import { createLegacyProfilesRepository } from '@/lib/infra/profile/profilesRepository';
  import {
      createLegacyTokenStorageGateway,
      decodeJwtPayload,
      getAccessToken,
      legacyReauthenticateWithPassword,
      legacyRequestEmailChange,
  } from '@/lib/infra/supabase/legacyToken';
  ```
- DELETE the module-level `getAccessToken` (lines 51–64), `makeAuthedClient`
  (66–71), `JwtPayload` + `decodeJwtPayload` (73–84) — they now come from
  the quarantine file with identical names, so every remaining caller
  (including `emitNotificationEvent`) stays byte-identical.
- Type swap (PATCH-010 pattern): `useState<User | null>` →
  `useState<AuthUser | null>` (L134); `as User` → `as AuthUser` (L180).
- `loadProfile` — token guard + JWT decode + `setUser` byte-identical.
  Replace ONLY lines 182–192 (`const db = ...` through the `profileError`
  toast block) with:
  ```ts
  const repository = createLegacyProfilesRepository(token);
  const profileResult = await repository.findById(asUserId(userId));
  // PATCH-018: legacy toast preserved - the raw supabase error travels as
  // the DomainError cause; message/code interpolation stays byte-identical.
  if (!profileResult.ok) {
      const cause = profileResult.error.cause as { message?: string; code?: string } | undefined;
      console.error('profiles SELECT error:', cause);
      toast.error(`Profile load failed: ${cause?.message} (${cause?.code})`);
  }
  const profileData = profileResult.ok ? profileResult.value : null;
  ```
  The `if (profileData) { ... } else { ... }` mapping blocks: byte-identical.
- `persistProfilePatch` — guards + email fallback chain byte-identical.
  Replace ONLY lines 247–273 (`const db = ...` through the insert block)
  with:
  ```ts
  const saveProfilePatch = createSaveProfilePatchCommand(
      createLegacyProfilesRepository(token),
  );
  const result = await saveProfilePatch({ email, patch }, { userId: asUserId(userId) });
  // PATCH-018: rethrow the RAW supabase error (the DomainError cause) so
  // getErrorMessage and every save toast stay byte-identical.
  if (!result.ok) throw (result.error.cause ?? result.error);
  ```
- `handleRequestEmailChange` — everything byte-identical EXCEPT: delete
  line 336 (`const db = makeAuthedClient(token);`); the reauth call becomes
  ```ts
  const { error: reauthError } = await legacyReauthenticateWithPassword(
      token,
      normalizedCurrentEmail,
      currentPasswordForEmail,
  );
  ```
  and the update call becomes
  ```ts
  const { error: updateError } = await legacyRequestEmailChange(
      token,
      normalizedNewEmail,
      `${window.location.origin}/auth/callback?next=/dashboard/settings/profile`,
  );
  ```
  Both destructure the same `{ error }` shape — every line below each call
  stays byte-identical.
- `handleAvatarUpload` — guards + `fileExt`/`fileName`/`filePath` lines
  byte-identical (path stays `avatars/${fileName}` INSIDE bucket
  `'avatars'` — yes, doubled, preserve it). Replace line 405 (`const db =`)
  with `const storage = createLegacyTokenStorageGateway(token);` and lines
  411–419 (both storage blocks) with:
  ```ts
  const uploadResult = await storage.upload('avatars', filePath, file, { upsert: true });
  if (!uploadResult.ok) throw uploadResult.error;
  const publicUrl = storage.getPublicUrl('avatars', filePath);
  ```
  `await persistProfilePatch({ avatar_url: publicUrl });` and everything
  after: byte-identical.
- `emitNotificationEvent`, all state, all rendering (lines 452–861), the
  email modal, `getErrorMessage`: byte-identical.

## Files to Create
- `lib/infra/supabase/legacyToken.ts` (verbatim §1)
- `lib/domain/profile/profile.ts` (verbatim §3)
- `lib/infra/profile/profilesRepository.ts` (§4)
- `lib/domain/profile/profile.test.ts` (unit, below)
- `lib/infra/profile/profilesRepository.test.ts` (unit, below)
- `lib/infra/supabase/legacyToken.test.ts` (unit, below — decodeJwtPayload only)
- `e2e/characterization/profile-page.spec.ts` (below)

## Files to Modify
- `app/dashboard/settings/profile/page.tsx` (§5)
- `lib/infra/supabase/storage.ts` (§2 — the ONE exported keyword)
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/profile/page.tsx',`

## MUST NOT touch
`app/api/**`; `app/dashboard/settings/page.tsx` (its private scavenger copy
is 017-frozen); `lib/infra/supabase/browserClient.ts`/`currentUser.ts`/
`authState.ts`/`serverClient.ts`; `lib/domain/core/**`; `vitest.config.ts`
(include already covers the new test paths); all other pages/components/
specs; `.fable5/`; `.claude/`. No new dependencies.

## Unit-test requirements (fake clients/repos; PATCH-015/-017 test style)
- `profile.test.ts` (command, fake repository): null `ctx.userId` →
  `permission_denied`, NO repo method called; update-found path
  (`updatePatch` → ok(true)) → `insertPatch` NOT called; update-not-found
  (ok(false)) → `insertPatch` called with the SAME `now` string and a
  DEEP-EQUAL patch (`toEqual`, NOT `toBe` — zod clones the input during
  parse, so object identity does not survive the command boundary);
  `updatePatch` err → command returns THAT err (same Result object — cause
  passthrough) and `insertPatch` NOT called; `insertPatch` err after
  not-found → command returns that err. (≥5 tests)
- `profilesRepository.test.ts` (fake client): findById row passthrough /
  no-row → ok(null) / db error → err AND `error.cause` IS the fake's error
  object (the page's toast depends on it); updatePatch payload EXACTLY
  `{ email, ...patch, updated_at }` with the patch keys spread BETWEEN
  email and updated_at, `eq('id', ...)`, `.select('id').maybeSingle()`,
  row → true, no row → false; insertPatch payload EXACTLY
  `{ id, email, created_at, ...patch, updated_at }`; write error → err with
  cause. (≥6 tests)
- `legacyToken.test.ts`: `decodeJwtPayload` ONLY (it is pure): decodes a
  base64url payload (sub + email), handles `-`/`_` characters, handles
  missing padding. The scavenger, client factory, and raw passthroughs are
  deliberately NOT unit-tested (browser-bound quarantine; same ruling as
  authState helpers). (≥3 tests)
Current suite is 60 tests / 15 files. Expect ≥14 new; output must LIST the
three new test files by name and state the new total (≥74).

## Characterization — `e2e/characterization/profile-page.spec.ts`
**Every assertion below was CTO-probed against the OLD page with the real
e2e storage state on 2026-07-09 — bind exactly this, nothing more.** The
e2e session is cookie-only, so `getAccessToken()` returns null and
`loadProfile` exits at its first guard: form renders with pure defaults,
zero network (same reachable-state shape as PATCH-017 Amendment 1).
Authenticated project, standard `test.skip(!hasE2ECredentials, ...)`.
**Mutation-free: NEVER click any Save, the avatar row (opens a file
chooser), "Send verification", or the Beta features toggle (it attempts a
real write).** Allowed interactions: opening and cancelling the email modal
(pure local state — probed, zero network).
Flow (all probed):
1. `goto('/dashboard/settings/profile')`; assert heading `Basic info`
   (30s). Do NOT assert the "Personal account" label — it strict-mode
   collides with the settings sidebar (probed).
2. IMMEDIATELY next: assert the "Not authenticated — please log in again"
   toast (`[data-sonner-toast]`, ~4s auto-dismiss).
3. Assert the `Security mode` card renders with BOTH lines present:
   `getByText(/Email change re-auth:/)` and `getByText(/Strict MFA mode:/)`
   — do NOT assert enabled/disabled (env-dependent).
4. Assert all nine rows render, each via
   `getByText('<label>', { exact: true }).first()`: `Avatar`, `Name`,
   `Email`, `Username`, `About`, `Class info`, `Language`, `Account type`,
   `Beta features`.
5. Assert the default-state witnesses (probed): `Not set` (exact) has
   count 1 (the Name field); `English (US)` (exact) visible (Language
   fallback); `Individual` (exact) visible (Account type default).
6. Email modal round-trip: click `getByText('Email', { exact: true }).first()`
   → assert heading `Change email` and the `Send verification` button are
   visible → click `Cancel` → assert the `Change email` heading is hidden.
Do NOT assert on network traffic. The write paths and all three seams
(repository, command, gateway, auth passthroughs) are e2e-unreachable for
this account; they are covered by the unit tests + review (PATCH-014/015/017
risk-acceptance shape).

## Known deviations (pre-accepted; do not "fix", do not extend)
1. Avatar upload failure now throws a `DomainError` instead of the raw
   storage error — the toast is the fixed text 'Failed to upload avatar'
   either way; console-only (PATCH-017 deviation 1 precedent).
2. `handleRequestEmailChange` used ONE `makeAuthedClient` instance for both
   auth calls; the two passthrough helpers construct one each. The clients
   are stateless (`persistSession: false`); at most an extra GoTrue console
   warning. Console-only.
3. The command adds a zod parse + `ctx.userId` guard the page cannot
   trigger (its own guards throw first). Unreachable additions.
4. `const now` moves from `persistProfilePatch` into the command; still
   computed once per save (single-timestamp semantics preserved).
5. Profile save/load errors now travel as `DomainError.cause` and are
   RETHROWN as the raw cause at the page boundary — toast texts
   byte-identical by construction (bound mappings in §5).

## Required comments in code (reviewer checks presence)
- The quarantine header block in `legacyToken.ts` (§1 — names PATCH-023 and
  the raw-passthrough ruling).
- The cause-rethrow comments at BOTH page throw sites (§5).
- The legacy-toast-preservation comment in `loadProfile` (§5).
- The control-flow + single-timestamp comments in the command (§3).

## Verification sequence (in order; paste all output)
```bash
# (pre-edit census first, then Phase A:)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/profile-page.spec.ts   # OLD page
npm run test:unit          # 3 new files listed, new total stated (>=74)
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test    # full suite (21 tests), NEW page
grep -c "@supabase" app/dashboard/settings/profile/page.tsx      # 0 (exit 1 expected)
grep -c "makeAuthedClient" app/dashboard/settings/profile/page.tsx   # 0 - client construction fully moved
grep -c "getAccessToken" app/dashboard/settings/profile/page.tsx     # 6 (1 import line + 5 call sites; definition moved out)
grep -c "decodeJwtPayload" app/dashboard/settings/profile/page.tsx   # 4 (1 import line + 3 call sites)
git diff HEAD -- lib/infra/supabase/storage.ts   # pre-commit: exactly the one `export` keyword
# grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Local e2e runs use the config's 2 workers — never override with `--workers`.

## Commit
ONE atomic commit (implementation + tests + spec + grandfather line).
  Commit message:
  refactor(profile): extract profile page onto legacy-token seam + profiles repository

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted and matches ALL blocks (incl. the 9-field and
      2-field consumption censuses)
- [ ] New e2e spec green against OLD page first, then NEW (both pasted);
      contains NO Save click, NO avatar interaction, NO "Send verification"
      click, NO Beta toggle click; email-modal round-trip only
- [ ] `npm run test:unit` green; three new test files listed; total ≥74
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Full e2e suite green (21 tests) against the running dev server
- [ ] Post-edit greps: `@supabase` 0; `makeAuthedClient` 0;
      `getAccessToken` 6; `decodeJwtPayload` 4 (compositions as bound)
- [ ] `storage.ts` diff is exactly one `export` keyword
- [ ] Grandfather list = 7 (count stated)
- [ ] Single atomic commit; hash reported

## Reviewer checklist (CTO or successor; CTO_PLAYBOOK §14 rituals apply)
- [ ] Re-run every gate yourself; never accept pasted output alone
- [ ] Diff-vs-Bindings with `--ignore-space-at-eol`; the ONLY page changes:
      import block, type swap (2 sites), the four replaced regions bound in
      §5 — `emitNotificationEvent`, guards, email-fallback chain,
      `getErrorMessage`, and ALL rendering byte-identical
- [ ] The three moved function bodies in `legacyToken.ts` diffed
      byte-identical against old page lines 51–84 (modulo `export`)
- [ ] Payload spread ORDER byte-for-byte: `{ email, ...patch, updated_at }`
      and `{ id, email, created_at, ...patch, updated_at }`
- [ ] Cause-rethrow present at both page throw sites; repository tests
      assert `error.cause` IS the fake's error object
- [ ] `storage.ts`: one-keyword diff, nothing else; gateway still binds the
      BROWSER client in ITS factory (the legacy factory lives in
      legacyToken.ts, not storage.ts)
- [ ] No `useMemo` around the per-token factories (token is call-time
      state; memoizing would freeze a stale token — check none was added)
- [ ] e2e spec matches the probed flow exactly (esp.: no "Personal account"
      assertion; no enabled/disabled assertion on the Security-mode lines)
- [ ] At review closeout: decide the catalog entry for the legacy-token
      quarantine (candidate §5.9) + add the §7 row for 018
- [ ] CURRENT_TASK 023-inventory note updated if review finds more
      scavenger call sites than the census bound

## Expected grandfather reduction
8 → 7 (`app/dashboard/settings/profile/page.tsx` removed; count re-verified
at review).

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 018,
`{{TITLE}}` = profile legacy-token extraction. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 and §6 first. FIVE CTO rulings are
bound in the patch — the legacy client is preserved for every call
(browser client is FORBIDDEN on this page), the legacyToken auth helpers
return RAW supabase shapes on purpose, and errors are rethrown as their
`cause` at the page boundary. The scavenger moves verbatim — do not fix,
rename, or consolidate it. The e2e spec's only interaction is the
email-modal open/cancel; never click Save, the avatar row, Send
verification, or the Beta toggle. Five pre-accepted deviations are listed —
do not add more. Local e2e = 2 workers by config. Run every verification
command and paste real output; the patch is not done until the atomic
commit exists. E2E credentials are in `.env.local` — never print them.
PW_BASE_URL against the running dev server; final `npm run verify` only
after the owner stops it."

## Estimated Difficulty
medium-high — nine call sites across four handlers, but zero open
decisions; the three traps are the frozen byte-identical zones, the payload
spread order, and the mutation-free e2e spec.
