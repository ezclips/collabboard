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

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const IMG_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const IMG_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const IMG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let notesByDocument = new Map<string, readonly KnowledgeSourceNoteSummary[]>();

vi.mock('@/components/collabboard/KnowledgeSourceReferenceContext', () => ({
  useKnowledgeSourceNoteSummariesForDocument: (documentId: string | null | undefined) => (
    documentId ? notesByDocument.get(documentId) ?? [] : []
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
});

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

    click(container.querySelector('[data-pdf-workspace-library-filter="notes"]'));
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([]);
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_A);

    click(container.querySelector('[data-pdf-workspace-library-filter="images"]'));
    expect(noteIds(container)).toEqual([]);
    expect(imageIds(container)).toEqual([IMG_A1]);
    expect(imageIds(container)).not.toContain(IMG_B);

    click(container.querySelector('[data-pdf-workspace-library-filter-reset="true"]'));
    expect(noteIds(container)).toEqual(['note-a']);
    expect(imageIds(container)).toEqual([IMG_A1]);
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
});
