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
import fs from 'node:fs';
import path from 'node:path';
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
  canEditCanvas = true,
  snapToGrid = false,
}: {
  initialPadlets: Padlet[];
  selectedPadletIds: string[];
  zoom: number;
  canEditCanvas?: boolean;
  snapToGrid?: boolean;
}) {
  const [padlets, setPadlets] = React.useState<Padlet[]>(initialPadlets);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const freeformWorldOriginRef = React.useRef<HTMLDivElement | null>(null);

  const api = useCanvasInteractions({
    containerRef,
    freeformWorldOriginRef,
    canvasZoom: zoom,
    canEditCanvas,
    snapToGrid,
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

/** Real window keydown/keyup for Alt -- exercises the hook's own listener,
 *  covering the "Alt state changes between the last move and release" case
 *  independently of whatever the synthetic mousemove events carried. */
function pressAltKey() {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' })); });
}
function releaseAltKey() {
  act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' })); });
}

/**
 * Same as drag(), but every synthetic mousemove event explicitly carries
 * `altKey: altHeld` (a real MouseEvent's altKey is always a boolean, never
 * undefined -- the plain drag() helper above omits it, which is harmless
 * there only because `undefined` happens to be falsy).
 */
function dragWithAlt(grabId: string, target: { x: number; y: number }, zoom: number, altHeld: boolean) {
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
      altKey: altHeld,
      preventDefault: () => {},
    } as any);
  });
  move();
  move();
}

/** release(), but sets the Alt key state (via real keydown/keyup) immediately
 *  before mouseup -- proving the bypass decision is authoritative AT RELEASE,
 *  not merely inherited from whatever the last mousemove decided. */
async function releaseWithAlt(altHeld: boolean) {
  if (altHeld) pressAltKey(); else releaseAltKey();
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

// PATCH SNAP-GRID-B -- optional grid snapping during ROOT post drag. Reuses
// this file's real hook harness; only the new `snapToGrid` prop is exercised.
describe('PATCH SNAP-GRID-B: snap OFF is byte-for-byte unchanged', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('a drag to a non-grid-aligned world position lands EXACTLY there, no rounding to 20', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid={false} />);
    drag('n1', { x: 413, y: 407 }, 1);
    expect(positionOf('n1')).toEqual({ x: 413, y: 407 });
  });

  it('persists the same non-grid-aligned coordinate on release', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid={false} />);
    drag('n1', { x: 413, y: 407 }, 1);
    await release();
    expect(persisted).toEqual([{ id: 'n1', position_x: 413, position_y: 407 }]);
  });
});

describe('PATCH SNAP-GRID-B: snap ON rounds x/y to the nearest 20 world units', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('the live preview position is already snapped during the drag', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    // World (413,407) rounds to (420,400): Math.round(413/20)*20=420, Math.round(407/20)*20=400.
    drag('n1', { x: 413, y: 407 }, 1);
    expect(positionOf('n1')).toEqual({ x: 420, y: 400 });
  });

  it('persists the identical snapped position the user saw, through the existing commit path', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    drag('n1', { x: 413, y: 407 }, 1);
    const seen = positionOf('n1');
    await release();
    expect(persisted).toEqual([{ id: 'n1', position_x: seen.x, position_y: seen.y }]);
    expect(persisted).toEqual([{ id: 'n1', position_x: 420, position_y: 400 }]);
    // Exactly one write -- no extra persistence beyond the existing single commit.
    expect(persisted).toHaveLength(1);
  });

  it('a multi-selection group drag snaps every member to the grid too (still root posts)', async () => {
    mount(
      <Harness
        initialPadlets={[note('a', 200, 200), note('b', 900, 700)]}
        selectedPadletIds={['a', 'b']}
        zoom={1}
        snapToGrid
      />
    );
    drag('a', { x: 213, y: 207 }, 1);
    expect(positionOf('a')).toEqual({ x: 220, y: 200 });
    // b keeps its exact offset from a (+700, +500) -- the delta itself is
    // snapped once and shared, not re-rounded per member.
    expect(positionOf('b')).toEqual({ x: 920, y: 700 });
    await release();
    expect(persisted).toEqual([
      { id: 'a', position_x: 220, position_y: 200 },
      { id: 'b', position_x: 920, position_y: 700 },
    ]);
  });
});

// PATCH SNAP-GRID-C: the 700/500-unit spacing above is itself a multiple of
// 20, so independently snapping each member's x/y would have coincidentally
// preserved that spacing anyway -- it would NOT have caught a defect where
// snapping is applied per-member instead of once to a shared delta. This
// block uses the spec's own deliberately non-grid-aligned example (A at
// x=13, B at x=47, difference 34 -- not a multiple of 20) to prove the fix.
describe('PATCH SNAP-GRID-C: group drag preserves relative spacing for a non-grid-aligned group (fixes independent-per-member snap defect)', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('relative x distance (34, not a multiple of 20) survives a snapped group drag', async () => {
    mount(
      <Harness
        initialPadlets={[note('a', 13, 100), note('b', 47, 100)]}
        selectedPadletIds={['a', 'b']}
        zoom={1}
        snapToGrid
      />
    );
    // Drag anchor 'a' from world x=13 to world x=35 (raw delta +22).
    drag('a', { x: 35, y: 100 }, 1);
    const a = positionOf('a');
    const b = positionOf('b');
    // The anchor itself lands on a grid line...
    expect(a.x % 20).toBe(0);
    // ...but B is NOT independently re-snapped -- it inherits the anchor's
    // exact delta, so the original 34-unit difference is untouched. (The
    // buggy independent-snap behavior this replaces would have produced a
    // 20-unit difference here instead of 34.)
    expect(b.x - a.x).toBe(34);
    await release();
    const byId = Object.fromEntries(persisted.map((row) => [row.id, row]));
    expect(byId.b.position_x - byId.a.position_x).toBe(34);
  });

  it('a group drag with snap OFF is unaffected (control)', () => {
    mount(
      <Harness
        initialPadlets={[note('a', 13, 100), note('b', 47, 100)]}
        selectedPadletIds={['a', 'b']}
        zoom={1}
        snapToGrid={false}
      />
    );
    drag('a', { x: 35, y: 100 }, 1);
    const a = positionOf('a');
    const b = positionOf('b');
    expect(a).toEqual({ x: 35, y: 100 });
    expect(b.x - a.x).toBe(34);
  });
});

describe('PATCH SNAP-GRID-C: Alt/Option temporarily bypasses snap without touching the stored preference', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('holding Alt through release commits the unsnapped position even with snap ON', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    dragWithAlt('n1', { x: 413, y: 407 }, 1, true);
    expect(positionOf('n1')).toEqual({ x: 413, y: 407 });
    await releaseWithAlt(true);
    expect(persisted).toEqual([{ id: 'n1', position_x: 413, position_y: 407 }]);
  });

  it('releasing with Alt held snaps nothing even if Alt was NOT held during the moves (authoritative at release)', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    // Moves happen without Alt (preview would show snapped)...
    dragWithAlt('n1', { x: 413, y: 407 }, 1, false);
    expect(positionOf('n1')).toEqual({ x: 420, y: 400 });
    // ...but Alt is held at the moment of release.
    await releaseWithAlt(true);
    expect(persisted).toEqual([{ id: 'n1', position_x: 413, position_y: 407 }]);
  });

  it('releasing the drag without Alt still snaps normally (Alt has no lingering effect on the next drag)', async () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    dragWithAlt('n1', { x: 413, y: 407 }, 1, false);
    await releaseWithAlt(false);
    expect(persisted).toEqual([{ id: 'n1', position_x: 420, position_y: 400 }]);
  });

  it('Alt has no special effect when snap is OFF', () => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={1} snapToGrid={false} />);
    dragWithAlt('n1', { x: 413, y: 407 }, 1, true);
    expect(positionOf('n1')).toEqual({ x: 413, y: 407 });
  });

  it('a group drag with Alt held bypasses snap for the whole group, preserving relative spacing exactly as the raw delta would', async () => {
    mount(
      <Harness
        initialPadlets={[note('a', 13, 100), note('b', 47, 100)]}
        selectedPadletIds={['a', 'b']}
        zoom={1}
        snapToGrid
      />
    );
    dragWithAlt('a', { x: 35, y: 100 }, 1, true);
    expect(positionOf('a')).toEqual({ x: 35, y: 100 });
    expect(positionOf('b')).toEqual({ x: 69, y: 100 });
    await releaseWithAlt(true);
    expect(persisted).toEqual([
      { id: 'a', position_x: 35, position_y: 100 },
      { id: 'b', position_x: 69, position_y: 100 },
    ]);
  });
});

describe('PATCH SNAP-GRID-C: Root Container still snaps, its children are untouched', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  const container = (x: number, y: number) => note('col', x, y, {
    type: 'container',
    width: 350,
    height: 300,
    metadata: { isContainer: true, kind: 'container', childPadletIds: ['child-1'] } as any,
  });
  const child = () => note('child-1', 12, 40, { metadata: { parentId: 'col' } as any });

  it('a root Container snaps to the grid like any other root post', async () => {
    mount(<Harness initialPadlets={[container(13, 27), child()]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    drag('col', { x: 35, y: 40 }, 1);
    const { x, y } = positionOf('col');
    expect(x % 20).toBe(0);
    expect(y % 20).toBe(0);
    await release();
    expect(persisted).toEqual([{ id: 'col', position_x: x, position_y: y }]);
  });

  it('the Container child keeps its exact container-local coordinates, untouched by snap', async () => {
    mount(<Harness initialPadlets={[container(13, 27), child()]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    drag('col', { x: 35, y: 40 }, 1);
    await release();
    expect(positionOf('child-1')).toEqual({ x: 12, y: 40 });
    expect(persisted.map((row) => row.id)).toEqual(['col']);
  });
});

describe('PATCH SNAP-GRID-C: toggling snap does not reposition existing posts', () => {
  it('re-rendering the Harness with a different snapToGrid value, with no drag, leaves every position untouched', () => {
    const initial = [note('a', 13, 27), note('b', 900, 701)];
    mount(<Harness initialPadlets={initial} selectedPadletIds={[]} zoom={1} snapToGrid={false} />);
    expect(positionOf('a')).toEqual({ x: 13, y: 27 });
    expect(positionOf('b')).toEqual({ x: 900, y: 701 });

    // Simulate the user flipping the preference mid-session: remount with
    // snapToGrid=true and fresh padlets at the SAME starting coordinates --
    // production never re-snaps on toggle since setFreeformGridPreference
    // (CanvasClient.tsx) never touches padlets/setPadlets, only its own
    // localStorage-backed appearance state.
    mount(<Harness initialPadlets={initial} selectedPadletIds={[]} zoom={1} snapToGrid />);
    expect(positionOf('a')).toEqual({ x: 13, y: 27 });
    expect(positionOf('b')).toEqual({ x: 900, y: 701 });
  });
});

describe('PATCH SNAP-GRID-B: WORLD-coordinate snap is zoom invariant at 50/100/200%', () => {
  beforeEach(() => { installFakeSupabase(); });

  it.each([
    ['50%', 0.5],
    ['100%', 1],
    ['200%', 2],
  ])('dragging to world (413,407) at %s zoom still lands on the same snapped (420,400)', (_label, zoom) => {
    mount(<Harness initialPadlets={[note('n1', 400, 400)]} selectedPadletIds={[]} zoom={zoom} snapToGrid />);
    drag('n1', { x: 413, y: 407 }, zoom);
    const { x, y } = positionOf('n1');
    expect(x).toBeCloseTo(420, 6);
    expect(y).toBeCloseTo(400, 6);
  });
});

describe('PATCH SNAP-GRID-B: negative world coordinates snap with no positive-only assumption', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('drags to world x=-13 and lands on -20 (Math.round(-13/20)*20)', () => {
    mount(<Harness initialPadlets={[note('n1', 0, 0)]} selectedPadletIds={[]} zoom={1} snapToGrid />);
    drag('n1', { x: -13, y: 0 }, 1);
    expect(positionOf('n1').x).toBe(-20);
  });

  it('drags to world x=-27 and lands on -20 (Math.round(-27/20)*20)', async () => {
    mount(<Harness
      initialPadlets={[note('n1', 0, 0)]}
      selectedPadletIds={[]}
      zoom={1}
      snapToGrid
    />);
    drag('n1', { x: -27, y: -13 }, 1);
    const { x, y } = positionOf('n1');
    expect(x).toBe(-20);
    expect(y).toBe(-20);
    await release();
    expect(persisted).toEqual([{ id: 'n1', position_x: -20, position_y: -20 }]);
  });
});

describe('PATCH SNAP-GRID-B: root-only -- container children never reach this drag path regardless of snap', () => {
  it('handlePadletMouseDown is wired only onto padlets from the root render branch, never inside the childPadletIds/containerChildPadlets loop', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Every call site passes padlet.id (the root map's own loop variable),
    // never a child-loop identifier like `child.id`.
    const calls = code.match(/handlePadletMouseDown\(e,\s*[\w.]+\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('padlet.id');
    }
    // The child-inventory block itself (built for the container's edit-target
    // submenu) never calls handlePadletMouseDown at all.
    const childBlockStart = code.indexOf('const containerChildPadlets: Padlet[] = ((padlet.metadata as any)?.childPadletIds');
    expect(childBlockStart).toBeGreaterThan(-1);
    const childBlockEnd = code.indexOf('return (', childBlockStart);
    const childBlock = code.slice(childBlockStart, childBlockEnd);
    expect(childBlock).not.toContain('handlePadletMouseDown');
  });
});

describe('PATCH SNAP-GRID-B: snap does not bypass movement permissions or locks', () => {
  let persisted: PersistedPosition[];
  beforeEach(() => { persisted = installFakeSupabase(); });

  it('a read-only user cannot move a post even with snap ON', async () => {
    mount(
      <Harness
        initialPadlets={[note('n1', 400, 400)]}
        selectedPadletIds={[]}
        zoom={1}
        canEditCanvas={false}
        snapToGrid
      />
    );
    drag('n1', { x: -300, y: -300 }, 1);
    expect(positionOf('n1')).toEqual({ x: 400, y: 400 });
    await release();
    expect(persisted).toHaveLength(0);
  });

  it('a locked post cannot be moved even with snap ON', async () => {
    mount(
      <Harness
        initialPadlets={[note('n1', 400, 400, { metadata: { isLocked: true } as any })]}
        selectedPadletIds={[]}
        zoom={1}
        snapToGrid
      />
    );
    drag('n1', { x: -300, y: -300 }, 1);
    expect(positionOf('n1')).toEqual({ x: 400, y: 400 });
    await release();
    expect(persisted).toHaveLength(0);
  });
});
