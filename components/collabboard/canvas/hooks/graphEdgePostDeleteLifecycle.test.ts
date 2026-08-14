import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// PATCH 9Q: end-to-end lifecycle behavior via an in-memory fake repository
// that mirrors the EXACT filter semantics of the real
// FreeformGraphRepo.deleteEdgesForPost query (source_post_id = postId OR
// target_post_id = postId, scoped to board_id) -- proven separately, unit,
// in lib/graph/graphRepo.deleteEdgesForPost.test.ts (PATCH 9P).
// ---------------------------------------------------------------------------

interface FakeEdge {
  id: string;
  board_id: string;
  source_post_id: string;
  target_post_id: string;
}

let fakeEdges: FakeEdge[] = [];
const deleteEdgesForPostCalls: Array<{ boardId: string; postId: string }> = [];

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: (boardId: string) => ({
    deleteEdgesForPost: async (postId: string) => {
      deleteEdgesForPostCalls.push({ boardId, postId });
      fakeEdges = fakeEdges.filter(
        (e) => !(e.board_id === boardId && (e.source_post_id === postId || e.target_post_id === postId)),
      );
    },
  }),
}));

const { cleanupGraphEdgesForDeletedPosts } = await import('./deletePostGraphCleanup');

function edge(id: string, source: string, target: string, boardId = 'board-1'): FakeEdge {
  return { id, board_id: boardId, source_post_id: source, target_post_id: target };
}

beforeEach(() => {
  fakeEdges = [];
  deleteEdgesForPostCalls.length = 0;
});

describe('PATCH 9Q: cleanupGraphEdgesForDeletedPosts lifecycle matrix', () => {
  it('[matrix 1] delete source endpoint -> edge deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['A']);
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 2] delete target endpoint -> edge deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['B']);
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 3] multiple incoming edges deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'B'), edge('e3', 'D', 'B')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['B']);
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 4] multiple outgoing edges deleted', async () => {
    fakeEdges = [edge('e1', 'B', 'A'), edge('e2', 'B', 'C'), edge('e3', 'B', 'D')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['B']);
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 5] mixed incoming/outgoing deleted (spec worked example: A->B, C->B, B->D)', async () => {
    fakeEdges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'B'), edge('e3', 'B', 'D'), edge('e4', 'E', 'F')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['B']);
    expect(fakeEdges).toEqual([edge('e4', 'E', 'F')]);
  });

  it('[matrix 6 / 23] unrelated edges preserved, including cross-board edges sharing the same post id', async () => {
    fakeEdges = [edge('e1', 'A', 'B', 'board-1'), edge('e2', 'E', 'F', 'board-1'), edge('e3', 'A', 'B', 'board-2')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['A']);
    expect(fakeEdges).toEqual([edge('e2', 'E', 'F', 'board-1'), edge('e3', 'A', 'B', 'board-2')]);
  });

  it('[matrix 7] deleting an unconnected post with zero edges is a safe no-op (also covers matrix 17)', async () => {
    fakeEdges = [edge('e1', 'E', 'F')];
    await expect(cleanupGraphEdgesForDeletedPosts('board-1', ['unconnected'])).resolves.toBeUndefined();
    expect(fakeEdges).toEqual([edge('e1', 'E', 'F')]);
  });

  it('[matrix 18] repeated cleanup for the same already-cleaned id is safe (idempotence)', async () => {
    fakeEdges = [edge('e1', 'A', 'B')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['A']);
    expect(fakeEdges).toEqual([]);
    await expect(cleanupGraphEdgesForDeletedPosts('board-1', ['A'])).resolves.toBeUndefined();
    expect(fakeEdges).toEqual([]);
  });

  it('[self-edge] a legacy A->A row is removed exactly once', async () => {
    fakeEdges = [edge('self', 'A', 'A'), edge('unrelated', 'E', 'F')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['A']);
    expect(fakeEdges).toEqual([edge('unrelated', 'E', 'F')]);
  });

  it('[matrix 3+4 combined, container cascade shape] deleting a Container together with its children removes edges for every affected id in one call', async () => {
    // Container "Col1" is itself connected; its (already Graph-ineligible
    // per PATCH 9P) child "Kid" has a stale legacy edge row.
    fakeEdges = [edge('e1', 'Col1', 'X'), edge('e2', 'Kid', 'Y'), edge('e3', 'E', 'F')];
    await cleanupGraphEdgesForDeletedPosts('board-1', ['Col1', 'Kid']);
    expect(fakeEdges).toEqual([edge('e3', 'E', 'F')]);
  });
});

// ---------------------------------------------------------------------------
// Architecture: every real (non-rollback) post-delete entry point in
// CanvasClient.tsx reaches the SAME cleanup function -- no per-post-type or
// per-menu duplication.
// ---------------------------------------------------------------------------

describe('PATCH 9Q: one cleanup boundary, reached by every real post-delete entry point', () => {
  const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
  const helperSrc = read('components/collabboard/canvas/hooks/deletePostGraphCleanup.ts');

  it('the cleanup function is defined exactly once, and CanvasClient.tsx imports (not reimplements) it', () => {
    expect(helperSrc.match(/export async function cleanupGraphEdgesForDeletedPosts/g)?.length).toBe(1);
    expect(canvasClientSrc).toContain(
      "import { cleanupGraphEdgesForDeletedPosts } from '@/components/collabboard/canvas/hooks/deletePostGraphCleanup';",
    );
    // Not reimplemented inline anywhere in CanvasClient.tsx.
    expect((canvasClientSrc.match(/deleteEdgesForPost/g) ?? []).length).toBe(0);
  });

  it('[matrix 9] deletePadletById (context-menu / generic Delete) calls the shared cleanup', () => {
    const start = canvasClientSrc.indexOf('const deletePadletById = async (id: string) => {');
    const end = canvasClientSrc.indexOf('\n  };', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, [id]);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('[matrix 12] requestDeletePadlet (post + Container child cascade) calls the shared cleanup with all affected ids', () => {
    const start = canvasClientSrc.indexOf('const requestDeletePadlet = async (padletId: string) => {');
    const end = canvasClientSrc.indexOf('\n  };', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain(
      'await cleanupGraphEdgesForDeletedPosts(canvasId, [padletId, ...children.map((c) => c.id)]);',
    );
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('deleteMapPinContainer (Map pin + children) calls the shared cleanup with all affected ids', () => {
    const start = canvasClientSrc.indexOf('const deleteMapPinContainer = useCallback(async (containerId: string) => {');
    const end = canvasClientSrc.indexOf('\n  }, [padlets, selectedPadletId, mapActiveContainerId', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, [containerId, ...childIds]);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('handleUndoPaste (Ctrl+Z bulk delete) calls the shared cleanup', () => {
    const start = canvasClientSrc.indexOf('const handleUndoPaste = useCallback(async () => {');
    const end = canvasClientSrc.indexOf('\n  }, [fetchData, lastPastedPadletIds', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, idsToDelete);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('handleDrawingLayoutDeleteOverlayPadlets (Drawing bulk delete) calls the shared cleanup', () => {
    const start = canvasClientSrc.indexOf('const handleDrawingLayoutDeleteOverlayPadlets = useCallback(async (rootIds: string[]) => {');
    const end = canvasClientSrc.indexOf('\n  }, [fetchData, padlets, selectedPadletId, selectedPadletIds, setSelectedPadletId, setSelectedPadletIds', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, [...affectedIds]);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('[matrix 10] Wall layout inline onPadletDelete (post + Container child cascade) calls the shared cleanup', () => {
    const start = canvasClientSrc.indexOf('onPadletDelete={async (padletId) => {');
    const end = canvasClientSrc.indexOf('}}', canvasClientSrc.indexOf("toast.success(isContainer ? 'Container deleted' : 'Post deleted');", start));
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, [padletId, ...childIds]);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('handleDeleteChildFromContainer (single container-child delete) calls the shared cleanup', () => {
    const start = canvasClientSrc.indexOf('const handleDeleteChildFromContainer = useCallback(async (childId: string, containerId: string) => {');
    const end = canvasClientSrc.indexOf('\n  }, [padlets, supabase, fetchData, canvasId, setGraphRefreshToken]);', start);
    expect(start).toBeGreaterThan(-1);
    const body = canvasClientSrc.slice(start, end);
    expect(body).toContain('await cleanupGraphEdgesForDeletedPosts(canvasId, [childId]);');
    expect(body).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('exactly 7 real (non-rollback) call sites are wired -- no more, no fewer, and each is immediately followed by a graphRefreshToken bump', () => {
    expect((canvasClientSrc.match(/await cleanupGraphEdgesForDeletedPosts\(/g) ?? []).length).toBe(7);
    // Every cleanup call is directly followed (next non-blank line) by the
    // refresh-token bump -- catches a cleanup call added without its
    // matching local-state refresh, at any of the 7 sites.
    const cleanupCallRegex = /await cleanupGraphEdgesForDeletedPosts\([^;]*\);\s*\n\s*setGraphRefreshToken\(\(token\) => token \+ 1\);/g;
    expect((canvasClientSrc.match(cleanupCallRegex) ?? []).length).toBe(7);
  });

  it('the compensating post-creation rollback (deletePostSwallowResolved) is intentionally NOT wired -- it deletes a post that never finished being created and can never have a Graph edge', () => {
    const hookSrc = read('components/collabboard/canvas/hooks/useCanvasData.ts');
    const start = hookSrc.indexOf('const deletePostSwallowResolved = useCallback(async (id: string) => {');
    const end = hookSrc.indexOf('}, []);', start);
    expect(start).toBeGreaterThan(-1);
    const body = hookSrc.slice(start, end);
    expect(body).not.toContain('cleanupGraphEdgesForDeletedPosts');
    expect(body).not.toContain('createFreeformGraphRepo');
  });

  it('no per-post-type or per-menu-component duplication was introduced', () => {
    for (const menuFile of [
      'components/collabboard/menus/NotePostContextMenu.tsx',
      'components/collabboard/menus/TodoPostContextMenu.tsx',
      'components/collabboard/menus/LinkPostContextMenu.tsx',
      'components/collabboard/context-menus/ImagePostContextMenu.tsx',
    ]) {
      const src = read(menuFile);
      expect(src).not.toContain('cleanupGraphEdgesForDeletedPosts');
      expect(src).not.toContain('deleteEdgesForPost');
    }
  });
});

// ---------------------------------------------------------------------------
// Scope guards and cross-patch freezes.
// ---------------------------------------------------------------------------

describe('PATCH 9Q: scope guards and cross-patch freezes', () => {
  it('[matrix 19] PATCH 9P root -> Container cleanup call sites are untouched', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('await cleanupGraphEdgesForContainerChild(padlet.board_id, id);');
    expect(src).toContain(
      "import { attachPostToContainer, cleanupGraphEdgesForContainerChild } from '@/components/collabboard/canvas/hooks/attachPostToContainer';",
    );
    const attachSrc = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(attachSrc).toContain('await cleanupGraphEdgesForContainerChild(post.board_id, postId);');
  });

  it('[matrix 20] PATCH 9O Graph label-drag math is untouched', () => {
    const src = read('components/graph/FreeformGraphLayer.tsx');
    expect(src).toContain('const zoomRef = useRef(zoom);');
    expect(src).toContain('const currentZoom = zoomRef.current;');
    expect(src).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(src).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
  });

  it('[matrix 21] Manual Line system files are untouched by this patch', () => {
    const helperSrc = read('components/collabboard/canvas/hooks/deletePostGraphCleanup.ts');
    expect(helperSrc).not.toContain('SimpleLineRenderer');
    expect(helperSrc).not.toContain('useCanvasLines');
    expect(helperSrc).not.toContain('canvasLineCoordinates');
    expect(helperSrc).not.toContain('freeformStageGeometry');
  });

  it('[matrix 22] camera-anchored zoom remains unimplemented', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).not.toMatch(/anchorZoom|cameraAnchor|zoomAroundPoint/);
  });

  it('no second Graph-edge deletion repository method was added -- deleteEdgesForPost is reused, not reimplemented', () => {
    const repoSrc = read('lib/graph/graphRepo.ts');
    expect(repoSrc.match(/deleteEdgesForPost\(postId: string\)/g)?.length).toBe(1);
    expect(repoSrc).not.toContain('deleteEdgesForPosts');
  });

  it('PATCH 9M stacking containment (isolation: isolate) is untouched', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("isolation: 'isolate',");
  });

  it('PATCH 9K.1 Comment collapse/expand contract is untouched', () => {
    const src = read('components/collabboard/editors/CommentEditor.tsx');
    expect(src).toContain('const handleToggleCollapse = () => {');
    expect(src).toContain('keepEditorOpen: true,');
  });
});
