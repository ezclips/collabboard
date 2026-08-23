// @vitest-environment jsdom
//
// PATCH P6D -- the first persistent Knowledge read surface.
//
// Everything here is behavioural except the two source scans at the end, which
// prove absences (no PDF rendering, no client-side role gating) that no render
// can demonstrate. Those scans run against comment-stripped code: the
// component's own comments name the things it deliberately avoids.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentsList from './KnowledgeDocumentsList';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: BOARD_ID }),
}));

const componentCode = fs
  .readFileSync(path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentsList.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const sidebarCode = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/canvas/ui/CanvasSidebar.tsx'),
  'utf8',
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    boardId: BOARD_ID,
    originalFilename: 'EMG_checklist.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1024,
    pageCount: 2,
    processingStatus: 'ready',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:02.000Z',
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/knowledge/warm')
    ? jsonResponse({ ok: true })
    : jsonResponse({ documents: [] }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  root = null;
  host = null;
  globalThis.fetch = originalFetch;
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderList(refreshToken = 0, isOpen = true, onClose = vi.fn()): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<KnowledgeDocumentsList refreshToken={refreshToken} isOpen={isOpen} onClose={onClose} />);
  });
  await settle();
  return host;
}

async function rerender(refreshToken: number, isOpen = true, onClose = vi.fn()) {
  await act(async () => {
    root!.render(<KnowledgeDocumentsList refreshToken={refreshToken} isOpen={isOpen} onClose={onClose} />);
  });
  await settle();
}

async function flushMicrotasks() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

function typeIntoSearch(container: HTMLElement, value: string) {
  const input = container.querySelector('input[aria-label="Search Knowledge"]') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitSearch(container: HTMLElement) {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('P6D Knowledge documents read surface', () => {
  it('issues exactly one GET for the current board on mount', async () => {
    await renderList();

    const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith(`/api/boards/${BOARD_ID}/knowledge`)) as [string, RequestInit | undefined];
    expect(url).toBe(`/api/boards/${BOARD_ID}/knowledge`);
    expect(init?.method).toBe('GET');
    const warmCall = fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/warm'));
    expect(warmCall).toHaveLength(1);
    expect(warmCall[0][0]).toBe(`/api/boards/${BOARD_ID}/knowledge/warm`);
    expect(warmCall[0][1]?.method).toBe('POST');
    expect(warmCall[0][1]?.body).toBeUndefined();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/search'))).toHaveLength(0);
  });

  it('does not prewarm while the Knowledge modal is closed', async () => {
    await renderList(0, false);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/warm'))).toHaveLength(0);
  });

  it('renders an already-attached PDF by its original filename', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc()] }));

    const container = await renderList();

    expect(container.textContent).toContain('EMG_checklist.pdf');
  });

  it('opens only a ready PDF through the same-origin original route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc()] }));
    const container = await renderList();
    const link = container.querySelector('a') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe(`/api/boards/${BOARD_ID}/knowledge/doc-1/original`);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');

    for (const [index, processingStatus] of ['uploaded', 'processing', 'failed'].entries()) {
      fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ processingStatus })] }));
      await rerender(index + 1);
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('EMG_checklist.pdf');
    }
  });

  it('fetches page details only after View text and returns to the list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [doc()] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({
        document: { id: 'doc-1', originalFilename: 'EMG_checklist.pdf', pageCount: 2 },
        pages: [
          { pageNumber: 1, text: 'Page one extracted text' },
          { pageNumber: 2, text: 'Page two\nwith readable lines' },
        ],
      }));
    const container = await renderList();
    const viewText = container.querySelector('button:not([aria-label])') as HTMLButtonElement;

    await act(async () => {
      viewText.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();

    expect(fetchMock.mock.calls.find(([input]) => String(input).endsWith('/pages'))?.[0]).toBe(`/api/boards/${BOARD_ID}/knowledge/doc-1/pages`);
    expect(container.textContent).toContain('EMG_checklist.pdf');
    expect(container.textContent).toContain('2 pages');
    expect(container.textContent).toContain('Page 1');
    expect(container.textContent).toContain('Page one extracted text');
    expect(container.textContent).toContain('Page 2');
    expect(container.textContent).toContain('Page two\nwith readable lines');
    expect(container.querySelector('iframe, embed, object')).toBeNull();

    const back = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Back to PDFs'))!;
    await act(async () => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('View text');
  });

  it('shows details errors and empty-page responses without blocking the modal', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [doc()] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({
        document: { id: 'doc-1', originalFilename: 'EMG_checklist.pdf', pageCount: 2 },
        pages: [],
      }));
    const emptyContainer = await renderList();
    await act(async () => {
      emptyContainer.querySelector('button:not([aria-label])')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(emptyContainer.textContent).toContain('No extracted text available.');

    const back = Array.from(emptyContainer.querySelectorAll('button')).find((button) => button.textContent?.includes('Back to PDFs'))!;
    await act(async () => {
      back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [doc()] }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Unavailable' }, 503));
    await rerender(1, true);
    await act(async () => {
      emptyContainer.querySelector('button:not([aria-label])')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(emptyContainer.textContent).toContain('Extracted text unavailable.');
  });

  it('shows View text only for ready documents', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc()] }));
    const container = await renderList();
    expect(container.textContent).toContain('View text');

    for (const [index, processingStatus] of ['uploaded', 'processing', 'failed'].entries()) {
      fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ processingStatus })] }));
      await rerender(index + 1);
      expect(container.textContent).not.toContain('View text');
    }
  });

  it('pluralises the page count and pairs it with the status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ pageCount: 2 })] }));
    expect((await renderList()).textContent).toContain('2 pages · Ready');
  });

  it('renders a single page without pluralising', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ pageCount: 1 })] }));
    expect((await renderList()).textContent).toContain('1 page · Ready');
  });

  it('omits page metadata entirely when the page count is null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      documents: [doc({ pageCount: null, processingStatus: 'processing' })],
    }));

    const text = (await renderList()).textContent ?? '';
    expect(text).toContain('EMG_checklist.pdf');
    expect(text).toContain('Processing');
    expect(text).not.toContain('null');
    expect(text).not.toContain('NaN');
    expect(text).not.toMatch(/\d+\s+pages?/);
  });

  const STATUS_CASES: ReadonlyArray<readonly [string, string]> = [
    ['uploaded', 'Uploaded'],
    ['processing', 'Processing…'],
    ['ready', 'Ready'],
    ['failed', 'Failed'],
  ];

  for (const [processingStatus, label] of STATUS_CASES) {
    it(`renders processingStatus ${processingStatus} as ${label}`, async () => {
      fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ processingStatus })] }));
      expect((await renderList()).textContent).toContain(label);
    });
  }

  it('shows the empty state when the board has no PDFs', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [] }));
    expect((await renderList()).textContent).toContain('No PDFs added yet.');
  });

  it('degrades to an unavailable notice when the GET fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403));

    const text = (await renderList()).textContent ?? '';
    expect(text).toContain('Knowledge documents unavailable.');
    expect(text).not.toContain('Forbidden');
  });

  it('does not crash the surface on a malformed response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));

    const container = await renderList();

    expect(container.querySelector('[data-knowledge-documents]')).not.toBeNull();
    expect(container.textContent).toContain('Knowledge documents unavailable.');
  });

  it('drops individual malformed rows and still renders the valid ones', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      documents: [null, 42, { id: 'no-name' }, doc({ id: 'doc-2', originalFilename: 'valid.pdf' })],
    }));

    const container = await renderList();

    expect(container.textContent).toContain('valid.pdf');
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });

  it('renders whatever the server returned, with no client-side editor filtering', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      documents: [
        doc({ id: 'a', originalFilename: 'viewer-visible.pdf' }),
        doc({ id: 'b', originalFilename: 'second.pdf', processingStatus: 'failed', pageCount: null }),
      ],
    }));

    const container = await renderList();

    expect(container.textContent).toContain('viewer-visible.pdf');
    expect(container.textContent).toContain('second.pdf');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    // `readOnly` is deliberately absent from this list: under /i it is
    // indistinguishable from TypeScript's own `readonly` modifier, which this
    // component uses for immutable state, and would fail on that alone.
    expect(componentCode).not.toMatch(/canEdit|isEditor|isViewer|permission|collaborator/i);
  });

  it('refetches when the parent bumps the refresh token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ processingStatus: 'uploaded' })] }));
    const container = await renderList(0);
    expect(container.textContent).toContain('Uploaded');

    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc({ processingStatus: 'ready' })] }));
    await rerender(1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('Ready');
  });

  it('uses a centered modal shell with close and reopen behavior', async () => {
    const onClose = vi.fn();
    const container = await renderList(0, true, onClose);
    const surface = container.querySelector('[data-knowledge-documents]') as HTMLElement;

    expect(surface.className).toContain('fixed inset-0');
    expect(surface.className).toContain('items-center');
    expect(surface.className).not.toContain('left-full');
    surface.querySelector('button[aria-label="Close Knowledge"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();

    await rerender(0, false, onClose);
    expect(container.querySelector('[data-knowledge-documents]')).toBeNull();
    await rerender(0, true, onClose);
    expect(container.querySelector('[data-knowledge-documents]')).not.toBeNull();
  });

  it('keeps Add PDF separate from the Knowledge trigger', () => {
    expect(sidebarCode).toContain("if (type === 'knowledge-pdf')");
    expect(sidebarCode).toContain('knowledgePdfUploaderRef.current?.openPicker()');
    expect(sidebarCode).toContain('data-knowledge-trigger="true"');
    expect(sidebarCode).toContain('onClick={() => setKnowledgeOpen(true)}');
    expect(sidebarCode).toContain('isOpen={knowledgeOpen}');
    expect(sidebarCode).toContain('onClose={() => setKnowledgeOpen(false)}');
  });

  it('is a read surface only: it neither renders PDF content nor creates posts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc()] }));

    const container = await renderList();

    expect(container.querySelector('iframe, embed, object, canvas, img')).toBeNull();
    expect(container.querySelector('a[download]')).toBeNull();
    expect(componentCode).not.toMatch(/pdfjs|getDocument\(|createPost|addPost|handleToolClick|storagePath/i);
  });

  it('does not search on mount, typing, or an empty submitted query', async () => {
    const container = await renderList();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/knowledge/search'))).toHaveLength(0);

    typeIntoSearch(container, '   ');
    await settle();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/knowledge/search'))).toHaveLength(0);
    await submitSearch(container);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/knowledge/search'))).toHaveLength(0);
  });

  it('submits only the trimmed query to the same-origin board search route', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const container = await renderList();

    typeIntoSearch(container, '  evacuation plan  ');
    await submitSearch(container);

    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/knowledge/search')) as [string, RequestInit];
    expect(searchCall[0]).toBe(`/api/boards/${BOARD_ID}/knowledge/search`);
    expect(searchCall[1].method).toBe('POST');
    expect(searchCall[1].body).toBe(JSON.stringify({ query: 'evacuation plan' }));
    expect(searchCall[1].headers).toEqual({ 'content-type': 'application/json' });
    expect(Object.keys(searchCall[1])).toEqual(['method', 'headers', 'body', 'signal']);
  });

  it('renders safe result metadata while preserving the PDF list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [doc()] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({
        results: [
          {
            originalFilename: 'Good.pdf',
            pageStart: 1,
            pageEnd: 1,
            text: '<b>Evacuation</b>\nRoute to exit',
            similarity: 0.99,
            model: 'hidden-model',
            vector: [1, 2, 3],
          },
          { originalFilename: 'malformed.pdf', pageStart: 0, pageEnd: 1, text: 'drop me' },
        ],
      }));
    const container = await renderList();

    typeIntoSearch(container, 'exit');
    await submitSearch(container);

    expect(container.textContent).toContain('Good.pdf');
    expect(container.textContent).toContain('Page 1');
    expect(container.textContent).toContain('<b>Evacuation</b>');
    expect(container.textContent).toContain('EMG_checklist.pdf');
    expect(container.textContent).toContain('View text');
    expect(container.querySelector('[data-knowledge-search-results] li')).not.toBeNull();
    expect(container.querySelector('[data-knowledge-search-results] li p:last-child')?.className).toContain('line-clamp-4');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).not.toContain('hidden-model');
    expect(container.textContent).not.toContain('0.99');
    expect(container.textContent).not.toContain('1,2,3');
  });

  it('renders page ranges and drops malformed result rows', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ results: [
        { originalFilename: 'Guide.pdf', pageStart: 2, pageEnd: 3, text: 'Two-page excerpt' },
        { originalFilename: 'bad.pdf', pageStart: 2, pageEnd: 1, text: 'invalid range' },
        null,
      ] }));
    const container = await renderList();

    typeIntoSearch(container, 'guide');
    await submitSearch(container);

    expect(container.textContent).toContain('Pages 2–3');
    expect(container.textContent).toContain('Two-page excerpt');
    expect(container.textContent).not.toContain('invalid range');
    expect(container.querySelectorAll('[data-knowledge-search-results] li')).toHaveLength(1);
  });

  it('shows no-results and generic error states without exposing server details', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documents: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const container = await renderList();
    typeIntoSearch(container, 'missing');
    await submitSearch(container);
    expect(container.textContent).toContain('No matching Knowledge found.');

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'upstream secret' }, 502));
    typeIntoSearch(container, 'again');
    await submitSearch(container);
    expect(container.textContent).toContain('Knowledge search unavailable.');
    expect(container.textContent).not.toContain('upstream secret');

    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    typeIntoSearch(container, 'malformed');
    await submitSearch(container);
    expect(container.textContent).toContain('Knowledge search unavailable.');
  });

  it('shows loading and prevents stale results from replacing a newer search', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let searchCount = 0;
    let firstInit: RequestInit | undefined;
    let secondInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/knowledge/search')) return Promise.resolve(jsonResponse({ documents: [] }));
      searchCount += 1;
      if (searchCount === 1) {
        firstInit = init;
        return first.promise;
      }
      secondInit = init;
      return second.promise;
    });
    const container = await renderList();

    typeIntoSearch(container, 'old query');
    await submitSearch(container);
    expect(container.textContent).toContain('Searching Knowledge…');
    typeIntoSearch(container, 'new query');
    await submitSearch(container);
    expect((firstInit?.signal as AbortSignal).aborted).toBe(true);
    expect(secondInit?.method).toBe('POST');

    second.resolve(jsonResponse({ results: [{ originalFilename: 'new.pdf', pageStart: 1, pageEnd: 1, text: 'new result' }] }));
    await settle();
    expect(container.textContent).toContain('new result');
    first.resolve(jsonResponse({ results: [{ originalFilename: 'old.pdf', pageStart: 1, pageEnd: 1, text: 'old result' }] }));
    await settle();
    expect(container.textContent).toContain('new result');
    expect(container.textContent).not.toContain('old result');
  });

  it('aborts an in-flight search when the modal unmounts', async () => {
    const pending = deferred<Response>();
    let searchInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/knowledge/search')) return Promise.resolve(jsonResponse({ documents: [] }));
      searchInit = init;
      return pending.promise;
    });
    const container = await renderList();
    typeIntoSearch(container, 'query');
    await submitSearch(container);
    await act(async () => root!.unmount());
    root = null;
    expect((searchInit?.signal as AbortSignal).aborted).toBe(true);
  });

  it('shows the waking state and keeps warm traffic free of user or document data', async () => {
    const warm = deferred<Response>();
    let warmInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) { warmInit = init; return warm.promise; }
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    const container = await renderList();
    expect(container.textContent).toContain('Search engine is waking up…');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/warm'))).toHaveLength(1);
    expect(warmInit?.body).toBeUndefined();
    expect(JSON.stringify(warmInit)).not.toMatch(/query|document|EMG_checklist|https?:\/\//i);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/search'))).toHaveLength(0);
    warm.resolve(jsonResponse({ ok: true }));
    await settle();
  });

  it('queues only the latest explicit query until warm succeeds', async () => {
    const warm = deferred<Response>();
    const searchBodies: Record<string, unknown>[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) return warm.promise;
      if (String(input).includes('/knowledge/search')) {
        searchBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Promise.resolve(jsonResponse({ results: [] }));
      }
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    const container = await renderList();
    typeIntoSearch(container, 'old query');
    await submitSearch(container);
    typeIntoSearch(container, 'new query');
    await submitSearch(container);
    expect(searchBodies).toHaveLength(0);
    warm.resolve(jsonResponse({ ok: true }));
    await settle();
    expect(searchBodies).toEqual([{ query: 'new query' }]);
  });

  it('does not auto-search when warm fails without a queued intent', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => String(input).includes('/knowledge/warm')
      ? Promise.resolve(jsonResponse({ error: 'down' }, 503))
      : Promise.resolve(jsonResponse({ documents: [] })));
    const container = await renderList();
    expect(container.textContent).not.toContain('No matching Knowledge found.');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/knowledge/search'))).toHaveLength(0);
  });

  it('falls back exactly once through search when a queued query meets warm failure', async () => {
    const warm = deferred<Response>();
    const searchBodies: Record<string, unknown>[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) return warm.promise;
      if (String(input).includes('/knowledge/search')) {
        searchBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Promise.resolve(jsonResponse({ results: [] }));
      }
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    const container = await renderList();
    typeIntoSearch(container, 'fallback query');
    await submitSearch(container);
    warm.resolve(jsonResponse({ error: 'down' }, 503));
    await settle();
    expect(searchBodies).toEqual([{ query: 'fallback query' }]);
  });

  it('aborts warm at 120 seconds and falls back once', async () => {
    vi.useFakeTimers();
    try {
      const warm = deferred<Response>();
      const searchBodies: Record<string, unknown>[] = [];
      let warmInit: RequestInit | undefined;
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/knowledge/warm')) { warmInit = init; return warm.promise; }
        if (String(input).includes('/knowledge/search')) {
          searchBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Promise.resolve(jsonResponse({ results: [] }));
        }
        return Promise.resolve(jsonResponse({ documents: [] }));
      });
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      await act(async () => { root!.render(<KnowledgeDocumentsList />); });
      const container = host;
      typeIntoSearch(container, 'deadline query');
      await submitSearch(container);
      vi.advanceTimersByTime(120_000);
      expect((warmInit?.signal as AbortSignal).aborted).toBe(true);
      warm.resolve(jsonResponse({ ok: true }));
      await flushMicrotasks();
      expect(searchBodies).toEqual([{ query: 'deadline query' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('deduplicates one pending warm flight across mounts and aborts after the last closes', async () => {
    const warm = deferred<Response>();
    let warmCalls = 0;
    let warmInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) { warmCalls += 1; warmInit = init; return warm.promise; }
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    await renderList();
    const secondHost = document.createElement('div');
    document.body.appendChild(secondHost);
    const secondRoot = createRoot(secondHost);
    await act(async () => { secondRoot.render(<KnowledgeDocumentsList />); });
    await settle();
    expect(warmCalls).toBe(1);
    await act(async () => secondRoot.unmount());
    expect((warmInit?.signal as AbortSignal).aborted).toBe(false);
    await act(async () => root!.unmount());
    root = null;
    expect((warmInit?.signal as AbortSignal).aborted).toBe(true);
    warm.resolve(jsonResponse({ ok: true }));
    await settle();
  });

  it('clears queued search and aborts warm when the modal closes', async () => {
    const warm = deferred<Response>();
    const search = vi.fn(async () => jsonResponse({ results: [] }));
    let warmInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) { warmInit = init; return warm.promise; }
      if (String(input).includes('/knowledge/search')) return search();
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    const container = await renderList();
    typeIntoSearch(container, 'closed query');
    await submitSearch(container);
    await rerender(0, false);
    expect((warmInit?.signal as AbortSignal).aborted).toBe(true);
    warm.resolve(jsonResponse({ ok: true }));
    await settle();
    expect(search).not.toHaveBeenCalled();
  });

  it('keeps real search abort behavior when the modal closes', async () => {
    const search = deferred<Response>();
    let searchInit: RequestInit | undefined;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/knowledge/warm')) return Promise.resolve(jsonResponse({ ok: true }));
      if (String(input).includes('/knowledge/search')) { searchInit = init; return search.promise; }
      return Promise.resolve(jsonResponse({ documents: [] }));
    });
    const container = await renderList();
    typeIntoSearch(container, 'close during search');
    await submitSearch(container);
    await rerender(0, false);
    expect((searchInit?.signal as AbortSignal).aborted).toBe(true);
    search.resolve(jsonResponse({ results: [{ originalFilename: 'stale.pdf', pageStart: 1, pageEnd: 1, text: 'stale' }] }));
    await settle();
    expect(container.textContent).not.toContain('stale.pdf');
  });
});
