# PATCH-029 — CanvasClient strangler group 4: the complete `padlets` INSERT family onto the posts aggregate (six create commands, extension-only Pattern K)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, fifth application — see §0.2)
**Pattern:** K — canvas ops command (PATCH_REFERENCE §5.11), second extension-only application (no new files)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (16 bound edit blocks + the import-block rewrite), `lib/domain/canvas/posts.ts`, `lib/infra/canvas/postsRepository.ts`, `lib/domain/canvas/posts.test.ts`, `lib/infra/canvas/postsRepository.test.ts` — **nothing else**. No new files anywhere.
**Authored:** 2026-07-10 (Fable 5 CTO). All census numbers measured on the live tree at commit `c01b1d3`; all four bound files compiled (`tsc --strict`) AND run (46/46 tests green, including the 25 pre-existing posts tests against the extended files) in scratch before binding; ALL SIXTEEN CanvasClient blocks applied to a scratch copy of the file and every derived gate below measured on that simulation, including the bound post-edit whole-file hash.

> Implementer: read `.fable5/docs/PATCH_REFERENCE.md` §5.11 and §6 first.
> The bound unit tests are the fidelity net. If a bound test fails against
> your tree, YOUR IMPLEMENTATION DEVIATES — never edit a test. STOP and
> report instead (§10).

---

## 0. CTO rulings

### 0.1 Group choice: the whole INSERT family (19 sites), not an UPDATE slice

Post-028 census (regenerated 2026-07-10): 19 INSERT / 32 UPDATE / 1 select /
0 delete. INSERT wins:

- **Smaller and coherent:** 19 sites vs 32, and INSERT is finishable in ONE
  patch (a whole table-operation goes extinct, like DELETE in 028); UPDATE
  is slice-only by standing plan (18 of its sites are in the JSX region).
- **Strong Pattern-K coverage:** every insert is a pass-through of a
  call-site-built row — the commands add NO fields and NO timestamps; the
  only transformations are the two cascade merges, both pinned by tests.
- **Side effects bindable:** the family's hard parts (a five-statement
  silent-swallow cluster in the scheduler handlers, two hook-helper cleanup
  compensations, four consumed `.select().single()` returns) are all
  EXPRESSIBLE as bound tests and bound call-site blocks — nothing is
  untestable. Only ONE insert site is in the JSX region (§6q).
- FreeformPadletCards untouched; storage/auth not chosen (single-seam
  swaps, not the owner-directed strangler path).

### 0.2 Model: GPT-5.4 (Pattern K, fifth application)

21 new bound tests compiled and run green at authoring (46/46 with the 25
existing); all 11 distinct call-site swap shapes compile-verified against
the real command types, including `Padlet`-typed rows. 16 blocks is more
volume than 028's 7, but volume is exactness work, not judgment work — and
this patch adds the strongest anti-drift gate yet: a bound `git
hash-object` for every final file (§7.0), computed from the CTO's
simulation, so ANY byte deviation anywhere fails immediately. The
scheduler swallow commands are the chronoMode shape, proven on GPT-5.4 in
027.

### 0.3 Aggregate ruling: extend the posts aggregate again (P6)

Same ruling as 028: `padlets` IS the posts table. Three repository methods
(`insert`, `insertReturning`, `updateMetadataUnstamped`) and six commands
join the EXISTING `PostsRepository`. No new files; a second padlets
repository is FORBIDDEN. The interface's implementors are still exactly
the bound infra class and the bound test fake (measured — PostCardContent
consumes the factory only and stays byte-untouched).

### 0.4 Command shapes (six commands; composition vs merge, per pair)

1. `canvas.createPost` { row } — plain insert, honest Result. Consumers:
   §6c, §6e, §6f, §6h, §6j, §6k, §6l, §6q (8 sites).
2. `canvas.createPostAndSelect` { row } — insert().select().single(),
   returns the inserted row. Consumers: §6b, §6d, §6g (3 sites).
3. `canvas.createContainerWithPost` { containerRow, postRow } — honest
   sequential pair, container first, first-failure-aborts. Consumer: §6m
   (old L4576+L4578 — unconditional adjacent pair = ONE command, the
   site-map rule).
4. `canvas.groupPostIntoContainer` { containerRow, postId, postMetadata }
   (consumer §6i) — insertReturning(container) then the post's parentId metadata write
   WITH NO updated_at (old L3665 sends none — dedicated
   `updateMetadataUnstamped` method, payload pinned by an `Object.keys ===
   ['metadata']` infra test). One user action, two statements, ONE command;
   pulls its paired UPDATE site out of the UPDATE census (32→30 together
   with §6m's).
5. `canvas.attachPostToSchedulerContainer` { postRow, containerId,
   containerMetadata, childPadletIds, updatedAt } — the old L4809-4816
   insert+update pair. COMMAND-INTERNAL RESOLVED-ERROR SWALLOW (see 0.5).
   `updatedAt` is an INPUT: the legacy update reuses the call site's `now`,
   the same string already stamped into the post row — a generated
   timestamp would diverge.
6. `canvas.createSchedulerContainerWithPost` { containerRow, postRow } —
   the old L4840-4841 and L4907-4908 insert+insert pairs (identical DB
   traffic, two consumers). COMMAND-INTERNAL SWALLOW (0.5).

**Composition rulings:** the wall/timeline/columns container+child flows
(§6b→§6c, §6d→§6e, §6g→§6h) each build the SECOND payload
from the FIRST statement's returned row (`childData.id`) with intervening
call-site construction and hook-helper cleanup (`deletePadletByIdRaw`) on
failure — merging them would move payload construction or a hook call into
domain code. They stay composed at the call site from commands 1+2,
statement-for-statement (same reasoning as 028's conditional cascades).

### 0.5 Preserved legacy defects and semantics (do NOT repair)

1. **Scheduler silent-swallow cluster — FIVE bare-awaited statements**
   (old L4809, L4810-4816, L4840, L4841, L4907, L4908): resolved DB errors
   were never read; the next statement always ran; only a THROWN network
   error aborted and reached the catch. Commands 5 and 6 port this
   faithfully as command-internal swallows (the chronoMode/reorderSections
   family — now sites 3 and 4). Each has dedicated bound tests ("a
   resolved … failure still returns ok and … still runs"). The call sites
   gain `if (!r.ok) throw r.error.cause ?? r.error;` — reachable ONLY via
   the thrown path, reproducing thrown-only surfacing exactly. **At review
   closeout: EXTEND the standing owner-decision entry to name these two
   commands.**
2. **Cleanup compensations stay at the call sites** (§6e, §6h): on
   container-insert failure the legacy code deletes the just-created child
   via the HOOK helper `deletePadletByIdRaw` — a hook-layer call that must
   not move into domain code. Bound lines keep it verbatim.
3. **`groupIntoColumn` unstamped update + partial failure**: the post's
   parentId write sends NO updated_at; if it fails after the container
   insert landed, nothing is rolled back (orphan empty container). Both
   pinned by bound tests.
4. **Wall/columns container inserted AFTER its child** with client-built
   ids; §6c's wall container has NO cleanup on failure (child row
   orphans); §6e/§6h DO clean up — three different compensation semantics,
   all preserved byte-for-byte in bound lines.
5. **`handleCreateEmptyTimelineContainer` rollback-no-throw** (§6j):
   resolved failure rolls back optimistic state, toasts, `return false` —
   no throw, no catch. Preserved shape.
6. **JSX drop rollback-with-log** (§6q): resolved failure logs and rolls
   back, NO toast, returns normally. The log now prints
   `result.error.cause ?? result.error` — the original supabase error
   object, message byte-identical.

### 0.6 Cast census (five new, all named here; nothing else)

- FOUR `as any` on consumed command values: `const childData =
  childResult.value as any;` (§6b, §6d, §6g) and `const containerData =
  result.value as any;` (§6i). These relocate supabase's implicit
  `any` (the legacy destructured `data` was untyped) into an explicit,
  greppable form — the PATCH-027 relocated-cast family. Downstream
  untouched lines (`childData.id`, `childData as Padlet`, `if
  (containerData)`) compile unchanged because the local stays `any`.
- ONE `((existingContainer.metadata as any) || {})` in §6n — the
  027/028 relocated-legacy-cast idiom for a JSONB pass-through into a zod
  record.

`postRowSchema` is `z.custom<object>` — deliberately: `Padlet`-typed
locals (an interface with NO index signature) are not assignable to
`Record<string, unknown>`, and `object` keeps every call site cast-free.
Compile-verified with a Padlet-shaped interface at authoring.

### 0.7 Line budget (rule 3: the over-ceiling file must not grow)

Several NEW blocks are bound in compact single-line-call form (§6k, §6l,
§6m, §6o, §6p) specifically to keep the net negative. Simulation-measured
result: **8,507 → 8,504** (−3 despite +6 import lines), blank census
**726 → 724** (§6i's two interior blanks leave with it). Do not
reformat the compact calls.

---

## 1. Pre-edit gates (Git Bash from repo root; run ALL; any mismatch = STOP and report)

```bash
git status --short                        # MUST print nothing
git log --oneline -1                      # c01b1d3 (or a descendant touching none of the 5 scoped files)
```

**Byte-identity gates (the anti-cancellation rule, both directions):**

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # b6a0fb0cffa9a5745feb729b627a7f95e7c38249
git hash-object lib/domain/canvas/posts.ts                     # f3575905f66542fd3e811cec0478b90b3ad8132a
git hash-object lib/infra/canvas/postsRepository.ts            # a30a57ad5be1086ca3edc73a1ebf868593f70447
git hash-object lib/domain/canvas/posts.test.ts                # 05c2a54e5bce2272401ddedcc77a26534ba2b169
git hash-object lib/infra/canvas/postsRepository.test.ts       # b5561f230acb7f8194cecef6121e52523e473f74
```

CanvasClient census (all measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                              # 8507
grep -c '^[[:space:]]*$' "$F"                           # 726
grep -c "\.from('padlets')" "$F"                        # 51
grep -c '\.from("padlets")' "$F"                        # 1
grep -c "\.insert(" "$F"                                # 19
grep -c "createPostsRepository" "$F"                    # 9
grep -c "userId: null" "$F"                             # 17
grep -c "childResult" "$F"                              # 7
grep -c "containerResult" "$F"                          # 0
grep -c "attachResult" "$F"                             # 0
grep -c "pairResult" "$F"                               # 0
grep -c "\.value as any" "$F"                           # 0
grep -c "childData" "$F"                                # 11
grep -c "containerData" "$F"                            # 3
grep -c "updatedMeta" "$F"                              # 3
grep -c "createCreatePostCommand\|createCreatePostAndSelectCommand\|createCreateContainerWithPostCommand\|createGroupPostIntoContainerCommand\|createAttachPostToSchedulerContainerCommand\|createCreateSchedulerContainerWithPostCommand" "$F"   # 0
```

Anchor lines (each must print the shown fragment):

```bash
sed -n '1798p' "$F"    #         .insert(childPayload)
sed -n '1815p' "$F"    #         .insert(finalContainerPayload);
sed -n '1872p' "$F"    #         .insert(childPayload)
sed -n '1888p' "$F"    #         .insert(finalContainerPayload);
sed -n '2026p' "$F"    #         .insert(containerPayload);
sed -n '2479p' "$F"    #         .insert(childPayload)
sed -n '2497p' "$F"    #         .insert(finalContainerPayload);
sed -n '3652p' "$F"    #         .insert(containerPadlet)
sed -n '4347p' "$F"    #     const { error } = await supabase.from('padlets').insert(newContainer);
sed -n '4452p' "$F"    #       const { error } = await supabase.from('padlets').insert(newContainer);
sed -n '4500p' "$F"    #       const { error } = await supabase.from('padlets').insert(newContainer);
sed -n '4576p' "$F"    #       const { error: containerError } = await supabase.from('padlets').insert(newContainer);
sed -n '4809p' "$F"    #         await supabase.from('padlets').insert(newPost);
sed -n '4840p' "$F"    #         await supabase.from('padlets').insert(newContainer);
sed -n '4907p' "$F"    #       await supabase.from('padlets').insert(newContainer);
sed -n '6493p' "$F"    #                     .insert(newPadlet);
```

Name-collision absence (must print 0):

```bash
grep -rn "createCreatePostCommand\|createCreatePostAndSelectCommand\|createCreateContainerWithPostCommand\|createGroupPostIntoContainerCommand\|createAttachPostToSchedulerContainerCommand\|createCreateSchedulerContainerWithPostCommand\|postRowSchema\|insertReturning\|updateMetadataUnstamped" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 133 tests, all passed
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (whole file, exact, 295 lines; CTO compile-verified `tsc --strict` AND unit-tested green at authoring, 2026-07-10; post-edit `git hash-object` = `e0eff3d20765a32800109a359f8ce89686b58104`)

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
```

## 3. BOUND FILE 2 — `lib/infra/canvas/postsRepository.ts` (whole file, exact, 173 lines; hash `9f05392fba5699e65e6a0ee735c06b7c24280d74`)

```ts
import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { PostId } from '../../domain/core/ids';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import type { PostMetadataWriteFields, PostsRepository, PostTasksWriteFields } from '../../domain/canvas/posts';
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
        | { metadata: Record<string, unknown> },
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

## 4. BOUND FILE 3 — `lib/domain/canvas/posts.test.ts` (whole file, exact, 652 lines, 33 tests — 17 existing + 16 new; CTO ran 33/33 GREEN against §2; hash `13ebfaa9c7dc3a622507c171e7f239bedbd9019f`)

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
} from './posts';
import type { PostMetadataWriteFields, PostsRepository, PostTasksWriteFields } from './posts';
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
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  let updateTasksResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdsResult: Result<void, DomainError> = ok(undefined);
  let deleteByParentIdResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataUnstampedResult: Result<void, DomainError> = ok(undefined);
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
```

## 5. BOUND FILE 4 — `lib/infra/canvas/postsRepository.test.ts` (whole file, exact, 273 lines, 13 tests — 8 existing + 5 new; CTO ran 13/13 GREEN against §3; hash `ce9f5a349cb870541173a24ffc2d1f1589025e3e`)

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
```

---

## 6. CanvasClient edits (import rewrite + sixteen bound blocks; every OLD must byte-match at its stated lines BEFORE you replace it)

Every line not shown in an OLD block stays BYTE-IDENTICAL — including all
dependency arrays (every `supabase` entry STAYS), the `draftToInsertPayload`
helper, both `applyTimelineOrder` calls, all `setPadlets` optimistic lines
adjacent to the blocks, and the untouched downstream consumers of
`childData`/`containerData`.

### §6a — import block rewrite (the posts import block ONLY; +6 lines)

Replace this exact existing block (current L48-53):

```ts
import {
  createDeleteChildPostsCommand,
  createDeleteContainerChildCommand,
  createDeletePostCommand,
  createDeletePostsCommand,
} from '@/lib/domain/canvas/posts';
```

with:

```ts
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
} from '@/lib/domain/canvas/posts';
```

(`createPostsRepository` is already imported — do not add a second infra
import line.)

### §6b — wall child insert (OLD = current L1796–1802, 7 lines → NEW 5)

OLD:

```ts
      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;
```

NEW:

```ts
      const createPostAndSelect = createCreatePostAndSelectCommand(createPostsRepository());
      const childResult = await createPostAndSelect({ row: childPayload }, { userId: null });

      if (!childResult.ok) throw childResult.error.cause ?? childResult.error;
      const childData = childResult.value as any;
```

### §6c — wall container insert (OLD = current L1813–1817, 5 lines → NEW 4)

OLD:

```ts
      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) throw containerError;
```

NEW:

```ts
      const createPost = createCreatePostCommand(createPostsRepository());
      const containerResult = await createPost({ row: finalContainerPayload }, { userId: null });

      if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;
```

### §6d — horizontal-all timeline child insert (OLD = current L1870–1876, 7 lines → NEW 5; byte-identical to §6b's blocks)

OLD:

```ts
      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;
```

NEW:

```ts
      const createPostAndSelect = createCreatePostAndSelectCommand(createPostsRepository());
      const childResult = await createPostAndSelect({ row: childPayload }, { userId: null });

      if (!childResult.ok) throw childResult.error.cause ?? childResult.error;
      const childData = childResult.value as any;
```

### §6e — horizontal-all container insert with hook cleanup (OLD = current L1886–1893, 8 lines → NEW 7; `deletePadletByIdRaw` line stays verbatim)

OLD:

```ts
      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) {
        await deletePadletByIdRaw(childData.id);
        throw containerError;
      }
```

NEW:

```ts
      const createPost = createCreatePostCommand(createPostsRepository());
      const containerResult = await createPost({ row: finalContainerPayload }, { userId: null });

      if (!containerResult.ok) {
        await deletePadletByIdRaw(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

### §6f — empty wall container (OLD = current L2023–2028, 6 lines → NEW 5)

OLD:

```ts
      // 4. Insert it into the database
      const { error } = await supabase
        .from('padlets')
        .insert(containerPayload);

      if (error) throw error;
```

NEW:

```ts
      // 4. Insert it into the database
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: containerPayload }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6g — columns child insert (OLD = current L2477–2483, 7 lines → NEW 5; byte-identical to §6b's blocks)

OLD:

```ts
      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;
```

NEW:

```ts
      const createPostAndSelect = createCreatePostAndSelectCommand(createPostsRepository());
      const childResult = await createPostAndSelect({ row: childPayload }, { userId: null });

      if (!childResult.ok) throw childResult.error.cause ?? childResult.error;
      const childData = childResult.value as any;
```

### §6h — columns container insert with commented hook cleanup (OLD = current L2494–2503, 10 lines → NEW 9)

OLD:

```ts
      // 6. Insert the container with child ID (single insert, not insert+update)
      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) {
        // Cleanup child if container fails
        await deletePadletByIdRaw(childData.id);
        throw containerError;
      }
```

NEW:

```ts
      // 6. Insert the container with child ID (single insert, not insert+update)
      const createPost = createCreatePostCommand(createPostsRepository());
      const containerResult = await createPost({ row: finalContainerPayload }, { userId: null });

      if (!containerResult.ok) {
        // Cleanup child if container fails
        await deletePadletByIdRaw(childData.id);
        throw containerResult.error.cause ?? containerResult.error;
      }
```

### §6i — groupIntoColumn insert+unstamped-update pair (OLD = current L3650–3668, 19 lines → NEW 13)

Pre-declared disclosures bound here: the `updatedMeta` construction MOVES
ABOVE the insert (pure object construction, no observable change — the
command needs it as input), and the OLD block's two extra interior blank
lines leave with it (blank census 726→724).

OLD:

```ts
      const { data: containerData, error: containerError } = await supabase
        .from('padlets')
        .insert(containerPadlet)
        .select()
        .single();

      if (containerError) throw containerError;

      // Update the original padlet to set parentId
      const updatedMeta = {
        ...padlet.metadata,
        parentId: containerId,
      };
      const { error: updateError } = await supabase
        .from('padlets')
        .update({ metadata: updatedMeta })
        .eq('id', id);

      if (updateError) throw updateError;
```

NEW:

```ts
      // Update the original padlet to set parentId
      const updatedMeta = {
        ...padlet.metadata,
        parentId: containerId,
      };
      const groupPostIntoContainer = createGroupPostIntoContainerCommand(createPostsRepository());
      const result = await groupPostIntoContainer(
        { containerRow: containerPadlet, postId: id, postMetadata: updatedMeta },
        { userId: null }
      );

      if (!result.ok) throw result.error.cause ?? result.error;
      const containerData = result.value as any;
```

### §6j — empty timeline container, rollback-no-throw (OLD = current L4347–4352, 6 lines → NEW 7)

OLD:

```ts
    const { error } = await supabase.from('padlets').insert(newContainer);
    if (error) {
      setPadlets((prev) => prev.filter((p) => p.id !== containerId));
      toast.error('Failed to create container');
      return false;
    }
```

NEW:

```ts
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row: newContainer }, { userId: null });
    if (!result.ok) {
      setPadlets((prev) => prev.filter((p) => p.id !== containerId));
      toast.error('Failed to create container');
      return false;
    }
```

### §6k — insertTimelineContainerAt (OLD = current L4452–4453, 2 lines → NEW 3, compact form — do not expand)

OLD:

```ts
      const { error } = await supabase.from('padlets').insert(newContainer);
      if (error) throw error;
```

NEW:

```ts
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newContainer }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6l — duplicateTimelineContainer (OLD = current L4500–4501, 2 lines → NEW 3; byte-identical to §6k's blocks)

OLD:

```ts
      const { error } = await supabase.from('padlets').insert(newContainer);
      if (error) throw error;
```

NEW:

```ts
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newContainer }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6m — library-drop container+post pair (OLD = current L4575–4579, 5 lines → NEW 4, compact form)

OLD:

```ts
      // Persist to database
      const { error: containerError } = await supabase.from('padlets').insert(newContainer);
      if (containerError) throw containerError;
      const { error: padletError } = await supabase.from('padlets').insert(newPadlet);
      if (padletError) throw padletError;
```

NEW:

```ts
      // Persist to database
      const createContainerWithPost = createCreateContainerWithPostCommand(createPostsRepository());
      const result = await createContainerWithPost({ containerRow: newContainer, postRow: newPadlet }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6n — scheduler attach pair (OLD = current L4809–4816, 8 lines → NEW 12; the swallow command + thrown-only surfacing; contains the relocated metadata cast)

OLD:

```ts
        await supabase.from('padlets').insert(newPost);
        await supabase
          .from('padlets')
          .update({
            metadata: { ...existingContainer.metadata, childPadletIds: newChildIds },
            updated_at: now,
          })
          .eq('id', existingContainer.id);
```

NEW:

```ts
        const attachPostToSchedulerContainer = createAttachPostToSchedulerContainerCommand(createPostsRepository());
        const attachResult = await attachPostToSchedulerContainer(
          {
            postRow: newPost,
            containerId: existingContainer.id,
            containerMetadata: ((existingContainer.metadata as any) || {}),
            childPadletIds: newChildIds,
            updatedAt: now,
          },
          { userId: null }
        );
        if (!attachResult.ok) throw attachResult.error.cause ?? attachResult.error;
```

### §6o — scheduler new-container pair, drop branch (OLD = current L4840–4841, 2 lines → NEW 3, compact form; 8-space indent)

OLD:

```ts
        await supabase.from('padlets').insert(newContainer);
        await supabase.from('padlets').insert(newPost);
```

NEW:

```ts
        const createSchedulerContainerWithPost = createCreateSchedulerContainerWithPostCommand(createPostsRepository());
        const pairResult = await createSchedulerContainerWithPost({ containerRow: newContainer, postRow: newPost }, { userId: null });
        if (!pairResult.ok) throw pairResult.error.cause ?? pairResult.error;
```

### §6p — scheduler new-container pair, ghost-drag (OLD = current L4907–4908, 2 lines → NEW 3, compact form; 6-space indent)

OLD:

```ts
      await supabase.from('padlets').insert(newContainer);
      await supabase.from('padlets').insert(newPost);
```

NEW:

```ts
      const createSchedulerContainerWithPost = createCreateSchedulerContainerWithPostCommand(createPostsRepository());
      const pairResult = await createSchedulerContainerWithPost({ containerRow: newContainer, postRow: newPost }, { userId: null });
      if (!pairResult.ok) throw pairResult.error.cause ?? pairResult.error;
```

### §6q — JSX freeform library drop (OLD = current L6490–6499, 10 lines → NEW 9; 18-space indent, inside JSX)

OLD:

```ts
                  // Background sync to Supabase
                  const { error } = await supabase
                    .from('padlets')
                    .insert(newPadlet);

                  if (error) {
                    // Rollback on failure
                    console.error('Failed to insert padlet, rolling back:', error);
                    setPadlets(prev => prev.filter(p => p.id !== newPadlet.id));
                  }
```

NEW:

```ts
                  // Background sync to Supabase
                  const createPost = createCreatePostCommand(createPostsRepository());
                  const result = await createPost({ row: newPadlet }, { userId: null });

                  if (!result.ok) {
                    // Rollback on failure
                    console.error('Failed to insert padlet, rolling back:', result.error.cause ?? result.error);
                    setPadlets(prev => prev.filter(p => p.id !== newPadlet.id));
                  }
```

---

## 7. Post-edit gates (run ALL; any mismatch = STOP)

### 7.0 Byte-identity gates (PRIMARY — computed from the CTO's simulation; supersedes every count below on conflict)

A line-count gate proves length, not content (the PATCH-028 lesson: blank
lines can cancel). These hashes fail on ANY byte deviation, including EOL
drift:

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # f3fec11b7e3cdc7fc47b75b36d68eb69e631e95d
git hash-object lib/domain/canvas/posts.ts                     # e0eff3d20765a32800109a359f8ce89686b58104
git hash-object lib/infra/canvas/postsRepository.ts            # 9f05392fba5699e65e6a0ee735c06b7c24280d74
git hash-object lib/domain/canvas/posts.test.ts                # 13ebfaa9c7dc3a622507c171e7f239bedbd9019f
git hash-object lib/infra/canvas/postsRepository.test.ts       # ce9f5a349cb870541173a24ffc2d1f1589025e3e
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts
# every row: i/lf    w/lf
```

If a hash mismatches: do NOT hunt by eye — diff the file against the
corresponding §2–§5 fence (lib files) or re-check each §6 block at its
anchors (CanvasClient), fix to the binding, re-hash.

### 7.1 CanvasClient census (all simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                              # 8504
grep -c '^[[:space:]]*$' "$F"                           # 724
grep -c "\.from('padlets')" "$F"                        # 30
grep -c '\.from("padlets")' "$F"                        # 1
grep -c "\.insert(" "$F"                                # 0   (INSERT extinction)
grep -c "createPostsRepository" "$F"                    # 25  (1 import + 24 call sites)
grep -c "createCreatePostCommand" "$F"                  # 9   (1 import + 8 uses)
grep -c "createCreatePostAndSelectCommand" "$F"         # 4   (1 import + 3 uses)
grep -c "createCreateContainerWithPostCommand" "$F"     # 2
grep -c "createGroupPostIntoContainerCommand" "$F"      # 2
grep -c "createAttachPostToSchedulerContainerCommand" "$F"      # 2
grep -c "createCreateSchedulerContainerWithPostCommand" "$F"    # 3   (1 import + 2 uses)
grep -c "userId: null" "$F"                             # 33
grep -c "childResult" "$F"                              # 16
grep -c "containerResult" "$F"                          # 8
grep -c "attachResult" "$F"                             # 2
grep -c "pairResult" "$F"                               # 4
grep -c "\.value as any" "$F"                           # 4
grep -c "childData" "$F"                                # 11  (unchanged)
grep -c "containerData" "$F"                            # 3   (unchanged)
grep -c "updatedMeta" "$F"                              # 3   (unchanged)
grep -c "deletePadletByIdRaw" "$F"                      # 5   (unchanged — both cleanup calls + hook wiring)
```

### 7.2 Lib-file identity

```bash
wc -l lib/domain/canvas/posts.ts                        # 295
wc -l lib/infra/canvas/postsRepository.ts               # 173
wc -l lib/domain/canvas/posts.test.ts                   # 652
wc -l lib/infra/canvas/postsRepository.test.ts          # 273
grep -c "it(" lib/domain/canvas/posts.test.ts           # 33
grep -c "it(" lib/infra/canvas/postsRepository.test.ts  # 13
```

### 7.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- components/collabboard/PostCardContent.tsx
git diff -- "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/infra/canvas/boardRepository.ts lib/infra/canvas/boardRepository.test.ts lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts
git diff -- lib/domain/boards/repository.ts lib/domain/core lib/infra/supabase
git diff -- eslint.boundaries.config.mjs
git status --short   # exactly the 5 scoped files modified (M); ANY other path = STOP
```

### 7.4 Grandfather identity (2→2, untouched — do not chase it)

```bash
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2
```

---

## 8. Verification sequence (bind PRINTED TEXT, not exit codes)

**Phase A — baseline (BEFORE any edit):**

1. Port gate: `powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"` → `0`.
2. Start YOUR OWN dev server (background); read the real port from the banner.
3. Warm-up with plain GETs: `curl -sS -o /dev/null http://localhost:<port>/`, then `/auth`, then `/dashboard`. No HEAD requests.
4. Full Playwright → **27 passed** (cold-start rule: if `/` or `/auth` time out on the first run only, warm again and rerun once).
5. Run §1's gates.

**Phase B — implement §2–§6, then §7's gates (hashes FIRST).**

**Phase C — full verification:**

1. `npx tsc --noEmit` → clean. Stale `.next/types` rule: if tsc names a ghost file under `.next/types`, stop the server, `rm -rf .next`, restart, re-warm, rerun.
2. `npm run check:boundaries` → no output.
3. `npx vitest run` → **154 passed (154)**, **24 passed (24)** files.
4. Full Playwright on your own warmed server → **27 passed**.
5. Stop YOUR server (PID-attributed); stopped-server gate: the PowerShell count → `0`.
6. `rm -rf .next` then `npm run verify` → typecheck + boundaries + unit + production build, all green.

## 9. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 5 staged M lines; ANY other line = STOP
git commit -m "refactor(canvas): extract the padlets INSERT family onto the posts aggregate -- six create commands, Pattern K (PATCH-029)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (default pathspec treats it
as a character class; the escaped form matches nothing — measured).

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation from the bound blocks: whitespace, comments, blank
lines, EOL bytes, import order, renamed locals, extra casts, message
strings, test counts. Pre-declared (confirm, don't re-justify): the five
named casts (§0.6); §6i's `updatedMeta` move and two-blank-line loss; the
compact single-line calls in §6k/§6l/§6m/§6o/§6p (line-budget rule — do
not reformat).

STOP and report (never improvise) if: any §1 gate mismatches; any OLD
block fails byte-match; any bound test fails (your tree deviates — never
edit a test); any §7.0 hash mismatches after a fix attempt; `git status
--short` shows any path outside the five scoped files; tsc/boundaries/
unit/e2e fail beyond the stale-`.next/types` cure.

Do NOT: repair any §0.5 legacy defect; touch FreeformPadletCards, hooks,
PostCardContent, or `applyTimelineOrder`; create any new file; de-lint
types; chase the grandfather list (stays 2).
