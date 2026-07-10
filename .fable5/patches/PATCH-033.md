# PATCH-033 — CanvasClient strangler group 8: ten JSX padlets UPDATE sites onto the existing command quartet (honest/best-effort per legacy contract)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, ninth application — the first ONE-FILE patch; see §0.3)
**Pattern:** K — canvas ops command consumer swaps (§5.11); ZERO domain changes, ZERO test changes, ZERO new commands, ZERO import changes
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` — **EIGHT bound blocks covering TEN sites. ONE file. Nothing else.** The domain/test/infra files are byte-untouched and hash-gated as such.
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `f290a47`; all swap shapes compiled (`tsc --strict`) against the LIVE domain module; the existing 45-test posts suite (the fidelity net — all four commands already pinned) re-run GREEN at authoring; all eight blocks applied to a scratch copy and every gate below measured on that simulation, including the bound post-edit hash.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. This patch adds NO
> tests because the four commands it consumes are already fully pinned by
> `lib/domain/canvas/posts.test.ts` (45 tests) — which is exactly why the
> file must stay byte-untouched (§3.0 hash gate).

---

## 0. CTO rulings

### 0.1 Site analysis: all 14 JSX UPDATE sites, split by the 031/032 contract discipline

| Site (at `f290a47`) | Handler | Shape | Legacy contract | Ruling |
|---|---|---|---|---|
| L6046 | freeform detach — container leg | `{ metadata, updated_at }` | bare await in try → console.error catch | **§4b** BestEffort |
| L6551 | `onUpdateChildComments` (columns) | `{ metadata, updated_at }` | check-and-branch + `return` | **§4c** honest (§0.2) |
| L6638 | `onUpdateChildComments` (grid) | same | same | **§4d** honest (§0.2) |
| L6723 | `onUpdateChildComments` (wall) | same (byte-twin of columns) | same | **§4c** honest (§0.2) |
| L6827+L6835 | `onDropExistingPadlet` (timeline), two writes | `{ metadata, updated_at }` ×2 | bare-await PAIR in one try (thrown on first aborts second) → console.error + fetchData | **§4e** BestEffort ×2 |
| L6863 | `onUpdateChildComments` (timeline) | `{ metadata, updated_at }` | bare await in try → console.error + fetchData | **§4f** BestEffort |
| L7370 | drawing save | `{ metadata, updated_at }` | bare await in try → console.error catch | **§4g** BestEffort |
| L7431 | crop save | `{ metadata, updated_at }` | bare await in try → console.error catch | **§4h** BestEffort |
| L7758 | `onUpdateChildComments` (RowColumnContainerCard) | `{ metadata, updated_at }` | bare await in try → console.error + fetchData | **§4i** BestEffort |
| L6015 | freeform detach — padlet leg | metadata + **position_x/position_y** + updated_at | bare await | **DEFERRED** — no position-capable command exists; needs its own seam design |
| L6476 | canvas drop repositioning | **position_x/position_y** only (no metadata) | check-and-branch + rollback | **DEFERRED** — same position family |
| L7005 | `onUpdateChildComments` (map) | metadata + **conditional `content`** + shared `nowIso`; paired with the lone SELECT | throw-into-catch | **DEFERRED** — content-column write + read phase (owner excluded the select) |
| L7627 | `onSelectClipart` title clear | **`{ title: '' }`** (title column) | bare await, NO try/catch | **DEFERRED** — title-column write, no fitting command |

The slice: TEN sites whose shape is EXACTLY `{ metadata, updated_at }` —
every one lands on an already-tested command with its legacy error
contract preserved by construction. The four deferred sites all write
NON-metadata columns (position ×2, content, title) and are named here so
no future patch "discovers" them; they need one or two new commands
(a position write, a content-carrying metadata write) designed on their
own evidence. All swaps are handler-internal statements — ZERO JSX
structure churn (the owner's condition for this patch existing).

### 0.2 The check-and-branch triplet: 032 Ruling-2 EXTENDED (authorized)

The three `onUpdateChildComments` variants at L6551/L6638/L6723 are the
same check-and-branch contract PATCH-032 repaired at `changeCardColor`/
`pinPost`, and this patch extends that authorization to them under the
identical criteria, verified per-site:

- **Resolved-error mode — UNCHANGED:** `if (!result.ok)` reproduces the
  legacy `if (error)` branch byte-faithfully — same
  `console.error('Failed to update comments:', …)` (now logging
  `result.error.cause ?? result.error`, the SAME resolved supabase error
  object), same `toast.error('Failed to update comments')`, same `return`
  that skips the trailing local-state update.
- **Thrown mode — REPAIRED (the authorized micro-change):** legacy had no
  try/catch — a thrown network exception rejected the handler, skipped
  the local update, and surfaced nothing. Repaired: the command converts
  the throw to err and the SAME branch fires (console.error + toast +
  return). The local update is skipped in both worlds; the user gains the
  existing failure toast.
- Uses the HONEST `canvas.updatePostMetadata` — legacy READ these errors,
  so no swallow.

### 0.3 Model + fidelity net: GPT-5.4, Pattern K ninth application — ONE file

No new commands, no new tests, no imports (both command factories and
`createPostsRepository` have been imported since 032/025). The fidelity
net is the EXISTING `posts.test.ts` suite (45 tests, re-run green at
authoring): `updatePostMetadata`'s verbatim-metadata + fresh-ISO-stamp
behavior and `updatePostMetadataBestEffort`'s resolved-swallow /
thrown-escape behavior are already pinned. The seven bare-await sites'
swallow semantics ride the BestEffort command's existing pin — this patch
adds NO new swallow sites to the standing P3 decision (the command-internal
sites remain SIX; these are consumers of the existing two).

### 0.4 Preserved semantics + disclosed facts (confirm, don't re-justify)

1. Every catch block, toast string, `fetchData()` call, optimistic
   `setPadlets` update, and `padletToEdit` sync stays BYTE-IDENTICAL.
2. §4e keeps the pair's first-throw-aborts-second ordering: two
   `if (!xResult.ok) throw …` lines inside the same try — a thrown failure
   on the container write reaches the catch before the dropped write runs,
   exactly as legacy; resolved failures swallow inside the command and
   both writes always fire, exactly as legacy.
3. The relocated legacy `as any` in §4c/§4d (`?.metadata as any` inside
   the merge) stays — ZERO new casts.
4. The `[field]: comments` computed-key merges move verbatim into the
   command input literals (census pin: 12→12).
5. §4b swaps ONLY the container leg of the detach handler; the padlet leg
   (L6015, position write) stays raw supabase in the SAME try block —
   a deliberate partial-handler swap (028 deleteMapPinContainer
   precedent), bound lines end before it and after it.
6. The detach handler's `oldParentId` is `string | undefined` narrowed by
   the enclosing `if (oldParentId)` — compiles without casts (verified).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # f290a47 (or a descendant not touching CanvasClient or the four lib files below)
```

Byte-identity (the ONE file to change AND the four that must not):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 5fc51d52f3954788abd483d0b9d9e27170667122
git hash-object lib/domain/canvas/posts.ts                     # f6a6420c034d62b7146854e8e0eddd1f59ba9ad2
git hash-object lib/domain/canvas/posts.test.ts                # 057719276144c60c933d64376a5c83666b73b221
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
```

CanvasClient census (measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8450
grep -c '^[[:space:]]*$' "$F"             # 727
grep -c "\.from('padlets')" "$F"          # 15
grep -c "createUpdatePostMetadataBestEffortCommand" "$F"   # 5
grep -c "createUpdatePostMetadataCommand" "$F"             # 8
grep -c "updatePostMetadataBestEffort" "$F"                # 9
grep -c "updatePostMetadata" "$F"         # 31
grep -c "createPostsRepository" "$F"      # 40
grep -c "userId: null" "$F"               # 49
grep -c "result.error.cause" "$F"         # 29
grep -c "containerResult" "$F"            # 10
grep -c "droppedResult" "$F"              # 0
grep -c "\[field\]: comments" "$F"        # 12
grep -c "supabase" "$F"                   # 48
```

Anchors (the ten sites' `.from('padlets')` lines):

```bash
for n in 6047 6552 6639 6724 6828 6836 6864 7371 7432 7759; do sed -n "${n}p" "$F"; done
# every line printed is exactly ".from('padlets')" at its local indent
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 166 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 4. CanvasClient edits (EIGHT bound blocks covering TEN sites, in file order; NO import changes)

### §4b — freeform detach, container leg ONLY (OLD = current L6046–6052, 7 lines → NEW 4)

OLD:

```ts
                  await supabase
                    .from('padlets')
                    .update({
                      metadata: { ...oldParent.metadata, childPadletIds: newChildIds },
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', oldParentId);
```

NEW:

```ts
                  const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                  const result = await updatePostMetadataBestEffort({ postId: oldParentId, metadata: { ...oldParent.metadata, childPadletIds: newChildIds } }, { userId: null });

                  if (!result.ok) throw result.error.cause ?? result.error;
```

### §4c — `onUpdateChildComments` checked TWINS — columns L6551 + wall L6723 (OLD occurs EXACTLY TWICE; replace BOTH; 16 lines → 11 each; AUTHORIZED §0.2)

OLD (×2):

```ts
                  const { error } = await supabase
                    .from('padlets')
                    .update({
                      metadata: {
                        ...(padlets.find(p => p.id === childId)?.metadata as any),
                        [field]: comments
                      },
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', childId);

                  if (error) {
                    console.error('Failed to update comments:', error);
                    toast.error('Failed to update comments');
                    return;
                  }
```

NEW (×2, identical):

```ts
                  const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
                  const result = await updatePostMetadata(
                    { postId: childId, metadata: { ...(padlets.find(p => p.id === childId)?.metadata as any), [field]: comments } },
                    { userId: null }
                  );

                  if (!result.ok) {
                    console.error('Failed to update comments:', result.error.cause ?? result.error);
                    toast.error('Failed to update comments');
                    return;
                  }
```

### §4d — `onUpdateChildComments` checked, grid variant at L6638 (same content, 22-space indent; 16 lines → 11; AUTHORIZED §0.2)

OLD:

```ts
                      const { error } = await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...(padlets.find(p => p.id === childId)?.metadata as any),
                            [field]: comments
                          },
                          updated_at: new Date().toISOString()
                        })
                        .eq('id', childId);

                      if (error) {
                        console.error('Failed to update comments:', error);
                        toast.error('Failed to update comments');
                        return;
                      }
```

NEW:

```ts
                      const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
                      const result = await updatePostMetadata(
                        { postId: childId, metadata: { ...(padlets.find(p => p.id === childId)?.metadata as any), [field]: comments } },
                        { userId: null }
                      );

                      if (!result.ok) {
                        console.error('Failed to update comments:', result.error.cause ?? result.error);
                        toast.error('Failed to update comments');
                        return;
                      }
```

### §4e — `onDropExistingPadlet` pair, timeline (OLD = current L6826–6842, 17 lines → NEW 8)

OLD:

```ts
                    try {
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
                    } catch (err) {
```

NEW:

```ts
                    try {
                      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                      const containerResult = await updatePostMetadataBestEffort({ postId: containerId, metadata: { ...containerPadlet.metadata, childPadletIds: newChildIds } }, { userId: null });
                      if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;
                      const droppedPadlet = padlets.find(p => p.id === droppedId);
                      const droppedResult = await updatePostMetadataBestEffort({ postId: droppedId, metadata: { ...droppedPadlet?.metadata, parentId: containerId } }, { userId: null });
                      if (!droppedResult.ok) throw droppedResult.error.cause ?? droppedResult.error;
                    } catch (err) {
```

### §4f — `onUpdateChildComments`, timeline (OLD = current L6862–6873, 12 lines → NEW 8)

OLD:

```ts
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...childPadlet.metadata, [field]: comments },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', childId);
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      fetchData(); // Rollback on error
                    }
```

NEW:

```ts
                    try {
                      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                      const result = await updatePostMetadataBestEffort({ postId: childId, metadata: { ...childPadlet.metadata, [field]: comments } }, { userId: null });
                      if (!result.ok) throw result.error.cause ?? result.error;
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      fetchData(); // Rollback on error
                    }
```

### §4g — drawing save (OLD = current L7369–7381 head, 13 lines → NEW 8)

OLD:

```ts
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...drawingPadlet.metadata,
                            drawing: dataUrl,
                            drawingPaths: paths,
                            drawingText: textElements
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', drawingPadlet.id);
```

NEW:

```ts
                    try {
                      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                      const result = await updatePostMetadataBestEffort(
                        { postId: drawingPadlet.id, metadata: { ...drawingPadlet.metadata, drawing: dataUrl, drawingPaths: paths, drawingText: textElements } },
                        { userId: null }
                      );

                      if (!result.ok) throw result.error.cause ?? result.error;
```

### §4h — crop save (OLD = current L7429–7442 head, 14 lines → NEW 8)

OLD:

```ts
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...cropPadlet.metadata,
                            imageUrl: croppedDataUrl,
                            drawing: null,
                            drawingPaths: null,
                            drawingText: null
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', cropPadlet.id);
```

NEW:

```ts
                    try {
                      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                      const result = await updatePostMetadataBestEffort(
                        { postId: cropPadlet.id, metadata: { ...cropPadlet.metadata, imageUrl: croppedDataUrl, drawing: null, drawingPaths: null, drawingText: null } },
                        { userId: null }
                      );

                      if (!result.ok) throw result.error.cause ?? result.error;
```

### §4i — `onUpdateChildComments`, RowColumnContainerCard (OLD = current L7757–7765 head, 9 lines → NEW 5)

OLD:

```ts
                                try {
                                  await supabase
                                    .from('padlets')
                                    .update({
                                      metadata: { ...childPadlet.metadata, [field]: comments },
                                      updated_at: new Date().toISOString(),
                                    })
                                    .eq('id', childId);
                                } catch (err) {
```

NEW:

```ts
                                try {
                                  const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
                                  const result = await updatePostMetadataBestEffort({ postId: childId, metadata: { ...childPadlet.metadata, [field]: comments } }, { userId: null });
                                  if (!result.ok) throw result.error.cause ?? result.error;
                                } catch (err) {
```

---

## 3. Post-edit gates (hash FIRST; any mismatch = STOP)

### 3.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 5d056b330f9851d249f3e1bacfcb54d0c7bb3599
# UNCHANGED files (same hashes as §1):
git hash-object lib/domain/canvas/posts.ts                     # f6a6420c034d62b7146854e8e0eddd1f59ba9ad2
git hash-object lib/domain/canvas/posts.test.ts                # 057719276144c60c933d64376a5c83666b73b221
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx"
# i/lf    w/lf
```

### 3.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8404
grep -c '^[[:space:]]*$' "$F"             # 730
grep -c "\.from('padlets')" "$F"          # 5   (the four deferred writes + the lone select)
grep -c "createUpdatePostMetadataBestEffortCommand" "$F"   # 11  (import + 10 uses)
grep -c "createUpdatePostMetadataCommand" "$F"             # 11  (import + 10 uses)
grep -c "updatePostMetadataBestEffort" "$F"                # 22
grep -c "updatePostMetadata" "$F"         # 50  (superstring matches included — measured)
grep -c "createPostsRepository" "$F"      # 49
grep -c "userId: null" "$F"               # 59
grep -c "result.error.cause" "$F"         # 37
grep -c "containerResult" "$F"            # 12
grep -c "droppedResult" "$F"              # 2
grep -c "\[field\]: comments" "$F"        # 12  (unchanged — the merges moved verbatim)
grep -c "supabase" "$F"                   # 38
```

### 3.2 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- lib/domain lib/infra
git diff -- components/collabboard/PostCardContent.tsx "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- eslint.boundaries.config.mjs
git status --short   # exactly ONE modified file; ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 6. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §4, then §3 gates (hash first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **166 passed (166), 24 files** (UNCHANGED — this patch adds no tests); full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 7. Commit ritual

```bash
git add ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly ONE staged M line; anything else = STOP
git commit -m "refactor(canvas): extract ten JSX padlets UPDATE sites onto the existing command quartet -- honest/best-effort per legacy contract, Pattern K (PATCH-033)" -- ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 8. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
renamed locals, casts, message strings. Pre-declared (confirm, don't
re-justify): the blank census RISES 727→730 (new blanks inside §4b/§4c/
§4d/§4g/§4h — the hash gate is the content proof); §4c's OLD occurs
exactly TWICE and BOTH are replaced; the relocated `?.metadata as any`
casts in §4c/§4d (§0.4.3); the AUTHORIZED thrown-mode repair at §4c/§4d
(§0.2 — do NOT "fix" anything beyond the bound blocks); §4b's partial-
handler swap leaves the position write above it byte-untouched (§0.4.5);
ZERO new casts; NO import changes; NO test changes.

STOP if: any §1 gate mismatches; any OLD block fails byte-match (incl. the
§4c count — anything other than exactly 2 occurrences = STOP); the §3.0
hash mismatches after one fix attempt against the fences;
`git status --short` shows any path outside the ONE scoped file;
tsc/boundaries/unit/e2e fail beyond the stale-`.next/types` cure.

Do NOT: touch the four DEFERRED sites (L6015 padlet leg, L6476, L7005,
L7627), the lone select, the auth trio, the hooks, FreeformPadletCards,
any lib file; create files; add commands or tests; de-lint types; chase
the grandfather list (stays 2).
