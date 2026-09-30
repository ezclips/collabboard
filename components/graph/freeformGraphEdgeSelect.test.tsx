// @vitest-environment jsdom
//
// PATCH-228 -- click a line to select it (halo + end handles), Delete removes
// it, drag an end onto another post to move it. Mounts the real layer with the
// repo mocked, matching the existing graph tests.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return container;
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
  document.querySelectorAll('[data-padlet-id]').forEach((n) => n.remove());
  document.querySelectorAll('[data-graph-edge-reattach-preview="true"]').forEach((n) => n.remove());
});
beforeEach(() => {
  (document as any).elementsFromPoint = vi.fn(() => []);
});

function post(id: string, x: number): Padlet {
  return {
    id,
    board_id: 'board1',
    title: id,
    content: '',
    type: 'note',
    position_x: x,
    position_y: 0,
    width: 100,
    height: 60,
    created_at: '',
    updated_at: '',
  } as Padlet;
}
const postA = post('postA', 0);
const postB = post('postB', 500);
const postC = post('postC', 1000);

function edge(): FreeformGraphEdge {
  return {
    id: 'e1',
    board_id: 'board1',
    source_post_id: 'postA',
    target_post_id: 'postB',
    relation_type: 'solid',
    direction: 'forward',
    label: null,
    style: { color: '#9ca3af' },
    created_at: '',
    updated_at: '',
  } as FreeformGraphEdge;
}

function postEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', id);
  document.body.appendChild(el);
  return el;
}

async function mountLayer(canEdit = true) {
  mockEdges = [edge()];
  const container = mount(
    <FreeformGraphLayer boardId="board1" posts={[postA, postB, postC]} zoom={1} canEdit={canEdit} />,
  );
  await act(async () => { await Promise.resolve(); });
  return container;
}

function hitPath(container: HTMLElement): SVGPathElement {
  return container.querySelector('g path[stroke="transparent"]') as SVGPathElement;
}
function selectLine(container: HTMLElement) {
  act(() => {
    hitPath(container).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
}
const halo = (container: HTMLElement) => container.querySelector('[data-graph-edge-halo="true"]');
const ends = (container: HTMLElement) => container.querySelectorAll('[data-graph-edge-end]');
const preview = () => document.querySelector('[data-graph-edge-reattach-preview="true"]');

describe('PATCH-228 line selection', () => {
  it('clicking the hit path shows the halo and two end handles', async () => {
    const container = await mountLayer();
    expect(halo(container)).toBeNull();
    expect(ends(container)).toHaveLength(0);

    selectLine(container);
    expect(halo(container)).not.toBeNull();
    expect(ends(container)).toHaveLength(2);
    expect(container.querySelector('[data-graph-edge-end="source"]')).not.toBeNull();
    expect(container.querySelector('[data-graph-edge-end="target"]')).not.toBeNull();
  });

  it('canEdit={false} shows no selection affordances', async () => {
    const container = await mountLayer(false);
    selectLine(container);
    expect(halo(container)).toBeNull();
    expect(ends(container)).toHaveLength(0);
  });

  it('a mousedown elsewhere deselects', async () => {
    const container = await mountLayer();
    selectLine(container);
    expect(halo(container)).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(halo(container)).toBeNull();
  });

  it('Escape deselects', async () => {
    const container = await mountLayer();
    selectLine(container);
    expect(halo(container)).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(halo(container)).toBeNull();
  });
});

describe('PATCH-228 Delete key', () => {
  it('Delete with a line selected deletes it through the repo', async () => {
    const container = await mountLayer();
    selectLine(container);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await Promise.resolve();
    });
    expect(deleteEdgeMock).toHaveBeenCalledWith('e1');
    expect(halo(container)).toBeNull();
  });

  it('Delete while an input has focus does nothing', async () => {
    const container = await mountLayer();
    selectLine(container);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(deleteEdgeMock).not.toHaveBeenCalled();
  });

  it('Addendum 3: the capture handler stops Delete before a bubble-phase window listener sees it', async () => {
    const container = await mountLayer();
    selectLine(container);

    // Registered in the BUBBLE phase -- exactly like useCanvasShortcuts' post
    // Delete shortcut. It must never see the key once the line handles it.
    const bubbleSpy = vi.fn();
    window.addEventListener('keydown', bubbleSpy);
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await Promise.resolve();
    });
    window.removeEventListener('keydown', bubbleSpy);

    expect(deleteEdgeMock).toHaveBeenCalledWith('e1');
    expect(bubbleSpy).not.toHaveBeenCalled();
  });

  it('Addendum 3: with an input focused the key is left alone, so the bubble listener still sees it', async () => {
    const container = await mountLayer();
    selectLine(container);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const bubbleSpy = vi.fn();
    window.addEventListener('keydown', bubbleSpy);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    window.removeEventListener('keydown', bubbleSpy);

    expect(deleteEdgeMock).not.toHaveBeenCalled();
    expect(bubbleSpy).toHaveBeenCalled();
  });
});

describe('PATCH-228 re-attach an end', () => {
  it('dragging the target end onto another post updates only that id', async () => {
    // MUTATION: an empty drop that still writes makes the next test fail.
    const container = await mountLayer();
    selectLine(container);
    const target = container.querySelector('[data-graph-edge-end="target"]') as SVGCircleElement;
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postC')]);

    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 300, clientY: 50 }));
    });
    expect(preview(), 'a re-attach preview is portalled during the drag').not.toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 50 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 1000, clientY: 50 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({
      id: 'e1',
      source_post_id: 'postA',
      target_post_id: 'postC',
      relation_type: 'solid',
      direction: 'forward',
      label: null,
    });
    expect(preview()).toBeNull();
  });

  it('dropping an end on the empty board writes nothing', async () => {
    const container = await mountLayer();
    selectLine(container);
    const target = container.querySelector('[data-graph-edge-end="target"]') as SVGCircleElement;
    (document as any).elementsFromPoint = vi.fn(() => []);

    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 300, clientY: 50 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 800, clientY: 50 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 800, clientY: 50 }));
      await Promise.resolve();
    });

    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });

  it('Addendum 4: a bubble-phase ancestor stopPropagation on pointerup does not block the write', async () => {
    const container = await mountLayer();
    selectLine(container);
    const target = container.querySelector('[data-graph-edge-end="target"]') as SVGCircleElement;
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postC')]);

    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 300, clientY: 50 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 50 }));
    });

    // A board ancestor that swallows the bubble-phase pointerup -- the live
    // defect. The layer's capture listener must already have written.
    const stopper = (event: Event) => event.stopPropagation();
    document.body.addEventListener('pointerup', stopper);
    await act(async () => {
      target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 1000, clientY: 50 }));
      await Promise.resolve();
      await Promise.resolve();
    });
    document.body.removeEventListener('pointerup', stopper);

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0][0]).toMatchObject({
      id: 'e1',
      source_post_id: 'postA',
      target_post_id: 'postC',
    });
  });

  it('Addendum 4: pointercancel ends the drag with no write', async () => {
    const container = await mountLayer();
    selectLine(container);
    const target = container.querySelector('[data-graph-edge-end="target"]') as SVGCircleElement;
    (document as any).elementsFromPoint = vi.fn(() => [postEl('postC')]);

    act(() => {
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 300, clientY: 50 }));
    });
    expect(preview()).not.toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }));
    });
    expect(preview()).toBeNull();
    expect(upsertEdgeMock).not.toHaveBeenCalled();
  });
});
