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

