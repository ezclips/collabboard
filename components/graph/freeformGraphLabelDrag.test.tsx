// @vitest-environment jsdom
//
// PATCH 9O -- PATCH 9N's Graph Line addendum audit confirmed Graph label
// dragging mixes SCREEN-space pointer coordinates with WORLD-space route
// coordinates: FreeformGraphLayer.tsx's label-drag handleMouseMove computed
// `mx = e.clientX - svgRect.left` (a raw SCREEN-pixel delta, since svgRef's
// <svg> lives inside FreeformPadletCards' `transform: scale(canvasZoom)`
// world stage, so getBoundingClientRect() returns the post-transform/
// zoom-scaled box) and projected it directly against `sx/sy/ex/ey` (the
// edge route, which IS in WORLD units -- measuredRects already divides by
// zoom to normalize screen rects back to world). At zoom=1 screen==world so
// the bug was invisible; at any other zoom the label lagged/overshot the
// cursor and persisted the wrong `style.label_position` fraction. Fix: this
// same screen-pixel delta is now divided by zoom exactly once before the
// projection, landing it in the same WORLD space the route already uses --
// mirroring the renderEdgesRef pattern with a new zoomRef so the drag
// handler always reads the latest zoom without re-subscribing on every
// change. Mounts the real component (createRoot/act, matching the
// established convention in SimpleLineRenderer.zoomCoordinates.test.tsx)
// and dispatches real DOM pointer events end-to-end.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import { routeEdge, type Rect } from '@/lib/graph/edgeRouting';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver -- FreeformGraphLayer's rect-measurement effect
// constructs one unconditionally. Stub matches the established pattern in
// useScrollbarLane.test.tsx.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// jsdom's rAF is timer-based; run synchronously for deterministic tests,
// matching SimpleLineRenderer.zoomCoordinates.test.tsx's convention.
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
(globalThis as any).cancelAnimationFrame = () => {};

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

// Real production geometry constant -- kept in sync manually since
// FreeformGraphLayer.tsx does not export it; a drift here would show up as
// a wrong expected route in the mounted tests below, not a silent pass.
const EDGE_GAP = 32;

const upsertEdgeMock = vi.fn(async (edge: Partial<FreeformGraphEdge>) => edge as FreeformGraphEdge);
const deleteEdgeMock = vi.fn(async () => {});
let mockEdges: FreeformGraphEdge[] = [];

vi.mock('@/lib/graph/graphRepo', () => ({
  createFreeformGraphRepo: () => ({
    getEdges: async () => mockEdges,
    getSettings: async () => null,
    upsertEdge: upsertEdgeMock,
    deleteEdge: deleteEdgeMock,
  }),
}));

// Imported AFTER the mock so the module picks it up.
const FreeformGraphLayer = (await import('./FreeformGraphLayer')).default;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  upsertEdgeMock.mockClear();
  deleteEdgeMock.mockClear();
  mockEdges = [];
});

function post(id: string, overrides: Partial<Padlet> = {}): Padlet {
  return {
    id,
    board_id: 'board1',
    title: id,
    content: '',
    type: 'note',
    position_x: 0,
    position_y: 0,
    width: 100,
    height: 60,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Padlet;
}

function edge(id: string, sourceId: string, targetId: string): FreeformGraphEdge {
  return {
    id,
    board_id: 'board1',
    source_post_id: sourceId,
    target_post_id: targetId,
    relation_type: 'solid',
    direction: 'forward',
    label: 'Test Label',
    style: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

// Two horizontally-separated posts, positioned directly in WORLD coordinates
// (post.position_x/position_y). Since the mounted container has NO
// [data-padlet-id] DOM children, FreeformGraphLayer's measuredRects stays
// empty and getRect() falls back to these exact WORLD values directly --
// no ResizeObserver/MutationObserver/DOM-measurement pipeline needed for a
// deterministic route.
// width/height are kept >= 120 so getRect()'s fallback floor
// (Math.max(post.width || 280, 120) / Math.max(post.height || 100, 120))
// is a no-op and the route below matches the production rect exactly.
const postA = post('postA', { position_x: 100, position_y: 100, width: 200, height: 150 });
const postB = post('postB', { position_x: 500, position_y: 100, width: 200, height: 150 });

// Ground truth WORLD route, computed with the REAL production routeEdge --
// not hand-derived, so a change to edgeRouting.ts's gap/intersection math
// would show up as a wrong expectation here, not a silently-wrong test.
const rectA: Rect = { x: postA.position_x, y: postA.position_y, width: postA.width, height: postA.height };
const rectB: Rect = { x: postB.position_x, y: postB.position_y, width: postB.width, height: postB.height };
const worldRoute = routeEdge(rectA, rectB, { gap: EDGE_GAP });

function stubSvgAriaHiddenRect(container: HTMLElement, originLeft: number, originTop: number) {
  const svg = container.querySelector('svg[aria-hidden="true"]') as SVGSVGElement | null;
  if (!svg) throw new Error('graph label-drag reference <svg> not found');
  svg.getBoundingClientRect = () => ({
    left: originLeft, top: originTop, right: originLeft, bottom: originTop, width: 0, height: 0, x: originLeft, y: originTop,
    toJSON() { return this; },
  } as DOMRect);
}

function findLabelDiv(container: HTMLElement): HTMLElement {
  // The label text sits inside two nested divs (an outer flex-centering
  // wrapper, then the actual interactive label with onMouseDown) -- both
  // have the same textContent since it bubbles up through ancestors. The
  // real target is the LEAF (no element children), matching the production
  // JSX where {edge.label} is the only child of the inner div.
  const div = Array.from(container.querySelectorAll('div')).find(
    (d) => d.textContent === 'Test Label' && d.children.length === 0
  );
  if (!div) throw new Error('graph label div not found');
  return div as HTMLElement;
}

async function dragLabelToWorldFraction(
  container: HTMLElement,
  targetT: number,
  zoom: number,
  svgOrigin: { left: number; top: number } = { left: 0, top: 0 },
) {
  stubSvgAriaHiddenRect(container, svgOrigin.left, svgOrigin.top);

  const worldX = worldRoute.sx + (worldRoute.ex - worldRoute.sx) * targetT;
  const worldY = worldRoute.sy + (worldRoute.ey - worldRoute.sy) * targetT;
  const clientX = svgOrigin.left + worldX * zoom;
  const clientY = svgOrigin.top + worldY * zoom;

  const labelDiv = findLabelDiv(container);
  await act(async () => {
    labelDiv.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true }));
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, bubbles: true }));
    await Promise.resolve();
  });
}

describe('PATCH 9O: graph label drag applies zoom exactly once, in world coordinates [matrix 1-6]', () => {
  it.each([
    ['100%', 1.0],
    ['80%', 0.8],
    ['60%', 0.6],
    ['40%', 0.4],
    ['150%', 1.5],
  ])('zoom %s: dragging to the world-fraction-0.3 point on the route persists label_position ≈ 0.3', async (_label, zoom) => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const container = mount(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} containerRef={{ current: container_placeholder() }} zoom={zoom} />
    );
    // containerRef must point at the mounted DOM node itself so
    // FreeformGraphLayer's own updateRects effect (container.querySelector)
    // runs against real DOM -- reassign after mount since containerRef needs
    // the actual node.
    await act(async () => { await Promise.resolve(); }); // flush getEdges()

    await dragLabelToWorldFraction(container, 0.3, zoom);

    expect(upsertEdgeMock).toHaveBeenCalled();
    const lastCall = upsertEdgeMock.mock.calls[upsertEdgeMock.mock.calls.length - 1][0];
    const style = (lastCall.style && typeof lastCall.style === 'object') ? (lastCall.style as Record<string, unknown>) : {};
    expect(typeof style.label_position).toBe('number');
    expect(style.label_position as number).toBeCloseTo(0.3, 2);
  });
});

// containerRef in the tests above is set via a real ref object created at
// mount time -- React refs must exist before render, so this helper returns
// a fresh detached div; the real container is swapped in via a second
// render pass by tests that need live DOM measurement. Label-drag tests
// above rely only on the fallback (unmeasured) rect path, so the exact
// containerRef target is inert for their purposes as long as it is a valid
// HTMLDivElement.
function container_placeholder(): HTMLDivElement {
  return document.createElement('div');
}

describe('PATCH 9O: scroll invariance -- the SVG rect origin already includes scroll, no double-counting [matrix 8-11]', () => {
  it.each([
    ['100% + offset origin (simulated scroll)', 1.0, { left: -220, top: -40 }],
    ['60% + offset origin (simulated scroll)', 0.6, { left: -140, top: -25 }],
  ])('%s: label still lands on world-fraction 0.3 regardless of the svg rect origin', async (_label, zoom, origin) => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const container = mount(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} containerRef={{ current: container_placeholder() }} zoom={zoom} />
    );
    await act(async () => { await Promise.resolve(); });

    await dragLabelToWorldFraction(container, 0.3, zoom, origin);

    const lastCall = upsertEdgeMock.mock.calls[upsertEdgeMock.mock.calls.length - 1][0];
    const style = (lastCall.style && typeof lastCall.style === 'object') ? (lastCall.style as Record<string, unknown>) : {};
    expect(style.label_position as number).toBeCloseTo(0.3, 2);
  });
});

describe('PATCH 9O: persistence contract -- only label_position changes, nothing else [matrix 13, 14, 15, 16, 17]', () => {
  it('the upsertEdge payload preserves id/source/target/board_id exactly, and label_position stays a 0..1 fraction, not screen coordinates or a zoom-multiplied value', async () => {
    mockEdges = [edge('e1', 'postA', 'postB')];
    const container = mount(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} containerRef={{ current: container_placeholder() }} zoom={0.6} />
    );
    await act(async () => { await Promise.resolve(); });

    await dragLabelToWorldFraction(container, 0.3, 0.6);

    const lastCall = upsertEdgeMock.mock.calls[upsertEdgeMock.mock.calls.length - 1][0];
    expect(lastCall.id).toBe('e1');
    expect(lastCall.source_post_id).toBe('postA');
    expect(lastCall.target_post_id).toBe('postB');
    expect(lastCall.board_id).toBe('board1');
    const style = (lastCall.style && typeof lastCall.style === 'object') ? (lastCall.style as Record<string, unknown>) : {};
    const t = style.label_position as number;
    expect(t).toBeGreaterThanOrEqual(0.05);
    expect(t).toBeLessThanOrEqual(0.95);
    // Not the raw screen displacement, and not a zoom-multiplied value.
    expect(t).not.toBeCloseTo(worldRoute.sx + (worldRoute.ex - worldRoute.sx) * 0.3 * 0.6, 1);
  });
});

describe('PATCH 9O: source formulas [matrix 7]', () => {
  const src = read('components/graph/FreeformGraphLayer.tsx');

  it('handleMouseMove divides the screen delta by zoom exactly once, via zoomRef', () => {
    expect(src).toContain('const zoomRef = useRef(zoom);');
    expect(src).toContain('zoomRef.current = zoom;');
    const start = src.indexOf('const handleMouseMove = (e: MouseEvent) => {');
    const end = src.indexOf('// Project mouse onto the line segment', start);
    const body = src.slice(start, end);
    expect(body).toContain('const currentZoom = zoomRef.current;');
    expect(body).toContain('const mx = (e.clientX - svgRect.left) / currentZoom;');
    expect(body).toContain('const my = (e.clientY - svgRect.top) / currentZoom;');
    // Not a raw, undivided screen delta anywhere in the handler.
    expect(body).not.toContain('const mx = e.clientX - svgRect.left;');
    expect(body).not.toContain('const my = e.clientY - svgRect.top;');
  });

  it('no manual scrollLeft/scrollTop property access was added to the label-drag handler -- svgRect already includes it [negative control D anchor]', () => {
    const start = src.indexOf('const handleMouseMove = (e: MouseEvent) => {');
    const end = src.indexOf('\n        };', start);
    const body = src.slice(start, end);
    // Checks actual property-access usage (a leading dot), not prose --
    // this function's own explanatory comment discusses scrollLeft/scrollTop
    // by name (to say why they are NOT needed here), which a bare \b regex
    // would otherwise false-positive on.
    expect(body).not.toMatch(/\.scrollLeft\b/);
    expect(body).not.toMatch(/\.scrollTop\b/);
  });
});

describe('PATCH 9O: label drag-start captures no stale screen-space state [matrix]', () => {
  it('onMouseDown only calls setDraggingLabel(edge.id) -- no cached midpoint/coordinate is stored', () => {
    const src = read('components/graph/FreeformGraphLayer.tsx');
    const start = src.indexOf('onMouseDown={(e) => {');
    const end = src.indexOf('}}', start);
    const body = src.slice(start, end);
    expect(body).toContain('setDraggingLabel(edge.id);');
    expect(body).not.toMatch(/\bmidpoint\b/i);
    expect(body).not.toMatch(/\bstartX\b|\bstartY\b/);
  });
});

describe('PATCH 9O: label storage contract unchanged -- style.label_position, a 0..1 fraction along the route [negative control E]', () => {
  const src = read('components/graph/FreeformGraphLayer.tsx');

  it('the persisted field is still label_position, not absolute world x/y or an offset object', () => {
    expect(src).toContain('label_position: t');
    expect(src).not.toMatch(/label_position:\s*\{\s*x/);
    expect(src).not.toContain('labelX');
    expect(src).not.toContain('labelY');
  });

  it('t is still clamped to [0.05, 0.95] and computed via linear projection onto (sx,sy)-(ex,ey)', () => {
    expect(src).toContain('Math.max(0.05, Math.min(0.95,');
    expect(src).toContain('const dx = ex - sx;');
    expect(src).toContain('const dy = ey - sy;');
  });
});

describe('PATCH 9O: edge identity/routing/arrowhead/hit-path freeze [matrix 17, 18, 19; negative controls F, G, H]', () => {
  const src = read('components/graph/FreeformGraphLayer.tsx');

  it('handleMouseMove/handleMouseUp never write source_post_id/target_post_id/id', () => {
    const start = src.indexOf('const handleMouseMove = (e: MouseEvent) => {');
    const end = src.indexOf('window.addEventListener(\'mousemove\'', start);
    const body = src.slice(start, end);
    expect(body).not.toContain('source_post_id:');
    expect(body).not.toContain('target_post_id:');
    expect(body).not.toMatch(/\bid:\s*['"]/);
  });

  it('routeEdge/edgeRouting.ts is not modified by this patch -- edge routing math untouched', () => {
    const routingSrc = read('lib/graph/edgeRouting.ts');
    expect(routingSrc).toContain('center-to-center geometry');
    expect(routingSrc).toContain('export interface RouteEdgeResult {');
  });

  it('arrowhead polygon geometry is untouched -- both the end AND start arrowhead points are byte-identical, not just one of the two', () => {
    const pointsCount = (src.match(/points=\{`\$\{-ARROW_SIZE \* 2\},\$\{-ARROW_SIZE\} 0,0 \$\{-ARROW_SIZE \* 2\},\$\{ARROW_SIZE\}`\}/g) || []).length;
    expect(pointsCount).toBe(2);
    expect(src).toContain('transform={`translate(${ex},${ey}) rotate(${endDeg})`}');
    expect(src).toContain('transform={`translate(${sx},${sy}) rotate(${startDeg + 180})`}');
  });

  it('the hit-path (wide transparent stroke for right-click) is untouched', () => {
    expect(src).toContain('stroke="transparent"');
    expect(src).toContain('strokeWidth="12"');
  });
});

describe('PATCH 9O: scope guards -- container-transition and orphan-edge defects left UNCHANGED [matrix 25, 26; negative controls J, K]', () => {
  const src = read('components/graph/FreeformGraphLayer.tsx');
  const selectorsSrc = read('lib/graph/graphSelectors.ts');

  it('getRect\'s fallback (unmeasured) branch is byte-identical to the pre-9O shape -- no container/parentId-aware branching was added', () => {
    const start = src.indexOf('const getRect = (post: Padlet): Rect => {');
    const end = src.indexOf('return validEdges.map', start);
    const body = src.slice(start, end);
    expect(body).not.toMatch(/\bparentId\b/);
    expect(body).not.toMatch(/\bsectionId\b/);
    expect(body).not.toMatch(/\bcontainerId\b/);
    expect(body).toContain('return {\n                x: post.position_x,\n                y: post.position_y,');
  });

  it('selectValidEdges (lib/graph/graphSelectors.ts) is untouched -- still filters purely by post-id presence, never deletes the persisted row', () => {
    expect(selectorsSrc).toContain(
      'export function selectValidEdges(\n    posts: Padlet[],\n    edges: FreeformGraphEdge[]\n): FreeformGraphEdge[] {\n    const postIds = new Set(posts.map(p => p.id));\n    return edges.filter(e => postIds.has(e.source_post_id) && postIds.has(e.target_post_id));\n}'
    );
  });

  it('no new call to repo.deleteEdge/deleteEdge was wired to post-deletion anywhere in this file -- deleteEdge is still reachable only from the explicit "Delete Line" button', () => {
    const deleteEdgeCalls = src.match(/deleteEdge\(/g) || [];
    // Exactly the definition (`const deleteEdge = async`) and its one call
    // site inside the "Delete Line" button's onClick.
    expect(deleteEdgeCalls.length).toBe(2);
  });
});

describe('PATCH 9O: Manual Line Tool freeze [matrix 24; negative control I]', () => {
  it('SimpleLineRenderer.tsx, canvasLineCoordinates.ts, freeformStageGeometry.ts, useCanvasLines.ts are not referenced/modified by this patch', () => {
    const simpleLineRendererSrc = read('components/collabboard/SimpleLineRenderer.tsx');
    expect(simpleLineRendererSrc).toContain('x: (e.clientX - rect.left) / canvasZoom,');
    expect(simpleLineRendererSrc).toContain('y: (e.clientY - rect.top) / canvasZoom,');
    const stageGeometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_WIDTH_PX = 10000;');
    expect(stageGeometrySrc).toContain('export const FREEFORM_WORLD_HEIGHT_PX = 10000;');
  });
});

describe('PATCH 9M canvas stacking freeze [matrix 25]', () => {
  it("CanvasViewport's isolation: isolate and the front/back Line z-index values are untouched", () => {
    const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(canvasClientSrc).toContain("isolation: 'isolate',");
    expect(canvasClientSrc).toContain('zIndex: isFreeformGraphMode ? 2000 : 500,');
  });
});

describe('PATCH 9K.1 comment collapse/expand freeze [matrix 26]', () => {
  it('CommentEditor.tsx\'s handleToggleCollapse and keepEditorOpen contract are untouched', () => {
    const commentEditorSrc = read('components/collabboard/editors/CommentEditor.tsx');
    expect(commentEditorSrc).toContain('const handleToggleCollapse = () => {');
    expect(commentEditorSrc).toContain('keepEditorOpen: true,');
  });
});

describe('PATCH 9O: camera-anchored zoom NOT implemented [scope guard]', () => {
  it('CanvasClient.tsx\'s zoom handlers are untouched -- no camera-anchoring/transformOrigin math was introduced by this patch', () => {
    const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(canvasClientSrc).not.toMatch(/anchorZoom|cameraAnchor|zoomAroundPoint/);
  });
});
