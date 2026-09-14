// @vitest-environment jsdom
//
// PDF_AREA_IMAGE_LIBRARY_REFRESH_CORRECTION_1 -- the PDF Images list did not
// refresh after a rectangle-selection image was created while the panel
// stayed open on the same document; Notes/highlights, wired to reactive
// board state, updated immediately. This suite exercises the REAL
// KnowledgeSourceReferenceProvider, its new invalidation hook, and the REAL
// PdfWorkspaceLibraryPanel together -- only the top-level re-render (what
// CanvasClient's own setState would cause) is test-driven, so the
// provider/context/effect wiring itself is genuine, not a replica.
//
// The emitting side (CanvasClient's savePdfAreaDraft) is covered separately
// below by a source invariant: mounting the real 9000+ line CanvasClient to
// exercise one callback is impractical, and this codebase's own convention
// for that boundary (see knowledgeSourceNoteWiring.source.test.ts) is a
// pinned source check on call ordering, not a replica of the logic.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PdfWorkspaceLibraryPanel from './PdfWorkspaceLibraryPanel';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { LibraryItem } from '@/lib/collabboard/library';

vi.mock('@/lib/collabboard/library', () => ({ fetchLibraryItems: vi.fn(async () => []) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const IMG_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const IMG_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

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

function libraryImage(id: string, documentId: string, pageNumber: number, createdAt: string): LibraryItem {
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
      metadata: { ...provenance(documentId, pageNumber), imageUrl: `/api/library/items/${id}/image` },
    },
    thumbnail_url: `/api/library/items/${id}/image`,
    is_public: false,
    created_at: createdAt,
    updated_at: createdAt,
  } as LibraryItem;
}

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { root, container };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function imageIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-library-image]'))
    .map((node) => node.dataset.pdfWorkspaceLibraryImage ?? '');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** The real provider + real panel, as CanvasClient actually wires them. */
function Harness({
  documentId,
  invalidation,
  loadLibraryItems,
}: {
  documentId: string;
  invalidation: Readonly<Record<string, number>>;
  loadLibraryItems: () => Promise<readonly LibraryItem[]>;
}) {
  return (
    <KnowledgeSourceReferenceProvider
      index={EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX}
      pdfAreaImageInvalidation={invalidation}
    >
      <PdfWorkspaceLibraryPanel documentId={documentId} onOpenNote={() => {}} loadLibraryItems={loadLibraryItems} />
    </KnowledgeSourceReferenceProvider>
  );
}

describe('PDF_AREA_IMAGE_LIBRARY_REFRESH_CORRECTION_1: real provider + panel integration', () => {
  it('a bumped invalidation for the open document refetches and shows the newly created image, without navigation or reload', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    const { root, container } = mount(
      <Harness documentId={DOC_A} invalidation={{}} loadLibraryItems={loader} />,
    );
    await flush();
    expect(imageIds(container)).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);

    // The exact effect a confirmed area-image creation has on CanvasClient's
    // own state: the counter for THIS document goes up by one. documentId
    // itself never changes -- no panel close/reopen, no page reload.
    act(() => {
      root.render(<Harness documentId={DOC_A} invalidation={{ [DOC_A]: 1 }} loadLibraryItems={loader} />);
    });
    await flush();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(imageIds(container)).toEqual([IMG_1]);
    // Not merely present in state -- displayed, and the loading placeholder
    // (only render path where a populated list would have flashed empty) is gone.
    expect(container.querySelector('[data-pdf-workspace-library-images-loading="true"]')).toBeNull();
  });

  it('does not flash the currently-shown images to empty while the background refresh is in flight', async () => {
    const first = [libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')];
    const second = deferred<readonly LibraryItem[]>();
    const loader = vi.fn().mockResolvedValueOnce(first).mockReturnValueOnce(second.promise);
    const { root, container } = mount(
      <Harness documentId={DOC_A} invalidation={{}} loadLibraryItems={loader} />,
    );
    await flush();
    expect(imageIds(container)).toEqual([IMG_1]);

    act(() => {
      root.render(<Harness documentId={DOC_A} invalidation={{ [DOC_A]: 1 }} loadLibraryItems={loader} />);
    });
    // The refetch is now pending (second.promise unresolved). The list that
    // was already showing must still be showing -- not cleared, not swapped
    // for the "Loading images…" placeholder.
    expect(imageIds(container)).toEqual([IMG_1]);
    expect(container.querySelector('[data-pdf-workspace-library-images-loading="true"]')).toBeNull();

    second.resolve([...first, libraryImage(IMG_2, DOC_A, 2, '2026-09-08T11:00:00.000Z')]);
    await flush();
    expect(imageIds(container)).toEqual([IMG_1, IMG_2]);
  });

  it('re-renders from unrelated board state (invalidation object unchanged) issue no additional Library fetch', async () => {
    const loader = vi.fn().mockResolvedValue([libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    const invalidation = { [DOC_A]: 1 };
    const { root, container } = mount(
      <Harness documentId={DOC_A} invalidation={invalidation} loadLibraryItems={loader} />,
    );
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);

    // Five re-renders with the SAME invalidation value -- standing in for
    // CanvasClient re-rendering on padlet move/resize/recolor, none of which
    // ever touches pdfAreaImageInvalidation.
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        root.render(<Harness documentId={DOC_A} invalidation={invalidation} loadLibraryItems={loader} />);
      });
    }
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(imageIds(container)).toEqual([IMG_1]);

    // A bump for a DIFFERENT document must not refetch THIS one either.
    act(() => {
      root.render(<Harness documentId={DOC_A} invalidation={{ ...invalidation, [DOC_B]: 7 }} loadLibraryItems={loader} />);
    });
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a document switch during a pending refresh is never overwritten by the stale document\'s late response', async () => {
    const docA = deferred<readonly LibraryItem[]>();
    const docB = deferred<readonly LibraryItem[]>();
    const loader = vi.fn().mockReturnValueOnce(docA.promise).mockReturnValueOnce(docB.promise);
    const { root, container } = mount(
      <Harness documentId={DOC_A} invalidation={{}} loadLibraryItems={loader} />,
    );

    // Switch to DOC_B before DOC_A's request resolves -- exactly the ordering
    // an eager user click produces.
    act(() => {
      root.render(<Harness documentId={DOC_B} invalidation={{}} loadLibraryItems={loader} />);
    });
    await flush();

    docB.resolve([libraryImage(IMG_2, DOC_B, 1, '2026-09-08T09:00:00.000Z')]);
    await flush();
    expect(imageIds(container)).toEqual([IMG_2]);

    // DOC_A's request finally resolves late -- must not replace DOC_B's list.
    docA.resolve([libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    await flush();
    expect(imageIds(container)).toEqual([IMG_2]);
    expect(container.querySelector('[data-pdf-workspace-library-document]')?.getAttribute('data-pdf-workspace-library-document')).toBe(DOC_B);
  });

  it('includes an existing Library item with no current board placement -- this panel never filters by placement', async () => {
    // The harness passes no padlet/board state of any kind to the panel or
    // the provider; the loader is the Library's own query, independent of
    // what is currently placed. An item it returns must still render.
    const loader = vi.fn().mockResolvedValue([libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    const { container } = mount(
      <Harness documentId={DOC_A} invalidation={{}} loadLibraryItems={loader} />,
    );
    await flush();
    expect(imageIds(container)).toEqual([IMG_1]);
  });

  it('repeated invalidation bumps for the same creation never duplicate the rendered entry', async () => {
    const loader = vi.fn().mockResolvedValue([libraryImage(IMG_1, DOC_A, 1, '2026-09-08T10:00:00.000Z')]);
    const { root, container } = mount(
      <Harness documentId={DOC_A} invalidation={{ [DOC_A]: 1 }} loadLibraryItems={loader} />,
    );
    await flush();
    expect(imageIds(container)).toEqual([IMG_1]);

    // A retry of an idempotent creation bumps the counter again for the SAME
    // already-existing Library item.
    for (const generation of [2, 3]) {
      act(() => {
        root.render(<Harness documentId={DOC_A} invalidation={{ [DOC_A]: generation }} loadLibraryItems={loader} />);
      });
      await flush();
    }
    const ids = imageIds(container);
    expect(ids).toEqual([IMG_1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('PDF_AREA_IMAGE_LIBRARY_REFRESH_CORRECTION_1: creation-success emission (source invariant)', () => {
  // CanvasClient.tsx is a 9000+ line controller; mounting it to exercise one
  // callback inside `savePdfAreaDraft` is impractical. This codebase's own
  // convention for that exact boundary is a pinned source check on ordering
  // (see lib/infra/knowledge/knowledgeSourceNoteWiring.source.test.ts) --
  // not a re-implementation of the save logic.
  const canvasClient = readFileSync(
    resolve(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8',
  );

  function savePdfAreaDraftBody(): string {
    const start = canvasClient.indexOf('const savePdfAreaDraft = useCallback(async () => {');
    expect(start, 'savePdfAreaDraft not found').toBeGreaterThan(-1);
    const end = canvasClient.indexOf('}, [\n    canvasId, pendingPdfAreaDraft, isPdfAreaDraftSaving, pdfAreaDraftTitle,', start);
    expect(end, 'savePdfAreaDraft end not found').toBeGreaterThan(start);
    return canvasClient.slice(start, end);
  }

  it('the invalidation bump sits strictly after the failure return, never on the failed-creation path', () => {
    const body = savePdfAreaDraftBody();
    const failureReturn = body.indexOf('if (!created.ok) {');
    const bump = body.indexOf('setPdfAreaImageInvalidation((prev) => (');
    expect(failureReturn).toBeGreaterThan(-1);
    expect(bump).toBeGreaterThan(failureReturn);
    // And strictly the one call in this function -- no second emission site.
    expect((body.match(/setPdfAreaImageInvalidation\(/g) ?? []).length).toBe(1);
  });

  it('is keyed by the draft\'s own source document id, not a hardcoded or board-wide key', () => {
    const body = savePdfAreaDraftBody();
    expect(body).toContain('const invalidatedDocumentId = pendingPdfAreaDraft.payload.sourceDocumentId;');
    expect(body).toContain('[invalidatedDocumentId]: (prev[invalidatedDocumentId] ?? 0) + 1');
  });

  it('the provider forwards the same state CanvasClient bumps -- one signal, not a second one', () => {
    const providerSite = canvasClient.slice(
      canvasClient.indexOf('<KnowledgeSourceReferenceProvider'),
      canvasClient.indexOf('<KnowledgeSourceReferenceProvider') + 600,
    );
    expect(providerSite).toContain('pdfAreaImageInvalidation={pdfAreaImageInvalidation}');
  });
});
