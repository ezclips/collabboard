# PATCH-051 — hooks slice 14: postsRaw's THIRD export death — `insertPadlet` onto `canvas.createPost`

**Status:** SPEC READY — implement exactly. **Implementer:** GPT-5.4 acceptable
(Pattern K; existing command only, no new domain/infra/test surface).
**Authored:** 2026-07-12 at `ff74d52`. The live docs and current tree were
read before this ruling. Censuses were regenerated; the fences and final hashes
below were self-verified by reconstruction from true pre-edit blobs. Preserve LF.
**Amended:** 2026-07-12 after implementation hold. The implementation already
reached every scoped final hash and passed the full verification chain; this
amendment narrows two gates only: the implementation-status check now uses
explicit pathspecs so the known pre-existing untracked spec artifact does not
block the code commit, and the retired-identifier census now uses an exact
identifier instrument that excludes unrelated suffix identifiers such as
`insertPadletEmbeddable`.

Read `.fable5/docs/SKILL.md`, PATCH_REFERENCE §5.11, and this spec first.
Never `git checkout`/`git restore` a byte-fenced file.

**Bound commit message:**

```
refactor(canvas): retire insertPostRow via canvas.createPost -- postsRaw's third export death, eight CanvasClient insert sites onto two hook failure-contract helpers, CanvasClient 8379->8375, hooks slice 14, Pattern K (PATCH-051)
```

## 0. CTO ruling

`insertPostRow` → `insertPadlet` has 8 direct CanvasClient calls. The only
other raw family, `updatePostRowById` → `updatePadletById`, has 7 CanvasClient
calls plus the `<CanvasModals>` prop and two direct CanvasModals raw receivers.
The insert family is the smallest coherent Pattern-K-safe slice and is
PATCH-051; no split and no PATCH-052.

Direct JSX verification is binding: CanvasClient passes
`updatePadletById={updatePadletById}` to `<CanvasModals>`, not
FreeformPadletCards. CanvasModals types/destructures it and has raw `{ error }`
calls at L281 (reorder → console + fetch rollback) and L312 (comments →
console + toast). CanvasClient update consumers at L649, L3352, L3551, L3985,
L4166/L4171, and L7036 remain raw. FreeformPadletCards has zero postsRaw,
insertPadlet, or updatePadletById references and remains LAST.

Six insert statements already check a resolved `error` and throw into the same
catch a raw rejection reaches: prompt container, positioned container,
draft-to-container, note/section add, and the ordered drawing container+child
pair. `insertPostOrThrow` must rethrow `cause ?? error`; every catch, rollback,
toast, and drawing ordering remains unchanged.

The freeform empty-column and map-pin JSX callbacks are distinct: a resolved
raw error enters a local rollback branch, while a rejected builder promise
escapes. `insertPostPreservingFailureChannels` must return all non-`unknown`
Results to those branches and rethrow only `unknown`'s original cause. Thus no
resolved error becomes thrown and no rejection becomes caught. All live inputs
are objects; unreachable validation follows the helper's declared contract.

Scope: only useCanvasData, postsRaw, CanvasClient. Do not touch update,
CanvasModals, FreeformPadletCards, posts domain/repository/tests, realtime,
lines, sections, graph, or auth. Disclosures: CanvasClient 8379→8375 and
`insertPadlet` 11→0; hook 691→717 (<800); postsRaw 39→29, exports 2→1;
hook `createCreatePostCommand` 3→5 and `code === 'unknown'` 2→3.

## 1. Pre-edit gates

```bash
git status --short # nothing
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # f2ed7b23975269156fee6ef5c9ec00d07c50d1d9
git hash-object lib/infra/supabase/postsRaw.ts # 60c645d7351d074916f5352238a7e67684a46ec6
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx" # e1be95f00d2fafcae7e37b89729cf98e1f4bd187
git hash-object components/collabboard/canvas/ui/CanvasModals.tsx # 3e1b2d0ae867a617c740a0c6c92d422b6aad55f7
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
C="app/dashboard/canvas/[id]/CanvasClient.tsx"; grep -c "insertPadlet" "$C" # 11
grep -c "updatePadletById" "$C" # 9
grep -c "if (error) throw error;" "$C" # 2
wc -l "$C" # 8379
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "insertPostRow" "$H" # 2
grep -c "insertPadlet" "$H" # 2
grep -c "createCreatePostCommand" "$H" # 3
grep -c "code === 'unknown'" "$H" # 2
wc -l "$H" # 691
grep -c "export function" lib/infra/supabase/postsRaw.ts # 2
grep -c "updatePadletById" components/collabboard/canvas/ui/CanvasModals.tsx # 4
```

## 2. Bound postsRaw file (exact, 29 lines; `e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17`)

```ts
import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-042: narrow raw-passthrough wrappers for the canvas hook's legacy
 * padlets-table operations. All calls run on the STANDARD cookie/browser
 * client - the same client-component singleton the hook previously used (the
 * PATCH-025 identity fact).
 *
 * DELIBERATE house-style exception (same ruling as workspaceMembers.ts /
 * legacyToken.ts / passwordSecurity.ts): this returns a RAW supabase shape,
 * not Result - its remaining CanvasClient and CanvasModals consumers keep
 * their `{ data, error }` contracts until their own slices. Fields pass
 * through verbatim - the table is the shape's only validator, exactly as
 * before (the PATCH-029 insert fact, extended to the dynamic update).
 *
 * SHRINK-ONLY: do not add consumers beyond useCanvasData.ts. Each function
 * dies when its CanvasClient consumers are extracted onto canvas commands -
 * lib/domain/canvas/posts.ts remains the ONLY surface for new callers.
 * PATCH-049: deletePostRowById retired - the module's first export death.
 * PATCH-050: insertPostRowReturning retired - the second export death.
 * PATCH-051: insertPostRow retired - the third export death.
 */

export function updatePostRowById(id: string, fields: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .update(fields)
        .eq('id', id);
}
```

## 3. Exact replacement pairs

Pairs 1–3 apply to the hook and pairs 4–11 to CanvasClient. Every OLD occurs
once except pair 5, which occurs exactly twice. Apply in order; no hand edits.

1. Hook raw import:

```ts
  insertPostRow,
  updatePostRowById,
```
→
```ts
  updatePostRowById,
```

2. Hook raw passthrough:

```ts
  const insertPadlet = useCallback(async (payload: any) => {
    return await insertPostRow(payload);
  }, []);

```
→
```ts
  /**
   * PATCH-051: the eight standalone insert sites split by their pre-existing
   * failure contracts. Six check-and-throw callers plus the paired drawing
   * insert already converge both raw failure channels in their catches;
   * rethrow the original cause. The two resolved-error branches use the
   * channel-preserving sibling below.
   */
  const insertPostOrThrow = useCallback(async (row: any) => {
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);

  /**
   * The freeform-column and map-pin inserts distinguish raw channels: their
   * resolved `{ error }` branch performs local rollback, while a thrown
   * builder rejection escapes. Preserve that split: only `unknown` rethrows
   * its original cause; every other Result returns to its existing branch.
   */
  const insertPostPreservingFailureChannels = useCallback(async (row: any) => {
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
    return result;
  }, []);

```

3. Hook return:

```ts
    insertPadlet,
    insertPostAndSelectOrThrow,
```
→
```ts
    insertPostOrThrow,
    insertPostPreservingFailureChannels,
    insertPostAndSelectOrThrow,
```

4. CanvasClient destructure:

```ts
    insertPadlet, insertPostAndSelectOrThrow, updatePadletById, deletePostSwallowResolved, deletePostOrThrow,
```
→
```ts
    insertPostOrThrow, insertPostPreservingFailureChannels, insertPostAndSelectOrThrow, updatePadletById, deletePostSwallowResolved, deletePostOrThrow,
```

5. Both convergent empty-container sites (exactly 2):

```ts
      const { error } = await insertPadlet(newContainer);
      if (error) throw error;
```
→
```ts
      await insertPostOrThrow(newContainer);
```

6. Draft-to-container:

```ts
      const { error: postError } = await insertPadlet(newPost);
      if (postError) throw postError;
```
→
```ts
      await insertPostOrThrow(newPost);
```

7. Freeform resolved-error branch:

```ts
    const { error } = await insertPadlet(containerPayload as any);
    if (error) {
```
→
```ts
    const insertResult = await insertPostPreservingFailureChannels(containerPayload as any);
    if (!insertResult.ok) {
      const error = insertResult.error.cause ?? insertResult.error;
```

8. Freeform dependencies:

```ts
  }, [canvasId, isFreeformLayout, canvasZoom, insertPadlet, fetchData]);
```
→
```ts
  }, [canvasId, isFreeformLayout, canvasZoom, insertPostPreservingFailureChannels, fetchData]);
```

9. Note/section insert:

```ts
      const { error: insertError } = await insertPadlet(newPadlet);
      if (insertError) throw insertError;
```
→
```ts
      await insertPostOrThrow(newPadlet);
```

10. Ordered drawing pair:

```ts
      const { error: containerError } = await insertPadlet(containerPadlet);
      if (containerError) throw containerError;
      const { error: childError } = await insertPadlet(childPadlet);
      if (childError) throw childError;
```
→
```ts
      await insertPostOrThrow(containerPadlet);
      await insertPostOrThrow(childPadlet);
```

11. Drawing dependencies:

```ts
  }, [canvasId, drawingPendingDraft, insertPadlet, padlets]);
```
→
```ts
  }, [canvasId, drawingPendingDraft, insertPostOrThrow, padlets]);
```

12. Map-pin resolved-error branch:

```ts
                    const { error: containerError } = await insertPadlet({
                      ...newPost,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: locationText,
                    } as any);

                    if (containerError) {
```
→
```ts
                    const insertResult = await insertPostPreservingFailureChannels({
                      ...newPost,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: locationText,
                    } as any);

                    if (!insertResult.ok) {
                      const containerError = insertResult.error.cause ?? insertResult.error;
```

## 4. Mechanical write and final proof

Use an LF-only Python extractor as the sole write step. It must read these 25
TypeScript fences from this live spec (one whole raw file plus 12 OLD/NEW
pairs), assert pair 5 occurs twice and all others once, and reconstruct from
the true pre-edit blobs. It must assert these final hashes before it reports
success:

Save this exact script as `_p051_extract.py`, run `python3 _p051_extract.py`,
then delete it. It is the only implementation write step.

```python
import hashlib, re, subprocess

def githash(path):
    return subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()

def blob(text):
    data = text.encode("utf-8")
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-051.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, "CRLF spec - STOP"
ticks = chr(96) * 3
fences = re.findall(ticks + "ts\\n(.*?)" + ticks, spec, re.DOTALL)
assert len(fences) == 25, f"expected 25 ts fences, got {len(fences)} - STOP"

raw = "lib/infra/supabase/postsRaw.ts"
assert githash(raw) == "60c645d7351d074916f5352238a7e67684a46ec6", "raw pre-hash - STOP"
assert blob(fences[0]) == "e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17", "raw fence hash - STOP"
open(raw, "w", encoding="utf-8", newline="").write(fences[0])
assert githash(raw) == "e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17", "raw post-hash - STOP"

targets = [
  ("components/collabboard/canvas/hooks/useCanvasData.ts", "f2ed7b23975269156fee6ef5c9ec00d07c50d1d9", "e71c80863996a0988ba400ab0c309149a706d817", 3),
  ("app/dashboard/canvas/[id]/CanvasClient.tsx", "e1be95f00d2fafcae7e37b89729cf98e1f4bd187", "44679d8ca5746ad9ac782bc81f27723c316ee35c", 9),
]
pair = 0
for path, pre, post, count in targets:
    assert githash(path) == pre, f"{path} pre-hash - STOP"
    text = open(path, encoding="utf-8", newline="").read()
    assert "\r" not in text, f"{path} CRLF-smudged - STOP"
    for _ in range(count):
        old, new = fences[1 + pair * 2], fences[2 + pair * 2]
        want = 2 if pair == 4 else 1
        assert text.count(old) == want, f"pair {pair + 1} count mismatch - STOP"
        text = text.replace(old, new)
        pair += 1
    open(path, "w", encoding="utf-8", newline="").write(text)
    assert githash(path) == post, f"{path} post-hash - STOP"
assert pair == 12
print("ALL THREE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

```bash
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts # e71c80863996a0988ba400ab0c309149a706d817
git hash-object lib/infra/supabase/postsRaw.ts # e17342b1840c6f9ff7dc5ff8dac9e5e6293f7e17
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx" # 44679d8ca5746ad9ac782bc81f27723c316ee35c
```

Delete the extractor before scope checks. A fence-count, pre-hash, OLD-count,
and final-hash mismatch is a STOP, not an invitation to hand-edit.

## 5. Post-edit gates

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "insertPadlet" "$C" # 0
grep -c "insertPostOrThrow" "$C" # 8
grep -c "insertPostPreservingFailureChannels" "$C" # 4
grep -c "updatePadletById" "$C" # 9
grep -c "if (error) throw error;" "$C" # 0
grep -c "supabase" "$C" # 27
wc -l "$C" # 8375
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "insertPostRow" "$H" # 0
grep -c "insertPadlet" "$H" # 0
grep -c "insertPostOrThrow" "$H" # 2
grep -c "insertPostPreservingFailureChannels" "$H" # 2
grep -c "createCreatePostCommand" "$H" # 5
grep -c "code === 'unknown'" "$H" # 3
wc -l "$H" # 717
grep -c "export function" lib/infra/supabase/postsRaw.ts # 1
rg -n '\binsertPostRow\b' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0
rg -n '\binsertPadlet\b' lib components app -g '*.ts' -g '*.tsx' | wc -l # 0
git status --short -- "app/dashboard/canvas/[id]/CanvasClient.tsx" components/collabboard/canvas/hooks/useCanvasData.ts lib/infra/supabase/postsRaw.ts # exactly 3 implementation paths before implementation commit
git status --short -- .fable5/patches/PATCH-051.md # accepted known pre-existing spec artifact outside the implementation commit
npx tsc --noEmit
npm run check:boundaries
npx vitest run # 251 passed (251), 28 files
# own server; warm /, /auth, /dashboard; Playwright: 27 passed; stop it
rm -rf .next && npm run verify
```

Re-run all §1 MUST-NOT-CHANGE hashes after the final hashes. Commit only the
three implementation files with the bound message, using explicit pathspecs,
and do not add the spec artifact to that implementation commit. The spec file
may be committed separately as docs history.

## 6. Do NOT

- Do not touch updatePadletById, CanvasModals, its prop, or FreeformPadletCards.
- Do not add commands, repository methods, tests, UI behavior, or an authorized
  behavior change.
- Do not turn the two channel-discriminating callbacks into catch-based flows,
  or reorder the drawing pair / note update loop.
- Do not hand-edit CanvasClient, read `.env.local`, or draft PATCH-052.
