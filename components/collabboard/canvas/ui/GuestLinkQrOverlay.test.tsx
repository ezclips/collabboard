// @vitest-environment jsdom
//
// PATCH-365. The full-screen QR overlay: renders a real SVG QR, shows the URL
// and title, and closes on Escape or the close button.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GuestLinkQrOverlay from './GuestLinkQrOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const URL = 'https://app.test/share/tok-abc';

async function mount(onClose: () => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<GuestLinkQrOverlay url={URL} title="Retro" onClose={onClose} />);
  });
}

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-365 GuestLinkQrOverlay', () => {
  it('renders a real SVG QR, the title and the URL', async () => {
    await mount(() => {});
    const overlay = document.querySelector('[data-guest-qr-overlay="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.getAttribute('aria-modal')).toBe('true');
    expect(overlay?.getAttribute('aria-label')).toBe('QR code for the guest link');
    expect(document.querySelector('svg')).not.toBeNull();
    expect(overlay?.textContent).toContain('Scan to join Retro');
    expect(overlay?.textContent).toContain(URL);
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    await act(async () => {
      (document.querySelector('[data-guest-qr-close="true"]') as HTMLElement).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
