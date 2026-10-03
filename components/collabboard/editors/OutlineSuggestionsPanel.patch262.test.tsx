// @vitest-environment jsdom
//
// PATCH-262. The Add toolbar icon (AntV designs only) opens the Add side panel;
// a shape/text/icon inserts an addition at the centre of the current view and
// reports it through onEditOutline (so it is saved with the picture).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { suggestDesigns } from '@/lib/ai/infographic/suggest';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';

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
function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};
const OPTIONS = suggestDesigns(OUTLINE);
const ANTV_SELECTED = OPTIONS.find((option) => option.key.startsWith('antv:'))!;

const envelopeFor = (option: (typeof OPTIONS)[number]) => ({
  mode: 'diagram',
  version: 1,
  data: option.envelopeData,
  meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
});

function render(overrides: Partial<React.ComponentProps<typeof OutlineSuggestionsPanel>> = {}) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey={ANTV_SELECTED.key}
      onSelect={() => {}}
      envelopeFor={envelopeFor}
      outline={OUTLINE}
      onEditOutline={() => {}}
      onThemeChange={() => {}}
      {...overrides}
    />,
  );
}

/** Put a picture svg with a known viewBox where the Add panel reads it. */
function injectPreviewSvg(c: HTMLElement, viewBox = '0 0 500 400') {
  const preview = c.querySelector('[data-ai-outline-preview]') as HTMLElement;
  const holder = document.createElement('div');
  holder.setAttribute('data-antv-container', 'x');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  holder.appendChild(svg);
  preview.appendChild(holder);
}

describe('PATCH-262 OutlineSuggestionsPanel Add', () => {
  it('shows the Add icon only for an AntV design, after Customize', () => {
    const antv = render();
    const labels = Array.from(antv.querySelectorAll('[data-ai-preview-toolbar="true"] button[aria-label]')).map(
      (button) => button.getAttribute('aria-label'),
    );
    expect(labels[labels.length - 1]).toBe('Add');
    expect(antv.querySelector('[data-ai-add-toggle="true"]')).not.toBeNull();

    const other = render({ selectedKey: 'infographic:stack' });
    expect(other.querySelector('[data-ai-add-toggle="true"]')).toBeNull();
  });

  it('opens the Add side panel with shapes, text and icons', () => {
    const c = render();
    click(c.querySelector('[data-ai-add-toggle="true"]')!);
    const panel = c.querySelector('[data-ai-side-panel="add"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Add');
    expect(panel!.querySelector('[data-ai-add-panel="true"]')).not.toBeNull();
    expect(panel!.querySelector('[data-ai-add-shape="circle"]')).not.toBeNull();
    expect(panel!.querySelector('[data-ai-add-text="true"]')).not.toBeNull();
    expect(panel!.querySelector('[data-ai-add-icon="true"]')).not.toBeNull();
  });

  it('a shape inserts a selected-kind addition at the centre of the visible viewBox', () => {
    const onEditOutline = vi.fn();
    const c = render({ onEditOutline });
    injectPreviewSvg(c, '0 0 500 400');
    click(c.querySelector('[data-ai-add-toggle="true"]')!);
    click(c.querySelector('[data-ai-add-shape="circle"]')!);

    expect(onEditOutline).toHaveBeenCalledTimes(1);
    const next = onEditOutline.mock.calls[0][0] as VisualOutline;
    const addition = next.elementOverrides!.additions![0];
    expect(addition.kind).toBe('circle');
    // centre (250, 200) minus half of 120x80.
    expect(addition.x).toBe(190);
    expect(addition.y).toBe(160);
    expect(next.elementOverrides!.template).toBe(ANTV_SELECTED.key.slice('antv:'.length));
  });

  it('adds text (200x40) and an icon (64x64) at the view centre', () => {
    const onEditOutline = vi.fn();
    const c = render({ onEditOutline });
    injectPreviewSvg(c, '0 0 500 400');
    click(c.querySelector('[data-ai-add-toggle="true"]')!);

    click(c.querySelector('[data-ai-add-text="true"]')!);
    let addition = (onEditOutline.mock.calls.at(-1)![0] as VisualOutline).elementOverrides!.additions![0];
    expect(addition.kind).toBe('text');
    expect(addition.label).toBe('Text');
    expect(addition.x).toBe(150);
    expect(addition.y).toBe(180);

    const icon = c.querySelector('[data-ai-add-icon][data-ai-icon-name="rocket"]') as Element;
    click(icon);
    const additions = (onEditOutline.mock.calls.at(-1)![0] as VisualOutline).elementOverrides!.additions!;
    const iconAddition = additions[additions.length - 1];
    expect(iconAddition.kind).toBe('icon');
    expect(iconAddition.icon).toBe('rocket');
    expect(iconAddition.w).toBe(64);
    expect(iconAddition.x).toBe(218);
  });

  it('filters the Add panel icon grid as you type', () => {
    const c = render();
    click(c.querySelector('[data-ai-add-toggle="true"]')!);
    const search = c.querySelector('[data-ai-side-panel="add"] [data-ai-icon-search]') as HTMLInputElement;
    setInput(search, 'rocket');
    const names = Array.from(c.querySelectorAll('[data-ai-add-icon="true"]')).map((b) => b.getAttribute('data-ai-icon-name'));
    expect(names).toEqual(['rocket']);
  });
});
