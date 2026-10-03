// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import OutlineTextEditor from './OutlineTextEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
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

function setSelectValue(select: HTMLSelectElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function outline(count: number): VisualOutline {
  return {
    title: 'Seasons',
    ordered: false,
    kind: 'levels',
    items: Array.from({ length: count }, (_, i) => ({ label: `Item ${i + 1}` })),
  };
}

describe('PATCH-242 OutlineTextEditor "Add item" side', () => {
  it('adds on the side with fewer items (tie -> right)', () => {
    const onChange = vi.fn();
    const c = mount(<OutlineTextEditor outline={outline(3)} onChange={onChange} />);
    click(c.querySelector('[data-ai-outline-add-item="true"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.label)).toEqual(['Item 1', 'Item 2', 'Item 3', 'New item']);
    // Default sides for three items are right/left/right -> left has fewer.
    expect(next.items.map((i) => i.side)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('breaks a tie to the right', () => {
    const onChange = vi.fn();
    const c = mount(<OutlineTextEditor outline={outline(2)} onChange={onChange} />);
    click(c.querySelector('[data-ai-outline-add-item="true"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.side)).toEqual(['right', 'left', 'right']);
  });
});

describe('PATCH-250 OutlineTextEditor value inputs', () => {
  const valued = (): VisualOutline => ({
    title: 'Budget',
    ordered: false,
    kind: 'list',
    items: [
      { label: 'Venue', value: 50 },
      { label: 'Food', value: 50 },
    ],
  });

  it('shows a value input on every row only when some item has a value', () => {
    const none = mount(<OutlineTextEditor outline={outline(2)} onChange={() => {}} />);
    expect(none.querySelectorAll('[data-ai-outline-item-value]')).toHaveLength(0);

    const some = mount(<OutlineTextEditor outline={valued()} onChange={() => {}} />);
    expect(some.querySelectorAll('[data-ai-outline-item-value]')).toHaveLength(2);
    expect((some.querySelector('[data-ai-outline-item-value="0"]') as HTMLInputElement).type).toBe('number');
  });

  it('typing 25 sets value 25 and never mutates the outline it was given', () => {
    const onChange = vi.fn();
    const input = valued();
    const snapshot = JSON.parse(JSON.stringify(input));
    const c = mount(<OutlineTextEditor outline={input} onChange={onChange} />);

    const valueInput = c.querySelector('[data-ai-outline-item-value="0"]') as HTMLInputElement;
    expect(valueInput.value).toBe('50');
    setInputValue(valueInput, '25');

    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[0].value).toBe(25);
    expect(next.items[1].value).toBe(50);
    expect(input).toEqual(snapshot);
  });

  it('clearing the input removes the value entirely', () => {
    const onChange = vi.fn();
    const c = mount(<OutlineTextEditor outline={valued()} onChange={onChange} />);

    setInputValue(c.querySelector('[data-ai-outline-item-value="1"]') as HTMLInputElement, '');

    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[1].value).toBeUndefined();
    expect('value' in next.items[1]).toBe(false);
    expect(next.items[0].value).toBe(50);
  });
});

describe('PATCH-260 OutlineTextEditor keeps elementOverrides', () => {
  const overrides = { template: 'antv:list-grid-badge-card', items: { 'item-label@0': { dx: 9, dy: 4 } } };

  it('survives a title edit, a label edit, an icon change and a value edit', () => {
    const onChange = vi.fn();
    const base: VisualOutline = {
      title: 'Budget',
      ordered: false,
      kind: 'list',
      items: [
        { label: 'Venue', value: 50 },
        { label: 'Food', value: 50 },
      ],
      elementOverrides: overrides,
    };
    const c = mount(<OutlineTextEditor outline={base} onChange={onChange} />);

    setInputValue(c.querySelector('[data-ai-outline-title="true"]') as HTMLInputElement, 'New budget');
    expect((onChange.mock.calls.at(-1)![0] as VisualOutline).elementOverrides).toEqual(overrides);

    setInputValue(c.querySelector('[data-ai-outline-item-label="1"]') as HTMLInputElement, 'Meals');
    expect((onChange.mock.calls.at(-1)![0] as VisualOutline).elementOverrides).toEqual(overrides);

    setSelectValue(c.querySelector('[data-ai-outline-item-icon="1"]') as HTMLSelectElement, 'sun');
    expect((onChange.mock.calls.at(-1)![0] as VisualOutline).elementOverrides).toEqual(overrides);

    setInputValue(c.querySelector('[data-ai-outline-item-value="1"]') as HTMLInputElement, '25');
    expect((onChange.mock.calls.at(-1)![0] as VisualOutline).elementOverrides).toEqual(overrides);
  });
});
