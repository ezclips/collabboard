// @vitest-environment jsdom
//
// PATCH-260. The element editor commits an outline that carries
// `elementOverrides`; the AIComponentEditor round trip must carry it all the way
// back into the preview and into the Save payload, and a second commit must
// build on the first. This is the integration guard for the live defect where
// the prop outline came back with a foreign/stale override map.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

const h = vi.hoisted(() => {
  const instances: any[] = [];
  class FakeInfographic {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    constructor(public options: Record<string, unknown>) { instances.push(this); }
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    emit(event: string, payload?: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
    render() { this.paint(); }
    update() { this.paint(); }
    destroy() {}
    private paint() {
      const container = this.options.container as HTMLElement;
      container.innerHTML =
        '<svg viewBox="0 0 400 300">' +
        '<g data-element-type="title"><text>Seasons</text></g>' +
        '</svg>';
    }
  }
  return { instances, mocks: { Infographic: FakeInfographic } };
});

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

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
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 30)); });
}
function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}
function pointer(target: EventTarget, type: string, x = 0, y = 0, id = 1) {
  act(() => {
    target.dispatchEvent(new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }));
  });
}

const OUTLINE = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

const STORED = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'antv:list-grid-badge-card',
    outline: OUTLINE,
  },
  meta: { renderer: 'infographic', subtype: 'infographic', prompt: 'p' },
};

function previewContainer(c: HTMLElement): HTMLElement {
  return c.querySelector('[data-antv-container]') as HTMLElement;
}

/** Patch the geometry jsdom lacks, on the painted preview SVG. */
function patchGeometry(container: HTMLElement) {
  container.getBoundingClientRect = () => rect(0, 0, 400, 300) as any;
  const svg = container.querySelector('svg') as SVGSVGElement;
  (svg as any).getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) });
  const title = container.querySelector('[data-element-type="title"]') as Element;
  (title as any).getBBox = () => ({ x: 0, y: 0, width: 100, height: 50 });
  return { svg, title };
}

/** One real drag on the preview's title, committed through the editor. */
async function dragTitle(c: HTMLElement, dx: number, dy: number, id: number) {
  const { title } = patchGeometry(previewContainer(c));
  pointer(title, 'pointerdown', 40, 30, id);
  await act(async () => { await Promise.resolve(); });
  pointer(window, 'pointermove', 40 + dx, 30 + dy, id);
  pointer(window, 'pointerup', 40 + dx, 30 + dy, id);
  await flush();
}

describe('PATCH-260 AIComponentEditor keeps elementOverrides across the round trip', () => {
  it('re-renders the preview with the committed override and saves it, then builds on it', async () => {
    const onSave = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />,
    );
    await flush();

    // The real element editor is mounted over the preview.
    expect(c.querySelector('[data-ai-element-overlay]')).not.toBeNull();

    // (a) First committed move: {dx:20, dy:15} on the title.
    await dragTitle(c, 20, 15, 1);
    const titleTransform = previewContainer(c).querySelector('[data-element-type="title"]')!.getAttribute('transform') ?? '';
    expect(titleTransform).toContain('translate(20 15)');
    // The debug attributes prove the drag actually emitted upward.
    const container = previewContainer(c);
    expect(container.getAttribute('data-ai-last-emit')).toBe('element-editor');
    expect(container.getAttribute('data-ai-outline-overrides')).toBe('1');

    // (b) Save carries the same map.
    click(buttonContaining(c, 'Save to Canvas'));
    const saved = onSave.mock.calls.at(-1)![0];
    expect(saved.aiComponentJson.data.outline.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 20, dy: 15 } },
    });

    // (c) A second move builds on the first: {dx:60, dy:45}, not {dx:40, dy:30}.
    await dragTitle(c, 40, 30, 2);
    click(buttonContaining(c, 'Save to Canvas'));
    const savedTwo = onSave.mock.calls.at(-1)![0];
    expect(savedTwo.aiComponentJson.data.outline.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 60, dy: 45 } },
    });
  });

  it('survives a re-render that rebuilds the suggestions from a stale outline (design pick then save)', async () => {
    const onSave = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />,
    );
    await flush();

    // Commit a move, then pick ANOTHER design and save: the saved envelope must
    // carry the current outline (with the override), not the suggestion's own
    // stale `outline` copy built before the move.
    await dragTitle(c, 20, 15, 1);
    // PATCH-275. Selecting an element hides the Designs panel behind the
    // element's own panel; reopen Designs before picking another design.
    if (!c.querySelector('[data-ai-outline-option]')) {
      click(c.querySelector('[data-ai-designs-toggle]') as Element);
    }
    const other = Array.from(
      c.querySelectorAll('[data-ai-outline-option]'),
    ).find((el) => (el.getAttribute('data-ai-outline-option') ?? '').startsWith('antv:') && el.getAttribute('aria-pressed') !== 'true') as HTMLElement;
    expect(other).not.toBeNull();
    click(other);
    click(buttonContaining(c, 'Save to Canvas'));

    const saved = onSave.mock.calls.at(-1)![0];
    expect(saved.aiComponentJson.data.outline.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 20, dy: 15 } },
    });
  });

  it('keeps overrides when AntV emits an options:change right after a commit (stale-props race)', async () => {
    const onSave = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />,
    );
    await flush();

    // Commit an element move. The parent will not have re-rendered the renderer
    // yet, so its props outline still lacks the overrides.
    await dragTitle(c, 20, 15, 1);

    // AntV now fires a real text change BEFORE the parent re-render. The renderer
    // must build it on top of the just-committed outline, not the stale props.
    const instance = h.instances.at(-1)!;
    act(() => {
      instance.emit('options:change', {
        type: 'options:change',
        changes: [{ op: 'update', path: 'data.items', indexes: [0], value: { label: 'Spring renamed' } }],
      });
    });
    await flush();

    click(buttonContaining(c, 'Save to Canvas'));
    const outline = onSave.mock.calls.at(-1)![0].aiComponentJson.data.outline;
    expect(outline.items[0].label).toBe('Spring renamed');
    expect(outline.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 20, dy: 15 } },
    });
  });

  it('emits nothing for an options:change that carries no data change', async () => {
    const onSave = vi.fn();
    const c = mount(
      <AIComponentEditor isOpen initialContent={STORED} initialPrompt="p" onClose={() => {}} onSave={onSave} />,
    );
    await flush();

    await dragTitle(c, 20, 15, 1);
    click(buttonContaining(c, 'Save to Canvas'));
    const baseline = onSave.mock.calls.at(-1)![0].aiComponentJson.data.outline;
    onSave.mockClear();

    // A toolbar/selection event AntV fires unmapped: the outline must not change.
    const instance = h.instances.at(-1)!;
    act(() => {
      instance.emit('options:change', { type: 'options:change', changes: [{ op: 'select', path: '' }] });
    });
    await flush();

    // Nothing new to save that differs; save again and compare.
    click(buttonContaining(c, 'Save to Canvas'));
    const after = onSave.mock.calls.at(-1)![0].aiComponentJson.data.outline;
    expect(after).toEqual(baseline);
  });
});
