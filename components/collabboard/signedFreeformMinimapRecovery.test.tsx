// @vitest-environment jsdom
//
// PATCH 9V.2B -- minimap recovery for posts that now really live at negative
// world coordinates.
//
// PATCH 9V/9U built the minimap on content-driven bounds with no zero clamp,
// so it *should* already handle negatives; before this patch nothing could
// actually be placed there, so that was theory. These tests use real negative
// items and prove the property end-to-end: the silhouette renders at the
// negative location, display bounds expand to contain it, and clicking it
// navigates there. No minimap production code changed in this patch.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const NEGATIVE_ITEMS = [
  { id: 'far-negative', type: 'text', kind: 'post', x: -4500, y: -4500, width: 180, height: 220 },
  { id: 'origin-post', type: 'text', kind: 'post', x: 0, y: 0, width: 180, height: 220 },
  { id: 'positive-post', type: 'text', kind: 'post', x: 2000, y: 1200, width: 180, height: 220 },
] as const;

vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry', () => ({
  useFreeformMinimapGeometry: () => NEGATIVE_ITEMS.map((item) => ({ ...item })),
}));
vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapViewport', () => ({
  useFreeformMinimapViewport: () => ({ x: -100, y: -50, width: 800, height: 600 }),
}));

import FreeformMinimap from '@/components/collabboard/canvas/minimap/FreeformMinimap';
import {
  createMinimapProjection,
  getMinimapDisplayBounds,
  projectWorldPoint,
  unprojectMinimapPoint,
  type MinimapWorldItem,
} from '@/components/collabboard/canvas/minimap/freeformMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = NEGATIVE_ITEMS.map((item) => ({ ...item })) as unknown as MinimapWorldItem[];
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

function pointerEvent(type: string, init: { clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: 1 },
    button: { value: 0 },
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
  const svg = host.querySelector<SVGSVGElement>('[data-freeform-minimap-map="true"]')!;
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
  Object.defineProperties(svg, {
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => false },
  });
  return { host, svg, panByWorldDelta };
}

describe('PATCH 9V.2B: minimap contains and recovers negative posts [matrix 54, 55]', () => {
  it('expands display bounds to contain a post at (-4500,-4500) [54]', () => {
    expect(BOUNDS.x).toBeLessThanOrEqual(-4500);
    expect(BOUNDS.y).toBeLessThanOrEqual(-4500);
    expect(BOUNDS.x + BOUNDS.width).toBeGreaterThanOrEqual(2000 + 180);
    expect(BOUNDS.y + BOUNDS.height).toBeGreaterThanOrEqual(1200 + 220);
  });

  it('renders the negative post as its own silhouette [54]', () => {
    const h = mountMinimap();
    const silhouette = h.host.querySelector<SVGRectElement>('[data-minimap-item-id="far-negative"]');
    expect(silhouette).not.toBeNull();
    // It is projected LEFT of and ABOVE the logical-origin post, i.e. the
    // negative coordinate survives projection rather than collapsing to it.
    const originSilhouette = h.host.querySelector<SVGRectElement>('[data-minimap-item-id="origin-post"]')!;
    expect(Number(silhouette!.getAttribute('x'))).toBeLessThan(Number(originSilhouette.getAttribute('x')));
    expect(Number(silhouette!.getAttribute('y'))).toBeLessThan(Number(originSilhouette.getAttribute('y')));
  });

  it('navigates to the negative post when its silhouette is clicked [55]', () => {
    const h = mountMinimap();
    const silhouette = h.host.querySelector<SVGRectElement>('[data-minimap-item-id="far-negative"]')!;
    const target = { x: -4500 + 90, y: -4500 + 110 };
    const point = worldClientPoint(target.x, target.y);
    act(() => {
      silhouette.dispatchEvent(pointerEvent('pointerdown', point));
      h.svg.dispatchEvent(pointerEvent('pointerup', point));
    });

    expect(h.panByWorldDelta).toHaveBeenCalledTimes(1);
    const [dx, dy] = h.panByWorldDelta.mock.calls[0];
    // Viewport centre is currently at (-100+400, -50+300) = (300, 250);
    // the pan must carry it to the clicked negative world point.
    expect(dx).toBeCloseTo(target.x - 300, 6);
    expect(dy).toBeCloseTo(target.y - 250, 6);
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
  });

  it.each([1, 0.4, 0.2, 0.1, 1.5])('reaches the negative post at zoom %s [matrix 63]', (zoom) => {
    const h = mountMinimap(zoom);
    const target = { x: -4400, y: -4400 };
    const point = worldClientPoint(target.x, target.y);
    act(() => {
      h.svg.dispatchEvent(pointerEvent('pointerdown', point));
      h.svg.dispatchEvent(pointerEvent('pointerup', point));
    });
    const [dx, dy] = h.panByWorldDelta.mock.calls[0];
    expect(dx).toBeCloseTo(target.x - 300, 6);
    expect(dy).toBeCloseTo(target.y - 250, 6);
  });

  it('round-trips a negative world point through project/unproject [no signed-zero clamp]', () => {
    const point = { x: -4500, y: -3200 };
    const roundTripped = unprojectMinimapPoint(projectWorldPoint(point, PROJECTION), PROJECTION);
    expect(roundTripped.x).toBeCloseTo(point.x, 6);
    expect(roundTripped.y).toBeCloseTo(point.y, 6);
  });
});
