// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

const pages = [
  { pageNumber: 1, text: 'PDF safety PDF\nLiteral [brackets] and (parentheses).' },
  { pageNumber: 2, text: 'pdf appears on the second page.' },
];
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView;

function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeDocumentDetails
        originalFilename="EMG_checklist.pdf"
        pageCount={2}
        pages={pages}
        loading={false}
        error={false}
        onBack={vi.fn()}
      />,
    );
  });
  return host;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Mounts with explicit props so B2 can vary initialPageNumber/loading. */
function mountWith(props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <KnowledgeDocumentDetails
        originalFilename="EMG_checklist.pdf"
        pageCount={2}
        pages={pages}
        loading={false}
        error={false}
        onBack={vi.fn()}
        {...props}
      />,
    );
  });
  return host!;
}

/** The page section a scrollIntoView call was made on, if any. */
function scrolledPageNumbers(): string[] {
  const calls = (HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.instances ?? [];
  return (calls as HTMLElement[])
    .map((element) => element?.getAttribute?.('data-page-number'))
    .filter((value): value is string => typeof value === 'string');
}

function setSearch(container: HTMLElement, value: string) {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('KnowledgeDocumentDetails local text search', () => {
  it('searches case-insensitively across pages and highlights every literal match', async () => {
    const container = mount();
    setSearch(container, 'pdf');
    await settle();

    expect(container.textContent).toContain('3 matches');
    expect(container.querySelectorAll('mark')).toHaveLength(3);
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
    expect(container.textContent).toContain('Page 1');
    expect(container.textContent).toContain('Page 2');
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('treats regex characters literally and reports singular/no matches', async () => {
    const container = mount();
    expect(() => setSearch(container, '[')).not.toThrow();
    await settle();
    expect(container.textContent).toContain('1 match');
    expect(container.querySelectorAll('mark')).toHaveLength(1);

    setSearch(container, 'zzzz_nonexistent_search_12345');
    await settle();
    expect(container.textContent).toContain('No matches');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('moves, wraps, resets, clears, and scrolls the active match', async () => {
    const container = mount();
    setSearch(container, 'pdf');
    await settle();
    const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Next')!;
    const previous = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Previous')!;
    expect(container.querySelector('mark[data-active-match="true"]')?.textContent).toBe('PDF');

    act(() => next.click());
    expect(container.querySelectorAll('mark[data-active-match="true"]')[0]?.textContent).toBe('PDF');
    act(() => next.click());
    act(() => next.click());
    expect(container.querySelectorAll('mark[data-active-match="true"]')[0]?.textContent).toBe('PDF');
    act(() => previous.click());
    expect(container.querySelectorAll('mark[data-active-match="true"]')).toHaveLength(1);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    setSearch(container, 'second');
    await settle();
    expect(container.textContent).toContain('1 match');
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    setSearch(container, '');
    await settle();
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).not.toContain('Previous');
  });

  it('keeps plain text, whitespace, and Back to PDFs behavior intact', () => {
    const onBack = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<KnowledgeDocumentDetails originalFilename="x.pdf" pageCount={2} pages={pages} loading={false} error={false} onBack={onBack} />));
    expect(host.textContent).toContain('Literal [brackets] and (parentheses).');
    expect(host.querySelector('script')).toBeNull();
    expect(fs.readFileSync(path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8')).not.toContain('dangerouslySetInnerHTML');
    const back = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Back to PDFs'))!;
    act(() => back.click());
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// P6J-F6-B2 -- opening the reader on an exact page
// ============================================================================
describe('KnowledgeDocumentDetails source page targeting', () => {
  it('A: does not scroll anywhere when no page was requested', async () => {
    mountWith({});
    await settle();

    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('B: scrolls the requested page into view', async () => {
    const container = mountWith({ initialPageNumber: 2 });
    await settle();

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    // The page that scrolled is the one that was asked for, not merely "a page".
    expect(scrolledPageNumbers()).toContain('2');
    expect(scrolledPageNumbers()).not.toContain('1');
    expect(container.querySelector('[data-page-number="2"]')).not.toBeNull();
  });

  it('B2: targets page 1 as readily as any other', async () => {
    mountWith({ initialPageNumber: 1 });
    await settle();

    expect(scrolledPageNumbers()).toEqual(['1']);
  });

  it('C: an out-of-range page neither throws nor scrolls something unrelated', async () => {
    expect(() => mountWith({ initialPageNumber: 99 })).not.toThrow();
    await settle();

    // The reader still opened; it simply stayed where it was.
    expect(host!.textContent).toContain('Page 1');
    expect(scrolledPageNumbers()).toEqual([]);
  });

  it('C2: a page requested before the pages arrive is honoured once they do', async () => {
    mountWith({ initialPageNumber: 2, pages: [], loading: true });
    await settle();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      root!.render(
        <KnowledgeDocumentDetails
          originalFilename="EMG_checklist.pdf"
          pageCount={2}
          pages={pages}
          loading={false}
          error={false}
          onBack={vi.fn()}
          initialPageNumber={2}
        />,
      );
    });
    await settle();

    expect(scrolledPageNumbers()).toContain('2');
  });

  it('D: a multi-page reference targets its pageStart -- the caller passes only that', async () => {
    // pageStart 1, pageEnd 2: the reader is told 1 and never interprets a range.
    mountWith({ initialPageNumber: 1 });
    await settle();

    expect(scrolledPageNumbers()).toEqual(['1']);
  });

  it('E: an active search match stays authoritative over the source page', async () => {
    const container = mountWith({ initialPageNumber: 1 });
    await settle();
    (HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();

    setSearch(container, 'second');
    await settle();

    // Search scrolls its own <mark>, and the page-target effect stands down
    // rather than yanking the view back to page 1.
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(scrolledPageNumbers()).not.toContain('1');
  });

  it('E2: existing search navigation still works with no page requested', async () => {
    const container = mountWith({});
    setSearch(container, 'pdf');
    await settle();

    expect(container.textContent).toContain('3 matches');
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
  });

  it('F: the page target is navigation only -- no fetch, no highlight, no geometry', async () => {
    mountWith({ initialPageNumber: 2 });
    await settle();

    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    const source = fs.readFileSync(path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8');
    // B4-B2B added exact-span CAPTURE, so char offsets now legitimately appear
    // here. Highlight geometry and server-owned fields still must not.
    for (const forbidden of ['locator', 'bbox', 'quoteHash']) {
      expect(source).not.toContain(forbidden);
    }
  });
});

// ============================================================================
// P6J-F6-B4-B2B -- capturing an exact text selection inside one page
// ============================================================================

const EMOJI_PAGES = [{ pageNumber: 1, text: 'a😀b alpha\nbeta' }];

function pageRoot(container: HTMLElement, pageNumber: number): HTMLElement {
  return container.querySelector(`[data-knowledge-page-text-root="${pageNumber}"]`) as HTMLElement;
}

function createNoteButton(container: HTMLElement, pageNumber: number): HTMLButtonElement {
  const section = container.querySelector(`[data-page-number="${pageNumber}"]`)!;
  return Array.from(section.querySelectorAll('button'))
    .find((button) => button.textContent?.startsWith('Create Note')) as HTMLButtonElement;
}

/** Puts a real DOM Range on the document's real Selection. */
function selectRange(start: Node, startOffset: number, end: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The mouseup that ends a drag, dispatched where the pointer was released. */
function finishSelectionOn(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

function mountReader(props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {}) {
  const onCreateNoteFromPage = vi.fn();
  const container = mountWith({ documentId: 'doc-1', onCreateNoteFromPage, ...props });
  return { container, onCreateNoteFromPage };
}

function clickCreateNote(container: HTMLElement, pageNumber: number) {
  act(() => createNoteButton(container, pageNumber).click());
}

describe('KnowledgeDocumentDetails exact selection capture', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('A: with no selection the action stays page-only', () => {
    const { container, onCreateNoteFromPage } = mountReader();

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');

    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: null,
    });
  });

  it('B: a valid selection arms only the page it was made on', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);

    // 'safety' -- page-relative [4,10).
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from selection on page 1');
    // Page 2 is untouched by a selection that does not live there.
    expect(createNoteButton(container, 2).textContent).toBe('Create Note');
    expect(createNoteButton(container, 2).getAttribute('aria-label')).toBe('Create Note from page 2');
  });

  it('C: clicking the armed action emits the exact captured span', () => {
    const { container, onCreateNoteFromPage } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
    });
    expect(pages[0].text.slice(4, 10)).toBe('safety');
  });

  it('C: the other page still emits a page-only request while page 1 is armed', () => {
    const { container, onCreateNoteFromPage } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    clickCreateNote(container, 2);

    expect(onCreateNoteFromPage.mock.calls[0][0]).toMatchObject({ pageNumber: 2, selection: null });
  });

  it('C: a mouseup on the action button never consumes the selection', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    // mouseup fires BEFORE click, and the click's own mousedown has already
    // collapsed the browser selection by then.
    window.getSelection()!.removeAllRanges();
    finishSelectionOn(createNoteButton(container, 1));

    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
  });

  it('D: a selection crossing text -> <mark> -> text maps to page coordinates', async () => {
    const { container, onCreateNoteFromPage } = mountReader();
    // Real search output, not hand-built DOM: this is the production shape.
    setSearch(container, 'pdf');
    await settle();
    const root = pageRoot(container, 1);
    expect(root.querySelectorAll('mark')).toHaveLength(2);
    // [<mark>PDF</mark>, ' safety ', <mark>PDF</mark>, '\nLiteral...']
    expect(root.childNodes).toHaveLength(4);

    // Start one unit into the FIRST mark, end seven units into the trailing
    // plain text node -- three node boundaries apart.
    selectRange(root.childNodes[0].firstChild!, 1, root.childNodes[3], 7);
    finishSelectionOn(root);

    clickCreateNote(container, 1);

    const { selection } = onCreateNoteFromPage.mock.calls[0][0];
    expect(selection).toEqual({ charStart: 1, charEnd: 21, selectedText: 'DF safety PDF\nLitera' });
    // Node-local offsets were 1 and 7; the page-relative ones are 1 and 21.
    expect(pages[0].text.slice(selection.charStart, selection.charEnd)).toBe(selection.selectedText);
  });

  it('E: a selection wholly inside a <mark> maps correctly', async () => {
    const { container, onCreateNoteFromPage } = mountReader();
    setSearch(container, 'pdf');
    await settle();
    const root = pageRoot(container, 1);

    // The SECOND mark, at page [11,14): take its first two units.
    selectRange(root.childNodes[2].firstChild!, 0, root.childNodes[2].firstChild!, 2);
    finishSelectionOn(root);

    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage.mock.calls[0][0].selection).toEqual({
      charStart: 11, charEnd: 13, selectedText: 'PD',
    });
  });

  it('F: offsets are UTF-16 code units, so a non-BMP character counts as two', () => {
    const { container, onCreateNoteFromPage } = mountReader({ pages: EMOJI_PAGES, pageCount: 1 });
    const root = pageRoot(container, 1);

    // 'a😀' -- the emoji is a surrogate pair, so this ends at 3, not 2.
    selectRange(root.firstChild!, 0, root.firstChild!, 3);
    finishSelectionOn(root);
    clickCreateNote(container, 1);

    const { selection } = onCreateNoteFromPage.mock.calls[0][0];
    expect(selection).toEqual({ charStart: 0, charEnd: 3, selectedText: 'a😀' });
    // Exactly JavaScript String.slice coordinates.
    expect(EMOJI_PAGES[0].text.slice(0, 3)).toBe('a😀');
    expect(selection.selectedText.length).toBe(3);
    expect(Array.from(selection.selectedText)).toHaveLength(2);
  });

  it('G: whitespace and newlines are captured exactly, with no trimming', () => {
    const { container, onCreateNoteFromPage } = mountReader({ pages: EMOJI_PAGES, pageCount: 1 });
    const root = pageRoot(container, 1);

    // ' alpha\nbeta' -- leading space and an embedded newline.
    const start = EMOJI_PAGES[0].text.indexOf(' alpha');
    selectRange(root.firstChild!, start, root.firstChild!, EMOJI_PAGES[0].text.length);
    finishSelectionOn(root);
    clickCreateNote(container, 1);

    const { selection } = onCreateNoteFromPage.mock.calls[0][0];
    expect(selection.selectedText).toBe(' alpha\nbeta');
    expect(selection.selectedText).not.toBe(selection.selectedText.trim());
    expect(EMOJI_PAGES[0].text.slice(selection.charStart, selection.charEnd)).toBe(selection.selectedText);
  });

  it('H: a selection spanning two pages captures nothing', () => {
    const { container, onCreateNoteFromPage } = mountReader();

    selectRange(pageRoot(container, 1).firstChild!, 4, pageRoot(container, 2).firstChild!, 3);
    finishSelectionOn(pageRoot(container, 2));

    // Neither page is armed, and neither invented a one-page span.
    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
    expect(createNoteButton(container, 2).textContent).toBe('Create Note');
    clickCreateNote(container, 1);
    expect(onCreateNoteFromPage.mock.calls[0][0].selection).toBeNull();
  });

  it('I: a selection reaching outside the page paragraph captures nothing', () => {
    const { container } = mountReader();
    const heading = container.querySelector('[data-page-number="1"] h3')!;

    // Starts in the "Page 1" heading and ends in the canonical text.
    selectRange(heading.firstChild!, 0, pageRoot(container, 1).firstChild!, 6);
    finishSelectionOn(container.querySelector('[data-page-number="1"]')!);

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('J: a collapsed selection captures nothing and clears a prior capture', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);
    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');

    selectRange(root.firstChild!, 4, root.firstChild!, 4);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('K: replacing the document or its page text drops the stale capture', () => {
    const { container } = mountReader();
    const textRoot = pageRoot(container, 1);
    selectRange(textRoot.firstChild!, 4, textRoot.firstChild!, 10);
    finishSelectionOn(textRoot);
    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');

    // Same coordinates, different text underneath them.
    act(() => {
      root!.render(
        <KnowledgeDocumentDetails
          documentId="doc-1"
          originalFilename="EMG_checklist.pdf"
          pageCount={2}
          pages={[{ pageNumber: 1, text: 'completely different text here' }, pages[1]]}
          loading={false}
          error={false}
          onBack={vi.fn()}
          onCreateNoteFromPage={vi.fn()}
        />,
      );
    });

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('K: a different document id clears the capture even at identical coordinates', () => {
    const { container } = mountReader();
    const textRoot = pageRoot(container, 1);
    selectRange(textRoot.firstChild!, 4, textRoot.firstChild!, 10);
    finishSelectionOn(textRoot);
    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');

    act(() => {
      root!.render(
        <KnowledgeDocumentDetails
          documentId="doc-2"
          originalFilename="other.pdf"
          pageCount={2}
          pages={pages}
          loading={false}
          error={false}
          onBack={vi.fn()}
          onCreateNoteFromPage={vi.fn()}
        />,
      );
    });

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('L: text injected into the paragraph fails the capture closed', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    // A later UI change that adds visible text would invalidate every offset.
    act(() => { root.appendChild(document.createTextNode(' INJECTED')); });
    expect(root.textContent).not.toBe(pages[0].text);

    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('M: selecting text makes no network request at all', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);

    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('N: local search still works normally alongside a live capture', async () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    setSearch(container, 'pdf');
    await settle();

    expect(container.textContent).toContain('3 matches');
    expect(container.querySelectorAll('mark')).toHaveLength(3);
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
    // Re-rendering with <mark> nodes does not corrupt the stored capture: it is
    // re-proved against the page text, which did not change.
    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
  });
});

// ============================================================================
// P6J-F6-B4-B3 -- rendering persisted exact source spans
// ============================================================================

const DOC_ID = 'doc-1';
const PAGE_ONE = pages[0].text;
let referenceSequence = 0;

/** A stored citation of this document. Defaults to a pre-B4 page-only row. */
function sourceRef(overrides: Partial<SourceReference> = {}): SourceReference {
  referenceSequence += 1;
  return {
    id: `ref-${referenceSequence}`,
    targetPadletId: `padlet-${referenceSequence}`,
    sourceDocumentId: DOC_ID,
    pageStart: 1,
    pageEnd: 1,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  } as unknown as SourceReference;
}

/** An exact span on page 1 whose quote genuinely matches its offsets. */
const exactRef = (start: number, end: number, overrides: Partial<SourceReference> = {}) =>
  sourceRef({ charStart: start, charEnd: end, quoteText: PAGE_ONE.slice(start, end), ...overrides });

function mountWithReferences(
  references: readonly SourceReference[],
  props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {},
) {
  const onCreateNoteFromPage = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      // The REAL provider and the REAL index CanvasClient builds -- nothing
      // between the stored rows and the DOM is stubbed.
      <KnowledgeSourceReferenceProvider index={buildKnowledgeSourceReferenceIndex(references)}>
        <KnowledgeDocumentDetails
          documentId={DOC_ID}
          originalFilename="EMG_checklist.pdf"
          pageCount={2}
          pages={pages}
          loading={false}
          error={false}
          onBack={vi.fn()}
          onCreateNoteFromPage={onCreateNoteFromPage}
          {...props}
        />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return { container: host!, onCreateNoteFromPage };
}

const highlightsIn = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll('[data-knowledge-source-highlight="true"]'));

const highlightTexts = (container: HTMLElement) => highlightsIn(container).map((node) => node.textContent);

function remount() {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
}

describe('KnowledgeDocumentDetails persisted source highlights', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('T: with no references the reader renders exactly as before', () => {
    const { container } = mountWithReferences([]);

    expect(highlightsIn(container)).toHaveLength(0);
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('U: a valid persisted exact reference marks exactly its text', () => {
    const { container } = mountWithReferences([exactRef(4, 10)]);

    expect(highlightTexts(container)).toEqual(['safety']);
    expect(PAGE_ONE.slice(4, 10)).toBe('safety');
    expect(highlightsIn(container)[0].getAttribute('data-knowledge-source-highlight-count')).toBe('1');
    // Only the citing page is affected.
    expect(pageRoot(container, 2).querySelectorAll('[data-knowledge-source-highlight]')).toHaveLength(0);
  });

  it('V: a legacy page-only reference whose quote is the page marks nothing', () => {
    const { container } = mountWithReferences([sourceRef({ quoteText: PAGE_ONE })]);

    // The invariant B4 exists to protect: no retroactive whole-page highlight.
    expect(highlightsIn(container)).toHaveLength(0);
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
  });

  it('V: a legitimate full-page exact span DOES mark the whole page', () => {
    const { container } = mountWithReferences([exactRef(0, PAGE_ONE.length)]);

    expect(highlightTexts(container)).toEqual([PAGE_ONE]);
  });

  it('W: a drifted reference is recovered at its unique quote', () => {
    // Offsets say [0,6); the quote says 'Literal', which occurs exactly once.
    const drifted = sourceRef({ charStart: 0, charEnd: 6, quoteText: 'Literal' });

    const { container } = mountWithReferences([drifted]);

    expect(highlightTexts(container)).toEqual(['Literal']);
    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('X: ambiguous or missing quotes mark nothing', () => {
    for (const quoteText of ['PDF', 'not-on-this-page']) {
      const { container } = mountWithReferences([sourceRef({ charStart: 0, charEnd: 6, quoteText })]);
      expect(highlightsIn(container), quoteText).toHaveLength(0);
      remount();
    }
  });

  it('Y: two overlapping references report a count of two on the overlap only', () => {
    const { container } = mountWithReferences([exactRef(4, 10), exactRef(7, 14)]);

    const marked = highlightsIn(container);
    expect(marked.map((node) => [node.textContent, node.getAttribute('data-knowledge-source-highlight-count')]))
      .toEqual([['saf', '1'], ['ety', '2'], [' PDF', '1']]);
    // The decisive invariant: overlapping text is rendered ONCE.
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
  });

  it('Z: identical spans from two references render one run with a count of two', () => {
    const { container } = mountWithReferences([exactRef(4, 10), exactRef(4, 10)]);

    expect(highlightTexts(container)).toEqual(['safety']);
    expect(highlightsIn(container)[0].getAttribute('data-knowledge-source-highlight-count')).toBe('2');
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
  });

  it('AA: a search match overlapping a source span keeps the search count', async () => {
    // [0,6) covers the first 'PDF' match at [0,3).
    const { container } = mountWithReferences([exactRef(0, 6)]);

    setSearch(container, 'pdf');
    await settle();

    expect(container.textContent).toContain('3 matches');
    expect(container.querySelectorAll('mark')).toHaveLength(3);
    // The overlapping match stays ONE <mark>, carrying the source marker too.
    const first = container.querySelectorAll('mark')[0];
    expect(first.textContent).toBe('PDF');
    expect(first.getAttribute('data-knowledge-source-highlight')).toBe('true');
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
  });

  it('AB: active-search behaviour is unchanged alongside source highlights', async () => {
    const { container } = mountWithReferences([exactRef(0, 6)]);
    setSearch(container, 'pdf');
    await settle();

    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
    expect(container.querySelector('mark[data-active-match="true"]')?.textContent).toBe('PDF');
    const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Next')!;
    act(() => next.click());
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
  });

  it('AC: clearing the search leaves the persisted highlight in place', async () => {
    const { container } = mountWithReferences([exactRef(4, 10)]);

    setSearch(container, 'pdf');
    await settle();
    expect(highlightsIn(container).length).toBeGreaterThan(0);

    setSearch(container, '');
    await settle();

    expect(highlightTexts(container)).toEqual(['safety']);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('AD: highlights are never nested inside one another', async () => {
    const { container } = mountWithReferences([exactRef(0, 6), exactRef(4, 12)]);
    setSearch(container, 'pdf');
    await settle();

    expect(container.querySelector('mark mark')).toBeNull();
    expect(container.querySelector('[data-knowledge-source-highlight] [data-knowledge-source-highlight]')).toBeNull();
    expect(container.querySelector('mark [data-knowledge-source-highlight]')).toBeNull();
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
  });

  it('AE: a persisted highlight alone never arms the selection action', () => {
    const { container } = mountWithReferences([exactRef(4, 10)]);

    // Persisted provenance and a live browser selection are different things.
    expect(highlightsIn(container)).toHaveLength(1);
    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('AF: a B2B selection crossing a highlight boundary still maps exactly', () => {
    const { container, onCreateNoteFromPage } = mountWithReferences([exactRef(4, 10)]);
    const textRoot = pageRoot(container, 1);
    // ['PDF ', <span>safety</span>, rest] -- three node boundaries.
    expect(textRoot.childNodes).toHaveLength(3);

    // Page [2,12): starts in plain text, crosses the highlight, ends after it.
    selectRange(textRoot.childNodes[0], 2, textRoot.childNodes[2], 2);
    finishSelectionOn(textRoot);
    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage.mock.calls[0][0].selection).toEqual({
      charStart: 2, charEnd: 12, selectedText: PAGE_ONE.slice(2, 12),
    });
    expect(PAGE_ONE.slice(2, 12)).toBe('F safety P');
  });

  it('AG: a B2B selection entirely inside a highlight still maps exactly', () => {
    const { container, onCreateNoteFromPage } = mountWithReferences([exactRef(4, 10)]);
    const textRoot = pageRoot(container, 1);

    selectRange(textRoot.childNodes[1].firstChild!, 1, textRoot.childNodes[1].firstChild!, 5);
    finishSelectionOn(textRoot);
    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage.mock.calls[0][0].selection).toEqual({
      charStart: 5, charEnd: 9, selectedText: 'afet',
    });
  });

  it('AH: the canonical page root text survives every rendering combination', async () => {
    const combinations: Array<readonly SourceReference[]> = [
      [],
      [exactRef(4, 10)],
      [exactRef(0, 6)],
      [exactRef(4, 10), exactRef(7, 14)],
      [sourceRef({ quoteText: PAGE_ONE })],
      [sourceRef({ charStart: 0, charEnd: 6, quoteText: 'Literal' })],
    ];
    for (const references of combinations) {
      const { container } = mountWithReferences(references);
      expect(pageRoot(container, 1).textContent, `plain ${references.length}`).toBe(PAGE_ONE);
      setSearch(container, 'pdf');
      await settle();
      // Search and source together, still exactly the canonical string.
      expect(pageRoot(container, 1).textContent, `searched ${references.length}`).toBe(PAGE_ONE);
      expect(pageRoot(container, 2).textContent).toBe(pages[1].text);
      remount();
    }
  });

  it('AI: rendering persisted highlights makes no network request', () => {
    mountWithReferences([exactRef(4, 10), exactRef(7, 14), sourceRef({ quoteText: PAGE_ONE })]);

    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('AJ: without a document id nothing resolves and no action is offered', () => {
    const { container } = mountWithReferences([exactRef(4, 10)], { documentId: undefined });

    expect(highlightsIn(container)).toHaveLength(0);
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
    expect(createNoteButton(container, 1)).toBeUndefined();
  });

  it('AJ: references for a different document never leak into this reader', () => {
    const other = exactRef(4, 10, {
      sourceDocumentId: 'some-other-document' as SourceReference['sourceDocumentId'],
    });

    const { container } = mountWithReferences([other]);

    expect(highlightsIn(container)).toHaveLength(0);
  });
});
