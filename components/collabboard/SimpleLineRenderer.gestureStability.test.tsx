// @vitest-environment jsdom
//
// PATCH DRAWING-LINE-GESTURE-R1 -- regression guard for the confirmed live
// issue: the drawing-preview effect used to depend on `[drawing, onCreateLine,
// getMousePos]`, and `drawing` gets a brand-new object every mousemove while
// `onCreateLine`/`getMousePos` can also change identity on an unrelated
// parent re-render (e.g. drawingViewport recomputing upstream). That tore
// down and rebuilt the window mousemove/mouseup listeners on almost every
// tick of an active gesture, and a real mouseup landing in one of those gaps
// silently failed to commit.
//
// Fix under test: the effect now depends only on the gesture-active boolean,
// and reads the always-latest callback/state through refs updated in the
// render body every render (onCreateLineRef/getMousePosRef/drawingRef). This
// file proves the listeners attach exactly once per gesture, survive
// unrelated re-renders with changed callback identities, commit exactly once
// on a single mouseup, and clean up on completion and on cancellation/unmount.
import React, { useState } from 'react';
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
  return { container, root };
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

/** Spies on window.addEventListener/removeEventListener for the given types. */
function spyOnWindowListeners(types: Array<'mousemove' | 'mouseup'>) {
  const log: Array<{ op: 'add' | 'remove'; type: string }> = [];
  const origAdd = window.addEventListener.bind(window);
  const origRemove = window.removeEventListener.bind(window);
  const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type: any, listener: any, options?: any) => {
    if (types.includes(type)) log.push({ op: 'add', type });
    return origAdd(type, listener, options);
  });
  const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation((type: any, listener: any, options?: any) => {
    if (types.includes(type)) log.push({ op: 'remove', type });
    return origRemove(type, listener, options);
  });
  return {
    log,
    restore: () => { addSpy.mockRestore(); removeSpy.mockRestore(); },
    countOf: (op: 'add' | 'remove', type: string) => log.filter(e => e.op === op && e.type === type).length,
  };
}

/**
 * A wrapper that mints a BRAND NEW onCreateLine function reference (and a
 * distinct canvasZoom-derived getMousePos identity via a fresh inline
 * function) on every render, and exposes a way to force extra re-renders
 * from the test -- simulating exactly the "unrelated parent re-render churns
 * callback identities" condition that caused the live bug.
 */
function ChurnHarness({
  onCommit,
  bumpRef,
}: {
  onCommit: (args: [number, number, number, number]) => void;
  bumpRef: React.MutableRefObject<() => void>;
}) {
  const [tick, setTick] = useState(0);
  bumpRef.current = () => setTick(t => t + 1);
  // A fresh closure every render (captures `tick`), so React sees a new
  // function identity each time -- exactly the unstable-callback condition.
  const onCreateLine = (startX: number, startY: number, endX: number, endY: number) => {
    onCommit([startX, startY, endX, endY]);
  };
  return (
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
      key="stable-key"
    />
  );
}

describe('PATCH DRAWING-LINE-GESTURE-R1: gesture listener lifecycle is stable across churning callback identities', () => {
  it('1-2) starting a gesture attaches exactly one mousemove and one mouseup window listener', () => {
    const spy = spyOnWindowListeners(['mousemove', 'mouseup']);
    const bumpRef = { current: () => {} };
    const { container } = mount(<ChurnHarness onCommit={() => {}} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 50, 50);

    expect(spy.countOf('add', 'mousemove')).toBe(1);
    expect(spy.countOf('add', 'mouseup')).toBe(1);
    spy.restore();
  });

  it('3-4) re-rendering mid-gesture with a brand-new onCreateLine identity does NOT tear down or re-add the listeners', () => {
    const spy = spyOnWindowListeners(['mousemove', 'mouseup']);
    const bumpRef = { current: () => {} };
    const { container } = mount(<ChurnHarness onCommit={() => {}} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 50, 50);
    expect(spy.countOf('add', 'mouseup')).toBe(1);

    // Force several unrelated re-renders mid-gesture, each minting a new
    // onCreateLine closure -- this is what used to retrigger the effect.
    for (let i = 0; i < 5; i++) {
      act(() => { bumpRef.current(); });
    }

    // Still exactly one add, zero removes -- the listener was never torn down.
    expect(spy.countOf('add', 'mouseup')).toBe(1);
    expect(spy.countOf('remove', 'mouseup')).toBe(0);
    expect(spy.countOf('add', 'mousemove')).toBe(1);
    expect(spy.countOf('remove', 'mousemove')).toBe(0);
    spy.restore();
  });

  it('5) exactly one mouseup, after churn, commits exactly once with the correct final coordinates', () => {
    const onCommit = vi.fn();
    const bumpRef = { current: () => {} };
    const { container } = mount(<ChurnHarness onCommit={onCommit} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 50, 50);
    for (let i = 0; i < 5; i++) {
      act(() => { bumpRef.current(); });
    }
    fireWindowMouseMove(400, 400);
    for (let i = 0; i < 3; i++) {
      act(() => { bumpRef.current(); });
    }
    fireWindowMouseUp(400, 400);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([50, 50, 400, 400]);
  });

  it('6) listeners are removed exactly once after the gesture completes', () => {
    const spy = spyOnWindowListeners(['mousemove', 'mouseup']);
    const bumpRef = { current: () => {} };
    const { container } = mount(<ChurnHarness onCommit={() => {}} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 50, 50);
    act(() => { bumpRef.current(); });
    fireWindowMouseMove(200, 200);
    fireWindowMouseUp(200, 200);

    expect(spy.countOf('add', 'mouseup')).toBe(1);
    expect(spy.countOf('remove', 'mouseup')).toBe(1);
    expect(spy.countOf('add', 'mousemove')).toBe(1);
    expect(spy.countOf('remove', 'mousemove')).toBe(1);
    spy.restore();
  });

  it('7) the same stabilized lifecycle commits an arrow (start_arrow+end_arrow semantics live entirely in the caller, not in SimpleLineRenderer -- the creation pointer lifecycle is identical) exactly once despite churn', () => {
    const createdLines: CanvasLine[] = [];
    const onCommit = vi.fn((args: [number, number, number, number]) => {
      const [startX, startY, endX, endY] = args;
      createdLines.push(line('new-arrow', {
        start_x: startX, start_y: startY, end_x: endX, end_y: endY,
        start_arrow: true, end_arrow: true,
      }));
    });
    const bumpRef = { current: () => {} };
    const { container } = mount(<ChurnHarness onCommit={onCommit} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 20, 20);
    for (let i = 0; i < 4; i++) {
      act(() => { bumpRef.current(); });
    }
    fireWindowMouseMove(180, 90);
    act(() => { bumpRef.current(); });
    fireWindowMouseUp(180, 90);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(createdLines).toHaveLength(1);
    expect(createdLines[0]).toMatchObject({ start_arrow: true, end_arrow: true, start_x: 20, start_y: 20, end_x: 180, end_y: 90 });
  });

  it('8) cancelling via unmount mid-gesture removes both listeners, and no stray mouseup after unmount can trigger a commit', () => {
    const spy = spyOnWindowListeners(['mousemove', 'mouseup']);
    const onCommit = vi.fn();
    const bumpRef = { current: () => {} };
    const { container, root } = mount(<ChurnHarness onCommit={onCommit} bumpRef={bumpRef} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    stubSvgRect(svg);

    fireMouseDown(svg, 10, 10);
    fireWindowMouseMove(120, 60);
    expect(spy.countOf('add', 'mouseup')).toBe(1);

    act(() => { root.unmount(); });
    mounted = mounted.filter(m => m.root !== root);

    expect(spy.countOf('remove', 'mouseup')).toBe(1);
    expect(spy.countOf('remove', 'mousemove')).toBe(1);

    // A mouseup dispatched after unmount must not reach any stale handler.
    fireWindowMouseUp(120, 60);
    expect(onCommit).not.toHaveBeenCalled();
    spy.restore();
    container.remove();
  });
});
