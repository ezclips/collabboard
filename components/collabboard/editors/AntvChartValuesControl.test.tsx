// @vitest-environment jsdom
//
// PATCH-287. The "Edit values" panel: it appears only for a selected chart and
// not in read-only, shows the chart's rows, validates before applying, calls the
// redraw exactly once, and never lets a keystroke reach Excalidraw.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redraw = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/lib/ai/antv/chartValues/redrawChart', () => ({ redrawChart: redraw.fn }));

import AntvChartValuesControl from './AntvChartValuesControl';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface TestElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  groupIds: string[];
  customData: Record<string, unknown>;
  [key: string]: unknown;
}

function makeChart(count: number): TestElement[] {
  const chart = {
    v: 1,
    template: 'chart-pie-donut-pill-badge',
    theme: 'classic',
    title: 'Seasonal plan',
    items: Array.from({ length: count }, (_, i) => ({ label: `Item ${i}`, value: (i + 1) * 10 })),
  };
  const el = (partial: Partial<TestElement> & { id: string; type: string }): TestElement => ({
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    groupIds: ['g1'],
    customData: { antvRole: 'x', antvChart: chart },
    ...partial,
  });
  const elements: TestElement[] = [
    el({ id: 'bg', type: 'rectangle', width: 720, height: 400 }),
  ];
  for (let i = 0; i < count; i += 1) {
    elements.push(
      el({ id: `label-${i}`, type: 'text', text: `Item ${i}`, customData: { antvRole: `item-label@${i}#0`, antvChart: chart } }),
      el({ id: `value-${i}`, type: 'text', text: `${(i + 1) * 10}%`, customData: { antvRole: `item-value@${i}#0`, antvChart: chart } }),
      el({ id: `slice-${i}`, type: 'line', customData: { antvRole: `slice#${i}`, antvChart: chart } }),
    );
  }
  return elements;
}

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
let selection: Record<string, boolean> = {};
let elements: TestElement[] = [];
let listeners: Set<() => void> = new Set();

function api() {
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ selectedElementIds: selection, selectedGroupIds: {} }),
    onChange: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    updateScene: vi.fn(),
  };
}

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    // The control focuses the Excalidraw container rendered next to it.
    root.render(
      <>
        <div className="excalidraw-container" tabIndex={0} />
        {ui}
      </>,
    );
  });
  mounted.push({ root, container });
  return container;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function setInput(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function selectChart() {
  selection = { 'slice-0': true };
  act(() => {
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  redraw.fn.mockReset();
  redraw.fn.mockResolvedValue({ ok: true });
  selection = {};
  elements = makeChart(5);
  listeners = new Set();
});

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  mounted = [];
});

describe('PATCH-287: AntvChartValuesControl', () => {
  it('shows Edit values only for a selected chart', () => {
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    expect(c.querySelector('[data-antv-chart-edit]')).toBeNull();
    selectChart();
    expect(c.querySelector('[data-antv-chart-edit]')).not.toBeNull();
  });

  it('never shows the button in read-only', () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} readOnly />);
    expect(c.querySelector('[data-antv-chart-edit]')).toBeNull();
  });

  it('opens rows seeded from the data and the canvas texts', () => {
    selectChart();
    elements = elements.map((element) =>
      element.customData?.antvRole === 'item-label@0#0' ? { ...element, text: 'Renamed' } : element,
    );
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    const labels = Array.from(c.querySelectorAll('[data-antv-chart-label]')) as HTMLInputElement[];
    const values = Array.from(c.querySelectorAll('[data-antv-chart-value]')) as HTMLInputElement[];
    expect(labels).toHaveLength(5);
    expect(labels[0].value).toBe('Renamed');
    expect(values[0].value).toBe('10');
    // Pie charts show each row's share.
    expect(c.querySelectorAll('[data-antv-chart-share]')).toHaveLength(5);
  });

  it('disables remove with one row and add at ten rows', () => {
    elements = makeChart(1);
    selectChart();
    const one = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(one.querySelector('[data-antv-chart-edit]')!);
    expect((one.querySelector('[data-antv-chart-remove]') as HTMLButtonElement).disabled).toBe(true);

    // A fresh mount with ten rows.
    elements = makeChart(10);
    listeners = new Set();
    selection = { 'slice-0': true };
    const ten = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(ten.querySelector('[data-antv-chart-edit]')!);
    expect((ten.querySelector('[data-antv-chart-add]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks Apply with inline errors on invalid input and does not redraw', async () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    setInput(c.querySelector('[data-antv-chart-label]') as HTMLInputElement, '');
    await act(async () => {
      c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(redraw.fn).not.toHaveBeenCalled();
    expect(c.querySelector('[data-antv-chart-row-error]')).not.toBeNull();
    expect(c.querySelector('[data-antv-chart-panel]')).not.toBeNull();
  });

  it('calls the redraw once with the rows, closes and focuses the canvas on success', async () => {
    vi.useFakeTimers();
    try {
      selectChart();
      const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
      click(c.querySelector('[data-antv-chart-edit]')!);
      setInput(c.querySelector('[data-antv-chart-label]') as HTMLInputElement, 'Renamed');
      setInput(c.querySelector('[data-antv-chart-value]') as HTMLInputElement, '50');
      await act(async () => {
        c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      act(() => {
        vi.runAllTimers();
      });
      expect(redraw.fn).toHaveBeenCalledTimes(1);
      const rows = redraw.fn.mock.calls[0][2];
      expect(rows[0]).toMatchObject({ from: 0, label: 'Renamed', value: 50 });
      expect(c.querySelector('[data-antv-chart-panel]')).toBeNull();
      expect(document.activeElement).toBe(c.querySelector('.excalidraw-container'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the panel open with the error when the redraw fails', async () => {
    redraw.fn.mockResolvedValue({ ok: false, error: 'render exploded' });
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    await act(async () => {
      c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect((c.querySelector('[data-antv-chart-error]')?.textContent ?? '')).toContain('render exploded');
    expect(c.querySelector('[data-antv-chart-panel]')).not.toBeNull();
  });

  it('stops key events inside the panel from reaching the document', () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    document.addEventListener('keydown', listener);
    try {
      const input = c.querySelector('[data-antv-chart-value]') as HTMLInputElement;
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      });
      expect(seen).toEqual([]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('centres the Edit values button below the toolbar (Addendum 1 item 2)', () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    const button = c.querySelector('[data-antv-chart-edit]') as HTMLElement;
    expect(button.style.top).toBe('64px');
    expect(button.style.left).toBe('50%');
    expect(button.style.transform).toBe('translateX(-50%)');
  });

  it('returns focus to the canvas after Cancel (Addendum 2)', () => {
    vi.useFakeTimers();
    try {
      selectChart();
      const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
      click(c.querySelector('[data-antv-chart-edit]')!);
      click(c.querySelector('[data-antv-chart-cancel]')!);
      act(() => {
        vi.runAllTimers();
      });
      expect(document.activeElement).toBe(c.querySelector('.excalidraw-container'));
      expect(c.querySelector('[data-antv-chart-panel]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes on Escape and returns focus to the canvas (Addendum 2)', () => {
    vi.useFakeTimers();
    try {
      selectChart();
      const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
      click(c.querySelector('[data-antv-chart-edit]')!);
      act(() => {
        c.querySelector('[data-antv-chart-panel]')!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });
      act(() => {
        vi.runAllTimers();
      });
      expect(document.activeElement).toBe(c.querySelector('.excalidraw-container'));
      expect(c.querySelector('[data-antv-chart-panel]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-reads the live chart on Apply so a colour changed while selected is kept (Addendum 1 item 3)', async () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    // The selection did not change, so the cached chart is stale.
    elements = elements.map((element) =>
      element.id === 'slice-0' ? { ...element, backgroundColor: '#ff0000' } : element,
    );
    await act(async () => {
      c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(redraw.fn).toHaveBeenCalledTimes(1);
    const passed = redraw.fn.mock.calls[0][1];
    const slice = passed.elements.find((element: TestElement) => element.customData?.antvRole === 'slice#0');
    expect(slice?.backgroundColor).toBe('#ff0000');
  });

  it('PATCH-288: Apply is a filled primary button and Cancel an outlined secondary one', () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    const apply = c.querySelector('[data-antv-chart-apply]') as HTMLButtonElement;
    const cancel = c.querySelector('[data-antv-chart-cancel]') as HTMLButtonElement;
    expect(apply.style.background).toBe('rgb(37, 99, 235)');
    expect(apply.style.color).toBe('rgb(255, 255, 255)');
    expect(apply.style.border).toContain('rgb(37, 99, 235)');
    expect(apply.style.fontWeight).toBe('600');
    expect(cancel.style.background).toBe('rgb(255, 255, 255)');
    expect(cancel.style.border).toContain('rgb(209, 213, 219)');
    expect(cancel.style.color).toBe('rgb(55, 65, 81)');
  });

  it('PATCH-288: disabled Apply (busy) dims and shows the default cursor', async () => {
    let release: ((value: { ok: boolean }) => void) | undefined;
    redraw.fn.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    await act(async () => {
      c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const apply = c.querySelector('[data-antv-chart-apply]') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(apply.style.opacity).toBe('0.6');
    expect(apply.style.cursor).toBe('default');
    await act(async () => { release?.({ ok: true }); });
  });

  it('says "Select the chart again" instead of redrawing when it is no longer that chart (Addendum 1 item 3)', async () => {
    selectChart();
    const c = mount(<AntvChartValuesControl getApi={api} apiVersion={0} />);
    click(c.querySelector('[data-antv-chart-edit]')!);
    elements = elements.map((element) => ({ ...element, groupIds: ['g2'] }));
    await act(async () => {
      c.querySelector('[data-antv-chart-apply]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(redraw.fn).not.toHaveBeenCalled();
    expect(c.querySelector('[data-antv-chart-error]')?.textContent ?? '').toContain('Select the chart again');
    expect(c.querySelector('[data-antv-chart-panel]')).not.toBeNull();
  });
});
