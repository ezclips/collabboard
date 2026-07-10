# PATCH-036 — CanvasClient strangler group 11: the map comments read-merge-write (new seam — `canvas.updatePostComments` + the aggregate's FIRST read method) — non-auth padlets EXTINCTION

**Status:** READY FOR IMPLEMENTATION
**Model:** **GPT-5.4** (Pattern K, twelfth application; see §0.6)
**Pattern:** K — canvas ops command (§5.11), NEW CAPABILITY extension: one new repository READ method + one new domain command (ZERO new write methods — see §0.3)
**Scope:** `app/dashboard/canvas/[id]/CanvasClient.tsx` (ONE bound block + one import edit), `lib/domain/canvas/posts.ts`, `lib/domain/canvas/posts.test.ts`, `lib/infra/canvas/postsRepository.ts`, `lib/infra/canvas/postsRepository.test.ts` — **FIVE files total.**
**Authored:** 2026-07-10 (Fable 5 CTO). Census measured at commit `139fd11`; all four domain/infra files compiled (`tsc --strict`) and run (84/84 green: 62 posts + 22 postsRepository) in scratch; both CanvasClient edits applied to a scratch copy and every gate below measured on that simulation, including the bound post-edit hashes.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. Bound tests are the
> fidelity net — never edit one; STOP and report instead (§8).

---

## 0. CTO rulings

### 0.1 Site analysis: the LAST non-auth pair

Post-035 census (regenerated 2026-07-10 at `139fd11`): exactly ONE padlets
SELECT (L6959) + ONE padlets UPDATE (L6971) remain in CanvasClient, both
inside the map layout's `onUpdateChildComments` handler (L6941–6984). The
auth trio (`updateUser`/`getUser`/`onAuthStateChange`) is out of scope by
standing rule (GPT-5.5 territory). Full contract of the handler:

| Phase | Legacy code | Contract |
|---|---|---|
| optimistic | `setPadlets` merges `[field]: comments` over LOCAL `p.metadata`, mirrors `content: JSON.stringify(comments)` when `field === 'comments'`, stamps `updated_at: nowIso` | runs BEFORE any network call; stays at the call site byte-identical |
| read | `.select('metadata').eq('id', childId).maybeSingle()`; `if (readError) throw readError` | HONEST — a read failure throws the ORIGINAL supabase error into the catch (console.error + toast + fetchData) |
| merge | `{ ...((existingChild?.metadata as Record<string, unknown> \| null) \|\| {}), [field]: comments }` | fresh-DB-copy merge (NOT local state); a missing row AND a null metadata column BOTH collapse onto `{}` via `\|\| {}` |
| write | bare-awaited `.update({ metadata, ...(field === 'comments' ? { content } : {}), updated_at: nowIso })` | resolved errors SILENTLY SWALLOWED (result never read); only a THROWN network error reaches the same catch |
| not-found | merge over `{}`, then the UPDATE matches 0 rows | silent no-op, no error — preserved |
| timestamp | `nowIso` computed ONCE, shared by the optimistic update and the DB write | the command CANNOT stamp its own time — `updatedAt` must be caller-supplied input (the `attachPostToSchedulerContainer` precedent) |

The "dynamic" `[field]` key is NOT actually open-ended: the map layout's
prop type (`components/map/MapCanvas.tsx` L119, and identically on every
other layout that declares this callback) is
`(childId: string, comments: unknown[], options?: { field?: 'comments' | 'detachedComments' }) => void`
— a TWO-VALUE literal union with `comments: unknown[]`. `field =
options?.field ?? 'comments'`. This makes the merge precisely bindable
with a `z.enum` that IS the legacy type, not a restriction of it.

### 0.2 THE SELECT RULING (owner-requested): the aggregate's FIRST read method

**Ruled: the SELECT becomes `PostsRepository.findMetadataById` — the
aggregate's first read method. It does NOT stay raw.** Four reasons:

1. **This is not a rendering read.** It exists solely as the read half of
   a read-modify-write cycle feeding a write command. The standing
   deferral of reads to the hooks batch governs RENDERING reads (the 26
   hook sites); an RMW-internal read belongs to the aggregate that owns
   the write — that is what the repository pattern is FOR.
2. **P6 — trunk growth, not a fork.** Posts reads will land on
   `PostsRepository` in the hooks phase anyway (one repository per
   table). `findMetadataById` is the same trunk the read phase will
   extend, not a competing structure.
3. **Leaving the SELECT raw strands half an operation on each side of the
   seam**: the JSX would keep the fetch, the merge, the not-found
   collapse, and a raw supabase call, while the command carried only a
   pre-merged write — the fresh-copy freshness choice and the `|| {}`
   semantics would stay untested in JSX forever.
4. **It completes non-auth padlets EXTINCTION** (`from('padlets')` 2→0):
   after this patch, CanvasClient's entire remaining supabase surface is
   the auth trio. A clean phase boundary for the strangler.

Method contract: `findMetadataById(id): Promise<Result<Record<string,
unknown> | null, DomainError>>` — returns the metadata object; `null` for
BOTH a missing row and a null metadata column (the legacy site collapsed
both onto `{}`, so the distinction was never observable — the command's
`|| {}` reproduces the collapse exactly, including for a hypothetical
falsy non-null JSONB scalar). `.maybeSingle()` semantics pinned by three
infra tests (row present / row missing / metadata null) plus the error
mapping.

### 0.3 Write-leg ruling: ZERO new write methods — shape reuse

The two write shapes ALREADY EXIST on the repository, byte-for-byte:

- `field === 'comments'` sends `{ metadata, content, updated_at }` — the
  EXACT column triple `updateTasks` sends (its fields already take
  caller-supplied `updatedAt`).
- `field === 'detachedComments'` sends `{ metadata, updated_at }` — the
  EXACT `updateMetadata` shape (caller-supplied `updatedAt`, the
  `attachPostToSchedulerContainer` precedent).

So the command branches on `field` and calls the existing, already-pinned
methods — one repository method per column shape, P6 applied literally.
Two disclosed facts ride this ruling (confirm, don't re-justify):

1. **Payload key ORDER differs from the legacy literal**: `updateTasks`
   sends `content` first where the legacy site wrote `metadata` first.
   This is a JSON-body fact with NO SQL-level observability (PostgREST
   builds SET clauses from keys) — the columns and values are identical.
2. **The repository error messages** (`'Could not update the post
   tasks'` / `'Could not update the post'`) are UNREACHABLE at this site
   in every channel: resolved errors are swallowed (Result ignored) and
   thrown errors propagate the original exception, not the domainError.
   Reuse is behaviorally invisible.
3. `updateTasks`'s doc comment ("the exact three-column payload the
   legacy toggle writes") becomes stale under a second consumer — it is
   AMENDED in the bound file (the P0 doc-bug rule), the one deletion
   line in this patch's posts.ts diff.

### 0.4 Command design: `canvas.updatePostComments` — a MIXED contract, exactly as legacy

Input `{ postId, field: z.enum(['comments', 'detachedComments']),
comments: z.array(z.unknown()), updatedAt: z.string() }`.

- **Read leg HONEST**: `findMetadataById` failure → the command returns
  the err Result → the call site's cause-unwrap throw delivers the
  ORIGINAL supabase error into the catch — byte-equivalent to the legacy
  `if (readError) throw readError`, and NO write runs (pinned).
- **Write leg SWALLOWED**: the branch write is bare-awaited, its resolved
  Result ignored, `ok(undefined)` returned — the **NINTH command-internal
  swallow site** (write leg only; the first MIXED-contract member of the
  standing P3 family, precedent-adjacent to `attachPostToSchedulerContainer`
  which swallows both statements). A thrown exception escapes `execute`,
  `defineCommand` converts it to `err('unknown', { cause })`, and the
  call site re-throws the cause into the same catch — the legacy thrown
  channel, exact.
- **NO authorized behavior change**: both channels port exactly; the
  catch (console.error + toast.error + fetchData) stays byte-identical.
- The `z.enum` is the legacy prop type, not a narrowing: every layout
  declaring this callback types `field` as the same two-value union, so
  no runtime caller can pass anything else without a compile error that
  already exists today. A `field` outside the union now returns a
  validation error with no read and no write (pinned) — previously
  unreachable input, same outcome class as PATCH-025's toggleTask
  non-array ruling.

### 0.5 Preserved semantics + disclosed facts (confirm, don't re-justify)

1. The optimistic `setPadlets` block (local merge over `p.metadata` with
   its legacy `as any`, the conditional `content` mirror, `updated_at:
   nowIso`) stays BYTE-IDENTICAL at the call site, as do the
   `const field` / `const nowIso` lines and the whole try/catch frame.
2. The read-then-write RACE (no transaction; a concurrent writer between
   the two statements can be overwritten) is a preserved legacy fact —
   two sequential statements before, two sequential repository calls now.
3. The not-found path stays a silent no-op: merge over `{}`, UPDATE
   matches 0 rows, no error (§0.2).
4. The legacy cast `as Record<string, unknown> | null` RETIRES with the
   block (CanvasClient census 1→0); ZERO new casts anywhere — the typed
   read method makes the merge cast-free in the command.
5. `result.error.cause` census RISES 39→40 (the new call-site throw uses
   a lowercase `result` local, matched by the instrument — unlike 035's
   `titleResult`); `supabase` drops by exactly the two statement lines
   (34→32); `maybeSingle` goes 1→0; `nextMetadataForDb` goes 2→0 (the
   merge now lives in the command).
6. Blank census drops 731→729 (the OLD block's two interior blank lines
   leave with it); wc 8400→8384.
7. Both field branches stamp `updated_at` with the CALLER's `nowIso` —
   matching the legacy write, which included `updated_at: nowIso` in both
   cases.

### 0.6 Model: GPT-5.4, Pattern K twelfth application

One read method (13 lines), one command (~50 lines with the branch), one
schema, one structural query interface. 84 bound tests (12 new: 8 domain
+ 4 infra; 72 existing re-run non-breaking) compiled and run GREEN at
authoring. Single-consumer swap, no `Promise.all`, no settle-order
ambiguity; the sequencing fact (read STRICTLY before write, no write on
read failure) is pinned by the abort test.

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # 139fd11 (or a descendant touching none of the 5 scoped files)
```

Byte-identity (all five files):

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # b6deaf388c0f3825bd8053b958618d802ed17036
git hash-object lib/domain/canvas/posts.ts                     # 0a4edcd73109e7157132daffad5d764ea2afaee0
git hash-object lib/domain/canvas/posts.test.ts                # 65378560b8981f2bc45ca303329d075f14437165
git hash-object lib/infra/canvas/postsRepository.ts             # 3dfe425c70685b18a9f874fb3f5ec5190ddea632
git hash-object lib/infra/canvas/postsRepository.test.ts       # 5c69be50d2c0602335aceea378977bc4ff8435c9
```

CanvasClient census (measured 2026-07-10):

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8400
grep -c '^[[:space:]]*$' "$F"             # 731
grep -c "\.from('padlets')" "$F"          # 2   (the bound pair — extinction gate)
grep -c "maybeSingle" "$F"                # 1
grep -c "createUpdatePostCommentsCommand" "$F"   # 0
grep -c "updatePostComments" "$F"         # 0
grep -c "createPostsRepository" "$F"      # 52
grep -c "userId: null" "$F"               # 62
grep -c "result.error.cause" "$F"         # 39
grep -c "supabase" "$F"                   # 34
grep -c "as Record<string, unknown> | null" "$F"   # 1   (retires with the block)
grep -c "nextMetadataForDb" "$F"          # 2
```

Anchors:

```bash
sed -n '6959p' "$F"   #                       const { data: existingChild, error: readError } = await supabase
sed -n '6971p' "$F"   #                       await supabase
grep -n "onUpdateChildComments?: (childId: string, comments: unknown\[\]" components/map/MapCanvas.tsx   # 119 (the field union source, §0.1)
```

Repo-wide new-name collision (must print 0):

```bash
grep -rn "canvas.updatePostComments\|createUpdatePostCommentsCommand\|updatePostCommentsSchema\|findMetadataById\|PostsMetadataSelectQuery" --include="*.ts" --include="*.tsx" app components lib | wc -l   # 0
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 24 files, 180 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
```

---

## 2. BOUND FILE 1 — `lib/domain/canvas/posts.ts` (whole file, exact, 539 lines; CTO compile+test verified; post-edit hash `9d64acb5d9660c20e6b06f86e7339edee2810a03`)

The diff vs current: the `PostTasksWriteFields` doc comment is AMENDED
(the one deletion line — §0.3.3), the interface gains `findMetadataById`
(+ doc comment), and one schema + one command are appended at EOF —
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

/**
 * The exact three-column payload the legacy toggle writes. Since PATCH-036
 * the comments-mirror branch of canvas.updatePostComments sends the SAME
 * triple through updateTasks - one repository method per column shape.
 */
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
  /** Legacy clipart title clear sends title ONLY - no updated_at (old L7581-7584). */
  updateTitle(id: PostId, fields: { readonly title: string }): Promise<Result<void, DomainError>>;
  /**
   * The aggregate's FIRST read (PATCH-036): one post's metadata for the map
   * comments read-merge-write. Returns null when the row is missing OR its
   * metadata column is null - the legacy site collapsed both onto {}.
   */
  findMetadataById(id: PostId): Promise<Result<Record<string, unknown> | null, DomainError>>;
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

export const updatePostTitleBestEffortSchema = z.object({
  postId: z.string(),
  /** The one legacy consumer clears to '' - the command accepts any title string. */
  title: z.string(),
});

/**
 * The title write sends NO updated_at (legacy old L7581-7584) and its one
 * consumer (the clipart icon replace) awaited it bare with NO try/catch -
 * the best-effort shape, unstamped by design.
 */
export const createUpdatePostTitleBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostTitleBestEffort',
    input: updatePostTitleBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-035; queued P3-family fix, do NOT
      // repair here): the legacy clipart icon-replace site awaited this
      // title clear bare with NO try/catch - a resolved DB error was
      // silently swallowed; only a THROWN network error rejected the
      // handler. Faithful port: ignore the resolved Result; a thrown
      // exception escapes execute and surfaces via defineCommand's catch.
      await repository.updateTitle(asPostId(input.postId), {
        title: input.title,
      });
      return ok(undefined);
    },
  });

export const updatePostCommentsSchema = z.object({
  postId: z.string(),
  /** The two comment stores the legacy map prop type names (old L6942). */
  field: z.enum(['comments', 'detachedComments']),
  /** The full replacement comment list, passed through untyped (legacy shape). */
  comments: z.array(z.unknown()),
  /** The call site's shared nowIso - the SAME string already stamps the optimistic update. */
  updatedAt: z.string(),
});

/**
 * The map comments read-merge-write (PATCH-036): fetch the post's CURRENT
 * metadata (a fresh DB copy, NOT local state - the legacy site's freshness
 * choice), merge `[field]: comments` over it, then write - mirroring the
 * list into `content` via updateTasks when field is 'comments' (the same
 * column triple), or metadata alone via updateMetadata for
 * 'detachedComments'. The read leg is HONEST (a failure aborts and
 * surfaces); the write leg preserves the legacy bare-await swallow.
 */
export const createUpdatePostCommentsCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostComments',
    input: updatePostCommentsSchema,
    execute: async (input) => {
      const readResult = await repository.findMetadataById(asPostId(input.postId));
      if (!readResult.ok) {
        return readResult;
      }

      const nextMetadataForDb = {
        ...(readResult.value || {}),
        [input.field]: input.comments,
      };

      // PRESERVED LEGACY DEFECT (PATCH-036; queued P3-family fix, do NOT
      // repair here): the legacy map handler awaited this write bare - a
      // resolved DB error was silently swallowed; only a THROWN network
      // error reached the handler's catch. Faithful port: ignore the
      // resolved Result; a thrown exception escapes execute and surfaces
      // via defineCommand's catch.
      if (input.field === 'comments') {
        await repository.updateTasks(asPostId(input.postId), {
          content: JSON.stringify(input.comments),
          metadata: nextMetadataForDb,
          updatedAt: input.updatedAt,
        });
      } else {
        await repository.updateMetadata(asPostId(input.postId), {
          metadata: nextMetadataForDb,
          updatedAt: input.updatedAt,
        });
      }
      return ok(undefined);
    },
  });
```

## 3. BOUND FILE 2 — `lib/domain/canvas/posts.test.ts` (whole file, exact, 1156 lines, 62 tests — 54 existing + 8 new; CTO ran 62/62 GREEN; post-edit hash `4f1e2aff98e6ee01f69e98b7c2f2dc1300e0f08e`)

The diff vs current is INSERTION-ONLY but SCATTERED (six touch points:
the import gains one name; the fake repository gains a `findMetadataById`
call collector, result holder, method, return entry, and setter) plus one
describe block appended at EOF. Zero deletions — confirmed via the
whole-file hash. Replace the file with exactly:

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
  createUpdatePostCommentsCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedBestEffortCommand,
  createUpdatePostMetadataUnstampedCommand,
  createUpdatePostPositionCommand,
  createUpdatePostPositionWithMetadataBestEffortCommand,
  createUpdatePostTitleBestEffortCommand,
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
  const updateTitleCalls: Array<{ id: PostId; fields: { readonly title: string } }> = [];
  const insertCalls: object[] = [];
  const insertReturningCalls: object[] = [];
  const findMetadataByIdCalls: PostId[] = [];
  let updateTasksResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdResult: Result<void, DomainError> = ok(undefined);
  let deleteByIdsResult: Result<void, DomainError> = ok(undefined);
  let deleteByParentIdResult: Result<void, DomainError> = ok(undefined);
  let updateMetadataUnstampedResult: Result<void, DomainError> = ok(undefined);
  let updatePositionResult: Result<void, DomainError> = ok(undefined);
  let updateTitleResult: Result<void, DomainError> = ok(undefined);
  const insertResultQueue: Array<Result<void, DomainError>> = [];
  let insertReturningResult: Result<Record<string, unknown> | null, DomainError> = ok(null);
  let findMetadataByIdResult: Result<Record<string, unknown> | null, DomainError> = ok(null);

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
    updateTitle: async (id, fields) => {
      updateTitleCalls.push({ id, fields });
      return updateTitleResult;
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
    findMetadataById: async (id) => {
      findMetadataByIdCalls.push(id);
      return findMetadataByIdResult;
    },
  };

  return {
    repository,
    updateTasksCalls,
    updateMetadataCalls,
    updateMetadataUnstampedCalls,
    updatePositionCalls,
    updateTitleCalls,
    deleteByIdCalls,
    deleteByIdsCalls,
    deleteByParentIdCalls,
    insertCalls,
    insertReturningCalls,
    findMetadataByIdCalls,
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
    setUpdateTitleResult(result: Result<void, DomainError>) {
      updateTitleResult = result;
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
    setFindMetadataByIdResult(result: Result<Record<string, unknown> | null, DomainError>) {
      findMetadataByIdResult = result;
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

describe('canvas.updatePostTitleBestEffort', () => {
  it('writes ONLY the title - no timestamp field - and returns ok', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostTitleBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', title: '' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateTitleCalls).toHaveLength(1);
    expect(fake.updateTitleCalls[0].id).toBe('post-1');
    expect(fake.updateTitleCalls[0].fields).toEqual({ title: '' });
    expect(Object.keys(fake.updateTitleCalls[0].fields)).toEqual(['title']);
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateTitleResult(err(domainError('unavailable', 'db down')));
    const bestEffort = createUpdatePostTitleBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', title: '' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateTitleCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostTitleBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateTitleCalls).toHaveLength(0);
  });
});

describe('canvas.updatePostComments', () => {
  const savedComments = [
    { id: 'c-1', text: 'first' },
    { id: 'c-2', text: 'second' },
  ];

  it('comments branch: merges over the FETCHED metadata and mirrors into content via the tasks triple', async () => {
    const fake = createFakeRepository();
    fake.setFindMetadataByIdResult(ok({ todoTitle: 'Note', pinned: true, comments: [{ id: 'c-old' }] }));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'comments', comments: savedComments, updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.findMetadataByIdCalls).toEqual(['post-1']);
    expect(fake.updateTasksCalls).toHaveLength(1);
    expect(fake.updateTasksCalls[0].id).toBe('post-1');
    expect(fake.updateTasksCalls[0].fields.metadata).toEqual({
      todoTitle: 'Note',
      pinned: true,
      comments: savedComments,
    });
    expect(fake.updateTasksCalls[0].fields.content).toBe(JSON.stringify(savedComments));
    expect(fake.updateTasksCalls[0].fields.updatedAt).toBe('2026-07-10T12:00:00.000Z');
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('detachedComments branch: writes metadata + the INPUT timestamp only - no content column', async () => {
    const fake = createFakeRepository();
    fake.setFindMetadataByIdResult(ok({ comments: [{ id: 'kept' }] }));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'detachedComments', comments: savedComments, updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
    expect(fake.updateMetadataCalls[0].fields.metadata).toEqual({
      comments: [{ id: 'kept' }],
      detachedComments: savedComments,
    });
    expect(fake.updateMetadataCalls[0].fields.updatedAt).toBe('2026-07-10T12:00:00.000Z');
    expect(Object.keys(fake.updateMetadataCalls[0].fields)).toEqual(['metadata', 'updatedAt']);
    expect(fake.updateTasksCalls).toHaveLength(0);
  });

  it('merges over {} when the post row is missing or its metadata is null (legacy || {} fact)', async () => {
    const fake = createFakeRepository();
    fake.setFindMetadataByIdResult(ok(null));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'comments', comments: savedComments, updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateTasksCalls[0].fields.metadata).toEqual({ comments: savedComments });
  });

  it('read leg is HONEST: a read failure aborts with no write', async () => {
    const fake = createFakeRepository();
    fake.setFindMetadataByIdResult(err(domainError('unavailable', 'db down')));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'comments', comments: [], updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
    expect(fake.updateTasksCalls).toHaveLength(0);
    expect(fake.updateMetadataCalls).toHaveLength(0);
  });

  it('preserves the legacy swallow: a resolved comments-write failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateTasksResult(err(domainError('unavailable', 'db down')));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'comments', comments: [], updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateTasksCalls).toHaveLength(1);
  });

  it('preserves the legacy swallow: a resolved detached-write failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateMetadataResult(err(domainError('unavailable', 'db down')));
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'detachedComments', comments: [], updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(fake.updateMetadataCalls).toHaveLength(1);
  });

  it('rejects a field outside the two legacy stores without reading or writing', async () => {
    const fake = createFakeRepository();
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'other', comments: [], updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.findMetadataByIdCalls).toHaveLength(0);
    expect(fake.updateTasksCalls).toHaveLength(0);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const updatePostComments = createUpdatePostCommentsCommand(fake.repository);

    const result = await updatePostComments(
      { postId: 'post-1', field: 'comments', updatedAt: '2026-07-10T12:00:00.000Z' },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.findMetadataByIdCalls).toHaveLength(0);
  });
});
```

## 4. BOUND FILE 3 — `lib/infra/canvas/postsRepository.ts` (whole file, exact, 246 lines; CTO compile+test verified; post-edit hash `7af06d87042c7a378d73c9943f11e4eb53d2392d`)

The diff vs current is PURE ADDITIONS: a new `PostsMetadataSelectQuery`
structural interface, one `select` line on the client interface, and the
`findMetadataById` method inserted between `updateTitle` and
`deleteById`. Replace the file with exactly:

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

interface PostsMetadataSelectQuery {
  eq(column: 'id', value: PostId): {
    maybeSingle(): Promise<{
      data: { metadata: Record<string, unknown> | null } | null;
      error: SupabaseErrorLike | null;
    }>;
  };
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
          }
        | { title: string },
    ): PostsUpdateQuery;
    select(columns: 'metadata'): PostsMetadataSelectQuery;
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

  async updateTitle(
    id: PostId,
    fields: { readonly title: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({ title: fields.title })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post title', { cause: error }));
    }

    return ok(undefined);
  }

  async findMetadataById(id: PostId): Promise<Result<Record<string, unknown> | null, DomainError>> {
    const { data, error } = await this.client
      .from('padlets')
      .select('metadata')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return err(domainError('unavailable', 'Could not load the post', { cause: error }));
    }

    return ok(data?.metadata ?? null);
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

## 5. BOUND FILE 4 — `lib/infra/canvas/postsRepository.test.ts` (whole file, exact, 445 lines, 22 tests — 18 existing + 4 new; CTO ran 22/22 GREEN; post-edit hash `77eaf22cb8177b61dd8dc02b97aaf26385705797`)

The diff vs current is PURE ADDITIONS: the fake-client factory gains a
third defaulted `metadataRow` parameter (existing calls unaffected), two
collectors, a `select` builder on the fake, two return entries, and one
describe block appended at EOF. Replace the file with exactly:

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
  metadataRow: { metadata: Record<string, unknown> | null } | null = { metadata: {} },
) {
  const fromTables: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const eqCalls: Array<{ column: string; value: string }> = [];
  const deleteEqCalls: Array<{ column: string; value: string }> = [];
  const deleteInCalls: Array<{ column: string; values: readonly string[] }> = [];
  const insertCalls: object[] = [];
  const selectSingleCalls: object[] = [];
  const selectColumnsCalls: string[] = [];
  const selectMetadataEqCalls: Array<{ column: string; value: string }> = [];

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
        select(columns: 'metadata') {
          selectColumnsCalls.push(columns);
          return {
            eq: (column: 'id', value: string) => {
              selectMetadataEqCalls.push({ column, value });
              return {
                maybeSingle: async () => ({ data: metadataRow, error }),
              };
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
    selectColumnsCalls,
    selectMetadataEqCalls,
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

describe('SupabasePostsRepository.updateTitle', () => {
  it('sends ONLY the title payload - no updated_at key', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitle(asPostId('post-1'), { title: '' });

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([{ title: '' }]);
    expect(Object.keys(updateCalls[0])).toEqual(['title']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitle(asPostId('post-1'), { title: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('SupabasePostsRepository.findMetadataById', () => {
  it('selects ONLY the metadata column filtered by the post id and returns it', async () => {
    const { client, fromTables, selectColumnsCalls, selectMetadataEqCalls, updateCalls } =
      createFakeClient(null, { id: 'row-1' }, { metadata: { comments: [{ id: 'c-1' }] } });
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ comments: [{ id: 'c-1' }] });
    }
    expect(fromTables).toEqual(['padlets']);
    expect(selectColumnsCalls).toEqual(['metadata']);
    expect(selectMetadataEqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns null when the row is missing (maybeSingle data null)', async () => {
    const { client } = createFakeClient(null, { id: 'row-1' }, null);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('returns null when the metadata column itself is null', async () => {
    const { client } = createFakeClient(null, { id: 'row-1' }, { metadata: null });
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.findMetadataById(asPostId('post-1'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

---

## 6. CanvasClient edits (ONE import edit + ONE bound block)

Everything else stays BYTE-IDENTICAL — including the optimistic
`setPadlets` block, the `const field` / `const nowIso` lines, the
`try {` / `catch` frame, and the auth trio.

### §6a — posts import block: one name inserted alphabetically (current L58–L59)

Replace

```ts
  createGroupPostIntoContainerCommand,
  createUpdatePostMetadataBestEffortCommand,
```

with

```ts
  createGroupPostIntoContainerCommand,
  createUpdatePostCommentsCommand,
  createUpdatePostMetadataBestEffortCommand,
```

### §6b — map onUpdateChildComments, the read-merge-write (OLD = current L6959–6978, 20 lines → NEW 3)

OLD:

```ts
                      const { data: existingChild, error: readError } = await supabase
                        .from('padlets')
                        .select('metadata')
                        .eq('id', childId)
                        .maybeSingle();
                      if (readError) throw readError;

                      const nextMetadataForDb = {
                        ...((existingChild?.metadata as Record<string, unknown> | null) || {}),
                        [field]: comments,
                      };

                      await supabase
                        .from('padlets')
                        .update({
                          metadata: nextMetadataForDb,
                          ...(field === 'comments' ? { content: JSON.stringify(comments) } : {}),
                          updated_at: nowIso,
                        })
                        .eq('id', childId);
```

NEW:

```ts
                      const updatePostComments = createUpdatePostCommentsCommand(createPostsRepository());
                      const result = await updatePostComments({ postId: childId, field, comments, updatedAt: nowIso }, { userId: null });
                      if (!result.ok) throw result.error.cause ?? result.error;
```

---

## 7. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 7.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"   # 0fb49089a9cc11b80d25dd431bb7448b246593f5
git hash-object lib/domain/canvas/posts.ts                     # 9d64acb5d9660c20e6b06f86e7339edee2810a03
git hash-object lib/domain/canvas/posts.test.ts                # 4f1e2aff98e6ee01f69e98b7c2f2dc1300e0f08e
git hash-object lib/infra/canvas/postsRepository.ts             # 7af06d87042c7a378d73c9943f11e4eb53d2392d
git hash-object lib/infra/canvas/postsRepository.test.ts       # 77eaf22cb8177b61dd8dc02b97aaf26385705797
git ls-files --eol -- "app/dashboard/canvas/[id]/CanvasClient.tsx" lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts
# every row: i/lf    w/lf
```

### 7.1 CanvasClient census (simulation-measured)

```bash
F="app/dashboard/canvas/[id]/CanvasClient.tsx"
wc -l "$F"                                # 8384
grep -c '^[[:space:]]*$' "$F"             # 729
grep -c "\.from('padlets')" "$F"          # 0   (EXTINCTION — the remaining supabase surface is the auth trio)
grep -c "maybeSingle" "$F"                # 0
grep -c "createUpdatePostCommentsCommand" "$F"   # 2   (1 import + 1 use)
grep -c "updatePostComments" "$F"         # 2
grep -c "createPostsRepository" "$F"      # 53
grep -c "userId: null" "$F"               # 63
grep -c "result.error.cause" "$F"         # 40
grep -c "supabase" "$F"                   # 32
grep -c "as Record<string, unknown> | null" "$F"   # 0   (legacy cast retired)
grep -c "nextMetadataForDb" "$F"          # 0   (the merge lives in the command now)
```

### 7.2 Lib-file identity + suite

```bash
wc -l lib/domain/canvas/posts.ts                    # 539
wc -l lib/domain/canvas/posts.test.ts                # 1156
wc -l lib/infra/canvas/postsRepository.ts            # 246
wc -l lib/infra/canvas/postsRepository.test.ts       # 445
grep -c "it(" lib/domain/canvas/posts.test.ts               # 62
grep -c "it(" lib/infra/canvas/postsRepository.test.ts      # 22
git diff lib/domain/canvas/posts.ts | grep -c "^-[^-]"                 # 1  (the amended updateTasks doc-comment line — §0.3.3)
git diff lib/domain/canvas/posts.test.ts | grep -c "^-[^-]"            # 0  (scattered but insertion-only)
git diff lib/infra/canvas/postsRepository.ts | grep -c "^-[^-]"        # 0  (pure additions)
git diff lib/infra/canvas/postsRepository.test.ts | grep -c "^-[^-]"   # 0  (pure additions)
```

### 7.3 Byte-untouched gates (each MUST print nothing)

```bash
git diff -- components/collabboard/PostCardContent.tsx "components/collabboard/canvas/ui/FreeformPadletCards.tsx" components/map/MapCanvas.tsx
git diff -- lib/domain/canvas/board.ts lib/domain/canvas/board.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts
git diff -- lib/domain/boards/repository.ts lib/domain/core eslint.boundaries.config.mjs lib/infra/supabase
git status --short   # exactly the 5 scoped files (M); ANY other path = STOP
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 8. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§6, then §7 gates (hashes first).

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **192 passed (192), 24 files**; full Playwright warmed → **27 passed**; stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` (typecheck + boundaries + unit + production build) all green.

## 9. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
git status --short   # exactly 5 staged M lines; anything else = STOP
git commit -m "refactor(canvas): extract the map comments read-merge-write onto a new canvas.updatePostComments seam -- first aggregate read method, padlets extinct in CanvasClient, Pattern K (PATCH-036)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts lib/infra/canvas/postsRepository.ts lib/infra/canvas/postsRepository.test.ts ":(literal)app/dashboard/canvas/[id]/CanvasClient.tsx"
```

`:(literal)` is REQUIRED for the `[id]` segment (measured; the escaped form
matches nothing).

## 10. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): the ONE deletion line in
posts.ts (the amended updateTasks doc comment, §0.3.3); the payload
key-order difference on the comments branch (§0.3.1 — content-first via
updateTasks vs the legacy metadata-first literal; no SQL-level
observability); the retired legacy cast (census 1→0); `result.error.cause`
RISING 39→40 (lowercase local, instrument-matched — the opposite of 035's
titleResult note); `supabase` dropping by the two statement lines (34→32);
blank census 731→729; `posts.test.ts` is a SCATTERED insertion-only edit
(six touch points plus the EOF append), confirmed via the whole-file hash;
ZERO new casts; NO authorized behavior change anywhere in this patch
(§0.4).

STOP if: any §1 gate mismatches; the OLD block fails byte-match at its
bound lines; any bound test fails (never edit a test); any §7.0 hash
mismatches after one fix attempt against the fences; `git status --short`
shows any path outside the FIVE scoped files; tsc/boundaries/unit/e2e fail
beyond the stale-`.next/types` cure.

Do NOT: touch the optimistic `setPadlets` block, the `const field` /
`const nowIso` lines, or the catch; touch the auth trio (GPT-5.5
territory), the hooks, FreeformPadletCards, MapCanvas, or any other
infra file; create files beyond what's bound; de-lint types; chase the
grandfather list (stays 2).
