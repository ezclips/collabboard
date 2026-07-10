# PATCH-028 — CanvasClient strangler group 3: the complete `padlets` DELETE family onto the canvas ops seam (four delete commands on the posts aggregate)

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, fourth application — see §0.2)
**Pattern:** K — canvas ops command (PATCH_REFERENCE §5.11), first EXTENSION-ONLY variant (no new files)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (7 bound edit blocks), `lib/domain/canvas/posts.ts`, `lib/infra/canvas/postsRepository.ts`, `lib/domain/canvas/posts.test.ts`, `lib/infra/canvas/postsRepository.test.ts` — **nothing else**. No new files anywhere.
**Authored:** 2026-07-10 (Fable 5 CTO). All census numbers below were MEASURED on the live tree at commit `75d516e`; all four bound files were compiled (`tsc --strict`) AND run (25/25 tests green, including the 9 pre-existing tests against the extended files) in scratch before binding. Site-map line numbers regenerated live the same day.

> Implementer: read `.fable5/docs/PATCH_REFERENCE.md` §5.11 and §6 first.
> The bound unit tests are the fidelity net. If a bound test fails against
> your tree, YOUR IMPLEMENTATION DEVIATES — never edit a test. STOP and
> report instead (see §10).

---

## 0. CTO rulings (why this group, this shape, this model)

### 0.1 Group choice: `padlets` DELETE before INSERT/UPDATE

Site map §7 census (regenerated 2026-07-10): padlets = 8 DELETE / 19 INSERT /
33 UPDATE / 1 select. DELETE wins on every safety axis:

- **Smallest coherent cluster:** 8 sites in 6 handlers, and the whole family
  reduces to FOUR WHERE-shapes (`eq('id')`, `in('id', …)`,
  `eq('metadata->>parentId')`, plus one paired metadata update).
- **Best Pattern-K testability:** a delete has NO payload — its entire
  semantics is its WHERE clause, which a unit test pins exactly. Nothing to
  transform, no `.select()` result consumed anywhere in the family.
- **Lowest side-effect density:** no storage, no auth, no realtime; every
  statement is a plain row delete (+ one metadata update in a cascade).
- **FreeformPadletCards untouched**; storage/auth explicitly NOT chosen —
  they are single-seam swaps better bundled later, and padlets is the
  owner-directed strangler path.

Two DELETE sites sit in the JSX region (the Wall-layout inline
`onPadletDelete` at old L6752/L6760), but the edit is the same
statement-for-statement swap as everywhere else — JSX density was the
argument against the UPDATE family (18 of its 33 sites), not against these
two.

### 0.2 Model: GPT-5.4 is acceptable (Pattern K, fourth application)

All four commands are pure pass-throughs or a fixed two-statement sequence;
16 new bound tests (plus the 9 existing ones) were compiled AND run green by
the CTO at authoring against the exact bound implementation. The two JSX-region
edits are bound OLD/NEW blocks like every other site. Nothing here needs
judgment at implementation time; everything needs exactness. That is the
GPT-5.4 + Pattern K case, proven three times (025/026/027, all byte-perfect).

### 0.3 Aggregate ruling: EXTEND the posts aggregate — no new files (P6)

`padlets` IS the posts table. The delete methods therefore join the EXISTING
`PostsRepository` (`lib/domain/canvas/posts.ts` + `lib/infra/canvas/
postsRepository.ts`) — one repository per table, one trunk folder family.
Creating `postsDelete.ts` or a second padlets repository is FORBIDDEN.
This is the first extension-only Pattern K patch: all four lib files are
bound as WHOLE FILES below; §7.1 characterizes the exact expected diff
against the current tree (posts.ts is pure additions; the other three touch
only enumerated import/type lines).

Interface-extension safety was measured: the only implementors of
`PostsRepository` are `SupabasePostsRepository` (bound in §3) and the test
fake (bound in §4). `PostCardContent.tsx` consumes the factory only and
stays byte-untouched.

### 0.4 Command shapes: composition for conditional cascades, ONE command for the unconditional pair

- `requestDeletePadlet` (old L2726–2750) and the Wall `onPadletDelete`
  (old L6752–6765) each issue parent-delete + children-delete, BUT the
  first one's children statement is **conditional on local state**
  (`children.length > 0`). Merging the pair into one command would either
  always issue the children statement (new DB traffic) or take a boolean
  flag (leaky). Ruling: TWO thin commands (`canvas.deletePost`,
  `canvas.deleteChildPosts`) composed at the call site — DB traffic is
  preserved statement-for-statement, and the site-map §7 sketch ("cascade
  pairs = one command") is consciously adjusted for this pair, with this
  paragraph as the record.
- `handleDeleteChildFromContainer` (old L4264–4278) is an UNCONDITIONAL
  sequential UPDATE+DELETE pair with first-failure-wins — a true
  transaction-shaped user action. Ruling: ONE command
  (`canvas.deleteContainerChild`), exactly as §7 sketched. Its paired
  UPDATE site (old L4266) leaves the UPDATE-family census with it: 33→32.
- `deleteMapPinContainer` (old L2771–2808): the CONTAINER leg already goes
  through the hook helper `deletePadletByIdRaw` (useCanvasData — the
  lint-invisible hook layer, later phase). Only the direct children-delete
  site (old L2793–2796) swaps, onto `canvas.deletePosts`. The hook call and
  its line stay BYTE-IDENTICAL.

### 0.5 Preserved legacy semantics (do NOT repair any of these)

1. **Child-cascade console-swallow, two sites** (old L2750, L6765): a DB
   failure deleting children is `console.error`'d and execution continues —
   the user already saw / still sees a success toast; orphan child rows are
   possible. PRESERVED **at the call site**: the commands return honest
   Results; the call site logs `childResult.error.cause ?? childResult.error`
   (the original supabase error object) with the byte-identical message
   prefix and continues. This is deliberately NOT a command-internal swallow
   (contrast `canvas.setChronoMode`) — no domain code hides an error here.
2. **Success toast before the children delete** in `requestDeletePadlet`
   (old L2736 fires before old L2744–2750): preserved — surrounding lines
   are untouched.
3. **`handleDeleteChildFromContainer` partial failure**: if the container
   metadata write lands and the child delete then fails, the container no
   longer lists the child but the child row survives; the catch runs
   `fetchData()` which resurrects the child in the UI. Preserved via the
   command's first-failure-wins ordering (bound test: "propagates a
   child-delete failure after the container write already landed").
4. **Wholesale container-metadata write** (old L4268): spreads the caller's
   snapshot — a concurrent editor's metadata change can be overwritten.
   Preserved: the command writes `{ ...containerMetadata, childPadletIds }`
   verbatim (bound test pins the merge and `Object.keys === ['metadata',
   'updated_at']` on the infra payload).
5. **`|| []` on `childPadletIds`** (old L4255): a container without
   `childPadletIds` gets the key ADDED as `[]` on this write. The
   computation stays byte-identical at the call site (old L4255–4256 are
   NOT edited); the bound test "adds the key even when it was absent" pins
   the write-side fact.
6. **Map-pin children delete only runs when local state sees children**
   (old L2792): the `if (childIds.length > 0)` line is preserved.

### 0.6 The one relocated cast (full census)

The call-site swap in §6g passes `containerMetadata: ((container.metadata as
any) || {})` — the same relocated-legacy-cast idiom as PATCH-027 §5b
(`canvas?.settings as any`). `{...null}` and `{...{}}` produce the same
payload, so the written bytes are identical to legacy for null metadata.
**No other new casts anywhere**: the four lib files add ZERO casts (the
factory `as unknown as` double-cast predates this patch), and no other
CanvasClient line gains one.

---

## 1. Pre-edit gates (Git Bash from repo root; run ALL; any mismatch = STOP and report)

```bash
git status --short                        # MUST print nothing (clean tree)
git log --oneline -1                      # 75d516e (or a descendant that touches none of the 5 scoped files)
```

CanvasClient census (all measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                              # 8517
grep -c '^[[:space:]]*$' "$F"                           # 727
grep -c "\.from('padlets')" "$F"                        # 60
grep -c '\.from("padlets")' "$F"                        # 1   (commitPadletMeta, double-quoted — NOT in scope)
grep -c "\.delete()" "$F"                               # 8
grep -c "metadata->>parentId" "$F"                      # 2
grep -c "createPostsRepository" "$F"                    # 0
grep -c "domain/canvas/posts" "$F"                      # 0
grep -c "infra/canvas/postsRepository" "$F"             # 0
grep -c "userId: null" "$F"                             # 9
grep -c "childResult" "$F"                              # 0
grep -c "newChildIds" "$F"                              # 16
grep -c "idsToDelete" "$F"                              # 3
grep -c "container.metadata as any" "$F"                # 7
grep -c "childIds\b" "$F"                               # 9
grep -c "deletePadletByIdRaw" "$F"                      # 5
```

Anchor lines (every one must print a line containing `.from('padlets')`;
indentation shown in §6's OLD blocks):

```bash
for L in 2681 2727 2746 2794 3529 4266 4275 6753 6761; do sed -n "${L}p" "$F"; done
```

Trunk-file identity (current, pre-extension):

```bash
wc -l lib/domain/canvas/posts.ts                        # 61
wc -l lib/infra/canvas/postsRepository.ts               # 53
wc -l lib/domain/canvas/posts.test.ts                   # 129
wc -l lib/infra/canvas/postsRepository.test.ts          # 87
grep -c "it(" lib/domain/canvas/posts.test.ts           # 6
grep -c "it(" lib/infra/canvas/postsRepository.test.ts  # 3
```

Interface-extension safety census (files naming PostsRepository — exactly
these five, no others):

```bash
grep -rln "PostsRepository" --include="*.ts" --include="*.tsx" app components lib
# components/collabboard/PostCardContent.tsx   (factory consumer only — stays byte-untouched)
# lib/domain/canvas/posts.test.ts
# lib/domain/canvas/posts.ts
# lib/infra/canvas/postsRepository.test.ts
# lib/infra/canvas/postsRepository.ts
```

Name-collision absence (each MUST print 0 / find nothing):

```bash
grep -rn "createDeletePostCommand\|createDeletePostsCommand\|createDeleteChildPostsCommand\|createDeleteContainerChildCommand\|PostMetadataWriteFields\|deleteByParentId" --include="*.ts" --include="*.tsx" app components lib
# (no output)
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 passed (24) files, 117 passed (117) tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (whole file, exact, 144 lines; CTO compile-verified `tsc --strict` AND unit-tested green at authoring, 2026-07-10)

Replace the file's entire contents with EXACTLY this (expected diff vs
current: PURE ADDITIONS — see §7.1):

```ts
import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { PostId } from '../core/ids';
import { asPostId } from '../core/ids';
import type { Result } from '../core/result';
import { err } from '../core/result';

/**
 * PATCH-025: the first canvas write seam. The `padlets` table name is a
 * legacy schema fact; new code uses neutral naming (P7) - posts.
 *
 * PATCH-028: the padlets DELETE family joins the SAME aggregate (P6 - one
 * repository per table). Deletes carry no payloads, so the repository
 * methods pin the WHERE shapes; the one cascade command preserves the
 * legacy two-statement ordering.
 */

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
  deleteById(id: PostId): Promise<Result<void, DomainError>>;
  deleteByIds(ids: readonly PostId[]): Promise<Result<void, DomainError>>;
  /** Deletes every row whose metadata->>parentId equals the given id. */
  deleteByParentId(parentId: PostId): Promise<Result<void, DomainError>>;
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
```

## 3. BOUND FILE 2 — `lib/infra/canvas/postsRepository.ts` (whole file, exact, 121 lines; CTO compile-verified)

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
          },
    ): PostsUpdateQuery;
    delete(): PostsDeleteQuery;
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
}

export function createPostsRepository(): PostsRepository {
  return new SupabasePostsRepository(
    createBrowserSupabaseClient() as unknown as PostsSupabaseClient,
  );
}
```

## 4. BOUND FILE 3 — `lib/domain/canvas/posts.test.ts` (whole file, exact, 366 lines, 17 tests — 6 existing preserved verbatim + 11 new; CTO ran 17/17 GREEN against §2 at authoring)

```ts
import { describe, expect, it } from 'vitest';
import {
  createDeleteChildPostsCommand,
  createDeleteContainerChildCommand,
  createDeletePostCommand,
  createDeletePostsCommand,
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

  let updateTasksResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdsResult: Result<void, DomainError> = ok(undefined);
  let deleteByParentIdResult: Result<void, DomainError> = ok(undefined);

  const repository: PostsRepository = {
    updateTasks: async (id, fields) => {
      updateTasksCalls.push({ id, fields });
      return updateTasksResult;
    },
    updateMetadata: async (id, fields) => {
      updateMetadataCalls.push({ id, fields });
      return updateMetadataResult;
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
  };

  return {
    repository,
    updateTasksCalls,
    updateMetadataCalls,
    deleteByIdCalls,
    deleteByIdsCalls,
    deleteByParentIdCalls,
    setUpdateTasksResult(result: Result<void, DomainError>) {
      updateTasksResult = result;
    },
    setUpdateMetadataResult(result: Result<void, DomainError>) {
      updateMetadataResult = result;
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
```

## 5. BOUND FILE 4 — `lib/infra/canvas/postsRepository.test.ts` (whole file, exact, 164 lines, 8 tests — 3 existing preserved verbatim + 5 new; CTO ran 8/8 GREEN against §3 at authoring)

```ts
import { describe, expect, it } from 'vitest';
import { SupabasePostsRepository } from './postsRepository';
import { asPostId } from '../../domain/core/ids';

interface FakeError {
  readonly code?: string;
  readonly message?: string;
}

function createFakeClient(error: FakeError | null = null) {
  const fromTables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const deleteInCalls: Array<{ column: string; values: readonly string[] }> = [];

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
      };
    },
  };

  return { client, fromTables, updateCalls, eqCalls, deleteEqCalls, deleteInCalls };
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
});
```

---

## 6. CanvasClient edits (seven bound blocks; OLD must match byte-for-byte INCLUDING indentation before you replace it)

Every line of the file not shown in an OLD block below stays BYTE-IDENTICAL —
including every dependency array (the `supabase` entries at old L3538 and
old L4286 STAY even though the handlers no longer use `supabase`), every
blank line except the one deleted inside §6g's OLD block, and the
`deletePadletByIdRaw` hook call at old L2789.

### §6a — imports (insert 7 lines)

Immediately AFTER current line 48
(`import { createCanvasBoardRepository } from '@/lib/infra/canvas/boardRepository';`)
and BEFORE current line 49
(`import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';`),
insert exactly:

```ts
import {
  createDeleteChildPostsCommand,
  createDeleteContainerChildCommand,
  createDeletePostCommand,
  createDeletePostsCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
```

### §6b — `deletePadletById` (OLD = current L2679–2685, 7 lines → NEW 5 lines)

OLD:

```ts
    try {
      const { error } = await supabase
        .from('padlets')
        .delete()
        .eq('id', id);

      if (error) throw error;
```

NEW:

```ts
    try {
      const deletePost = createDeletePostCommand(createPostsRepository());
      const result = await deletePost({ postId: id }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6c — `requestDeletePadlet`, parent delete (OLD = current L2725–2731, 7 lines → NEW 5 lines)

OLD:

```ts
      // Delete from database
      const { error } = await supabase
        .from('padlets')
        .delete()
        .eq('id', padletId);

      if (error) throw error;
```

NEW:

```ts
      // Delete from database
      const deletePost = createDeletePostCommand(createPostsRepository());
      const result = await deletePost({ postId: padletId }, { userId: null });

      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6d — `requestDeletePadlet`, children delete (OLD = current L2744–2750, 7 lines → NEW 5 lines)

Disclosure note bound here: the trailing `// Efficient DB delete` comment
lives on a deleted statement line and leaves with it.

OLD:

```ts
        // DB delete for children
        const { error: childError } = await supabase
          .from('padlets')
          .delete()
          .eq('metadata->>parentId', padletId); // Efficient DB delete

        if (childError) console.error('Failed to delete children:', childError);
```

NEW:

```ts
        // DB delete for children
        const deleteChildPosts = createDeleteChildPostsCommand(createPostsRepository());
        const childResult = await deleteChildPosts({ parentId: padletId }, { userId: null });

        if (!childResult.ok) console.error('Failed to delete children:', childResult.error.cause ?? childResult.error);
```

### §6e — `deleteMapPinContainer`, children delete (OLD = current L2792–2800, 9 lines → NEW 7 lines)

The container leg (current L2789, `deletePadletByIdRaw`) is NOT touched.

OLD:

```ts
      if (childIds.length > 0) {
        const { error: childError } = await supabase
          .from('padlets')
          .delete()
          .in('id', childIds);
        if (childError) {
          console.error('Failed to delete map pin children:', childError);
        }
      }
```

NEW:

```ts
      if (childIds.length > 0) {
        const deletePosts = createDeletePostsCommand(createPostsRepository());
        const childResult = await deletePosts({ postIds: childIds }, { userId: null });
        if (!childResult.ok) {
          console.error('Failed to delete map pin children:', childResult.error.cause ?? childResult.error);
        }
      }
```

### §6f — `handleUndoPaste` (OLD = current L3527–3532, 6 lines → NEW 4 lines)

The dependency array at current L3538 stays byte-identical (keeps
`supabase`).

OLD:

```ts
    try {
      const { error } = await supabase
        .from('padlets')
        .delete()
        .in('id', idsToDelete);
      if (error) throw error;
```

NEW:

```ts
    try {
      const deletePosts = createDeletePostsCommand(createPostsRepository());
      const result = await deletePosts({ postIds: idsToDelete }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6g — `handleDeleteChildFromContainer` (OLD = current L4264–4278, 15 lines → NEW 12 lines)

Current L4255–4262 (the `oldChildIds`/`newChildIds` computation and the
optimistic update) are NOT touched. The blank line inside the OLD block
(current L4273) is deleted with it — the file's blank-line census moves
727→726 and is gated in §7. The dependency array at current L4286 stays
byte-identical (keeps `supabase`). This block contains the patch's ONE
relocated legacy cast (§0.6).

OLD:

```ts
    try {
      const { error: containerError } = await supabase
        .from('padlets')
        .update({
          metadata: { ...container.metadata, childPadletIds: newChildIds },
          updated_at: new Date().toISOString(),
        })
        .eq('id', containerId);
      if (containerError) throw containerError;

      const { error: childError } = await supabase
        .from('padlets')
        .delete()
        .eq('id', childId);
      if (childError) throw childError;
```

NEW:

```ts
    try {
      const deleteContainerChild = createDeleteContainerChildCommand(createPostsRepository());
      const result = await deleteContainerChild(
        {
          containerId,
          childId,
          containerMetadata: ((container.metadata as any) || {}),
          childPadletIds: newChildIds,
        },
        { userId: null }
      );
      if (!result.ok) throw result.error.cause ?? result.error;
```

### §6h — Wall-layout inline `onPadletDelete` (OLD = current L6751–6765, 15 lines → NEW 11 lines; 20-space indentation, inside JSX)

OLD:

```ts
                    // DB delete item
                    const { error } = await supabase
                      .from('padlets')
                      .delete()
                      .eq('id', padletId);

                    if (error) throw error;

                    // Delete children from DB
                    const { error: childError } = await supabase
                      .from('padlets')
                      .delete()
                      .eq('metadata->>parentId', padletId);

                    if (childError) console.error('Failed to delete children:', childError);
```

NEW:

```ts
                    // DB delete item
                    const deletePost = createDeletePostCommand(createPostsRepository());
                    const result = await deletePost({ postId: padletId }, { userId: null });

                    if (!result.ok) throw result.error.cause ?? result.error;

                    // Delete children from DB
                    const deleteChildPosts = createDeleteChildPostsCommand(createPostsRepository());
                    const childResult = await deleteChildPosts({ parentId: padletId }, { userId: null });

                    if (!childResult.ok) console.error('Failed to delete children:', childResult.error.cause ?? childResult.error);
```

---

## 7. Post-edit gates (run ALL after §2–§6; any mismatch = STOP)

### 7.1 Expected diff shape on the four lib files

`git diff lib/domain/canvas/posts.ts` must show ADDITIONS ONLY (zero `-`
lines). The other three files may show ONLY these removed lines (verbatim),
each replaced by the bound content:

- `lib/infra/canvas/postsRepository.ts` — 6 `-` lines: the old
  `import type { PostsRepository, PostTasksWriteFields } …` line (gains
  `PostMetadataWriteFields`) and the old 5-line non-union `update(payload: {…}): PostsUpdateQuery;` block.
- `lib/domain/canvas/posts.test.ts` — 2 `-` lines: the old single-line
  value import (becomes the 7-line block) and the old type import (gains
  `PostMetadataWriteFields`).
- `lib/infra/canvas/postsRepository.test.ts` — 6 `-` lines: the fake's old
  typed `update(payload: {…}) {` block head (loosens to
  `Record<string, unknown>`) and the old `return { client, … }` line (gains
  the two delete collectors).

Any OTHER `-` line in these diffs = STOP.

### 7.2 CanvasClient census (derived, all bound)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                              # 8507
grep -c '^[[:space:]]*$' "$F"                           # 726
grep -c "\.from('padlets')" "$F"                        # 51
grep -c '\.from("padlets")' "$F"                        # 1
grep -c "\.delete()" "$F"                               # 0
grep -c "metadata->>parentId" "$F"                      # 0
grep -c "createPostsRepository" "$F"                    # 9  (1 import line + 8 call sites — MEASURED on the CTO's edit simulation; the import line is the classic substring collision)
grep -c "createDeletePostCommand" "$F"                  # 4
grep -c "createDeletePostsCommand" "$F"                 # 3
grep -c "createDeleteChildPostsCommand" "$F"            # 3
grep -c "createDeleteContainerChildCommand" "$F"        # 2
grep -c "domain/canvas/posts" "$F"                      # 1
grep -c "infra/canvas/postsRepository" "$F"             # 1
grep -c "userId: null" "$F"                             # 17
grep -c "childResult" "$F"                              # 7
grep -c "newChildIds" "$F"                              # 16
grep -c "idsToDelete" "$F"                              # 3
grep -c "container.metadata as any" "$F"                # 8
grep -c "childIds\b" "$F"                               # 9
grep -c "deletePadletByIdRaw" "$F"                      # 5
```

### 7.3 Lib-file identity

```bash
wc -l lib/domain/canvas/posts.ts                        # 144
wc -l lib/infra/canvas/postsRepository.ts               # 121
wc -l lib/domain/canvas/posts.test.ts                   # 366
wc -l lib/infra/canvas/postsRepository.test.ts          # 164
grep -c "it(" lib/domain/canvas/posts.test.ts           # 17
grep -c "it(" lib/infra/canvas/postsRepository.test.ts  # 8
```

### 7.4 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- components/collabboard/PostCardContent.tsx
git diff -- "components/collabboard/canvas/ui/FreeformPadletCards.tsx"
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts
git diff -- lib/infra/canvas/boardRepository.ts lib/infra/canvas/boardRepository.test.ts
git diff -- lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts
git diff -- lib/domain/boards/repository.ts
git diff -- lib/domain/core lib/infra/supabase
git diff -- eslint.boundaries.config.mjs
git diff -- app/dashboard/canvas/hooks 2>/dev/null; git diff -- hooks lib/hooks 2>/dev/null
git status --short   # exactly the 5 scoped files modified (M), nothing added/untracked
```

(If the hooks live elsewhere, the `git status --short` gate is the binding
one: ANY path outside the five scoped files = STOP.)

### 7.5 Grandfather identity (no movement, 2→2 — do not chase it)

```bash
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2
```

---

## 8. Verification sequence (bind PRINTED TEXT, not exit codes)

**Phase A — baseline (BEFORE any edit):**

1. Port gate: `powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"` → `0`.
2. Start YOUR OWN dev server (background); read the actual port from the startup banner.
3. Warm-up (bound method, adopted from the PATCH-027 deviation): `curl -sS -o /dev/null http://localhost:<port>/`, then the same for `/auth` and `/dashboard`. No `-I`/HEAD requests.
4. Full Playwright: expect **27 passed**. (Cold-start rule: if `/` or `/auth` time out on the FIRST run only, warm again and rerun once.)
5. Run §1's gates.

**Phase B — implement §2–§6, then §7's gates.**

**Phase C — full verification:**

1. `npx tsc --noEmit` → clean. **Stale `.next/types` rule:** if tsc names a ghost file under `.next/types`, stop the dev server, `rm -rf .next`, restart, re-warm, rerun.
2. `npm run check:boundaries` → no output (CanvasClient is still grandfathered; the four lib files must pass on their own).
3. `npx vitest run` → **133 passed (133)**, **24 passed (24)** files.
4. Full Playwright on your own warmed server → **27 passed**.
5. Stop YOUR server (PID-attributed), then the stopped-server gate: the PowerShell count query above → `0`.
6. `rm -rf .next` then `npm run verify` → typecheck + boundaries + unit + production build, all green.

---

## 9. Commit ritual

All five files are already tracked — there is nothing to `git add` for
creation, but stage explicitly anyway, then read status BEFORE committing:

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 5 staged M lines; ANY other line = STOP, do not commit
git commit -m "refactor(canvas): extract the padlets DELETE family onto the canvas ops seam -- four delete commands on the posts aggregate, Pattern K (PATCH-028)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

The `:(literal)` pathspec magic is REQUIRED for the `[id]` segment — the
default pathspec treats `[id]` as a character class and the escaped form
matches nothing (measured, PATCH-026 record).

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation from the bound blocks, however cosmetic: whitespace,
comments, blank lines, EOL bytes (CRLF/LF), re-ordered imports, renamed
locals, extra casts, changed message strings, test-count differences.
Pre-declared, already-disclosed deviations you do NOT need to re-justify
(but DO confirm): the `// Efficient DB delete` comment leaving with §6d's
statement line; the blank line inside §6g's OLD block (blank census
727→726); the one relocated cast in §6g.

STOP (do not improvise, report back for a patch amendment) if:
- any §1 pre-edit gate mismatches;
- any OLD block fails byte-match at its stated lines;
- any bound test fails after implementation (your tree deviates — never
  edit a test);
- `git status --short` shows any path outside the five scoped files;
- tsc/boundaries/unit/e2e fail for a reason the stale-`.next/types` rule
  does not cure.

Do NOT: fix any §0.5 legacy defect; touch FreeformPadletCards, hooks, or
PostCardContent; create any new file; de-lint types; chase the grandfather
list (it stays at 2).
