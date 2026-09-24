// @vitest-environment jsdom
//
// PATCH-177 -- selecting text directly on the PDF page.
//
// The pdf.js text layer is MOCKED to a plain div carrying the layer attribute,
// so no pdf.js runs in jsdom. Everything else is the reader's real component.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

/**
 * The layer's text differs from `page.text` in spacing only, which is exactly
 * the case the matcher exists for: the words agree, the offsets do not.
 */
const LAYER_TEXT: Record<number, string> = {
  1: 'Literal [brackets]',
  2: 'second page words',
};

vi.mock('@/components/collabboard/KnowledgePdfPageTextLayer', () => ({
  default: ({ pageNumber }: { pageNumber: number }) => (
    <div data-knowledge-page-text-layer={pageNumber}>
      <span>{LAYER_TEXT[pageNumber] ?? ''}</span>
    </div>
  ),
}));

/** The page image, mocked to a plain <img> so jsdom can lay it out. */
vi.mock('@/components/collabboard/KnowledgeDocumentPageImage', () => ({
  default: () => <img alt="" data-test-page-image="true" />,
}));

const pages = [
  { pageNumber: 1, text: 'PDF safety PDF\nLiteral [brackets] and (parentheses).', widthPoints: 595, heightPoints: 842, rotation: 0 },
  { pageNumber: 2, text: 'pdf appears on the second page.', widthPoints: 595, heightPoints: 842, rotation: 0 },
];

/** Gives a jsdom <img> the layout a browser would have measured (A4 portrait). */
function layOutImage(image: HTMLImageElement) {
  const define = (k: string, v: unknown) => Object.defineProperty(image, k, { value: v, configurable: true });
  define('complete', true);
  define('naturalWidth', 1000);
  define('naturalHeight', 1415);
  define('clientLeft', 0);
  define('clientTop', 0);
  define('clientWidth', 500);
  define('clientHeight', 700);
  define('offsetLeft', 0);
  define('offsetTop', 0);
  image.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 500, height: 700, right: 500, bottom: 700, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
}

/** Lays out every page image and fires the load event the selector listens for. */
function readyImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'));
  for (const image of images) layOutImage(image);
  act(() => { for (const image of images) image.dispatchEvent(new Event('load', { bubbles: false })); });
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
  originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  window.getSelection()?.removeAllRanges();
});

function mountWith(props: Partial<React.ComponentProps<typeof KnowledgeDocumentDetails>> = {}) {
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
        boardId="board-1"
        documentId="doc-1"
        {...props}
      />,
    );
  });
  readyImages(host);
  return host;
}

/** Selects `needle` inside the fake layer's text node for a page. */
function selectInLayer(container: HTMLElement, pageNumber: number, needle: string) {
  const layer = container.querySelector(`[data-knowledge-page-text-layer="${pageNumber}"]`)!;
  const textNode = layer.querySelector('span')!.firstChild!;
  const full = textNode.textContent ?? '';
  const start = full.indexOf(needle);
  expect(start, `needle "${needle}" not in layer text`).toBeGreaterThanOrEqual(0);
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + needle.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => { layer.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
}

function selectionToolbar(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-knowledge-selection-toolbar]');
}

describe('PATCH-177 -- selecting on the PDF page', () => {
  it('makes the selection actions appear, and the captured offsets index page.text', () => {
    const onSaveSelectionAsNote = vi.fn<(request: KnowledgeSourcePageRequest) => Promise<void>>(async () => {});
    const container = mountWith({ onSaveSelectionAsNote, onCreateNoteFromPage: vi.fn() });

    selectInLayer(container, 1, 'Literal [brackets]');

    // The toolbar is there, naming the page the selection lives on.
    const toolbar = selectionToolbar(container)!;
    expect(toolbar).not.toBeNull();
    expect(
      toolbar.querySelector('[aria-label="Create Note from selection on page 1"]'),
    ).not.toBeNull();

    // Save as Note emits the request, whose offsets index the STORED page text.
    const save = toolbar.querySelector('[data-knowledge-selection-save-note="true"]') as HTMLButtonElement;
    act(() => { save.click(); });
    expect(onSaveSelectionAsNote).toHaveBeenCalledTimes(1);
    const request = onSaveSelectionAsNote.mock.calls[0][0];
    expect(request.selection!.selectedText).toBe('Literal [brackets]');
    expect(pages[0].text.slice(request.selection!.charStart, request.selection!.charEnd))
      .toBe('Literal [brackets]');
  });

  it('shows the miss notice and no actions when the selection cannot be matched', () => {
    const container = mountWith({ onCreateNoteFromPage: vi.fn() });

    // The layer text for page 1 is mocked, so fabricate a selection whose words
    // are not in page.text by selecting a range over a node we control.
    const layer = container.querySelector('[data-knowledge-page-text-layer="1"]')!.querySelector('span')!;
    // Replace the layer's text with words absent from page.text, then select.
    act(() => { layer.textContent = 'zzz unmatched words'; });
    const textNode = layer.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'zzz unmatched'.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => { layer.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(container.querySelector('[data-knowledge-layer-selection-miss]')).not.toBeNull();
    expect(selectionToolbar(container)).toBeNull();
  });

  it('renders no layer while region mode is on', () => {
    const container = mountWith({ onCreateNoteFromPage: vi.fn() });
    expect(container.querySelector('[data-knowledge-page-text-layer]')).not.toBeNull();

    const selectArea = container.querySelector('[data-knowledge-viewer-action="select-area"]') as HTMLButtonElement;
    act(() => { selectArea.click(); });
    expect(container.querySelector('[data-knowledge-page-text-layer]')).toBeNull();
  });

  it('a selection spanning the layer and the text paragraph captures nothing', () => {
    const container = mountWith({ onCreateNoteFromPage: vi.fn() });
    const layerSpan = container.querySelector('[data-knowledge-page-text-layer="1"]')!.querySelector('span')!;
    const paragraph = container.querySelector('[data-knowledge-page-text-root="1"]')!;

    const range = document.createRange();
    range.setStart(layerSpan.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 5);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => { layerSpan.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });

    expect(selectionToolbar(container)).toBeNull();
    expect(container.querySelector('[data-knowledge-layer-selection-miss]')).toBeNull();
  });
});
