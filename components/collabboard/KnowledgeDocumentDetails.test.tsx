// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';

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
