// @vitest-environment jsdom
// PATCH DRAWING-MINIMAP-A: render/interaction tests for the Drawing canvas
// navigation minimap, following the same harness convention as
// freeformMinimap.interaction.test.tsx (the Freeform minimap's own test,
// left completely untouched by this patch) -- but exercising this patch's
// own, wholly independent component and navigation module.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const panDrawingViewportByWorldDelta = vi.fn();
vi.mock('@/components/collabboard/canvas/minimap/drawingMinimapNavigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/collabboard/canvas/minimap/drawingMinimapNavigation')>();
  return {
    ...actual,
    panDrawingViewportByWorldDelta: (...args: unknown[]) => panDrawingViewportByWorldDelta(...args),
  };
});

let mockedScene: { elementRects: Array<{ x: number; y: number; width: number; height: number }>; viewportWorldRect: { x: number; y: number; width: number; height: number } | null } = {
  elementRects: [],
  viewportWorldRect: null,
};
vi.mock('@/components/collabboard/canvas/minimap/useDrawingMinimapScene', () => ({
  useDrawingMinimapScene: () => mockedScene,
}));

import DrawingMinimap from '@/components/collabboard/canvas/minimap/DrawingMinimap';
import {
  createMinimapProjection,
  getSceneDisplayBounds,
  projectWorldPoint,
} from '@/components/collabboard/canvas/minimap/drawingMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ELEMENT_RECTS = [
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 1000, y: 500, width: 200, height: 200 },
];
const VIEWPORT_RECT = { x: -100, y: -50, width: 800, height: 600 };
const BOUNDS = getSceneDisplayBounds(ELEMENT_RECTS)!;
const PROJECTION = createMinimapProjection(BOUNDS, { left: 8, top: 8, width: 160, height: 96 })!;
const RENDERED_RECT = { left: 100, top: 200, width: 352, height: 224 };

let roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
  mockedScene = { elementRects: [], viewportWorldRect: null };
  panDrawingViewportByWorldDelta.mockClear();
});

function pointerEvent(type: string, init: { clientX: number; clientY: number; pointerId?: number; button?: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId ?? 1 },
    button: { value: init.button ?? 0 },
  });
  return event;
}

function clientPoint(minimapX: number, minimapY: number) {
  return {
    clientX: RENDERED_RECT.left + minimapX * (RENDERED_RECT.width / 176),
    clientY: RENDERED_RECT.top + minimapY * (RENDERED_RECT.height / 112),
  };
}

function worldClientPoint(x: number, y: number) {
  const projected = projectWorldPoint({ x, y }, PROJECTION);
  return clientPoint(projected.x, projected.y);
}

function mountMinimap(excalidrawAPI: any = { getAppState: () => ({}), getSceneElements: () => [], updateScene: vi.fn() }) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<DrawingMinimap excalidrawAPI={excalidrawAPI} />));
  const minimap = host.querySelector<HTMLElement>('[data-drawing-minimap="true"]');
  const svg = host.querySelector<SVGSVGElement>('[data-drawing-minimap-map="true"]');
  const viewport = host.querySelector<SVGRectElement>('[data-drawing-minimap-viewport="true"]');
  if (svg) {
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({
        ...RENDERED_RECT,
        right: RENDERED_RECT.left + RENDERED_RECT.width,
        bottom: RENDERED_RECT.top + RENDERED_RECT.height,
        x: RENDERED_RECT.left,
        y: RENDERED_RECT.top,
        toJSON: () => ({}),
      }),
    });
    let capturedPointer: number | null = null;
    const setPointerCapture = vi.fn((pointerId: number) => { capturedPointer = pointerId; });
    const releasePointerCapture = vi.fn((pointerId: number) => {
      if (capturedPointer === pointerId) capturedPointer = null;
    });
    Object.defineProperties(svg, {
      setPointerCapture: { value: setPointerCapture },
      releasePointerCapture: { value: releasePointerCapture },
      hasPointerCapture: { value: (pointerId: number) => capturedPointer === pointerId },
    });
    return { host, minimap, svg, viewport, setPointerCapture, releasePointerCapture };
  }
  return { host, minimap, svg, viewport };
}

function clickAt(target: Element, svg: SVGSVGElement, point: { clientX: number; clientY: number }) {
  act(() => {
    target.dispatchEvent(pointerEvent('pointerdown', point));
    svg.dispatchEvent(pointerEvent('pointerup', point));
  });
}

describe('PATCH DRAWING-MINIMAP-B: the shell is always visible, never hidden for empty/unavailable data', () => {
  it('renders the shell when there are no scene elements but a viewport is known', () => {
    mockedScene = { elementRects: [], viewportWorldRect: VIEWPORT_RECT };
    const { minimap } = mountMinimap();
    expect(minimap).not.toBeNull();
  });

  it('renders the shell even when NEITHER elements NOR a viewport are known yet (pre-first-measurement)', () => {
    mockedScene = { elementRects: [], viewportWorldRect: null };
    const { minimap } = mountMinimap();
    expect(minimap).not.toBeNull();
  });

  it('renders the shell once at least one element exists', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { minimap } = mountMinimap();
    expect(minimap).not.toBeNull();
  });

  it('an empty drawing with a known viewport shows the viewport rectangle but no item footprints', () => {
    mockedScene = { elementRects: [], viewportWorldRect: VIEWPORT_RECT };
    const { host, viewport } = mountMinimap();
    expect(host.querySelectorAll('[data-minimap-item-index]')).toHaveLength(0);
    expect(viewport).not.toBeNull();
  });

  it('the background surface is always present, independent of scene/viewport availability', () => {
    mockedScene = { elementRects: [], viewportWorldRect: null };
    const { host } = mountMinimap();
    expect(host.querySelector('[data-drawing-minimap-surface="true"]')).not.toBeNull();
  });
});

describe('PATCH DRAWING-MINIMAP-A: scene bounds and viewport rendering', () => {
  it('renders one miniature rect per scene element', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { host } = mountMinimap();
    expect(host.querySelectorAll('[data-minimap-item-index]')).toHaveLength(ELEMENT_RECTS.length);
  });

  it('renders the viewport rectangle when a viewport rect is available', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { viewport } = mountMinimap();
    expect(viewport).not.toBeNull();
  });

  it('omits the viewport rectangle when the viewport is not yet measured', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: null };
    const { viewport } = mountMinimap();
    expect(viewport).toBeNull();
  });
});

describe('PATCH DRAWING-MINIMAP-A: click navigation', () => {
  it('scales client coordinates, inverse-projects a fitted point, and navigates from the canonical viewport center', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const api = { getAppState: () => ({}), getSceneElements: () => [], updateScene: vi.fn() };
    const { svg } = mountMinimap(api);
    const point = worldClientPoint(900, 450);
    clickAt(svg!, svg!, point);
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledTimes(1);
    const [calledApi, dx, dy] = panDrawingViewportByWorldDelta.mock.calls[0];
    expect(calledApi).toBe(api);
    const currentCenter = { x: VIEWPORT_RECT.x + VIEWPORT_RECT.width / 2, y: VIEWPORT_RECT.y + VIEWPORT_RECT.height / 2 };
    expect(dx).toBeCloseTo(900 - currentCenter.x, 6);
    expect(dy).toBeCloseTo(450 - currentCenter.y, 6);
  });

  it('ignores letterbox-only clicks (outside the fitted map area)', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { svg } = mountMinimap();
    clickAt(svg!, svg!, clientPoint(0, 0));
    expect(panDrawingViewportByWorldDelta).not.toHaveBeenCalled();
  });
});

describe('PATCH DRAWING-MINIMAP-A: viewport drag navigation', () => {
  it('captures the pointer and converts minimap movement to world-space pan deltas', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { svg, viewport, setPointerCapture } = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = clientPoint(
      (start.clientX - RENDERED_RECT.left) / (RENDERED_RECT.width / 176) + 20,
      (start.clientY - RENDERED_RECT.top) / (RENDERED_RECT.height / 112) + 10,
    );
    act(() => {
      viewport!.dispatchEvent(pointerEvent('pointerdown', start));
      svg!.dispatchEvent(pointerEvent('pointermove', moved));
    });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledWith(
      expect.anything(),
      20 / PROJECTION.scale,
      10 / PROJECTION.scale,
    );
  });

  it('sub-threshold movement remains a click candidate, resolved on pointerup', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { svg, viewport } = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = { clientX: start.clientX + 3, clientY: start.clientY };
    act(() => {
      viewport!.dispatchEvent(pointerEvent('pointerdown', start));
      svg!.dispatchEvent(pointerEvent('pointermove', moved));
    });
    expect(panDrawingViewportByWorldDelta).not.toHaveBeenCalled();
    act(() => { svg!.dispatchEvent(pointerEvent('pointerup', moved)); });
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledTimes(1);
  });

  it('over-threshold viewport motion becomes a drag and suppresses click-to-center on release', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const { svg, viewport } = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = { clientX: start.clientX + 20, clientY: start.clientY };
    act(() => {
      viewport!.dispatchEvent(pointerEvent('pointerdown', start));
      svg!.dispatchEvent(pointerEvent('pointermove', moved));
      svg!.dispatchEvent(pointerEvent('pointerup', moved));
    });
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH DRAWING-MINIMAP-A: read-only navigation', () => {
  it('navigates identically regardless of any readOnly flag -- the component takes no readOnly prop and never gates on one', () => {
    mockedScene = { elementRects: ELEMENT_RECTS, viewportWorldRect: VIEWPORT_RECT };
    const api = { getAppState: () => ({}), getSceneElements: () => [], updateScene: vi.fn() };
    const { svg } = mountMinimap(api);
    clickAt(svg!, svg!, worldClientPoint(900, 450));
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledTimes(1);
    // Navigation only ever calls updateScene via panDrawingViewportByWorldDelta
    // (mocked here) -- the component itself never calls any other API method.
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
