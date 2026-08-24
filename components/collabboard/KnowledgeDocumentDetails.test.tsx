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
    for (const forbidden of ['charStart', 'charEnd', 'locator', 'bbox', 'quoteHash']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
