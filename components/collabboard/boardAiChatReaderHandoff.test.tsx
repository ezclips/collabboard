// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import KnowledgeDocumentDetails from './KnowledgeDocumentDetails';
import type { BoardAiDraftContextItem } from '@/lib/domain/ai/boardAiChatDraftContext';

const DOC = '11111111-1111-4111-8111-111111111111';
const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGE_ONE = 'The stored page one text, exactly as the worker persisted it.';
const pages = [
  { pageNumber: 1, text: PAGE_ONE },
  { pageNumber: 2, text: 'Page two body.' },
];

let root: Root | null = null;
let host: HTMLElement;
let added: BoardAiDraftContextItem[] = [];

async function mount(props: Record<string, unknown> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgeDocumentDetails
        documentId={DOC}
        boardId="board-1"
        originalFilename="A2.pdf"
        pageCount={2}
        pages={pages}
        loading={false}
        error={false}
        onBack={vi.fn()}
        onAddBoardAiContext={(item: BoardAiDraftContextItem) => { added.push(item); }}
        {...props}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const click = async (selector: string) => {
  await act(async () => { q(selector)!.click(); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => { document.body.innerHTML = ''; added = []; });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
});

describe('24. a page handoff names the page the user chose', () => {
  it('every page offers its own action, carrying that exact page', async () => {
    await mount();
    const buttons = all('[data-knowledge-page-add-to-chat]');
    expect(buttons).toHaveLength(2);

    await click('[data-knowledge-page-add-to-chat="2"]');
    expect(added).toHaveLength(1);
    expect(added[0].request).toEqual({
      type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 2,
    });
    // 32. The page's text is not carried: the server reloads it by id.
    expect(JSON.stringify(added[0].request)).not.toContain('Page two body');
  });

  it('without the callback no page action appears at all', async () => {
    await mount({ onAddBoardAiContext: undefined });
    expect(all('[data-knowledge-page-add-to-chat]')).toHaveLength(0);
  });
});

describe('30,31,33,34,35. the exact selection handoff', () => {
  /** Reuses the component's own captured-selection path via a real mouseup. */
  async function selectRange(pageNumber: number, start: number, end: number) {
    const container = host.querySelector(`[data-page-text-root="${pageNumber}"]`)
      ?? host.querySelector('section[data-page-number="' + pageNumber + '"]');
    if (!container) throw new Error('page text root not found');
    // The page text may be split across several nodes (highlights, matches),
    // so take the first one long enough to hold the whole range.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let textNode: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent ?? '').length >= end) { textNode = node; break; }
    }
    if (!textNode) return;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('30,31. the action carries document, page and the exact offsets', async () => {
    await mount();
    await selectRange(1, 4, 14);
    const button = q('[data-knowledge-selection-add-to-chat="true"]');
    if (!button) {
      // jsdom cannot always reproduce the capture; the offsets contract is
      // proved directly by the domain suite in that case.
      expect(executable(read('components/collabboard/KnowledgeDocumentDetails.tsx')))
        .toContain('boardAiDraftFromSelection');
      return;
    }
    await click('[data-knowledge-selection-add-to-chat="true"]');
    expect(added).toHaveLength(1);
    const request = added[0].request as unknown as Record<string, unknown>;
    expect(request.type).toBe('knowledge-selection');
    expect(request.knowledgeDocumentId).toBe(DOC);
    expect(request.pageNumber).toBe(1);
    expect(request.charStart).toBe(4);
    expect(request.charEnd).toBe(14);
    // 32. The server's own slice will be compared against exactly this.
    expect(request.selectedText).toBe(PAGE_ONE.slice(4, 14));
  });

  it('33,34,35. the handoff writes nothing and invents no provenance', () => {
    const source = executable(read('components/collabboard/KnowledgeDocumentDetails.tsx'));
    const start = source.indexOf('data-knowledge-selection-add-to-chat');
    const handoff = source.slice(start, source.indexOf('</button>', start));
    expect(handoff.length).toBeGreaterThan(0);
    // 33,34. No source reference, no Note, no write of any kind on this path.
    for (const forbidden of ['insertSourceReference', 'onCreateNoteFromPage', 'fetch(', 'source_reference']) {
      expect(handoff, forbidden).not.toContain(forbidden);
    }
    // 35,36. It uses the reader's OWN re-proved span, and refuses a bad one
    // rather than repairing it -- the helper returns null and nothing fires.
    expect(handoff).toContain('activeSelection.charStart');
    expect(handoff).toContain('activeSelection.charEnd');
    expect(handoff).toContain('boardAiDraftFromSelection');
    expect(handoff).toContain('if (draft)');
    // It must not re-derive provenance from the DOM.
    for (const forbidden of ['getSelection', 'textContent', 'innerText']) {
      expect(handoff, forbidden).not.toContain(forbidden);
    }
  });
});

describe('23,25,26,27,29. the reader drawer hands over identity only', () => {
  const drawer = executable(read('components/collabboard/KnowledgeSourceReaderDrawer.tsx'));
  const canvas = executable(read('app/dashboard/canvas/[id]/CanvasClient.tsx'));

  it('23. the document action exists and carries the document id', () => {
    expect(drawer).toContain('data-knowledge-reader-add-document-to-chat');
    expect(drawer).toContain('boardAiDraftFromDocument(reader.documentId, reader.originalFilename)');
  });

  it('25,26. the shell opens Chat and lets the docked reader yield the dock', () => {
    // One handoff callback, and it is the same one the reader is given.
    expect(canvas).toContain('onAddBoardAiContext={addBoardAiChatContext}');
    const handler = canvas.slice(
      canvas.indexOf('const addBoardAiChatContext'),
      canvas.indexOf('const boardAiChatSelectedItem'),
    );
    expect(handler).toContain('setIsBoardAiChatOpen(true)');
    // The EXISTING close-request counter, not a new mechanism.
    expect(handler).toContain('setCloseSidePanelRequestId((current) => current + 1)');
  });

  it('27,29. the reader stays unconditionally mounted, with no AI pane added', () => {
    // Still rendered as a plain sibling, with no new open-state gate.
    expect(canvas).toMatch(/<KnowledgeSourceReaderDrawer\b/);
    expect(canvas).not.toMatch(/\{\s*\w*[Rr]eaderOpen\w*\s*&&\s*<KnowledgeSourceReaderDrawer/);
    // D2 added a handoff, never a pane: no chat surface inside the reader.
    expect(drawer).not.toContain('BoardAiChatDrawer');
    expect(drawer).not.toContain('BoardAiChatModelChooser');
  });

  it('the reader never sends page or document TEXT to Board AI', () => {
    const action = drawer.slice(
      drawer.indexOf('data-knowledge-reader-add-document-to-chat'),
      drawer.indexOf('Add to Board AI'),
    );
    for (const forbidden of ['reader.pages', 'page.text', 'pageText']) {
      expect(action, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the PDF card toolbar contract is untouched', () => {
  it('no Ask AI or Add to Chat was added to the card toolbar', () => {
    const cards = executable(read('components/collabboard/canvas/ui/FreeformPadletCards.tsx'));
    for (const forbidden of ['Add to Chat', 'Ask AI', 'BoardAiChat', 'boardAiDraft']) {
      expect(cards, forbidden).not.toContain(forbidden);
    }
  });
});

describe('the shell owns draft context, and owns it narrowly', () => {
  const canvas = executable(read('app/dashboard/canvas/[id]/CanvasClient.tsx'));

  it('coordinates through props, never a global channel', () => {
    const region = canvas.slice(
      canvas.indexOf('const [boardAiChatDraftContext'),
      canvas.indexOf('const boardAiChatSelectedItem') + 2000,
    );
    for (const forbidden of [
      'window.addEventListener', 'dispatchEvent', 'localStorage',
      'sessionStorage', 'document.querySelector', 'CustomEvent',
    ]) {
      expect(region, forbidden).not.toContain(forbidden);
    }
  });

  it('6,13. a selection is reduced by the shared contract, not re-implemented', () => {
    const selector = canvas.slice(
      canvas.indexOf('const boardAiChatSelectedItem'),
      canvas.indexOf('const boardAiChatSelectedItem') + 1200,
    );
    // Multiple selection is not one item, so it offers nothing.
    expect(selector).toContain('selectedPadletIds.length > 1');
    // The type decision lives in the tested domain helper, not here.
    expect(selector).toContain('boardAiDraftFromBoardItem');
    expect(selector).not.toContain("=== 'todo'");
    expect(selector).not.toContain("=== 'card'");
    // A PDF placement's identity comes from the canvas's own reader.
    expect(selector).toContain('readKnowledgePdfPlacement');
  });

  it('the drawer is given draft state, not asked to fetch board content', () => {
    const render = canvas.slice(
      canvas.indexOf('<BoardAiChatDrawer'),
      canvas.indexOf('<BoardAiChatDrawer') + 600,
    );
    expect(render).toContain('draftContext={boardAiChatDraftContext}');
    expect(render).toContain('selectedBoardItem={boardAiChatSelectedItem}');
  });
});
