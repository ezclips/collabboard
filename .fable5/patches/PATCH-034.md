# PATCH-034 — CanvasClient strangler group 9: the position-write pair (new seam — `canvas.updatePostPosition` + `canvas.updatePostPositionWithMetadataBestEffort`)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, tenth application; see §0.5)
**Pattern:** K — canvas ops command (§5.11), NEW CAPABILITY extension: one new repository method + two new domain commands (the first infra change since PATCH-029)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (TWO bound blocks + one import edit), `lib/domain/canvas/posts.ts`, `lib/domain/canvas/posts.test.ts`, `lib/infra/canvas/postsRepository.ts`, `lib/infra/canvas/postsRepository.test.ts` — **FIVE files total.**
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `92c1b1f`; all four domain/infra files compiled (`tsc --strict`) and run (67/67 green: 51 posts + 16 postsRepository) in scratch; both CanvasClient blocks applied to a scratch copy and every gate below measured on that simulation, including the bound post-edit hashes.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Bound tests are the
> fidelity net — never edit one; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 Site analysis: the four deferred column-shape sites, one coherent seam chosen

Post-033 census (regenerated 2026-07-10 at `92c1b1f`): 4 padlets UPDATE
remain (all deferred by PATCH-033), 1 select. Full read of all four:

| Site | Handler | Write shape | Legacy contract |
|---|---|---|---|
| L6015 | freeform detach, padlet leg | `metadata` + `position_x` + `position_y` + `updated_at` (ONE statement) | bare await, no check — only a THROWN error reaches the outer `catch` (no rollback either way) |
| L6473 | canvas drop repositioning | `position_x` + `position_y` + `updated_at` ONLY (no metadata key) | check-and-branch: resolved error → explicit rollback; thrown error escapes to an OUTER catch with NO rollback (asymmetric) |
| L6962/L6974 (paired SELECT + UPDATE) | map `onUpdateChildComments` | read-then-write: SELECT `metadata`, merge, then `metadata` + conditional `content` + `updated_at` | bare await write (no check) inside try → thrown reaches catch (console.error + toast + fetchData) |
| L7585 | clipart title clear | `{ title: '' }` ONLY | bare await, NO enclosing try/catch at all — a thrown error propagates as an unhandled rejection and skips four trailing `set*` calls |

**Ruling: the position pair (L6015 padlet leg + L6473) is the smallest
coherent next seam.** Both writes need the SAME new repository capability
(`updatePosition`); nothing else in this batch shares a capability with
anything else:

- The map-comments site needs a repository method that ALSO carries the
  `content` column, and its read side is a genuine SELECT — extracting it
  cleanly means either inventing a repository READ method (crossing into
  the hooks/read-phase the site map has deliberately deferred) or keeping
  the SELECT raw and only wrapping the write (viable, but a DIFFERENT new
  repository method — `content`-carrying, not position-carrying). Its own
  patch.
- The title-clear site needs a `title`-only repository method — a third,
  unrelated shape. Its own patch (or folds into a future title/rename
  command if one emerges elsewhere).
- Position, by contrast, is used TWICE with related-but-distinct combos
  (bundled with metadata vs. alone) — exactly the shape of prior coherent
  groups (030's storage pair, 034... itself). One new repository method
  serves both call sites; two thin commands wrap it, mirroring the EXISTING
  metadata quartet's honest/best-effort split.

The other three sites (map-comments+select, title-clear) are DEFERRED and
named for their own future patches — not folded in, not "discovered" for
the first time.

### 0.2 Repository design: ONE method, conditional metadata inclusion

`PostsRepository.updatePosition(id, fields: PostPositionWriteFields)` where
`metadata` is OPTIONAL on the fields type. The repository OMITS the
`metadata` key from the update payload entirely when not provided (spread-
conditional, matching the house idiom already used at the legacy call site
itself for the `content` field) — this is the exact legacy fact for L6473
(no metadata key ever appears in that statement) and exactly matches L6015
(metadata always present, bundled in the SAME statement as position). Pinned
by bound tests on BOTH the repository (`Object.keys` assertions on both
call shapes) and the two domain commands.

### 0.3 Command design: mirrors the existing honest/best-effort split

- **`canvas.updatePostPosition`** (HONEST) — `{ postId, positionX, positionY }`,
  no metadata. Serves L6473. **AUTHORIZED MICRO-CHANGE (the program's third,
  after 024 and the 032/033 triplet):** legacy's resolved-error branch
  (explicit position rollback) is preserved byte-for-byte; the previously-
  UNHANDLED thrown-mode path (which reached an outer catch with NO
  rollback — a `P3` lost-work risk, since the optimistic position would
  visually stick on a failed write) now converges onto the SAME rollback
  branch, because the honest command turns a thrown network exception into
  the same `Result` shape as a resolved one. Convergence criteria verified
  per the same standard as 032/033: only the FAILURE-side branch content
  changes source (`error` → `result.error.cause ?? result.error`); the
  rollback code itself, the console message format, and the success path
  are byte-identical.
- **`canvas.updatePostPositionWithMetadataBestEffort`** — `{ postId,
  positionX, positionY, metadata }`. Serves L6015. Preserves the legacy
  bare-await swallow exactly (resolved errors ignored, thrown escapes to
  the SAME outer catch with the SAME no-rollback fact) — a CONSUMER of a
  NEW command-internal-swallow site. This is the SEVENTH command-internal
  swallow site (extending the standing P3 family from six to seven,
  alongside `reorderSections`/`setChronoMode`/`attachPostToSchedulerContainer`/
  `createSchedulerContainerWithPost`/`updatePostMetadataBestEffort`/
  `updatePostMetadataUnstampedBestEffort`).

### 0.4 Preserved semantics + disclosed facts (confirm, don't re-justify)

1. Both sites' surrounding math stays byte-identical: L6015 keeps
   `Math.max(0, x)` / `Math.max(0, y)` (NOT rounded); L6473 keeps
   `Math.round(newX)` / `Math.round(newY)` (already clamped upstream via
   `Math.max(0, dropX - offsetX)`). Only the write STATEMENT swaps.
2. L6015's optimistic `setPadlets` (padlet leg) and the container leg
   (already on `updatePostMetadataBestEffort` since PATCH-033) stay
   untouched; only the padlet-leg WRITE statement is bound.
3. L6473's `oldX`/`oldY` rollback snapshot, the enclosing outer
   `catch (err) { console.error('Canvas Drop Error', err); }`, and the
   blank line before `// Background sync to Supabase` all stay untouched.
4. ZERO new casts. `newMetadata` (L6015) and the command inputs are typed
   objects; no `as` anywhere in the new lines.
5. The repository's conditional-metadata spread is the SAME
   `...(condition ? {...} : {})` idiom the legacy map-comments site already
   uses for its `content` field — house-consistent, not a new pattern.

### 0.5 Model: GPT-5.4, Pattern K tenth application

New surface, but narrow and precisely bindable: one repository method (19
lines), two schemas + two commands (≈45 lines), one new type export. 67
bound tests (9 new: 3+3 domain, 3 infra; 58 existing re-run non-breaking)
compiled and run GREEN at authoring. Both swap shapes compile-verified
against the live domain module. No settle-order ambiguity (single-write
sites, no `Promise.all`).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # 92c1b1f (or a descendant touching none of the 5 scoped files)
```

Byte-identity (all five files):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 5d056b330f9851d249f3e1bacfcb54d0c7bb3599
git hash-object lib/domain/canvas/posts.ts                     # f6a6420c034d62b7146854e8e0eddd1f59ba9ad2
git hash-object lib/domain/canvas/posts.test.ts                # 057719276144c60c933d64376a5c83666b73b221
git hash-object lib/infra/canvas/postsRepository.ts             # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
```

CanvasClient census (measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8404
grep -c '^[[:space:]]*$' "$F"             # 730
grep -c "\.from('padlets')" "$F"          # 5
grep -c "createUpdatePostPositionCommand" "$F"                       # 0
grep -c "createUpdatePostPositionWithMetadataBestEffortCommand" "$F" # 0
grep -c "updatePostPosition" "$F"         # 0
grep -c "createPostsRepository" "$F"      # 49
grep -c "userId: null" "$F"               # 59
grep -c "result.error.cause" "$F"         # 37
grep -c "positionX\|positionY" "$F"       # 4   (Math.round/Math.max variable names only — measured)
grep -c "supabase" "$F"                   # 38
```

Anchors:

```bash
sed -n '6015p' "$F"   #                   .from('padlets')
sed -n '6473p' "$F"   #                       .from('padlets')
```

Repo-wide new-name collision (must print 0):

```bash
grep -rn "canvas.updatePostPosition\|createUpdatePostPositionCommand\|createUpdatePostPositionWithMetadataBestEffortCommand\|PostPositionWriteFields" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 166 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (whole file, exact, 442 lines; CTO compile+test verified; post-edit hash `8f66c62c7a4cc82142d502d15b3bc8d3b3b6335b`)

The diff vs current is an interface insertion (`PostPositionWriteFields` +
one `PostsRepository` method line) plus two commands appended at EOF —
everything else stays byte-identical. Replace the file with exactly:

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

/**
 * The position-write payload (PATCH-034). `metadata` is OPTIONAL: one legacy
 * site writes position alone (no metadata key at all), the other writes
 * position bundled with a metadata update in the SAME statement - the
 * repository omits the key entirely when absent, matching each site exactly.
 */
export interface PostPositionWriteFields {
  readonly positionX: number;
  readonly positionY: number;
  readonly updatedAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PostsRepository {
  updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>>;
  updateMetadata(id: PostId, fields: PostMetadataWriteFields): Promise<Result<void, DomainError>>;
  /** Legacy groupIntoColumn parent-write sends NO updated_at (old L3665) - dedicated method. */
  updateMetadataUnstamped(
    id: PostId,
    fields: { readonly metadata: Record<string, unknown> },
  ): Promise<Result<void, DomainError>>;
  updatePosition(id: PostId, fields: PostPositionWriteFields): Promise<Result<void, DomainError>>;
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

export const updatePostPositionSchema = z.object({
  postId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
});

/**
 * The HONEST position write (PATCH-034): the legacy call site read the
 * resolved error and rolled the optimistic position back; a thrown
 * exception previously escaped uncaught with NO rollback (a legacy
 * asymmetry). The command converts both channels through the same Result,
 * so the call site's single failure branch now covers both - the P3
 * repair (never lose user work) applied identically to PATCH-024/032/033.
 */
export const createUpdatePostPositionCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostPosition',
    input: updatePostPositionSchema,
    execute: async (input) =>
      repository.updatePosition(asPostId(input.postId), {
        positionX: input.positionX,
        positionY: input.positionY,
        updatedAt: new Date().toISOString(),
      }),
  });

export const updatePostPositionWithMetadataBestEffortSchema = z.object({
  postId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  /** The post's NEW metadata, parentId already removed at the call site (legacy shape). */
  metadata: z.record(z.string(), z.unknown()),
});

export const createUpdatePostPositionWithMetadataBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostPositionWithMetadataBestEffort',
    input: updatePostPositionWithMetadataBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-034; queued P3-family fix, do NOT
      // repair here): the legacy detach handler awaited this combined
      // position+metadata write bare - resolved DB errors were silently
      // swallowed; only a THROWN network error surfaced (escapes execute,
      // caught by defineCommand).
      await repository.updatePosition(asPostId(input.postId), {
        positionX: input.positionX,
        positionY: input.positionY,
        updatedAt: new Date().toISOString(),
        metadata: input.metadata,
      });
      return ok(undefined);
    },
  });
```

## 3. BOUND FILE 2 — `lib/domain/canvas/posts.test.ts` (whole file, exact, 949 lines, 51 tests — 45 existing + 6 new; CTO ran 51/51 GREEN; post-edit hash `900f45fb0a14d5b2e7682386c217accf6b503dd3`)

The diff vs current: the import block gains two names, the fake
repository gains an `updatePosition` call collector + result setter +
method, and two describe blocks are appended at EOF. Replace the file with
exactly:

```ts
import { describe, expect, it } from 'vitest';
import {
  createAttachPostToSchedulerContainerCommand,
  createCreateContainerWithPostCommand,
  createCreatePostAndSelectCommand,
  createCreatePostCommand,
  createCreateSchedulerContainerWithPostCommand,
  createDeleteChildPostsCommand,
  createDeleteContainerChildCommand,
  createDeletePostCommand,
  createDeletePostsCommand,
  createGroupPostIntoContainerCommand,
  createToggleTaskCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedBestEffortCommand,
  createUpdatePostMetadataUnstampedCommand,
  createUpdatePostPositionCommand,
  createUpdatePostPositionWithMetadataBestEffortCommand,
} from './posts';
import type {
  PostMetadataWriteFields,
  PostPositionWriteFields,
  PostsRepository,
  PostTasksWriteFields,
} from './posts';
import type { PostId } from '../core/ids';
import type { DomainError } from '../core/errors';
import { domainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';

const ctx = { userId: null };

const groceriesMetadata = {
  todoTitle: 'Groceries',
  tasks: [
    { id: 'task-1', text: 'milk', completed: false },
    { id: 'task-2', text: 'bread', completed: false, dueDate: '2026-07-10', assignee: 'sam' },
  ],
};

function createFakeRepository() {
  const updateTasksCalls: Array<{ id: PostId; fields: PostTasksWriteFields }> = [];
  const updateMetadataCalls: Array<{ id: PostId; fields: PostMetadataWriteFields }> = [];
  const deleteByIdCalls: PostId[] = [];
  const deleteByIdsCalls: Array<readonly PostId[]> = [];
  const deleteByParentIdCalls: PostId[] = [];
  const updateMetadataUnstampedCalls: Array<{
    id: PostId;
    fields: { readonly metadata: Record<string, unknown> };
  }> = [];
  const updatePositionCalls: Array<{ id: PostId; fields: PostPositionWriteFields }> = [];
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  let updateTasksResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdsResult: Result<void, DomainError> = ok(undefined);
  let deleteByParentIdResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataUnstampedResult: Result<void, DomainError> = ok(undefined);
  let updatePositionResult: Result<void, DomainError> = ok(undefined);
  const insertResultQueue: Array<Result<void, DomainError>> = [];
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok(null);

  const repository: PostsRepository = {
    updateTasks: async (id, fields) => {
      updateTasksCalls.push({ id, fields });
      return updateTasksResult;
    },
    updateMetadata: async (id, fields) => {
      updateMetadataCalls.push({ id, fields });
      return updateMetadataResult;
    },
    updateMetadataUnstamped: async (id, fields) => {
      updateMetadataUnstampedCalls.push({ id, fields });
      return updateMetadataUnstampedResult;
    },
    updatePosition: async (id, fields) => {
      updatePositionCalls.push({ id, fields });
      return updatePositionResult;
    },
    deleteById: async (id) => {
      deleteByIdCalls.push(id);
      return deleteByIdResult;
    },
    deleteByIds: async (ids) => {
      deleteByIdsCalls.push(ids);
      return deleteByIdsResult;
    },
    deleteByParentId: async (parentId) => {
      deleteByParentIdCalls.push(parentId);
      return deleteByParentIdResult;
    },
    insert: async (row) => {
      insertCalls.push(row);
      return insertResultQueue.shift() ?? ok(undefined);
    },
    insertReturning: async (row) => {
      insertReturningCalls.push(row);
      return insertReturningResult;
    },
  };

  return {
    repository,
    updateTasksCalls,
    updateMetadataCalls,
    updateMetadataUnstampedCalls,
    updatePositionCalls,
    deleteByIdCalls,
    deleteByIdsCalls,
    deleteByParentIdCalls,
    insertCalls,
    insertReturningCalls,
    setUpdateTasksResult(result: Result<void, DomainError>) {
      updateTasksResult = result;
    },
    setUpdateMetadataResult(result: Result<void, DomainError>) {
      updateMetadataResult = result;
    },
    setUpdateMetadataUnstampedResult(result: Result<void, DomainError>) {
      updateMetadataUnstampedResult = result;
    },
    setUpdatePositionResult(result: Result<void, DomainError>) {
      updatePositionResult = result;
    },
    setDeleteByIdResult(result: Result<void, DomainError>) {
      deleteByIdResult = result;
    },
    setDeleteByIdsResult(result: Result<void, DomainError>) {
      deleteByIdsResult = result;
    },
    setDeleteByParentIdResult(result: Result<void, DomainError>) {
      deleteByParentIdResult = result;
    },
    queueInsertResults(...results: Array<Result<void, DomainError>>) {
      insertResultQueue.push(...results);
    },
    setInsertReturningResult(result: Result<Record<string, unknown> | null, DomainError>) {
      insertReturningResult = result;
    },
  };
}

describe('canvas.toggleTask', () => {
  it('flips completed on the matching task only and preserves every other field', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-2', metadata: groceriesMetadata },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(updateTasksCalls).toHaveLength(1);
    expect(updateTasksCalls[0].id).toBe('post-1');
    expect(updateTasksCalls[0].fields.metadata.tasks).toEqual([
      { id: 'task-1', text: 'milk', completed: false },
      { id: 'task-2', text: 'bread', completed: true, dueDate: '2026-07-10', assignee: 'sam' },
    ]);
  });

  it('writes content as the stringified updated tasks and keeps the rest of metadata', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    await toggleTask({ postId: 'post-1', taskId: 'task-1', metadata: groceriesMetadata }, ctx);

    const { fields } = updateTasksCalls[0];
    expect(fields.content).toBe(JSON.stringify(fields.metadata.tasks));
    expect(fields.metadata.todoTitle).toBe('Groceries');
    expect(new Date(fields.updatedAt).toISOString()).toBe(fields.updatedAt);
  });

  it('writes an empty task list when metadata has no tasks (legacy || [] path)', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: { todoTitle: 'Empty' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(updateTasksCalls[0].fields.content).toBe('[]');
    expect(updateTasksCalls[0].fields.metadata).toEqual({ todoTitle: 'Empty', tasks: [] });
  });

  it('rejects a truthy non-array tasks value without writing', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: { tasks: 'corrupt' } },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(updateTasksCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const { repository, setUpdateTasksResult } = createFakeRepository();
    setUpdateTasksResult(err(domainError('unavailable', 'db down')));
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask(
      { postId: 'post-1', taskId: 'task-1', metadata: groceriesMetadata },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects invalid input without calling the repository', async () => {
    const { repository, updateTasksCalls } = createFakeRepository();
    const toggleTask = createToggleTaskCommand(repository);

    const result = await toggleTask({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(updateTasksCalls).toHaveLength(0);
  });
});

describe('canvas.deletePost', () => {
  it('deletes exactly the given post', async () => {
    const fake = createFakeRepository();
    const deletePost = createDeletePostCommand(fake.repository);

    const result = await deletePost({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteByIdCalls).toEqual(['post-1']);
    expect(fake.deleteByIdsCalls).toHaveLength(0);
    expect(fake.deleteByParentIdCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setDeleteByIdResult(err(domainError('unavailable', 'db down')));
    const deletePost = createDeletePostCommand(fake.repository);

    const result = await deletePost({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.deletePosts', () => {
  it('deletes exactly the given id list in order', async () => {
    const fake = createFakeRepository();
    const deletePosts = createDeletePostsCommand(fake.repository);

    const result = await deletePosts({ postIds: ['post-1', 'post-2', 'post-3'] }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteByIdsCalls).toEqual([['post-1', 'post-2', 'post-3']]);
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setDeleteByIdsResult(err(domainError('unavailable', 'db down')));
    const deletePosts = createDeletePostsCommand(fake.repository);

    const result = await deletePosts({ postIds: ['post-1'] }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.deleteChildPosts', () => {
  it('deletes by the parent id', async () => {
    const fake = createFakeRepository();
    const deleteChildPosts = createDeleteChildPostsCommand(fake.repository);

    const result = await deleteChildPosts({ parentId: 'container-1' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.deleteByParentIdCalls).toEqual(['container-1']);
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setDeleteByParentIdResult(err(domainError('unavailable', 'db down')));
    const deleteChildPosts = createDeleteChildPostsCommand(fake.repository);

    const result = await deleteChildPosts({ parentId: 'container-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.deleteContainerChild', () => {
  it('writes the wholesale merged container metadata with an ISO stamp, THEN deletes the child', async () => {
    const fake = createFakeRepository();
    const deleteContainerChild = createDeleteContainerChildCommand(fake.repository);

    const result = await deleteContainerChild(
      {
        containerId: 'container-1',
        childId: 'child-2',
        containerMetadata: { title: 'Box', childPadletIds: ['child-1', 'child-2'] },
        childPadletIds: ['child-1'],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
    expect(fake.updateMetadataCalls[0].id).toBe('container-1');
    expect(fake.updateMetadataCalls[0].fields.metadata).toEqual({
      title: 'Box',
      childPadletIds: ['child-1'],
    });
    expect(new Date(fake.updateMetadataCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updateMetadataCalls[0].fields.updatedAt,
    );
    expect(fake.deleteByIdCalls).toEqual(['child-2']);
  });

  it('passes childPadletIds through verbatim, adding the key even when it was absent (legacy || [] fact)', async () => {
    const fake = createFakeRepository();
    const deleteContainerChild = createDeleteContainerChildCommand(fake.repository);

    const result = await deleteContainerChild(
      {
        containerId: 'container-1',
        childId: 'child-1',
        containerMetadata: { title: 'Box' },
        childPadletIds: [],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls[0].fields.metadata).toEqual({
      title: 'Box',
      childPadletIds: [],
    });
  });

  it('aborts the child delete when the container write fails (first-failure-wins)', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataResult(err(domainError('unavailable', 'db down')));
    const deleteContainerChild = createDeleteContainerChildCommand(fake.repository);

    const result = await deleteContainerChild(
      {
        containerId: 'container-1',
        childId: 'child-1',
        containerMetadata: {},
        childPadletIds: [],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });

  it('propagates a child-delete failure after the container write already landed', async () => {
    const fake = createFakeRepository();
    fake.setDeleteByIdResult(err(domainError('unavailable', 'db down')));
    const deleteContainerChild = createDeleteContainerChildCommand(fake.repository);

    const result = await deleteContainerChild(
      {
        containerId: 'container-1',
        childId: 'child-1',
        containerMetadata: {},
        childPadletIds: [],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
    expect(fake.updateMetadataCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const deleteContainerChild = createDeleteContainerChildCommand(fake.repository);

    const result = await deleteContainerChild(
      { containerId: 'container-1', containerMetadata: {}, childPadletIds: [] },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateMetadataCalls).toHaveLength(0);
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });
});


describe('canvas.createPost', () => {
  it('passes the row through verbatim - no added fields, no timestamps', async () => {
    const fake = createFakeRepository();
    const createPost = createCreatePostCommand(fake.repository);
    const row = { id: 'post-1', board_id: 'board-1', title: 'Hello', metadata: { a: 1 } };

    const result = await createPost({ row }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([row]);
    expect(fake.insertCalls[0]).toBe(row);
    expect(fake.insertReturningCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(err(domainError('unavailable', 'db down')));
    const createPost = createCreatePostCommand(fake.repository);

    const result = await createPost({ row: { id: 'post-1' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects a non-object row without calling the repository', async () => {
    const fake = createFakeRepository();
    const createPost = createCreatePostCommand(fake.repository);

    const result = await createPost({ row: 42 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertCalls).toHaveLength(0);
  });
});

describe('canvas.createPostAndSelect', () => {
  it('returns the inserted row exactly as the repository shapes it', async () => {
    const fake = createFakeRepository();
    const insertedRow = { id: 'post-1', board_id: 'board-1', title: 'Hello' };
    fake.setInsertReturningResult(ok(insertedRow));
    const createPostAndSelect = createCreatePostAndSelectCommand(fake.repository);
    const row = { id: 'post-1', board_id: 'board-1', title: 'Hello' };

    const result = await createPostAndSelect({ row }, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(insertedRow);
    }
    expect(fake.insertReturningCalls).toEqual([row]);
    expect(fake.insertCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(err(domainError('unavailable', 'db down')));
    const createPostAndSelect = createCreatePostAndSelectCommand(fake.repository);

    const result = await createPostAndSelect({ row: { id: 'post-1' } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('canvas.createContainerWithPost', () => {
  const containerRow = { id: 'container-1', type: 'container' };
  const postRow = { id: 'post-1', metadata: { parentId: 'container-1' } };

  it('inserts the container FIRST, then the post', async () => {
    const fake = createFakeRepository();
    const createContainerWithPost = createCreateContainerWithPostCommand(fake.repository);

    const result = await createContainerWithPost({ containerRow, postRow }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([containerRow, postRow]);
  });

  it('a resolved container failure ABORTS the post insert (first-failure-wins)', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(err(domainError('unavailable', 'db down')));
    const createContainerWithPost = createCreateContainerWithPostCommand(fake.repository);

    const result = await createContainerWithPost({ containerRow, postRow }, ctx);

    expect(result.ok).toBe(false);
    expect(fake.insertCalls).toHaveLength(1);
  });

  it('a post failure propagates after the container already landed (no rollback)', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(ok(undefined), err(domainError('unavailable', 'db down')));
    const createContainerWithPost = createCreateContainerWithPostCommand(fake.repository);

    const result = await createContainerWithPost({ containerRow, postRow }, ctx);

    expect(result.ok).toBe(false);
    expect(fake.insertCalls).toHaveLength(2);
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });
});

describe('canvas.groupPostIntoContainer', () => {
  const containerRow = { id: 'container-1', type: 'container', metadata: { childPadletIds: ['post-1'] } };

  it('inserts the container returning its row, THEN writes the post metadata WITHOUT a timestamp', async () => {
    const fake = createFakeRepository();
    const returnedRow = { id: 'container-1', type: 'container' };
    fake.setInsertReturningResult(ok(returnedRow));
    const groupPostIntoContainer = createGroupPostIntoContainerCommand(fake.repository);

    const result = await groupPostIntoContainer(
      {
        containerRow,
        postId: 'post-1',
        postMetadata: { cardColor: '#fff', parentId: 'container-1' },
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(returnedRow);
    }
    expect(fake.insertReturningCalls).toEqual([containerRow]);
    expect(fake.updateMetadataUnstampedCalls).toEqual([
      { id: 'post-1', fields: { metadata: { cardColor: '#fff', parentId: 'container-1' } } },
    ]);
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('a resolved container failure aborts the metadata write', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(err(domainError('unavailable', 'db down')));
    const groupPostIntoContainer = createGroupPostIntoContainerCommand(fake.repository);

    const result = await groupPostIntoContainer(
      { containerRow, postId: 'post-1', postMetadata: {} },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(0);
  });

  it('a metadata-write failure propagates after the container already landed (no rollback)', async () => {
    const fake = createFakeRepository();
    fake.setInsertReturningResult(ok({ id: 'container-1' }));
    fake.setUpdateMetadataUnstampedResult(err(domainError('unavailable', 'db down')));
    const groupPostIntoContainer = createGroupPostIntoContainerCommand(fake.repository);

    const result = await groupPostIntoContainer(
      { containerRow, postId: 'post-1', postMetadata: {} },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(fake.insertReturningCalls).toHaveLength(1);
    expect(fake.deleteByIdCalls).toHaveLength(0);
  });
});

describe('canvas.attachPostToSchedulerContainer', () => {
  const input = {
    postRow: { id: 'post-1', metadata: { parentId: 'container-1' } },
    containerId: 'container-1',
    containerMetadata: { start_date: 's', childPadletIds: ['old-1'] },
    childPadletIds: ['post-1', 'old-1'],
    updatedAt: '2026-07-10T09:00:00.000Z',
  };

  it('inserts the post, then updates the container with the merged metadata and the INPUT timestamp', async () => {
    const fake = createFakeRepository();
    const attach = createAttachPostToSchedulerContainerCommand(fake.repository);

    const result = await attach(input, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([input.postRow]);
    expect(fake.updateMetadataCalls).toEqual([
      {
        id: 'container-1',
        fields: {
          metadata: { start_date: 's', childPadletIds: ['post-1', 'old-1'] },
          updatedAt: '2026-07-10T09:00:00.000Z',
        },
      },
    ]);
  });

  it('preserves the legacy swallow: a resolved insert failure still returns ok and the update still runs', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(err(domainError('unavailable', 'db down')));
    const attach = createAttachPostToSchedulerContainerCommand(fake.repository);

    const result = await attach(input, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
  });

  it('preserves the legacy swallow: a resolved update failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataResult(err(domainError('unavailable', 'db down')));
    const attach = createAttachPostToSchedulerContainerCommand(fake.repository);

    const result = await attach(input, ctx);

    expect(result.ok).toBe(true);
  });
});

describe('canvas.createSchedulerContainerWithPost', () => {
  const containerRow = { id: 'container-1', type: 'container' };
  const postRow = { id: 'post-1', metadata: { parentId: 'container-1' } };

  it('inserts the container, then the post', async () => {
    const fake = createFakeRepository();
    const create = createCreateSchedulerContainerWithPostCommand(fake.repository);

    const result = await create({ containerRow, postRow }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([containerRow, postRow]);
  });

  it('preserves the legacy swallow: a resolved container failure still returns ok and the post insert still runs', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(err(domainError('unavailable', 'db down')));
    const create = createCreateSchedulerContainerWithPostCommand(fake.repository);

    const result = await create({ containerRow, postRow }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(2);
  });
});

describe('canvas.updatePostMetadata', () => {
  it('writes the metadata verbatim with a fresh ISO timestamp to the right post', async () => {
    const fake = createFakeRepository();
    const updatePostMetadata = createUpdatePostMetadataCommand(fake.repository);

    const result = await updatePostMetadata(
      { postId: 'post-1', metadata: { linkImage: 'https://x.test/img.png', linkUrl: 'https://x.test' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
    expect(fake.updateMetadataCalls[0].id).toBe('post-1');
    expect(fake.updateMetadataCalls[0].fields.metadata).toEqual({
      linkImage: 'https://x.test/img.png',
      linkUrl: 'https://x.test',
    });
    expect(new Date(fake.updateMetadataCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updateMetadataCalls[0].fields.updatedAt,
    );
    expect(fake.updateMetadataUnstampedCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataResult(err(domainError('unavailable', 'db down')));
    const updatePostMetadata = createUpdatePostMetadataCommand(fake.repository);

    const result = await updatePostMetadata({ postId: 'post-1', metadata: {} }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const updatePostMetadata = createUpdatePostMetadataCommand(fake.repository);

    const result = await updatePostMetadata({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });
});

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

describe('canvas.updatePostPosition', () => {
  it('writes ONLY position and a fresh ISO timestamp - no metadata key', async () => {
    const fake = createFakeRepository();
    const updatePostPosition = createUpdatePostPositionCommand(fake.repository);

    const result = await updatePostPosition({ postId: 'post-1', positionX: 120, positionY: 45 }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updatePositionCalls).toHaveLength(1);
    expect(fake.updatePositionCalls[0].id).toBe('post-1');
    expect(fake.updatePositionCalls[0].fields.positionX).toBe(120);
    expect(fake.updatePositionCalls[0].fields.positionY).toBe(45);
    expect(fake.updatePositionCalls[0].fields.metadata).toBeUndefined();
    expect(Object.keys(fake.updatePositionCalls[0].fields)).toEqual([
      'positionX',
      'positionY',
      'updatedAt',
    ]);
    expect(new Date(fake.updatePositionCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updatePositionCalls[0].fields.updatedAt,
    );
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setUpdatePositionResult(err(domainError('unavailable', 'db down')));
    const updatePostPosition = createUpdatePostPositionCommand(fake.repository);

    const result = await updatePostPosition({ postId: 'post-1', positionX: 0, positionY: 0 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const updatePostPosition = createUpdatePostPositionCommand(fake.repository);

    const result = await updatePostPosition({ postId: 'post-1', positionX: 0 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updatePositionCalls).toHaveLength(0);
  });
});

describe('canvas.updatePostPositionWithMetadataBestEffort', () => {
  it('writes position AND metadata with a fresh ISO timestamp and returns ok', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostPositionWithMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort(
      { postId: 'post-1', positionX: 80, positionY: 30, metadata: { sectionId: 's-1' } },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updatePositionCalls).toHaveLength(1);
    expect(fake.updatePositionCalls[0].id).toBe('post-1');
    expect(fake.updatePositionCalls[0].fields.positionX).toBe(80);
    expect(fake.updatePositionCalls[0].fields.positionY).toBe(30);
    expect(fake.updatePositionCalls[0].fields.metadata).toEqual({ sectionId: 's-1' });
    expect(Object.keys(fake.updatePositionCalls[0].fields)).toEqual([
      'positionX',
      'positionY',
      'updatedAt',
      'metadata',
    ]);
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdatePositionResult(err(domainError('unavailable', 'db down')));
    const bestEffort = createUpdatePostPositionWithMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort(
      { postId: 'post-1', positionX: 0, positionY: 0, metadata: {} },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updatePositionCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostPositionWithMetadataBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', positionX: 0, positionY: 0 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updatePositionCalls).toHaveLength(0);
  });
});
```

## 4. BOUND FILE 3 — `lib/infra/canvas/postsRepository.ts` (whole file, exact, 205 lines; CTO compile+test verified; post-edit hash `1b5d496785006f7b14820bab67046595589a7eda`)

The diff vs current: the import gains `PostPositionWriteFields`, the
`update()` payload union gains a fourth member, and one new method is
inserted before `deleteById`. Replace the file with exactly:

```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { PostId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type {
  PostMetadataWriteFields,
  PostPositionWriteFields,
  PostsRepository,
  PostTasksWriteFields,
} from '../../domain/canvas/posts';
import { createBrowserSupabaseClient } from '../supabase/browserClient';

interface SupabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
}

interface PostsUpdateQuery {
  eq(column: 'id', value: PostId): Promise<{ error: SupabaseErrorLike | null }>;
}

interface PostsDeleteQuery {
  eq(
    column: 'id' | 'metadata->>parentId',
    value: PostId,
  ): Promise<{ error: SupabaseErrorLike | null }>;
  in(column: 'id', values: readonly PostId[]): Promise<{ error: SupabaseErrorLike | null }>;
}

/**
 * The insert builder is awaited directly for plain inserts (thenable) and
 * chained .select().single() when the caller consumes the inserted row -
 * both legacy shapes.
 */
interface PostsInsertQuery extends PromiseLike<{ error: SupabaseErrorLike | null }> {
  select(): {
    single(): Promise<{
      data: Record<string, unknown> | null;
      error: SupabaseErrorLike | null;
    }>;
  };
}

interface PostsSupabaseClient {
  from(table: 'padlets'): {
    update(
      payload:
        | {
            content: PostTasksWriteFields['content'];
            metadata: PostTasksWriteFields['metadata'];
            updated_at: PostTasksWriteFields['updatedAt'];
          }
        | {
            metadata: PostMetadataWriteFields['metadata'];
            updated_at: PostMetadataWriteFields['updatedAt'];
          }
        | { metadata: Record<string, unknown> }
        | {
            position_x: number;
            position_y: number;
            updated_at: string;
            metadata?: Record<string, unknown>;
          },
    ): PostsUpdateQuery;
    delete(): PostsDeleteQuery;
    insert(row: object): PostsInsertQuery;
  };
}

export class SupabasePostsRepository implements PostsRepository {
  constructor(private readonly client: PostsSupabaseClient) {}

  async updateTasks(id: PostId, fields: PostTasksWriteFields): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post tasks', { cause: error }));
    }

    return ok(undefined);
  }

  async updateMetadata(
    id: PostId,
    fields: PostMetadataWriteFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post', { cause: error }));
    }

    return ok(undefined);
  }

  async updateMetadataUnstamped(
    id: PostId,
    fields: { readonly metadata: Record<string, unknown> },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({ metadata: fields.metadata })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post', { cause: error }));
    }

    return ok(undefined);
  }

  async updatePosition(
    id: PostId,
    fields: PostPositionWriteFields,
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        position_x: fields.positionX,
        position_y: fields.positionY,
        updated_at: fields.updatedAt,
        ...(fields.metadata !== undefined ? { metadata: fields.metadata } : {}),
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post position', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteById(id: PostId): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').delete().eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the post', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteByIds(ids: readonly PostId[]): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').delete().in('id', ids);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the posts', { cause: error }));
    }

    return ok(undefined);
  }

  async deleteByParentId(parentId: PostId): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .delete()
      .eq('metadata->>parentId', parentId);

    if (error) {
      return err(domainError('unavailable', 'Could not delete the child posts', { cause: error }));
    }

    return ok(undefined);
  }

  async insert(row: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').insert(row);

    if (error) {
      return err(domainError('unavailable', 'Could not create the post', { cause: error }));
    }

    return ok(undefined);
  }

  async insertReturning(row: object): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client.from('padlets').insert(row).select().single();

    if (error) {
      return err(domainError('unavailable', 'Could not create the post', { cause: error }));
    }

    return ok(data);
  }
}

export function createPostsRepository(): PostsRepository {
  return new SupabasePostsRepository(
    createBrowserSupabaseClient() as unknown as PostsSupabaseClient,
  );
}
```

## 5. BOUND FILE 4 — `lib/infra/canvas/postsRepository.test.ts` (whole file, exact, 343 lines, 16 tests — 13 existing + 3 new; CTO ran 16/16 GREEN; post-edit hash `0c35e4ef601d1fbc670d95277b838f3bb78b052e`)

The diff vs current is PURE ADDITIONS: one describe block appended at EOF.
Replace the file with exactly:

```ts
import { describe, expect, it } from 'vitest';
import { SupabasePostsRepository } from './postsRepository';
import { asPostId } from '../../domain/core/ids';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(
  error: FakeError | null = null,
  insertReturnData: Record<string, unknown> | null = { id: 'row-1' },
) {
  const fromTables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const deleteInCalls: Array<{ column: string; values: readonly string[] }> = [];
  const insertCalls: object[] = [];
  const selectSingleCalls: object[] = [];

  const client = {
    from(table: 'padlets') {
      fromTables.push(table);
      return {
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (column: 'id', value: string) => {
              eqCalls.push({ column, value });
              return { error };
            },
          };
        },
        delete() {
          return {
            eq: async (column: string, value: string) => {
              deleteEqCalls.push({ column, value });
              return { error };
            },
            in: async (column: string, values: readonly string[]) => {
              deleteInCalls.push({ column, values });
              return { error };
            },
          };
        },
        insert(row: object) {
          insertCalls.push(row);
          return {
            // The real builder is a thenable awaited directly for plain inserts;
            // the generic signature mirrors PromiseLike<{ error }> structurally.
            then<TResult1 = { error: FakeError | null }, TResult2 = never>(
              onFulfilled?:
                | ((value: { error: FakeError | null }) => TResult1 | PromiseLike<TResult1>)
                | null,
              onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): Promise<TResult1 | TResult2> {
              return Promise.resolve({ error }).then(onFulfilled, onRejected);
            },
            select() {
              return {
                single: async () => {
                  selectSingleCalls.push(row);
                  return { data: insertReturnData, error };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client,
    fromTables,
    updateCalls,
    eqCalls,
    deleteEqCalls,
    deleteInCalls,
    insertCalls,
    selectSingleCalls,
  };
}

const fields = {
  content: '[{"id":"task-1","completed":true}]',
  metadata: { todoTitle: 'Groceries', tasks: [{ id: 'task-1', completed: true }] },
  updatedAt: '2026-07-09T12:00:00.000Z',
};

describe('SupabasePostsRepository', () => {
  it('sends the exact legacy payload to padlets filtered by the post id', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([
      {
        content: fields.content,
        metadata: fields.metadata,
        updated_at: fields.updatedAt,
      },
    ]);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTasks(asPostId('post-1'), fields);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('performs exactly one update per call', async () => {
    const { client, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    await repository.updateTasks(asPostId('post-1'), fields);
    await repository.updateTasks(asPostId('post-2'), fields);

    expect(updateCalls).toHaveLength(2);
  });

  it('updateMetadata sends exactly the metadata and updated_at payload', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateMetadata(asPostId('container-1'), {
      metadata: { title: 'Box', childPadletIds: ['child-1'] },
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        metadata: { title: 'Box', childPadletIds: ['child-1'] },
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['metadata', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'container-1' }]);
  });

  it('deleteById issues a padlets delete filtered by the post id', async () => {
    const { client, fromTables, deleteEqCalls, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(deleteEqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
    expect(updateCalls).toHaveLength(0);
  });

  it('deleteByIds issues a padlets delete with the exact id list', async () => {
    const { client, deleteInCalls, deleteEqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteByIds([asPostId('post-1'), asPostId('post-2')]);

    expect(result.ok).toBe(true);
    expect(deleteInCalls).toEqual([{ column: 'id', values: ['post-1', 'post-2'] }]);
    expect(deleteEqCalls).toHaveLength(0);
  });

  it('deleteByParentId filters on the metadata->>parentId column', async () => {
    const { client, deleteEqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteByParentId(asPostId('container-1'));

    expect(result.ok).toBe(true);
    expect(deleteEqCalls).toEqual([{ column: 'metadata->>parentId', value: 'container-1' }]);
  });

  it('maps a delete error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.deleteById(asPostId('post-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('insert sends the row verbatim to padlets', async () => {
    const { client, fromTables, insertCalls, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);
    const row = { id: 'post-1', board_id: 'board-1', title: 'Hello' };

    const result = await repository.insert(row);

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(insertCalls).toEqual([row]);
    expect(insertCalls[0]).toBe(row);
    expect(updateCalls).toHaveLength(0);
  });

  it('insert maps a resolved error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.insert({ id: 'post-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('insertReturning issues insert().select().single() and returns the row', async () => {
    const returned = { id: 'post-1', board_id: 'board-1' };
    const { client, insertCalls, selectSingleCalls } = createFakeClient(null, returned);
    const repository = new SupabasePostsRepository(client);
    const row = { id: 'post-1', board_id: 'board-1' };

    const result = await repository.insertReturning(row);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(returned);
    }
    expect(insertCalls).toEqual([row]);
    expect(selectSingleCalls).toEqual([row]);
  });

  it('insertReturning maps a resolved error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.insertReturning({ id: 'post-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });

  it('updateMetadataUnstamped sends ONLY the metadata payload - no updated_at key', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateMetadataUnstamped(asPostId('post-1'), {
      metadata: { parentId: 'container-1' },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([{ metadata: { parentId: 'container-1' } }]);
    expect(Object.keys(updateCalls[0])).toEqual(['metadata']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });
});

describe('SupabasePostsRepository.updatePosition', () => {
  it('sends ONLY position_x/position_y/updated_at when no metadata is given - no metadata key', async () => {
    const { client, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 120,
      positionY: 45,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        position_x: 120,
        position_y: 45,
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['position_x', 'position_y', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('includes the metadata key when metadata is given', async () => {
    const { client, updateCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 80,
      positionY: 30,
      updatedAt: '2026-07-10T08:00:00.000Z',
      metadata: { sectionId: 's-1' },
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([
      {
        position_x: 80,
        position_y: 30,
        updated_at: '2026-07-10T08:00:00.000Z',
        metadata: { sectionId: 's-1' },
      },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual([
      'position_x',
      'position_y',
      'updated_at',
      'metadata',
    ]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updatePosition(asPostId('post-1'), {
      positionX: 0,
      positionY: 0,
      updatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

---

## 6. CanvasClient edits (ONE import edit + TWO bound blocks, in file order)

Everything else stays BYTE-IDENTICAL — including both sites' surrounding
math, the container leg at L6025+, and the outer catches.

### §6a — posts import block: two names inserted alphabetically

Replace

```ts
  createUpdatePostMetadataUnstampedCommand,
} from '@/lib/domain/canvas/posts';
```

with

```ts
  createUpdatePostMetadataUnstampedCommand,
  createUpdatePostPositionCommand,
  createUpdatePostPositionWithMetadataBestEffortCommand,
} from '@/lib/domain/canvas/posts';
```

### §6b — freeform detach, padlet leg (OLD = current L6014–6022, 9 lines → NEW 7)

OLD:

```ts
                await supabase
                  .from('padlets')
                  .update({
                    metadata: newMetadata,
                    position_x: Math.max(0, x),
                    position_y: Math.max(0, y),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', padletId);
```

NEW:

```ts
                const updatePostPositionWithMetadataBestEffort = createUpdatePostPositionWithMetadataBestEffortCommand(createPostsRepository());
                const result = await updatePostPositionWithMetadataBestEffort(
                  { postId: padletId, positionX: Math.max(0, x), positionY: Math.max(0, y), metadata: newMetadata },
                  { userId: null }
                );

                if (!result.ok) throw result.error.cause ?? result.error;
```

### §6c — canvas drop repositioning (OLD = current L6471–6489, 19 lines → NEW 16; AUTHORIZED §0.3)

OLD:

```ts
                    // Background sync to Supabase
                    const { error } = await supabase
                      .from('padlets')
                      .update({
                        position_x: Math.round(newX),
                        position_y: Math.round(newY),
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', padletId);

                    if (error) {
                      // Rollback on failure
                      console.error('Failed to update position, rolling back:', error);
                      setPadlets(prev => prev.map(p =>
                        p.id === padletId
                          ? { ...p, position_x: oldX, position_y: oldY }
                          : p
                      ));
                    }
```

NEW:

```ts
                    // Background sync to Supabase
                    const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
                    const result = await updatePostPosition(
                      { postId: padletId, positionX: Math.round(newX), positionY: Math.round(newY) },
                      { userId: null }
                    );

                    if (!result.ok) {
                      // Rollback on failure
                      console.error('Failed to update position, rolling back:', result.error.cause ?? result.error);
                      setPadlets(prev => prev.map(p =>
                        p.id === padletId
                          ? { ...p, position_x: oldX, position_y: oldY }
                          : p
                      ));
                    }
```

---

## 7. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 7.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # ead9ea9a96907bd363bd07f417e2a109ddaf8242
git hash-object lib/domain/canvas/posts.ts                     # 8f66c62c7a4cc82142d502d15b3bc8d3b3b6335b
git hash-object lib/domain/canvas/posts.test.ts                # 900f45fb0a14d5b2e7682386c217accf6b503dd3
git hash-object lib/infra/canvas/postsRepository.ts             # 1b5d496785006f7b14820bab67046595589a7eda
git hash-object lib/infra/canvas/postsRepository.test.ts       # 0c35e4ef601d1fbc670d95277b838f3bb78b052e
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts
# every row: i/lf    w/lf
```

### 7.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8401
grep -c '^[[:space:]]*$' "$F"             # 731
grep -c "\.from('padlets')" "$F"          # 3   (map comments+select pair + title-clear)
grep -c "createUpdatePostPositionCommand" "$F"                       # 2   (1 import + 1 use)
grep -c "createUpdatePostPositionWithMetadataBestEffortCommand" "$F" # 2   (1 import + 1 use)
grep -c "updatePostPosition" "$F"         # 4   (case-sensitive superstring: both locals' declare+call lines)
grep -c "createPostsRepository" "$F"      # 51
grep -c "userId: null" "$F"               # 61
grep -c "result.error.cause" "$F"         # 39
grep -c "positionX\|positionY" "$F"       # 6
grep -c "supabase" "$F"                   # 36
```

### 7.2 Lib-file identity + suite

```bash
wc -l lib/domain/canvas/posts.ts                    # 442
wc -l lib/domain/canvas/posts.test.ts                # 949
wc -l lib/infra/canvas/postsRepository.ts            # 205
wc -l lib/infra/canvas/postsRepository.test.ts       # 343
grep -c "it(" lib/domain/canvas/posts.test.ts               # 51
grep -c "it(" lib/infra/canvas/postsRepository.test.ts      # 16
git diff lib/domain/canvas/posts.test.ts | grep -c "^-[^-]"           # 5  (scattered fake-repo edits, not pure append — measured)
git diff lib/infra/canvas/postsRepository.test.ts | grep -c "^-[^-]"  # 0  (pure additions)
```

### 7.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- components/collabboard/PostCardContent.tsx "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/domain/boards/repository.ts lib/domain/core eslint.boundaries.config.mjs lib/infra/supabase
git status --short   # exactly the 5 scoped files (M); ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 8. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§6, then §7 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **175 passed (175), 24 files**; full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 9. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 5 staged M lines; anything else = STOP
git commit -m "refactor(canvas): extract the position-write pair onto a new canvas.updatePostPosition seam -- honest + best-effort commands, Pattern K (PATCH-034)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the blank census RISES 730→731
(a new blank line inside §6c — the hash gate is the content proof); the
AUTHORIZED thrown-mode convergence at §6c (§0.3 — do NOT "fix" anything
beyond the bound blocks); `posts.test.ts` is a SCATTERED edit (not pure
append — five touch points in the fake repository plus the EOF append),
confirmed via the whole-file hash, not a line-count-only gate; ZERO new
casts.

STOP if: any §1 gate mismatches; any OLD block fails byte-match at its
bound lines; any bound test fails (never edit a test); any §7.0 hash
mismatches after one fix attempt against the fences; `git status --short`
shows any path outside the FIVE scoped files; tsc/boundaries/unit/e2e fail
beyond the stale-`.next/types` cure.

Do NOT: touch the map-comments+select site, the title-clear site, the auth
trio, the hooks, FreeformPadletCards, or any other infra file; create
files beyond what's bound; de-lint types; chase the grandfather list
(stays 2).
