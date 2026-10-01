// @vitest-environment jsdom
//
// PATCH-243. The Show-options tree preview edits on the picture and maps every
// edit back to the outline (no fetch, no AI call).
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
  vi.restoreAllMocks();
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
function keydown(el: Element, key: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}

const OUTLINE: VisualOutline = {
  title: 'Root',
  ordered: false,
  kind: 'list',
  items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
};

const OPTIONS = suggestDesigns(OUTLINE);

function render(onEditOutline: (next: VisualOutline) => void) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey="mindmap"
      onSelect={() => {}}
      outline={OUTLINE}
      onEditOutline={onEditOutline}
      envelopeFor={(option) => ({
        mode: 'diagram',
        version: 1,
        data: option.envelopeData,
        meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
      })}
    />,
  );
}

describe('PATCH-243 OutlineSuggestionsPanel editable tree', () => {
  it('renders the tree option editable on the large preview', () => {
    const c = render(() => {});
    expect(c.querySelector('[data-ai-outline-preview] [data-mindmap-svg]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add="root:right"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-ref="0"]')).not.toBeNull();
  });

  it('renames a branch on the preview and updates the outline without a fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NO NETWORK'));
    const onEditOutline = vi.fn();
    const c = render(onEditOutline);

    click(c.querySelector('[data-ai-edit-ref="0"]') as Element);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input.value).toBe('A');
    setInputValue(input, 'Alpha');
    keydown(input, 'Enter');

    expect(onEditOutline).toHaveBeenCalledTimes(1);
    const next = onEditOutline.mock.calls[0][0] as VisualOutline;
    expect(next.title).toBe('Root');
    expect(next.items.map((item) => item.label)).toEqual(['Alpha', 'B', 'C']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stages the large preview so it can be zoomed and moved', () => {
    const c = render(() => {});
    const preview = c.querySelector('[data-ai-outline-preview]') as HTMLElement;
    expect(c.querySelector('[data-ai-outline-preview] [data-picture-zoom-value]')).not.toBeNull();
    expect(c.querySelector('[data-picture-mode="css"]')).not.toBeNull();
    // The preview has a definite height so the stage fills a real box.
    expect(preview.style.height).toBe('55%');
    expect(preview.style.maxHeight).toBe('55%');
  });

  it('adds a right-side branch from the root + and nothing else moves', () => {
    const onEditOutline = vi.fn();
    const c = render(onEditOutline);

    click(c.querySelector('[data-ai-edit-add="root:right"]') as Element);
    expect(onEditOutline).toHaveBeenCalledTimes(1);
    const next = onEditOutline.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((item) => item.label)).toEqual(['A', 'B', 'New branch', 'C']);
    expect(next.items.map((item) => item.side)).toEqual(['right', 'right', 'right', 'left']);
  });
});
