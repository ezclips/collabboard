// @vitest-environment jsdom
//
// PATCH-367. The owner-only "N guest posts waiting" pill: hidden at 0, its label
// pluralises, and clicking it calls onFocus when one is supplied.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PendingPostsPill from './PendingPostsPill';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof PendingPostsPill>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<PendingPostsPill count={0} {...props} />); });
}

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-367 PendingPostsPill', () => {
  it('renders nothing at 0', async () => {
    await mount({ count: 0 });
    expect(host.querySelector('[data-pending-pill="true"]')).toBeNull();
  });

  it('pluralises the count', async () => {
    await mount({ count: 1 });
    expect(host.textContent).toContain('1 guest post waiting');

    host.remove();
    await mount({ count: 4 });
    expect(host.textContent).toContain('4 guest posts waiting');
  });

  it('calls onFocus when clicked', async () => {
    const onFocus = vi.fn();
    await mount({ count: 2, onFocus });
    const pill = host.querySelector('[data-pending-pill="true"]') as HTMLButtonElement;
    expect(pill.getAttribute('data-pending-count')).toBe('2');
    await act(async () => { pill.click(); });
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('is informational (disabled) with no onFocus', async () => {
    await mount({ count: 3 });
    const pill = host.querySelector('[data-pending-pill="true"]') as HTMLButtonElement;
    expect(pill.disabled).toBe(true);
  });
});
