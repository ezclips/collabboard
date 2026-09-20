// @vitest-environment jsdom
//
// Stage 1 -- a citation's RANGE, followed rather than read.
//
// The reader's own AI panel is the ONLY way a citation is followed in the
// focused workspace, and it dropped charStart/charEnd. The drawer's main suite
// could not have caught it: that suite proves the reader RENDERS a range it is
// given, and it passed throughout while this hand-off was losing the locator.
//
// So this file drives the panel's onOpenCitation and asserts what leaves the
// drawer. BoardAiChatDrawer is stubbed rather than driven: producing a real
// ranged citation needs a thread, a model turn and a stored envelope, none of
// which are what is under test here -- the question is only whether the
// drawer's handler forwards the range it is handed, in both hosts.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_A = 'aaaaaaaa-1111-4111-8111-111111111111';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: BOARD_ID }),
}));

vi.mock('@/lib/collabboard/library', () => ({
  fetchLibraryItems: vi.fn(async () => []),
}));

/**
 * The stub. It renders one button per citation shape the real panel can emit,
 * so a test clicks the shape it is interested in.
 */
vi.mock('@/components/collabboard/BoardAiChatDrawer', () => ({
  __esModule: true,
  default: ({ onOpenCitation }: {
    onOpenCitation?: (request: {
      knowledgeDocumentId: string;
      pageNumber?: number;
      charStart?: number;
      charEnd?: number;
    }) => void;
  }) => (
    <div data-stub-board-ai="true">
      <button
        data-stub-citation="range"
        onClick={() => onOpenCitation?.({
          knowledgeDocumentId: 'aaaaaaaa-1111-4111-8111-111111111111', charStart: 120, charEnd: 340,
        })}
      >
        ranged citation
      </button>
      <button
        data-stub-citation="page"
        onClick={() => onOpenCitation?.({
          knowledgeDocumentId: 'aaaaaaaa-1111-4111-8111-111111111111', pageNumber: 2,
        })}
      >
        page citation
      </button>
      <button
        data-stub-citation="half"
        onClick={() => onOpenCitation?.({
          knowledgeDocumentId: 'aaaaaaaa-1111-4111-8111-111111111111', charStart: 120,
        })}
      >
        half a range
      </button>
    </div>
  ),
}));

import KnowledgeSourceReaderDrawer from './KnowledgeSourceReaderDrawer';
import { KnowledgeSourceReferenceProvider } from './KnowledgeSourceReferenceContext';
import { buildKnowledgeSourceReferenceIndex } from '@/lib/domain/knowledge/knowledgeSourceReferenceIndex';
import { buildKnowledgeSourceBacklinkIndex } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import { buildKnowledgeSourceNoteSummaryIndex } from '@/lib/domain/knowledge/knowledgeSourceNoteSummary';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let root: Root | null = null;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (/\/ai\/chat/.test(String(input))) return jsonResponse({ threads: [], messages: [] });
    return jsonResponse({
      document: { id: SOURCE_A, originalFilename: 'lesson.pdf', pageCount: 2, kind: 'pdf' },
      pages: [{ pageNumber: 1, text: 'Page one.' }, { pageNumber: 2, text: 'Page two.' }],
    });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
  }
  root = null;
  globalThis.fetch = originalFetch;
});

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function openReader(presentation: 'side-panel' | 'workspace') {
  const onOpenKnowledgeDocument = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgeSourceReferenceProvider
        index={buildKnowledgeSourceReferenceIndex([])}
        backlinks={buildKnowledgeSourceBacklinkIndex([], [])}
        noteSummaries={buildKnowledgeSourceNoteSummaryIndex([], [])}
      >
        <KnowledgeSourceReaderDrawer
          {...({
            documentOpenRequest: { requestId: 1, sourceDocumentId: SOURCE_A, pageNumber: 1 },
            presentation,
            onOpenBacklinkTarget: vi.fn(),
            onCreateNoteFromPage: vi.fn(),
            onOpenKnowledgeDocument,
            boardAiDraftContextByDocumentId: {},
            onBoardAiDraftContextChange: vi.fn(),
            // The focused workspace's panel is CONTROLLED by the board, so it
            // is opened by prop here; the docked host owns its own and is
            // opened by its dock button below. Two hosts, one handler.
            ...(presentation === 'workspace'
              ? { workspaceRightPanel: 'ai', onWorkspaceRightPanelChange: vi.fn() }
              : {}),
          } as unknown as React.ComponentProps<typeof KnowledgeSourceReaderDrawer>)}
        />
      </KnowledgeSourceReferenceProvider>,
    );
  });
  await settle();

  // The stub only exists once the AI panel is open.
  if (presentation !== 'workspace') {
    const dock = document.querySelector('[data-pdf-workspace-dock="ai"]') as HTMLButtonElement;
    expect(dock).not.toBeNull();
    await act(async () => { dock.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
  }
  expect(document.querySelector('[data-stub-board-ai="true"]')).not.toBeNull();

  return onOpenKnowledgeDocument;
}

async function clickCitation(shape: 'range' | 'page' | 'half') {
  const button = document.querySelector('[data-stub-citation="' + shape + '"]') as HTMLButtonElement;
  expect(button).not.toBeNull();
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}

describe('Stage 1. the reader AI panel forwards a citation range', () => {
  it.each(['side-panel', 'workspace'] as const)(
    'carries charStart and charEnd out of the %s host',
    async (presentation) => {
      const onOpenKnowledgeDocument = await openReader(presentation);
      await clickCitation('range');

      expect(onOpenKnowledgeDocument).toHaveBeenCalledTimes(1);
      expect(onOpenKnowledgeDocument.mock.calls[0][0]).toMatchObject({
        documentId: SOURCE_A,
        charStart: 120,
        charEnd: 340,
        presentation,
        revealSource: true,
      });
      // A pageless citation names no page. A synthetic one would collapse every
      // passage of the document onto a single identity.
      expect(onOpenKnowledgeDocument.mock.calls[0][0]).not.toHaveProperty('pageNumber');
    },
  );

  it('a page citation is unchanged, and carries no range', async () => {
    const onOpenKnowledgeDocument = await openReader('side-panel');
    await clickCitation('page');

    const request = onOpenKnowledgeDocument.mock.calls[0][0];
    expect(request).toMatchObject({ documentId: SOURCE_A, pageNumber: 2 });
    expect(request).not.toHaveProperty('charStart');
    expect(request).not.toHaveProperty('charEnd');
  });

  it('half a range is dropped, not passed on as a partial locator', async () => {
    // Both halves or neither: a start without an end locates nothing, and
    // deciding what it "probably meant" is not this handler's business.
    const onOpenKnowledgeDocument = await openReader('workspace');
    await clickCitation('half');

    const request = onOpenKnowledgeDocument.mock.calls[0][0];
    expect(request).toMatchObject({ documentId: SOURCE_A });
    expect(request).not.toHaveProperty('charStart');
    expect(request).not.toHaveProperty('charEnd');
  });
});
