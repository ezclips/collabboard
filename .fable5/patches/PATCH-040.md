# PATCH-040 — hooks phase slice 3, strangler group 15: the useCanvasData CONVERGENT INSERT PAIR (addPadletFromLibraryItem + addDrawingLayoutPadlet) — eleventh command-internal swallow site + a pure consumer swap onto the existing honest createPost

**Status:** READY FOR IMPLEMENTATION — **Amendment 1 applied (see §4.5): Phase B is now the bound mechanical extractor, not hand-extraction.**
**Model:** **GPT-5.4 acceptable** (Pattern K, fifteenth application — one narrow domain addition reusing a pinned repository method, one pure consumer swap; see §0.5)
**Pattern:** K reuse (§5.11): ONE new command (zero new repository surface — `repository.insert` exists and is pinned since 029), 3 bound tests, two call-site swaps inside ONE hook — CanvasClient untouched, infra untouched, zero JSX.
**Scope:** THREE files — `lib/domain/canvas/posts.ts`, `lib/domain/canvas/posts.test.ts`, `components/collabboard/canvas/hooks/useCanvasData.ts`.
**Authored:** 2026-07-11 (Fable 5 CTO). Census regenerated at commit `e4b7248`; the CTO simulation applied all three canonical files to the working tree and ran the REAL repo gates on the exact post-edit bytes — `npx tsc --noEmit` CLEAN, `npm run check:boundaries` SILENT, `npx vitest run` **214 passed (214), 25 files** (211 existing + the 3 bound tests, zero existing pins broken) — then restored the tree byte-exact via `git cat-file blob` (NEVER `git checkout` on byte-fenced files — LESSONS_LEARNED autocrlf rule, 2026-07-11) and confirmed `w/lf` plus all pre-edit hashes.

> Implementer: read PATCH_REFERENCE §5.11 and §6 first. The whole-file fences
> in §2–§4 are authoritative; §5's three OLD/NEW pairs are the hook's edit
> recipe. Never edit a bound test; STOP and report instead (§9).

---

## 0. CTO rulings

### 0.1 Slice selection (census regenerated 2026-07-11 at `e4b7248`)

Census unchanged from PATCH-039's bindings: useCanvasData 629 lines / 19
table sites / 25 supabase lines; useCanvasLines 1 site; useCanvasInteractions
0; CanvasClient's three hand-offs (L252 workspace / L734 lines param /
L2554 FreeformGraphRepo) re-grepped and unchanged. Standing ruling
honored: the workspace hand-off rides the future lines-family patch
(never-grow blocks it standalone — PATCH-039 §0.1).

Smallest-coherent analysis: Family 1 (fetchData quartet) still needs the
canvas_lines-aggregate ruling plus read methods on FOUR aggregates and a
hot-path hook edit — it also sets the hooks-phase READ idiom, a design
decision that deserves its own patch; Family 2 rides/follows Family 1;
Family 4 (lines) is the biggest slice; FreeformGraphRepo restructures a
5-site class. The smallest safe unit is **Family 5 CONTRACT SLICE B: the
convergent insert pair** — the two named insert sites whose failure
channels are exactly portable with NO behavior authorization:

- `addPadletFromLibraryItem` (bare-await swallow + unconditional
  trailing `fetchData()` on resolved outcomes) → NEW
  `canvas.createPostBestEffort`, the ELEVENTH command-internal swallow
  site, reusing the pinned `repository.insert` — ZERO infra changes.
- `addDrawingLayoutPadlet` (`if (error) throw` inside try — BOTH
  channels already converge on its catch, the 038/039 honest shape) →
  pure consumer swap onto the EXISTING `canvas.createPost`.

Deferred BY NAME with reasons (do NOT touch):

- **`addFreeformCardPadlet` — a flagged OWNER DECISION POINT.** Its
  channels are genuinely SPLIT: a resolved insert error rolls the
  optimistic padlet back; a thrown network error leaves an unhandled
  rejection with NO rollback. Exact preservation is impossible through
  defineCommand's catch-all (it converts thrown → resolved err, which
  would make the rollback branch cover both channels — the 034-style
  convergence REPAIR, a P3 improvement, but a behavior change requiring
  explicit authorization the owner has not given for this patch).
  Options for a future ruling: authorize the convergence (034
  precedent), or leave it for the raw-passthrough slice.
- `updateDrawingLayoutPadlet`: DYNAMIC `updates: any` column set (a
  passthrough, not a bindable seam) + its own channel split
  (console.error on thrown only, rollback on both).
- The four raw passthroughs: their CanvasClient consumers destructure
  raw `{ error }` — extraction touches the monolith's line math.

### 0.2 Per-site contracts (confirm, don't re-justify)

| Site | Legacy | Port |
|---|---|---|
| `addPadletFromLibraryItem` (old L526–529) | `await supabase.from('padlets').insert(payload);` BARE — result fully discarded; a RESOLVED DB error was silently swallowed and the trailing `fetchData()` STILL RAN; a THROWN network error rejected the handler's promise BEFORE fetchData (no catch anywhere — the rejection propagates to the caller) | `createPostBestEffort` (swallow inside, `ok(undefined)` unconditional) + `if (!result.ok) throw result.error.cause ?? result.error;` — the throw fires ONLY for thrown-mode (defineCommand's err('unknown', {cause})); resolved errors pass and `fetchData()` runs, EXACTLY as legacy; thrown-mode re-throws the ORIGINAL error and skips fetchData |
| `addDrawingLayoutPadlet` (old L538–548) | `if (error) throw error;` inside try → catch: `console.error('Failed to create drawing padlet:', err)` + rollback filter + `return null`; success returns `newPadlet` | honest EXISTING `createPost` + cause-unwrap throw — resolved errors throw the ORIGINAL supabase error (cause), thrown network errors likewise; both reach the SAME catch with the same error object; `return newPadlet`, the rollback filter, and `return null` BYTE-KEPT |

Validation-channel note (the PATCH-029 acceptance, repeated): both rows
route through `postRowSchema` (any non-null object). A NON-object
payload would now return err('validation') → re-thrown, where legacy
would have attempted the insert and hit a resolved DB error. Unreachable
at both consumers (each constructs an object literal); disclosed, not a
deviation to report.

### 0.3 Behavior preservation (the owner's eight axes)

- **Loading / retry / subscription:** none exists at either site; none
  added; the realtime channel untouched.
- **Error:** per-site contracts EXACT — §0.2; both catch blocks (and
  the library site's ABSENCE of one) byte-kept.
- **Cache:** `markPadletLocallyModified` census 5→5 — NEITHER insert
  site calls it (inserts are echoed by the realtime INSERT handler's
  dedup guard, not the suppression cache); its absence is byte-kept.
- **Ordering:** library site: insert → fetchData (fetchData runs on
  resolved outcomes incl. resolved errors, skipped on thrown). Drawing
  site: insert → `return newPadlet` on success; catch → console.error →
  rollback → `return null`. Both preserved.
- **Fallback / rollback:** the drawing site's rollback filter
  (`prev.filter(p => p.id !== newId)`) byte-kept inside its catch;
  `addFreeformCardPadlet`'s SPLIT rollback is deferred untouched
  (§0.1); no other rollback exists in scope.
- **Timestamps:** NONE — insert rows pass through verbatim, the
  command adds no fields (the 029 insert fact, restated in the new
  command's doc).

### 0.4 Reuse rulings

`canvas.createPost` (029, honest) is consumed AS-IS by the drawing site
— zero domain changes for that site beyond the import. The new
`createPostBestEffort` reuses `postRowSchema` and `repository.insert`
(pinned by the existing 029 infra tests) — the patch touches NEITHER
postsRepository.ts NOR postsRepository.test.ts; both join the
MUST-NOT-CHANGE set. Swallow-family bookkeeping: this is the ELEVENTH
command-internal swallow site (queued P3-family fix, standing decision).

### 0.5 Model + census effects

**GPT-5.4 acceptable**: the CTO compiled and ran every new line in the
working tree itself (real tsconfig, real module graph, real vitest —
tsc clean, boundaries silent, 214/214 green), then restored byte-exact.
3 new bound tests (verbatim passthrough + row identity, the swallow pin,
non-object validation rejection); zero existing tests edited; ZERO new
casts. Hook census: `.from('padlets')` 10→8, `.from(` 19→17, `supabase`
25→23 (the hook stays supabase-bearing — 17 sites across Families
1/2/4/5-remainder, deferred by name). Suite 211/25 → **214/25**.
Grandfather stays 2. useCanvasData 629→634; posts.ts 610→637;
posts.test.ts 1272→1312 (the aggregate's bound test file — standing
accepted growth).

---

## 1. Pre-edit gates (Git Bash from repo root; any mismatch = STOP)

```bash
git status --short                        # nothing
git log --oneline -1                      # e4b7248 (or a descendant touching none of the scoped/must-not-change files)
```

Byte-identity:

```bash
git hash-object lib/domain/canvas/posts.ts                                      # 1eb1cd61556382ec69af1ae482c6e4c2a6aa6393
git hash-object lib/domain/canvas/posts.test.ts                                 # aaa480f19dd5bc71e7517c96314cdf83459265b6
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts            # 1be68b2d3b45eff7df25b89c17e7e2acd0ceb1ac
```

MUST-NOT-CHANGE hashes (re-checked after the edit in §6):

```bash
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a
```

Hook census (measured 2026-07-11):

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 629
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 10
grep -c "\.from(" "$H"                    # 19
grep -c "supabase" "$H"                   # 25
grep -c "markPadletLocallyModified" "$H"  # 5
grep -c "createCreatePostBestEffortCommand\|createCreatePostCommand" "$H"   # 0
```

Collision gate (must print nothing — the new name is globally fresh):

```bash
grep -rn "createPostBestEffort" lib components app --include="*.ts" --include="*.tsx"
```

Suite baseline:

```bash
npx vitest run 2>&1 | tail -3             # 25 files, 211 tests
npx playwright test --list 2>&1 | tail -1 # Total: 27 tests in 18 files
grep -c "  it(" lib/domain/canvas/posts.test.ts            # 68
```

---

## 2. BOUND FILE — `lib/domain/canvas/posts.ts` (whole file, exact, 637 lines; post-edit hash `fdc5fd153b5a4689a29c086652fc9411f9074b09`)

Replace the file with exactly:

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
```

## 3. BOUND FILE — `lib/domain/canvas/posts.test.ts` (whole file, exact, 1312 lines, 71 tests; post-edit hash `affd371dacd6607be415304f981ec938d6fb6be8`)

Replace the file with exactly:

```ts
import { describe, expect, it } from 'vitest';
import {
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
```

## 4. BOUND FILE — `components/collabboard/canvas/hooks/useCanvasData.ts` (whole file, exact, 634 lines; post-edit hash `2cd6f9c71261804b6bf94c9eb0e536864df44e1f`)

Replace the file with exactly:

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
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
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
      const { data: canvasData, error: canvasError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', canvasId)
        .maybeSingle();

      const { data: padletData, error: padletError } = await supabase
        .from('padlets')
        .select('*')
        .eq('board_id', canvasId);

      // Fetch lines (may not exist yet - graceful fallback)
      const { data: lineData, error: lineError } = await supabase
        .from('canvas_lines')
        .select('*')
        .eq('board_id', canvasId);

      // Fetch sections for columns layout
      const { data: sectionData, error: sectionError } = await supabase
        .from('board_sections')
        .select('*')
        .eq('board_id', canvasId);

      if (canvasError) {
        console.error('Error fetching canvas:', canvasError);
        throw canvasError;
      }
      if (padletError) {
        console.error('Error fetching padlets:', padletError);
        throw padletError;
      }
      // Don't throw on lineError - table may not exist yet

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
              board_id: canvasId,
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
            }));

            const { data: recoveredSections, error: recoveryError } = await supabase
              .from('board_sections')
              .insert(recoveryPayload)
              .select('*');

            if (recoveryError) throw recoveryError;

            const remap = new Map<string, string>();
            (recoveredSections || []).forEach((section, index) => {
              const oldId = missingSectionIds[index];
              if (oldId) remap.set(oldId, String(section.id));
            });

            await Promise.all(
              nextPadlets
                .filter((padlet) => remap.has(String((padlet.metadata as any)?.sectionId)))
                .map((padlet) => {
                  const oldSectionId = String((padlet.metadata as any)?.sectionId);
                  const nextSectionId = remap.get(oldSectionId);
                  if (!nextSectionId) return Promise.resolve();
                  return supabase
                    .from('padlets')
                    .update({
                      metadata: {
                        ...(padlet.metadata as any),
                        sectionId: nextSectionId,
                      },
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', padlet.id);
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
    try {
      const { error } = await supabase
        .from('canvas_lines')
        .update({
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
          updated_at: new Date().toISOString()
        })
        .eq('id', lineId);

      if (error) { }
      else { debugCanvasLogger('saveEnd', { op: 'saveLineToDb', lineId }); }
    } catch (e) {
    }
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
    try {
      const { error } = await supabase
        .from('canvas_lines')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', lineId);

      if (error) { }
      else { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
    } catch (e) {
    }
  }, []);

  const deleteLine = useCallback(async (lineId: string) => {
    // Optimistic update
    setLines(prev => prev.filter(l => l.id !== lineId));
    dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: null } });

    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    try {
      const { error } = await supabase
        .from('canvas_lines')
        .delete()
        .eq('id', lineId);

      if (error) { }
    } catch (e) {
    }
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

      // Save to database
      const { error } = await supabase
        .from('canvas_lines')
        .insert(newLine);

      if (error) {
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
    const { error } = await supabase.from('padlets').insert(newPadlet);
    if (error) {
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
      const { error } = await supabase.from('padlets').update(updates).eq('id', id);
      if (error) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);

  const insertPadlet = useCallback(async (payload: any) => {
    return await supabase.from('padlets').insert(payload);
  }, []);

  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await supabase
      .from('padlets')
      .insert(payload)
      .select()
      .single();
  }, []);

  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await supabase
      .from('padlets')
      .update(updates)
      .eq('id', id);
  }, []);

  const deletePadletByIdRaw = useCallback(async (id: string) => {
    return await supabase
      .from('padlets')
      .delete()
      .eq('id', id);
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

## 4.5 AMENDMENT 1 (2026-07-11, CTO) — binding-inconsistency report resolved; MANDATORY mechanical extraction

**Verdict on the reported inconsistency:** the fences and the declared
hashes are BOTH correct and mutually consistent. The CTO re-derived all
three fences from the LIVE committed spec blob (`dce3373`, byte-identical
to the working copy, LF throughout, zero CR bytes) with a fresh
extraction — no cached canonical copies — and every fence hashes to its
declared value; fence bytes also equal the authoring-time canonical
copies, ruling out a stale cache. Writing the extracted fences to files
and running `git hash-object` reproduces the declared hashes exactly.
NOTHING in this spec was amended content-wise; no hash moved.

**Root-cause class (demonstrated, not guessed):** `git hash-object`
applies the repo's clean filter (`core.autocrlf=true`), so even a
CRLF-encoded write of a fence still hashes to the declared value — but
a RAW sha1 over CRLF bytes does NOT (measured: posts.ts CRLF raw-sha1
`d7e214ea…`, posts.test.ts `e4f7c3cc…`). The report's asymmetry (hook
reached its hash, the two whole-file pastes did not) matches an
extraction- or instrument-side EOL artifact: the hook was rebuilt by
recipe from the live LF file, the other two were whole-file
extractions. Verify hashes ONLY with `git hash-object` from the repo
root, never with a standalone sha1 of raw bytes.

**Phase B is REPLACED by the following bound script** (run from the
repo root with `python3`; it extracts the three fences from THIS spec,
hash-asserts each BEFORE writing, writes LF bytes, and re-verifies with
`git hash-object`; any assert = STOP and report):

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-040.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-040.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method (regex, renderer, hand copy)
# survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)
targets = [
    ("lib/domain/canvas/posts.ts", "fdc5fd153b5a4689a29c086652fc9411f9074b09"),
    ("lib/domain/canvas/posts.test.ts", "affd371dacd6607be415304f981ec938d6fb6be8"),
    ("components/collabboard/canvas/hooks/useCanvasData.ts", "2cd6f9c71261804b6bf94c9eb0e536864df44e1f"),
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
print("ALL THREE BOUND FILES WRITTEN AND HASH-VERIFIED")
```

§5 below remains EXPLANATORY (what changed and why, for review) — do
not hand-apply it; the script writes the complete final files. After the
script, continue with §6 (hashes will already match) and Phase C.

## 5. The hook's edit recipe (three regions — §4 is authoritative if any doubt; EXPLANATORY since Amendment 1 — do not hand-apply)

### §5a — extend the existing domain import block (alphabetical)

OLD:

```ts
import {
  createUpdatePostContentBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
```

NEW:

```ts
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
```

### §5b — addPadletFromLibraryItem (bare-await insert → best-effort command; `fetchData()` and the dep array BYTE-KEPT)

OLD:

```ts
  const addPadletFromLibraryItem = useCallback(async (payload: any) => {
    await supabase.from('padlets').insert(payload);
    fetchData();
  }, [fetchData]);
```

NEW:

```ts
  const addPadletFromLibraryItem = useCallback(async (payload: any) => {
    const createPostBestEffort = createCreatePostBestEffortCommand(createPostsRepository());
    const result = await createPostBestEffort({ row: payload }, { userId: null });
    if (!result.ok) throw result.error.cause ?? result.error;
    fetchData();
  }, [fetchData]);
```

### §5c — addDrawingLayoutPadlet (try-anchored — the OLD text includes the `try {` line because addFreeformCardPadlet contains a byte-identical insert statement WITHOUT one; the catch below is BYTE-KEPT)

OLD:

```ts
    try {
      const { error } = await supabase.from('padlets').insert(newPadlet);
      if (error) throw error;
      return newPadlet;
```

NEW:

```ts
    try {
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newPadlet }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      return newPadlet;
```

---

## 6. Post-edit gates (hashes FIRST; any mismatch = STOP)

### 6.0 Byte-identity (PRIMARY — computed from the CTO's simulation)

```bash
git hash-object lib/domain/canvas/posts.ts                                      # fdc5fd153b5a4689a29c086652fc9411f9074b09
git hash-object lib/domain/canvas/posts.test.ts                                 # affd371dacd6607be415304f981ec938d6fb6be8
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts            # 2cd6f9c71261804b6bf94c9eb0e536864df44e1f
git hash-object lib/infra/canvas/postsRepository.ts                             # 67adfcaabe843056b2d19590750b349006bd8d18   (MUST-NOT-CHANGE)
git hash-object lib/infra/canvas/postsRepository.test.ts                        # 3789a906815e90fe1bb0639a5f824dc09a9f1028   (MUST-NOT-CHANGE)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"                    # 57a56ef8595c8ebc4b655a1fd811904049bbd155   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasInteractions.ts    # 0e55b8e71e16f3e5416120fa0a69ce8c810ec065   (MUST-NOT-CHANGE)
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts           # cff23229dcbeb76a93d46d75b6b13a6aa351f07a   (MUST-NOT-CHANGE)
git ls-files --eol -- components/collabboard/canvas/hooks/useCanvasData.ts
# i/lf    w/lf
```

### 6.1 Hook census (simulation-measured)

```bash
H="components/collabboard/canvas/hooks/useCanvasData.ts"
wc -l "$H"                                # 634
grep -c '^[[:space:]]*$' "$H"             # 78
grep -c "\.from('padlets')" "$H"          # 8
grep -c "\.from(" "$H"                    # 17
grep -c "supabase" "$H"                   # 23
grep -c "markPadletLocallyModified" "$H"  # 5   (NEITHER insert site calls it — byte-kept absence, §0.3)
grep -c "createCreatePostBestEffortCommand" "$H"   # 2   (1 import + 1 use)
grep -c "createCreatePostCommand" "$H"             # 2   (1 import + 1 use)
grep -c "createPostsRepository" "$H"      # 5   (1 import + 4 uses)
grep -c "result.error.cause" "$H"         # 4
grep -c "userId: null" "$H"               # 4
grep -c "addFreeformCardPadlet" "$H"      # 2   (definition + return — BYTE-UNTOUCHED, §0.1)
```

### 6.2 Lib censuses + scope + untouched gates

```bash
grep -c "  it(" lib/domain/canvas/posts.test.ts            # 71
wc -l lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts   # 637 / 1312
git status --short   # exactly THREE modified files: posts.ts, posts.test.ts, the hook; ANY other path = STOP
git diff --stat -- lib/infra components/collabboard/canvas/hooks/useCanvasLines.ts components/collabboard/canvas/hooks/useCanvasInteractions.ts "app/dashboard/canvas/\[id\]/CanvasClient.tsx" eslint.boundaries.config.mjs   # nothing
grep -c "CanvasClient.tsx'\|FreeformPadletCards.tsx'" eslint.boundaries.config.mjs   # 2 (grandfather 2→2, untouched)
```

---

## 7. Verification sequence

**Phase A (before any edit):** port gate `(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count` → 0; own dev server; warm `/`, `/auth`, `/dashboard` with plain `curl -sS -o /dev/null` GETs; full Playwright → **27 passed** (cold-start rerun rule applies); §1 gates.

**Phase B:** implement §2–§4 (whole files; §5 is the hook's recipe), then §6 gates (hashes first). Write files with LF endings; confirm the `git ls-files --eol` gate.

**Phase C:** `npx tsc --noEmit` clean (stale `.next/types` rule applies); `npm run check:boundaries` → no output; `npx vitest run` → **214 passed (214), 25 files**; full Playwright warmed → **27 passed** (board-lifecycle creates posts — the insert paths' fidelity net); stop own server (PID-attributed) + port gate → 0; `rm -rf .next`; `npm run verify` all green.

## 8. Commit ritual

```bash
git add lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts components/collabboard/canvas/hooks/useCanvasData.ts
git status --short   # exactly 3 staged M lines; anything else = STOP
git commit -m "refactor(canvas): extract the convergent insert pair in useCanvasData -- createPostBestEffort (eleventh swallow site) + drawing insert onto the existing honest createPost, hooks slice 3, Pattern K (PATCH-040)" -- lib/domain/canvas/posts.ts lib/domain/canvas/posts.test.ts components/collabboard/canvas/hooks/useCanvasData.ts
```

## 9. Full-disclosure rule + STOP conditions

Report EVERY deviation: whitespace, comments, blank lines, EOL bytes,
import order, renamed locals, casts, message strings, test counts.
Pre-declared (confirm, don't re-justify): NO timestamps anywhere (029
insert fact); the validation-channel note (§0.2 — unreachable at both
consumers); wc 629→634; ZERO new casts; ZERO infra changes; the hook
stays supabase-bearing (17 sites, deferred by name);
`addFreeformCardPadlet` byte-untouched (owner decision point, §0.1).

STOP if: any §1 gate mismatches; any OLD text from §5 fails byte-match;
any §6.0 hash mismatches after one fix attempt against its §2–§4 fence;
`git status --short` shows ANY path beyond the three scoped files; any
MUST-NOT-CHANGE hash moved; tsc/boundaries/unit/e2e fail beyond the
stale-`.next/types` cure.

Do NOT: touch `addFreeformCardPadlet`, `updateDrawingLayoutPadlet`, the
four raw passthroughs, fetchData, the section-recovery cluster, the
realtime channel, any line site, useCanvasLines, useCanvasInteractions,
CanvasClient, or ANY infra file (all deferred BY NAME, §0.1); add
timestamps or fields to insert rows; add `markPadletLocallyModified`
anywhere; edit any existing test; create files; de-lint types; chase
the grandfather list (stays 2).
