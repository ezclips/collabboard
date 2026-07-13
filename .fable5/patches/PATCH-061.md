# PATCH-061 - CanvasClient grandfather retirement: the boundary program's FINAL closeout

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K mechanics; type de-casts + one call-site adaptation, zero new code,
zero new files).
**Authored:** 2026-07-13. The live tree, the boundaries config, the authState
infra, and the workspace-context helper were all read before this ruling; the
entire recipe was gate-simulated END TO END at authoring (tsc clean,
`check:boundaries` clean WITH THE GRANDFATHER LIST EMPTY — meaning the whole
`components/**` + `app/**` tree was linted and passed — vitest 252/28, plus
the negative control) before binding. Preserve LF for CanvasClient; the
boundaries config is MIXED-EOL — section 0.5.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` byte-fenced files.

**Bound commit message:**

```
refactor(canvas): retire the last grandfather entry -- CanvasClient de-casts to domain auth types, boundary list empty (PATCH-061)
```

## 0. CTO ruling

### 0.1 The finding: the last violation is a type-level fossil

CanvasClient's ONLY `@supabase/*` import is L75
`import { User, Session } from '@supabase/supabase-js';`. Census of every
use, read directly:

- `User`: the `useState<User | null>` state type and THREE casts;
- `Session`: the `useState<Session | null>` state type, TWO casts, ONE
  truthiness read (`if (!session && ...)`), one deps-array entry. Nobody
  reads any Session field.

Every value being cast comes FROM the domain infra ALREADY TYPED:
`getVerifiedAuthUser()` returns `Result<AuthUser | null>` and
`onAuthSessionChanged` delivers `AuthSession | null`
(`lib/infra/supabase/authState.ts`, PATCH-037 family). The casts are
DOWN-casts erasing domain types back into supabase types to satisfy the old
state annotations. The fix is to stop fighting the infra: swap the two state
types and five casts to `AuthUser`/`AuthSession`
(`@/lib/domain/auth/user`; `AuthSession = { user: AuthUser }`), the exact
PATCH-010 pattern. All three `user={user}` receivers (CanvasModals,
FreeformPadletCards, OverlayLayer) already take `AuthUser | null`; `session`
is never passed as a prop; local accesses are only
`id`/`email`/`user_metadata.*` — all AuthUser-covered.

### 0.2 The one real coupling, and its adaptation

`resolveWorkspaceForUser(user)` (L253) flows into
`lib/workspace/context.ts`'s `resolveCurrentWorkspace`, whose param is
`Pick<User, 'id' | 'email'>` — `email?: string`, while `AuthUser.email` is
`?: string | null`. tsc rejects the direct pass (proven at authoring).

Ruling: adapt AT THE CALL SITE —
`resolveWorkspaceForUser({ id: user.id, email: user.email ?? undefined })` —
rather than widening the shared helper (14 callers across API routes and
pages; wrong blast radius). The adaptation is BEHAVIOR-IDENTICAL, proven by
direct read of every `email` use in `resolveCurrentWorkspace`:
`defaultWorkspaceName(email: string | null | undefined)`,
`user.email ?? ''` (twice), truthiness guards (`if (... && user.email)`) —
null and undefined behave identically at every one. The call site is guarded
by `if (!user?.id) return;` so `user.id` is safe. Do NOT touch
`lib/workspace/context.ts` or `lib/infra/supabase/workspaceMembers.ts`.

### 0.3 What this closes — and what it does not

Removing the config's last entry makes GRANDFATHERED_UI_FILES **EMPTY**:
grandfather 1 -> 0, and `check:boundaries` now lints the ENTIRE
`components/**` + `app/**` tree with zero exceptions (proven green at
authoring). **The PATCH-002 boundary-freeze program CLOSES.**

NOT closed, disclosed explicitly: CanvasClient's 8,375-line size problem;
its VESTIGIAL local `supabase` client (L35 import + L199 memo + 26
deps-array mentions — ZERO call sites remain, the strangler removed them
all; the memo is identity-stable so the deps entries are inert; its removal
is a separate cleanup patch, NOT bundled here); realtime/presence design;
the owner-gated P3 swallow family. The boundary GATE closes; the
architecture program continues.

### 0.4 The negative control (bound, run at authoring)

With the NEW (empty-list) config, linting the OLD CanvasClient fails with
exactly ONE error: `no-restricted-imports` at **75:1**. The NEW CanvasClient
passes clean. The reviewer must re-run this control, not just the green
path. A green gate that cannot fail is not a gate.

### 0.5 The boundaries config is MIXED-EOL (the PATCH-060 discipline)

All hashes for `eslint.boundaries.config.mjs` in this spec are
**`git hash-object --no-filters`** (raw bytes; the file has 70 CR bytes and
an LF-only grandfather block). Plain `git hash-object` reports the FILTERED
hash — for reference only: `5c0b5463511bd840d7e810f77003cac30e893ebf`
pre-edit. The extractor handles this file in BINARY; no-CR assertions apply
to CanvasClient only. Do not change the config's line endings.

### 0.6 Scope

Exactly two implementation paths change:

- `app/dashboard/canvas/[id]/CanvasClient.tsx` (LINE-NEUTRAL: 8,375 -> 8,375;
  the never-grow discipline holds)
- `eslint.boundaries.config.mjs` (73 -> 72; the shrink-only list empties)

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-061 spec
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # f3583e93e0ec3dc575cdaf78cd328645149025a4
git hash-object --no-filters eslint.boundaries.config.mjs # 1d82f8937894e07f95cccacdda850b71515a6e99
```

MUST-NOT-CHANGE - verify all now and after the final hashes:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 3cfda55254a927014a277f5a0af35979c3c33da2
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 85232736b2b4f9c982d78575acc5a139a3d473fb
git hash-object components/collabboard/canvas/ui/OverlayLayer.tsx # 8940a6b1baa1e825139a026c3bb8f37e04ee7afb
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # 2e158f1278a395b5028083e8f387a22e4daf5b60
git hash-object lib/domain/auth/user.ts # b7883b8b20375663fc87e7bd1fac76d116a87a6c
git hash-object lib/infra/supabase/authState.ts # d4e124ba4843a4a907bd19b5713cd18c7f78f682
git hash-object lib/infra/supabase/workspaceMembers.ts # 8d62ca5e5f33c5df5faa8407cb9d4b5fc8dbdd57
git hash-object lib/workspace/context.ts # 3832406fe9dcd92772e789cc6ccca39e7a4ad565
```

Use exact code-form instruments, not broad identifier prose matches:

```bash
CC=app/dashboard/canvas/[id]/CanvasClient.tsx
rg -n "from '@supabase" "$CC" | wc -l # 1 (L75, the last violation)
rg -n '\bAuthUser\b' "$CC" | wc -l # 0
rg -n '\bAuthSession\b' "$CC" | wc -l # 0
rg -n --fixed-strings "resolveWorkspaceForUser(user)" "$CC" | wc -l # 1
rg -n --fixed-strings "CanvasClient.tsx" eslint.boundaries.config.mjs | wc -l # 1
wc -l "$CC" # 8375
wc -l eslint.boundaries.config.mjs # 73
git ls-files --eol -- "$CC" # i/lf w/lf
git ls-files --eol -- eslint.boundaries.config.mjs # i/mixed w/mixed (expected)
```

## 2. Exact replacement pairs

CanvasClient: nine pairs. Config: one pair (pure deletion; empty NEW fence).
Every OLD occurs exactly once. Apply in order. No hand edits.

1. The last flagged import swaps to the domain types:

```ts
import { User, Session } from '@supabase/supabase-js';
```
->
```ts
import type { AuthUser, AuthSession } from '@/lib/domain/auth/user';
```

2. Session state type:

```ts
  const [session, setSession] = useState<Session | null>(null);
```
->
```ts
  const [session, setSession] = useState<AuthSession | null>(null);
```

3. User state type:

```ts
  const [user, setUser] = useState<User | null>(null);
```
->
```ts
  const [user, setUser] = useState<AuthUser | null>(null);
```

4. The metadata-update cast:

```ts
        setUser((prevUser) => prevUser ? ({ ...prevUser, user_metadata: nextMetadata } as User) : prevUser);
```
->
```ts
        setUser((prevUser) => prevUser ? ({ ...prevUser, user_metadata: nextMetadata } as AuthUser) : prevUser);
```

5. The verified-user cast (the value is already `AuthUser | null` — the cast becomes an identity annotation):

```ts
      const currentUser = (result.ok ? result.value : null) as User | null;
```
->
```ts
      const currentUser = (result.ok ? result.value : null) as AuthUser | null;
```

6. The minimal-session construction (an `AuthSession` is exactly `{ user: AuthUser }`):

```ts
          setSession({ user: currentUser } as Session);
```
->
```ts
          setSession({ user: currentUser } as AuthSession);
```

7. The auth-change session cast (identity after the swap):

```ts
        setSession(newSession as Session | null);
```
->
```ts
        setSession(newSession as AuthSession | null);
```

8. The auth-change user cast:

```ts
        setUser((newSession?.user as User | undefined) ?? null);
```
->
```ts
        setUser((newSession?.user as AuthUser | undefined) ?? null);
```

9. The workspace-role call-site adaptation (the ONLY runtime-text change; behavior-identical, section 0.2):

```ts
        const workspace = await resolveWorkspaceForUser(user);
```
->
```ts
        const workspace = await resolveWorkspaceForUser({ id: user.id, email: user.email ?? undefined });
```

10. The last grandfather entry retires — the list is EMPTY (empty NEW fence):

```ts
  'app/dashboard/canvas/\\[id\\]/CanvasClient.tsx',
```
->
```ts
```

## 3. Mechanical write, true-blob reconstruction, and final hashes

Create `_p061_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the twenty TypeScript
fences above, requires each working tree file AND its `HEAD` blob to be the
true bound pre-edit content, reconstructs both final files only from those
blobs, and asserts both final raw hashes before reporting success. The config
is handled in BINARY (mixed EOL); no-CR assertions apply to CanvasClient only.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def rawhash(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()

spec = open('.fable5/patches/PATCH-061.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 20, f'expected 20 ts fences, got {len(fences)} - STOP'

targets = (
    ('app/dashboard/canvas/[id]/CanvasClient.tsx',
     'f3583e93e0ec3dc575cdaf78cd328645149025a4',
     '43e8cd40717ef8d69d3b142bdb677294e0216655',
     fences[0:18], True),
    ('eslint.boundaries.config.mjs',
     '1d82f8937894e07f95cccacdda850b71515a6e99',
     '69a6a03d2c49bb65e67791620c54bd5dc79164f0',
     fences[18:20], False),
)

for path, pre, post, pair_fences, lf_only in targets:
    working = open(path, 'rb').read()
    assert rawhash(working) == pre, f'{path} working pre-hash - STOP'
    data = command_bytes('git', 'show', f'HEAD:{path}')
    assert rawhash(data) == pre, f'{path} true pre-edit blob - STOP'
    if lf_only:
        assert b'\r' not in data, f'{path} CRLF pre-edit blob - STOP'
    text = data.decode('utf-8')
    for pair in range(len(pair_fences) // 2):
        old, new = pair_fences[pair * 2], pair_fences[pair * 2 + 1]
        assert text.count(old) == 1, f'{path} pair {pair + 1} count mismatch - STOP'
        text = text.replace(old, new)
    out = text.encode('utf-8')
    if lf_only:
        assert b'\r' not in out, f'{path} CRLF final text - STOP'
    open(path, 'wb').write(out)
    assert rawhash(open(path, 'rb').read()) == post, f'{path} final hash - STOP'

print('LAST GRANDFATHER ENTRY RECONSTRUCTED FROM TRUE BLOBS AND HASH-VERIFIED')
```

NOTE: pair 10's NEW fence is EMPTY (the config line is deleted). An empty
```ts fence is still a fence; the count of 20 includes it.

Final scoped hashes (raw, `--no-filters` for the config):

```bash
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # 43e8cd40717ef8d69d3b142bdb677294e0216655
git hash-object --no-filters eslint.boundaries.config.mjs # 69a6a03d2c49bb65e67791620c54bd5dc79164f0
```

## 4. Post-edit gates

```bash
CC=app/dashboard/canvas/[id]/CanvasClient.tsx
rg -n "from '@supabase" "$CC" | wc -l # 0
rg -n '\bAuthUser\b' "$CC" | wc -l # 5 (import + state + 3 casts)
rg -n '\bAuthSession\b' "$CC" | wc -l # 4 (import + state + 2 casts)
rg -n --fixed-strings "resolveWorkspaceForUser({ id: user.id, email: user.email ?? undefined })" "$CC" | wc -l # 1
rg -n --fixed-strings "CanvasClient.tsx" eslint.boundaries.config.mjs | wc -l # 0
rg -n "from '@supabase" components app -g '*.ts' -g '*.tsx' | wc -l # 0 (repo UI tree fully clean)
wc -l "$CC" # 8375 (LINE-NEUTRAL)
wc -l eslint.boundaries.config.mjs # 72
git ls-files --eol -- "$CC" # i/lf w/lf
git diff --name-only # exactly the two implementation paths
npx tsc --noEmit
npm run check:boundaries # the ENTIRE UI tree is now linted with ZERO exceptions and must pass
npx vitest run # 252 passed (252), 28 files - unchanged
# own server: warm /, /auth, /pricing, /dashboard, and /dashboard/canvas/test
PW_BASE_URL=http://localhost:3000 npx playwright test --list # 27 tests in 18 files
PW_BASE_URL=http://localhost:3000 npx playwright test # 27 passed
# stop the server by PID, then:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

THE NEGATIVE CONTROL (mandatory, after the green run): restore the TRUE
pre-edit CanvasClient bytes under the NEW config, run
`npm run check:boundaries`, and confirm it FAILS with exactly one
`no-restricted-imports` error at `$CC` line 75:1. Then restore the final
bytes, re-confirm the hash `43e8cd40...`, and re-confirm a clean run.

Re-run every MUST-NOT-CHANGE hash after the final scoped hashes — in
particular `lib/workspace/context.ts` and `lib/infra/supabase/
workspaceMembers.ts`, which this patch adapts TO, not touches. Commit only
the two implementation paths with the bound message, using explicit
pathspecs. If this spec is pre-existing or untracked, do not add it to the
implementation commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not widen or otherwise touch `lib/workspace/context.ts`,
  `lib/infra/supabase/workspaceMembers.ts`, or `lib/domain/auth/user.ts` —
  the call-site adaptation is the bound seam.
- Do not remove the vestigial local `supabase` client (L35 import, L199
  memo, 26 deps-array mentions) — it has zero call sites and is inert; its
  cleanup is a separate patch, NOT this one.
- Do not remove the now-empty `GRANDFATHERED_UI_FILES` array, its comments,
  or the `...GRANDFATHERED_UI_FILES` spread — the shrink-only mechanism
  stays in place, empty (spreading an empty array is a no-op).
- Do not change the config's line endings; the extractor's binary write is
  the only edit.
- Do not alter any runtime statement beyond pair 9's bound adaptation — no
  behavior, auth, or session semantics change anywhere (the `session` state
  remains truthiness-compatible: an `AuthSession` object is truthy exactly
  when the old `Session` object was).
- Do not touch FreeformPadletCards, CanvasModals, OverlayLayer, hooks,
  domain/infra/tests, or docs other than this spec. Do not begin PATCH-062.
