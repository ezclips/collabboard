// @vitest-environment jsdom
//
// PATCH-260 fix. AntV re-creates its `<use>`/`<foreignObject>` nodes after an
// update (icons/text load asynchronously), dropping the transform. The renderer
// must re-apply the stored overrides after `rendered`/`loaded`, after update()'s
// promise and once more on the next frame.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

const h = vi.hoisted(() => {
  const instances: FakeItemEngine[] = [];

  function paint(container: HTMLElement) {
    container.innerHTML =
      '<svg viewBox="0 0 400 300">' +
      '<g data-element-type="items-group">' +
      '<rect data-element-type="shape" data-part="rect0"/>' +
      '<use data-element-type="item-icon" data-indexes="0" data-part="icon0" href="#i"/>' +
      '<foreignObject data-element-type="item-label" data-indexes="0" data-part="label0"></foreignObject>' +
      '<foreignObject data-element-type="item-value" data-indexes="0" data-part="value0"></foreignObject>' +
      '<rect data-element-type="shape" data-part="rect1"/>' +
      '<use data-element-type="item-icon" data-indexes="1" data-part="icon1" href="#i"/>' +
      '<foreignObject data-element-type="item-label" data-indexes="1" data-part="label1"></foreignObject>' +
      '<foreignObject data-element-type="item-value" data-indexes="1" data-part="value1"></foreignObject>' +
      '</g></svg>';
  }

  class FakeItemEngine {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    updateCount = 0;
    constructor(public options: Record<string, unknown>) {
      instances.push(this);
    }
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    emit(event: string, payload?: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
    render() {
      paint(this.options.container as HTMLElement);
    }
    update() {
      this.updateCount += 1;
      const container = this.options.container as HTMLElement;
      paint(container);
      // AntV re-creates only the icon/text nodes as their resources load, and
      // keeps the static rect: only those lose the transform we just wrote.
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          for (const el of Array.from(container.querySelectorAll('[data-part]'))) {
            if ((el.getAttribute('data-part') ?? '').startsWith('rect')) continue;
            const fresh = el.cloneNode(false) as Element;
            fresh.removeAttribute('transform');
            fresh.removeAttribute('data-ai-base-transform');
            fresh.removeAttribute('data-ai-element-key');
            el.replaceWith(fresh);
          }
          // No `rendered` event here: the async reload finishes silently, so
          // only update()'s promise / the frame callback can re-apply.
          resolve();
        }, 0);
      });
    }
    destroy() {}
  }

  return { instances, mocks: { Infographic: FakeItemEngine } };
});

vi.mock('@/lib/ai/antv/load', () => ({ loadAntv: async () => h.mocks }));

import AntvInfographicRenderer from './AntvInfographicRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
beforeEach(() => { h.instances.length = 0; });
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}

const MEMBER_SELECTORS = [
  '[data-part="rect0"]',
  '[data-part="icon0"]',
  '[data-part="label0"]',
  '[data-part="value0"]',
];

const OVERRIDES = {
  template: 'list-grid-badge-card',
  items: {
    'shape@0#0': { dx: 60, dy: 40 },
    'item-icon@0': { dx: 60, dy: 40 },
    'item-label@0': { dx: 60, dy: 40 },
    'item-value@0': { dx: 60, dy: 40 },
  },
};

function data(overrides?: VisualOutline['elementOverrides']): InfographicDiagramData {
  const outline: VisualOutline = {
    title: 'Seasons',
    ordered: false,
    kind: 'list',
    items: [{ label: 'One' }, { label: 'Two' }],
    ...(overrides ? { elementOverrides: overrides } : {}),
  };
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: outline.title,
    template: 'antv:list-grid-badge-card',
    outline,
  };
}

function expectAllMembersTransformed(container: HTMLElement) {
  for (const selector of MEMBER_SELECTORS) {
    const el = container.querySelector(selector);
    expect(el, selector).not.toBeNull();
    expect(el!.getAttribute('data-ai-element-key'), selector).not.toBeNull();
    expect(el!.getAttribute('transform'), selector).toContain('translate(60 40)');
  }
}

describe('PATCH-260 AntvInfographicRenderer re-applies item overrides', () => {
  it('keeps the transform on use/foreignObject after the engine recreates them on update', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data(OVERRIDES)} />);
    await flush();
    expectAllMembersTransformed(container);

    act(() => { root.render(<AntvInfographicRenderer data={data(OVERRIDES)} />); });
    await flush();

    expectAllMembersTransformed(container);
  });

  it('stamps data-ai-element-key on keyable elements and restores when overrides are gone', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data(OVERRIDES)} />);
    await flush();
    expect(container.querySelector('[data-part="rect0"]')!.getAttribute('data-ai-element-key')).toBe('shape@0#0');
    expect(container.querySelector('[data-part="icon0"]')!.getAttribute('data-ai-element-key')).toBe('item-icon@0');

    act(() => { root.render(<AntvInfographicRenderer data={data()} />); });
    await flush();
    expect(container.querySelector('[data-part="rect0"]')!.getAttribute('transform')).toBeNull();
  });

  // ── PATCH-260: an overrides-only commit must NOT redraw via the engine ───────

  it('does not call update() and leaves the viewBox for an overrides-only change', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data()} />);
    await flush();
    const instance = h.instances.at(-1)!;
    const viewBoxBefore = container.querySelector('svg')!.getAttribute('viewBox');
    const updatesBefore = instance.updateCount;

    act(() => { root.render(<AntvInfographicRenderer data={data(OVERRIDES)} />); });
    await flush();

    expect(instance.updateCount).toBe(updatesBefore);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(viewBoxBefore);
    expectAllMembersTransformed(container);
  });

  it('still calls update() once for a real data change (a text edit)', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data(OVERRIDES)} />);
    await flush();
    const instance = h.instances.at(-1)!;
    const updatesBefore = instance.updateCount;

    const next = data(OVERRIDES);
    next.outline = { ...next.outline, items: [{ label: 'One edited' }, { label: 'Two' }] };
    act(() => { root.render(<AntvInfographicRenderer data={next} />); });
    await flush();

    expect(instance.updateCount).toBe(updatesBefore + 1);
    expectAllMembersTransformed(container);
  });
});
