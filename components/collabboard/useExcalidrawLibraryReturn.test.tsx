// @vitest-environment jsdom
//
// PATCH-299. The return hand-off from libraries.excalidraw.com: the hook reads
// `#addLibrary=<file URL>&token=<id>` once, strips the hash, imports the file's
// usable items into the user's own library, and reports the outcome.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addItemsToExcalidrawLibrary,
  fetchExcalidrawLibrary,
} from '@/lib/collabboard/excalidrawLibrary';

import { useExcalidrawLibraryReturn } from './useExcalidrawLibraryReturn';

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({
  fetchExcalidrawLibrary: vi.fn(async () => []),
  addItemsToExcalidrawLibrary: vi.fn(async (items: unknown[]) => ({
    saved: items.length,
    error: null,
  })),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const LIBRARY_URL =
  'https://libraries.excalidraw.com/libraries/excalidrawlibs/rho.excalidrawlib';

const LIBRARY_FILE = JSON.stringify({
  type: 'excalidrawlib',
  version: 1,
  library: [[{ id: 'a', type: 'rectangle' }], [{ id: 'b', type: 'ellipse' }]],
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
let uuid = 0;

function Harness() {
  useExcalidrawLibraryReturn();
  return null;
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Harness));
  });
  mounted.push({ root, container });
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `/dashboard/canvas/board${hash}`);
}

function returnHash(url = LIBRARY_URL) {
  return `#addLibrary=${encodeURIComponent(url)}&token=tok`;
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function okResponse(body: string) {
  return new Response(body, { status: 200 });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  uuid = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `id-${(uuid += 1)}` });
  vi.mocked(fetchExcalidrawLibrary).mockReset();
  vi.mocked(fetchExcalidrawLibrary).mockResolvedValue([]);
  vi.mocked(addItemsToExcalidrawLibrary).mockReset();
  vi.mocked(addItemsToExcalidrawLibrary).mockImplementation(async (items) => ({
    saved: items.length,
    error: null,
  }));
  toastMock.info.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  for (const entry of mounted) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  mounted = [];
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('PATCH-299 useExcalidrawLibraryReturn', () => {
  it('does nothing without a library-return hash', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setHash('#nothing=here');

    mount();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(addItemsToExcalidrawLibrary).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('strips the hash before the fetch resolves, saves fresh ids/sources, and toasts the count', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setHash(returnHash());

    mount();

    expect(fetchMock).toHaveBeenCalledWith(
      LIBRARY_URL,
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(window.location.hash).toBe('');

    await act(async () => {
      resolveFetch(okResponse(LIBRARY_FILE));
      await flush();
    });

    expect(addItemsToExcalidrawLibrary).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(addItemsToExcalidrawLibrary).mock.calls[0][0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(['id-1', 'id-2']);
    expect(rows.map((row) => row.source)).toEqual([
      `${LIBRARY_URL}#0`,
      `${LIBRARY_URL}#1`,
    ]);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(String(toastMock.success.mock.calls[0][0])).toContain('Added 2 items');
  });

  it('survives a Strict Mode mount/unmount cycle: the download completes and only one fetch happens', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    // Honor the AbortSignal like a real fetch: if the cleanup aborts, this
    // rejects with AbortError, exactly as the browser would -- otherwise the
    // test could never catch the Strict Mode defect it exists for.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        resolveFetch = resolve;
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    setHash(returnHash());

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');

    // Strict Mode's throwaway cleanup must not abort the download...
    act(() => root.unmount());
    container.remove();

    // ...and the re-run sees the stripped hash, so it does not fetch again.
    mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(okResponse(LIBRARY_FILE));
      await flush();
    });

    expect(addItemsToExcalidrawLibrary).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it('uses the singular form for one saved item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      okResponse(
        JSON.stringify({ type: 'excalidrawlib', version: 1, library: [[{ id: 'a', type: 'rectangle' }]] }),
      ),
    ));
    setHash(returnHash());

    mount();
    await act(async () => { await flush(); });

    expect(String(toastMock.success.mock.calls[0][0])).toContain('Added 1 item ');
  });

  it('toasts info and saves nothing when every item is already present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(LIBRARY_FILE)));
    vi.mocked(fetchExcalidrawLibrary).mockResolvedValue([
      { id: 'x', name: 'x', source: `${LIBRARY_URL}#0`, elements: [], created: 0 },
      { id: 'y', name: 'y', source: `${LIBRARY_URL}#1`, elements: [], created: 0 },
    ]);
    setHash(returnHash());

    mount();
    await act(async () => { await flush(); });

    expect(toastMock.info).toHaveBeenCalledTimes(1);
    expect(addItemsToExcalidrawLibrary).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('toasts one error when the download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    setHash(returnHash());

    mount();
    await act(async () => { await flush(); });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(addItemsToExcalidrawLibrary).not.toHaveBeenCalled();
  });

  it('toasts one error when the file is not a library', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('not json')));
    setHash(returnHash());

    mount();
    await act(async () => { await flush(); });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(String(toastMock.error.mock.calls[0][0])).toContain(
      'This is not an Excalidraw library file.',
    );
  });

  it('toasts one error when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(LIBRARY_FILE)));
    vi.mocked(addItemsToExcalidrawLibrary).mockResolvedValue({
      saved: 0,
      error: 'row level security',
    });
    setHash(returnHash());

    mount();
    await act(async () => { await flush(); });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(String(toastMock.error.mock.calls[0][0])).toContain('row level security');
  });

  it('does not fetch a disallowed host', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setHash(returnHash('https://libraries.excalidraw.com.evil.test/a.excalidrawlib'));

    mount();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
