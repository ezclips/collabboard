// @vitest-environment jsdom
//
// PATCH-251. The preview's full-width text rows become one icon toolbar with
// hints on its top-right, each icon opening one popover at a time. The design
// filter and the "estimated" note become compact chips on the top-left, and the
// preview grows to 60% of the panel.
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

describe('PATCH-251 OutlineSuggestionsPanel preview toolbar', () => {
  it('shows the four icons with aria-labels, titles and hint texts', () => {
    const c = render();
    const toolbar = c.querySelector('[data-ai-preview-toolbar="true"]');
    expect(toolbar).not.toBeNull();

    for (const label of ['Edit text', 'Similar visuals', 'Colours', 'Customize']) {
      const button = toolbar!.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
      expect(button, `missing ${label}`).not.toBeNull();
      expect(button!.textContent ?? '').toContain(label);
      expect(button!.title).toBe(label);
    }
    expect(c.querySelector('[data-ai-edit-text-toggle="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-similar-toggle="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-colours-toggle="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-customize-toggle="true"]')).not.toBeNull();
  });

  it('shows the Similar visuals icon only when similar designs exist', () => {
    const withSimilar = render();
    expect(withSimilar.querySelector('[data-ai-similar-toggle="true"]')).not.toBeNull();

    const without = render({ selectedKey: 'infographic:stack' });
    expect(without.querySelector('[data-ai-similar-toggle="true"]')).toBeNull();
  });

  it('opens one popover at a time and swaps between them', () => {
    const c = render();
    expect(c.querySelector('[data-ai-preview-popover]')).toBeNull();

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    const edit = c.querySelector('[data-ai-preview-popover="edit"]');
    expect(edit).not.toBeNull();
    expect(edit!.querySelector('[data-ai-outline-editor="true"]')).not.toBeNull();

    click(c.querySelector('[data-ai-colours-toggle="true"]')!);
    expect(c.querySelector('[data-ai-preview-popover="edit"]')).toBeNull();
    const colours = c.querySelector('[data-ai-preview-popover="colours"]');
    expect(colours).not.toBeNull();
    expect(colours!.querySelector('[data-ai-colours="true"]')).not.toBeNull();
    expect(colours!.querySelector('[data-ai-theme]')).not.toBeNull();
  });

  it('closes on Escape and on a pointerdown outside, but not on a click inside', () => {
    const c = render();
    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    const edit = c.querySelector('[data-ai-preview-popover="edit"]')!;

    pointerDown(edit);
    expect(c.querySelector('[data-ai-preview-popover="edit"]')).not.toBeNull();

    pointerDown(c);
    expect(c.querySelector('[data-ai-preview-popover="edit"]')).toBeNull();

    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    expect(c.querySelector('[data-ai-preview-popover="edit"]')).not.toBeNull();
    keydown(document, 'Escape');
    expect(c.querySelector('[data-ai-preview-popover="edit"]')).toBeNull();
  });

  it('shows the filter chip label and its X calls onShowAll', () => {
    const onShowAll = vi.fn();
    const c = render({ familyFilter: 'timeline', familyLabel: 'Timeline', onShowAll });

    const chip = c.querySelector('[data-ai-family-filter="true"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('Timeline');

    const x = c.querySelector('[data-ai-show-all="true"]') as HTMLElement | null;
    expect(x).not.toBeNull();
    expect(x!.getAttribute('aria-label')).toBe('Show all designs');
    click(x!);
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it('shows the estimated chip only when the outline says so', () => {
    const off = render();
    expect(off.querySelector('[data-ai-values-estimated="true"]')).toBeNull();

    const on = render({ outline: { ...OUTLINE, valuesEstimated: true } });
    const chip = on.querySelector('[data-ai-values-estimated="true"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('Estimated');
    expect(chip!.textContent).toContain('The AI estimated these numbers');
  });

  it('removes the old "Showing:" line, leaving only the compact chip', () => {
    const c = render({ familyFilter: 'timeline', familyLabel: 'Timeline' });
    expect(c.textContent).not.toContain('Showing:');
    expect(c.querySelector('[data-ai-family-filter="true"]')!.textContent).toContain('Timeline');
  });

  it('keeps "Similar visuals" only as an icon hint, not a visible link', () => {
    const c = render();
    const similarButtons = Array.from(c.querySelectorAll('button')).filter((b) =>
      (b.textContent ?? '').includes('Similar visuals'),
    );
    expect(similarButtons.length).toBeGreaterThan(0);
    for (const button of similarButtons) {
      expect(button.getAttribute('data-ai-similar-toggle')).toBe('true');
      const hint = button.querySelector('span');
      expect(hint).not.toBeNull();
      expect((hint as HTMLElement).className).toContain('opacity-0');
    }
  });

  it('grows the preview to 60% of the panel', () => {
    const c = render();
    const preview = c.querySelector('[data-ai-outline-preview]') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview.style.height).toBe('60%');
    expect(preview.style.maxHeight).toBe('60%');
  });
});
