// @vitest-environment jsdom
//
// P6J-F7-B1 -- the board-adjacent Knowledge reader.
//
// Most of this file is RELOCATED coverage, not new coverage: F5's create-Note
// flow, F6-B2's source-open requests and F6-B4-B4's exact-citation forwarding
// all used to be proved against KnowledgeDocumentsList because the reader lived
// inside it. The reader moved; the guarantees did not, so the tests moved with
// it rather than being rewritten or thinned. The F7-B1 block at the end is the
// genuinely new part.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSourceReaderDrawer from './KnowledgeSourceReaderDrawer';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import { buildKnowledgeSourceBacklinkIndex } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SOURCE_B = 'bbbbbbbb-2222-4222-8222-222222222222';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: BOARD_ID }),
}));

const drawerCode = fs
  .readFileSync(path.join(process.cwd(), 'components/collabboard/KnowledgeSourceReaderDrawer.tsx'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async () => jsonResponse({ pages: [] }));
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
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

type DrawerProps = React.ComponentProps<typeof KnowledgeSourceReaderDrawer>;

/** Renders the drawer, optionally inside a real provider. */
async function mount(props: DrawerProps, references: readonly SourceReference[] = []): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await renderInto(props, references);
  return host;
}

async function renderInto(props: DrawerProps, references: readonly SourceReference[] = []) {
  await act(async () => {
    root!.render(
      <KnowledgeSourceReferenceProvider
        index={buildKnowledgeSourceReferenceIndex(references)}
        backlinks={buildKnowledgeSourceBacklinkIndex(references, [
          { id: 'padlet-1', type: 'text', title: 'Citing Note', content: '' } as never,
        ])}
      >
        <KnowledgeSourceReaderDrawer {...props} />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  await settle();
}

/** The drawer is a fixed overlay, so it renders into the host subtree. */
const drawerEl = () => document.querySelector('[data-knowledge-reader="true"]') as HTMLElement | null;
const pageRequests = () => fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => /\/pages$/.test(url));
const docRequest = (requestId: number, sourceDocumentId = SOURCE_A, pageNumber?: number) =>
  ({ requestId, sourceDocumentId, pageNumber });

// ============================================================================
// Relocated from KnowledgeDocumentsList: P6J-F6-B2 source-open requests
// ============================================================================
// Identity is the document id throughout. Two sources can share a filename, so
// a name-based lookup would open the wrong document.

describe('P6J-F6-B2 source-open requests (relocated)', () => {
  function pagesFor(documentId: string, originalFilename: string, pageCount = 3) {
    return jsonResponse({
      document: { id: documentId, originalFilename, pageCount },
      pages: Array.from({ length: pageCount }, (_, index) => ({
        pageNumber: index + 1,
        text: `${originalFilename} body for page ${index + 1}`,
      })),
    });
  }

  function withPages(pageBodies: Record<string, Response | (() => Response)>) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const match = String(input).match(/\/knowledge\/([^/]+)\/pages$/);
      const body = match ? pageBodies[match[1]] : undefined;
      if (!body) return jsonResponse({ error: 'Not found' }, 404);
      return typeof body === 'function' ? body() : body;
    });
  }

  const srcRequest = (requestId: number, sourceDocumentId = SOURCE_A, pageStart = 1) =>
    ({ requestId, sourceDocumentId, sourceReferenceId: 'ref-1', pageStart, pageEnd: pageStart });

  it('A: opens the reader on the requested document id', async () => {
    withPages({ [SOURCE_A]: pagesFor(SOURCE_A, 'EMG_checklist.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1, SOURCE_A, 2) });

    expect(pageRequests()).toHaveLength(1);
    expect(pageRequests()[0]).toBe(`/api/boards/${BOARD_ID}/knowledge/${SOURCE_A}/pages`);
    expect(drawerEl()!.textContent).toContain('EMG_checklist.pdf');
  });

  it('B: hands the reader the requested page as its scroll target', async () => {
    withPages({ [SOURCE_A]: pagesFor(SOURCE_A, 'EMG_checklist.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1, SOURCE_A, 3) });

    expect(drawerEl()!.querySelector('[data-page-number="3"]')).not.toBeNull();
    expect(drawerCode).toContain('initialPageNumber={reader.initialPageNumber}');
    expect(drawerCode).toContain('openDocumentById(sourceOpenRequest.sourceDocumentId, sourceOpenRequest.pageStart, {');
  });

  it('C: hydrates the header from the document the endpoint returned', async () => {
    withPages({ [SOURCE_A]: pagesFor(SOURCE_A, 'Sammelmappe1.pdf', 4) });

    await mount({ sourceOpenRequest: srcRequest(1) });

    expect(drawerEl()!.textContent).toContain('Sammelmappe1.pdf');
    expect(drawerEl()!.textContent).toContain('4 pages');
    // Never fabricated from the id.
    expect(drawerEl()!.textContent).not.toContain(SOURCE_A);
  });

  it('D: two documents sharing a filename resolve by id, not by name', async () => {
    withPages({ [SOURCE_A]: pagesFor(SOURCE_A, 'Good.pdf'), [SOURCE_B]: pagesFor(SOURCE_B, 'Good.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1, SOURCE_B) });

    // The requested id is the one fetched; the identical name never decides.
    expect(pageRequests()).toEqual([`/api/boards/${BOARD_ID}/knowledge/${SOURCE_B}/pages`]);
    expect(drawerEl()!.textContent).toContain('Good.pdf body for page 1');
  });

  /**
   * A FRESH object carrying the same requestId on every render. Re-passing one
   * object proves nothing: React skips the effect on identical deps, so the
   * latch would never run and a missing latch would still pass.
   */
  it('E: a request is acted on once, not on every re-render', async () => {
    withPages({ [SOURCE_A]: pagesFor(SOURCE_A, 'EMG_checklist.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1) });
    await renderInto({ sourceOpenRequest: srcRequest(1) });
    await renderInto({ sourceOpenRequest: srcRequest(1) });

    expect(pageRequests()).toHaveLength(1);
  });

  it('F: clicking the same source again opens it again under a new request id', async () => {
    withPages({ [SOURCE_A]: () => pagesFor(SOURCE_A, 'EMG_checklist.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1) });
    expect(pageRequests()).toHaveLength(1);

    // Same document, same page -- only the id differs.
    await renderInto({ sourceOpenRequest: srcRequest(2) });

    expect(pageRequests()).toHaveLength(2);
  });

  it('G: closing the reader does not replay the last handled source', async () => {
    withPages({ [SOURCE_A]: () => pagesFor(SOURCE_A, 'EMG_checklist.pdf') });

    await mount({ sourceOpenRequest: srcRequest(1) });
    expect(pageRequests()).toHaveLength(1);

    await closeDrawer();
    expect(drawerEl()).toBeNull();
    // The same stale request, rebuilt, is still in place on the next render.
    await renderInto({ sourceOpenRequest: srcRequest(1) });

    expect(pageRequests()).toHaveLength(1);
    expect(drawerEl()).toBeNull();
  });

  it('H: with no request the drawer renders nothing and fetches nothing', async () => {
    await mount({});

    expect(drawerEl()).toBeNull();
    expect(pageRequests()).toHaveLength(0);
  });

  it('I: a failed source document reuses the existing reader error state', async () => {
    withPages({});

    await mount({ sourceOpenRequest: srcRequest(1) });

    // No bespoke broken-citation modal, no throw.
    expect(drawerEl()!.textContent).toContain('Extracted text unavailable.');
  });

  it('J: source opening adds no endpoint and no filename-keyed lookup', async () => {
    // One pages endpoint, reused -- not a second fetch implementation.
    expect((drawerCode.match(/\/pages`\)/g) ?? []).length).toBe(1);
    // The document lookup is keyed on id. A filename-keyed find would open the
    // wrong one of two same-named sources.
    expect(drawerCode).not.toMatch(/find\([^)]*originalFilename/);
    expect(drawerCode).not.toMatch(/filter\([^)]*originalFilename/);
  });
});

// ============================================================================
// Relocated from KnowledgeDocumentsList: P6J-F5 create Note from a source page
// ============================================================================

describe('P6J-F5 create Note from a source page (relocated)', () => {
  const PAGES = [
    { pageNumber: 1, text: 'Page one extracted text' },
    { pageNumber: 2, text: '  spaced\r\nlines  ' },
  ];

  function withPages(pages: unknown, document?: unknown) {
    fetchMock.mockImplementation(async () => jsonResponse({ document, pages }));
  }

  function createNoteButtons(): HTMLButtonElement[] {
    return Array.from(drawerEl()?.querySelectorAll('button') ?? [])
      .filter((button) => button.textContent?.trim() === 'Create Note') as HTMLButtonElement[];
  }

  it('emits the real document id, filename, page number and exact page text', async () => {
    withPages(PAGES, { id: 'doc-real', originalFilename: 'sources.pdf' });
    const onCreate = vi.fn();

    await mount({ documentOpenRequest: docRequest(1, 'doc-real'), onCreateNoteFromPage: onCreate });

    const buttons = createNoteButtons();
    expect(buttons).toHaveLength(2);
    await act(async () => { buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-real',
      originalFilename: 'sources.pdf',
      pageNumber: 2,
      // Byte-exact: whitespace and CRLF are evidence, not formatting.
      pageText: '  spaced\r\nlines  ',
      // B4-B2B: no text was selected, so this stays the page-only request.
      selection: null,
    });
  });

  it('identifies the page by documentId when two documents share a filename', async () => {
    withPages([PAGES[0]], { id: 'document-b', originalFilename: 'duplicate.pdf' });
    const onCreate = vi.fn();

    // Open the SECOND of two identically named documents.
    await mount({ documentOpenRequest: docRequest(1, 'document-b'), onCreateNoteFromPage: onCreate });
    await act(async () => { createNoteButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const request = onCreate.mock.calls[0][0] as { sourceDocumentId: string; originalFilename: string };
    expect(request.sourceDocumentId).toBe('document-b');
    expect(request.originalFilename).toBe('duplicate.pdf');
  });

  it('offers no creation action to a viewer without the capability', async () => {
    withPages(PAGES, { id: SOURCE_A, originalFilename: 'a.pdf' });

    await mount({ documentOpenRequest: docRequest(1) });

    expect(drawerEl()!.textContent).toContain('Page one extracted text');
    // Absent entirely, not rendered disabled.
    expect(createNoteButtons()).toHaveLength(0);
    expect(drawerEl()!.textContent).not.toContain('Create Note');
  });

  it('shows no action until pages have actually rendered', async () => {
    const pages = deferred<Response>();
    fetchMock.mockImplementation(() => pages.promise);
    const onCreate = vi.fn();

    await mount({ documentOpenRequest: docRequest(1), onCreateNoteFromPage: onCreate });

    expect(drawerEl()!.textContent).toContain('Loading extracted text…');
    expect(createNoteButtons()).toHaveLength(0);

    pages.resolve(jsonResponse({ document: { id: SOURCE_A, originalFilename: 'a.pdf' }, pages: [PAGES[0]] }));
    await settle();
    expect(createNoteButtons()).toHaveLength(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('leaves the reader open after Create Note, and Back still closes it', async () => {
    withPages(PAGES, { id: SOURCE_A, originalFilename: 'a.pdf' });
    const onCreate = vi.fn();

    await mount({ documentOpenRequest: docRequest(1), onCreateNoteFromPage: onCreate });
    expect(createNoteButtons()).toHaveLength(2);

    await act(async () => { createNoteButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // F7: creating a Note no longer tears the source down behind it.
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(drawerEl()).not.toBeNull();
    expect(createNoteButtons()).toHaveLength(2);

    const back = Array.from(drawerEl()!.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Back to PDFs'))!;
    await act(async () => { back.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(drawerEl()).toBeNull();
  });
});

// ============================================================================
// Relocated from KnowledgeDocumentsList: reader load states
// ============================================================================
// A source opened from a semantic result arrives with no page count, and an
// extraction run can legitimately yield no pages at all. Neither absence may be
// reported as a fact the reader does not actually have.

describe('reader load states (relocated)', () => {
  it('claims no page count while the page request is still unresolved', async () => {
    const pages = deferred<Response>();
    fetchMock.mockImplementation(() => pages.promise);

    // A semantic-result open: the page number is known, the page count is not.
    await mount({ documentOpenRequest: docRequest(1, SOURCE_A, 1) });

    const loading = drawerEl()!;
    expect(loading.textContent).toContain('Loading extracted text…');
    // The reader is holding zero pages here -- but it has not read the document
    // yet, so "0 pages" would assert something it does not know.
    expect(loading.textContent).not.toContain('0 pages');
    expect(loading.textContent, 'no page count may be claimed before one is known')
      .not.toMatch(/\d+\s+pages?\b/);

    pages.resolve(jsonResponse({
      document: { id: SOURCE_A, originalFilename: 'Slow.pdf', pageCount: 1 },
      pages: [{ pageNumber: 1, text: 'the only page' }],
    }));
    await settle();

    // Once the document really has been read, the count is stated.
    expect(drawerEl()!.textContent).not.toContain('Loading extracted text…');
    expect(drawerEl()!.textContent).toContain('1 page');
    expect(drawerEl()!.textContent).not.toContain('0 pages');
    expect(drawerEl()!.textContent).toContain('the only page');
  });

  it('reports a successful empty-pages response as its own state', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({
      document: { id: SOURCE_A, originalFilename: 'Empty.pdf', pageCount: 2 },
      pages: [],
    }));

    await mount({ documentOpenRequest: docRequest(1) });

    const drawer = drawerEl()!;
    expect(drawer.textContent).toContain('No extracted text available.');
    // A successful read that yielded nothing is neither a failure nor a wait,
    // so neither neighbouring branch may stand in for it.
    expect(drawer.textContent, 'an empty result is not an error').not.toContain('Extracted text unavailable.');
    expect(drawer.textContent, 'an empty result is not still loading').not.toContain('Loading extracted text…');
    // And it stays a usable reader: named, and closable.
    expect(drawer.textContent).toContain('Empty.pdf');
    expect(drawer.querySelector('button[aria-label="Close Knowledge reader"]')).not.toBeNull();
  });
});

// ============================================================================
// Relocated from KnowledgeDocumentsList: P6J-F6-B4-B4 exact citation forwarding
// ============================================================================
// Rendered through the REAL provider and the REAL index, so the arrival marker
// only appears when a stored citation genuinely resolved on the loaded page.

describe('P6J-F6-B4-B4 exact source forwarding (relocated)', () => {
  const FILENAME = 'EMG_checklist.pdf';
  const PAGE_ONE = `${FILENAME} body for page 1`;
  const QUOTE_START = 0;
  const QUOTE_END = FILENAME.length;

  function withPages(pageCount = 3) {
    fetchMock.mockImplementation(async () => jsonResponse({
      document: { id: SOURCE_A, originalFilename: FILENAME, pageCount },
      pages: Array.from({ length: pageCount }, (_, index) => ({
        pageNumber: index + 1,
        text: `${FILENAME} body for page ${index + 1}`,
      })),
    }));
  }

  /** A citation of page 1 whose offsets genuinely address its own quote. */
  const exactReference = (id: string, targetPadletId = 'padlet-1') => ({
    id,
    targetPadletId,
    sourceDocumentId: SOURCE_A,
    pageStart: 1,
    pageEnd: 1,
    quoteText: PAGE_ONE.slice(QUOTE_START, QUOTE_END),
    quoteHash: null,
    charStart: QUOTE_START,
    charEnd: QUOTE_END,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  }) as unknown as SourceReference;

  const REFERENCES = [exactReference('ref-exact-1')];
  const arrivalTargets = () =>
    Array.from(drawerEl()?.querySelectorAll('[data-knowledge-source-navigation-target="true"]') ?? []);
  const sourceRequest = (requestId: number, sourceReferenceId: string) =>
    ({ requestId, sourceDocumentId: SOURCE_A, sourceReferenceId, pageStart: 1, pageEnd: 1 });

  it('E: a source request still opens by document id and page', async () => {
    withPages();

    await mount({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);

    expect(pageRequests()).toContain(`/api/boards/${BOARD_ID}/knowledge/${SOURCE_A}/pages`);
    expect(drawerEl()!.querySelector('[data-page-number="1"]')).not.toBeNull();
  });

  it('F: the citing row id reaches the reader and marks its resolved span', async () => {
    withPages();

    await mount({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);

    const marked = arrivalTargets();
    expect(marked).toHaveLength(1);
    // The RESOLVED text, not the whole page and not the page start.
    expect(marked[0].textContent).toBe(FILENAME);
  });

  it('G: opening a document from the library inherits no exact target', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1) }, REFERENCES);

    // The citation still paints -- it just was not navigated to.
    expect(drawerEl()!.querySelectorAll('[data-knowledge-source-highlight="true"]').length).toBeGreaterThan(0);
    expect(arrivalTargets()).toHaveLength(0);
  });

  it('H: opening a semantic result page inherits no exact target', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1, SOURCE_A, 1) }, REFERENCES);

    expect(drawerEl()!.querySelector('[data-page-number="1"]')).not.toBeNull();
    expect(arrivalTargets()).toHaveLength(0);
  });

  it('I: the same citation under a new request id is forwarded again', async () => {
    withPages();

    await mount({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);
    expect(arrivalTargets()).toHaveLength(1);

    // Close the reader, then ask for the very same citation again.
    await closeDrawer();
    expect(drawerEl()).toBeNull();

    await renderInto({ sourceOpenRequest: sourceRequest(2, 'ref-exact-1') }, REFERENCES);

    expect(arrivalTargets()).toHaveLength(1);
  });

  // Rebuilt each render: see the note on B2 test E.
  it('J: a repeated render of one request id opens the document once', async () => {
    withPages();

    await mount({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);
    await renderInto({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);
    await renderInto({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);

    expect(pageRequests()).toHaveLength(1);
  });

  it('K: forwarding the citation adds no endpoint of its own', async () => {
    withPages();

    await mount({ sourceOpenRequest: sourceRequest(1, 'ref-exact-1') }, REFERENCES);

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    // Nothing provenance-specific: the citations were already in memory.
    expect(urls.filter((url) => /reference|provenance/i.test(url))).toEqual([]);
    expect(pageRequests()).toHaveLength(1);
  });
});

async function closeDrawer() {
  const close = drawerEl()!.querySelector('button[aria-label="Close Knowledge reader"]') as HTMLButtonElement;
  await act(async () => { close.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}

// ============================================================================
// P6J-F7-B1 -- the drawer itself
// ============================================================================

describe('P6J-F7-B1 board-adjacent reader drawer', () => {
  const FILENAME = 'EMG_checklist.pdf';
  const PAGE_ONE = `${FILENAME} body for page 1`;

  function withPages() {
    fetchMock.mockImplementation(async () => jsonResponse({
      document: { id: SOURCE_A, originalFilename: FILENAME, pageCount: 2 },
      pages: [
        { pageNumber: 1, text: PAGE_ONE },
        { pageNumber: 2, text: `${FILENAME} body for page 2` },
      ],
    }));
  }

  const exactReference = () => ({
    id: 'ref-exact-1',
    targetPadletId: 'padlet-1',
    sourceDocumentId: SOURCE_A,
    pageStart: 1,
    pageEnd: 1,
    quoteText: PAGE_ONE.slice(0, FILENAME.length),
    quoteHash: null,
    charStart: 0,
    charEnd: FILENAME.length,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  }) as unknown as SourceReference;

  // --- B: a library pick opens the drawer, and it is the only detail surface.
  it('B: a library document request opens exactly one reader surface', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1) });

    expect(drawerEl()).not.toBeNull();
    expect(document.querySelectorAll('[data-knowledge-reader="true"]')).toHaveLength(1);
    // One canonical page root per page, from one renderer.
    expect(drawerEl()!.querySelectorAll('[data-knowledge-page-text-root]')).toHaveLength(2);
    expect(drawerEl()!.textContent).toContain(FILENAME);
  });

  // --- C: a semantic result's own page reaches the reader as its scroll target.
  it('C: a semantic result page number reaches the reader', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1, SOURCE_A, 2) });

    expect(drawerEl()!.querySelector('[data-page-number="2"]')).not.toBeNull();
    expect(drawerCode).toContain('openDocumentById(documentOpenRequest.sourceDocumentId, documentOpenRequest.pageNumber, null)');
  });

  // --- E: the reader survives opening the Note it cites.
  it('E: forwarding a backlink target opens the Note and leaves the reader open', async () => {
    withPages();
    const onOpen = vi.fn();

    await mount(
      { sourceOpenRequest: { requestId: 1, sourceDocumentId: SOURCE_A, sourceReferenceId: 'ref-exact-1', pageStart: 1, pageEnd: 1 }, onOpenBacklinkTarget: onOpen },
      [exactReference()],
    );

    const highlight = drawerEl()!.querySelector('[data-knowledge-source-highlight="true"][role="button"]') as HTMLElement;
    expect(highlight).not.toBeNull();
    await act(async () => { highlight.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onOpen).toHaveBeenCalledWith('padlet-1');
    // The whole point of F7: the source stays beside the Note it supports.
    expect(drawerEl()).not.toBeNull();
    expect(drawerEl()!.textContent).toContain(FILENAME);
  });

  it('E2: a Used in Notes row opens its Note and leaves the reader open', async () => {
    withPages();
    const onOpen = vi.fn();

    await mount({ documentOpenRequest: docRequest(1), onOpenBacklinkTarget: onOpen }, [exactReference()]);

    const row = drawerEl()!.querySelector('[data-knowledge-backlink-target="padlet-1"] button') as HTMLButtonElement;
    expect(row).not.toBeNull();
    await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onOpen).toHaveBeenCalledWith('padlet-1');
    expect(drawerEl()).not.toBeNull();
  });

  // --- H / L: the latch outlives everything that used to reset it.
  it('H: an already-handled request is never replayed, even after closing', async () => {
    withPages();
    // Rebuilt every time, so the latch -- not React's dep check -- is what
    // stops the replay.
    const request = () => ({ requestId: 7, sourceDocumentId: SOURCE_A, sourceReferenceId: 'ref-1', pageStart: 1, pageEnd: 1 });

    await mount({ sourceOpenRequest: request() });
    expect(pageRequests()).toHaveLength(1);

    await closeDrawer();
    await renderInto({ sourceOpenRequest: request() });
    await renderInto({ sourceOpenRequest: request() });

    expect(pageRequests()).toHaveLength(1);
    expect(drawerEl()).toBeNull();
  });

  it('L: the drawer is mounted outside every toolbar condition, so collapsing cannot unmount or replay it', () => {
    const canvasClient = fs
      .readFileSync(path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');

    const mountIndex = canvasClient.indexOf('<KnowledgeSourceReaderDrawer');
    expect(mountIndex).toBeGreaterThan(-1);
    // The toolbar gate wraps CanvasSidebar only, and closes long before here.
    const gate = canvasClient.indexOf('{canUseCanvasToolbar && !effectiveToolbarCollapsed && (');
    expect(gate).toBeGreaterThan(-1);
    expect(canvasClient.slice(gate, mountIndex)).toContain('</CanvasViewport>');
    // A sibling of the viewport, never a descendant of the sidebar wrapper.
    expect(canvasClient.indexOf('</CanvasViewport>')).toBeLessThan(mountIndex);

    /**
     * The decisive check: NOTHING may condition the mount itself. Position
     * alone is not enough -- a fresh `{canUseCanvasToolbar && <Drawer` written
     * right here would sit after </CanvasViewport> and still take the reader
     * down with the toolbar. So the JSX immediately preceding the mount must
     * open it outright.
     */
    const preceding = canvasClient.slice(Math.max(0, mountIndex - 400), mountIndex);
    for (const gateToken of ['canUseCanvasToolbar', 'effectiveToolbarCollapsed', 'isToolbarCollapsed', 'knowledgeOpen']) {
      expect(preceding, `the drawer mount must not be gated on ${gateToken}`).not.toContain(gateToken);
    }
    // Rendered unconditionally: what immediately precedes the tag closes the
    // previous element or a JSX comment -- never `&&` or `?`.
    const justBefore = preceding.trimEnd();
    expect(justBefore.endsWith('&&'), 'the drawer mount is behind an && guard').toBe(false);
    expect(justBefore.endsWith('?'), 'the drawer mount is behind a ternary').toBe(false);
    // And the latch lives with the permanently-mounted drawer.
    expect(drawerCode).toContain('handledSourceRequestRef.current = sourceOpenRequest.requestId;');
    const sidebar = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/canvas/ui/CanvasSidebar.tsx'), 'utf8');
    expect(sidebar).not.toContain('sourceOpenRequest');
    expect(sidebar).not.toContain('KnowledgeSourceReaderDrawer');
  });

  // --- I: a genuinely new intent is honoured.
  it('I: a new requestId for the same document opens it again', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1) });
    expect(pageRequests()).toHaveLength(1);

    await renderInto({ documentOpenRequest: docRequest(2) });

    expect(pageRequests()).toHaveLength(2);
    expect(drawerEl()).not.toBeNull();
  });

  // --- J: one responsive implementation.
  it('J: a single responsive surface, with no JS breakpoint', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1) });

    const className = drawerEl()!.className;
    expect(className).toContain('w-full');
    expect(className).toContain('md:w-[420px]');
    expect(className).toContain('fixed');
    expect(className).toContain('inset-y-0');
    expect(className).toContain('right-0');
    // No layout reservation and no measured breakpoint anywhere.
    for (const forbidden of ['matchMedia', 'innerWidth', 'ResizeObserver', 'useMediaQuery']) {
      expect(drawerCode, `${forbidden} would be a second, JS-driven implementation`).not.toContain(forbidden);
    }
  });

  // --- M: Escape precedence.
  it('M: Escape closes the drawer, but stands down while the library modal is open', async () => {
    withPages();

    await mount({ documentOpenRequest: docRequest(1) });
    expect(drawerEl()).not.toBeNull();

    // The library modal is mounted above the drawer.
    const library = document.createElement('div');
    library.setAttribute('data-knowledge-documents', 'true');
    document.body.appendChild(library);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(drawerEl(), 'the library owns Escape while it is open').not.toBeNull();

    library.remove();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(drawerEl()).toBeNull();
  });

  // --- O: accessibility.
  it('O: a labelled, non-modal complementary region that moves and restores focus', async () => {
    withPages();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    await mount({ documentOpenRequest: docRequest(1) });

    const drawer = drawerEl()!;
    expect(drawer.getAttribute('role')).toBe('complementary');
    expect(drawer.getAttribute('aria-label')).toBe('Knowledge reader');
    // Non-modal: it never claims the page.
    expect(drawer.getAttribute('aria-modal')).toBeNull();
    expect(drawerCode).not.toContain('aria-modal');
    const close = drawer.querySelector('button[aria-label="Close Knowledge reader"]');
    expect(close).not.toBeNull();
    expect(document.activeElement).toBe(close);
    // Scroll isolation lives on the body that actually scrolls, not the shell.
    const scroller = drawer.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller).not.toBeNull();
    expect(scroller.className).toContain('overscroll-contain');

    await closeDrawer();
    expect(document.activeElement, 'focus returns to whatever opened the reader').toBe(opener);
    opener.remove();
  });

  // --- P: a vanished target stays fail-closed, with no authority of its own.
  it('P: the drawer resolves no target and reaches no data layer of its own', async () => {
    withPages();
    const onOpen = vi.fn();

    // A citation whose Note is not on the board: it paints, but opens nothing.
    await mount({ documentOpenRequest: docRequest(1), onOpenBacklinkTarget: onOpen }, [{
      ...(exactReference() as unknown as Record<string, unknown>),
      targetPadletId: 'padlet-missing',
    } as unknown as SourceReference]);

    const highlight = drawerEl()!.querySelector('[data-knowledge-source-highlight="true"]') as HTMLElement;
    expect(highlight).not.toBeNull();
    expect(highlight.getAttribute('role'), 'no board target, so no action').toBeNull();
    await act(async () => { highlight.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpen).not.toHaveBeenCalled();

    for (const forbidden of ['supabase', 'createClient', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
      'setSelectedPadletId', 'openPadletInTypeEditor', 'padlets.find']) {
      expect(drawerCode, `${forbidden} belongs to CanvasClient, not the reader`).not.toContain(forbidden);
    }
    // POST/PATCH/DELETE are not this surface's business: it reads pages only.
    expect(drawerCode).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
  });
});
