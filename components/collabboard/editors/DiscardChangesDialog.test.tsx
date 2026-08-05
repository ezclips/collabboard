// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiscardChangesDialog from './DiscardChangesDialog';

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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});
function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function btn(c: HTMLElement, text: string) {
  return Array.from(c.querySelectorAll('button')).find((b) => b.textContent === text)!;
}

describe('DiscardChangesDialog (PATCH-149B2-i §32.8)', () => {
  it('is an accessible alertdialog with an unsaved-changes message and exactly two actions', () => {
    const c = mount(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    const dialog = c.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(c.textContent).toMatch(/unsaved/i);
    expect(c.querySelectorAll('button')).toHaveLength(2);
    expect(btn(c, 'Keep editing')).not.toBeNull();
    expect(btn(c, 'Discard changes')).not.toBeNull();
    expect(c.textContent).not.toMatch(/^Save$/m);
  });

  it('focuses "Keep editing" initially (the safe default)', () => {
    const c = mount(<DiscardChangesDialog onKeepEditing={vi.fn()} onDiscard={vi.fn()} />);
    expect(document.activeElement).toBe(btn(c, 'Keep editing'));
  });

  it('invokes the matching callback exactly once per action, and clicks on its own backdrop do not bubble out', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    const c = mount(<DiscardChangesDialog onKeepEditing={onKeepEditing} onDiscard={onDiscard} />);
    click(c.firstElementChild!); // own backdrop
    expect(onKeepEditing).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    click(btn(c, 'Keep editing'));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    click(btn(c, 'Discard changes'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
