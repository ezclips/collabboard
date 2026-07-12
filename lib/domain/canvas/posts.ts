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
