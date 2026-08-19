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
  alignmentGuidesEnabled = true,
}: {
  initialPadlets: Padlet[];
  zoom: number;
  snapToGrid?: boolean;
  alignmentGuidesEnabled?: boolean;
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
    alignmentGuidesEnabled,
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

function mount(ui: React.ReactElement): Root {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return root;
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
    // once (see file header reasoning). Y kept far apart (0 vs 900) so
    // ALIGN-C's horizontal detection cannot spuriously also match here.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 503, y: 0 }, 1); // a.left = 503, 3 world units from b.left = 500
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: null });
  });

  it('center <-> center: dragged post center close to another root post center shows a guide at that center', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }), // center = 590
    ]} zoom={1} />);

    drag('a', { x: 540, y: 0 }, 1); // a.center = 540 + 50 = 590, exact match
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 590, horizontalY: null });
  });

  it('right <-> right: dragged post right edge close to another root post right edge shows a guide at that edge', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }), // right = 680
    ]} zoom={1} />);

    drag('a', { x: 578, y: 0 }, 1); // a.right = 578 + 100 = 678, 2 units from 680
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 680, horizontalY: null });
  });

  it('outside tolerance: no candidate within range clears/withholds the guide', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 480, y: 0 }, 1); // a.left = 480, 20 units from b.left = 500 -- past the 6px/zoom-1 tolerance
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('nearest candidate wins when several posts are within tolerance', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b1', 496, 900, { width: 180 }), // |500-4 - 496| -- b1.left=496, distance from a.left(500)=4
      padlet('b2', 502, 900, { width: 180 }), // b2.left=502, distance from a.left(500)=2 -- nearer
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
      padlet('b', 490, 900, { width: 180 }), // b.left = 490, 10 world units from a.left = 500
    ]} zoom={0.5} />);

    drag('a', { x: 500, y: 0 }, 0.5);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 490, horizontalY: null });
  });

  it('Snap-to-Grid still determines the committed position exactly as before -- this patch only observes and displays', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }),
    ]} zoom={1} snapToGrid />);

    // 503 is NOT a multiple of 20; Snap-to-Grid must still round it to 500
    // regardless of a guide also being shown at that same value.
    drag('a', { x: 503, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: null });

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 500, position_y: 0 }]);
  });
});

describe('PATCH ALIGN-C: horizontal alignment guide detection', () => {
  it('top <-> top: dragged post top edge close to another root post top edge shows a guide at that edge', () => {
    // x positions kept far apart (0 vs 1000) so no vertical match can occur
    // alongside this horizontal one -- heights differ (100 vs 180) so
    // top/center/bottom cannot all coincidentally match at once.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 0, y: 503 }, 1); // a.top = 503, 3 world units from b.top = 500
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 500 });
  });

  it('center <-> center: dragged post center close to another root post center shows a guide at that center', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }), // center = 590
    ]} zoom={1} />);

    drag('a', { x: 0, y: 540 }, 1); // a.center = 540 + 50 = 590, exact match
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 590 });
  });

  it('bottom <-> bottom: dragged post bottom edge close to another root post bottom edge shows a guide at that edge', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }), // bottom = 680
    ]} zoom={1} />);

    drag('a', { x: 0, y: 578 }, 1); // a.bottom = 578 + 100 = 678, 2 units from 680
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 680 });
  });

  it('outside tolerance: no candidate within range clears/withholds the horizontal guide', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 0, y: 480 }, 1); // a.top = 480, 20 units from b.top = 500 -- past tolerance
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('nearest candidate wins when several posts are within tolerance', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b1', 1000, 496, { width: 180, height: 180 }), // top=496, distance from a.top(500)=4
      padlet('b2', 1000, 502, { width: 180, height: 180 }), // top=502, distance from a.top(500)=2 -- nearer
    ]} zoom={1} />);

    drag('a', { x: 0, y: 500 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 502 });
  });

  it('both axes simultaneously: a vertical and a horizontal guide may both be shown at once', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 500, 500, { width: 180, height: 180 }),
    ]} zoom={1} />);

    // a.left = 503 (3 units from b.left = 500), a.top = 503 (3 units from b.top = 500).
    drag('a', { x: 503, y: 503 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: 500 });
  });

  it('guide clears on mouseup', async () => {
    installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 0, y: 500 }, 1);
    expect(latest!.api.alignmentGuides.horizontalY).not.toBeNull();

    await release();
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('Snap-to-Grid still determines the committed Y position exactly as before -- this patch only observes and displays', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 1000, 500, { width: 180, height: 180 }),
    ]} zoom={1} snapToGrid />);

    // 503 is NOT a multiple of 20; Snap-to-Grid must still round it to 500
    // regardless of a guide also being shown at that same value.
    drag('a', { x: 0, y: 503 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 500 });

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 0, position_y: 500 }]);
  });
});

describe('PATCH ALIGN-D: alignment guides preference (on/off)', () => {
  it('ON (explicit): vertical and horizontal guides work exactly as ALIGN-B/C left them', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 500, 500, { width: 180, height: 180 }),
    ]} zoom={1} alignmentGuidesEnabled />);

    drag('a', { x: 503, y: 503 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: 500 });
  });

  it('OFF: no guide is computed during drag even when the post is well within tolerance of a match', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 500, 500, { width: 180, height: 180 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);

    drag('a', { x: 503, y: 503 }, 1); // would match both axes if the preference were ON
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('OFF: post movement (preview position) is completely unaffected -- identical to the ON case for the same drag', () => {
    installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 500, 500, { width: 180, height: 180 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);

    drag('a', { x: 503, y: 503 }, 1);
    const moved = latest!.padlets.find((p) => p.id === 'a')!;
    expect({ x: moved.position_x, y: moved.position_y }).toEqual({ x: 503, y: 503 });
  });

  it('switching OFF mid-drag clears an already-visible guide immediately, without waiting for the next mousemove', () => {
    const root = mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} alignmentGuidesEnabled />);

    drag('a', { x: 503, y: 0 }, 1);
    expect(latest!.api.alignmentGuides.verticalX).not.toBeNull();

    // Re-render with the SAME hook instance (React Fast Refresh-style prop
    // flip, not a fresh mount) and the SAME padlets -- simulates the user
    // toggling the menu item mid-drag, with no further pointer movement.
    act(() => {
      root.render(<Harness initialPadlets={[
        padlet('a', 503, 0, { width: 100 }),
        padlet('b', 500, 0, { width: 180 }),
      ]} zoom={1} alignmentGuidesEnabled={false} />);
    });

    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('Snap-to-Grid works independently of the alignment guides preference -- OFF does not disable or alter snapping', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 0, { width: 180 }),
    ]} zoom={1} snapToGrid alignmentGuidesEnabled={false} />);

    drag('a', { x: 503, y: 0 }, 1); // not a multiple of 20
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 500, position_y: 0 }]);
  });
});

describe('PATCH ALIGN-E: adjacent edge alignment guides', () => {
  it('right -> left: dragged post right edge close to another root post left edge shows a guide there (posts butted up horizontally)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }), // y kept far apart -- isolates this to the vertical (X) guide only
    ]} zoom={1} />);

    drag('a', { x: 497, y: 0 }, 1); // a.right = 597, 3 units from b.left = 600
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: null });
  });

  it('left -> right: dragged post left edge close to another root post right edge shows a guide there (posts butted up horizontally)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 100, 900, { width: 200 }), // right = 300, y kept far apart
    ]} zoom={1} />);

    drag('a', { x: 303, y: 0 }, 1); // a.left = 303, 3 units from b.right = 300
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 300, horizontalY: null });
  });

  it('bottom -> top: dragged post bottom edge close to another root post top edge shows a guide there (posts stacked vertically)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 900, 600, { width: 100, height: 180 }), // x kept far apart -- isolates this to the horizontal (Y) guide only
    ]} zoom={1} />);

    drag('a', { x: 0, y: 497 }, 1); // a.bottom = 597, 3 units from b.top = 600
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 600 });
  });

  it('top -> bottom: dragged post top edge close to another root post bottom edge shows a guide there (posts stacked vertically)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 900, 100, { width: 100, height: 200 }), // bottom = 300, x kept far apart
    ]} zoom={1} />);

    drag('a', { x: 0, y: 303 }, 1); // a.top = 303, 3 units from b.bottom = 300
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 300 });
  });

  it('nearest candidate wins across same-edge AND adjacency matches together', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b1', 505, 900, { width: 180 }), // left-left (same-edge) distance 5
      padlet('b2', 602, 900, { width: 180 }), // right-left (adjacency) distance 2 -- nearer
    ]} zoom={1} />);

    drag('a', { x: 500, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 602, horizontalY: null });
  });

  it('Alignment Guides OFF also suppresses adjacency detection, not just same-edge', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);

    drag('a', { x: 497, y: 0 }, 1); // would match right->left adjacency if the preference were ON
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('Snap-to-Grid still determines the committed position exactly as before, even with an adjacency guide also showing', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} snapToGrid />);

    // 503 is NOT a multiple of 20; Snap-to-Grid must still round it to 500
    // even though the unsnapped preview (a.right = 603) is also within
    // adjacency tolerance of b.left = 600.
    drag('a', { x: 503, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: null });

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 500, position_y: 0 }]);
  });
});
