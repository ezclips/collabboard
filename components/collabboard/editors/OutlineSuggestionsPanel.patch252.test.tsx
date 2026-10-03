// @vitest-environment jsdom
//
// PATCH-252. The design tools move out of the preview pop-ups into one side
// panel docked to the right. With no host (this test) the panel renders inline
// as a right-hand column. The preview toolbar now lists Designs first, and the
// "estimated" badge shows only on numeric charts whose outline estimated values.
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
function pointerDown(el: Element) {
  act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
}
function keydown(target: EventTarget, key: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}

const OUTLINE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};
const OPTIONS = suggestDesigns(OUTLINE);
const ANTV_SELECTED = OPTIONS.find((option) => option.key.startsWith('antv:'))!;

// Four values means the chart family always has numeric designs to preview.
const VALUED_OUTLINE: VisualOutline = {
  title: 'Budget',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Venue', value: 40 },
    { label: 'Food', value: 30 },
    { label: 'Travel', value: 20 },
    { label: 'Other', value: 10 },
  ],
};
const VALUED_OPTIONS = suggestDesigns(VALUED_OUTLINE);
const PIE_KEY = VALUED_OPTIONS.find((option) => option.key.includes('chart-pie'))!.key;

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

function toolbarLabels(c: ParentNode): string[] {
  const toolbar = c.querySelector('[data-ai-preview-toolbar="true"]')!;
  return Array.from(toolbar.querySelectorAll('button[aria-label]')).map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

describe('PATCH-252 OutlineSuggestionsPanel side panel', () => {
  it('opens on Designs with a 2-column tiles grid and no pop-ups', () => {
    const c = render();

    const panel = c.querySelector('[data-ai-side-panel="designs"]');
    expect(panel).not.toBeNull();
    expect(panel!.querySelector('[data-ai-outline-tiles="true"]')).not.toBeNull();
    expect(panel!.querySelector('[class*="grid-cols-2"]')).not.toBeNull();

    expect(c.querySelector('[data-ai-preview-popover]')).toBeNull();
    expect(c.querySelector('[data-ai-preview-chips]')).toBeNull();
  });

  it('orders the toolbar Designs, Edit text, Similar visuals, Colours & Fonts, Customize, Add', () => {
    const c = render();
    expect(toolbarLabels(c)).toEqual(['Designs', 'Edit text', 'Similar visuals', 'Colours & Fonts', 'Customize', 'Add']);
  });

  it('switches to Edit text and clicking the icon again closes the panel', () => {
    const c = render();

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    const edit = c.querySelector('[data-ai-side-panel="edit"]');
    expect(edit).not.toBeNull();
    expect(edit!.querySelector('[data-ai-outline-editor="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).toBeNull();

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    expect(c.querySelector('[data-ai-side-panel]')).toBeNull();
  });

  it('closes on the × and on Escape, but an outside pointerdown does not close', () => {
    const c = render();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();

    // A pointerdown outside the docked panel leaves it open.
    pointerDown(c);
    pointerDown(document.body);
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();

    click(c.querySelector('[data-ai-side-panel-close="true"]')!);
    expect(c.querySelector('[data-ai-side-panel]')).toBeNull();

    click(c.querySelector('[data-ai-designs-toggle="true"]')!);
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();
    keydown(document, 'Escape');
    expect(c.querySelector('[data-ai-side-panel]')).toBeNull();
  });

  it('reports open/closed through onSidePanelChange', () => {
    const onSidePanelChange = vi.fn();
    const c = render({ onSidePanelChange });

    expect(onSidePanelChange).toHaveBeenLastCalledWith(true);

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    expect(onSidePanelChange).toHaveBeenLastCalledWith(true);

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    expect(onSidePanelChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the estimated badge only on a numeric chart with estimated values', () => {
    const pie = render({
      options: VALUED_OPTIONS,
      selectedKey: PIE_KEY,
      outline: { ...VALUED_OUTLINE, valuesEstimated: true },
    });
    const badge = pie.querySelector('[data-ai-values-estimated="true"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('Estimated');
    expect(badge!.textContent).toContain('The AI estimated these numbers');

    // Same outline, but the preview shows the (non-numeric) Flow design.
    const flow = render({
      options: VALUED_OPTIONS,
      selectedKey: 'flow',
      outline: { ...VALUED_OUTLINE, valuesEstimated: true },
    });
    expect(flow.querySelector('[data-ai-values-estimated="true"]')).toBeNull();

    // A numeric chart, but the numbers were not estimated.
    const notEstimated = render({
      options: VALUED_OPTIONS,
      selectedKey: PIE_KEY,
      outline: VALUED_OUTLINE,
    });
    expect(notEstimated.querySelector('[data-ai-values-estimated="true"]')).toBeNull();
  });
});
