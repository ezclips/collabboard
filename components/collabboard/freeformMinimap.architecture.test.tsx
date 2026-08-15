// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry', () => ({
  useFreeformMinimapGeometry: () => ([
    { id: 'post', type: 'text', kind: 'post', x: 0, y: 0, width: 180, height: 100 },
    { id: 'container', type: 'container', kind: 'container', x: 400, y: 200, width: 500, height: 300 },
  ]),
}));
vi.mock('@/components/collabboard/canvas/minimap/useFreeformMinimapViewport', () => ({
  useFreeformMinimapViewport: () => ({ x: -100, y: -50, width: 800, height: 600 }),
}));

import FreeformMinimap from '@/components/collabboard/canvas/minimap/FreeformMinimap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const component = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const geometry = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
const geometryHook = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');
const viewportHook = read('components/collabboard/canvas/minimap/useFreeformMinimapViewport.ts');
const viewportStart = canvasClient.indexOf('<CanvasViewport');
const viewportEnd = canvasClient.indexOf('</CanvasViewport>', viewportStart);
const minimapStart = canvasClient.indexOf('<FreeformMinimap', viewportEnd);

describe('PATCH 9U host gate and DOM placement', () => {
  it('43-45. literal Freeform and the current Table/Stream fallbacks share the existing isFreeformLayout gate', () => {
    expect(canvasClient).toContain("const isFreeformLayout = canvas?.layout === 'freeform' ||");
    expect(canvasClient).not.toContain('isTableLayout');
    expect(canvasClient).not.toContain('isStreamLayout');
    expect(canvasClient.slice(minimapStart - 80, minimapStart)).toContain('{isFreeformLayout && (');
  });

  it.each(['Wall', 'Columns', 'Grid', 'Timeline', 'Scheduler', 'Map', 'Drawing'])('46-52. excludes %s through the frozen predicate', (layout) => {
    expect(canvasClient).toContain(`!is${layout}Layout`);
  });

  it('53. leaves Kanban and Gantt on their named non-Freeform paths', () => {
    expect(canvasClient).toContain('!isKanbanLayout');
    expect(canvasClient).toContain('!isGanttLayout');
  });

  it('54-56. renders after CanvasViewport and therefore outside PadletLayer and the shared world surface', () => {
    expect(viewportStart).toBeGreaterThan(-1);
    expect(viewportEnd).toBeGreaterThan(viewportStart);
    expect(minimapStart).toBeGreaterThan(viewportEnd);
    expect(canvasClient.slice(viewportStart, viewportEnd)).toContain('<PadletLayer');
    expect(canvasClient.slice(viewportStart, viewportEnd)).not.toContain('<FreeformMinimap');
  });

  it('uses the canonical rootPadlets filter rather than inventing a child predicate', () => {
    expect(canvasClient).toContain('padlets.filter(p => !p.metadata?.parentId)');
    expect(canvasClient.slice(minimapStart, minimapStart + 300)).toContain('rootPosts={rootPadlets}');
  });
});

describe('PATCH 9U render-only UI and stacking contract', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it.each([1, 0.4, 0.2, 0.1])('57/58. mounts at zoom %s as a pointer-inert sibling without changing viewport scroll extent', (zoom) => {
    host = document.createElement('div');
    host.innerHTML = '<div data-test-viewport><div style="width:10000px;height:10000px"></div></div><div data-test-mount></div>';
    document.body.append(host);
    const viewport = host.querySelector<HTMLElement>('[data-test-viewport]')!;
    const before = [viewport.scrollWidth, viewport.scrollHeight];
    root = createRoot(host.querySelector<HTMLElement>('[data-test-mount]')!);
    act(() => root?.render(
      <FreeformMinimap
        rootPosts={[]}
        containerRef={{ current: viewport as HTMLDivElement }}
        worldOriginRef={{ current: viewport.firstElementChild as HTMLDivElement }}
        canvasZoom={zoom}
      />,
    ));
    const map = host.querySelector<HTMLElement>('[data-freeform-minimap="true"]')!;
    expect(map).toBeTruthy();
    expect(map.className).toContain('pointer-events-none');
    expect([viewport.scrollWidth, viewport.scrollHeight]).toEqual(before);
  });

  it('59/60. stays at z-40, beneath z-1000 editor panels with no escalation', () => {
    expect(component).toContain('z-40');
    expect(component).not.toMatch(/z-\[(?:[1-9]\d{3,})\]/);
    expect(read('components/collabboard/editors/ImageEditor.tsx')).toContain('z-[1000]');
  });

  it('61. is hidden below the 768px md breakpoint', () => {
    expect(component).toContain('hidden h-[108px] w-[168px]');
    expect(component).toContain('md:block');
  });

  it('uses the required compact placement, semantic theme tokens, and decorative semantics', () => {
    expect(component).toContain('bottom-4 left-[72px]');
    expect(component).toContain('h-[108px] w-[168px]');
    expect(component).toContain('border-border bg-background/90');
    expect(component).toContain('aria-hidden="true"');
    expect(component).not.toContain('<button');
  });

  it('renders only simple post/container/comment and viewport SVG geometry', () => {
    expect(component).toContain("item.kind === 'comment-pin'");
    expect(component).toContain("item.kind === 'container'");
    expect(component).toContain('data-freeform-minimap-viewport');
    expect(component).not.toContain('<text');
    expect(component).not.toContain('<image');
    expect(component).not.toContain('<line');
  });
});

describe('PATCH 9U read-only, stable, O(n)/O(k)/O(1) architecture guards', () => {
  const implementation = [component, geometry, geometryHook, viewportHook].join('\n');

  it('negative A/B: has no viewport/world-stage dependency', () => {
    expect(component).not.toContain('CanvasViewport');
    expect(component).not.toContain('PadletLayer');
    expect(component).not.toContain('FreeformWorldSurface');
  });

  it('negative C/M: content bounds receive items only, never the viewport', () => {
    expect(component).toContain('getMinimapDisplayBounds(items)');
    expect(component).not.toContain('getMinimapDisplayBounds([...items, viewport');
  });

  it('negative D/E: uses canonical root input and measured geometry has precedence', () => {
    expect(canvasClient).toContain('rootPosts={rootPadlets}');
    expect(geometryHook).toContain('? measured');
    expect(geometryHook).toContain(': getFallbackMinimapItem(post)');
  });

  it('negative F/G/H: has no Graph or Line dependency/rendering', () => {
    expect(implementation).not.toMatch(/FreeformGraphLayer|GraphRepo|SimpleLineRenderer|manualLines|graphLines/);
  });

  it('negative I/J: has no camera-write or interaction handler', () => {
    expect(implementation).not.toMatch(/scrollTo|scrollBy|scrollLeft\s*=|scrollTop\s*=|onClick|onPointer|onWheel|onMouse/);
    expect(component).toContain('pointer-events-none');
  });

  it('negative K: imports/calls no persistence or mutation layer', () => {
    expect(implementation).not.toMatch(/supabase|PostsRepository|updatePadlet|savePost|metadata update|graphRepo/i);
  });

  it('negative L: never clamps to nominal world constants or zero', () => {
    expect(geometry).not.toMatch(/FREEFORM_WORLD|10000|Math\.max\(0|Math\.min\(10000/);
  });

  it('negative N: scroll state is leaf-local, passive, and rAF-throttled', () => {
    expect(viewportHook).toContain("viewport.addEventListener('scroll', scheduleMeasure, { passive: true })");
    expect(viewportHook).toContain('window.requestAnimationFrame(measure)');
    expect(canvasClient).not.toContain("addEventListener('scroll', scheduleMeasure");
  });

  it('negative O: does not change frozen camera/gutter/stage files', () => {
    expect(implementation).not.toMatch(/useCanvasCamera|FREEFORM_WORLD_WIDTH_PX|FREEFORM_WORLD_HEIGHT_PX/);
  });

  it('negative P: stays below editor layers', () => expect(component).toContain('z-40'));

  it('uses one shared ResizeObserver and rAF batches affected roots', () => {
    expect((geometryHook.match(/new ResizeObserver/g) || [])).toHaveLength(1);
    expect(geometryHook).toContain('const pendingIds = new Set<string>()');
    expect(geometryHook).toContain('window.requestAnimationFrame(flushMeasurements)');
  });

  it('does no all-post query or O(n) content rebuild on a camera scroll frame', () => {
    expect(viewportHook).not.toContain('querySelectorAll');
    expect(viewportHook).not.toContain('rootPosts');
    expect(viewportHook).not.toContain('items.map');
  });
});
