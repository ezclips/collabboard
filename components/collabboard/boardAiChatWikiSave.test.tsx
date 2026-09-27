// @vitest-environment jsdom
//
// PATCH-197. The "Save to wiki" button on a stored Board AI answer: when it
// appears, and what New page / Add to page do.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer from './BoardAiChatDrawer';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = 'ttttttt1-1111-4111-8111-111111111111';
const PAGE_ID = 'ppppppp1-1111-4111-8111-111111111111';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let root: Root | null = null;
let host: HTMLElement;
let calls: { url: string; method: string; body: unknown }[];
let createStatus: number;
let proposalStatus: number;

function stubRoutes() {
  calls = [];
  // createStatus / proposalStatus are set in beforeEach, so a test can pick one
  // BEFORE mount without this reset clobbering it.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/proposals')) {
      if (proposalStatus !== 201) return json({ error: 'no' }, proposalStatus);
      return json({ proposal: { id: 'prop-1', content: 'added', sources: [], basedOnContent: '', createdAt: 't' } }, 201);
    }
    if (url.endsWith(`/wiki`) && method === 'POST') {
      if (createStatus !== 201) return json({ error: 'no' }, createStatus);
      return json({ page: { id: PAGE_ID, slug: 's', title: 'New page' } }, 201);
    }
    if (url.endsWith('/wiki') && method === 'GET') {
      return json({ pages: [{ id: PAGE_ID, slug: 's', title: 'Existing page', updatedAt: 'u', sourceCount: 0 }] });
    }
    if (url.includes('threadId=')) {
      return json({ messages: [
        { id: 'u1', role: 'user', content: 'What is the oil plan?', createdAt: 'n' },
        { id: 'a1', role: 'assistant', content: 'The oil plan is here.', provider: 'deepseek', model: 'm', createdAt: 'n', citations: { version: 1, items: [] } },
      ] });
    }
    if (method === 'GET') return json({ threads: [{ id: THREAD_ID, title: 'a thread', createdAt: 'n', updatedAt: 'n' }] });
    return json({});
  }));
}

async function mount(props: Record<string, unknown> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubRoutes();
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
        onOpenCitation={vi.fn()}
        {...props}
      />,
    );
  });
  await settle();
  return host;
}

const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};
const wikiButton = () => host.querySelector('[data-board-ai-chat-action="save-wiki"]') as HTMLButtonElement | null;

beforeEach(() => {
  document.body.innerHTML = '';
  createStatus = 201;
  proposalStatus = 201;
});
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

describe('PATCH-197 the Save to wiki button', () => {
  it('is absent for a viewer (no capability)', async () => {
    await mount({ canSaveAssistantToWiki: false, onOpenWikiWithProposal: vi.fn() });
    expect(wikiButton()).toBeNull();
  });

  it('is absent with no open handler even when the capability is present', async () => {
    await mount({ canSaveAssistantToWiki: true });
    expect(wikiButton()).toBeNull();
  });

  it('is shown for a stored answer with the capability and an opener', async () => {
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal: vi.fn() });
    const button = wikiButton();
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Save to wiki');
  });

  it('New page: creates the page, then the proposal, then opens the wiki with both', async () => {
    const onOpenWikiWithProposal = vi.fn();
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal });

    await click(wikiButton()!);
    // The popover is open with the question prefilled.
    const input = host.querySelector('[aria-label="New wiki page title"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('What is the oil plan?');

    await click(host.querySelector('[data-board-ai-chat-wiki-create="true"]') as HTMLElement);
    await settle();

    // Create, then propose, in that order.
    const create = calls.find((call) => call.url.endsWith('/wiki') && call.method === 'POST');
    const propose = calls.find((call) => call.url.endsWith('/proposals'));
    expect(create).toBeDefined();
    expect(propose).toBeDefined();
    expect(propose!.body).toEqual({ fromMessageId: 'a1' });
    // The wiki opens with the page AND the returned proposal.
    expect(onOpenWikiWithProposal).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: PAGE_ID, proposal: expect.objectContaining({ id: 'prop-1' }) }),
    );
  });

  it('Add to page skips create and proposes on the existing page', async () => {
    const onOpenWikiWithProposal = vi.fn();
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal });

    await click(wikiButton()!);
    await click(host.querySelector(`[data-board-ai-chat-wiki-page="${PAGE_ID}"]`) as HTMLElement);
    await settle();

    expect(calls.some((call) => call.url.endsWith('/wiki') && call.method === 'POST')).toBe(false);
    expect(onOpenWikiWithProposal).toHaveBeenCalledWith(expect.objectContaining({ pageId: PAGE_ID }));
  });

  it('a 403 says the sources could not be verified', async () => {
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal: vi.fn() });
    proposalStatus = 403;
    await click(wikiButton()!);
    await click(host.querySelector(`[data-board-ai-chat-wiki-page="${PAGE_ID}"]`) as HTMLElement);
    await settle();
    expect(host.querySelector('[data-board-ai-chat-save-wiki-error]')!.textContent)
      .toContain("This answer's sources could not be verified");
  });

  it('a 404 says the page no longer exists', async () => {
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal: vi.fn() });
    proposalStatus = 404;
    await click(wikiButton()!);
    await click(host.querySelector(`[data-board-ai-chat-wiki-page="${PAGE_ID}"]`) as HTMLElement);
    await settle();
    expect(host.querySelector('[data-board-ai-chat-save-wiki-error]')!.textContent)
      .toContain('That page no longer exists');
  });

  it('a create that succeeds before a proposal failure says the page was created', async () => {
    await mount({ canSaveAssistantToWiki: true, onOpenWikiWithProposal: vi.fn() });
    proposalStatus = 500;
    await click(wikiButton()!);
    await click(host.querySelector('[data-board-ai-chat-wiki-create="true"]') as HTMLElement);
    await settle();
    expect(host.querySelector('[data-board-ai-chat-save-wiki-error]')!.textContent)
      .toContain('Page created; the answer was not added');
  });
});
