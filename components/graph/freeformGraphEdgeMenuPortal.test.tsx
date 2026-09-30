// @vitest-environment jsdom
//
// PATCH-226 -- the Graph edge context menu used `position: fixed` but was
// rendered inside the zoomed/offset board layer, whose transform made it the
// containing block; a right-click landed the menu far off-screen. It now
// renders through a portal to document.body, so `fixed` is viewport-relative
// again, and its position is clamped inside the window.
//
// Mounts the real component (createRoot/act, matching freeformGraphEdgeMenu
// ZoomClose.test.tsx) with the repo mocked the same way.
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
  const mountedPair = mount(ui);
  await act(async () => { await Promise.resolve(); });
  return mountedPair;
}

function openEdgeMenu(container: HTMLElement) {
  const g = container.querySelector('g');
  if (!g) throw new Error('edge <g> element not found');
  act(() => {
    g.dispatchEvent(new MouseEvent('contextmenu', { clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
  });
}

/** The inner "Edge Settings" title div, wherever it is in the document. */
function menuTitleEl(): HTMLElement | null {
  return Array.from(document.body.querySelectorAll('div')).find((el) => el.textContent === 'Edge Settings') as HTMLElement | null;
}
function menuEl(): HTMLElement | null {
  return menuTitleEl()?.parentElement ?? null;
}
function isMenuOpen(): boolean {
  return !!menuTitleEl();
}

describe('PATCH-226 the Edge Settings menu renders at page level (portal)', () => {
  it('inside a transformed wrapper, the menu reaches document.body without passing through it', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { container } = await mountAndFlush(
      <div data-testid="zoomed-layer" style={{ transform: 'scale(0.8)' }}>
        <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={0.8} />
      </div>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toBe('scale(0.8)');

    openEdgeMenu(container);
    const menu = menuEl();
    expect(menu, 'Edge Settings menu rendered').not.toBeNull();

    // It reaches document.body...
    expect(document.body.contains(menu!)).toBe(true);
    // ...without passing through the transformed wrapper.
    expect(wrapper.contains(menu!)).toBe(false);
    let node: Node | null = menu!;
    let sawWrapper = false;
    while (node) {
      if (node === wrapper) sawWrapper = true;
      node = node.parentNode;
    }
    expect(sawWrapper, 'the menu must not sit under the transformed layer').toBe(false);
  });

  it('a mousedown inside the menu keeps it open; an outside mousedown closes it', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />,
    );
    openEdgeMenu(container);
    expect(isMenuOpen()).toBe(true);

    const swatch = document.body.querySelector('button.h-5.w-5') as HTMLElement | null;
    expect(swatch, 'a colour swatch is present').not.toBeNull();
    act(() => {
      swatch!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(isMenuOpen(), 'an inside mousedown must not close the menu').toBe(true);

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(isMenuOpen(), 'an outside mousedown closes the menu').toBe(false);
  });

  it('clicking a colour swatch still calls the repo upsert', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const { container } = await mountAndFlush(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} zoom={1} />,
    );
    openEdgeMenu(container);
    upsertEdgeMock.mockClear();

    const swatch = document.body.querySelector('button.h-5.w-5') as HTMLElement;
    await act(async () => {
      swatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({ id: 'e1' });
  });
});
