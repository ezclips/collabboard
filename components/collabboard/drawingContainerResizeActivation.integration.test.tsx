// @vitest-environment jsdom
// PATCH DRAWING-R2B -- mounts the REAL, exported DrawingEmbeddableCard with a
// mocked excalidrawAPI and drives GENUINE pointer events, proving the Drawing
// Container's resize handle can now be activated in ONE gesture (hover ->
// pointerdown straight on the grip selects AND begins the resize) without the
// handle ever becoming permanently visible. Local/mocked only -- 0 Supabase,
// 0 live-data.
//
// Event-model note: React does not listen for native `pointerenter`/
// `pointerleave` (they do not bubble); it SYNTHESIZES onPointerEnter/
// onPointerLeave from native `pointerover`/`pointerout` plus their
// relatedTarget. These tests therefore dispatch over/out -- dispatching
// enter/leave directly would silently no-op and prove nothing.
import React, { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({ getExcalidrawLibrary: () => [] }));

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
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterAll(() => restoreOffsetWidth?.());

function padlet(id: string, width: number, metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id, board_id: 'board-1', title: id, content: 'content', type: 'container',
    position_x: 100, position_y: 100, width, height: 280,
    created_at: '', updated_at: '',
    metadata: { orientation: 'vertical', childPadletIds: [], ...metadata },
  };
}

function createMockExcalidrawAPI(padletId: string, initialWidth: number) {
  let elements: any[] = [{
    id: `el-${padletId}`, type: 'embeddable', link: `padlet://${padletId}`, isDeleted: false,
    width: initialWidth, height: 280, version: 1,
  }];
  return {
    getSceneElements: () => elements,
    updateScene: (update: any) => { if (update.elements) elements = update.elements; },
    updateBoundElements: vi.fn(),
    _getWidth: () => elements[0].width,
  };
}

const noop = vi.fn();

function renderCard(padletObj: Padlet, opts: {
  selected?: boolean;
  readOnly?: boolean;
  onUpdatePadletStrict?: any;
} = {}) {
  const host = document.createElement('div');
  host.className = 'excalidraw';
  const reactMount = document.createElement('div');
  host.append(reactMount);
  document.body.append(host);
  const root: Root = createRoot(reactMount);
  const excAPI = createMockExcalidrawAPI(padletObj.id, Number(padletObj.width));
  const excalidrawAPIRef = { current: excAPI };
  const appStateRef = { current: { zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0, scrollX: 0, scrollY: 0 } };
  const store = new ContainerResizeSelectionStore();
  if (opts.selected) store.setSelected(padletObj.id);
  const contextValue = {
    store,
    setSelectedId: (id: string | null) => store.setSelected(id),
    markHandleInteractionEnd: () => {},
  };

  act(() => root.render(
    <ContainerResizeDrawingContext.Provider value={contextValue}>
      <DrawingEmbeddableCard
        padlet={padletObj}
        allPadlets={[padletObj]}
        readOnly={!!opts.readOnly}
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

  const card = () => host.querySelector<HTMLElement>(`[data-padlet-id="${padletObj.id}"]`)!;
  const handle = () => host.querySelector<HTMLElement>('[data-post-resize-handle="true"]');
  const handleCount = () => host.querySelectorAll('[data-post-resize-handle="true"]').length;
  return { host, root, excAPI, store, card, handle, handleCount };
}

function pointerEvent(type: string, clientX: number, clientY: number, relatedTarget: EventTarget | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
    button: { value: 0 },
    shiftKey: { value: false },
    relatedTarget: { value: relatedTarget },
  });
  return event;
}

/** Pointer moves onto `el` from `from` (null = from outside the document). */
function pointerOver(el: HTMLElement, from: EventTarget | null = null) {
  act(() => { el.dispatchEvent(pointerEvent('pointerover', 0, 0, from)); });
}
/** Pointer moves off `el` toward `to` (null = out of the document entirely). */
function pointerOut(el: HTMLElement, to: EventTarget | null = null) {
  act(() => { el.dispatchEvent(pointerEvent('pointerout', 0, 0, to)); });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PATCH DRAWING-R2B: direct Container resize activation', () => {
  it('1: unselected and un-hovered mounts ZERO handles (no permanent chrome)', () => {
    const { handleCount, root } = renderCard(padlet('c1', 500));
    expect(handleCount()).toBe(0);
    act(() => root.unmount());
  });

  it('2: hovering the card reveals exactly one handle; leaving the region hides it again', () => {
    const { card, handleCount, root } = renderCard(padlet('c1', 500));
    expect(handleCount()).toBe(0);

    pointerOver(card());
    expect(handleCount()).toBe(1);

    // Leaving to somewhere outside both the card and the resize chrome.
    pointerOut(card(), document.body);
    expect(handleCount()).toBe(0);

    act(() => root.unmount());
  });

  it('3/4: pointerdown straight on the hovered handle selects the Container in that SAME gesture (no title-strip click first)', () => {
    const { card, handle, store, root } = renderCard(padlet('c1', 500));
    expect(store.getSnapshot()).toBeNull();

    pointerOver(card());
    const grip = handle()!;
    expect(grip).toBeTruthy();

    act(() => { grip.dispatchEvent(pointerEvent('pointerdown', 0, 0)); });

    // Selection claimed by the same pointerdown that starts the resize.
    expect(store.getSnapshot()).toBe('c1');
    act(() => root.unmount());
  });

  it('5: a pointerleave mid-drag (dragging past the card edge) does NOT unmount the handle, and the resize still commits', async () => {
    // Typed to DrawingEmbeddableCard's real onUpdatePadletStrict signature
    // ((id, updates) => Promise<void>) so mock.calls entries are the actual
    // two-argument tuple -- an untyped `vi.fn(async () => {})` infers a
    // zero-argument call tuple and makes calls[0][1] a TS2493 error.
    const onUpdatePadletStrict = vi.fn(async (_id: string, _updates: Partial<Padlet>) => {});
    const { card, handle, handleCount, excAPI, root } = renderCard(padlet('c1', 500), { onUpdatePadletStrict });

    pointerOver(card());
    const grip = handle()!;

    act(() => { grip.dispatchEvent(pointerEvent('pointerdown', 0, 0)); });
    // Setting pointer capture and dragging beyond the card's own edge both
    // fire a genuine pointerleave on the card -- the exact regression this
    // patch must not reintroduce.
    pointerOut(card(), document.body);
    expect(handleCount()).toBe(1);

    await act(async () => {
      grip.dispatchEvent(pointerEvent('pointermove', 120, 0));
      grip.dispatchEvent(pointerEvent('pointerup', 120, 0));
      await Promise.resolve();
    });

    expect(excAPI._getWidth()).toBe(620);
    expect(onUpdatePadletStrict).toHaveBeenCalledTimes(1);
    expect(onUpdatePadletStrict.mock.calls[0][1]).toEqual({ width: 620 }); // 8: width-only
    act(() => root.unmount());
  });

  it('5b: crossing from the card onto the resize chrome itself never unmounts it (no hover flicker across the portal boundary)', () => {
    const { card, handle, handleCount, root } = renderCard(padlet('c1', 500));

    pointerOver(card());
    const chrome = handle()!.parentElement!;

    // The handle is portaled OUTSIDE the card, so this is a real
    // pointerleave on the card -- but the pointer is still inside the
    // logical resize region.
    pointerOut(card(), chrome);
    expect(handleCount()).toBe(1);

    act(() => root.unmount());
  });

  it('6: an already-selected Container keeps its handle with no hover at all (post-resize state)', () => {
    const { handleCount, card, root } = renderCard(padlet('c1', 500), { selected: true });
    expect(handleCount()).toBe(1);
    pointerOut(card(), document.body);
    expect(handleCount()).toBe(1);
    act(() => root.unmount());
  });

  it('10: read-only and locked Containers expose NO handle even when hovered', () => {
    const readOnlyCard = renderCard(padlet('c1', 500), { readOnly: true });
    pointerOver(readOnlyCard.card());
    expect(readOnlyCard.handleCount()).toBe(0);
    act(() => readOnlyCard.root.unmount());

    const lockedCard = renderCard(padlet('c2', 500, { isLocked: true }));
    pointerOver(lockedCard.card());
    expect(lockedCard.handleCount()).toBe(0);
    act(() => lockedCard.root.unmount());

    // Even an explicitly SELECTED locked Container stays inert.
    const lockedSelected = renderCard(padlet('c3', 500, { isLocked: true }), { selected: true });
    pointerOver(lockedSelected.card());
    expect(lockedSelected.handleCount()).toBe(0);
    act(() => lockedSelected.root.unmount());
  });

  it('8: hover-activated resize honours the 360 vertical minimum (width-only contract unchanged)', () => {
    const { card, handle, excAPI, root } = renderCard(padlet('c1', 900));
    pointerOver(card());
    const grip = handle()!;
    act(() => {
      grip.dispatchEvent(pointerEvent('pointerdown', 0, 0));
      grip.dispatchEvent(pointerEvent('pointermove', -640, 0));
      grip.dispatchEvent(pointerEvent('pointerup', -640, 0));
    });
    expect(excAPI._getWidth()).toBe(360);
    act(() => root.unmount());
  });

  it('non-Container posts gain no hover handle (scope unchanged)', () => {
    const note: Padlet = {
      id: 'n1', board_id: 'board-1', title: 'n1', content: 'content', type: 'text',
      position_x: 0, position_y: 0, width: 300, height: 200,
      created_at: '', updated_at: '', metadata: {},
    };
    const { card, handleCount, root } = renderCard(note);
    pointerOver(card());
    expect(handleCount()).toBe(0);
    act(() => root.unmount());
  });
});
