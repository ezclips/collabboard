import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// PATCH 9P: end-to-end lifecycle behavior via an in-memory fake repository
// that mirrors the EXACT filter semantics of the real
// FreeformGraphRepo.deleteEdgesForPost query (source_post_id = postId OR
// target_post_id = postId, scoped to board_id) -- proven separately, unit,
// in lib/graph/graphRepo.deleteEdgesForPost.test.ts. This lets multi-edge/
// unrelated-edge scenarios be verified against the real
// cleanupGraphEdgesForContainerChild function without touching a real DB.
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

const { cleanupGraphEdgesForContainerChild } = await import('./attachPostToContainer');

function edge(id: string, source: string, target: string, boardId = 'board-1'): FakeEdge {
  return { id, board_id: boardId, source_post_id: source, target_post_id: target };
}

beforeEach(() => {
  fakeEdges = [];
  deleteEdgesForPostCalls.length = 0;
});

describe('PATCH 9P: cleanupGraphEdgesForContainerChild lifecycle matrix', () => {
  it('[matrix 1] source endpoint enters a Container -> its outgoing edge is deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B')];
    await cleanupGraphEdgesForContainerChild('board-1', 'A');
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 2] target endpoint enters a Container -> its incoming edge is deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B')];
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 3] multiple incoming edges are all deleted', async () => {
    fakeEdges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'B'), edge('e3', 'D', 'B')];
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 4] multiple outgoing edges are all deleted', async () => {
    fakeEdges = [edge('e1', 'B', 'A'), edge('e2', 'B', 'C'), edge('e3', 'B', 'D')];
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([]);
  });

  it('[matrix 5] mixed incoming/outgoing are all deleted (spec worked example: A->B, C->B, B->D)', async () => {
    fakeEdges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'B'), edge('e3', 'B', 'D'), edge('e4', 'E', 'F')];
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([edge('e4', 'E', 'F')]);
  });

  it('[matrix 6] unrelated edges remain untouched', async () => {
    fakeEdges = [edge('e1', 'A', 'B'), edge('e2', 'E', 'F')];
    await cleanupGraphEdgesForContainerChild('board-1', 'A');
    expect(fakeEdges).toEqual([edge('e2', 'E', 'F')]);
  });

  it('[matrix 18] a Container post that stays root keeps its own edges when an unrelated post becomes its child', async () => {
    // Container "Col1" is itself a Graph endpoint (root -> root connection).
    fakeEdges = [edge('e1', 'Col1', 'X')];
    // Some other post "P" becomes a child of Col1 -- Col1 itself never
    // becomes ineligible merely because it now has children.
    await cleanupGraphEdgesForContainerChild('board-1', 'P');
    expect(fakeEdges).toEqual([edge('e1', 'Col1', 'X')]);
  });

  it('[matrix 19] moving an already-child post to a different Container is idempotent -- opportunistically cleans any stale legacy row scoped only to that postId', async () => {
    fakeEdges = [edge('stale', 'B', 'Z'), edge('unrelated', 'E', 'F')];
    // B is already a child (pre-fix stale row survived); dragging it from
    // one Container to another calls the same cleanup, scoped to B only.
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([edge('unrelated', 'E', 'F')]);
    // Second call (no edges left for B) is a safe no-op.
    await cleanupGraphEdgesForContainerChild('board-1', 'B');
    expect(fakeEdges).toEqual([edge('unrelated', 'E', 'F')]);
  });

  it('edges scoped to a different board are never touched, even with the same post id', async () => {
    fakeEdges = [edge('e1', 'A', 'B', 'board-1'), edge('e2', 'A', 'B', 'board-2')];
    await cleanupGraphEdgesForContainerChild('board-1', 'A');
    expect(fakeEdges).toEqual([edge('e2', 'A', 'B', 'board-2')]);
  });
});

// ---------------------------------------------------------------------------
// Architecture / equivalence: drag and both "Group into Column" branches all
// reach the SAME cleanup function -- no per-post-type or per-entry-point
// duplication.
// ---------------------------------------------------------------------------

describe('PATCH 9P: one cleanup boundary, reached identically by drag and both Group-into-Column branches', () => {
  const attachSrc = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
  const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
  const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');

  it('[matrix 9] drag-into-Container reaches cleanup via attachPostToContainer (useCanvasInteractions.ts), no bespoke logic in the drag handler itself', () => {
    expect(interactionsSrc).toContain('await attachPostToContainer({');
    expect(interactionsSrc).toContain('onGraphEdgesChanged: () => setGraphRefreshToken?.((token) => token + 1)');
    // No independent Graph-edge deletion call in the drag handler itself.
    expect(interactionsSrc).not.toContain('deleteEdgesForPost');
    expect(interactionsSrc).not.toContain('createFreeformGraphRepo');
  });

  it('[matrix 8] "Group into Column" onto an EXISTING container reaches cleanup via the same attachPostToContainer call', () => {
    const existingBranch = canvasClientSrc.slice(
      canvasClientSrc.indexOf('const groupIntoColumn = async'),
      canvasClientSrc.indexOf('if (targetContainerId) {') + 600,
    );
    expect(existingBranch).toContain('await attachPostToContainer({');
    expect(existingBranch).toContain('onGraphEdgesChanged: () => setGraphRefreshToken((token) => token + 1)');
  });

  it('[matrix 8] "Group into Column" that creates a BRAND NEW container calls the exact same cleanupGraphEdgesForContainerChild function directly', () => {
    const branchStart = canvasClientSrc.indexOf("// Create a new container at the padlet's position");
    const branchEnd = canvasClientSrc.indexOf('// Update local state', branchStart);
    expect(branchStart).toBeGreaterThan(-1);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const newContainerBranch = canvasClientSrc.slice(branchStart, branchEnd);
    expect(newContainerBranch).toContain('await cleanupGraphEdgesForContainerChild(padlet.board_id, id);');
    expect(newContainerBranch).toContain('setGraphRefreshToken((token) => token + 1);');
  });

  it('the cleanup function itself is defined exactly once, imported (not reimplemented) at every call site', () => {
    expect(attachSrc.match(/export async function cleanupGraphEdgesForContainerChild/g)?.length).toBe(1);
    expect(canvasClientSrc).toContain(
      "import { attachPostToContainer, cleanupGraphEdgesForContainerChild } from '@/components/collabboard/canvas/hooks/attachPostToContainer';",
    );
    // Not reimplemented inline anywhere in CanvasClient.tsx.
    expect((canvasClientSrc.match(/deleteEdgesForPost/g) ?? []).length).toBe(0);
  });

  it('[negative-control-style guard] no post-type branching exists around any of the three cleanup call sites', () => {
    const groupIntoColumnBody = canvasClientSrc.slice(
      canvasClientSrc.indexOf('const groupIntoColumn = async'),
      canvasClientSrc.indexOf('\n  };', canvasClientSrc.indexOf('const groupIntoColumn = async')),
    );
    expect(groupIntoColumnBody).not.toMatch(/padlet\.type\s*===/);

    const dropHandlerWindow = interactionsSrc.slice(
      Math.max(0, interactionsSrc.indexOf('await attachPostToContainer({') - 500),
      interactionsSrc.indexOf('await attachPostToContainer({') + 400,
    );
    expect(dropHandlerWindow).not.toMatch(/draggedPadlet\.type\s*===/);

    // No per-type context-menu file was given its own bespoke cleanup call.
    for (const menuFile of [
      'components/collabboard/menus/NotePostContextMenu.tsx',
      'components/collabboard/menus/TodoPostContextMenu.tsx',
      'components/collabboard/menus/LinkPostContextMenu.tsx',
      'components/collabboard/context-menus/ImagePostContextMenu.tsx',
    ]) {
      const src = read(menuFile);
      expect(src).not.toContain('cleanupGraphEdgesForContainerChild');
      expect(src).not.toContain('deleteEdgesForPost');
    }
  });
});

// ---------------------------------------------------------------------------
// Scope guards / freezes required by the spec.
// ---------------------------------------------------------------------------

describe('PATCH 9P: scope guards and cross-patch freezes', () => {
  it('[matrix 17] child Graph eligibility rule is untouched -- posts with metadata.parentId are still rejected from Graph Connect', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('if (selected.metadata?.parentId) {');
    expect(src).toContain("toast.message('Only top-level posts or columns can be connected.');");
  });

  it('[matrix 20] Return-to-root (handleDetachChildFromFreeformContainer) never resurrects a previously-deleted Graph edge', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = src.indexOf('const handleDetachChildFromFreeformContainer');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n  }, [padlets, supabase, fetchData]);', start);
    const body = src.slice(start, end);
    expect(body).not.toContain('upsertEdge');
    expect(body).not.toContain('createFreeformGraphRepo');
    expect(body).not.toContain('cleanupGraphEdgesForContainerChild');
  });

  it('[matrix 20 / negative control J] post-delete orphan-edge defect remains explicitly OUT OF SCOPE -- no new deletion wiring on post delete', () => {
    // Reserved for PATCH 9Q. selectValidEdges still filters by post-id
    // presence only -- it does not delete persisted rows.
    const src = read('lib/graph/graphSelectors.ts');
    expect(src).toContain(
      'export function selectValidEdges(\n    posts: Padlet[],\n    edges: FreeformGraphEdge[]\n): FreeformGraphEdge[] {',
    );
    expect(src).not.toContain('deleteEdge');
    expect(src).not.toContain('deleteEdgesForPost');

    // Exactly the same two deleteEdge( call sites as PATCH 9O found
    // (definition + the single "Delete Line" button), plus the new
    // deleteEdgesForPost( definition -- no deletion wiring was added to any
    // post-delete lifecycle path.
    const repoSrc = read('lib/graph/graphRepo.ts');
    expect(repoSrc.match(/deleteEdge\(edgeId: string\)/g)?.length).toBe(1);
    expect(repoSrc.match(/deleteEdgesForPost\(postId: string\)/g)?.length).toBe(1);
  });

  it('[matrix 21] PATCH 9O Graph label-drag math is untouched', () => {
    const src = read('components/graph/FreeformGraphLayer.tsx');
    expect(src).toContain('const zoomRef = useRef(zoom);');
    expect(src).toContain('const currentZoom = zoomRef.current;');
    expect(src).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(src).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
  });

  it('[matrix 22] Manual Line system files are untouched by this patch', () => {
    // Structural proxy matching PATCH 9O's own freeze: these files are not
    // imported by, and share no exported symbol with, attachPostToContainer.ts.
    const attachSrc = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(attachSrc).not.toContain('SimpleLineRenderer');
    expect(attachSrc).not.toContain('useCanvasLines');
    expect(attachSrc).not.toContain('canvasLineCoordinates');
    expect(attachSrc).not.toContain('freeformStageGeometry');
  });

  it('[matrix 23] camera-anchored zoom remains unimplemented', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).not.toMatch(/anchorZoom|cameraAnchor|zoomAroundPoint/);
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
