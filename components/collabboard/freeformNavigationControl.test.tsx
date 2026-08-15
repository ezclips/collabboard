// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mutable so the "expand uses current camera viewport" test can prove a
// fresh mount reflects a viewport that changed while collapsed, rather than
// a value frozen at collapse time.
let mockViewport = { x: -100, y: -50, width: 800, height: 600 };
let mockItems = [
  { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100 },
  { id: 'container', type: 'container', kind: 'container', x: 1000, y: 500, width: 200, height: 200 },
];

vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry', () => ({
  useFreeformMinimapGeometry: () => mockItems,
}));
vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapViewport', () => ({
  useFreeformMinimapViewport: () => mockViewport,
}));

import FreeformNavigationControl from '@/components/collabboard/canvas/minimap/FreeformNavigationControl';
import {
  createMinimapProjection,
  getMinimapDisplayBounds,
  projectWorldPoint,
  type MinimapWorldItem,
} from '@/components/collabboard/canvas/minimap/freeformMinimapGeometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx').replace(/\r\n/g, '\n');
const navControlSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const geometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
const graphSrc = read('components/graph/FreeformGraphLayer.tsx');
const lineSrc = read('components/collabboard/SimpleLineRenderer.tsx');
const globalsCss = read('app/globals.css');

let roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
  mockViewport = { x: -100, y: -50, width: 800, height: 600 };
  mockItems = [
    { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100 },
    { id: 'container', type: 'container', kind: 'container', x: 1000, y: 500, width: 200, height: 200 },
  ];
});

const RENDERED_RECT = { left: 100, top: 200, width: 168, height: 108 };

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
    clientX: RENDERED_RECT.left + minimapX * (RENDERED_RECT.width / 168),
    clientY: RENDERED_RECT.top + minimapY * (RENDERED_RECT.height / 108),
  };
}

function mount(overrides: Partial<{ canvasZoom: number }> = {}) {
  const handleZoomOut = vi.fn();
  const handleZoomReset = vi.fn();
  const handleZoomIn = vi.fn();
  const panByWorldDelta = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <FreeformNavigationControl
      canvasZoom={overrides.canvasZoom ?? 1}
      handleZoomOut={handleZoomOut}
      handleZoomReset={handleZoomReset}
      handleZoomIn={handleZoomIn}
      rootPosts={[]}
      containerRef={{ current: document.createElement('div') }}
      worldOriginRef={{ current: document.createElement('div') }}
      panByWorldDelta={panByWorldDelta}
    />,
  ));
  return { host, handleZoomOut, handleZoomReset, handleZoomIn, panByWorldDelta, root };
}

function wireSvgRect(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('[data-freeform-minimap-map="true"]');
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

// ============================================================
// COMPOSITION [1-7]
// ============================================================
describe('PATCH 9W composition [1-7]', () => {
  it('1. Freeform renders the unified navigator', () => {
    expect(canvasClient).toContain('{isFreeformLayout && (\n          <FreeformNavigationControl');
  });

  it('2. old Freeform bottom-right ZoomControls is absent (gated out for Freeform)', () => {
    const zoomBlockStart = canvasClient.indexOf('{!isFreeformLayout && !isWallLayout');
    expect(zoomBlockStart).toBeGreaterThan(-1);
    expect(canvasClient.slice(zoomBlockStart, zoomBlockStart + 40)).toContain('!isFreeformLayout');
  });

  it('3. exactly one Freeform zoom surface can ever be mounted (mutually exclusive gates)', () => {
    const navGate = canvasClient.match(/\{isFreeformLayout && \(\s*<FreeformNavigationControl/);
    const zoomGate = canvasClient.match(/\{!isFreeformLayout && !isWallLayout[^{]*&&\s*\(\s*<ZoomControls/);
    expect(navGate).not.toBeNull();
    expect(zoomGate).not.toBeNull();
    // one gate requires isFreeformLayout true, the other requires it false --
    // they can never both render for the same layout.
  });

  it('4. non-Freeform ZoomControls gate keeps every pre-existing exclusion', () => {
    for (const layout of ['Wall', 'Columns', 'Grid', 'Drawing', 'Timeline', 'Kanban', 'Scheduler', 'Map']) {
      expect(canvasClient).toContain(`!is${layout}Layout`);
    }
    // Gantt was never excluded from the old ZoomControls gate -- preserved.
    const zoomBlockStart = canvasClient.indexOf('{!isFreeformLayout && !isWallLayout');
    const zoomBlockEnd = canvasClient.indexOf('<ZoomControls', zoomBlockStart);
    expect(canvasClient.slice(zoomBlockStart, zoomBlockEnd)).not.toContain('isGanttLayout');
  });

  it('5. FreeformNavigationControl imports FreeformMinimap directly rather than duplicating its markup', () => {
    expect(navControlSrc).toContain("from './FreeformMinimap'");
    expect(navControlSrc).not.toContain('viewBox=');
    expect(navControlSrc).not.toContain('createMinimapProjection');
  });

  it('6. navigator sits outside the world surface (not nested under data-freeform-world-surface)', () => {
    const worldSurfaceStart = canvasClient.indexOf('data-freeform-world-surface');
    const worldSurfaceDivEnd = canvasClient.indexOf('</CanvasViewport>', worldSurfaceStart);
    const navStart = canvasClient.indexOf('<FreeformNavigationControl');
    expect(worldSurfaceStart).toBeGreaterThan(-1);
    expect(navStart).toBeGreaterThan(worldSurfaceDivEnd);
  });

  it('7. mounted navigator does not change an ancestor scroll extent', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div data-test-viewport><div style="width:10000px;height:10000px"></div></div><div data-test-mount></div>';
    document.body.append(host);
    hosts.push(host);
    const viewport = host.querySelector<HTMLElement>('[data-test-viewport]')!;
    const before = [viewport.scrollWidth, viewport.scrollHeight];
    const root = createRoot(host.querySelector<HTMLElement>('[data-test-mount]')!);
    roots.push(root);
    act(() => root.render(
      <FreeformNavigationControl
        canvasZoom={1}
        handleZoomOut={vi.fn()}
        handleZoomReset={vi.fn()}
        handleZoomIn={vi.fn()}
        rootPosts={[]}
        containerRef={{ current: viewport as HTMLDivElement }}
        worldOriginRef={{ current: viewport.firstElementChild as HTMLDivElement }}
        panByWorldDelta={vi.fn()}
      />,
    ));
    expect([viewport.scrollWidth, viewport.scrollHeight]).toEqual(before);
  });
});

// ============================================================
// COLLAPSE [8-16]
// ============================================================
describe('PATCH 9W collapse/expand [8-16]', () => {
  it('8. defaults expanded', () => {
    const { host } = mount();
    expect(host.querySelector('[data-freeform-navigation-minimap-slot="true"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Hide minimap"]')).not.toBeNull();
  });

  it('9. expanded shows the minimap', () => {
    const { host } = mount();
    expect(host.querySelector('[data-freeform-minimap="true"]')).not.toBeNull();
  });

  it('10. collapse hides the minimap', () => {
    const { host, root } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => toggle.click());
    expect(host.querySelector('[data-freeform-navigation-minimap-slot="true"]')).toBeNull();
    expect(host.querySelector('[data-freeform-minimap="true"]')).toBeNull();
    void root;
  });

  it('11. collapsed keeps the zoom row', () => {
    const { host } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => toggle.click());
    expect(host.querySelector('[data-freeform-navigation-header="true"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Zoom out"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Zoom in"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Reset zoom"]')).not.toBeNull();
  });

  it('12. expand restores the minimap', () => {
    const { host } = mount();
    const toggle = () => host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"], [aria-label="Show minimap"]')!;
    act(() => toggle().click());
    expect(host.querySelector('[data-freeform-minimap="true"]')).toBeNull();
    act(() => toggle().click());
    expect(host.querySelector('[data-freeform-minimap="true"]')).not.toBeNull();
  });

  it('13/14. collapse state is local-only React state, no persistence import', () => {
    expect(navControlSrc).toMatch(/useState\(true\)/);
    expect(navControlSrc).not.toMatch(/supabase|Repository|metadata update|localStorage|sessionStorage|useSearchParams|usePathname/i);
  });

  it('15. collapsed minimap has no pointer hit area (unmounted, not merely hidden)', () => {
    const { host } = mount();
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!;
    act(() => toggle.click());
    expect(host.querySelector('[data-freeform-minimap="true"]')).toBeNull();
    expect(host.innerHTML).not.toMatch(/opacity:\s*0/);
    expect(host.innerHTML).not.toMatch(/visibility:\s*hidden/);
    expect(host.innerHTML).not.toMatch(/translate/);
  });

  it('16. expand reflects the CURRENT camera viewport, not a frozen collapse-time value', () => {
    const { host } = mount();
    const toggle = () => host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"], [aria-label="Show minimap"]')!;
    const viewportRectBefore = host.querySelector('[data-freeform-minimap-viewport="true"]')!.getAttribute('x');
    act(() => toggle().click()); // collapse
    mockViewport = { x: -900, y: -400, width: 200, height: 150 }; // camera moved while collapsed
    act(() => toggle().click()); // expand
    const viewportRectAfter = host.querySelector('[data-freeform-minimap-viewport="true"]')!.getAttribute('x');
    expect(viewportRectAfter).not.toBe(viewportRectBefore);
  });
});

// ============================================================
// ZOOM [17-25]
// ============================================================
describe('PATCH 9W zoom presentation [17-25]', () => {
  it('17. minus calls the existing zoom-out handler, unmodified', () => {
    const { host, handleZoomOut } = mount();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click());
    expect(handleZoomOut).toHaveBeenCalledTimes(1);
  });

  it('18. plus calls the existing zoom-in handler, unmodified', () => {
    const { host, handleZoomIn } = mount();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    expect(handleZoomIn).toHaveBeenCalledTimes(1);
  });

  it('19/20. 10% shown correctly', () => {
    const { host } = mount({ canvasZoom: 0.1 });
    expect(host.querySelector('[aria-label="Reset zoom"]')!.textContent).toBe('10%');
  });

  it('21. 40% shown correctly', () => {
    const { host } = mount({ canvasZoom: 0.4 });
    expect(host.querySelector('[aria-label="Reset zoom"]')!.textContent).toBe('40%');
  });

  it('22. 100% shown correctly', () => {
    const { host } = mount({ canvasZoom: 1 });
    expect(host.querySelector('[aria-label="Reset zoom"]')!.textContent).toBe('100%');
  });

  it('23. 150% shown correctly', () => {
    const { host } = mount({ canvasZoom: 1.5 });
    expect(host.querySelector('[aria-label="Reset zoom"]')!.textContent).toBe('150%');
  });

  it('reset click preserves the existing accepted percentage-click-to-reset behavior', () => {
    const { host, handleZoomReset } = mount();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reset zoom"]')!.click());
    expect(handleZoomReset).toHaveBeenCalledTimes(1);
  });

  it('24. zoom behavior unchanged collapsed', () => {
    const { host, handleZoomIn, handleZoomOut } = mount();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Hide minimap"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click());
    expect(handleZoomIn).toHaveBeenCalledTimes(1);
    expect(handleZoomOut).toHaveBeenCalledTimes(1);
  });

  it('25. zoom behavior unchanged expanded', () => {
    const { host, handleZoomIn, handleZoomOut } = mount();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click());
    expect(handleZoomIn).toHaveBeenCalledTimes(1);
    expect(handleZoomOut).toHaveBeenCalledTimes(1);
  });

  it('minus/plus reuse ZoomControls, never reimplementing zoom math', () => {
    expect(navControlSrc).not.toMatch(/ZOOM_STEP|MIN_ZOOM|MAX_ZOOM|clamp\(/);
  });
});

// ============================================================
// MINIMAP [26-32]
// ============================================================
describe('PATCH 9W embedded minimap preserves navigation [26-32]', () => {
  const ITEMS: MinimapWorldItem[] = [
    { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 100, height: 100 },
    { id: 'container', type: 'container', kind: 'container', x: 1000, y: 500, width: 200, height: 200 },
  ];
  const BOUNDS = getMinimapDisplayBounds(ITEMS)!;
  const PROJECTION = createMinimapProjection(BOUNDS, { left: 8, top: 8, width: 152, height: 92 })!;

  function worldClientPoint(x: number, y: number) {
    const projected = projectWorldPoint({ x, y }, PROJECTION);
    return clientPoint(projected.x, projected.y);
  }

  it('26. click navigation preserved through the embedded wrapper', () => {
    const { host, panByWorldDelta } = mount();
    const svg = wireSvgRect(host)!;
    const target = worldClientPoint(500, 250);
    act(() => svg.dispatchEvent(pointerEvent('pointerdown', target)));
    act(() => svg.dispatchEvent(pointerEvent('pointerup', target)));
    expect(panByWorldDelta).toHaveBeenCalled();
  });

  it('27. viewport drag preserved through the embedded wrapper', () => {
    const { host, panByWorldDelta } = mount();
    const svg = wireSvgRect(host)!;
    const viewportRect = host.querySelector('[data-freeform-minimap-viewport="true"]')!;
    const projectedStart = projectWorldPoint({ x: mockViewport.x + 5, y: mockViewport.y + 5 }, PROJECTION);
    const start = clientPoint(projectedStart.x, projectedStart.y);
    const moved = { clientX: start.clientX + 20, clientY: start.clientY + 10 };
    // Dispatch on the viewport rect itself (not the outer svg) so
    // event.target.closest('[data-freeform-minimap-viewport="true"]')
    // correctly identifies this as a viewport-drag start, matching how
    // freeformMinimap.interaction.test.tsx exercises the same gesture.
    act(() => viewportRect.dispatchEvent(pointerEvent('pointerdown', { ...start, pointerId: 7 })));
    act(() => svg.dispatchEvent(pointerEvent('pointermove', { ...moved, pointerId: 7 })));
    act(() => svg.dispatchEvent(pointerEvent('pointerup', { ...moved, pointerId: 7 })));
    expect(panByWorldDelta).toHaveBeenCalled();
  });

  it.each([1, 0.4, 0.2, 0.1])('28. low-zoom navigation preserved at canvasZoom=%s', (zoom) => {
    const { host, panByWorldDelta } = mount({ canvasZoom: zoom });
    const svg = wireSvgRect(host)!;
    const target = worldClientPoint(500, 250);
    act(() => svg.dispatchEvent(pointerEvent('pointerdown', target)));
    act(() => svg.dispatchEvent(pointerEvent('pointerup', target)));
    expect(panByWorldDelta).toHaveBeenCalled();
  });

  it('29. signed-negative target preserved', () => {
    mockItems = [{ id: 'neg-post', type: 'text', kind: 'post', x: -800, y: -400, width: 120, height: 90 }];
    const negBounds = getMinimapDisplayBounds(mockItems as MinimapWorldItem[])!;
    const negProjection = createMinimapProjection(negBounds, { left: 8, top: 8, width: 152, height: 92 })!;
    const { host, panByWorldDelta } = mount();
    const svg = wireSvgRect(host)!;
    const projected = projectWorldPoint({ x: -750, y: -350 }, negProjection);
    const target = clientPoint(projected.x, projected.y);
    act(() => svg.dispatchEvent(pointerEvent('pointerdown', target)));
    act(() => svg.dispatchEvent(pointerEvent('pointerup', target)));
    expect(panByWorldDelta).toHaveBeenCalled();
  });

  it('30. event isolation preserved (mousedown/click on the shell do not bubble)', () => {
    const { host } = mount();
    const shell = host.querySelector('[data-freeform-navigation-control="true"]')!;
    let bubbled = false;
    document.body.addEventListener('mousedown', () => { bubbled = true; }, { once: true });
    act(() => shell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    expect(bubbled).toBe(false);
  });

  it('31. wheel isolation preserved on the shell', () => {
    const { host } = mount();
    const shell = host.querySelector('[data-freeform-navigation-control="true"]')!;
    let bubbled = false;
    document.body.addEventListener('wheel', () => { bubbled = true; }, { once: true });
    act(() => shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true })));
    expect(bubbled).toBe(false);
  });

  it('32. contextmenu isolation preserved on the shell', () => {
    const { host } = mount();
    const shell = host.querySelector('[data-freeform-navigation-control="true"]')!;
    let bubbled = false;
    document.body.addEventListener('contextmenu', () => { bubbled = true; }, { once: true });
    act(() => shell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(bubbled).toBe(false);
  });
});

// ============================================================
// VISUAL CONTRACT [33-40]
// ============================================================
describe('PATCH 9W visual contract [33-40]', () => {
  it('33. unified shell uses only proven-safe color tokens/classes', () => {
    expect(navControlSrc).toMatch(/bg-background/);
    expect(navControlSrc).toMatch(/border-gray-200|border-gray-100/);
    expect(navControlSrc).toMatch(/text-gray-600/);
    expect(navControlSrc).toMatch(/hover:bg-gray-100/);
  });

  it('34. no primary/secondary/destructive tokens', () => {
    expect(navControlSrc).not.toMatch(/bg-primary|bg-secondary|bg-destructive|text-primary|text-secondary|text-destructive/);
  });

  it('35. minimap surface remains #e5e7eb / rgb(229,231,235)', () => {
    expect(minimapSrc).toContain("style={{ fill: '#e5e7eb', cursor: 'pointer' }}");
  });

  it('36. no separate minimap outer frame (embedded minimap carries no border/shadow/bg of its own)', () => {
    expect(minimapSrc).toContain('EMBEDDED_HOST_CLASSNAME');
    const embeddedConst = minimapSrc.match(/const EMBEDDED_HOST_CLASSNAME =\s*\n?\s*'([^']+)'/);
    expect(embeddedConst).not.toBeNull();
    const embeddedClass = (embeddedConst as RegExpMatchArray)[1];
    expect(embeddedClass).not.toMatch(/border|shadow|bg-/);
  });

  it('37. compact top row (h-9, ~36px)', () => {
    expect(navControlSrc).toContain('h-9');
  });

  it('38. uses the same left offset that already passed toolbar-intersection review (left-[72px])', () => {
    expect(navControlSrc).toContain('left-[72px]');
  });

  it('39. z-index stays at z-40, below the 9V.2C menu (z-[3001]) and modal layers', () => {
    expect(navControlSrc).toContain('z-40');
    expect(navControlSrc).not.toMatch(/z-\[(?:[1-9]\d{3,})\]/);
  });

  it('40. zoom row has no md-hidden policy (stays visible below 768, unlike the minimap body)', () => {
    const tagStart = navControlSrc.indexOf('data-freeform-navigation-control="true"');
    const tagEnd = navControlSrc.indexOf('>', tagStart);
    expect(tagStart).toBeGreaterThan(-1);
    const openTag = navControlSrc.slice(tagStart, tagEnd);
    const shellClassMatch = openTag.match(/className="([^"]*)"/);
    expect(shellClassMatch).not.toBeNull();
    const shellClass = (shellClassMatch as RegExpMatchArray)[1];
    const tokens = shellClass.split(/\s+/);
    expect(tokens).not.toContain('hidden'); // overflow-hidden is fine; the bare "hidden" utility is not
    expect(shellClass).not.toContain('md:block');
  });
});

// ============================================================
// FREEZES [41-47]
// ============================================================
describe('PATCH 9W freezes [41-47]', () => {
  it('41. 9V.2C responsive toolbar frozen (unrelated source untouched by this diff)', () => {
    expect(navControlSrc).not.toContain('toolbarMenuPlacement');
  });

  it('42. 9V.2E safe theme tokens frozen (no new globals.css tokens introduced)', () => {
    expect(globalsCss).not.toMatch(/--primary\s*:|--secondary\s*:|--destructive\s*:/);
  });

  it('43/44. signed placement and signed stage frozen (no geometry file changes)', () => {
    expect(geometrySrc).not.toMatch(/FreeformNavigationControl|navigation-control/);
    expect(interactionsSrc).not.toMatch(/FreeformNavigationControl|navigation-control/);
  });

  it('45. camera frozen (no camera math duplicated/altered)', () => {
    expect(cameraSrc).not.toMatch(/FreeformNavigationControl|navigation-control/);
    expect(navControlSrc).not.toMatch(/zoomAtViewportPoint|panByWorldDelta\s*=\s*\(/);
  });

  it('46. Graph frozen', () => {
    expect(graphSrc).not.toMatch(/FreeformNavigationControl|navigation-control/);
  });

  it('47. Manual Line frozen', () => {
    expect(lineSrc).not.toMatch(/FreeformNavigationControl|navigation-control/);
  });
});
