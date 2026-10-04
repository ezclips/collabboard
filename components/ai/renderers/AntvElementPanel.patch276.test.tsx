// @vitest-environment jsdom
//
// PATCH-276. One object, one panel. The first click selects the whole item and
// the second drills into a part; the panel stays the SAME element with the same
// title and sections, and only highlights the drilled part's section. Colour
// rows always read and write the object's parts, so an icon row reads the
// `<use>` fill and the new Icon background row edits the badge shape.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { applyElementOverrides } from '@/lib/ai/antv/elementOverrides';
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

const LIST_TEMPLATE = 'list-grid-badge-card';
const MINDMAP_TEMPLATE = 'hierarchy-mindmap-branch-gradient-capsule-item';

/** A real list shape: each item is its own wrapper group, icon on a badge. */
const LIST_FIXTURE = `
<svg viewBox="0 0 400 320">
  <g data-element-type="background"><rect width="400" height="320"/></g>
  <g data-element-type="title"><text>Title</text></g>
  <g data-element-type="items-group">
    <g>
      <rect data-element-type="shape" fill="#4f9d8f1a"/>
      <g data-element-type="item-icon-group">
        <ellipse data-element-type="shape" fill="#ffffff"/>
        <use data-element-type="item-icon" data-indexes="0" href="#i" fill="#4f9d8f"/>
      </g>
      <foreignObject data-element-type="item-label" data-indexes="0"><div>One</div></foreignObject>
    </g>
    <g>
      <rect data-element-type="shape" fill="#000000"/>
      <foreignObject data-element-type="item-label" data-indexes="1"><div>Two</div></foreignObject>
    </g>
  </g>
</svg>`;

/** A mind-map node: hierarchy paths `0,i` on every part. */
const MINDMAP_FIXTURE = `
<svg viewBox="0 0 400 320">
  <g data-element-type="title"><text>Root</text></g>
  <g data-element-type="items-group">
    <g>
      <rect data-element-type="shape" fill="#4f9d8f"/>
      <g data-element-type="item-icon-group">
        <ellipse data-element-type="shape" fill="#ffffff"/>
        <use data-element-type="item-icon" data-indexes="0,0" href="#i" fill="#4f9d8f"/>
      </g>
      <foreignObject data-element-type="item-label" data-indexes="0,0"><div>watson.ch</div></foreignObject>
    </g>
    <g>
      <rect data-element-type="shape" fill="#000000"/>
      <foreignObject data-element-type="item-label" data-indexes="0,1"><div>Other</div></foreignObject>
    </g>
  </g>
</svg>`;

/** An item with BOTH a label and a description (two style blocks). */
const DETAILS_FIXTURE = `
<svg viewBox="0 0 400 320">
  <g data-element-type="title"><text>Title</text></g>
  <g data-element-type="items-group">
    <g>
      <rect data-element-type="shape" fill="#4f9d8f1a"/>
      <g data-element-type="item-icon-group">
        <ellipse data-element-type="shape" fill="#ffffff"/>
        <use data-element-type="item-icon" data-indexes="0" href="#i" fill="#4f9d8f"/>
      </g>
      <foreignObject data-element-type="item-label" data-indexes="0"><div>One</div></foreignObject>
      <foreignObject data-element-type="item-desc" data-indexes="0"><div>A description</div></foreignObject>
    </g>
    <g>
      <rect data-element-type="shape" fill="#000000"/>
      <foreignObject data-element-type="item-label" data-indexes="1"><div>Two</div></foreignObject>
    </g>
  </g>
</svg>`;

type Fixture = 'list' | 'mindmap' | 'details';

const FIXTURES: Record<Fixture, string> = {
  list: LIST_FIXTURE,
  mindmap: MINDMAP_FIXTURE,
  details: DETAILS_FIXTURE,
};

const TEMPLATES: Record<Fixture, string> = {
  list: LIST_TEMPLATE,
  mindmap: MINDMAP_TEMPLATE,
  details: LIST_TEMPLATE,
};

const BOXES: Record<Fixture, Array<[string, string, { x: number; y: number; width: number; height: number }]>> = {
  list: [
    ['shape', '0', { x: 100, y: 100, width: 120, height: 60 }],
    ['shape', '0#badge', { x: 108, y: 113, width: 24, height: 24 }],
    ['item-icon', '0', { x: 110, y: 115, width: 20, height: 20 }],
    ['item-label', '0', { x: 150, y: 120, width: 60, height: 20 }],
    ['shape', '1', { x: 100, y: 200, width: 120, height: 60 }],
    ['item-label', '1', { x: 150, y: 220, width: 60, height: 20 }],
  ],
  mindmap: [
    ['shape', '0,0', { x: 100, y: 100, width: 120, height: 60 }],
    ['shape', '0,0#badge', { x: 108, y: 113, width: 24, height: 24 }],
    ['item-icon', '0,0', { x: 110, y: 115, width: 20, height: 20 }],
    ['item-label', '0,0', { x: 150, y: 120, width: 60, height: 20 }],
    ['shape', '0,1', { x: 100, y: 200, width: 120, height: 60 }],
    ['item-label', '0,1', { x: 150, y: 220, width: 60, height: 20 }],
  ],
  details: [
    ['shape', '0', { x: 100, y: 100, width: 120, height: 80 }],
    ['shape', '0#badge', { x: 108, y: 113, width: 24, height: 24 }],
    ['item-icon', '0', { x: 110, y: 115, width: 20, height: 20 }],
    ['item-label', '0', { x: 150, y: 120, width: 60, height: 20 }],
    ['item-desc', '0', { x: 150, y: 150, width: 100, height: 20 }],
    ['shape', '1', { x: 100, y: 220, width: 120, height: 60 }],
    ['item-label', '1', { x: 150, y: 240, width: 60, height: 20 }],
  ],
};

const LIST_OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'One' }, { label: 'Two' }],
};

const MINDMAP_OUTLINE: VisualOutline = {
  title: 'Root',
  ordered: false,
  kind: 'list',
  items: [{ label: 'watson.ch' }, { label: 'Other' }],
};

const DETAILS_OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'One', detail: 'A description' }, { label: 'Two' }],
};

const OUTLINES: Record<Fixture, VisualOutline> = {
  list: LIST_OUTLINE,
  mindmap: MINDMAP_OUTLINE,
  details: DETAILS_OUTLINE,
};

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

let root: Root | null = null;
let reactHost: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let fixtureName: Fixture = 'list';
const editorRef: { current: HTMLDivElement | null } = { current: null };

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

function mountEditor(name: Fixture, onChange: (next: VisualOutline) => void) {
  fixtureName = name;
  container = document.createElement('div');
  container.innerHTML = FIXTURES[name];
  document.body.appendChild(container);
  (container as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect(0, 0, 400, 320);
  const svg = container.querySelector('svg') as SVGSVGElement;
  (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  });
  (container.querySelector('[data-element-type="title"]') as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () =>
    rect(40, 30, 100, 50);
  (container.querySelector('[data-element-type="title"]') as unknown as { getBBox: () => unknown }).getBBox = () =>
    ({ x: 0, y: 0, width: 100, height: 50 });

  const fixtures = BOXES[name];
  const counters: Record<string, number> = {};
  for (const el of Array.from(container.querySelectorAll('[data-element-type]'))) {
    const type = el.getAttribute('data-element-type') ?? '';
    const indexes = el.getAttribute('data-indexes') ?? '';
    let match: { x: number; y: number; width: number; height: number } | undefined;
    if (type === 'shape' && el.parentElement?.getAttribute('data-element-type') === 'item-icon-group') {
      match = fixtures.find(([t, i]) => t === 'shape' && i.endsWith('#badge'))?.[2];
    } else if (type === 'shape') {
      const nth = counters.shape ?? 0;
      counters.shape = nth + 1;
      match = fixtures.filter(([, i]) => !i.endsWith('#badge'))[nth]?.[2];
    } else if (type === 'item-icon') {
      match = fixtures.find(([t, i]) => t === type && i === indexes)?.[2];
    } else if (type.startsWith('item-')) {
      match = fixtures.find(([t, i]) => t === type && i === indexes)?.[2];
    }
    (el as unknown as { getBBox: () => unknown }).getBBox = () =>
      match ?? { x: 0, y: 0, width: 1, height: 1 };
  }

  editorRef.current = container;
  reactHost = document.createElement('div');
  document.body.appendChild(reactHost);
  root = createRoot(reactHost);
  act(() => {
    root!.render(
      <PanelProvider>
        <AntvElementEditor
          containerRef={editorRef}
          template={TEMPLATES[name]}
          outline={OUTLINES[name]}
          onChange={onChange}
        />
      </PanelProvider>,
    );
  });
}

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = null;
  reactHost?.remove();
  container?.remove();
  reactHost = null;
  container = null;
  vi.restoreAllMocks();
});

function panel(): Element | null {
  return reactHost!.querySelector('[data-ai-element-panel]');
}
function panelHost(): HTMLElement {
  return reactHost!.querySelector('[data-test-panel-host]') as HTMLElement;
}
function panelTitleText(): string {
  return panelHost().textContent ?? '';
}
function activeSection(): string | null {
  return panelHost().querySelector('[data-ai-element-panel-section-active="true"]')?.getAttribute('data-ai-element-panel-section') ?? null;
}
function sectionNames(): string[] {
  return Array.from(panelHost().querySelectorAll('[data-ai-element-panel-section]')).map((el) =>
    el.getAttribute('data-ai-element-panel-section')!,
  );
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
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function labelDiv(index = 0): Element {
  return (container!.querySelectorAll('[data-element-type="item-label"]')[index] as Element).querySelector('div') as Element;
}
function shapeEl(index = 0): Element {
  return container!.querySelectorAll('[data-element-type="shape"]')[index] as Element;
}
function iconEl(): Element {
  return container!.querySelector('[data-element-type="item-icon"]') as Element;
}
function badgeEl(): Element {
  const group = container!.querySelector('[data-element-type="item-icon-group"]') as Element;
  return group.firstElementChild as Element;
}

/** First click: the whole object. */
function selectItem(x = 180, y = 130) {
  pointer(labelDiv(0), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  click(labelDiv(0));
}

/** Second click: drill into the card's shape. */
function drillShape(x = 140, y = 150) {
  const shape = shapeEl(0);
  pointer(shape, 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  click(shape);
}

/** Second click: drill into the card's label. */
function drillLabel(x = 180, y = 130) {
  pointer(labelDiv(0), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  click(labelDiv(0));
}

function selectIcon(x = 120, y = 125) {
  selectItem();
  pointer(iconEl(), 'pointerdown', x, y, 1);
  pointer(window, 'pointerup', x, y, 1);
  click(iconEl());
}

function latestOutline(onChange: ReturnType<typeof vi.fn>): VisualOutline {
  return onChange.mock.calls.at(-1)![0] as VisualOutline;
}

describe('PATCH-276 one panel per object (list fixture)', () => {
  it('first click: Card 1 · One with Text, Shape and Icon, nothing active', () => {
    mountEditor('list', vi.fn());
    selectItem();
    expect(panel()).not.toBeNull();
    expect(panelTitleText()).toContain('Card 1 · One');
    expect(sectionNames()).toEqual(['text', 'shape', 'icon', 'footer']);
    expect(activeSection()).toBeNull();
  });

  it('second click on the shape: the SAME panel element, same title, same sections, Shape active', () => {
    mountEditor('list', vi.fn());
    selectItem();
    const first = panel();
    const sectionsBefore = sectionNames();

    drillShape();
    expect(panel()).toBe(first);
    expect(panelTitleText()).toContain('Card 1 · One');
    expect(sectionNames()).toEqual(sectionsBefore);
    expect(activeSection()).toBe('shape');
  });

  it('second click on the label: Text active, panel unchanged', () => {
    mountEditor('list', vi.fn());
    selectItem();
    const first = panel();

    drillLabel();
    expect(panel()).toBe(first);
    expect(panelTitleText()).toContain('Card 1 · One');
    expect(activeSection()).toBe('text');
  });

  it('a Fill pick after the drill-down writes the object shape, exactly as the first click', () => {
    const onChange = vi.fn();
    mountEditor('list', onChange);
    selectItem();
    drillShape();

    setInputValue(panelHost().querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement, '#123456');
    expect(latestOutline(onChange).elementOverrides?.items['shape@0#0']).toEqual({ fill: '#123456' });
  });

  it('the Icon colour row reads and writes the inner item-icon (the use), not the group', () => {
    const onChange = vi.fn();
    mountEditor('list', onChange);
    selectItem();

    // The live bug: the row read the group's badge and showed "None".
    expect((panelHost().querySelector('[data-ai-element-hex="icon"]') as HTMLInputElement).value).toBe('#4F9D8F');

    setInputValue(panelHost().querySelector('[data-ai-element-hex="icon"]') as HTMLInputElement, '#224466');
    const overrides = latestOutline(onChange).elementOverrides;
    expect(overrides?.items['item-icon@0']).toEqual({ fill: '#224466' });
    applyElementOverrides(container!, overrides, LIST_TEMPLATE);
    expect(iconEl().getAttribute('fill')).toBe('#224466');
  });

  it('the Icon background row reads the badge fill and changes it on the badge key', () => {
    const onChange = vi.fn();
    mountEditor('list', onChange);
    selectItem();

    const badgeHex = panelHost().querySelector('[data-ai-element-hex="badge"]') as HTMLInputElement;
    expect(badgeHex).not.toBeNull();
    expect(badgeHex.value).toBe('#FFFFFF');

    setInputValue(badgeHex, '#654321');
    const overrides = latestOutline(onChange).elementOverrides;
    expect(overrides?.items['item-icon-group@0#0#badge']).toEqual({ fill: '#654321' });
    applyElementOverrides(container!, overrides, LIST_TEMPLATE);
    expect(badgeEl().getAttribute('fill')).toBe('#654321');
  });

  it('footer Delete card hides the whole object even when a part is drilled', () => {
    const onChange = vi.fn();
    mountEditor('list', onChange);
    selectItem();
    drillShape();

    click(panelHost().querySelector('[data-ai-element-delete="true"]') as Element);
    const items = latestOutline(onChange).elementOverrides?.items ?? {};
    expect(items['shape@0#0']?.hidden).toBe(true);
    expect(items['item-icon-group@0#0']?.hidden).toBe(true);
    expect(items['item-label@0']?.hidden).toBe(true);
    expect(items['shape@1#0']).toBeUndefined();
  });

  it('names the footer for a card', () => {
    mountEditor('list', vi.fn());
    selectItem();
    const footer = panelHost().querySelector('[data-ai-element-panel-section="footer"]')!;
    expect(footer.textContent).toContain('Reset card');
    expect(footer.textContent).toContain('Delete card');
  });
});

describe('PATCH-276 one panel per object (mind-map fixture)', () => {
  it('first click: Node · watson.ch with the whole node sections', () => {
    mountEditor('mindmap', vi.fn());
    selectItem();
    expect(panel()).not.toBeNull();
    expect(panelTitleText()).toContain('Node · watson.ch');
    expect(sectionNames()).toEqual(['text', 'shape', 'icon', 'footer']);
    expect(panelHost().querySelector('[data-ai-element-panel-section="footer"]')!.textContent).toContain('Delete node');
  });

  it('second click on the shape: same panel, same title, Shape active; a Fill pick hits the node shape', () => {
    const onChange = vi.fn();
    mountEditor('mindmap', onChange);
    selectItem();
    const first = panel();

    drillShape();
    expect(panel()).toBe(first);
    expect(panelTitleText()).toContain('Node · watson.ch');
    expect(activeSection()).toBe('shape');

    setInputValue(panelHost().querySelector('[data-ai-element-hex="fill"]') as HTMLInputElement, '#abcdef');
    expect(latestOutline(onChange).elementOverrides?.items['shape@0,0#0']).toEqual({ fill: '#abcdef' });
  });

  it('Icon background on a node writes the group badge key', () => {
    const onChange = vi.fn();
    mountEditor('mindmap', onChange);
    selectItem();
    setInputValue(panelHost().querySelector('[data-ai-element-hex="badge"]') as HTMLInputElement, '#101010');
    expect(latestOutline(onChange).elementOverrides?.items['item-icon-group@0,0#0#badge']).toEqual({ fill: '#101010' });
  });

  it('footer Delete node hides the whole node even when a part is drilled', () => {
    const onChange = vi.fn();
    mountEditor('mindmap', onChange);
    selectItem();
    drillShape();
    click(panelHost().querySelector('[data-ai-element-delete="true"]') as Element);
    const items = latestOutline(onChange).elementOverrides?.items ?? {};
    expect(items['shape@0,0#0']?.hidden).toBe(true);
    expect(items['item-icon-group@0,0#0']?.hidden).toBe(true);
    expect(items['item-label@0,0']?.hidden).toBe(true);
    expect(items['shape@0,1#0']).toBeUndefined();
  });
});

describe('PATCH-276 Addendum 1 label + description style blocks', () => {
  it('renders two labelled blocks without a duplicate-key warning; Description Size changes detail only', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    mountEditor('details', onChange);
    selectItem();

    // No React "Encountered two children with the same key" warning.
    const duplicateKey = errorSpy.mock.calls.find((call) =>
      String(call[0] ?? '').includes('same key'),
    );
    expect(duplicateKey).toBeUndefined();

    const text = panelHost().querySelector('[data-ai-element-panel-section="text"]')!;
    expect(text.textContent).toContain('Label style');
    expect(text.textContent).toContain('Description style');

    // The two Size inputs belong to Label then Description, in field order.
    const sizeInputs = Array.from(
      panelHost().querySelectorAll('[data-ai-element-font-size]'),
    ) as HTMLInputElement[];
    expect(sizeInputs).toHaveLength(2);
    setInputValue(sizeInputs[1], '30');

    const items = latestOutline(onChange).items;
    expect(items[0].textStyle?.detail?.fontSize).toBe(30);
    expect(items[0].textStyle?.label).toBeUndefined();
  });
});