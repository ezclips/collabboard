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

const { attachPostToContainer } = await import('./attachPostToContainer');

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
}

function padlet(overrides: PadletOverrides): Padlet {
  return {
    id: overrides.id,
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
