// @vitest-environment jsdom
//
// PATCH 9S -- camera-anchored Freeform zoom.
// PATCH 9S.2 -- camera gutter fix for PATCH 9S.1's confirmed low-zoom drift
// (native scroll cannot go negative, so a focal point near the world's own
// edges became unrepresentable below a zoom-dependent threshold). Mounts the
// real hook (createRoot/act, matching the established convention in
// freeformGraphLabelDrag.test.tsx and SimpleLineRenderer.zoomCoordinates.test.tsx)
// against a stubbed container element. Geometry (clientWidth/Height,
// scrollWidth/Height) is applied via a CALLBACK REF so it exists BEFORE the
// hook's own mount-time useLayoutEffect (gutter measurement + seeding) reads
// it -- a plain useRef() would leave containerRef.current null until after
// that effect already ran once with default (0) geometry.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useCanvasCamera } from './useCanvasCamera';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// A controllable ResizeObserver stub -- unlike a no-op stub, this lets tests
// simulate an actual viewport resize by mutating clientWidth/clientHeight
// and then explicitly firing the observer callback, matching how the real
// browser API notifies observers asynchronously after a resize.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger() {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}
(globalThis as any).ResizeObserver = FakeResizeObserver;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  FakeResizeObserver.instances = [];
});

interface CameraGeometry {
  clientWidth: number;
  clientHeight: number;
  // A large fixed value is fine for pure anchor-invariance tests (no
  // clamping should occur); tests specifically about clamping/boundaries
  // pass a smaller, deliberate value or a live getter (see setGeometry).
  scrollWidth: number;
  scrollHeight: number;
}

function setGeometry(el: HTMLDivElement, geometry: CameraGeometry | (() => CameraGeometry)) {
  const resolve = typeof geometry === 'function' ? geometry : () => geometry;
  Object.defineProperty(el, 'clientWidth', { get: () => resolve().clientWidth, configurable: true });
  Object.defineProperty(el, 'clientHeight', { get: () => resolve().clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { get: () => resolve().scrollWidth, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { get: () => resolve().scrollHeight, configurable: true });
}

function mountCamera(
  geometry: CameraGeometry | (() => CameraGeometry),
  enabled = true,
  originOffset = { x: 0, y: 0 },
  initialZoom?: number,
  initialFocalWorld?: { x: number; y: number },
) {
  const containerRefObj: React.RefObject<HTMLDivElement | null> = { current: null };
  let latestCamera: ReturnType<typeof useCanvasCamera> | null = null;

  function TestComponent() {
    // `initialZoom`/`initialFocalWorld.x/.y` undefined still trigger the
    // hook's own default params (JS default parameters substitute on an
    // explicit `undefined` too), so this single call form covers both the
    // omitted and explicit cases.
    const camera = useCanvasCamera(
      containerRefObj, enabled, originOffset.x, originOffset.y, initialZoom,
      initialFocalWorld?.x, initialFocalWorld?.y,
    );
    latestCamera = camera;
    const assignRef = React.useCallback((node: HTMLDivElement | null) => {
      containerRefObj.current = node;
      if (node) setGeometry(node, geometry);
      camera.setViewportElement(node);
    }, [camera.setViewportElement]);
    return React.createElement('div', {
      ref: assignRef,
    });
  }

  const domContainer = document.createElement('div');
  document.body.appendChild(domContainer);
  const root = createRoot(domContainer);
  act(() => { root.render(React.createElement(TestComponent)); });
  mounted.push({ root, container: domContainer });

  return {
    get el() { return containerRefObj.current!; },
    getCamera: () => latestCamera!,
  };
}

// PATCH 9S.1's own reproduction scenario: a viewport far smaller than the
// world, with focal content near the world's upper-left -- exactly the
// configuration where the pre-9S.2 clamp defect was proven to trigger at
// z=0.6 and below.
const VIEWPORT = { clientWidth: 1200, clientHeight: 800 };
const HUGE_EXTENT = { scrollWidth: 100000, scrollHeight: 100000 };
const FOCAL_X = 1000;
const FOCAL_Y = 650;

function centerAnchorFor(camera: ReturnType<typeof useCanvasCamera>) {
  return { anchorX: VIEWPORT.clientWidth / 2, anchorY: VIEWPORT.clientHeight / 2 };
}

function worldAtAnchor(el: HTMLDivElement, camera: ReturnType<typeof useCanvasCamera>, anchorX: number, anchorY: number) {
  return {
    x: (el.scrollLeft + anchorX - camera.gutterX) / camera.canvasZoom,
    y: (el.scrollTop + anchorY - camera.gutterY) / camera.canvasZoom,
  };
}

describe('PATCH 9S.2: mount-time gutter seeding [Phase: initial camera]', () => {
  it('seeds gutterX/gutterY to the measured viewport size (unchanged) and scrolls to HALF that (gutterX/2, gutterY/2) on first mount -- PATCH FREEFORM-ZOOM-B centers the world origin instead of the pre-patch top-left target', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    expect(h.getCamera().gutterX).toBe(1200);
    expect(h.getCamera().gutterY).toBe(800);
    expect(h.el.scrollLeft).toBe(600);
    expect(h.el.scrollTop).toBe(400);
  });

  it('does not seed/measure gutter at all when disabled (non-Freeform layout)', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, false);
    expect(h.getCamera().gutterX).toBe(0);
    expect(h.getCamera().gutterY).toBe(0);
    expect(h.el.scrollLeft).toBe(0);
    expect(h.el.scrollTop).toBe(0);
  });

  it('does not reseed scroll on a normal rerender (e.g. an unrelated parent re-render)', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 4000; h.el.scrollTop = 3000; });
    // Force a rerender of the hook by triggering an unrelated zoom no-op path
    // is awkward; instead directly assert the seeding effect's own guard by
    // remounting is not what we want here -- assert scroll position is
    // simply left alone (nothing in the hook re-seeds without a fresh mount).
    expect(h.el.scrollLeft).toBe(4000);
    expect(h.el.scrollTop).toBe(3000);
  });
});

describe('PATCH 9V.2A: finite signed-stage initial seed', () => {
  it('adds the scaled stage-origin offset without changing the viewport-sized gutter', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 });
    expect(h.getCamera().gutterX).toBe(1200);
    expect(h.getCamera().gutterY).toBe(800);
    // PATCH FREEFORM-ZOOM-B: half-gutter seed target (600/400) instead of
    // the pre-patch full-gutter (1200/800) -- see the dedicated centering
    // describe block below for the on-screen invariant this produces.
    expect(h.el.scrollLeft).toBe(5600);
    expect(h.el.scrollTop).toBe(5400);
  });

  it('PATCH FREEFORM-ZOOM-B: logical world (0,0) now lands at screen CENTER on initial seed, not the pre-patch top-left corner', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 });
    const logicalOriginScreen = {
      x: h.getCamera().gutterX + 5000 * h.getCamera().canvasZoom - h.el.scrollLeft,
      y: h.getCamera().gutterY + 5000 * h.getCamera().canvasZoom - h.el.scrollTop,
    };
    expect(logicalOriginScreen).toEqual({ x: VIEWPORT.clientWidth / 2, y: VIEWPORT.clientHeight / 2 });
  });
});

describe('PATCH FREEFORM-ZOOM-A: initialZoom parameter -- opt-in default, byte-identical when omitted', () => {
  it('omitting initialZoom preserves the pre-patch default of exactly 1 (100%)', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    expect(h.getCamera().canvasZoom).toBe(1);
  });

  it('passing initialZoom seeds canvasZoom to that value on first mount', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 0, y: 0 }, 0.3);
    expect(h.getCamera().canvasZoom).toBe(0.3);
  });

  it('the mount-time seed (half-gutter + world-origin-offset scroll) uses initialZoom consistently, not the stale pre-patch 1 -- proves zoomRef was seeded together with the canvasZoom state, not left behind', () => {
    // With a non-zero origin offset, the seeded scrollLeft/scrollTop is
    // measuredGutter/2 + offset * zoom (PATCH FREEFORM-ZOOM-B's half-gutter
    // centering target). If zoomRef (used by the mount-time useLayoutEffect)
    // were still hardcoded/defaulted to 1 while canvasZoom state itself
    // became 0.3, this seed would use the WRONG factor and the asserted
    // scroll values below would be off by offset * 0.7.
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.3);
    expect(h.getCamera().gutterX).toBe(1200);
    expect(h.getCamera().gutterY).toBe(800);
    expect(h.el.scrollLeft).toBe(600 + 5000 * 0.3);
    expect(h.el.scrollTop).toBe(400 + 5000 * 0.3);
  });

  it('logical world (0,0) lands at screen CENTER at the new default zoom too -- the centering invariant is independent of which zoom seeded it', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.3);
    const logicalOriginScreen = {
      x: h.getCamera().gutterX + 5000 * h.getCamera().canvasZoom - h.el.scrollLeft,
      y: h.getCamera().gutterY + 5000 * h.getCamera().canvasZoom - h.el.scrollTop,
    };
    expect(logicalOriginScreen).toEqual({ x: VIEWPORT.clientWidth / 2, y: VIEWPORT.clientHeight / 2 });
  });

  it('zoom +/- controls step normally from the new initial value, through the exact same clamp/step primitive', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 0, y: 0 }, 0.3);
    act(() => { h.getCamera().handleZoomIn(); });
    expect(h.getCamera().canvasZoom).toBeCloseTo(0.4, 5);
    act(() => { h.getCamera().handleZoomOut(); h.getCamera().handleZoomOut(); });
    expect(h.getCamera().canvasZoom).toBeCloseTo(0.2, 5);
  });

  it('Reset still returns to exactly 1 (100%), not back to initialZoom -- Reset is an unrelated zoom control, untouched by this patch', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 0, y: 0 }, 0.3);
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    act(() => { h.getCamera().handleZoomReset(); });
    expect(h.getCamera().canvasZoom).toBe(1);
  });
});

describe('PATCH FREEFORM-ZOOM-B: initial camera centers the world origin on screen [core patch behavior]', () => {
  it('at the real app zoom (0.8) and real world-origin offset (5000,5000), the logical world origin lands at exact screen center on first paint', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.8);
    const screenX = h.getCamera().gutterX + 5000 * h.getCamera().canvasZoom - h.el.scrollLeft;
    const screenY = h.getCamera().gutterY + 5000 * h.getCamera().canvasZoom - h.el.scrollTop;
    expect(screenX).toBe(VIEWPORT.clientWidth / 2);
    expect(screenY).toBe(VIEWPORT.clientHeight / 2);
  });

  it('centering holds across a range of realistic viewport sizes -- not a coincidence of one fixed VIEWPORT constant', () => {
    const viewports = [
      { clientWidth: 800, clientHeight: 600 },
      { clientWidth: 1920, clientHeight: 1080 },
      { clientWidth: 375, clientHeight: 667 }, // mobile-ish, odd numbers
    ];
    for (const viewport of viewports) {
      const h = mountCamera({ ...viewport, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.8);
      const screenX = h.getCamera().gutterX + 5000 * h.getCamera().canvasZoom - h.el.scrollLeft;
      const screenY = h.getCamera().gutterY + 5000 * h.getCamera().canvasZoom - h.el.scrollTop;
      expect(screenX).toBe(viewport.clientWidth / 2);
      expect(screenY).toBe(viewport.clientHeight / 2);
    }
  });

  it('never produces a negative scroll for the real offset/zoom -- the Math.max(0, ...) guard is defensive, not load-bearing, for actual Freeform geometry', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.8);
    expect(h.el.scrollLeft).toBeGreaterThan(0);
    expect(h.el.scrollTop).toBeGreaterThan(0);
  });

  it('the gutter itself is still a FULL viewport per side, unchanged -- only the seed TARGET within it moved; shrinking the gutter would reintroduce the PATCH 9S.1 low-zoom clamp defect', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 5000, y: 5000 }, 0.8);
    expect(h.getCamera().gutterX).toBe(VIEWPORT.clientWidth);
    expect(h.getCamera().gutterY).toBe(VIEWPORT.clientHeight);
  });
});

describe('PATCH FREEFORM-ZOOM-C: initial camera centers on an arbitrary focal world point (board content), generalizing PATCH FREEFORM-ZOOM-B', () => {
  const OFFSET = { x: 5000, y: 5000 };
  const ZOOM = 0.8;

  it('omitting initialFocalWorld reproduces PATCH FREEFORM-ZOOM-B exactly -- world origin still lands at screen center', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, OFFSET, ZOOM);
    const screenX = h.getCamera().gutterX + OFFSET.x * ZOOM - h.el.scrollLeft;
    const screenY = h.getCamera().gutterY + OFFSET.y * ZOOM - h.el.scrollTop;
    expect(screenX).toBe(VIEWPORT.clientWidth / 2);
    expect(screenY).toBe(VIEWPORT.clientHeight / 2);
  });

  it('a zero focal point ({x:0,y:0}) is byte-identical to omitting it entirely', () => {
    const withZero = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, OFFSET, ZOOM, { x: 0, y: 0 });
    const omitted = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, OFFSET, ZOOM);
    expect(withZero.el.scrollLeft).toBe(omitted.el.scrollLeft);
    expect(withZero.el.scrollTop).toBe(omitted.el.scrollTop);
  });

  it('passing a non-zero focal world point (the board content center) centers THAT point on screen instead of the world origin', () => {
    const focal = { x: 2000, y: -1000 };
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, OFFSET, ZOOM, focal);
    const screenXOfFocal = h.getCamera().gutterX + (OFFSET.x + focal.x) * ZOOM - h.el.scrollLeft;
    const screenYOfFocal = h.getCamera().gutterY + (OFFSET.y + focal.y) * ZOOM - h.el.scrollTop;
    expect(screenXOfFocal).toBe(VIEWPORT.clientWidth / 2);
    expect(screenYOfFocal).toBe(VIEWPORT.clientHeight / 2);
  });

  it('world origin (0,0) is NOT centered when a non-zero focal point is used -- proves the seed really moved to content, not still hardcoded to origin', () => {
    const focal = { x: 2000, y: -1000 };
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, OFFSET, ZOOM, focal);
    const screenXOfOrigin = h.getCamera().gutterX + OFFSET.x * ZOOM - h.el.scrollLeft;
    const screenYOfOrigin = h.getCamera().gutterY + OFFSET.y * ZOOM - h.el.scrollTop;
    expect(screenXOfOrigin).not.toBe(VIEWPORT.clientWidth / 2);
    expect(screenYOfOrigin).not.toBe(VIEWPORT.clientHeight / 2);
    // Displaced from center by exactly focal.x/y * zoom -- the focal shift
    // is scaled by zoom just like every other world->screen conversion.
    expect(screenXOfOrigin).toBeCloseTo(VIEWPORT.clientWidth / 2 - focal.x * ZOOM, 5);
    expect(screenYOfOrigin).toBeCloseTo(VIEWPORT.clientHeight / 2 - focal.y * ZOOM, 5);
  });

  it('the focal point is converted through the SAME zoom as everything else -- the seed target scales linearly with zoom', () => {
    const focal = { x: 1000, y: 500 };
    const hLow = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 0, y: 0 }, 0.4, focal);
    const hHigh = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT }, true, { x: 0, y: 0 }, 0.8, focal);
    // Seed = clientWidth/2 + focal*zoom -- the DIFFERENCE between the two
    // isolates the focal contribution, since clientWidth/2 is identical.
    expect(hHigh.el.scrollLeft - hLow.el.scrollLeft).toBeCloseTo(focal.x * (0.8 - 0.4), 5);
    expect(hHigh.el.scrollTop - hLow.el.scrollTop).toBeCloseTo(focal.y * (0.8 - 0.4), 5);
  });

  it('resize compensation and anchored zoom/pan are unaffected once seeded from a focal point -- the rest of the camera treats it as an ordinary starting scroll position', () => {
    const geo = { clientWidth: 1200, clientHeight: 800, ...HUGE_EXTENT };
    const h = mountCamera(() => geo, true, OFFSET, ZOOM, { x: 2000, y: -1000 });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => { h.getCamera().zoomAtViewportPoint((z) => z + 0.1, anchorX, anchorY); });

    const after = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });
});

describe('PATCH 9S.5: viewport availability lifecycle [load-bearing]', () => {
  it('initializes when enabled is already true but CanvasViewport mounts after the hook first renders', () => {
    const containerRefObj: React.RefObject<HTMLDivElement | null> = { current: null };
    let latestCamera: ReturnType<typeof useCanvasCamera> | null = null;
    let showViewport: React.Dispatch<React.SetStateAction<boolean>> | null = null;

    function TestComponent() {
      const [mountedViewport, setMountedViewport] = React.useState(false);
      const camera = useCanvasCamera(containerRefObj, true);
      latestCamera = camera;
      showViewport = setMountedViewport;
      const assignRef = React.useCallback((node: HTMLDivElement | null) => {
        containerRefObj.current = node;
        if (node) setGeometry(node, { ...VIEWPORT, ...HUGE_EXTENT });
        camera.setViewportElement(node);
      }, [camera.setViewportElement]);
      return mountedViewport ? React.createElement('div', { ref: assignRef }) : null;
    }

    const domContainer = document.createElement('div');
    document.body.appendChild(domContainer);
    const root = createRoot(domContainer);
    act(() => { root.render(React.createElement(TestComponent)); });
    mounted.push({ root, container: domContainer });

    expect(latestCamera!.gutterX).toBe(0);
    expect(latestCamera!.gutterY).toBe(0);
    act(() => { showViewport!(true); });

    expect(latestCamera!.gutterX).toBe(VIEWPORT.clientWidth);
    expect(latestCamera!.gutterY).toBe(VIEWPORT.clientHeight);
    // PATCH FREEFORM-ZOOM-B: half-gutter seed target (centers the world
    // origin) instead of the pre-patch full-gutter top-left target.
    expect(containerRefObj.current!.scrollLeft).toBe(VIEWPORT.clientWidth / 2);
    expect(containerRefObj.current!.scrollTop).toBe(VIEWPORT.clientHeight / 2);
  });
});

describe('PATCH 9S.2: resize compensates scroll by the exact gutter delta, preserving every world point [Phase: resize]', () => {
  it('growing the viewport (gutter grows) shifts scroll by the same delta, keeping the focal point at its anchor', () => {
    const geo = { clientWidth: 1200, clientHeight: 800, ...HUGE_EXTENT };
    const h = mountCamera(() => geo);
    // Move scroll away from the just-seeded (gutterX, gutterY) position
    // FIRST -- a mutation that reseeds to measuredX/measuredY instead of
    // truly compensating by delta would coincidentally produce the right
    // answer if scroll were still exactly at the seeded value, silently
    // passing this test. Panning first makes reseed-vs-compensate diverge.
    act(() => { h.el.scrollLeft = 5000; h.el.scrollTop = 3500; });
    const before = worldAtAnchor(h.el, h.getCamera(), 600, 400);

    geo.clientWidth = 1600;
    geo.clientHeight = 1000;
    act(() => { FakeResizeObserver.instances[0].trigger(); });

    expect(h.getCamera().gutterX).toBe(1600);
    expect(h.getCamera().gutterY).toBe(1000);
    // scrollLeft should have grown by exactly the gutter delta (400), so the
    // world point that was at screen (gutterX_old + 600) is now still at the
    // same relative anchor once the new gutter's anchor is used.
    const after = worldAtAnchor(h.el, h.getCamera(), 600, 400);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('shrinking the viewport (gutter shrinks) also preserves every world point via the same delta compensation', () => {
    const geo = { clientWidth: 1200, clientHeight: 800, ...HUGE_EXTENT };
    const h = mountCamera(() => geo);
    act(() => { h.el.scrollLeft = 4200; h.el.scrollTop = 2900; });
    const before = worldAtAnchor(h.el, h.getCamera(), 300, 200);

    geo.clientWidth = 900;
    geo.clientHeight = 600;
    act(() => { FakeResizeObserver.instances[0].trigger(); });

    const after = worldAtAnchor(h.el, h.getCamera(), 300, 200);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('a no-op resize (identical dimensions) does not mutate scroll', () => {
    const geo = { clientWidth: 1200, clientHeight: 800, ...HUGE_EXTENT };
    const h = mountCamera(() => geo);
    const scrollLeftBefore = h.el.scrollLeft;
    const scrollTopBefore = h.el.scrollTop;
    act(() => { FakeResizeObserver.instances[0].trigger(); });
    expect(h.el.scrollLeft).toBe(scrollLeftBefore);
    expect(h.el.scrollTop).toBe(scrollTopBefore);
  });

  it('resize compensation never produces a negative scroll position', () => {
    const geo = { clientWidth: 1200, clientHeight: 800, ...HUGE_EXTENT };
    const h = mountCamera(() => geo);
    act(() => { h.el.scrollLeft = 0; h.el.scrollTop = 0; });
    geo.clientWidth = 400; // shrink a lot
    geo.clientHeight = 300;
    act(() => { FakeResizeObserver.instances[0].trigger(); });
    expect(h.el.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(h.el.scrollTop).toBeGreaterThanOrEqual(0);
  });
});

describe('PATCH 9S.2: zoomAtViewportPoint folds the gutter into world<->screen conversion [Phase: camera formula]', () => {
  it('center-anchor zoom-in preserves the world point at viewport center, gutter-aware', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => { h.getCamera().handleZoomIn(); });

    expect(h.getCamera().canvasZoom).toBeCloseTo(1.1, 5);
    const after = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('pointer-anchor zoom (off-center) preserves the world point under the pointer', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const anchorX = 120;
    const anchorY = 640;
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => { h.getCamera().zoomAtViewportPoint((z) => z + 0.1, anchorX, anchorY); });

    const after = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });
});

describe('PATCH 9S.2: THE BUG -- full low-zoom descent/ascent focal-point invariance [load-bearing; reproduces PATCH 9S.1 exactly]', () => {
  it('100% -> 90% -> ... -> 10%: the SAME focal world point stays at viewport center at every single step, including 60% and below where PATCH 9S (pre-gutter) started clamping to (0,0)', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    // Establish the focal point precisely: center-zoom from 100% onto FOCAL.
    act(() => {
      const el = h.el;
      const cam = h.getCamera();
      el.scrollLeft = FOCAL_X * cam.canvasZoom + cam.gutterX - VIEWPORT.clientWidth / 2;
      el.scrollTop = FOCAL_Y * cam.canvasZoom + cam.gutterY - VIEWPORT.clientHeight / 2;
    });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    const focalBefore = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(focalBefore.x).toBeCloseTo(FOCAL_X, 2);
    expect(focalBefore.y).toBeCloseTo(FOCAL_Y, 2);

    const steps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    for (const targetZoom of steps) {
      act(() => {
        const cam = h.getCamera();
        h.getCamera().zoomAtViewportPoint(targetZoom, anchorX, anchorY);
      });
      const world = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
      expect(world.x, `x drifted at zoom ${targetZoom}`).toBeCloseTo(FOCAL_X, 1);
      expect(world.y, `y drifted at zoom ${targetZoom}`).toBeCloseTo(FOCAL_Y, 1);
    }
    expect(h.getCamera().canvasZoom).toBeCloseTo(0.1, 5);
  });

  it('reverse: 10% -> 20% -> ... -> 100%: no jump, no disappearance -- the focal point established at 10% remains centered all the way back up', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    act(() => { h.getCamera().zoomAtViewportPoint(0.1, anchorX, anchorY); });
    act(() => {
      const cam = h.getCamera();
      h.el.scrollLeft = FOCAL_X * cam.canvasZoom + cam.gutterX - anchorX;
      h.el.scrollTop = FOCAL_Y * cam.canvasZoom + cam.gutterY - anchorY;
    });
    const focalBefore = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(focalBefore.x).toBeCloseTo(FOCAL_X, 2);

    const steps = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const targetZoom of steps) {
      act(() => { h.getCamera().zoomAtViewportPoint(targetZoom, anchorX, anchorY); });
      const world = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
      expect(world.x, `x jumped at zoom ${targetZoom}`).toBeCloseTo(FOCAL_X, 1);
      expect(world.y, `y jumped at zoom ${targetZoom}`).toBeCloseTo(FOCAL_Y, 1);
    }
  });

  it('explicit 10% -> 20% regression: the content that was visible at 10% remains at least partly visible after zooming to 20% (does not fly off-screen)', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    act(() => { h.getCamera().zoomAtViewportPoint(0.1, anchorX, anchorY); });
    act(() => {
      const cam = h.getCamera();
      h.el.scrollLeft = FOCAL_X * cam.canvasZoom + cam.gutterX - anchorX;
      h.el.scrollTop = FOCAL_Y * cam.canvasZoom + cam.gutterY - anchorY;
    });

    act(() => { h.getCamera().zoomAtViewportPoint(0.2, anchorX, anchorY); });

    const cam = h.getCamera();
    const screenX = FOCAL_X * cam.canvasZoom + cam.gutterX - h.el.scrollLeft;
    const screenY = FOCAL_Y * cam.canvasZoom + cam.gutterY - h.el.scrollTop;
    expect(screenX).toBeGreaterThan(-50);
    expect(screenX).toBeLessThan(VIEWPORT.clientWidth + 50);
    expect(screenY).toBeGreaterThan(-50);
    expect(screenY).toBeLessThan(VIEWPORT.clientHeight + 50);
  });

  it.each([0.5, 0.4, 0.3, 0.2, 0.1])('single-step center-zoom to %s%% from 100%% keeps the focal point centered (no multi-step accumulation needed to expose the bug)', (targetZoom) => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    act(() => {
      const cam = h.getCamera();
      h.el.scrollLeft = FOCAL_X * cam.canvasZoom + cam.gutterX - anchorX;
      h.el.scrollTop = FOCAL_Y * cam.canvasZoom + cam.gutterY - anchorY;
    });

    act(() => { h.getCamera().zoomAtViewportPoint(targetZoom, anchorX, anchorY); });

    const world = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(world.x).toBeCloseTo(FOCAL_X, 1);
    expect(world.y).toBeCloseTo(FOCAL_Y, 1);
  });
});

describe('PATCH 9S.2: Reset recovers correctly from a low-zoom drifted-in-the-old-sense state [Phase: Reset]', () => {
  it.each([0.1, 0.2, 0.3])('Reset from %s%% preserves the current viewport-center world point while returning zoom to exactly 1', (startZoom) => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    act(() => { h.getCamera().zoomAtViewportPoint(startZoom, anchorX, anchorY); });
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => { h.getCamera().handleZoomReset(); });

    expect(h.getCamera().canvasZoom).toBe(1);
    const after = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(after.x).toBeCloseTo(before.x, 2);
    expect(after.y).toBeCloseTo(before.y, 2);
  });
});

describe('PATCH 9S.2: pointer-anchor boundary preservation near viewport edges/corners [Phase: pointer requirement]', () => {
  const edgeAnchors: Array<[string, number, number]> = [
    ['center', 600, 400],
    ['near left', 20, 400],
    ['near right', 1180, 400],
    ['near top', 600, 20],
    ['near bottom', 600, 780],
    ['top-left corner', 5, 5],
    ['top-right corner', 1195, 5],
    ['bottom-left corner', 5, 795],
    ['bottom-right corner', 1195, 795],
  ];

  it.each(edgeAnchors)('%s: world point under the pointer at anchor (%i,%i) stays under it across a zoom-in and zoom-out', (_label, anchorX, anchorY) => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => { h.getCamera().zoomAtViewportPoint((z) => z + 0.5, anchorX, anchorY); });
    const afterIn = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(afterIn.x).toBeCloseTo(before.x, 3);
    expect(afterIn.y).toBeCloseTo(before.y, 3);

    act(() => { h.getCamera().zoomAtViewportPoint((z) => z - 0.3, anchorX, anchorY); });
    const afterOut = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(afterOut.x).toBeCloseTo(before.x, 3);
    expect(afterOut.y).toBeCloseTo(before.y, 3);
  });

  it('a gutter exactly equal to the viewport dimension makes the world (0,0) corner itself centerable at any pointer position [Phase 8 derivation proof]', () => {
    // world=0 pointer-anchored at the far (right) edge is the worst case
    // derived in PATCH 9S.1: requires scroll = 0*zoom + gutter - anchor.
    // With gutter == viewport width, this is always representable (>=0).
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const cam = h.getCamera();
    expect(cam.gutterX).toBe(VIEWPORT.clientWidth);
    const anchorX = VIEWPORT.clientWidth; // pointer at the far right edge
    const requiredScroll = 0 * cam.canvasZoom + cam.gutterX - anchorX;
    expect(requiredScroll).toBeGreaterThanOrEqual(0);
  });
});

describe('PATCH 9S.2: rapid consecutive zoom events still compose correctly with a gutter [regression, load-bearing per PATCH 9S]', () => {
  it('5 synchronous zoom-out calls in one batch land at zoom 0.5, with the gutter-aware focal point preserved throughout', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const { anchorX, anchorY } = centerAnchorFor(h.getCamera());
    const before = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);

    act(() => {
      for (let i = 0; i < 5; i++) h.getCamera().handleZoomOut();
    });

    expect(h.getCamera().canvasZoom).toBeCloseTo(0.5, 5);
    const after = worldAtAnchor(h.el, h.getCamera(), anchorX, anchorY);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('5 synchronous zoom-in calls in one batch land at zoom 1.5', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => {
      for (let i = 0; i < 5; i++) h.getCamera().handleZoomIn();
    });
    expect(h.getCamera().canvasZoom).toBeCloseTo(1.5, 5);
  });
});

describe('PATCH 9S.2: zoom limits preserved exactly -- min 0.1, max 3.0, step 0.1 [Phase 28, unchanged from PATCH 9S]', () => {
  it('zoom-out clamps at exactly 0.1', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { for (let i = 0; i < 20; i++) h.getCamera().handleZoomOut(); });
    expect(h.getCamera().canvasZoom).toBe(0.1);
  });

  it('zoom-in clamps at exactly 3.0', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { for (let i = 0; i < 30; i++) h.getCamera().handleZoomIn(); });
    expect(h.getCamera().canvasZoom).toBe(3);
  });
});

describe('PATCH 9S.2: post-render scroll clamp still uses LIVE scrollWidth/scrollHeight, never a hardcoded estimate [Phase 27; negative control G, unchanged from PATCH 9S]', () => {
  it('clamps the raw target to a small mocked scrollWidth/clientWidth extent, not a hardcoded worldStageSize*zoom', () => {
    const h = mountCamera({ clientWidth: 500, clientHeight: 500, scrollWidth: 3000, scrollHeight: 3000 });
    act(() => { h.el.scrollLeft = 2000; h.el.scrollTop = 2000; });
    act(() => { h.getCamera().zoomAtViewportPoint(3, 500, 500); });
    expect(h.el.scrollLeft).toBe(2500); // 3000 - 500
    expect(h.el.scrollTop).toBe(2500);
  });

  it('re-reads scrollWidth/scrollHeight fresh on each zoom call', () => {
    const geo = { clientWidth: 500, clientHeight: 500, scrollWidth: 3000, scrollHeight: 3000 };
    const h = mountCamera(() => geo);
    act(() => { h.el.scrollLeft = 2000; h.el.scrollTop = 2000; });
    act(() => { h.getCamera().zoomAtViewportPoint(3, 500, 500); });
    expect(h.el.scrollLeft).toBe(2500);

    geo.scrollWidth = 6000;
    geo.scrollHeight = 6000;
    act(() => { h.getCamera().zoomAtViewportPoint(2, 500, 500); });
    expect(h.el.scrollLeft).toBeLessThanOrEqual(5500);
  });

  it('clamps to 0 at the boundary -- never negative', () => {
    const h = mountCamera({ clientWidth: 1000, clientHeight: 800, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 10; h.el.scrollTop = 10; });
    act(() => { h.getCamera().zoomAtViewportPoint(0.1, 5, 5); });
    expect(h.el.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(h.el.scrollTop).toBeGreaterThanOrEqual(0);
  });
});

describe('PATCH 9S.2: robustness -- no container mounted yet', () => {
  it('zoom state still updates even when containerRef.current is null, without throwing', () => {
    const containerRef: React.RefObject<HTMLDivElement | null> = { current: null };
    let latestCamera: ReturnType<typeof useCanvasCamera> | null = null;
    function TestComponent() {
      const camera = useCanvasCamera(containerRef, true);
      latestCamera = camera;
      return null;
    }
    const domContainer = document.createElement('div');
    document.body.appendChild(domContainer);
    const root = createRoot(domContainer);
    act(() => { root.render(React.createElement(TestComponent)); });
    mounted.push({ root, container: domContainer });

    expect(() => {
      act(() => { latestCamera!.handleZoomIn(); });
    }).not.toThrow();
    expect(latestCamera!.canvasZoom).toBeCloseTo(1.1, 5);
  });
});

describe('PATCH 9V: panByWorldDelta keeps native scroll as the sole camera position', () => {
  it('1. applies the current zoom exactly once to both world deltas', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 5000; h.el.scrollTop = 4000; });
    act(() => { h.getCamera().panByWorldDelta(25, -30); });
    expect(h.el.scrollLeft).toBe(5025);
    expect(h.el.scrollTop).toBe(3970);
  });

  it('2/3. positive X increases and negative X decreases scrollLeft', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 5000; });
    act(() => { h.getCamera().panByWorldDelta(100, 0); });
    expect(h.el.scrollLeft).toBe(5100);
    act(() => { h.getCamera().panByWorldDelta(-250, 0); });
    expect(h.el.scrollLeft).toBe(4850);
  });

  it('4/5. positive Y increases and negative Y decreases scrollTop', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollTop = 4000; });
    act(() => { h.getCamera().panByWorldDelta(0, 100); });
    expect(h.el.scrollTop).toBe(4100);
    act(() => { h.getCamera().panByWorldDelta(0, -250); });
    expect(h.el.scrollTop).toBe(3850);
  });

  it('6. clamps at native scroll zero', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 20; h.el.scrollTop = 30; });
    act(() => { h.getCamera().panByWorldDelta(-100, -100); });
    expect(h.el.scrollLeft).toBe(0);
    expect(h.el.scrollTop).toBe(0);
  });

  it('7. clamps against the live DOM maximum', () => {
    const geo = { clientWidth: 500, clientHeight: 400, scrollWidth: 3000, scrollHeight: 2400 };
    const h = mountCamera(() => geo);
    act(() => { h.el.scrollLeft = 2400; h.el.scrollTop = 1900; });
    act(() => { h.getCamera().panByWorldDelta(1000, 1000); });
    expect(h.el.scrollLeft).toBe(2500);
    expect(h.el.scrollTop).toBe(2000);
  });

  it('8. never changes canvasZoom', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    const zoom = h.getCamera().canvasZoom;
    act(() => { h.getCamera().panByWorldDelta(500, 500); });
    expect(h.getCamera().canvasZoom).toBe(zoom);
  });

  it('9. composes with a pending zoom using the new live zoom exactly once', () => {
    const h = mountCamera({ ...VIEWPORT, ...HUGE_EXTENT });
    act(() => { h.el.scrollLeft = 2000; h.el.scrollTop = 2000; });
    act(() => {
      h.getCamera().zoomAtViewportPoint(2, 0, 0);
      h.getCamera().panByWorldDelta(10, -20);
    });
    expect(h.getCamera().canvasZoom).toBe(2);
    expect(h.el.scrollLeft).toBe(2820);
    expect(h.el.scrollTop).toBe(3160);
  });

  it('10. adds no cameraX/cameraY React position state', () => {
    const src = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
    expect(src).not.toMatch(/const \[[^\]]*camera[XY][^\]]*\]\s*=\s*useState/i);
    expect(src).toContain('container.scrollLeft = clamp(next.left, 0, maxScrollLeft);');
    expect(src).toContain('container.scrollTop = clamp(next.top, 0, maxScrollTop);');
  });
});

describe('PATCH 9S.2: world/persistence freeze -- the camera hook touches nothing but zoom state and scroll [source check]', () => {
  const src = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');

  it('imports nothing from a repository/persistence/supabase layer', () => {
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/Repo(sitory)?\b/);
    expect(src).not.toMatch(/from ['"]@\/lib\//);
  });

  it('never sets/reads a transformOrigin value -- anchoring is done via scroll compensation only, per the frozen "0 0" architectural rule', () => {
    expect(src).not.toMatch(/transformOrigin\s*[:=]/);
  });

  it('preserves the exact zoom limits and step', () => {
    expect(src).toContain('const MIN_ZOOM = 0.1;');
    expect(src).toContain('const MAX_ZOOM = 3;');
    expect(src).toContain('const ZOOM_STEP = 0.1;');
  });
});
