# PATCH-057 - FreeformPadletCards slice 5: the ordered container-drop cascade onto `canvas.updatePostFields`

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K consumer-only slice; existing command, repository, helper, and test
net — this patch adds ZERO new functions of any kind).
**Authored:** 2026-07-13. The full `onDropExistingPadlet` handler was read
before this ruling and its partial-failure contract derived channel by
channel. The fence and final hash below were reconstructed from the true
pre-edit blob and gate-simulated (tsc, boundaries, vitest) before binding.
Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` this byte-fenced file.

**Bound commit message:**

```
refactor(canvas): move FreeformPadletCards container-drop cascade onto canvas.updatePostFields (PATCH-057)
```

## 0. CTO ruling

The two cascade writes are ONE inseparable ordered family: both live inside a
single `try` in a single handler (`onDropExistingPadlet`), the second is
meaningless without the first, and they share the one catch. They go
together, in one patch, as one fence.

The legacy partial-failure contract, derived by direct read:

- ORDERING: container write (childPadletIds) -> `droppedPadlet` lookup ->
  child write (parentId) -> `fetchData()`, strictly sequential.
- Write 1 RESOLVES with an error: `{ error }` is never read, so execution
  CONTINUES — write 2 still runs and `fetchData()` still runs. (A
  pre-existing partial-failure honesty gap: the child can gain `parentId`
  while the container never recorded it. PRESERVED, not fixed.)
- Write 1 REJECTS: the catch runs (`'Failed to add padlet to container:'`),
  write 2 does NOT run, no `fetchData()`.
- Write 2 RESOLVES with an error: ignored — `fetchData()` still runs. (The
  mirror gap: the container lists a child that lacks `parentId`. PRESERVED.)
- Write 2 REJECTS: the catch runs, no `fetchData()`.
- No rollback, no state update, no toast anywhere in the handler; the two
  early returns above the try are byte-kept.

Each write individually is therefore EXACTLY the PATCH-053 contract (resolved
error ignored and execution continues; rejected builder enters the existing
catch), so the existing component-local helper
`updatePostFieldsPreservingFailureChannels` is **reused verbatim** — resolved
failures come back as an unread Result and execution continues to the next
statement, exactly as the bare awaits behaved; only an 'unknown' (rejected
builder) rethrows into the catch. The ordering is preserved by binding BOTH
sequential awaits and the intermediate `droppedPadlet` lookup in ONE fence:
the recipe cannot reorder, merge, or parallelize the writes without failing
its own count gate. No `Promise.all`, no batching, no transaction — the
legacy statement sent two separate sequential requests and still does.

### 0.1 Explicit deferrals

The two un-awaited AI resize builders (current lines 3278 and 3690) remain
deliberately untouched — after this patch they are the component's ONLY
remaining direct writes. Routing a fire-and-forget builder through an async
command would change its execution semantics; their retirement requires its
own behavior ruling. No closeout of the component is authorized or implied.

### 0.2 Scope

Exactly one implementation path changes:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

The component remains grandfathered: this slice reduces direct padlets updates
4 -> 2 and retires the component's LAST awaited raw builders (the bare
`await supabase` form goes extinct in this file), but its local Supabase
client and boundary entry remain for the AI-resize pair. Its line count is
6,342 -> 6,336. No final closeout is authorized.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-057 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7a92a629fd4ec34d957e40ee0a518b0e5a1f9cbe
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
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 4
rg -n '^\s*await supabase$' "$F" | wc -l # 2
rg -n --fixed-strings ".eq('id', containerId)" "$F" | wc -l # 1
rg -n --fixed-strings ".eq('id', droppedId)" "$F" | wc -l # 1
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 17
wc -l "$F" # 6342
git ls-files --eol -- "$F" # i/lf w/lf
```

## 2. Exact replacement pair

Exactly ONE pair spanning BOTH writes and the intermediate lookup — the
ordering is part of the bound bytes. The OLD occurs exactly once. No hand
edits; the early returns, `fetchData();`, and the catch below are byte-kept.

1. Both ordered cascade writes and the intermediate lookup, as one span:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...containerPadlet.metadata, childPadletIds: newChildIds },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', containerId);
                      const droppedPadlet = padlets.find(p => p.id === droppedId);
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...droppedPadlet?.metadata, parentId: containerId },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', droppedId);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(containerId, {
                        metadata: { ...containerPadlet.metadata, childPadletIds: newChildIds },
                        updated_at: new Date().toISOString(),
                      });
                      const droppedPadlet = padlets.find(p => p.id === droppedId);
                      await updatePostFieldsPreservingFailureChannels(droppedId, {
                        metadata: { ...droppedPadlet?.metadata, parentId: containerId },
                        updated_at: new Date().toISOString(),
                      });
```

## 3. Mechanical write, true-blob reconstruction, and final hash

Create `_p057_extract.py` from this exact script, run it once, then delete it.
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

spec = open('.fable5/patches/PATCH-057.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 2, f'expected 2 ts fences, got {len(fences)} - STOP'

path = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'
pre = '7a92a629fd4ec34d957e40ee0a518b0e5a1f9cbe'
post = '7e8c3c26ffc8e50308020470568590e969e50982'
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
print('CONTAINER-DROP CASCADE RECONSTRUCTED FROM TRUE BLOB AND HASH-VERIFIED')
```

Final scoped hash:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7e8c3c26ffc8e50308020470568590e969e50982
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 2
rg -n '^\s*await supabase$' "$F" | wc -l # 0
rg -n --fixed-strings ".eq('id', containerId)" "$F" | wc -l # 0
rg -n --fixed-strings ".eq('id', droppedId)" "$F" | wc -l # 0
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 19
rg -n --fixed-strings "const droppedPadlet = padlets.find(p => p.id === droppedId);" "$F" | wc -l # 1
rg -n --fixed-strings "Failed to add padlet to container:" "$F" | wc -l # 1
rg -n --fixed-strings "fetchData();" "$F" | wc -l # 18
wc -l "$F" # 6336
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

The two surviving `.from('padlets')` sites after this patch are exactly the
two un-awaited AI resize builders (single-line statements, no `await`).
Anything else surviving — including any surviving multi-line raw builder —
means STOP.

Re-run every MUST-NOT-CHANGE hash after the final scoped hash. Commit only the
one implementation path with the bound message, using its explicit pathspec.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not edit either AI resize builder or the local `supabase` client.
- Do not reorder, merge, parallelize (`Promise.all`), batch, or wrap the two
  cascade writes in any transaction-like construct — the bound fence keeps
  them as two sequential awaits with the `droppedPadlet` lookup between them.
- Do not add error handling between the writes: a resolved failure of the
  FIRST write must still allow the SECOND write and `fetchData()` to run,
  exactly as the legacy bare awaits behaved.
- Do not add any helper, import, command, repository method, test, toast,
  rollback, or architecture ruling. The existing PATCH-053 helper is reused
  as-is at both call sites.
- Do not alter the two early returns, the catch body, its message, the
  `fetchData();` placement, either payload, or the callback signature. Do not
  read or handle either returned Result.
- Do not touch CanvasClient, CanvasModals, hooks, posts domain/repository/
  tests, or docs other than this spec. Do not begin PATCH-058 or any closeout
  work.
