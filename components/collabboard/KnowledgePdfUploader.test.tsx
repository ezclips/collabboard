// @vitest-environment jsdom

import React, { createRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePdfUploader, {
  KNOWLEDGE_UPLOAD_ACCEPT,
  listKnowledgePdfs,
  uploadKnowledgePdf,
  waitForKnowledgePdf,
  type KnowledgePdfUploaderHandle,
} from './KnowledgePdfUploader';
import { buildCanvasToolbarGroups } from './canvas/ui/canvasToolbarRegistry';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: BOARD_ID }),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function summary(processingStatus: 'uploaded' | 'processing' | 'ready' | 'failed') {
  return {
    id: DOCUMENT_ID,
    boardId: BOARD_ID,
    originalFilename: 'lesson.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 12,
    pageCount: processingStatus === 'ready' ? 1 : null,
    processingStatus,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('P6C Knowledge PDF upload client', () => {
  it('posts a browser-owned multipart form with the canonical file field', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse({
      id: DOCUMENT_ID,
      boardId: BOARD_ID,
      originalFilename: 'lesson.pdf',
      processingStatus: 'uploaded',
    }, 201));
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });

    const result = await uploadKnowledgePdf(BOARD_ID, file, fetchImpl);

    expect(result.id).toBe(DOCUMENT_ID);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`/api/boards/${BOARD_ID}/knowledge`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBe(file);
  });

  it('does not surface raw server or Supabase details on upload failure', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: 'SUPABASE_SERVICE_ROLE_KEY leaked internal detail',
    }, 503));
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });

    await expect(uploadKnowledgePdf(BOARD_ID, file, fetchImpl))
      .rejects.toThrow('Upload is temporarily unavailable. Please try again.');
  });

  it.each([401, 403, 500, 503])(
    'still discards the body of a %s, now that a 400 body is shown',
    async (status) => {
      // The narrowing that makes this worth re-pinning: a 400 now carries the
      // server's own refusal ("not valid UTF-8", "The selected file is empty")
      // because those are authored, actionable text. Every OTHER status stays
      // generic, so an error body written by an intermediary -- or by a handler
      // that stringified a driver error -- never reaches the screen.
      const fetchImpl = vi.fn(async () => jsonResponse({
        error: 'SUPABASE_SERVICE_ROLE_KEY leaked internal detail',
      }, status));
      const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });

      await expect(uploadKnowledgePdf(BOARD_ID, file, fetchImpl))
        .rejects.toThrow(/^(?!.*SUPABASE)/);
    },
  );

  it('shows the 400 refusal the server authored, bounded', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: 'This file is not valid UTF-8 text',
    }, 400));
    const file = new File([new Uint8Array([0xff])], 'notes.txt', { type: 'text/plain' });

    await expect(uploadKnowledgePdf(BOARD_ID, file, fetchImpl))
      .rejects.toThrow('This file is not valid UTF-8 text');
  });

  it('falls back when a 400 carries no usable reason', async () => {
    for (const body of [{}, { error: '' }, { error: '   ' }, { error: 42 }]) {
      const fetchImpl = vi.fn(async () => jsonResponse(body, 400));
      const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
      await expect(uploadKnowledgePdf(BOARD_ID, file, fetchImpl))
        .rejects.toThrow('Choose a valid file.');
    }
  });

  it('reads P6B status and stops when the uploaded PDF becomes ready', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ documents: [summary('processing')] }))
      .mockResolvedValueOnce(jsonResponse({ documents: [summary('ready')] }));
    const controller = new AbortController();

    const result = await waitForKnowledgePdf(BOARD_ID, DOCUMENT_ID, {
      fetchImpl,
      signal: controller.signal,
      intervalMs: 0,
      maxAttempts: 2,
    });

    expect(result?.processingStatus).toBe('ready');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url, init]) => (
      url === `/api/boards/${BOARD_ID}/knowledge` && init?.method === 'GET'
    ))).toBe(true);
  });

  it('treats malformed status responses as a generic availability failure', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));

    await expect(listKnowledgePdfs(BOARD_ID, fetchImpl))
      .rejects.toThrow('PDF status is temporarily unavailable.');
  });

  it('registers Add PDF as a distinct Media action without replacing Document', () => {
    const groups = buildCanvasToolbarGroups({
      isMapLayout: false,
      isFreeformLayout: false,
      isFreeformGraphMode: false,
      isTimelineLayout: false,
      chronoMode: null,
      canManageCanvasShare: false,
      canUseFreeformEditButton: true,
      // CORRECTION_2: the Create group asks the BOARD, not the workspace role.
      canCreateBoardContent: true,
      isDrawingLayout: false,
      // PDF-C1 spatial scope: Add PDF only exists on a direct-PDF layout, so
      // this registration proof has to ask on one. Which layouts qualify is
      // asserted in knowledgePdfSpatialScope.test.tsx.
      isDirectPdfLayout: true,
    });

    const media = groups.find((group) => group.id === 'media');
    const create = groups.find((group) => group.id === 'create');
    // Add PDF is a Media action, marked pinned so a collapsing Media group
    // still leaves it on the toolbar. It never displaces Document.
    const pdf = media?.tools.find((tool) => tool.type === 'knowledge-pdf');
    expect(pdf?.label).toBe('Add PDF');
    expect(pdf?.pinned).toBe(true);
    expect(create?.tools.some((tool) => tool.type === 'knowledge-pdf')).toBe(false);
    expect(create?.tools.some((tool) => tool.type === 'document' && tool.label === 'Document')).toBe(true);
  });

  it('exposes a Knowledge-source file picker through the narrow imperative handle', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const ref = createRef<KnowledgePdfUploaderHandle>();

    await act(async () => {
      root.render(<KnowledgePdfUploader ref={ref} />);
    });

    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    // CHANGED DELIBERATELY: 'PDF-only' was the truth when PDF was the only
    // kind. The picker is now built from the domain's own accept list, so what
    // it offers and what the route admits cannot drift apart.
    expect(input.accept).toBe(KNOWLEDGE_UPLOAD_ACCEPT);
    expect(input.accept).toContain('application/pdf');
    for (const token of ['.txt', '.md', '.markdown', 'text/plain', 'text/markdown']) {
      expect(input.accept).toContain(token);
    }

    act(() => ref.current?.openPicker());
    expect(click).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});

/**
 * CANVAS_SHARED_CONTENT_PERMISSION_CORRECTION_2. The upload request used to
 * ignore the controller that already aborted polling, so unmounting the
 * uploader -- which is what losing board authority does -- left the ingestion
 * request running and its callbacks still able to fire.
 */
describe('the upload request is bound to the uploader lifetime', () => {
  it('carries the abort signal it is given, and reports an abort AS an abort', async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: string, init?: RequestInit) => {
      seenSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const file = new File(['pdf'], 'lesson.pdf', { type: 'application/pdf' });
    const pending = uploadKnowledgePdf(BOARD_ID, file, fetchImpl as never, controller.signal);
    expect(seenSignal, 'the request is made with a signal').toBe(controller.signal);

    controller.abort();
    // An abort must surface as an AbortError, never as the generic
    // "temporarily unavailable" message -- the caller distinguishes them.
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('unmounting the uploader aborts an upload that is still in flight', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let uploadSignal: AbortSignal | undefined;
    const onDocumentUploaded = vi.fn();

    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      uploadSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => { /* deliberately pending */ });
    }));

    act(() => {
      root.render(<KnowledgePdfUploader onDocumentUploaded={onDocumentUploaded} />);
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pdf'], 'lesson.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(uploadSignal, 'the upload POST carries a signal').toBeTruthy();
    expect(uploadSignal!.aborted).toBe(false);

    // Losing board authority unmounts this uploader (CanvasSidebar only mounts
    // it for a board editor), and the unmount must take the request with it.
    act(() => { root.unmount(); });

    expect(uploadSignal!.aborted, 'the in-flight ingestion request is aborted').toBe(true);
    expect(onDocumentUploaded, 'no placement is announced').not.toHaveBeenCalled();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('a text source that comes back ready is never polled for', async () => {
    // A text file is indexed by the request that uploaded it. Polling would
    // ask sixty times about a status that cannot change, and "Processing..."
    // would be false the moment it appeared.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onDocumentSettled = vi.fn();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? jsonResponse({
          id: DOCUMENT_ID,
          boardId: BOARD_ID,
          originalFilename: 'notes.md',
          processingStatus: 'ready',
          kind: 'text',
        }, 201)
        : jsonResponse({ documents: [] })
    ));
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<KnowledgePdfUploader onDocumentSettled={onDocumentSettled} />);
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(onDocumentSettled).toHaveBeenCalledWith(DOCUMENT_ID, 'ready');
    expect(container.textContent).toContain('notes.md is ready.');

    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });
});

describe('P6D upload notifies the Knowledge read surface', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * Drives one real upload through the component. The notification spy records
   * how many fetches had completed each time it fired, which is what makes the
   * ordering assertions below possible: the first notification must land while
   * only the POST has been issued, the second only after a status GET.
   */
  async function runUpload(terminalStatus: 'ready' | 'failed') {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? jsonResponse({
          id: DOCUMENT_ID,
          boardId: BOARD_ID,
          originalFilename: 'lesson.pdf',
          processingStatus: 'uploaded',
        }, 201)
        : jsonResponse({ documents: [summary(terminalStatus)] })
    ));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const fetchCountsAtNotify: number[] = [];
    const onKnowledgeChanged = vi.fn(() => {
      fetchCountsAtNotify.push(fetchMock.mock.calls.length);
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<KnowledgePdfUploader onKnowledgeChanged={onKnowledgeChanged} />);
    });

    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return { host, root, onKnowledgeChanged, fetchCountsAtNotify };
  }

  it('notifies once the row exists server-side and again when it reaches ready', async () => {
    const { host, root, onKnowledgeChanged, fetchCountsAtNotify } = await runUpload('ready');

    expect(onKnowledgeChanged).toHaveBeenCalledTimes(2);
    // First notification: POST done, no status GET yet.
    expect(fetchCountsAtNotify[0]).toBe(1);
    // Second notification: only after a status read reported a terminal state.
    expect(fetchCountsAtNotify[1]).toBeGreaterThan(1);
    expect(host.querySelector('[data-knowledge-pdf-status]')?.textContent)
      .toContain('lesson.pdf is ready.');

    await act(async () => root.unmount());
  });

  it('notifies again when processing reaches failed', async () => {
    const { host, root, onKnowledgeChanged } = await runUpload('failed');

    expect(onKnowledgeChanged).toHaveBeenCalledTimes(2);
    const toast = host.querySelector('[data-knowledge-pdf-status]');
    expect(toast?.getAttribute('data-knowledge-pdf-status')).toBe('error');
    expect(toast?.textContent).toContain('Processing lesson.pdf failed.');

    await act(async () => root.unmount());
  });

  it('keeps the existing toast surface intact rather than replacing it with a list', async () => {
    const { host, root } = await runUpload('ready');

    const toast = host.querySelector('[data-knowledge-pdf-status]');
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('data-knowledge-pdf-status')).toBe('success');
    expect(host.querySelector('ul, li, iframe, embed')).toBeNull();

    await act(async () => root.unmount());
  });
});

// P6J-D2: only a terminal success self-dismisses. Info still means work is in
// flight and error is the one outcome worth leaving on screen, so both must
// survive the success window.
describe('P6J-D2 completed upload notice auto-dismiss', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  function uploadedPayload() {
    return jsonResponse({
      id: DOCUMENT_ID,
      boardId: BOARD_ID,
      originalFilename: 'lesson.pdf',
      processingStatus: 'uploaded',
    }, 201);
  }

  function notice(host: HTMLElement) {
    return host.querySelector('[data-knowledge-pdf-status]');
  }

  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }

  async function mountAndUpload(respond: (init?: RequestInit) => Promise<Response>) {
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => respond(init)) as unknown as typeof globalThis.fetch;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<KnowledgePdfUploader />); });
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await advance(0);
    return { host, root, input };
  }

  function terminal(status: 'ready' | 'failed' | 'processing') {
    return async (init?: RequestInit) => (init?.method === 'POST'
      ? uploadedPayload()
      : jsonResponse({ documents: [summary(status)] }));
  }

  it('shows the ready notice immediately and clears it at exactly 5000ms', async () => {
    const { host, root } = await mountAndUpload(terminal('ready'));

    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('success');
    expect(notice(host)?.textContent).toContain('lesson.pdf is ready.');

    await advance(4_999);
    expect(notice(host)).not.toBeNull();

    await advance(1);
    expect(notice(host)).toBeNull();

    await act(async () => root.unmount());
  });

  it('clears the background-processing success notice at 5000ms', async () => {
    const { host, root } = await mountAndUpload(terminal('processing'));

    // 60 attempts at a 2s interval means 59 waits before polling gives up.
    await advance(59 * 2_000);
    await advance(0);
    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('success');
    expect(notice(host)?.textContent).toContain('Processing is continuing in the background.');

    await advance(4_999);
    expect(notice(host)).not.toBeNull();

    await advance(1);
    expect(notice(host)).toBeNull();

    await act(async () => root.unmount());
  });

  it('keeps the processing failure notice beyond the success window', async () => {
    const { host, root } = await mountAndUpload(terminal('failed'));

    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('error');

    await advance(10_000);

    expect(notice(host)).not.toBeNull();
    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('error');
    expect(notice(host)?.textContent).toContain('Processing lesson.pdf failed.');

    await act(async () => root.unmount());
  });

  it('keeps the in-flight processing notice beyond the success window', async () => {
    const { host, root } = await mountAndUpload(terminal('processing'));

    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('info');
    expect(notice(host)?.textContent).toContain('Processing lesson.pdf…');

    await advance(10_000);

    expect(notice(host)).not.toBeNull();
    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('info');
    expect(notice(host)?.textContent).toContain('Processing lesson.pdf…');

    await act(async () => root.unmount());
  });

  it('does not let an expiring success timer clear a newer notice', async () => {
    let stallUpload = false;
    const never = new Promise<Response>(() => undefined);
    const { host, root, input } = await mountAndUpload(async (init) => {
      if (init?.method === 'POST') return stallUpload ? never : uploadedPayload();
      return jsonResponse({ documents: [summary('ready')] });
    });
    expect(notice(host)?.textContent).toContain('lesson.pdf is ready.');

    await advance(3_000);
    stallUpload = true;
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('info');

    // Past the first notice's original 5000ms expiry.
    await advance(3_000);

    expect(notice(host)).not.toBeNull();
    expect(notice(host)?.getAttribute('data-knowledge-pdf-status')).toBe('info');

    await act(async () => root.unmount());
  });

  it('cancels the pending success timer on unmount', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { host, root } = await mountAndUpload(terminal('ready'));
      expect(notice(host)).not.toBeNull();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      await act(async () => root.unmount());

      expect(vi.getTimerCount()).toBe(0);
      await advance(10_000);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

/**
 * CANVAS_SHARED_CONTENT_PERMISSION_CORRECTION_3. The poll half of the upload
 * lifecycle. The upload request was already abort-aware; the status polling
 * behind it was not, so a cancelled uploader kept asking the server and could
 * still deliver a terminal callback for a surface that no longer existed.
 */
describe('the polling lifecycle is abort-aware end to end', () => {
  it('listKnowledgePdfs still works without a signal (existing callers unchanged)', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => (
      jsonResponse({ documents: [summary('ready')] })
    ));
    const documents = await listKnowledgePdfs(BOARD_ID, fetchImpl as never);
    expect(documents).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('waitForKnowledgePdf hands its signal to the status fetch', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return jsonResponse({ documents: [summary('ready')] });
    });

    const completed = await waitForKnowledgePdf(BOARD_ID, DOCUMENT_ID, {
      fetchImpl: fetchImpl as never,
      signal: controller.signal,
    });

    expect(seen, 'the poll carries the signal').toBe(controller.signal);
    expect(completed?.processingStatus, 'positive control').toBe('ready');
  });

  it('a poll cancelled in flight reports an abort instead of terminal state', async () => {
    const controller = new AbortController();
    let release: ((response: Response) => void) | null = null;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolveFetch) => {
      release = resolveFetch;
    }));

    const pending = waitForKnowledgePdf(BOARD_ID, DOCUMENT_ID, {
      fetchImpl: fetchImpl as never,
      signal: controller.signal,
    });
    await Promise.resolve();

    // Cancelled while the request was open, then the server answers TERMINAL.
    controller.abort();
    release!(jsonResponse({ documents: [summary('ready')] }));

    // The terminal answer must not be read: the caller is gone.
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('unmounting during polling aborts the status request and silences callbacks', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const previousFetch = globalThis.fetch;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onKnowledgeChanged = vi.fn();
    const onDocumentUploaded = vi.fn();
    const onDocumentSettled = vi.fn();
    let pollSignal: AbortSignal | undefined;
    let releasePoll: ((response: Response) => void) | null = null;

    globalThis.fetch = (vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(jsonResponse(summary('uploaded'), 201));
      }
      pollSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolveFetch) => { releasePoll = resolveFetch; });
    }) as unknown) as typeof globalThis.fetch;

    await act(async () => {
      root.render(
        <KnowledgePdfUploader
          onKnowledgeChanged={onKnowledgeChanged}
          onDocumentUploaded={onDocumentUploaded}
          onDocumentSettled={onDocumentSettled}
        />,
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });

    // The upload succeeded, so the document was announced once and polling began.
    expect(onDocumentUploaded, 'positive control: the upload was announced').toHaveBeenCalledTimes(1);
    expect(pollSignal, 'the poll carries a signal').toBeTruthy();
    expect(pollSignal!.aborted).toBe(false);
    const changedBefore = onKnowledgeChanged.mock.calls.length;

    // Permission loss unmounts this uploader.
    act(() => { root.unmount(); });
    expect(pollSignal!.aborted, 'the in-flight poll is aborted').toBe(true);

    // The server answers terminal anyway. Nothing may be delivered.
    await act(async () => {
      releasePoll!(jsonResponse({ documents: [summary('ready')] }));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(onDocumentSettled, 'no terminal callback after cancellation').not.toHaveBeenCalled();
    expect(onKnowledgeChanged.mock.calls.length, 'no further change callback').toBe(changedBefore);

    container.remove();
    globalThis.fetch = previousFetch;
  });

  it('an authorized upload still polls to a terminal answer and settles', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const previousFetch = globalThis.fetch;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onDocumentUploaded = vi.fn();
    const onDocumentSettled = vi.fn();

    globalThis.fetch = (vi.fn(async (_url: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? jsonResponse(summary('uploaded'), 201)
        : jsonResponse({ documents: [summary('ready')] })
    )) as unknown) as typeof globalThis.fetch;

    await act(async () => {
      root.render(
        <KnowledgePdfUploader
          onDocumentUploaded={onDocumentUploaded}
          onDocumentSettled={onDocumentSettled}
        />,
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(onDocumentUploaded).toHaveBeenCalledTimes(1);
    expect(onDocumentSettled).toHaveBeenCalledWith(DOCUMENT_ID, 'ready');

    act(() => { root.unmount(); });
    container.remove();
    globalThis.fetch = previousFetch;
  });
});

/**
 * CANVAS_SIDEBAR_PROGRAMMATIC_PDF_INGESTION_INITIATION.
 *
 * Between a revocation and the render that hides the control, a label click,
 * an Enter/Space key, a retained imperative handle or a dispatched change
 * event can all still reach the input. Each asks the live probe, on a REAL
 * mounted uploader.
 */
describe('board-content ingestion refuses at every initiation boundary', () => {
  function mountUploader(probe: () => boolean, extra: Record<string, unknown> = {}) {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handle = createRef<KnowledgePdfUploaderHandle>();
    const calls = { fetches: [] as string[], uploaded: 0, changed: 0, settled: 0 };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (vi.fn(async (url: string, init?: RequestInit) => {
      calls.fetches.push(`${init?.method ?? 'GET'} ${String(url)}`);
      return init?.method === 'POST'
        ? jsonResponse(summary('uploaded'), 201)
        : jsonResponse({ documents: [summary('ready')] });
    }) as unknown) as typeof globalThis.fetch;

    act(() => {
      root.render(
        <KnowledgePdfUploader
          ref={handle}
          initiationPolicy="board-content"
          canInitiateUploadNow={probe}
          onKnowledgeChanged={() => { calls.changed += 1; }}
          onDocumentUploaded={() => { calls.uploaded += 1; }}
          onDocumentSettled={() => { calls.settled += 1; }}
          {...extra}
        />,
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clicks: number[] = [];
    // Records only. Calling preventDefault here would mask whether PRODUCTION
    // prevented the event, which is the whole assertion. jsdom opens no real
    // chooser, so nothing needs suppressing.
    input.addEventListener('click', () => { clicks.push(1); });

    return {
      container, root, handle, calls, input, clicks,
      restore: () => { globalThis.fetch = previousFetch; container.remove(); },
    };
  }

  const pdf = () => new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' });

  function giveFile(input: HTMLInputElement) {
    Object.defineProperty(input, 'files', { value: [pdf()], configurable: true });
  }

  it('D. openPicker: a retained handle clicks nothing once the probe is false', () => {
    let allowed = true;
    const h = mountUploader(() => allowed);

    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length, 'positive control clicks once').toBe(1);

    allowed = false;
    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length, 'zero input.click after revocation').toBe(1);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('E. a direct click on the hidden input is refused', () => {
    let allowed = true;
    const h = mountUploader(() => allowed);

    // Both branches inspect the SAME event that was actually dispatched to the
    // real input -- a freshly constructed one proves nothing.
    const authorized = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { h.input.dispatchEvent(authorized); });
    expect(authorized.defaultPrevented, 'authorized clicks are not pre-empted').toBe(false);

    allowed = false;
    const denied = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { h.input.dispatchEvent(denied); });
    expect(denied.defaultPrevented, 'the chooser is prevented from opening').toBe(true);
    expect(h.calls.fetches, 'no request from a refused click').toEqual([]);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('F. a dispatched change event with a real File starts nothing', async () => {
    const h = mountUploader(() => false);
    giveFile(h.input);

    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(h.calls.fetches, 'zero upload request').toEqual([]);
    expect(h.calls.uploaded + h.calls.changed + h.calls.settled, 'zero callbacks').toBe(0);
    // Denial happened before any busy/notice state was painted.
    expect(h.container.textContent, 'no busy or notice text').not.toMatch(/Uploading|Processing/);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('G. authorized chooser, revoked before the file comes back: no upload', async () => {
    let allowed = true;
    const h = mountUploader(() => allowed);
    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length).toBe(1);

    // The user was authorized when the dialog opened, and is not when it returns.
    allowed = false;
    giveFile(h.input);
    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(h.calls.fetches, 'zero upload').toEqual([]);
    expect(h.calls.uploaded, 'zero parent delivery').toBe(0);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('I. upload completes but authority is gone: the document is discarded', async () => {
    let allowed = true;
    let releaseUpload: ((response: Response) => void) | null = null;
    const h = mountUploader(() => allowed);
    (globalThis as { fetch: typeof globalThis.fetch }).fetch = (vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Promise<Response>((resolveFetch) => { releaseUpload = resolveFetch; });
      }
      return Promise.resolve(jsonResponse({ documents: [summary('ready')] }));
    }) as unknown) as typeof globalThis.fetch;

    giveFile(h.input);
    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(releaseUpload, 'the upload is genuinely in flight').toBeTruthy();

    // Revoked while the upload was pending; the server still answers.
    allowed = false;
    await act(async () => {
      releaseUpload!(jsonResponse(summary('uploaded'), 201));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(h.calls.uploaded, 'the completed document is never delivered').toBe(0);
    expect(h.calls.changed, 'no knowledge-changed callback').toBe(0);
    expect(h.calls.settled, 'no settled callback').toBe(0);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('J. restoration: a fresh authorized ingestion reaches the upload path', async () => {
    let allowed = false;
    const h = mountUploader(() => allowed);

    giveFile(h.input);
    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(h.calls.fetches, 'denied while unauthorized').toEqual([]);

    allowed = true;
    giveFile(h.input);
    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(h.calls.fetches.some((f) => f.startsWith('POST')), 'the same input works again').toBe(true);
    expect(h.calls.uploaded, 'and the document is delivered').toBe(1);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('a host-managed uploader keeps its own policy and needs no board probe', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const previousFetch = globalThis.fetch;
    const fetches: string[] = [];
    globalThis.fetch = (vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push(`${init?.method ?? 'GET'} ${String(url)}`);
      return init?.method === 'POST'
        ? jsonResponse(summary('uploaded'), 201)
        : jsonResponse({ documents: [summary('ready')] });
    }) as unknown) as typeof globalThis.fetch;

    const uploaded: number[] = [];
    await act(async () => {
      root.render(<KnowledgePdfUploader onDocumentUploaded={() => uploaded.push(1)} />);
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    input.addEventListener('click', (event) => event.preventDefault());
    Object.defineProperty(input, 'files', {
      value: [new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' })],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(fetches.some((f) => f.startsWith('POST')), 'PdfWorkspace ingestion is unchanged').toBe(true);
    expect(uploaded.length).toBe(1);

    act(() => { root.unmount(); });
    container.remove();
    globalThis.fetch = previousFetch;
  });
});

/**
 * CORRECTION_1: a genuine (non-Abort) failure could still publish a notice
 * after the authority went away, and the imperative handle kept whichever
 * probe it was built with until `busy` happened to change.
 */
describe('CORRECTION_1: late failures and replaced probes', () => {
  function mountBoardContent(probe: () => boolean) {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const handle = createRef<KnowledgePdfUploaderHandle>();
    const calls = { requests: [] as string[], uploaded: 0, changed: 0, settled: 0 };
    const previousFetch = globalThis.fetch;

    const render = (currentProbe: () => boolean) => {
      act(() => {
        root.render(
          <KnowledgePdfUploader
            ref={handle}
            initiationPolicy="board-content"
            canInitiateUploadNow={currentProbe}
            onKnowledgeChanged={() => { calls.changed += 1; }}
            onDocumentUploaded={() => { calls.uploaded += 1; }}
            onDocumentSettled={() => { calls.settled += 1; }}
          />,
        );
      });
    };
    render(probe);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clicks: number[] = [];
    input.addEventListener('click', () => { clicks.push(1); });

    return {
      container, root, handle, calls, input, clicks, render,
      restore: () => { globalThis.fetch = previousFetch; container.remove(); },
      setFetch: (impl: typeof globalThis.fetch) => { globalThis.fetch = impl; },
    };
  }

  const givePdf = (input: HTMLInputElement) => {
    Object.defineProperty(input, 'files', {
      value: [new File(['%PDF-1.7\n%%EOF'], 'lesson.pdf', { type: 'application/pdf' })],
      configurable: true,
    });
  };

  /**
   * One upload whose request stays pending until released. Upload and polling
   * share exactly one catch, and the live check sits at the top of it, so this
   * covers the common boundary both routes reach.
   */
  async function startPendingUpload(h: ReturnType<typeof mountBoardContent>) {
    let reject: ((reason: unknown) => void) | null = null;
    h.setFetch((vi.fn((_url: string, init?: RequestInit) => {
      h.calls.requests.push(`${init?.method ?? 'GET'}`);
      if (init?.method === 'POST') {
        return new Promise<Response>((_resolveFetch, rejectFetch) => { reject = rejectFetch; });
      }
      return Promise.resolve(jsonResponse({ documents: [summary('ready')] }));
    }) as unknown) as typeof globalThis.fetch);

    givePdf(h.input);
    await act(async () => {
      h.input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(h.calls.requests.includes('POST'), 'the upload genuinely started').toBe(true);
    expect(reject, 'the request is pending').toBeTruthy();
    return () => reject!;
  }

  it('a non-Abort failure after revocation publishes nothing at all', async () => {
    let allowed = true;
    const h = mountBoardContent(() => allowed);
    const release = await startPendingUpload(h);
    const requestsBefore = h.calls.requests.length;

    // Revoked while the upload was in flight; the request then fails for real.
    allowed = false;
    await act(async () => {
      release()(new Error('network exploded'));
      await new Promise((done) => setTimeout(done, 0));
    });

    // The "Uploading…" notice was published while still authorized; what must
    // not appear is any FAILURE notice produced by the suppressed error.
    expect(h.container.textContent, 'no error notice from the suppressed failure')
      .not.toMatch(/temporarily unavailable|network exploded|failed/i);
    expect(h.calls.changed, 'zero onKnowledgeChanged').toBe(0);
    expect(h.calls.uploaded, 'zero onDocumentUploaded').toBe(0);
    expect(h.calls.settled, 'zero onDocumentSettled').toBe(0);
    expect(h.calls.requests.length, 'zero polling or later request').toBe(requestsBefore);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('positive control: the same failure while authorized still reports it', async () => {
    const h = mountBoardContent(() => true);
    const release = await startPendingUpload(h);

    await act(async () => {
      release()(new Error('network exploded'));
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(h.container.textContent, 'the established error notice still appears')
      .toMatch(/network exploded|temporarily unavailable/i);

    act(() => { h.root.unmount(); });
    h.restore();
  });

  it('openPicker uses the CURRENT probe, not the one it was built with', () => {
    const probeA = () => true;
    const probeB = () => false;
    const probeC = () => true;
    const h = mountBoardContent(probeA);

    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length, 'probe A authorizes one click').toBe(1);

    // A genuinely different function, and `busy` is untouched -- which is
    // exactly the case the old dependency list missed.
    h.render(probeB);
    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length, 'the replaced probe refuses').toBe(1);

    h.render(probeC);
    act(() => { h.handle.current!.openPicker(); });
    expect(h.clicks.length, 'restoring authority restores the picker').toBe(2);

    act(() => { h.root.unmount(); });
    h.restore();
  });
});
