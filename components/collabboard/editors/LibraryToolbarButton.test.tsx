// @vitest-environment jsdom
//
// PATCH-291. The drawing post's library button: ONE real button, next to the
// draw toolbar, with literal colours that Excalidraw's theme variables cannot
// redirect, toggling the DEFAULT sidebar, and positioned left of the toolbar's
// right edge + 12 px. Hidden until measured; not rendered read-only.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryToolbarButton, { type LibraryToolbarButtonApi } from './LibraryToolbarButton';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

let mounted: Array<{ root: Root; host: HTMLElement; container: HTMLElement }> = [];

interface Harness {
  api: LibraryToolbarButtonApi;
  toggle: ReturnType<typeof vi.fn>;
  setAppState: (state: { openSidebar: { name: string } | null }) => void;
  fire: () => void;
}

function mountButton(options: { withToolbar?: boolean; readOnly?: boolean } = {}) {
  const { withToolbar = true, readOnly = false } = options;
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = document.createElement('div');
  container.appendChild(root);
  if (withToolbar) {
    const toolbar = document.createElement('div');
    toolbar.className = 'Island App-toolbar';
    toolbar.getBoundingClientRect = () =>
      rect({ left: 100, top: 40, right: 300, bottom: 80, width: 200, height: 40 });
    root.appendChild(toolbar);
  }
  root.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 0, bottom: 0 });

  let appState: { openSidebar: { name: string; tab?: string } | null } = { openSidebar: null };
  const listeners = new Set<() => void>();
  const toggle = vi.fn();
  const api: LibraryToolbarButtonApi = {
    getAppState: () => appState,
    onChange: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    toggleSidebar: toggle,
  };

  const host = document.createElement('div');
  root.appendChild(host);
  const reactRoot = createRoot(host);
  act(() => {
    reactRoot.render(
      <LibraryToolbarButton
        getApi={() => api}
        rootRef={{ current: root }}
        readOnly={readOnly}
      />,
    );
  });
  mounted.push({ root: reactRoot, host, container });

  return {
    host,
    api,
    toggle,
    setAppState: (state: { openSidebar: { name: string; tab?: string } | null }) => {
      appState = state;
    },
    fire: () => {
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

function button(host: HTMLElement): HTMLButtonElement | null {
  return host.querySelector('[data-drawing-library-button]');
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
  delete (globalThis as any).ResizeObserver;
});

describe('PATCH-291: LibraryToolbarButton', () => {
  it('renders the Library icon button with literal colours, never palette classes', () => {
    const { host } = mountButton();
    const el = button(host);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('aria-label')).toBe('Open library');
    expect(el!.getAttribute('title')).toBe('Open library');
    expect(el!.getAttribute('aria-pressed')).toBe('false');
    expect(el!.querySelector('svg')).not.toBeNull();

    const classes = el!.className;
    expect(classes).toContain('text-[#374151]');
    expect(classes).toContain('hover:bg-[#f1f0ff]');
    expect(classes).not.toContain('gray-100');
    expect(classes).not.toContain('blue-100');
  });

  it('calls toggleSidebar({ name: "default", tab: "library" }) exactly once on click', () => {
    const { host, toggle } = mountButton();
    act(() => {
      button(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith({ name: 'default', tab: 'library' });
  });

  it('follows openSidebar: aria-pressed and the active colours', () => {
    const harness = mountButton();
    expect(button(harness.host)!.getAttribute('aria-pressed')).toBe('false');

    // Active for the DEFAULT sidebar on ANY tab (the library tab is set when
    // we open it, but the state must not flicker off if the user picks a tab).
    harness.setAppState({ openSidebar: { name: 'default', tab: 'library' } });
    harness.fire();

    const el = button(harness.host)!;
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.className).toContain('bg-[#dbeafe]');
    expect(el.className).toContain('text-[#1d4ed8]');

    harness.setAppState({ openSidebar: { name: 'default', tab: 'comments' } });
    harness.fire();
    expect(button(harness.host)!.getAttribute('aria-pressed')).toBe('true');

    harness.setAppState({ openSidebar: { name: 'something-else' } });
    harness.fire();
    expect(button(harness.host)!.getAttribute('aria-pressed')).toBe('false');
  });

  it('positions itself at the toolbar right edge + 12 px, vertically centred', () => {
    const { host } = mountButton();
    const box = host.querySelector('[data-drawing-library-button]')!.parentElement as HTMLElement;
    expect(box.style.left).toBe('312px');
    expect(box.style.top).toBe('60px');
    expect(box.style.transform).toBe('translateY(-50%)');
    expect(box.style.visibility).toBe('visible');
  });

  it('stays hidden until a toolbar is measured', () => {
    const { host } = mountButton({ withToolbar: false });
    const box = host.querySelector('[data-drawing-library-button]')!.parentElement as HTMLElement;
    expect(box.style.visibility).toBe('hidden');
    expect(box.style.left).toBe('');
  });

  it('is not rendered read-only', () => {
    const { host } = mountButton({ readOnly: true });
    expect(button(host)).toBeNull();
  });
});
