// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer from './BoardAiChatDrawer';

/**
 * A CITATION WHOSE SOURCE HAS BEEN DELETED -- followups item 15.
 *
 * The stored citation is never rewritten when its document is deleted. It says
 * what the answer used, which is still true, and it is inside the provenance
 * HMAC over the message, so editing it would invalidate the signature of the
 * very row it was trying to tidy.
 *
 * What the reader needs instead is to be TOLD. And the check has to happen
 * before navigation, because navigating hands the dock to the reader and CLOSES
 * this drawer: a dead citation used to cost the user their conversation and
 * hand them an empty reader in exchange.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = 'ttttttt1-1111-4111-8111-111111111111';
const LIVE_DOC = '44444444-4444-4444-8444-444444444444';
const DEAD_DOC = '55555555-5555-4555-8555-555555555555';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
/** Which documents the board still has. Mutated per test. */
let existingDocumentIds: string[];
/** Set when the knowledge list request should fail rather than answer. */
let knowledgeListThrows: boolean;
let onOpenCitation: ReturnType<typeof vi.fn>;

const citation = (knowledgeDocumentId: string, pageNumber: number, label: string) => ({
  type: 'knowledge-page', knowledgeDocumentId, pageNumber, label,
});

function stubRoutes(items: readonly Record<string, unknown>[]) {
  existingDocumentIds = [LIVE_DOC];
  knowledgeListThrows = false;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/knowledge')) {
      if (knowledgeListThrows) throw new Error('offline');
      return json({ documents: existingDocumentIds.map((id) => ({ id, processingStatus: 'ready' })) });
    }
    if (url.includes('threadId=')) {
      return json({
        messages: [
          { id: 'u1', role: 'user', content: 'question', createdAt: 'n' },
          {
            id: 'a1', role: 'assistant', content: 'answer',
            provider: 'deepseek', model: 'deepseek-flash', createdAt: 'n',
            citations: { version: 1, items },
          },
        ],
      });
    }
    if (init?.method === 'GET' || init === undefined) {
      return json({ threads: [{ id: THREAD_ID, title: 'a thread', createdAt: 'n', updatedAt: 'n' }] });
    }
    return json({ threads: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mount(items: readonly Record<string, unknown>[]) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubRoutes(items);
  onOpenCitation = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardAiChatDrawer
        boardId={BOARD_ID}
        isOpen
        onClose={vi.fn()}
        draftContext={[]}
        onDraftContextChange={vi.fn()}
        onOpenCitation={onOpenCitation}
      />,
    );
  });
  await settle();
  return host;
}

const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

const chips = () => Array.from(host.querySelectorAll('[data-board-ai-chat-citation]')) as HTMLElement[];
const chipFor = (documentId: string) => chips()
  .find((chip) => chip.getAttribute('data-board-ai-chat-citation-document') === documentId
    || chip.getAttribute('data-board-ai-chat-citation')?.includes(documentId));

const click = async (element: HTMLElement) => {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

describe('a citation whose document still exists', () => {
  it('opens it, exactly as before', async () => {
    await mount([citation(LIVE_DOC, 3, 'handbook.pdf — page 3')]);
    const chip = chipFor(LIVE_DOC);
    expect(chip).toBeTruthy();

    await click(chip!);

    expect(onOpenCitation).toHaveBeenCalledWith({ knowledgeDocumentId: LIVE_DOC, pageNumber: 3 });
    expect(host.querySelector('[data-board-ai-chat-citation-gone]')).toBeNull();
  });
});

describe('a citation whose document has been deleted', () => {
  it('does NOT navigate, so the drawer is not closed for an empty reader', async () => {
    await mount([citation(DEAD_DOC, 2, 'removed.pdf — page 2')]);
    await click(chipFor(DEAD_DOC)!);
    expect(onOpenCitation).not.toHaveBeenCalled();
  });

  it('marks that chip as gone, and says so in its title', async () => {
    await mount([citation(DEAD_DOC, 2, 'removed.pdf — page 2')]);
    await click(chipFor(DEAD_DOC)!);

    const gone = host.querySelector('[data-board-ai-chat-citation-gone="true"]') as HTMLElement | null;
    expect(gone).toBeTruthy();
    expect(gone!.textContent).toContain('(deleted)');
    expect(gone!.getAttribute('title')).toContain('deleted');
    // It is no longer a button: there is nothing to press.
    expect(gone!.tagName).toBe('SPAN');
  });

  it('keeps the citation ITSELF -- the label still names what the answer used', async () => {
    await mount([citation(DEAD_DOC, 2, 'removed.pdf — page 2')]);
    await click(chipFor(DEAD_DOC)!);
    const gone = host.querySelector('[data-board-ai-chat-citation-gone="true"]') as HTMLElement;
    // The answer cited this page and that remains a true statement about the
    // past. Only the ability to open it is gone.
    expect(gone.textContent).toContain('removed.pdf');
  });

  it('marks only the dead citation, leaving a live sibling clickable', async () => {
    await mount([
      citation(DEAD_DOC, 2, 'removed.pdf — page 2'),
      citation(LIVE_DOC, 3, 'handbook.pdf — page 3'),
    ]);
    await click(chipFor(DEAD_DOC)!);

    expect(host.querySelectorAll('[data-board-ai-chat-citation-gone]').length).toBe(1);
    await click(chipFor(LIVE_DOC)!);
    expect(onOpenCitation).toHaveBeenCalledWith({ knowledgeDocumentId: LIVE_DOC, pageNumber: 3 });
  });

  it('marks EVERY page cited from that document, from a single click', async () => {
    // The gone state is keyed by DOCUMENT, not by citation identity, and this
    // is why: one answer commonly cites three pages of the same PDF. Keying it
    // per citation would leave the other two looking openable, and the user
    // would discover the deletion once per chip.
    await mount([
      citation(DEAD_DOC, 2, 'removed.pdf — page 2'),
      citation(DEAD_DOC, 7, 'removed.pdf — page 7'),
    ]);
    expect(chips().length).toBe(2);

    await click(chipFor(DEAD_DOC)!);

    expect(host.querySelectorAll('[data-board-ai-chat-citation-gone="true"]').length).toBe(2);
    // And one probe answered for both.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/knowledge')).length).toBe(1);
  });
});

describe('an unanswered probe is not evidence of deletion', () => {
  it('navigates anyway when the list request fails', async () => {
    await mount([citation(DEAD_DOC, 2, 'removed.pdf — page 2')]);
    knowledgeListThrows = true;

    await click(chipFor(DEAD_DOC)!);

    // The reader's own error is a better outcome than this drawer declaring a
    // source dead on the strength of a failed request.
    expect(onOpenCitation).toHaveBeenCalledWith({ knowledgeDocumentId: DEAD_DOC, pageNumber: 2 });
    expect(host.querySelector('[data-board-ai-chat-citation-gone]')).toBeNull();
  });
});
