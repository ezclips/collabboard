// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import {
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_MIN_WIDTH,
  SECTION_HEADING_TYPE,
  SECTION_HEADING_UNBOUNDED_WORLD,
  resizeSectionHeadingLeftEdge,
  resizeSectionHeadingRightEdge,
  type SectionHeadingWorldBounds,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import {
  FREEFORM_WORLD_MAX_X,
  FREEFORM_WORLD_MIN_X,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B -- proves the Section Heading feature no longer knows what
 * canvas engine it is running on.
 *
 * Two couplings existed after SECTION-H2 (confirmed from source in H3A):
 *   1. the resize helpers imported Freeform's signed-stage bounds directly;
 *   2. the renderer converted pointer movement with a `canvasZoom` scalar.
 *
 * Both are removed here. The helpers take the HOST's bounds; the renderer asks
 * the HOST for absolute world points. Nothing else about the feature changes.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Comments stripped -- a doc comment naming a banned token must never satisfy a negative assertion. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const toolbarSrc = read('components/collabboard/canvas/ui/SectionHeadingToolbar.tsx');
const textStyleSrc = read('components/collabboard/canvas/ui/SectionHeadingTextStylePanel.tsx');
const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const registrySrc = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const typesSrc = read('types/collabboard.ts');

const SHARED_SOURCES: [string, string][] = [
  ['engine/sectionHeading.ts', engineSrc],
  ['SectionHeadingPost.tsx', headingSrc],
  ['SectionHeadingToolbar.tsx', toolbarSrc],
  ['SectionHeadingTextStylePanel.tsx', textStyleSrc],
  ['SectionHeadingAppearancePanel.tsx', appearanceSrc],
];

const FREEFORM_BOUNDS: SectionHeadingWorldBounds = { minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X };
const origin = (rect: { x: number; width: number }, pointerWorldX = 0) => ({ rect, pointerWorldX });

function makeHeading(overrides: Partial<Padlet> = {}): Padlet {
  return {
    id: 'sh-1', board_id: 'b', title: SECTION_HEADING_DEFAULT_TEXT, content: '',
    type: SECTION_HEADING_TYPE, position_x: 100, position_y: 200,
    width: SECTION_HEADING_DEFAULT_WIDTH, height: SECTION_HEADING_DEFAULT_HEIGHT,
    created_at: '', updated_at: '', metadata: { headingLevel: 2 },
    ...overrides,
  } as Padlet;
}

let roots: Root[] = [];
let hosts: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots) act(() => r.unmount());
  for (const h of hosts) h.remove();
  roots = [];
  hosts = [];
});

function mountOnHost(
  padlet: Padlet,
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number },
  worldBounds: SectionHeadingWorldBounds = FREEFORM_BOUNDS,
) {
  const onResizePreview = vi.fn();
  const onResizeCommit = vi.fn();
  const spy = vi.fn(clientToWorld);
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <SectionHeadingPost
      padlet={padlet}
      isSelected
      canEdit
      isDraggingThis={false}
      onMouseDownCapture={vi.fn()}
      onCommitText={vi.fn()}
      clientToWorld={spy}
      worldBounds={worldBounds}
      onResizePreview={onResizePreview}
      onResizeCommit={onResizeCommit}
    />,
  ));
  return { host, spy, onResizePreview, onResizeCommit };
}

function pointer(target: Element, type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 0 });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', isPrimary: true });
  act(() => { target.dispatchEvent(event); });
}

function drag(host: HTMLElement, edge: 'left' | 'right', fromX: number, toX: number) {
  const handle = host.querySelector(`[data-section-heading-handle="${edge}"]`)!;
  pointer(handle, 'pointerdown', fromX);
  pointer(handle, 'pointermove', toX);
  pointer(handle, 'pointerup', toX);
}

// ==================================================== ARCHITECTURE [Phase 25]
describe('SECTION-H3B architecture', () => {
  it('1. the generic geometry module no longer owns any Freeform bounds policy', () => {
    const generic = code(engineSrc);
    expect(generic).not.toContain('freeformStageGeometry');
    expect(generic).not.toContain('FREEFORM_WORLD_MIN_X');
    expect(generic).not.toContain('FREEFORM_WORLD_MAX_X');
    // ...and it does not smuggle the same policy back as literals (Phase 5).
    expect(generic).not.toMatch(/-?\b(5000|15000)\b/);
    // The bounds arrive as an explicit parameter on both helpers (Phase 4, design A).
    expect(engineSrc).toContain('bounds: SectionHeadingWorldBounds,');
    expect((engineSrc.match(/bounds: SectionHeadingWorldBounds,/g) ?? []).length).toBe(2);
    // No default value that could silently reinstate one host's policy.
    expect(engineSrc).not.toMatch(/bounds: SectionHeadingWorldBounds\s*=/);
  });

  it('2. the renderer implements no pointer-delta / zoom coordinate model', () => {
    const renderer = code(headingSrc);
    expect(renderer).not.toMatch(/canvasZoom/);
    expect(renderer).not.toMatch(/\/\s*zoom\b/);
    expect(renderer).not.toMatch(/startClientX/);
    expect(renderer).not.toMatch(/scrollLeft|scrollTop|scrollX|scrollY|appState|worldOrigin|getBoundingClientRect/);
  });

  it('3. the renderer asks the HOST for world points, and invokes it during a gesture', () => {
    expect(headingSrc).toContain('clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };');
    const { host, spy } = mountOnHost(makeHeading(), (clientX) => ({ x: clientX, y: 0 }));
    spy.mockClear();
    drag(host, 'right', 40, 90);
    // pointerdown captures the gesture origin; move and up each resolve again.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([40, 90]));
  });

  it('4. the Freeform host supplies BOTH the canonical converter and the canonical bounds', () => {
    // Bounds are stated at the Freeform call site, from the canonical stage contract.
    expect(cardsSrc).toContain("from '@/components/collabboard/canvas/engine/freeformStageGeometry'");
    expect(cardsSrc).toContain('const FREEFORM_SECTION_HEADING_WORLD_BOUNDS: SectionHeadingWorldBounds = {');
    expect(cardsSrc).toContain('minX: FREEFORM_WORLD_MIN_X,');
    expect(cardsSrc).toContain('maxX: FREEFORM_WORLD_MAX_X,');
    expect(cardsSrc).toContain('worldBounds={FREEFORM_SECTION_HEADING_WORLD_BOUNDS}');
    // The converter is the app's ONE existing helper, threaded through -- not
    // a second formula rebuilt inside the cards component.
    expect(cardsSrc).toContain('clientToWorld={getWorldPointFromClient}');
    expect(canvasClient).toContain('getWorldPointFromClient={getCanvasPointFromClient}');
    expect(canvasClient).toContain('const getCanvasPointFromClient = useCallback(');
    const cardsCode = code(cardsSrc);
    expect(cardsCode).not.toMatch(/clientX - origin\.left|clientY - origin\.top/);
  });

  it('5/6. no Drawing or Excalidraw module is reachable from any shared component', () => {
    for (const [name, src] of SHARED_SOURCES) {
      const c = code(src);
      expect(c, name).not.toMatch(/DrawingLayout|ExcalidrawWrapper|excalidraw_fork|@excalidraw|toSceneCoords/);
    }
  });

  it('7. the persisted semantic model is untouched by this refactor', () => {
    expect(typesSrc).toContain('headingLevel?: 1 | 2 | 3 | 4;');
    expect(typesSrc).toContain('accentColor?: string;');
    for (const key of ['titleStyle', 'textColor', 'backgroundColor']) {
      expect(typesSrc).toContain(`${key}?:`);
    }
    // No new persisted field, and no repository/Supabase reach from the renderer.
    expect(code(headingSrc)).not.toMatch(/supabase|Repository|updatePostFields/i);
    expect(engineSrc).toContain("export const SECTION_HEADING_TYPE = 'section_heading' as const;");
  });

  it('the canonical signed-stage module is itself unchanged and still the one source', () => {
    expect(stageSrc).toContain('export const FREEFORM_WORLD_MIN_X = -5000;');
    expect(stageSrc).toContain('export const FREEFORM_WORLD_MAX_X = 15000;');
  });
});

// ==================================================== GEOMETRY [Phase 26]
describe('SECTION-H3B bounded vs unbounded geometry', () => {
  it('bounded host: right resize still stops at the host maximum', () => {
    const next = resizeSectionHeadingRightEdge(origin({ x: 14000, width: 500 }), 5000, FREEFORM_BOUNDS);
    expect(next).toEqual({ x: 14000, width: 1000 });
    expect(next.x + next.width).toBe(FREEFORM_WORLD_MAX_X);
  });

  it('bounded host: left resize still stops at the host minimum, right edge pinned', () => {
    const next = resizeSectionHeadingLeftEdge(origin({ x: -4900, width: 500 }), -1000, FREEFORM_BOUNDS);
    expect(next.x).toBe(FREEFORM_WORLD_MIN_X);
    expect(next.x + next.width).toBe(-4400);
  });

  it('unbounded host: the SAME gestures are not clamped at the Freeform edges', () => {
    const right = resizeSectionHeadingRightEdge(origin({ x: 14000, width: 500 }), 5000, SECTION_HEADING_UNBOUNDED_WORLD);
    expect(right).toEqual({ x: 14000, width: 5500 });
    const left = resizeSectionHeadingLeftEdge(origin({ x: -4900, width: 500 }), -1000, SECTION_HEADING_UNBOUNDED_WORLD);
    expect(left).toEqual({ x: -5900, width: 1500 });
    expect(left.x + left.width).toBe(-4400);
  });

  it('a custom host may state any bounds it likes', () => {
    const tiny: SectionHeadingWorldBounds = { minX: 0, maxX: 1000 };
    expect(resizeSectionHeadingRightEdge(origin({ x: 200, width: 500 }), 9999, tiny).width).toBe(800);
    expect(resizeSectionHeadingLeftEdge(origin({ x: 200, width: 500 }), -9999, tiny).x).toBe(0);
  });

  it('minimum width holds under every bounds policy', () => {
    for (const bounds of [FREEFORM_BOUNDS, SECTION_HEADING_UNBOUNDED_WORLD, { minX: -10, maxX: 10 }]) {
      expect(resizeSectionHeadingRightEdge(origin({ x: 0, width: 500 }), -100000, bounds).width)
        .toBeLessThanOrEqual(SECTION_HEADING_MIN_WIDTH);
      const left = resizeSectionHeadingLeftEdge(origin({ x: 0, width: 500 }), 100000, bounds);
      expect(left.width).toBe(SECTION_HEADING_MIN_WIDTH);
      expect(left.x + left.width).toBe(500);
    }
  });

  it('the far edge is preserved on left resize regardless of bounds', () => {
    for (const bounds of [FREEFORM_BOUNDS, SECTION_HEADING_UNBOUNDED_WORLD]) {
      for (const delta of [-5000, -1, 0, 100, 299]) {
        const next = resizeSectionHeadingLeftEdge(origin({ x: 1000, width: 500 }), delta, bounds);
        expect(next.x + next.width).toBe(1500);
      }
    }
  });

  it('very large positive and negative world coordinates stay finite and sane', () => {
    const cases: Array<[{ x: number; width: number }, number]> = [
      [{ x: 1e9, width: 500 }, 1e9],
      [{ x: -1e9, width: 500 }, -1e9],
      [{ x: 0, width: 500 }, Number.MAX_SAFE_INTEGER],
      [{ x: 0, width: 500 }, -Number.MAX_SAFE_INTEGER],
    ];
    for (const bounds of [FREEFORM_BOUNDS, SECTION_HEADING_UNBOUNDED_WORLD]) {
      for (const [rect, delta] of cases) {
        for (const next of [
          resizeSectionHeadingRightEdge(origin(rect), delta, bounds),
          resizeSectionHeadingLeftEdge(origin(rect), delta, bounds),
        ]) {
          expect(Number.isFinite(next.x)).toBe(true);
          expect(Number.isFinite(next.width)).toBe(true);
          expect(Number.isNaN(next.x)).toBe(false);
          expect(Number.isNaN(next.width)).toBe(false);
        }
      }
    }
  });

  it('Phase 15: an infinite BOUND never becomes infinite GEOMETRY', () => {
    const right = resizeSectionHeadingRightEdge(origin({ x: 0, width: 500 }), 10, SECTION_HEADING_UNBOUNDED_WORLD);
    const left = resizeSectionHeadingLeftEdge(origin({ x: 0, width: 500 }), -10, SECTION_HEADING_UNBOUNDED_WORLD);
    for (const value of [right.x, right.width, left.x, left.width]) {
      expect(Math.abs(value)).toBeLessThan(Number.POSITIVE_INFINITY);
    }
    expect(SECTION_HEADING_UNBOUNDED_WORLD.minX).toBe(Number.NEGATIVE_INFINITY);
    expect(SECTION_HEADING_UNBOUNDED_WORLD.maxX).toBe(Number.POSITIVE_INFINITY);
  });

  it('garbage input degrades safely rather than producing NaN', () => {
    const junk = origin({ x: Number.NaN, width: Number.NaN }, Number.NaN);
    for (const next of [
      resizeSectionHeadingRightEdge(junk, Number.NaN, FREEFORM_BOUNDS),
      resizeSectionHeadingLeftEdge(junk, Number.NaN, FREEFORM_BOUNDS),
      resizeSectionHeadingRightEdge(origin({ x: 0, width: 500 }), 100, { minX: Number.NaN, maxX: Number.NaN }),
      resizeSectionHeadingLeftEdge(origin({ x: 0, width: 500 }), -100, { minX: Number.NaN, maxX: Number.NaN }),
    ]) {
      expect(Number.isFinite(next.x)).toBe(true);
      expect(Number.isFinite(next.width)).toBe(true);
    }
  });
});

// ==================================================== CONVERTER [Phase 27]
describe('SECTION-H3B host converter independence', () => {
  const HOSTS: Array<[string, (clientX: number) => number, number, number]> = [
    // name,              client -> world,          drag from, drag to
    ['A: 1:1 identity', (c) => c, 500, 800],
    ['B: 2x world scale', (c) => c * 2, 500, 650],
    ['C: negative origin', (c) => c - 750, 500, 800],
    ['D: inverted-ish offset', (c) => c / 4 + 1000, 500, 1700],
  ];

  it.each(HOSTS)('%s: the resize follows the WORLD points the host reports', (_name, convert, from, to) => {
    const { host, onResizeCommit } = mountOnHost(
      makeHeading({ position_x: 100, width: 500 }),
      (clientX) => ({ x: convert(clientX), y: 0 }),
    );
    drag(host, 'right', from, to);
    const expectedDelta = convert(to) - convert(from);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 100, width: Math.round(500 + expectedDelta) });
  });

  it('two hosts reporting the SAME world delta from different client deltas agree exactly', () => {
    const a = mountOnHost(makeHeading({ position_x: 0, width: 500 }), (c) => ({ x: c, y: 0 }));
    drag(a.host, 'right', 0, 300);
    const b = mountOnHost(makeHeading({ position_x: 0, width: 500 }), (c) => ({ x: c * 10, y: 0 }));
    drag(b.host, 'right', 0, 30);
    expect(a.onResizeCommit.mock.calls[0][1]).toEqual(b.onResizeCommit.mock.calls[0][1]);
    expect(a.onResizeCommit.mock.calls[0][1]).toEqual({ x: 0, width: 800 });
  });

  it('the left handle honours the host converter and still pins the right edge', () => {
    const { host, onResizeCommit } = mountOnHost(
      makeHeading({ position_x: 1000, width: 500 }),
      (clientX) => ({ x: clientX * 2, y: 0 }),
    );
    drag(host, 'left', 500, 400);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 800, width: 700 });
    expect(rect.x + rect.width).toBe(1500);
  });

  it('an unbounded host can size a heading past the Freeform edges through the UI', () => {
    const { host, onResizeCommit } = mountOnHost(
      makeHeading({ position_x: 14000, width: 500 }),
      (clientX) => ({ x: clientX, y: 0 }),
      SECTION_HEADING_UNBOUNDED_WORLD,
    );
    drag(host, 'right', 0, 4000);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 14000, width: 4500 });
    expect(rect.x + rect.width).toBeGreaterThan(FREEFORM_WORLD_MAX_X);
  });

  it('the grab target keeps a constant SCREEN size, derived from the converter alone', () => {
    // A host reporting 10 world units per client px must render a handle 10x
    // wider in world units, so it stays the same physical size on screen.
    const at1 = mountOnHost(makeHeading(), (c) => ({ x: c, y: 0 }));
    const at10 = mountOnHost(makeHeading(), (c) => ({ x: c * 10, y: 0 }));
    const widthOf = (h: HTMLElement) =>
      parseFloat((h.querySelector('[data-section-heading-handle="right"]') as HTMLElement).style.width);
    expect(widthOf(at10.host)).toBeCloseTo(widthOf(at1.host) * 10, 5);
    // A degenerate converter must not produce a zero-size or NaN handle.
    const degenerate = mountOnHost(makeHeading(), () => ({ x: 42, y: 0 }));
    expect(widthOf(degenerate.host)).toBeGreaterThan(0);
  });
});

// ==================================================== FREEZE
describe('SECTION-H3B product and scope freeze', () => {
  it('Drawing is still not exposed and its files are untouched by this patch', () => {
    // The registry gate is unchanged: the tool is emitted for Freeform only.
    expect(registrySrc).toContain('...(isFreeformLayout ? [');
    expect(code(registrySrc)).not.toMatch(/isDrawingLayout/);
    expect(canvasClient).toContain("case 'section-heading':");
    expect(canvasClient).toContain('if (!canvasId || !isFreeformLayout) return;');
  });

  it('the toolbar still does no world math and keeps its screen-space placement', () => {
    const bar = code(toolbarSrc);
    expect(toolbarSrc).toContain('viewportRevision: number | string;');
    expect(bar).not.toMatch(/canvasZoom/);
    expect(bar).not.toMatch(/worldBounds|clientToWorld|FREEFORM_WORLD|position_x \*/);
    expect(toolbarSrc).toContain('className="fixed z-[700]');
    // viewportRevision is only ever a dependency, never an operand.
    expect(bar).not.toMatch(/viewportRevision\s*[*/+-]/);
  });

  it('geometry, typography and style contracts are unchanged', () => {
    expect(SECTION_HEADING_DEFAULT_WIDTH).toBe(500);
    // SECTION-H3B.2: default height now derives from the level->height map at
    // the default level (H2), not a flat literal -- see sectionHeadingLevelHeight.test.tsx.
    expect(SECTION_HEADING_DEFAULT_HEIGHT).toBe(56);
    expect(SECTION_HEADING_MIN_WIDTH).toBe(200);
    expect(engineSrc).toContain("1: 'text-2xl font-bold',");
    expect(engineSrc).toContain("2: 'text-xl font-semibold',");
    expect(engineSrc).toContain("3: 'text-lg font-semibold',");
    expect(engineSrc).toContain("4: 'text-base font-medium',");
    expect(engineSrc).toContain("export const SECTION_HEADING_DEFAULT_ACCENT_COLOR = '#0f766e';");
  });

  it('resize remains horizontal only -- no height is ever written', () => {
    const { host } = mountOnHost(makeHeading(), (c) => ({ x: c, y: 0 }));
    const handles = Array.from(host.querySelectorAll('[data-section-heading-handle]'))
      .map((h) => h.getAttribute('data-section-heading-handle')).sort();
    expect(handles).toEqual(['left', 'right']);
    expect(code(headingSrc)).not.toMatch(/nwse-resize|nesw-resize|ns-resize|rotat/i);
    const rect = resizeSectionHeadingRightEdge(origin({ x: 0, width: 500 }), 300, FREEFORM_BOUNDS);
    expect(Object.keys(rect).sort()).toEqual(['width', 'x']);
  });
});
