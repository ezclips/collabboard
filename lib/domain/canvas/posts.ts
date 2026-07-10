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
