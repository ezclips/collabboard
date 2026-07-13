# PATCH-060 - FreeformPadletCards closeout: orphaned client deleted, grandfather 2 -> 1

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K mechanics; deletions and one established type swap, zero new code).
**Authored:** 2026-07-13. The live tree and the live boundaries config were
read before this ruling; the grandfather retirement was PROVEN by a negative
control at authoring (see section 0.3). The fences and both final hashes below
were reconstructed from the true pre-edit blobs and gate-simulated (tsc,
boundaries with the component LINTED, vitest 252/28) before binding.
Component preserves LF; the boundaries config has MIXED line endings — see
section 0.4 before touching it.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` byte-fenced files.

**Bound commit message:**

```
refactor(canvas): retire FreeformPadletCards grandfather entry -- orphaned supabase client deleted, boundary now enforced (PATCH-060)
```

## 0. CTO ruling

### 0.1 What retires, and why it is mechanical

After PATCH-059 the component's raw-write census is ZERO. Its remaining
supabase surface, read from the live file:

- L6 `import type { User } from '@supabase/supabase-js';` — the ONLY
  `@supabase/*` import (the pattern the boundary rule flags);
- L8 `import { supabaseBrowser } from '@/lib/supabase/browser';` — orphaned
  (its only consumer is the client below);
- L183-185 the two-line comment + `const supabase = React.useMemo(...)` —
  zero code uses since PATCH-059.

The type import cannot be deleted (the `user` prop needs a type) — it is
SWAPPED to the domain `AuthUser` (`@/lib/domain/auth/user`), the exact
PATCH-010 pattern already live in CanvasModals. Every `user` access in this
component (`id`, `email`, `user_metadata.{name,full_name,avatar_url}`) is
covered by `AuthUser`, and assignability at the caller is already PROVEN IN
PRODUCTION: CanvasClient passes the same `user` object into CanvasModals'
`AuthUser | null` prop since PATCH-010. The prop type at L147 swaps with it.
Nothing else changes; all runtime behavior is preserved (deletions of inert
code + a type-only swap).

### 0.2 The two grandfather entries

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` — owned by this
  component; RETIRES in this patch, proven safe (0.3).
- `app/dashboard/canvas/\\[id\\]/CanvasClient.tsx` — INDEPENDENT and MUST
  REMAIN: CanvasClient live-imports `{ User, Session }` from
  `@supabase/supabase-js` (its L75) among its remaining legacy surface. Its
  retirement is its own future closeout. **Grandfather 2 -> 1. This is NOT
  the full program closeout** — no such claim is made while CanvasClient's
  entry stands.

### 0.3 The negative control (bound, run at authoring)

Removing an ignore entry can silently miss (the config's own `[id]`-glob
warning). Proof the retirement actually exposes the file to the rule, run at
authoring with the NEW config: linting the OLD component (which still has the
L6 `@supabase/supabase-js` import) fails with exactly one error
(`no-restricted-imports` at 6:1), and linting the NEW component passes clean.
The reviewer must re-run this control, not just the green path.

### 0.4 The boundaries config has MIXED line endings

`eslint.boundaries.config.mjs` is `i/mixed w/mixed`: most lines CRLF, but the
GRANDFATHERED_UI_FILES block lines (incl. the line this patch deletes) are
LF-only. Consequences, bound:

- ALL hashes for this file in this spec are **`git hash-object --no-filters`**
  hashes (raw bytes). Plain `git hash-object` applies the CRLF->LF clean
  filter and reports a DIFFERENT hash — for reference, plain hash-object
  reads `4c79b5a6d3e853e226887f11a80a41a32aacc335` pre-edit and
  `5c0b5463511bd840d7e810f77003cac30e893ebf` post-edit. Do not mix the two
  instruments.
- The extractor reads and writes this file in BINARY, preserving all 70 CR
  bytes; its no-CR assertions apply to the component only.

### 0.5 Scope

Exactly two implementation paths change:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` (6,355 -> 6,351)
- `eslint.boundaries.config.mjs` (74 -> 73 lines; the shrink-only list
  shrinks)

Do not touch docs (they ride the authoring/review docs commits), any other
config, or any other file. The component remains 6.3k lines — the SIZE
problem is untouched and stays on the books; this closeout retires its
boundary violation only.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-060 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # c6e3b79f6ca75ad16b70277cffc7367ef0ad8f87
git hash-object --no-filters eslint.boundaries.config.mjs # e36913965954dbe1c7567c58adfa9558ee0ca91b
```

MUST-NOT-CHANGE - verify all now and after the final hashes:

```bash
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # f3583e93e0ec3dc575cdaf78cd328645149025a4
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 85232736b2b4f9c982d78575acc5a139a3d473fb
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # 2e158f1278a395b5028083e8f387a22e4daf5b60
git hash-object lib/domain/auth/user.ts # b7883b8b20375663fc87e7bd1fac76d116a87a6c
git hash-object lib/domain/canvas/posts.ts # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/canvas/posts.test.ts # e8c7361ad8072c6e96c15ec39a63190b119d03bb
git hash-object lib/infra/canvas/postsRepository.ts # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/supabase/browser.ts # b42aa22e7921b6aeea02515bc8897a7906bb8caa
```

Use exact code-form instruments, not broad identifier prose matches:

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n "@supabase" "$F" | wc -l # 1 (the L6 type import)
rg -n --fixed-strings "supabaseBrowser" "$F" | wc -l # 3 (import + comment + client)
rg -n --fixed-strings "const supabase = React.useMemo" "$F" | wc -l # 1
rg -n '\bAuthUser\b' "$F" | wc -l # 0
rg -n --fixed-strings "FreeformPadletCards.tsx" eslint.boundaries.config.mjs | wc -l # 1
rg -n --fixed-strings "CanvasClient.tsx" eslint.boundaries.config.mjs | wc -l # 1
wc -l "$F" # 6355
wc -l eslint.boundaries.config.mjs # 74
git ls-files --eol -- "$F" # i/lf w/lf
git ls-files --eol -- eslint.boundaries.config.mjs # i/mixed w/mixed (expected!)
```

## 2. Exact replacement pairs

Component: four pairs (pairs 2 and 3 are pure deletions). Config: one pair
(pure deletion). Every OLD occurs exactly once. Apply in order. No hand edits.

1. The `@supabase/*` type import swaps to the domain type (PATCH-010 pattern):

```ts
import type { User } from '@supabase/supabase-js';
```
->
```ts
import type { AuthUser } from '@/lib/domain/auth/user';
```

2. The orphaned `supabaseBrowser` import is deleted (empty NEW fence):

```ts
import { supabaseBrowser } from '@/lib/supabase/browser';
```
->
```ts
```

3. The orphaned comment + client are deleted (empty NEW fence):

```ts
  // Cookie-authenticated client — see useCanvasData.ts for why this must match
  // supabaseBrowser() rather than the plain lib/supabase.ts singleton.
  const supabase = React.useMemo(() => supabaseBrowser(), []);
```
->
```ts
```

4. The prop type swaps with the import:

```ts
  user: User | null;
```
->
```ts
  user: AuthUser | null;
```

5. The grandfather entry retires (empty NEW fence; the LF-only line inside the mixed-EOL config):

```ts
  'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
```
->
```ts
```

## 3. Mechanical write, true-blob reconstruction, and final hashes

Create `_p060_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the ten TypeScript fences
above, requires each working tree file AND its `HEAD` blob to be the true
bound pre-edit content, reconstructs both final files only from those blobs,
and asserts both final raw hashes before reporting success. The config is
handled in BINARY throughout (mixed EOL — section 0.4); the no-CR assertions
apply to the component only.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def rawhash(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()

spec = open('.fable5/patches/PATCH-060.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 10, f'expected 10 ts fences, got {len(fences)} - STOP'

targets = (
    ('components/collabboard/canvas/ui/FreeformPadletCards.tsx',
     'c6e3b79f6ca75ad16b70277cffc7367ef0ad8f87',
     '3cfda55254a927014a277f5a0af35979c3c33da2',
     fences[0:8], True),
    ('eslint.boundaries.config.mjs',
     'e36913965954dbe1c7567c58adfa9558ee0ca91b',
     '1d82f8937894e07f95cccacdda850b71515a6e99',
     fences[8:10], False),
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

print('CLOSEOUT RECONSTRUCTED FROM TRUE BLOBS AND HASH-VERIFIED')
```

NOTE on deletion fences: pairs 2, 3, and 5 have an EMPTY NEW fence (the OLD
text is deleted). An empty ```ts fence is still a fence; the extractor's
count of 10 includes them.

Final scoped hashes (raw, `--no-filters` for the config):

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 3cfda55254a927014a277f5a0af35979c3c33da2
git hash-object --no-filters eslint.boundaries.config.mjs # 1d82f8937894e07f95cccacdda850b71515a6e99
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n "@supabase" "$F" | wc -l # 0
rg -n --fixed-strings "supabaseBrowser" "$F" | wc -l # 0
rg -n --fixed-strings "const supabase" "$F" | wc -l # 0
rg -n '\bAuthUser\b' "$F" | wc -l # 2 (import + prop)
rg -n --fixed-strings "FreeformPadletCards.tsx" eslint.boundaries.config.mjs | wc -l # 0
rg -n --fixed-strings "CanvasClient.tsx" eslint.boundaries.config.mjs | wc -l # 1 (MUST remain)
wc -l "$F" # 6351
wc -l eslint.boundaries.config.mjs # 73
git ls-files --eol -- "$F" # i/lf w/lf
git diff --name-only # exactly the two implementation paths
npx tsc --noEmit
npm run check:boundaries # the component is now LINTED and must pass clean
npx vitest run # 252 passed (252), 28 files - unchanged
# own server: warm /, /auth, /pricing, /dashboard, and /dashboard/canvas/test
PW_BASE_URL=http://localhost:3000 npx playwright test --list # 27 tests in 18 files
PW_BASE_URL=http://localhost:3000 npx playwright test # 27 passed
# stop the server by PID, then:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

THE NEGATIVE CONTROL (mandatory, after the green run): temporarily restore
the pre-edit component bytes (e.g. from `git show HEAD:$F` BEFORE committing,
or from the parent blob after), run `npm run check:boundaries`, and confirm
it FAILS with exactly one `no-restricted-imports` error at `$F` line 6:1 —
proving the retired entry actually exposes the file to the rule. Then restore
the final bytes and re-confirm the hash `3cfda552...` and a clean boundaries
run. A green gate that cannot fail is not a gate.

Re-run every MUST-NOT-CHANGE hash after the final scoped hashes. Commit only
the two implementation paths with the bound message, using explicit pathspecs.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not remove or alter the CanvasClient grandfather entry, the ignore
  block's other lines, or any rule text in the boundaries config.
- Do not change the config's line endings (no editor auto-format, no
  eol normalization — the extractor's binary write is the only edit).
- Do not touch any `user` usage inside the component beyond the two bound
  type positions (import + prop) — no runtime code changes of any kind.
- Do not delete `lib/supabase/browser.ts` (other consumers remain) or touch
  `lib/domain/auth/user.ts`.
- Do not claim full program closeout — CanvasClient's entry remains; the
  grandfather count is 1, not 0.
- Do not touch CanvasClient, CanvasModals, hooks, domain/infra/tests, or
  docs other than this spec. Do not begin PATCH-061.
