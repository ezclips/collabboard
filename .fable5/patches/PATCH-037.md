# PATCH-037 — CanvasClient strangler group 12: the auth trio onto `authState` (Pattern F extension, K-grade harness) — CanvasClient's DIRECT supabase operations go EXTINCT

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.5 REQUIRED** (owner standing rule: auth is GPT-5.5 territory; see §0.6 for the specific holds)
**Pattern:** F extension (auth-state observer family, §5.7-adjacent) delivered with the FULL Pattern K verification harness (whole-file fences, bound tests pre-run by the CTO, hash gates, edit simulation)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (TWO bound blocks + one import edit), `lib/infra/supabase/authState.ts`, `lib/infra/supabase/authState.test.ts` (**NEW FILE** — the first authState unit tests), `lib/domain/auth/user.ts` — **FOUR files total.**
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `96d41c9`; the seam files compiled (`tsc --strict`) and run (9/9 green) in scratch; all three CanvasClient edits applied to a scratch copy and every gate below measured on that simulation, including the bound post-edit hashes.

> Implementer: read PATCH_REFERENCE §5.7/§5.11 and §6 first. Bound tests are
> the fidelity net — never edit one; STOP and report instead (§8).

---

## 0. CTO rulings (the owner's five requested determinations)

### 0.1 Coherence: ONE seam, no split

Post-036 census (regenerated 2026-07-10 at `96d41c9`): CanvasClient's
remaining supabase surface is exactly three auth operations —
`auth.updateUser` (L300, toolbar-collapse preferences write),
`auth.getUser` (L316, mount fetch), `auth.onAuthStateChange` (L333, the
listener). Sites 2+3 live in a SINGLE useEffect (`=== SESSION + AUTH
REGION ===`, one bound block); site 1 is one statement in
`handleToggleToolbarCollapsed`. All three consume ONE target file —
`lib/infra/supabase/authState.ts`, the existing Pattern F auth-state
seam (PATCH-011) already consumed by ProtectedRoute / Navbar /
app/page.tsx. One patch, two small bound blocks, no split. **PATCH-038
is NOT needed.**

What this patch does NOT touch (deferred by name, hooks-batch
territory): the three remaining CLIENT hand-offs — `
resolveCurrentWorkspace(supabase, user)` (L251), the lines hook's
`supabase` argument (~L734), and `new FreeformGraphRepo(supabase, ...)`
(L2554) — plus the `supabase` memo, its import, and every
dependency-array token. Those pass the CLIENT OBJECT to legacy helpers
whose own table operations are other files' census sites. After this
patch CanvasClient performs ZERO direct supabase operations; it still
plumbs the client to three legacy helpers.

### 0.2 Failure-channel preservation (exact in BOTH channels at all three sites)

| Site | Resolved-error channel (legacy) | Thrown channel (legacy) | Port |
|---|---|---|---|
| `updateUser` L300 | `void`-discarded — the promise is never read; a resolved `{ error }` vanishes silently; the optimistic local mirror (L304) has ALREADY run and is never rolled back | a thrown network failure rejects the discarded promise → unhandled rejection; nothing else depends on it | `void updateCurrentUserMetadata(nextMetadata);` — the seam has NO catch (deliberate, documented in-file): a resolved error becomes a discarded err Result (same silence), a thrown failure keeps rejecting the void-discarded promise (same unhandled rejection) |
| `getUser` L316 | the legacy destructure NEVER reads `error` → user null → signed-out rendering AND `sessionReady(true)` — downstream, section-add shows "You must be logged in to add sections" | `fetchUser()` is called un-awaited → a throw is an unhandled rejection and `setSessionReady(true)` NEVER runs — downstream, section-add shows "Session loading, please try again" (L2796). **The two channels are OBSERVABLY different and must stay so** | seam returns `Result` with NO catch: resolved error → err, collapsed to null AT THE CALL SITE (`result.ok ? result.value : null` — the legacy ignore, now visible); thrown → rejects through the un-awaited caller, `sessionReady` stays false. EXACT in both |
| `onAuthStateChange` L333 | no failure channel (event stream) | none | subscription preserved; cleanup swaps `subscription.unsubscribe()` for the seam's returned `unsubscribe()` closure — same wiring, pinned by test |

### 0.3 Session / token / user-state ruling

1. **The session state is a presence indicator.** Field accesses beyond
   truthiness: NONE (grep-proven: no `session.` / `session?.` anywhere;
   consumers are the L2796/L2801 guards + one dependency array).
2. **The event path keeps storing the REAL session object.** The new
   `onAuthSessionChanged` passes the session through (typed as the new
   structural `AuthSession` subset — supabase's `Session` is assignable),
   so state contents are byte-identical to legacy on every event. The
   existing `onAuthUserChanged` (which maps to the user and DROPS the
   session) stays untouched for its three consumers.
3. **The getUser path keeps fabricating the minimal compat object**:
   `setSession({ user: currentUser } as Session)` — the legacy comment
   and cast are carried into the NEW block byte-identical.
4. **getUser ≠ getSession.** The mount fetch is deliberately
   server-validated ("using getUser like dashboard does" — legacy
   comment, which stays). The existing `getSessionUser()` (getSession,
   no validation) is NOT equivalent and is NOT used; the new
   `getVerifiedAuthUser()` mirrors auth.getUser exactly.
5. **Client identity**: the seam constructs its client via
   `createBrowserSupabaseClient()`; CanvasClient's own memo uses
   `supabaseBrowser()`. Both wrap `createClientComponentClient()` —
   the auth-helpers singleton (identity established at PATCH-025 and
   relied on by every canvas command since): the subscription observes,
   and the metadata write mutates, the SAME auth state the component's
   own client sees.
6. **No token handling exists at any of the three sites** (no
   access_token/refresh_token reads) — nothing to preserve beyond the
   session object pass-through.
7. **State types stay `User | null` / `Session | null`.** Migrating the
   monolith to `AuthUser` state is TYPE-ONLY churn barred by the
   PATCH-022 proxy-metric ruling. Consequence: THREE new named casts at
   the call sites, each factually sound at runtime (the seam delivers
   genuine supabase objects; the types are deliberate structural
   subsets): `(result.ok ? result.value : null) as User | null`,
   `newSession as Session | null`, `newSession?.user as User |
   undefined`. Plus the CARRIED legacy `as Session` fabrication cast.
   Cast census bound in §7.1 (`as Session` 1→2, `as User` 1→3).
8. **P6 rulings**: (a) `updateCurrentUserMetadata` vs
   `passwordSecurity.updateCurrentUserPassword` — same underlying API,
   DIFFERENT attribute family (`{ data }` vs `{ password }`) and the
   password file's header explicitly fences its consumers to the
   password page; different concern, both wrappers carry cross-references
   in their doc comments. (b) `onAuthSessionChanged` vs
   `onAuthUserChanged` — sibling subscriptions, session-delivering vs
   user-delivering; the new one exists because this consumer stores the
   session itself (§0.3.2).

### 0.4 Toast / redirect / retry / optimistic-state ruling

- **Toasts: NONE exist at any of the three sites; NONE are added.** The
  downstream session-guard toasts (L2797, L2803) are untouched and keep
  their exact trigger conditions via the preserved channels (§0.2).
- **Redirects: none exist** (CanvasClient never redirects on auth
  failure — ProtectedRoute owns that concern); none added.
- **Retries: none exist; none added.**
- **Optimistic state**: the toolbar preferences write's local mirror
  (`setUser(...)` L304 with its legacy `as User` cast) and the toolbar
  flip itself run unconditionally BEFORE/AFTER the fire-and-forget write
  and are NEVER rolled back on failure — all of it is OUTSIDE the bound
  block and stays byte-identical. This preserved
  fire-and-forget-without-rollback is recorded as the swallow family's
  first AUTH-INFRA sibling (NOT one of the nine command-internal sites —
  the discard happens at the `void` call site, pinned by the seam's
  thrown-channel test).

### 0.5 Behavior-repair authorization: NONE requested, NONE granted

Every channel at every site ports exactly (§0.2). The deliberate
no-catch style of the two new async seam functions — a DEPARTURE from
`getSessionUser`/`signOutCurrentUser`'s catch-style within the same
file — is a design choice made precisely so that NO behavior change
occurs; it is documented in both functions' doc comments and pinned by
the two `rejects.toBe(networkError)` tests. Any future repair (e.g.
toasting a failed preferences write) is a separate, owner-authorized
patch.

### 0.6 Model: GPT-5.5 REQUIRED

The owner's standing rule (auth is GPT-5.5 territory) applies, and the
patch carries three GPT-5.5-grade holds: (a) auth failure-channel
semantics with an OBSERVABLE resolved-vs-thrown split the implementer
must not "clean up"; (b) the repo's FIRST module-mocking test harness
(`vi.mock('./browserClient')` — no prior test mocks the client factory);
(c) the cross-factory singleton reasoning in §0.3.5. All 9 bound tests
were compiled and run GREEN by the CTO at authoring. Harness note for
the record: the CTO's SCRATCH run initially failed because the scratch
copy rewrote the `vitest` import to an absolute path — `vi.mock`
requires the literal `'vitest'` specifier. The repo-normal run
(`npx vitest run`) is unaffected; implementer needs no workaround.

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # 96d41c9 (or a descendant touching none of the 4 scoped files)
ls lib/infra/supabase/authState.test.ts   # MUST NOT EXIST (No such file or directory)
```

Byte-identity (the three existing files):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 0fb49089a9cc11b80d25dd431bb7448b246593f5
git hash-object lib/infra/supabase/authState.ts                # 3832ef844f04d31ecae583e68a14447697359c00
git hash-object lib/domain/auth/user.ts                        # d27573a8e61e33deb7e473ff51f74e379d8ef54c
```

CanvasClient census (measured 2026-07-10; note the ESCAPED dot — the
unescaped form false-matches the new import path `supabase/authState`,
the same instrument defect PATCH-030 caught with `supabase.storage`):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8384
grep -c '^[[:space:]]*$' "$F"             # 729
grep -c "supabase\.auth" "$F"             # 3   (the trio — extinction gate)
grep -c "supabase" "$F"                   # 32
grep -c "getVerifiedAuthUser" "$F"        # 0
grep -c "onAuthSessionChanged" "$F"       # 0
grep -c "updateCurrentUserMetadata" "$F"  # 0
grep -c "authState" "$F"                  # 0
grep -c "as Session" "$F"                 # 1
grep -c "as User" "$F"                    # 1
grep -c "subscription" "$F"               # 5
grep -c "sessionReady" "$F"               # 3   (case-sensitive: setSessionReady lines do NOT match)
```

Anchors:

```bash
sed -n '300p' "$F"   #         void supabase.auth.updateUser({
sed -n '316p' "$F"   #       const { data: { user: currentUser } } = await supabase.auth.getUser();
sed -n '333p' "$F"   #     const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
```

Repo-wide new-name collision (must print 0; `AuthSession` is
word-bounded because `getCurrentAuthSession` (PATCH-021) contains it as
a substring):

```bash
grep -rn "getVerifiedAuthUser\|onAuthSessionChanged\|updateCurrentUserMetadata" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
grep -rn "\bAuthSession\b" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 192 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/auth/user.ts` (whole file, exact, 24 lines; post-edit hash `b7883b8b20375663fc87e7bd1fac76d116a87a6c`)

The diff vs current is PURE ADDITIONS: the `AuthSession` structural
subset appended at EOF. Replace the file with exactly:

```ts
/**
 * Structural subset of an authenticated user, as UI components need it.
 * Supabase's `User` is assignable to this type - callers keep passing it.
 */
export interface AuthUserMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: AuthUserMetadata;
}

/**
 * Structural subset of an auth session - only the field UI code reads.
 * Supabase's `Session` is assignable to this type.
 */
export interface AuthSession {
  user: AuthUser;
}
```

## 3. BOUND FILE 2 — `lib/infra/supabase/authState.ts` (whole file, exact, 113 lines; CTO compile+test verified; post-edit hash `d4e124ba4843a4a907bd19b5713cd18c7f78f682`)

The diff vs current: the type import gains `AuthSession` (the ONE
deletion line), `getVerifiedAuthUser` is inserted after
`getSessionUser`, `onAuthSessionChanged` after `onAuthUserChanged`, and
`updateCurrentUserMetadata` appended at EOF. The three EXISTING
functions stay byte-identical — their consumers (ProtectedRoute, Navbar,
app/page.tsx) are untouched by this patch. Replace the file with
exactly:

```ts
import type { AuthSession, AuthUser } from '../../domain/auth/user';
import { domainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

/** Session read (no network validation - mirrors auth.getSession semantics). */
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
 * Server-VALIDATED user read (PATCH-037) - mirrors auth.getUser semantics
 * (the getSession sibling above reads the local session WITHOUT
 * validation; the two are not interchangeable). DELIBERATE no-catch,
 * unlike the siblings in this file: the one consumer (CanvasClient's
 * mount fetch) collapses a resolved error to null AT THE CALL SITE (its
 * legacy destructure never read the error - an auth service failure
 * renders as signed-out), while a THROWN failure must keep rejecting
 * through the un-awaited caller exactly as the raw call did (leaving
 * sessionReady false - an observably different channel).
 */
export async function getVerifiedAuthUser(): Promise<Result<AuthUser | null>> {
  const {
    data: { user },
    error,
  } = await createBrowserSupabaseClient().auth.getUser();

  if (error) {
    return err(domainError('unavailable', 'Could not load the signed-in user', { cause: error }));
  }

  return ok(user);
}

/**
 * Subscribe to auth state changes. Returns the unsubscribe function.
 * `event` passes through Supabase's event names ('SIGNED_IN', 'SIGNED_OUT', ...).
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

/**
 * Subscribe to auth state changes, delivering the SESSION object (the
 * onAuthUserChanged sibling above maps to the user only - PATCH-037's
 * consumer stores the session itself). Returns the unsubscribe function.
 */
export function onAuthSessionChanged(
  callback: (event: string, session: AuthSession | null) => void,
): () => void {
  const {
    data: { subscription },
  } = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
    callback(event, session);
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

/**
 * Auth user_metadata write (PATCH-037). DELIBERATE no-catch: the one
 * consumer fires it void-discarded (fire-and-forget) - a resolved error
 * must stay silently discardable, and a THROWN network failure must keep
 * surfacing as the same unhandled rejection the raw call produced. NOT
 * the password wrapper: passwordSecurity.updateCurrentUserPassword sends
 * the { password } attribute family and is fenced to the password page;
 * this sends ONLY { data } (user_metadata).
 */
export async function updateCurrentUserMetadata(
  metadata: Record<string, unknown>,
): Promise<Result<void>> {
  const { error } = await createBrowserSupabaseClient().auth.updateUser({
    data: metadata,
  });

  if (error) {
    return err(domainError('unavailable', 'Could not save user preferences', { cause: error }));
  }

  return ok(undefined);
}
```

## 4. BOUND FILE 3 — `lib/infra/supabase/authState.test.ts` (**NEW FILE**, whole file, exact, 172 lines, 9 tests; CTO ran 9/9 GREEN; post-edit hash `adaffec61a03cc38decdf774d9785acda08e2c60`)

The repo's first client-factory-mocking test file
(`vi.mock('./browserClient')`); the one test-file double-cast mirrors
the production factory idiom and is bound. Create the file with
exactly:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVerifiedAuthUser,
  onAuthSessionChanged,
  updateCurrentUserMetadata,
} from './authState';
import { createBrowserSupabaseClient } from './browserClient';

vi.mock('./browserClient', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createBrowserSupabaseClient);

/**
 * The fake exposes only the auth surface the functions under test touch;
 * the double-cast mirrors the production factory idiom
 * (`createClientComponentClient() as unknown as X`).
 */
function installFakeAuth(auth: Record<string, unknown>) {
  mockedCreateClient.mockReturnValue(
    { auth } as unknown as ReturnType<typeof createBrowserSupabaseClient>,
  );
}

beforeEach(() => {
  mockedCreateClient.mockReset();
});

describe('getVerifiedAuthUser', () => {
  it('returns the server-validated user object itself when signed in', async () => {
    const user = {
      id: 'user-1',
      email: 'u@example.com',
      user_metadata: { preferences: { toolbarCollapsed: true } },
    };
    const getUser = vi.fn(async () => ({ data: { user }, error: null }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(user);
    }
  });

  it('returns ok(null) when nobody is signed in', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a resolved auth error to an unavailable DomainError carrying the cause', async () => {
    const authError = { name: 'AuthApiError', message: 'service down' };
    const getUser = vi.fn(async () => ({ data: { user: null }, error: authError }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(authError);
    }
  });

  it('lets a THROWN failure reject through (deliberate no-catch - the legacy channel)', async () => {
    const networkError = new Error('fetch failed');
    const getUser = vi.fn(async () => {
      throw networkError;
    });
    installFakeAuth({ getUser });

    await expect(getVerifiedAuthUser()).rejects.toBe(networkError);
  });
});

describe('onAuthSessionChanged', () => {
  it('delivers the event name and the SAME session object to the callback', () => {
    let captured: ((event: string, session: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn((cb: (event: string, session: unknown) => void) => {
      captured = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    installFakeAuth({ onAuthStateChange });

    const received: Array<{ event: string; session: unknown }> = [];
    onAuthSessionChanged((event, session) => {
      received.push({ event, session });
    });

    const session = { user: { id: 'user-1' } };
    captured?.('SIGNED_IN', session);
    captured?.('SIGNED_OUT', null);

    expect(received).toHaveLength(2);
    expect(received[0].event).toBe('SIGNED_IN');
    expect(received[0].session).toBe(session);
    expect(received[1].event).toBe('SIGNED_OUT');
    expect(received[1].session).toBeNull();
  });

  it('returns an unsubscribe function wired to the live subscription', () => {
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));
    installFakeAuth({ onAuthStateChange });

    const stop = onAuthSessionChanged(() => {});

    expect(unsubscribe).not.toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('updateCurrentUserMetadata', () => {
  it('sends EXACTLY { data: metadata } - the user_metadata attribute family only', async () => {
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }));
    installFakeAuth({ updateUser });
    const metadata = {
      preferences: { toolbarCollapsed: true },
      preferences_updated_at: '2026-07-10T12:00:00.000Z',
    };

    const result = await updateCurrentUserMetadata(metadata);

    expect(result.ok).toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const payload = updateUser.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['data']);
    expect(payload.data).toBe(metadata);
  });

  it('maps a resolved auth error to an unavailable DomainError carrying the cause', async () => {
    const authError = { name: 'AuthApiError', message: 'service down' };
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => ({
      data: { user: null },
      error: authError,
    }));
    installFakeAuth({ updateUser });

    const result = await updateCurrentUserMetadata({ a: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(authError);
    }
  });

  it('lets a THROWN failure reject through (deliberate no-catch - the void call site discards it)', async () => {
    const networkError = new Error('fetch failed');
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => {
      throw networkError;
    });
    installFakeAuth({ updateUser });

    await expect(updateCurrentUserMetadata({ a: 1 })).rejects.toBe(networkError);
  });
});
```

---

## 5. CanvasClient edits (ONE import edit + TWO bound blocks, in file order)

Everything else stays BYTE-IDENTICAL — including the optimistic
`setUser` mirror (L304, its `as User` cast, and the whole toolbar
handler frame), the `// Fetch user on mount...` comment line, the
`}, []);` dependency array, the `supabase` memo and its three client
hand-offs, and the session guards at L2796/L2801.

### §5a — infra import block: one line inserted alphabetically (current L70–L71)

Replace

```ts
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import { createStorageGateway } from '@/lib/infra/supabase/storage';
```

with

```ts
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import { getVerifiedAuthUser, onAuthSessionChanged, updateCurrentUserMetadata } from '@/lib/infra/supabase/authState';
import { createStorageGateway } from '@/lib/infra/supabase/storage';
```

### §5b — toolbar preferences write (OLD = current L300–L302, 3 lines → NEW 1)

OLD:

```ts
        void supabase.auth.updateUser({
          data: nextMetadata,
        });
```

NEW:

```ts
        void updateCurrentUserMetadata(nextMetadata);
```

### §5c — the SESSION + AUTH useEffect body (OLD = current L315–L344, 30 lines → NEW 31)

OLD:

```ts
    const fetchUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (mounted) {
        setUser(currentUser ?? null);
        // Create a minimal session-like object for compatibility
        if (currentUser) {
          setSession({ user: currentUser } as Session);
        } else {
          setSession(null);
        }
        setSessionReady(true);
      }
    };

    fetchUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setSessionReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
```

NEW:

```ts
    const fetchUser = async () => {
      const result = await getVerifiedAuthUser();
      const currentUser = (result.ok ? result.value : null) as User | null;

      if (mounted) {
        setUser(currentUser ?? null);
        // Create a minimal session-like object for compatibility
        if (currentUser) {
          setSession({ user: currentUser } as Session);
        } else {
          setSession(null);
        }
        setSessionReady(true);
      }
    };

    fetchUser();

    // Listen for auth state changes
    const unsubscribe = onAuthSessionChanged((_event, newSession) => {
      if (mounted) {
        setSession(newSession as Session | null);
        setUser((newSession?.user as User | undefined) ?? null);
        setSessionReady(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
```

---

## 7. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 7.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object lib/domain/auth/user.ts                        # b7883b8b20375663fc87e7bd1fac76d116a87a6c
git hash-object lib/infra/supabase/authState.ts                # d4e124ba4843a4a907bd19b5713cd18c7f78f682
git hash-object lib/infra/supabase/authState.test.ts           # adaffec61a03cc38decdf774d9785acda08e2c60
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/auth/user.ts lib/infra/supabase/authState.ts lib/infra/supabase/authState.test.ts
# every row: i/lf    w/lf
```

### 7.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8384  (line-NEUTRAL: +1 import, -2 at §5b, +1 at §5c — never-grow holds)
grep -c '^[[:space:]]*$' "$F"             # 729
grep -c "supabase\.auth" "$F"             # 0   (EXTINCTION — zero direct supabase operations remain)
grep -c "supabase" "$F"                   # 30  (the memo, its import, three client hand-offs, dep arrays)
grep -c "getVerifiedAuthUser" "$F"        # 2   (1 import + 1 use)
grep -c "onAuthSessionChanged" "$F"       # 2
grep -c "updateCurrentUserMetadata" "$F"  # 2
grep -c "authState" "$F"                  # 1   (the import path)
grep -c "as Session" "$F"                 # 2   (carried fabrication + the new listener cast — §0.3.7)
grep -c "as User" "$F"                    # 3   (legacy L304 + the two new casts — §0.3.7)
grep -c "subscription" "$F"               # 3
grep -c "sessionReady" "$F"               # 3
```

### 7.2 Lib-file identity + suite

```bash
wc -l lib/domain/auth/user.ts                    # 24
wc -l lib/infra/supabase/authState.ts            # 113
wc -l lib/infra/supabase/authState.test.ts       # 172
grep -c "it(" lib/infra/supabase/authState.test.ts   # 9
git diff lib/domain/auth/user.ts | grep -c "^-[^-]"          # 0  (pure additions)
git diff lib/infra/supabase/authState.ts | grep -c "^-[^-]"  # 1  (the import-line rewrite — §3)
```

### 7.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- components/ProtectedRoute.tsx components/ui-kit/Navbar.tsx app/page.tsx
git diff -- lib/infra/supabase/passwordSecurity.ts lib/infra/supabase/currentUser.ts lib/infra/supabase/sessionToken.ts lib/infra/supabase/browserClient.ts lib/supabase/browser.ts
git diff -- lib/domain/canvas lib/infra/canvas lib/domain/core eslint.boundaries.config.mjs
git status --short   # exactly 3 M + 1 ?? (or A) — the four scoped files; ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

Site-map extinction (regenerate the census generator the CTO uses, or
equivalently):

```bash
grep -c "supabase\.auth\|\.from('" "$F"   # 0
```

---

## 8. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§5, then §7 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **201 passed (201), 25 files**; full Playwright warmed → **27 passed** (the auth.setup + protected-route + landing specs exercise the swapped session paths end-to-end); stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 9. Commit ritual

```bash
git add lib/domain/auth/user.ts lib/infra/supabase/authState.ts lib/infra/supabase/authState.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 4 staged lines (3 M + 1 A); anything else = STOP
git commit -m "refactor(canvas): extract the auth trio onto authState -- getVerifiedAuthUser + onAuthSessionChanged + updateCurrentUserMetadata, CanvasClient direct supabase ops extinct (PATCH-037)" -- lib/domain/auth/user.ts lib/infra/supabase/authState.ts lib/infra/supabase/authState.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the THREE new named casts +
the carried fabrication cast (§0.3.7; cast census `as Session` 1→2,
`as User` 1→3); the ONE deletion line in authState.ts (the import
rewrite); the deliberate no-catch style of the two new async functions
(§0.5 — do NOT add try/catch "for consistency"); the line-NEUTRAL
monolith (8,384→8,384 — the never-grow rule holds at equality); the
`supabase` census dropping by exactly the three statement lines
(32→30... note §5b's OLD spans one supabase line and §5c's OLD spans
two); ZERO behavior change anywhere (§0.5).

STOP if: any §1 gate mismatches; either OLD block fails byte-match at
its bound lines; any bound test fails (never edit a test); any §7.0
hash mismatches after one fix attempt against the fences; `git status
--short` shows any path outside the FOUR scoped files;
tsc/boundaries/unit/e2e fail beyond the stale-`.next/types` cure.

Do NOT: touch `getSessionUser`/`onAuthUserChanged`/`signOutCurrentUser`
or their consumers; touch `passwordSecurity.ts`, `currentUser.ts`,
`sessionToken.ts`, either client factory, or the hooks; touch the
optimistic mirror at L304, the dependency arrays, the `supabase` memo,
or the three client hand-offs (L251/~L734/L2554 — deferred by name,
§0.1); create files beyond what's bound; de-lint types; chase the
grandfather list (stays 2).
