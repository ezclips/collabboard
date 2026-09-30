// @vitest-environment jsdom
//
// PATCH-227/230/231 -- the connect knobs' drag interaction: dashed portalled
// preview, target outline, one-write-on-a-valid-drop, four sides, and PATCH-231's
// placement on the same box the lines attach to (measureAnchorRect).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import type { Padlet } from '@/types/collabboard';
import { toast } from 'sonner';

import GraphConnectHandle from './GraphConnectHandle';
import { measureAnchorRect } from '@/lib/graph/anchorRect';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
(globalThis as any).cancelAnimationFrame = () => {};
if (!('ResizeObserver' in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const upsertEdgeMock = vi.fn(async (edge: Partial<FreeformGraphEdge>) => edge as FreeformGraphEdge);
let mockEdges: FreeformGraphEdge[] = [];

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: () => ({
    getEdges: async () => mockEdges,
    upsertEdge: upsertEdgeMock,
  }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/graph/anchorRect', () => ({
  measureAnchorRect: vi.fn(() => ({ left: 0, top: 0, width: 100, height: 60, usedVisualAnchor: false })),
}));

const toastMock = vi.mocked(toast);
const measureMock = vi.mocked(measureAnchorRect);

const postA = {
  id: 'postA',
  board_id: 'board1',
  title: 'A',
  content: '',
  type: 'note',
  position_x: 0,
  position_y: 0,
  width: 100,
  height: 60,
  created_at: '',
  updated_at: '',
} as unknown as Padlet;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  upsertEdgeMock.mockClear();
  vi.clearAllMocks();
  mockEdges = [];
  document.querySelectorAll('[data-graph-connect-preview="true"]').forEach((n) => n.remove());
  document.body.querySelectorAll('[data-padlet-id]').forEach((n) => n.remove());
});

beforeEach(() => {
  (document as any).elementsFromPoint = vi.fn(() => []);
});

function postEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', id);
  // Attached so the component's `[data-padlet-id]` lookup for the outline finds
  // it, exactly as a real post on the board would be.
  document.body.appendChild(el);
  return el;
}

// The component is mounted inside a post wrapper, as on the board: its knobs are
// placed relative to `[data-padlet-id]`.
function render(props: Partial<React.ComponentProps<typeof GraphConnectHandle>> = {}) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-padlet-id', 'postA');
  const container = document.createElement('div');
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GraphConnectHandle
        boardId="board1"
        postId="postA"
        post={postA}
        isTopLevel={(id) => id === 'postB'}
        {...props}
      />,
    );
  });
  mounted.push({ root, container });
  return container;
}

function dotOf(container: HTMLElement): HTMLElement {
  // PATCH-230/231: four knobs; the original single-dot tests target the right one.
  return container.querySelector('[data-graph-connect-side="right"]') as HTMLElement;
}

function dotBySide(container: HTMLElement, side: string): HTMLElement {
  return container.querySelector(`[data-graph-connect-side="${side}"]`) as HTMLElement;
}

function pointerDown(el: HTMLElement, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
}
function pointerMove(el: HTMLElement, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
}
async function pointerUp(el: HTMLElement, x: number, y: number) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

const preview = () => document.querySelector('[data-graph-connect-preview="true"]');
const outline = () => document.querySelector('[data-graph-connect-preview="true"] rect');

describe('PATCH-227 GraphConnectHandle', () => {
  it('drags to a valid post: one upsertEdge with the right ids/direction/style, and a portalled preview', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const onEdgesChanged = vi.fn();
    const container = render({ onEdgesChanged });
    const dot = dotOf(container);

    pointerDown(dot, 0, 0);
    expect(preview(), 'preview is portalled during the drag').not.toBeNull();
    pointerMove(dot, 100, 100);
    expect(outline(), 'a valid target is outlined').not.toBeNull();
    await pointerUp(dot, 100, 100);

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({
      board_id: 'board1',
      source_post_id: 'postA',
      target_post_id: 'postB',
      relation_type: 'solid',
      direction: 'forward',
      label: null,
      style: { color: '#9ca3af' },
    });
    expect(typeof (upsertEdgeMock.mock.calls[0][0] as FreeformGraphEdge).id).toBe('string');
    expect(onEdgesChanged).toHaveBeenCalledTimes(1);
    expect(preview(), 'preview removed after the drop').toBeNull();
  });

  it('a drop on empty board writes nothing', async () => {
    (document as any).elementsFromPoint = vi.fn(() => []);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    expect(outline()).toBeNull();
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });

  it('a drop on the source writes nothing', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postA')]);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });

  it('an already-connected pair writes nothing and says so', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    mockEdges = [{
      id: 'e1', board_id: 'board1', source_post_id: 'postB', target_post_id: 'postA',
      relation_type: 'solid', direction: 'forward', label: null, style: null,
      created_at: '', updated_at: '',
    } as FreeformGraphEdge];
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('These posts are already connected.');
  });

  it('Escape during the drag cancels, and the preview is removed', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const container = render();
    const dot = dotOf(container);
    pointerDown(dot, 0, 0);
    expect(preview()).not.toBeNull();

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(preview()).toBeNull();

    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });
});

describe('PATCH-230 connect dots on all four sides', () => {
  it('renders a dot on each of the four sides', () => {
    const container = render();
    const dots = Array.from(container.querySelectorAll('[data-graph-connect-handle="true"]'));
    expect(dots).toHaveLength(4);
    expect(dots.map((d) => d.getAttribute('data-graph-connect-side'))).toEqual([
      'top',
      'right',
      'bottom',
      'left',
    ]);
    for (const dot of dots) {
      expect(dot.getAttribute('title')).toBe('Drag to connect');
      expect(dot.getAttribute('aria-label')).toBe('Drag to connect to another post');
    }
  });

  it('a drag from the top dot writes one edge to the dropped-on post', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const container = render();
    const dot = dotBySide(container, 'top');
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({ source_post_id: 'postA', target_post_id: 'postB' });
  });

  it('a drag from the left dot writes one edge to the dropped-on post', async () => {
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postB')]);
    const container = render();
    const dot = dotBySide(container, 'left');
    pointerDown(dot, 0, 0);
    pointerMove(dot, 100, 100);
    await pointerUp(dot, 100, 100);
    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({ source_post_id: 'postA', target_post_id: 'postB' });
  });

  it("the preview line starts at the pressed dot's centre", () => {
    const container = render();
    const dot = dotBySide(container, 'top');
    dot.getBoundingClientRect = () => ({
      left: 100, top: 200, width: 14, height: 14,
      right: 114, bottom: 214, x: 100, y: 200, toJSON: () => ({}),
    } as DOMRect);

    pointerDown(dot, 500, 500);
    const line = document.querySelector('[data-graph-connect-preview="true"] line')!;
    expect(line.getAttribute('x1')).toBe('107');
    expect(line.getAttribute('y1')).toBe('207');
  });
});

describe('PATCH-231 knobs sit on the measured anchor box', () => {
  it('places the knob container at measureAnchorRect\'s box, divided by the world scale', () => {
    // MUTATION: using the wrapper box (ignoring measureAnchorRect) makes this fail.
    measureMock.mockReturnValueOnce({ left: 100, top: 200, width: 80, height: 40, usedVisualAnchor: true });

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-padlet-id', 'postA');
    wrapper.getBoundingClientRect = () => ({
      left: 90, top: 190, width: 160, height: 120,
      right: 250, bottom: 310, x: 90, y: 190, toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(wrapper, 'offsetWidth', { value: 200, configurable: true });
    const container = document.createElement('div');
    wrapper.appendChild(container);
    document.body.appendChild(wrapper);
    const root = createRoot(container);
    act(() => {
      root.render(<GraphConnectHandle boardId="board1" postId="postA" post={postA} isTopLevel={() => true} />);
    });
    mounted.push({ root, container });

    const box = container.querySelector('[data-graph-connect-knobs="true"]') as HTMLElement;
    expect(box).not.toBeNull();
    // scale = 160 / 200 = 0.8
    expect(box.style.left).toBe('12.5px');
    expect(box.style.top).toBe('12.5px');
    expect(box.style.width).toBe('100px');
    expect(box.style.height).toBe('50px');
  });

  it('renders nothing until the first measurement', () => {
    const originalRaf = (globalThis as any).requestAnimationFrame;
    let pending: FrameRequestCallback | null = null;
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { pending = cb; return 0; };
    try {
      const container = render();
      expect(container.querySelector('[data-graph-connect-knobs="true"]')).toBeNull();
      expect(container.querySelectorAll('[data-graph-connect-handle="true"]')).toHaveLength(0);

      act(() => { pending?.(0); });
      expect(container.querySelector('[data-graph-connect-knobs="true"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-graph-connect-handle="true"]')).toHaveLength(4);
    } finally {
      (globalThis as any).requestAnimationFrame = originalRaf;
    }
  });

  it('draws four small filled half-knobs with the right sizes', () => {
    const container = render();
    const knobs = Array.from(container.querySelectorAll('[data-graph-connect-knob="true"]')) as HTMLElement[];
    expect(knobs).toHaveLength(4);
    const bySide = (side: string) => knobs.find((k) => k.getAttribute('data-graph-connect-knob-side') === side)!;
    const sizes: Record<string, [string, string]> = {
      top: ['12px', '6px'],
      bottom: ['12px', '6px'],
      left: ['6px', '12px'],
      right: ['6px', '12px'],
    };
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const k = bySide(side);
      expect(['rgb(99, 102, 241)', '#6366f1']).toContain(k.style.backgroundColor);
      expect(k.style.width).toBe(sizes[side][0]);
      expect(k.style.height).toBe(sizes[side][1]);
      expect(k.className).not.toContain('border');
    }
  });
});
