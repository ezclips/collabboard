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

/**
 * PATCH ALIGN-E1: a bare, un-rendered `[data-padlet-id]` stand-in for a
 * candidate post's actual DOM box -- the Harness itself never renders real
 * post cards, so without this, measureLiveCandidateSize's
 * `document.querySelector` always misses and the fallback-to-stored path is
 * all any test here could exercise. `rect` is in SCREEN px (post-zoom),
 * matching what a real getBoundingClientRect() would report.
 */
let liveCandidateEls: HTMLElement[] = [];
function mountLiveCandidateEl(padletId: string, rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', padletId);
  document.body.appendChild(el);
  stubRect(el, rect);
  liveCandidateEls.push(el);
  return el;
}

/**
 * PATCH ALIGN-E3: a bare stand-in for an ai-component candidate rendered
 * through the legacy AIComponentRenderer path -- reproducing the exact
 * nesting resolveVisualAlignmentCandidateSize walks (outer `[data-padlet-id]`
 * -> the renderer's own root div -> its content viewport -> the
 * `.ai-component-renderer` node itself), with the OUTER box padded taller
 * than its real content (the confirmed live bug: a fixed minHeight applied
 * regardless of actual generated content). `naturalChildRects` are the
 * renderer root's own in-flow children (content viewport, optional
 * attribution row); `absoluteChildRects` are chrome that must NOT count
 * (loading/error overlay, the resize grip).
 */
function mountLegacyAiCandidateEl(
  padletId: string,
  outerRect: { left: number; top: number; width: number; height: number },
  naturalChildRects: Array<{ left: number; top: number; width: number; height: number }>,
  absoluteChildRects: Array<{ left: number; top: number; width: number; height: number }> = [],
  // PATCH ALIGN-E4: a Reactions/Caption footer FreeformPadletCards renders
  // AFTER the AI content root, as a sibling of `legacyOuter` (NOT one of its
  // own children) -- reproducing the real DOM shape so tests can prove the
  // footer no longer inflates the measured content bottom.
  footerRects: Array<{ left: number; top: number; width: number; height: number }> = [],
) {
  const outer = document.createElement('div');
  outer.setAttribute('data-padlet-id', padletId);
  document.body.appendChild(outer);
  stubRect(outer, outerRect);

  const legacyOuter = document.createElement('div');
  // PATCH ALIGN-E4: measurement-only marker AIComponentRenderer's own root
  // now carries in production (see AIComponentRenderer.tsx).
  legacyOuter.setAttribute('data-ai-content-root', 'true');
  outer.appendChild(legacyOuter);
  stubRect(legacyOuter, outerRect); // the padded ancestor -- same box as outer

  const viewport = document.createElement('div');
  legacyOuter.appendChild(viewport);
  const first = naturalChildRects[0] ?? outerRect;
  stubRect(viewport, first);

  const content = document.createElement('div');
  content.className = 'ai-component-renderer';
  viewport.appendChild(content);
  stubRect(content, first);

  for (const rect of naturalChildRects.slice(1)) {
    const sibling = document.createElement('div');
    legacyOuter.appendChild(sibling);
    stubRect(sibling, rect);
  }

  for (const rect of absoluteChildRects) {
    const chrome = document.createElement('div');
    chrome.style.position = 'absolute';
    legacyOuter.appendChild(chrome);
    stubRect(chrome, rect);
  }

  for (const rect of footerRects) {
    const footer = document.createElement('div');
    outer.appendChild(footer);
    stubRect(footer, rect);
  }

  liveCandidateEls.push(outer);
  return outer;
}

/**
 * PATCH ALIGN-E4: a bare stand-in for an Image candidate -- the outer
 * `[data-padlet-id]` box, its single `<img>` (the real visible content), and
 * an optional Reactions/Caption footer rendered AFTER the `<img>` as a
 * sibling, exactly as FreeformPadletCards renders it.
 */
function mountImageCandidateEl(
  padletId: string,
  outerRect: { left: number; top: number; width: number; height: number },
  imgRect: { left: number; top: number; width: number; height: number },
  footerRects: Array<{ left: number; top: number; width: number; height: number }> = [],
) {
  const outer = document.createElement('div');
  outer.setAttribute('data-padlet-id', padletId);
  document.body.appendChild(outer);
  stubRect(outer, outerRect);

  const img = document.createElement('img');
  outer.appendChild(img);
  stubRect(img, imgRect);

  for (const rect of footerRects) {
    const footer = document.createElement('div');
    outer.appendChild(footer);
    stubRect(footer, rect);
  }

  liveCandidateEls.push(outer);
  return outer;
}

/**
 * PATCH ALIGN-E4: a bare stand-in for a STRUCTURED ai-component candidate
 * (no legacy `.ai-component-renderer` involved) -- the outer
 * `[data-padlet-id]` box, its `[data-ai-content-root]` content wrapper (the
 * real visible content), and an optional Reactions/Caption footer rendered
 * AFTER it as a sibling, exactly as FreeformPadletCards renders it.
 */
function mountStructuredAiCandidateEl(
  padletId: string,
  outerRect: { left: number; top: number; width: number; height: number },
  contentRect: { left: number; top: number; width: number; height: number },
  footerRects: Array<{ left: number; top: number; width: number; height: number }> = [],
) {
  const outer = document.createElement('div');
  outer.setAttribute('data-padlet-id', padletId);
  document.body.appendChild(outer);
  stubRect(outer, outerRect);

  const contentRoot = document.createElement('div');
  contentRoot.setAttribute('data-ai-content-root', 'true');
  outer.appendChild(contentRoot);
  stubRect(contentRoot, contentRect);

  for (const rect of footerRects) {
    const footer = document.createElement('div');
    outer.appendChild(footer);
    stubRect(footer, rect);
  }

  liveCandidateEls.push(outer);
  return outer;
}

beforeEach(() => { latest = null; });

afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  for (const el of liveCandidateEls) el.remove();
  liveCandidateEls = [];
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

describe('PATCH ALIGN-E1: live rendered post size for alignment candidates', () => {
  it('Car-style post: a stale stored height (527) is ignored in favor of the live rendered height (216) -- top->bottom adjacency', () => {
    // Numbers from the ALIGN-E LIVE DIAG live inspection: the real Car post
    // had stored height 527 but rendered (actual on-screen) height 216.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('car', 900, 0, { width: 248, height: 527 }), // stored height is stale
    ]} zoom={1} />);
    mountLiveCandidateEl('car', { left: toClientX(900, 1), top: toClientY(0, 1), width: 248, height: 216 });

    // a.top = 213, 3 units from the LIVE bottom (216) -- 314 units from the
    // STALE stored bottom (527), which would never qualify on its own.
    drag('a', { x: 0, y: 213 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 216 });
  });

  it('Biden-style post: a slightly stale stored height (439) is ignored in favor of the live rendered height (432.859375) -- bottom->bottom same-edge', () => {
    // Numbers from the ALIGN-E LIVE DIAG live inspection: the real Biden
    // post had stored height 439 but rendered height 432.859375 -- a small
    // (~6px) drift that on its own already exceeds the 6px tolerance.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('biden', 900, 0, { width: 357, height: 439 }), // stored height is slightly stale
    ]} zoom={1} />);
    mountLiveCandidateEl('biden', { left: toClientX(900, 1), top: toClientY(0, 1), width: 357, height: 432.859375 });

    // a.bottom = 430, 2.859375 units from the LIVE bottom (432.859375) --
    // 9 units from the STALE stored bottom (439), which is outside tolerance.
    drag('a', { x: 0, y: 330 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 432.859375 });
  });

  it('left/right adjacency still works when the live-measured width matches stored (no drift case)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} />);
    mountLiveCandidateEl('b', { left: toClientX(600, 1), top: toClientY(900, 1), width: 180, height: 220 });

    drag('a', { x: 497, y: 0 }, 1); // a.right = 597, 3 units from b.left = 600
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: null });
  });

  it('falls back to stored width/height when the candidate has no mounted DOM node', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }), // no mountLiveCandidateEl call for 'b'
    ]} zoom={1} />);

    drag('a', { x: 497, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: null });
  });

  it('the live measurement is converted through canvasZoom, not read as raw screen pixels', () => {
    // At zoom 0.5, a live screen height of 108px is a WORLD height of 216 --
    // matching the Car post's real live height and producing the same
    // world-space guide value regardless of zoom.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('car', 900, 0, { width: 248, height: 527 }),
    ]} zoom={0.5} />);
    mountLiveCandidateEl('car', { left: toClientX(900, 0.5), top: toClientY(0, 0.5), width: 124, height: 108 });

    drag('a', { x: 0, y: 213 }, 0.5);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 216 });
  });

  it('Alignment Guides OFF still suppresses detection even with a live-measured candidate present', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('car', 900, 0, { width: 248, height: 527 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);
    mountLiveCandidateEl('car', { left: toClientX(900, 1), top: toClientY(0, 1), width: 248, height: 216 });

    drag('a', { x: 0, y: 213 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: null });
  });

  it('Snap-to-Grid still determines the committed position exactly as before, with a live-measured candidate present', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('car', 900, 0, { width: 248, height: 527 }),
    ]} zoom={1} snapToGrid />);
    mountLiveCandidateEl('car', { left: toClientX(900, 1), top: toClientY(0, 1), width: 248, height: 216 });

    // 213 is NOT a multiple of 20; Snap-to-Grid must still round it to 220.
    drag('a', { x: 0, y: 213 }, 1);
    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 0, position_y: 220 }]);
  });
});

describe('PATCH SPACE-P2: guide geometry always uses the outer [data-padlet-id] frame, reverting ALIGN-E3/E4\'s Image/AI content-bound overrides', () => {
  it('a legacy ai-component candidate (the same padded-minHeight DOM shape ALIGN-E3 corrected) is now measured at the OUTER frame\'s own bottom (280), NOT the natural content bottom (90) -- the correction is gone', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('ai1', 900, 0, { width: 200, height: 280, type: 'ai-component' }),
    ]} zoom={1} />);
    mountLegacyAiCandidateEl(
      'ai1',
      { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 280 }, // outer frame -- now authoritative
      [
        { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 70 }, // viewport/content (now IGNORED)
        { left: toClientX(900, 1), top: toClientY(70, 1), width: 200, height: 20 }, // attribution row (now IGNORED)
      ],
      [{ left: toClientX(900, 1), top: toClientY(260, 1), width: 20, height: 20 }], // resize grip (now IGNORED)
    );

    // a.top = 277, 3 units from the OUTER frame's own bottom (280). Under
    // the old ALIGN-E3 correction this would have resolved to 90 instead --
    // proves the outer frame, not the inner content, now wins.
    drag('a', { x: 0, y: 277 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 280 });
  });

  it('structured AI content (no .ai-component-renderer in the DOM) measures the plain outer-box, exactly like any other post type', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('ai2', 900, 0, { width: 200, height: 500, type: 'ai-component' }), // stale stored height
    ]} zoom={1} />);
    mountLiveCandidateEl('ai2', { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 216 });

    drag('a', { x: 0, y: 213 }, 1); // 3 units from the live outer-box bottom = 216
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 216 });
  });

  it('an Image candidate measures the plain outer box regardless of its inner <img>\'s own size', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('car', 900, 0, { width: 248, height: 527, type: 'image' }), // stale stored height
    ]} zoom={1} />);
    mountLiveCandidateEl('car', { left: toClientX(900, 1), top: toClientY(0, 1), width: 248, height: 216 });

    drag('a', { x: 0, y: 213 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 216 });
  });

  it('the outer-frame height is converted through canvasZoom exactly like every other live measurement', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('ai1', 900, 0, { width: 200, height: 280, type: 'ai-component' }),
    ]} zoom={0.5} />);
    mountLegacyAiCandidateEl(
      'ai1',
      { left: toClientX(900, 0.5), top: toClientY(0, 0.5), width: 100, height: 140 }, // outer frame, screen px at zoom 0.5
      [{ left: toClientX(900, 0.5), top: toClientY(0, 0.5), width: 100, height: 45 }], // inner content (now IGNORED)
    );

    // Outer screen height 140 / zoom 0.5 = world height 280.
    drag('a', { x: 0, y: 277 }, 0.5);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 280 });
  });

  it('an Image candidate with a real Reactions+Caption footer is measured at the OUTER frame\'s own bottom (300, footer included) -- ALIGN-E4\'s content-only exclusion is gone', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('img1', 900, 0, { width: 200, height: 300, type: 'image' }),
    ]} zoom={1} />);
    mountImageCandidateEl(
      'img1',
      { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 300 }, // outer frame -- now authoritative
      { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 200 }, // the <img> itself (now IGNORED)
      [{ left: toClientX(900, 1), top: toClientY(200, 1), width: 200, height: 100 }], // Reactions+Caption footer
    );

    // a.top = 297, 3 units from the OUTER frame's own bottom (300). Under
    // the old ALIGN-E4 exclusion this would have resolved to 200 instead.
    drag('a', { x: 0, y: 297 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 300 });
  });

  it('structured AI content with a Reactions+Caption footer is measured at the OUTER frame\'s own bottom (260, footer included)', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('ai3', 900, 0, { width: 200, height: 260, type: 'ai-component' }),
    ]} zoom={1} />);
    mountStructuredAiCandidateEl(
      'ai3',
      { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 260 }, // outer frame -- now authoritative
      { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 216 }, // content root (now IGNORED)
      [{ left: toClientX(900, 1), top: toClientY(216, 1), width: 200, height: 44 }], // Reactions+Caption footer
    );

    drag('a', { x: 0, y: 257 }, 1); // 3 units from the OUTER frame's own bottom (260)
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 260 });
  });

  it('Full View ON vs OFF: an outer frame of the SAME rendered size resolves to the SAME guide regardless of how much/little inner chrome (top strip, content padding) exists behind it -- the resolver never inspects fullView, only the outer node itself', () => {
    // "Full View OFF" stand-in: outer frame with a top strip + bordered
    // content area as separate inner children (extra DOM nodes present).
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('fvOff', 900, 0, { width: 200, height: 216, type: 'image' }),
    ]} zoom={1} />);
    const fvOff = mountLiveCandidateEl('fvOff', { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 216 });
    const topStrip = document.createElement('div');
    fvOff.appendChild(topStrip);
    drag('a', { x: 0, y: 213 }, 1);
    const fvOffResult = latest!.api.alignmentGuides.horizontalY;

    // "Full View ON" stand-in: the SAME outer rect, but with no inner
    // children at all (top strip/border removed, per FreeformImageResizeBox's
    // own fullView-gated JSX) -- the outer node itself is unchanged.
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('fvOn', 900, 0, { width: 200, height: 216, type: 'image' }),
    ]} zoom={1} />);
    mountLiveCandidateEl('fvOn', { left: toClientX(900, 1), top: toClientY(0, 1), width: 200, height: 216 });
    drag('a', { x: 0, y: 213 }, 1);
    const fvOnResult = latest!.api.alignmentGuides.horizontalY;

    expect(fvOffResult).toBe(216);
    expect(fvOnResult).toBe(216);
    expect(fvOffResult).toBe(fvOnResult);
  });
});

describe('PATCH ALIGN-E2: adjacency marker classification (alignmentGuideKinds)', () => {
  it('an ordinary left-left same-edge match reports isAdjacency: false and no marker position', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 500, 900, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 503, y: 0 }, 1); // a.left = 503, matches b.left = 500 (same-edge)
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 500, horizontalY: null });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: false, horizontalIsAdjacency: false,
      verticalMarkerY: null, horizontalMarkerX: null,
    });
  });

  it('right->left adjacency reports isAdjacency: true and a marker Y at the DRAGGED post\'s own vertical center', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 100, { width: 100, height: 40 }), // vertical center = 100 + 20 = 120
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 497, y: 100 }, 1); // a.right = 597, 3 units from b.left = 600
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: null });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: true, horizontalIsAdjacency: false,
      verticalMarkerY: 120, horizontalMarkerX: null,
    });
  });

  it('left->right adjacency reports isAdjacency: true and the same dragged-center marker convention', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 100, { width: 100, height: 40 }), // vertical center = 120
      padlet('b', 100, 900, { width: 200 }), // right = 300
    ]} zoom={1} />);

    drag('a', { x: 303, y: 100 }, 1); // a.left = 303, 3 units from b.right = 300
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 300, horizontalY: null });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: true, horizontalIsAdjacency: false,
      verticalMarkerY: 120, horizontalMarkerX: null,
    });
  });

  it('bottom->top adjacency reports isAdjacency: true and a marker X at the DRAGGED post\'s own horizontal center', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 100, 0, { width: 40, height: 100 }), // horizontal center = 100 + 20 = 120
      padlet('b', 900, 600, { width: 100, height: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 100, y: 497 }, 1); // a.bottom = 597, 3 units from b.top = 600
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 600 });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: false, horizontalIsAdjacency: true,
      verticalMarkerY: null, horizontalMarkerX: 120,
    });
  });

  it('top->bottom adjacency reports isAdjacency: true and the same dragged-center marker convention', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 100, 0, { width: 40, height: 100 }), // horizontal center = 120
      padlet('b', 900, 100, { width: 100, height: 200 }), // bottom = 300
    ]} zoom={1} />);

    drag('a', { x: 100, y: 303 }, 1); // a.top = 303, 3 units from b.bottom = 300
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: null, horizontalY: 300 });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: false, horizontalIsAdjacency: true,
      verticalMarkerY: null, horizontalMarkerX: 120,
    });
  });

  it('both axes can be adjacency matches simultaneously, each with its own marker', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }), // center = (50, 50)
      padlet('b', 600, 600, { width: 180, height: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 497, y: 497 }, 1); // right->left AND bottom->top adjacency
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 600, horizontalY: 600 });
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: true, horizontalIsAdjacency: true,
      verticalMarkerY: 547, horizontalMarkerX: 547,
    });
  });

  it('when a same-edge match wins over a nearer-in-principle-but-farther-in-fact adjacency candidate, isAdjacency correctly reads false', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b1', 498, 900, { width: 180 }), // left-left (same-edge) distance 2 -- nearest
      padlet('b2', 605, 900, { width: 180 }), // right-left (adjacency) distance 5
    ]} zoom={1} />);

    drag('a', { x: 500, y: 0 }, 1);
    expect(latest!.api.alignmentGuides).toEqual({ verticalX: 498, horizontalY: null });
    expect(latest!.api.alignmentGuideKinds.verticalIsAdjacency).toBe(false);
  });

  it('Alignment Guides OFF suppresses alignmentGuideKinds too, even where an adjacency match would otherwise apply', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);

    drag('a', { x: 497, y: 0 }, 1); // would be right->left adjacency if the preference were ON
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: false, horizontalIsAdjacency: false,
      verticalMarkerY: null, horizontalMarkerX: null,
    });
  });

  it('alignmentGuideKinds clears to no-adjacency on mouseup, exactly like alignmentGuides', async () => {
    installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} />);

    drag('a', { x: 497, y: 0 }, 1);
    expect(latest!.api.alignmentGuideKinds.verticalIsAdjacency).toBe(true);

    await release();
    expect(latest!.api.alignmentGuideKinds).toEqual({
      verticalIsAdjacency: false, horizontalIsAdjacency: false,
      verticalMarkerY: null, horizontalMarkerX: null,
    });
  });

  it('Snap-to-Grid still determines the committed position exactly as before, with an adjacency marker also showing', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100 }),
      padlet('b', 600, 900, { width: 180 }),
    ]} zoom={1} snapToGrid />);

    drag('a', { x: 503, y: 0 }, 1); // a.right previews to 603, 3 units from b.left = 600
    expect(latest!.api.alignmentGuideKinds.verticalIsAdjacency).toBe(true);

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 500, position_y: 0 }]);
  });
});

describe('PATCH SPACE-P1: spacing-gap bracket detection (spacingGuides)', () => {
  it('horizontal positive gap: a neighbour to the RIGHT with sufficient Y overlap resolves the exact facing-edge gap', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 280, 20, { width: 80, height: 60 }),
    ]} zoom={1} />);

    drag('a', { x: 130, y: 0 }, 1); // a.right previews to 230, gap to b.left (280) = 50
    expect(latest!.api.spacingGuides.horizontalGap).toEqual({ gapStart: 230, gapEnd: 280, crossCenter: 50, distance: 50 });
    expect(latest!.api.spacingGuides.verticalGap).toBeNull();
  });

  it('vertical positive gap: a neighbour BELOW with sufficient X overlap resolves the exact facing-edge gap', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 20, 280, { width: 60, height: 80 }),
    ]} zoom={1} />);

    drag('a', { x: 0, y: 130 }, 1); // a.bottom previews to 230, gap to b.top (280) = 50
    expect(latest!.api.spacingGuides.verticalGap).toEqual({ gapStart: 230, gapEnd: 280, crossCenter: 50, distance: 50 });
    expect(latest!.api.spacingGuides.horizontalGap).toBeNull();
  });

  it('distance is a WORLD-unit value, not a screen-pixel one -- unaffected by zoom, unlike the max-visibility-distance cap that gates it', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 280, 20, { width: 80, height: 60 }),
    ]} zoom={0.5} />);

    drag('a', { x: 130, y: 0 }, 0.5);
    expect(latest!.api.spacingGuides.horizontalGap?.distance).toBe(50);
  });

  it('the nearest qualifying neighbour wins, exactly matching detectHorizontalSpacingGap\'s own nearest-wins contract', () => {
    mount(<Harness initialPadlets={[
      padlet('a', -6, 0, { width: 100, height: 100 }), // starts 6 units off target -- clears the drag-start threshold
      padlet('far', 500, 0, { width: 50, height: 100 }),  // gap 400
      padlet('near', 260, 0, { width: 50, height: 100 }), // gap 160 -- nearest
      padlet('mid', 350, 0, { width: 50, height: 100 }),  // gap 250
    ]} zoom={1} />);

    drag('a', { x: 0, y: 0 }, 1); // a.right = 100
    expect(latest!.api.spacingGuides.horizontalGap).toEqual({ gapStart: 100, gapEnd: 260, crossCenter: 50, distance: 160 });
  });

  it('overlapping posts (both axes) produce no gap measurement on either axis', () => {
    mount(<Harness initialPadlets={[
      padlet('a', -6, 0, { width: 100, height: 100 }), // starts 6 units off target -- clears the drag-start threshold
      padlet('b', 40, 40, { width: 100, height: 100 }),
    ]} zoom={1} />);

    drag('a', { x: 0, y: 0 }, 1); // a and b overlap on both X and Y
    expect(latest!.api.spacingGuides).toEqual({ horizontalGap: null, verticalGap: null });
  });

  it('a far-away post (beyond the 160-screen-px cap) produces no measurement', () => {
    mount(<Harness initialPadlets={[
      padlet('a', -6, 0, { width: 100, height: 100 }), // starts 6 units off target -- clears the drag-start threshold
      padlet('b', 1000, 20, { width: 80, height: 60 }), // gap 900, far beyond the cap
    ]} zoom={1} />);

    drag('a', { x: 0, y: 0 }, 1);
    expect(latest!.api.spacingGuides).toEqual({ horizontalGap: null, verticalGap: null });
  });

  it('Alignment Guides OFF suppresses spacingGuides too, even where a qualifying gap would otherwise show', () => {
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 280, 20, { width: 80, height: 60 }),
    ]} zoom={1} alignmentGuidesEnabled={false} />);

    drag('a', { x: 130, y: 0 }, 1); // would show a horizontal bracket if the preference were ON
    expect(latest!.api.spacingGuides).toEqual({ horizontalGap: null, verticalGap: null });
  });

  it('spacingGuides clears on mouseup, exactly like alignmentGuides', async () => {
    installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 280, 20, { width: 80, height: 60 }),
    ]} zoom={1} />);

    drag('a', { x: 130, y: 0 }, 1);
    expect(latest!.api.spacingGuides.horizontalGap).not.toBeNull();

    await release();
    expect(latest!.api.spacingGuides).toEqual({ horizontalGap: null, verticalGap: null });
  });

  it('Snap-to-Grid still determines the committed position exactly as before -- the spacing bracket never moves or snaps the post', async () => {
    const persisted = installFakeSupabase();
    mount(<Harness initialPadlets={[
      padlet('a', 0, 0, { width: 100, height: 100 }),
      padlet('b', 280, 20, { width: 80, height: 60 }),
    ]} zoom={1} snapToGrid />);

    drag('a', { x: 133, y: 0 }, 1); // not a multiple of 20 -- snaps to 140
    expect(latest!.api.spacingGuides.horizontalGap).not.toBeNull(); // a bracket IS showing during this drag

    await release();
    expect(persisted).toEqual([{ id: 'a', position_x: 140, position_y: 0 }]);
  });
});
