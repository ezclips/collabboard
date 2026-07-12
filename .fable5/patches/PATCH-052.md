# PATCH-052 — hooks slice 15: delete `postsRaw.ts` — final `updatePadletById` family onto the existing `canvas.updatePostFields` command

**Status:** SPEC READY — implement exactly as bound. **Implementer:** GPT-5.4
acceptable (Pattern K; existing command/repository/test surface only).
**Authored:** 2026-07-12. The live docs, PATCH-048 through PATCH-051, current
review state, JSX receiver, consumer census, fences, and hashes were read and
re-derived from the current tree. Preserve LF bytes exactly.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE §5.11, and this spec in full.
Never use `git checkout` or `git restore` on byte-fenced files.

**Bound commit message:**

```
refactor(canvas): delete postsRaw via canvas.updatePostFields -- final update family, seven CanvasClient sites plus CanvasModals prop and two receivers onto three failure-contract helpers, hooks slice 15, Pattern K (PATCH-052)
```

## 0. CTO ruling — one final coherent slice; no split

`updatePostRowById` is the sole remaining `postsRaw.ts` export. Its one hook
passthrough, `updatePadletById`, reaches exactly nine callers:

| Contract | Consumers | Exact port |
|---|---:|---|
| Bare await: resolved `{ error }` ignored; a rejected builder reaches the enclosing catch (or escapes) | six CanvasClient calls: draft-container metadata, duplicate section batch, synced-copy link, section insertion loop, detach-container leg, detach-child leg | `updatePostFieldsSwallowResolved` — rethrow only `unknown`; deliberately ignore every other Result |
| Check-and-throw: both raw channels converge in an existing catch | CanvasModals prop receiver: reorder-children and update-child-comments | `updatePostFieldsOrThrow` — throw `cause ?? error` for every failed Result; CanvasModals keeps its prop name, messages, catches, rollback/fetch order, and all other props |
| Resolved error triggers local rollback/message; raw rejected builder escapes uncaught | CanvasClient map-pin JSX `onUpdatePostLocation` | `updatePostFieldsPreservingFailureChannels` — rethrow only `unknown`; return every other Result to the existing failure branch |

This is the smallest coherent Pattern-K-safe final-export slice. All calls use
the existing dynamic-field command `createUpdatePostFieldsCommand` (PATCH-048),
whose `fields: object` contract exactly matches the raw `.update(fields)`
passthrough. No domain, repository, test, or UI surface is added. The module
has no remaining reason to exist and is deleted.

### 0.1 Direct JSX receiver verification — binding, not inherited prose

The receiver is the live `<CanvasModals>` element in CanvasClient, which passes
`updatePadletById={...}`. `CanvasModalsProps` types that prop, the component
destructures it, and its two direct raw consumers were read at the source:

- reorder: optimistic local `childPadletIds`, then `console.error('Failed to
  reorder children:', err)` and `fetchData()` rollback;
- comments: optimistic local comments, then `console.error('Failed to update
  child comments:', err)` and exact toast `Failed to update comments`.

The JSX attribute and prop identifier deliberately remain `updatePadletById`;
only the supplied function becomes the check-and-throw helper and the two
receivers stop destructuring a raw result. This preserves the component's prop
contract and the original error object entering each existing catch.

`FreeformPadletCards.tsx` has zero `postsRaw`, `updatePadletById`, and
`updatePostRowById` references. It remains last and is MUST-NOT-CHANGE.

### 0.2 Failure-channel rulings

`createUpdatePostFieldsCommand` maps a resolved Supabase `{ error }` to a
non-`unknown` Result and a rejected builder to `code === 'unknown'` with the
original cause. Therefore:

- The six bare-await calls must not gain a rollback, toast, catch, or throw on
  a resolved error. `updatePostFieldsSwallowResolved` ignores that Result and
  rethrows only an `unknown` cause, preserving existing Promise.all ordering,
  loop ordering, and the two detach writes' partial-failure behavior.
- The two CanvasModals calls previously checked `error` and threw it into their
  existing catches. `updatePostFieldsOrThrow` throws the same cause for both
  Result channels before those catches run. No message or fallback changes.
- The map callback previously handled only a resolved `error`: it showed
  `Failed to update map location` and called `fetchData()`. A rejected builder
  had no enclosing catch. The channel-preserving helper returns resolved
  failures and rethrows only `unknown`, so both paths remain distinct.

Validation failure is unreachable: every live `fields` argument is an object.
If one were introduced later, it throws the DomainError through the same path
as the check-and-throw helper; that is not an authorization to broaden inputs.

### 0.3 Scope and disclosures

Exactly four implementation paths:

- `components/collabboard/canvas/hooks/useCanvasData.ts`
- `app/dashboard/canvas/[id]/CanvasClient.tsx`
- `components/collabboard/canvas/ui/CanvasModals.tsx`
- delete `lib/infra/supabase/postsRaw.ts`

CanvasClient remains 8,375 lines. Hook 717→744 (<800). CanvasModals 476→474.
No new swallow site: the six existing caller-level resolved swallows are
preserved; command-internal swallow accounting is unchanged. `postsRaw.ts`
dies entirely. Do not touch FreeformPadletCards, posts domain/repository/tests,
realtime, lines, sections, graph, auth, or PATCH-053.

## 1. Pre-edit gates — mismatch means STOP

```bash
git status --short # nothing after the separately committed PATCH-052 spec
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # e71c80863996a0988ba400ab0c309149a706d817
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx" # 44679d8ca5746ad9ac782bc81f27723c316ee35c
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 3e1b2d0ae867a617c740a0c6c92d422b6aad55f7
git hash-object lib/infra/supabase/postsRaw.ts # e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17
```

MUST-NOT-CHANGE — verify all now and after final hashes:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # a405177da01176a260f7ce829f30f04549cf27c8
git hash-object lib/domain/canvas/posts.ts # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/canvas/posts.test.ts # c4fcd7311644371023f29bb8689d2286e2e73fa1
git hash-object lib/infra/canvas/postsRepository.ts # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/infra/canvas/postsRepository.test.ts # 5610072a9f894a0f10a7822a740a920a8b9534a3
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts # 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object lib/infra/canvas/canvasViewReads.ts # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object lib/domain/canvas/sections.ts # 762c367186716749af21cfd3e9abf79cdafb74c0
git hash-object lib/infra/canvas/sectionsRepository.ts # 229655bd828a4b85aa85205e50c9bf6db56a8d85
git hash-object lib/domain/canvas/lines.ts # 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
git hash-object lib/infra/canvas/linesRepository.ts # 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
git hash-object lib/domain/core/command.ts # 2e034d8d89acdade824c6f62751996961a8837d9
git hash-object lib/graph/graphRepo.ts # bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac
git hash-object components/graph/FreeformGraphLayer.tsx # b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0
```

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
rg -n '\bupdatePadletById\b' "$C" | wc -l # 9 (destructure + 7 calls + JSX prop)
rg -n 'updatePadletById\(' "$C" | wc -l # 7
wc -l "$C" # 8375
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c 'updatePostRowById' "$H" # 2
grep -c 'updatePadletById' "$H" # 2
grep -c 'createUpdatePostFieldsCommand' "$H" # 2
grep -c "code === 'unknown'" "$H" # 3
wc -l "$H" # 717
grep -c 'updatePadletById' components/collabboard/canvas/ui/CanvasModals.tsx # 4
grep -c 'updatePadletById(' components/collabboard/canvas/ui/CanvasModals.tsx # 2
rg -n 'updatePostRowById\(' lib components app -g '*.ts' -g '*.tsx' | wc -l # 2 (definition + hook call)
rg -n 'postsRaw' lib components app -g '*.ts' -g '*.tsx' | wc -l # 2 (hook import + raw path in import)
```

Collision gate — each must be zero before edit:

```bash
rg -n '\bupdatePostFieldsSwallowResolved\b|\bupdatePostFieldsOrThrow\b|\bupdatePostFieldsPreservingFailureChannels\b' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0
```

## 2. Exact replacement pairs

Pairs 1–3 apply to the hook, pairs 4–12 to CanvasClient, and pairs 13–14 to
CanvasModals. Every OLD occurs exactly once. Apply in order; no hand edits.

1. Hook raw import:

```ts
import {
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
```
→
```ts
```

2. Hook passthrough:

```ts
  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await updatePostRowById(id, updates);
  }, []);
```
→
```ts
  /**
   * PATCH-052: the final postsRaw update family splits three pre-existing
   * failure contracts. The six bare-await CanvasClient calls ignored a
   * resolved `{ error }` while a rejected builder escaped; preserve that
   * shape here. The two CanvasModals calls already check-and-throw, and the
   * map callback keeps its local resolved-error rollback below.
   */
  const updatePostFieldsSwallowResolved = useCallback(async (id: string, fields: any) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
  }, []);

  const updatePostFieldsOrThrow = useCallback(async (id: string, fields: any) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);

  const updatePostFieldsPreservingFailureChannels = useCallback(async (id: string, fields: any) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
    return result;
  }, []);
```

3. Hook return:

```ts
    updatePadletById,
    deletePostSwallowResolved,
```
→
```ts
    updatePostFieldsSwallowResolved,
    updatePostFieldsOrThrow,
    updatePostFieldsPreservingFailureChannels,
    deletePostSwallowResolved,
```

4. CanvasClient destructure:

```ts
    insertPostOrThrow, insertPostPreservingFailureChannels, insertPostAndSelectOrThrow, updatePadletById, deletePostSwallowResolved, deletePostOrThrow,
```
→
```ts
    insertPostOrThrow, insertPostPreservingFailureChannels, insertPostAndSelectOrThrow, updatePostFieldsSwallowResolved, updatePostFieldsOrThrow, updatePostFieldsPreservingFailureChannels, deletePostSwallowResolved, deletePostOrThrow,
```

5. Draft-container metadata write:

```ts
        await updatePadletById(containerId, {
          metadata: {
            ...(container.metadata as any),
            childPadletIds: [...currentChildren, created.id],
          },
        });
```
→
```ts
        await updatePostFieldsSwallowResolved(containerId, {
          metadata: {
            ...(container.metadata as any),
            childPadletIds: [...currentChildren, created.id],
          },
        });
```

6. Duplicate section batch:

```ts
            updatePadletById(u.id, {
```
→
```ts
            updatePostFieldsSwallowResolved(u.id, {
```

7. Synced-copy link:

```ts
        await updatePadletById(id, { metadata: updatedOriginalMeta });
```
→
```ts
        await updatePostFieldsSwallowResolved(id, { metadata: updatedOriginalMeta });
```

8. Section insertion loop:

```ts
        await updatePadletById(update.id, { metadata: update.metadata });
```
→
```ts
        await updatePostFieldsSwallowResolved(update.id, { metadata: update.metadata });
```

9. Detach container leg:

```ts
      await updatePadletById(containerId, {
        metadata: { ...container.metadata, childPadletIds: newChildIds },
        updated_at: new Date().toISOString(),
      });
```
→
```ts
      await updatePostFieldsSwallowResolved(containerId, {
        metadata: { ...container.metadata, childPadletIds: newChildIds },
        updated_at: new Date().toISOString(),
      });
```

10. Detach child leg:

```ts
      await updatePadletById(childId, {
```
→
```ts
      await updatePostFieldsSwallowResolved(childId, {
```

11. Map location failure split:

```ts
                    const { error } = await updatePadletById(postId, {
                      title: nextTitle,
                      metadata: nextMetadata,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: label ?? null,
                      updated_at: new Date().toISOString(),
                    } as any);

                    if (error) {
```
→
```ts
                    const updateResult = await updatePostFieldsPreservingFailureChannels(postId, {
                      title: nextTitle,
                      metadata: nextMetadata,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: label ?? null,
                      updated_at: new Date().toISOString(),
                    } as any);

                    if (!updateResult.ok) {
```

12. CanvasModals prop:

```ts
          updatePadletById={updatePadletById}
```
→
```ts
          updatePadletById={updatePostFieldsOrThrow}
```

13. CanvasModals reorder receiver:

```ts
                const { error } = await updatePadletById(liveContainer.id, {
                  metadata: nextMeta,
                  updated_at: new Date().toISOString(),
                });
                if (error) throw error;
```
→
```ts
                await updatePadletById(liveContainer.id, {
                  metadata: nextMeta,
                  updated_at: new Date().toISOString(),
                });
```

14. CanvasModals comments receiver:

```ts
                const { error } = await updatePadletById(childId, {
                  metadata: { ...childPadlet.metadata, comments },
                  updated_at: new Date().toISOString(),
                });
                if (error) throw error;
```
→
```ts
                await updatePadletById(childId, {
                  metadata: { ...childPadlet.metadata, comments },
                  updated_at: new Date().toISOString(),
                });
```

## 3. Mechanical write, true-blob reconstruction, and final hashes

Create `_p052_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the 28 TypeScript fences
above, requires the current files and their `HEAD` blobs to be the true bound
pre-edit content, reconstructs all three final files from those true blobs,
deletes the raw module, and asserts every final hash before reporting success.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def command_text(*args):
    return command_bytes(*args).decode('utf-8')

def githash(path):
    return command_text('git', 'hash-object', path).strip()

spec = open('.fable5/patches/PATCH-052.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 28, f'expected 28 ts fences, got {len(fences)} - STOP'

targets = [
  ('components/collabboard/canvas/hooks/useCanvasData.ts', 'e71c80863996a0988ba400ab0c309149a706d817', '2e158f1278a395b5028083e8f387a22e4daf5b60', 3),
  ('app/dashboard/canvas/[id]/CanvasClient.tsx', '44679d8ca5746ad9ac782bc81f27723c316ee35c', 'f3583e93e0ec3dc575cdaf78cd328645149025a4', 9),
  ('components/collabboard/canvas/ui/CanvasModals.tsx', '3e1b2d0ae867a617c740a0c6c92d422b6aad55f7', '85232736b2b4f9c982d78575acc5a139a3d473fb', 2),
]
pair = 0
for path, pre, post, count in targets:
    assert githash(path) == pre, f'{path} working pre-hash - STOP'
    data = command_bytes('git', 'show', f'HEAD:{path}')
    assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, f'{path} true pre-edit blob - STOP'
    assert b'\r' not in data, f'{path} CRLF pre-edit blob - STOP'
    text = data.decode('utf-8')
    for _ in range(count):
        old, new = fences[pair * 2], fences[pair * 2 + 1]
        assert text.count(old) == 1, f'pair {pair + 1} count mismatch - STOP'
        text = text.replace(old, new)
        pair += 1
    open(path, 'w', encoding='utf-8', newline='').write(text)
    assert githash(path) == post, f'{path} final hash - STOP'

assert pair == 14
raw = 'lib/infra/supabase/postsRaw.ts'
assert githash(raw) == 'e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17', 'raw pre-hash - STOP'
raw_data = command_bytes('git', 'show', f'HEAD:{raw}')
assert hashlib.sha1(b'blob %d\0' % len(raw_data) + raw_data).hexdigest() == 'e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17', 'raw true pre-edit blob - STOP'
assert b'\r' not in raw_data, 'raw CRLF pre-edit blob - STOP'
subprocess.run(['git', 'rm', '--', raw], check=True)
assert not __import__('os').path.exists(raw), 'raw deletion - STOP'
print('ALL THREE BOUND FILES RECONSTRUCTED FROM TRUE BLOBS; POSTSRAW DELETED')
```

Final scoped hashes:

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # 2e158f1278a395b5028083e8f387a22e4daf5b60
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx" # f3583e93e0ec3dc575cdaf78cd328645149025a4
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 85232736b2b4f9c982d78575acc5a139a3d473fb
test ! -e lib/infra/supabase/postsRaw.ts
```

## 4. Post-edit gates

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
rg -n '\bupdatePadletById\b' "$C" | wc -l # 1 (CanvasModals prop identifier only)
rg -n 'updatePadletById\(' "$C" | wc -l # 0
grep -c 'updatePostFieldsSwallowResolved' "$C" # 7 (destructure + 6 calls)
grep -c 'updatePostFieldsOrThrow' "$C" # 2 (destructure + prop)
grep -c 'updatePostFieldsPreservingFailureChannels' "$C" # 2 (destructure + map call)
wc -l "$C" # 8375
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c 'updatePostRowById' "$H" # 0
grep -c 'updatePadletById' "$H" # 0
grep -c 'updatePostFieldsSwallowResolved' "$H" # 2
grep -c 'updatePostFieldsOrThrow' "$H" # 2
grep -c 'updatePostFieldsPreservingFailureChannels' "$H" # 2
grep -c 'createUpdatePostFieldsCommand' "$H" # 5
grep -c "code === 'unknown'" "$H" # 5
wc -l "$H" # 744
M=components/collabboard/canvas/ui/CanvasModals.tsx
grep -c 'updatePadletById' "$M" # 4 (prop type + destructure + 2 calls)
grep -c 'const { error } = await updatePadletById' "$M" # 0
wc -l "$M" # 474
test ! -e lib/infra/supabase/postsRaw.ts
rg -n 'updatePostRowById\(' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0
rg -n 'postsRaw' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0
rg -n 'updatePadletById\(' lib components app -g '*.ts' -g '*.tsx' | wc -l # 2 (CanvasModals receivers only)
git status --short -- "app/dashboard/canvas/[id]/CanvasClient.tsx" components/collabboard/canvas/hooks/useCanvasData.ts components/collabboard/canvas/ui/CanvasModals.tsx lib/infra/supabase/postsRaw.ts # exactly 4 implementation paths
npx tsc --noEmit
npm run check:boundaries
npx vitest run # 251 passed, 28 files
# own server: warm /, /auth, /dashboard; Playwright 27 passed; then stop it
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

Re-run every MUST-NOT-CHANGE hash after the three final hashes. Confirm LF-only
bytes with `git ls-files --eol` for the three edited paths; confirm the deleted
path is absent. Commit only the four implementation paths using explicit
pathspecs. If this spec is pre-existing/untracked, do not add it to the
implementation commit; commit it separately as documentation first, as PATCH-051
required after its scope-gate amendment.

## 5. Do NOT

- Do not add commands, repository methods, tests, Result wrappers, UI changes,
  fallback changes, or an authorized behavior change.
- Do not catch the map callback's `unknown` failure, turn the six bare awaits
  into check-and-throw calls, or change Promise.all / loop / detach ordering.
- Do not rename the CanvasModals JSX prop, alter either CanvasModals message,
  rollback/fetch action, or optimistic update.
- Do not touch FreeformPadletCards or begin PATCH-053.
