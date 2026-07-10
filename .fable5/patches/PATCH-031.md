# PATCH-031 — CanvasClient strangler group 6: the honest-contract padlets UPDATE slice (six named-function metadata writes onto `canvas.updatePostMetadata` + its unstamped sibling)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, seventh application; see §0.2)
**Pattern:** K — canvas ops command (§5.11), extension-only (no new files, no new repo methods, no infra changes)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (SIX bound blocks + one import line), `lib/domain/canvas/posts.ts`, `lib/domain/canvas/posts.test.ts` — **nothing else. THREE files.** The infra files (`postsRepository.ts` + test) are byte-untouched this patch and hash-gated as such.
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `aaf36fc`; all SIX CanvasClient blocks and the two exact test edits are hash-gated, with post-edit values derived from the bound simulation. The implementation verification in §6 remains mandatory.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Bound tests are the
> fidelity net — never edit one; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 Group choice: the honest-contract family — the 15 named-function UPDATE sites split by their legacy ERROR CONTRACT, not by feature

Post-030 census (regenerated 2026-07-10 at `aaf36fc`): 29 padlets UPDATE
(15 in named functions, 14 in the JSX region), 1 padlets select (JSX),
0 storage, 3 auth. The owner's directive: the safest coherent
named-function UPDATE slice, reusing `canvas.updatePostMetadata` where the
`{ metadata, updated_at }` shape matches.

Reading all 15 named sites in full shows the real cleavage is the legacy
ERROR CONTRACT, because that is what decides whether a swap onto the
HONEST commands is byte-faithful in BOTH failure modes (resolved DB error
vs thrown network error):

| Site | Handler | Stamp | Legacy contract | Ruling |
|---|---|---|---|---|
| L1458 | `handleWallReorder` | stamped | `if (error) throw` into catch, sequential loop | **THIS PATCH** (§4b) |
| L1958 | `createRealPostFromDraft` | stamped | `if (error) throw` into catch | **THIS PATCH** (§4c) |
| L2668 | `commitPadletMeta` | stamped | bare await inside EMPTY catch (double swallow) | **THIS PATCH** (§4d) |
| L3684 | `lockPadlet` | **UNSTAMPED** | `if (error) throw` into catch | **THIS PATCH** (§4e) |
| L3843 | `toggleCropToGrid` | stamped | `if (error) throw` into catch | **THIS PATCH** (§4f) |
| L3890 | `movePadletLayer` | **UNSTAMPED** | `if (error) throw` into catch | **THIS PATCH** (§4g) |
| L903 | post reorder-in-section | stamped | bare await + rollback catch | deferred (swallow family) |
| L1604/L1621 | `moveContainerToSection` | stamped | `Promise.all`, no result checks | deferred (swallow family) |
| L3097 | map post move | stamped | `Promise.all`, no result checks | deferred (swallow family) |
| L3974 | `changeCardColor` | stamped | check-and-branch, NO throw, NO try | deferred (needs a ruling) |
| L4074 | `pinPost` | stamped | check-and-branch, NO throw, NO try | deferred (needs a ruling) |
| L4108 | `normalizeZIndexes` | UNSTAMPED | loop, bare awaits, empty catch | deferred (swallow family) |
| L4133 | zIndex `migrate` | UNSTAMPED | loop, bare awaits, NO catch | deferred (swallow family) |
| L4398 | `applyTimelineOrder` | stamped | `Promise.all`, no checks, caller's catch | deferred (swallow family) |

Why the six chosen sites are EXACT ports and the rest are not:

- **`if (error) throw error` into a catch** is exactly reproduced by the
  house idiom `if (!result.ok) throw result.error.cause ?? result.error`:
  a resolved DB error arrives as `err(...{ cause })` and the unwrap throws
  the ORIGINAL supabase error into the SAME catch; a thrown network error
  is caught by `defineCommand`, wrapped as `err('unknown', { cause })`,
  and the unwrap throws the ORIGINAL thrown object into the SAME catch.
  Both modes byte-faithful.
- **`commitPadletMeta`'s empty catch** swallows BOTH modes in legacy, so
  the honest command with its Result deliberately ignored reproduces both:
  resolved → err Result ignored; thrown → caught by `defineCommand` → err
  Result ignored. Nothing observable either way, exactly as before.
- **The bare-await/`Promise.all` sites** (L903, L1604/21, L3097, L4108,
  L4133, L4398) swallow RESOLVED errors but let THROWN errors reach a
  rollback/abort path. Porting those exactly requires command-internal
  swallows — NEW P3-family swallow commands extending the standing
  decision (currently four sites). That is a separate patch with its own
  owner-visible P3 accounting, not a rider on this one.
- **The check-and-branch pair** (L3974, L4074) has NO try/catch: a thrown
  network error propagates as an unhandled rejection in legacy, but any
  command port would route it into the same branch as a resolved error.
  No exact port exists at the call site; including them means an
  authorized behavior micro-change. Deferred for an explicit ruling.

So the slice is COHERENT by contract: every named-function metadata write
whose legacy semantics port EXACTLY onto honest commands — and ONLY those.
Named UPDATE census 15→9; total padlets UPDATE 29→23. A bonus extinction:
L2668 is the file's ONLY double-quoted `.from("padlets")` (the site-map
census correction's site) — the double-quote variant goes extinct (1→0),
and every future padlets grep in this program loses its known trap.

### 0.2 Model: GPT-5.4

Six mechanical swaps of one repeated shape; four reuse a command already
proven in production (030); the two unstamped sites need ONE thin new
command over 028's ALREADY-TESTED `updateMetadataUnstamped` repository
method (its `Object.keys === ['metadata']` no-timestamp fact is pinned in
the existing infra test). The bound test suite grows 36→39; all six
swap shapes are constrained to the REAL
`Padlet['metadata']` type (an anonymous closed object type — spreads of it
get TypeScript's implicit index signature, so every `{ ...metadata, field }`
literal is assignable to the zod record input with ZERO casts).

### 0.3 Seam ruling: reuse + one sibling command, no new files, no new repo methods

`canvas.updatePostMetadata` (030) is the workhorse exactly as planned: the
call site passes caller-merged metadata and the command stamps a fresh ISO
`updated_at` — identical to all four stamped legacy writes (per-call stamp
in the loop case, matching legacy's per-iteration stamp).
`canvas.updatePostMetadataUnstamped` is its NO-TIMESTAMP sibling for the
two writes that legacy sends WITHOUT `updated_at` (lockPadlet old L3687,
movePadletLayer old L3893) — a typed legacy fact, same as 027's map-style
write and 029's groupIntoColumn parent write, carried by the dedicated
repository method those patches already bound and tested.

### 0.4 Preserved semantics (do NOT repair)

1. All four throw-into-catch sites keep their catches BYTE-IDENTICAL —
   console.error messages, toasts, `fetchData()` calls, rollback absence.
   The thrown object is the ORIGINAL supabase error (cause-unwrapped).
2. `commitPadletMeta` keeps its DOUBLE SWALLOW at the call site: the
   command's Result is deliberately ignored (bound comment marks it) and
   the empty catch stays. This is a CALL-SITE swallow, like 028's console
   swallows — the command itself stays honest; the standing P3 decision
   (four command-internal sites) is NOT extended by this patch.
3. The two UNSTAMPED writes stay unstamped (typed legacy fact, §0.3).
4. `markPadletLocallyModified` calls stay exactly where they are (before
   the write in commitPadletMeta/lockPadlet/movePadletLayer).
5. Dependency arrays stay BYTE-IDENTICAL: `handleWallReorder`'s
   `[padlets, supabase]` and `commitPadletMeta`'s
   `[supabase, markPadletLocallyModified]` keep their now-unused
   `supabase` entries (027/030 precedent; exhaustive-deps warnings are
   advisory).
6. `handleWallReorder`'s loop stays SEQUENTIAL with first-failure-abort
   (the throw exits the loop into the catch, exactly as legacy).
7. Zod boundary note, pre-ruled: `commitPadletMeta`'s `fullMetadata: any`
   now passes through `z.record(z.string(), z.unknown())`. Every caller
   (L4278 and the four image-toolbar arrow handlers) passes a fresh
   `{ ...spread }` object merge, which the record accepts; a hypothetical
   non-object argument would be silently rejected (err, ignored) where
   legacy would have attempted the write — unreachable from the existing
   callers, accepted as the standard zod-boundary hardening every K patch
   has carried.

### 0.5 Cast census: ZERO new casts

Every metadata argument is a fresh object literal (or `fullMetadata: any`,
already implicitly-any in legacy). No `as` anywhere in the new lines.

### 0.6 What remains after this patch (031+ sequencing, not bindings)

9 named UPDATE sites in two families needing their own rulings: the
SWALLOW family (L903, L1604/21, L3097, L4108, L4133, L4398 — needs one or
two P3-family swallow commands and, for the `Promise.all` sites, a ruling
on settle-order timing) and the CHECK-AND-BRANCH pair (L3974, L4074 —
needs an authorized micro-change ruling). Then the 14 JSX sites, the lone
select (hooks/read phase), and the auth trio (GPT-5.5).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # aaf36fc (or a descendant touching none of the 3 scoped files)
```

Byte-identity (all five files — the three to change AND the two that must not):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 7215b1c7c963f52d3a8d69d56cb5db3937885f24
git hash-object lib/domain/canvas/posts.ts                     # 3001eaacd3262028ad4f2eb56fa0daff122be02e
git hash-object lib/domain/canvas/posts.test.ts                # de7b681fa2babd7bce4a8bb4e53586ac0fd1b7c4
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
```

CanvasClient census (measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8499
grep -c '^[[:space:]]*$' "$F"             # 723
grep -c "\.from('padlets')" "$F"          # 29
grep -c '\.from("padlets")' "$F"          # 1   (the site-map double-quote site — it lives in commitPadletMeta)
grep -c "createUpdatePostMetadataCommand" "$F"           # 2
grep -c "createUpdatePostMetadataUnstampedCommand" "$F"  # 0
grep -c "updatePostMetadataUnstamped" "$F"               # 0
grep -c "updatePostMetadata" "$F"         # 2
grep -c "createPostsRepository" "$F"      # 26
grep -c "userId: null" "$F"               # 34
grep -c "containerResult" "$F"            # 8
grep -c "wallPosition" "$F"               # 13
grep -c "newMetadata" "$F"                # 16
grep -c "fullMetadata" "$F"               # 2
grep -c "newChildren" "$F"                # 3
grep -c "cropToGrid" "$F"                 # 2
grep -c "markPadletLocallyModified" "$F"  # 11
```

Anchors:

```bash
sed -n '1458p' "$F"   #     try {
sed -n '1463p' "$F"   #         const { error } = await supabase
sed -n '1474p' "$F"   #         if (error) throw error;
sed -n '1957p' "$F"   #       // 4. Persist Container Update
sed -n '1966p' "$F"   #       if (containerError) throw containerError;
sed -n '2668p' "$F"   #       try {
sed -n '2675p' "$F"   #           .eq("id", padletId);
sed -n '3684p' "$F"   #       const newMetadata = { ...padlet.metadata, isLocked: newLockedState };
sed -n '3690p' "$F"   #       if (error) throw error;
sed -n '3843p' "$F"   #       const { error } = await supabase
sed -n '3851p' "$F"   #       if (error) throw error;
sed -n '3890p' "$F"   #       const newMetadata = { ...padlet.metadata, zIndex: newZ };
sed -n '3896p' "$F"   #       if (error) throw error;
```

Repo-wide new-name collision (must print 0):

```bash
grep -rn "createUpdatePostMetadataUnstampedCommand\|updatePostMetadataUnstampedSchema" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 157 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (whole file, exact, 329 lines; CTO compile+test verified; post-edit hash `f6028d3edeb0caa66be517825eef35348b6fdf38`)

The diff vs current is PURE ADDITIONS: the `canvas.updatePostMetadataUnstamped`
schema + command appended at EOF. Replace the file with exactly:

```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { PostId } from '../core/ids';
import { asPostId } from '../core/ids';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

/**
 * PATCH-025: the first canvas write seam. The `padlets` table name is a
 * legacy schema fact; new code uses neutral naming (P7) - posts.
 *
 * PATCH-028: the padlets DELETE family joins the SAME aggregate (P6 - one
 * repository per table). Deletes carry no payloads, so the repository
 * methods pin the WHERE shapes; the one cascade command preserves the
 * legacy two-statement ordering.
 *
 * PATCH-029: the padlets INSERT family joins the same aggregate. Insert
 * rows are pass-through objects built at the call sites (legacy shape) -
 * the commands add NO timestamps and NO fields; the two scheduler commands
 * preserve a legacy resolved-error swallow (see their comments).
 */

/**
 * A legacy insert row, passed through verbatim. Typed `object` (not a
 * record) so the call sites' `Padlet`-typed locals remain assignable
 * without casts; the table is the shape's only validator, exactly as
 * before the extraction.
 */
export const postRowSchema = z.custom<object>(
  (value) => typeof value === 'object' && value !== null,
);

/** The exact three-column payload the legacy toggle writes. */
export interface PostTasksWriteFields {
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly updatedAt: string;
}

/** The exact two-column payload the legacy container-metadata write sends. */
export interface PostMetadataWriteFields {
  readonly metadata: Record<string, unknown>;
  readonly updatedAt: string;
}

export interface PostsRepository {
  updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>>;
  updateMetadata(id: PostId, fields: PostMetadataWriteFields): Promise<Result<void, DomainError>>;
  /** Legacy groupIntoColumn parent-write sends NO updated_at (old L3665) - dedicated method. */
  updateMetadataUnstamped(
    id: PostId,
    fields: { readonly metadata: Record<string, unknown> },
  ): Promise<Result<void, DomainError>>;
  deleteById(id: PostId): Promise<Result<void, DomainError>>;
  deleteByIds(ids: readonly PostId[]): Promise<Result<void, DomainError>>;
  /** Deletes every row whose metadata->>parentId equals the given id. */
  deleteByParentId(parentId: PostId): Promise<Result<void, DomainError>>;
  insert(row: object): Promise<Result<void, DomainError>>;
  /** insert().select().single() - returns the inserted row as supabase shapes it. */
  insertReturning(row: object): Promise<Result<Record<string, unknown> | null, DomainError>>;
}

export const toggleTaskSchema = z.object({
  postId: z.string(),
  taskId: z.string(),
  /** The post's CURRENT metadata JSONB, passed through untyped (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

export const createToggleTaskCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.toggleTask',
    input: toggleTaskSchema,
    execute: async (input) => {
      const rawTasks = input.metadata.tasks;
      // Legacy reachability: the checkbox only renders when metadata.tasks is
      // truthy and the render already .map()s it, so a truthy non-array can
      // never reach this handler without crashing the render first. The
      // legacy handler would have thrown (caught, no write); we return an
      // error (no write) - same observable outcome.
      if (rawTasks !== undefined && rawTasks !== null && !Array.isArray(rawTasks)) {
        return err(domainError('validation', 'metadata.tasks is not an array'));
      }
      // Legacy semantics preserved exactly (PostCardContent old L376-390):
      // missing/null tasks -> `|| []` wrote an empty list; the matching id
      // flips `completed`; every other task and field passes through.
      const updatedTasks: Record<string, unknown>[] = Array.isArray(rawTasks)
        ? rawTasks.map((task: Record<string, unknown>) =>
            task.id === input.taskId ? { ...task, completed: !task.completed } : task,
          )
        : [];
      return repository.updateTasks(asPostId(input.postId), {
        content: JSON.stringify(updatedTasks),
        metadata: { ...input.metadata, tasks: updatedTasks },
        updatedAt: new Date().toISOString(),
      });
    },
  });

export const deletePostSchema = z.object({
  postId: z.string(),
});

export const createDeletePostCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.deletePost',
    input: deletePostSchema,
    execute: async (input) => repository.deleteById(asPostId(input.postId)),
  });

export const deletePostsSchema = z.object({
  postIds: z.array(z.string()),
});

export const createDeletePostsCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.deletePosts',
    input: deletePostsSchema,
    execute: async (input) => repository.deleteByIds(input.postIds.map(asPostId)),
  });

export const deleteChildPostsSchema = z.object({
  parentId: z.string(),
});

export const createDeleteChildPostsCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.deleteChildPosts',
    input: deleteChildPostsSchema,
    execute: async (input) => repository.deleteByParentId(asPostId(input.parentId)),
  });

export const deleteContainerChildSchema = z.object({
  containerId: z.string(),
  childId: z.string(),
  /** The container's CURRENT metadata JSONB, passed through untyped (legacy shape). */
  containerMetadata: z.record(z.string(), z.unknown()),
  /**
   * Precomputed at the call site (legacy old L4255-4256 stay in place there,
   * feeding the optimistic UI update first). Element type is unknown on
   * purpose: the legacy write passed whatever the JSONB held straight back.
   */
  childPadletIds: z.array(z.unknown()),
});

export const createDeleteContainerChildCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.deleteContainerChild',
    input: deleteContainerChildSchema,
    execute: async (input) => {
      // Sequential two-statement cascade preserved from old L4264-4278: the
      // wholesale container-metadata write goes FIRST and its failure aborts
      // the child delete (first-failure-wins; a container write that already
      // landed is NOT rolled back - legacy partial-failure fact).
      const containerResult = await repository.updateMetadata(asPostId(input.containerId), {
        metadata: { ...input.containerMetadata, childPadletIds: input.childPadletIds },
        updatedAt: new Date().toISOString(),
      });
      if (!containerResult.ok) {
        return containerResult;
      }

      return repository.deleteById(asPostId(input.childId));
    },
  });

export const createPostSchema = z.object({
  row: postRowSchema,
});

export const createCreatePostCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createPost',
    input: createPostSchema,
    execute: async (input) => repository.insert(input.row),
  });

export const createPostAndSelectSchema = z.object({
  row: postRowSchema,
});

export const createCreatePostAndSelectCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createPostAndSelect',
    input: createPostAndSelectSchema,
    execute: async (input) => repository.insertReturning(input.row),
  });

export const createContainerWithPostSchema = z.object({
  containerRow: postRowSchema,
  postRow: postRowSchema,
});

export const createCreateContainerWithPostCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createContainerWithPost',
    input: createContainerWithPostSchema,
    execute: async (input) => {
      // Sequential pair preserved from old L4576-4579: container first, and a
      // resolved container failure ABORTS the post insert (first-failure-wins,
      // no rollback of anything already written).
      const containerResult = await repository.insert(input.containerRow);
      if (!containerResult.ok) {
        return containerResult;
      }

      return repository.insert(input.postRow);
    },
  });

export const groupPostIntoContainerSchema = z.object({
  containerRow: postRowSchema,
  postId: z.string(),
  /** The post's NEW metadata, parentId already merged at the call site (legacy shape). */
  postMetadata: z.record(z.string(), z.unknown()),
});

export const createGroupPostIntoContainerCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.groupPostIntoContainer',
    input: groupPostIntoContainerSchema,
    execute: async (input) => {
      const containerResult = await repository.insertReturning(input.containerRow);
      if (!containerResult.ok) {
        return containerResult;
      }

      // Legacy old L3663-3666: the post's parentId write sends NO updated_at
      // (dedicated unstamped method), and a failure here does NOT roll back
      // the container that already landed (legacy partial-failure fact).
      const updateResult = await repository.updateMetadataUnstamped(asPostId(input.postId), {
        metadata: input.postMetadata,
      });
      if (!updateResult.ok) {
        return err(updateResult.error);
      }

      return containerResult;
    },
  });

export const attachPostToSchedulerContainerSchema = z.object({
  postRow: postRowSchema,
  containerId: z.string(),
  /** The container's CURRENT metadata JSONB, passed through untyped (legacy shape). */
  containerMetadata: z.record(z.string(), z.unknown()),
  /** Precomputed at the call site (old L4798), feeding the optimistic UI first. */
  childPadletIds: z.array(z.unknown()),
  /** The call site's shared `now` - the SAME string already stamps the post row. */
  updatedAt: z.string(),
});

export const createAttachPostToSchedulerContainerCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.attachPostToSchedulerContainer',
    input: attachPostToSchedulerContainerSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L4809-4816; queued P3-family fix, do NOT
      // repair here): both statements were awaited bare - resolved DB errors
      // were silently swallowed and the second statement ran regardless; only
      // a THROWN network error aborted the sequence and reached the handler's
      // catch. Faithful port: ignore each resolved Result; a thrown exception
      // still rejects, escapes execute, and surfaces via defineCommand's catch.
      await repository.insert(input.postRow);
      await repository.updateMetadata(asPostId(input.containerId), {
        metadata: { ...input.containerMetadata, childPadletIds: input.childPadletIds },
        updatedAt: input.updatedAt,
      });
      return ok(undefined);
    },
  });

export const createSchedulerContainerWithPostSchema = z.object({
  containerRow: postRowSchema,
  postRow: postRowSchema,
});

export const createCreateSchedulerContainerWithPostCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createSchedulerContainerWithPost',
    input: createSchedulerContainerWithPostSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (old L4840-4841 and old L4907-4908 - two
      // consumers, identical statements; queued P3-family fix, do NOT repair
      // here): resolved insert errors were silently swallowed and BOTH
      // inserts always ran; only a THROWN network error on the first aborted
      // the second. Faithful port: ignore each resolved Result; a thrown
      // exception escapes execute and surfaces via defineCommand's catch.
      await repository.insert(input.containerRow);
      await repository.insert(input.postRow);
      return ok(undefined);
    },
  });

export const updatePostMetadataSchema = z.object({
  postId: z.string(),
  /** The post's NEW metadata, already merged at the call site (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

export const createUpdatePostMetadataCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostMetadata',
    input: updatePostMetadataSchema,
    execute: async (input) =>
      repository.updateMetadata(asPostId(input.postId), {
        metadata: input.metadata,
        updatedAt: new Date().toISOString(),
      }),
  });

export const updatePostMetadataUnstampedSchema = z.object({
  postId: z.string(),
  /** The post's NEW metadata, already merged at the call site (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

/** Legacy lock/z-order writes send NO updated_at - the unstamped sibling of updatePostMetadata. */
export const createUpdatePostMetadataUnstampedCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostMetadataUnstamped',
    input: updatePostMetadataUnstampedSchema,
    execute: async (input) =>
      repository.updateMetadataUnstamped(asPostId(input.postId), {
        metadata: input.metadata,
      }),
  });
```

## 3. BOUND FILE 2 — `lib/domain/canvas/posts.test.ts` (two exact edits, 741 lines, 39 tests — 36 existing + 3 new; post-edit hash `5fa6a2736d8c9d50dd9816e23561a88927a5d5cf`)

Everything outside these two blocks stays byte-identical.

### 3a. Import addition

In the existing multi-line `./posts` import, insert this line directly after
`createUpdatePostMetadataCommand,`:

```ts
  createUpdatePostMetadataUnstampedCommand,
```

### 3b. Append at EOF

Append exactly:

```ts
describe('canvas.updatePostMetadataUnstamped', () => {
  it('writes metadata verbatim without updatedAt', async () => {
    const fake = createFakeRepository();
    const update = createUpdatePostMetadataUnstampedCommand(fake.repository);

    const result = await update({ postId: 'post-1', metadata: { isLocked: true } }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataUnstampedCalls).toEqual([
      { id: 'post-1', fields: { metadata: { isLocked: true } } },
    ]);
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataUnstampedResult(err(domainError('unavailable', 'db down')));
    const update = createUpdatePostMetadataUnstampedCommand(fake.repository);

    const result = await update({ postId: 'post-1', metadata: {} }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unavailable');
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const update = createUpdatePostMetadataUnstampedCommand(fake.repository);

    const result = await update({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(0);
  });
});
```

---

## 4. CanvasClient edits (ONE import touch + SIX bound blocks, in file order)

Everything else stays BYTE-IDENTICAL — including every catch block, every
`setPadlets` consumer, both dependency arrays (§0.4.5), and the NINE
deferred UPDATE sites (§0.1).

### §4a — posts import block: add one name

In the existing `@/lib/domain/canvas/posts` import block, insert
alphabetically as the LAST entry, after `createUpdatePostMetadataCommand,`:

```ts
  createUpdatePostMetadataUnstampedCommand,
```

### §4b — `handleWallReorder` (OLD = current L1458–1477, 20 lines → NEW 12 lines)

OLD:

```ts
    try {
      for (const { id, wallPosition } of updates) {
        const original = padlets.find(p => p.id === id);
        if (!original) continue;

        const { error } = await supabase
          .from('padlets')
          .update({
            metadata: {
              ...original.metadata,
              wallPosition,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
      }
    } catch (err) {
      console.error('[handleWallReorder] Save failed:', err);
```

NEW:

```ts
    try {
      const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
      for (const { id, wallPosition } of updates) {
        const original = padlets.find(p => p.id === id);
        if (!original) continue;

        const result = await updatePostMetadata({ postId: id, metadata: { ...original.metadata, wallPosition } }, { userId: null });

        if (!result.ok) throw result.error.cause ?? result.error;
      }
    } catch (err) {
      console.error('[handleWallReorder] Save failed:', err);
```

### §4c — `createRealPostFromDraft` container leg (OLD = current L1957–1966, 10 lines → NEW 5 lines)

OLD:

```ts
      // 4. Persist Container Update
      const { error: containerError } = await supabase
        .from('padlets')
        .update({
          metadata: { ...container.metadata, childPadletIds: newChildren },
          updated_at: new Date().toISOString()
        })
        .eq('id', containerId);

      if (containerError) throw containerError;
```

NEW:

```ts
      // 4. Persist Container Update
      const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
      const containerResult = await updatePostMetadata({ postId: containerId, metadata: { ...container.metadata, childPadletIds: newChildren } }, { userId: null });

      if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;
```

### §4d — `commitPadletMeta` (OLD = current L2668–2677, 10 lines → NEW 7 lines; kills the double-quote site)

OLD:

```ts
      try {
        await supabase
          .from("padlets")
          .update({
            metadata: fullMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", padletId);
      } catch {
      }
```

NEW:

```ts
      try {
        // Result deliberately ignored - the legacy write swallowed BOTH
        // resolved and thrown errors (empty catch); the command preserves that.
        const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
        await updatePostMetadata({ postId: padletId, metadata: fullMetadata }, { userId: null });
      } catch {
      }
```

### §4e — `lockPadlet` (OLD = current L3684–3690, 7 lines → NEW 5 lines; UNSTAMPED)

OLD:

```ts
      const newMetadata = { ...padlet.metadata, isLocked: newLockedState };
      const { error } = await supabase
        .from('padlets')
        .update({ metadata: newMetadata })
        .eq('id', id);

      if (error) throw error;
```

NEW:

```ts
      const newMetadata = { ...padlet.metadata, isLocked: newLockedState };
      const updatePostMetadataUnstamped = createUpdatePostMetadataUnstampedCommand(createPostsRepository());
      const result = await updatePostMetadataUnstamped({ postId: id, metadata: newMetadata }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

### §4f — `toggleCropToGrid` (OLD = current L3843–3852, 10 lines → NEW 5 lines)

OLD:

```ts
      const { error } = await supabase
        .from('padlets')
        .update({
          metadata: { ...padlet.metadata, cropToGrid: newValue },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      fetchData();
```

NEW:

```ts
      const updatePostMetadata = createUpdatePostMetadataCommand(createPostsRepository());
      const result = await updatePostMetadata({ postId: id, metadata: { ...padlet.metadata, cropToGrid: newValue } }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
      fetchData();
```

### §4g — `movePadletLayer` (OLD = current L3890–3896, 7 lines → NEW 5 lines; UNSTAMPED)

OLD:

```ts
      const newMetadata = { ...padlet.metadata, zIndex: newZ };
      const { error } = await supabase
        .from('padlets')
        .update({ metadata: newMetadata })
        .eq('id', id);

      if (error) throw error;
```

NEW:

```ts
      const newMetadata = { ...padlet.metadata, zIndex: newZ };
      const updatePostMetadataUnstamped = createUpdatePostMetadataUnstampedCommand(createPostsRepository());
      const result = await updatePostMetadataUnstamped({ postId: id, metadata: newMetadata }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

---

## 5. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 5.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 3004547ed03099afa2b0b07c0bd602381fd8d58a
git hash-object lib/domain/canvas/posts.ts                     # f6028d3edeb0caa66be517825eef35348b6fdf38
git hash-object lib/domain/canvas/posts.test.ts                # 5fa6a2736d8c9d50dd9816e23561a88927a5d5cf
# UNCHANGED files (same hashes as §1):
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts
# every row: i/lf    w/lf
```

### 5.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8475
grep -c '^[[:space:]]*$' "$F"             # 723  (unchanged — removed and added blanks cancel INSIDE the bound blocks; the hash gate is the content proof)
grep -c "\.from('padlets')" "$F"          # 24
grep -c '\.from("padlets")' "$F"          # 0   (double-quote variant EXTINCT)
grep -c "createUpdatePostMetadataCommand" "$F"           # 6   (1 import + 5 uses: addImageToLink + §4b/§4c/§4d/§4f)
grep -c "createUpdatePostMetadataUnstampedCommand" "$F"  # 3   (1 import + 2 uses: §4e/§4g)
grep -c "updatePostMetadataUnstamped" "$F"               # 4   (case-sensitive: the two locals' declare+call lines)
grep -c "updatePostMetadata" "$F"         # 14  (superstring matches included — measured)
grep -c "createPostsRepository" "$F"      # 32
grep -c "userId: null" "$F"               # 40
grep -c "containerResult" "$F"            # 10
grep -c "wallPosition" "$F"               # 13  (unchanged)
grep -c "newMetadata" "$F"                # 16  (unchanged)
grep -c "fullMetadata" "$F"               # 2   (unchanged)
grep -c "newChildren" "$F"                # 3   (unchanged)
grep -c "cropToGrid" "$F"                 # 2   (unchanged)
grep -c "markPadletLocallyModified" "$F"  # 11  (unchanged)
```

### 5.2 Lib-file identity + suite

```bash
wc -l lib/domain/canvas/posts.ts          # 329
wc -l lib/domain/canvas/posts.test.ts     # 741
grep -c "it(" lib/domain/canvas/posts.test.ts   # 39
git diff lib/domain/canvas/posts.ts | grep -c "^-[^-]"   # 0  (pure additions)
```

### 5.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- lib/infra/canvas lib/infra/supabase
git diff -- components/collabboard/PostCardContent.tsx "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/domain/boards/repository.ts lib/domain/core eslint.boundaries.config.mjs
git status --short   # exactly the 3 scoped files (M); ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 6. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§4, then §5 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **160 passed (160), 24 files**; full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 7. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 3 staged M lines; anything else = STOP
git commit -m "refactor(canvas): extract the honest-contract padlets UPDATE slice onto the posts aggregate -- six named-function sites, canvas.updatePostMetadataUnstamped, Pattern K (PATCH-031)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 8. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the blank census holds at 723 by
in-block cancellation (§5.1 — the hash gate, not the count, is the content
proof); commitPadletMeta's ignored Result + bound comment (§0.4.2); the two
unstamped writes stay unstamped (§0.3); both dependency arrays keep their
unused `supabase` entries (§0.4.5); ZERO new casts.

STOP if: any §1 gate mismatches; any OLD block fails byte-match at its
bound lines; any bound test fails (never edit a test); any §5.0 hash
mismatches after one fix attempt against the fences; `git status --short`
shows any path outside the THREE scoped files; tsc/boundaries/unit/e2e fail
beyond the stale-`.next/types` cure.

Do NOT: touch the NINE deferred named UPDATE sites (§0.1), the 14 JSX
UPDATE sites, the lone select, the auth trio, the hooks, FreeformPadletCards,
or any infra file; create files; add repo methods; de-lint types; chase the
grandfather list (stays 2).
