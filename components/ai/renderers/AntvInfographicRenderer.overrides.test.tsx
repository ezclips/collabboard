// @vitest-environment jsdom
//
// PATCH-260. The renderer applies stored element overrides on first render AND
// after an AntV update, also when it is not editable.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

const h = vi.hoisted(() => {
  const instances: FakeInfographic[] = [];
  class FakeInfographic {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    constructor(public options: Record<string, unknown>) {
      instances.push(this);
    }
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    render() {
      this.paint();
    }
    update() {
      this.paint();
    }
    destroy() {}
    private paint() {
      const container = this.options.container as HTMLElement;
      container.innerHTML =
        '<svg viewBox="0 0 200 100"><g data-element-type="title" transform="translate(1 1)"><text>t</text></g>' +
        '<g data-element-type="item-label" data-indexes="0"><text>a</text></g>' +
        '<g data-element-type="item-label" data-indexes="1"><text>b</text></g></svg>';
    }
  }
  return { instances, mocks: { Infographic: FakeInfographic } };
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
}

function data(overrides?: VisualOutline['elementOverrides']): InfographicDiagramData {
  const outline: VisualOutline = {
    title: 'Seasons',
    ordered: false,
    kind: 'list',
    items: [{ label: 'Spring' }, { label: 'Summer' }],
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

const OVERRIDES = { template: 'list-grid-badge-card', items: { 'title#0': { dx: 30, dy: 20 } } };

describe('PATCH-260 AntvInfographicRenderer element overrides', () => {
  it('applies stored overrides on first render, without edit', async () => {
    const { container } = mount(<AntvInfographicRenderer data={data(OVERRIDES)} />);
    await flush();
    const title = container.querySelector('[data-element-type="title"]') as Element;
    const transform = title.getAttribute('transform')!;
    expect(transform.startsWith('translate(1 1) ')).toBe(true);
    expect(transform).toContain('translate(30 20)');
  });

  it('re-applies overrides after an update()', async () => {
    const { root, container } = mount(<AntvInfographicRenderer data={data()} />);
    await flush();
    const before = (container.querySelector('[data-element-type="title"]') as Element).getAttribute('transform');
    expect(before).toBe('translate(1 1)');

    act(() => { root.render(<AntvInfographicRenderer data={data(OVERRIDES)} />); });
    await flush();
    const after = (container.querySelector('[data-element-type="title"]') as Element).getAttribute('transform')!;
    expect(after).toContain('translate(30 20)');
  });
});
