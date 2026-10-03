// @vitest-environment jsdom
//
// PATCH-262. Change an item's icon, and add shapes/icons/text to a picture.
// These tests model the real browser (pointer capture, Escape order) because
// jsdom passed while Chrome failed in PATCH-261/263/264/265.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAddition, type Addition } from '@/lib/ai/antv/additions';
import type { VisualOutline } from '@/lib/ai/outline';
import AntvAddPanel from './AntvAddPanel';
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
  <g data-element-type="background"><rect width="400" height="300"/></g>
  <g data-element-type="items-group">
    <rect data-element-type="shape"/>
    <use data-element-type="item-icon" data-indexes="0" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="0"><div>One</div></foreignObject>
  </g>
</svg>`;

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let editorRef: { current: HTMLDivElement | null } | null = null;

const BASE: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }, { label: 'B' }] };

const ICON_X = 178;
const ICON_Y = 148;

function prepareContainer(markup: string, boxes: Record<string, { x: number; y: number; width: number; height: number }>) {
  const el = document.createElement('div');
  el.innerHTML = markup;
  document.body.appendChild(el);
  (el as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 400, 300);
  const svg = el.querySelector('svg') as SVGSVGElement;
  (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  });
  el.querySelectorAll('[data-element-type]').forEach((node) => {
    const type = node.getAttribute('data-element-type') ?? '';
    const idx = node.getAttribute('data-indexes');
    const box = boxes[`${type}:${idx}`] ?? boxes[type];
    (node as unknown as { getBBox: () => unknown }).getBBox = () => box ?? { x: 0, y: 0, width: 1, height: 1 };
  });
  return el;
}

function mount(el: HTMLDivElement, onChange: (next: VisualOutline) => void, outline: VisualOutline = BASE, template = 'list-grid-badge-card') {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: el };
  act(() => {
    root!.render(
      <AntvElementEditor containerRef={editorRef!} template={template} outline={outline} onChange={onChange} />,
    );
  });
}

const FLAT_BOXES = {
  'item-icon:0': { x: 170, y: 140, width: 16, height: 16 },
  'item-label:0': { x: 190, y: 140, width: 60, height: 20 },
  'shape:null': { x: 0, y: 100, width: 120, height: 60 },
};

beforeEach(() => {
  container = prepareContainer(FIXTURE, FLAT_BOXES);
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = null;
  reactHost?.remove();
  container?.remove();
  reactHost = null;
  container = null;
});

function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }));
  });
}
function click(target: EventTarget) {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function dblclick(target: EventTarget, x = 0, y = 0) {
  act(() => { target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
}
function keydown(target: EventTarget, key: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}
function selectedAttr(): string | null {
  return reactHost!.querySelector('[data-ai-element-overlay]')!.getAttribute('data-ai-element-selected');
}
function iconEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-icon"]')[index] as Element;
}
function iconPicker(): Element | null {
  return reactHost!.querySelector('[data-ai-icon-picker]');
}
function lastOutline(onChange: ReturnType<typeof vi.fn>): VisualOutline {
  return onChange.mock.calls.at(-1)![0] as VisualOutline;
}

function selectIcon() {
  pointer(iconEl(), 'pointerdown', ICON_X, ICON_Y, 1);
  pointer(window, 'pointerup', ICON_X, ICON_Y, 1);
  pointer(iconEl(), 'pointerdown', ICON_X, ICON_Y, 1);
  pointer(window, 'pointerup', ICON_X, ICON_Y, 1);
}

describe('PATCH-262 AntvAddPanel', () => {
  let host: HTMLElement;
  let hostRoot: Root;
  afterEach(() => {
    if (hostRoot) act(() => hostRoot.unmount());
    host?.remove();
  });
  function mountPanel(props: Partial<React.ComponentProps<typeof AntvAddPanel>> = {}) {
    host = document.createElement('div');
    document.body.appendChild(host);
    hostRoot = createRoot(host);
    act(() => {
      hostRoot.render(
        <AntvAddPanel onAddShape={() => {}} onAddText={() => {}} onAddIcon={() => {}} {...props} />,
      );
    });
    return host;
  }

  it('offers the six shapes, text and the icon grid, each as a picture control', () => {
    const c = mountPanel();
    for (const kind of ['rect', 'rounded', 'circle', 'triangle', 'line', 'arrow']) {
      expect(c.querySelector(`[data-ai-add-shape="${kind}"]`)).not.toBeNull();
    }
    expect(c.querySelector('[data-ai-add-text="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-add-panel="true"]')!.getAttribute('data-picture-control')).toBe('true');
    expect(c.querySelectorAll('[data-ai-add-icon="true"]').length).toBeGreaterThan(20);
  });

  it('calls onAddShape / onAddText / onAddIcon', () => {
    const onAddShape = vi.fn();
    const onAddText = vi.fn();
    const onAddIcon = vi.fn();
    const c = mountPanel({ onAddShape, onAddText, onAddIcon });
    click(c.querySelector('[data-ai-add-shape="circle"]')!);
    expect(onAddShape).toHaveBeenCalledWith('circle');
    click(c.querySelector('[data-ai-add-text="true"]')!);
    expect(onAddText).toHaveBeenCalled();
    click(c.querySelector('[data-ai-add-icon="true"]')!);
    expect(onAddIcon).toHaveBeenCalledTimes(1);
  });

  it('filters the icon grid as you type', () => {
    const c = mountPanel();
    const search = c.querySelector('[data-ai-icon-search]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(search, 'rocket');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = Array.from(c.querySelectorAll('[data-ai-add-icon="true"]')).map((b) => b.getAttribute('data-ai-icon-name'));
    expect(names).toEqual(['rocket']);
  });
});

describe('PATCH-262 change icon', () => {
  it('replaces a flat item icon from the searchable picker', () => {
    const onChange = vi.fn();
    mount(container!, onChange);
    selectIcon();
    expect(selectedAttr()).toBe('item-icon@0');

    click(reactHost!.querySelector('[data-ai-element-icon-toggle]')!);
    expect(iconPicker()).not.toBeNull();

    const rocket = reactHost!.querySelector('[data-ai-icon-option][data-ai-icon-name="rocket"]') as Element;
    click(rocket);
    expect(lastOutline(onChange).items[0].icon).toBe('rocket');
    expect(iconPicker()).toBeNull();
  });

  it('respects the hierarchy root offset: icon indexes 0,1 change outline item 1', () => {
    container?.remove();
    container = prepareContainer(
      `<svg viewBox="0 0 400 300"><g data-element-type="items-group">
        <use data-element-type="item-icon" data-indexes="0,1" href="#i"/>
        <foreignObject data-element-type="item-label" data-indexes="0,1"><div>Child</div></foreignObject>
      </g></svg>`,
      { 'item-icon:0,1': { x: 170, y: 140, width: 16, height: 16 } },
    );
    const onChange = vi.fn();
    mount(container!, onChange, BASE, 'hierarchy-mindmap-lr-circular');
    selectIcon();
    expect(selectedAttr()).toBe('item-icon@0,1');

    click(reactHost!.querySelector('[data-ai-element-icon-toggle]')!);
    click(reactHost!.querySelector('[data-ai-icon-option][data-ai-icon-name="star"]')!);
    expect(lastOutline(onChange).items[1].icon).toBe('star');
    expect(lastOutline(onChange).items[0].icon).toBeUndefined();
  });

  it('filters the picker grid and highlights the current icon', () => {
    const outline: VisualOutline = { ...BASE, items: [{ label: 'A', icon: 'star' }, { label: 'B' }] };
    mount(container!, vi.fn(), outline);
    selectIcon();
    click(reactHost!.querySelector('[data-ai-element-icon-toggle]')!);

    const current = reactHost!.querySelector('[data-ai-icon-option][data-ai-icon-name="star"]') as HTMLElement;
    expect(current.getAttribute('aria-pressed')).toBe('true');

    const search = reactHost!.querySelector('[data-ai-icon-search]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(search, 'target');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = Array.from(reactHost!.querySelectorAll('[data-ai-icon-option]')).map((b) => b.getAttribute('data-ai-icon-name'));
    expect(names).toEqual(['target']);
  });

  it('Escape closes the picker first and keeps the selection', () => {
    mount(container!, vi.fn());
    selectIcon();
    click(reactHost!.querySelector('[data-ai-element-icon-toggle]')!);
    expect(iconPicker()).not.toBeNull();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(iconPicker()).toBeNull();
    expect(selectedAttr()).toBe('item-icon@0');
  });
});

// A stage that pan-captures unless the press landed on a control (PATCH-261).
const PAN_BLOCK_SELECTOR =
  '[data-ai-edit-ref],[data-ai-edit-add],[data-ai-edit-remove],[data-ai-edit-shape],input,[data-element-type],[data-picture-control]';

describe('PATCH-262 controls vs PictureStage pan capture', () => {
  it('a pointerdown on the icon picker search is not captured and does not deselect', () => {
    let captures = 0;
    reactHost = document.createElement('div');
    document.body.appendChild(reactHost);
    root = createRoot(reactHost);
    editorRef = { current: container };
    act(() => {
      root!.render(
        <div
          data-test-stage="true"
          onPointerDown={(event) => {
            const target = event.target as Element | null;
            if (target?.closest?.(PAN_BLOCK_SELECTOR)) return;
            captures += 1;
          }}
        >
          <AntvElementEditor containerRef={editorRef!} template="list-grid-badge-card" outline={BASE} onChange={vi.fn()} />
        </div>,
      );
    });
    selectIcon();
    click(reactHost.querySelector('[data-ai-element-icon-toggle]')!);
    const search = reactHost.querySelector('[data-ai-icon-search]') as Element;
    pointer(search, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    expect(captures).toBe(0);
    expect(selectedAttr()).toBe('item-icon@0');
  });
});

function addition(partial: Partial<Addition> & Pick<Addition, 'id' | 'kind'>): Addition {
  return { x: 40, y: 60, w: 120, h: 80, ...partial };
}

function withAdditions(additions: Addition[]): VisualOutline {
  return {
    ...BASE,
    elementOverrides: { template: 'list-grid-badge-card', items: {}, additions },
  };
}

function selectAddition(centreX = 100, centreY = 80) {
  pointer(container!, 'pointerdown', centreX, centreY, 1);
  pointer(window, 'pointerup', centreX, centreY, 1);
}

describe('PATCH-262 additions are editable like everything else', () => {
  it('draws an addition, selects it, and Undo removes a panel-added one', () => {
    const onChange = vi.fn();
    // Start with no addition, then the panel "adds" it via the outline prop.
    mount(container!, onChange, BASE);
    expect(container!.querySelector('[data-ai-additions]')).toBeNull();

    act(() => {
      root!.render(
        <AntvElementEditor
          containerRef={editorRef!}
          template="list-grid-badge-card"
          outline={withAdditions([addition({ id: 'circle1', kind: 'circle' })])}
          onChange={onChange}
        />,
      );
    });
    expect(container!.querySelector('[data-ai-additions]')).not.toBeNull();
    expect(selectedAttr()).toBe('ai-addition@circle1');

    click(reactHost!.querySelector('[data-ai-element-undo]')!);
    expect(onChange).toHaveBeenCalled();
    expect(lastOutline(onChange).elementOverrides?.additions ?? []).toHaveLength(0);
  });

  it('moves an addition by updating its x/y', () => {
    const onChange = vi.fn();
    mount(container!, onChange, withAdditions([addition({ id: 'circle1', kind: 'circle' })]));
    selectAddition();
    expect(selectedAttr()).toBe('ai-addition@circle1');

    pointer(container!, 'pointerdown', 100, 80, 1);
    pointer(window, 'pointermove', 130, 100, 1);
    pointer(window, 'pointerup', 130, 100, 1);

    const next = lastOutline(onChange).elementOverrides!.additions![0];
    expect(next.x).toBeCloseTo(70, 6);
    expect(next.y).toBeCloseTo(80, 6);
  });

  it('resizes an addition by updating its w/h', () => {
    const onChange = vi.fn();
    mount(container!, onChange, withAdditions([addition({ id: 'circle1', kind: 'circle' })]));
    selectAddition();
    const handle = reactHost!.querySelector('[data-ai-element-handle="se"]') as Element;
    pointer(handle, 'pointerdown', 160, 140, 7);
    pointer(window, 'pointermove', 200, 180, 7);
    pointer(window, 'pointerup', 200, 180, 7);

    const next = lastOutline(onChange).elementOverrides!.additions![0];
    expect(next.w).toBeGreaterThan(120);
    expect(next.h).toBeGreaterThan(80);
  });

  it('recolours an addition through the colour menu', () => {
    const onChange = vi.fn();
    mount(container!, onChange, withAdditions([addition({ id: 'circle1', kind: 'circle' })]));
    selectAddition();
    click(reactHost!.querySelector('[data-ai-element-colour-toggle]')!);
    const swatch = reactHost!.querySelector('[data-ai-element-swatch="fill"]') as Element;
    const value = swatch.getAttribute('data-ai-element-swatch-value');
    click(swatch);
    expect(lastOutline(onChange).elementOverrides!.additions![0].fill).toBe(value);
  });

  it('deletes an addition and Undo restores it', () => {
    const onChange = vi.fn();
    mount(container!, onChange, withAdditions([addition({ id: 'circle1', kind: 'circle' })]));
    selectAddition();
    click(reactHost!.querySelector('[data-ai-element-delete]')!);
    expect(lastOutline(onChange).elementOverrides?.additions ?? []).toHaveLength(0);

    click(reactHost!.querySelector('[data-ai-element-undo]')!);
    expect(lastOutline(onChange).elementOverrides!.additions![0].id).toBe('circle1');
  });

  it('double-click on an added text edits it inline; Enter commits', () => {
    const onChange = vi.fn();
    mount(container!, onChange, withAdditions([addition({ id: 'text01', kind: 'text', label: 'Old', x: 40, y: 60, w: 200, h: 40 })]));
    selectAddition(140, 80);
    dblclick(container!.querySelector('[data-ai-addition="text01"]')!, 140, 80);

    const input = reactHost!.querySelector('[data-ai-addition-text-input]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('data-picture-control')).toBe('true');

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, 'Hello'); });
    keydown(input, 'Enter');
    expect(lastOutline(onChange).elementOverrides!.additions![0].label).toBe('Hello');
  });

  it('Escape in the added-text input cancels without deselecting (lesson 7)', () => {
    mount(container!, vi.fn(), withAdditions([addition({ id: 'text01', kind: 'text', label: 'Old', x: 40, y: 60, w: 200, h: 40 })]));
    selectAddition(140, 80);
    dblclick(container!.querySelector('[data-ai-addition="text01"]')!, 140, 80);
    const input = reactHost!.querySelector('[data-ai-addition-text-input]') as HTMLInputElement;

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { input.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(reactHost!.querySelector('[data-ai-addition-text-input]')).toBeNull();
    expect(selectedAttr()).toBe('ai-addition@text01');
  });

  it('createAddition centres on the view centre for the Add panel', () => {
    const circle = createAddition('circle', { x: 240, y: 160 }, { id: 'abc123' });
    expect(circle.x).toBe(180);
    expect(circle.y).toBe(120);
  });
});
