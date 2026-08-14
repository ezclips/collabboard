import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteEdgesForPostCalls: Array<{ boardId: string; postId: string }> = [];
const throwsForPostId = new Set<string>();

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: (boardId: string) => ({
    deleteEdgesForPost: async (postId: string) => {
      deleteEdgesForPostCalls.push({ boardId, postId });
      if (throwsForPostId.has(postId)) throw new Error(`boom for ${postId}`);
    },
  }),
}));

const { cleanupGraphEdgesForDeletedPosts } = await import('./deletePostGraphCleanup');

beforeEach(() => {
  deleteEdgesForPostCalls.length = 0;
  throwsForPostId.clear();
});

describe('PATCH 9Q: cleanupGraphEdgesForDeletedPosts', () => {
  it('calls the repository once per deleted post id, scoped to the given board', async () => {
    await cleanupGraphEdgesForDeletedPosts('board-1', ['p1', 'p2', 'p3']);

    expect(deleteEdgesForPostCalls).toHaveLength(3);
    expect(deleteEdgesForPostCalls).toEqual(
      expect.arrayContaining([
        { boardId: 'board-1', postId: 'p1' },
        { boardId: 'board-1', postId: 'p2' },
        { boardId: 'board-1', postId: 'p3' },
      ]),
    );
  });

  it('is a no-op when boardId is undefined -- no repository call at all', async () => {
    await cleanupGraphEdgesForDeletedPosts(undefined, ['p1']);
    expect(deleteEdgesForPostCalls).toHaveLength(0);
  });

  it('is a no-op when the postIds array is empty', async () => {
    await cleanupGraphEdgesForDeletedPosts('board-1', []);
    expect(deleteEdgesForPostCalls).toHaveLength(0);
  });

  it('[idempotence] resolves without throwing when called twice in a row for the same ids', async () => {
    await expect(cleanupGraphEdgesForDeletedPosts('board-1', ['p1'])).resolves.toBeUndefined();
    await expect(cleanupGraphEdgesForDeletedPosts('board-1', ['p1'])).resolves.toBeUndefined();
    expect(deleteEdgesForPostCalls).toHaveLength(2);
  });

  it('a failure for one postId is reported but does not prevent cleanup of the others (best-effort, no thrown rejection)', async () => {
    throwsForPostId.add('p2');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(cleanupGraphEdgesForDeletedPosts('board-1', ['p1', 'p2', 'p3'])).resolves.toBeUndefined();

    expect(deleteEdgesForPostCalls.map((c) => c.postId).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to clean up Graph edges for deleted post:',
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});
