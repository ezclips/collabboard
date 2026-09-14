// @vitest-environment jsdom
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfWorkspaceLibraryPanel from './PdfWorkspaceLibraryPanel';
import { selectPdfWorkspaceLibraryImages } from '@/lib/domain/canvas/pdfWorkspaceLibraryImages';
import type { LibraryItem } from '@/lib/collabboard/library';
import type { KnowledgeSourceNoteSummary } from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';
import type { KnowledgeSourceHighlight } from '@/lib/domain/knowledge/knowledgeSourceHighlight';

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const IMG_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const IMG_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const IMG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let notesByDocument = new Map<string, readonly KnowledgeSourceNoteSummary[]>();
let highlightsByDocument = new Map<string, readonly KnowledgeSourceHighlight[]>();
// PDF_IMAGE_LIBRARY_REFRESH_ERROR_VISIBILITY_CORRECTION_1: mutable, unlike
// the constant-0 stub this replaced -- the error-visibility tests below need
// to force a SAME-instance background refresh (the real trigger, in
// production, for the "populated list + failed refresh" case) without
// remounting the panel, which would lose the very continuity under test.
let imageInvalidationByDocument = new Map<string, number>();

vi.mock('@/components/collabboard/KnowledgeSourceReferenceContext', () => ({
  useKnowledgeSourceNoteSummariesForDocument: (documentId: string | null | undefined) => (
    documentId ? notesByDocument.get(documentId) ?? [] : []
  ),
  // The SAME board-level index the reader already holds -- the panel adds no
  // query of its own for highlights either.
  useKnowledgeStandaloneHighlights: (documentId: string | null | undefined) => (
    documentId ? highlightsByDocument.get(documentId) ?? [] : []
  ),
  useKnowledgePdfAreaImageInvalidation: (documentId: string | null | undefined) => (
    documentId ? imageInvalidationByDocument.get(documentId) ?? 0 : 0
  ),
}));

vi.mock('@/lib/collabboard/library', () => ({
  fetchLibraryItems: vi.fn(async () => []),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  notesByDocument = new Map();
  highlightsByDocument = new Map();
  imageInvalidationByDocument = new Map();
});

const highlight = (
  id: string,
  documentId: string,
  pageNumber: number,
  quoteText = 'marked passage',
): KnowledgeSourceHighlight => ({
  id,
  sourceDocumentId: documentId,
  pageNumber,
  charStart: 0,
  charEnd: quoteText.length,
  quoteText,
  quoteHash: null,
  color: '#fde68a',
  createdBy: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
  sourceReferenceId: null,
} as KnowledgeSourceHighlight);

const highlightIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-library-highlight]'))
    .map((node) => node.dataset.pdfWorkspaceLibraryHighlight);

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(ui: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  mounted = [];
});

function note(targetPadletId: string, title: string): KnowledgeSourceNoteSummary {
  return {
    targetPadletId,
    title,
    bodyExcerpt: `${title} body`,
    accentColor: null,
    pageHint: 'p. 1',
    references: [],
  };
}

function provenance(documentId: string, pageNumber: number) {
  return {
    source: {
      kind: 'knowledge-pdf-area',
      knowledgeDocumentId: documentId,
      pageNumber,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    },
  };
}

function libraryImage(
  id: string,
  documentId: string,
  pageNumber: number,
  createdAt: string,
  overrides: Partial<LibraryItem> = {},
): LibraryItem {
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
        ...provenance(documentId, pageNumber),
        imageUrl: `/api/library/items/${id}/image`,
      },
    },
    thumbnail_url: `/api/library/items/${id}/image`,
    is_public: false,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function click(target: Element | null): void {
  expect(target).toBeTruthy();
  act(() => {
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function imageIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-library-image]'))
    .map((node) => node.dataset.pdfWorkspaceLibraryImage ?? '');
}

function noteIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-library-note]'))
    .map((node) => node.dataset.pdfWorkspaceLibraryNote ?? '');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('selectPdfWorkspaceLibraryImages', () => {
  it('selects only canonical PDF-area Images for the active Knowledge document in deterministic page order', () => {
    const currentPreview = '/api/library/items/current/image';
    const selected = selectPdfWorkspaceLibraryImages([
      libraryImage(IMG_A2, DOC_A, 2, '2026-09-08T10:00:00.000Z', {
        thumbnail_url: currentPreview,
        content: {
          ...libraryImage(IMG_A2, DOC_A, 2, '2026-09-08T10:00:00.000Z').content,
          metadata: { ...provenance(DOC_A, 2), imageUrl: 'stale-base-url' },
        },
      }),
      libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T11:00:00.000Z'),
      libraryImage(IMG_B, DOC_B, 1, '2026-09-08T09:00:00.000Z', { title: DOC_A }),
      libraryImage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', DOC_A, 1, '2026-09-08T08:00:00.000Z', {
        type: 'note',
        content: { ...libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T11:00:00.000Z').content, type: 'note' },
      }),
      libraryImage('dddddddd-dddd-4ddd-8ddd-dddddddddddd', DOC_A, 1, '2026-09-08T07:00:00.000Z', {
        content: {
          ...libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T11:00:00.000Z').content,
          metadata: { source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: 'not-a-uuid' } },
        },
      }),
      libraryImage('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', DOC_A, 1, '2026-09-08T06:00:00.000Z', {
        content: { ...libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T11:00:00.000Z').content, metadata: {} },
      }),
    ], DOC_A);

    expect(selected.map((item) => item.libraryItemId)).toEqual([IMG_A1, IMG_A2]);
    expect(selected[1].previewSrc).toBe(currentPreview);
    expect(selected[0].pageNumber).toBe(1);
  });
});

describe('PdfWorkspaceLibraryPanel', () => {
  it('shows only active-PDF Notes and PDF-derived Library Images, and opens Notes through the existing authority', async () => {
    notesByDocument.set(DOC_A, [note('note-a', 'A note')]);
    notesByDocument.set(DOC_B, [note('note-b', 'B note')]);
    const openNote = vi.fn();
    const container = mount(
      <PdfWorkspaceLibraryPanel
        documentId={DOC_A}
        onOpenNote={openNote}
        loadLibraryItems={async () => [
          libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z'),
          libraryImage(IMG_B, DOC_B, 1, '2026-09-08T09:00:00.000Z'),
        ]}
      />,
    );
    await flush();

    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([IMG_A1]);
    expect(container.querySelector(`[data-pdf-workspace-library-image-page="${IMG_A1}"]`)?.textContent).toBe('p. 1');
    expect(container.textContent).not.toContain('B note');
    expect(imageIds(container)).not.toContain(IMG_B);

    click(container.querySelector('[data-pdf-workspace-library-note="note-a"] button'));
    expect(openNote).toHaveBeenCalledWith('note-a');
  });

  it('navigates active-PDF Images to their provenance page from preview, page hint, and keyboard without closing the panel', async () => {
    notesByDocument.set(DOC_A, [note('note-a', 'A note')]);
    const openNote = vi.fn();
    const navigate = vi.fn();
    const container = mount(
      <PdfWorkspaceLibraryPanel
        documentId={DOC_A}
        onOpenNote={openNote}
        onNavigateToImagePage={navigate}
        loadLibraryItems={async () => [
          libraryImage(IMG_A1, DOC_A, 6, '2026-09-08T10:00:00.000Z'),
          libraryImage(IMG_B, DOC_B, 3, '2026-09-08T09:00:00.000Z'),
          libraryImage('cccccccc-cccc-4ccc-8ccc-cccccccccccc', DOC_A, 4, '2026-09-08T08:00:00.000Z', {
            content: { ...libraryImage(IMG_A1, DOC_A, 4, '2026-09-08T08:00:00.000Z').content, metadata: {} },
          }),
        ]}
      />,
    );
    await flush();

    expect(imageIds(container)).toEqual([IMG_A1]);
    expect(container.querySelector('[data-pdf-workspace-library-panel="true"]')).not.toBeNull();
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);

    click(container.querySelector(`[data-pdf-workspace-library-image-preview="${IMG_A1}"]`));
    click(container.querySelector(`[data-pdf-workspace-library-image-page="${IMG_A1}"]`));
    const imageButton = container.querySelector(`[data-pdf-workspace-library-image-go="${IMG_A1}"]`);
    const previewButton = container.querySelector(`[data-pdf-workspace-library-image-preview="${IMG_A1}"]`);
    const pageButton = container.querySelector(`[data-pdf-workspace-library-image-page="${IMG_A1}"]`);
    expect(imageButton).not.toBeInstanceOf(HTMLButtonElement);
    expect(previewButton).toBeInstanceOf(HTMLButtonElement);
    expect(pageButton).toBeInstanceOf(HTMLButtonElement);
    expect((previewButton as HTMLButtonElement).disabled).toBe(false);
    expect((pageButton as HTMLButtonElement).disabled).toBe(false);

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenNthCalledWith(1, { libraryItemId: IMG_A1, documentId: DOC_A, pageNumber: 6 });
    expect(navigate).toHaveBeenNthCalledWith(2, { libraryItemId: IMG_A1, documentId: DOC_A, pageNumber: 6 });
    // The navigation callback is a request seam only; this harness proves the
    // panel itself performs no Note open or other mutation while navigating.
    expect(openNote).not.toHaveBeenCalled();
    expect(container.querySelector('[data-pdf-workspace-library-panel="true"]')).not.toBeNull();
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);
  });

  it('clears stale active-document content during switches and rejects stale async Library results', async () => {
    notesByDocument.set(DOC_A, [note('note-a', 'A note')]);
    notesByDocument.set(DOC_B, [note('note-b', 'B note')]);
    const firstLoad = deferred<readonly LibraryItem[]>();
    const secondLoad = deferred<readonly LibraryItem[]>();
    const thirdLoad = deferred<readonly LibraryItem[]>();
    const loadLibraryItems = vi.fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)
      .mockReturnValueOnce(thirdLoad.promise);

    function Harness() {
      const [documentId, setDocumentId] = useState(DOC_A);
      return (
        <div>
          <button type="button" data-testid="doc-a" onClick={() => setDocumentId(DOC_A)}>A</button>
          <button type="button" data-testid="doc-b" onClick={() => setDocumentId(DOC_B)}>B</button>
          <PdfWorkspaceLibraryPanel
            documentId={documentId}
            onOpenNote={() => {}}
            loadLibraryItems={loadLibraryItems}
          />
        </div>
      );
    }

    const container = mount(<Harness />);
    click(container.querySelector('[data-testid="doc-b"]'));
    expect(noteIds(container)).toEqual(['note-b']);
    expect(imageIds(container)).toEqual([]);

    secondLoad.resolve([libraryImage(IMG_B, DOC_B, 1, '2026-09-08T09:00:00.000Z')]);
    await flush();
    expect(noteIds(container)).toEqual(['note-b']);
    expect(imageIds(container)).toEqual([IMG_B]);

    firstLoad.resolve([libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    await flush();
    expect(noteIds(container)).toEqual(['note-b']);
    expect(imageIds(container)).toEqual([IMG_B]);

    click(container.querySelector('[data-testid="doc-a"]'));
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([]);
    thirdLoad.resolve([libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    await flush();
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([IMG_A1]);
  });

  describe('PDF_IMAGE_LIBRARY_REFRESH_ERROR_VISIBILITY_CORRECTION_1', () => {
    const errorBanner = (container: HTMLElement) =>
      container.querySelector('[data-pdf-workspace-library-images-refresh-error="true"]');
    const retryButton = (container: HTMLElement) =>
      container.querySelector<HTMLButtonElement>('[data-pdf-workspace-library-images-retry="true"]');

    /**
     * A tiny harness that can force a SAME-instance background refresh (the
     * real trigger is the creation-invalidation signal from
     * PDF_AREA_IMAGE_LIBRARY_REFRESH_CORRECTION_1, mocked at a constant 0
     * for every other test in this file) without remounting the panel --
     * remounting would lose exactly the continuity this correction is about.
     */
    function ErrorHarness({ loadLibraryItems, documentId: initialDocumentId = DOC_A }: {
      loadLibraryItems: () => Promise<readonly LibraryItem[]>;
      documentId?: string;
    }) {
      const [documentId, setDocumentId] = useState(initialDocumentId);
      const [, forceRender] = useState(0);
      return (
        <div>
          <button
            type="button"
            data-testid="bump-invalidation"
            onClick={() => {
              imageInvalidationByDocument.set(DOC_A, (imageInvalidationByDocument.get(DOC_A) ?? 0) + 1);
              forceRender((n) => n + 1);
            }}
          >
            bump
          </button>
          <button type="button" data-testid="switch-to-doc-b" onClick={() => setDocumentId(DOC_B)}>B</button>
          <PdfWorkspaceLibraryPanel documentId={documentId} onOpenNote={() => {}} loadLibraryItems={loadLibraryItems} />
        </div>
      );
    }

    it('populated list + refresh failure: existing images remain, and the error + Retry appear', async () => {
      const good = [libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')];
      let rejectRefresh!: (error: unknown) => void;
      const refresh = new Promise<readonly LibraryItem[]>((_resolve, reject) => { rejectRefresh = reject; });
      const loadLibraryItems = vi.fn().mockResolvedValueOnce(good).mockReturnValueOnce(refresh);

      const container = mount(<ErrorHarness loadLibraryItems={loadLibraryItems} />);
      await flush();
      expect(imageIds(container)).toEqual([IMG_A1]);
      expect(errorBanner(container)).toBeNull();
      expect(retryButton(container)).toBeNull();

      click(container.querySelector('[data-testid="bump-invalidation"]'));
      rejectRefresh(new Error('network'));
      await flush();

      // Existing images are still there -- never silently replaced by empty
      // or by the stand-alone "Could not load Library images." state, which
      // is reserved for a failure with nothing already shown.
      expect(imageIds(container)).toEqual([IMG_A1]);
      expect(container.querySelector('[data-pdf-workspace-library-images-error="true"]')).toBeNull();
      const banner = errorBanner(container);
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain("Couldn't refresh images.");
      expect(retryButton(container)).not.toBeNull();
    });

    it('Retry succeeds: updated images appear and the error clears', async () => {
      const good = [libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')];
      let rejectRefresh!: (error: unknown) => void;
      const refresh = new Promise<readonly LibraryItem[]>((_resolve, reject) => { rejectRefresh = reject; });
      const updated = [
        libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z'),
        libraryImage(IMG_A2, DOC_A, 2, '2026-09-08T11:00:00.000Z'),
      ];
      const loadLibraryItems = vi.fn()
        .mockResolvedValueOnce(good)
        .mockReturnValueOnce(refresh)
        .mockResolvedValueOnce(updated);

      const container = mount(<ErrorHarness loadLibraryItems={loadLibraryItems} />);
      await flush();
      click(container.querySelector('[data-testid="bump-invalidation"]'));
      rejectRefresh(new Error('network'));
      await flush();
      expect(errorBanner(container)).not.toBeNull();

      click(retryButton(container));
      await flush();

      expect(loadLibraryItems).toHaveBeenCalledTimes(3);
      expect(imageIds(container)).toEqual([IMG_A1, IMG_A2]);
      expect(errorBanner(container)).toBeNull();
    });

    it('switching documents during a pending Retry cannot publish the old document\'s stale response', async () => {
      const goodA = [libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')];
      let rejectRefresh!: (error: unknown) => void;
      const refresh = new Promise<readonly LibraryItem[]>((_resolve, reject) => { rejectRefresh = reject; });
      let resolveStaleRetry!: (items: readonly LibraryItem[]) => void;
      const staleRetry = new Promise<readonly LibraryItem[]>((resolve) => { resolveStaleRetry = resolve; });
      const goodB = [libraryImage(IMG_B, DOC_B, 1, '2026-09-08T09:00:00.000Z')];

      const loadLibraryItems = vi.fn()
        .mockResolvedValueOnce(goodA)     // initial DOC_A load
        .mockReturnValueOnce(refresh)     // background refresh -> fails
        .mockReturnValueOnce(staleRetry)  // Retry click -> stays pending
        .mockResolvedValueOnce(goodB);    // DOC_B's own load after the switch

      const container = mount(<ErrorHarness loadLibraryItems={loadLibraryItems} />);
      await flush();
      click(container.querySelector('[data-testid="bump-invalidation"]'));
      rejectRefresh(new Error('network'));
      await flush();
      expect(errorBanner(container)).not.toBeNull();

      click(retryButton(container));
      // Before the retry resolves, the user opens a different PDF.
      click(container.querySelector('[data-testid="switch-to-doc-b"]'));
      await flush();

      expect(imageIds(container)).toEqual([IMG_B]);
      expect(container.querySelector('[data-pdf-workspace-library-document]')
        ?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_B);

      // The stale DOC_A retry finally resolves, late.
      resolveStaleRetry([libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
      await flush();

      // DOC_B's list is untouched -- the stale response was never published.
      expect(imageIds(container)).toEqual([IMG_B]);
    });
  });

  it('filters All, Notes, and Images without ever clearing or widening active PDF scope', async () => {
    notesByDocument.set(DOC_A, [note('note-a', 'A note')]);
    const container = mount(
      <PdfWorkspaceLibraryPanel
        documentId={DOC_A}
        onOpenNote={() => {}}
        loadLibraryItems={async () => [
          libraryImage(IMG_A1, DOC_A, 1, '2026-09-08T10:00:00.000Z'),
          libraryImage(IMG_B, DOC_B, 1, '2026-09-08T09:00:00.000Z'),
        ]}
      />,
    );
    await flush();

    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([IMG_A1]);
    const filters = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-library-filter]'))
      .map((node) => node.dataset.pdfWorkspaceLibraryFilter);
    expect(filters).toEqual(['all', 'notes', 'images', 'highlights']);
    expect(container.querySelector('[data-pdf-workspace-library-filters="true"]')?.className).toContain('flex-nowrap');
    expect(container.querySelector('[data-pdf-workspace-library-filters="true"]')?.className).toContain('overflow-x-auto');
    expect(container.querySelector(`[data-pdf-workspace-library-image-go="${IMG_A1}"]`)?.className).toContain('group');
    expect(container.querySelector(`[data-pdf-workspace-library-image-page="${IMG_A1}"]`)?.className).toContain('group-hover:text-blue-700');

    click(container.querySelector('[data-pdf-workspace-library-filter="notes"]'));
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([]);
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);

    click(container.querySelector('[data-pdf-workspace-library-filter="images"]'));
    expect(noteIds(container)).toEqual([]);
    expect(imageIds(container)).toEqual([IMG_A1]);
    expect(imageIds(container)).not.toContain(IMG_B);

    click(container.querySelector('[data-pdf-workspace-library-filter="highlights"]'));
    expect(noteIds(container)).toEqual([]);
    expect(imageIds(container)).toEqual([]);
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);

    click(container.querySelector('[data-pdf-workspace-library-filter-reset="true"]'));
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([IMG_A1]);
  });

  it('lists this PDF\'s standalone highlights, scoped and navigable, under their own filter', async () => {
    highlightsByDocument.set(DOC_A, [highlight('hl-a1', DOC_A, 4, 'the marked passage')]);
    highlightsByDocument.set(DOC_B, [highlight('hl-b1', DOC_B, 2)]);
    const navigated: Array<{ documentId: string; pageNumber: number }> = [];
    const container = mount(
      <PdfWorkspaceLibraryPanel
        documentId={DOC_A}
        onOpenNote={() => {}}
        onNavigateToPage={(request) => { navigated.push({ ...request }); }}
        loadLibraryItems={async () => []}
      />,
    );
    await flush();

    // Active-PDF scope is mandatory: another document's highlight is absent.
    expect(highlightIds(container)).toEqual(['hl-a1']);
    expect(container.textContent).toContain('the marked passage');

    click(container.querySelector('[data-pdf-workspace-library-filter="highlights"]'));
    expect(highlightIds(container)).toEqual(['hl-a1']);
    expect(container.querySelector('[data-pdf-workspace-library-filter="highlights"]')?.textContent).toContain('1');

    click(container.querySelector('[data-pdf-workspace-library-highlight="hl-a1"] button'));
    expect(navigated).toEqual([{ documentId: DOC_A, pageNumber: 4 }]);
  });

  it('offers a Note row for dragging only where the board can accept one', async () => {
    notesByDocument.set(DOC_A, [note('note-a', 'A note')]);
    const readOnly = mount(
      <PdfWorkspaceLibraryPanel documentId={DOC_A} onOpenNote={() => {}} loadLibraryItems={async () => []} />,
    );
    await flush();
    expect(readOnly.querySelector('[data-pdf-workspace-library-note="note-a"] button')
      ?.getAttribute('draggable')).toBeNull();

    const draggable = mount(
      <PdfWorkspaceLibraryPanel
        documentId={DOC_A}
        onOpenNote={() => {}}
        canDragNote={(targetPadletId) => targetPadletId === 'note-a'}
        loadLibraryItems={async () => []}
      />,
    );
    await flush();
    expect(draggable.querySelector('[data-pdf-workspace-library-note="note-a"] button')
      ?.getAttribute('draggable')).toBe('true');
  });

  it('does not render Page Grid, global Library rows, storage derivation, or creation APIs', () => {
    const panelSource = readFileSync(join(process.cwd(), 'components/collabboard/PdfWorkspaceLibraryPanel.tsx'), 'utf8');
    const selectorSource = readFileSync(join(process.cwd(), 'lib/domain/canvas/pdfWorkspaceLibraryImages.ts'), 'utf8');

    expect(panelSource).not.toContain('Page Grid');
    expect(panelSource).not.toContain('addToLibrary');
    expect(panelSource).not.toContain('deleteFromLibrary');
    expect(panelSource).not.toContain('knowledge_storage_path');
    expect(panelSource).not.toContain('.storage');
    expect(selectorSource).not.toContain('knowledge_storage_path');
    expect(selectorSource).not.toContain('.storage');
    expect(selectorSource).not.toContain('originalFilename');
    expect(selectorSource).toContain('parseKnowledgePdfAreaProvenance');
    expect(selectorSource).toContain('resolveLibraryImagePreviewSrc');
  });

  it('keeps image navigation defensive and routed through the existing reader page authority', () => {
    const panelSource = readFileSync(join(process.cwd(), 'components/collabboard/PdfWorkspaceLibraryPanel.tsx'), 'utf8');
    const readerSource = readFileSync(join(process.cwd(), 'components/collabboard/KnowledgeSourceReaderDrawer.tsx'), 'utf8');
    const detailsSource = readFileSync(join(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8');

    expect(panelSource).toContain('image.provenance.knowledgeDocumentId === documentId');
    expect(panelSource).toContain('Number.isInteger(image.pageNumber)');
    expect(readerSource).toContain('current.documentId !== request.documentId');
    expect(readerSource).toContain('current.pages.some((page) => page.pageNumber === request.pageNumber)');
    expect(readerSource).toContain('onWorkspaceActivePageChange?.(current.documentId, request.pageNumber)');
    expect(detailsSource).toContain('pageNavigationRequestId');
    expect(detailsSource).toContain('scrolledToPageRef.current = null;');
    expect(panelSource).not.toContain('fetch(');
    expect(panelSource).not.toContain('supabase');
  });
});
