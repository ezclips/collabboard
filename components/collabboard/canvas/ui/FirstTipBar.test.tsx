// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FirstTipBar, {
  FIRST_TIP_DEFAULT_KEY,
  FIRST_TIP_DEFAULT_MESSAGE,
} from './FirstTipBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

function mount(props: React.ComponentProps<typeof FirstTipBar> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<FirstTipBar {...props} />); });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  document.body.innerHTML = '';
  window.localStorage.clear();
});

const tip = () => host.querySelector('[data-first-tip]');
const closeButton = () => host.querySelector('button[aria-label="Close tip"]') as HTMLButtonElement | null;

describe('FirstTipBar (PATCH-381)', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the tip and message on a first visit', () => {
    mount();
    expect(tip()).not.toBeNull();
    expect(tip()?.textContent).toContain(FIRST_TIP_DEFAULT_MESSAGE);
  });

  it('closing remembers it for the next visit', () => {
    mount();
    act(() => { closeButton()!.click(); });
    expect(tip()).toBeNull();
    expect(window.localStorage.getItem(FIRST_TIP_DEFAULT_KEY)).toBe('1');

    act(() => root?.unmount());
    host.remove();
    mount();
    expect(tip()).toBeNull();
  });

  it('does not show when already dismissed', () => {
    window.localStorage.setItem(FIRST_TIP_DEFAULT_KEY, '1');
    mount();
    expect(tip()).toBeNull();
  });

  it('shows again rather than throwing when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      mount();
      expect(tip()).not.toBeNull();
      // Dismissing must not throw either.
      expect(() => act(() => { closeButton()!.click(); })).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('reports visibility so a host can hide its own bottom hint', () => {
    const onVisibilityChange = vi.fn();
    mount({ onVisibilityChange });
    expect(onVisibilityChange).toHaveBeenCalledWith(true);

    act(() => { closeButton()!.click(); });
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('reports not-visible when already dismissed', () => {
    window.localStorage.setItem(FIRST_TIP_DEFAULT_KEY, '1');
    const onVisibilityChange = vi.fn();
    mount({ onVisibilityChange });
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });
});
