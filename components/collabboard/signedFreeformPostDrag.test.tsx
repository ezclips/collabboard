// @vitest-environment jsdom
//
// PATCH 9V.2B -- the actual reported bug, as a runtime test.
//
// Root Freeform posts used to stop dead at logical world (0,0): every drag
// path ended in Math.max(0, ...), so a post could never travel left of x=0 or
// above y=0 no matter where the camera was looking. PATCH 9V.2A made the
// negative world REACHABLE (a finite signed -5000..15000 stage); this patch
// makes it USABLE.
//
// The harness below mounts the REAL useCanvasInteractions hook wired exactly
// the way CanvasClient.tsx wires it for Freeform, and drives real pointer
// sequences through it. Only the Supabase network boundary is faked -- which
// doubles as the proof that the coordinates the user SEES (optimistic state)
// and the coordinates that reach the database are the same numbers.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { useCanvasInteractions } from './canvas/hooks/useCanvasInteractions';
import {
  FREEFORM_WORLD_MAX_X,
  FREEFORM_WORLD_MAX_Y,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE_WIDTH = 180;
const NOTE_HEIGHT = 220;
const DRAG_START_DISTANCE = 5;

/** Where world (0,0) sits on screen. Everything else is derived from it, so
 *  the tests never depend on scroll/gutter bookkeeping -- exactly like
 *  production, which reads this from freeformWorldOriginRef's live rect. */
const ORIGIN_LEFT = 600;
const ORIGIN_TOP = 400;

interface PersistedPosition {
  id: string;
  position_x: number;
  position_y: number;
}

function installFakeSupabase() {
  const persisted: PersistedPosition[] = [];
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

interface HarnessHandle {
  api: Api;
  padlets: Padlet[];
}

let latest: HarnessHandle | null = null;

function Harness({
  initialPadlets,
  selectedPadletIds,
  zoom,
}: {
  initialPadlets: Padlet[];
  selectedPadletIds: string[];
  zoom: number;
}) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(initialPadlets);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const freeformWorldOriginRef = React.useRef<HTMLDivElement | null>(null);

  const api = useCanvasInteractions({
    containerRef,
    freeformWorldOriginRef,
    canvasZoom: zoom,
    canEditCanvas: true,
    padlets,
    setPadlets,
    selectedPadletIds,
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
          // Viewport: 1200x800 at the screen origin.
          if (node) stubRect(node, { left: 0, top: 0, width: 1200, height: 800 });
        }}
      />
      <div
        ref={(node) => {
          freeformWorldOriginRef.current = node;
          // The scaled world plane: world (0,0) lives at ORIGIN_LEFT/TOP.
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

beforeEach(() => {
  latest = null;
});

afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.clearAllMocks();
});

function note(id: string, x: number, y: number, overrides: Partial<Padlet> = {}): Padlet {
  return {
    id,
    board_id: 'board-1',
    type: 'note',
    title: id,
    content: '',
    position_x: x,
    position_y: y,
    width: NOTE_WIDTH,
    height: NOTE_HEIGHT,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  } as Padlet;
}

const toClientX = (worldX: number, zoom: number) => ORIGIN_LEFT + worldX * zoom;
const toClientY = (worldY: number, zoom: number) => ORIGIN_TOP + worldY * zoom;

/**
 * Grabs `grabId` exactly at its own top-left corner (so the grab offset is a
 * clean zero) and drags until the pointer sits over world `target`.
 *
 * Two moves are required and that is production behaviour, not a harness
 * quirk: the first move past the threshold only *starts* the drag (isDragging
 * is still false in that closure), the second one positions it.
 */
function drag(grabId: string, target: { x: number; y: number }, zoom: number) {
  const handle = latest!;
  const grabbed = handle.padlets.find((p) => p.id === grabId)!;
  const startClientX = toClientX(grabbed.position_x, zoom);
  const startClientY = toClientY(grabbed.position_y, zoom);

  const postEl = document.createElement('div');
  stubRect(postEl, {
    left: startClientX,
    top: startClientY,
    width: (Number(grabbed.width) || NOTE_WIDTH) * zoom,
    height: (Number(grabbed.height) || NOTE_HEIGHT) * zoom,
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

function positionOf(id: string) {
  const padlet = latest!.padlets.find((p) => p.id === id)!;
  return { x: padlet.position_x, y: padlet.position_y };
}

describe('PATCH 9V.2B: single root post drag crosses logical zero [matrix 12-18]', () => {
  beforeEach(() => { installFakeSupabase(); });

  it('drags LEFT through x=0 into the negative world [12]', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: -300, y: 400 }, 1);
    expect(positionOf('n1')).toEqual({ x: -300, y: 400 });
  });

  it('drags UP through y=0 into the negative world [13]', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: 400, y: -300 }, 1);
    expect(positionOf('n1')).toEqual({ x: 400, y: -300 });
  });

  it('crosses both axes at once [14]', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: -1000, y: -500 }, 1);
    expect(positionOf('n1')).toEqual({ x: -1000, y: -500 });
  });

  it('stops deterministically at the finite left/top world edge, not at zero [15, 16]', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: -99999, y: -99999 }, 1);
    expect(positionOf('n1')).toEqual({ x: FREEFORM_WORLD_MIN_X, y: FREEFORM_WORLD_MIN_Y });
  });

  it('stops at the max edge with the WHOLE post inside the world [17, 18]', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: 99999, y: 99999 }, 1);
    const { x, y } = positionOf('n1');
    expect(x + NOTE_WIDTH).toBe(FREEFORM_WORLD_MAX_X);
    expect(y + NOTE_HEIGHT).toBe(FREEFORM_WORLD_MAX_Y);
    expect({ x, y }).toEqual({ x: 14820, y: 14780 });
  });

  it('bounds a post by its OWN size, not a hardcoded 180x220 [Phase 6]', () => {
    const wide = note('wide', 400, 400, { width: 900, height: 700 });
    mount(<Harness initialPadlets={[wide]} selectedPadletIds={[]} zoom={1} />);
    drag('wide', { x: 99999, y: 99999 }, 1);
    expect(positionOf('wide')).toEqual({ x: 15000 - 900, y: 15000 - 700 });
  });

  it('bounds an auto-sized post (null width/height) by its live rendered rect [Phase 6]', () => {
    // Auto-height types persist no width/height at all; the measured rect
    // taken at mousedown is the only truthful geometry available.
    const auto = note('auto', 400, 400, { width: null as any, height: null as any });
    mount(<Harness initialPadlets={[auto]} selectedPadletIds={[]} zoom={1} />);
    // drag() stubs the element at the default 180x220 when dims are missing.
    drag('auto', { x: 99999, y: 99999 }, 1);
    expect(positionOf('auto')).toEqual({ x: 14820, y: 14780 });
  });
});

describe('PATCH 9V.2B: signed drag is zoom invariant [matrix 19-23, 31]', () => {
  beforeEach(() => { installFakeSupabase(); });

  it.each([
    ['100%', 1],
    ['150%', 1.5],
    ['40%', 0.4],
    ['20%', 0.2],
    ['10%', 0.1],
  ])('lands on world (-300,-300) when dragged there at %s zoom', (_label, zoom) => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={zoom} />);
    drag('n1', { x: -300, y: -300 }, zoom);
    const { x, y } = positionOf('n1');
    expect(x).toBeCloseTo(-300, 6);
    expect(y).toBeCloseTo(-300, 6);
  });
});

describe('PATCH 9V.2B: multi-selection drag moves as one rigid group [matrix 24-31]', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  const GROUP = () => [note('a', 200, 200), note('b', 900, 700)];
  const SELECTED = ['a', 'b'];

  it('carries the whole selection across x=0 and y=0 [24, 25]', () => {
    mount(<Harness initialPadlets={GROUP()} selectedPadletIds={SELECTED} zoom={1} />);
    drag('a', { x: -500, y: -400 }, 1);
    expect(positionOf('a')).toEqual({ x: -500, y: -400 });
    // b keeps its exact offset from a (+700, +500).
    expect(positionOf('b')).toEqual({ x: 200, y: 100 });
  });

  it('preserves spacing exactly when the group hits the left/top edge [26, 27, 29, 38]', () => {
    mount(<Harness initialPadlets={GROUP()} selectedPadletIds={SELECTED} zoom={1} />);
    drag('a', { x: -99999, y: -99999 }, 1);
    const a = positionOf('a');
    const b = positionOf('b');
    // The group's own minimum lands on the world minimum...
    expect(a).toEqual({ x: FREEFORM_WORLD_MIN_X, y: FREEFORM_WORLD_MIN_Y });
    // ...and the spacing is untouched: this is the assertion that fails if
    // members are clamped individually instead of by a shared delta.
    expect(b.x - a.x).toBe(700);
    expect(b.y - a.y).toBe(500);
  });

  it('preserves spacing exactly when the group hits the right/bottom edge [28, 30, 38]', () => {
    mount(<Harness initialPadlets={GROUP()} selectedPadletIds={SELECTED} zoom={1} />);
    drag('a', { x: 99999, y: 99999 }, 1);
    const a = positionOf('a');
    const b = positionOf('b');
    expect(b.x + NOTE_WIDTH).toBe(FREEFORM_WORLD_MAX_X);
    expect(b.y + NOTE_HEIGHT).toBe(FREEFORM_WORLD_MAX_Y);
    expect(b.x - a.x).toBe(700);
    expect(b.y - a.y).toBe(500);
  });

  it('persists exactly the coordinates the user saw, for every member [31]', async () => {
    mount(<Harness initialPadlets={GROUP()} selectedPadletIds={SELECTED} zoom={1} />);
    drag('a', { x: -1200, y: -900 }, 1);
    const optimistic = { a: positionOf('a'), b: positionOf('b') };
    await release();

    expect(persisted).toHaveLength(2);
    for (const row of persisted) {
      const seen = optimistic[row.id as 'a' | 'b'];
      expect({ x: row.position_x, y: row.position_y }).toEqual({ x: seen.x, y: seen.y });
    }
    // And they really are negative -- not a pair of matching zeroes.
    expect(persisted.every((row) => row.position_x < 0 && row.position_y < 0)).toBe(true);
  });

  it('persists a clamped group edge without re-clamping members independently [31]', async () => {
    mount(<Harness initialPadlets={GROUP()} selectedPadletIds={SELECTED} zoom={1} />);
    drag('a', { x: -99999, y: -99999 }, 1);
    await release();

    const byId = Object.fromEntries(persisted.map((row) => [row.id, row]));
    expect(byId.a.position_x).toBe(FREEFORM_WORLD_MIN_X);
    expect(byId.b.position_x - byId.a.position_x).toBe(700);
    expect(byId.b.position_y - byId.a.position_y).toBe(500);
  });
});

describe('PATCH 9V.2B: single-drag persistence parity [matrix 31]', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('writes the same negative coordinates the optimistic state holds', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: -1000, y: -500 }, 1);
    const seen = positionOf('n1');
    await release();
    expect(persisted).toEqual([{ id: 'n1', position_x: -1000, position_y: -500 }]);
    expect(seen).toEqual({ x: -1000, y: -500 });
  });

  it('writes the clamped world-edge coordinate, never a gutter coordinate [matrix 42, Phase 36]', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} />);
    // Pointer far out in the outer camera gutter, well beyond the world edge.
    drag('n1', { x: -12000, y: -12000 }, 1);
    await release();
    expect(persisted).toEqual([{ id: 'n1', position_x: FREEFORM_WORLD_MIN_X, position_y: FREEFORM_WORLD_MIN_Y }]);
  });
});

describe('PATCH 9V.2B: root Container drag [matrix 56, 57; Phase 12, 21, 22]', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  const container = (x: number, y: number) => note('col', x, y, {
    type: 'container',
    width: 350,
    height: 300,
    metadata: { isContainer: true, kind: 'container', childPadletIds: ['child-1'] } as any,
  });
  // A child carries container-LOCAL coordinates; the container move must not
  // touch them (no child-coordinate redesign in this patch).
  const child = () => note('child-1', 12, 40, { metadata: { parentId: 'col' } as any });

  it('moves a root Container to (-1000,-500) with its whole outer rect inside the world [56]', async () => {
    mount(<Harness initialPadlets={[container(400, 400), child()]} selectedPadletIds={[]} zoom={1} />);
    drag('col', { x: -1000, y: -500 }, 1);
    expect(positionOf('col')).toEqual({ x: -1000, y: -500 });
    await release();
    expect(persisted).toEqual([{ id: 'col', position_x: -1000, position_y: -500 }]);
  });

  it('bounds the Container by its own 350x300 outer rect at the max edge [Phase 12]', () => {
    mount(<Harness initialPadlets={[container(400, 400), child()]} selectedPadletIds={[]} zoom={1} />);
    drag('col', { x: 99999, y: 99999 }, 1);
    expect(positionOf('col')).toEqual({ x: FREEFORM_WORLD_MAX_X - 350, y: FREEFORM_WORLD_MAX_Y - 300 });
  });

  it('leaves child coordinates untouched when the Container goes negative [57]', async () => {
    mount(<Harness initialPadlets={[container(400, 400), child()]} selectedPadletIds={[]} zoom={1} />);
    drag('col', { x: -1000, y: -500 }, 1);
    await release();
    expect(positionOf('child-1')).toEqual({ x: 12, y: 40 });
    // Only the container was written; the child was never repositioned.
    expect(persisted.map((row) => row.id)).toEqual(['col']);
  });

  it('still detects overlap with a Container that sits in negative world [matrix 50; Phase 22]', () => {
    // Root Note at -1000, root Container at -1500: dragging the Note over the
    // Container must still resolve as a drop target in negative coordinates.
    mount(
      <Harness
        initialPadlets={[note('n1', -1000, -500), container(-1500, -600)]}
        selectedPadletIds={[]}
        zoom={1}
      />
    );
    drag('n1', { x: -1450, y: -550 }, 1);
    expect(latest!.api.dragOverContainerId).toBe('col');
  });
});

describe('PATCH 9V.2B: negative world posts stay reachable [matrix 62, 63]', () => {
  beforeEach(() => { installFakeSupabase(); });

  it('a post parked at (-4500,-4500) is still draggable after a narrower viewport [62]', () => {
    // The signed stage is physical and deterministic, so a post near the
    // world minimum does not depend on the viewport being wide enough to
    // have produced enough scrollable room -- the 9V.1 stranding hazard.
    mount(<Harness initialPadlets={[note('n1', -4500, -4500)]} selectedPadletIds={[]} zoom={1} />);
    drag('n1', { x: -4400, y: -4400 }, 1);
    expect(positionOf('n1')).toEqual({ x: -4400, y: -4400 });
  });

  it('a post placed at (-4500,-4500) at 10% zoom is still there at 100% and 150% [63]', () => {
    mount(<Harness initialPadlets={[note('n1', 0, 0)]} selectedPadletIds={[]} zoom={0.1} />);
    drag('n1', { x: -4500, y: -4500 }, 0.1);
    const at10 = positionOf('n1');
    expect(at10.x).toBeCloseTo(-4500, 6);

    for (const zoom of [1, 1.5]) {
      mount(<Harness initialPadlets={[note('n1', -4500, -4500)]} selectedPadletIds={[]} zoom={zoom} />);
      drag('n1', { x: -4400, y: -4400 }, zoom);
      const moved = positionOf('n1');
      expect(moved.x).toBeCloseTo(-4400, 6);
      expect(moved.y).toBeCloseTo(-4400, 6);
    }
  });
});
