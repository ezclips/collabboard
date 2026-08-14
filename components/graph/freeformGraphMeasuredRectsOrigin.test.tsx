// @vitest-environment jsdom
//
// PATCH 9S.2 -- coordinate-parity proof for FreeformGraphLayer's measuredRects
// formula. Before this patch, measuredRects derived world coordinates from
// `containerRect + scroll - padding`; PATCH 9S.2 introduced a camera gutter,
// which that formula did NOT account for (it would have included the gutter
// offset as spurious extra world-x/y, an error that grows at low zoom -- the
// same class of bug PATCH 9S.1 diagnosed for post pointer conversion).
// measuredRects now prefers worldOriginRef.getBoundingClientRect(), which
// natively reflects the gutter with zero manual arithmetic. This test mounts
// the real component with posts positioned at an ARBITRARY, non-zero origin
// offset (simulating the gutter) and proves the resulting edge route matches
// the REAL production routeEdge() computed directly from the true world
// rects -- i.e. the gutter offset is fully and correctly cancelled out.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import type { FreeformGraphEdge } from '@/types/graphTypes';
import { routeEdge, type Rect } from '@/lib/graph/edgeRouting';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!('ResizeObserver' in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
(globalThis as any).cancelAnimationFrame = () => {};

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

const FreeformGraphLayer = (await import('./FreeformGraphLayer')).default;
const EDGE_GAP = 32;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
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

function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() { return this; },
  } as DOMRect);
}

function post(id: string, overrides: Partial<Padlet> = {}): Padlet {
  return {
    id, board_id: 'board1', title: id, content: '', type: 'note',
    position_x: 0, position_y: 0, width: 100, height: 60,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Padlet;
}

function edge(id: string, sourceId: string, targetId: string): FreeformGraphEdge {
  return {
    id, board_id: 'board1', source_post_id: sourceId, target_post_id: targetId,
    relation_type: 'solid', direction: 'forward', label: null, style: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}

describe('PATCH 9S.2: measuredRects + worldOriginRef recovers TRUE world coordinates through an arbitrary (gutter-simulating) origin offset', () => {
  it.each([
    ['zero offset (no gutter, control)', 0, 0, 1],
    ['realistic gutter at 100% zoom', 1200, 800, 1],
    ['realistic gutter at 50% zoom', 1200, 800, 0.5],
    ['realistic gutter at 10% zoom (the exact regime PATCH 9S.1 found broken)', 1200, 800, 0.1],
  ])('%s: rendered edge route matches routeEdge() computed directly from true world rects', async (_label, originX, originY, zoom) => {
    const postA = post('postA', { position_x: 100, position_y: 100, width: 200, height: 150 });
    const postB = post('postB', { position_x: 500, position_y: 100, width: 200, height: 150 });
    mockEdges = [edge('e1', 'postA', 'postB')];

    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    stubRect(containerEl, 0, 0, 2000, 2000);

    const originEl = document.createElement('div');
    stubRect(originEl, originX, originY, 0, 0);

    const elA = document.createElement('div');
    elA.setAttribute('data-padlet-id', 'postA');
    stubRect(elA, originX + postA.position_x * zoom, originY + postA.position_y * zoom, postA.width! * zoom, postA.height! * zoom);
    containerEl.appendChild(elA);

    const elB = document.createElement('div');
    elB.setAttribute('data-padlet-id', 'postB');
    stubRect(elB, originX + postB.position_x * zoom, originY + postB.position_y * zoom, postB.width! * zoom, postB.height! * zoom);
    containerEl.appendChild(elB);

    const containerRef = { current: containerEl };
    const worldOriginRef = { current: originEl };

    const root = mount(
      <FreeformGraphLayer
        boardId="board1"
        posts={[postA, postB]}
        containerRef={containerRef}
        worldOriginRef={worldOriginRef}
        zoom={zoom}
      />
    );
    await act(async () => { await Promise.resolve(); }); // flush getEdges()
    // The rect-measurement effect schedules via the stubbed synchronous rAF;
    // a second flush ensures the ResizeObserver-triggered initial
    // scheduleUpdate() call has fully resolved.
    await act(async () => { await Promise.resolve(); });

    const rectA: Rect = { x: postA.position_x, y: postA.position_y, width: postA.width!, height: postA.height! };
    const rectB: Rect = { x: postB.position_x, y: postB.position_y, width: postB.width!, height: postB.height! };
    const expectedRoute = routeEdge(rectA, rectB, { gap: EDGE_GAP });

    const hitPath = root.querySelector('path[stroke="transparent"]');
    expect(hitPath).not.toBeNull();
    expect(hitPath!.getAttribute('d')).toBe(expectedRoute.pathD);
  });
});

describe('PATCH 9S.2: measuredRects fallback (no worldOriginRef supplied) remains usable [backward-compat, PATCH 9O-era callers]', () => {
  it('still renders a route when worldOriginRef is omitted entirely (zero-offset container, no padding)', async () => {
    const postA = post('postA', { position_x: 100, position_y: 100, width: 200, height: 150 });
    const postB = post('postB', { position_x: 500, position_y: 100, width: 200, height: 150 });
    mockEdges = [edge('e1', 'postA', 'postB')];

    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    stubRect(containerEl, 0, 0, 2000, 2000);

    const elA = document.createElement('div');
    elA.setAttribute('data-padlet-id', 'postA');
    stubRect(elA, postA.position_x, postA.position_y, postA.width!, postA.height!);
    containerEl.appendChild(elA);

    const elB = document.createElement('div');
    elB.setAttribute('data-padlet-id', 'postB');
    stubRect(elB, postB.position_x, postB.position_y, postB.width!, postB.height!);
    containerEl.appendChild(elB);

    const containerRef = { current: containerEl };

    const root = mount(
      <FreeformGraphLayer boardId="board1" posts={[postA, postB]} containerRef={containerRef} zoom={1} />
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const rectA: Rect = { x: postA.position_x, y: postA.position_y, width: postA.width!, height: postA.height! };
    const rectB: Rect = { x: postB.position_x, y: postB.position_y, width: postB.width!, height: postB.height! };
    const expectedRoute = routeEdge(rectA, rectB, { gap: EDGE_GAP });

    const hitPath = root.querySelector('path[stroke="transparent"]');
    expect(hitPath).not.toBeNull();
    expect(hitPath!.getAttribute('d')).toBe(expectedRoute.pathD);
  });
});
