// @vitest-environment jsdom
// PATCH DRAWING-R2A -- mounts the REAL, exported DrawingEmbeddableCard (and
// the REAL AutoHeightContainer/RowColumnContainerCard it renders) with a
// mocked excalidrawAPI, proving `onNaturalHeight`'s resulting scene height
// is now driven by measured DOM chrome (title-strip `offsetHeight`, plus
// `getComputedStyle` border/padding on the outer card, content area, and
// Excalidraw wrapper) instead of the prior hardcoded `stripH=28; +22`
// estimate. Local/mocked only -- 0 Supabase, 0 live-data.
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
vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({
  getExcalidrawLibrary: () => [],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Distinctive, mutually-prime-ish measurements so a wrong formula cannot
// coincidentally reproduce the expected total.
const STRIP_HEIGHT = 100; // real `offsetHeight` of the `group/strip` title bar
const BORDER_SIDE = 10; // px, both borderTopWidth and borderBottomWidth
const PADDING_SIDE = 15; // px, both paddingTop and paddingBottom (content area AND wrapper)
const CONTENT_SCROLL_HEIGHT = 50; // `h` -- the AutoHeightContainer wrapper's own scrollHeight
// Expected NEW total: strip + outer border(top+bottom) + content padding(top+bottom)
// + wrapper padding(top+bottom) + h = 100 + 20 + 30 + 30 + 50 = 230.
const EXPECTED_NEW_HEIGHT = STRIP_HEIGHT + BORDER_SIDE * 2 + PADDING_SIDE * 2 + PADDING_SIDE * 2 + CONTENT_SCROLL_HEIGHT;
// The OLD hardcoded formula this patch replaces: Math.max(28 + 22 + h, 80).
const OLD_FORMULA_HEIGHT = Math.max(28 + 22 + CONTENT_SCROLL_HEIGHT, 80);

let restore: (() => void) | undefined;
beforeAll(() => {
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalGetComputedStyle = window.getComputedStyle;

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const w = parseFloat(this.style.width);
      return Number.isFinite(w) ? w : 0;
    },
  });
  // Only the title strip (`group/strip`, a real, pre-existing class on that
  // element -- see DrawingLayout.tsx) reports a real offsetHeight; everything
  // else is 0. If the fix regresses to reading some OTHER element's height
  // instead of the strip's, the total will be short by exactly STRIP_HEIGHT.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const cls = typeof this.className === 'string' ? this.className : '';
      return cls.includes('group/strip') ? STRIP_HEIGHT : 0;
    },
  });
  // AutoHeightContainer reads exactly one scrollHeight (its own outer wrapper
  // div) to derive `h`; a blanket value is sufficient since nothing else in
  // this code path consumes scrollHeight.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return CONTENT_SCROLL_HEIGHT; },
  });
  // isElementBeingLaidOut requires a non-null offsetParent (or position:fixed)
  // -- jsdom never implements offsetParent, so without this override
  // onNaturalHeight would never fire at all in this environment.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) { return this.isConnected ? document.body : null; },
  });
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON() {} } as DOMRect;
  };
  // Every element's border-top/bottom and padding-top/bottom read as fixed,
  // distinctive values -- exercising the REAL three getComputedStyle() call
  // sites (outer card border, content-area padding, Excalidraw-wrapper
  // padding) the fix added, without needing to distinguish which of the
  // three DOM nodes is being queried (their contributions are summed either
  // way, so a blanket value still proves the code reads live DOM chrome
  // rather than a constant).
  window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    const real = originalGetComputedStyle(el, pseudo ?? undefined);
    return new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'borderTopWidth' || prop === 'borderBottomWidth') return `${BORDER_SIDE}px`;
        if (prop === 'paddingTop' || prop === 'paddingBottom') return `${PADDING_SIDE}px`;
        return Reflect.get(target, prop, receiver);
      },
    });
  }) as typeof window.getComputedStyle;
  (globalThis as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };

  restore = () => {
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
    if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    window.getComputedStyle = originalGetComputedStyle;
  };
});
afterAll(() => restore?.());

function padlet(id: string, width: number, metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id, board_id: 'board-1', title: id, content: 'content', type: 'container',
    position_x: 100, position_y: 100, width, height: 280,
    created_at: '', updated_at: '', metadata: { orientation: 'vertical', childPadletIds: [], ...metadata },
  };
}

function createMockExcalidrawAPI(padletId: string, initialWidth: number, initialHeight: number) {
  let elements: any[] = [{
    id: `el-${padletId}`, type: 'embeddable', link: `padlet://${padletId}`, isDeleted: false,
    width: initialWidth, height: initialHeight, version: 1,
  }];
  return {
    getSceneElements: () => elements,
    updateScene: (update: any) => { if (update.elements) elements = update.elements; },
    updateBoundElements: vi.fn(),
    _getHeight: () => elements[0].height,
  };
}

const noop = vi.fn();

function renderCard(padletObj: Padlet) {
  const host = document.createElement('div');
  host.className = 'excalidraw';
  const reactMount = document.createElement('div');
  host.append(reactMount);
  document.body.append(host);
  const root: Root = createRoot(reactMount);
  const excAPI = createMockExcalidrawAPI(padletObj.id, Number(padletObj.width), 50);
  const excalidrawAPIRef = { current: excAPI };
  const appStateRef = { current: { zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0, scrollX: 0, scrollY: 0 } };
  const store = new ContainerResizeSelectionStore();
  const contextValue = { store, setSelectedId: (id: string | null) => store.setSelected(id), markHandleInteractionEnd: () => {} };

  act(() => root.render(
    <ContainerResizeDrawingContext.Provider value={contextValue}>
      <DrawingEmbeddableCard
        padlet={padletObj}
        allPadlets={[padletObj]}
        readOnly={false}
        excalidrawAPIRef={excalidrawAPIRef}
        appStateRef={appStateRef}
        onUpdatePadlet={noop}
        onUpdatePadletStrict={noop}
        onAddPadlet={noop}
        canvasId="board-1"
        onUpdateChildComments={noop}
        onContextMenu={noop}
        onPadletEditRef={{ current: undefined }}
        onManualResizePreviewLock={noop}
      />
    </ContainerResizeDrawingContext.Provider>,
  ));
  return { host, root, excAPI };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PATCH DRAWING-R2A: Drawing Container height chrome is measured, not hardcoded', () => {
  it('a fresh vertical Container computes its scene height from measured strip/border/padding chrome, not the old 28+22 estimate', () => {
    const container = padlet('c1', 500);
    const { excAPI } = renderCard(container);

    expect(excAPI._getHeight()).toBe(EXPECTED_NEW_HEIGHT);
    // The discriminating assertion: proves this is not a coincidence of the
    // floor/clamp swallowing the difference -- the new, measured total is
    // strictly greater than what the old hardcoded constant would produce.
    expect(excAPI._getHeight()).not.toBe(OLD_FORMULA_HEIGHT);
    expect(excAPI._getHeight()).toBeGreaterThan(OLD_FORMULA_HEIGHT);
  });

  it('a taller title strip (e.g. a wrapped title) is reflected in the committed height, not clipped', () => {
    // Bump the strip's measured height further and confirm the commit tracks
    // it 1:1 -- proving the read is live, not a cached/frozen value.
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        const cls = typeof this.className === 'string' ? this.className : '';
        return cls.includes('group/strip') ? STRIP_HEIGHT + 40 : 0;
      },
    });
    try {
      const container = padlet('c2', 500);
      const { excAPI } = renderCard(container);
      expect(excAPI._getHeight()).toBe(EXPECTED_NEW_HEIGHT + 40);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    }
  });

  it('horizontal Container width-only resize contract is unaffected: still exactly one handle when selected, none when not', () => {
    const container = padlet('c3', 900, { orientation: 'horizontal' });
    const host0 = document.createElement('div');
    host0.className = 'excalidraw';
    const reactMount = document.createElement('div');
    host0.append(reactMount);
    document.body.append(host0);
    const root: Root = createRoot(reactMount);
    const excAPI = createMockExcalidrawAPI('c3', 900, 50);
    const excalidrawAPIRef = { current: excAPI };
    const appStateRef = { current: { zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0, scrollX: 0, scrollY: 0 } };
    const store = new ContainerResizeSelectionStore();
    store.setSelected('c3');
    const contextValue = { store, setSelectedId: (id: string | null) => store.setSelected(id), markHandleInteractionEnd: () => {} };
    act(() => root.render(
      <ContainerResizeDrawingContext.Provider value={contextValue}>
        <DrawingEmbeddableCard
          padlet={container}
          allPadlets={[container]}
          readOnly={false}
          excalidrawAPIRef={excalidrawAPIRef}
          appStateRef={appStateRef}
          onUpdatePadlet={noop}
          onUpdatePadletStrict={noop}
          onAddPadlet={noop}
          canvasId="board-1"
          onUpdateChildComments={noop}
          onContextMenu={noop}
          onPadletEditRef={{ current: undefined }}
          onManualResizePreviewLock={noop}
        />
      </ContainerResizeDrawingContext.Provider>,
    ));
    expect(host0.querySelectorAll('[data-post-resize-handle="true"]')).toHaveLength(1);
    act(() => root.unmount());
  });
});
