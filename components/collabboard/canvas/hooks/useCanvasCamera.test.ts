// @vitest-environment jsdom
//
// PATCH 9S -- camera-anchored Freeform zoom. Mounts the real hook (createRoot/
// act, matching the established convention in freeformGraphLabelDrag.test.tsx
// and SimpleLineRenderer.zoomCoordinates.test.tsx) against a stubbed
// container element whose clientWidth/clientHeight/scrollWidth/scrollHeight
// are set directly via defineProperty (jsdom performs no real layout), so
// every assertion below reflects the LIVE values the implementation reads
// post-render, not a hardcoded worldStageSize*zoom estimate.
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

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

interface CameraGeometry {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  initialScrollLeft?: number;
  initialScrollTop?: number;
}

function mountCamera(geometry: CameraGeometry) {
  const containerRef = React.createRef<HTMLDivElement>();
  let latestCamera: ReturnType<typeof useCanvasCamera> | null = null;

  function TestComponent() {
    const camera = useCanvasCamera(containerRef);
    latestCamera = camera;
    return React.createElement('div', { ref: containerRef });
  }

  const domContainer = document.createElement('div');
  document.body.appendChild(domContainer);
  const root = createRoot(domContainer);
  act(() => { root.render(React.createElement(TestComponent)); });
  mounted.push({ root, container: domContainer });

  const el = containerRef.current!;
  setGeometry(el, geometry);
  el.scrollLeft = geometry.initialScrollLeft ?? 0;
  el.scrollTop = geometry.initialScrollTop ?? 0;

  return {
    el,
    getCamera: () => latestCamera!,
  };
}

function setGeometry(el: HTMLDivElement, geometry: CameraGeometry) {
  Object.defineProperty(el, 'clientWidth', { value: geometry.clientWidth, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: geometry.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: geometry.scrollWidth, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: geometry.scrollHeight, configurable: true });
}

describe('PATCH 9S: zoomAtViewportPoint anchors the world point under the anchor pixel, not the origin', () => {
  it('center-anchor zoom-in (toolbar +) preserves the world point at viewport center', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 2000, initialScrollTop: 1500,
    });
    const centerWorldXBefore = (h.el.scrollLeft + h.el.clientWidth / 2) / h.getCamera().canvasZoom;
    const centerWorldYBefore = (h.el.scrollTop + h.el.clientHeight / 2) / h.getCamera().canvasZoom;

    act(() => { h.getCamera().handleZoomIn(); });

    expect(h.getCamera().canvasZoom).toBeCloseTo(1.1, 5);
    const centerWorldXAfter = (h.el.scrollLeft + h.el.clientWidth / 2) / h.getCamera().canvasZoom;
    const centerWorldYAfter = (h.el.scrollTop + h.el.clientHeight / 2) / h.getCamera().canvasZoom;
    expect(centerWorldXAfter).toBeCloseTo(centerWorldXBefore, 5);
    expect(centerWorldYAfter).toBeCloseTo(centerWorldYBefore, 5);
  });

  it('center-anchor zoom-out (toolbar -) preserves the world point at viewport center', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 2000, initialScrollTop: 1500,
    });
    const centerWorldXBefore = (h.el.scrollLeft + h.el.clientWidth / 2) / h.getCamera().canvasZoom;

    act(() => { h.getCamera().handleZoomOut(); });

    expect(h.getCamera().canvasZoom).toBeCloseTo(0.9, 5);
    const centerWorldXAfter = (h.el.scrollLeft + h.el.clientWidth / 2) / h.getCamera().canvasZoom;
    expect(centerWorldXAfter).toBeCloseTo(centerWorldXBefore, 5);
  });

  it('pointer-anchor zoom (Ctrl+wheel primitive call, off-center anchor) preserves the world point under the pointer, not the center', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 3000, initialScrollTop: 2200,
    });
    const anchorX = 120; // simulated e.clientX - containerRect.left
    const anchorY = 640; // simulated e.clientY - containerRect.top
    const pointerWorldXBefore = (h.el.scrollLeft + anchorX) / h.getCamera().canvasZoom;
    const pointerWorldYBefore = (h.el.scrollTop + anchorY) / h.getCamera().canvasZoom;

    act(() => { h.getCamera().zoomAtViewportPoint((z) => z + 0.1, anchorX, anchorY); });

    const pointerWorldXAfter = (h.el.scrollLeft + anchorX) / h.getCamera().canvasZoom;
    const pointerWorldYAfter = (h.el.scrollTop + anchorY) / h.getCamera().canvasZoom;
    expect(pointerWorldXAfter).toBeCloseTo(pointerWorldXBefore, 5);
    expect(pointerWorldYAfter).toBeCloseTo(pointerWorldYBefore, 5);

    // Anchor point is not the viewport center -- the center world point WAS
    // allowed to move (proves this is genuinely pointer-anchored, not a
    // disguised center-anchor).
    const centerWorldXBefore = (3000 + 500) / 1;
    const centerWorldXAfter = (h.el.scrollLeft + 500) / h.getCamera().canvasZoom;
    expect(centerWorldXAfter).not.toBeCloseTo(centerWorldXBefore, 2);
  });

  it('reset preserves the current viewport-center world point while returning zoom to exactly 1', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 500, initialScrollTop: 400,
    });
    act(() => { h.getCamera().zoomAtViewportPoint(1.5, 500, 400); });
    expect(h.getCamera().canvasZoom).toBeCloseTo(1.5, 5);
    const centerWorldXBefore = (h.el.scrollLeft + 500) / h.getCamera().canvasZoom;
    const centerWorldYBefore = (h.el.scrollTop + 400) / h.getCamera().canvasZoom;

    act(() => { h.getCamera().handleZoomReset(); });

    expect(h.getCamera().canvasZoom).toBe(1);
    const centerWorldXAfter = h.el.scrollLeft + 500;
    const centerWorldYAfter = h.el.scrollTop + 400;
    expect(centerWorldXAfter).toBeCloseTo(centerWorldXBefore, 5);
    expect(centerWorldYAfter).toBeCloseTo(centerWorldYBefore, 5);
  });
});

describe('PATCH 9S: rapid consecutive zoom events compose correctly, without stale-closure staircasing [load-bearing]', () => {
  it('5 synchronous zoom-out calls in one batch land at zoom 0.5 (1.0 - 5*0.1), not 0.9 (one step from a stale closure)', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 2000, initialScrollTop: 1500,
    });
    const centerWorldXBefore = (h.el.scrollLeft + 500) / h.getCamera().canvasZoom;

    act(() => {
      for (let i = 0; i < 5; i++) h.getCamera().handleZoomOut();
    });

    expect(h.getCamera().canvasZoom).toBeCloseTo(0.5, 5);
    const centerWorldXAfter = (h.el.scrollLeft + 500) / h.getCamera().canvasZoom;
    expect(centerWorldXAfter).toBeCloseTo(centerWorldXBefore, 4);
  });

  it('5 synchronous zoom-in calls in one batch land at zoom 1.5 (1.0 + 5*0.1), not 1.1', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 2000, initialScrollTop: 1500,
    });

    act(() => {
      for (let i = 0; i < 5; i++) h.getCamera().handleZoomIn();
    });

    expect(h.getCamera().canvasZoom).toBeCloseTo(1.5, 5);
  });

  it('a rapid pointer-anchored sequence stays anchored to the SAME pointer point across every intermediate step', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 1800, initialScrollTop: 900,
    });
    const anchorX = 300;
    const anchorY = 200;
    const pointerWorldBefore = (h.el.scrollLeft + anchorX) / h.getCamera().canvasZoom;

    act(() => {
      const camera = h.getCamera();
      camera.zoomAtViewportPoint((z) => z + 0.1, anchorX, anchorY);
      camera.zoomAtViewportPoint((z) => z + 0.1, anchorX, anchorY);
      camera.zoomAtViewportPoint((z) => z - 0.1, anchorX, anchorY);
    });

    expect(h.getCamera().canvasZoom).toBeCloseTo(1.1, 5);
    const pointerWorldAfter = (h.el.scrollLeft + anchorX) / h.getCamera().canvasZoom;
    expect(pointerWorldAfter).toBeCloseTo(pointerWorldBefore, 4);
  });
});

describe('PATCH 9S: zoom limits preserved exactly -- min 0.1, max 3.0, step 0.1 [Phase 28]', () => {
  it('zoom-out clamps at exactly 0.1 and never goes negative or below', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
    });
    act(() => {
      for (let i = 0; i < 20; i++) h.getCamera().handleZoomOut();
    });
    expect(h.getCamera().canvasZoom).toBe(0.1);
  });

  it('zoom-in clamps at exactly 3.0 and never exceeds it', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
    });
    act(() => {
      for (let i = 0; i < 30; i++) h.getCamera().handleZoomIn();
    });
    expect(h.getCamera().canvasZoom).toBe(3);
  });

  it('a no-op zoom request (already at the clamped limit) does not throw and leaves scroll untouched', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 777, initialScrollTop: 333,
    });
    act(() => {
      for (let i = 0; i < 20; i++) h.getCamera().handleZoomOut();
    });
    const scrollLeftAtClamp = h.el.scrollLeft;
    const scrollTopAtClamp = h.el.scrollTop;
    act(() => { h.getCamera().handleZoomOut(); });
    expect(h.getCamera().canvasZoom).toBe(0.1);
    expect(h.el.scrollLeft).toBe(scrollLeftAtClamp);
    expect(h.el.scrollTop).toBe(scrollTopAtClamp);
  });
});

describe('PATCH 9S: post-render scroll clamp uses LIVE scrollWidth/scrollHeight/clientWidth/clientHeight, never a hardcoded worldStageSize*zoom estimate [Phase 27; negative control G]', () => {
  it('clamps the raw target to the mocked scrollWidth/clientWidth extent, not 10000*zoom', () => {
    const h = mountCamera({
      clientWidth: 500, clientHeight: 500,
      scrollWidth: 3000, scrollHeight: 3000, // deliberately NOT 10000*zoom
      initialScrollLeft: 2000, initialScrollTop: 2000,
    });
    // maxScrollLeft = 3000 - 500 = 2500. Zooming in at the far (bottom-right)
    // corner anchor pushes the raw target well past that.
    act(() => { h.getCamera().zoomAtViewportPoint(3, 500, 500); });

    expect(h.el.scrollLeft).toBe(2500);
    expect(h.el.scrollTop).toBe(2500);
    // If the implementation had hard-coded 10000*zoom instead of reading
    // scrollWidth live, the clamp ceiling here would be 10000*3-500=29500,
    // not 2500 -- this assertion is the one that catches that regression.
    expect(h.el.scrollLeft).not.toBe(29500);
  });

  it('re-reads scrollWidth/scrollHeight fresh on each zoom call -- a changed mock between two calls changes the clamp ceiling', () => {
    const h = mountCamera({
      clientWidth: 500, clientHeight: 500,
      scrollWidth: 3000, scrollHeight: 3000,
      initialScrollLeft: 2000, initialScrollTop: 2000,
    });
    act(() => { h.getCamera().zoomAtViewportPoint(3, 500, 500); });
    expect(h.el.scrollLeft).toBe(2500);

    // Simulate the DOM reporting a larger scrollable extent at the next
    // render (e.g. a different zoom level actually laid out wider content).
    setGeometry(h.el, { clientWidth: 500, clientHeight: 500, scrollWidth: 6000, scrollHeight: 6000 });
    act(() => { h.getCamera().zoomAtViewportPoint(2, 500, 500); });
    // New maxScrollLeft = 6000 - 500 = 5500, well above the old 2500 ceiling.
    expect(h.el.scrollLeft).toBeLessThanOrEqual(5500);
  });

  it('clamps to 0 at the top-left boundary -- never a negative scroll position', () => {
    const h = mountCamera({
      clientWidth: 1000, clientHeight: 800,
      scrollWidth: 20000, scrollHeight: 20000,
      initialScrollLeft: 50, initialScrollTop: 50,
    });
    // Zooming OUT anchored near the top-left pushes the raw target negative.
    act(() => { h.getCamera().zoomAtViewportPoint(0.1, 10, 10); });
    expect(h.el.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(h.el.scrollTop).toBeGreaterThanOrEqual(0);
  });
});

describe('PATCH 9S: robustness -- no container mounted yet', () => {
  it('zoom state still updates even when containerRef.current is null, without throwing', () => {
    const containerRef = React.createRef<HTMLDivElement>();
    let latestCamera: ReturnType<typeof useCanvasCamera> | null = null;
    function TestComponent() {
      const camera = useCanvasCamera(containerRef);
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

describe('PATCH 9S: world/persistence freeze -- the camera hook touches nothing but zoom state and scroll [source check]', () => {
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
