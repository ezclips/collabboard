# PATCH-032 — CanvasClient strangler group 7: named-function padlets UPDATE extinction (best-effort command pair + the authorized check-and-branch repair)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, eighth application; see §0.4)
**Pattern:** K — canvas ops command (§5.11), extension-only (no new files, no new repo methods, no infra changes)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (NINE bound blocks + one import edit), `lib/domain/canvas/posts.ts`, `lib/domain/canvas/posts.test.ts` — **nothing else. THREE files.** The infra files (`postsRepository.ts` + test) are byte-untouched this patch and hash-gated as such.
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `0124e10`; bound domain/test appends compiled (`tsc --strict`) and run (45/45 green incl. the 39 existing posts tests) in scratch; all NINE CanvasClient blocks applied to a scratch copy and every gate below measured on that simulation, including the bound post-edit hashes.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Bound tests are the
> fidelity net — never edit one; STOP and report instead (§8).

---

## 0. CTO rulings (both owner-requested rulings, made 2026-07-10)

### 0.1 RULING 1 — the bare-awaited UPDATE cluster (7 sites / 6 handlers)

**Command shape:** TWO new command-internal-swallow commands join the posts
aggregate as siblings of the honest pair —
`canvas.updatePostMetadataBestEffort` (stamped: `{ metadata, updated_at }`,
fresh ISO per call) and `canvas.updatePostMetadataUnstampedBestEffort`
(no timestamp, over 028's tested `updateMetadataUnstamped`). Both take
`{ postId, metadata }`, await the write, IGNORE the resolved Result, and
return `ok(undefined)`. No new repository methods; no infra changes.

**Error-swallow preservation:** the legacy sites awaited these writes bare —
resolved DB errors were silently swallowed; only a THROWN exception
surfaced. The faithful port puts that swallow INSIDE the commands (the 029
idiom): resolved → swallowed to ok; thrown → escapes execute →
`defineCommand` catch → `err('unknown', { cause })` → each call site's
`if (!result.ok) throw result.error.cause ?? result.error` throws the
ORIGINAL exception into the exact legacy path (rollback catch, empty catch,
unhandled rejection, or callers' catches — per site, §0.3). This EXTENDS
the standing P3 swallow-family decision from four to SIX command-internal
sites; each new command carries a dedicated "resolved failure still returns
ok" test pin, so a future authorized fix changes one expectation per site.

**Settle/order semantics:** fail-fast is PRESERVED EXACTLY, not
approximated. Each legacy `Promise.all` element (a supabase thenable that
rejects only on a thrown exception) becomes an `async (u) => { ...;
if (!result.ok) throw result.error.cause ?? result.error; }` wrapper — the
wrapper's promise rejects the moment ITS command settles err, so
`Promise.all` rejects at the FIRST thrown-mode failure with the ORIGINAL
error object, exactly as before; resolved-mode errors never reject (they
are ok inside the command), exactly as before. Sequential loops stay
sequential with first-throw abort (`if (!result.ok) throw` inside the loop
body). One disclosed timing note, ruled a non-deviation: legacy builder
thenables begin their fetch when `Promise.all` subscribes, while async
wrappers begin at `.map()` execution — both fire every write within the
same tick, no interleaving or traffic change.

### 0.2 RULING 2 — the check-and-branch pair: behavior micro-change AUTHORIZED

`changeCardColor` and `pinPost` are the program's SECOND authorized
behavior change (after PATCH-024). Exact legacy-vs-repaired ruling:

- **Resolved-error mode — UNCHANGED:** legacy read the resolved `error`
  and branched (`toast.error` + `fetchData()`; pinPost's `else` success
  toast). The port's `if (!result.ok)` reproduces this byte-faithfully for
  resolved errors: same strings, same `fetchData()`, success toast still
  fires ONLY on ok.
- **Thrown mode — REPAIRED:** legacy had NO try/catch — a thrown network
  exception rejected the handler's promise: no toast, no refetch, the
  optimistic `setPadlets` state stranded, only an unhandled-rejection
  console entry. Repaired: the command converts the throw to
  `err('unknown')` and the SAME existing failure branch fires (toast +
  `fetchData()` reconciliation).
- **Justification:** P3 ("report failures honestly", "never lose user
  work") — the rare-or-unreachable thrown mode converges onto the SAME
  failure UX the handler already ships for resolved errors. No success-path
  change, no message-string change, no new UI. The alternative (exact
  preservation) requires discriminating resolved-vs-thrown by infra error
  code at the call site — a fragile new idiom, rejected.
- These two sites use the HONEST `canvas.updatePostMetadata` (both legacy
  writes are stamped) — no swallow: legacy READ these errors.

### 0.3 The slice: named-function UPDATE goes EXTINCT (9 sites / 8 handlers)

| Site (at `0124e10`) | Handler | Command | Thrown-mode path (preserved) |
|---|---|---|---|
| L902–913 | section reorder (single bare await) | BestEffort | catch → console.error + metadata rollback (§4b) |
| L1595–1622 | `moveContainerToSection` (2 mapped batches + combined `Promise.all`) | BestEffort | catch → console.error + `setPadlets(oldPadlets)` (§4c) |
| L3074–3086 | map post move (`Promise.all`, kept `nextMeta: any` build) | BestEffort | catch → console.error + toast + rollback + fetchData (§4d) |
| L3949–3961 | `changeCardColor` (check-and-branch) | **honest** updatePostMetadata | REPAIRED per §0.2 (§4e) |
| L4049–4063 | `pinPost` (check-and-branch + else) | **honest** updatePostMetadata | REPAIRED per §0.2 (§4f) |
| L4080–4087 | `normalizeZIndexes` (UNSTAMPED loop, empty catch) | UnstampedBestEffort | throw → empty catch, loop aborted silently (§4g) |
| L4102–4112 | zIndex `migrate` (UNSTAMPED loop, NO catch) | UnstampedBestEffort | throw → unhandled rejection, loop + local-state update aborted (§4h) |
| L4371–4378 | `applyTimelineOrder` (`Promise.all`, callers catch) | BestEffort | wrapper throw → rejects → callers' try/catch (§4i) |

After this patch the padlets UPDATE census is 23→14, ALL of it in the JSX
region; CanvasClient's remaining supabase surface = 14 JSX updates + 1 JSX
select + 3 auth calls.

### 0.4 Model: GPT-5.4 (Pattern K, eighth application)

Two thin commands over ALREADY-TESTED repository methods; every swallow
pinned by a bound test run green at authoring (45/45); all nine swap
shapes compile-verified (`tsc --strict`) including the wrapped-batch
idiom, the `merged` extraction, the kept `nextMeta: any` relocated cast,
and `ZIndexUpdate.metadata`'s existing `Record<string, unknown>` type.
Whole-file hash gates bound for all three changed files AND the two
must-not-change infra files.

### 0.5 Preserved semantics + disclosed novelties (confirm, don't re-justify)

1. Every catch block, toast string, `fetchData()` call, rollback, and the
   two loop dependency arrays (`[padlets, supabase, markPadletLocallyModified]`,
   `[setPadlets, supabase]`, `[padlets, supabase, fetchData]`, and the
   migrate effect's array) stay BYTE-IDENTICAL — `supabase` entries STAY.
2. `markPadletLocallyModified` calls stay exactly where they are (per
   iteration in both loops).
3. The two UNSTAMPED loops stay unstamped (typed legacy fact).
4. NEW LOCAL `merged` in §4c: the root-batch metadata object, previously
   inline in the builder, is extracted to one named const inside the
   wrapper (content byte-identical, including the two comments and the
   relocated legacy `as any`). Bound as such.
5. `nextMeta: any` in §4d is the RELOCATED legacy cast (kept lines); the
   `as any` casts inside §4c's merges are relocated legacy casts. ZERO new
   casts anywhere.
6. `zUpdates.push` ordering in §4h: the push happens before the write per
   iteration, exactly as legacy — an aborted loop leaves the SAME partial
   zUpdates list unconsumed (the trailing `setPadlets` never runs on abort,
   as before).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # 0124e10 (or a descendant touching none of the 3 scoped files)
```

Byte-identity (all five files — the three to change AND the two that must not):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 3004547ed03099afa2b0b07c0bd602381fd8d58a
git hash-object lib/domain/canvas/posts.ts                     # f6028d3edeb0caa66be517825eef35348b6fdf38
git hash-object lib/domain/canvas/posts.test.ts                # 5fa6a2736d8c9d50dd9816e23561a88927a5d5cf
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
```

CanvasClient census (measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8475
grep -c '^[[:space:]]*$' "$F"             # 723
grep -c "\.from('padlets')" "$F"          # 24
grep -c '\.from("padlets")' "$F"          # 0
grep -c "createUpdatePostMetadataBestEffortCommand" "$F"          # 0
grep -c "createUpdatePostMetadataUnstampedBestEffortCommand" "$F" # 0
grep -c "updatePostMetadataBestEffort" "$F"                       # 0
grep -c "updatePostMetadataUnstampedBestEffort" "$F"              # 0
grep -c "updatePostMetadata" "$F"         # 14
grep -c "createPostsRepository" "$F"      # 32
grep -c "userId: null" "$F"               # 40
grep -c "result.error.cause" "$F"         # 22
grep -c "\bmerged\b" "$F"                 # 0
grep -c "nextMeta" "$F"                   # 35
grep -c "markPadletLocallyModified" "$F"  # 11
grep -c "supabase" "$F"                   # 57
```

Anchors:

```bash
sed -n '902p' "$F"    #     try {
sed -n '903p' "$F"    #       await supabase
sed -n '913p' "$F"    #         .eq('id', postId);
sed -n '1595p' "$F"   #       const rootPromises = allRootUpdates.map(u =>
sed -n '1622p' "$F"   #       await Promise.all([...rootPromises, ...childrenPromises]);
sed -n '3074p' "$F"   #     try {
sed -n '3075p' "$F"   #       await Promise.all(
sed -n '3953p' "$F"   #         updated_at: new Date().toISOString()
sed -n '4049p' "$F"   #     const { error } = await supabase
sed -n '4080p' "$F"   #     try {
sed -n '4104p' "$F"   #           const padlet = postsWithoutZ[i];
sed -n '4371p' "$F"   #     await Promise.all(
```

Repo-wide new-name collision (must print 0):

```bash
grep -rn "updatePostMetadataBestEffort\|updatePostMetadataUnstampedBestEffort" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 160 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (ONE exact append at EOF; final 374 lines; post-edit hash `f6a6420c034d62b7146854e8e0eddd1f59ba9ad2`)

The diff vs current is PURE ADDITIONS. Everything above the append stays
byte-identical. Append exactly:

```ts

export const updatePostMetadataBestEffortSchema = z.object({
  postId: z.string(),
  /** The post's NEW metadata, already merged at the call site (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

export const createUpdatePostMetadataBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostMetadataBestEffort',
    input: updatePostMetadataBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-032; queued P3-family fix, do NOT
      // repair here): the legacy call sites awaited these writes bare -
      // resolved DB errors were silently swallowed; only a THROWN network
      // error surfaced. Faithful port: ignore the resolved Result; a thrown
      // exception escapes execute and surfaces via defineCommand's catch.
      await repository.updateMetadata(asPostId(input.postId), {
        metadata: input.metadata,
        updatedAt: new Date().toISOString(),
      });
      return ok(undefined);
    },
  });

export const updatePostMetadataUnstampedBestEffortSchema = z.object({
  postId: z.string(),
  /** The post's NEW metadata, already merged at the call site (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

/** The no-timestamp best-effort sibling (legacy z-order maintenance writes). */
export const createUpdatePostMetadataUnstampedBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostMetadataUnstampedBestEffort',
    input: updatePostMetadataUnstampedBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-032): same bare-await swallow as the
      // stamped sibling above - resolved errors ignored, thrown escapes.
      await repository.updateMetadataUnstamped(asPostId(input.postId), {
        metadata: input.metadata,
      });
      return ok(undefined);
    },
  });
```

## 3. BOUND FILE 2 — `lib/domain/canvas/posts.test.ts` (two exact edits; final 830 lines, 45 tests — 39 existing + 6 new; post-edit hash `057719276144c60c933d64376a5c83666b73b221`)

Everything outside these two edits stays byte-identical.

### 3a. Import edit

Replace the last two entries of the multi-line `./posts` import — the
lines

```ts
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedCommand,
} from './posts';
```

with the alphabetical four:

```ts
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedBestEffortCommand,
  createUpdatePostMetadataUnstampedCommand,
} from './posts';
```

### 3b. Append at EOF

Append exactly:

```ts

describe('canvas.updatePostMetadataBestEffort', () => {
  it('writes the metadata verbatim with a fresh ISO timestamp and returns ok', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort(
      { postId: 'post-1', metadata: { sectionId: 's-1', sectionPosition: 1000 } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
    expect(fake.updateMetadataCalls[0].id).toBe('post-1');
    expect(fake.updateMetadataCalls[0].fields.metadata).toEqual({
      sectionId: 's-1',
      sectionPosition: 1000,
    });
    expect(new Date(fake.updateMetadataCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updateMetadataCalls[0].fields.updatedAt,
    );
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataResult(err(domainError('unavailable', 'db down')));
    const bestEffort = createUpdatePostMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', metadata: {} }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });
});

describe('canvas.updatePostMetadataUnstampedBestEffort', () => {
  it('writes the metadata verbatim with NO timestamp field and returns ok', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostMetadataUnstampedBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', metadata: { zIndex: 20 } }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(1);
    expect(fake.updateMetadataUnstampedCalls[0].id).toBe('post-1');
    expect(fake.updateMetadataUnstampedCalls[0].fields).toEqual({ metadata: { zIndex: 20 } });
    expect(Object.keys(fake.updateMetadataUnstampedCalls[0].fields)).toEqual(['metadata']);
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataUnstampedResult(err(domainError('unavailable', 'db down')));
    const bestEffort = createUpdatePostMetadataUnstampedBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', metadata: {} }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostMetadataUnstampedBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(0);
  });
});
```

---

## 4. CanvasClient edits (ONE import edit + NINE bound blocks, in file order)

Everything else stays BYTE-IDENTICAL — every catch block, every dependency
array (§0.5.1), the 14 JSX UPDATE sites, the lone select, the auth trio.

### §4a — posts import block: two names INSERTED alphabetically

Replace

```ts
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedCommand,
} from '@/lib/domain/canvas/posts';
```

with

```ts
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedBestEffortCommand,
  createUpdatePostMetadataUnstampedCommand,
} from '@/lib/domain/canvas/posts';
```

### §4b — section reorder (OLD = current L902–915 head, 14 lines → NEW 10)

OLD:

```ts
    try {
      await supabase
        .from('padlets')
        .update({
          metadata: {
            ...post.metadata,
            sectionId: toSectionId,
            sectionPosition: newPosition
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
    } catch (err) {
      console.error('Failed to reorder post:', err);
```

NEW:

```ts
    try {
      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
      const result = await updatePostMetadataBestEffort(
        { postId, metadata: { ...post.metadata, sectionId: toSectionId, sectionPosition: newPosition } },
        { userId: null }
      );

      if (!result.ok) throw result.error.cause ?? result.error;
    } catch (err) {
      console.error('Failed to reorder post:', err);
```

### §4c — `moveContainerToSection` (OLD = current L1593–1622, 30 lines → NEW 22)

OLD:

```ts
      const allRootUpdates = [...updates, ...sourceUpdates];

      // Persist root updates
      const rootPromises = allRootUpdates.map(u =>
        supabase
          .from('padlets')
          .update({
            metadata: {
              // We need to merge with existing metadata in DB, but we only have local snap.
              // Ideally we fetch-update, but for speed we merge local.
              ...(padlets.find(p => p.id === u.id)?.metadata as any),
              sectionId: u.sectionId,
              sectionPosition: u.sectionPosition
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', u.id)
      );

      // Persist children updates (sectionId only)
      const childrenPromises = childPadlets.map(p =>
        supabase
          .from('padlets')
          .update({
            metadata: { ...(p.metadata as any), sectionId: toSectionId },
            updated_at: new Date().toISOString()
          })
          .eq('id', p.id)
      );

      await Promise.all([...rootPromises, ...childrenPromises]);
```

NEW:

```ts
      const allRootUpdates = [...updates, ...sourceUpdates];

      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());

      // Persist root updates
      const rootPromises = allRootUpdates.map(async (u) => {
        // We need to merge with existing metadata in DB, but we only have local snap.
        // Ideally we fetch-update, but for speed we merge local.
        const merged = { ...(padlets.find(p => p.id === u.id)?.metadata as any), sectionId: u.sectionId, sectionPosition: u.sectionPosition };
        const result = await updatePostMetadataBestEffort({ postId: u.id, metadata: merged }, { userId: null });

        if (!result.ok) throw result.error.cause ?? result.error;
      });

      // Persist children updates (sectionId only)
      const childrenPromises = childPadlets.map(async (p) => {
        const result = await updatePostMetadataBestEffort({ postId: p.id, metadata: { ...(p.metadata as any), sectionId: toSectionId } }, { userId: null });

        if (!result.ok) throw result.error.cause ?? result.error;
      });

      await Promise.all([...rootPromises, ...childrenPromises]);
```

### §4d — map post move (OLD = current L3074–3088 head, 15 lines → NEW 15)

OLD:

```ts
    try {
      await Promise.all(
        updates.map((u) => {
          const post = padlets.find((p) => p.id === u.id);
          const nextMeta: any = { ...((post?.metadata as any) || {}), sectionPosition: u.sectionPosition };
          if (u.sectionId) nextMeta.sectionId = u.sectionId;
          else delete nextMeta.sectionId;
          return supabase
            .from('padlets')
            .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
            .eq('id', u.id);
        })
      );
    } catch (err) {
      console.error('Failed to move map post:', err);
```

NEW:

```ts
    try {
      const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
      await Promise.all(
        updates.map(async (u) => {
          const post = padlets.find((p) => p.id === u.id);
          const nextMeta: any = { ...((post?.metadata as any) || {}), sectionPosition: u.sectionPosition };
          if (u.sectionId) nextMeta.sectionId = u.sectionId;
          else delete nextMeta.sectionId;
          const result = await updatePostMetadataBestEffort({ postId: u.id, metadata: nextMeta }, { userId: null });
          if (!result.ok) throw result.error.cause ?? result.error;
        })
      );
    } catch (err) {
      console.error('Failed to move map post:', err);
```

### §4e — `changeCardColor` (OLD = current L3946–3961 body, 15 lines → NEW 10; AUTHORIZED §0.2)

OLD:

```ts
    const nextMeta = { ...(post.metadata || {}), cardColor: color };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const { error } = await supabase
      .from('padlets')
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id);

    if (error) {
      toast.error('Failed to update color');
      fetchData();
    }
```

NEW:

```ts
    const nextMeta = { ...(post.metadata || {}), cardColor: color };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
    const result = await updatePostMetadata({ postId: post.id, metadata: nextMeta }, { userId: null });

    if (!result.ok) {
      toast.error('Failed to update color');
      fetchData();
    }
```

### §4f — `pinPost` (OLD = current L4046–4060 head, 15 lines → NEW 10; AUTHORIZED §0.2)

OLD:

```ts
    const nextMeta = { ...(post.metadata || {}), isLocked };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const { error } = await supabase
      .from('padlets')
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id);

    if (error) {
      toast.error('Failed to update pin status');
      fetchData();
    } else {
```

NEW:

```ts
    const nextMeta = { ...(post.metadata || {}), isLocked };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
    const result = await updatePostMetadata({ postId: post.id, metadata: nextMeta }, { userId: null });

    if (!result.ok) {
      toast.error('Failed to update pin status');
      fetchData();
    } else {
```

### §4g — `normalizeZIndexes` (OLD = current L4080–4090 tail, 11 lines → NEW 12; UNSTAMPED)

OLD:

```ts
    try {
      for (const update of updates) {
        markPadletLocallyModified(update.id);
        await supabase
          .from('padlets')
          .update({ metadata: update.metadata })
          .eq('id', update.id);
      }
    } catch {
    }
  }, [padlets, supabase, markPadletLocallyModified]);
```

NEW:

```ts
    try {
      const updatePostMetadataUnstampedBestEffort = createUpdatePostMetadataUnstampedBestEffortCommand(createPostsRepository());
      for (const update of updates) {
        markPadletLocallyModified(update.id);
        const result = await updatePostMetadataUnstampedBestEffort({ postId: update.id, metadata: update.metadata }, { userId: null });
        if (!result.ok) throw result.error.cause ?? result.error;
      }
    } catch {
    }
  }, [padlets, supabase, markPadletLocallyModified]);
```

### §4h — zIndex `migrate` (OLD = current L4102–4112, 11 lines → NEW 11; UNSTAMPED)

OLD:

```ts
        const zUpdates: { id: string; zIndex: number }[] = [];
        for (let i = 0; i < postsWithoutZ.length; i++) {
          const padlet = postsWithoutZ[i];
          const newZ = 100 + i;
          zUpdates.push({ id: padlet.id, zIndex: newZ });
          markPadletLocallyModified(padlet.id);
          await supabase
            .from('padlets')
            .update({ metadata: { ...padlet.metadata, zIndex: newZ } })
            .eq('id', padlet.id);
        }
```

NEW:

```ts
        const zUpdates: { id: string; zIndex: number }[] = [];
        const updatePostMetadataUnstampedBestEffort = createUpdatePostMetadataUnstampedBestEffortCommand(createPostsRepository());
        for (let i = 0; i < postsWithoutZ.length; i++) {
          const padlet = postsWithoutZ[i];
          const newZ = 100 + i;
          zUpdates.push({ id: padlet.id, zIndex: newZ });
          markPadletLocallyModified(padlet.id);
          const result = await updatePostMetadataUnstampedBestEffort({ postId: padlet.id, metadata: { ...padlet.metadata, zIndex: newZ } }, { userId: null });
          if (!result.ok) throw result.error.cause ?? result.error;
        }
```

### §4i — `applyTimelineOrder` (OLD = current L4371–4379 tail, 9 lines → NEW 8)

OLD:

```ts
    await Promise.all(
      updates.map((u) =>
        supabase
          .from('padlets')
          .update({ metadata: u.metadata, updated_at: new Date().toISOString() })
          .eq('id', u.id)
      )
    );
  }, [setPadlets, supabase]);
```

NEW:

```ts
    const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
    await Promise.all(
      updates.map(async (u) => {
        const result = await updatePostMetadataBestEffort({ postId: u.id, metadata: u.metadata }, { userId: null });
        if (!result.ok) throw result.error.cause ?? result.error;
      })
    );
  }, [setPadlets, supabase]);
```

---

## 5. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 5.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 5fc51d52f3954788abd483d0b9d9e27170667122
git hash-object lib/domain/canvas/posts.ts                     # f6a6420c034d62b7146854e8e0eddd1f59ba9ad2
git hash-object lib/domain/canvas/posts.test.ts                # 057719276144c60c933d64376a5c83666b73b221
# UNCHANGED files (same hashes as §1):
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts
# every row: i/lf    w/lf
```

### 5.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8450
grep -c '^[[:space:]]*$' "$F"             # 727
grep -c "\.from('padlets')" "$F"          # 15  (all in the JSX region + the select)
grep -c '\.from("padlets")' "$F"          # 0
grep -c "createUpdatePostMetadataBestEffortCommand" "$F"          # 5   (1 import + 4 uses)
grep -c "createUpdatePostMetadataUnstampedBestEffortCommand" "$F" # 3   (1 import + 2 uses)
grep -c "updatePostMetadataBestEffort" "$F"                       # 9   (case-sensitive: the four stamped locals' declare/call lines)
grep -c "updatePostMetadataUnstampedBestEffort" "$F"              # 4   (the two unstamped locals' declare+call lines)
grep -c "updatePostMetadata" "$F"         # 31  (superstring matches included — measured)
grep -c "createPostsRepository" "$F"      # 40
grep -c "userId: null" "$F"               # 49
grep -c "result.error.cause" "$F"         # 29
grep -c "\bmerged\b" "$F"                 # 2
grep -c "nextMeta" "$F"                   # 35  (unchanged)
grep -c "markPadletLocallyModified" "$F"  # 11  (unchanged)
grep -c "supabase" "$F"                   # 48
```

### 5.2 Lib-file identity + suite

```bash
wc -l lib/domain/canvas/posts.ts          # 374
wc -l lib/domain/canvas/posts.test.ts     # 830
grep -c "it(" lib/domain/canvas/posts.test.ts   # 45
git diff lib/domain/canvas/posts.ts | grep -c "^-[^-]"   # 0  (pure additions)
```

### 5.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- lib/infra/canvas lib/infra/supabase
git diff -- components/collabboard/PostCardContent.tsx "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- components/collabboard/canvas/engine/zIndex.ts
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/domain/boards/repository.ts lib/domain/core eslint.boundaries.config.mjs
git status --short   # exactly the 3 scoped files (M); ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 6. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§4, then §5 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **166 passed (166), 24 files**; full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 7. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 3 staged M lines; anything else = STOP
git commit -m "refactor(canvas): finish the named-function padlets UPDATE family -- best-effort command pair + authorized check-and-branch repair, Pattern K (PATCH-032)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 8. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the blank census RISES 723→727
(new blanks inside §4b/§4c — the hash gate is the content proof); the new
`merged` local in §4c (§0.5.4); the relocated legacy `as any` casts in
§4c/§4d (§0.5.5); the AUTHORIZED thrown-mode repair at §4e/§4f (§0.2 — do
NOT "fix" anything beyond the bound blocks); all dependency arrays keep
their `supabase` entries (§0.5.1); ZERO new casts.

STOP if: any §1 gate mismatches; any OLD block fails byte-match at its
bound lines; any bound test fails (never edit a test); any §5.0 hash
mismatches after one fix attempt against the fences; `git status --short`
shows any path outside the THREE scoped files; tsc/boundaries/unit/e2e fail
beyond the stale-`.next/types` cure.

Do NOT: touch the 14 JSX UPDATE sites, the lone select, the auth trio, the
hooks, FreeformPadletCards, `zIndex.ts`, or any infra file; create files;
add repo methods; de-lint types; chase the grandfather list (stays 2).
