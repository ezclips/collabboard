// @vitest-environment jsdom
//
// PATCH-366. The frozen-board banner: nothing when open, the visitor copy for a
// non-owner, the owner copy with an Unfreeze button for the owner.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FrozenBoardBanner from './FrozenBoardBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof FrozenBoardBanner>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FrozenBoardBanner frozen={false} isOwnerOrAdmin={false} {...props} />);
  });
}

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-366 FrozenBoardBanner', () => {
  it('renders nothing when the board is open', async () => {
    await mount({ frozen: false });
    expect(host.querySelector('[data-frozen-banner="true"]')).toBeNull();
  });

  it('shows the visitor copy to a non-owner, with no Unfreeze button', async () => {
    await mount({ frozen: true, isOwnerOrAdmin: false });
    expect(host.textContent).toContain('This board is frozen. You can look, but not change anything.');
    expect(host.querySelector('[data-frozen-unfreeze="true"]')).toBeNull();
  });

  it('shows the owner copy and an Unfreeze button to the owner', async () => {
    const onUnfreeze = vi.fn();
    await mount({ frozen: true, isOwnerOrAdmin: true, onUnfreeze });
    expect(host.textContent).toContain('Board frozen. Only you can change it.');
    const button = host.querySelector('[data-frozen-unfreeze="true"]') as HTMLElement;
    expect(button).not.toBeNull();
    await act(async () => { button.click(); });
    expect(onUnfreeze).toHaveBeenCalledTimes(1);
  });
});
