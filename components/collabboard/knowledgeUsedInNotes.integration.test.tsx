// @vitest-environment jsdom
/**
 * P6J-F6-B3 -- "Used in Notes" rendered by the REAL reader, through the REAL
 * provider, from the REAL domain inversion.
 *
 * Nothing is stubbed between the reference rows and the DOM: the test builds
 * the same index CanvasClient builds and mounts KnowledgeDocumentDetails inside
 * KnowledgeSourceReferenceProvider, so a defect anywhere along that path fails
 * here rather than passing against a mock.
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
vi.mock('next/navigation', () => ({ useParams: () => ({ id: BOARD_ID }) }));

import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';
import KnowledgeSourceReaderDrawer from './KnowledgeSourceReaderDrawer';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import {
  buildKnowledgeSourceBacklinkIndex,
  isKnowledgeBacklinkNote,
  type KnowledgeBacklinkPost,
} from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

const DOC_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const DOC_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const N1 = '11111111-0000-4000-8000-000000000001';
const N2 = '22222222-0000-4000-8000-000000000002';
const DRAWING = 'dddddddd-0000-4000-8000-00000000000d';
const SHARED_FILENAME = 'Sammelmappe1.pdf';

let sequence = 0;
function reference(target: string, documentId: string, pageStart: number, pageEnd = pageStart): SourceReference {
  sequence += 1;
  return {
    id: `ref-${sequence}`,
    targetPadletId: target,
    sourceDocumentId: documentId,
    pageStart,
    pageEnd,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: `2026-02-02T00:00:0${sequence}.000Z`,
  } as unknown as SourceReference;
}

const note = (id: string, title: string, content = ''): KnowledgeBacklinkPost => ({ id, type: 'text', title, content });

const PAGES = [
  { pageNumber: 1, text: 'Page one body.' },
  { pageNumber: 2, text: 'Page two body.' },
  { pageNumber: 3, text: 'Page three body.' },
  { pageNumber: 4, text: 'Page four body.' },
  { pageNumber: 5, text: 'Page five body.' },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render({
  references,
  posts,
  documentId = DOC_A,
  originalFilename = SHARED_FILENAME,
  onOpenBacklinkTarget,
}: {
  references: readonly SourceReference[];
  posts: readonly KnowledgeBacklinkPost[];
  documentId?: string;
  originalFilename?: string;
  onOpenBacklinkTarget?: (targetPadletId: string) => void;
}): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeSourceReferenceProvider
        index={EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX}
        backlinks={buildKnowledgeSourceBacklinkIndex(references, posts)}
      >
        <KnowledgeDocumentDetails
          documentId={documentId}
          originalFilename={originalFilename}
          pageCount={PAGES.length}
          pages={PAGES}
          loading={false}
          error={false}
          onBack={() => undefined}
          onOpenBacklinkTarget={onOpenBacklinkTarget}
        />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return host!;
}

const documentBlock = (container: HTMLElement) =>
  container.querySelector('[data-knowledge-used-in-notes="document"]');

const pageBlock = (container: HTMLElement, pageNumber: number) =>
  container
    .querySelector(`[data-page-number="${pageNumber}"]`)
    ?.querySelector('[data-knowledge-used-in-notes="page"]') ?? null;

const targetIdsIn = (element: Element | null): string[] =>
  element === null
    ? []
    : Array.from(element.querySelectorAll('[data-knowledge-backlink-target]')).map(
        (node) => node.getAttribute('data-knowledge-backlink-target')!,
      );

describe('P6J-F6-B3 Used in Notes', () => {
  it('A: a document with no references renders no backlink UI at all', () => {
    const container = render({ references: [], posts: [note(N1, 'Orphan note')] });

    expect(documentBlock(container)).toBeNull();
    for (const page of [1, 2, 3, 4, 5]) expect(pageBlock(container, page), `page ${page}`).toBeNull();
    expect(container.textContent).not.toContain('Used in Notes');
    // Never the zero form.
    expect(container.textContent).not.toContain('Used in Notes · 0');
  });

  it('B: one p.2 reference shows the Note once at document level and once on page 2', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Runtime fixture note')],
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 1');
    expect(targetIdsIn(documentBlock(container))).toEqual([N1]);

    expect(pageBlock(container, 2)!.textContent).toContain('Used in Notes · 1');
    expect(pageBlock(container, 2)!.textContent).toContain('Runtime fixture note');
    expect(targetIdsIn(pageBlock(container, 2))).toEqual([N1]);

    // Every other page stays clean.
    for (const page of [1, 3, 4, 5]) expect(pageBlock(container, page), `page ${page}`).toBeNull();
  });

  it('C: two Notes citing the document produce a count of 2 and both targets', () => {
    const container = render({
      references: [reference(N1, DOC_A, 1), reference(N2, DOC_A, 4)],
      posts: [note(N1, 'First note'), note(N2, 'Second note')],
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 2');
    expect(targetIdsIn(documentBlock(container)).sort()).toEqual([N1, N2].sort());
    expect(targetIdsIn(pageBlock(container, 1))).toEqual([N1]);
    expect(targetIdsIn(pageBlock(container, 4))).toEqual([N2]);
  });

  it('D: duplicate reference rows for one Note render it exactly once, count 1', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2), reference(N1, DOC_A, 2), reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Cited thrice')],
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 1');
    expect(targetIdsIn(documentBlock(container))).toEqual([N1]);
    expect(pageBlock(container, 2)!.textContent).toContain('Used in Notes · 1');
    expect(targetIdsIn(pageBlock(container, 2))).toEqual([N1]);
  });

  it('E: a pp.2-4 citation appears on pages 2, 3 and 4 but not 1 or 5', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2, 4)],
      posts: [note(N1, 'Ranged note')],
    });

    for (const page of [2, 3, 4]) {
      expect(targetIdsIn(pageBlock(container, page)), `page ${page}`).toEqual([N1]);
    }
    for (const page of [1, 5]) expect(pageBlock(container, page), `page ${page}`).toBeNull();
    // Still one Note document-wide, not one per covered page.
    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 1');
  });

  it('F: an identically named document shows none of the other document\'s Notes', () => {
    const references = [reference(N1, DOC_A, 2)];
    const posts = [note(N1, 'Belongs to A')];

    const a = render({ references, posts, documentId: DOC_A, originalFilename: SHARED_FILENAME });
    expect(targetIdsIn(documentBlock(a))).toEqual([N1]);
    act(() => root!.unmount());
    host!.remove();

    // Same filename, different id: identity must not follow the name.
    const b = render({ references, posts, documentId: DOC_B, originalFilename: SHARED_FILENAME });
    expect(documentBlock(b)).toBeNull();
    expect(b.textContent).toContain(SHARED_FILENAME);
    expect(b.textContent).not.toContain('Belongs to A');
  });

  it('G: look-alike Notes are told apart by id, never by their identical text', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Identical label'), note(N2, 'Identical label')],
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 1');
    expect(targetIdsIn(documentBlock(container))).toEqual([N1]);
    expect(targetIdsIn(documentBlock(container))).not.toContain(N2);
  });

  it('H: a Drawing target with a reference is excluded from Used in Notes', () => {
    const container = render({
      references: [reference(DRAWING, DOC_A, 2), reference(N1, DOC_A, 2)],
      posts: [{ id: DRAWING, type: 'drawing', title: 'A drawing', content: '' }, note(N1, 'Only note')],
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 1');
    expect(targetIdsIn(documentBlock(container))).toEqual([N1]);
    expect(container.textContent).not.toContain('A drawing');
  });

  it('I: an unresolvable target renders nothing -- no blank row, no UUID, no crash', () => {
    const container = render({
      references: [reference('99999999-0000-4000-8000-000000000009', DOC_A, 2)],
      posts: [note(N1, 'Unrelated note')],
    });

    expect(documentBlock(container)).toBeNull();
    expect(container.textContent).not.toContain('99999999');
    expect(container.textContent).not.toContain('Used in Notes');
  });

  it('J: an HTML-bodied, untitled Note renders a safe plain-text label', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, '', '<p>Hello <strong>world</strong></p><script>alert(1)</script>')],
    });

    const row = documentBlock(container)!.querySelector('[data-knowledge-backlink-target]')!;
    expect(row.textContent).toBe('Hello world alert(1)');
    // The markup was flattened to text, never parsed into nodes.
    expect(documentBlock(container)!.querySelector('script')).toBeNull();
    expect(documentBlock(container)!.querySelector('strong')).toBeNull();
    expect(documentBlock(container)!.innerHTML).not.toContain('<script');
  });

  it('renders the generic fallback rather than an id when a Note has no text', () => {
    const container = render({ references: [reference(N1, DOC_A, 2)], posts: [note(N1, '', '')] });

    expect(targetIdsIn(documentBlock(container))).toEqual([N1]);
    expect(documentBlock(container)!.textContent).toContain('Note');
    // The id lives in the data attribute only -- never in the visible text.
    expect(documentBlock(container)!.textContent).not.toContain(N1);
  });

  it('L: without a navigation callback the rows stay display-only, as in B3', () => {
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Display only')],
    });

    for (const scope of [documentBlock(container)!, pageBlock(container, 2)!]) {
      expect(scope.querySelector('button, a, [role="button"], [tabindex], [href]')).toBeNull();
      expect(scope.className).not.toContain('cursor-pointer');
      expect(scope.innerHTML).not.toContain('cursor-pointer');
    }

    // Clicking a row must not raise anything, because there is no handler.
    const onError = vi.fn();
    window.addEventListener('error', onError);
    const row = documentBlock(container)!.querySelector('[data-knowledge-backlink-target]') as HTMLElement;
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    window.removeEventListener('error', onError);
    expect(onError).not.toHaveBeenCalled();
  });

  it('K: the reader issues no request of its own to build backlinks', () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      render({ references: [reference(N1, DOC_A, 2)], posts: [note(N1, 'No fetch')] });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a surface mounted outside the provider degrades to no backlinks', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <KnowledgeDocumentDetails
          documentId={DOC_A}
          originalFilename={SHARED_FILENAME}
          pageCount={PAGES.length}
          pages={PAGES}
          loading={false}
          error={false}
          onBack={() => undefined}
        />,
      );
    });

    expect(documentBlock(host)).toBeNull();
    expect(host.textContent).not.toContain('Used in Notes');
  });

  it('B2 page targeting and the Create Note action still work alongside the backlinks', () => {
    const created: unknown[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <KnowledgeSourceReferenceProvider
          index={EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX}
          backlinks={buildKnowledgeSourceBacklinkIndex([reference(N1, DOC_A, 2)], [note(N1, 'Coexists')])}
        >
          <KnowledgeDocumentDetails
            documentId={DOC_A}
            originalFilename={SHARED_FILENAME}
            pageCount={PAGES.length}
            pages={PAGES}
            loading={false}
            error={false}
            initialPageNumber={2}
            onBack={() => undefined}
            onCreateNoteFromPage={(request) => created.push(request)}
          />
        </KnowledgeSourceReferenceProvider>,
      );
    });

    const button = Array.from(host.querySelectorAll('button')).find(
      (candidate) => candidate.getAttribute('aria-label') === 'Create Note from page 2',
    )!;
    expect(button).toBeTruthy();
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(created).toEqual([
      // selection stays null at B4-B2B: no text was selected before the click.
      { sourceDocumentId: DOC_A, originalFilename: SHARED_FILENAME, pageNumber: 2, pageText: 'Page two body.', selection: null },
    ]);
    expect(targetIdsIn(pageBlock(host, 2))).toEqual([N1]);
  });
});

// ============================================================================
// P6J-F6-B3N -- clicking a backlink opens the live Note
// ============================================================================

const rowFor = (scope: Element | null, targetPadletId: string): HTMLButtonElement | null =>
  scope?.querySelector(`[data-knowledge-backlink-target="${targetPadletId}"] button`) ?? null;

const clickRow = (scope: Element | null, targetPadletId: string) => {
  const button = rowFor(scope, targetPadletId)!;
  expect(button, `no clickable row for ${targetPadletId}`).toBeTruthy();
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('P6J-F6-B3N backlink navigation', () => {
  it('A: a document-level click emits the target padlet id, never the label', () => {
    const opened: string[] = [];
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'A note with a distinctive title')],
      onOpenBacklinkTarget: (id) => opened.push(id),
    });

    clickRow(documentBlock(container), N1);

    expect(opened).toEqual([N1]);
    // The visible text is not what travelled.
    expect(opened).not.toContain('A note with a distinctive title');
  });

  it('B: a page-level click emits exactly the same stable id', () => {
    const opened: string[] = [];
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Same note both ways')],
      onOpenBacklinkTarget: (id) => opened.push(id),
    });

    clickRow(pageBlock(container, 2), N1);
    clickRow(documentBlock(container), N1);

    expect(opened).toEqual([N1, N1]);
  });

  it('C: look-alike Notes each open themselves, never the other', () => {
    const opened: string[] = [];
    const container = render({
      references: [reference(N1, DOC_A, 1), reference(N2, DOC_A, 2)],
      // Identical title AND body: only the id can tell them apart.
      posts: [note(N1, 'Identical', '<p>same</p>'), note(N2, 'Identical', '<p>same</p>')],
      onOpenBacklinkTarget: (id) => opened.push(id),
    });

    clickRow(documentBlock(container), N1);
    expect(opened).toEqual([N1]);

    clickRow(documentBlock(container), N2);
    expect(opened).toEqual([N1, N2]);
  });

  it('D: two Notes sharing the PDF filename are distinguished by page hints', () => {
    const opened: string[] = [];
    const container = render({
      references: [reference(N1, DOC_A, 1), reference(N2, DOC_A, 2)],
      posts: [note(N1, SHARED_FILENAME), note(N2, SHARED_FILENAME)],
      onOpenBacklinkTarget: (id) => opened.push(id),
    });

    const texts = Array.from(documentBlock(container)!.querySelectorAll('[data-knowledge-backlink-target]'))
      .map((row) => row.textContent);
    expect(texts).toEqual([`${SHARED_FILENAME} · p. 1`, `${SHARED_FILENAME} · p. 2`]);
    // Distinguishable to the eye, still addressed by id.
    expect(targetIdsIn(documentBlock(container))).toEqual([N1, N2]);
    clickRow(documentBlock(container), N2);
    expect(opened).toEqual([N2]);
    // And no UUID was shown to achieve it.
    expect(documentBlock(container)!.textContent).not.toContain(N1);
    expect(documentBlock(container)!.textContent).not.toContain(N2);
  });

  it('F: one Note citing several ranges stays a single row covering both', () => {
    const container = render({
      references: [reference(N1, DOC_A, 1), reference(N1, DOC_A, 3, 4), reference(N2, DOC_A, 5)],
      posts: [note(N1, SHARED_FILENAME), note(N2, SHARED_FILENAME)],
      onOpenBacklinkTarget: () => undefined,
    });

    expect(documentBlock(container)!.textContent).toContain('Used in Notes · 2');
    expect(rowFor(documentBlock(container), N1)!.textContent).toBe(`${SHARED_FILENAME} · pp. 1, 3–4`);
    expect(targetIdsIn(documentBlock(container))).toEqual([N1, N2]);
  });

  it('G: page-level rows keep the plain label -- the Page heading carries the page', () => {
    const container = render({
      references: [reference(N1, DOC_A, 1), reference(N2, DOC_A, 2)],
      posts: [note(N1, SHARED_FILENAME), note(N2, SHARED_FILENAME)],
      onOpenBacklinkTarget: () => undefined,
    });

    expect(rowFor(pageBlock(container, 2), N2)!.textContent).toBe(SHARED_FILENAME);
    expect(rowFor(pageBlock(container, 2), N2)!.textContent).not.toContain('p. 2');
    expect(targetIdsIn(pageBlock(container, 2))).toEqual([N2]);
  });

  it('N: a row is a real, keyboard-reachable button once navigation exists', () => {
    const opened: string[] = [];
    const container = render({
      references: [reference(N1, DOC_A, 2)],
      posts: [note(N1, 'Reachable')],
      onOpenBacklinkTarget: (id) => opened.push(id),
    });

    const button = rowFor(documentBlock(container), N1)!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    // Not removed from the tab order, and not a div pretending to be a control.
    expect(button.getAttribute('tabindex')).toBeNull();
    expect(button.className).toContain('cursor-pointer');
    expect(button.className).toContain('focus-visible:');

    button.focus();
    expect(document.activeElement).toBe(button);
    // Enter on a focused button is a click in the DOM's own semantics.
    act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toEqual([N1]);
  });

  it('L: clicking a backlink issues no request of any kind', () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const container = render({
        references: [reference(N1, DOC_A, 2)],
        posts: [note(N1, 'No fetch on click')],
        onOpenBacklinkTarget: () => undefined,
      });
      clickRow(documentBlock(container), N1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  // J (CanvasClient resolves by id and fails closed) is pinned at the source in
  // the governance suite's L4 -- CanvasClient is the whole board and cannot be
  // mounted here. K's predicate is behavioural, so it is exercised directly.
  it('K: the Note predicate the handler guards with excludes every non-Note target', () => {
    // The same function CanvasClient calls, exercised directly.
    for (const type of ['drawing', 'file', 'card', 'image', 'link', 'table', 'todo', 'container']) {
      expect(isKnowledgeBacklinkNote({ id: N1, type }), `${type} must not be openable`).toBe(false);
    }
    for (const type of ['note', 'text']) {
      expect(isKnowledgeBacklinkNote({ id: N1, type })).toBe(true);
    }
  });

  it('M: clicking a backlink changes no URL and pushes no history entry', () => {
    const before = window.location.href;
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    try {
      const container = render({
        references: [reference(N1, DOC_A, 2)],
        posts: [note(N1, 'Stays put')],
        onOpenBacklinkTarget: () => undefined,
      });
      clickRow(documentBlock(container), N1);

      expect(window.location.href).toBe(before);
      expect(pushState).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
    } finally {
      pushState.mockRestore();
      replaceState.mockRestore();
    }
  });
});

// ============================================================================
// P6J-F6-B3N -- the transition, through the REAL Knowledge surface
// ============================================================================
describe('P6J-F6-B3N Knowledge close/navigate transition', () => {
  const DOCUMENT = {
    id: DOC_A,
    boardId: BOARD_ID,
    originalFilename: SHARED_FILENAME,
    mimeType: 'application/pdf',
    fileSizeBytes: 1024,
    pageCount: PAGES.length,
    processingStatus: 'ready',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:02.000Z',
  };

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  /**
   * P6J-F7-B1. Mount plumbing only: the reader is now the shell-level drawer,
   * so the same real backlink row is exercised through it instead of through
   * the library modal. The behaviour under test is what changed deliberately --
   * the reader no longer tears itself down to let the Note through.
   */
  async function openReader() {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/knowledge/warm')) return jsonResponse({ ok: true });
      if (url.includes('/pages')) return jsonResponse({ document: DOCUMENT, pages: PAGES });
      return jsonResponse({ documents: [DOCUMENT] });
    }) as unknown as typeof fetch;

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    const view = (requestId: number | null) => (
      <KnowledgeSourceReferenceProvider
        index={EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX}
        backlinks={buildKnowledgeSourceBacklinkIndex([reference(N1, DOC_A, 2)], [note(N1, 'Cited note')])}
      >
        <KnowledgeSourceReaderDrawer
          documentOpenRequest={requestId === null ? null : { requestId, sourceDocumentId: DOC_A }}
          onOpenBacklinkTarget={(targetPadletId) => calls.push(`navigate:${targetPadletId}`)}
        />
      </KnowledgeSourceReferenceProvider>
    );

    await act(async () => { root!.render(view(1)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[data-knowledge-reader="true"]'), 'the reader did not open').toBeTruthy();

    return { calls, view, restore: () => { globalThis.fetch = originalFetch; } };
  }

  it('H: the canvas is asked to open the Note, and the reader stays open', async () => {
    const { calls, restore } = await openReader();
    try {
      const surface = document.querySelector('[data-knowledge-reader="true"]')!;
      const button = surface.querySelector(`[data-knowledge-backlink-target="${N1}"] button`) as HTMLButtonElement;
      expect(button, 'the reader rendered no clickable backlink').toBeTruthy();

      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      // F7 inverts B3N's premise: the reader no longer paints over the editor,
      // so it stays beside the Note instead of closing to make room for it.
      expect(calls).toEqual([`navigate:${N1}`]);
      expect(document.querySelector('[data-knowledge-reader="true"]')).not.toBeNull();
      expect(document.querySelector('[data-knowledge-used-in-notes]')).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('I: closing the reader replays nothing', async () => {
    const { calls, view, restore } = await openReader();
    try {
      const button = document.querySelector(`[data-knowledge-backlink-target="${N1}"] button`) as HTMLButtonElement;
      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(calls).toEqual([`navigate:${N1}`]);

      // Close the reader, then re-render with the same handled request in place.
      const close = document.querySelector('button[aria-label="Close Knowledge reader"]') as HTMLButtonElement;
      await act(async () => { close.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await act(async () => { root!.render(view(1)); });

      // The request was already handled, so nothing re-fires and the reader
      // stays shut rather than reopening the document it last showed.
      expect(calls).toEqual([`navigate:${N1}`]);
      expect(document.querySelector('[data-knowledge-reader="true"]')).toBeNull();
      expect(document.querySelector('[data-knowledge-used-in-notes]')).toBeNull();
    } finally {
      restore();
    }
  });
});
