// @vitest-environment jsdom
//
// PATCH-289. The floating large preview for a drawing-library item: event
// delegation on the wrapper root, a 250 ms dwell, a CLONE of the thumbnail svg
// (never the original node), positioned left of the hovered unit and clamped to
// the viewport. It must never fire for touch, a drag, or a unit with no svg.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryHoverPreview from './LibraryHoverPreview';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SVG_NS = 'http://www.w3.org/2000/svg';

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
let root: HTMLDivElement;
let ref: React.RefObject<HTMLDivElement | null>;

function setup(): void {
  root = document.createElement('div');
  document.body.appendChild(root);
  ref = { current: root };
  const host = document.createElement('div');
  root.appendChild(host);
  const reactRoot = createRoot(host);
  act(() => {
    reactRoot.render(<LibraryHoverPreview rootRef={ref} />);
  });
  mounted.push({ root: reactRoot, container: host });
}

function makeUnit(withSvg = true): { unit: HTMLDivElement; svg: SVGSVGElement | null } {
  const unit = document.createElement('div');
  unit.className = 'library-unit__dragger';
  let svg: SVGSVGElement | null = null;
  if (withSvg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '50');
    svg.setAttribute('height', '50');
    svg.appendChild(document.createElementNS(SVG_NS, 'rect'));
    unit.appendChild(svg);
  }
  root.appendChild(unit);
  return { unit, svg };
}

function fire(type: string, target: EventTarget, props: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  act(() => {
    target.dispatchEvent(event);
  });
}

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    top: 0,
    left: 0,
    right: 40,
    bottom: 40,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

function box(): HTMLElement {
  return root.querySelector('[data-library-hover-preview]') as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 768 });
  setup();
});

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  mounted = [];
  root.remove();
  vi.useRealTimers();
});

describe('PATCH-289: LibraryHoverPreview', () => {
  it('shows a clone of the thumbnail svg after a 250 ms hover', () => {
    const { unit, svg } = makeUnit();
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const preview = box();
    expect(preview.style.display).toBe('block');
    const clone = preview.querySelector('svg') as SVGSVGElement;
    expect(clone).not.toBeNull();
    expect(clone).not.toBe(svg);
    expect(clone.getAttribute('width')).toBe('100%');
    expect(clone.hasAttribute('height')).toBe(false);
    expect(clone.style.height).toBe('auto');
    expect(clone.style.maxHeight).toBe('300px');
    expect(clone.style.display).toBe('block');
  });

  it('shows nothing when the pointer leaves before 250 ms', () => {
    const { unit } = makeUnit();
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fire('pointerout', unit, { pointerType: 'mouse', relatedTarget: null });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(box().style.display).toBe('none');
  });

  it('hides again when the pointer leaves after the preview appeared', () => {
    const { unit } = makeUnit();
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(box().style.display).toBe('block');
    fire('pointerout', unit, { pointerType: 'mouse', relatedTarget: null });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(box().style.display).toBe('none');
  });

  it('never fires for a touch pointer', () => {
    const { unit } = makeUnit();
    fire('pointerover', unit, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(box().style.display).toBe('none');
  });

  it('hides on dragstart so only Excalidraw draws a ghost', () => {
    const { unit } = makeUnit();
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fire('dragstart', unit);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(box().style.display).toBe('none');
  });

  it('does nothing for a dragger without an svg', () => {
    const { unit } = makeUnit(false);
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(box().style.display).toBe('none');
  });

  it('hides on Escape', () => {
    const { unit } = makeUnit();
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(box().style.display).toBe('none');
  });

  it('places the 360 px box left of the unit and centres it', () => {
    const { unit } = makeUnit();
    unit.getBoundingClientRect = () => rect({ left: 800, top: 100, right: 840, bottom: 140, width: 40, height: 40 });
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const preview = box();
    expect(preview.style.width).toBe('360px');
    expect(preview.style.left).toBe('432px');
    expect(preview.style.top).toBe('120px');
    expect(parseFloat(preview.style.left)).toBeLessThan(800);
  });

  it('clamps inside the viewport and drops below when there is no room left', () => {
    const { unit } = makeUnit();
    unit.getBoundingClientRect = () => rect({ left: 10, top: 740, right: 50, bottom: 780, width: 40, height: 40 });
    fire('pointerover', unit, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const preview = box();
    expect(parseFloat(preview.style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(preview.style.top)).toBeLessThanOrEqual(768 - 8);
    expect(parseFloat(preview.style.top)).toBeGreaterThanOrEqual(740);
  });
});

describe('PATCH-289: no file of this patch imports the Excalidraw fork', () => {
  it('keeps the fork out of the patch files', () => {
    const files = [
      'lib/ai/antv/chartValues/data.ts',
      'lib/ai/antv/chartValues/redraw.ts',
      'lib/ai/antv/chartValues/redrawChart.ts',
      'components/collabboard/editors/AntvChartValuesControl.tsx',
      'components/collabboard/editors/AntvChartValuesControl.styles.ts',
      'components/collabboard/editors/LibraryHoverPreview.tsx',
      'components/collabboard/editors/ExcalidrawWrapper.tsx',
    ];
    const offenders = files.filter((file) =>
      fs.readFileSync(path.join(process.cwd(), file), 'utf8').includes('excalidraw_fork'),
    );
    expect(offenders).toEqual([]);
  });
});
