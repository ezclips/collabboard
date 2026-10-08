// @vitest-environment jsdom
//
// PATCH-323. Board AI on Kanban, from the drawer's side: the whole-board
// overview rides on every turn as a fixed chip, a Kanban card citation opens
// the card, and the assistant save action becomes "Save as card".
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer from './BoardAiChatDrawer';
import type { BoardAiContextRequestItem } from '@/lib/domain/ai/boardAiChatContext';
import {
  boardAiDraftFromPage,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const PAD = '44444444-4444-4444-8444-444444444444';
const CARD = '55555555-5555-4555-8555-555555555555';

const KANBAN_AUTO: readonly BoardAiContextRequestItem[] = [{ type: 'kanban-board' }];
const CARD_DRAFT: BoardAiDraftContextItem = {
  request: { type: 'kanban-card', cardId: CARD },
  label: 'Ship the release',
  detail: 'Card',
};

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
let posted: Record<string, unknown>[] = [];
let replyMessage: Record<string, unknown> | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const userRow = (id: string, content: string, context: unknown = null) =>
  ({ id, role: 'user', content, provider: null, model: null, createdAt: 'n', context });

/** Models the route closely enough: POST persists the user turn, GET reads it back. */
function stubChat() {
  const messages: Record<string, unknown[]> = {};
  posted = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posted.push(body);
      const threadId = (body.threadId as string) ?? THREAD;
      messages[threadId] = [...(messages[threadId] ?? []), userRow(`u${posted.length}`, body.message as string)];
      const reply = replyMessage ?? {
        id: 'a1', role: 'assistant', content: 'answer', provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n', context: null,
      };
      messages[threadId] = [...messages[threadId], reply];
      return json({ threadId, message: reply });
    }
    const match = url.match(/threadId=([^&]+)/);
    if (match) {
      return json({ thread: { id: match[1], title: null, createdAt: 'c', updatedAt: 'u' }, messages: messages[match[1]] ?? [] });
    }
    return json({ threads: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
}

interface MountOptions {
  autoContextRequests?: readonly BoardAiContextRequestItem[];
  initialContext?: readonly BoardAiDraftContextItem[];
  selectedBoardItem?: BoardAiDraftContextItem | null;
  canSaveAssistantAsCard?: boolean;
  onSaveAssistantAsCard?: (request: { messageId: string; content: string }) => Promise<void>;
  onOpenCitation?: (request: { cardId?: string }) => void;
}

async function mount(options: MountOptions = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const state: { items: readonly BoardAiDraftContextItem[] } = { items: options.initialContext ?? [] };
  function Harness() {
    const [items, setItems] = React.useState(state.items);
    state.items = items;
    return (
      <BoardAiChatDrawer
        boardId={BOARD_ID}
        isOpen
        onClose={vi.fn()}
        draftContext={items}
        onDraftContextChange={setItems}
        autoContextRequests={options.autoContextRequests}
        selectedBoardItem={options.selectedBoardItem ?? null}
        canSaveAssistantAsCard={options.canSaveAssistantAsCard}
        onSaveAssistantAsCard={options.onSaveAssistantAsCard}
        onOpenCitation={options.onOpenCitation as never}
      />
    );
  }
  await act(async () => { root!.render(<Harness />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return state;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const click = async (selector: string) => {
  await act(async () => { q(selector)!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const type = async (value: string) => {
  const input = q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const send = async () => {
  await click('[data-board-ai-chat-action="send"]');
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => { document.body.innerHTML = ''; replyMessage = null; stubChat(); });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

describe('PATCH-323 the Kanban overview rides on every turn as a fixed chip', () => {
  it('shows the overview as one chip with no remove control', async () => {
    await mount({ autoContextRequests: KANBAN_AUTO });
    const chip = q('[data-board-ai-auto-context="kanban-board"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('Kanban board');
    // Fixed: there is no button inside it to remove it.
    expect(chip!.querySelector('button')).toBeNull();
  });

  it('appends the overview to a send that carries no attachment', async () => {
    await mount({ autoContextRequests: KANBAN_AUTO });
    await type('what is on the board?');
    await send();
    expect(posted[0].context).toEqual({ items: [{ type: 'kanban-board' }] });
  });

  it('places the overview AFTER the user’s own attachment', async () => {
    await mount({ autoContextRequests: KANBAN_AUTO, initialContext: [CARD_DRAFT] });
    await type('hello');
    await send();
    expect(posted[0].context).toEqual({
      items: [{ type: 'kanban-card', cardId: CARD }, { type: 'kanban-board' }],
    });
  });

  it('reserves the overview’s slot: a fourth attachment is refused out loud', async () => {
    const three = [1, 2, 3].map((n) => boardAiDraftFromPage(DOC, 'A2.pdf', n));
    const state = await mount({
      autoContextRequests: KANBAN_AUTO,
      initialContext: three,
      selectedBoardItem: { request: { type: 'padlet', padletId: PAD }, label: 'Planning', detail: 'Note' },
    });
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(state.items).toHaveLength(3);
    expect(q('[data-board-ai-context-notice="true"]')!.textContent).toMatch(/Maximum 3/i);
  });

  it('without the auto context nothing is appended -- Freeform is unchanged', async () => {
    await mount();
    await type('hello');
    await send();
    expect(posted[0].context).toBeUndefined();
  });
});

describe('PATCH-323 a Kanban card citation opens the card', () => {
  it('renders the card chip and reports its cardId to the host', async () => {
    const onOpenCitation = vi.fn();
    replyMessage = {
      id: 'a1', role: 'assistant', content: 'Ship it is on the board.',
      provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n', context: null,
      citations: { version: 1, items: [{ type: 'kanban-card', cardId: CARD, label: 'Ship the release' }] },
    };
    await mount({ onOpenCitation });
    await type('what did I say about the release?');
    await send();
    const chip = q(`[data-board-ai-chat-citation-card="${CARD}"]`);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('Ship the release');
    await click(`[data-board-ai-chat-citation-card="${CARD}"]`);
    expect(onOpenCitation).toHaveBeenCalledWith({ cardId: CARD });
  });
});

describe('PATCH-323 an answer saves as a CARD on Kanban', () => {
  it('offers Save as card to an editor and hands the answer to the handler', async () => {
    const onSave = vi.fn(async () => {});
    replyMessage = {
      id: 'a1', role: 'assistant', content: '## Ship it\n\nThe release is ready.',
      provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n', context: null,
    };
    await mount({ canSaveAssistantAsCard: true, onSaveAssistantAsCard: onSave });
    await type('hello');
    await send();
    const button = q('[data-board-ai-chat-action="save-card"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Save as card');
    // The Note action is NOT offered alongside it.
    expect(q('[data-board-ai-chat-action="save-note"]')).toBeNull();
    await click('[data-board-ai-chat-action="save-card"]');
    expect(onSave).toHaveBeenCalledWith({ messageId: 'a1', content: '## Ship it\n\nThe release is ready.' });
  });

  it('offers a viewer neither Save as card nor Save as Note', async () => {
    await mount({ canSaveAssistantAsCard: false });
    await type('hello');
    await send();
    expect(q('[data-board-ai-chat-action="save-card"]')).toBeNull();
    expect(q('[data-board-ai-chat-action="save-note"]')).toBeNull();
  });

  it('shows the card failure message, not the Note one', async () => {
    const onSave = vi.fn(async () => { throw new Error('nope'); });
    replyMessage = {
      id: 'a1', role: 'assistant', content: 'answer',
      provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n', context: null,
    };
    await mount({ canSaveAssistantAsCard: true, onSaveAssistantAsCard: onSave });
    await type('hello');
    await send();
    await click('[data-board-ai-chat-action="save-card"]');
    expect(q('[data-board-ai-chat-save-note-error="true"]')?.textContent).toContain('Could not save card.');
  });
});
