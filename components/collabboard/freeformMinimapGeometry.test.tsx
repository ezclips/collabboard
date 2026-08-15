// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import {
  createMinimapProjection,
  getMinimapDisplayBounds,
  getViewportWorldRect,
  projectWorldPoint,
  projectWorldRect,
  unprojectMinimapPoint,
  type MinimapWorldItem,
  type WorldRect,
} from '@/components/collabboard/canvas/minimap/freeformMinimapGeometry';
import {
  getFallbackMinimapItem,
  getMinimapItemKind,
  measureRootElementWorldRect,
  resolveMinimapWorldItems,
  useFreeformMinimapGeometry,
} from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

const inner = { left: 8, top: 8, width: 152, height: 92 };

function item(overrides: Partial<MinimapWorldItem> = {}): MinimapWorldItem {
  return {
    id: 'post-1', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100,
    ...overrides,
  };
}

function post(overrides: Partial<Padlet> = {}): Padlet {
  return {
    id: 'post-1', board_id: 'board-1', title: '', content: '', type: 'text',
    position_x: 10, position_y: 20, width: 180, height: 100,
    created_at: '', updated_at: '', ...overrides,
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe('PATCH 9U pure minimap bounds', () => {
  it('1. returns no bounds for no items', () => expect(getMinimapDisplayBounds([])).toBeNull());

  it('2/3/5. center-expands one tiny item with minimum padding and final span', () => {
    expect(getMinimapDisplayBounds([item({ x: 100, y: 200, width: 10, height: 20 })]))
      .toEqual({ x: -695, y: -290, width: 1600, height: 1000 });
  });

  it('4. lets ten-percent padding dominate for a large content span', () => {
    expect(getMinimapDisplayBounds([item({ width: 5000, height: 3000 })]))
      .toEqual({ x: -500, y: -300, width: 6000, height: 3600 });
  });

  it('6. unions two widely separated items', () => {
    const bounds = getMinimapDisplayBounds([item(), item({ id: 'post-2', x: 3000, y: 2000 })]);
    expect(bounds).toEqual({ x: -310, y: -210, width: 3720, height: 2520 });
  });

  it('7. preserves negative item coordinates without clamping', () => {
    expect(getMinimapDisplayBounds([item({ x: -2400, y: -1200 })])?.x).toBeLessThan(-2400);
  });

  it('8. preserves coordinates above 10000 without clamping', () => {
    const bounds = getMinimapDisplayBounds([item({ x: 12_000, y: 15_000 })]);
    expect(bounds?.x).toBeGreaterThan(10_000);
    expect(bounds?.y).toBeGreaterThan(10_000);
  });

  it('9. ignores invalid/NaN items', () => {
    expect(getMinimapDisplayBounds([item({ x: Number.NaN }), item({ id: 'valid' })]))
      .toEqual(getMinimapDisplayBounds([item({ id: 'valid' })]));
  });

  it('10. ignores zero-size items', () => {
    expect(getMinimapDisplayBounds([item({ width: 0 })])).toBeNull();
  });
});

describe('PATCH 9U pure minimap projection', () => {
  const bounds: WorldRect = { x: -800, y: -500, width: 1600, height: 1000 };

  it('11. projects world points and rectangles', () => {
    const projection = createMinimapProjection(bounds, inner)!;
    const point = projectWorldPoint({ x: -800, y: -500 }, projection);
    const projected = projectWorldRect({ x: -800, y: -500, width: 100, height: 100 }, projection);
    expect(point.x).toBeCloseTo(10.4);
    expect(point.y).toBe(8);
    expect(projected.x).toBeCloseTo(10.4);
    expect(projected.y).toBe(8);
    expect(projected.width).toBeCloseTo(9.2);
    expect(projected.height).toBeCloseTo(9.2);
  });

  it('12/13. inverses projection and round-trips an arbitrary point', () => {
    const projection = createMinimapProjection(bounds, inner)!;
    const world = { x: 123.5, y: -44.25 };
    const roundTrip = unprojectMinimapPoint(projectWorldPoint(world, projection), projection);
    expect(roundTrip.x).toBeCloseTo(world.x);
    expect(roundTrip.y).toBeCloseTo(world.y);
  });

  it('14. letterboxes a wide world vertically', () => {
    const projection = createMinimapProjection({ x: 0, y: 0, width: 4000, height: 1000 }, inner)!;
    expect(projection.offsetX).toBe(8);
    expect(projection.offsetY).toBeCloseTo(35);
  });

  it('15. letterboxes a tall world horizontally', () => {
    const projection = createMinimapProjection({ x: 0, y: 0, width: 1000, height: 4000 }, inner)!;
    expect(projection.offsetX).toBeCloseTo(72.5);
    expect(projection.offsetY).toBe(8);
  });

  it('16. adds no letterbox for equal aspect ratios', () => {
    const projection = createMinimapProjection({ x: 0, y: 0, width: 1520, height: 920 }, inner)!;
    expect(projection.offsetX).toBe(8);
    expect(projection.offsetY).toBe(8);
  });

  it('17. uses one uniform scale with no axis distortion', () => {
    const projection = createMinimapProjection(bounds, inner)!;
    const projected = projectWorldRect({ x: 0, y: 0, width: 300, height: 200 }, projection);
    expect(projected.width / projected.height).toBe(1.5);
  });
});

describe('PATCH 9U root geometry normalization', () => {
  it('18/19/20/25. includes Note, Document, Image, and Drawing roots as simple posts', () => {
    const posts = [
      post({ id: 'note', type: 'text' }),
      post({ id: 'document', type: 'card' }),
      post({ id: 'image', type: 'image' }),
      post({ id: 'drawing', type: 'drawing' }),
    ];
    expect(resolveMinimapWorldItems(posts, {})).toHaveLength(4);
    expect(resolveMinimapWorldItems(posts, {}).map((entry) => entry.kind)).toEqual(['post', 'post', 'post', 'post']);
  });

  it('21. maps a root Container to exactly one outlined kind', () => {
    const result = resolveMinimapWorldItems([post({ type: 'container' })], {});
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('container');
  });

  it('22. relies on the host canonical root list, so a supplied root list is represented exactly', () => {
    const roots = [post({ id: 'container', type: 'container' })];
    expect(resolveMinimapWorldItems(roots, {})).toHaveLength(1);
  });

  it('23. maps a collapsed Comment to a pin while retaining measured geometry', () => {
    const collapsed = post({ id: 'comment', type: 'comment', metadata: { isCollapsed: true } });
    const result = resolveMinimapWorldItems([collapsed], { comment: { x: 5, y: 6, width: 32, height: 40 } });
    expect(result[0]).toMatchObject({ kind: 'comment-pin', x: 5, y: 6, width: 32, height: 40 });
  });

  it('24. maps an expanded Comment to a measured ordinary post rectangle', () => {
    const expanded = post({ id: 'comment', type: 'comment', metadata: { isCollapsed: false } });
    expect(resolveMinimapWorldItems([expanded], { comment: { x: 5, y: 6, width: 280, height: 190 } })[0])
      .toMatchObject({ kind: 'post', width: 280, height: 190 });
  });

  it('26. uses model fallback before measurement', () => {
    expect(getFallbackMinimapItem(post({ position_x: 77, position_y: 88 })))
      .toMatchObject({ x: 77, y: 88, width: 180, height: 100 });
  });

  it('27. measured DOM geometry supersedes the fallback', () => {
    expect(resolveMinimapWorldItems([post()], { 'post-1': { x: 99, y: 98, width: 333, height: 222 } })[0])
      .toMatchObject({ x: 99, y: 98, width: 333, height: 222 });
  });

  it('28. subtracts the shared origin and divides by zoom exactly once', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => rect(250, 460, 400, 300);
    expect(measureRootElementWorldRect(element, post(), { left: 50, top: 60 }, 2))
      .toEqual({ x: 100, y: 200, width: 200, height: 150 });
  });

  it('maps only collapsed comments to comment-pin', () => {
    expect(getMinimapItemKind(post({ type: 'comment', metadata: { isCollapsed: true } }))).toBe('comment-pin');
    expect(getMinimapItemKind(post({ type: 'comment', metadata: { isCollapsed: false } }))).toBe('post');
  });
});

describe('PATCH 9U viewport world geometry', () => {
  const getAtZoom = (zoom: number, origin = { left: -100, top: -50 }) => getViewportWorldRect({
    viewportRect: { left: 10, top: 20 }, clientLeft: 2, clientTop: 3,
    clientWidth: 800, clientHeight: 600, worldOriginRect: origin, zoom,
  });

  it.each([
    ['31. 100%', 1, 800, 600],
    ['32. 50%', 0.5, 1600, 1200],
    ['33. 20%', 0.2, 4000, 3000],
    ['34. 10%', 0.1, 8000, 6000],
    ['35. 150%', 1.5, 800 / 1.5, 400],
  ])('%s divides client size by zoom', (_label, zoom, width, height) => {
    expect(getAtZoom(zoom)?.width).toBeCloseTo(width);
    expect(getAtZoom(zoom)?.height).toBeCloseTo(height);
  });

  it('36. derives non-zero pan from actual client and origin rects', () => {
    expect(getAtZoom(1)).toEqual({ x: 112, y: 73, width: 800, height: 600 });
  });

  it('37. permits a negative-world gutter view', () => {
    expect(getAtZoom(1, { left: 100, top: 100 })?.x).toBeLessThan(0);
  });

  it('38. permits a view above 10000', () => {
    expect(getAtZoom(1, { left: -20_000, top: -20_000 })?.x).toBeGreaterThan(10_000);
  });

  it('39/41. pan changes only the separately projected viewport, not content projection', () => {
    const projection = createMinimapProjection({ x: 0, y: 0, width: 1600, height: 1000 }, inner)!;
    const before = projectWorldRect(item(), projection);
    projectWorldRect(getAtZoom(1)!, projection);
    expect(projectWorldRect(item(), projection)).toEqual(before);
  });

  it('40/42. zoom resizes only the separately projected viewport, not content projection', () => {
    const projection = createMinimapProjection({ x: 0, y: 0, width: 1600, height: 1000 }, inner)!;
    const before = projectWorldRect(item(), projection);
    expect(projectWorldRect(getAtZoom(0.5)!, projection).width).toBeGreaterThan(projectWorldRect(getAtZoom(1)!, projection).width);
    expect(projectWorldRect(item(), projection)).toEqual(before);
  });
});

describe('PATCH 9U root observer lifecycle', () => {
  it('29/30. uses one ResizeObserver for every root and disconnects it on cleanup', () => {
    const observed: Element[] = [];
    let instanceCount = 0;
    let disconnectCount = 0;
    class FakeResizeObserver {
      constructor(_callback: ResizeObserverCallback) { instanceCount += 1; }
      observe(target: Element) { observed.push(target); }
      unobserve() {}
      disconnect() { disconnectCount += 1; }
    }
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const host = document.createElement('div');
    const mount = document.createElement('div');
    const viewport = document.createElement('div');
    const origin = document.createElement('div');
    viewport.append(origin);
    for (const [id, left] of [['one', 120], ['two', 420]] as const) {
      const rootElement = document.createElement('div');
      rootElement.dataset.padletId = id;
      rootElement.getBoundingClientRect = () => rect(left, 240, 180, 100);
      if (id === 'one') {
        const nestedMarker = document.createElement('div');
        nestedMarker.dataset.padletId = id;
        rootElement.append(nestedMarker);
      }
      origin.append(rootElement);
    }
    origin.getBoundingClientRect = () => rect(20, 40, 10_000, 10_000);
    host.append(viewport, mount);
    document.body.append(host);

    const posts = [post({ id: 'one' }), post({ id: 'two' })];
    const containerRef = { current: viewport };
    const worldOriginRef = { current: origin };
    function Harness() {
      const items = useFreeformMinimapGeometry({
        rootPosts: posts,
        containerRef,
        worldOriginRef,
        canvasZoom: 2,
      });
      return <output>{items.map((entry) => `${entry.id}:${entry.x}`).join(',')}</output>;
    }

    const reactRoot = createRoot(mount);
    act(() => reactRoot.render(<Harness />));
    act(() => { frames.splice(0).forEach((callback) => callback(0)); });
    expect(instanceCount).toBe(1);
    expect(observed).toHaveLength(2);
    expect(mount.textContent).toContain('one:50');
    expect(mount.textContent).toContain('two:200');
    act(() => reactRoot.unmount());
    expect(disconnectCount).toBe(1);
    host.remove();
  });
});
