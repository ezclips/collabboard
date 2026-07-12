# PATCH-048 — hooks slice 11: the postsRaw consumer shrink-down begins — `updateDrawingLayoutPadlet` onto `canvas.updatePostFields` (the hook's LAST internal raw contract retired)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, twenty-third application — one narrow
domain addition with fully bound tests + one contiguous hook-region swap of the
established 045 idiom).
**Authored:** 2026-07-11 at `15f151e` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.6).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply:
never `git checkout/restore` a byte-fenced file; verify hashes ONLY with
`git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(canvas): extract updateDrawingLayoutPadlet onto canvas.updatePostFields -- postsRaw consumer shrink-down begins, the hook's last internal raw contract retired via the 045 channel discrimination, unstamped dynamic passthrough, postsRaw untouched at its fence, hooks slice 11, Pattern K (PATCH-048)
```

---

## 0. CTO rulings and contract analysis

### 0.1 The census-driven slice ruling

The live census maps postsRaw's five hook delegations onto exactly two
classes:

1. **Four PURE PASSTHROUGHS** (`insertPadlet`, `insertPadletAndSelectSingle`,
   `updatePadletById`, `deletePadletByIdRaw`) — each RETURNS the raw builder
   result to CanvasClient, whose ~24 call sites (plus the L5903 JSX prop
   hand-off) destructure `{ data, error }` directly. **RULING: these STAY
   RAW** — the 021/042 exception re-affirmed. Translating them IS the
   CanvasClient/FreeformPadletCards strangling (per-call-site work on the
   over-ceiling monolith), not this patch. NO postsRaw export retires yet;
   the module's fence (`SHRINK-ONLY`) and its hash are BOUND UNCHANGED below.
2. **ONE hook-internal contract** — `updateDrawingLayoutPadlet`: its raw
   `{ error }` shape terminates INSIDE the hook (returns void to
   CanvasClient; its callers see zero difference). **RULING (the owner's
   required per-consumer translation ruling): AUTHORIZED for this consumer
   ONLY — and it is NOT a behavior change.** Both legacy channels are
   preserved exactly via the landed 045 error-code discrimination (§0.2).

After this patch the boundary is clean: postsRaw = CanvasClient's raw
surface, nothing else. The hook's consumer set on the module shrinks 5→4;
the exports die later, per CanvasClient consumer, in the FreeformPadletCards
phase.

### 0.2 The failure contract (preserve EXACTLY — simulation-proven)

Legacy `updateDrawingLayoutPadlet` (useCanvasData L569–585): optimistic merge
(after `markPadletLocallyModified`), then the raw update;
RESOLVED `{ error }` → SILENT rollback (no log); THROWN →
`console.error('Failed to update padlet:', err)` + rollback. Ported:

| # | Channel | Legacy | Ported |
|---|---------|--------|--------|
| 1 | Resolved DB error | `if (error)` → silent rollback | repo `err('unavailable')` → honest command passes through → `!result.ok` (code ≠ 'unknown') → the byte-kept silent rollback |
| 2 | Thrown | catch → console.error(ORIGINAL error) + rollback | defineCommand → `err('unknown', { cause })` → call site rethrows `cause` → the SAME byte-kept catch logs the ORIGINAL error + rollback |
| 3 | Success | nothing after the await | `result.ok` → falls through both guards — nothing |
| 4 | Optimistic merge / temp state / `markPadletLocallyModified` | — | byte-kept, ordering identical |
| 5 | Wire payload | `.update(updates)` VERBATIM — **NO updated_at stamp** | `canvas.updatePostFields` is UNSTAMPED (the updateMetadataUnstamped precedent, generalized); the fields object passes through by REFERENCE (pinned by test) |
| 6 | Validation channel (029 standing) | none | zod `z.custom<object>` rejects only a non-object `updates` (e.g. null) → 'validation' ≠ 'unknown' → the silent-rollback branch — the SAME visible outcome the legacy path produced for a null payload (resolved DB error → rollback); unreachable from live callers, disclosed |
| 7 | CanvasClient callers of updateDrawingLayoutPadlet | receive void | UNCHANGED — the hook function's signature, name, and return are identical; CanvasClient is MUST-NOT-CHANGE |

### 0.3 The new domain surface

- `PostsRepository.updateFieldsById(id, fields: object)` — dynamic VERBATIM
  column passthrough, no stamp (interface + SupabasePostsRepository method;
  the structural client's update-payload union gains `| object`, disclosed:
  it absorbs the union for assignability, the named shapes remain as docs).
- `canvas.updatePostFields` — HONEST command (no BestEffort sibling; the
  swallow family stays at ELEVEN), `postId` + `fields: z.custom<object>`
  (the postRowSchema rationale — the table is the shape's only validator).
- 6 bound tests: 4 domain (verbatim same-reference + no-stamp Object.keys
  pin; 'unavailable' pass-through; the THROWN → 'unknown' + cause
  channel-discrimination pin; non-object → 'validation' without a repo
  call) + 2 infra (verbatim payload + eq id + no stamp; error → 'unavailable'
  + cause). Suite **245/28 → 251/28** (posts.test.ts 71→75 `it(`,
  postsRepository.test.ts 26→28).

### 0.4 Scope

FIVE files: `lib/domain/canvas/posts.ts`, `posts.test.ts` (the fake gains the
member — the ONLY interface implementer besides the real class, verified),
`lib/infra/canvas/postsRepository.ts`, `postsRepository.test.ts`,
`components/collabboard/canvas/hooks/useCanvasData.ts` (imports + the one
region). NOT touched: `postsRaw.ts` (hash-bound BELOW its own fence —
`updatePostRowById` keeps its `updatePadletById` consumer), CanvasClient,
FreeformPadletCards, realtime, everything lines/sections/graph.

### 0.5 Disclosures

- Hook `updatePostRowById` census 3→2: the import and the `updatePadletById`
  passthrough REMAIN (that raw route is CanvasClient's, untouched); only the
  drawing-layout site leaves.
- `updatePostFields` lowercase census 2 (declaration + call — the import line
  carries the capital-F factory name; the 042 substring class).
- Hook 638→647 (+9: the discrimination guard + comment); the hook is NOT
  over-ceiling (800-line file rule; 647 < 800) — growth legal.
- `defineCommand` in posts.ts 31→32.

### 0.6 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN (incl. the `| object` union absorption against every
existing repo method and fake); `npm run check:boundaries` SILENT; vitest
**251 passed (251), 28 files** — 245 existing + 6 new, zero pins broken.
Tree restored byte-exact via `git cat-file blob` + no-op `git add`.

### 0.7 One slice, no split

PATCH-049 is NOT drafted.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object lib/domain/canvas/posts.ts                              # fdc5fd153b5a4689a29c086652fc9411f9074b09   (637 lines)
git hash-object lib/domain/canvas/posts.test.ts                         # affd371dacd6607be415304f981ec938d6fb6be8   (1,312 lines)
git hash-object lib/infra/canvas/postsRepository.ts                     # 67adfcaabe843056b2d19590750b349006bd8d18   (286 lines)
git hash-object lib/infra/canvas/postsRepository.test.ts                # 3789a906815e90fe1bb0639a5f824dc09a9f1028   (519 lines)
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts    # 3cc658c61cf7676d609b842281e59643b68da6a4   (638 lines)
```

MUST-NOT-CHANGE set (verify now AND after — all fourteen):

```bash
git hash-object lib/infra/supabase/postsRaw.ts                               # 9aa0f6eacd8d3b9b5f95614f9d831f6a10a5bcf5   (the fenced module: UNCHANGED this patch)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                 # 7acfa197623e39a8462adca29a321a9e64a12689
git hash-object components/collabboard/canvas/ui/FreeformPadletCards.tsx     # a405177da01176a260f7ce829f30f04549cf27c8
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts        # 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object lib/infra/canvas/canvasViewReads.ts                          # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/canvas/canvasViewReads.test.ts                     # d26385c24dcfdb10e8e0e6f705e1c1b5229ed40d
git hash-object lib/domain/canvas/sections.ts                                # 762c367186716749af21cfd3e9abf79cdafb74c0
git hash-object lib/infra/canvas/sectionsRepository.ts                       # 229655bd828a4b85aa85205e50c9bf6db56a8d85
git hash-object lib/domain/canvas/lines.ts                                   # 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
git hash-object lib/infra/canvas/linesRepository.ts                          # 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
git hash-object lib/domain/core/command.ts                                   # 2e034d8d89acdade824c6f62751996961a8837d9
git hash-object lib/graph/graphRepo.ts                                       # bc82bd41e4e3c64d1752e8170ebdfdbb0559c9ac
git hash-object components/graph/FreeformGraphLayer.tsx                      # b439038ef21b471af8b1dc4fecbc5d12a5cfc9c0
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "updatePostRowById" "$H"              # 3   (import + drawing-layout site + updatePadletById passthrough)
grep -c "createUpdatePostFieldsCommand" "$H"  # 0
grep -c "insertPostRow" "$H"                  # 4   (substring counting: insertPostRowReturning matches too — the 042 disclosure)
grep -c "deletePostRowById" "$H"              # 2
grep -c "supabase" "$H"                       # 8
D=lib/domain/canvas/posts.ts
grep -c "updateFieldsById" "$D"               # 0
grep -c "defineCommand" "$D"                  # 31
I=lib/infra/canvas/postsRepository.ts
grep -c "updateFieldsById" "$I"               # 0
grep -c "  it(" lib/domain/canvas/posts.test.ts            # 71
grep -c "  it(" lib/infra/canvas/postsRepository.test.ts   # 26
```

Collision gate (repo-wide, MUST be 0 pre-edit):

```bash
grep -rn "createUpdatePostFieldsCommand\|updateFieldsById\|updatePostFieldsSchema" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
```

---

## 2. BOUND FILE — `lib/domain/canvas/posts.ts` (whole file, exact, 665 lines; post-edit hash `5af51ef0cec14c014072529eda673e81a87c4b8b`)

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
  /**
   * The drawing-layout dynamic update (PATCH-048): arbitrary padlet columns
   * pass through VERBATIM with NO stamp added - the legacy statement sent
   * exactly the caller's fields (old useCanvasData L577); the
   * updateMetadataUnstamped no-stamp precedent, generalized.
   */
  updateFieldsById(id: PostId, fields: object): Promise<Result<void, DomainError>>;
  updatePosition(id: PostId, fields: PostPositionWriteFields): Promise<Result<void, DomainError>>;
  /** Legacy clipart title clear sends title ONLY - no updated_at (old L7581-7584). */
  updateTitle(id: PostId, fields: { readonly title: string }): Promise<Result<void, DomainError>>;
  /** The hooks content write sends content + updated_at (useCanvasData old L494-500). */
  updateContent(
    id: PostId,
    fields: { readonly content: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
  /**
   * The hooks title write sends title + updated_at (useCanvasData old
   * L512-518) - the STAMPED sibling of updateTitle, mirroring the
   * updateMetadata / updateMetadataUnstamped pair. updateTitle itself is
   * byte-untouched (extension, not modification).
   */
  updateTitleStamped(
    id: PostId,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>>;
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

export const updatePostContentBestEffortSchema = z.object({
  postId: z.string(),
  /** The full replacement content string, passed through verbatim (legacy shape). */
  content: z.string(),
});

/**
 * The hooks content write (PATCH-039): content + a fresh stamp. Its one
 * consumer (useCanvasData.updatePadletContent) awaited the legacy statement
 * bare inside its try - the local setPadlets content mirror ran even when
 * the write failed resolved; only a THROWN network error skipped it.
 */
export const createUpdatePostContentBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostContentBestEffort',
    input: updatePostContentBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-039; queued P3-family fix, do NOT
      // repair here): the legacy hook awaited this write bare - a resolved
      // DB error was silently swallowed and the local content mirror still
      // ran; only a THROWN network error reached the handler's catch.
      // Faithful port: ignore the resolved Result; a thrown exception
      // escapes execute and surfaces via defineCommand's catch.
      await repository.updateContent(asPostId(input.postId), {
        content: input.content,
        updatedAt: new Date().toISOString(),
      });
      return ok(undefined);
    },
  });

export const updatePostTitleSchema = z.object({
  postId: z.string(),
  /** The full replacement title, passed through verbatim (legacy shape). */
  title: z.string(),
});

/**
 * The HONEST stamped title write (PATCH-039) - distinct from
 * updatePostTitleBestEffort on BOTH axes: this one stamps updated_at and
 * surfaces failures. Its one consumer (useCanvasData.updatePadletTitle)
 * threw on the resolved error into the same catch a thrown network error
 * reached - both channels already converged, so the Result port is exact
 * and needs NO behavior authorization.
 */
export const createUpdatePostTitleCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostTitle',
    input: updatePostTitleSchema,
    execute: async (input) =>
      repository.updateTitleStamped(asPostId(input.postId), {
        title: input.title,
        updatedAt: new Date().toISOString(),
      }),
  });

export const createPostBestEffortSchema = z.object({
  row: postRowSchema,
});

/**
 * The library-item insert (PATCH-040): a single passthrough insert whose
 * one consumer (useCanvasData.addPadletFromLibraryItem) awaited the legacy
 * statement bare with NO error read - the best-effort sibling of
 * canvas.createPost. The command adds NO timestamps and NO fields (the
 * PATCH-029 insert fact).
 */
export const createCreatePostBestEffortCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.createPostBestEffort',
    input: createPostBestEffortSchema,
    execute: async (input) => {
      // PRESERVED LEGACY DEFECT (PATCH-040; queued P3-family fix, do NOT
      // repair here): the legacy hook awaited this insert bare - a
      // resolved DB error was silently swallowed and the trailing
      // fetchData() still ran; only a THROWN network error rejected the
      // handler. Faithful port: ignore the resolved Result; a thrown
      // exception escapes execute and surfaces via defineCommand's catch.
      await repository.insert(input.row);
      return ok(undefined);
    },
  });

export const updatePostFieldsSchema = z.object({
  postId: z.string(),
  /** Arbitrary padlet columns, passed through VERBATIM (the postRowSchema rationale). */
  fields: z.custom<object>((value) => typeof value === 'object' && value !== null),
});

/**
 * PATCH-048: the drawing-layout dynamic update - the hook's LAST internal
 * raw contract, off postsRaw. HONEST (no BestEffort sibling): the call site
 * discriminates channels via error.code (the PATCH-045 idiom) - a RESOLVED
 * 'unavailable' takes the silent rollback branch, a THROWN 'unknown'
 * rethrows its cause into the byte-kept console.error catch. NO updated_at
 * stamp - the legacy statement sent none.
 */
export const createUpdatePostFieldsCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'canvas.updatePostFields',
    input: updatePostFieldsSchema,
    execute: async (input) => repository.updateFieldsById(asPostId(input.postId), input.fields),
  });
```

## 3. BOUND FILE — `lib/domain/canvas/posts.test.ts` (whole file, exact, 1,391 lines, 75 tests; post-edit hash `c4fcd7311644371023f29bb8689d2286e2e73fa1`)

```ts
import { describe, expect, it } from 'vitest';
import {
  createUpdatePostFieldsCommand,
  createAttachPostToSchedulerContainerCommand,
  createCreateContainerWithPostCommand,
  createCreatePostBestEffortCommand,
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
  createUpdatePostContentBestEffortCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostMetadataCommand,
  createUpdatePostMetadataUnstampedBestEffortCommand,
  createUpdatePostMetadataUnstampedCommand,
  createUpdatePostPositionCommand,
  createUpdatePostPositionWithMetadataBestEffortCommand,
  createUpdatePostTitleBestEffortCommand,
  createUpdatePostTitleCommand,
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
  const updateContentCalls: Array<{
    id: PostId;
    fields: { readonly content: string; readonly updatedAt: string };
  }> = [];
  const updateTitleStampedCalls: Array<{
    id: PostId;
    fields: { readonly title: string; readonly updatedAt: string };
  }> = [];
  const updateFieldsCalls: Array<{ id: PostId; fields: object }> = [];
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
  let updateContentResult: Result<void, DomainError> = ok(undefined);
  let updateTitleStampedResult: Result<void, DomainError> = ok(undefined);
  let updateFieldsResult: Result<void, DomainError> = ok(undefined);
  let updateFieldsThrows: Error | null = null;
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
    updateContent: async (id, fields) => {
      updateContentCalls.push({ id, fields });
      return updateContentResult;
    },
    updateTitleStamped: async (id, fields) => {
      updateTitleStampedCalls.push({ id, fields });
      return updateTitleStampedResult;
    },
    updateFieldsById: async (id, fields) => {
      if (updateFieldsThrows) throw updateFieldsThrows;
      updateFieldsCalls.push({ id, fields });
      return updateFieldsResult;
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
    updateContentCalls,
    updateTitleStampedCalls,
    updateFieldsCalls,
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
    setUpdateContentResult(result: Result<void, DomainError>) {
      updateContentResult = result;
    },
    setUpdateTitleStampedResult(result: Result<void, DomainError>) {
      updateTitleStampedResult = result;
    },
    setUpdateFieldsResult(result: Result<void, DomainError>) {
      updateFieldsResult = result;
    },
    setUpdateFieldsThrows(error: Error) {
      updateFieldsThrows = error;
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

describe('canvas.updatePostContentBestEffort', () => {
  it('writes the content with a fresh ISO timestamp and returns ok', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostContentBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', content: '<p>hello</p>' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateContentCalls).toHaveLength(1);
    expect(fake.updateContentCalls[0].id).toBe('post-1');
    expect(fake.updateContentCalls[0].fields.content).toBe('<p>hello</p>');
    expect(Object.keys(fake.updateContentCalls[0].fields)).toEqual(['content', 'updatedAt']);
    expect(new Date(fake.updateContentCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updateContentCalls[0].fields.updatedAt,
    );
    expect(fake.updateTasksCalls).toHaveLength(0);
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.setUpdateContentResult(err(domainError('unavailable', 'db down')));
    const bestEffort = createUpdatePostContentBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1', content: '' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateContentCalls).toHaveLength(1);
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const bestEffort = createUpdatePostContentBestEffortCommand(fake.repository);

    const result = await bestEffort({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateContentCalls).toHaveLength(0);
  });
});

describe('canvas.updatePostTitle', () => {
  it('writes the title with a fresh ISO timestamp through the STAMPED method only', async () => {
    const fake = createFakeRepository();
    const updatePostTitle = createUpdatePostTitleCommand(fake.repository);

    const result = await updatePostTitle({ postId: 'post-1', title: 'Renamed' }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateTitleStampedCalls).toHaveLength(1);
    expect(fake.updateTitleStampedCalls[0].id).toBe('post-1');
    expect(fake.updateTitleStampedCalls[0].fields.title).toBe('Renamed');
    expect(Object.keys(fake.updateTitleStampedCalls[0].fields)).toEqual(['title', 'updatedAt']);
    expect(new Date(fake.updateTitleStampedCalls[0].fields.updatedAt).toISOString()).toBe(
      fake.updateTitleStampedCalls[0].fields.updatedAt,
    );
    expect(fake.updateTitleCalls).toHaveLength(0);
  });

  it('propagates a repository failure unchanged', async () => {
    const fake = createFakeRepository();
    fake.setUpdateTitleStampedResult(err(domainError('unavailable', 'db down')));
    const updatePostTitle = createUpdatePostTitleCommand(fake.repository);

    const result = await updatePostTitle({ postId: 'post-1', title: 'Renamed' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('rejects invalid input without calling the repository', async () => {
    const fake = createFakeRepository();
    const updatePostTitle = createUpdatePostTitleCommand(fake.repository);

    const result = await updatePostTitle({ postId: 'post-1' }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateTitleStampedCalls).toHaveLength(0);
  });
});

describe('canvas.createPostBestEffort', () => {
  it('passes the row through verbatim - no added fields, no timestamps - and returns ok', async () => {
    const fake = createFakeRepository();
    const createPostBestEffort = createCreatePostBestEffortCommand(fake.repository);
    const row = { id: 'post-1', board_id: 'board-1', title: 'Hello', metadata: { a: 1 } };

    const result = await createPostBestEffort({ row }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toEqual([row]);
    expect(fake.insertCalls[0]).toBe(row);
    expect(fake.insertReturningCalls).toHaveLength(0);
  });

  it('preserves the legacy swallow: a resolved repository failure still returns ok', async () => {
    const fake = createFakeRepository();
    fake.queueInsertResults(err(domainError('unavailable', 'db down')));
    const createPostBestEffort = createCreatePostBestEffortCommand(fake.repository);

    const result = await createPostBestEffort({ row: { id: 'post-1' } }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.insertCalls).toHaveLength(1);
  });

  it('rejects a non-object row without calling the repository', async () => {
    const fake = createFakeRepository();
    const createPostBestEffort = createCreatePostBestEffortCommand(fake.repository);

    const result = await createPostBestEffort({ row: 42 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.insertCalls).toHaveLength(0);
  });
});

describe('canvas.updatePostFields', () => {
  it('passes the fields object through verbatim (same reference) with no stamp added', async () => {
    const fake = createFakeRepository();
    const updatePostFields = createUpdatePostFieldsCommand(fake.repository);
    const fields = { position_x: 40, position_y: 80, width: 320 };

    const result = await updatePostFields({ postId: 'post-7', fields }, ctx);

    expect(result.ok).toBe(true);
    expect(fake.updateFieldsCalls).toHaveLength(1);
    expect(fake.updateFieldsCalls[0].id).toBe('post-7');
    expect(fake.updateFieldsCalls[0].fields).toBe(fields);
    expect(Object.keys(fake.updateFieldsCalls[0].fields)).toEqual([
      'position_x',
      'position_y',
      'width',
    ]);
  });

  it('propagates a RESOLVED repository failure unchanged (code unavailable)', async () => {
    const fake = createFakeRepository();
    fake.setUpdateFieldsResult(err(domainError('unavailable', 'db down')));
    const updatePostFields = createUpdatePostFieldsCommand(fake.repository);

    const result = await updatePostFields({ postId: 'post-7', fields: { width: 100 } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('surfaces a THROWN repository error as code unknown carrying the original cause', async () => {
    // The channel-discrimination pin (the PATCH-045 idiom): the call site
    // tells the legacy resolved-vs-thrown channels apart via error.code.
    const fake = createFakeRepository();
    const networkError = new Error('fetch failed');
    fake.setUpdateFieldsThrows(networkError);
    const updatePostFields = createUpdatePostFieldsCommand(fake.repository);

    const result = await updatePostFields({ postId: 'post-7', fields: { width: 100 } }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.cause).toBe(networkError);
    }
  });

  it('rejects a non-object fields payload without calling the repository', async () => {
    const fake = createFakeRepository();
    const updatePostFields = createUpdatePostFieldsCommand(fake.repository);

    const result = await updatePostFields({ postId: 'post-7', fields: null }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(fake.updateFieldsCalls).toHaveLength(0);
  });
});
```

## 4. BOUND FILE — `lib/infra/canvas/postsRepository.ts` (whole file, exact, 299 lines; post-edit hash `3a74731730ef047f023465dd65d86700fe878e74`)

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
        | { title: string }
        | { content: string; updated_at: string }
        | { title: string; updated_at: string }
        // The drawing-layout dynamic passthrough (PATCH-048) absorbs the
        // union for assignability; the named shapes above remain as docs.
        | object,
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

  async updateFieldsById(id: PostId, fields: object): Promise<Result<void, DomainError>> {
    const { error } = await this.client.from('padlets').update(fields).eq('id', id);

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

  async updateContent(
    id: PostId,
    fields: { readonly content: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        content: fields.content,
        updated_at: fields.updatedAt,
      })
      .eq('id', id);

    if (error) {
      return err(domainError('unavailable', 'Could not update the post content', { cause: error }));
    }

    return ok(undefined);
  }

  async updateTitleStamped(
    id: PostId,
    fields: { readonly title: string; readonly updatedAt: string },
  ): Promise<Result<void, DomainError>> {
    const { error } = await this.client
      .from('padlets')
      .update({
        title: fields.title,
        updated_at: fields.updatedAt,
      })
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

## 5. BOUND FILE — `lib/infra/canvas/postsRepository.test.ts` (whole file, exact, 551 lines, 28 tests; post-edit hash `5610072a9f894a0f10a7822a740a920a8b9534a3`)

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

describe('SupabasePostsRepository.updateContent', () => {
  it('sends the exact content + updated_at payload filtered by the post id', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateContent(asPostId('post-1'), {
      content: '<p>hello</p>',
      updatedAt: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([
      { content: '<p>hello</p>', updated_at: '2026-07-11T12:00:00.000Z' },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['content', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateContent(asPostId('post-1'), {
      content: '',
      updatedAt: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('SupabasePostsRepository.updateTitleStamped', () => {
  it('sends the exact title + updated_at payload filtered by the post id', async () => {
    const { client, fromTables, updateCalls, eqCalls } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitleStamped(asPostId('post-1'), {
      title: 'Renamed',
      updatedAt: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([
      { title: 'Renamed', updated_at: '2026-07-11T12:00:00.000Z' },
    ]);
    expect(Object.keys(updateCalls[0])).toEqual(['title', 'updated_at']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-1' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateTitleStamped(asPostId('post-1'), {
      title: 'Renamed',
      updatedAt: '2026-07-11T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});

describe('updateFieldsById', () => {
  it('sends the fields object verbatim filtered by id, with no stamp added', async () => {
    const { client, updateCalls, eqCalls, fromTables } = createFakeClient();
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateFieldsById(asPostId('post-7'), {
      position_x: 40,
      position_y: 80,
    });

    expect(result.ok).toBe(true);
    expect(fromTables).toEqual(['padlets']);
    expect(updateCalls).toEqual([{ position_x: 40, position_y: 80 }]);
    expect(Object.keys(updateCalls[0])).toEqual(['position_x', 'position_y']);
    expect(eqCalls).toEqual([{ column: 'id', value: 'post-7' }]);
  });

  it('maps a supabase error to an unavailable DomainError carrying the cause', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const { client } = createFakeClient(supabaseError);
    const repository = new SupabasePostsRepository(client);

    const result = await repository.updateFieldsById(asPostId('post-7'), { width: 100 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(supabaseError);
    }
  });
});
```

## 6. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 647 lines; post-edit hash `810ea3a0b351c10efec4f6800abb0cf39c24c439`)

```ts
"use client";

/**
 * useCanvasData — owns canvas entity data state + all supabase CRUD for
 * canvas, padlets, lines, and sections (PR5 scope).
 *
 * Auth supabase calls (workspace_members, supabase.auth) intentionally
 * remain in CanvasClient — they are session-scoped, not canvas-data-scoped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from '@/lib/domain/canvas/lines';
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostFieldsCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import {
  deletePostRowById,
  insertPostRow,
  insertPostRowReturning,
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from '@/lib/infra/canvas/canvasViewReads';
import type { Canvas, Padlet, CanvasLine, BoardSection } from '@/types/collabboard';
import { generateAndSaveThumbnail, updateLastVisited } from '@/lib/collabboard/thumbnailGenerator';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { toast } from 'sonner';
import type { CanvasAction } from '../store/actions';

interface UseCanvasDataParams {
  canvasId?: string;
  dispatch: React.Dispatch<CanvasAction>;
}

export function useCanvasData({ canvasId, dispatch }: UseCanvasDataParams) {
  // Cookie-authenticated client — must match the session the dashboard/rest of
  // the app uses, or RLS-gated queries silently return zero rows (see
  // lib/supabase/browser.ts vs lib/supabase.ts).
  const supabase = supabaseBrowser();
  // ── Data state ──────────────────────────────────────────────────────────────
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [padlets, setPadlets] = useState<Padlet[]>([]);
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [sections, setSections] = useState<BoardSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  // Track IDs of padlets we've just modified locally, to skip redundant refetch from realtime
  const locallyModifiedPadletsRef = useRef<Set<string>>(new Set());
  // Track IDs of lines we've just modified locally
  const locallyModifiedLinesRef = useRef<Set<string>>(new Set());
  // Track padlets for thumbnail generation on cleanup
  const padletsRef = useRef<Padlet[]>([]);

  // Keep padletsRef in sync with padlets state
  useEffect(() => {
    padletsRef.current = padlets;
  }, [padlets]);

  // ── fetchData ───────────────────────────────────────────────────────────────
  // === BEGIN DATA REGION: SUPABASE + REALTIME ===
  const fetchData = useCallback(async (showLoading = false) => {
    if (!canvasId) {
      setError("Missing canvas ID");
      if (showLoading) setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const canvasResult = await findBoardById(canvasId);

      const padletsResult = await findPostsByBoardId(canvasId);

      // Fetch lines (may not exist yet - graceful fallback)
      const linesResult = await findLinesByBoardId(canvasId);

      // Fetch sections for columns layout
      const sectionsResult = await findSectionsByBoardId(canvasId);

      if (!canvasResult.ok) {
        console.error('Error fetching canvas:', canvasResult.error.cause ?? canvasResult.error);
        throw canvasResult.error.cause ?? canvasResult.error;
      }
      if (!padletsResult.ok) {
        console.error('Error fetching padlets:', padletsResult.error.cause ?? padletsResult.error);
        throw padletsResult.error.cause ?? padletsResult.error;
      }
      // Don't throw on a failed lines read - table may not exist yet
      const canvasData = canvasResult.value as unknown as Canvas | null;
      const padletData = padletsResult.value as unknown as Padlet[];
      const lineData = linesResult.ok ? (linesResult.value as unknown as CanvasLine[]) : null;
      const sectionData = sectionsResult.ok ? (sectionsResult.value as unknown as BoardSection[]) : null;

      setCanvas(canvasData);

      let nextSections = sectionData || [];
      let nextPadlets = padletData || [];

      const shouldRecoverMissingSections =
        (canvasData?.layout === 'grid' || canvasData?.layout === 'columns') &&
        nextPadlets.length > 0;

      if (shouldRecoverMissingSections) {
        const existingSectionIds = new Set(nextSections.map((section) => String(section.id)));
        const missingSectionIds = Array.from(
          new Set(
            nextPadlets
              .map((padlet) => (padlet.metadata as any)?.sectionId)
              .filter((sectionId): sectionId is string => !!sectionId && !existingSectionIds.has(String(sectionId)))
          )
        );

        if (missingSectionIds.length > 0) {
          const maxPosition = nextSections.reduce(
            (max, section) => Math.max(max, Number(section.position) || 0),
            -1
          );

          try {
            const recoveryPayload = missingSectionIds.map((_, index) => ({
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
            }));

            const createSections = createCreateSectionsCommand(createSectionsRepository());
            const insertResult = await createSections(
              { boardId: canvasId, sections: recoveryPayload },
              { userId: null },
            );
            if (!insertResult.ok) throw insertResult.error.cause ?? insertResult.error;
            const recoveredSections = insertResult.value as unknown as BoardSection[] | null;

            const remap = new Map<string, string>();
            (recoveredSections || []).forEach((section, index) => {
              const oldId = missingSectionIds[index];
              if (oldId) remap.set(oldId, String(section.id));
            });

            const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
            await Promise.all(
              nextPadlets
                .filter((padlet) => remap.has(String((padlet.metadata as any)?.sectionId)))
                .map(async (padlet) => {
                  const oldSectionId = String((padlet.metadata as any)?.sectionId);
                  const nextSectionId = remap.get(oldSectionId);
                  if (!nextSectionId) return;
                  const result = await updatePostMetadataBestEffort(
                    {
                      postId: padlet.id,
                      metadata: {
                        ...(padlet.metadata as any),
                        sectionId: nextSectionId,
                      },
                    },
                    { userId: null },
                  );
                  if (!result.ok) throw result.error.cause ?? result.error;
                })
            );

            nextSections = [...nextSections, ...((recoveredSections as BoardSection[]) || [])];
            nextPadlets = nextPadlets.map((padlet) => {
              const oldSectionId = String((padlet.metadata as any)?.sectionId || '');
              const nextSectionId = remap.get(oldSectionId);
              if (!nextSectionId) return padlet;
              return {
                ...padlet,
                metadata: {
                  ...(padlet.metadata as any),
                  sectionId: nextSectionId,
                },
              };
            });

            toast.warning('Recovered missing row/grid sections for this canvas.');
          } catch (recoveryError) {
            console.error('Failed to recover missing sections:', recoveryError);

            const syntheticSections = missingSectionIds.map((oldId, index) => ({
              id: Number(oldId) || -(index + 1),
              board_id: canvasId,
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })) as unknown as BoardSection[];

            nextSections = [...nextSections, ...syntheticSections];
          }
        }
      }

      setSections(nextSections);
      if (nextPadlets.length > 0) {
        // Filter out empty note/text padlets
        const validPadlets = nextPadlets.filter(p => {
          if (p.type === 'note' || p.type === 'text') {
            // Robust check: strip HTML tags, HTML entities like &nbsp;, and whitespace
            const strippedContent = p.content
              ? p.content
                .replace(/<[^>]*>/g, '') // Remove tags
                .replace(/&nbsp;/g, ' ') // Replace non-breaking space with space
                .replace(/&#160;/g, ' ') // Replace code for nbsp
                .trim()
              : '';
            const hasContent = strippedContent.length > 0;
            return hasContent;
          }
          return true;
        });
        setPadlets(validPadlets);
      } else {
        setPadlets([]);
      }
      // Normalize: rows written before the layer_plane column existed arrive as null.
      // Treat them as 'front' at runtime; the DB default handles new inserts.
      setLines((lineData || []).map(l => ({
        ...l,
        layer_plane: l.layer_plane ?? 'front',
      })));
    } catch (e) {
      console.error('fetchData failed:', e);
      setError('Failed to load canvas.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [canvasId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  const handleRealtimePadletChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const padletId = newRecord?.id || oldRecord?.id;
    debugCanvasLogger('realtimeUpdate', { eventType, padletId });

    // Skip if this was a local modification (we already have the update)
    if (padletId && locallyModifiedPadletsRef.current.has(padletId)) {
      locallyModifiedPadletsRef.current.delete(padletId);
      return;
    }

    if (eventType === 'INSERT' && newRecord) {
      setPadlets(prev => {
        if (prev.some(p => p.id === newRecord.id)) return prev;
        return [...prev, newRecord as Padlet];
      });
    } else if (eventType === 'UPDATE' && newRecord) {
      setPadlets(prev => prev.map(p =>
        p.id === newRecord.id ? { ...p, ...newRecord } : p
      ));
    } else if (eventType === 'DELETE' && oldRecord) {
      setPadlets(prev => prev.filter(p => p.id !== oldRecord.id));
    }
  }, []);

  useEffect(() => {
    if (!canvasId) return;
    fetchData(true);

    // Update last visited timestamp
    updateLastVisited(canvasId);

    const channel = supabase.channel(`canvas-${canvasId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'padlets',
          filter: `board_id=eq.${canvasId}`
        },
        handleRealtimePadletChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);

      // Generate and save thumbnail when leaving the canvas
      // Using the ref to get current padlets without causing re-runs
      const currentPadlets = padletsRef.current;
      if (canvasId && currentPadlets.length > 0) {
        generateAndSaveThumbnail(canvasId, currentPadlets.map(p => ({
          id: p.id,
          position_x: p.position_x || 0,
          position_y: p.position_y || 0,
          width: p.width || 200,
          height: p.height || 150,
          type: p.type,
          title: p.title,
          content: p.content,
          metadata: p.metadata as any
        })));
      }
    };
  }, [canvasId, handleRealtimePadletChange, fetchData]);

  /* -------------------------------------------------------------------------- */
  /*                                Optimized Update                               */
  /* -------------------------------------------------------------------------- */

  // Helper to mark a padlet as locally modified (skips redundant realtime refetch)
  const markPadletLocallyModified = useCallback((padletId: string) => {
    locallyModifiedPadletsRef.current.add(padletId);
    // Auto-clear after a short window (in case realtime event never arrives)
    setTimeout(() => {
      locallyModifiedPadletsRef.current.delete(padletId);
    }, 3000);
  }, []);

  // Helper to mark a line as locally modified
  const markLineLocallyModified = useCallback((lineId: string) => {
    locallyModifiedLinesRef.current.add(lineId);
    setTimeout(() => {
      locallyModifiedLinesRef.current.delete(lineId);
    }, 3000);
  }, []);
  // === END DATA REGION: SUPABASE + REALTIME ===

  // ── Line CRUD ───────────────────────────────────────────────────────────────

  // Fast local-only update (no DB call) - used during dragging
  const updateLineLocal = useCallback((lineId: string, updates: Partial<CanvasLine>) => {
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates }
        : l
    ));
  }, []);

  // Save line to database - called when drag ends
  const saveLineToDb = useCallback(async (lineId: string) => {
    if (lineId.startsWith('temp-')) return;

    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    debugCanvasLogger('saveStart', { op: 'saveLineToDb', lineId });
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd(
      {
        lineId,
        updates: {
          start_x: line.start_x,
          start_y: line.start_y,
          control_x: line.control_x,
          control_y: line.control_y,
          end_x: line.end_x,
          end_y: line.end_y,
          points: line.points, // PERSIST POINTS
          start_post_id: line.start_post_id,
          end_post_id: line.end_post_id,
          // Styling and Label
          color: line.color,
          stroke_width: line.stroke_width,
          dashed: line.dashed,
          start_arrow: line.start_arrow,
          end_arrow: line.end_arrow,
          label: line.label,
          label_position: line.label_position,
          z_index: line.z_index,
          layer_plane: line.layer_plane ?? 'front',
          label_text_color: line.label_text_color,
          label_background_color: line.label_background_color,
        },
      },
      { userId: null },
    );
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'saveLineToDb', lineId }); }
  }, [lines]);

  // Update line with DB save (for toolbar changes)
  const updateLine = useCallback(async (lineId: string, updates: Partial<CanvasLine>) => {
    // Optimistic update
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates, updated_at: new Date().toISOString() }
        : l
    ));

    // Skip DB update for temp lines
    if (lineId.startsWith('temp-')) return;

    debugCanvasLogger('saveStart', { op: 'updateLine', lineId });
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd({ lineId, updates }, { userId: null });
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
  }, []);

  const deleteLine = useCallback(async (lineId: string) => {
    // Optimistic update
    setLines(prev => prev.filter(l => l.id !== lineId));
    dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: null } });

    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - the optimistic removal stands either way.
    const deleteLineCmd = createDeleteLineCommand(createLinesRepository());
    await deleteLineCmd({ lineId }, { userId: null });
  }, [dispatch]);

  const handleChangeLineLayer = useCallback((lineId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
    const targetLine = lines.find(l => l.id === lineId);
    if (!targetLine) return;

    const currentPlane = targetLine.layer_plane ?? 'front';
    const currentZ = targetLine.z_index ?? 0;

    if (action === 'front') {
      // Move to front plane: place above all current front-plane lines
      const frontZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'front')
        .map(l => l.z_index ?? 0);
      const maxFrontZ = frontZIndexes.length > 0 ? Math.max(...frontZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'front', z_index: maxFrontZ + 1 });

    } else if (action === 'back') {
      // Move to back plane: place below all current back-plane lines
      const backZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'back')
        .map(l => l.z_index ?? 0);
      const minBackZ = backZIndexes.length > 0 ? Math.min(...backZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'back', z_index: minBackZ - 1 });

    } else if (action === 'forward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ + 1 });

    } else if (action === 'backward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ - 1 });
    }
  }, [lines, updateLine]);

  // Duplicate a line (for context menu)
  const duplicateLine = useCallback(async (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line || !canvasId) return;

    try {
      const newLineId = crypto.randomUUID();
      const offset = 20; // Offset for duplicated line

      const newLine: CanvasLine = {
        ...line,
        id: newLineId,
        start_x: line.start_x + offset,
        start_y: line.start_y + offset,
        end_x: line.end_x + offset,
        end_y: line.end_y + offset,
        control_x: line.control_x + offset,
        control_y: line.control_y + offset,
        points: line.points?.map(p => ({ ...p, x: p.x + offset, y: p.y + offset })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistic update
      setLines(prev => [...prev, newLine]);
      dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: newLineId } });

      // Save to database. Channel split PRESERVED (no convergence
      // authorization): a RESOLVED insert error rolls back the optimistic
      // line (the legacy if (error) branch); a THROWN one carries code
      // 'unknown' out of defineCommand's catch and stays silent with the
      // optimistic line kept - exactly the legacy empty catch.
      const createLineCmd = createCreateLineCommand(createLinesRepository());
      const result = await createLineCmd({ row: newLine }, { userId: null });

      if (!result.ok && result.error.code !== 'unknown') {
        // Rollback on error
        setLines(prev => prev.filter(l => l.id !== newLineId));
      }
    } catch (e) {
    }
  }, [lines, canvasId, dispatch]);

  // ── Padlet content/title mutations ──────────────────────────────────────────

  const updatePadletContent = async (padletId: string, content: string) => {
    try {
      const updatePostContentBestEffort = createUpdatePostContentBestEffortCommand(createPostsRepository());
      const result = await updatePostContentBestEffort({ postId: padletId, content }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      setPadlets((prev) =>
        prev.map((p) => (p.id === padletId ? { ...p, content } : p))
      );
    } catch (err) {
      console.error('Failed to update padlet content:', err);
    }
  };

  const updatePadletTitle = async (padletId: string, title: string) => {
    markPadletLocallyModified(padletId);
    try {
      const updatePostTitle = createUpdatePostTitleCommand(createPostsRepository());
      const result = await updatePostTitle({ postId: padletId, title }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;

      // Optimistic local update
      setPadlets(prev => prev.map(p =>
        p.id === padletId ? { ...p, title } : p
      ));
    } catch (e) {
      console.error('Failed to update padlet title:', e);
    }
  };

  const addPadletFromLibraryItem = useCallback(async (payload: any) => {
    const createPostBestEffort = createCreatePostBestEffortCommand(createPostsRepository());
    const result = await createPostBestEffort({ row: payload }, { userId: null });
    if (!result.ok) throw result.error.cause ?? result.error;
    fetchData();
  }, [fetchData]);

  const addFreeformCardPadlet = useCallback(async (newPadlet: Padlet) => {
    // AUTHORIZED CONVERGENCE (PATCH-041, the program's fourth behavior
    // micro-change): a THROWN insert failure previously escaped to the drop
    // handler's catch and left the optimistic card stranded (ghost work,
    // P3); both failure channels now take the SAME rollback branch below.
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row: newPadlet }, { userId: null });
    if (!result.ok) {
      setPadlets((prev) => prev.filter((p) => p.id !== newPadlet.id));
    }
  }, []);

  const addDrawingLayoutPadlet = useCallback(async (newPadlet: any, newId: string) => {
    try {
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newPadlet }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      return newPadlet;
    } catch (err) {
      console.error('Failed to create drawing padlet:', err);
      setPadlets(prev => prev.filter(p => p.id !== newId));
      return null;
    }
  }, []);

  const updateDrawingLayoutPadlet = useCallback(async (id: string, updates: any) => {
    const previousPadlet = padletsRef.current.find((p) => p.id === id);
    if (!previousPadlet) return;

    markPadletLocallyModified(id);
    setPadlets((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

    try {
      // Channel split PRESERVED (the PATCH-045 idiom): a THROWN failure
      // carries code 'unknown' out of defineCommand's catch and re-throws
      // its original cause into the catch below (the legacy console.error +
      // rollback); a RESOLVED error takes the silent rollback branch.
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields: updates }, { userId: null });
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }
      if (!result.ok) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);

  const insertPadlet = useCallback(async (payload: any) => {
    return await insertPostRow(payload);
  }, []);

  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await insertPostRowReturning(payload);
  }, []);

  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await updatePostRowById(id, updates);
  }, []);

  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await deletePostRowById(id);
  }, []);

  // ── Return ──────────────────────────────────────────────────────────────────
  return {
    // Data state (exposed for CanvasClient read + optimistic updates)
    canvas,
    padlets,
    setPadlets,
    lines,
    setLines,
    sections,
    setSections,
    loading,
    error,
    // Core data operations
    fetchData,
    markPadletLocallyModified,
    markLineLocallyModified,
    // Line CRUD
    updateLineLocal,
    saveLineToDb,
    updateLine,
    deleteLine,
    duplicateLine,
    handleChangeLineLayer,
    // Padlet mutations
    updatePadletContent,
    updatePadletTitle,
    addPadletFromLibraryItem,
    addFreeformCardPadlet,
    addDrawingLayoutPadlet,
    updateDrawingLayoutPadlet,
    insertPadlet,
    insertPadletAndSelectSingle,
    updatePadletById,
    deletePadletByIdRaw,
  };
}
```

---

## 7. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p048_extract.py` (repo root) and run
`python3 _p048_extract.py`; then DELETE the script file. Do not hand-edit any
scoped file; if the extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-048.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-048.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/domain/canvas/posts.ts", "5af51ef0cec14c014072529eda673e81a87c4b8b"),
    ("lib/domain/canvas/posts.test.ts", "c4fcd7311644371023f29bb8689d2286e2e73fa1"),
    ("lib/infra/canvas/postsRepository.ts", "3a74731730ef047f023465dd65d86700fe878e74"),
    ("lib/infra/canvas/postsRepository.test.ts", "5610072a9f894a0f10a7822a740a920a8b9534a3"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "810ea3a0b351c10efec4f6800abb0cf39c24c439"),
]
for i, (path, want) in enumerate(targets):
    content = fences[i]
    got = blob(content.encode("utf-8"))
    assert got == want, f"fence {i} hashes to {got}, expected {want} - STOP, report"
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    check = subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()
    assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
    print(path, check, "OK")
print("ALL FIVE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§9), commit (bound message), STOP

Do not start PATCH-049.

---

## 8. Explanatory recipes — the hook's two regions (REFERENCE ONLY; Phase B already wrote the exact bytes)

### 8a — the posts import block gains the command factory

OLD:

```ts
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
```

NEW:

```ts
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostFieldsCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
```

### 8b — the drawing-layout site (optimistic merge byte-kept above; catch byte-kept below; the 045 discrimination between them)

OLD:

```ts
    try {
      const { error } = await updatePostRowById(id, updates);
      if (error) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);
```

NEW:

```ts
    try {
      // Channel split PRESERVED (the PATCH-045 idiom): a THROWN failure
      // carries code 'unknown' out of defineCommand's catch and re-throws
      // its original cause into the catch below (the legacy console.error +
      // rollback); a RESOLVED error takes the silent rollback branch.
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields: updates }, { userId: null });
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }
      if (!result.ok) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);
```

Nothing else changes in the hook — everything above `try {` in
`updateDrawingLayoutPadlet` (the previousPadlet lookup, the guard,
`markPadletLocallyModified`, the optimistic merge) is byte-kept, and the four
raw passthroughs below it are byte-kept.

---

## 9. Post-edit gates (ALL must pass before commit)

### 9.1 Hashes

```bash
git hash-object lib/domain/canvas/posts.ts                              # 5af51ef0cec14c014072529eda673e81a87c4b8b
git hash-object lib/domain/canvas/posts.test.ts                         # c4fcd7311644371023f29bb8689d2286e2e73fa1
git hash-object lib/infra/canvas/postsRepository.ts                     # 3a74731730ef047f023465dd65d86700fe878e74
git hash-object lib/infra/canvas/postsRepository.test.ts                # 5610072a9f894a0f10a7822a740a920a8b9534a3
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts    # 810ea3a0b351c10efec4f6800abb0cf39c24c439
```

Plus ALL FOURTEEN MUST-NOT-CHANGE hashes from §1, unchanged — headed by
`postsRaw.ts` at `9aa0f6ea...` (the fenced module itself is untouched).

### 9.2 Censuses (simulation-measured; plain `grep -c`)

```bash
H=components/collabboard/canvas/hooks/useCanvasData.ts
grep -c "updatePostRowById" "$H"              # 2   (import + the updatePadletById passthrough — CanvasClient's raw route, untouched)
grep -c "createUpdatePostFieldsCommand" "$H"  # 2   (import + call)
grep -c "updatePostFields" "$H"               # 2   (declaration + call; lowercase — the import line does not match)
grep -c "code === 'unknown'" "$H"             # 1
grep -c "insertPostRow" "$H"                  # 4   (unchanged — substring counting, the 042 disclosure)
grep -c "deletePostRowById" "$H"              # 2   (unchanged)
grep -c "supabase" "$H"                       # 8   (unchanged — the realtime block, CTO-only)
grep -c "markPadletLocallyModified" "$H"      # 5   (unchanged)
wc -l "$H"                                    # 647
D=lib/domain/canvas/posts.ts
grep -c "updateFieldsById" "$D"               # 2   (interface + command execute)
grep -c "createUpdatePostFieldsCommand" "$D"  # 1
grep -c "canvas.updatePostFields" "$D"        # 1
grep -c "defineCommand" "$D"                  # 32
wc -l "$D"                                    # 665
I=lib/infra/canvas/postsRepository.ts
grep -c "updateFieldsById" "$I"               # 1
grep -c "| object" "$I"                       # 1   (the disclosed union absorption)
wc -l "$I"                                    # 299
grep -c "  it(" lib/domain/canvas/posts.test.ts            # 75
grep -c "  it(" lib/infra/canvas/postsRepository.test.ts   # 28
```

### 9.3 Scope + untouched gates

```bash
git status --short   # exactly FIVE modified paths; ANY other path = STOP
git diff --stat -- lib/infra/supabase "app/dashboard/canvas/[id]/CanvasClient.tsx" components/collabboard/canvas/ui components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts lib/infra/canvas/canvasViewReads.ts lib/infra/canvas/canvasViewReads.test.ts lib/domain/canvas/sections.ts lib/domain/canvas/sections.test.ts lib/infra/canvas/sectionsRepository.ts lib/infra/canvas/sectionsRepository.test.ts lib/domain/canvas/lines.ts lib/domain/canvas/lines.test.ts lib/infra/canvas/linesRepository.ts lib/infra/canvas/linesRepository.test.ts lib/domain/core lib/graph components/graph eslint.boundaries.config.mjs   # nothing
```

### 9.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 251 passed (251), 28 files
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-049.

---

## 10. Do NOT

- Do NOT touch `postsRaw.ts` — no export leaves this patch; the module's
  hash is bound in the MUST-NOT-CHANGE set.
- Do NOT touch the four raw passthroughs (`insertPadlet`,
  `insertPadletAndSelectSingle`, `updatePadletById`, `deletePadletByIdRaw`)
  or any CanvasClient `{ data, error }` consumer — they stay raw (the
  021/042 exception, re-affirmed §0.1).
- Do NOT add a BestEffort sibling, an updated_at stamp, a toast, or any
  behavior beyond the bound port — the command is HONEST and UNSTAMPED.
- Do NOT alter the optimistic merge, `markPadletLocallyModified`, the
  rollback expressions, or the console.error text — all byte-kept.
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-049.
