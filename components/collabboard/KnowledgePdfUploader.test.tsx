// @vitest-environment jsdom

import React, { createRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePdfUploader, {
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
      .rejects.toThrow('PDF upload is temporarily unavailable. Please try again.');
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
      isDrawingLayout: false,
    });

    const media = groups.find((group) => group.id === 'media');
    const create = groups.find((group) => group.id === 'create');
    expect(media?.tools.some((tool) => tool.type === 'knowledge-pdf' && tool.label === 'Add PDF')).toBe(true);
    expect(create?.tools.some((tool) => tool.type === 'document' && tool.label === 'Document')).toBe(true);
  });

  it('exposes a PDF-only file picker through the narrow imperative handle', async () => {
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
    expect(input.accept).toBe('application/pdf,.pdf');

    act(() => ref.current?.openPicker());
    expect(click).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
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
