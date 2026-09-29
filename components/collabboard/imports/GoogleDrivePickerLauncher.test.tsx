// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-214. The Google Picker launcher. Google's script (`googlePickerClient`)
 * and the network functions are mocked; the launcher's own state machine is real.
 */

const h = vi.hoisted(() => ({
  token: vi.fn(),
  resolve: vi.fn(),
  load: vi.fn(),
  open: vi.fn(),
  lastOpen: null as null | {
    accessToken: string;
    apiKey: string;
    appId: string;
    onPicked: (doc: { id: string; name: string; mimeType: string }) => void;
    onCanceled: () => void;
  },
  close: vi.fn(),
  authError: class extends Error {},
}));

vi.mock('@/lib/imports/clientApi', () => ({
  ImportAuthError: h.authError,
  getGooglePickerToken: h.token,
  resolveImportSelection: h.resolve,
}));

vi.mock('@/lib/imports/googlePickerClient', () => ({
  loadGooglePicker: h.load,
  openGooglePicker: (options: typeof h.lastOpen) => {
    h.lastOpen = options;
    h.open(options);
    return { close: h.close };
  },
}));

import GoogleDrivePickerLauncher from './GoogleDrivePickerLauncher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(props: Partial<React.ComponentProps<typeof GoogleDrivePickerLauncher>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <GoogleDrivePickerLauncher
        onSelectItem={props.onSelectItem ?? vi.fn()}
        onClose={props.onClose ?? vi.fn()}
        onReconnectRequired={props.onReconnectRequired}
        onPickerOpenChange={props.onPickerOpenChange}
        canResolveSelection={props.canResolveSelection}
      />,
    );
  });
  await settle();
  return host;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', 'test-picker-key');
  h.token.mockResolvedValue({ accessToken: 'picker-token', appId: '123456789012' });
  h.load.mockResolvedValue(undefined);
  h.lastOpen = null;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GoogleDrivePickerLauncher', () => {
  it('loads the script and opens the picker with the token and key', async () => {
    await mount();
    expect(h.load).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.lastOpen).toMatchObject({
      accessToken: 'picker-token',
      apiKey: 'test-picker-key',
      appId: '123456789012',
    });
  });

  it('a pick resolves the doc id and hands the result to onSelectItem', async () => {
    h.resolve.mockResolvedValue({
      previewImageUrl: 'https://x/y.png', openUrl: 'https://drive/x', name: 'Doc',
      mimeType: 'application/pdf', provider: 'google-drive', itemId: 'file-1', kind: 'document',
    });
    const onSelectItem = vi.fn();
    await mount({ onSelectItem });

    await act(async () => {
      await h.lastOpen!.onPicked({ id: 'file-1', name: 'Doc', mimeType: 'application/pdf' });
    });

    expect(h.resolve).toHaveBeenCalledTimes(1);
    expect(h.resolve.mock.calls[0][0]).toMatchObject({
      provider: 'google-drive', itemId: 'file-1', name: 'Doc', mimeType: 'application/pdf',
    });
    expect(onSelectItem).toHaveBeenCalledTimes(1);
  });

  it('a cancel calls onClose', async () => {
    const onClose = vi.fn();
    await mount({ onClose });
    act(() => h.lastOpen!.onCanceled());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('canResolveSelection false -> no resolve', async () => {
    const onSelectItem = vi.fn();
    await mount({ onSelectItem, canResolveSelection: () => false });

    await act(async () => {
      await h.lastOpen!.onPicked({ id: 'file-1', name: 'Doc', mimeType: 'application/pdf' });
    });

    expect(h.resolve).not.toHaveBeenCalled();
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it('reports picker visibility to the host', async () => {
    const onPickerOpenChange = vi.fn();
    await mount({ onPickerOpenChange });
    expect(onPickerOpenChange).toHaveBeenCalledWith(true);
  });

  it('closes the picker on unmount', async () => {
    await mount();
    expect(h.close).not.toHaveBeenCalled();
    act(() => root?.unmount());
    root = null;
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('a missing picker key shows the message and opens nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', '');
    await mount();
    expect(host!.textContent).toContain('Google Drive import is not set up yet');
    expect(h.token).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
  });

  it('a picker-token 401 calls onReconnectRequired', async () => {
    h.token.mockRejectedValue(new h.authError('Unauthorized'));
    const onReconnectRequired = vi.fn();
    await mount({ onReconnectRequired });
    expect(onReconnectRequired).toHaveBeenCalledTimes(1);
  });

  it('a failed token fetch shows an error, and "Try again" refetches and opens the picker', async () => {
    h.token.mockRejectedValueOnce(new Error('boom'));
    h.token.mockResolvedValueOnce({ accessToken: 'picker-token', appId: '123456789012' });
    await mount();
    expect(h.token).toHaveBeenCalledTimes(1);
    expect(host!.textContent).toContain('Could not open Google Drive');

    const tryAgain = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    await act(async () => { (tryAgain as HTMLButtonElement).click(); });
    await settle();

    expect(h.token).toHaveBeenCalledTimes(2);
    expect(h.open).toHaveBeenCalledTimes(1);
  });

  it('a load failure shows the error state', async () => {
    h.load.mockRejectedValue(new Error('no script'));
    await mount();
    expect(host!.textContent).toContain('Could not open Google Drive');
  });

  it('REGRESSION: new callback identities do not reopen the picker, and the pick uses the latest onSelectItem', async () => {
    h.resolve.mockResolvedValue({
      previewImageUrl: 'https://x/y.png', openUrl: 'https://drive/x', name: 'Doc',
      mimeType: 'application/pdf', provider: 'google-drive', itemId: 'file-1', kind: 'document',
    });
    const onSelectItemA = vi.fn();
    const onSelectItemB = vi.fn();
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();

    // Render with callback identity A, reach ready (picker opens once).
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const render = (onSelectItem: (r: unknown) => void, onClose: () => void) =>
      root!.render(
        <GoogleDrivePickerLauncher onSelectItem={onSelectItem as never} onClose={onClose} />,
      );
    await act(async () => { render(onSelectItemA, onCloseA); });
    await settle();
    expect(h.open).toHaveBeenCalledTimes(1);

    // Re-render with NEW callback identities, as ImportsDialog does every render.
    await act(async () => { render(onSelectItemB, onCloseB); });
    await settle();

    // The picker was NOT reopened by the identity change.
    expect(h.open).toHaveBeenCalledTimes(1);

    // A subsequent pick calls B's onSelectItem, not A's.
    await act(async () => {
      await h.lastOpen!.onPicked({ id: 'file-1', name: 'Doc', mimeType: 'application/pdf' });
    });
    expect(onSelectItemB).toHaveBeenCalledTimes(1);
    expect(onSelectItemA).not.toHaveBeenCalled();

    // And cancel uses B's onClose.
    act(() => h.lastOpen!.onCanceled());
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();
  });
});
