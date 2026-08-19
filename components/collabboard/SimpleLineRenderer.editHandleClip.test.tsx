// @vitest-environment jsdom
//
// PATCH DRAWING-LINE-EDIT-CLIP-R1 -- regression guard for the confirmed
// defect: existing CanvasLine/Arrow endpoint handles became unclickable in
// edit mode, positionally and non-deterministically.
//
// Root cause (pinned live, not assumed): the root <svg> is a CSS-laid-out
// element with a real border box, so the notched polygon resolves against
// the viewport there -- which is the coordinate space the
// --drawing-visible-canvas-left-inset / --drawing-native-ui-top-inset
// variables are measured in. The inner <g data-line-containment> has NO CSS
// layout box, so per CSS Masking the identical basic shape resolves against
// `fill-box` -- the <g>'s own object bounding box -- instead. The "108px
// notch" therefore landed 108px in from wherever the rendered lines happened
// to begin, and moved and resized as lines moved.
//
// Measured live at 100% zoom: the inner <g> bbox was x=294 w=412, so the
// clip excluded x < 294+108 = 402 across the whole (62px-tall) box. The
// endpoint handle at screen x=300 was excluded and dead; the one at x=700
// worked. Drawing the same arrow right-to-left moved the bbox origin and
// flipped WHICH endpoint died -- proving it was positional, not start/end
// specific, and not Arrow specific.
//
// Fix under test: the inner <g> clip carries the `view-box` geometry-box
// keyword so it resolves against the nearest SVG viewport, matching the root
// and the variables' own space. Probed live against the real page: only
// `view-box` restored hit-testing (`border-box` is invalid for an element
// with no CSS box and was silently dropped; `stroke-box` stayed
// content-relative).
//
// jsdom implements neither clip-path geometry nor real hit-testing, so the
// hit-testing halves of the contract (items 1 and 8 of the patch's list) are
// proven by live acceptance and by the source pins in
// canvasLayerStackingBoundary.architecture.test.tsx. What IS provable here,
// and is what actually regressed for the user, is that every edit-mode drag
// still reaches commit with correct coordinates and preserved arrow flags.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import SimpleLineRenderer from './SimpleLineRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
(globalThis as any).cancelAnimationFrame = () => {};

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
});

function stubSvgRect(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON() { return this; },
  } as DOMRect);
}

function arrow(id: string, overrides: Partial<CanvasLine> = {}): CanvasLine {
  return {
    id,
    board_id: 'board',
    start_x: 100,
    start_y: 100,
    control_x: 200,
    control_y: 80,
    end_x: 300,
    end_y: 120,
    color: '#000',
    stroke_width: 2,
    layer_plane: 'front',
    start_arrow: false,
    end_arrow: true,
    dashed: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fireMouseDown(target: Element, clientX: number, clientY: number) {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  });
}
function fireWindowMouseMove(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  });
}
function fireWindowMouseUp(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  });
}

/** Renders an arrow selected + in edit mode, so its endpoint handles exist. */
function mountEditableArrow(opts: {
  onUpdateLine?: (id: string, updates: Partial<CanvasLine>) => void;
  onSaveLine?: (id: string, o?: unknown) => void;
  line?: CanvasLine;
  drawingSurface?: boolean;
}) {
  const theArrow = opts.line ?? arrow('arrow-1');
  const container = mount(
    <SimpleLineRenderer
      lines={[theArrow]}
      selectedLineId={theArrow.id}
      onSelectLine={() => {}}
      onUpdateLine={opts.onUpdateLine ?? (() => {})}
      onSaveLine={opts.onSaveLine ?? (() => {})}
      onCreateLine={() => {}}
      isLineMode={false}
      isEditMode
      onToggleEditMode={() => {}}
      excalidrawAPIRef={opts.drawingSurface === false ? undefined : { current: {} }}
    />,
  );
  const svg = container.querySelector('svg') as unknown as SVGSVGElement;
  stubSvgRect(svg);
  return { container, svg, theArrow };
}

describe('PATCH DRAWING-LINE-EDIT-CLIP-R1: edit-mode endpoint handles still exist and still commit their drags', () => {
  it('2) dragging the START endpoint handle commits new start coordinates via onUpdateLine + onSaveLine', () => {
    const onUpdateLine = vi.fn();
    const onSaveLine = vi.fn();
    const { container } = mountEditableArrow({ onUpdateLine, onSaveLine });

    const startHandle = container.querySelector('circle[data-line-role="start-handle"]');
    expect(startHandle).toBeTruthy();

    fireMouseDown(startHandle!, 100, 100);
    fireWindowMouseMove(140, 175);
    fireWindowMouseUp(140, 175);

    expect(onUpdateLine).toHaveBeenCalled();
    const startUpdates = onUpdateLine.mock.calls.map(c => c[1]).filter(u => 'start_x' in u);
    expect(startUpdates.length).toBeGreaterThan(0);
    expect(startUpdates.at(-1)).toMatchObject({ start_x: 140, start_y: 175 });
    // The END must not have been touched by a START drag.
    expect(startUpdates.at(-1)).not.toHaveProperty('end_x');
    expect(onSaveLine).toHaveBeenCalledWith('arrow-1', expect.anything());
  });

  it('3) dragging the END endpoint handle commits new end coordinates via onUpdateLine + onSaveLine', () => {
    const onUpdateLine = vi.fn();
    const onSaveLine = vi.fn();
    const { container } = mountEditableArrow({ onUpdateLine, onSaveLine });

    const endHandle = container.querySelector('circle[data-line-role="end-handle"]');
    expect(endHandle).toBeTruthy();

    fireMouseDown(endHandle!, 300, 120);
    fireWindowMouseMove(420, 60);
    fireWindowMouseUp(420, 60);

    const endUpdates = onUpdateLine.mock.calls.map(c => c[1]).filter(u => 'end_x' in u);
    expect(endUpdates.length).toBeGreaterThan(0);
    expect(endUpdates.at(-1)).toMatchObject({ end_x: 420, end_y: 60 });
    expect(endUpdates.at(-1)).not.toHaveProperty('start_x');
    expect(onSaveLine).toHaveBeenCalledWith('arrow-1', expect.anything());
  });

  it('4) dragging the CONTROL handle commits new control coordinates, leaving both endpoints alone', () => {
    const onUpdateLine = vi.fn();
    const { container } = mountEditableArrow({ onUpdateLine });

    const controlHandle = container.querySelector('circle[data-line-role="control-handle"]');
    expect(controlHandle).toBeTruthy();

    fireMouseDown(controlHandle!, 200, 80);
    fireWindowMouseMove(210, 20);
    fireWindowMouseUp(210, 20);

    const controlUpdates = onUpdateLine.mock.calls.map(c => c[1]).filter(u => 'control_x' in u);
    expect(controlUpdates.length).toBeGreaterThan(0);
    expect(controlUpdates.at(-1)).toMatchObject({ control_x: 210, control_y: 20 });
    expect(controlUpdates.at(-1)).not.toHaveProperty('start_x');
    expect(controlUpdates.at(-1)).not.toHaveProperty('end_x');
  });

  it('5) whole-line drag via the hit-path still translates every coordinate together', () => {
    const onUpdateLine = vi.fn();
    const onSaveLine = vi.fn();
    // Not in edit mode: clicking the hit-path drags the whole line rather
    // than adding a point.
    const theArrow = arrow('arrow-1');
    const container = mount(
      <SimpleLineRenderer
        lines={[theArrow]}
        selectedLineId={theArrow.id}
        onSelectLine={() => {}}
        onUpdateLine={onUpdateLine}
        onSaveLine={onSaveLine}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    const hitPath = container.querySelector('path[data-line-role="hit-path"]');
    expect(hitPath).toBeTruthy();

    fireMouseDown(hitPath!, 200, 100);
    fireWindowMouseMove(230, 140);
    fireWindowMouseUp(230, 140);

    const moves = onUpdateLine.mock.calls.map(c => c[1]).filter(u => 'start_x' in u && 'end_x' in u);
    expect(moves.length).toBeGreaterThan(0);
    // A whole-line drag of (+30, +40) shifts start, control and end equally.
    expect(moves.at(-1)).toMatchObject({
      start_x: 130, start_y: 140,
      control_x: 230, control_y: 120,
      end_x: 330, end_y: 160,
    });
    expect(onSaveLine).toHaveBeenCalled();
  });

  it('6) the arrowhead follows the endpoint: marker-end stays bound to the path across an end-handle drag, and arrow flags are never rewritten', () => {
    const onUpdateLine = vi.fn();
    const { container } = mountEditableArrow({
      onUpdateLine,
      line: arrow('arrow-1', { start_arrow: true, end_arrow: true }),
    });

    const visible = container.querySelector('path[data-line-role="visible-path"]')!;
    expect(visible.getAttribute('marker-end')).toBe('url(#front-arrow-end-arrow-1)');
    expect(visible.getAttribute('marker-start')).toBe('url(#front-arrow-start-arrow-1)');

    const endHandle = container.querySelector('circle[data-line-role="end-handle"]')!;
    fireMouseDown(endHandle, 300, 120);
    fireWindowMouseMove(500, 400);
    fireWindowMouseUp(500, 400);

    // The endpoint moved...
    const endUpdates = onUpdateLine.mock.calls.map(c => c[1]).filter(u => 'end_x' in u);
    expect(endUpdates.at(-1)).toMatchObject({ end_x: 500, end_y: 400 });
    // ...and no update ever rewrote the arrow flags (the arrowhead is bound
    // to the path end by markerEnd, so it follows geometry for free -- this
    // pins that nothing in the drag path silently clears them).
    for (const [, updates] of onUpdateLine.mock.calls) {
      expect(updates).not.toHaveProperty('start_arrow');
      expect(updates).not.toHaveProperty('end_arrow');
    }
  });
});

describe('PATCH DRAWING-LINE-EDIT-CLIP-R1: the two clips are applied to different boxes on purpose', () => {
  it('1) the inner containment <g> carries the view-box-anchored clip, so its geometry is viewport-relative rather than content-bbox-relative', () => {
    const { container } = mountEditableArrow({});
    const innerG = container.querySelector('g[data-line-containment]') as SVGGElement;
    expect(innerG).toBeTruthy();
    expect(innerG.style.clipPath).toContain('view-box');
    expect(innerG.style.clipPath).toContain('--drawing-visible-canvas-left-inset');
    expect(innerG.style.clipPath).toContain('--drawing-native-ui-top-inset');
  });

  it('9) the root <svg> keeps its own unsuffixed clip (it has a real CSS border box already, and this is the R2/R3-verified containment path) -- and both are absent mid-gesture only on the root', () => {
    const { container } = mountEditableArrow({});
    const rootSvg = container.querySelector('svg') as unknown as SVGSVGElement;
    // Idle (no active gesture): root is clipped, and NOT with view-box.
    expect(rootSvg.style.clipPath).toContain('polygon(');
    expect(rootSvg.style.clipPath).not.toContain('view-box');
  });

  it('10) mid-gesture the root unclips (Gesture-R1/R2 lifecycle) while the inner <g> stays clipped -- unchanged by this patch', () => {
    const onUpdateLine = vi.fn();
    const { container } = mountEditableArrow({ onUpdateLine });
    const rootSvg = container.querySelector('svg') as unknown as SVGSVGElement;
    const endHandle = container.querySelector('circle[data-line-role="end-handle"]')!;

    fireMouseDown(endHandle, 300, 120);
    // Now isDragging === true -> isActiveGesture -> root clip removed.
    expect(rootSvg.style.clipPath).toBe('');
    const innerG = container.querySelector('g[data-line-containment]') as SVGGElement;
    expect(innerG.style.clipPath).toContain('view-box');

    fireWindowMouseUp(300, 120);
    // Gesture over -> root clipped again.
    expect(rootSvg.style.clipPath).toContain('polygon(');
  });

  it('off the Drawing surface (no excalidrawAPIRef) there is no containment clip at all, so Freeform is untouched by this patch', () => {
    const { container } = mountEditableArrow({ drawingSurface: false });
    const innerG = container.querySelector('g[data-line-containment]');
    // No boundary -> the data attribute itself is not even set.
    expect(innerG).toBeNull();
    const rootSvg = container.querySelector('svg') as unknown as SVGSVGElement;
    expect(rootSvg.style.clipPath).toBe('');
  });
});
