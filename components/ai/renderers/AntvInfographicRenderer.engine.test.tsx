// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';

/**
 * A stand-in for AntV: it records the listeners the renderer registers and lets
 * the test drive `loaded` / `options:change`, so destroy and edit mapping can be
 * asserted without the real engine.
 */
const h = vi.hoisted(() => {
  const instances: FakeInfographic[] = [];
  class FakeInfographic {
    listeners = new Map<string, Array<(payload: unknown) => void>>();
    rendered = 0;
    updates: unknown[] = [];
    destroyed = 0;
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
    update(options: unknown) {
      this.updates.push(options);
    }
    destroy() {
      this.destroyed += 1;
    }
    emit(event: string, payload: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(payload);
    }
  }
  return { instances, FakeInfographic };
});

vi.mock('@/lib/ai/antv/load', () => ({
  loadAntv: async () => ({ Infographic: h.FakeInfographic }),
}));

// Imported after the mock is registered.
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
  return { root, container };
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

describe('PATCH-241 AntvInfographicRenderer engine wiring', () => {
  it('renders through the engine and destroys it on unmount', async () => {
    const { root } = mount(<AntvInfographicRenderer data={data()} />);
    await flush();
    const instance = h.instances[0];
    expect(instance).toBeDefined();
    expect(instance.rendered).toBe(1);

    act(() => { root.unmount(); });
    mounted = mounted.filter((m) => m.root !== root);
    expect(instance.destroyed).toBe(1);
  });

  it('enables editable and maps options:change back to the outline', async () => {
    const onChange = vi.fn();
    mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    await flush();
    const instance = h.instances[0];
    expect(instance.options.editable).toBe(true);

    act(() => {
      instance.emit('options:change', {
        type: 'options:change',
        changes: [{ op: 'update', path: 'data.items', indexes: [1], value: { label: 'High summer\n' } }],
      });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[1].label).toBe('High summer');
  });

  it('maps an options:change text-attribute update to textStyle.label.fill', async () => {
    const onChange = vi.fn();
    mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    await flush();
    const instance = h.instances[0];

    act(() => {
      instance.emit('options:change', {
        type: 'options:change',
        changes: [
          {
            op: 'update',
            path: 'data.items[0].attributes.label',
            indexes: [0],
            value: { attributes: { fill: '#ff0000' } },
          },
        ],
      });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[0].textStyle?.label?.fill).toBe('#ff0000');
  });

  it('does not call onChange when a change maps to no change', async () => {
    const onChange = vi.fn();
    mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    await flush();
    const instance = h.instances[0];

    act(() => {
      instance.emit('options:change', {
        type: 'options:change',
        changes: [
          // A hostile fill is not a colour we store: nothing changes.
          {
            op: 'update',
            path: 'data.items[0].attributes.label',
            indexes: [0],
            value: { attributes: { fill: 'url(javascript:alert(1))' } },
          },
          // And an op/path we do not understand is ignored.
          { op: 'frobnicate', path: 'data.items', indexes: [1], value: {} },
        ],
      });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates the engine when the outline changes', async () => {
    const { root } = mount(<AntvInfographicRenderer data={data()} />);
    await flush();
    const instance = h.instances[0];

    act(() => {
      root.render(
        <AntvInfographicRenderer
          data={data({ ...outline, items: [{ label: 'Spring' }, { label: 'Summer' }, { label: 'Autumn' }] })}
        />,
      );
    });
    await flush();
    expect(instance.updates.length).toBeGreaterThan(0);
    const last = instance.updates.at(-1) as { data: { items: unknown[] } };
    expect(last.data.items).toHaveLength(3);
  });
});
