// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InfographicDiagramData, InfographicTemplate } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import InfographicRenderer from './InfographicRenderer';

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
function keydown(el: Element, key: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const outline: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Spring', detail: 'warm' },
    { label: 'Summer', detail: 'hot' },
    { label: 'Autumn', detail: 'cool' },
  ],
};

function data(template: InfographicTemplate = 'stack', o: VisualOutline = outline): InfographicDiagramData {
  return { type: 'diagram', subtype: 'infographic', renderer: 'infographic', title: o.title, template, outline: o };
}

describe('PATCH-240 InfographicRenderer edit handles', () => {
  it('shows an input at the clicked word and commits a rename with Enter', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);

    click(c.querySelector('[data-ai-edit-ref="label:1"]') as Element);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Summer');

    setInputValue(input, 'High summer');
    keydown(input, 'Enter');
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[1].label).toBe('High summer');
  });

  it('Escape cancels without calling onChange', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-ref="label:0"]') as Element);
    keydown(c.querySelector('[data-ai-edit-input="true"]') as Element, 'Escape');
    expect(onChange).not.toHaveBeenCalled();
    expect(c.querySelector('[data-ai-edit-input="true"]')).toBeNull();
  });

  it('opens with initialEditRef already editing that word', () => {
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange: vi.fn() }} initialEditRef="label:2" />);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Autumn');
  });

  it('+ after item 0 inserts a new item at 1', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-add="0"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'New item', 'Summer', 'Autumn']);
  });

  it('− on item 2 removes it', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-remove="2"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'Summer']);
  });

  it('hides + at the template max and − at the template min', () => {
    const maxOutline: VisualOutline = { ...outline, items: Array.from({ length: 8 }, (_, i) => ({ label: `I${i}` })) };
    const max = mount(<InfographicRenderer data={data('stack', maxOutline)} edit={{ onChange: vi.fn() }} />);
    expect(max.querySelector('[data-ai-edit-add]')).toBeNull();

    const minOutline: VisualOutline = { ...outline, items: [{ label: 'A' }, { label: 'B' }] };
    const min = mount(<InfographicRenderer data={data('stack', minOutline)} edit={{ onChange: vi.fn() }} />);
    expect(min.querySelector('[data-ai-edit-remove]')).toBeNull();
  });

  it('clicking an item shape opens the colour popover and swatch 3 sets color 3', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-shape="0"]') as Element);
    expect(c.querySelector('[data-ai-edit-color-popover="true"]')).not.toBeNull();
    click(c.querySelector('[data-ai-edit-color="3"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[0].color).toBe(3);
  });

  it('renders a hostile typed label as text with no element injection', () => {
    const onChange = vi.fn();
    const c = mount(<InfographicRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-ref="label:0"]') as Element);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    setInputValue(input, '<img src=x onerror=alert(1)>');
    keydown(input, 'Enter');
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items[0].label).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('PATCH-240 InfographicRenderer non-editable stays chrome-free', () => {
  it('has data-ai-edit-ref attributes but no handles, overlay or shape click chrome', () => {
    const c = mount(<InfographicRenderer data={data()} />);
    expect(c.querySelector('[data-ai-edit-ref="label:0"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-remove]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-overlay="true"]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-shape]')).toBeNull();
  });
});
