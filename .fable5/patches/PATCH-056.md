# PATCH-056 - FreeformPadletCards slice 4: the check-and-throw task toggle onto `canvas.updatePostFields`

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K consumer-only slice; existing command, repository, and test net —
ONE new component-local helper carrying an already-catalogued contract, zero
new imports).
**Authored:** 2026-07-13. All five remaining direct `padlets` sites were read
in full context before this ruling; the repository's resolved-error mapping
(`domainError('unavailable', ..., { cause: error })`) was read directly to
prove thrown-error identity. The fences and final hash below were
reconstructed from the true pre-edit blob and gate-simulated (tsc, boundaries,
vitest) before binding. Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` this byte-fenced file.

**Bound commit message:**

```
refactor(canvas): move FreeformPadletCards task toggle onto canvas.updatePostFields (PATCH-056)
```

## 0. CTO ruling

Of the five remaining direct `.from('padlets').update(...)` calls, the task
family is a single, fully self-contained site: the task-checkbox `onChange`
in the todo-card preview. It has NO coupling to the container-drop cascade
(a different handler on a different prop, ~150 lines away, sharing no local
state) — verified by reading both sites in full, so it goes next, alone.

Its legacy contract is check-and-throw, NOT the bare-await contract of
slices 1-3: `const { error } = await <builder>; if (error) throw error;
fetchData();` inside a try whose catch is a single
`console.error('Failed to toggle task:', err)`. BOTH legacy channels
converge into that catch — a resolved `{ error }` is thrown AT THE SITE
(skipping `fetchData()`), and a rejected builder lands there directly. The
existing channel-preserving helper (PATCH-053) must therefore NOT be used:
it deliberately swallows resolved non-'unknown' failures, which would
change this site's behavior (a resolved error would silently continue).

Instead, ONE new component-local helper `updatePostFieldsOrThrow` carries
the established OrThrow port (the PATCH-050/051/052 check-and-throw class):
ANY `!result.ok` rethrows `result.error.cause ?? result.error`. Thrown-error
IDENTITY is preserved on both channels, proven by direct read of the
repository: a resolved Supabase error is mapped to
`domainError('unavailable', ..., { cause: error })`, so the rethrown `cause`
IS the same raw error object the legacy `if (error) throw error` threw; a
rejected builder's rejection reason travels as the command's 'unknown'
cause. Success still falls through to the byte-kept
`fetchData(); // Refresh to get updated data` line.

The helper name deliberately matches the hook's `updatePostFieldsOrThrow`
(PATCH-052) — the same contract gets the same name everywhere it appears.
They are different, file-local functions; FreeformPadletCards imports
nothing from the hook, and the collision gate below is file-scoped.

The payload (`content: JSON.stringify(updatedTasks)` + `metadata:
updatedMetadata` + `updated_at`) passes through `canvas.updatePostFields`
VERBATIM (the bound pass-through contract since PATCH-048) — this site is
the component's only `content`-writing direct update, and the payload is
byte-kept inside the new call. No callback signature, state effect,
ordering, or message changes.

### 0.1 Explicit deferrals

- The two un-awaited AI resize builders (current lines 3264 and 3680) remain
  deliberately untouched; routing them through an async command would change
  their execution semantics and requires its own behavior ruling.
- The container-drop cascade (current lines ~3586/3594) is two ORDERED awaits
  in one try — its own future slice. No coupling to this site exists.

### 0.2 Scope

Exactly one implementation path changes:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

The component remains grandfathered: this slice reduces direct padlets updates
5 -> 4 but does not retire its local Supabase client or boundary entry. Its
line count is 6,332 -> 6,342 (+10: the new helper adds 14 lines, the call
site loses 4). No final closeout is authorized.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-056 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # e0f6920c37bf48c71884c7c481dc16d2027094da
```

MUST-NOT-CHANGE - verify all now and after the final hash:

```bash
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # f3583e93e0ec3dc575cdaf78cd328645149025a4
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 85232736b2b4f9c982d78575acc5a139a3d473fb
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # 2e158f1278a395b5028083e8f387a22e4daf5b60
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object lib/domain/canvas/posts.ts # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/canvas/posts.test.ts # c4fcd7311644371023f29bb8689d2286e2e73fa1
git hash-object lib/infra/canvas/postsRepository.ts # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/infra/canvas/postsRepository.test.ts # 5610072a9f894a0f10a7822a740a920a8b9534a3
```

Use exact code-form instruments, not broad identifier prose matches:

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 5
rg -n '^\s*await supabase$' "$F" | wc -l # 2
rg -n --fixed-strings "const { error } = await supabase" "$F" | wc -l # 1
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 17
wc -l "$F" # 6332
git ls-files --eol -- "$F" # i/lf w/lf
```

Collision gate - must be zero in THIS FILE before edit (the hook's own
`updatePostFieldsOrThrow` from PATCH-052 lives in useCanvasData.ts and is
NOT imported here; repo-wide matches of that name are expected and fine):

```bash
rg -n '\bupdatePostFieldsOrThrow\b' components/collabboard/canvas/ui/FreeformPadletCards.tsx | wc -l # 0
```

## 2. Exact replacement pairs

Two pairs; every OLD occurs exactly once. Apply in order. No hand edits.

1. The new component-local OrThrow helper, appended immediately after the existing PATCH-053 helper:

```ts
    return result;
  }, []);
```
->
```ts
    return result;
  }, []);
  /**
   * PATCH-056: the task toggle is check-and-throw - BOTH legacy channels
   * (the resolved { error } thrown at the site, the rejected builder)
   * already converge into its existing catch, so ANY command failure
   * rethrows the original cause (a resolved failure's cause is the raw
   * Supabase error object the legacy site threw).
   */
  const updatePostFieldsOrThrow = React.useCallback(async (id: string, fields: object) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);
```

2. The task-toggle write (check-and-throw collapses into the helper; the site-thrown `if (error) throw error;` line dies with it):

```ts
                            const { error } = await supabase
                              .from('padlets')
                              .update({
                                content: JSON.stringify(updatedTasks),
                                metadata: updatedMetadata,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', padlet.id);
                            if (error) throw error;
```
->
```ts
                            await updatePostFieldsOrThrow(padlet.id, {
                              content: JSON.stringify(updatedTasks),
                              metadata: updatedMetadata,
                              updated_at: new Date().toISOString(),
                            });
```

## 3. Mechanical write, true-blob reconstruction, and final hash

Create `_p056_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the four TypeScript fences
above, requires the working tree AND the `HEAD` blob to be the true bound
pre-edit content, reconstructs the final file only from that blob, and asserts
its final hash before reporting success.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def command_text(*args):
    return command_bytes(*args).decode('utf-8')

def githash(path):
    return command_text('git', 'hash-object', path).strip()

spec = open('.fable5/patches/PATCH-056.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 4, f'expected 4 ts fences, got {len(fences)} - STOP'

path = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'
pre = 'e0f6920c37bf48c71884c7c481dc16d2027094da'
post = '7a92a629fd4ec34d957e40ee0a518b0e5a1f9cbe'
assert githash(path) == pre, 'working pre-hash - STOP'
data = command_bytes('git', 'show', f'HEAD:{path}')
assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, 'true pre-edit blob - STOP'
assert b'\r' not in data, 'CRLF pre-edit blob - STOP'
text = data.decode('utf-8')

for pair, expected in enumerate((1, 1)):
    old, new = fences[pair * 2], fences[pair * 2 + 1]
    assert text.count(old) == expected, f'pair {pair + 1} count mismatch - STOP'
    text = text.replace(old, new)

assert b'\r' not in text.encode('utf-8'), 'CRLF final text - STOP'
open(path, 'w', encoding='utf-8', newline='').write(text)
assert githash(path) == post, 'final hash - STOP'
print('TASK TOGGLE RECONSTRUCTED FROM TRUE BLOB AND HASH-VERIFIED')
```

Final scoped hash:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7a92a629fd4ec34d957e40ee0a518b0e5a1f9cbe
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 4
rg -n '^\s*await supabase$' "$F" | wc -l # 2
rg -n --fixed-strings "const { error } = await supabase" "$F" | wc -l # 0
rg -n '\bupdatePostFieldsOrThrow\(' "$F" | wc -l # 1
rg -n '\bupdatePostFieldsOrThrow\b' "$F" | wc -l # 2 (helper + 1 call)
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 17
rg -n --fixed-strings "fetchData(); // Refresh to get updated data" "$F" | wc -l # 1
rg -n --fixed-strings "Failed to toggle task:" "$F" | wc -l # 1
rg -n --fixed-strings "fetchData();" "$F" | wc -l # 18
wc -l "$F" # 6342
git ls-files --eol -- "$F" # i/lf w/lf
git diff --name-only -- "$F" # exactly components/collabboard/canvas/ui/FreeformPadletCards.tsx
npx tsc --noEmit
npm run check:boundaries
npx vitest run # 251 passed (251), 28 files - unchanged
# own server: warm /, /auth, /pricing, /dashboard, and /dashboard/canvas/test
PW_BASE_URL=http://localhost:3000 npx playwright test --list # 27 tests in 18 files
PW_BASE_URL=http://localhost:3000 npx playwright test # 27 passed
# stop the server by PID, then:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

The four surviving `.from('padlets')` sites after this patch are exactly:
both un-awaited AI resize builders and both container-drop cascade writes.
The two surviving `await supabase` lines are the cascade pair. Anything else
surviving means STOP.

Re-run every MUST-NOT-CHANGE hash after the final scoped hash. Commit only the
one implementation path with the bound message, using its explicit pathspec.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not edit either container-drop cascade write, either AI resize builder,
  or the local `supabase` client.
- Do not use `updatePostFieldsPreservingFailureChannels` at this site — its
  resolved-error swallow is the WRONG contract here and would silently change
  behavior. Do not modify that existing helper.
- Do not add any import (both `create*` imports already exist since
  PATCH-053), command, repository method, test, toast, rollback, or
  architecture ruling beyond the one bound helper.
- Do not alter the optimistic-free ordering (this site has NO optimistic
  update), the catch body, its message, the success-path
  `fetchData(); // Refresh to get updated data` line (byte-kept including
  the comment), the payload fields, or the callback signature.
- Do not touch CanvasClient, CanvasModals, hooks, posts domain/repository/
  tests, or docs other than this spec. Do not begin PATCH-057 or any closeout
  work.
