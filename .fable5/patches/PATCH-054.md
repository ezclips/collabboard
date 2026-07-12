# PATCH-054 - FreeformPadletCards slice 2: the optimistic child-comments write onto `canvas.updatePostFields`

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K consumer-only slice; existing command, repository, helper, and test
net — this patch adds ZERO new functions of any kind).
**Authored:** 2026-07-13. The live tree, the actual `onUpdateChildComments`
handler, and all 18 remaining direct `padlets` call forms were read before this
ruling. The fences and final hash below were reconstructed from the true
pre-edit blob and gate-simulated (tsc, boundaries, vitest) before binding.
Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` this byte-fenced file.

**Bound commit message:**

```
refactor(canvas): move FreeformPadletCards child-comments write onto canvas.updatePostFields (PATCH-054)
```

## 0. CTO ruling

Of the component's 18 remaining direct `.from('padlets').update(...)` calls,
the **comment family is a single site**: the `onUpdateChildComments` callback
passed to `RowColumnContainerCard` (container-card child comments). It is the
smallest coherent family and it goes next.

Its legacy contract, read directly from the live handler: an optimistic
`setPadlets` runs FIRST (outside the try), then the raw builder is awaited
inside the existing `try` with its resolved `{ error }` never read, and there
is NO `fetchData()` anywhere in the handler. Thus a resolved database error
historically left the optimistic state in place silently (no toast, no
rollback — a pre-existing honesty gap this patch PRESERVES, not fixes), while
a rejected builder entered the exact existing catch (`console.error` +
`toast.error('Failed to update comments')`).

That is byte-for-byte the same failure contract PATCH-053 bound for the four
image-reaction sites, and the helper that carries it —
`updatePostFieldsPreservingFailureChannels`, local to this component since
PATCH-053 — **already exists and is reused verbatim**. This patch therefore
adds no helper, no import, no domain/infra/test surface: it is ONE replacement
pair.

Do NOT confuse this site with CanvasModals' same-named `onUpdateChildComments`
receiver (PATCH-052): that one was check-and-throw and got an OrThrow port.
This one is bare-await and gets the channel-preserving helper. Same UI
concept, different legacy contract — the contract is a fact you read at the
site, not a name you match.

### 0.1 Explicit deferrals

- The two un-awaited AI resize builders (current lines 3282 and 3701) remain
  deliberately untouched; routing them through an async command would change
  their execution semantics and requires its own behavior ruling.
- The task checkbox toggle (current line ~3443) is check-and-throw AND writes
  `content` + `metadata` together — its own future slice.
- The container-drop cascade (current lines ~3605/3613) is two ORDERED awaits
  in one try — its own future slice.
- The 12 uniform style/caption writes (10 toolbar-style + 2 caption commits)
  share this same bare-await contract but are a separate, larger family — not
  folded in merely because the helper fits.

### 0.2 Scope

Exactly one implementation path changes:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

The component remains grandfathered: this slice reduces direct padlets updates
18 -> 17 but does not retire its local Supabase client or boundary entry. Its
line count is 6,371 -> 6,368. No final closeout is authorized.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-054 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7a9fef76c4d74b3757f1197b9774cd55489d1ea2
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
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 18
rg -n '^\s*await supabase$' "$F" | wc -l # 15
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 4
rg -n --fixed-strings ".eq('id', childId)" "$F" | wc -l # 1
rg -n --fixed-strings "childPadlet.metadata, comments" "$F" | wc -l # 1
wc -l "$F" # 6371
git ls-files --eol -- "$F" # i/lf w/lf
```

## 2. Exact replacement pair

Exactly ONE pair; the OLD occurs exactly once. No hand edits, no other change
of any kind — the optimistic `setPadlets` above it and the catch below it are
byte-kept.

1. The child-comments write:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...childPadlet.metadata, comments },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', childId);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(childId, {
                        metadata: { ...childPadlet.metadata, comments },
                        updated_at: new Date().toISOString(),
                      });
```

## 3. Mechanical write, true-blob reconstruction, and final hash

Create `_p054_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the two TypeScript fences
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

spec = open('.fable5/patches/PATCH-054.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 2, f'expected 2 ts fences, got {len(fences)} - STOP'

path = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'
pre = '7a9fef76c4d74b3757f1197b9774cd55489d1ea2'
post = '8c7762092fb8d11f2e125a428647621b604a48a0'
assert githash(path) == pre, 'working pre-hash - STOP'
data = command_bytes('git', 'show', f'HEAD:{path}')
assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, 'true pre-edit blob - STOP'
assert b'\r' not in data, 'CRLF pre-edit blob - STOP'
text = data.decode('utf-8')

old, new = fences
assert text.count(old) == 1, 'pair 1 count mismatch - STOP'
text = text.replace(old, new)

assert b'\r' not in text.encode('utf-8'), 'CRLF final text - STOP'
open(path, 'w', encoding='utf-8', newline='').write(text)
assert githash(path) == post, 'final hash - STOP'
print('CHILD-COMMENTS WRITE RECONSTRUCTED FROM TRUE BLOB AND HASH-VERIFIED')
```

Final scoped hash:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 8c7762092fb8d11f2e125a428647621b604a48a0
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 17
rg -n '^\s*await supabase$' "$F" | wc -l # 14
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 5
rg -n --fixed-strings ".eq('id', childId)" "$F" | wc -l # 0
rg -n --fixed-strings "childPadlet.metadata, comments" "$F" | wc -l # 1
rg -n --fixed-strings "Failed to update child comments:" "$F" | wc -l # 1
rg -n --fixed-strings "toast.error('Failed to update comments')" "$F" | wc -l # 1
wc -l "$F" # 6368
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

Re-run every MUST-NOT-CHANGE hash after the final scoped hash. Commit only the
one implementation path with the bound message, using its explicit pathspec.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not edit any other direct `padlets` update — not the task toggle, not the
  container-drop cascade, not any style/caption write, not either AI resize
  builder — and do not change the local `supabase` client.
- Do not add or modify any helper, import, command, repository method, test,
  toast, rollback, `fetchData()` call, or architecture ruling. The existing
  PATCH-053 helper is reused as-is.
- Do not alter the optimistic `setPadlets`, the catch body, its two messages,
  or the handler's early returns. Do not read or handle the returned Result.
- Do not touch CanvasClient, CanvasModals, hooks, posts domain/repository/
  tests, or docs other than this spec. Do not begin PATCH-055 or any closeout
  work.
