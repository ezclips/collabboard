// @vitest-environment jsdom
//
// PATCH-193. The container window's child cards and their source affordances:
// a PDF child carries its board (so its page requests are board-scoped), and a
// source link or PDF open action closes the window BEFORE handing the request
// to the canvas, instead of opening the reader behind the still-open window.
//
// Follows this repo's established mount convention (react-dom/client + act,
// no @testing-library/react), copied from the sibling comment-permission file.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import {
  KnowledgeSourceReferenceProvider,
} from '../KnowledgeSourceReferenceContext';
import { KnowledgePdfOpenProvider } from '../KnowledgePdfCanvasSurface';
import ContainerEditor from './ContainerEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!('IntersectionObserver' in globalThis)) {
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
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
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function actFlush() {
  await act(async () => { await flush(); });
}

const BOARD_ID = 'board-9';
const NOTE_ID = 'note-child';

function sourceReference(): SourceReference {
  return {
    id: 'ref-1',
    targetPadletId: NOTE_ID,
    sourceDocumentId: 'doc-1',
    pageStart: 2,
    pageEnd: 2,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    region: null,
    locator: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as SourceReference;
}

const noteChild = () => ({
  id: NOTE_ID,
  title: 'A Note',
  content: '<p>a note body</p>',
  type: 'note',
  board_id: BOARD_ID,
});

const pdfChild = () => ({
  id: 'pdf-child',
  title: 'A PDF',
  content: '',
  type: 'file',
  board_id: BOARD_ID,
  metadata: {
    knowledgeDocumentId: 'doc-1',
    knowledgeProcessingStatus: 'ready',
    knowledgeOriginalFilename: 'spec.pdf',
    knowledgeDisplayMode: 'preview',
  },
});

const editor = (child: unknown, extra: Record<string, unknown> = {}) => (
  <ContainerEditor
    isOpen
    onSave={vi.fn()}
    onClose={vi.fn()}
    childPadlets={[child as never]}
    {...extra}
  />
);

describe('PATCH-193: a PDF child is board-scoped in the container window', () => {
  it("its page request carries the child's board_id, never the string undefined", async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      return {
        status: 200,
        ok: true,
        json: async () => ({ pages: [] }),
      } as unknown as Response;
    }));

    const c = mount(editor(pdfChild()));
    // The placement renders the one shared PDF surface.
    expect(c.querySelector('[data-knowledge-pdf-surface="true"]')).not.toBeNull();

    await actFlush();
    expect(urls.some((url) => url.includes(`/api/boards/${BOARD_ID}/`))).toBe(true);
    expect(urls.some((url) => url.includes('/undefined/'))).toBe(false);
  });
});

describe('PATCH-193: the window closes before a source opens', () => {
  it("a Note's Source marker calls the window close THEN the parent opener", () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push('close'));
    const onOpenSource = vi.fn(() => order.push('open-source'));

    const c = mount(
      <KnowledgeSourceReferenceProvider
        index={new Map([[NOTE_ID, [sourceReference()]]])}
        onOpenSourceReference={onOpenSource}
      >
        {editor(noteChild(), { onClose }) as React.ReactElement}
      </KnowledgeSourceReferenceProvider>,
    );

    const marker = c.querySelector('button[data-knowledge-source-open="true"]') as HTMLButtonElement | null;
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toContain('Source · p. 2');

    click(marker!);
    expect(order).toEqual(['close', 'open-source']);
    expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ pageStart: 2 }));
  });

  it("with no parent opener the marker is the inert label, not a button", () => {
    const c = mount(
      <KnowledgeSourceReferenceProvider index={new Map([[NOTE_ID, [sourceReference()]]])}>
        {editor(noteChild()) as React.ReactElement}
      </KnowledgeSourceReferenceProvider>,
    );

    expect(c.querySelector('button[data-knowledge-source-open="true"]')).toBeNull();
    const label = c.querySelector('[data-knowledge-source-marker="true"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Source · p. 2');
  });

  it("a PDF child's Open action calls the window close THEN the parent PDF opener", () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push('close'));
    const onOpenDocument = vi.fn(() => order.push('open-pdf'));

    const c = mount(
      <KnowledgePdfOpenProvider onOpenDocument={onOpenDocument}>
        {editor(pdfChild(), { onClose }) as React.ReactElement}
      </KnowledgePdfOpenProvider>,
    );

    const open = c.querySelector('button[data-knowledge-pdf-action="open"]') as HTMLButtonElement | null;
    expect(open).not.toBeNull();

    click(open!);
    expect(order).toEqual(['close', 'open-pdf']);
    expect(onOpenDocument).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-1', presentation: 'workspace' }),
    );
  });
});
