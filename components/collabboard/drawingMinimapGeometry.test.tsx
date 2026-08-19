// @vitest-environment jsdom
// PATCH DRAWING-MINIMAP-A: pure geometry tests for the Drawing canvas
// navigation minimap, mirroring this repo's convention for the (frozen,
// untouched) Freeform minimap's own geometry tests -- see
// freeformMinimapGeometry.test.tsx -- but exercising this patch's own,
// independent module.
import { describe, expect, it, vi } from 'vitest';
import {
  createMinimapProjection,
  getDrawingViewportWorldRect,
  getExcalidrawElementBounds,
  getSceneDisplayBounds,
  projectWorldPoint,
  projectWorldRect,
  unprojectMinimapPoint,
  type WorldRect,
} from '@/components/collabboard/canvas/minimap/drawingMinimapGeometry';
import { panDrawingViewportByWorldDelta } from '@/components/collabboard/canvas/minimap/drawingMinimapNavigation';

const inner = { left: 8, top: 8, width: 160, height: 96 };

function rect(overrides: Partial<WorldRect> = {}): WorldRect {
  return { x: 0, y: 0, width: 100, height: 100, ...overrides };
}

describe('getExcalidrawElementBounds', () => {
  it('returns a footprint for a normal element', () => {
    expect(getExcalidrawElementBounds({ x: 10, y: 20, width: 30, height: 40 }))
      .toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('normalizes negative width/height into a top-left-anchored rect', () => {
    expect(getExcalidrawElementBounds({ x: 100, y: 100, width: -40, height: -20 }))
      .toEqual({ x: 60, y: 80, width: 40, height: 20 });
  });

  it('returns null for a deleted element', () => {
    expect(getExcalidrawElementBounds({ x: 0, y: 0, width: 10, height: 10, isDeleted: true })).toBeNull();
  });

  it('returns null for a zero-size element', () => {
    expect(getExcalidrawElementBounds({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });

  it('returns null for NaN geometry', () => {
    expect(getExcalidrawElementBounds({ x: Number.NaN, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(getExcalidrawElementBounds(null)).toBeNull();
    expect(getExcalidrawElementBounds(undefined)).toBeNull();
  });
});

describe('getSceneDisplayBounds', () => {
  it('returns null for an empty scene', () => {
    expect(getSceneDisplayBounds([])).toBeNull();
  });

  it('ignores invalid rects mixed in with valid ones', () => {
    const withInvalid = getSceneDisplayBounds([rect({ width: Number.NaN }), rect({ x: 5, y: 5 })]);
    const onlyValid = getSceneDisplayBounds([rect({ x: 5, y: 5 })]);
    expect(withInvalid).toEqual(onlyValid);
  });

  it('centers and floors a single small element to the minimum display size', () => {
    const bounds = getSceneDisplayBounds([rect({ x: 100, y: 200, width: 10, height: 20 })]);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBe(400);
    expect(bounds!.height).toBe(300);
    // centered on the element's own center (105, 210)
    expect(bounds!.x + bounds!.width / 2).toBe(105);
    expect(bounds!.y + bounds!.height / 2).toBe(210);
  });

  it('lets the ratio padding dominate for a large content span', () => {
    const bounds = getSceneDisplayBounds([rect({ width: 5000, height: 3000 })]);
    // rawWidth 5000 * 0.1 = 500 > fixed 80 -> padding 500 each side
    expect(bounds).toEqual({ x: -500, y: -300, width: 6000, height: 3600 });
  });

  it('unions two widely separated elements', () => {
    const bounds = getSceneDisplayBounds([rect(), rect({ x: 2000, y: 1000 })]);
    expect(bounds).not.toBeNull();
    // union raw span is 0..2100 x 0..1100 (each rect is 100x100)
    expect(bounds!.x).toBeLessThan(0);
    expect(bounds!.y).toBeLessThan(0);
    expect(bounds!.x + bounds!.width).toBeGreaterThan(2100);
    expect(bounds!.y + bounds!.height).toBeGreaterThan(1100);
  });

  it('preserves negative coordinates without clamping', () => {
    expect(getSceneDisplayBounds([rect({ x: -2400, y: -1200 })])!.x).toBeLessThan(-2400);
  });
});

describe('createMinimapProjection / projectWorldRect / unprojectMinimapPoint', () => {
  it('round-trips a world point through project -> unproject', () => {
    const bounds = { x: -100, y: -50, width: 800, height: 500 };
    const projection = createMinimapProjection(bounds, inner)!;
    expect(projection).not.toBeNull();
    const world = { x: 50, y: 25 };
    const projected = projectWorldPoint(world, projection);
    const back = unprojectMinimapPoint(projected, projection);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it('scales a world rect by the projection scale', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 200 };
    const projection = createMinimapProjection(bounds, { left: 0, top: 0, width: 200, height: 100 })!;
    // fits exactly: scale = 0.5
    expect(projection.scale).toBe(0.5);
    const projected = projectWorldRect({ x: 0, y: 0, width: 100, height: 50 }, projection);
    expect(projected.width).toBe(50);
    expect(projected.height).toBe(25);
  });

  it('returns null for a degenerate inner rect', () => {
    expect(createMinimapProjection({ x: 0, y: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 0, height: 100 }))
      .toBeNull();
  });
});

describe('getDrawingViewportWorldRect', () => {
  it('derives x/y from -scrollX/-scrollY and width/height from container size / zoom', () => {
    const result = getDrawingViewportWorldRect({
      scrollX: 40,
      scrollY: 60,
      zoom: { value: 2 },
      width: 800,
      height: 400,
    });
    expect(result).toEqual({ x: -40, y: -60, width: 400, height: 200 });
  });

  it('matches the installed Excalidraw fork\'s own viewportCoordsToSceneCoords formula at the container edges', () => {
    // sceneX = clientX / zoom - scrollX (packages/common/src/utils.ts) -- for
    // clientX = 0 that's -scrollX (the viewport's own left edge), and for
    // clientX = container width that's width/zoom - scrollX (the right edge).
    const appState = { scrollX: 10, scrollY: 5, zoom: { value: 1.5 }, width: 300, height: 150 };
    const viewport = getDrawingViewportWorldRect(appState)!;
    expect(viewport.x).toBe(0 / appState.zoom.value - appState.scrollX);
    expect(viewport.x + viewport.width).toBe(appState.width / appState.zoom.value - appState.scrollX);
  });

  it('returns null when appState is missing', () => {
    expect(getDrawingViewportWorldRect(null)).toBeNull();
    expect(getDrawingViewportWorldRect(undefined)).toBeNull();
  });

  it('returns null for a zero/invalid zoom', () => {
    expect(getDrawingViewportWorldRect({ scrollX: 0, scrollY: 0, zoom: { value: 0 }, width: 100, height: 100 })).toBeNull();
  });

  it('returns null for a zero-size container (not yet measured)', () => {
    expect(getDrawingViewportWorldRect({ scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 0, height: 0 })).toBeNull();
  });
});

describe('panDrawingViewportByWorldDelta', () => {
  function makeApi(appState: any, elements: any[]) {
    return {
      getAppState: vi.fn(() => appState),
      getSceneElements: vi.fn(() => elements),
      updateScene: vi.fn(),
    };
  }

  it('adjusts scrollX/scrollY by the negative delta and passes elements through unchanged', () => {
    const elements = [{ id: 'a' }, { id: 'b' }];
    const api = makeApi({ scrollX: 10, scrollY: 20, zoom: { value: 1 } }, elements);

    panDrawingViewportByWorldDelta(api, 5, -3);

    expect(api.updateScene).toHaveBeenCalledTimes(1);
    const call = api.updateScene.mock.calls[0][0];
    expect(call.elements).toBe(elements); // same reference -- never mutated/cloned
    expect(call.appState.scrollX).toBe(5); // 10 - 5
    expect(call.appState.scrollY).toBe(23); // 20 - (-3)
  });

  it('never sets captureUpdate to a value that would create a durable undo entry', () => {
    const api = makeApi({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }, []);
    panDrawingViewportByWorldDelta(api, 10, 10);
    const call = api.updateScene.mock.calls[0][0];
    expect(call.captureUpdate).not.toBe('IMMEDIATELY');
  });

  it('is a no-op for a zero delta', () => {
    const api = makeApi({ scrollX: 0, scrollY: 0 }, []);
    panDrawingViewportByWorldDelta(api, 0, 0);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it('is a no-op when the API is not yet available', () => {
    expect(() => panDrawingViewportByWorldDelta(null, 5, 5)).not.toThrow();
    expect(() => panDrawingViewportByWorldDelta(undefined, 5, 5)).not.toThrow();
  });

  it('is a no-op when appState/elements are not yet available', () => {
    const api: any = { getAppState: () => null, getSceneElements: () => null, updateScene: vi.fn() };
    panDrawingViewportByWorldDelta(api, 5, 5);
    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
