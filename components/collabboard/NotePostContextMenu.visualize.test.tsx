// @vitest-environment jsdom
//
// PATCH-235 -- the "Visualize…" item on the Note/Document right-click menu.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NotePostContextMenu } from './menus/NotePostContextMenu';
import type { Padlet } from '@/types/collabboard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

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

const padlet = () => ({ id: 'p1', type: 'text', title: 'T', content: '<p>Body</p>', metadata: {} } as unknown as Padlet);

function openMenu(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, 'context menu did not open').not.toBeNull();
  return menu!;
}
const labels = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((el) => (el.textContent ?? '').trim());

function render(props: Record<string, unknown> = {}) {
  return mount(
    <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
      <div data-testid="trigger">post</div>
    </NotePostContextMenu>,
  );
}

describe('PATCH-235 NotePostContextMenu "Visualize…"', () => {
  it('appears right after "Edit Post" only when the prop is passed', () => {
    const menu = openMenu(render({ onEdit: vi.fn(), onVisualize: vi.fn() }));
    const list = labels(menu);
    const editAt = list.indexOf('Edit Post');
    expect(editAt).toBeGreaterThan(-1);
    expect(list[editAt + 1]).toBe('Visualize…');
  });

  it('is absent without the prop', () => {
    const list = labels(openMenu(render({ onEdit: vi.fn() })));
    expect(list).toContain('Edit Post');
    expect(list).not.toContain('Visualize…');
  });

  it('calls onVisualize when clicked', () => {
    const onVisualize = vi.fn();
    const menu = openMenu(render({ onEdit: vi.fn(), onVisualize }));
    const item = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((el) => (el.textContent ?? '').includes('Visualize'))!;
    act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onVisualize).toHaveBeenCalledTimes(1);
  });
});
