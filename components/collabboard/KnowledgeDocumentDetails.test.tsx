import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { knowledgeSourceNoteAccentColor }
  from '@/lib/domain/knowledge/knowledgeSourceHighlightColor';
import { knowledgeStandaloneHighlightIndexOf }
  from '@/lib/domain/knowledge/knowledgeStandaloneHighlightIndex';
import type { KnowledgeSourceHighlight }
  from '@/lib/domain/knowledge/knowledgeSourceHighlight';

/**
 * PDF-R6K-H2B-C1. The reader's persistent visual authority is now the
 * standalone highlight table, so a fixture that used to be "a citation that
 * paints" becomes "a citation PLUS the highlight created with it" -- which is
 * exactly what the atomic create flow now writes.
 *
 * Each test's offsets, quote and intent are unchanged; only the row that
 * carries them to the renderer is. A test that wants a citation WITHOUT a mark
 * simply omits the highlight, which is the decisive separation case.
 */
const highlightFor = (
  reference: SourceReference,
  over: Partial<KnowledgeSourceHighlight> = {},
): KnowledgeSourceHighlight => ({
  id: `hl-${String(reference.id)}` as KnowledgeSourceHighlight['id'],
  sourceDocumentId: reference.sourceDocumentId,
  pageNumber: reference.pageStart,
  charStart: reference.charStart ?? 0,
  charEnd: reference.charEnd ?? 0,
  quoteText: reference.quoteText ?? '',
  quoteHash: null,
  color: '#e0f2fe',
  createdBy: null,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  sourceReferenceId: reference.id,
  ...over,
});

/** Every citation that resolves to a span gets the mark it would have been created with. */
const highlightsForAll = (references: readonly SourceReference[]) =>
  knowledgeStandaloneHighlightIndexOf(
    references
      .filter((reference) => reference.charStart !== null && reference.charEnd !== null)
      .map((reference) => highlightFor(reference)),
  );
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import { buildKnowledgeSourceBacklinkIndex } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import { KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS } from '@/lib/domain/knowledge/knowledgeSourceNoteColorChoice';
import { knowledgeSelectionSaveIdentity } from '@/components/collabboard/knowledgeSourceTextSelection';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

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

/**
 * PDF-R6J-C2. The reader's page actions now act on the page in view, which is
 * tracked with an IntersectionObserver. jsdom has none, so tests drive it:
 * without this every page-scoped assertion below would silently be about
 * page 1 forever.
 */
type IoEntry = { target: Element; intersectionRatio: number };
let ioCallbacks: Array<(entries: IoEntry[]) => void> = [];

class TestIntersectionObserver {
  private readonly targets: Element[] = [];
  constructor(private readonly callback: (entries: IoEntry[]) => void) {
    ioCallbacks.push(callback);
  }
  observe(target: Element) { this.targets.push(target); }
  unobserve() { /* not needed */ }
  disconnect() { ioCallbacks = ioCallbacks.filter((cb) => cb !== this.callback); }
}

/** Reports `pageNumber` as the page filling the reader viewport. */
function showPage(container: HTMLElement, pageNumber: number) {
  const sections = Array.from(container.querySelectorAll('[data-page-number]'));
  const entries = sections.map((target) => ({
    target,
    intersectionRatio: Number(target.getAttribute('data-page-number')) === pageNumber ? 1 : 0,
  }));
  act(() => { for (const cb of [...ioCallbacks]) cb(entries); });
}

/** The search field lives in a popover now; open it before typing. */
function openSearch(container: HTMLElement): HTMLInputElement {
  const existing = container.querySelector('input[type="search"]') as HTMLInputElement | null;
  if (existing) return existing;
  const trigger = container.querySelector('[data-knowledge-viewer-action="search"]') as HTMLButtonElement;
  expect(trigger, 'the search trigger must exist').toBeTruthy();
  act(() => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return container.querySelector('input[type="search"]') as HTMLInputElement;
}

function setSearch(container: HTMLElement, value: string) {
  const input = openSearch(container);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  ioCallbacks = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    TestIntersectionObserver as unknown as typeof IntersectionObserver;
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
    // PDF-R6K removed the per-page headings; the pager states the position and
    // both pages are still rendered, which is what this was checking.
    expect(container.textContent).toContain('1 / 2');
    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(2);
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
    // PDF-R6K removed the per-page heading; the pager states the position.
    expect(host!.textContent).toContain('1 / 2');
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

/**
 * Text Phase 1: an exact selection's action moved to the ONE floating
 * toolbar (outside every page section); the plain page-level action stays
 * in the page header for when there is no selection. Callers that just want
 * "the button that reaches onCreateNoteFromPage" get either, transparently.
 */
function createNoteButton(container: HTMLElement, pageNumber: number): HTMLButtonElement {
  // PDF-R6J-C2. There is no longer a button per page: ONE bottom control acts
  // on whichever page the reader is showing, so "the button for page N" means
  // "show page N, then the button". Callers that just want the control get it
  // either way.
  showPage(container, pageNumber);
  const pageButton = container.querySelector(
    `button[aria-label="Create Note from page ${pageNumber}"]`,
  ) as HTMLButtonElement | null;
  if (pageButton) return pageButton;
  const toolbar = container.querySelector('[data-knowledge-selection-toolbar]');
  return toolbar?.querySelector(
    `button[aria-label="Create Note from selection on page ${pageNumber}"]`,
  ) as HTMLButtonElement;
}

function selectionToolbar(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-knowledge-selection-toolbar]');
}

function selectionGrip(container: HTMLElement): HTMLButtonElement | null {
  return selectionToolbar(container)?.querySelector('[data-knowledge-clip-chip="true"]') ?? null;
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
  // Resolved OUTSIDE act: createNoteButton shows the page first, which is its
  // own act(), and nesting them leaves the query reading the pre-update DOM.
  const button = createNoteButton(container, pageNumber);
  act(() => button.click());
}

describe('KnowledgeDocumentDetails exact selection capture', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('A: with no selection the action stays page-only', () => {
    const { container, onCreateNoteFromPage } = mountReader();

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
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

    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from selection on page 1');
    // PDF-R6J-C2: there is one page action, and an active selection replaces
    // it entirely -- the same "selection wins" rule the per-page buttons had,
    // now expressed once instead of per page.
    expect(container.querySelector('[data-knowledge-viewer-action="create-note"]')).toBeNull();
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
      topStripColor: null,
    });
    expect(pages[0].text.slice(4, 10)).toBe('safety');
  });

  it('C: the page-only request returns, for the page in view, once the selection goes', () => {
    // PDF-R6J-C2 replaced the per-page buttons with one that follows the page
    // in view, so "the other page" is now "scroll to it": the page-only shape
    // of the request is what this has always been about.
    const { container, onCreateNoteFromPage } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);
    expect(container.querySelector('[data-knowledge-viewer-action="create-note"]')).toBeNull();

    // Drop the selection, show page 2, and the plain action is back for it.
    selectRange(root.firstChild!, 4, root.firstChild!, 4);
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

    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
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

    // Nothing is armed, and no one-page span was invented: the plain action
    // is what remains, aimed at whichever page is in view.
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
    expect(createNoteButton(container, 2).getAttribute('aria-label')).toBe('Create Note from page 2');
    clickCreateNote(container, 1);
    expect(onCreateNoteFromPage.mock.calls[0][0].selection).toBeNull();
  });

  it('I: a selection reaching outside the page paragraph captures nothing', () => {
    const { container } = mountReader();
    // PDF-R6K removed the page heading, so the document header is now the
    // out-of-root node this needs.
    const heading = container.querySelector('h2')!;

    // Starts in the "Page 1" heading and ends in the canonical text.
    selectRange(heading.firstChild!, 0, pageRoot(container, 1).firstChild!, 6);
    finishSelectionOn(container.querySelector('[data-page-number="1"]')!);

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('J: a collapsed selection captures nothing and clears a prior capture', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');

    selectRange(root.firstChild!, 4, root.firstChild!, 4);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('K: replacing the document or its page text drops the stale capture', () => {
    const { container } = mountReader();
    const textRoot = pageRoot(container, 1);
    selectRange(textRoot.firstChild!, 4, textRoot.firstChild!, 10);
    finishSelectionOn(textRoot);
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');

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

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('K: a different document id clears the capture even at identical coordinates', () => {
    const { container } = mountReader();
    const textRoot = pageRoot(container, 1);
    selectRange(textRoot.firstChild!, 4, textRoot.firstChild!, 10);
    finishSelectionOn(textRoot);
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');

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

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('L: text injected into the paragraph fails the capture closed', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);
    // A later UI change that adds visible text would invalidate every offset.
    act(() => { root.appendChild(document.createTextNode(' INJECTED')); });
    expect(root.textContent).not.toBe(pages[0].text);

    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('M: selecting text makes no network request at all', () => {
    const { container } = mountReader();
    const root = pageRoot(container, 1);

    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
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
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
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
      <KnowledgeSourceReferenceProvider
        index={buildKnowledgeSourceReferenceIndex(references)}
        highlights={highlightsForAll(references)}
        onDeleteHighlight={() => {}}
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
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
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
/**
 * PDF-R6K-H2B-C1. Like `mountInteractive`, but the standalone highlights are
 * stated explicitly rather than derived from the citations -- which is the only
 * way to express the cases that matter now: a citation with NO mark, a mark
 * with NO citation, and a board with no delete authority.
 */
function mountInteractiveWithHighlights(
  references: readonly SourceReference[],
  posts: readonly { id: string; type: string; title: string; content: string }[],
  highlights?: readonly KnowledgeSourceHighlight[],
  options: {
    onDeleteHighlight?: ((id: string) => void) | null;
  } = {},
) {
  const onOpenBacklinkTarget = vi.fn();
  const onDeleteHighlight = options.onDeleteHighlight === undefined
    ? () => {}
    : options.onDeleteHighlight;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  const paint = (rows: readonly KnowledgeSourceHighlight[]) => {
    act(() => {
      root!.render(
        <KnowledgeSourceReferenceProvider
          index={buildKnowledgeSourceReferenceIndex(references)}
          backlinks={buildKnowledgeSourceBacklinkIndex(references, posts)}
          highlights={knowledgeStandaloneHighlightIndexOf(rows)}
          onDeleteHighlight={onDeleteHighlight}
        >
          <KnowledgeDocumentDetails
            documentId={DOC_ID}
            originalFilename="EMG_checklist.pdf"
            pageCount={2}
            pages={pages}
            loading={false}
            error={false}
            onBack={vi.fn()}
            onCreateNoteFromPage={vi.fn()}
            onOpenBacklinkTarget={onOpenBacklinkTarget}
          />
        </KnowledgeSourceReferenceProvider>,
      );
    });
  };

  paint(highlights ?? references
    .filter((reference) => reference.charStart !== null && reference.charEnd !== null)
    .map((reference) => highlightFor(reference)));

  return {
    container: host!,
    onOpenBacklinkTarget,
    /** Re-renders with a new set, as the board would after a delete. */
    rerenderHighlights: paint,
  };
}

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
          highlights={highlightsForAll(references)}
          onDeleteHighlight={() => {}}
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
    // PDF-R6K-H2B-C1: arrival is a transient RING now. The old bg-sky-200 was
    // a citation-derived background, which is exactly what must no longer
    // exist -- a citation paints nothing that outlives the navigation focus.
    expect(marked[0].className).toContain('ring-sky-400');
    expect(marked[0].className).not.toContain('bg-sky-200');
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

/**
 * PDF-R6K-H2B-C1 -- clicking a persisted highlight.
 *
 * The old gesture opened the citing Note directly. It cannot survive the
 * separation: a highlight may have no Note at all, and it now has an action of
 * its own, so the click opens a compact control instead of guessing between
 * them. Open Note is offered per highlight, only where that highlight still has
 * a live citation; Trash only where the board wired a delete authority.
 */
describe('PDF-R6K-H2B-C1 highlight contextual actions', () => {
  const actionsIn = (container: HTMLElement) =>
    container.querySelector('[data-knowledge-highlight-actions="true"]');
  const rowsIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-knowledge-highlight-action-row]'));
  const openNoteIn = (scope: HTMLElement | Document) =>
    Array.from(scope.querySelectorAll('[data-knowledge-highlight-action="open-note"]'));
  const trashIn = (scope: HTMLElement | Document) =>
    Array.from(scope.querySelectorAll('[data-knowledge-highlight-action="delete"]'));

  it('CLICK-1/CLICK-2: an editor clicking a linked highlight gets Open Note and Trash', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );

    // Nothing is open until the highlight is deliberately clicked.
    expect(actionsIn(container)).toBeNull();
    clickOn(highlightsIn(container)[0]);

    expect(actionsIn(container)).not.toBeNull();
    expect(rowsIn(container)).toHaveLength(1);
    expect(openNoteIn(container)).toHaveLength(1);
    expect(trashIn(container)).toHaveLength(1);
    // The old gesture no longer fires on the click itself.
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
  });

  it('CLICK-7: Open Note targets the exact citation-linked padlet', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );
    clickOn(highlightsIn(container)[0]);
    clickOn(openNoteIn(container)[0] as HTMLElement);

    expect(onOpenBacklinkTarget).toHaveBeenCalledTimes(1);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-a');
    // Acting dismisses the control.
    expect(actionsIn(container)).toBeNull();
  });

  it('CLICK-4/CLICK-6: a highlight with no live citation offers Trash and no Open Note', () => {
    // `sourceReferenceId: null` is what a plain highlight looks like, and also
    // what an orphan looks like after its citing Note was deleted (H2A-C1's
    // ON DELETE SET NULL). The two are indistinguishable here on purpose.
    const { container } = mountInteractiveWithHighlights(
      [],
      [],
      [highlightFor(exactRef(4, 10, ids('ref-a', 'note-a')), { sourceReferenceId: null })],
    );
    clickOn(highlightsIn(container)[0]);

    expect(rowsIn(container)).toHaveLength(1);
    expect(openNoteIn(container), 'no Note exists to open').toHaveLength(0);
    expect(trashIn(container)).toHaveLength(1);
  });

  it('CLICK-3/CLICK-5: a viewer gets Open Note but never Trash', () => {
    const { container } = mountInteractiveWithHighlights(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
      undefined,
      // No delete authority wired: this is what a viewer or commenter gets.
      { onDeleteHighlight: null },
    );
    clickOn(highlightsIn(container)[0]);

    expect(openNoteIn(container)).toHaveLength(1);
    expect(trashIn(container), 'a viewer is offered no shared mutation').toHaveLength(0);
  });

  it('CLICK-8: no target padlet is denormalised onto the highlight', () => {
    // The Note is derived from the citation the board already holds. A copy on
    // the highlight row would go stale the moment that Note is deleted.
    const domain = readFileSync(
      join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceHighlight.ts'), 'utf8',
    );
    expect(domain).not.toContain('targetPadletId');
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260904_create_knowledge_source_highlights.sql'),
      'utf8',
    );
    expect(migration.replace(/--.*$/gm, '')).not.toContain('target_padlet_id');
  });

  it('OVERLAP-1/OVERLAP-2: an A+B run lists both ids, each with its own Note', () => {
    const refA = exactRef(0, 10, ids('ref-a', 'note-a'));
    const refB = exactRef(4, 14, ids('ref-b', 'note-b'));
    const { container, onOpenBacklinkTarget } = mountInteractiveWithHighlights(
      [refA, refB],
      [notePost('note-a', 'Note A'), notePost('note-b', 'Note B')],
    );

    const overlap = highlightsIn(container).find((node) => node.textContent === 'safety')!;
    expect(overlap.getAttribute('data-knowledge-source-highlight-count')).toBe('2');
    // Both durable ids reach the DOM, so neither has to be guessed.
    expect(overlap.getAttribute('data-knowledge-highlight-ids'))
      .toBe('hl-ref-a,hl-ref-b');

    clickOn(overlap);
    expect(rowsIn(container), 'one row per covering highlight').toHaveLength(2);
    // Each row resolves its OWN Note, never the first one arbitrarily.
    const notes = openNoteIn(container);
    expect(notes).toHaveLength(2);
    clickOn(notes[1] as HTMLElement);
    expect(onOpenBacklinkTarget).toHaveBeenCalledWith('note-b');
  });

  it('OVERLAP-3: deleting A leaves B painted and B\'s Note action intact', () => {
    const refA = exactRef(0, 10, ids('ref-a', 'note-a'));
    const refB = exactRef(4, 14, ids('ref-b', 'note-b'));
    const deleted: string[] = [];
    const { container, rerenderHighlights } = mountInteractiveWithHighlights(
      [refA, refB],
      [notePost('note-a', 'Note A'), notePost('note-b', 'Note B')],
      undefined,
      { onDeleteHighlight: (id: string) => { deleted.push(id); } },
    );

    const overlap = highlightsIn(container).find((node) => node.textContent === 'safety')!;
    clickOn(overlap);
    // Delete the FIRST row deliberately -- by its id, not by position luck.
    clickOn(trashIn(container)[0] as HTMLElement);
    expect(deleted).toEqual(['hl-ref-a']);

    // The board removes the row and re-renders; B must survive untouched.
    rerenderHighlights([highlightFor(refB)]);
    const remaining = highlightsIn(container);
    expect(remaining.length).toBeGreaterThan(0);
    for (const node of remaining) {
      expect(node.getAttribute('data-knowledge-highlight-ids')).toBe('hl-ref-b');
    }
    clickOn(remaining[0]);
    expect(openNoteIn(container)).toHaveLength(1);
  });

  it('a citation with NO standalone highlight paints nothing at all', () => {
    // The decisive separation test: the citation is present and navigable, but
    // there is no persistent background anywhere on the page.
    const { container } = mountInteractiveWithHighlights(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
      [],
    );
    expect(highlightsIn(container)).toHaveLength(0);
    expect(container.querySelector('[data-knowledge-highlight-ids]')).toBeNull();
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
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
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

  it('AF: an ordinary collapsed click still acts -- now by opening the control', () => {
    const { container, onOpenBacklinkTarget } = mountInteractive(
      [exactRef(4, 10, ids('ref-a', 'note-a'))],
      [notePost('note-a', 'Citing Note')],
    );

    // Nothing selected -- the browser's selection is collapsed.
    clickOn(highlightsIn(container)[0]);

    // PDF-R6K-H2B-C1: the gesture reaches the highlight's own actions, and Open
    // Note is one of them rather than the whole of it.
    const actions = container.querySelector('[data-knowledge-highlight-actions="true"]');
    expect(actions).not.toBeNull();
    clickOn(actions!.querySelector('[data-knowledge-highlight-action="open-note"]') as HTMLElement);
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
    // PDF-R6K-H2B-C1: one row per covering HIGHLIGHT, each with its own id.
    expect(container.querySelectorAll('[data-knowledge-highlight-action-row]')).toHaveLength(2);
    expect(onOpenBacklinkTarget).not.toHaveBeenCalled();
  });

  it('AR/AS/AT/AU/AV: the page text reconstructs exactly, chooser open or closed', () => {
    const { container } = withOverlap();
    const root = pageRoot(container, 1);
    expect(root.textContent).toBe(PAGE_ONE);

    clickOn(highlightsIn(container).find((node) => node.textContent === 'safety')!);

    const actions = container.querySelector('[data-knowledge-highlight-actions="true"]')!;
    expect(actions).not.toBeNull();
    // Outside every page text root -- otherwise its labels would land in the
    // coordinate space B4-B2B measures against. The control moved; the rule
    // it has to obey did not.
    expect(root.contains(actions)).toBe(false);
    expect(pageRoot(container, 1).textContent).toBe(PAGE_ONE);

    // Acting dismisses it, and restores nothing -- the root never changed.
    clickOn(actions.querySelector('[data-knowledge-highlight-action="open-note"]') as HTMLElement);
    expect(container.querySelector('[data-knowledge-highlight-actions="true"]')).toBeNull();
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
// Text Phase 1 -- the floating selection toolbar (six-dot grip, Note Post,
// Copy, color choices), replacing the P6J-F8-B1 page-header clip chip.
// ============================================================================
// The toolbar is an ADDED affordance, not a replacement: it must reach the
// same callback the existing page-level button reaches, and it must not put
// a single character inside the paragraph B4-B2B measures its coordinates
// against.

const CLIP_MIME = 'application/collabboard-knowledge-clip';
const COLOR_HINT_MIME = 'application/collabboard-knowledge-clip-color-hint';

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

function toolbarButton(container: HTMLElement, label: string): HTMLButtonElement | null {
  return selectionToolbar(container)?.querySelector(`button[aria-label="${label}"]`) ?? null;
}

describe('Text Phase 1 floating selection toolbar', () => {
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

  it('1: a valid exact single-page selection shows the floating toolbar', () => {
    const { container } = armPageOne();

    expect(selectionToolbar(container)).not.toBeNull();
    expect(selectionGrip(container)).not.toBeNull();
  });

  it('2/B: with no selection there is no toolbar at all', () => {
    const { container } = mountReader();

    expect(selectionToolbar(container)).toBeNull();
    // The page-level fallback is still offered.
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('3/C: the toolbar and grip live OUTSIDE the canonical text root, which stays exact', () => {
    const { container } = armPageOne();
    const toolbar = selectionToolbar(container)!;
    const pageOne = pageRoot(container, 1);

    // The decisive check: not a descendant, at any depth.
    expect(pageOne.contains(toolbar)).toBe(false);
    expect(toolbar.closest('[data-knowledge-page-text-root]')).toBeNull();
    // And the coordinate space is byte-for-byte the page text.
    expect(pageOne.textContent).toBe(pages[0].text);
    expect(pageOne.querySelector('[data-knowledge-clip-chip]')).toBeNull();
    expect(pageOne.querySelector('[draggable]')).toBeNull();
    expect(pageOne.querySelector('button')).toBeNull();
  });

  it('the grip is draggable, focusable and labelled', () => {
    const { container } = armPageOne();
    const grip = selectionGrip(container)!;

    expect(grip.getAttribute('draggable')).toBe('true');
    expect(grip.tagName).toBe('BUTTON');
    expect(grip.getAttribute('type')).toBe('button');
    expect(grip.getAttribute('aria-label')).toBe('Drag selected PDF text to the canvas');
  });

  it('4: dragging the grip emits the dedicated Knowledge MIME with the exact documentId/page/offsets/text', () => {
    const { container } = armPageOne();
    const { transfer } = dragFrom(selectionGrip(container)!);

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
  });

  it('the captured selection survives the browser range collapsing first', () => {
    const { container } = armPageOne();
    // Pressing the grip collapses the live selection, exactly as a real click
    // does. The payload must come from captured state, not from the browser.
    window.getSelection()!.removeAllRanges();

    const { transfer } = dragFrom(selectionGrip(container)!);

    expect(JSON.parse(transfer.getData(CLIP_MIME))).toMatchObject({
      charStart: 4, charEnd: 10, selectedText: 'safety',
    });
  });

  it('6/7: the Note Post button opens the EXISTING Note editor callback with the selected text in the draft request', () => {
    const { container, onCreateNoteFromPage } = armPageOne();

    act(() => toolbarButton(container, 'Create Note from selection on page 1')!.click());

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
      topStripColor: null,
    });
  });

  it('the existing Create Note from selection fallback (now "Note Post") still works via the shared helper', () => {
    const { container, onCreateNoteFromPage } = armPageOne();

    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
    clickCreateNote(container, 1);

    expect(onCreateNoteFromPage).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage.mock.calls[0][0]).toMatchObject({
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
    });
  });

  it('R6A-1: the FIRST selection shows the toolbar even when released outside', () => {
    /**
     * The reported regression. A drag-selection ends wherever the pointer
     * happens to be, and in the side panel that is very often past the edge of
     * the scrolling text. Settling only on the pages container missed exactly
     * those releases, so the first selection produced no toolbar and a second
     * one -- released inside the text by luck -- appeared to fix it.
     */
    const { container } = mountReader();
    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);

    // Released over the surrounding chrome, not over the text.
    act(() => { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(selectionToolbar(container)).not.toBeNull();
    expect(selectionGrip(container)).not.toBeNull();
  });

  it('R6A-2: the toolbar tracks the CURRENT range, never the previous one', () => {
    const { container } = armPageOne();
    expect(toolbarButton(container, 'Create Note from selection on page 1')).not.toBeNull();

    // A second selection on a different page must retarget the toolbar.
    const pageTwo = pageRoot(container, 2);
    selectRange(pageTwo.firstChild!, 2, pageTwo.firstChild!, 8);
    act(() => { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(toolbarButton(container, 'Create Note from selection on page 2')).not.toBeNull();
    expect(toolbarButton(container, 'Create Note from selection on page 1')).toBeNull();
  });

  it('R6A-3: collapsing the selection dismisses the toolbar', () => {
    const { container } = armPageOne();
    expect(selectionToolbar(container)).not.toBeNull();

    window.getSelection()!.removeAllRanges();
    act(() => { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(selectionToolbar(container)).toBeNull();
  });

  it('R6A-4: pressing a toolbar button never consumes the selection', () => {
    // mouseup runs before click, so a document listener that settled on a
    // button press would clear the very selection the action is about to use.
    const { container } = armPageOne();
    const copy = toolbarButton(container, 'Copy selected text')!;

    act(() => { copy.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(selectionToolbar(container)).not.toBeNull();
  });

  it('5: page text with NO selection is still not draggable', () => {
    // The original protection, unchanged: without a re-proved selection there
    // is nothing authoritative to carry, so the browser starts no native text
    // drag that could fling forgeable `text/plain` at the canvas.
    const { container } = mountReader();

    const fromText = dragFrom(pageRoot(container, 1));

    expect(fromText.defaultPrevented).toBe(true);
    expect(fromText.transfer.store.size).toBe(0);
  });

  it('5b: a drag OUTSIDE the selection is still suppressed', () => {
    // R6A widened the affordance to the highlight itself, not to the page.
    // Page two is not part of the page-one selection, so it stays inert.
    const { container } = armPageOne();

    const fromOtherPage = dragFrom(pageRoot(container, 2));

    expect(fromOtherPage.defaultPrevented).toBe(true);
    expect(fromOtherPage.transfer.store.size).toBe(0);
  });

  it('5c: R6A -- the highlighted text itself drags, exactly as the grip does', () => {
    const { container } = armPageOne();

    // The user grabs the highlight rather than hunting for the six-dot target.
    const fromText = dragFrom(pageRoot(container, 1));
    expect(fromText.defaultPrevented).toBe(false);
    expect(fromText.transfer.getData(CLIP_MIME)).not.toBe('');

    // The grip drag rides the same container handler and is NOT cancelled.
    const fromGrip = dragFrom(selectionGrip(container)!);
    expect(fromGrip.defaultPrevented).toBe(false);
    expect(fromGrip.transfer.getData(CLIP_MIME)).not.toBe('');

    // Identical provenance: one payload builder serves both surfaces, so the
    // board cannot tell which one the user used.
    expect(fromText.transfer.getData(CLIP_MIME)).toBe(fromGrip.transfer.getData(CLIP_MIME));
  });

  it('2: a cross-page selection does NOT show the toolbar', () => {
    const { container } = mountReader();
    selectRange(pageRoot(container, 1).firstChild!, 4, pageRoot(container, 2).firstChild!, 3);
    finishSelectionOn(pageRoot(container, 2));

    expect(selectionToolbar(container)).toBeNull();
  });

  it('2: a selection reaching outside any page root does NOT show the toolbar', () => {
    const { container } = mountReader();
    // PDF-R6K removed the page heading; the document header stands in.
    const heading = container.querySelector('h2')!;
    selectRange(heading.firstChild!, 0, pageRoot(container, 1).firstChild!, 6);
    finishSelectionOn(pageRoot(container, 1));

    expect(selectionToolbar(container)).toBeNull();
  });

  it('a selection made stale by new page text loses its toolbar', () => {
    const { container } = armPageOne();
    expect(selectionToolbar(container)).not.toBeNull();

    // The document is re-read and page 1 now says something else. The captured
    // offsets no longer describe it, so the toolbar must fail closed rather
    // than stay draggable against text nobody selected.
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

    expect(selectionToolbar(container)).toBeNull();
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
  });

  it('a viewer who cannot create posts is offered no toolbar', () => {
    // No onCreateNoteFromPage is exactly how the reader is handed to a viewer.
    const container = mountWith({ documentId: 'doc-1' });
    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);
    finishSelectionOn(pageOne);

    expect(selectionToolbar(container)).toBeNull();
    // Selecting and reading still work; only creation is absent.
    expect(pageOne.textContent).toBe(pages[0].text);
  });

  it('a reader with no document id offers no toolbar', () => {
    const container = mountWith({ onCreateNoteFromPage: vi.fn() });
    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 4, pageOne.firstChild!, 10);
    finishSelectionOn(pageOne);

    expect(selectionToolbar(container)).toBeNull();
  });

  it('Copy copies the selected text only, and creates no Note and no reference', () => {
    const { container, onCreateNoteFromPage } = armPageOne();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    act(() => toolbarButton(container, 'Copy selected text')!.click());

    expect(writeText).toHaveBeenCalledWith('safety');
    expect(onCreateNoteFromPage).not.toHaveBeenCalled();
  });

  it('9: choosing a toolbar color sets the Note draft request\'s topStripColor', () => {
    const { container, onCreateNoteFromPage } = armPageOne();
    const swatch = selectionToolbar(container)!.querySelector('button[aria-label^="Highlight color"]') as HTMLButtonElement;
    const color = swatch.getAttribute('aria-label')!.replace('Highlight color ', '');

    act(() => swatch.click());
    act(() => toolbarButton(container, 'Create Note from selection on page 1')!.click());

    expect(onCreateNoteFromPage.mock.calls[0][0]).toMatchObject({ topStripColor: color });
  });

  it('the six-dot grip also carries the chosen color as an auxiliary, non-authoritative drag hint', () => {
    const { container } = armPageOne();
    const swatch = selectionToolbar(container)!.querySelector('button[aria-label^="Highlight color"]') as HTMLButtonElement;
    const color = swatch.getAttribute('aria-label')!.replace('Highlight color ', '');
    act(() => swatch.click());

    const { transfer } = dragFrom(selectionGrip(container)!);

    // The dedicated Knowledge MIME payload is UNCHANGED by the color choice.
    expect(JSON.parse(transfer.getData(CLIP_MIME))).not.toHaveProperty('color');
    expect(transfer.getData(COLOR_HINT_MIME)).toBe(color);
  });

  it('10: choosing a color renders a transient preview span without changing canonical textContent', () => {
    const { container } = armPageOne();
    const pageOne = pageRoot(container, 1);
    const before = pageOne.textContent;
    const swatch = selectionToolbar(container)!.querySelector('button[aria-label^="Highlight color"]') as HTMLButtonElement;

    act(() => swatch.click());

    expect(pageOne.querySelector('[data-knowledge-selection-color-preview="true"]')).not.toBeNull();
    expect(pageOne.querySelector('[data-knowledge-selection-color-preview="true"]')!.textContent).toBe('safety');
    expect(pageOne.textContent).toBe(before);
    expect(pageOne.textContent).toBe(pages[0].text);
  });

  it('a new selection clears a prior color preview', () => {
    const { container } = armPageOne();
    const swatch = selectionToolbar(container)!.querySelector('button[aria-label^="Highlight color"]') as HTMLButtonElement;
    act(() => swatch.click());
    expect(pageRoot(container, 1).querySelector('[data-knowledge-selection-color-preview]')).not.toBeNull();

    const pageOne = pageRoot(container, 1);
    selectRange(pageOne.firstChild!, 0, pageOne.firstChild!, 3);
    finishSelectionOn(pageOne);

    expect(pageOne.querySelector('[data-knowledge-selection-color-preview]')).toBeNull();
  });
});

// ============================================================================
// P6J-F8-B3 -- source highlights wearing the citing Note's card colour
// ============================================================================
function mountWithNoteColors(
  references: readonly SourceReference[],
  noteColors: ReadonlyMap<string, string>,
  props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {},
) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      // Real provider, real index, real domain resolver -- only the colour map
      // is supplied, exactly as CanvasClient derives it from its own posts.
      <KnowledgeSourceReferenceProvider
        index={buildKnowledgeSourceReferenceIndex(references)}
        // PDF-R6K-H2B-C1: colour is now the HIGHLIGHT's, seeded from the Note
        // at creation and owned by the highlight afterwards. The map these
        // tests supply is therefore applied to the highlight rows, which is
        // exactly what the atomic create flow writes.
        highlights={knowledgeStandaloneHighlightIndexOf(references
          .filter((reference) => reference.charStart !== null && reference.charEnd !== null)
          .map((reference) => highlightFor(reference, {
            // Seeded exactly as the atomic create flow does: the Note's accent
            // through the shared authority, which rejects white and unusable
            // values, falling back to the reader's own neutral.
            color: knowledgeSourceNoteAccentColor({
              topStrip: noteColors.get(String(reference.targetPadletId)),
            }) ?? '#e0f2fe',
          })))}
        onDeleteHighlight={() => {}}
      >
        <KnowledgeDocumentDetails
          documentId={DOC_ID}
          originalFilename="EMG_checklist.pdf"
          pageCount={2}
          pages={pages}
          loading={false}
          error={false}
          onBack={vi.fn()}
          {...props}
        />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  return host!;
}

const b3PageRoot = (container: HTMLElement, page: number) =>
  container.querySelector(`[data-knowledge-page-text-root="${page}"]`) as HTMLElement;

/** Inline backgroundColor actually applied to each source highlight. */
const tintsIn = (container: HTMLElement) =>
  highlightsIn(container).map((node) => node.style.backgroundColor);

const overlapIn = (container: HTMLElement) =>
  highlightsIn(container).find((node) => node.getAttribute('data-knowledge-source-highlight-count') === '2');

/** Ids are branded nominal types with no runtime component, hence the casts. */
const b3Exact = (start: number, end: number, note: string) =>
  exactRef(start, end, { targetPadletId: note } as unknown as Partial<SourceReference>);

/** A page-only citation of page 1 by one Note: no offsets, whole-page quote. */
const b3PageOnly = (note: string) =>
  sourceRef({ targetPadletId: note, quoteText: PAGE_ONE } as unknown as Partial<SourceReference>);

describe('P6J-F8-B3 source highlight colour', () => {
  it('a coloured Note tints its own source highlight', () => {
    const container = mountWithNoteColors(
      [b3Exact(0, 3, 'note-a')],
      new Map([['note-a', '#dbeafe']]),
    );
    const [highlight] = highlightsIn(container);

    expect(highlight.textContent).toBe('PDF');
    // jsdom normalises the inline value to rgb().
    expect(highlight.style.backgroundColor).toBe('rgb(219, 234, 254)');
    // The neutral class is dropped, so the tint is not merely overriding it.
    expect(highlight.className).not.toContain('bg-sky-100');
  });

  it('an uncoloured Note seeds the neutral, which the highlight then OWNS', () => {
    // PDF-R6K-H2B-C1: a highlight always has a colour of its own. Where the
    // Note offered no usable accent, the reader's existing neutral is what was
    // stored at creation -- so it paints inline rather than by class, and a
    // later Note recolour cannot reach it.
    const container = mountWithNoteColors(
      [b3Exact(0, 3, 'note-a')],
      new Map(),
    );
    const [highlight] = highlightsIn(container);

    expect(highlight.style.backgroundColor).toBe('rgb(224, 242, 254)');
  });

  it('a default-white Note stays neutral rather than painting the highlight white', () => {
    const container = mountWithNoteColors(
      [b3Exact(0, 3, 'note-a')],
      new Map([['note-a', '#ffffff']]),
    );
    const [highlight] = highlightsIn(container);

    // PDF-R6K-H2B-C1: white is still refused as an accent -- a white highlight
    // is an invisible one -- so the neutral was seeded at creation and is what
    // the highlight now owns and paints.
    expect(highlight.style.backgroundColor).toBe('rgb(224, 242, 254)');
  });

  it('an overlap between Notes wanting DIFFERENT colours falls back to neutral', () => {
    // The middle run is covered by both citations; no single background can
    // honestly stand for both Notes, so it must not take either colour.
    const container = mountWithNoteColors(
      [
        b3Exact(0, 10, 'note-a'),
        b3Exact(4, 14, 'note-b'),
      ],
      new Map([['note-a', '#dbeafe'], ['note-b', '#fee2e2']]),
    );
    const overlap = overlapIn(container);

    expect(overlap).toBeDefined();
    expect(overlap!.style.backgroundColor).toBe('');
    expect(overlap!.className).toContain('bg-sky-100');
    // The unshared runs still carry their own Note's colour.
    expect(tintsIn(container)).toContain('rgb(219, 234, 254)');
    expect(tintsIn(container)).toContain('rgb(254, 226, 226)');
  });

  it('an overlap between Notes sharing one colour keeps that colour', () => {
    const container = mountWithNoteColors(
      [
        b3Exact(0, 10, 'note-a'),
        b3Exact(4, 14, 'note-b'),
      ],
      new Map([['note-a', '#dcfce7'], ['note-b', '#dcfce7']]),
    );

    expect(overlapIn(container)!.style.backgroundColor).toBe('rgb(220, 252, 231)');
  });

  it('an overlap of one coloured and one uncoloured Note falls back to neutral', () => {
    const container = mountWithNoteColors(
      [
        b3Exact(0, 10, 'note-a'),
        b3Exact(4, 14, 'note-b'),
      ],
      new Map([['note-a', '#dbeafe']]),
    );
    const overlap = overlapIn(container);

    expect(overlap!.style.backgroundColor).toBe('');
    expect(overlap!.className).toContain('bg-sky-100');
  });

  it('a tinted arrival highlight keeps its ring and navigation identity', () => {
    const reference = b3Exact(0, 3, 'note-a');
    const container = mountWithNoteColors(
      [reference],
      new Map([['note-a', '#dbeafe']]),
      { initialSourceReferenceId: String(reference.id) },
    );
    const arrival = container.querySelector('[data-knowledge-source-navigation-target="true"]') as HTMLElement;

    expect(arrival).not.toBeNull();
    expect(arrival.style.backgroundColor).toBe('rgb(219, 234, 254)');
    // Arrival feedback is navigation, not decoration: colour never costs it.
    expect(arrival.className).toContain('ring-1');
    expect(arrival.className).toContain('ring-sky-400');
  });

  it('SEARCH highlights keep their own styling regardless of Note colours', () => {
    // Load-bearing boundary: <mark> is the search class, not a source class.
    const container = mountWithNoteColors(
      [b3Exact(0, 3, 'note-a')],
      new Map([['note-a', '#dbeafe']]),
    );
    setSearch(container, 'PDF');

    const marks = Array.from(container.querySelectorAll('mark'));
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.style.backgroundColor).toBe('');
      expect(mark.className).toMatch(/bg-yellow-200|bg-blue-300/);
    }
  });

  it('a page-only citation gets no highlight and therefore no colour', () => {
    const container = mountWithNoteColors(
      [b3PageOnly('note-a')],
      new Map([['note-a', '#dbeafe']]),
    );

    expect(highlightsIn(container)).toHaveLength(0);
    expect(b3PageRoot(container, 1).querySelector('[style]')).toBeNull();
  });

  it('tinting never alters the canonical page text', () => {
    // B4-B2B measures selection offsets against this exact string; a colour may
    // not add, hide or reorder a single character of it.
    const container = mountWithNoteColors(
      [
        b3Exact(0, 10, 'note-a'),
        b3Exact(4, 14, 'note-b'),
      ],
      new Map([['note-a', '#dbeafe'], ['note-b', '#fee2e2']]),
    );

    expect(b3PageRoot(container, 1).textContent).toBe(pages[0].text);
    expect(b3PageRoot(container, 2).textContent).toBe(pages[1].text);
  });

  it('a reader mounted without noteColors still paints the highlight own colour', () => {
    // PDF-R6K-H2B-C1: Note colours are no longer an input to painting at all.
    // The highlight carries its own, so the reader needs nothing from the board.
    const { container } = mountWithReferences([b3Exact(0, 3, 'note-a')]);
    const [highlight] = highlightsIn(container);

    expect(highlight.style.backgroundColor).toBe('rgb(224, 242, 254)');
  });
});

// ============================================================================
// P6J-F9-A2b -- the page visual, layered over the canonical text
// ============================================================================

/**
 * The image is optional enhancement data. These pin the two properties that
 * make it safe: it never enters the F8 coordinate space, and its absence or
 * failure leaves the reader exactly as it was.
 */
describe('P6J-F9-A2b: page image integration', () => {
  const A2B_BOARD = '44444444-4444-4444-8444-444444444444';
  const A2B_DOCUMENT = '55555555-5555-4555-8555-555555555555';
  const a2bPages = [
    { pageNumber: 1, text: 'Alpha page one text.', widthPoints: 600, heightPoints: 800, rotation: 0 },
    { pageNumber: 2, text: 'Beta page two text.', widthPoints: 600, heightPoints: 800, rotation: 90 },
  ];

  function mountReader(props: Record<string, unknown> = {}) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(
      <KnowledgeDocumentDetails
        documentId={A2B_DOCUMENT}
        boardId={A2B_BOARD}
        originalFilename="report.pdf"
        pageCount={2}
        pages={a2bPages}
        loading={false}
        error={false}
        onBack={vi.fn()}
        {...props}
      />,
    ));
    return host;
  }

  const imageIn = (container: HTMLElement, page: number) =>
    container.querySelector(`[data-page-number="${page}"] img`) as HTMLImageElement | null;

  it('R7: renders one image per page, inside that page section', () => {
    const container = mountReader();

    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(imageIn(container, 1)!.getAttribute('src'))
      .toBe(`/api/boards/${A2B_BOARD}/knowledge/${A2B_DOCUMENT}/pages/1/image`);
    expect(imageIn(container, 2)!.getAttribute('src'))
      .toBe(`/api/boards/${A2B_BOARD}/knowledge/${A2B_DOCUMENT}/pages/2/image`);
  });

  it('R5/R6: the image is a SIBLING above the canonical text root, which stays exact', () => {
    const container = mountReader();
    const image = imageIn(container, 1)!;
    const textRoot = b3PageRoot(container, 1);

    // The decisive checks: not a descendant at any depth, in either direction.
    expect(textRoot.contains(image)).toBe(false);
    expect(image.closest('[data-knowledge-page-text-root]')).toBeNull();
    expect(textRoot.querySelector('img')).toBeNull();
    // The coordinate space captureExactSelection measures is byte-identical.
    expect(textRoot.textContent).toBe(a2bPages[0].text);
    // And the image precedes the text within the same section.
    const section = container.querySelector('[data-page-number="1"]')!;
    expect(section.contains(image)).toBe(true);
    expect(image.compareDocumentPosition(textRoot) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('R4/R13: an image failure removes only the visual; text and search survive', () => {
    const container = mountReader();
    const image = imageIn(container, 1)!;

    act(() => { image.dispatchEvent(new Event('error')); });

    expect(imageIn(container, 1)).toBeNull();
    // Page 2's image is untouched: failure is per-page, not per-document.
    expect(imageIn(container, 2)).not.toBeNull();
    // The text root is byte-identical and still selectable.
    const textRoot = b3PageRoot(container, 1);
    expect(textRoot.textContent).toBe(a2bPages[0].text);
    expect(textRoot.className).toContain('select-text');
    // Search still finds and marks text on the page whose image failed.
    const search = openSearch(container);
    act(() => {
      (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
        .set as (v: string) => void).call(search, 'Alpha');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(b3PageRoot(container, 1).querySelector('mark')?.textContent).toBe('Alpha');
  });

  it('R12: without boardId the reader renders exactly the text and no image', () => {
    const container = mountReader({ boardId: undefined });

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(b3PageRoot(container, 1).textContent).toBe(a2bPages[0].text);
    expect(b3PageRoot(container, 2).textContent).toBe(a2bPages[1].text);
  });

  it('R12: without documentId the reader renders exactly the text and no image', () => {
    const container = mountReader({ documentId: undefined });

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(b3PageRoot(container, 1).textContent).toBe(a2bPages[0].text);
  });

  it('R15: every page still renders -- no pager and no current-page state', () => {
    const container = mountReader();

    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-knowledge-page-text-root]')).toHaveLength(2);
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8');
    expect(source).not.toMatch(/currentPage|useState<number>\(1\)|setCurrentPage/);
  });

  /**
   * An <img> is natively draggable, and the reader already suppresses drags
   * outside the F8 clip chip. Pinning it here keeps that correct on purpose:
   * a second drag source inside the reader could otherwise hijack the canvas
   * drop that expects a knowledge-clip payload.
   */
  it('the page image starts no drag and carries no F8 clip payload', () => {
    const container = mountReader();
    const image = imageIn(container, 1)!;

    expect(image.draggable).toBe(false);
    const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
    act(() => { image.dispatchEvent(dragEvent); });
    // The existing suppression handler owns this: the drag never begins.
    expect(dragEvent.defaultPrevented).toBe(true);
  });

  /**
   * P6J-F9-A2b corrective. The browser run proved the sections collapsed to
   * 57px before load, which made loading="lazy" defer nothing. These pin that
   * each page's OWN persisted geometry reaches its OWN image -- transposed for
   * a quarter-turn page, because A1 bakes the rotation into the derivative.
   */
  it('C9/C10: per-page geometry reserves layout without touching the text root', () => {
    const container = mountReader();
    const upright = imageIn(container, 1)!;
    const quarterTurn = imageIn(container, 2)!;

    expect([upright.getAttribute('width'), upright.getAttribute('height')]).toEqual(['600', '800']);
    // Same stored points, rotation 90: the reservation must transpose or it
    // would describe a shape the rasterised derivative never has.
    expect([quarterTurn.getAttribute('width'), quarterTurn.getAttribute('height')])
      .toEqual(['800', '600']);

    // C9/C10: F8's coordinate space is byte-identical and the images are still
    // siblings, so nothing about the reservation entered the canonical text.
    for (const page of [1, 2]) {
      const textRoot = b3PageRoot(container, page);
      expect(textRoot.contains(imageIn(container, page)!)).toBe(false);
      expect(textRoot.querySelector('img')).toBeNull();
      expect(textRoot.textContent).toBe(a2bPages[page - 1].text);
    }
  });

  it('C6: a legacy page with no persisted geometry still reserves space', () => {
    const container = mountReader({ pages: [{ pageNumber: 1, text: 'Legacy page.' }] });
    const image = imageIn(container, 1)!;

    // Pre-A1 rows must not reintroduce the zero-height collapse.
    expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
    expect(b3PageRoot(container, 1).textContent).toBe('Legacy page.');
  });

  it('C11/C12: reservation adds no viewport machinery and no client rotation', () => {
    const container = mountReader();
    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-knowledge-page-text-root]')).toHaveLength(2);
    // Every page image is still rendered: the fix is a layout reservation, not
    // a virtualised or paged reader.
    expect(container.querySelectorAll('img')).toHaveLength(2);
    for (const image of Array.from(container.querySelectorAll('img'))) {
      expect(image.getAttribute('style')).toBeNull();
      expect(image.getAttribute('class') ?? '').not.toMatch(/rotate|skew|aspect-/);
    }
    for (const file of [
      'components/collabboard/KnowledgeDocumentDetails.tsx',
      'components/collabboard/KnowledgeDocumentPageImage.tsx',
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      // Text Phase 1 legitimately reads getBoundingClientRect once, to
      // position the floating selection toolbar -- unrelated to viewport
      // scroll-tracking, which is what this guard actually cares about.
      expect(source, `${file} must add no viewport machinery`)
        .not.toMatch(/IntersectionObserver|currentPage|scrollTop/);
    }
  });

  /**
   * P6J-F9-B2. Region selection needs to measure the DOM, and the guard above
   * says the reader and the image component are not where that may happen. One
   * wrapper owns it, and the frozen image component gained nothing at all.
   */
  it('B2: DOM measurement lives only in the region selector', () => {
    const selector = fs.readFileSync(path.join(process.cwd(),
      'components/collabboard/KnowledgeDocumentPageRegionSelector.tsx'), 'utf8');
    expect(selector).toContain('getBoundingClientRect');
    expect(selector).toContain('KnowledgeDocumentPageImage');

    const image = fs.readFileSync(path.join(process.cwd(),
      'components/collabboard/KnowledgeDocumentPageImage.tsx'), 'utf8');
    // The image component owns no interaction: the wrapper reads its load and
    // error events through React's own propagation instead of a new prop.
    for (const forbidden of ['onPointer', 'pointerdown', 'setPointerCapture', 'region', 'imageRef']) {
      expect(image, `the image component must not mention ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('R9/R10/R11: the reader gains no Storage, PDF.js or rotation behaviour', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/KnowledgeDocumentDetails.tsx'), 'utf8');
    for (const forbidden of ['supabase', 'storage.from', 'createSignedUrl', 'pdfjs', '.webp']) {
      expect(source, `the reader must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ============================================================================
// P6J-F9-D -- region arrival overlay
// ============================================================================

describe('P6J-F9-D region arrival', () => {
  const REGION_DOC = 'doc-region-1';
  const regionPages = [
    { pageNumber: 1, text: 'Page one region arrival fixture text right here.', widthPoints: 595, heightPoints: 842, rotation: 0 },
    { pageNumber: 2, text: 'Page two region arrival fixture text right here.', widthPoints: 595, heightPoints: 842, rotation: 0 },
  ];

  const regionDocId = REGION_DOC as SourceReference['sourceDocumentId'];
  const regionRef = (pageNumber: number, region: { x: number; y: number; width: number; height: number },
    overrides: Partial<SourceReference> = {}) =>
    sourceRef({ pageStart: pageNumber, pageEnd: pageNumber, sourceDocumentId: regionDocId, region, ...overrides });

  /** Same jsdom layout hack the selector's own suite uses, applied per <img>. */
  function layOutImage(image: HTMLImageElement) {
    const layout: Record<string, unknown> = {
      complete: true, naturalWidth: 1000, naturalHeight: 1415,
      clientLeft: 1, clientTop: 1, clientWidth: 500, clientHeight: 700, offsetLeft: 0, offsetTop: 0,
    };
    for (const [key, value] of Object.entries(layout)) Object.defineProperty(image, key, { value, configurable: true });
    act(() => { image.dispatchEvent(new Event('load')); });
  }

  const overlayIn = (container: HTMLElement, page: number) =>
    container.querySelector(`[data-page-number="${page}"] [data-knowledge-source-region-overlay]`);

  function mountRegionArrival(
    references: readonly SourceReference[],
    props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {},
  ) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const render = (extra: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {}) => {
      act(() => {
        root!.render(
          <KnowledgeSourceReferenceProvider
            index={buildKnowledgeSourceReferenceIndex(references)}
            highlights={highlightsForAll(references)}
            onDeleteHighlight={() => {}}
          >
            <KnowledgeDocumentDetails
              documentId={REGION_DOC} boardId="board-region-1" originalFilename="synthetic.pdf"
              pageCount={2} pages={regionPages} loading={false} error={false} onBack={vi.fn()}
              {...props} {...extra}
            />
          </KnowledgeSourceReferenceProvider>,
        );
      });
    };
    render();
    for (const image of Array.from(host!.querySelectorAll('img'))) layOutImage(image as HTMLImageElement);
    return { container: host!, render };
  }

  it('D1: PAGE_REGION arrival renders exactly one overlay, on the cited page only', () => {
    const ref = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const { container } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(1);
    expect(overlayIn(container, 1)).not.toBeNull();
    expect(overlayIn(container, 2)).toBeNull();
  });

  it('D9/M7: PAGE_ONLY arrival produces no region overlay', () => {
    const ref = sourceRef({ pageStart: 1, pageEnd: 1, sourceDocumentId: regionDocId });
    const { container } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D10/M8: EXACT_SPAN arrival produces no region overlay, and its own arrival is unaffected', () => {
    const text = regionPages[0].text;
    const ref = sourceRef({
      pageStart: 1, pageEnd: 1, sourceDocumentId: regionDocId,
      charStart: 0, charEnd: 10, quoteText: text.slice(0, 10),
    });
    const { container } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
    expect(container.querySelector('[data-knowledge-source-navigation-target="true"]')).not.toBeNull();
  });

  it('D11/M6: switching the navigated reference replaces the overlay, never leaving a stale one', () => {
    const refA = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const refB = regionRef(2, { x: 0.2, y: 0.2, width: 0.2, height: 0.2 });
    const { container, render } = mountRegionArrival([refA, refB],
      { initialSourceReferenceId: refA.id, initialSourceRequestId: 1 });
    expect(overlayIn(container, 1)).not.toBeNull();
    render({ initialSourceReferenceId: refB.id, initialSourceRequestId: 2 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(1);
    expect(overlayIn(container, 1)).toBeNull();
    expect(overlayIn(container, 2)).not.toBeNull();
  });

  it('D12: switching from a PAGE_REGION reference to a page-only one clears the overlay', () => {
    const refA = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const refB = sourceRef({ pageStart: 1, pageEnd: 1, sourceDocumentId: regionDocId });
    const { container, render } = mountRegionArrival([refA, refB],
      { initialSourceReferenceId: refA.id, initialSourceRequestId: 1 });
    expect(overlayIn(container, 1)).not.toBeNull();
    render({ initialSourceReferenceId: refB.id, initialSourceRequestId: 2 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D12/M8: switching from a PAGE_REGION reference to an EXACT_SPAN one clears the overlay', () => {
    const refA = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const text = regionPages[0].text;
    const refB = sourceRef({
      pageStart: 1, pageEnd: 1, sourceDocumentId: regionDocId,
      charStart: 0, charEnd: 10, quoteText: text.slice(0, 10),
    });
    const { container, render } = mountRegionArrival([refA, refB],
      { initialSourceReferenceId: refA.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(1);
    render({ initialSourceReferenceId: refB.id, initialSourceRequestId: 2 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
    expect(container.querySelector('[data-knowledge-source-navigation-target="true"]')).not.toBeNull();
  });

  it('D13/M11: switching documents clears a stale region overlay', () => {
    const ref = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const { container, render } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(overlayIn(container, 1)).not.toBeNull();
    render({ documentId: 'a-different-document', initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D14: a reference id matching nothing fails soft with no overlay and no throw', () => {
    const ref = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    let container: HTMLElement | undefined;
    expect(() => {
      container = mountRegionArrival([ref], { initialSourceReferenceId: 'ref-does-not-exist', initialSourceRequestId: 1 }).container;
    }).not.toThrow();
    expect((container as HTMLElement).querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D14: a malformed stored region fails soft with no overlay', () => {
    const ref = regionRef(1, { x: 2, y: 0.1, width: 0.4, height: 0.5 });
    const { container } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D14: an image failure drops the overlay without breaking the reader', () => {
    const ref = regionRef(1, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    const { container } = mountRegionArrival([ref], { initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(overlayIn(container, 1)).not.toBeNull();
    const image = container.querySelector('[data-page-number="1"] img') as HTMLImageElement;
    act(() => {
      Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });
      image.dispatchEvent(new Event('error'));
    });
    expect(container.querySelectorAll('[data-knowledge-source-region-overlay]')).toHaveLength(0);
  });

  it('D20: existing page-level arrival scrolling is unaffected by a PAGE_REGION overlay', () => {
    const ref = regionRef(2, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 });
    mountRegionArrival([ref], { initialPageNumber: 2, initialSourceReferenceId: ref.id, initialSourceRequestId: 1 });
    expect(scrolledElements().some((el) => el.getAttribute('data-page-number') === '2')).toBe(true);
  });
});

// ============================================================================
// PDF Source AI Phase 1 -- the ONE AI activation button, in the SAME toolbar
// ============================================================================

function mountReaderWithAi(props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {}) {
  const onCreateNoteFromPage = vi.fn();
  const onAiFromSelection = vi.fn();
  const container = mountWith({ documentId: 'doc-1', onCreateNoteFromPage, onAiFromSelection, ...props });
  return { container, onCreateNoteFromPage, onAiFromSelection };
}

function aiButton(container: HTMLElement): HTMLButtonElement | null {
  return selectionToolbar(container)?.querySelector('button[aria-label="Ask AI about the selected text"]') ?? null;
}

describe('KnowledgeDocumentDetails PDF Source AI Phase 1 toolbar', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('does not appear with no selection', () => {
    const { container } = mountReaderWithAi();
    expect(createNoteButton(container, 1).getAttribute('aria-label')).toBe('Create Note from page 1');
    expect(aiButton(container)).toBeNull();
  });

  it('appears in the SAME floating toolbar as Note Post once an exact selection is captured', () => {
    const { container } = mountReaderWithAi();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    const button = aiButton(container);
    expect(button).not.toBeNull();
    expect(button!.closest('[data-knowledge-selection-toolbar]')).toBe(selectionToolbar(container));
    // Exactly one floating toolbar -- never a second one for AI.
    expect(container.querySelectorAll('[data-knowledge-selection-toolbar]')).toHaveLength(1);
  });

  it('is hidden below lg via the same responsive class convention as the rest of the toolbar', () => {
    const { container } = mountReaderWithAi();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    const button = aiButton(container)!;
    expect(button.className).toContain('hidden');
    expect(button.className).toContain('lg:inline-flex');
  });

  it('disappears once entering region mode clears the captured text selection', () => {
    const { container } = mountReaderWithAi();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);
    expect(aiButton(container)).not.toBeNull();

    const selectArea = container
      .querySelector('[data-knowledge-viewer-action="select-area"]') as HTMLButtonElement;
    act(() => selectArea.click());

    expect(aiButton(container)).toBeNull();
  });

  it('is absent entirely with no onAiFromSelection, even with a valid selection -- Note Post is unaffected', () => {
    const { container } = mountReaderWithAi({ onAiFromSelection: undefined });
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    expect(aiButton(container)).toBeNull();
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
  });

  it('clicking it forwards the EXACT same request shape Note Post would build, including the chosen color', () => {
    const { container, onAiFromSelection, onCreateNoteFromPage } = mountReaderWithAi();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    const chosenColor = KNOWLEDGE_SOURCE_NOTE_TOP_STRIP_COLORS[0];
    const swatch = Array.from(container.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === `Highlight color ${chosenColor}`)!;
    act(() => swatch.click());

    act(() => aiButton(container)!.click());

    expect(onAiFromSelection).toHaveBeenCalledTimes(1);
    expect(onCreateNoteFromPage).not.toHaveBeenCalled();
    expect(onAiFromSelection.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
      topStripColor: chosenColor,
    });
  });

  it('performs no write and makes no network request of its own -- it only forwards the request', () => {
    const { container, onAiFromSelection } = mountReaderWithAi();
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);

    act(() => aiButton(container)!.click());

    expect(onAiFromSelection).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('disables itself and forwards nothing for a selection over the 4,000-character AI limit, without truncating it', () => {
    const longText = 'x'.repeat(4001);
    const { container, onAiFromSelection } = mountReaderWithAi({ pages: [{ pageNumber: 1, text: longText }], pageCount: 1 });
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 0, root.firstChild!, longText.length);
    finishSelectionOn(root);

    const button = aiButton(container)!;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('AI supports selections up to 4,000 characters');

    act(() => button.click());
    expect(onAiFromSelection).not.toHaveBeenCalled();
    // Note Post is unaffected -- the exact, untruncated selection stays there.
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
  });

  it('permits exactly 4,000 characters -- the boundary is inclusive', () => {
    const boundaryText = 'y'.repeat(4000);
    const { container, onAiFromSelection } = mountReaderWithAi({ pages: [{ pageNumber: 1, text: boundaryText }], pageCount: 1 });
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 0, root.firstChild!, boundaryText.length);
    finishSelectionOn(root);

    expect(aiButton(container)!.disabled).toBe(false);
  });
});

// ============================================================================
// PDF_SELECTION_TO_NOTE_1 -- one selection, one source-linked Note
// ============================================================================
//
// Research capture: select, press once, and an ordinary Note exists with exact
// provenance. No editor step, no AI, and no second selection model -- the
// request is the SAME exact-span request Note Post and Ask AI already build.

describe('saving a PDF selection as a Note', () => {
  function saveButton(container: HTMLElement): HTMLButtonElement | null {
    return container.querySelector('[data-knowledge-selection-save-note="true"]');
  }

  /** Selects "safety" -- page-relative [4,10) -- on page 1. */
  function selectSafety(container: HTMLElement) {
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 4, root.firstChild!, 10);
    finishSelectionOn(root);
  }

  /** Selects "PDF" -- page-relative [0,3) -- a DIFFERENT span on page 1. */
  function selectPdf(container: HTMLElement) {
    const root = pageRoot(container, 1);
    selectRange(root.firstChild!, 0, root.firstChild!, 3);
    finishSelectionOn(root);
  }

  /** A save whose fate the test decides. */
  function deferredSave() {
    const settle: { resolve?: () => void; reject?: (error: Error) => void } = {};
    const onSaveSelectionAsNote = vi.fn((_request: KnowledgeSourcePageRequest) => new Promise<void>((resolve, reject) => {
      settle.resolve = resolve;
      settle.reject = reject;
    }));
    return { onSaveSelectionAsNote, settle };
  }

  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('1: an editor with a valid selection is offered Save as Note', () => {
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onSaveSelectionAsNote: vi.fn(async () => {}),
    });

    // No selection, no action: this acts on a span, not on a page.
    expect(saveButton(container)).toBeNull();

    selectSafety(container);

    const button = saveButton(container)!;
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Save as Note');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Save selection on page 1 as a Note');
  });

  it('2: a viewer is offered no mutation control, and keeps the read actions it had', () => {
    const container = mountWith({
      documentId: 'doc-1',
      // Exactly what the drawer hands a read-only reader: no create, no save.
      onAddBoardAiContext: vi.fn(),
      onAiFromSelection: vi.fn(),
    });
    selectSafety(container);

    expect(saveButton(container), 'a viewer must not be offered a shared write').toBeNull();
    // Not "rendered disabled" -- absent, like every other capability here.
    expect(container.querySelector('[data-knowledge-selection-save-note]')).toBeNull();
    // The private read actions are untouched by this gate.
    expect(container.querySelector('[data-knowledge-selection-add-to-chat="true"]')).not.toBeNull();
    expect(selectionToolbar(container)).not.toBeNull();
  });

  it('3/4: one click forwards the exact captured span, and nothing else', async () => {
    const { onSaveSelectionAsNote, settle } = deferredSave();
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onSaveSelectionAsNote,
    });
    selectSafety(container);

    await act(async () => { saveButton(container)!.click(); });

    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(1);
    expect(onSaveSelectionAsNote.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
      topStripColor: null,
    });
    // The coordinates describe exactly what was selected, in the page's own
    // text -- the same comparison the server repeats against its stored page.
    expect(pages[0].text.slice(4, 10)).toBe('safety');

    // While it is in flight the action says so and cannot be pressed again.
    expect(saveButton(container)!.disabled).toBe(true);
    expect(saveButton(container)!.textContent).toBe('Saving…');

    await act(async () => { settle.resolve!(); });
    expect(saveButton(container)!.textContent).toBe('Saved');
    expect(saveButton(container)!.disabled).toBe(true);
  });

  it('5: a double click creates at most one Note', async () => {
    const { onSaveSelectionAsNote, settle } = deferredSave();
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onSaveSelectionAsNote,
    });
    selectSafety(container);

    // Both presses inside ONE act: the second lands before any state update
    // from the first could have rendered, which is what a real double click
    // does and what a state-only guard would miss.
    await act(async () => {
      const button = saveButton(container)!;
      button.click();
      button.click();
    });

    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(1);

    await act(async () => { settle.resolve!(); });
    // And a third press on a finished save is still not a second Note.
    await act(async () => { saveButton(container)!.click(); });
    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(1);
  });

  it('C: a new selection is armed again, and never inherits the old Saved state', async () => {
    const { onSaveSelectionAsNote, settle } = deferredSave();
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onSaveSelectionAsNote,
    });
    selectSafety(container);
    await act(async () => { saveButton(container)!.click(); });
    await act(async () => { settle.resolve!(); });
    expect(saveButton(container)!.textContent).toBe('Saved');

    // A DIFFERENT span on the same page: a different selection entirely.
    selectPdf(container);

    expect(saveButton(container)!.textContent, 'the new selection has never been saved').toBe('Save as Note');
    expect(saveButton(container)!.disabled).toBe(false);

    await act(async () => { saveButton(container)!.click(); });
    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(2);
    expect(onSaveSelectionAsNote.mock.calls[1][0]).toMatchObject({
      selection: { charStart: 0, charEnd: 3, selectedText: 'PDF' },
    });
  });

  it('E: a rejected save reports failure, claims nothing, and stays retryable', async () => {
    const { onSaveSelectionAsNote, settle } = deferredSave();
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onSaveSelectionAsNote,
    });
    selectSafety(container);

    await act(async () => { saveButton(container)!.click(); });
    await act(async () => { settle.reject!(new Error('source_link_failed')); });

    const button = saveButton(container)!;
    expect(button.textContent, 'a failed save must never read as Saved').toBe('Save failed — retry');
    expect(button.disabled, 'the host rolled its Note back, so retrying is safe').toBe(false);
    expect(button.getAttribute('data-knowledge-selection-save-state')).toBe('failed');

    await act(async () => { saveButton(container)!.click(); });
    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(2);
  });

  it('9: the existing Ask AI selection action is unchanged', () => {
    const onAiFromSelection = vi.fn();
    const container = mountWith({
      documentId: 'doc-1',
      onCreateNoteFromPage: vi.fn(),
      onAiFromSelection,
      onSaveSelectionAsNote: vi.fn(async () => {}),
    });
    selectSafety(container);

    const ai = selectionToolbar(container)!
      .querySelector('button[aria-label="Ask AI about the selected text"]') as HTMLButtonElement;
    expect(ai).not.toBeNull();
    act(() => ai.click());

    expect(onAiFromSelection).toHaveBeenCalledTimes(1);
    expect(onAiFromSelection.mock.calls[0][0]).toEqual({
      sourceDocumentId: 'doc-1',
      originalFilename: 'EMG_checklist.pdf',
      pageNumber: 1,
      pageText: pages[0].text,
      selection: { charStart: 4, charEnd: 10, selectedText: 'safety' },
      topStripColor: null,
    });
    // Note Post still opens the editor path it always did.
    expect(createNoteButton(container, 1).textContent).toBe('Note Post');
  });

  it('the save identity is the selection itself -- no counter, clock or random', () => {
    const base = { pageNumber: 1, charStart: 4, charEnd: 10, selectedText: 'safety' };
    const key = knowledgeSelectionSaveIdentity('doc-1', base);
    expect(knowledgeSelectionSaveIdentity('doc-1', base), 'the same selection is the same save').toBe(key);
    expect(knowledgeSelectionSaveIdentity('doc-1', { ...base, charEnd: 9 })).not.toBe(key);
    expect(knowledgeSelectionSaveIdentity('doc-1', { ...base, pageNumber: 2 })).not.toBe(key);
    expect(knowledgeSelectionSaveIdentity('doc-2', base)).not.toBe(key);
  });
});
