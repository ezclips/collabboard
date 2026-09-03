// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer from './BoardAiChatDrawer';
import {
  boardAiDraftFromDocument,
  boardAiDraftFromPage,
  boardAiDraftFromSelection,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const PAD = '44444444-4444-4444-8444-444444444444';

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
/** Everything the drawer actually posted, in order. */
let posted: Record<string, unknown>[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const userRow = (id: string, content: string, context: unknown = null) =>
  ({ id, role: 'user', content, provider: null, model: null, createdAt: 'n', context });

/**
 * Models the route closely enough for truth to matter: the user turn is
 * persisted BEFORE generation, GET returns what is stored, and the SERVER --
 * never the client -- decides what a stored message's context says.
 */
function stubChat(options: {
  post?: (body: Record<string, unknown>) => Response;
  /** What the server claims a persisted user message carried. */
  serverContext?: unknown;
} = {}) {
  const messages: Record<string, unknown[]> = {};
  const threads: unknown[] = [];
  posted = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posted.push(body);
      const threadId = (body.threadId as string) ?? THREAD;
      if (options.post) {
        const response = options.post(body);
        // A context refusal writes NOTHING, which is what the route does.
        if (response.status === 400 || response.status === 404) return response;
        messages[threadId] = [
          ...(messages[threadId] ?? []),
          userRow(`u${posted.length}`, body.message as string, options.serverContext ?? null),
        ];
        return response;
      }
      messages[threadId] = [
        ...(messages[threadId] ?? []),
        userRow(`u${posted.length}`, body.message as string, options.serverContext ?? null),
      ];
      const reply = {
        id: `a${posted.length}`, role: 'assistant', content: 'answer',
        provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n', context: null,
      };
      messages[threadId] = [...messages[threadId], reply];
      if (!threads.length) threads.push({ id: threadId, title: null, createdAt: 'c', updatedAt: 'u' });
      return json({ threadId, message: reply });
    }
    const match = url.match(/threadId=([^&]+)/);
    if (match) {
      return json({ thread: { id: match[1], title: null, createdAt: 'c', updatedAt: 'u' }, messages: messages[match[1]] ?? [] });
    }
    return json({ threads });
  });
  vi.stubGlobal('fetch', fetchMock);
}

/** Drives the drawer with draft context owned outside it, as the shell does. */
async function mount(options: {
  initialContext?: readonly BoardAiDraftContextItem[];
  selectedBoardItem?: BoardAiDraftContextItem | null;
} = {}) {
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
        selectedBoardItem={options.selectedBoardItem ?? null}
      />
    );
  }
  await act(async () => { root!.render(<Harness />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return state;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
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

beforeEach(() => { document.body.innerHTML = ''; stubChat(); });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

const NOTE_DRAFT: BoardAiDraftContextItem = {
  request: { type: 'padlet', padletId: PAD }, label: 'Planning', detail: 'Note',
};

describe('1,2,12,13. the control exists and promises nothing on its own', () => {
  it('1. + Context is present', async () => {
    await mount();
    expect(q('[data-board-ai-context-add="true"]')).not.toBeNull();
  });

  it('2. with nothing supported selected it offers no attach action', async () => {
    await mount({ selectedBoardItem: null });
    await click('[data-board-ai-context-add="true"]');
    expect(q('[data-board-ai-context-use-selected="true"]')).toBeNull();
    // It says what to do instead of showing a control that would fail.
    expect(q('[data-board-ai-context-empty="true"]')!.textContent).toMatch(/Select a Note or PDF/i);
  });

  it('12,13. opening Chat, and having something selected, attach nothing', async () => {
    const state = await mount({ selectedBoardItem: NOTE_DRAFT });
    // A selection is not an attachment. Only the explicit action attaches.
    expect(state.items).toHaveLength(0);
    expect(q('[data-board-ai-context-drafts="true"]')).toBeNull();
    await type('hello');
    await send();
    expect(posted[0].context).toBeUndefined();
  });
});

describe('3,4,5,7,8,9,11. attaching from the selected board item', () => {
  it('3,4,5. the explicit action queues the shell\'s draft', async () => {
    const state = await mount({ selectedBoardItem: NOTE_DRAFT });
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(state.items).toEqual([NOTE_DRAFT]);
    expect(q('[data-board-ai-context-draft="padlet"]')!.textContent).toContain('Planning');
  });

  it('7. attaching sends nothing', async () => {
    await mount({ selectedBoardItem: NOTE_DRAFT });
    const before = fetchMock.mock.calls.length;
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(fetchMock.mock.calls).toHaveLength(before);
    expect(posted).toHaveLength(0);
  });

  it('8. a chip can be removed before sending', async () => {
    const state = await mount({ initialContext: [NOTE_DRAFT] });
    expect(all('[data-board-ai-context-draft]')).toHaveLength(1);
    await click('[data-board-ai-context-remove]');
    expect(state.items).toHaveLength(0);
    expect(q('[data-board-ai-context-drafts="true"]')).toBeNull();
  });

  it('9. attaching the same item twice says so instead of duplicating', async () => {
    const state = await mount({ initialContext: [NOTE_DRAFT], selectedBoardItem: NOTE_DRAFT });
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(state.items).toHaveLength(1);
    expect(q('[data-board-ai-context-notice="true"]')!.textContent).toMatch(/already attached/i);
  });

  it('11. a fifth attachment is refused out loud, replacing nothing', async () => {
    const four = [1, 2, 3, 4].map((n) => boardAiDraftFromPage(DOC, 'A2.pdf', n));
    const state = await mount({ initialContext: four, selectedBoardItem: NOTE_DRAFT });
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(state.items).toHaveLength(4);
    expect(state.items).toEqual(four);
    expect(q('[data-board-ai-context-notice="true"]')!.textContent).toMatch(/Maximum 4/i);
  });

  it('10. two selections on one page are two chips', async () => {
    const a = boardAiDraftFromSelection(DOC, 'A2.pdf', { pageNumber: 6, charStart: 0, charEnd: 5, selectedText: 'first' })!;
    const b = boardAiDraftFromSelection(DOC, 'A2.pdf', { pageNumber: 6, charStart: 9, charEnd: 14, selectedText: 'later' })!;
    await mount({ initialContext: [a, b] });
    expect(all('[data-board-ai-context-draft="knowledge-selection"]')).toHaveLength(2);
  });
});

describe('14,15,16,18. sending carries identity, once', () => {
  it('14,15. the request holds provenance only -- no label, no source text', async () => {
    const selection = boardAiDraftFromSelection(DOC, 'SECRET-NAME.pdf', {
      pageNumber: 6, charStart: 4, charEnd: 9, selectedText: 'exact',
    })!;
    await mount({ initialContext: [boardAiDraftFromDocument(DOC, 'SECRET-NAME.pdf'), selection] });
    await type('what does it say?');
    await send();

    expect(posted[0].context).toEqual({
      items: [
        { type: 'knowledge-document', knowledgeDocumentId: DOC },
        {
          type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 6,
          charStart: 4, charEnd: 9, selectedText: 'exact',
        },
      ],
    });
    const body = JSON.stringify(posted[0]);
    expect(body).not.toContain('SECRET-NAME');
    expect(body).not.toContain('label');
    // 51. And nothing that names execution.
    for (const forbidden of ['provider', 'model', 'apiKey', 'connectionId', 'signedUrl']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it('16,18. a successful send clears the draft, and the next turn is bare', async () => {
    const state = await mount({ initialContext: [NOTE_DRAFT] });
    await type('first');
    await send();
    expect(state.items).toHaveLength(0);
    expect(q('[data-board-ai-context-drafts="true"]')).toBeNull();

    await type('second');
    await send();
    // 44. The earlier attachment is NOT silently resent.
    expect(posted[1].context).toBeUndefined();
  });

  it('22. a continuation keeps the same thread id', async () => {
    await mount({ initialContext: [NOTE_DRAFT] });
    await type('first');
    await send();
    await type('second');
    await send();
    expect(posted[1].threadId).toBe(THREAD);
  });
});

describe('17,37-44. persisted chips come from the server', () => {
  const serverContext = {
    version: 1,
    items: [
      { type: 'knowledge-document', knowledgeDocumentId: DOC, label: 'A2.pdf', excerpt: 'server excerpt' },
      { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'A2.pdf' },
      { type: 'knowledge-selection', knowledgeDocumentId: DOC, pageNumber: 6, charStart: 0, charEnd: 5, selectedText: 'exact', label: 'A2.pdf' },
      { type: 'padlet', padletId: PAD, label: 'Planning', excerpt: 'note body' },
    ],
  };

  it('17,37-40. every persisted kind renders on the user turn', async () => {
    stubChat({ serverContext });
    await mount({ initialContext: [NOTE_DRAFT] });
    await type('about these');
    await send();

    const chips = all('[data-board-ai-context-chip]');
    expect(chips.map((chip) => chip.dataset.boardAiContextChip)).toEqual([
      'knowledge-document', 'knowledge-page', 'knowledge-selection', 'padlet',
    ]);
    expect(chips[1].textContent).toContain('p. 6');
    expect(chips[3].textContent).toContain('Planning');
  });

  it('41,42. a forged raw row cannot put anything unexpected on a chip', async () => {
    stubChat({
      serverContext: {
        version: 1,
        items: [{
          type: 'padlet', padletId: PAD, label: 'Planning',
          signedUrl: 'https://leak.example', apiKey: 'sk-must-never-render',
          onClick: 'alert(1)', dangerouslySetInnerHTML: '<img>',
        }],
      },
    });
    await mount({ initialContext: [NOTE_DRAFT] });
    await type('hi');
    await send();

    const chip = q('[data-board-ai-context-chip="padlet"]')!;
    expect(chip.textContent).toContain('Planning');
    for (const leak of ['leak.example', 'sk-must-never-render', 'alert(1)']) {
      expect(host.innerHTML, leak).not.toContain(leak);
    }
    expect(chip.querySelector('img')).toBeNull();
  });

  it('43. a persisted chip is read-only -- nothing to click, nothing to reuse', async () => {
    stubChat({ serverContext });
    await mount({ initialContext: [NOTE_DRAFT] });
    await type('hi');
    await send();
    for (const chip of all('[data-board-ai-context-chip]')) {
      expect(chip.querySelector('button')).toBeNull();
      expect(chip.querySelector('a')).toBeNull();
    }
  });
});

describe('19,20,21. failures tell the truth about what was stored', () => {
  it('19. a context refusal restores the question and keeps the attachments', async () => {
    stubChat({ post: () => json({ error: 'Context is not available.' }, 400) });
    const state = await mount({ initialContext: [NOTE_DRAFT] });
    await type('about this note');
    await send();

    // Nothing was persisted, so nothing is shown as asked.
    expect(all('[data-board-ai-chat-message="user"]')).toHaveLength(0);
    // 21. And no answer was invented.
    expect(all('[data-board-ai-chat-message="assistant"]')).toHaveLength(0);
    // The user needs both back to fix the attachment and retry.
    expect((q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement).value).toBe('about this note');
    expect(state.items).toEqual([NOTE_DRAFT]);
    expect(q('[data-board-ai-chat-error="true"]')).not.toBeNull();
  });

  it('20,21. a provider failure keeps the stored turn and its server chips', async () => {
    stubChat({
      serverContext: { version: 1, items: [{ type: 'padlet', padletId: PAD, label: 'Planning' }] },
      post: () => json({ error: 'AI request failed.', threadId: THREAD }, 502),
    });
    const state = await mount({ initialContext: [NOTE_DRAFT] });
    await type('about this note');
    await send();

    // The question really was asked, so it stays -- with the server's chip.
    expect(all('[data-board-ai-chat-message="user"]')).toHaveLength(1);
    expect(q('[data-board-ai-context-chip="padlet"]')!.textContent).toContain('Planning');
    expect(all('[data-board-ai-chat-message="assistant"]')).toHaveLength(0);
    // The attachment was consumed with that message; it must not ride along
    // on the next question.
    expect(state.items).toHaveLength(0);
    expect(q('[data-board-ai-chat-error="true"]')).not.toBeNull();
  });

  it('a rate limit is not mistaken for a context problem', async () => {
    stubChat({ post: () => json({ error: 'Rate limit exceeded.' }, 429) });
    const state = await mount({ initialContext: [NOTE_DRAFT] });
    await type('hello');
    await send();
    // No thread id came back, so nothing was stored: draft and text return.
    expect(state.items).toEqual([NOTE_DRAFT]);
    expect((q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement).value).toBe('hello');
  });
});

describe('privacy wording stays honest', () => {
  it('promises only what attachments actually do', async () => {
    await mount();
    await click('[data-board-ai-context-add="true"]');
    expect(q('[data-board-ai-context-menu="true"]')!.textContent)
      .toMatch(/Only attached items are shared/i);
    expect(host.textContent).not.toMatch(/whole board|entire board|reads your board/i);
  });
});
