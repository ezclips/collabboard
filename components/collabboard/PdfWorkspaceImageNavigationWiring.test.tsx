// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSourceReaderDrawer from './KnowledgeSourceReaderDrawer';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceBacklinkIndex } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import { buildKnowledgeSourceNoteSummaryIndex } from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import { knowledgeStandaloneHighlightIndexOf } from '@/lib/domain/knowledge/knowledgeStandaloneHighlightIndex';
import type { LibraryItem } from '@/lib/collabboard/library';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const DOC_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const IMAGE_A = 'cccccccc-3333-4333-8333-333333333333';
const IMAGE_B = 'dddddddd-4444-4444-8444-444444444444';
const IMAGE_OUT_OF_RANGE = 'eeeeeeee-5555-4555-8555-555555555555';

const libraryHarness = vi.hoisted(() => ({
  items: [] as LibraryItem[],
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: BOARD_ID }),
}));

vi.mock('@/lib/collabboard/library', () => ({
  fetchLibraryItems: vi.fn(async () => libraryHarness.items),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function pagesFor(documentId: string, originalFilename: string, pageCount = 3) {
  return jsonResponse({
    document: { id: documentId, originalFilename, pageCount },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: `${originalFilename} body for page ${index + 1}`,
    })),
  });
}

function libraryImage(id: string, documentId: string, pageNumber: number): LibraryItem {
  return {
    id,
    user_id: 'user-1',
    title: `Image ${id}`,
    type: 'image',
    content: {
      libraryItemId: id,
      title: `Image ${id}`,
      content: '',
      type: 'image',
      file_url: `/api/library/items/${id}/image`,
      width: 320,
      height: 240,
      metadata: {
        source: {
          kind: 'knowledge-pdf-area',
          knowledgeDocumentId: documentId,
          pageNumber,
          region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        },
        imageUrl: `/api/library/items/${id}/image`,
      },
    },
    thumbnail_url: `/api/library/items/${id}/image`,
    is_public: false,
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(target: Element | null) {
  expect(target).toBeTruthy();
  await act(async () => {
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function mountWorkspace(onActivePageChange = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgeSourceReferenceProvider
        index={buildKnowledgeSourceReferenceIndex([])}
        backlinks={buildKnowledgeSourceBacklinkIndex([], [])}
        noteSummaries={buildKnowledgeSourceNoteSummaryIndex([], [])}
        highlights={knowledgeStandaloneHighlightIndexOf([])}
      >
        <KnowledgeSourceReaderDrawer
          documentOpenRequest={{ requestId: 1, sourceDocumentId: DOC_A }}
          presentation="workspace"
          workspaceTabs={[{ documentId: DOC_A, originalFilename: 'Controlled.pdf', pageCount: 3 }]}
          activeWorkspacePdfId={DOC_A}
          workspaceRightPanel="library"
          onWorkspaceActivePageChange={onActivePageChange}
          onOpenBacklinkTarget={vi.fn()}
          onCreateNoteFromPage={vi.fn()}
        />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  await settle();
  return { host, onActivePageChange };
}

beforeEach(() => {
  document.body.innerHTML = '';
  libraryHarness.items = [
    libraryImage(IMAGE_A, DOC_A, 3),
    libraryImage(IMAGE_B, DOC_B, 2),
    libraryImage(IMAGE_OUT_OF_RANGE, DOC_A, 99),
  ];
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === `/api/boards/${BOARD_ID}/knowledge/${DOC_A}/pages`) {
      return pagesFor(DOC_A, 'Controlled.pdf', 3);
    }
    return jsonResponse({ error: 'Not found' }, 404);
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  root = null;
  host?.remove();
  host = null;
  globalThis.fetch = originalFetch;
});

describe('mounted PDF workspace image navigation wiring', () => {
  it('routes real Library image preview and page buttons through the reader page authority', async () => {
    const onActivePageChange = vi.fn();
    await mountWorkspace(onActivePageChange);
    onActivePageChange.mockClear();
    const workspace = document.querySelector('[data-pdf-workspace="true"]')!;
    const panel = workspace.querySelector('[data-pdf-workspace-library-panel="true"]');
    const preview = workspace.querySelector(`[data-pdf-workspace-library-image-preview="${IMAGE_A}"]`);
    const pageHint = workspace.querySelector(`[data-pdf-workspace-library-image-page="${IMAGE_A}"]`);
    const invalidPreview = workspace.querySelector(`[data-pdf-workspace-library-image-preview="${IMAGE_OUT_OF_RANGE}"]`);
    const invalidPageHint = workspace.querySelector(`[data-pdf-workspace-library-image-page="${IMAGE_OUT_OF_RANGE}"]`);

    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);
    expect(workspace.querySelector(`[data-pdf-workspace-library-image="${IMAGE_B}"]`)).toBeNull();
    expect(preview).toBeInstanceOf(HTMLButtonElement);
    expect(pageHint).toBeInstanceOf(HTMLButtonElement);
    expect((preview as HTMLButtonElement).disabled).toBe(false);
    expect((pageHint as HTMLButtonElement).disabled).toBe(false);

    await click(preview);
    expect(onActivePageChange.mock.calls.some(([documentId, pageNumber]) => (
      documentId === DOC_A && pageNumber === 3
    ))).toBe(true);
    onActivePageChange.mockClear();

    await click(pageHint);
    expect(onActivePageChange.mock.calls.some(([documentId, pageNumber]) => (
      documentId === DOC_A && pageNumber === 3
    ))).toBe(true);
    expect(workspace.querySelector('[data-pdf-workspace-right-panel-content="true"]')).not.toBeNull();
    expect(panel?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);
    onActivePageChange.mockClear();

    await click(invalidPreview);
    await click(invalidPageHint);
    expect(onActivePageChange).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([input, init]) => String(input).endsWith('/pages') && init === undefined)).toBe(true);
  });
});
