// @vitest-environment jsdom
//
// PATCH-268. Example chart numbers used to become "real" the moment any local
// edit replaced the source outline, so a label-only rename enabled Save and the
// examples were persisted. These tests walk the real generator component through
// the live sequences: label-only edit, element-editor move, Add-panel addition,
// typing one then both values, and four real zeros on a pie versus a bar.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

// A fake AntV engine, like the PATCH-260 test: it paints a title element the
// element editor can drag, and remembers the options it was last given so the
// test can read exactly what the preview would draw.
const h = vi.hoisted(() => {
  const instances: any[] = [];
  class FakeInfographic {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    latest: any;
    constructor(public options: any) { instances.push(this); this.latest = options; }
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    emit(event: string, payload?: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
    render() { this.paint(); this.emit('rendered'); this.emit('loaded'); }
    update(options: any) { this.latest = options; this.paint(); }
    destroy() {}
    private paint() {
      const container = this.options.container as HTMLElement;
      const title = this.latest?.data?.title ?? this.options?.data?.title ?? '';
      container.innerHTML =
        '<svg viewBox="0 0 400 300">' +
        `<g data-element-type="title"><text>${title}</text></g>` +
        '</svg>';
    }
  }
  return { instances, mocks: { Infographic: FakeInfographic } };
});

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: ({ content }: { content?: unknown }) => React.createElement('div', {
    'data-testid': 'ai-content-stub',
    'data-ai-envelope': content === undefined ? undefined : JSON.stringify(content),
  }),
}));

// Replaces only the engine leaf; the real InfographicRenderer, element editor
// and the whole editor stay mounted.
vi.mock('@/lib/ai/antv/load', () => ({ loadAntv: async () => h.mocks }));

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

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
beforeEach(() => { h.instances.length = 0; });
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
function saveButton(c: ParentNode): HTMLButtonElement {
  return buttonContaining(c, 'Save to Canvas');
}
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}
function exampleBadge(c: ParentNode): HTMLElement | null {
  return c.querySelector('[data-ai-values-example="true"]') as HTMLElement | null;
}
/** The label/value pairs the current preview would draw. */
function previewItems(): Array<{ label: string; value?: number }> {
  const instance = h.instances.at(-1);
  return instance?.latest?.data?.items ?? instance?.options?.data?.items ?? [];
}
function previewContainer(c: HTMLElement): HTMLElement {
  return c.querySelector('[data-antv-container]') as HTMLElement;
}
/** The envelope a chart tile was given (the object `envelopeFor` builds). */
function pieTileOutline(c: ParentNode): any {
  const tile = tiles(c).find((t) => (t.getAttribute('data-ai-outline-option') ?? '').includes('chart-pie'));
  expect(tile, 'no pie tile').toBeTruthy();
  const stub = tile!.querySelector('[data-testid="ai-content-stub"]') as HTMLElement | null;
  expect(stub, 'pie tile has no envelope').not.toBeNull();
  return JSON.parse(stub!.getAttribute('data-ai-envelope')!).data.outline;
}
/** Any tile envelope that carries an infographic outline (the canonical source). */
function anyTileOutline(c: ParentNode): any {
  for (const tile of tiles(c)) {
    const stub = tile.querySelector('[data-testid="ai-content-stub"]') as HTMLElement | null;
    if (!stub) continue;
    const envelope = JSON.parse(stub.getAttribute('data-ai-envelope')!);
    if (envelope?.data?.outline) return envelope.data.outline;
  }
  expect.unreachable('no tile envelope carried an outline');
}

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}
function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }));
  });
}
/** One real drag on the preview's title, committed through the element editor. */
async function dragTitle(c: HTMLElement, dx: number, dy: number, id: number) {
  const container = previewContainer(c);
  container.getBoundingClientRect = () => rect(0, 0, 400, 300) as any;
  const svg = container.querySelector('svg') as SVGSVGElement;
  (svg as any).getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
  const title = container.querySelector('[data-element-type="title"]') as Element;
  (title as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  pointer(title, 'pointerdown', 40, 30, id);
  await act(async () => { await Promise.resolve(); });
  pointer(window, 'pointermove', 40 + dx, 30 + dy, id);
  pointer(window, 'pointerup', 40 + dx, 30 + dy, id);
  await flush();
}

const NO_NUMBERS_OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};
const FOUR_ITEMS_OUTLINE = {
  title: 'Budget',
  ordered: false,
  items: [{ label: 'Venue' }, { label: 'Food' }, { label: 'Travel' }, { label: 'Activities' }],
};

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function stubFetch(outline: unknown = NO_NUMBERS_OUTLINE) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const outlineCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline').length;

async function openGallery(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>, text = 'Water cycle') {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, text);
  click(buttonContaining(c, 'Generate'));
  await flush();
  expect(outlineCalls(fetchMock)).toBe(1);
}

describe('PATCH-268 examples never enter the source', () => {
  it('a label-only edit keeps the badge, disables Save, and leaves the source value-less', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    expect(exampleBadge(c)).not.toBeNull();

    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-outline-item-label="0"]') as HTMLInputElement, 'Changed');
    await flush();

    // Still example: the badge survives and Save is still gated.
    expect(exampleBadge(c)).not.toBeNull();
    expect(saveButton(c).disabled).toBe(true);
    // The preview still draws the example values.
    expect(previewItems().map((item) => item.value)).toEqual([50, 50]);

    // The canonical source carries no values: Show all exposes it via a tile.
    click(c.querySelector('[data-ai-designs-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-show-all="true"]') as HTMLElement);
    await flush();
    const source = anyTileOutline(c);
    expect(source.items.map((item: any) => item.value)).toEqual([undefined, undefined]);
    expect(source.items.map((item: any) => item.label)).toContain('Changed');
    expect(source.valuesExample).toBeUndefined();
  });

  it('an element-editor move while examples show keeps the override and the value-less source', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    expect(exampleBadge(c)).not.toBeNull();

    await dragTitle(c, 20, 15, 1);

    expect(exampleBadge(c)).not.toBeNull();
    expect(saveButton(c).disabled).toBe(true);
    // The committed move IS kept in the source/presentation.
    expect(previewContainer(c).getAttribute('data-ai-outline-overrides')).toBe('1');
    expect(previewContainer(c).querySelector('[data-element-type="title"]')!.getAttribute('transform') ?? '')
      .toContain('translate(20 15)');
  });

  it('an Add-panel addition while examples show keeps the addition and the value-less source', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    expect(exampleBadge(c)).not.toBeNull();

    click(c.querySelector('[data-ai-add-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-add-shape="circle"]') as HTMLElement);
    await flush();

    expect(exampleBadge(c)).not.toBeNull();
    expect(saveButton(c).disabled).toBe(true);
    // The addition survives in the example envelope, but the values are examples.
    click(c.querySelector('[data-ai-designs-toggle="true"]') as HTMLElement);
    await flush();
    const preview = pieTileOutline(c);
    expect(preview.elementOverrides?.additions?.length).toBe(1);
    expect(preview.items.map((item: any) => item.value)).toEqual([50, 50]);
  });
});

describe('PATCH-268 Save gate follows real values', () => {
  it('typing one value leaves the other example and Save disabled; both enables Save with no flags', async () => {
    const fetchMock = stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openGallery(c, fetchMock);
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);

    setInputValue(c.querySelector('[data-ai-outline-item-value="0"]') as HTMLInputElement, '40');
    await flush();
    expect(exampleBadge(c)).not.toBeNull();
    expect(saveButton(c).disabled).toBe(true);

    setInputValue(c.querySelector('[data-ai-outline-item-value="1"]') as HTMLInputElement, '60');
    await flush();
    expect(exampleBadge(c)).toBeNull();
    expect(saveButton(c).disabled).toBe(false);

    click(saveButton(c));
    const outline = onSave.mock.calls[0][0].aiComponentJson.data.outline;
    expect(outline.items.map((item: any) => item.value)).toEqual([40, 60]);
    expect(outline.items.some((item: any) => 'valueExample' in item)).toBe(false);
    expect(outline.valuesExample).toBeUndefined();
  });

  it('four real zeros disable Save on a pie with the zero note, but a bar stays saveable', async () => {
    const fetchMock = stubFetch(FOUR_ITEMS_OUTLINE);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock, 'Budget: Venue, Food, Travel, Activities');
    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();
    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);

    for (let i = 0; i < 4; i += 1) {
      setInputValue(c.querySelector(`[data-ai-outline-item-value="${i}"]`) as HTMLInputElement, '0');
    }
    await flush();

    expect(exampleBadge(c)).toBeNull();
    expect(saveButton(c).disabled).toBe(true);
    expect(saveButton(c).title).toContain('A pie needs at least one number above 0');
    expect(c.querySelector('[data-ai-chart-zero-note="true"]')).not.toBeNull();

    click(c.querySelector('[data-ai-subtype-chip="bar_chart"]') as HTMLElement);
    await flush();
    expect(saveButton(c).disabled).toBe(false);
    expect(c.querySelector('[data-ai-chart-zero-note="true"]')).toBeNull();
  });
});
