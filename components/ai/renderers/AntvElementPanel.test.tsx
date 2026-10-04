// @vitest-environment jsdom
//
// PATCH-275. Each picture element opens its own docked side panel. These run the
// real editor through the renderer with a `PictureSidePanelContext` provider and
// a host column, and they absorb the assertions the old floating popover tests
// made (`data-ai-element-colour="true"` -> `data-ai-element-panel="true"`).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VISUAL_PALETTE } from '@/lib/ai/visualPalette';
import type { VisualOutline } from '@/lib/ai/outline';
import AntvElementEditor from './AntvElementEditor';
import { PictureSidePanelContext } from './PictureSidePanel';

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
  <g data-element-type="title"><text>Title</text></g>
  <g data-element-type="items-group">
    <rect data-element-type="shape" fill="#4f9d8f1a"/>
    <use data-element-type="item-icon" data-indexes="0" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="0"><div>One</div></foreignObject>
    <foreignObject data-element-type="item-value" data-indexes="0"><div>10</div></foreignObject>
    <rect data-element-type="shape" fill="#000000"/>
    <use data-element-type="item-icon" data-indexes="1" href="#i"/>
    <foreignObject data-element-type="item-label" data-indexes="1"><div>Two</div></foreignObject>
    <foreignObject data-element-type="item-value" data-indexes="1"><div>20</div></foreignObject>
  </g>
</svg>`;

const PALETTE: readonly string[] = VISUAL_PALETTE.map((entry) => entry.stroke);

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let editorRef: { current: HTMLDivElement | null } | null = null;

const BASE_OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }],
};

function PanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return (
    <div>
      <div data-test-panel-host="true" ref={setHost} />
      <PictureSidePanelContext.Provider value={{ host, elementPanelOpen: open, setElementPanelOpen: setOpen }}>
        {children}
      </PictureSidePanelContext.Provider>
    </div>
  );
}

function mountEditor(onChange: (next: VisualOutline) => void, outline: VisualOutline = BASE_OUTLINE) {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  act(() => {
    root!.render(
      <PanelProvider>
        <AntvElementEditor
          containerRef={editorRef!}
          template="list-grid-badge-card"
          outline={outline}
          onChange={onChange}
          palette={PALETTE}
        />
      </PanelProvider>,
    );
  });
}

/**
 * PATCH-275 Addendum 2. The real renderer passes `theme.palette.map(...)`, a new
 * array on every render; this host reproduces that (controlled outline so each
 * pick re-renders with a fresh palette array).
 */
function UnstablePaletteHost({ onChange }: { onChange: (next: VisualOutline) => void }) {
  const [outline, setOutline] = React.useState(BASE_OUTLINE);
  const [open, setOpen] = React.useState(false);
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  return (
    <div>
      <div data-test-panel-host="true" ref={setHost} />
      <PictureSidePanelContext.Provider value={{ host, elementPanelOpen: open, setElementPanelOpen: setOpen }}>
        <AntvElementEditor
          containerRef={editorRef!}
          template="list-grid-badge-card"
          outline={outline}
          onChange={(next) => {
            setOutline(next);
            onChange(next);
          }}
          palette={VISUAL_PALETTE.map((entry) => entry.stroke)}
        />
      </PictureSidePanelContext.Provider>
    </div>
  );
}

function mountUnstablePaletteEditor(onChange: (next: VisualOutline) => void) {
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  editorRef = { current: container };
  act(() => {
    root!.render(<UnstablePaletteHost onChange={onChange} />);
  });
}

function panel(): Element | null {
  return reactHost!.querySelector('[data-ai-element-panel]');
}

function overlay(): Element {
  return reactHost!.querySelector('[data-ai-element-overlay]')!;
}

function selectedAttr(): string | null {
  return overlay().getAttribute('data-ai-element-selected');
}

function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(
      new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }),
    );
  });
}
function click(target: EventTarget) {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}
function keydown(target: EventTarget, key: string, mod = false) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: mod, bubbles: true, cancelable: true }));
  });
}
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function labelEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-label"]')[index] as Element;
}
function iconEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="item-icon"]')[index] as Element;
}
function shapeEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="shape"]')[index] as Element;
}

function selectItem(index = 0) {
  const x = 200;
  const y = index === 0 ? 150 : 210;
  const div = labelEl(index).querySelector('div') as Element;
  pointer(div, 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  click(div);
}

function selectIcon(index = 0) {
  const x = 178;
  const y = index === 0 ? 148 : 208;
  pointer(iconEl(index), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  pointer(iconEl(index), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
}

function selectShape() {
  for (const extra of [1]) {
    (shapeEl(extra) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 });
  }
  pointer(shapeEl(), 'pointerdown', 100, 150, 1);
  pointer(window, 'pointerup', 100, 150, 1);
  click(shapeEl());
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
  (container.querySelector('[data-element-type="title"]') as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () =>
    rect(40, 30, 100, 50);
  (container.querySelector('[data-element-type="title"]') as unknown as { getBBox: () => unknown }).getBBox = () =>
    ({ x: 0, y: 0, width: 100, height: 50 });
  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {
    'item-label:0': { x: 190, y: 140, width: 60, height: 20 },
    'item-value:0': { x: 260, y: 140, width: 30, height: 20 },
    'item-icon:0': { x: 170, y: 140, width: 16, height: 16 },
    'item-label:1': { x: 190, y: 200, width: 60, height: 20 },
    'item-value:1': { x: 260, y: 200, width: 30, height: 20 },
    'item-icon:1': { x: 170, y: 200, width: 16, height: 16 },
    'shape:null': { x: 0, y: 100, width: 120, height: 60 },
  };
  container.querySelectorAll('[data-element-type]').forEach((el) => {
    const type = el.getAttribute('data-element-type') ?? '';
    const idx = el.getAttribute('data-indexes');
    const box = boxes[`${type}:${idx}`] ?? boxes[type];
    (el as unknown as { getBBox: () => unknown }).getBBox = () => box ?? { x: 0, y: 0, width: 1, height: 1 };
  });
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = null;
  reactHost?.remove();
  container?.remove();
  reactHost = null;
  container = null;
  vi.useRealTimers();
});

describe('PATCH-275 element panel', () => {
  it('selecting a card opens the panel in the host with text and shape sections, and the overlay keeps only box/handles/bar', () => {
    mountEditor(vi.fn());
    selectItem(0);
    expect(selectedAttr()).toBe('item@0');

    expect(panel()).not.toBeNull();
    expect(panel()!.getAttribute('data-picture-control')).toBe('true');
    expect(reactHost!.querySelector('[data-ai-element-panel-section="text"]')).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-panel-section="shape"]')).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-panel-section="icon"]')).not.toBeNull();

    // Nothing floats over the picture: no old popovers inside the overlay.
    expect(overlay().querySelector('[data-ai-element-panel]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-colour]')).toBeNull();
    expect(reactHost!.querySelector('[data-ai-icon-picker]')).toBeNull();
    expect(overlay().querySelector('[data-ai-element-box]')).not.toBeNull();
    expect(overlay().querySelector('[data-ai-element-bar]')).not.toBeNull();
  });

  it('the Original swatch is ringed on open and the hex field shows the base colour', () => {
    mountEditor(vi.fn());
    selectShape();

    const original = reactHost!.querySelector('[data-ai-element-swatch-original="true"]') as HTMLElement;
    expect(original.style.outline).toContain('2px');
    const hex = reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement;
    expect(hex.value).toBe('#4F9D8F');
  });

  it('picking palette 2, then 4, then 1 keeps the swatch order and the panel box identical, and the ring follows', () => {
    mountEditor(vi.fn());
    selectShape();

    const swatches = () =>
      Array.from(reactHost!.querySelectorAll('[data-ai-element-swatch="fill"]')).map((el) =>
        el.getAttribute('data-ai-element-swatch-value'),
      );
    const orderBefore = swatches().join('|');
    const boxBefore = JSON.stringify(panel()!.getBoundingClientRect());

    for (const index of [1, 3, 0]) {
      click(reactHost!.querySelectorAll('[data-ai-element-swatch="fill"]')[index] as Element);
      expect(swatches().join('|')).toBe(orderBefore);
      expect(JSON.stringify(panel()!.getBoundingClientRect())).toBe(boxBefore);
      const chosen = reactHost!.querySelectorAll('[data-ai-element-swatch="fill"]')[index] as HTMLElement;
      expect(chosen.style.outline).toContain('2px');
    }
  });

  it('the recent line stays empty until the selection changes, then lists the picks newest first with no palette duplicates', () => {
    mountEditor(vi.fn());
    selectItem(0);
    expect(reactHost!.querySelector('[data-ai-element-recent]')).toBeNull();

    for (const hex of ['#112233', '#445566', '#778899']) {
      setInputValue(reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement, hex);
    }
    // A palette colour must never become "recent".
    const paletteHex = PALETTE[0];
    setInputValue(reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement, paletteHex);
    expect(reactHost!.querySelector('[data-ai-element-recent]')).toBeNull();

    // Change the selection: the session ends and the picks merge.
    selectItem(1);
    const recent = reactHost!.querySelector('[data-ai-element-recent]') as HTMLElement;
    expect(recent).not.toBeNull();
    const values = Array.from(recent.querySelectorAll('[data-ai-element-swatch-value]')).map((el) =>
      el.getAttribute('data-ai-element-swatch-value'),
    );
    expect(values).toEqual(['#778899', '#445566', '#112233']);
    expect(values).not.toContain(paletteHex);
  });

  it('a Text colour picked on a whole-card selection shows on the Text row while Fill keeps its own', () => {
    mountEditor(vi.fn());
    selectItem(0);

    setInputValue(reactHost!.querySelector('[data-ai-element-hex="text"]') as HTMLInputElement, '#123456');
    const textHex = reactHost!.querySelector('[data-ai-element-hex="text"]') as HTMLInputElement;
    expect(textHex.value).toBe('#123456');
    // Fill still shows its own base, not the text colour.
    expect((reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement).value).toBe('#4F9D8F');
  });

  it('a mixed row shows Mixed with the grey picker', () => {
    (labelEl(0).querySelector('div') as HTMLElement).style.color = '#111111';
    (container!.querySelectorAll('[data-element-type="item-value"]')[0].querySelector('div') as HTMLElement).style.color = '#222222';
    mountEditor(vi.fn());
    selectItem(0);

    const hex = reactHost!.querySelector('[data-ai-element-hex="text"]') as HTMLInputElement;
    expect(hex.getAttribute('placeholder')).toBe('Mixed');
    expect(hex.value).toBe('');
    expect((reactHost!.querySelector('[data-ai-element-colour-input="text"]') as HTMLInputElement).value).toBe('#e5e7eb');
  });

  it('a new palette array each render does not end the colour session (Addendum 2)', () => {
    const onChange = vi.fn();
    mountUnstablePaletteEditor(onChange);
    selectItem(0);

    const hex = () => reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement;
    setInputValue(hex(), '#112233');
    setInputValue(hex(), '#445566');

    // Mid-session: the recent list must not have moved yet.
    expect(reactHost!.querySelector('[data-ai-element-recent]')).toBeNull();

    // One Ctrl+Z reverses the whole row change from before both picks.
    act(() => { hex().blur(); });
    keydown(window, 'z', true);
    const undone = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(undone.elementOverrides?.items['shape@0#0']?.fill).toBeUndefined();

    // Deselecting ends the session; the picks appear newest-first.
    keydown(document.body, 'Escape');
    selectItem(1);
    const recent = reactHost!.querySelector('[data-ai-element-recent]') as HTMLElement;
    expect(recent).not.toBeNull();
    const values = Array.from(recent.querySelectorAll('[data-ai-element-swatch-value]')).map((el) =>
      el.getAttribute('data-ai-element-swatch-value'),
    );
    expect(values).toEqual(['#445566', '#112233']);
  });

  it('typing in Label updates items[i].label after the debounce and one Ctrl+Z restores the whole word', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    mountEditor(onChange);
    selectItem(0);

    const input = reactHost!.querySelector('[data-ai-element-text-field="label"]') as HTMLInputElement;
    act(() => { input.focus(); });
    setInputValue(input, 'Hello');
    act(() => { vi.advanceTimersByTime(300); });

    const next = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(next.items[0].label).toBe('Hello');

    act(() => { input.blur(); });
    keydown(window, 'z', true);
    const undone = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(undone.items[0].label).toBe('A');
  });

  it('Size + updates textStyle.label.fontSize', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectItem(0);

    click(reactHost!.querySelector('[data-ai-element-font-size-inc="true"]') as Element);
    const next = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(next.items[0].textStyle?.label?.fontSize).toBe(19);
  });

  it('Escape in a field reverts it and keeps the selection; Escape outside deselects and closes the panel', () => {
    mountEditor(vi.fn());
    selectItem(0);
    const input = reactHost!.querySelector('[data-ai-element-text-field="label"]') as HTMLInputElement;
    act(() => { input.focus(); });
    setInputValue(input, 'Changed');
    keydown(input, 'Escape');
    expect(input.value).toBe('A');
    expect(selectedAttr()).toBe('item@0');
    expect(panel()).not.toBeNull();

    keydown(document.body, 'Escape');
    expect(selectedAttr()).toBe('');
    expect(panel()).toBeNull();
  });

  it('the icon grid swaps the icon', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectIcon(0);
    expect(selectedAttr()).toBe('item-icon@0');

    click(reactHost!.querySelector('[data-ai-icon-option][data-ai-icon-name="rocket"]') as Element);
    const next = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(next.items[0].icon).toBe('rocket');
  });

  it('Reset element and Delete work from the panel', () => {
    const onChange = vi.fn();
    mountEditor(onChange, { ...BASE_OUTLINE, elementOverrides: { template: 'list-grid-badge-card', items: { 'item-label@0': { dx: 5 } } } });
    selectItem(0);

    click(reactHost!.querySelector('[data-ai-element-reset="true"]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides?.items['item-label@0']).toBeUndefined();

    click(reactHost!.querySelector('[data-ai-element-delete="true"]') as Element);
    expect(onChange.mock.calls.at(-1)![0].elementOverrides?.items['item-label@0']?.hidden).toBe(true);
  });

  it('Reset colours removes fill/stroke/text from the element override (moved from the popover test)', () => {
    const onChange = vi.fn();
    mountEditor(onChange, { ...BASE_OUTLINE, elementOverrides: { template: 'list-grid-badge-card', items: { 'shape@0#0': { fill: '#111111', stroke: '#222222', text: '#333333' } } } });
    selectShape();
    click(reactHost!.querySelector('[data-ai-element-colour-reset="true"]') as Element);
    const override = onChange.mock.calls.at(-1)![0].elementOverrides?.items['shape@0#0'];
    expect(override?.fill).toBeUndefined();
    expect(override?.stroke).toBeUndefined();
    expect(override?.text).toBeUndefined();
  });

  it('a hex field #ABC commits the normalised #aabbcc (moved from the popover test)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    setInputValue(reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement, '#ABC');
    expect(onChange.mock.calls.at(-1)![0].elementOverrides.items['shape@0#0'].fill).toBe('#aabbcc');
  });

  it('an invalid hex shows a red outline and commits nothing (moved from the popover test)', () => {
    const onChange = vi.fn();
    mountEditor(onChange);
    selectShape();
    onChange.mockClear();
    const hex = reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement;
    setInputValue(hex, 'red');
    expect(onChange).not.toHaveBeenCalled();
    expect(hex.getAttribute('data-ai-element-hex-invalid')).toBe('true');
  });

  it('the panel close button closes it and keeps the selection; the bar Edit button reopens it', () => {
    mountEditor(vi.fn());
    selectItem(0);
    click(reactHost!.querySelector('[data-ai-side-panel-close="true"]') as Element);
    expect(panel()).toBeNull();
    expect(selectedAttr()).toBe('item@0');

    click(reactHost!.querySelector('[data-ai-element-colour-toggle]') as Element);
    expect(panel()).not.toBeNull();
  });
});

describe('PATCH-275 double-click gestures open the panel', () => {
  it('double-click on a shape opens the panel (moved from the popover test)', () => {
    mountEditor(vi.fn());
    for (const extra of [1]) {
      (shapeEl(extra) as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 1, height: 1 });
    }
    act(() => {
      shapeEl().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 }));
    });
    expect(panel()).not.toBeNull();
  });

  it('double-click on text does not open the panel and still reaches the svg (moved from the popover test)', () => {
    mountEditor(vi.fn());
    const dbl = vi.fn();
    container!.querySelector('svg')!.addEventListener('dblclick', dbl);
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 200, clientY: 150 });
    act(() => { (labelEl(0).querySelector('div') as Element).dispatchEvent(event); });
    expect(dbl).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(panel()).toBeNull();
  });

  it('PATCH-276: a drill-down into a text or icon part keeps the whole object panel', () => {
    mountEditor(vi.fn());
    selectIcon(0);
    expect(panel()).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-panel-section="icon"]')).not.toBeNull();
    // The same object panel as the whole-item selection: Text and Shape stay.
    expect(reactHost!.querySelector('[data-ai-element-panel-section="shape"]')).not.toBeNull();
    expect(reactHost!.querySelector('[data-ai-element-panel-section="text"]')).not.toBeNull();
  });
});

describe('PATCH-275 element panel colour controls vs PictureStage pan capture', () => {
  it('a pointerdown inside the panel is a picture control and does not deselect', () => {
    let captures = 0;
    const PAN_BLOCK_SELECTOR =
      '[data-ai-edit-ref],[data-ai-edit-add],[data-ai-edit-remove],[data-ai-edit-shape],input,[data-element-type],[data-picture-control]';
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
          <PanelProvider>
            <AntvElementEditor containerRef={editorRef!} template="list-grid-badge-card" outline={BASE_OUTLINE} onChange={vi.fn()} palette={PALETTE} />
          </PanelProvider>
        </div>,
      );
    });
    selectItem(0);
    expect(panel()).not.toBeNull();
    pointer(panel() as Element, 'pointerdown', 0, 0, 1);
    pointer(window, 'pointerup', 0, 0, 1);
    expect(captures).toBe(0);
    expect(selectedAttr()).toBe('item@0');
  });
});

// ── PATCH-275 Addendum 1. The colour row shows the truth on open ─────────────

describe('PATCH-275 Addendum 1 colour truth on open', () => {
  it('on open, Fill rings only Original and shows the Original hex', () => {
    mountEditor(vi.fn());
    selectShape();

    const original = reactHost!.querySelector('[data-ai-element-swatch-original="true"]') as HTMLElement;
    expect(original.style.outline).toContain('2px');

    const ringedPalette = Array.from(reactHost!.querySelectorAll('[data-ai-element-swatch="fill"]')).filter(
      (el) => (el as HTMLElement).style.outline.includes('2px'),
    );
    expect(ringedPalette).toHaveLength(0);

    expect((reactHost!.querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement).value).toBe('#4F9D8F');
    expect((reactHost!.querySelector('[data-ai-element-colour-input="fill"]') as HTMLInputElement).value).toBe('#4f9d8f');
  });

  it('a row with no colour shows None and the grey picker', () => {
    mountEditor(vi.fn());
    selectShape();

    const hex = reactHost!.querySelector('[data-ai-element-hex="border"]') as HTMLInputElement;
    expect(hex.value).toBe('');
    expect(hex.getAttribute('placeholder')).toBe('None');
    expect((reactHost!.querySelector('[data-ai-element-colour-input="border"]') as HTMLInputElement).value).toBe('#e5e7eb');
  });

  it('Text shows AntV own colour when there is no override', () => {
    (labelEl(0).querySelector('div') as HTMLElement).style.color = 'rgb(55, 65, 81)';
    mountEditor(vi.fn());
    selectItem(0);

    expect((reactHost!.querySelector('[data-ai-element-hex="text"]') as HTMLInputElement).value).toBe('#374151');
    expect((reactHost!.querySelector('[data-ai-element-colour-input="text"]') as HTMLInputElement).value).toBe('#374151');
  });

  it('a palette swatch rings only once an override is set and equals it', () => {
    mountEditor(vi.fn());
    selectShape();

    // No override yet: the #4F9D8F palette swatch must not be ringed.
    const paletteSwatch = () =>
      Array.from(reactHost!.querySelectorAll('[data-ai-element-swatch="fill"]')).find(
        (el) => el.getAttribute('data-ai-element-swatch-value')?.toLowerCase() === '#4f9d8f',
      ) as HTMLElement;
    expect(paletteSwatch().style.outline).not.toContain('2px');

    click(paletteSwatch());
    expect(paletteSwatch().style.outline).toContain('2px');
  });
});
