# PATCH-055 - FreeformPadletCards slice 3: the 12 uniform style/caption writes onto `canvas.updatePostFields`

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K consumer-only slice; existing command, repository, helper, and test
net — this patch adds ZERO new functions of any kind).
**Authored:** 2026-07-13. The live tree and every one of the 17 remaining
direct `padlets` call forms were read before this ruling; the 12 sites below
were verified byte-uniform programmatically (nothing between `try {` and the
await, `fetchData();` as the only other statement in the try, a
single-`console.error` catch). The fences and final hash below were
reconstructed from the true pre-edit blob and gate-simulated (tsc, boundaries,
vitest) before binding. Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, and this spec
first. Never `git checkout` or `git restore` this byte-fenced file.

**Bound commit message:**

```
refactor(canvas): move FreeformPadletCards style/caption writes onto canvas.updatePostFields (PATCH-055)
```

## 0. CTO ruling

The 12 style/caption writes are ONE uniform failure-contract family — verified
by reading every site, not assumed from the family name. All 12 share the
exact shape: `try {` immediately followed by the bare-awaited raw builder
(resolved `{ error }` never read), then `fetchData();`, then a catch whose
only statement is a site-specific `console.error`. Thus at every site a
resolved database error historically continued to `fetchData()` while a
rejected builder entered the exact existing catch with its exact existing
message. That is the same contract PATCH-053 bound for the image reactions
and PATCH-054 bound for the child-comments write, so the component-local
helper `updatePostFieldsPreservingFailureChannels` (PATCH-053) is **reused
verbatim** — no new helper, no new import, no domain/infra/test surface.

The 12 sites are the five image-card style callbacks (`onCardColor`,
`onTopStrip`, `onCaptionTextColor`, `onSelectColor`, `onSelectHighlight`),
the image-card caption `onCommit`, their five full-image-toolbar mirrors, and
the toolbar caption `onCommit`. Two toolbar blocks (`onCaptionTextColor` and
`onSelectColor`) are byte-identical, so the recipe is 11 distinct pairs with
pair 9 applying exactly twice — 12 call sites total.

Every catch message, every `fetchData()` placement, and every payload is
byte-kept. No callback signature, state update, toast, rollback, or ordering
changes. This is a behavior-preserving extraction only; it makes **no
architecture ruling** about the remaining sites or the final
FreeformPadletCards closeout.

### 0.1 Explicit deferrals

- The two un-awaited AI resize builders (current lines 3282 and 3698) remain
  deliberately untouched; routing them through an async command would change
  their execution semantics and requires its own behavior ruling.
- The task checkbox toggle (current line ~3443) is check-and-throw AND writes
  `content` + `metadata` together — its own future slice.
- The container-drop cascade (current lines ~3605/3613) is two ORDERED awaits
  in one try — its own future slice.

### 0.2 Scope

Exactly one implementation path changes:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`

The component remains grandfathered: this slice reduces direct padlets updates
17 -> 5 (the largest single reduction of the component's strangling) but does
not retire its local Supabase client or boundary entry. Its line count is
6,368 -> 6,332. No final closeout is authorized.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-055 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 8c7762092fb8d11f2e125a428647621b604a48a0
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
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 17
rg -n '^\s*await supabase$' "$F" | wc -l # 14
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 5
rg -n --fixed-strings "fetchData();" "$F" | wc -l # 18
wc -l "$F" # 6368
git ls-files --eol -- "$F" # i/lf w/lf
```

## 2. Exact replacement pairs

Eleven pairs; every OLD occurs exactly once except pair 9, which occurs
exactly twice (12 call sites total). Apply in order. No hand edits.

1. Image-card `onCardColor`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...padlet.metadata, cardColor: color },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...padlet.metadata, cardColor: color },
                        updated_at: new Date().toISOString(),
                      });
```

2. Image-card `onTopStrip`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...(padlet.metadata || {}), topStrip: color },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...(padlet.metadata || {}), topStrip: color },
                        updated_at: new Date().toISOString(),
                      });
```

3. Image-card `onCaptionTextColor`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...padlet.metadata, captionStyle: { ...padlet.metadata?.captionStyle, color } },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...padlet.metadata, captionStyle: { ...padlet.metadata?.captionStyle, color } },
                        updated_at: new Date().toISOString(),
                      });
```

4. Image-card `onSelectColor`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...padlet.metadata,
                            captionStyle: { ...padlet.metadata?.captionStyle, color }
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: {
                          ...padlet.metadata,
                          captionStyle: { ...padlet.metadata?.captionStyle, color }
                        },
                        updated_at: new Date().toISOString(),
                      });
```

5. Image-card `onSelectHighlight`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...padlet.metadata,
                            captionStyle: { ...padlet.metadata?.captionStyle, backgroundColor: highlight }
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: {
                          ...padlet.metadata,
                          captionStyle: { ...padlet.metadata?.captionStyle, backgroundColor: highlight }
                        },
                        updated_at: new Date().toISOString(),
                      });
```

6. Image-card caption `onCommit`:

```ts
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...padlet.metadata, caption: editingCaption },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', padlet.id);
```
->
```ts
                    await updatePostFieldsPreservingFailureChannels(padlet.id, {
                      metadata: { ...padlet.metadata, caption: editingCaption },
                      updated_at: new Date().toISOString(),
                    });
```

7. Full-image-toolbar `onCardColor`:

```ts
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...activeImageToolbarPadlet.metadata, cardColor: color },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: { ...activeImageToolbarPadlet.metadata, cardColor: color },
                      updated_at: new Date().toISOString(),
                    });
```

8. Full-image-toolbar `onTopStrip`:

```ts
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...(activeImageToolbarPadlet.metadata || {}), topStrip: color },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: { ...(activeImageToolbarPadlet.metadata || {}), topStrip: color },
                      updated_at: new Date().toISOString(),
                    });
```

9. Full-image-toolbar `onCaptionTextColor` AND `onSelectColor` (byte-identical blocks; exactly two occurrences):

```ts
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: {
                          ...activeImageToolbarPadlet.metadata,
                          captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: {
                        ...activeImageToolbarPadlet.metadata,
                        captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                      },
                      updated_at: new Date().toISOString(),
                    });
```

10. Full-image-toolbar `onSelectHighlight`:

```ts
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: {
                          ...activeImageToolbarPadlet.metadata,
                          captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, backgroundColor: highlight }
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: {
                        ...activeImageToolbarPadlet.metadata,
                        captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, backgroundColor: highlight }
                      },
                      updated_at: new Date().toISOString(),
                    });
```

11. Full-image-toolbar caption `onCommit`:

```ts
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...activeImageToolbarPadlet.metadata, caption: editingCaption },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', activeImageToolbarPadlet.id);
```
->
```ts
                      await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                        metadata: { ...activeImageToolbarPadlet.metadata, caption: editingCaption },
                        updated_at: new Date().toISOString(),
                      });
```

## 3. Mechanical write, true-blob reconstruction, and final hash

Create `_p055_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the 22 TypeScript fences
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

spec = open('.fable5/patches/PATCH-055.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 22, f'expected 22 ts fences, got {len(fences)} - STOP'

path = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'
pre = '8c7762092fb8d11f2e125a428647621b604a48a0'
post = 'e0f6920c37bf48c71884c7c481dc16d2027094da'
assert githash(path) == pre, 'working pre-hash - STOP'
data = command_bytes('git', 'show', f'HEAD:{path}')
assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, 'true pre-edit blob - STOP'
assert b'\r' not in data, 'CRLF pre-edit blob - STOP'
text = data.decode('utf-8')

for pair, expected in enumerate((1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1)):
    old, new = fences[pair * 2], fences[pair * 2 + 1]
    assert text.count(old) == expected, f'pair {pair + 1} count mismatch - STOP'
    text = text.replace(old, new)

assert b'\r' not in text.encode('utf-8'), 'CRLF final text - STOP'
open(path, 'w', encoding='utf-8', newline='').write(text)
assert githash(path) == post, 'final hash - STOP'
print('STYLE/CAPTION FAMILY RECONSTRUCTED FROM TRUE BLOB AND HASH-VERIFIED')
```

Final scoped hash:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # e0f6920c37bf48c71884c7c481dc16d2027094da
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 5
rg -n '^\s*await supabase$' "$F" | wc -l # 2
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 17
rg -n --fixed-strings "fetchData();" "$F" | wc -l # 18
rg -n --fixed-strings "Failed to update card color:" "$F" | wc -l # 2
rg -n --fixed-strings "Failed to update top strip:" "$F" | wc -l # 2
rg -n --fixed-strings "Failed to update caption text color:" "$F" | wc -l # 2
rg -n --fixed-strings "Failed to update caption color:" "$F" | wc -l # 2
rg -n --fixed-strings "Failed to update caption highlight:" "$F" | wc -l # 2
rg -n --fixed-strings "Save failed on commit:" "$F" | wc -l # 2
wc -l "$F" # 6332
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

The five surviving `.from('padlets')` sites after this patch are exactly: the
task toggle (post-edit line 3425), both container-drop cascade writes
(post-edit lines 3587/3595), and both un-awaited AI resize builders
(post-edit lines 3264/3680). The two surviving `await supabase` lines are the
cascade pair (post-edit lines 3586/3594). Anything else surviving means STOP.

Re-run every MUST-NOT-CHANGE hash after the final scoped hash. Commit only the
one implementation path with the bound message, using its explicit pathspec.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not edit the task toggle, either container-drop cascade write, either AI
  resize builder, or the local `supabase` client.
- Do not add or modify any helper, import, command, repository method, test,
  toast, rollback, or architecture ruling. The existing PATCH-053 helper is
  reused as-is.
- Do not alter any catch body, any of the six distinct catch messages, any
  `fetchData()` call, any payload, or any callback signature. Do not read or
  handle the returned Result at any of the 12 sites.
- Do not touch CanvasClient, CanvasModals, hooks, posts domain/repository/
  tests, or docs other than this spec. Do not begin PATCH-056 or any closeout
  work.
