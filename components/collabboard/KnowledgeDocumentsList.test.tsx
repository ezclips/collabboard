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
  fetchMock = vi.fn(async () => jsonResponse({ documents: [] }));
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

describe('P6D Knowledge documents read surface', () => {
  it('issues exactly one GET for the current board on mount', async () => {
    await renderList();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`/api/boards/${BOARD_ID}/knowledge`);
    expect(init?.method).toBe('GET');
  });

  it('renders an already-attached PDF by its original filename', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [doc()] }));

    const container = await renderList();

    expect(container.textContent).toContain('EMG_checklist.pdf');
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
});
