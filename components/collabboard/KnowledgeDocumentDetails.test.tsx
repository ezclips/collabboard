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
import { buildKnowledgeSourceBacklinkIndex } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
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

// ============================================================================
// P6J-F6-B4-B4 -- bidirectional exact source interactions
// ============================================================================

/** Every element a scrollIntoView call was made on, in order. */
function scrolledElements(): HTMLElement[] {
  return ((HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.instances ?? []) as HTMLElement[];
}

const arrivals = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll('[data-knowledge-source-navigation-target="true"]'));

const chooserOptions = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll('[data-knowledge-source-choice-target]'));

/** A Note post so the reference has a backlink row, which is what makes it a target. */
const notePost = (id: string, title: string) => ({ id, type: 'text', title, content: '' });

/** Branded row/post ids, so each fixture reads as plain strings at its call site. */
const ids = (id: string, targetPadletId: string) =>
  ({ id, targetPadletId } as unknown as Pick<SourceReference, 'id' | 'targetPadletId'>);

/**
 * The reader as it exists on a canvas: forward references AND the backlink
 * index, both built by the real domain builders from the same rows.
 */
function mountInteractive(
  references: readonly SourceReference[],
  posts: readonly { id: string; type: string; title: string; content: string }[],
  props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {},
) {
  const onOpenBacklinkTarget = vi.fn();
  const onCreateNoteFromPage = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const render = (extra: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {}) => {
    act(() => {
      root!.render(
        <KnowledgeSourceReferenceProvider
          index={buildKnowledgeSourceReferenceIndex(references)}
          backlinks={buildKnowledgeSourceBacklinkIndex(references, posts)}
        >
          <KnowledgeDocumentDetails
            documentId={DOC_ID}
            originalFilename="EMG_checklist.pdf"
            pageCount={2}
            pages={pages}
            loading={false}
            error={false}
            onBack={vi.fn()}
            onCreateNoteFromPage={onCreateNoteFromPage}
            onOpenBacklinkTarget={onOpenBacklinkTarget}
            {...props}
            {...extra}
          />
        </KnowledgeSourceReferenceProvider>,
      );
    });
  };
  render();
  return { container: host!, onOpenBacklinkTarget, onCreateNoteFromPage, render };
}

const clickOn = (element: Element) => act(() => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const pressOn = (element: Element, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { element.dispatchEvent(event); });
  return event;
};

describe('P6J-F6-B4-B4 Note -> exact source span', () => {
  it('L/M: the requested citation is marked and scrolled to at its resolved span', () => {
    const { container } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
      { initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1 },
    );

    const marked = arrivals(container);
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe('safety');
    // The exact piece, not merely the page section, is what was scrolled to.
    expect(scrolledElements()).toContain(marked[0]);
    expect(marked[0].className).toContain('bg-sky-200');
  });

  it('N: a drifted citation lands on the passage its quote recovered', () => {
    // Offsets no longer address the quote; the quote still says one thing.
    const drifted = exactRef(4, 10, { ...ids('ref-a', 'note-a'), charStart: 20, charEnd: 26 });

    const { container } = mountInteractive([drifted], [notePost('note-a', 'Citing Note')], {
      initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1,
    });

    const marked = arrivals(container);
    expect(marked).toHaveLength(1);
    // Recovered, never repaired: the stale offsets are not what was used.
    expect(marked[0].textContent).toBe('safety');
    expect(scrolledElements()).toContain(marked[0]);
  });

  it('O: a legacy page-only citation keeps the B2 page arrival and gains no exact target', () => {
    const { container } = mountInteractive(
      [sourceRef({ ...ids('ref-a', 'note-a'), pageStart: 1, pageEnd: 1 })],
      [notePost('note-a', 'Citing Note')],
      { initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1 },
    );

    expect(arrivals(container)).toHaveLength(0);
    expect(highlightsIn(container)).toHaveLength(0);
    expect(scrolledPageNumbers()).toContain('1');
  });

  it('P/Q/R: ambiguous, missing and unknown citations all fall back to the page', () => {
    const cases: [string, SourceReference[], string][] = [
      // 'PDF' occurs twice: the quote cannot say which passage was meant.
      ['ambiguous', [exactRef(4, 10, { ...ids('ref-a', 'note-a'), charStart: 20, charEnd: 23, quoteText: 'PDF' })], 'ref-a'],
      ['missing', [exactRef(4, 10, { ...ids('ref-a', 'note-a'), charStart: 0, charEnd: 3, quoteText: 'nowhere at all' })], 'ref-a'],
      ['unknown id', [exactRef(4, 10, ids('ref-a', 'note-a'))], 'ref-does-not-exist'],
    ];

    for (const [label, references, requested] of cases) {
      const { container } = mountInteractive(references, [notePost('note-a', 'Citing Note')], {
        initialPageNumber: 1, initialSourceReferenceId: requested, initialSourceRequestId: 1,
      });

      expect(arrivals(container), label).toHaveLength(0);
      expect(scrolledPageNumbers(), label).toContain('1');
      remount();
    }
  });

  it('S/T: a repeat request scrolls again; a rerender of one request does not', () => {
    const reference = exactRef(4, 10, ids('ref-a', 'note-a'));
    const posts = [notePost('note-a', 'Citing Note')];
    const { container, render } = mountInteractive(reference ? [reference] : [], posts, {
      initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1,
    });
    const marked = arrivals(container)[0];
    const scrollsFor = () => scrolledElements().filter((element) => element === marked).length;
    expect(scrollsFor()).toBe(1);

    // Same request id, rendered again: the intent has already been served.
    render({ initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1 });
    expect(scrollsFor()).toBe(1);

    // A genuinely new click on the same source.
    render({ initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 2 });
    expect(scrollsFor()).toBe(2);
  });

  it('U: a citation of another document can never become the exact target', () => {
    const foreign = exactRef(4, 10, {
      ...ids('ref-a', 'note-a'),
      sourceDocumentId: 'some-other-document' as SourceReference['sourceDocumentId'],
    });

    const { container } = mountInteractive([foreign], [notePost('note-a', 'Citing Note')], {
      initialPageNumber: 1, initialSourceReferenceId: 'ref-a', initialSourceRequestId: 1,
    });

    expect(arrivals(container)).toHaveLength(0);
    expect(highlightsIn(container)).toHaveLength(0);
  });
});

describe('P6J-F6-B4-B4 exact source -> Note', () => {
  it('V: one citing Note opens directly, once', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );

    clickOn(highlightsIn(container)[0]);

    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(1);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-a');
    expect(container.querySelector('[data-knowledge-source-choice="true"]')).toBeNull();
  });

  it('W: two citations pointing at ONE Note are one destination', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [
        exactRef(0, 10, ids('ref-a', 'note-a')),
        exactRef(4, 14, ids('ref-b', 'note-a')),
      ],
      [notePost('note-a', 'Citing Note')],
    );

    // The overlap run carries both citations...
    const overlap = highlightsIn(container).find((node) => node.textContent === 'safety')!;
    expect(overlap.getAttribute('data-knowledge-source-highlight-count')).toBe('2');
    clickOn(overlap);

    // ...but only one Note, so no chooser and exactly one call.
    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(1);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-a');
    expect(container.querySelector('[data-knowledge-source-choice="true"]')).toBeNull();
  });

  it('X/Y/Z: an overlap of two Notes asks, and routes by id even when labels match', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [
        exactRef(0, 10, ids('ref-a', 'note-a')),
        exactRef(4, 14, ids('ref-b', 'note-b')),
      ],
      // Deliberately identical titles: a source-created Note inherits the PDF's
      // filename, so two citing Notes legitimately read the same.
      [notePost('note-a', 'EMG_checklist.pdf'), notePost('note-b', 'EMG_checklist.pdf')],
    );

    clickOn(highlightsIn(container).find((node) => node.textContent === 'safety')!);

    // Nothing was chosen for the user.
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
    const options = chooserOptions(container);
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.getAttribute('data-knowledge-source-choice-target')))
      .toEqual(['note-a', 'note-b']);

    clickOn(options[1]);

    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(1);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-b');
    expect(container.querySelector('[data-knowledge-source-choice="true"]')).toBeNull();
  });

  it('AA/AB: a span with no listed Note, or no callback, stays visible but inert', () => {
    // The citation resolves and paints, but its target is not a Note the board
    // currently lists as citing this document.
    const orphan = mountInteractive([exactRef(4, 10, ids('ref-a', 'note-gone'))], []);
    const orphanSpan = highlightsIn(orphan.container)[0];
    expect(orphanSpan.textContent).toBe('safety');
    expect(orphanSpan.getAttribute('role')).toBeNull();
    expect(orphanSpan.getAttribute('tabindex')).toBeNull();
    clickOn(orphanSpan);
    expect(orphan.onOpenBacklinkTarget).not.toHaveBeenCalled();
    remount();

    // Outside a canvas there is nothing to navigate to at all.
    const { container } = mountWithReferences([exactRef(4, 10, ids('ref-a', 'note-a'))]);
    const span = highlightsIn(container)[0];
    expect(span.getAttribute('role')).toBeNull();
    expect(span.getAttribute('tabindex')).toBeNull();
  });

  it('AG/AH/AI: Enter and Space activate, and Space does not scroll the page', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );
    const span = highlightsIn(container)[0];
    expect(span.getAttribute('role')).toBe('button');
    expect(span.getAttribute('tabindex')).toBe('0');

    expect(pressOn(span, 'Enter').defaultPrevented).toBe(true);
    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(1);

    const space = pressOn(span, ' ');
    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(2);
    // Space would otherwise scroll the reader out from under the reader.
    expect(space.defaultPrevented).toBe(true);

    // An unrelated key does nothing at all.
    expect(pressOn(span, 'a').defaultPrevented).toBe(false);
    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(2);
  });
});

describe('P6J-F6-B4-B4 selection still wins over navigation', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('AC/AE: a drag inside an interactive highlight arms Create Note and suppresses navigation', () => {
    const { container, onOpenBacklinkTarget, onCreateNoteFromPage } = mountInteractive(
      [exactRef(0, 14, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );
    const span = highlightsIn(container)[0];
    const text = span.firstChild!;

    // 'safety' lies inside the highlighted run: offsets 4-10 of the page.
    selectRange(text, 4, text, 10);
    finishSelectionOn(span);
    clickOn(span);

    // The click that ended the drag is not a navigation request.
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
    expect(container.querySelector('[data-knowledge-source-choice="true"]')).toBeNull();
    // And B4-B2B still holds the exact span.
    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
    clickCreateNote(container, 1);
    expect(onCreateNoteFromPage.mock.calls[0][0].selection)
      .toEqual({ charStart: 4, charEnd: 10, selectedText: 'safety' });
  });

  it('AD: a drag crossing plain -> highlight -> plain still maps to page offsets', () => {
    const { container, onCreateNoteFromPage } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );
    const root = pageRoot(container, 1);
    // The renderer split page 1 into: 'PDF ' | 'safety' | ' PDF\nLiteralâ€¦'.
    const [before, , after] = Array.from(root.childNodes);

    selectRange(before.firstChild ?? before, 0, after.firstChild ?? after, 4);
    finishSelectionOn(root);

    clickCreateNote(container, 1);
    expect(onCreateNoteFromPage.mock.calls[0][0].selection)
      .toEqual({ charStart: 0, charEnd: 14, selectedText: 'PDF safety PDF' });
  });

  it('AF: an ordinary collapsed click still navigates', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );

    // Nothing selected -- the browser's selection is collapsed.
    clickOn(highlightsIn(container)[0]);

    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-a');
  });
});

describe('P6J-F6-B4-B4 search keeps its match, and the canonical root is untouched', () => {
  const withOverlap = () => mountInteractive(
    [
      exactRef(0, 10, ids('ref-a', 'note-a')),
      exactRef(4, 14, ids('ref-b', 'note-b')),
    ],
    [notePost('note-a', 'First Note'), notePost('note-b', 'Second Note')],
  );

  it('AK/AL/AM/AN/AO: a source-overlapping match stays one inert <mark>', () => {
    const { container, onOpenBacklinkTarget } = withOverlap();
    setSearch(container, 'safety');

    const marks = Array.from(container.querySelectorAll('mark'));
    expect(marks).toHaveLength(1);
    expect(container.textContent).toContain('1 match');
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);
    // It still REPORTS the citations it overlaps -- display metadata only.
    expect(marks[0].getAttribute('data-knowledge-source-highlight')).toBe('true');
    expect(marks[0].getAttribute('data-knowledge-source-highlight-count')).toBe('2');
    // But the match is search's: clicking it routes nowhere, because that count
    // is an aggregate and cannot say which characters belong to which citation.
    expect(marks[0].getAttribute('role')).toBeNull();
    expect(marks[0].getAttribute('tabindex')).toBeNull();
    clickOn(marks[0]);
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
  });

  it('AP: clearing the search hands the run back to the source pieces', () => {
    const { container, onOpenBacklinkTarget } = withOverlap();
    setSearch(container, 'safety');
    expect(container.querySelectorAll('mark')).toHaveLength(1);

    setSearch(container, '');

    const overlap = highlightsIn(container).find((node) => node.textContent === 'safety')!;
    expect(overlap.getAttribute('role')).toBe('button');
    clickOn(overlap);
    expect(chooserOptions(container)).toHaveLength(2);
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
  });

  it('AR/AS/AT/AU/AV: the page text reconstructs exactly, chooser open or closed', () => {
    const { container } = withOverlap();
    const root = pageRoot(container, 1);
    expect(root.textContent).toBe(PAGE_ONE);

    clickOn(highlightsIn(container).find((node) => node.textContent === 'safety')!);

    const chooser = container.querySelector('[data-knowledge-source-choice="true"]')!;
    expect(chooser).not.toBeNull();
    // Outside every page text root -- otherwise its labels would land in the
    // coordinate space B4-B2B measures against.
    expect(root.contains(chooser)).toBe(false);
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);

    // Dismissing restores nothing, because nothing in the root ever changed.
    clickOn(Array.from(container.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === 'Dismiss citing Notes')!);
    expect(container.querySelector('[data-knowledge-source-choice="true"]')).toBeNull();
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);
    // Each substring is emitted once: the overlap is not painted per citation.
    expect((root.textContent!.match(/safety/g) ?? []).length).toBe(1);
  });

  it('AW/AX/AY/AZ/BA: the surrounding B2/B3N behaviour is unchanged', () => {
    const { container, onOpenBacklinkTarget, onCreateNoteFromPage } = withOverlap();

    // AW: a backlink row still navigates by id.
    const row = container.querySelector('[data-knowledge-backlink-target="note-b"] button') as HTMLButtonElement;
    clickOn(row);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-b');

    // AX: page-level Create Note is untouched by any of this.
    clickCreateNote(container, 2);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toMatchObject({ pageNumber: 2, selection: null });

    // AZ: search navigation still moves the active match.
    setSearch(container, 'pdf');
    expect(container.textContent).toContain('3 matches');
    const next = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Next')!;
    clickOn(next);
    expect(container.querySelectorAll('[data-active-match="true"]')).toHaveLength(1);

    // BA: and the persistent highlights survive the round trip.
    setSearch(container, '');
    expect(highlightTexts(container)).toEqual(['PDF ', 'safety', ' PDF']);
  });
});

// ============================================================================
// P6J-F8-B1 -- the draggable text source clip
// ============================================================================
// The chip is an ADDED affordance, not a replacement: it must reach the same
// callback the existing button reaches, and it must not put a single character
// inside the paragraph B4-B2B measures its coordinates against.

const CLIP_MIME = 'application/collabboard-knowledge-clip';

function clipChip(container: HTMLElement, pageNumber: number): HTMLButtonElement | null {
  const section = container.querySelector(`[data-page-number="${pageNumber}"]`)!;
  return section.querySelector('[data-knowledge-clip-chip="true"]') as HTMLButtonElement | null;
}

/** A DataTransfer stand-in: jsdom does not construct one for synthetic drags. */
function fakeDataTransfer() {
  const store = new Map<string, string>();
  return {
    store,
    setData: (type: string, value: string) => { store.set(type, value); },
    getData: (type: string) => store.get(type) ?? '',
    effectAllowed: 'none',
  };
}

/** Starts a React drag on `element` and returns what it put on the transfer. */
function dragFrom(element: Element) {
  const transfer = fakeDataTransfer();
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  act(() => { element.dispatchEvent(event); });
  return { transfer, defaultPrevented: event.defaultPrevented };
}

describe('P6J-F8-B1 source clip chip', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  /** Selects 'safety' on page 1 -- page-relative [4,10). */
  function armPageOne() {
    const mounted = mountReader();
    const pageOne = pageRoot(mounted.container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);
    finishSelectionOn(pageOne);
    return mounted;
  }

  it('A: a valid selection produces exactly one chip, on its own page', () => {
    const { container } = armPageOne();

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(1);
    expect(clipChip(container, 1)).not.toBeNull();
    // A selection on page 1 arms page 1 and nothing else.
    expect(clipChip(container, 2)).toBeNull();
  });

  it('B: with no selection there is no chip at all', () => {
    const { container } = mountReader();

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
    // The page-level fallback is still offered.
    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('C: the chip lives OUTSIDE the canonical text root, which stays exact', () => {
    const { container } = armPageOne();
    const chip = clipChip(container, 1)!;
    const pageOne = pageRoot(container, 1);

    // The decisive check: not a descendant, at any depth.
    expect(pageOne.contains(chip)).toBe(false);
    expect(chip.closest('[data-knowledge-page-text-root]')).toBeNull();
    // And the coordinate space is byte-for-byte the page text.
    expect(pageOne.textContent).toBe(pages[0].text);
    expect(pageOne.querySelector('[data-knowledge-clip-chip]')).toBeNull();
    expect(pageOne.querySelector('[draggable]')).toBeNull();
    expect(pageOne.querySelector('button')).toBeNull();
  });

  it('D: the chip is draggable, focusable and labelled', () => {
    const { container } = armPageOne();
    const chip = clipChip(container, 1)!;

    expect(chip.getAttribute('draggable')).toBe('true');
    // A real button element: focusable, and Enter/Space activated by the platform.
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('type')).toBe('button');
    expect(chip.getAttribute('aria-label')).toContain('page 1');
    expect(chip.getAttribute('aria-label')).toContain('canvas');
  });

  it('E: dragging the chip emits the exact captured span on the dedicated type', () => {
    const { container } = armPageOne();
    const { transfer } = dragFrom(clipChip(container, 1)!);

    expect(JSON.parse(transfer.getData(CLIP_MIME))).toEqual({
      kind: 'text',
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      charStart: 4,
      charEnd: 10,
      selectedText: 'safety',
    });
    // The offsets address exactly what the user selected.
    expect(pages[0].text.slice(4, 10)).toBe('safety');
    // Nothing is published on text/plain: that type is forgeable by any drag.
    expect(transfer.getData('text/plain')).toBe('');
    expect([...transfer.store.keys()]).toEqual([CLIP_MIME]);
  });

  it('F: the captured selection survives the browser range collapsing first', () => {
    const { container } = armPageOne();
    // Pressing the chip collapses the live selection, exactly as a real click
    // does. The payload must come from captured state, not from the browser.
    window.getSelection()!.removeAllRanges();

    const { transfer } = dragFrom(clipChip(container, 1)!);

    expect(JSON.parse(transfer.getData(CLIP_MIME))).toMatchObject({
      charStart: 4, charEnd: 10, selectedText: 'safety',
    });
  });

  it('G: clicking the chip invokes the EXISTING selection callback', () => {
    const { container, onCreateNoteFromPage } = armPageOne();

    act(() => clipChip(container, 1)!.click());

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
    });
  });

  it('H: the existing Create Note from selection fallback still works', () => {
    const { container, onCreateNoteFromPage } = armPageOne();

    expect(createNoteButton(container, 1).textContent).toBe('Create Note from selection');
    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toMatchObject({
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
    });
  });

  it('I: native dragging of the page text itself is suppressed', () => {
    const { container } = armPageOne();

    const fromText = dragFrom(pageRoot(container, 1));

    // Cancelled, so the browser starts no native text drag at all.
    expect(fromText.defaultPrevented).toBe(true);
    expect(fromText.transfer.store.size).toBe(0);
    // The chip drag rides the same container handler and is NOT cancelled.
    const fromChip = dragFrom(clipChip(container, 1)!);
    expect(fromChip.defaultPrevented).toBe(false);
    expect(fromChip.transfer.getData(CLIP_MIME)).not.toBe('');
  });

  it('J: a cross-page selection produces no chip on either page', () => {
    const { container } = mountReader();
    selectRange(pageRoot(container, 1).firstChild!, 4, pageRoot(container, 2).firstChild!, 3);
    finishSelectionOn(pageRoot(container, 2));

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
  });

  it('K: a selection reaching outside any page root produces no chip', () => {
    const { container } = mountReader();
    const heading = container.querySelector('h3')!;
    selectRange(heading.firstChild!, 0, pageRoot(container, 1).firstChild!, 6);
    finishSelectionOn(pageRoot(container, 1));

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
  });

  it('L: a selection made stale by new page text loses its chip', () => {
    const { container } = armPageOne();
    expect(clipChip(container, 1)).not.toBeNull();

    // The document is re-read and page 1 now says something else. The captured
    // offsets no longer describe it, so the clip must fail closed rather than
    // stay draggable against text nobody selected.
    act(() => {
      root!.render(
        <KnowledgeDocumentDetails
          documentId="doc-1"
          originalFilename="EMG_checklist.pdf"
          pageCount={2}
          pages={[{ pageNumber: 1, text: 'completely different page one' }, pages[1]]}
          loading={false}
          error={false}
          onBack={vi.fn()}
          onCreateNoteFromPage={vi.fn()}
        />,
      );
    });

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
    expect(createNoteButton(container, 1).textContent).toBe('Create Note');
  });

  it('M: a viewer who cannot create posts is offered no chip to drag', () => {
    // No onCreateNoteFromPage is exactly how the reader is handed to a viewer.
    const container = mountWith({ documentId: 'doc-1' });
    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);
    finishSelectionOn(pageOne);

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
    // Selecting and reading still work; only creation is absent.
    expect(pageOne.textContent).toBe(pages[0].text);
  });

  it('N: a reader with no document id offers no chip', () => {
    const container = mountWith({ onCreateNoteFromPage: vi.fn() });
    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);
    finishSelectionOn(pageOne);

    expect(container.querySelectorAll('[data-knowledge-clip-chip="true"]')).toHaveLength(0);
  });
});
