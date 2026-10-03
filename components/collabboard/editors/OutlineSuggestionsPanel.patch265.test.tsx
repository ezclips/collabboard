// @vitest-environment jsdom
//
// PATCH-265. The docked panel's Escape handler yields to a key some other layer
// has already consumed (defaultPrevented), and to Escape typed into a text
// field (the AntV inline text editor, the hex field). Only a plain Escape
// closes the panel.
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

function keydown(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function focus(el: HTMLElement) {
  act(() => { el.focus(); });
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

describe('PATCH-265 OutlineSuggestionsPanel Escape priority', () => {
  it('a prevented Escape keeps the panel open', () => {
    const c = render();
    const panel = c.querySelector('[data-ai-side-panel="designs"]')!;
    expect(panel).not.toBeNull();

    const preventer = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    document.addEventListener('keydown', preventer, true);
    keydown(panel, 'Escape');
    document.removeEventListener('keydown', preventer, true);

    expect(c.querySelector('[data-ai-side-panel]')).not.toBeNull();
  });

  it('an Escape typed into a text field keeps the panel open', () => {
    const c = render();
    click(c.querySelector('[data-ai-edit-text-toggle="true"]')!);
    expect(c.querySelector('[data-ai-side-panel="edit"]')).not.toBeNull();

    const input = c.querySelector('[data-ai-outline-title="true"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    focus(input);
    expect(document.activeElement).toBe(input);

    keydown(input, 'Escape');
    expect(c.querySelector('[data-ai-side-panel]')).not.toBeNull();
  });

  it('a plain Escape closes the panel', () => {
    const c = render();
    expect(c.querySelector('[data-ai-side-panel="designs"]')).not.toBeNull();

    keydown(document.body, 'Escape');
    expect(c.querySelector('[data-ai-side-panel]')).toBeNull();
  });
});
