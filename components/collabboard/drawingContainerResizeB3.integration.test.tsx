// @vitest-environment jsdom
// PATCH POST-RESIZE-B3.2 -- mounted Drawing Container manual width-resize
// regression. Mounts the REAL, exported DrawingEmbeddableCard (and the REAL
// RowColumnContainerCard it renders through AutoHeightContainer) with a
// mocked excalidrawAPI/appState -- genuine pointer-event-driven coverage of
// the production code path, not a source-string-only check.
import React, { act } from 'react';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import {
  DrawingEmbeddableCard,
  ContainerResizeDrawingContext,
  ContainerResizeSelectionStore,
} from '@/components/collabboard/canvas/layouts/DrawingLayout';

vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
}));
// DrawingLayout.tsx transitively imports the real Supabase client (via
// LibraryPanel/excalidrawLibrary, unrelated to this test's coverage), which
// throws without env vars in this test environment. Mocked at the root per
// this repo's established pattern (see signedFreeformCreation.integration.test.tsx).
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({
  getExcalidrawLibrary: () => [],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let restoreOffsetWidth: (() => void) | undefined;
beforeAll(() => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const w = parseFloat(this.style.width);
      return Number.isFinite(w) ? w : 0;
    },
  });
  restoreOffsetWidth = () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original);
  };
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterAll(() => restoreOffsetWidth?.());

function padlet(id: string, type: Padlet['type'], width: number, metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id, board_id: 'board-1', title: id, content: 'content', type,
    position_x: 100, position_y: 100, width, height: 280,
    created_at: '', updated_at: '', metadata,
  };
}
function child(id: string, parentId: string, width: number): Padlet {
  return padlet(id, 'text', width, { parentId });
}

function createMockExcalidrawAPI(padletId: string, initialWidth: number, initialHeight = 280) {
  let elements: any[] = [{
    id: `el-${padletId}`, type: 'embeddable', link: `padlet://${padletId}`, isDeleted: false,
    width: initialWidth, height: initialHeight, version: 1,
  }];
  const updateBoundElements = vi.fn();
  return {
    getSceneElements: () => elements,
    updateScene: (update: any) => { if (update.elements) elements = update.elements; },
    updateBoundElements,
    _getWidth: () => elements[0].width,
  };
}

const noop = vi.fn();
const host0 = document.createElement('div');

function renderCard(padletObj: Padlet, allPadlets: Padlet[], opts: {
  excAPI: any;
  onUpdatePadletStrict?: any;
  selected?: boolean;
}) {
  const host = host0.cloneNode(false) as HTMLDivElement;
  // Drawing's resize chrome is intentionally portaled to the nearest real
  // Excalidraw root so later embeddables cannot cover it. This mounted unit
  // fixture supplies that root; the browser regression exercises the actual
  // fork-owned DOM and stacking contexts.
  host.className = 'excalidraw';
  const reactMount = document.createElement('div');
  host.append(reactMount);
  document.body.append(host);
  const root: Root = createRoot(reactMount);
  const excalidrawAPIRef = { current: opts.excAPI };
  const appStateRef = { current: { zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0, scrollX: 0, scrollY: 0 } };
  const store = new ContainerResizeSelectionStore();
  if (opts.selected) store.setSelected(padletObj.id);
  const contextValue = { store, setSelectedId: (id: string | null) => store.setSelected(id) };

  act(() => root.render(
    <ContainerResizeDrawingContext.Provider value={contextValue}>
      <DrawingEmbeddableCard
        padlet={padletObj}
        allPadlets={allPadlets}
        readOnly={false}
        excalidrawAPIRef={excalidrawAPIRef}
        appStateRef={appStateRef}
        onUpdatePadlet={noop}
        onUpdatePadletStrict={opts.onUpdatePadletStrict ?? noop}
        onAddPadlet={noop}
        canvasId="board-1"
        onUpdateChildComments={noop}
        onContextMenu={noop}
        onPadletEditRef={{ current: undefined }}
        onManualResizePreviewLock={noop}
      />
    </ContainerResizeDrawingContext.Provider>,
  ));
  return { host, root, appStateRef };
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
    button: { value: 0 },
    shiftKey: { value: false },
  });
  return event;
}
function drag(handle: HTMLElement, dx: number) {
  act(() => {
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    handle.dispatchEvent(pointerEvent('pointermove', dx, 0));
    handle.dispatchEvent(pointerEvent('pointerup', dx, 0));
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PATCH POST-RESIZE-B3.2 Drawing Container manual width resize', () => {
  it('A/B: selected root Container mounts exactly one handle; unselected mounts zero', () => {
    const container = padlet('c1', 'container', 500, { orientation: 'vertical', childPadletIds: [] });
    const selected = renderCard(container, [container], { excAPI: createMockExcalidrawAPI('c1', 500), selected: true });
    expect(selected.host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(1);
    act(() => selected.root.unmount());

    const unselected = renderCard(container, [container], { excAPI: createMockExcalidrawAPI('c1', 500), selected: false });
    expect(unselected.host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(0);
    act(() => unselected.root.unmount());
  });

  it('T: generic B2 capability remains none; child (non-Container) posts mount zero B3 handles', () => {
    const note = padlet('n1', 'text', 300);
    const { host, root } = renderCard(note, [note], { excAPI: createMockExcalidrawAPI('n1', 300), selected: true });
    expect(host.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(0);
    act(() => root.unmount());
  });

  it('E: Vertical Container minimum is exactly 360', () => {
    const container = padlet('c1', 'container', 900, { orientation: 'vertical', childPadletIds: [] });
    const excAPI = createMockExcalidrawAPI('c1', 900);
    const { host, root } = renderCard(container, [container], { excAPI, selected: true });
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
    drag(handle, -640); // 900 -> attempt 260
    expect(excAPI._getWidth()).toBe(360);
    act(() => root.unmount());
  });

  it('F/G/H/I/J: horizontal intrinsic minimum -- grow above R, shrink to R, clamp below R, child removal lowers R, empty -> 360', () => {
    const container = padlet('c1', 'container', 900, { orientation: 'horizontal', childPadletIds: ['a', 'b'] });
    const a = child('a', 'c1', 200);
    const b = child('b', 'c1', 300);
    const excAPI = createMockExcalidrawAPI('c1', 900);
    const { host, root } = renderCard(container, [container, a, b], { excAPI, selected: true });
    const getHandle = () => host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    // Discover true R by shrinking hard.
    drag(getHandle(), -3000);
    const R = excAPI._getWidth();
    expect(R).toBeGreaterThanOrEqual(360);

    // G: grow above R.
    drag(getHandle(), 300);
    expect(excAPI._getWidth()).toBe(R + 300);

    // shrink straight back to exactly R -- only possible if the grow above did NOT raise the floor.
    drag(getHandle(), -300);
    expect(excAPI._getWidth()).toBe(R);

    // H: clamp below R.
    drag(getHandle(), -50);
    expect(excAPI._getWidth()).toBe(R);

    act(() => root.unmount());

    // I/J: empty Container (no children) has no phantom minimum -- shrinks to 360.
    const emptyContainer = padlet('c2', 'container', 900, { orientation: 'horizontal', childPadletIds: [] });
    const excAPI2 = createMockExcalidrawAPI('c2', 900);
    const { host: host2, root: root2 } = renderCard(emptyContainer, [emptyContainer], { excAPI: excAPI2, selected: true });
    const handle2 = host2.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;
    drag(handle2, -640);
    expect(excAPI2._getWidth()).toBe(360);
    act(() => root2.unmount());
  });

  it('D/K/L/M/O/P: pointermove writes 0, release writes 1, width-only payload, no manualSize, membership unchanged', async () => {
    const container = padlet('c1', 'container', 500, { orientation: 'vertical', childPadletIds: [] });
    const excAPI = createMockExcalidrawAPI('c1', 500);
    const onUpdatePadletStrict = vi.fn(async (_id: string, _updates: Partial<Padlet>) => {});
    const { host, root } = renderCard(container, [container], { excAPI, onUpdatePadletStrict, selected: true });
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    act(() => {
      handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
      handle.dispatchEvent(pointerEvent('pointermove', 50, 0));
    });
    expect(onUpdatePadletStrict).not.toHaveBeenCalled(); // K: 0 writes during preview

    await act(async () => {
      handle.dispatchEvent(pointerEvent('pointerup', 50, 0));
      await Promise.resolve();
    });

    expect(onUpdatePadletStrict).toHaveBeenCalledTimes(1); // L: exactly 1 write on release
    const [id, updates] = onUpdatePadletStrict.mock.calls[0];
    expect(id).toBe('c1');
    expect(updates).toEqual({ width: 550 }); // D/M: width only
    expect(updates).not.toHaveProperty('height');
    expect(updates).not.toHaveProperty('metadata'); // O: no manualSize
    expect(updates).not.toHaveProperty('childPadletIds'); // P: membership unchanged
    expect(updates).not.toHaveProperty('parentId');

    act(() => root.unmount());
  });

  it('N: failure rollback restores the scene element to the measured starting width', async () => {
    const container = padlet('c1', 'container', 500, { orientation: 'vertical', childPadletIds: [] });
    const excAPI = createMockExcalidrawAPI('c1', 500);
    const onUpdatePadletStrict = vi.fn(async () => { throw new Error('induced failure'); });
    const { host, root } = renderCard(container, [container], { excAPI, onUpdatePadletStrict, selected: true });
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    await act(async () => {
      handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
      handle.dispatchEvent(pointerEvent('pointermove', 100, 0));
      handle.dispatchEvent(pointerEvent('pointerup', 100, 0));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(excAPI._getWidth()).toBe(500); // rolled back to the measured origin, not left at 600
    act(() => root.unmount());
  });

  it('Q: scene x/y are never touched by a width resize commit', async () => {
    const container = padlet('c1', 'container', 500, { orientation: 'vertical', childPadletIds: [] });
    const excAPI = createMockExcalidrawAPI('c1', 500);
    excAPI.getSceneElements()[0].x = 123;
    excAPI.getSceneElements()[0].y = 456;
    const onUpdatePadletStrict = vi.fn(async (_id: string, _updates: Partial<Padlet>) => {});
    const { host, root } = renderCard(container, [container], { excAPI, onUpdatePadletStrict, selected: true });
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    await act(async () => {
      handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
      handle.dispatchEvent(pointerEvent('pointermove', 50, 0));
      handle.dispatchEvent(pointerEvent('pointerup', 50, 0));
      await Promise.resolve();
    });

    expect(excAPI.getSceneElements()[0].x).toBe(123);
    expect(excAPI.getSceneElements()[0].y).toBe(456);
    act(() => root.unmount());
  });
});
