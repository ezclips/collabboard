import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/lib/domain/core/result';
import { domainError } from '@/lib/domain/core/errors';
import type { DomainError } from '@/lib/domain/core/errors';
import type { Result } from '@/lib/domain/core/result';
import type { PostsRepository } from '@/lib/domain/canvas/posts';
import type { Padlet } from '@/types/collabboard';

const updateMetadataCalls: Array<{ id: string; fields: { metadata: Record<string, unknown> } }> = [];
let updateMetadataResult: Result<void, DomainError> = ok(undefined);
let updateMetadataThrows: Error | null = null;

vi.mock('@/lib/infra/canvas/postsRepository', () => ({
  createPostsRepository: (): PostsRepository => ({
    updateTasks: async () => ok(undefined),
    updateMetadata: async (id, fields) => {
      if (updateMetadataThrows) throw updateMetadataThrows;
      updateMetadataCalls.push({ id: id as unknown as string, fields });
      return updateMetadataResult;
    },
    updateMetadataUnstamped: async () => ok(undefined),
    updateFieldsById: async () => ok(undefined),
    updatePosition: async () => ok(undefined),
    updateTitle: async () => ok(undefined),
    updateContent: async () => ok(undefined),
    updateTitleStamped: async () => ok(undefined),
    findMetadataById: async () => ok(null),
    deleteById: async () => ok(undefined),
    deleteByIds: async () => ok(undefined),
    deleteByParentId: async () => ok(undefined),
    insert: async () => ok(undefined),
    insertReturning: async () => ok(null),
  }),
}));

const deleteEdgesForPostCalls: Array<{ boardId: string; postId: string }> = [];
let deleteEdgesForPostThrows: Error | null = null;

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: (boardId: string) => ({
    deleteEdgesForPost: async (postId: string) => {
      if (deleteEdgesForPostThrows) throw deleteEdgesForPostThrows;
      deleteEdgesForPostCalls.push({ boardId, postId });
    },
  }),
}));

const { attachPostToContainer, cleanupGraphEdgesForContainerChild } = await import('./attachPostToContainer');

interface PadletOverrides {
  id: string;
  type?: Padlet['type'];
  title?: string;
  content?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  board_id?: string;
}

function padlet(overrides: PadletOverrides): Padlet {
  return {
    id: overrides.id,
    board_id: overrides.board_id ?? 'board-1',
    type: overrides.type ?? 'note',
    title: overrides.title ?? '',
    content: overrides.content ?? '',
    position_x: overrides.position_x ?? 0,
    position_y: overrides.position_y ?? 0,
    width: overrides.width ?? 200,
    height: overrides.height ?? 150,
    metadata: overrides.metadata ?? {},
  } as unknown as Padlet;
}

function makeHarness(padlets: Padlet[]) {
  const setPadlets = vi.fn(
    (updater: (prev: Padlet[]) => Padlet[]) => updater(padlets),
  ) as unknown as React.Dispatch<React.SetStateAction<Padlet[]>>;
  const fetchData = vi.fn(async () => {});
  const markPadletLocallyModified = vi.fn();
  return { padlets, setPadlets, fetchData, markPadletLocallyModified };
}

beforeEach(() => {
  updateMetadataCalls.length = 0;
  updateMetadataResult = ok(undefined);
  updateMetadataThrows = null;
  deleteEdgesForPostCalls.length = 0;
  deleteEdgesForPostThrows = null;
});

describe('attachPostToContainer', () => {
  it('appends the post to childPadletIds and sets parentId, exactly matching drag-end persistence shape', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: ['existing'] } });
    const post = padlet({ id: 'p1', metadata: { color: '#fff' } });
    const h = makeHarness([container, post]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls).toHaveLength(2);
    expect(updateMetadataCalls[0]).toEqual({
      id: 'c1',
      fields: { metadata: { childPadletIds: ['existing', 'p1'] }, updatedAt: expect.any(String) },
    });
    expect(updateMetadataCalls[1]).toEqual({
      id: 'p1',
      fields: { metadata: { color: '#fff', parentId: 'c1' }, updatedAt: expect.any(String) },
    });
    expect(h.fetchData).toHaveBeenCalledTimes(1);
    expect(h.markPadletLocallyModified).toHaveBeenCalledWith('c1');
    expect(h.markPadletLocallyModified).toHaveBeenCalledWith('p1');
  });

  it('PATCH 9F: a Document post (type "card") preserves its own ID, content, and Document-specific chrome/comment metadata -- menu grouping and drag grouping share this exact function, so they are provably equivalent', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] } });
    const doc = padlet({
      id: 'doc-1',
      type: 'card',
      title: 'My Report',
      content: '<p>original document body</p>',
      metadata: {
        backgroundColor: '#fee2e2',
        topStripColor: '#ef4444',
        comments: [{ id: 'c-1', text: 'hello', userId: 'u1', userName: 'A', timestamp: 1 }],
        detachedComments: [{ id: 'd-1', text: 'anchored', userId: 'u1', userName: 'A', timestamp: 2 }],
      },
    });
    const h = makeHarness([container, doc]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'doc-1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls[1]).toEqual({
      id: 'doc-1',
      fields: {
        metadata: {
          backgroundColor: '#fee2e2',
          topStripColor: '#ef4444',
          comments: [{ id: 'c-1', text: 'hello', userId: 'u1', userName: 'A', timestamp: 1 }],
          detachedComments: [{ id: 'd-1', text: 'anchored', userId: 'u1', userName: 'A', timestamp: 2 }],
          parentId: 'c1',
        },
        updatedAt: expect.any(String),
      },
    });
    // The post's own id/title/content fields are never touched by this
    // command at all -- only metadata.parentId is added.
    expect(doc.id).toBe('doc-1');
    expect(doc.title).toBe('My Report');
    expect(doc.content).toBe('<p>original document body</p>');
  });

  it('is a safe no-op when the post is already a member of the target container', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: ['p1'] } });
    const post = padlet({ id: 'p1', metadata: { parentId: 'c1' } });
    const h = makeHarness([container, post]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls).toHaveLength(0);
    expect(h.setPadlets).not.toHaveBeenCalled();
    expect(h.fetchData).not.toHaveBeenCalled();
  });

  it('does nothing when the container is missing locally', async () => {
    const post = padlet({ id: 'p1' });
    const h = makeHarness([post]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'missing-container',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls).toHaveLength(0);
    expect(h.setPadlets).not.toHaveBeenCalled();
  });

  it('does nothing when the post is missing locally', async () => {
    const container = padlet({ id: 'c1', type: 'container' });
    const h = makeHarness([container]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'missing-post',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls).toHaveLength(0);
    expect(h.setPadlets).not.toHaveBeenCalled();
  });

  it('preserves the legacy best-effort swallow: a resolved repository failure still lets both writes proceed and local state settle', async () => {
    updateMetadataResult = err(domainError('unavailable', 'db down'));
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] } });
    const post = padlet({ id: 'p1' });
    const h = makeHarness([container, post]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(updateMetadataCalls).toHaveLength(2);
    expect(h.fetchData).toHaveBeenCalledTimes(1);
  });

  it('stops after a thrown failure on the container write and never calls fetchData/setPadlets', async () => {
    updateMetadataThrows = new Error('network dropped');
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] } });
    const post = padlet({ id: 'p1' });
    const h = makeHarness([container, post]);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(h.setPadlets).not.toHaveBeenCalled();
    expect(h.fetchData).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('PATCH 9P: attachPostToContainer cleans up Graph edges for the newly-attached post', () => {
  it('deletes edges for the post using its own board_id, after the parentId write succeeds', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] }, board_id: 'board-9' });
    const post = padlet({ id: 'p1', board_id: 'board-9' });
    const h = makeHarness([container, post]);

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    expect(deleteEdgesForPostCalls).toEqual([{ boardId: 'board-9', postId: 'p1' }]);
  });

  it('calls onGraphEdgesChanged exactly once after cleanup so the caller can refresh the Graph layer', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] } });
    const post = padlet({ id: 'p1' });
    const h = makeHarness([container, post]);
    const onGraphEdgesChanged = vi.fn();

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
      onGraphEdgesChanged,
    });

    expect(onGraphEdgesChanged).toHaveBeenCalledTimes(1);
    expect(deleteEdgesForPostCalls).toHaveLength(1);
  });

  it('does not attempt cleanup on the already-a-member no-op path', async () => {
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: ['p1'] } });
    const post = padlet({ id: 'p1', metadata: { parentId: 'c1' } });
    const h = makeHarness([container, post]);
    const onGraphEdgesChanged = vi.fn();

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
      onGraphEdgesChanged,
    });

    expect(deleteEdgesForPostCalls).toHaveLength(0);
    expect(onGraphEdgesChanged).not.toHaveBeenCalled();
  });

  it('a thrown cleanup failure is reported but does not prevent local state sync or fetchData -- no transaction framework', async () => {
    deleteEdgesForPostThrows = new Error('graph table unavailable');
    const container = padlet({ id: 'c1', type: 'container', metadata: { childPadletIds: [] } });
    const post = padlet({ id: 'p1' });
    const h = makeHarness([container, post]);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await attachPostToContainer({
      padlets: h.padlets,
      containerId: 'c1',
      postId: 'p1',
      setPadlets: h.setPadlets,
      fetchData: h.fetchData,
      markPadletLocallyModified: h.markPadletLocallyModified,
    });

    // The post still successfully becomes a child (reparenting is not rolled
    // back by a Graph-cleanup failure) -- the failure is only reported.
    expect(updateMetadataCalls).toHaveLength(2);
    expect(h.setPadlets).toHaveBeenCalledTimes(1);
    expect(h.fetchData).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to clean up Graph edges for post entering a Container:',
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it('cleanupGraphEdgesForContainerChild is a no-op (no repo call) when boardId is undefined', async () => {
    await cleanupGraphEdgesForContainerChild(undefined, 'p1');
    expect(deleteEdgesForPostCalls).toHaveLength(0);
  });

  it('cleanupGraphEdgesForContainerChild reports (does not throw) when the repo call fails', async () => {
    deleteEdgesForPostThrows = new Error('boom');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(cleanupGraphEdgesForContainerChild('board-1', 'p1')).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
