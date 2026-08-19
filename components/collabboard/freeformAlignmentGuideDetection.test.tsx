// @vitest-environment jsdom
//
// PATCH ALIGN-B -- vertical alignment guide detection during a real Freeform
// single-post drag. Mounts the REAL useCanvasInteractions hook, wired exactly
// the way CanvasClient.tsx wires it (same harness convention as
// signedFreeformPostDrag.test.tsx, duplicated locally rather than importing
// from that file since it does not export its harness). Only the Supabase
// network boundary is faked.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { useCanvasInteractions } from './canvas/hooks/useCanvasInteractions';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 220;
const DRAG_START_DISTANCE = 5;
const ORIGIN_LEFT = 600;
const ORIGIN_TOP = 400;

function installFakeSupabase() {
  const persisted: Array<{ id: string; position_x: number; position_y: number }> = [];
  const client = {
    from(_table: string) {
      return {
        update(fields: any) {
          return {
            eq: async (_column: string, id: string) => {
              if (fields.position_x !== undefined) {
                persisted.push({ id, position_x: fields.position_x, position_y: fields.position_y });
              }
              return { error: null };
            },
          };
        },
        select(_cols: string) {
          return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as any);
  return persisted;
}

function stubRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

type Api = ReturnType<typeof useCanvasInteractions>;
interface HarnessHandle { api: Api; padlets: Padlet[]; }
let latest: HarnessHandle | null = null;

function Harness({
  initialPadlets,
  zoom,
  snapToGrid = false,
}: {
  initialPadlets: Padlet[];
  zoom: number;
  snapToGrid?: boolean;
}) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(initialPadlets);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const freeformWorldOriginRef = React.useRef<HTMLDivElement | null>(null);

  const api = useCanvasInteractions({
    containerRef,
    freeformWorldOriginRef,
    canvasZoom: zoom,
    canEditCanvas: true,
    snapToGrid,
    padlets,
    setPadlets,
    selectedPadletIds: [],
    isLineMode: false,
    isAnyEditorOpen: false,
    isFreeformGraphMode: false,
    isGraphConnectMode: false,
    setSelectedPadletId: () => {},
    newPostDragState: { isActive: false } as any,
    setNewPostDragState: () => {},
    setNewPostHoverContainerId: () => {},
    newPostHoverContainerId: null,
    handlePlaceInExisting: () => {},
    setIsPlacementPromptOpen: () => {},
    markPadletLocallyModified: () => {},
    fetchData: async () => {},
    PADLET_DRAG_START_DISTANCE: DRAG_START_DISTANCE,
  });

  latest = { api, padlets };

  return (
    <div>
      <div
        ref={(node) => {
          containerRef.current = node;
          if (node) stubRect(node, { left: 0, top: 0, width: 1200, height: 800 });
        }}
      />
      <div
        ref={(node) => {
          freeformWorldOriginRef.current = node;
          if (node) stubRect(node, { left: ORIGIN_LEFT, top: ORIGIN_TOP, width: 20000 * zoom, height: 20000 * zoom });
        }}
      />
    </div>
  );
}

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
}

beforeEach(() => { latest = null; });

afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.clearAllMocks();
});

function padlet(id: string, x: number, y: number, overrides: Partial<Padlet> = {}): Padlet {
  return {
    id, board_id: 'board-1', type: 'note', title: id, content: '',
    position_x: x, position_y: y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  } as Padlet;
}

const toClientX = (worldX: number, zoom: number) => ORIGIN_LEFT + worldX * zoom;
const toClientY = (worldY: number, zoom: number) => ORIGIN_TOP + worldY * zoom;

/** Grabs `grabId` at its own top-left corner (clean zero grab offset) and
 *  drags until the pointer sits over world `target`. Two moves, matching
 *  production: the first past-threshold move only starts the drag. */
function drag(grabId: string, target: { x: number; y: number }, zoom: number) {
  const handle = latest!;
  const grabbed = handle.padlets.find((p) => p.id === grabId)!;
  const startClientX = toClientX(grabbed.position_x, zoom);
  const startClientY = toClientY(grabbed.position_y, zoom);

  const postEl = document.createElement('div');
  stubRect(postEl, {
    left: startClientX,
    top: startClientY,
    width: (Number(grabbed.width) || DEFAULT_WIDTH) * zoom,
    height: (Number(grabbed.height) || DEFAULT_HEIGHT) * zoom,
  });

  act(() => {
    handle.api.handlePadletMouseDown({
      clientX: startClientX,
      clientY: startClientY,
      currentTarget: postEl,
      target: { closest: () => null },
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any, grabId);
  });

  const move = () => act(() => {
    latest!.api.handleCanvasMouseMove({
      buttons: 1,
      clientX: toClientX(target.x, zoom),
      clientY: toClientY(target.y, zoom),
      preventDefault: () => {},
    } as any);
  });
  move();
  move();
}

async function release() {
  await act(async () => { await latest!.api.handleCanvasMouseUp(); });
}

describe('PATCH ALIGN-B: vertical alignment guide detection', () => {
  it('left <-> left: dragged post left edge close to another root post left edge shows a guide at that edge', () => {
    // Dragged width 100, other width 180 at x=500 (left=500) -- widths differ
    // deliberately so left/center/right cannot coincidentally all match at
    // once (see file header reasoning).
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 503, y: 0 }, 1); // a.left = 503, 3 world units from b.left = 500
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: null });
  });

  it('center <-> center: dragged post center close to another root post center shows a guide at that center', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }), // center = 590
    ]} zoom={1} />);

    drag('a', { x: 540, y: 0 }, 1); // a.center = 540 + 50 = 590, exact match
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 590, horizontalY: null });
  });

  it('right <-> right: dragged post right edge close to another root post right edge shows a guide at that edge', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }), // right = 680
    ]} zoom={1} />);

    drag('a', { x: 578, y: 0 }, 1); // a.right = 578 + 100 = 678, 2 units from 680
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 680, horizontalY: null });
  });

  it('outside tolerance: no candidate within range clears/withholds the guide', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 480, y: 0 }, 1); // a.left = 480, 20 units from b.left = 500 -- past the 6px/zoom-1 tolerance
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('nearest candidate wins when several posts are within tolerance', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b1', 496, 0, { width: 180 }), // |500-4 - 496| -- b1.left=496, distance from a.left(500)=4
      padlet('b2', 502, 0, { width: 180 }), // b2.left=502, distance from a.left(500)=2 -- nearer
    ]} zoom={1} />);

    drag('a', { x: 500, y: 0 }, 1);
    // Both b1 (distance 4) and b2 (distance 2) are within the 6-unit
    // tolerance -- the nearer one (b2, at world x 502) must win.
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 502, horizontalY: null });
  });

  it('self ignored: the dragged post is never compared against its own (possibly stale) entry in the padlets array', () => {
    // Only ONE post on the board -- the one being dragged. If self-exclusion
    // were missing, a tiny move (within tolerance of the post's own
    // pre-move position, which is still what `padlets` holds at the start of
    // this same mousemove) would spuriously self-align.
    mount(<Harness initialPadlets={[padlet('a', 0, 0, { width: 100 })]} zoom={1} />);

    drag('a', { x: 1, y: 0 }, 1); // 1 world unit -- comfortably inside tolerance if self-matching leaked through
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('guide clears on mouseup', async () => {
    installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 500, y: 0 }, 1);
    expect(latest!.api.alignmentGuides.verticalX).not.toBeNull();

    await release();
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('tolerance is screen-consistent (converted through canvasZoom), not a fixed world-unit distance', () => {
    // At zoom 1, 10 world units is outside the 6px tolerance (proven above).
    // At zoom 0.5, the SAME 10-world-unit gap is only 5 SCREEN px, which
    // must qualify -- proving the tolerance divides by canvasZoom rather
    // than staying a constant world-unit number.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 490, 0, { width: 180 }), // b.left = 490, 10 world units from a.left = 500
    ]} zoom={0.5} />);

    drag('a', { x: 500, y: 0 }, 0.5);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 490, horizontalY: null });
  });

  it('Snap-to-Grid still determines the committed position exactly as before -- this patch only observes and displays', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} snapToGrid />);

    // 503 is NOT a multiple of 20; Snap-to-Grid must still round it to 500
    // regardless of a guide also being shown at that same value.
    drag('a', { x: 503, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: null });

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 500, position_y: 0 }]);
  });
});
