// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-214. Google's Picker script helper. `window.google` / `window.gapi` are
 * stubbed; the script injection and the builder calls are the things under test.
 */

import { loadGooglePicker, openGooglePicker } from './googlePickerClient';

type AnyWindow = Window & { google?: unknown; gapi?: unknown };

const SCRIPT_SELECTOR = 'script[src="https://apis.google.com/js/api.js"]';

function installGapiStub() {
  const calls = { load: [] as string[] };
  (window as AnyWindow).gapi = {
    load: (api: string, options: { callback: () => void; onerror: () => void }) => {
      calls.load.push(api);
      // The picker namespace exists by the time gapi.load resolves.
      (window as AnyWindow).google = { picker: {} } as never;
      options.callback();
    },
  };
  return calls;
}

function installGooglePickerStub() {
  const builderCalls: { oauth?: string; developerKey?: string; appId?: string; origin?: string } = {};
  let callback: ((data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => void) | null = null;
  const instance = { setVisible: vi.fn(), dispose: vi.fn() };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.addView = vi.fn(chain);
  builder.setOAuthToken = vi.fn((v: string) => { builderCalls.oauth = v; return builder; });
  builder.setDeveloperKey = vi.fn((v: string) => { builderCalls.developerKey = v; return builder; });
  builder.setAppId = vi.fn((v: string) => { builderCalls.appId = v; return builder; });
  builder.setOrigin = vi.fn((v: string) => { builderCalls.origin = v; return builder; });
  builder.setCallback = vi.fn((cb: typeof callback) => { callback = cb; return builder; });
  builder.build = vi.fn(() => instance);

  (window as AnyWindow).google = {
    picker: {
      PickerBuilder: function () { return builder; },
      DocsView: function () {
        const view: Record<string, unknown> = {};
        view.setIncludeFolders = vi.fn(() => view);
        view.setSelectFolderEnabled = vi.fn(() => view);
        return view;
      },
      ViewId: { DOCS: 'DOCS' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
    },
  } as never;

  return {
    builderCalls,
    instance,
    fire: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => callback?.(data),
  };
}

beforeEach(() => {
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((el) => el.remove());
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as AnyWindow).google;
  delete (window as AnyWindow).gapi;
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((el) => el.remove());
  vi.clearAllMocks();
});

describe('loadGooglePicker', () => {
  it('injects the script exactly once across two calls', async () => {
    const gapiCalls = installGapiStub();
    // Make the script "load" as soon as it is appended.
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      const el = node as HTMLScriptElement;
      const result = Document.prototype.appendChild.call(document.head, node);
      setTimeout(() => el.dispatchEvent(new Event('load')), 0);
      return result;
    }) as never);

    await Promise.all([loadGooglePicker(), loadGooglePicker()]);
    // Give the load event a tick.
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
    expect(gapiCalls.load).toContain('picker');
    appendSpy.mockRestore();
  });
});

describe('openGooglePicker', () => {
  it('maps a PICKED response to the doc, passing token/key/appId to the builder', () => {
    const stub = installGooglePickerStub();
    const onPicked = vi.fn();
    const onCanceled = vi.fn();

    const handle = openGooglePicker({
      accessToken: 'tok',
      apiKey: 'key',
      appId: 'app',
      onPicked,
      onCanceled,
    });

    expect(stub.builderCalls).toMatchObject({ oauth: 'tok', developerKey: 'key', appId: 'app' });
    expect(stub.instance.setVisible).toHaveBeenCalledWith(true);

    stub.fire({ action: 'picked', docs: [{ id: 'f1', name: 'Doc', mimeType: 'application/pdf' }] });
    expect(onPicked).toHaveBeenCalledWith({ id: 'f1', name: 'Doc', mimeType: 'application/pdf' });
    expect(onCanceled).not.toHaveBeenCalled();

    handle.close();
    expect(stub.instance.setVisible).toHaveBeenCalledWith(false);
    expect(stub.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('maps a CANCEL response to onCanceled', () => {
    const stub = installGooglePickerStub();
    const onPicked = vi.fn();
    const onCanceled = vi.fn();
    openGooglePicker({ accessToken: 'tok', apiKey: 'key', appId: 'app', onPicked, onCanceled });

    stub.fire({ action: 'cancel' });
    expect(onCanceled).toHaveBeenCalledTimes(1);
    expect(onPicked).not.toHaveBeenCalled();
  });
});
