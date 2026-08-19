// @vitest-environment jsdom
// PATCH DRAWING-MINIMAP-C: DrawingNavigationControl -- the combined
// zoom-row + minimap shell -- following the same harness convention as
// freeformNavigationControl.test.tsx (the Freeform control's own test, left
// completely untouched by this patch) but exercising this patch's own,
// wholly independent Drawing component.
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
  elementRects: [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 1000, y: 500, width: 200, height: 200 },
  ],
  viewportWorldRect: { x: -100, y: -50, width: 800, height: 600 },
};
vi.mock('@/components/collabboard/canvas/minimap/useDrawingMinimapScene', () => ({
  useDrawingMinimapScene: () => mockedScene,
}));

import DrawingNavigationControl from '@/components/collabboard/canvas/minimap/DrawingNavigationControl';
import {
  createMinimapProjection,
  getSceneDisplayBounds,
  projectWorldPoint,
} from '@/components/collabboard/canvas/minimap/drawingMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOUNDS = getSceneDisplayBounds(mockedScene.elementRects)!;
const PROJECTION = createMinimapProjection(BOUNDS, { left: 8, top: 8, width: 160, height: 96 })!;
const RENDERED_RECT = { left: 100, top: 300, width: 176, height: 112 };

let roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
  mockedScene = {
    elementRects: [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 1000, y: 500, width: 200, height: 200 },
    ],
    viewportWorldRect: { x: -100, y: -50, width: 800, height: 600 },
  };
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

function mount(overrides: Partial<{ canvasZoom: number; excalidrawAPI: any }> = {}) {
  const handleZoomOut = vi.fn();
  const handleZoomReset = vi.fn();
  const handleZoomIn = vi.fn();
  const excalidrawAPI = overrides.excalidrawAPI ?? { getAppState: () => ({}), getSceneElements: () => [], updateScene: vi.fn() };
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <DrawingNavigationControl
      canvasZoom={overrides.canvasZoom ?? 1}
      handleZoomOut={handleZoomOut}
      handleZoomReset={handleZoomReset}
      handleZoomIn={handleZoomIn}
      excalidrawAPI={excalidrawAPI}
    />,
  ));
  return { host, handleZoomOut, handleZoomReset, handleZoomIn, excalidrawAPI, root };
}

function wireSvgRect(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('[data-drawing-minimap-map="true"]');
  if (!svg) return null;
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({
      ...RENDERED_RECT,
      right: RENDERED_RECT.left + RENDERED_RECT.width,
      bottom: RENDERED_RECT.top + RENDERED_RECT.height,
      x: RENDERED_RECT.left,
      y: RENDERED_RECT.top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
  let captured: number | null = null;
  Object.defineProperties(svg, {
    setPointerCapture: { value: vi.fn((id: number) => { captured = id; }), configurable: true },
    releasePointerCapture: { value: vi.fn((id: number) => { if (captured === id) captured = null; }), configurable: true },
    hasPointerCapture: { value: (id: number) => captured === id, configurable: true },
  });
  return svg;
}

describe('PATCH DRAWING-MINIMAP-C: composition -- one combined panel', () => {
  it('renders exactly one combined shell, with the zoom row and the minimap both inside it', () => {
    const { host } = mount();
    const shells = host.querySelectorAll('[data-drawing-navigation-control="true"]');
    expect(shells).toHaveLength(1);
    const shell = shells[0];
    expect(shell.querySelector('[data-drawing-navigation-header="true"]')).not.toBeNull();
    expect(shell.querySelector('[data-drawing-minimap="true"]')).not.toBeNull();
  });

  it('the minimap sits directly under the header with no other element between them (no gap)', () => {
    const { host } = mount();
    const header = host.querySelector('[data-drawing-navigation-header="true"]')!;
    const slot = host.querySelector('[data-drawing-navigation-minimap-slot="true"]')!;
    expect(header.nextElementSibling).toBe(slot);
    expect(slot.querySelector('[data-drawing-minimap="true"]')).not.toBeNull();
  });

  it('the header row renders exactly 4 buttons: collapse toggle, minus, percentage, plus', () => {
    const { host } = mount();
    const header = host.querySelector('[data-drawing-navigation-header="true"]')!;
    expect(header.querySelectorAll('button')).toHaveLength(4);
  });
});

describe('PATCH DRAWING-MINIMAP-C: collapse/expand', () => {
  it('defaults expanded -- minimap visible on first mount', () => {
    const { host } = mount();
    expect(host.querySelector('[data-drawing-minimap="true"]')).not.toBeNull();
  });

  it('collapsing hides the minimap entirely (unmounted, not merely CSS-hidden)', () => {
    const { host } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.querySelector('[data-drawing-minimap="true"]')).toBeNull();
    expect(host.querySelector('[data-drawing-navigation-minimap-slot="true"]')).toBeNull();
  });

  it('collapsed state still shows the compact zoom row', () => {
    const { host } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const header = host.querySelector('[data-drawing-navigation-header="true"]')!;
    expect(header.querySelectorAll('button')).toHaveLength(4);
  });

  it('expanding again restores the minimap', () => {
    const { host } = mount();
    const toggle = () => host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"], [aria-label="Show minimap"]')!;
    act(() => { toggle().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.querySelector('[data-drawing-minimap="true"]')).toBeNull();
    act(() => { toggle().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.querySelector('[data-drawing-minimap="true"]')).not.toBeNull();
  });
});

describe('PATCH DRAWING-MINIMAP-C: zoom controls -- reused, not reimplemented', () => {
  it('minus button calls the passed handleZoomOut, unmodified', () => {
    const { host, handleZoomOut, handleZoomReset, handleZoomIn } = mount();
    const minus = host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!;
    act(() => { minus.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(handleZoomOut).toHaveBeenCalledTimes(1);
    expect(handleZoomReset).not.toHaveBeenCalled();
    expect(handleZoomIn).not.toHaveBeenCalled();
  });

  it('plus button calls the passed handleZoomIn, unmodified', () => {
    const { host, handleZoomIn } = mount();
    const plus = host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
    act(() => { plus.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(handleZoomIn).toHaveBeenCalledTimes(1);
  });

  it('percentage button calls the passed handleZoomReset, unmodified', () => {
    const { host, handleZoomReset } = mount();
    const pct = host.querySelector<HTMLButtonElement>('[aria-label="Reset zoom"]')!;
    act(() => { pct.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(handleZoomReset).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0.2, '20%'],
    [0.4, '40%'],
    [1, '100%'],
    [1.5, '150%'],
  ])('shows canvasZoom=%s as %s', (canvasZoom, expected) => {
    const { host } = mount({ canvasZoom });
    const pct = host.querySelector<HTMLButtonElement>('[aria-label="Reset zoom"]')!;
    expect(pct.textContent).toBe(expected);
  });

  it('zoom buttons keep working while the minimap is collapsed', () => {
    const { host, handleZoomIn } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const plus = host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
    act(() => { plus.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(handleZoomIn).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH DRAWING-MINIMAP-C: navigation preserved through the embedded wrapper', () => {
  it('click navigation still works, calling panDrawingViewportByWorldDelta with the SAME excalidrawAPI prop', () => {
    const excalidrawAPI = { getAppState: () => ({}), getSceneElements: () => [], updateScene: vi.fn() };
    const { host } = mount({ excalidrawAPI });
    const svg = wireSvgRect(host)!;
    const point = worldClientPoint(900, 450);
    act(() => {
      svg.dispatchEvent(pointerEvent('pointerdown', point));
      svg.dispatchEvent(pointerEvent('pointerup', point));
    });
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledTimes(1);
    expect(panDrawingViewportByWorldDelta.mock.calls[0][0]).toBe(excalidrawAPI);
  });

  it('viewport drag navigation still works', () => {
    const { host } = mount();
    const svg = wireSvgRect(host)!;
    const viewport = host.querySelector<SVGRectElement>('[data-drawing-minimap-viewport="true"]')!;
    const start = worldClientPoint(300, 250);
    const moved = clientPoint(
      (start.clientX - RENDERED_RECT.left) / (RENDERED_RECT.width / 176) + 20,
      (start.clientY - RENDERED_RECT.top) / (RENDERED_RECT.height / 112) + 10,
    );
    act(() => {
      viewport.dispatchEvent(pointerEvent('pointerdown', start));
      svg.dispatchEvent(pointerEvent('pointermove', moved));
    });
    expect(panDrawingViewportByWorldDelta).toHaveBeenCalledWith(
      expect.anything(),
      20 / PROJECTION.scale,
      10 / PROJECTION.scale,
    );
  });

  it('event isolation preserved -- mousedown/click on the shell do not bubble to the canvas beneath', () => {
    const { host } = mount();
    let bubbled = 0;
    const onMouseDown = () => { bubbled += 1; };
    document.body.addEventListener('mousedown', onMouseDown);
    const shell = host.querySelector('[data-drawing-navigation-control="true"]')!;
    act(() => { shell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    document.body.removeEventListener('mousedown', onMouseDown);
    expect(bubbled).toBe(0);
  });

  it('wheel isolation preserved on the shell', () => {
    const { host } = mount();
    const shell = host.querySelector('[data-drawing-navigation-control="true"]')!;
    let bubbled = false;
    document.body.addEventListener('wheel', () => { bubbled = true; }, { once: true });
    act(() => { shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true })); });
    expect(bubbled).toBe(false);
  });
});

describe('PATCH DRAWING-MINIMAP-C: visual contract', () => {
  it('the shell is a rounded, bordered, shadowed panel roughly matching Freeform\'s own width', () => {
    const { host } = mount();
    const shell = host.querySelector('[data-drawing-navigation-control="true"]')!;
    expect(shell.className).toMatch(/rounded-lg/);
    expect(shell.className).toMatch(/border/);
    expect(shell.className).toMatch(/shadow-md/);
    expect(shell.className).toMatch(/w-\[176px\]/);
  });

  it('the header row is compact (h-9), matching Freeform\'s own header height', () => {
    const { host } = mount();
    const header = host.querySelector('[data-drawing-navigation-header="true"]')!;
    expect(header.className).toMatch(/h-9/);
  });

  it('the embedded minimap carries no border/shadow/background of its own -- the outer shell owns that chrome', () => {
    const { host } = mount();
    const minimap = host.querySelector('[data-drawing-minimap="true"]')!;
    expect(minimap.className).not.toMatch(/border|shadow|bg-white/);
  });
});
