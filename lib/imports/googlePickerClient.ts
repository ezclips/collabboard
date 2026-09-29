// PATCH-214. Google's official Picker, loaded as Google's own web guide does.
//
// The `@googleworkspace/drive-picker-react` wrapper was dropped: it is a 1.8 KB
// event-glue package over the same `api.js` script, it is ESM-only (its `exports`
// has only an `import` condition), and Next's client compile could not resolve it
// ("Package path . is not exported"), breaking the whole board page. Loading the
// script directly removes the dependency and the build risk.
//
// https://developers.google.com/workspace/drive/picker/guides/web-picker

/** The one script the Picker needs. */
const GAPI_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

/** How long to wait for the script + `gapi.load('picker')` before giving up. */
const PICKER_LOAD_TIMEOUT_MS = 20_000;

// ---- Minimal local types for the globals this helper touches ---------------

interface GooglePickerDoc {
  id: string;
  name: string;
  mimeType: string;
}

interface GooglePickerResponse {
  action: string;
  docs?: GooglePickerDoc[];
}

interface GooglePickerInstance {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface GooglePickerBuilder {
  addView(view: unknown): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setAppId(appId: string): GooglePickerBuilder;
  setOrigin(origin: string): GooglePickerBuilder;
  setCallback(cb: (data: GooglePickerResponse) => void): GooglePickerBuilder;
  build(): GooglePickerInstance;
}

interface GooglePickerDocsView {
  setIncludeFolders(v: boolean): GooglePickerDocsView;
  setSelectFolderEnabled(v: boolean): GooglePickerDocsView;
}

interface GooglePickerNamespace {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new (viewId: string) => GooglePickerDocsView;
  ViewId: { DOCS: string };
  Action: { PICKED: string; CANCEL: string };
}

interface GapiNamespace {
  load(api: string, options: { callback: () => void; onerror: () => void }): void;
}

interface GoogleGlobal {
  picker: GooglePickerNamespace;
}

declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: GapiNamespace;
  }
}

// ---------------------------------------------------------------------------

/**
 * Injects Google's `api.js` exactly ONCE and resolves when `gapi` is present AND
 * `google.picker` has finished loading. A second call while the first is in
 * flight reuses the same promise, so concurrent launchers fetch one script.
 * Resolves immediately when the picker is already available.
 */
let loadPromise: Promise<void> | null = null;

export function loadGooglePicker(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker can only load in a browser'));
  }
  // Already loaded.
  if (window.gapi && window.google?.picker) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      // A failed load must not be cached, or a later retry could never succeed.
      loadPromise = null;
      reject(new Error(reason));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => fail('Google Picker did not load in time'), PICKER_LOAD_TIMEOUT_MS);

    const loadPickerApi = () => {
      if (!window.gapi) {
        fail('gapi is unavailable');
        return;
      }
      window.gapi.load('picker', {
        callback: () => {
          clearTimeout(timer);
          if (window.google?.picker) succeed();
          else fail('Google Picker is unavailable');
        },
        onerror: () => {
          clearTimeout(timer);
          fail('Google Picker failed to load');
        },
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GAPI_SCRIPT_SRC}"]`);
    if (existing) {
      // The script is already in the document; wait for it to finish.
      if (existing.dataset.loaded === 'true') loadPickerApi();
      else existing.addEventListener('load', loadPickerApi, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      loadPickerApi();
    });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      fail('Google Picker script failed to load');
    });
    document.head.appendChild(script);
  });

  return loadPromise;
}

export interface OpenGooglePickerOptions {
  accessToken: string;
  apiKey: string;
  appId: string;
  onPicked: (doc: GooglePickerDoc) => void;
  onCanceled: () => void;
}

/**
 * Builds and shows Google's Picker. ASSUMES `loadGooglePicker()` has resolved.
 * Returns a handle whose `close()` hides and disposes it.
 */
export function openGooglePicker(options: OpenGooglePickerOptions): { close(): void } {
  const pickerNs = window.google!.picker;
  const view = new pickerNs.DocsView(pickerNs.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);

  const picker = new pickerNs.PickerBuilder()
    .addView(view)
    .setOAuthToken(options.accessToken)
    .setDeveloperKey(options.apiKey)
    .setAppId(options.appId)
    .setOrigin(window.location.origin)
    .setCallback((data) => {
      if (data.action === pickerNs.Action.PICKED) {
        const doc = data.docs?.[0];
        if (doc) options.onPicked({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
      } else if (data.action === pickerNs.Action.CANCEL) {
        options.onCanceled();
      }
    })
    .build();

  picker.setVisible(true);

  return {
    close() {
      try {
        picker.setVisible(false);
        picker.dispose();
      } catch {
        // Already disposed by Google; closing twice must not throw.
      }
    },
  };
}
