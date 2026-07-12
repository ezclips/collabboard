# PATCH-053 - FreeformPadletCards slice 1: direct image-reaction writes onto `canvas.updatePostFields`

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K consumer-only slice; existing command, repository, and test net).
**Authored:** 2026-07-12. The live tree, actual FreeformPadletCards receivers,
and all direct `padlets` call forms were read before this ruling. The fences and
final hash below were reconstructed from the true pre-edit blob. Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` this byte-fenced file.

**Bound commit message:**

```
refactor(canvas): move FreeformPadletCards image reactions onto canvas.updatePostFields (PATCH-053)
```

## 0. CTO ruling

The live `FreeformPadletCards.tsx` census is 22 direct
`.from('padlets').update(...)` calls, all through its local cookie-authenticated
`supabaseBrowser()` client. Four are the complete direct image-reaction family:

- image-card picker add, then image-card reaction-row removal;
- full-image-toolbar reaction-row removal, then full-image-toolbar picker add.

Each awaits the raw builder inside the existing local `try`/`catch` but never
reads its resolved `{ error }`. Thus a resolved database error historically
continued to its existing state update and/or `fetchData()`, while a rejected
builder entered the exact existing catch with its exact existing message.

`canvas.updatePostFields` already passes arbitrary fields through verbatim and
its existing tests pin both resolved failures and rejected builders. The one
local helper below rethrows only the command's `unknown` cause, returning every
other Result ignored by the existing callbacks. This reproduces both channels:
resolved failures remain ignored and rejected builders still enter the existing
catch. It does not add a toast, rollback, state transition, fetch, or callback
contract.

This is a behavior-preserving extraction only. It makes **no architecture
ruling** about the 18 remaining direct update sites, the local `supabase`
client, or the final FreeformPadletCards closeout.

### 0.1 Explicit deferrals

The two AI resize persistence statements at current lines 3273 and 3692 are
un-awaited query builders. Routing them through an async command would change
their execution semantics, so they are deliberately not folded into this patch.
Their future treatment requires its own behavior ruling.

The remaining 16 direct writes are separate metadata, task, container-cascade,
comment, and caption families. Do not infer a shared contract merely because
they target the same table. The active-card and other non-raw reaction UI paths
already delegate through CanvasClient callback contracts and are outside this
raw-call census.

### 0.2 Scope

Exactly one implementation path changes:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

The component remains grandfathered: this slice reduces direct padlets updates
22 -> 18 but does not retire its local Supabase client or boundary entry. Its
line count is 6,368 -> 6,371. No final closeout is authorized.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-053 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # a405177da01176a260f7ce829f30f04549cf27c8
```

MUST-NOT-CHANGE - verify all now and after the final hash:

```bash
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # f3583e93e0ec3dc575cdaf78cd328645149025a4
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
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 22
rg -n '^\s*await supabase$' "$F" | wc -l # 19
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 0
wc -l "$F" # 6368
git ls-files --eol -- "$F" # i/lf w/lf
```

Collision gate - must be zero before edit:

```bash
rg -n '\bupdatePostFieldsPreservingFailureChannels\b' components/collabboard/canvas/ui/FreeformPadletCards.tsx | wc -l # 0
```

## 2. Exact replacement pairs

Every OLD occurs exactly once except pair 3, which occurs exactly twice. Apply
in order. No hand edits.

1. Domain imports:

```ts
import { supabaseBrowser } from '@/lib/supabase/browser';
```
->
```ts
import { supabaseBrowser } from '@/lib/supabase/browser';
import { createUpdatePostFieldsCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
```

2. Channel-preserving helper, immediately after the local client:

```ts
  const supabase = React.useMemo(() => supabaseBrowser(), []);
```
->
```ts
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  /**
   * PATCH-053: image-reaction writes already ignore a resolved Supabase error
   * but route a rejected builder into their local catch. Preserve both
   * channels while consuming the existing canvas.updatePostFields command.
   */
  const updatePostFieldsPreservingFailureChannels = React.useCallback(async (id: string, fields: object) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
    return result;
  }, []);
```

3. Both image-card reaction writes (picker add and reaction-row remove; exactly
two occurrences):

```ts
                        await supabase
                          .from('padlets')
                          .update({
                            metadata: { ...padlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', padlet.id);
```
->
```ts
                        await updatePostFieldsPreservingFailureChannels(padlet.id, {
                          metadata: { ...padlet.metadata, reactions: newReactions },
                          updated_at: new Date().toISOString(),
                        });
```

4. Full-image-toolbar reaction-row removal:

```ts
                          await supabase
                            .from('padlets')
                            .update({
                              metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                              updated_at: new Date().toISOString(),
                            })
                            .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                          await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                            metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          });
```

5. Full-image-toolbar picker add:

```ts
                        await supabase
                          .from('padlets')
                          .update({
                            metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                        await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                          metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                          updated_at: new Date().toISOString(),
                        });
```

## 3. Mechanical write, true-blob reconstruction, and final hash

Create `_p053_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the ten TypeScript fences
above, requires the working tree and `HEAD` blob to be the true bound pre-edit
content, reconstructs the final file only from that blob, and asserts its final
hash before reporting success.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def command_text(*args):
    return command_bytes(*args).decode('utf-8')

def githash(path):
    return command_text('git', 'hash-object', path).strip()

spec = open('.fable5/patches/PATCH-053.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 10, f'expected 10 ts fences, got {len(fences)} - STOP'

path = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'
pre = 'a405177da01176a260f7ce829f30f04549cf27c8'
post = '7a9fef76c4d74b3757f1197b9774cd55489d1ea2'
assert githash(path) == pre, 'working pre-hash - STOP'
data = command_bytes('git', 'show', f'HEAD:{path}')
assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, 'true pre-edit blob - STOP'
assert b'\r' not in data, 'CRLF pre-edit blob - STOP'
text = data.decode('utf-8')

for pair, expected in enumerate((1, 1, 2, 1, 1)):
    old, new = fences[pair * 2], fences[pair * 2 + 1]
    assert text.count(old) == expected, f'pair {pair + 1} count mismatch - STOP'
    text = text.replace(old, new)

assert b'\r' not in text.encode('utf-8'), 'CRLF final text - STOP'
open(path, 'w', encoding='utf-8', newline='').write(text)
assert githash(path) == post, 'final hash - STOP'
print('FREEFORM REACTION SLICE RECONSTRUCTED FROM TRUE BLOB AND HASH-VERIFIED')
```

Final scoped hash:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7a9fef76c4d74b3757f1197b9774cd55489d1ea2
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 18
rg -n '^\s*await supabase$' "$F" | wc -l # 15
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 4
rg -n '\bupdatePostFieldsPreservingFailureChannels\b' "$F" | wc -l # 5 (helper + 4 calls)
wc -l "$F" # 6371
git ls-files --eol -- "$F" # i/lf w/lf
git diff --name-only -- "$F" # exactly components/collabboard/canvas/ui/FreeformPadletCards.tsx
npx tsc --noEmit
npm run check:boundaries
npx vitest run # 251 passed (251), 28 files - unchanged
# own server: warm /, /auth, /dashboard, and /dashboard/canvas/test
PW_BASE_URL=http://localhost:3000 npx playwright test --list # 27 tests in 18 files
PW_BASE_URL=http://localhost:3000 npx playwright test # 27 passed
# stop the server by PID, then:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

Re-run every MUST-NOT-CHANGE hash after the final scoped hash. Commit only the
one implementation path with the bound message, using its explicit pathspec.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; commit it separately as documentation first.

## 5. Do NOT

- Do not edit any remaining direct `padlets` update, including either AI resize
  builder, or change the local `supabase` client.
- Do not add a command, repository method, test, Result wrapper beyond the one
  local channel-preserving helper, UI change, fallback, toast, rollback, or
  architecture ruling.
- Do not alter the four callbacks' state ordering, `fetchData()` calls, catches,
  or messages. Do not handle a resolved Result in a callback.
- Do not touch CanvasClient, hooks, posts domain/repository/tests, or docs other
  than this spec. Do not begin PATCH-054 or any closeout work.
