// @vitest-environment jsdom
//
// PATCH-245/247. The shared stage fits a picture to its box, zooms around the
// pointer on Ctrl+wheel, pans on the empty background (or Space+drag), leaves a
// plain wheel to scroll the window, and never writes or fetches.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import InfographicRenderer from './InfographicRenderer';
import PictureStage from './PictureStage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.restoreAllMocks();
});

function rect(left: number, top: number, width: number, height: number) {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setup(
  c: HTMLElement,
  { stageW = 800, stageH = 600, pictureW = 800, pictureH = 300 },
) {
  const stage = c.querySelector('[data-picture-stage]') as HTMLElement;
  const content = c.querySelector('[data-picture-content]') as HTMLElement;
  Object.defineProperty(stage, 'clientWidth', { configurable: true, value: stageW });
  Object.defineProperty(stage, 'clientHeight', { configurable: true, value: stageH });
  stage.getBoundingClientRect = () => rect(0, 0, stageW, stageH);
  Object.defineProperty(content, 'offsetWidth', { configurable: true, value: pictureW });
  Object.defineProperty(content, 'offsetHeight', { configurable: true, value: pictureH });
  act(() => { window.dispatchEvent(new Event('resize')); });
}

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function wheel(
  el: Element,
  { deltaY = 0, deltaX = 0, ctrlKey = false, clientX = 0, clientY = 0 } = {},
) {
  act(() => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaX, ctrlKey, clientX, clientY, bubbles: true, cancelable: true }));
  });
}

function pointer(el: EventTarget, type: string, x: number, y: number, pointerId = 1) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId, button: 0 }));
  });
}

function viewBoxOf(c: HTMLElement): { x: number; y: number; width: number; height: number } {
  const raw = (c.querySelector('svg') as SVGSVGElement).getAttribute('viewBox') ?? '';
  const [x, y, width, height] = raw.split(/\s+/).map(Number);
  return { x, y, width, height };
}

/** Where a viewBox point lands on screen, for an SVG with preserveAspectRatio meet. */
function screenPoint(
  point: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
  r: { left: number; top: number; width: number; height: number },
) {
  const scale = Math.min(r.width / box.width, r.height / box.height);
  const offsetX = (r.width - box.width * scale) / 2;
  const offsetY = (r.height - box.height * scale) / 2;
  return {
    x: r.left + offsetX + (point.x - box.x) * scale,
    y: r.top + offsetY + (point.y - box.y) * scale,
  };
}

function zoomValue(c: HTMLElement): number {
  const text = c.querySelector('[data-picture-zoom-value]')?.textContent ?? '0';
  return Number.parseInt(text, 10);
}

function parseTransform(c: HTMLElement): { x: number; y: number; zoom: number } | null {
  const el = c.querySelector('[data-picture-content]') as HTMLElement;
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(el.style.transform);
  return match ? { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) } : null;
}

describe('PATCH-245 PictureStage', () => {
  it('fits a wide picture to the stage on open, clamped 25%–200%', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    // min(800/800, 600/300) = 1.
    expect(zoomValue(container)).toBe(100);
  });

  it('fits a tall/small picture BIG, clamped at 200%', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 100, pictureH: 75 });
    expect(zoomValue(container)).toBe(200);
  });

  it('+ / − step by one and clamp at 25% / 400%', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    // A huge picture fits at 25%.
    setup(container, { pictureW: 8000, pictureH: 6000 });
    expect(zoomValue(container)).toBe(25);
    click(container.querySelector('[data-picture-zoom-out]') as Element);
    expect(zoomValue(container)).toBe(25);

    setup(container, { pictureW: 800, pictureH: 300 });
    const plus = container.querySelector('[data-picture-zoom-in]') as Element;
    for (let i = 0; i < 40; i += 1) click(plus);
    expect(zoomValue(container)).toBe(400);
  });

  it('clicking the percentage fits again', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    click(container.querySelector('[data-picture-zoom-in]') as Element);
    expect(zoomValue(container)).toBeGreaterThan(100);
    click(container.querySelector('[data-picture-zoom-value]') as Element);
    expect(zoomValue(container)).toBe(100);
  });

  it('ctrl+wheel zooms around the pointer (that point stays fixed)', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const p = { x: 600, y: 300 };
    const contentBefore = { x: (p.x - before.x) / before.zoom, y: (p.y - before.y) / before.zoom };

    wheel(container.querySelector('[data-picture-stage]') as Element, {
      ctrlKey: true, deltaY: -100, clientX: p.x, clientY: p.y,
    });

    const after = parseTransform(container)!;
    expect(after.zoom).toBeGreaterThan(before.zoom);
    expect((p.x - after.x) / after.zoom).toBeCloseTo(contentBefore.x, 5);
    expect((p.y - after.y) / after.zoom).toBeCloseTo(contentBefore.y, 5);
  });

  it('plain wheel does NOT pan or zoom, and is not defaultPrevented (the window scrolls)', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const stage = container.querySelector('[data-picture-stage]') as Element;
    const event = new WheelEvent('wheel', {
      deltaY: 50, deltaX: 10, bubbles: true, cancelable: true,
    });
    act(() => { stage.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    const after = parseTransform(container)!;
    expect(after.zoom).toBe(before.zoom);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('ctrl+wheel is defaultPrevented and does NOT propagate to a parent listener', () => {
    const parentWheel = vi.fn();
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    // Stand-in for the canvas: a listener on the stage's parent.
    container.addEventListener('wheel', parentWheel);
    const stage = container.querySelector('[data-picture-stage]') as Element;
    const event = new WheelEvent('wheel', {
      ctrlKey: true, deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true,
    });
    act(() => { stage.dispatchEvent(event); });
    container.removeEventListener('wheel', parentWheel);
    expect(event.defaultPrevented).toBe(true);
    expect(parentWheel).not.toHaveBeenCalled();
  });

  it('Space+drag pans even when the press starts on a word', () => {
    const { container } = mount(
      <PictureStage>
        <span data-ai-edit-ref="label:0">Spring</span>
      </PictureStage>,
    );
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const word = container.querySelector('[data-ai-edit-ref="label:0"]') as Element;
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
    pointer(word, 'pointerdown', 0, 0);
    pointer(window, 'pointermove', 30, 20);
    pointer(window, 'pointerup', 30, 20);
    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
    const after = parseTransform(container)!;
    expect(after.x).toBeCloseTo(before.x + 30, 5);
    expect(after.y).toBeCloseTo(before.y + 20, 5);
  });

  it('dragging the empty background pans', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const stage = container.querySelector('[data-picture-stage]') as Element;
    pointer(stage, 'pointerdown', 0, 0);
    pointer(window, 'pointermove', 30, 20);
    pointer(window, 'pointerup', 30, 20);
    const after = parseTransform(container)!;
    expect(after.x).toBeCloseTo(before.x + 30, 5);
    expect(after.y).toBeCloseTo(before.y + 20, 5);
  });

  it('dragging moves a known point by the pointer delta in CSS mode', () => {
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const probe = { x: 100, y: 60 };
    const screenBefore = { x: before.x + probe.x * before.zoom, y: before.y + probe.y * before.zoom };

    const stage = container.querySelector('[data-picture-stage]') as Element;
    pointer(stage, 'pointerdown', 0, 0);
    pointer(window, 'pointermove', 25, 15);
    pointer(window, 'pointerup', 25, 15);

    const after = parseTransform(container)!;
    const screenAfter = { x: after.x + probe.x * after.zoom, y: after.y + probe.y * after.zoom };
    expect(screenAfter.x - screenBefore.x).toBeCloseTo(25, 1);
    expect(screenAfter.y - screenBefore.y).toBeCloseTo(15, 1);
  });

  it('dragging that starts on a word does NOT pan', () => {
    const { container } = mount(
      <PictureStage>
        <span data-ai-edit-ref="label:0">Spring</span>
      </PictureStage>,
    );
    setup(container, { pictureW: 800, pictureH: 300 });
    const before = parseTransform(container)!;
    const word = container.querySelector('[data-ai-edit-ref="label:0"]') as Element;
    pointer(word, 'pointerdown', 0, 0);
    pointer(window, 'pointermove', 40, 40);
    pointer(window, 'pointerup', 40, 40);
    const after = parseTransform(container)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('resets to Fit when the design/theme (resetKey) changes', () => {
    const { root, container } = mount(<PictureStage resetKey="a">picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    click(container.querySelector('[data-picture-zoom-in]') as Element);
    expect(zoomValue(container)).toBeGreaterThan(100);
    act(() => { root.render(<PictureStage resetKey="b">picture</PictureStage>); });
    expect(zoomValue(container)).toBe(100);
  });

  it('never fetches while zooming and panning', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NO NETWORK'));
    const { container } = mount(<PictureStage>picture</PictureStage>);
    setup(container, { pictureW: 800, pictureH: 300 });
    wheel(container.querySelector('[data-picture-stage]') as Element, { ctrlKey: true, deltaY: -100, clientX: 10, clientY: 10 });
    wheel(container.querySelector('[data-picture-stage]') as Element, { deltaY: 100 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attaches a NON-passive wheel listener and calls preventDefault', () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const { container } = mount(<PictureStage>picture</PictureStage>);
    const stage = container.querySelector('[data-picture-stage]') as HTMLElement;

    const nonPassive = addSpy.mock.calls.find(
      ([type, , options]) => type === 'wheel' && (options as AddEventListenerOptions | undefined)?.passive === false,
    );
    expect(nonPassive, 'no non-passive wheel listener').toBeTruthy();

    const event = new WheelEvent('wheel', {
      deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true, clientX: 10, clientY: 10,
    });
    act(() => { stage.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    addSpy.mockRestore();
  });

  describe('our designs inside the stage', () => {
    const outline: VisualOutline = {
      title: 'Seasons',
      ordered: false,
      kind: 'list',
      items: [{ label: 'Spring', detail: 'warm' }, { label: 'Summer', detail: 'hot' }, { label: 'Autumn', detail: 'cool' }],
    };
    const data: InfographicDiagramData = {
      type: 'diagram', subtype: 'infographic', renderer: 'infographic', title: 'Seasons', template: 'stack', outline,
    };

    it('clicking a word at scale 2 still opens the input for THAT word', () => {
      const onChange = vi.fn();
      const { container } = mount(
        <PictureStage>
          <InfographicRenderer data={data} edit={{ onChange }} />
        </PictureStage>,
      );
      // picture 400x300 in an 800x600 stage fits at 2 (200%).
      setup(container, { pictureW: 400, pictureH: 300 });
      expect(zoomValue(container)).toBe(200);

      click(container.querySelector('[data-ai-edit-ref="label:0"]') as Element);
      const input = container.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('Spring');
    });

    it('the + handle still inserts the right item', () => {
      const onChange = vi.fn();
      const { container } = mount(
        <PictureStage>
          <InfographicRenderer data={data} edit={{ onChange }} />
        </PictureStage>,
      );
      setup(container, { pictureW: 400, pictureH: 300 });
      click(container.querySelector('[data-ai-edit-add="0"]') as Element);
      const next = onChange.mock.calls[0][0] as VisualOutline;
      expect(next.items.map((item) => item.label)).toEqual(['Spring', 'New item', 'Summer', 'Autumn']);
    });

    it('keeps the +/− handles 18px on screen at high zoom (counter-scaled)', () => {
      const onChange = vi.fn();
      const { container } = mount(
        <PictureStage>
          <InfographicRenderer data={data} edit={{ onChange }} />
        </PictureStage>,
      );
      setup(container, { pictureW: 400, pictureH: 300 }); // fit 200%
      const plus = container.querySelector('[data-picture-zoom-in]') as Element;
      click(plus);
      click(plus);
      click(plus);
      const zoom = Number((container.querySelector('[data-picture-content]') as HTMLElement).getAttribute('data-picture-zoom'));
      expect(zoom).toBeGreaterThan(2.5);

      const handle = container.querySelector('[data-ai-edit-add="0"]') as HTMLElement;
      expect(handle.style.width).toBe('18px');
      const counter = Number(/scale\(([\d.]+)\)/.exec(handle.style.transform)?.[1]);
      expect(counter).toBeCloseTo(1 / zoom, 3);
      // 18px base size, counter-scaled inside the zoomed wrapper, is 18px on screen.
      expect(18 * counter * zoom).toBeCloseTo(18, 1);
    });

    it('keeps the rename input readable (13px) at high zoom', () => {
      const onChange = vi.fn();
      const { container } = mount(
        <PictureStage>
          <InfographicRenderer data={data} edit={{ onChange }} />
        </PictureStage>,
      );
      setup(container, { pictureW: 400, pictureH: 300 });
      click(container.querySelector('[data-picture-zoom-in]') as Element);
      click(container.querySelector('[data-picture-zoom-in]') as Element);
      click(container.querySelector('[data-picture-zoom-in]') as Element);

      click(container.querySelector('[data-ai-edit-ref="label:0"]') as Element);
      const input = container.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
      expect(input.style.fontSize).toBe('13px');
      const zoom = Number((container.querySelector('[data-picture-content]') as HTMLElement).getAttribute('data-picture-zoom'));
      const counter = Number(/scale\(([\d.]+)\)/.exec(input.style.transform)?.[1]);
      expect(counter).toBeCloseTo(1 / zoom, 3);
    });
  });

  describe('AntV mode', () => {
    it('zooms by changing the SVG viewBox, never a CSS transform on the container', () => {
      const onViewBoxChange = vi.fn();
      const { container } = mount(
        <PictureStage mode="antv" onViewBoxChange={onViewBoxChange}>
          <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
      const content = container.querySelector('[data-picture-content]') as HTMLElement;
      expect(content.style.transform).toBe('');

      wheel(container.querySelector('[data-picture-stage]') as Element, {
        ctrlKey: true, deltaY: -100, clientX: 500, clientY: 250,
      });

      const [x, y, width, height] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      expect(width).toBeLessThan(1000);
      expect(height).toBeLessThan(500);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      // The pointer's spot stays under the pointer.
      expect((500 - x) / width).toBeCloseTo(0.5, 2);
      expect((250 - y) / height).toBeCloseTo(0.5, 2);
      // Still no CSS transform on the AntV container.
      expect(content.style.transform).toBe('');
      expect(zoomValue(container)).toBeGreaterThan(100);
      expect(onViewBoxChange).toHaveBeenCalled();
    });

    it('plain wheel does NOT change the viewBox (the window scrolls)', () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
      setup(container, { stageW: 1000, stageH: 500, pictureW: 1000, pictureH: 500 });
      const before = svg.getAttribute('viewBox');
      const event = new WheelEvent('wheel', {
        deltaY: 80, deltaX: 20, bubbles: true, cancelable: true,
      });
      act(() => { (container.querySelector('[data-picture-stage]') as Element).dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
      expect(svg.getAttribute('viewBox')).toBe(before);
    });

    it('fills the stage (svg 100% x 100%) and Fits the clamped meet scale', () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 1867 456" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      setup(container, { stageW: 1020, stageH: 600, pictureW: 1020, pictureH: 600 });

      expect(svg.getAttribute('width')).toBe('100%');
      expect(svg.getAttribute('height')).toBe('100%');
      expect(svg.style.width).toBe('100%');
      expect(svg.style.height).toBe('100%');

      const [, , bw, bh] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      const expected = Math.max(0.25, Math.min(2, Math.min(1020 / 1867, 600 / 456)));
      expect(Math.min(1020 / bw, 600 / bh)).toBeCloseTo(expected, 3);
    });

    it('re-applies the 100% height when AntV rewrites it', async () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 1867 456" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      setup(container, { stageW: 1020, stageH: 600, pictureW: 1020, pictureH: 600 });
      expect(svg.getAttribute('height')).toBe('100%');

      await act(async () => {
        svg.setAttribute('height', 'auto');
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(svg.getAttribute('height')).toBe('100%');
    });

    it('drag-pan follows the pointer exactly, even with meet letterboxing', () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 2000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      // The svg viewport (1000x500) is shorter than the 1000x800 stage: letterboxed.
      const r = { left: 0, top: 0, width: 1000, height: 500 };
      svg.getBoundingClientRect = () => rect(r.left, r.top, r.width, r.height);
      setup(container, { stageW: 1000, stageH: 800, pictureW: 1000, pictureH: 800 });

      const box = viewBoxOf(container);
      const probe = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.3 };
      const before = screenPoint(probe, box, r);

      const stage = container.querySelector('[data-picture-stage]') as Element;
      pointer(stage, 'pointerdown', 10, 10);
      pointer(window, 'pointermove', 100, 40); // dx 90, dy 30
      pointer(window, 'pointerup', 100, 40);

      const after = screenPoint(probe, viewBoxOf(container), r);
      expect(after.x - before.x).toBeCloseTo(90, 0);
      expect(after.y - before.y).toBeCloseTo(30, 0);
    });

    it('never renders the PATCH-243 renderer <style> as a visible layout child', () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg" />
          <style data-antv-editable-css="true">{`[data-antv-editable]:hover [data-element-type="btns-group"] { display: inline; }`}</style>
        </PictureStage>,
      );
      const styleEl = container.querySelector('style[data-antv-editable-css]') as HTMLStyleElement;
      expect(styleEl).not.toBeNull();
      expect(getComputedStyle(styleEl).display).not.toBe('flex');

      const css = container.querySelector('[data-picture-antv-fill]')?.textContent ?? '';
      expect(css).toContain(':not(style)');
      expect(css).toMatch(/style\s*\{\s*display:\s*none\s*!important/);
    });

    it('clamps Fit at 200%: a small picture is drawn BIG', () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      setup(container, { stageW: 1020, stageH: 600, pictureW: 1020, pictureH: 600 });
      const [, , bw, bh] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      expect(Math.min(1020 / bw, 600 / bh)).toBeCloseTo(2, 3);
      expect(zoomValue(container)).toBe(200);
    });

    it('keeps the zoomed view when AntV rewrites the viewBox after an edit', async () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
      setup(container, { stageW: 1000, stageH: 500, pictureW: 1000, pictureH: 500 });
      expect(zoomValue(container)).toBe(100);

      wheel(container.querySelector('[data-picture-stage]') as Element, {
        ctrlKey: true, deltaY: -100, clientX: 500, clientY: 250,
      });
      const zoomed = viewBoxOf(container);
      const zoomedDisplay = zoomValue(container);
      expect(zoomed.width).toBeLessThan(1000);
      expect(zoomedDisplay).toBeGreaterThan(100);

      // AntV rewrites the SVG's own fit viewBox after any content/colour update.
      await act(async () => {
        svg.setAttribute('viewBox', '0 0 1000 500');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const after = viewBoxOf(container);
      expect(after.x).toBeCloseTo(zoomed.x, 5);
      expect(after.y).toBeCloseTo(zoomed.y, 5);
      expect(after.width).toBeCloseTo(zoomed.width, 5);
      expect(after.height).toBeCloseTo(zoomed.height, 5);
      expect(zoomValue(container)).toBe(zoomedDisplay);
    });

    it('stays at Fit of the NEW natural box when AntV rewrites it (content grew)', async () => {
      const { container } = mount(
        <PictureStage mode="antv">
          <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
      setup(container, { stageW: 1000, stageH: 500, pictureW: 1000, pictureH: 500 });
      expect(zoomValue(container)).toBe(100);

      await act(async () => {
        svg.setAttribute('viewBox', '0 0 2000 1000');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Fit of 2000x1000 into 1000x500 is 0.5, so the displayed view is the new
      // natural box drawn at 50%.
      const after = viewBoxOf(container);
      expect(after.x).toBeCloseTo(0, 5);
      expect(after.y).toBeCloseTo(0, 5);
      expect(after.width).toBeCloseTo(2000, 5);
      expect(after.height).toBeCloseTo(1000, 5);
      expect(zoomValue(container)).toBe(50);
    });

    it('resets to Fit when the design (resetKey) changes', () => {
      const { root, container } = mount(
        <PictureStage mode="antv" resetKey="a">
          <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
      setup(container, { stageW: 1000, stageH: 500, pictureW: 1000, pictureH: 500 });

      wheel(container.querySelector('[data-picture-stage]') as Element, {
        ctrlKey: true, deltaY: -100, clientX: 500, clientY: 250,
      });
      expect(zoomValue(container)).toBeGreaterThan(100);

      // A different design arrives with its own, larger fitted viewBox.
      act(() => {
        root.render(
          <PictureStage mode="antv" resetKey="b">
            <svg viewBox="0 0 2000 1000" xmlns="http://www.w3.org/2000/svg" />
          </PictureStage>,
        );
      });

      const after = viewBoxOf(container);
      expect(after.x).toBeCloseTo(0, 5);
      expect(after.y).toBeCloseTo(0, 5);
      expect(after.width).toBeCloseTo(2000, 5);
      expect(after.height).toBeCloseTo(1000, 5);
      expect(zoomValue(container)).toBe(50);
    });

    it('after a resetKey change, adopts AntV’s FINAL viewBox for the Fit display', async () => {
      const { root, container } = mount(
        <PictureStage mode="antv" resetKey="a">
          <svg viewBox="0 0 700.7 239.8" xmlns="http://www.w3.org/2000/svg" />
        </PictureStage>,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      svg.getBoundingClientRect = () => rect(0, 0, 492, 389);
      setup(container, { stageW: 492, stageH: 389, pictureW: 492, pictureH: 389 });
      // Fit of 700.7 x 239.8 in 492 x 389 -> min(0.702, 1.622) = 0.702 -> 70%.
      expect(zoomValue(container)).toBe(70);

      // Theme change: resetKey changes. The stage's own fitted box is still in
      // the DOM, and AntV's freshly re-rendered svg is transiently its thin
      // auto-height strip (the live regression: the display read that strip).
      act(() => {
        root.render(
          <PictureStage mode="antv" resetKey="b">
            <svg viewBox="0 0 700.7 239.8" xmlns="http://www.w3.org/2000/svg" />
          </PictureStage>,
        );
      });
      svg.getBoundingClientRect = () => rect(0, 0, 492, 104);

      await act(async () => {
        // AntV re-renders: first an intermediate box, then its final fitted box.
        svg.setAttribute('viewBox', '0 0 700.7 4000');
        await Promise.resolve();
        await Promise.resolve();
        svg.setAttribute('viewBox', '-26.3 -215.3 700.7 649.5');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Fit of the FINAL natural 700.7 x 649.5 in the 492 x 389 stage is
      // min(0.702, 0.599) = 0.599 -> 60%. Never the 104/649.5 = 16% the
      // transient svg strip would produce.
      const expected = Math.round(Math.max(0.25, Math.min(2, Math.min(492 / 700.7, 389 / 649.5))) * 100);
      expect(expected).toBe(60);
      expect(zoomValue(container)).toBe(expected);
    });

    it('does not loop when the stage writes the user view back', async () => {
      const RealMutationObserver = globalThis.MutationObserver;
      let callbacks = 0;
      class CountingMutationObserver extends RealMutationObserver {
        constructor(cb: MutationCallback) {
          super((records, observer) => {
            callbacks += 1;
            cb(records, observer);
          });
        }
      }
      (globalThis as unknown as { MutationObserver: typeof RealMutationObserver }).MutationObserver =
        CountingMutationObserver;
      try {
        const { container } = mount(
          <PictureStage mode="antv">
            <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" />
          </PictureStage>,
        );
        const svg = container.querySelector('svg') as SVGSVGElement;
        svg.getBoundingClientRect = () => rect(0, 0, 1000, 500);
        setup(container, { stageW: 1000, stageH: 500, pictureW: 1000, pictureH: 500 });
        wheel(container.querySelector('[data-picture-stage]') as Element, {
          ctrlKey: true, deltaY: -100, clientX: 500, clientY: 250,
        });

        const baseline = callbacks;
        await act(async () => {
          svg.setAttribute('viewBox', '0 0 1000 500');
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        });

        // One callback for AntV's rewrite, at most one more for the write-back.
        expect(callbacks - baseline).toBeLessThanOrEqual(4);
      } finally {
        (globalThis as unknown as { MutationObserver: typeof RealMutationObserver }).MutationObserver =
          RealMutationObserver;
      }
    });
  });
});
