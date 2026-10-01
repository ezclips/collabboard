// @vitest-environment jsdom
//
// PATCH-243. The AntV renderer turns AntV's own hidden +/− buttons into outline
// edits when (and only when) the picture is editable.
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
    rendered = 0;
    constructor(public options: Record<string, unknown>) {
      instances.push(this);
    }
    on(event: string, listener: (payload: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    }
    render() {
      this.rendered += 1;
    }
    update() {}
    destroy() {}
    emit(event: string, payload: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
  }
  return { instances, FakeInfographic };
});

vi.mock('@/lib/ai/antv/load', () => ({
  loadAntv: async () => ({ Infographic: h.FakeInfographic }),
}));

import AntvInfographicRenderer from './AntvInfographicRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
beforeEach(() => {
  h.instances.length = 0;
});
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
  return container;
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const outline: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

function data(o: VisualOutline = outline): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: o.title,
    template: 'antv:list-grid-badge-card',
    outline: o,
  };
}

function antvContainer(c: HTMLElement): HTMLElement {
  return c.querySelector('[data-antv-container]') as HTMLElement;
}

function addButton(container: HTMLElement, type: 'btn-add' | 'btn-remove', indexes: string) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('data-element-type', type);
  rect.setAttribute('data-indexes', indexes);
  container.appendChild(rect);
  return rect;
}

function click(el: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event;
}

describe('PATCH-243 AntvInfographicRenderer + / −', () => {
  it('marks an editable picture and ships the scoped CSS', async () => {
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange: vi.fn() }} />);
    await flush();
    act(() => { h.instances[0].emit('loaded', null); });
    await flush();

    expect(antvContainer(c).getAttribute('data-antv-editable')).not.toBeNull();
    const style = c.querySelector('[data-antv-editable-css]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('[data-antv-editable]:hover [data-element-type="btns-group"]');
    expect(style!.textContent).toContain('#3B82F6');
  });

  it('maps a btn-add click to an item inserted at that index', async () => {
    const onChange = vi.fn();
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    await flush();
    act(() => { h.instances[0].emit('loaded', null); });
    await flush();

    const rect = addButton(antvContainer(c), 'btn-add', '2');
    const event = click(rect);
    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((item) => item.label)).toEqual(['Spring', 'Summer', 'New item']);
  });

  it('maps a btn-remove click to item removal', async () => {
    const onChange = vi.fn();
    const three = { ...outline, items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] };
    const c = mount(<AntvInfographicRenderer data={data(three)} edit={{ onChange }} />);
    await flush();
    act(() => { h.instances[0].emit('loaded', null); });
    await flush();

    click(addButton(antvContainer(c), 'btn-remove', '1'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as VisualOutline).items.map((i) => i.label)).toEqual(['A', 'C']);
  });

  it('does nothing for out-of-range indexes', async () => {
    const onChange = vi.fn();
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    await flush();
    act(() => { h.instances[0].emit('loaded', null); });
    await flush();

    click(addButton(antvContainer(c), 'btn-add', '99'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds no attribute, CSS or listener when the picture is not editable', async () => {
    const c = mount(<AntvInfographicRenderer data={data()} />);
    await flush();
    act(() => { h.instances[0].emit('loaded', null); });
    await flush();

    expect(antvContainer(c).getAttribute('data-antv-editable')).toBeNull();
    expect(c.querySelector('[data-antv-editable-css]')).toBeNull();

    const rect = addButton(antvContainer(c), 'btn-add', '2');
    const event = click(rect);
    expect(event.defaultPrevented).toBe(false);
  });
});
