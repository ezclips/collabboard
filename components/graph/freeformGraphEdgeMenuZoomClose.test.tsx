// @vitest-environment jsdom
//
// PATCH 9S -- the Graph edge context menu caches its position as fixed screen
// pixels at open-time (event.clientX/clientY) and never recomputes it. Once
// camera-anchored zoom can move the world underneath a fixed screen point, a
// stale menu would visually detach from the edge it targets, so it must
// close on any zoom change. Mounts the real component (createRoot/act,
// matching the established convention in freeformGraphLabelDrag.test.tsx)
// and re-renders with a changed zoom prop to simulate a camera zoom.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import type { FreeformGraphEdge } from '@/types/graphTypes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!('ResizeObserver' in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
(globalThis as any).cancelAnimationFrame = () => {};

const upsertEdgeMock = vi.fn(async (edge: Partial<FreeformGraphEdge>) => edge as FreeformGraphEdge);
const deleteEdgeMock = vi.fn(async () => {});
let mockEdges: FreeformGraphEdge[] = [];

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: () => ({
    getEdges: async () => mockEdges,
    getSettings: async () => null,
    upsertEdge: upsertEdgeMock,
    deleteEdge: deleteEdgeMock,
  }),
}));

const FreeformGraphLayer = (await import('./FreeformGraphLayer')).default;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  upsertEdgeMock.mockClear();
  deleteEdgeMock.mockClear();
  mockEdges = [];
});

function post(id: string, overrides: Partial<Padlet> = {}): Padlet {
  return {
    id,
    board_id: 'board1',
    title: id,
    content: '',
    type: 'note',
    position_x: 0,
    position_y: 0,
    width: 100,
    height: 60,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Padlet;
}

function edge(id: string, sourceId: string, targetId: string): FreeformGraphEdge {
  return {
    id,
    board_id: 'board1',
    source_post_id: sourceId,
    target_post_id: targetId,
    relation_type: 'solid',
    direction: 'forward',
    label: 'Test Label',
    style: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const postA = post('postA', { position_x: 100, position_y: 100, width: 200, height: 150 });
const postB = post('postB', { position_x: 500, position_y: 100, width: 200, height: 150 });

async function mountAndFlush(ui: React.ReactElement) {
  const { root, container } = mount(ui);
  // FreeformGraphLayer's edges list starts empty and only populates once the
  // mocked repo.getEdges() promise resolves (matching the established flush
  // pattern in freeformGraphLabelDrag.test.tsx) -- without this, the <g>
  // element for the edge never renders.
  await act(async () => { await Promise.resolve(); });
  return { root, container };
}

function openEdgeMenu(container: HTMLElement) {
  const g = container.querySelector('g');
  if (!g) throw new Error('edge <g> element not found');
  act(() => {
    g.dispatchEvent(new MouseEvent('contextmenu', { clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
  });
}

function isMenuOpen(container: HTMLElement): boolean {
  return container.textContent?.includes('Edge Settings') ?? false;
}

describe('PATCH 9S: Graph edge context menu closes on zoom change [Phase 25]', () => {
  it('opens on right-click, and stays open across a re-render with the SAME zoom (control)', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { root, container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />
    );
    openEdgeMenu(container);
    expect(isMenuOpen(container)).toBe(true);

    act(() => { root.render(<FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />); });
    expect(isMenuOpen(container)).toBe(true);
  });

  it('closes when the zoom prop changes (toolbar/wheel zoom)', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { root, container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />
    );
    openEdgeMenu(container);
    expect(isMenuOpen(container)).toBe(true);

    act(() => { root.render(<FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1.1} />); });
    expect(isMenuOpen(container)).toBe(false);
  });

  it('closes on a zoom-out change too, not just zoom-in', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { root, container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />
    );
    openEdgeMenu(container);
    expect(isMenuOpen(container)).toBe(true);

    act(() => { root.render(<FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={0.6} />); });
    expect(isMenuOpen(container)).toBe(false);
  });

  it('does not open spuriously on mount just because the effect exists', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />
    );
    expect(isMenuOpen(container)).toBe(false);
  });

  it('zoom-driven close does not call deleteEdge or upsertEdge -- purely local UI state [world-model freeze]', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { root, container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />
    );
    openEdgeMenu(container);
    upsertEdgeMock.mockClear();
    deleteEdgeMock.mockClear();

    act(() => { root.render(<FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1.2} />); });

    expect(upsertEdgeMock).not.toHaveBeenCalled();
    expect(deleteEdgeMock).not.toHaveBeenCalled();
  });
});
