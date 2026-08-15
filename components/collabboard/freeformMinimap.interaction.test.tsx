// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry', () => ({
  useFreeformMinimapGeometry: () => ([
    { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100 },
    { id: 'container', type: 'container', kind: 'container', x: 1000, y: 500, width: 200, height: 200 },
  ]),
}));
vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapViewport', () => ({
  useFreeformMinimapViewport: () => ({ x: -100, y: -50, width: 800, height: 600 }),
}));

import FreeformMinimap from '@/components/collabboard/canvas/minimap/FreeformMinimap';
import {
  createMinimapProjection,
  getMinimapDisplayBounds,
  projectWorldPoint,
  type MinimapWorldItem,
} from '@/components/collabboard/canvas/minimap/freeformMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: MinimapWorldItem[] = [
  { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100 },
  { id: 'container', type: 'container', kind: 'container', x: 1000, y: 500, width: 200, height: 200 },
];
const BOUNDS = getMinimapDisplayBounds(ITEMS)!;
const PROJECTION = createMinimapProjection(BOUNDS, { left: 8, top: 8, width: 152, height: 92 })!;
const RENDERED_RECT = { left: 100, top: 200, width: 336, height: 216 };

let roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
});

function pointerEvent(type: string, init: {
  clientX: number;
  clientY: number;
  pointerId?: number;
  button?: number;
}) {
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
    clientX: RENDERED_RECT.left + minimapX * (RENDERED_RECT.width / 168),
    clientY: RENDERED_RECT.top + minimapY * (RENDERED_RECT.height / 108),
  };
}

function worldClientPoint(x: number, y: number) {
  const projected = projectWorldPoint({ x, y }, PROJECTION);
  return clientPoint(projected.x, projected.y);
}

function mountMinimap(canvasZoom = 1) {
  const panByWorldDelta = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <FreeformMinimap
      rootPosts={[]}
      containerRef={{ current: document.createElement('div') }}
      worldOriginRef={{ current: document.createElement('div') }}
      canvasZoom={canvasZoom}
      panByWorldDelta={panByWorldDelta}
    />,
  ));
  const minimap = host.querySelector<HTMLElement>('[data-freeform-minimap="true"]')!;
  const svg = host.querySelector<SVGSVGElement>('[data-freeform-minimap-map="true"]')!;
  const viewport = host.querySelector<SVGRectElement>('[data-freeform-minimap-viewport="true"]')!;
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
  return { host, minimap, svg, viewport, panByWorldDelta, setPointerCapture, releasePointerCapture };
}

function clickAt(target: Element, svg: SVGSVGElement, point: { clientX: number; clientY: number }) {
  act(() => {
    target.dispatchEvent(pointerEvent('pointerdown', point));
    svg.dispatchEvent(pointerEvent('pointerup', point));
  });
}

function expectPanCloseTo(pan: ReturnType<typeof vi.fn>, x: number, y: number) {
  expect(pan).toHaveBeenCalledTimes(1);
  const [actualX, actualY] = pan.mock.calls[0];
  expect(actualX).toBeCloseTo(x, 8);
  expect(actualY).toBeCloseTo(y, 8);
}

describe('PATCH 9V minimap click navigation', () => {
  it('11/13/14. scales client coordinates, inverse-projects a fitted point, and pans from the canonical viewport center', () => {
    const h = mountMinimap();
    const point = worldClientPoint(900, 450);
    clickAt(h.svg, h.svg, point);
    expectPanCloseTo(h.panByWorldDelta, 600, 200);
  });

  it('12. ignores letterbox-only clicks while still owning the pointer event', () => {
    const h = mountMinimap();
    let bubbled = 0;
    const onPointerDown = () => { bubbled += 1; };
    document.body.addEventListener('pointerdown', onPointerDown);
    const point = clientPoint(8.5, 54);
    const down = pointerEvent('pointerdown', point);
    act(() => { h.svg.dispatchEvent(down); });
    document.body.removeEventListener('pointerdown', onPointerDown);
    expect(down.defaultPrevented).toBe(true);
    expect(bubbled).toBe(0);
    expect(h.panByWorldDelta).not.toHaveBeenCalled();
  });

  it('15. a miniature-post click navigates spatially without an object-selection callback', () => {
    const h = mountMinimap();
    const post = h.host.querySelector<SVGRectElement>('[data-minimap-item-id="post"]')!;
    clickAt(post, h.svg, worldClientPoint(50, 50));
    expectPanCloseTo(h.panByWorldDelta, -250, -200);
    expect(post.getAttribute('role')).toBeNull();
    expect(post.getAttribute('tabindex')).toBeNull();
  });

  it.each([1, 0.4, 0.2, 0.1, 1.5])('17/19-23. click navigation remains pan-only at zoom %s', (zoom) => {
    const h = mountMinimap(zoom);
    clickAt(h.svg, h.svg, worldClientPoint(900, 450));
    expectPanCloseTo(h.panByWorldDelta, 600, 200);
    expect(h.host.textContent).not.toContain('undefined');
  });
});

describe('PATCH 9V viewport drag', () => {
  it('24/25/28-30. captures the pointer and converts right/down minimap movement to positive world deltas', () => {
    const h = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = clientPoint(
      (start.clientX - RENDERED_RECT.left) / 2 + 20,
      (start.clientY - RENDERED_RECT.top) / 2 + 10,
    );
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointermove', moved));
    });
    expect(h.setPointerCapture).toHaveBeenCalledWith(1);
    expect(h.panByWorldDelta).toHaveBeenCalledWith(
      20 / PROJECTION.scale,
      10 / PROJECTION.scale,
    );
  });

  it('26. sub-threshold movement remains a click candidate', () => {
    const h = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = { clientX: start.clientX + 3, clientY: start.clientY };
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointermove', moved));
    });
    expect(h.panByWorldDelta).not.toHaveBeenCalled();
    act(() => { h.svg.dispatchEvent(pointerEvent('pointerup', moved)); });
    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
  });

  it('27/34. over-threshold viewport motion becomes drag and suppresses click-center completion', () => {
    const h = mountMinimap();
    const start = worldClientPoint(300, 250);
    const moved = { clientX: start.clientX + 20, clientY: start.clientY };
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointermove', moved));
      h.svg.dispatchEvent(pointerEvent('pointerup', moved));
    });
    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
  });

  it('31/33. release outside the minimap ends a captured drag cleanly', () => {
    const h = mountMinimap();
    const start = worldClientPoint(300, 250);
    const outside = { clientX: RENDERED_RECT.left + RENDERED_RECT.width + 100, clientY: start.clientY };
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointermove', outside));
      h.svg.dispatchEvent(pointerEvent('pointerup', outside));
    });
    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
    expect(h.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('32. pointercancel terminates without click navigation', () => {
    const h = mountMinimap();
    const start = worldClientPoint(300, 250);
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointercancel', start));
    });
    expect(h.panByWorldDelta).not.toHaveBeenCalled();
    expect(h.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it.each([0.2, 0.1])('36. viewport-covered low zoom %s remains clickable and draggable', (zoom) => {
    const h = mountMinimap(zoom);
    const start = worldClientPoint(300, 250);
    clickAt(h.viewport, h.svg, start);
    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
    h.panByWorldDelta.mockClear();
    act(() => {
      h.viewport.dispatchEvent(pointerEvent('pointerdown', start));
      h.svg.dispatchEvent(pointerEvent('pointermove', { clientX: start.clientX + 20, clientY: start.clientY }));
      h.svg.dispatchEvent(pointerEvent('pointerup', { clientX: start.clientX + 20, clientY: start.clientY }));
    });
    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH 9V event isolation and frozen visual contract', () => {
  it.each(['wheel', 'contextmenu', 'click', 'dblclick'])('37/39-41. %s is prevented and cannot bubble through the minimap', (type) => {
    const h = mountMinimap();
    let bubbled = 0;
    const onEvent = () => { bubbled += 1; };
    document.body.addEventListener(type, onEvent);
    const event = new Event(type, { bubbles: true, cancelable: true });
    act(() => { h.minimap.dispatchEvent(event); });
    document.body.removeEventListener(type, onEvent);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(0);
  });

  it('40. Ctrl+wheel is isolated without changing zoom', () => {
    const h = mountMinimap(0.4);
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'ctrlKey', { value: true });
    act(() => { h.minimap.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(h.panByWorldDelta).not.toHaveBeenCalled();
  });

  it('42/44. shapes remain visualization-only and the accepted light-gray surface stays exact', () => {
    const h = mountMinimap();
    const items = h.host.querySelector<SVGGElement>('[data-freeform-minimap-items="true"]')!;
    const surface = h.host.querySelector<SVGRectElement>('[data-freeform-minimap-surface="true"]')!;
    expect(items.getAttribute('pointer-events')).toBe('none');
    expect(getComputedStyle(surface).fill).toBe('rgb(229, 231, 235)');
    expect(h.minimap.className).toContain('pointer-events-auto');
  });
});
