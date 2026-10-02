// @vitest-environment jsdom
//
// PATCH-250. Hovering a design tile (a real mouse, held for 120 ms) shows that
// design in the large preview read-only; leaving returns to the selected design.
// Selection, onSelect and Edit text are untouched by a hover. Touch/pen do
// nothing.
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const OUTLINE: VisualOutline = {
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
const OPTIONS = suggestDesigns(OUTLINE);

function tile(c: ParentNode, index: number): HTMLElement {
  const tiles = Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
  expect(tiles.length).toBeGreaterThan(index);
  return tiles[index];
}

/** React synthesizes onPointerEnter/onPointerLeave from pointerover/pointerout. */
function pointer(el: Element, type: 'pointerover' | 'pointerout', pointerType: string) {
  const init = { bubbles: true, cancelable: true, relatedTarget: null } as PointerEventInit;
  let ev: Event;
  try {
    ev = new PointerEvent(type, init);
  } catch {
    ev = new Event(type, { bubbles: true });
  }
  if ((ev as PointerEvent).pointerType !== pointerType) {
    Object.defineProperty(ev, 'pointerType', { value: pointerType });
  }
  act(() => { el.dispatchEvent(ev); });
}

function previewHover(c: ParentNode): string | null {
  return c.querySelector('[data-ai-preview-hover]')?.getAttribute('data-ai-preview-hover') ?? null;
}

function render(onSelect: (key: string) => void = () => {}) {
  return mount(
    <OutlineSuggestionsPanel
      options={OPTIONS}
      selectedKey={OPTIONS[0].key}
      onSelect={onSelect}
      outline={OUTLINE}
      onEditOutline={() => {}}
      envelopeFor={(option) => ({
        mode: 'diagram',
        version: 1,
        data: option.envelopeData,
        meta: { renderer: option.envelopeData.renderer, subtype: option.envelopeData.subtype },
      })}
    />,
  );
}

describe('PATCH-250 OutlineSuggestionsPanel hover preview', () => {
  it('after 120 ms a mouse hover previews that design and never selects it', () => {
    const onSelect = vi.fn();
    const c = render(onSelect);
    const hovered = tile(c, 1);
    const key = hovered.getAttribute('data-ai-outline-option') ?? '';

    vi.useFakeTimers();
    pointer(hovered, 'pointerover', 'mouse');
    // Not yet: the delay absorbs a sweep across tiles.
    expect(previewHover(c)).toBeNull();

    act(() => { vi.advanceTimersByTime(120); });
    expect(previewHover(c)).toBe(key);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaving returns the preview to the selected design with no delay', () => {
    const c = render();
    const hovered = tile(c, 1);

    vi.useFakeTimers();
    pointer(hovered, 'pointerover', 'mouse');
    act(() => { vi.advanceTimersByTime(120); });
    expect(previewHover(c)).not.toBeNull();

    pointer(hovered, 'pointerout', 'mouse');
    expect(previewHover(c)).toBeNull();
  });

  it('a pen or touch pointer never previews', () => {
    const c = render();
    const target = tile(c, 1);

    vi.useFakeTimers();
    pointer(target, 'pointerover', 'pen');
    act(() => { vi.advanceTimersByTime(120); });
    expect(previewHover(c)).toBeNull();

    pointer(target, 'pointerover', 'touch');
    act(() => { vi.advanceTimersByTime(120); });
    expect(previewHover(c)).toBeNull();
  });
});
