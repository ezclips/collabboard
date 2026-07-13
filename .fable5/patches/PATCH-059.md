# PATCH-059 - P3 BEHAVIOR FIX (owner-authorized): AI-card resize persistence actually executes

**Status:** SPEC READY - implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K mechanics; existing command + repository; ONE new component-local
launcher + ONE new unit test).
**THIS IS NOT A BEHAVIOR-PRESERVING REFACTOR.** It is the owner-authorized
Option A of the PATCH-058 architecture ruling: a deliberate P3 fix. The two
AI-resize statements have NEVER sent a request (proven at PATCH-058:
lazy-thenable source read + instrumented-fetch probe) — after this patch,
AI-card resizes persist for the first time in the product's history.
**Authored:** 2026-07-13. The fences and both final hashes below were
reconstructed from the true pre-edit blobs and gate-simulated (tsc,
boundaries, vitest 252/28) before binding. Preserve LF.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE section 5.11, PATCH-058 (the
ruling this implements), and this spec first. Never `git checkout` or
`git restore` byte-fenced files.

**Bound commit message:**

```
fix(canvas): persist AI-card resize via canvas.updatePostFields -- the legacy statements were inert (PATCH-059, P3 fix per PATCH-058 Option A)
```

## 0. CTO ruling

### 0.1 The behavior change, disclosed

- BEFORE: both resize callbacks end in an inert builder statement; no request
  is ever sent; the resize lives only in local state and reverts on the next
  `fetchData()` or reload.
- AFTER: both callbacks launch a real write through the existing
  `canvas.updatePostFields` command (PATCH-048). Sizes save. This is NEW
  network traffic and NEW persisted data on a path that never had either.

### 0.2 The launcher and its deliberate failure ruling

ONE new component-local launcher `persistPostFieldsBestEffort(id, fields)`:
synchronous signature, launches a `void`'d async IIFE — the pointer/resize
interaction is NEVER blocked (requirement bound). Inside: construct the
command, await it, and on `!result.ok` log
`console.error('Failed to persist AI card resize:', result.error.cause ?? result.error)`.

- **No unhandled rejection is possible, by proof:** `defineCommand`
  (lib/domain/core/command.ts) converts validation failures AND thrown
  exceptions into Results — the awaited command never rejects, so the void'd
  promise cannot reject.
- **Failure behavior, ruled deliberately: console.error only.** No rollback:
  the optimistic local size stays on failure — the card does NOT snap back
  mid-interaction (nothing in the existing UI ever did that, and yanking the
  size back would be a new product behavior). No toast: resize is a
  low-ceremony freeform interaction; every neighboring freeform failure in
  this component logs without toasting. No `fetchData()`: a failed save must
  not force a refresh that visibly reverts the card while the user watches.
  On failure the pre-PATCH-059 behavior simply resumes (size reverts on the
  NEXT natural fetch) — the fix is strictly additive.

### 0.3 Ordering, bound

- Pointer site (`onPointerUp`): guards -> final size computed ->
  `aiResizeRef.current = null` -> persistence LAUNCHED (last statement,
  synchronous return). Local state was already updated during `onPointerMove`.
- Component site (`onResizeEnd`): guard -> persistence LAUNCHED (only
  statement). Local state was already updated by `onResize`.
- In both: state update precedes persistence launch; the launch is the final
  act; nothing runs after it and no callback observes its completion.

### 0.4 Test ruling

One NEW unit test in the existing `canvas.updatePostFields` describe block
pins the exact resize payload shape (`{ width, height, updated_at }` passed
through verbatim, same reference, correct key order) — suite 251 -> 252.
Component-level invocation has NO automated net (no component-render test
infrastructure exists; the e2e characterization suite cannot create
ai-component cards) — DISCLOSED: the two call sites are verified in CTO
review by direct read, per the PATCH-058 precedent of proving call-site
claims by reading them.

### 0.5 Scope and the orphaned client

Exactly two implementation paths change:

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
- `lib/domain/canvas/posts.test.ts` (leaves the MUST-NOT-CHANGE set for this
  patch only, for the one appended test)

After this patch the local `supabase` client has ZERO code uses (definition
and a comment remain). It is deliberately KEPT: no gate in the verify chain
flags it (no `noUnusedLocals`; boundaries checks imports, and the file is
grandfathered), and its removal plus the grandfather 2 -> 1 question belong
to a separate closeout patch after a fresh census, per the owner's
instruction. The raw-write census reaches ZERO (`.from('padlets')` 2 -> 0)
but NO closeout is claimed. Component lines 6,336 -> 6,355 (+19: the launcher
and its ruling comment); test file 1,391 -> 1,408.

## 1. Pre-edit gates - mismatch means STOP

```bash
git status --short # nothing, except this separately authored PATCH-059 spec
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # 7e8c3c26ffc8e50308020470568590e969e50982
git hash-object lib/domain/canvas/posts.test.ts # c4fcd7311644371023f29bb8689d2286e2e73fa1
```

MUST-NOT-CHANGE - verify all now and after the final hashes:

```bash
git hash-object app/dashboard/canvas/[id]/CanvasClient.tsx # f3583e93e0ec3dc575cdaf78cd328645149025a4
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 85232736b2b4f9c982d78575acc5a139a3d473fb
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # 2e158f1278a395b5028083e8f387a22e4daf5b60
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object lib/domain/canvas/posts.ts # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/core/command.ts # 2e034d8d89acdade824c6f62751996961a8837d9
git hash-object lib/infra/canvas/postsRepository.ts # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/infra/canvas/postsRepository.test.ts # 5610072a9f894a0f10a7822a740a920a8b9534a3
```

Use exact code-form instruments, not broad identifier prose matches:

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 2
rg -n '\bpersistPostFieldsBestEffort\b' "$F" | wc -l # 0 (collision gate)
rg -n '\bpersistPostFieldsBestEffort\b' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0 (repo-wide collision gate)
wc -l "$F" # 6336
wc -l lib/domain/canvas/posts.test.ts # 1391
git ls-files --eol -- "$F" lib/domain/canvas/posts.test.ts # both i/lf w/lf
```

## 2. Exact replacement pairs

Component: three pairs, every OLD occurs exactly once, apply in order. Test
file: one pair. No hand edits.

1. The launcher, appended immediately after the PATCH-056 OrThrow helper (anchored on its unique tail):

```ts
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);
```
->
```ts
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);
  /**
   * PATCH-059 (P3 fix, owner-authorized): AI-card resize persistence. The
   * legacy bare builder statements were INERT (PATCH-058 ruling) - this
   * helper is the first code that actually saves the resize. Launched
   * without awaiting so the pointer path never blocks; the command never
   * throws (defineCommand converts every failure into a Result), so the
   * void'd promise cannot reject. Failure behavior, ruled deliberately:
   * console.error only - the optimistic local size stays (no rollback, no
   * toast, no fetch), matching the component's freeform failure posture.
   */
  const persistPostFieldsBestEffort = React.useCallback((id: string, fields: object) => {
    void (async () => {
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields }, { userId: null });
      if (!result.ok) {
        console.error('Failed to persist AI card resize:', result.error.cause ?? result.error);
      }
    })();
  }, []);
```

2. Pointer site (`onPointerUp`) — the launch replaces the inert statement, same position, last statement:

```ts
                  supabase.from('padlets').update({ width: newW, height: newH, updated_at: new Date().toISOString() }).eq('id', padlet.id);
```
->
```ts
                  persistPostFieldsBestEffort(padlet.id, { width: newW, height: newH, updated_at: new Date().toISOString() });
```

3. Component site (`onResizeEnd`) — same shape:

```ts
                          supabase.from('padlets').update({ width: w, height: h, updated_at: new Date().toISOString() }).eq('id', padlet.id);
```
->
```ts
                          persistPostFieldsBestEffort(padlet.id, { width: w, height: h, updated_at: new Date().toISOString() });
```

4. The new unit test, appended inside the `canvas.updatePostFields` describe (anchored on its unique tail):

```ts
    expect(fake.updateFieldsCalls).toHaveLength(0);
  });
});
```
->
```ts
    expect(fake.updateFieldsCalls).toHaveLength(0);
  });

  it('persists the AI-resize payload shape verbatim ({ width, height, updated_at })', async () => {
    // PATCH-059: pins the exact payload shape of the first consumer that
    // ACTUALLY EXECUTES AI-card resize persistence (the legacy statements
    // were inert - the PATCH-058 ruling).
    const fake = createFakeRepository();
    const updatePostFields = createUpdatePostFieldsCommand(fake.repository);
    const fields = { width: 640, height: 480, updated_at: '2026-07-13T00:00:00.000Z' };

    const result = await updatePostFields({ postId: 'post-7', fields }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateFieldsCalls).toHaveLength(1);
    expect(fake.updateFieldsCalls[0].id).toBe('post-7');
    expect(fake.updateFieldsCalls[0].fields).toBe(fields);
    expect(Object.keys(fake.updateFieldsCalls[0].fields)).toEqual(['width', 'height', 'updated_at']);
  });
});
```

## 3. Mechanical write, true-blob reconstruction, and final hashes

Create `_p059_extract.py` from this exact script, run it once, then delete it.
It is the only implementation write step. It reads the eight TypeScript fences
above, requires each working tree file AND its `HEAD` blob to be the true
bound pre-edit content, reconstructs both final files only from those blobs,
and asserts both final hashes before reporting success.

```python
import hashlib, re, subprocess

def command_bytes(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout

def command_text(*args):
    return command_bytes(*args).decode('utf-8')

def githash(path):
    return command_text('git', 'hash-object', path).strip()

spec = open('.fable5/patches/PATCH-059.md', encoding='utf-8', newline='').read()
assert '\r' not in spec, 'CRLF spec - STOP'
ticks = chr(96) * 3
fences = re.findall(ticks + 'ts\\n(.*?)' + ticks, spec, re.DOTALL)
assert len(fences) == 8, f'expected 8 ts fences, got {len(fences)} - STOP'

targets = (
    ('components/collabboard/canvas/ui/FreeformPadletCards.tsx',
     '7e8c3c26ffc8e50308020470568590e969e50982',
     'c6e3b79f6ca75ad16b70277cffc7367ef0ad8f87',
     fences[0:6]),
    ('lib/domain/canvas/posts.test.ts',
     'c4fcd7311644371023f29bb8689d2286e2e73fa1',
     'e8c7361ad8072c6e96c15ec39a63190b119d03bb',
     fences[6:8]),
)

for path, pre, post, pair_fences in targets:
    assert githash(path) == pre, f'{path} working pre-hash - STOP'
    data = command_bytes('git', 'show', f'HEAD:{path}')
    assert hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest() == pre, f'{path} true pre-edit blob - STOP'
    assert b'\r' not in data, f'{path} CRLF pre-edit blob - STOP'
    text = data.decode('utf-8')
    for pair in range(len(pair_fences) // 2):
        old, new = pair_fences[pair * 2], pair_fences[pair * 2 + 1]
        assert text.count(old) == 1, f'{path} pair {pair + 1} count mismatch - STOP'
        text = text.replace(old, new)
    assert b'\r' not in text.encode('utf-8'), f'{path} CRLF final text - STOP'
    open(path, 'w', encoding='utf-8', newline='').write(text)
    assert githash(path) == post, f'{path} final hash - STOP'

print('AI-RESIZE PERSISTENCE FIX RECONSTRUCTED FROM TRUE BLOBS AND HASH-VERIFIED')
```

Final scoped hashes:

```bash
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx # c6e3b79f6ca75ad16b70277cffc7367ef0ad8f87
git hash-object lib/domain/canvas/posts.test.ts # e8c7361ad8072c6e96c15ec39a63190b119d03bb
```

## 4. Post-edit gates

```bash
F=components/collabboard/canvas/ui/FreeformPadletCards.tsx
rg -n --fixed-strings ".from('padlets')" "$F" | wc -l # 0
rg -n '^\s*await supabase$' "$F" | wc -l # 0
rg -n '\bpersistPostFieldsBestEffort\(' "$F" | wc -l # 2 (the two launch sites)
rg -n '\bpersistPostFieldsBestEffort\b' "$F" | wc -l # 3 (definition + 2 launches)
rg -n --fixed-strings "Failed to persist AI card resize:" "$F" | wc -l # 1
rg -n '\bupdatePostFieldsPreservingFailureChannels\(' "$F" | wc -l # 19 (unchanged)
rg -n '\bupdatePostFieldsOrThrow\(' "$F" | wc -l # 1 (unchanged)
rg -n --fixed-strings "aiResizeRef.current = null;" "$F" | wc -l # 2 (unchanged: onPointerUp + onPointerCancel)
wc -l "$F" # 6355
wc -l lib/domain/canvas/posts.test.ts # 1408
git ls-files --eol -- "$F" lib/domain/canvas/posts.test.ts # both i/lf w/lf
git diff --name-only # exactly the two implementation paths
npx tsc --noEmit
npm run check:boundaries
npx vitest run # 252 passed (252), 28 files - ONE NEW TEST
# own server: warm /, /auth, /pricing, /dashboard, and /dashboard/canvas/test
PW_BASE_URL=http://localhost:3000 npx playwright test --list # 27 tests in 18 files
PW_BASE_URL=http://localhost:3000 npx playwright test # 27 passed
# stop the server by PID, then:
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count" # 0
rm -rf .next && npm run verify
```

The component now contains ZERO direct `padlets` builders. The local
`supabase` client remains, deliberately orphaned (see section 0.5) — do NOT
remove it, its import, or the grandfather entry in this patch.

Re-run every MUST-NOT-CHANGE hash after the final scoped hashes. Commit only
the two implementation paths with the bound message, using explicit pathspecs.
If this spec is pre-existing or untracked, do not add it to the implementation
commit; it is committed separately as documentation already.

## 5. Do NOT

- Do not await the launcher at either call site, wrap either callback in
  async/await changes, or otherwise block the pointer/resize path.
- Do not add `.catch(...)` to the void'd IIFE (the command provably never
  rejects), a toast, a rollback, a `fetchData()`, a retry, or any state
  update to the launcher or either call site.
- Do not reuse `updatePostFieldsPreservingFailureChannels` or
  `updatePostFieldsOrThrow` for these sites — both rethrow 'unknown'
  failures, which inside a void'd launch would CREATE the unhandled
  rejection this spec forbids. Do not modify either existing helper.
- Do not remove the local `supabase` client, its `supabaseBrowser` import,
  or the grandfather entry — closeout is a separate owner-gated patch.
- Do not touch CanvasClient, CanvasModals, hooks, posts.ts,
  postsRepository.ts, postsRepository.test.ts, command.ts, or docs other
  than this spec. Do not begin PATCH-060 or any closeout work.
