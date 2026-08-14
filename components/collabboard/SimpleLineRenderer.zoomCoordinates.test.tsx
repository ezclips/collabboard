// @vitest-environment jsdom
//
// PATCH 9J -- proves the end-to-end screen->world pointer pipeline for
// Freeform/Map (legacy, non-Drawing) Lines applies canvasZoom EXACTLY ONCE,
// for creation, whole-line movement, and endpoint movement alike. Mounts the
// real component (createRoot/act, matching the established convention in
// useScrollbarLane.test.tsx) and dispatches real DOM pointer events, since
// this is specifically an end-to-end pipeline proof, not a pure-function
// unit test -- SimpleLineRenderer.getMousePos divides by canvasZoom once
// before ever calling onCreateLine/onUpdateLine, and PATCH 9J removed a
// second, redundant division that used to happen downstream in
// createCanvasLineGeometryFromLayerCoords's legacy branch.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import SimpleLineRenderer from './SimpleLineRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// SimpleLineRenderer's drag mousemove handler throttles via
// requestAnimationFrame; jsdom's rAF is timer-based and would otherwise
// leave onUpdateLine uncalled inside a synchronous act() block, so it's
// stubbed to run synchronously for these gesture tests.
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

// The SVG sits inside CanvasClient's own scale(canvasZoom) wrapper in
// production; getBoundingClientRect() on a real browser already reflects
// that ancestor scale. jsdom performs no layout, so we stub it directly on
// the mounted SVG node, matching the pattern established for offsetWidth/
// clientWidth in useScrollbarLane.test.tsx. left/top are pinned at 0 so
// clientX/clientY directly represent the screen displacement from origin.
function stubSvgRect(svg: SVGSVGElement) {
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON() { return this; },
  } as DOMRect);
}

function line(id: string, overrides: Partial<CanvasLine> = {}): CanvasLine {
  return {
    id,
    board_id: 'board',
    start_x: 10,
    start_y: 20,
    control_x: 30,
    control_y: 40,
    end_x: 50,
    end_y: 60,
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

describe('PATCH 9J: new Line creation applies canvasZoom exactly once [tests 7, 8, 9, 12, 13]', () => {
  it.each([
    // [canvasZoom, screenDeltaX, screenDeltaY, expectedWorldDeltaX, expectedWorldDeltaY]
    ['zoom 1 (100%, unaffected baseline)', 1, 120, 90, 120, 90],
    ['zoom 0.8 (80%)', 0.8, 160, 80, 200, 100],
    ['zoom 0.6 (the reported repro zoom)', 0.6, 300, 180, 500, 300],
    ['zoom 0.4', 0.4, 200, 160, 500, 400],
    ['zoom 1.5 (>100%, no regression)', 1.5, 300, 150, 200, 100],
  ])('at %s, a screen displacement converts to world coordinates via a single division, matching the pointer', (_label, canvasZoom, dx, dy, expectedDx, expectedDy) => {
    const onCreateLine = vi.fn();
    const container = mount(
      <SimpleLineRenderer
        lines={[]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={onCreateLine}
        isLineMode
        isEditMode={false}
        onToggleEditMode={() => {}}
        canvasZoom={canvasZoom}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 0, 0);
    fireWindowMouseMove(dx, dy);
    fireWindowMouseUp(dx, dy);

    expect(onCreateLine).toHaveBeenCalledTimes(1);
    const [startX, startY, endX, endY] = onCreateLine.mock.calls[0];
    expect(startX).toBe(0);
    expect(startY).toBe(0);
    expect(endX).toBeCloseTo(expectedDx, 10);
    expect(endY).toBeCloseTo(expectedDy, 10);

    // Negative control D/E anchor: must be neither the undivided screen
    // value nor the double-divided value.
    if (canvasZoom !== 1) {
      expect(endX).not.toBeCloseTo(dx, 10); // not S (zero divisions)
      expect(endX).not.toBeCloseTo(dx / canvasZoom / canvasZoom, 10); // not S/Z/Z (double division)
    }
  });
});

describe('PATCH 9J: existing whole-line movement stays correct at zoom != 1 [test 14]', () => {
  it('dragging an existing line applies canvasZoom exactly once to the reported delta', () => {
    const onUpdateLine = vi.fn();
    const target = line('move-me', { start_x: 100, start_y: 100, control_x: 120, control_y: 90, end_x: 140, end_y: 100 });
    const container = mount(
      <SimpleLineRenderer
        lines={[target]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={onUpdateLine}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
        canvasZoom={0.6}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    const hitPath = container.querySelector('[data-line-role="hit-path"]') as Element;
    expect(hitPath).toBeTruthy();

    fireMouseDown(hitPath, 0, 0);
    fireWindowMouseMove(300, 180);

    // dx screen=300 at zoom 0.6 -> world dx=500; dy screen=180 -> world dy=300
    expect(onUpdateLine).toHaveBeenCalled();
    const lastCall = onUpdateLine.mock.calls[onUpdateLine.mock.calls.length - 1];
    const [, updates] = lastCall as [string, Partial<CanvasLine>];
    expect(updates.start_x).toBeCloseTo(100 + 500, 6);
    expect(updates.start_y).toBeCloseTo(100 + 300, 6);
    expect(updates.end_x).toBeCloseTo(140 + 500, 6);
    expect(updates.end_y).toBeCloseTo(100 + 300, 6);
  });
});

describe('PATCH 9J: endpoint/point movement stays correct at zoom != 1 [test 15]', () => {
  it('dragging a point handle applies canvasZoom exactly once', () => {
    const onUpdateLine = vi.fn();
    const target = line('edit-me', {
      points: [
        { x: 100, y: 100, type: 'smooth' },
        { x: 200, y: 100, type: 'smooth' },
      ],
    });
    const container = mount(
      <SimpleLineRenderer
        lines={[target]}
        selectedLineId="edit-me"
        onSelectLine={() => {}}
        onUpdateLine={onUpdateLine}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode
        onToggleEditMode={() => {}}
        canvasZoom={0.4}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    const handle = container.querySelector('[data-line-role="point-handle"]') as Element;
    expect(handle).toBeTruthy();

    fireMouseDown(handle, 0, 0);
    fireWindowMouseMove(200, 160);

    // screen (200,160) at zoom 0.4 -> world (500, 400)
    expect(onUpdateLine).toHaveBeenCalled();
    const lastCall = onUpdateLine.mock.calls[onUpdateLine.mock.calls.length - 1];
    const [, updates] = lastCall as [string, Partial<CanvasLine>];
    expect(updates.points?.[0]).toMatchObject({ x: 500, y: 400 });
  });
});

describe('PATCH 9J: Line-mode cursor and hit-area wiring are unchanged by the world-stage/coordinate fix [negative control K]', () => {
  it('the SVG shows crosshair while Line mode is active, and default otherwise -- mounted, real DOM style', () => {
    const active = mount(
      <SimpleLineRenderer
        lines={[]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode
        isEditMode={false}
        onToggleEditMode={() => {}}
        canvasZoom={0.6}
      />,
    );
    const inactive = mount(
      <SimpleLineRenderer
        lines={[]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
        canvasZoom={0.6}
      />,
    );

    const activeSvg = active.querySelector('svg') as SVGSVGElement;
    const inactiveSvg = inactive.querySelector('svg') as SVGSVGElement;
    expect(activeSvg.style.cursor).toBe('crosshair');
    expect(inactiveSvg.style.cursor).toBe('default');
  });

  it('the hit-path stays pointer-events:auto and the SVG stays pointer-events:auto in Line mode, at any zoom -- the world-stage fix does not touch hit-area wiring', () => {
    const container = mount(
      <SimpleLineRenderer
        lines={[line('hit-test-line')]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode
        isEditMode={false}
        onToggleEditMode={() => {}}
        canvasZoom={0.6}
      />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    const hitPath = container.querySelector('[data-line-role="hit-path"]') as SVGPathElement;

    expect(svg.style.pointerEvents).toBe('auto');
    expect(hitPath.style.pointerEvents).toBe('auto');
  });
});
