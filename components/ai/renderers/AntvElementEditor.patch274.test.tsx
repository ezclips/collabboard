// @vitest-environment jsdom
//
// PATCH-274. A structural edit remaps every positional override key, so the
// element editor's history entries would replay stale keys. Changing the item id
// sequence clears that design's history.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import AntvElementEditor from './AntvElementEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof (window as any).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}

const FIXTURE = `
<svg viewBox="0 0 400 300">
  <g data-element-type="title"><text>Title</text></g>
</svg>`;

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
const editorRef: { current: HTMLDivElement | null } = { current: null };

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'A', id: 'aaa111' },
    { label: 'B', id: 'bbb222' },
  ],
};

interface Api {
  setOutline(next: VisualOutline): void;
}

function Host({ onChange, apiRef }: { onChange: (n: VisualOutline) => void; apiRef: { current: Api | null } }) {
  const [outline, setOutline] = React.useState(OUTLINE);
  apiRef.current = { setOutline: (next) => act(() => setOutline(next)) };
  return <AntvElementEditor containerRef={editorRef} template="design-a" outline={outline} onChange={onChange} />;
}

function pointer(target: EventTarget, type: string, x = 0, y = 0) {
  act(() => {
    target.dispatchEvent(
      new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }),
    );
  });
}
function titleEl(): Element {
  return container!.querySelector('[data-element-type="title"]') as Element;
}
function moveTitle(dx: number, dy: number) {
  pointer(titleEl(), 'pointerdown', 40, 30);
  pointer(window, 'pointerup', 40, 30);
  pointer(titleEl(), 'pointerdown', 40, 30);
  pointer(window, 'pointermove', 40 + dx, 30 + dy);
  pointer(window, 'pointerup', 40 + dx, 30 + dy);
}
function undo() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  container.innerHTML = FIXTURE;
  document.body.appendChild(container);
  (container as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 400, 300);
  const svg = container.querySelector('svg') as SVGSVGElement;
  (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  });
  const title = titleEl();
  (title as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(40, 30, 100, 50);
  (title as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  editorRef.current = container;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = null;
  reactHost?.remove();
  container?.remove();
  reactHost = null;
  container = null;
});

describe('PATCH-274 element editor history reset on a structural remap', () => {
  it('Ctrl+Z after a structural change does not replay a stale key', () => {
    reactHost = document.createElement('div');
    document.body.appendChild(reactHost);
    root = createRoot(reactHost);
    const onChange = vi.fn();
    const apiRef: { current: Api | null } = { current: null };
    act(() => { root!.render(<Host onChange={onChange} apiRef={apiRef} />); });

    moveTitle(30, 20);
    const moved = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(moved.elementOverridesByTemplate!['design-a'].items['title#0']).toEqual({ dx: 30, dy: 20 });

    // A structural edit changes the item id sequence (A removed); the remap has
    // rewritten the keys, so the old history entry is now stale.
    onChange.mockClear();
    apiRef.current!.setOutline({ ...OUTLINE, items: [{ label: 'B', id: 'bbb222' }] });

    undo();
    expect(onChange).not.toHaveBeenCalled();
  });
});
