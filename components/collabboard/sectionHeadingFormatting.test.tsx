// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import SectionHeadingAppearancePanel from '@/components/collabboard/canvas/ui/SectionHeadingAppearancePanel';
import SectionHeadingTextStylePanel from '@/components/collabboard/canvas/ui/SectionHeadingTextStylePanel';
import {
  SECTION_HEADING_DEFAULT_ACCENT_COLOR,
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_LEVELS,
  SECTION_HEADING_LEVEL_TEXT_CLASS,
  SECTION_HEADING_MIN_WIDTH,
  SECTION_HEADING_TYPE,
  computeSectionHeadingToolbarPlacement,
  getSectionHeadingAccentColor,
  getSectionHeadingBackgroundColor,
  getSectionHeadingLevel,
  resizeSectionHeadingLeftEdge,
  resizeSectionHeadingRightEdge,
  resolveSectionHeadingTextStyle,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import {
  FREEFORM_WORLD_MAX_X,
  FREEFORM_WORLD_MIN_X,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import { canBeContainerChild, canBeGraphEndpoint } from '@/components/collabboard/canvas/engine/sectionHeading';
import { findContainerOverlappingRect, getEligibleContainerDestinations } from '@/components/collabboard/canvas/engine/utils';
import { getFallbackMinimapItem, getMinimapItemKind } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import type { Padlet } from '@/types/collabboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Source with comments stripped. Every `not.toMatch`/`not.toContain` below
 * MUST run against this: a doc comment that merely names a banned token would
 * otherwise satisfy the assertion and hide a real regression. (SECTION-H1
 * proved this the hard way -- two assertions passed only because of the
 * implementation's own prose.)
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const toolbarSrc = read('components/collabboard/canvas/ui/SectionHeadingToolbar.tsx');
const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
const textStyleSrc = read('components/collabboard/canvas/ui/SectionHeadingTextStylePanel.tsx');
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const typesSrc = read('types/collabboard.ts');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const navSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const librarySrc = read('components/collabboard/LibraryPanel.tsx');
const lineSrc = read('components/collabboard/SimpleLineRenderer.tsx');
const graphSrc = read('components/graph/FreeformGraphLayer.tsx');
const noteEditorSrc = read('components/collabboard/editors/NoteEditor.tsx');
const documentEditorSrc = read('components/collabboard/editors/DocumentEditor.tsx');

/**
 * PATCH SECTION-H3B: a synthetic HOST converter. It models a canvas whose
 * world = client / scale, which is exactly what a camera at `scale` does --
 * but the component under test never learns that, it only calls the function.
 */
function hostAtScale(scale: number) {
  return (clientX: number, clientY: number) => ({ x: clientX / scale, y: clientY / scale });
}

/** The Freeform host's own bounds, read from the canonical signed-stage contract. */
const FREEFORM_BOUNDS = { minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X };

/** Origin helper: a gesture starting on `rect` with the pointer at world 0. */
function origin(rect: { x: number; width: number }, pointerWorldX = 0) {
  return { rect, pointerWorldX };
}

function makeHeading(overrides: Partial<Padlet> = {}): Padlet {
  return {
    id: 'sh-1',
    board_id: 'board-1',
    title: SECTION_HEADING_DEFAULT_TEXT,
    content: '',
    type: SECTION_HEADING_TYPE,
    position_x: 100,
    position_y: 200,
    width: SECTION_HEADING_DEFAULT_WIDTH,
    height: SECTION_HEADING_DEFAULT_HEIGHT,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: { headingLevel: SECTION_HEADING_DEFAULT_LEVEL },
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

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return host;
}

function mountHeading(
  padlet: Padlet,
  overrides: Partial<React.ComponentProps<typeof SectionHeadingPost>> & { scale?: number } = {},
) {
  const onCommitText = vi.fn();
  const onMouseDownCapture = vi.fn();
  const onResizePreview = vi.fn();
  const onResizeCommit = vi.fn();
  const host = render(
    <SectionHeadingPost
      padlet={padlet}
      isSelected={overrides.isSelected ?? true}
      canEdit={overrides.canEdit ?? true}
      isDraggingThis={false}
      onMouseDownCapture={onMouseDownCapture}
      onCommitText={onCommitText}
      clientToWorld={overrides.clientToWorld ?? hostAtScale(overrides.scale ?? 1)}
      worldBounds={overrides.worldBounds ?? FREEFORM_BOUNDS}
      canResize={overrides.canResize ?? true}
      onResizePreview={onResizePreview}
      onResizeCommit={onResizeCommit}
    />,
  );
  return { host, onCommitText, onMouseDownCapture, onResizePreview, onResizeCommit };
}

function mountToolbar(padlet: Padlet, headingElement: HTMLElement | null = null) {
  const onChangeLevel = vi.fn();
  const onChangeTextStyle = vi.fn();
  const onChangeColor = vi.fn();
  const host = render(
    <SectionHeadingToolbar
      padlet={padlet}
      headingElement={headingElement}
      viewportRevision={1}
      onChangeLevel={onChangeLevel}
      onChangeTextStyle={onChangeTextStyle}
      onChangeColor={onChangeColor}
    />,
  );
  return { host, onChangeLevel, onChangeTextStyle, onChangeColor };
}

/** Dispatches a real PointerEvent-shaped MouseEvent jsdom will route to React. */
function pointer(target: Element, type: string, clientX: number, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 0 });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra });
  act(() => { target.dispatchEvent(event); });
}

function dragHandle(host: HTMLElement, edge: 'left' | 'right', fromX: number, toX: number) {
  const handle = host.querySelector(`[data-section-heading-handle="${edge}"]`)!;
  pointer(handle, 'pointerdown', fromX);
  pointer(handle, 'pointermove', toX);
  pointer(handle, 'pointerup', toX);
  return handle;
}

// ============================================================ H LEVELS [1-17]
describe('SECTION-H2 heading levels [1-17]', () => {
  it('1/2/3/4. H1, H2, H3 and H4 controls all exist', () => {
    const { host } = mountToolbar(makeHeading());
    for (const level of [1, 2, 3, 4]) {
      const button = host.querySelector(`[data-section-heading-level="${level}"]`);
      expect(button, `H${level} button`).not.toBeNull();
      expect(button!.textContent).toBe(`H${level}`);
    }
  });

  it('5/6. no H5 and no H6 -- the level set stops at four', () => {
    const { host } = mountToolbar(makeHeading());
    expect(host.querySelector('[data-section-heading-level="5"]')).toBeNull();
    expect(host.querySelector('[data-section-heading-level="6"]')).toBeNull();
    expect(host.querySelectorAll('[data-section-heading-level]').length).toBe(4);
    expect(SECTION_HEADING_LEVELS).toEqual([1, 2, 3, 4]);
    expect(Object.keys(SECTION_HEADING_LEVEL_TEXT_CLASS)).toEqual(['1', '2', '3', '4']);
  });

  it('7. H2 is the initially active level for a default heading', () => {
    const { host } = mountToolbar(makeHeading());
    expect(host.querySelector('[data-section-heading-level="2"]')!.getAttribute('aria-pressed')).toBe('true');
    for (const level of [1, 3, 4]) {
      expect(host.querySelector(`[data-section-heading-level="${level}"]`)!.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it.each([1, 2, 3, 4] as const)('8/9/10/11. clicking H%s updates the level through the canonical callback', (level) => {
    const { host, onChangeLevel } = mountToolbar(makeHeading({ metadata: { headingLevel: level === 1 ? 4 : 1 } as never }));
    act(() => { (host.querySelector(`[data-section-heading-level="${level}"]`) as HTMLElement).click(); });
    expect(onChangeLevel).toHaveBeenCalledWith('sh-1', level);
  });

  it('12. the selected level carries an obvious active state', () => {
    const { host } = mountToolbar(makeHeading({ metadata: { headingLevel: 3 } as never }));
    const active = host.querySelector('[data-section-heading-level="3"]') as HTMLElement;
    const inactive = host.querySelector('[data-section-heading-level="1"]') as HTMLElement;
    expect(active.className).toContain('bg-blue-50');
    expect(inactive.className).not.toContain('bg-blue-50');
  });

  it('13. accessibility: aria-label "Heading N" plus aria-pressed on every level', () => {
    const { host } = mountToolbar(makeHeading({ metadata: { headingLevel: 4 } as never }));
    for (const level of [1, 2, 3, 4]) {
      const button = host.querySelector(`[data-section-heading-level="${level}"]`)!;
      expect(button.getAttribute('aria-label')).toBe(`Heading ${level}`);
      expect(button.getAttribute('aria-pressed')).toBe(String(level === 4));
    }
  });

  it('14. the renderer consumes the ONE canonical typography map', () => {
    expect(headingSrc).toContain('SECTION_HEADING_LEVEL_TEXT_CLASS');
    for (const level of [1, 2, 3, 4] as const) {
      const { host } = mountHeading(makeHeading({ metadata: { headingLevel: level } as never }));
      const label = host.querySelector('[data-section-heading-text="true"]') as HTMLElement;
      expect(label.className).toContain(SECTION_HEADING_LEVEL_TEXT_CLASS[level]);
    }
    // The map has exactly one definition in the codebase.
    expect(code(engineSrc)).toContain('SECTION_HEADING_LEVEL_TEXT_CLASS: Record<SectionHeadingLevel, string>');
    expect(code(headingSrc)).not.toMatch(/LEVEL_TEXT_CLASS\s*[:=]\s*\{/);
  });

  it('15. the toolbar defines NO second font-size/weight map', () => {
    const toolbarCode = code(toolbarSrc);
    // No level -> typography mapping of any shape, and none of the canonical
    // map's own size classes restated as literals.
    expect(toolbarCode).not.toMatch(/Record<SectionHeadingLevel/);
    expect(toolbarCode).not.toMatch(/[1-4]:\s*['"`]text-/);
    expect(toolbarCode).not.toMatch(/text-2xl|text-xl|text-lg/);
    expect(toolbarCode).not.toMatch(/font-bold|font-medium/);
  });

  it('16. the level persists through the generic metadata write, not a new column', () => {
    // SECTION-H3B.2: the SAME write now also carries the level's canonical
    // height (see sectionHeadingLevelHeight.test.tsx) -- still one call, no
    // new metadata key, no new column.
    expect(cardsSrc).toContain('commitSectionHeadingMetadata(padletId, { headingLevel: level }, { height: getSectionHeadingHeight(level) })');
    const round = JSON.parse(JSON.stringify(makeHeading({ metadata: { headingLevel: 3 } as never })));
    expect(getSectionHeadingLevel(round)).toBe(3);
    expect(typesSrc).toContain('headingLevel?: 1 | 2 | 3 | 4;');
  });

  it('17. a malformed or missing level still resolves to H2', () => {
    expect(getSectionHeadingLevel(makeHeading({ metadata: {} as never }))).toBe(2);
    expect(getSectionHeadingLevel(makeHeading({ metadata: { headingLevel: 9 } as never }))).toBe(2);
    expect(getSectionHeadingLevel(makeHeading({ metadata: { headingLevel: 'big' } as never }))).toBe(2);
    expect(getSectionHeadingLevel(makeHeading({ metadata: undefined }))).toBe(2);
  });
});

// ============================================================ TOOLBAR [18-25]
describe('SECTION-H2 toolbar [18-25]', () => {
  it('18/19. the toolbar renders only for a singly-selected heading', () => {
    // The gate lives at one place in the canvas, and requires BOTH a single
    // selection and that the selected post actually be a Section Heading.
    expect(cardsSrc).toContain('if (!canUseFreeformEditButton || selectedPadletIds.length > 1) return null;');
    expect(cardsSrc).toContain('return found && isSectionHeading(found) ? found : null;');
    expect(cardsSrc).toContain('{selectedSectionHeading && (');
    expect(cardsSrc).toContain('<SectionHeadingToolbar');
  });

  it('20. the Text/style trigger is the LEFT-most control and its panel opens left', () => {
    const { host } = mountToolbar(makeHeading());
    const bar = host.querySelector('[data-section-heading-toolbar="true"]') as HTMLElement;
    const controls = Array.from(bar.querySelectorAll('button'));
    expect(controls[0].getAttribute('data-section-heading-text-style-trigger')).toBe('true');

    act(() => { (host.querySelector('[data-section-heading-text-style-trigger="true"]') as HTMLElement).click(); });
    const panel = host.querySelector('[data-section-heading-panel="text"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.className).toContain('right-full');
    expect(panel.className).not.toContain('left-full');
  });

  it('21. the level controls sit between the two triggers, in H1..H4 order', () => {
    const { host } = mountToolbar(makeHeading());
    const bar = host.querySelector('[data-section-heading-toolbar="true"]') as HTMLElement;
    const buttons = Array.from(bar.querySelectorAll('button'));
    const levels = buttons.filter((b) => b.hasAttribute('data-section-heading-level'));
    expect(levels.map((b) => b.getAttribute('data-section-heading-level'))).toEqual(['1', '2', '3', '4']);
    const first = buttons.indexOf(levels[0]);
    const last = buttons.indexOf(levels[3]);
    expect(buttons.findIndex((b) => b.hasAttribute('data-section-heading-text-style-trigger'))).toBeLessThan(first);
    expect(buttons.findIndex((b) => b.hasAttribute('data-section-heading-appearance-trigger'))).toBeGreaterThan(last);
  });

  it('22. the Colors/appearance trigger is the RIGHT-most control', () => {
    const { host } = mountToolbar(makeHeading());
    const bar = host.querySelector('[data-section-heading-toolbar="true"]') as HTMLElement;
    const controls = Array.from(bar.querySelectorAll('button'));
    expect(controls[controls.length - 1].getAttribute('data-section-heading-appearance-trigger')).toBe('true');
    expect(controls[controls.length - 1].getAttribute('aria-label')).toBe('Colors');
  });

  it('23. the toolbar is screen UI: fixed positioning, outside the scaled world layer', () => {
    const { host } = mountToolbar(makeHeading());
    const bar = host.querySelector('[data-section-heading-toolbar="true"]') as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain('fixed');
    // Rendered as a SIBLING of the scaled posts layer, after it closes.
    const layerClose = cardsSrc.indexOf("data-freeform-world-layer=\"posts\"");
    const toolbarAt = cardsSrc.indexOf('<SectionHeadingToolbar');
    expect(layerClose).toBeGreaterThan(-1);
    expect(toolbarAt).toBeGreaterThan(layerClose);
    // And it never applies the camera scale itself.
    expect(code(toolbarSrc)).not.toMatch(/scale\(/);
  });

  it('24. signed-world placement does not offset the toolbar', () => {
    // Placement reads MEASURED client rects, so identical on-screen rects at
    // wildly different world coordinates produce identical placements.
    const toolbar = { width: 300, height: 40 };
    const viewport = { width: 1200, height: 800 };
    const a = computeSectionHeadingToolbarPlacement({ heading: { left: 400, top: 300, width: 500, height: 64 }, toolbar, viewport });
    const b = computeSectionHeadingToolbarPlacement({ heading: { left: 400, top: 300, width: 500, height: 64 }, toolbar, viewport });
    expect(a).toEqual(b);
    expect(a.placement).toBe('above');
    expect(a.left).toBe(400 + 250 - 150);
    expect(a.top).toBe(300 - 10 - 40);
    // No world coordinates are consulted anywhere in the placement math.
    expect(code(toolbarSrc)).not.toMatch(/worldOrigin|position_x \*|FREEFORM_WORLD/);
  });

  it('25. the toolbar stays usable at low zoom and near viewport edges', () => {
    const toolbar = { width: 300, height: 40 };
    const viewport = { width: 1200, height: 800 };
    // A heading shrunk to 50px on screen at 10% zoom still gets a full-size,
    // fully on-screen toolbar.
    const tiny = computeSectionHeadingToolbarPlacement({ heading: { left: 5, top: 400, width: 50, height: 6 }, toolbar, viewport });
    expect(tiny.left).toBeGreaterThanOrEqual(8);
    expect(tiny.left + toolbar.width).toBeLessThanOrEqual(viewport.width - 8);
    // Hard against the top edge: flips below rather than disappearing.
    const top = computeSectionHeadingToolbarPlacement({ heading: { left: 400, top: 2, width: 500, height: 64 }, toolbar, viewport });
    expect(top.placement).toBe('below');
    expect(top.top).toBe(2 + 64 + 10);
    // Hard against the right edge: clamped back inside.
    const right = computeSectionHeadingToolbarPlacement({ heading: { left: 1150, top: 400, width: 500, height: 64 }, toolbar, viewport });
    expect(right.left).toBe(viewport.width - toolbar.width - 8);
  });
});

// ============================================================ RESIZE [26-51]
describe('SECTION-H2 horizontal resize [26-51]', () => {
  it('26/27/28/29. exactly two handles: left and right, no top/bottom/corner/rotation', () => {
    const { host } = mountHeading(makeHeading(), { isSelected: true });
    const handles = Array.from(host.querySelectorAll('[data-section-heading-handle]'));
    expect(handles.map((h) => h.getAttribute('data-section-heading-handle')).sort()).toEqual(['left', 'right']);
    for (const absent of ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'rotate']) {
      expect(host.querySelector(`[data-section-heading-handle="${absent}"]`)).toBeNull();
    }
    const headingCode = code(headingSrc);
    expect(headingCode).not.toMatch(/nwse-resize|nesw-resize|ns-resize|rotat/i);
    expect(headingCode).toContain('cursor-ew-resize');
    // Height is never written by any sizing path.
    expect(headingCode).not.toMatch(/height:\s*next|newH|deltaY|worldDeltaY/);
  });

  it('handles are hidden unless the heading is selected and editable', () => {
    expect(mountHeading(makeHeading(), { isSelected: false }).host.querySelector('[data-section-heading-handle]')).toBeNull();
    expect(mountHeading(makeHeading(), { canEdit: false }).host.querySelector('[data-section-heading-handle]')).toBeNull();
    // Phase 20: suppressed inside a multi-selection.
    expect(mountHeading(makeHeading(), { canResize: false }).host.querySelector('[data-section-heading-handle]')).toBeNull();
    expect(cardsSrc).toContain('canResize={selectedPadletIds.length <= 1}');
  });

  it('30/31. right handle: x stays fixed, width absorbs the delta', () => {
    const { host, onResizeCommit } = mountHeading(makeHeading({ position_x: 100, width: 500 }));
    dragHandle(host, 'right', 0, 120);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 100, width: 620 });
    expect(resizeSectionHeadingRightEdge(origin({ x: 100, width: 500 }), -150, FREEFORM_BOUNDS)).toEqual({ x: 100, width: 350 });
  });

  it('32/33/34. left handle: right edge is pinned while x and width both move', () => {
    const start = { x: 1000, width: 500 };
    const right = start.x + start.width;
    for (const delta of [-300, -1, 0, 120, 299]) {
      const next = resizeSectionHeadingLeftEdge(origin(start), delta, FREEFORM_BOUNDS);
      expect(next.x).toBe(start.x + delta);
      expect(next.width).toBe(right - next.x);
      expect(next.x + next.width).toBe(right);
    }
    const { host, onResizeCommit } = mountHeading(makeHeading({ position_x: 1000, width: 500 }));
    dragHandle(host, 'left', 0, -200);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 800, width: 700 });
    expect(rect.x + rect.width).toBe(right);
  });

  it('35. neither handle can shrink the heading past the ONE canonical minimum width', () => {
    expect(SECTION_HEADING_MIN_WIDTH).toBeGreaterThanOrEqual(180);
    expect(SECTION_HEADING_MIN_WIDTH).toBeLessThanOrEqual(220);
    expect(resizeSectionHeadingRightEdge(origin({ x: 0, width: 500 }), -100000, FREEFORM_BOUNDS).width).toBe(SECTION_HEADING_MIN_WIDTH);
    const left = resizeSectionHeadingLeftEdge(origin({ x: 0, width: 500 }), 100000, FREEFORM_BOUNDS);
    expect(left.width).toBe(SECTION_HEADING_MIN_WIDTH);
    expect(left.x + left.width).toBe(500);
    // Default width is unchanged by this patch.
    expect(SECTION_HEADING_DEFAULT_WIDTH).toBe(500);
    // The value is defined once, and the renderer never restates it.
    expect((engineSrc.match(/SECTION_HEADING_MIN_WIDTH = /g) ?? []).length).toBe(1);
    expect(code(headingSrc)).not.toMatch(/Math\.max\(\s*\d{3}/);
  });

  it('36. the LEFT handle cannot cross the signed-world minimum', () => {
    const next = resizeSectionHeadingLeftEdge(origin({ x: -4900, width: 500 }), -1000, FREEFORM_BOUNDS);
    expect(next.x).toBe(FREEFORM_WORLD_MIN_X);
    expect(next.x).toBe(-5000);
    expect(next.x + next.width).toBe(-4400);
  });

  it('37. the RIGHT handle cannot cross the signed-world maximum', () => {
    const next = resizeSectionHeadingRightEdge(origin({ x: 14000, width: 500 }), 5000, FREEFORM_BOUNDS);
    expect(next.x + next.width).toBe(FREEFORM_WORLD_MAX_X);
    expect(next.width).toBe(1000);
  });

  it('38. the WHOLE resized rect always stays inside the signed world', () => {
    const cases = [
      { rect: { x: -5000, width: 400 }, delta: -9999 },
      { rect: { x: 14800, width: 200 }, delta: 9999 },
      { rect: { x: 0, width: 500 }, delta: 999999 },
      { rect: { x: 200, width: 500 }, delta: -999999 },
    ];
    for (const { rect, delta } of cases) {
      for (const next of [
        resizeSectionHeadingLeftEdge(origin(rect), delta, FREEFORM_BOUNDS),
        resizeSectionHeadingRightEdge(origin(rect), delta, FREEFORM_BOUNDS),
      ]) {
        expect(next.x).toBeGreaterThanOrEqual(FREEFORM_WORLD_MIN_X);
        expect(next.x + next.width).toBeLessThanOrEqual(FREEFORM_WORLD_MAX_X);
      }
    }
  });

  it.each([
    ['39. 100%', 1],
    ['40. 40%', 0.4],
    ['41. 20%', 0.2],
    ['42. 10%', 0.1],
    ['43. 150%', 1.5],
  ])('%s: the same WORLD delta produces the same width delta', (_label, zoom) => {
    const worldDelta = 200;
    const screenDelta = worldDelta * (zoom as number);
    const { host, onResizeCommit } = mountHeading(makeHeading({ position_x: 100, width: 500 }), { scale: zoom as number });
    dragHandle(host, 'right', 0, screenDelta);
    const [, rect] = onResizeCommit.mock.calls[0];
    expect(rect).toEqual({ x: 100, width: 700 });

    const left = mountHeading(makeHeading({ position_x: 1000, width: 500 }), { scale: zoom as number });
    dragHandle(left.host, 'left', 0, -screenDelta);
    const [, leftRect] = left.onResizeCommit.mock.calls[0];
    expect(leftRect).toEqual({ x: 800, width: 700 });
    expect(leftRect.x + leftRect.width).toBe(1500);
  });

  // PATCH SECTION-H3B: this was "zoom is divided out exactly once". The
  // component no longer divides by a camera scalar AT ALL -- it asks the host
  // for absolute world points -- so the double-division class of bug is now
  // structurally impossible rather than merely tested for. The assertion is
  // strengthened accordingly, not weakened.
  it('the renderer performs NO camera arithmetic of its own', () => {
    const headingCode = code(headingSrc);
    expect(headingCode).not.toMatch(/\/\s*zoom/);
    expect(headingCode).not.toMatch(/canvasZoom/);
    expect(headingCode).not.toMatch(/scrollLeft|scrollTop|scrollX|scrollY|appState|worldOrigin/);
    expect(headingCode).toContain('clientToWorld(clientX, 0).x');
  });

  it('44. resizing uses pointer capture so the gesture survives leaving the heading', () => {
    const { host, onResizeCommit } = mountHeading(makeHeading({ position_x: 0, width: 500 }));
    const handle = host.querySelector('[data-section-heading-handle="right"]') as HTMLElement;
    const setCapture = vi.fn();
    const releaseCapture = vi.fn();
    Object.assign(handle, { setPointerCapture: setCapture, releasePointerCapture: releaseCapture });
    pointer(handle, 'pointerdown', 0);
    expect(setCapture).toHaveBeenCalledWith(1);
    // Pointer travels far outside the element and the gesture still tracks.
    pointer(handle, 'pointermove', 9000);
    pointer(handle, 'pointerup', 300);
    expect(releaseCapture).toHaveBeenCalledWith(1);
    expect(onResizeCommit.mock.calls[0][1]).toEqual({ x: 0, width: 800 });
    expect(code(headingSrc)).toContain('setPointerCapture');
  });

  it('45. pointerup ends the gesture cleanly -- a later move does nothing', () => {
    const { host, onResizePreview, onResizeCommit } = mountHeading(makeHeading({ position_x: 0, width: 500 }));
    const handle = dragHandle(host, 'right', 0, 100);
    const previewsAfterDrag = onResizePreview.mock.calls.length;
    pointer(handle, 'pointermove', 900);
    expect(onResizePreview.mock.calls.length).toBe(previewsAfterDrag);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
  });

  it('46. pointercancel ends the gesture and writes nothing', () => {
    const { host, onResizePreview, onResizeCommit } = mountHeading(makeHeading({ position_x: 0, width: 500 }));
    const handle = host.querySelector('[data-section-heading-handle="right"]') as HTMLElement;
    pointer(handle, 'pointerdown', 0);
    pointer(handle, 'pointermove', 100);
    pointer(handle, 'pointercancel', 100);
    expect(onResizeCommit).not.toHaveBeenCalled();
    const previews = onResizePreview.mock.calls.length;
    pointer(handle, 'pointermove', 400);
    expect(onResizePreview.mock.calls.length).toBe(previews);
  });

  it('47. pointerdown on a handle does NOT start the root drag', () => {
    const { host, onMouseDownCapture } = mountHeading(makeHeading());
    const handle = host.querySelector('[data-section-heading-handle="right"]') as HTMLElement;
    // Two independent guards: the canonical opt-out attribute the drag system
    // itself honours, and stopPropagation on the pointer handler.
    expect(handle.getAttribute('data-no-drag')).toBe('true');
    const interactions = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
    expect(interactions).toContain(`if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;`);
    // The drag system's capture-phase handler runs before the event reaches
    // the handle, so the proof that no drag starts is that the event it
    // receives is rejected by that canonical guard.
    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    const [event] = onMouseDownCapture.mock.calls[0];
    expect((event.target as HTMLElement).closest('[data-no-drag="true"]')).toBe(handle);
    // A body mousedown, by contrast, is NOT excluded by that guard.
    const surface = host.querySelector('[data-section-heading-surface="true"]') as HTMLElement;
    expect(surface.closest('[data-no-drag="true"]')).toBeNull();
  });

  it('48. pointerdown on the heading body still starts the root drag', () => {
    const { host, onMouseDownCapture } = mountHeading(makeHeading());
    const surface = host.querySelector('[data-section-heading-surface="true"]') as HTMLElement;
    act(() => { surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(onMouseDownCapture).toHaveBeenCalledTimes(1);
    expect(onMouseDownCapture.mock.calls[0][1]).toBe('sh-1');
  });

  it('49. pointerdown inside the inline editor does not start a drag', () => {
    const { host, onMouseDownCapture } = mountHeading(makeHeading());
    const label = host.querySelector('[data-section-heading-text="true"]') as HTMLElement;
    act(() => { label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = host.querySelector('[data-section-heading-input="true"]') as HTMLElement;
    expect(input).not.toBeNull();
    onMouseDownCapture.mockClear();
    act(() => { input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(onMouseDownCapture).not.toHaveBeenCalled();
  });

  it('50. geometry persists ONCE, at the end of the gesture -- never per pointermove', () => {
    const { host, onResizePreview, onResizeCommit } = mountHeading(makeHeading({ position_x: 0, width: 500 }));
    const handle = host.querySelector('[data-section-heading-handle="right"]') as HTMLElement;
    pointer(handle, 'pointerdown', 0);
    for (const x of [20, 40, 60, 80, 100]) pointer(handle, 'pointermove', x);
    expect(onResizePreview).toHaveBeenCalledTimes(5);
    expect(onResizeCommit).not.toHaveBeenCalled();
    pointer(handle, 'pointerup', 100);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    // The preview path touches local state only; only the commit path writes.
    expect(cardsSrc).toContain('const previewSectionHeadingRect = React.useCallback');
    const preview = cardsSrc.slice(
      cardsSrc.indexOf('const previewSectionHeadingRect'),
      cardsSrc.indexOf('PATCH SECTION-H2 Phase 7/50'),
    );
    expect(preview).not.toContain('updatePostFields');
    // A gesture that ends where it started writes nothing at all.
    const noop = mountHeading(makeHeading({ position_x: 0, width: 500 }));
    dragHandle(noop.host, 'right', 50, 50);
    expect(noop.onResizeCommit).not.toHaveBeenCalled();
  });

  it('51. a failed geometry write rolls back to the pre-drag rect and surfaces the failure', () => {
    const commit = cardsSrc.slice(
      cardsSrc.indexOf('const commitSectionHeadingRect'),
      cardsSrc.indexOf('const previewSectionHeadingRect'),
    );
    // Honest command, not the documented best-effort/swallowing variants.
    expect(commit).toContain('await updatePostFieldsOrThrow(');
    expect(commit).not.toContain('persistPostFieldsBestEffort');
    expect(commit).not.toContain('commitPadletMeta');
    expect(commit).not.toContain('updatePostFieldsSwallowResolved');
    // Rollback uses the ORIGIN rect the gesture started from, not the preview.
    expect(commit).toContain('position_x: originRect.x, width: originRect.width');
    expect(commit).toContain("toast.error('Failed to resize section heading')");
    // And the origin rect genuinely comes from the gesture start.
    expect(code(headingSrc)).toContain('const origin = sizingRef.current.origin.rect;');
    expect(code(headingSrc)).toContain('onResizeCommit?.(padlet.id, next, origin);');
  });
});

// ============================================================ STYLE [52-67]
describe('SECTION-H2 text style and colors [52-67]', () => {
  it('52/53. the Text style panel exists and opens on the LEFT', () => {
    const { host } = mountToolbar(makeHeading());
    expect(host.querySelector('[data-section-heading-text-style-panel="true"]')).toBeNull();
    act(() => { (host.querySelector('[data-section-heading-text-style-trigger="true"]') as HTMLElement).click(); });
    expect(host.querySelector('[data-section-heading-text-style-panel="true"]')).not.toBeNull();
    expect((host.querySelector('[data-section-heading-panel="text"]') as HTMLElement).className).toContain('right-full');
  });

  it('54. only heading-meaningful controls are exposed', () => {
    const host = render(<SectionHeadingTextStylePanel style={{}} onChange={vi.fn()} />);
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.getAttribute('title'));
    expect(labels).toEqual(['Bold', 'Italic', 'Underline', 'Align']);
    const panelCode = code(textStyleSrc);
    for (const banned of ['Bullet list', 'Numbered list', 'Code', 'bulletList', 'orderedList', 'setLink', 'blockquote', 'paragraph']) {
      expect(panelCode).not.toContain(banned);
    }
    // Heading PRESETS (Large heading / Normal text / Quote ...) belong to the
    // rich-text popup; a Section Heading's size is the H1-H4 control's job.
    expect(panelCode).not.toMatch(/headingStyles|hideHeadingSelect|onSelectHeading/);
  });

  it('55/56. scope is the WHOLE heading -- no partial-selection rich text', () => {
    const onChange = vi.fn();
    const host = render(<SectionHeadingTextStylePanel style={{}} onChange={onChange} />);
    act(() => { (host.querySelector('button[title="Bold"]') as HTMLElement).click(); });
    expect(onChange).toHaveBeenCalledWith({ fontWeight: '700' });
    const panelCode = code(textStyleSrc);
    expect(panelCode).not.toMatch(/selectionStart|getSelection|window\.getSelection|Range|Mark\b/);
    // The renderer applies one resolved style object to the entire string.
    expect(code(headingSrc)).toContain('const textStyle = resolveSectionHeadingTextStyle(padlet);');
    expect((code(headingSrc).match(/style=\{textStyle\}/g) ?? []).length).toBe(2);
  });

  it('bold/italic/underline/align round-trip through the shared style model', () => {
    const onChange = vi.fn();
    const host = render(<SectionHeadingTextStylePanel style={{ fontWeight: '700', fontStyle: 'italic', underline: true, textAlign: 'left' }} onChange={onChange} />);
    const click = (title: string) => act(() => { (host.querySelector(`button[title="${title}"]`) as HTMLElement).click(); });
    click('Bold');
    expect(onChange.mock.calls[0][0].fontWeight).toBe('normal');
    click('Italic');
    expect(onChange.mock.calls[1][0].fontStyle).toBe('normal');
    click('Underline');
    expect(onChange.mock.calls[2][0].underline).toBe(false);
    click('Align');
    expect(onChange.mock.calls[3][0].textAlign).toBe('center');
    // Active states reflect the stored style.
    expect((host.querySelector('button[title="Bold"]') as HTMLElement).className).toContain('bg-blue-50');
  });

  it('the resolved heading style drops size/line-height so the level always wins', () => {
    const resolved = resolveSectionHeadingTextStyle(makeHeading({
      metadata: { titleStyle: { fontSize: '99px', lineHeight: '9', fontWeight: '700', backgroundColor: '#ff0000' } } as never,
    }));
    expect(resolved.fontSize).toBeUndefined();
    expect(resolved.lineHeight).toBeUndefined();
    expect(resolved.backgroundColor).toBeUndefined();
    expect(resolved.fontWeight).toBe('700');
  });

  it('57. text color persists through the existing metadata.textColor field', () => {
    expect(cardsSrc).toContain("const field = target === 'text' ? 'textColor' : target === 'accent' ? 'accentColor' : 'backgroundColor';");
    const { host } = mountHeading(makeHeading({ metadata: { headingLevel: 2, textColor: '#dc2626' } as never }));
    const label = host.querySelector('[data-section-heading-text="true"]') as HTMLElement;
    expect(label.style.color).toBe('rgb(220, 38, 38)');
    expect(resolveSectionHeadingTextStyle(makeHeading({ metadata: { textColor: '#dc2626' } as never })).color).toBe('#dc2626');
  });

  it('58/59. background persists, and transparent is a first-class choice', () => {
    const painted = mountHeading(makeHeading({ metadata: { backgroundColor: '#dbeafe' } as never }));
    expect((painted.host.querySelector('[data-section-heading-surface="true"]') as HTMLElement).style.backgroundColor).toBe('rgb(219, 234, 254)');
    // The SECTION-H1 default stays bare canvas...
    expect(getSectionHeadingBackgroundColor(makeHeading())).toBe('transparent');
    const bare = mountHeading(makeHeading());
    expect((bare.host.querySelector('[data-section-heading-surface="true"]') as HTMLElement).style.backgroundColor).toBe('transparent');
    // ...and is explicitly offered by the panel, so it is reachable again.
    const host = render(<SectionHeadingAppearancePanel textColor="#111111" backgroundColor="transparent" accentColor="#0f766e" onChange={vi.fn()} onClose={vi.fn()} />);
    act(() => { (host.querySelector('[data-section-heading-color-target="background"]') as HTMLElement).click(); });
    expect(host.querySelector('button[title="transparent"]')).not.toBeNull();
    // No mandatory background is hard-coded onto the object.
    expect(code(headingSrc)).not.toMatch(/backgroundColor:\s*['"]#/);
  });

  it('60/61/62. accent color persists, defaults to the H1 value, and moves ONLY the stripe', () => {
    expect(SECTION_HEADING_DEFAULT_ACCENT_COLOR).toBe('#0f766e');
    expect(getSectionHeadingAccentColor(makeHeading())).toBe('#0f766e');
    expect(getSectionHeadingAccentColor(makeHeading({ metadata: { accentColor: '#7950f2' } as never }))).toBe('#7950f2');
    expect(typesSrc).toContain('accentColor?: string;');

    const { host } = mountHeading(makeHeading({ metadata: { accentColor: '#7950f2', backgroundColor: '#ffffff', textColor: '#111111' } as never }));
    const accent = host.querySelector('[data-section-heading-accent="true"]') as HTMLElement;
    const surface = host.querySelector('[data-section-heading-surface="true"]') as HTMLElement;
    const label = host.querySelector('[data-section-heading-text="true"]') as HTMLElement;
    expect(accent.style.backgroundColor).toBe('rgb(121, 80, 242)');
    expect(surface.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(label.style.color).toBe('rgb(17, 17, 17)');
  });

  it('63/64. the shared palette is reused -- no second color system', () => {
    expect(appearanceSrc).toContain("import { ColorPickerContent } from '@/components/collabboard/ColorPicker'");
    const host = render(<SectionHeadingAppearancePanel textColor="#111111" backgroundColor="transparent" accentColor="#0f766e" onChange={vi.fn()} onClose={vi.fn()} />);
    expect(host.textContent).toContain('Default Colors');
    // The one preset array present is the app's own SIMPLE_PALETTE with
    // `transparent` prepended -- the same arrangement TextStylePopup uses.
    const simple = read('components/collabboard/ColorPicker.tsx');
    const shared = /const SIMPLE_PALETTE = \[([\s\S]*?)\];/.exec(simple)![1].replace(/\s|'/g, '');
    const mine = /const BACKGROUND_PRESETS = \[([\s\S]*?)\];/.exec(appearanceSrc)![1].replace(/\s|'/g, '').replace(/,$/, '');
    expect(mine).toBe(`transparent,${shared.replace(/,$/, '')}`);
    // Every colour the panel names comes from that shared palette -- no
    // independent swatch set is introduced.
    const own = new Set(appearanceSrc.match(/#[0-9a-fA-F]{6}/g) ?? []);
    const allowed = new Set([...(simple.match(/#[0-9a-fA-F]{6}/g) ?? []), SECTION_HEADING_DEFAULT_ACCENT_COLOR]);
    for (const colour of own) expect(allowed.has(colour), colour).toBe(true);
  });

  it('the appearance panel is ONE panel with three targets, not three palettes', () => {
    const onChange = vi.fn();
    const host = render(<SectionHeadingAppearancePanel textColor="#111111" backgroundColor="transparent" accentColor="#0f766e" onChange={onChange} onClose={vi.fn()} />);
    expect(host.querySelectorAll('[data-section-heading-appearance-panel="true"]').length).toBe(1);
    expect(Array.from(host.querySelectorAll('[data-section-heading-color-target]')).map((b) => b.getAttribute('data-section-heading-color-target')))
      .toEqual(['text', 'background', 'accent']);
    act(() => { (host.querySelector('[data-section-heading-color-target="accent"]') as HTMLElement).click(); });
    act(() => { (host.querySelector('button[title="#fa5252"]') as HTMLElement).click(); });
    expect(onChange).toHaveBeenCalledWith('accent', '#fa5252');
  });

  it('65. duplicate preserves every style field (they all live in generic data)', () => {
    const styled = makeHeading({
      width: 900,
      metadata: {
        headingLevel: 1, textColor: '#dc2626', backgroundColor: '#dbeafe', accentColor: '#7950f2',
        titleStyle: { fontWeight: '700', fontStyle: 'italic', underline: true, textAlign: 'center' },
      } as never,
    });
    // Duplication is the generic root copy: a structural clone with a new id.
    const copy = { ...JSON.parse(JSON.stringify(styled)), id: 'sh-copy' } as Padlet;
    expect(getSectionHeadingLevel(copy)).toBe(1);
    expect(copy.width).toBe(900);
    expect(getSectionHeadingAccentColor(copy)).toBe('#7950f2');
    expect(getSectionHeadingBackgroundColor(copy)).toBe('#dbeafe');
    expect(resolveSectionHeadingTextStyle(copy)).toEqual(resolveSectionHeadingTextStyle(styled));
    // No section-heading branch exists in any duplicate/copy path.
    expect(code(headingSrc)).not.toMatch(/duplicate|copyPadlet|cutPadlet|movePadletLayer/i);
  });

  it('66. every style field survives a serialize/reload round trip', () => {
    const styled = makeHeading({
      position_x: -1200, width: 820, metadata: {
        headingLevel: 3, textColor: '#16a34a', backgroundColor: 'transparent', accentColor: '#fab005',
        titleStyle: { fontWeight: 'normal', fontStyle: 'italic', underline: true, textAlign: 'right' }, zIndex: 5,
      } as never,
    });
    const reloaded = JSON.parse(JSON.stringify(styled)) as Padlet;
    expect(reloaded).toEqual(styled);
    expect(getSectionHeadingLevel(reloaded)).toBe(3);
    expect(reloaded.position_x).toBe(-1200);
    expect(reloaded.width).toBe(820);
    expect(reloaded.height).toBe(SECTION_HEADING_DEFAULT_HEIGHT);
    expect(resolveSectionHeadingTextStyle(reloaded)).toMatchObject({
      color: '#16a34a', fontStyle: 'italic', textDecoration: 'underline', textAlign: 'right',
    });
  });

  it('67. a remote/realtime style change renders with no new channel', () => {
    // The heading is a pure function of the post row, so a remote update is
    // just a re-render with new props -- nothing type-specific subscribes.
    const padlet = makeHeading();
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const render1 = (p: Padlet) => act(() => root.render(
      <SectionHeadingPost padlet={p} isSelected={false} canEdit isDraggingThis={false}
        onMouseDownCapture={vi.fn()} onCommitText={vi.fn()}
        clientToWorld={hostAtScale(1)} worldBounds={FREEFORM_BOUNDS} />,
    ));
    render1(padlet);
    expect((host.querySelector('[data-section-heading-text="true"]') as HTMLElement).className).toContain(SECTION_HEADING_LEVEL_TEXT_CLASS[2]);
    render1({ ...padlet, width: 950, metadata: { headingLevel: 1, accentColor: '#e64980', backgroundColor: '#111111', titleStyle: { fontStyle: 'italic' } } as never });
    const surface = host.querySelector('[data-section-heading-surface="true"]') as HTMLElement;
    expect(surface.style.width).toBe('950px');
    expect(surface.style.backgroundColor).toBe('rgb(17, 17, 17)');
    expect((host.querySelector('[data-section-heading-accent="true"]') as HTMLElement).style.backgroundColor).toBe('rgb(230, 73, 128)');
    expect((host.querySelector('[data-section-heading-text="true"]') as HTMLElement).className).toContain(SECTION_HEADING_LEVEL_TEXT_CLASS[1]);
    for (const src of [headingSrc, toolbarSrc, appearanceSrc, textStyleSrc, engineSrc]) {
      expect(code(src)).not.toMatch(/supabase|channel\(|subscribe\(/i);
    }
  });
});

// ============================================================ PANELS [68-76]
describe('SECTION-H2 panel behaviour [68-76]', () => {
  it('68. the appearance panel opens on the RIGHT', () => {
    const { host } = mountToolbar(makeHeading());
    act(() => { (host.querySelector('[data-section-heading-appearance-trigger="true"]') as HTMLElement).click(); });
    const panel = host.querySelector('[data-section-heading-panel="appearance"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.className).toContain('left-full');
    expect(panel.className).not.toContain('right-full');
    expect(host.querySelector('[data-section-heading-appearance-panel="true"]')).not.toBeNull();
  });

  it('69/70. the two panels are mutually exclusive', () => {
    const { host } = mountToolbar(makeHeading());
    const text = host.querySelector('[data-section-heading-text-style-trigger="true"]') as HTMLElement;
    const colors = host.querySelector('[data-section-heading-appearance-trigger="true"]') as HTMLElement;

    act(() => { text.click(); });
    expect(host.querySelector('[data-section-heading-panel="text"]')).not.toBeNull();
    act(() => { colors.click(); });
    expect(host.querySelector('[data-section-heading-panel="text"]')).toBeNull();
    expect(host.querySelector('[data-section-heading-panel="appearance"]')).not.toBeNull();
    act(() => { text.click(); });
    expect(host.querySelector('[data-section-heading-panel="appearance"]')).toBeNull();
    expect(host.querySelector('[data-section-heading-panel="text"]')).not.toBeNull();
  });

  it('71. an outside click closes the open panel; a click inside does not', () => {
    const { host } = mountToolbar(makeHeading());
    act(() => { (host.querySelector('[data-section-heading-appearance-trigger="true"]') as HTMLElement).click(); });
    act(() => {
      (host.querySelector('[data-section-heading-appearance-panel="true"]') as HTMLElement)
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(host.querySelector('[data-section-heading-panel="appearance"]')).not.toBeNull();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(host.querySelector('[data-section-heading-panel="appearance"]')).toBeNull();
  });

  it('72. Escape closes the open panel', () => {
    const { host } = mountToolbar(makeHeading());
    act(() => { (host.querySelector('[data-section-heading-text-style-trigger="true"]') as HTMLElement).click(); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[data-section-heading-panel="text"]')).toBeNull();
  });

  it('73. clicking the toolbar never reaches the canvas as a background click', () => {
    const { host } = mountToolbar(makeHeading());
    const bar = host.querySelector('[data-section-heading-toolbar="true"]') as HTMLElement;
    const canvasSaw = vi.fn();
    document.body.addEventListener('mousedown', canvasSaw);
    document.body.addEventListener('click', canvasSaw);
    act(() => {
      (host.querySelector('[data-section-heading-level="3"]') as HTMLElement)
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      (host.querySelector('[data-section-heading-level="3"]') as HTMLElement).click();
    });
    document.body.removeEventListener('mousedown', canvasSaw);
    document.body.removeEventListener('click', canvasSaw);
    expect(canvasSaw).not.toHaveBeenCalled();
    expect(bar.getAttribute('data-section-heading-toolbar')).toBe('true');
  });

  it('74/75/76. formatting while editing never disturbs the uncommitted text', () => {
    // Every toolbar/panel control cancels its own mousedown, so the inline
    // input keeps focus and is never blurred, remounted or re-seeded.
    for (const src of [toolbarSrc, appearanceSrc]) {
      expect(code(src)).toMatch(/onMouseDown=\{(keepFocus|\(event\) => event\.preventDefault\(\))/);
    }
    expect(code(toolbarSrc)).toContain('const keepFocus = (event: React.MouseEvent) => event.preventDefault();');
    // The Text style panel inherits the guard by reusing the shared button
    // grid, which cancels its own mousedown for exactly this reason.
    expect(code(textStyleSrc)).toContain('<TextFormattingButtons');
    expect(read('components/collabboard/editors/TextFormattingButtons.tsx'))
      .toContain('const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();');

    // And the editor itself only re-seeds its draft while NOT editing, so a
    // level/colour change mid-edit cannot overwrite what has been typed.
    const { host } = mountHeading(makeHeading());
    act(() => { (host.querySelector('[data-section-heading-text="true"]') as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = host.querySelector('[data-section-heading-input="true"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Half-typed heading');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('Half-typed heading');
    expect(code(headingSrc)).toContain('if (!isEditing) setDraft(text);');
    // The formatting controls live in a SEPARATE component tree, so pressing
    // one cannot unmount the input that holds the uncommitted text.
    expect(code(headingSrc)).not.toContain('SectionHeadingToolbar');
  });
});

// ============================================================ MINIMAP [77-80]
describe('SECTION-H2 minimap [77-80]', () => {
  it('77. a resized heading measures as a wider silhouette with no minimap change', () => {
    const wide = makeHeading({ width: 1400 });
    expect(getMinimapItemKind(wide)).toBe('post');
    expect(getFallbackMinimapItem(wide)).toMatchObject({ x: 100, y: 200, width: 1400, height: SECTION_HEADING_DEFAULT_HEIGHT });
    expect(getFallbackMinimapItem(makeHeading())).toMatchObject({ width: SECTION_HEADING_DEFAULT_WIDTH });
    expect(code(minimapSrc)).not.toMatch(/section_heading|SectionHeading/);
    expect(code(read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts'))).not.toMatch(/section_heading|SectionHeading/);
  });

  it('78. a heading resized at negative coordinates measures unclamped', () => {
    const next = resizeSectionHeadingLeftEdge(origin({ x: -900, width: 500 }), -600, FREEFORM_BOUNDS);
    expect(next).toEqual({ x: -1500, width: 1100 });
    expect(getFallbackMinimapItem(makeHeading({ position_x: next.x, position_y: -450, width: next.width })))
      .toMatchObject({ x: -1500, y: -450, width: 1100 });
  });

  it('79/80. minimap navigation, projection and viewport drag are untouched', () => {
    const geometry = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');
    expect(geometry).toContain('[data-padlet-id]');
    expect(read('components/collabboard/canvas/minimap/useFreeformMinimapViewport.ts'))
      .toContain("import { getViewportWorldRect, type WorldRect } from './freeformMinimapGeometry';");
    expect(minimapSrc).toContain('data-freeform-minimap-viewport');
    expect(navSrc).toContain('data-freeform-navigation-control="true"');
    // No per-heading observer was introduced.
    for (const src of [headingSrc, toolbarSrc, cardsSrc.slice(cardsSrc.indexOf('PATCH SECTION-H2 Phase 17/50'), cardsSrc.indexOf('PATCH SECTION-H2 Phase 7/50'))]) {
      expect(code(src)).not.toContain('ResizeObserver');
    }
  });
});

// ============================================================ FREEZE [81-91]
describe('SECTION-H2 frozen regressions [81-91]', () => {
  const FLAGS = {
    isMapLayout: false, isFreeformLayout: false, isFreeformGraphMode: false,
    isTimelineLayout: false, chronoMode: null, canManageCanvasShare: false,
    canUseFreeformEditButton: true,
  };
  const toolTypes = (flags: Partial<typeof FLAGS>) =>
    buildCanvasToolbarGroups({ ...FLAGS, ...flags } as never).flatMap((g) => g.tools.map((t) => t.type));

  it('81/82. the global H tool is still Freeform-only, and absent from Drawing', () => {
    expect(toolTypes({ isFreeformLayout: true })).toContain('section-heading');
    expect(toolTypes({ isFreeformLayout: false })).not.toContain('section-heading');
    // Drawing is not a Freeform layout, so the entry is never emitted at all.
    expect(read('app/dashboard/canvas/[id]/CanvasClient.tsx')).toContain("case 'section-heading':");
    expect(code(read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx'))).not.toMatch(/isDrawingLayout/);
    // The global creation toolbar itself is unmoved by this patch.
    expect(read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx'))
      .toContain('{ icon: Heading, label: "Section heading", color: "text-teal-700", bg: "hover:bg-teal-50", type: "section-heading" },');
  });

  it('83/84. Container-child and Group-into-Column exclusions still hold', () => {
    const container = { id: 'c-1', type: 'container', position_x: 0, position_y: 0, width: 400, height: 300, metadata: {} } as Padlet;
    const heading = makeHeading({ position_x: 10, position_y: 10 });
    const note = { ...heading, id: 'n-1', type: 'text' } as Padlet;
    const rect = { x: 10, y: 10, width: 100, height: 50 };
    expect(findContainerOverlappingRect([container, note], rect, 'n-1')?.id).toBe('c-1');
    expect(findContainerOverlappingRect([container, heading], rect, 'sh-1')).toBeNull();
    expect(canBeContainerChild(heading)).toBe(false);
    // Widening a heading cannot create grouping behaviour: the exclusion is
    // by TYPE, so it holds at every width.
    expect(findContainerOverlappingRect([container, makeHeading({ width: 4000 })], rect, 'sh-1')).toBeNull();
    expect(getEligibleContainerDestinations([container], 'n-1').map((c) => c.id)).toEqual(['c-1']);
    expect(code(headingSrc)).not.toContain('groupIntoColumnTargets');
  });

  it('85. Graph endpoint exclusion still holds, and the toolbar offers no connect action', () => {
    expect(canBeGraphEndpoint(makeHeading())).toBe(false);
    expect(canBeGraphEndpoint({ ...makeHeading(), type: 'text' } as Padlet)).toBe(true);
    for (const src of [headingSrc, toolbarSrc, appearanceSrc, textStyleSrc]) {
      expect(code(src)).not.toMatch(/graphConnect|GraphLine|setGraphConnectSelection|connect/i);
    }
    expect(graphSrc).toContain('export default function FreeformGraphLayer');
  });

  it('86. camera is untouched', () => {
    expect(cameraSrc).toContain('const ZOOM_STEP');
    for (const src of [headingSrc, toolbarSrc, appearanceSrc, textStyleSrc, engineSrc]) {
      expect(code(src)).not.toMatch(/ZOOM_STEP|setCanvasZoom|panByWorldDelta|useCanvasCamera/);
    }
  });

  it('87. the signed world is untouched and merely consumed', () => {
    expect(stageSrc).toContain('export const FREEFORM_WORLD_MIN_X = -5000;');
    expect(stageSrc).toContain('export const FREEFORM_WORLD_MAX_X = 15000;');
    // PATCH SECTION-H3B moved bounds OWNERSHIP from the generic geometry module
    // to the host. The invariant this test protects -- that the signed-stage
    // values are consumed from the canonical contract and never restated -- is
    // unchanged; only the file that consumes them moved, so the assertion
    // follows it to the Freeform call site.
    expect(cardsSrc).toContain("from '@/components/collabboard/canvas/engine/freeformStageGeometry'");
    expect(cardsSrc).toContain('minX: FREEFORM_WORLD_MIN_X,');
    expect(cardsSrc).toContain('maxX: FREEFORM_WORLD_MAX_X,');
    expect(code(engineSrc)).not.toMatch(/-?\b(5000|15000)\b/);
    expect(code(cardsSrc)).not.toMatch(/minX:\s*-?5000|maxX:\s*15000/);
  });

  it('88/89. the unified navigator (9W) and Library stacking (9W.1) are untouched', () => {
    expect(navSrc).toContain('absolute bottom-4 left-[72px] z-40');
    expect(librarySrc).toContain('z-[800]');
    // The heading toolbar slots UNDER the Library tier, not over it.
    expect(toolbarSrc).toContain('z-[700]');
    expect(code(toolbarSrc)).not.toMatch(/z-\[(8\d\d|[1-9]\d{3,})\]/);
  });

  it('90. Manual Line is untouched', () => {
    expect(lineSrc).toContain('export default SimpleLineRenderer;');
    for (const src of [headingSrc, toolbarSrc, appearanceSrc, textStyleSrc]) {
      expect(code(src)).not.toMatch(/SimpleLineRenderer|CanvasLine/);
    }
  });

  it('91. the Note and Document editors are untouched and never imported here', () => {
    expect(noteEditorSrc.length).toBeGreaterThan(0);
    expect(documentEditorSrc.length).toBeGreaterThan(0);
    for (const src of [headingSrc, toolbarSrc, appearanceSrc, textStyleSrc, engineSrc]) {
      const c = code(src);
      expect(c).not.toMatch(/NoteEditor|DocumentEditor|TextStylePopup|@tiptap/);
    }
    // The shared low-level primitives ARE reused -- that is the point.
    expect(textStyleSrc).toContain("from '@/components/collabboard/editors/TextFormattingButtons'");
    expect(textStyleSrc).toContain("from '@/components/collabboard/editors/textAlignCycle'");
  });

  it('no database columns were added -- appearance is JSONB metadata only', () => {
    const migrations = fs.existsSync(path.join(process.cwd(), 'supabase/migrations'))
      ? fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
      : [];
    expect(migrations.filter((f) => /section_heading|heading_level|accent_color|accentColor/i.test(f))).toEqual([]);
    // The second argument is load-bearing: `metadata?: {` also appears in the
    // Canvas interface ABOVE Padlet, and searching from 0 would collapse this
    // slice to '' and make every assertion below vacuously true.
    const padletStart = typesSrc.indexOf('export interface Padlet');
    const padletFields = typesSrc.slice(padletStart, typesSrc.indexOf('metadata?: {', padletStart));
    expect(padletFields).toContain('position_x: number;');
    for (const banned of ['accentColor', 'headingLevel', 'titleStyle']) {
      expect(padletFields).not.toContain(banned);
    }
    expect(typesSrc).toContain('accentColor?: string;');
  });
});
