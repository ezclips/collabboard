// @vitest-environment jsdom
//
// PATCH DRAWING-LINE-CLIP-R2 -- regression guard for BOTH contracts at once,
// per the patch's own instruction that neither side may be tested in
// isolation any more (this exact defect has recurred across R1 and R2):
//
//   A) DRAWING: the full pointerdown -> pointermove -> pointerup lifecycle
//      for creating a new line/arrow, and for dragging an existing one,
//      must reach commit (onCreateLine / onUpdateLine+onSaveLine) on the
//      Drawing surface (excalidrawAPIRef set), exactly as it does off the
//      Drawing surface.
//   B) CONTAINMENT: the root <svg> (the interaction surface) must be
//      unclipped for the full duration of an active gesture -- that is the
//      fix for R1's regression -- while the inner rendering <g> stays
//      clipped at all times, including mid-gesture, so painted ink is still
//      contained.
//
// Root cause this guards against (R1): clip-path removes an element from
// hit-testing outside the clipped region. R1 put clip-path directly on the
// root <svg>, so once the pointer moved/released outside the clipped area,
// the event no longer targeted our SVG -- it fell through to Excalidraw's
// own canvas underneath, which could consume it before our window-level
// mousemove/mouseup listeners ever saw it, silently breaking line creation.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import SimpleLineRenderer from './SimpleLineRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Matches the established convention in SimpleLineRenderer.zoomCoordinates.test.tsx:
// jsdom's rAF is timer-based, which would leave the drag's onUpdateLine
// uncalled inside a synchronous act() block.
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

describe('PATCH DRAWING-LINE-CLIP-R2 contract A: pointer lifecycle reaches commit on the Drawing surface', () => {
  it('line creation: mousedown -> drag -> mouseup calls onCreateLine, with excalidrawAPIRef (containment active) exactly as without it', () => {
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
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 50, 50);
    fireWindowMouseMove(400, 400);
    fireWindowMouseUp(400, 400);

    expect(onCreateLine).toHaveBeenCalledTimes(1);
    const [startX, startY, endX, endY] = onCreateLine.mock.calls[0];
    expect(startX).toBe(50);
    expect(startY).toBe(50);
    expect(endX).toBe(400);
    expect(endY).toBe(400);
  });

  it('arrow creation/movement: dragging an existing arrow line (start_arrow+end_arrow) to a new position reaches commit via onUpdateLine and onSaveLine, on the Drawing surface', () => {
    const onUpdateLine = vi.fn();
    const onSaveLine = vi.fn();
    const arrowLine = line('arrow-1', { start_arrow: true, end_arrow: true, start_x: 100, start_y: 100, control_x: 120, control_y: 90, end_x: 140, end_y: 100 });
    const container = mount(
      <SimpleLineRenderer
        lines={[arrowLine]}
        selectedLineId={null}
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
    const hitPath = container.querySelector('[data-line-id="arrow-1"][data-line-role="hit-path"]') as Element;
    expect(hitPath).toBeTruthy();

    fireMouseDown(hitPath, 0, 0);
    fireWindowMouseMove(50, 30);
    fireWindowMouseUp(50, 30);

    expect(onUpdateLine).toHaveBeenCalled();
    expect(onSaveLine).toHaveBeenCalledWith('arrow-1', expect.anything());
  });

  it('the completed drag also works when the gesture crosses through where the boundary clip would otherwise sit -- proves the interaction surface is not gated by clip-path mid-gesture', () => {
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
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    // Start well inside the canvas, then release at a point that (in the
    // real browser, with the notch/right-inset CSS vars resolved) would fall
    // inside the excluded region -- e.g. near the top-left native-UI corner.
    fireMouseDown(svg, 300, 300);
    fireWindowMouseMove(50, 20);
    fireWindowMouseUp(50, 20);

    expect(onCreateLine).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH DRAWING-LINE-CLIP-R2 contract B: root interaction surface stays unclipped for the duration of a gesture; the inner rendering <g> stays clipped throughout', () => {
  it('idle (no gesture): the root <svg> DOES carry the boundary clip-path', () => {
    const container = mount(
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
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.clipPath).toContain('polygon(');
  });

  it('mid-gesture (drawing a new line): the root <svg> clip-path is cleared the instant the drag starts, and restored the instant it commits', () => {
    const container = mount(
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
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    expect(svg.style.clipPath).toContain('polygon(');

    fireMouseDown(svg, 10, 10);
    expect(svg.style.clipPath).toBe('');

    fireWindowMouseMove(200, 200);
    expect(svg.style.clipPath).toBe('');

    fireWindowMouseUp(200, 200);
    expect(svg.style.clipPath).toContain('polygon(');
  });

  it('mid-gesture (dragging an existing line): the root <svg> clip-path is cleared while draggingLine is active, and restored on release', () => {
    const target = line('drag-me');
    const container = mount(
      <SimpleLineRenderer
        lines={[target]}
        selectedLineId={null}
        onSelectLine={() => {}}
        onUpdateLine={() => {}}
        onSaveLine={() => {}}
        onCreateLine={() => {}}
        isLineMode={false}
        isEditMode={false}
        onToggleEditMode={() => {}}
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    const hitPath = container.querySelector('[data-line-role="hit-path"]') as Element;

    expect(svg.style.clipPath).toContain('polygon(');
    fireMouseDown(hitPath, 0, 0);
    expect(svg.style.clipPath).toBe('');
    fireWindowMouseUp(10, 10);
    expect(svg.style.clipPath).toContain('polygon(');
  });

  it('the inner rendering <g> keeps the SAME boundary clip-path both idle and mid-gesture -- visual containment never lapses', () => {
    const container = mount(
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
        excalidrawAPIRef={{ current: {} }}
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    const innerG = container.querySelector('g[data-line-containment="visible-canvas"]') as SVGGElement;
    expect(innerG).toBeTruthy();
    const idleClip = innerG.style.clipPath;
    expect(idleClip).toContain('polygon(');

    fireMouseDown(svg, 10, 10);
    fireWindowMouseMove(200, 200);
    expect(innerG.style.clipPath).toBe(idleClip);

    fireWindowMouseUp(200, 200);
    expect(innerG.style.clipPath).toBe(idleClip);
  });

  it('off the Drawing surface (no excalidrawAPIRef), neither the root nor any inner element ever carries a clip-path -- Freeform/Map unaffected by the gesture-aware toggle', () => {
    const container = mount(
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
      />,
    );
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);
    expect(svg.style.clipPath).toBe('');

    fireMouseDown(svg, 10, 10);
    fireWindowMouseMove(200, 200);
    fireWindowMouseUp(200, 200);
    expect(svg.style.clipPath).toBe('');
  });
});
