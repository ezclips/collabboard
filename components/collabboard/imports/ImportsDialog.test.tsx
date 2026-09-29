// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-214. The dialog with the REAL GoogleDrivePickerLauncher. Only Google's
 * React wrapper and the network functions are mocked.
 *
 * This is the regression test for the remount loop: the dialog must keep the
 * launcher in ONE tree position, so the token is fetched once and the picker
 * mounts once -- not once per status flip.
 */

const h = vi.hoisted(() => ({
  status: vi.fn(),
  token: vi.fn(),
  resolve: vi.fn(),
  load: vi.fn(),
  open: vi.fn(),
  lastOpen: null as null | {
    onPicked: (doc: { id: string; name: string; mimeType: string }) => void;
    onCanceled: () => void;
  },
  pickerMounts: 0,
}));

vi.mock('@/lib/imports/clientApi', () => ({
  ImportAuthError: class extends Error {},
  getImportProviderStatus: h.status,
  getGooglePickerToken: h.token,
  resolveImportSelection: h.resolve,
}));

// Google's script helper, mocked. `openGooglePicker` bumping `pickerMounts`
// stands in for the picker appearing.
vi.mock('@/lib/imports/googlePickerClient', () => ({
  loadGooglePicker: h.load,
  openGooglePicker: (options: typeof h.lastOpen) => {
    h.lastOpen = options;
    h.pickerMounts += 1;
    h.open(options);
    return { close: vi.fn() };
  },
}));

vi.mock('./ImportBrowser', () => ({
  default: () => React.createElement('div', { 'data-testid': 'import-browser' }),
}));
vi.mock('./ConnectionRequiredDialog', () => ({
  default: () => React.createElement('div', { 'data-testid': 'connection-required' }),
}));

import ImportsDialog from './ImportsDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** Flush pending microtasks across several ticks. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function overlayEl(): HTMLElement | null {
  // The overlay is the fixed portal root that also contains our dialog box.
  return document.body.querySelector('div.fixed.inset-0.z-\\[4200\\]');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', 'test-picker-key');
  h.lastOpen = null;
  h.pickerMounts = 0;
  h.load.mockResolvedValue(undefined);
  h.status.mockResolvedValue({ provider: 'google-drive', connected: true, email: null });
  h.token.mockResolvedValue({ accessToken: 'picker-token', appId: '123456789012' });
  h.resolve.mockResolvedValue({
    previewImageUrl: 'https://x/y.png',
    openUrl: 'https://drive/x',
    name: 'Doc',
    mimeType: 'application/pdf',
    provider: 'google-drive',
    itemId: 'file-1',
    kind: 'document',
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ImportsDialog
        isOpen
        initialProvider="google-drive"
        onClose={vi.fn()}
        onImportResolved={vi.fn()}
      />,
    );
  });
  await settle();
}

describe('ImportsDialog + the real launcher (remount regression)', () => {
  it('fetches the picker token exactly once and mounts the picker once', async () => {
    await mount();
    // The status check resolved, the launcher fetched the token once, and the
    // picker is up -- exactly once, not once per status flip.
    expect(h.token).toHaveBeenCalledTimes(1);
    expect(h.pickerMounts).toBe(1);
  });

  it('hides our own overlay while Google’s picker is up', async () => {
    await mount();
    const overlay = overlayEl();
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain('invisible');
    expect(overlay!.className).toContain('pointer-events-none');
  });

  it('after a pick, the resolving state is visible in our (now visible) dialog', async () => {
    await mount();
    // Hold the resolve open so the resolving state can be observed.
    let release!: (v: unknown) => void;
    h.resolve.mockImplementation(() => new Promise((r) => { release = r; }));

    await act(async () => {
      void h.lastOpen!.onPicked({ id: 'file-1', name: 'Doc', mimeType: 'application/pdf' });
    });
    await settle();

    // The picker has closed, so our chrome is visible again, showing progress.
    expect(document.body.textContent).toContain('Adding to the board');
    const overlay = overlayEl();
    expect(overlay!.className).not.toContain('invisible');

    await act(async () => {
      release({
        previewImageUrl: 'https://x/y.png',
        openUrl: 'https://drive/x',
        name: 'Doc',
        mimeType: 'application/pdf',
        provider: 'google-drive',
        itemId: 'file-1',
        kind: 'document',
      });
      await Promise.resolve();
    });
    expect(h.resolve).toHaveBeenCalledTimes(1);
  });
});

describe('ImportsDialog provider screen', () => {
  it('OneDrive renders ImportBrowser, never the Picker launcher', async () => {
    h.status.mockResolvedValue({ provider: 'microsoft-onedrive', connected: true, email: null });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ImportsDialog isOpen initialProvider="microsoft-onedrive" onClose={vi.fn()} onImportResolved={vi.fn()} />,
      );
    });
    await settle();

    expect(document.body.querySelector('[data-testid="import-browser"]')).not.toBeNull();
    expect(h.token).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
  });
});
