// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  // The chooser has its own suite; here it is a placeholder so the drawer's
  // own behaviour is what these tests observe.
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer, {
  type BoardAiDocumentScopedSession,
} from './BoardAiChatDrawer';
import type { BoardAiDraftContextItem } from '@/lib/domain/ai/boardAiChatDraftContext';
import type { BoardAiChatMessageView } from '@/lib/domain/ai/boardAiChatClient';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_A = '22222222-2222-4222-8222-222222222222';
const THREAD_B = '33333333-3333-4333-8333-333333333333';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const DRAWER = read('components/collabboard/BoardAiChatDrawer.tsx');
const READER = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
let posted: Record<string, unknown>[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const summary = (id: string, updatedAt: string) => ({
  id, title: null, createdAt: '2026-09-02T09:00:00Z', updatedAt,
});

/**
 * A STATEFUL double, because the drawer reconciles with persisted truth: after
 * a send it adopts the returned thread id, which reloads that thread from the
 * server. A stub that forgot what it had just been sent would make correct
 * behaviour look like a disappearing message.
 *
 * So this models the route: POST persists the user turn first (as BCHAT-B
 * does), then the assistant turn on success, and GET returns what is stored.
 */
function stubChat(options: {
  threads?: ReturnType<typeof summary>[];
  messages?: Record<string, unknown[]>;
  post?: () => Response;
} = {}) {
  const threads = [...(options.threads ?? [])];
  const messages: Record<string, unknown[]> = { ...(options.messages ?? {}) };
  let sent = 0;
  posted = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { threadId?: string; message: string };
      posted.push(body as Record<string, unknown>);
      const threadId = body.threadId ?? THREAD_A;
      messages[threadId] = [
        ...(messages[threadId] ?? []),
        // The question is stored BEFORE generation, so it survives a failure.
        { id: `u${++sent}`, role: 'user', content: body.message, provider: null, model: null, createdAt: 'n' },
      ];
      if (!threads.some((thread) => thread.id === threadId)) threads.unshift(summary(threadId, 'z'));
      if (options.post) return options.post();
      const reply = { id: `a${sent}`, role: 'assistant', content: 'answer', provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n' };
      messages[threadId] = [...messages[threadId], reply];
      return json({ threadId, message: reply });
    }
    const match = url.match(/threadId=([^&]+)/);
    if (match) return json({ thread: summary(match[1], 'x'), messages: messages[match[1]] ?? [] });
    return json({ threads });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mount(props: Partial<React.ComponentProps<typeof BoardAiChatDrawer>> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardAiChatDrawer boardId={BOARD_ID} isOpen onClose={props.onClose ?? vi.fn()} {...props} />,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const saveButton = (messageId: string) =>
  q(`[data-board-ai-chat-save-message-id="${messageId}"]`) as HTMLButtonElement | null;
const type = async (value: string) => {
  const input = q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (selector: string) => {
  await act(async () => { q(selector)!.click(); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => { document.body.innerHTML = ''; stubChat(); });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

describe('17-18. opening reads, and never writes', () => {
  it('17. opening the drawer creates no thread', async () => {
    await mount();
    // Exactly one GET, and no POST: a thread row appears only when a message
    // is actually sent.
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    expect(q('[data-board-ai-chat-empty="true"]')).not.toBeNull();
  });

  it('18. the most recently updated thread is the one opened', async () => {
    stubChat({
      threads: [summary(THREAD_B, '2026-09-02T12:00:00Z'), summary(THREAD_A, '2026-09-02T10:00:00Z')],
      messages: { [THREAD_B]: [{ id: 'm1', role: 'user', content: 'newest thread', provider: null, model: null, createdAt: 'n' }] },
    });
    await mount();
    expect(host.textContent).toContain('newest thread');
    // The head of the server's order, not a client re-sort.
    expect(String(fetchMock.mock.calls[1][0])).toContain(THREAD_B);
  });

  it('a private, non-claiming empty state', async () => {
    await mount();
    const empty = q('[data-board-ai-chat-empty="true"]')!;
    expect(empty.textContent).toContain('private');
    // D2 adds attachments, so the wording says what is true now: nothing is
    // shared EXCEPT what the user explicitly attaches.
    expect(empty.textContent).toMatch(/Only items you attach are shared/i);
    // It must still not promise analysis that does not happen.
    expect(empty.textContent).not.toMatch(/analys|reads your board|sees everything/i);
  });
});

describe('19. New chat is a UI act only', () => {
  it('clears the surface without deleting or creating anything', async () => {
    stubChat({
      threads: [summary(THREAD_A, 'z')],
      messages: { [THREAD_A]: [{ id: 'm1', role: 'user', content: 'earlier turn', provider: null, model: null, createdAt: 'n' }] },
    });
    await mount();
    expect(host.textContent).toContain('earlier turn');
    const before = fetchMock.mock.calls.length;

    await click('[data-board-ai-chat-action="new"]');
    expect(host.textContent).not.toContain('earlier turn');
    expect(q('[data-board-ai-chat-empty="true"]')).not.toBeNull();
    // No DELETE, no POST -- the old thread is still listed and untouched.
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(all('[data-board-ai-chat-thread=""] option').length).toBeGreaterThan(1);
  });
});

describe('20-22. sending', () => {
  it('20. a first send carries no threadId and adopts the one returned', async () => {
    await mount();
    await type('hello');
    await click('[data-board-ai-chat-action="send"]');

    const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ message: 'hello' });
    // The reply is rendered, and the returned id becomes the active thread.
    expect(host.textContent).toContain('answer');
  });

  it('21. the next send reuses the adopted threadId', async () => {
    await mount();
    await type('first');
    await click('[data-board-ai-chat-action="send"]');
    await type('second');
    await click('[data-board-ai-chat-action="send"]');

    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(JSON.parse(String(posts[1][1]!.body))).toEqual({ threadId: THREAD_A, message: 'second' });
  });

  it('22. switching thread loads that conversation', async () => {
    stubChat({
      threads: [summary(THREAD_A, 'b'), summary(THREAD_B, 'a')],
      messages: {
        [THREAD_A]: [{ id: 'm1', role: 'user', content: 'in thread A', provider: null, model: null, createdAt: 'n' }],
        [THREAD_B]: [{ id: 'm2', role: 'user', content: 'in thread B', provider: null, model: null, createdAt: 'n' }],
      },
    });
    await mount();
    expect(host.textContent).toContain('in thread A');

    const select = q('[data-board-ai-chat-thread=""]') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, THREAD_B);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain('in thread B');
    expect(host.textContent).not.toContain('in thread A');
  });

  it('24. a blank or whitespace message cannot be sent', async () => {
    await mount();
    const send = q('[data-board-ai-chat-action="send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await type('   ');
    expect((q('[data-board-ai-chat-action="send"]') as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
  });

  it('25. a second send is blocked while one is in flight', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    stubChat({ post: (() => { throw new Error('unused'); }) as never });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') { await gate; return json({ threadId: THREAD_A, message: { id: 'a', role: 'assistant', content: 'late', provider: null, model: null, createdAt: 'n' } }); }
      return json({ threads: [] });
    });

    await mount();
    await type('one');
    await act(async () => { q('[data-board-ai-chat-action="send"]')!.click(); });
    // The button is disabled for the duration, so a double click cannot post twice.
    expect((q('[data-board-ai-chat-action="send"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { q('[data-board-ai-chat-action="send"]')!.click(); });
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1);
    await act(async () => { release!(); await Promise.resolve(); });
  });
});

describe('26-27. failures stay truthful', () => {
  it('26. a server error is shown as one safe sentence', async () => {
    stubChat({ post: () => json({ error: 'Rate limit exceeded.' }, 429) });
    await mount();
    await type('hello');
    await click('[data-board-ai-chat-action="send"]');
    const error = q('[data-board-ai-chat-error="true"]')!;
    expect(error.textContent).toMatch(/Too many messages/);
    // No status codes, no provider text, no stack.
    expect(error.textContent).not.toMatch(/429|stack|at Object|provider/i);
  });

  it('27. a provider failure does not erase the user turn the server stored', async () => {
    stubChat({ post: () => json({ error: 'AI request failed.', threadId: THREAD_A }, 502) });
    await mount();
    await type('my question');
    await click('[data-board-ai-chat-action="send"]');
    // The question was persisted before generation, so removing it here would
    // contradict what the database holds.
    expect(host.textContent).toContain('my question');
    expect(q('[data-board-ai-chat-error="true"]')).not.toBeNull();
  });

  it('a failure that names the thread is still adopted, so the next send continues it', async () => {
    stubChat({ post: () => json({ error: 'Unavailable', threadId: THREAD_A }, 503) });
    await mount();
    await type('first');
    await click('[data-board-ai-chat-action="send"]');
    await type('second');
    await click('[data-board-ai-chat-action="send"]');
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(JSON.parse(String(posts[1][1]!.body)).threadId).toBe(THREAD_A);
  });
});

describe('23,49. messages render as text', () => {
  it('markup in a message is shown, never executed', async () => {
    stubChat({
      threads: [summary(THREAD_A, 'z')],
      messages: { [THREAD_A]: [
        { id: 'm1', role: 'assistant', content: '<img src=x onerror="alert(1)"> <b>bold</b>', provider: 'openai', model: 'gpt-4o', createdAt: 'n' },
      ] },
    });
    await mount();
    const bubble = q('[data-board-ai-chat-message="assistant"]')!;
    expect(bubble.querySelector('img')).toBeNull();
    expect(bubble.querySelector('b')).toBeNull();
    expect(bubble.textContent).toContain('<img src=x onerror="alert(1)">');
    // And the source has no escape hatch at all.
    expect(executable(DRAWER)).not.toContain('dangerouslySetInnerHTML');
  });

  it('user and assistant turns are distinguishable', async () => {
    stubChat({
      threads: [summary(THREAD_A, 'z')],
      messages: { [THREAD_A]: [
        { id: 'm1', role: 'user', content: 'q', provider: null, model: null, createdAt: 'n' },
        { id: 'm2', role: 'assistant', content: 'a', provider: 'deepseek', model: 'deepseek-chat', createdAt: 'n' },
      ] },
    });
    await mount();
    expect(q('[data-board-ai-chat-message="user"]')).not.toBeNull();
    expect(q('[data-board-ai-chat-message="assistant"]')).not.toBeNull();
  });
});

describe('28. closing and reopening reloads the private history', () => {
  it('a remount reads the server again rather than trusting stale state', async () => {
    stubChat({ threads: [summary(THREAD_A, 'z')], messages: { [THREAD_A]: [] } });
    await mount();
    const firstOpen = fetchMock.mock.calls.length;
    await act(async () => { root!.render(<BoardAiChatDrawer boardId={BOARD_ID} isOpen={false} onClose={vi.fn()} />); });
    expect(host.querySelector('[data-board-ai-chat="true"]')).toBeNull();
    await act(async () => { root!.render(<BoardAiChatDrawer boardId={BOARD_ID} isOpen onClose={vi.fn()} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(firstOpen);
  });
});

describe('30-32. yielding to a blocking editor', () => {
  it('30. a blocking editor wins: the drawer is inert and invisible', async () => {
    await mount({ blockingEditorOpen: true });
    const drawer = q('[data-board-ai-chat="true"]')!;
    expect(drawer.getAttribute('data-board-ai-chat-yielded')).toBe('true');
    expect(drawer.className).toContain('pointer-events-none');
    expect(drawer.className).toContain('opacity-0');
  });

  it('31. Escape that closes the editor does not also close the yielded chat', async () => {
    const onClose = vi.fn();
    await mount({ blockingEditorOpen: true, onClose });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes the chat when it is the surface actually on screen', async () => {
    const onClose = vi.fn();
    await mount({ onClose });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('32. state survives the yield, because the drawer is never unmounted', async () => {
    stubChat({
      threads: [summary(THREAD_A, 'z')],
      messages: { [THREAD_A]: [{ id: 'm1', role: 'user', content: 'kept across the editor', provider: null, model: null, createdAt: 'n' }] },
    });
    await mount();
    const reads = fetchMock.mock.calls.length;
    await act(async () => { root!.render(<BoardAiChatDrawer boardId={BOARD_ID} isOpen onClose={vi.fn()} blockingEditorOpen />); });
    await act(async () => { root!.render(<BoardAiChatDrawer boardId={BOARD_ID} isOpen onClose={vi.fn()} blockingEditorOpen={false} />); });
    expect(host.textContent).toContain('kept across the editor');
    // Yielding is a class change, not a reload.
    expect(fetchMock.mock.calls.length).toBe(reads);
  });
});

describe('46-48. no context is sent, and none is offered', () => {
  it('the POST body carries only threadId and message', async () => {
    await mount();
    await type('hello');
    await click('[data-board-ai-chat-action="send"]');
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(Object.keys(JSON.parse(String(post[1]!.body))).sort()).toEqual(['message']);
  });

  it('the drawer reads no board, PDF or Note source at all', async () => {
    const code = executable(DRAWER);
    // BOARD_AI_PDF_CITATIONS_1 added citations -- which are the SERVER's, read
    // off the message it sent, never a source this surface goes and reads. The
    // list below is what the drawer still must not reach for.
    for (const forbidden of [
      'KnowledgePageCache', 'useKnowledgeSource', 'selectedText',
      'sourceReference', 'reader.pages', 'page.text',
    ]) {
      expect(code, `${forbidden} is not this surface's to read`).not.toContain(forbidden);
    }
    // Its only endpoint is the chat route.
    const urls = code.match(/\/api\/[^`'"]*/g) ?? [];
    expect(urls.every((url) => url.includes('/ai/chat'))).toBe(true);
  });

  it('50. no admin or service-role client is reachable from a browser component', async () => {
    const code = executable(DRAWER);
    expect(code).not.toContain('getSupabaseAdmin');
    expect(code).not.toContain('service_role');
    expect(code).not.toContain('supabase');
  });
});

describe('PDF workspace document-scoped mode', () => {
  const DOC_A = '44444444-4444-4444-8444-444444444444';
  const DOC_B = '55555555-5555-4555-8555-555555555555';
  const NOTE_DRAFT = {
    request: { type: 'padlet' as const, padletId: '66666666-6666-4666-8666-666666666666' },
    label: 'Planning note',
    detail: 'Note',
  };

  function stubPdfScopedChat() {
    const messages: Record<string, unknown[]> = {};
    let sent = 0;
    posted = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          threadId?: string;
          message: string;
          context?: { items?: { knowledgeDocumentId?: string }[] };
        };
        posted.push(body as Record<string, unknown>);
        const scopedDocumentId = body.context?.items?.[0]?.knowledgeDocumentId;
        const threadId = body.threadId ?? (scopedDocumentId === DOC_B ? THREAD_B : THREAD_A);
        messages[threadId] = [
          ...(messages[threadId] ?? []),
          {
            id: `u${++sent}`,
            role: 'user',
            content: body.message,
            provider: null,
            model: null,
            createdAt: 'n',
            context: body.context ? { version: 1, items: body.context.items ?? [] } : null,
          },
        ];
        const reply = {
          id: `a${sent}`,
          role: 'assistant',
          content: `answer for ${threadId === THREAD_B ? 'B' : 'A'}`,
          provider: 'deepseek',
          model: 'deepseek-chat',
          createdAt: 'n',
        };
        messages[threadId] = [...messages[threadId], reply];
        return json({ threadId, message: reply });
      }
      const match = url.match(/threadId=([^&]+)/);
      if (match) return json({ thread: summary(match[1], 'x'), messages: messages[match[1]] ?? [] });
      return json({ threads: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  async function mountPdfScope(documentId = DOC_A, filename = 'Alpha.pdf', pageNumber = 1) {
    const state: { items: readonly BoardAiDraftContextItem[] } = { items: [] };

    function Harness({
      activeDocumentId,
      activeFilename,
      activePageNumber,
    }: {
      activeDocumentId: string;
      activeFilename: string;
      activePageNumber: number;
    }) {
      const [items, setItems] = React.useState<readonly BoardAiDraftContextItem[]>([]);
      state.items = items;
      return (
        <BoardAiChatDrawer
          boardId={BOARD_ID}
          isOpen
          onClose={vi.fn()}
          presentation="embedded"
          documentScope={{ knowledgeDocumentId: activeDocumentId, originalFilename: activeFilename, pageNumber: activePageNumber }}
          draftContext={items}
          onDraftContextChange={setItems}
          selectedBoardItem={NOTE_DRAFT}
        />
      );
    }

    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<Harness activeDocumentId={documentId} activeFilename={filename} activePageNumber={pageNumber} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return {
      state,
      rerender: async (activeDocumentId: string, activeFilename: string, activePageNumber = 1) => {
        await act(async () => {
          root!.render(<Harness activeDocumentId={activeDocumentId} activeFilename={activeFilename} activePageNumber={activePageNumber} />);
        });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      },
    };
  }

  async function mountControlledPdfWorkspace(documentId = DOC_A, filename = 'Alpha.pdf', pageNumber = 1) {
    const state: {
      sessions: Record<string, BoardAiDocumentScopedSession>;
      rightPanel: 'closed' | 'ai';
    } = { sessions: {}, rightPanel: 'ai' };

    function Harness({
      activeDocumentId,
      activeFilename,
      activePageNumber,
      rightPanel,
    }: {
      activeDocumentId: string;
      activeFilename: string;
      activePageNumber: number;
      rightPanel: 'closed' | 'ai';
    }) {
      const [items, setItems] = React.useState<readonly BoardAiDraftContextItem[]>([]);
      const [sessions, setSessions] = React.useState<Record<string, BoardAiDocumentScopedSession>>({});
      state.sessions = sessions;
      state.rightPanel = rightPanel;
      return rightPanel === 'ai' ? (
        <BoardAiChatDrawer
          boardId={BOARD_ID}
          isOpen
          onClose={vi.fn()}
          presentation="embedded"
          documentScope={{ knowledgeDocumentId: activeDocumentId, originalFilename: activeFilename, pageNumber: activePageNumber }}
          draftContext={items}
          onDraftContextChange={setItems}
          documentSessions={sessions}
          onDocumentSessionsChange={setSessions}
          selectedBoardItem={NOTE_DRAFT}
        />
      ) : <div data-pdf-workspace-panel-closed="true" />;
    }

    const render = async (
      activeDocumentId: string,
      activeFilename: string,
      rightPanel: 'closed' | 'ai',
      activePageNumber = 1,
    ) => {
      await act(async () => {
        root!.render(
          <Harness
            activeDocumentId={activeDocumentId}
            activeFilename={activeFilename}
            activePageNumber={activePageNumber}
            rightPanel={rightPanel}
          />,
        );
      });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    };

    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await render(documentId, filename, 'ai', pageNumber);
    return { state, render };
  }

  /**
   * A PDF thread. The USER message carries context; the ASSISTANT message
   * carries its own server-validated citations -- and those, not the context,
   * are what a saved Note may claim. `citationItems` lets a test state the two
   * independently, which is the whole point of the invariant.
   */
  const pdfThreadMessages = (
    documentId: string,
    pageNumber: number,
    assistantContent = 'assistant answer text',
    assistantId = `a-${documentId}`,
    citationItems: readonly Record<string, unknown>[] | null = [
      { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber, label: 'p.' },
    ],
    contextItems: readonly Record<string, unknown>[] = [
      { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber },
    ],
  ) => [
    {
      id: `u-${documentId}`,
      role: 'user',
      content: 'question',
      provider: null,
      model: null,
      createdAt: 'n',
      context: { version: 1, items: contextItems },
    },
    {
      id: assistantId,
      role: 'assistant',
      content: assistantContent,
      provider: 'deepseek',
      model: 'deepseek-chat',
      createdAt: 'n',
      context: null,
      citations: citationItems === null ? null : { version: 1, items: citationItems },
    },
    // Cast once here: the fixture states citation/context items as plain
    // records so a test can express a malformed or partial one deliberately.
  ] as unknown as readonly BoardAiChatMessageView[];

  const pdfTwoAnswerThread = (documentId: string, pageNumber: number) => [
    {
      id: 'u-one',
      role: 'user',
      content: 'question one',
      provider: null,
      model: null,
      createdAt: 'n',
      context: { version: 1, items: [{ type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber }] },
    },
    {
      id: 'assistant-a',
      role: 'assistant',
      content: 'answer A',
      provider: 'deepseek',
      model: 'deepseek-chat',
      createdAt: 'n',
      context: null,
    },
    {
      id: 'u-two',
      role: 'user',
      content: 'question two',
      provider: null,
      model: null,
      createdAt: 'n',
      context: { version: 1, items: [{ type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber }] },
    },
    {
      id: 'assistant-b',
      role: 'assistant',
      content: 'answer B',
      provider: 'deepseek',
      model: 'deepseek-chat',
      createdAt: 'n',
      context: null,
    },
  ] as const;

  async function mountPdfSaveHarness({
    activeDocumentId = DOC_A,
    activeFilename = 'Alpha.pdf',
    activePageNumber = 3,
    initialSessions,
    canSave = true,
    onSave = vi.fn().mockResolvedValue(undefined),
    onClose = vi.fn(),
  }: {
    activeDocumentId?: string;
    activeFilename?: string;
    activePageNumber?: number;
    initialSessions?: Record<string, BoardAiDocumentScopedSession>;
    canSave?: boolean;
    onSave?: React.ComponentProps<typeof BoardAiChatDrawer>['onSaveAssistantAsNote'];
    onClose?: () => void;
  } = {}) {
    const seededSessions = initialSessions ?? {
      [activeDocumentId]: {
        activeThreadId: THREAD_A,
        messages: pdfThreadMessages(activeDocumentId, activePageNumber),
        draft: '',
        loadingMessages: false,
        sending: false,
        error: null,
      },
    };
    stubChat({
      messages: Object.fromEntries(
        Object.entries(seededSessions).map(([documentId, session]) => [
          session.activeThreadId ?? documentId,
          [...session.messages],
        ]),
      ),
    });

    function Harness({
      documentId,
      filename,
      pageNumber,
      panel,
    }: {
      documentId: string;
      filename: string;
      pageNumber: number;
      panel: 'ai' | 'library';
    }) {
      const [sessions, setSessions] = React.useState<Record<string, BoardAiDocumentScopedSession>>(seededSessions);
      if (panel === 'library') return <div data-pdf-workspace-panel="library" />;
      return (
        <BoardAiChatDrawer
          boardId={BOARD_ID}
          isOpen
          onClose={onClose}
          presentation="embedded"
          documentScope={{ knowledgeDocumentId: documentId, originalFilename: filename, pageNumber }}
          documentSessions={sessions}
          onDocumentSessionsChange={setSessions}
          canSaveAssistantAsNote={canSave}
          onSaveAssistantAsNote={onSave}
        />
      );
    }

    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const render = async (
      documentId: string,
      filename: string,
      pageNumber: number,
      panel: 'ai' | 'library' = 'ai',
    ) => {
      await act(async () => {
        root!.render(<Harness documentId={documentId} filename={filename} pageNumber={pageNumber} panel={panel} />);
      });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    };
    await render(activeDocumentId, activeFilename, activePageNumber);
    return { render, onSave, onClose };
  }

  it('sends the active PDF identity on every turn without client-side PDF text', async () => {
    await mountPdfScope(DOC_A, 'Alpha.pdf');
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'GET')).toHaveLength(0);
    expect(q('[data-board-ai-chat-thread=""]')).toBeNull();
    expect(q('[data-board-ai-context-mandatory="knowledge-page"]')?.textContent).toContain('Alpha.pdf');
    expect(q('[data-board-ai-context-mandatory="knowledge-page"]')?.textContent).toContain('p. 1');
    expect(q('[data-board-ai-context-mandatory="knowledge-page"] button')).toBeNull();

    await type('first');
    await click('[data-board-ai-chat-action="send"]');
    await type('second');
    await click('[data-board-ai-chat-action="send"]');

    expect(posted[0]).toEqual({
      message: 'first',
      context: { items: [{ type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 1 }] },
    });
    expect(posted[1]).toEqual({
      threadId: THREAD_A,
      message: 'second',
      context: { items: [{ type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 1 }] },
    });
    expect(JSON.stringify(posted)).not.toContain('Alpha.pdf');
    expect(JSON.stringify(posted)).not.toContain('The stored page');
  });

  it('keeps optional context explicit, removable, and separate from the mandatory PDF scope', async () => {
    const { state } = await mountPdfScope(DOC_A, 'Alpha.pdf');
    await click('[data-board-ai-context-add="true"]');
    await click('[data-board-ai-context-use-selected="true"]');
    expect(state.items).toEqual([NOTE_DRAFT]);
    expect(q('[data-board-ai-context-draft="padlet"]')).not.toBeNull();

    await click('[data-board-ai-context-remove]');
    expect(state.items).toHaveLength(0);
    expect(q('[data-board-ai-context-mandatory="knowledge-page"]')).not.toBeNull();
  });

  it('captures the returned thread id into the active PDF session', async () => {
    const { state } = await mountControlledPdfWorkspace(DOC_A, 'Alpha.pdf');
    await type('question for A');
    await click('[data-board-ai-chat-action="send"]');

    expect(state.sessions[DOC_A]?.activeThreadId).toBe(THREAD_A);
    expect(state.sessions[DOC_A]?.messages.map((message) => message.content)).toContain('question for A');
  });

  it('closing and reopening the PDF AI dock restores the same thread through GET', async () => {
    stubPdfScopedChat();
    const { state, render } = await mountControlledPdfWorkspace(DOC_A, 'Alpha.pdf');
    await type('question for A');
    await click('[data-board-ai-chat-action="send"]');
    const readsBeforeClose = fetchMock.mock.calls.length;

    await render(DOC_A, 'Alpha.pdf', 'closed');
    expect(q('[data-board-ai-chat="true"]')).toBeNull();
    expect(state.sessions[DOC_A]?.activeThreadId).toBe(THREAD_A);

    await render(DOC_A, 'Alpha.pdf', 'ai');
    expect(host.textContent).toContain('question for A');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(readsBeforeClose);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(`threadId=${THREAD_A}`);
  });

  it('closing the PDF AI dock is not New chat', async () => {
    const { state, render } = await mountControlledPdfWorkspace(DOC_A, 'Alpha.pdf');
    await type('question for A');
    await click('[data-board-ai-chat-action="send"]');

    await render(DOC_A, 'Alpha.pdf', 'closed');

    expect(state.sessions[DOC_A]?.activeThreadId).toBe(THREAD_A);
    expect(state.sessions[DOC_A]?.messages).toHaveLength(2);
    expect(state.sessions[DOC_A]?.messages.map((message) => message.content)).toContain('question for A');
  });

  it('switches visible session immediately and restores each PDF independently', async () => {
    stubPdfScopedChat();
    const { rerender } = await mountPdfScope(DOC_A, 'Alpha.pdf');
    await type('question for A');
    await click('[data-board-ai-chat-action="send"]');
    expect(host.textContent).toContain('question for A');

    await type('draft for A');
    await rerender(DOC_B, 'Beta.pdf');
    expect(host.textContent).toContain('Beta.pdf');
    expect(host.textContent).not.toContain('question for A');
    expect((q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement).value).toBe('');

    await type('question for B');
    await click('[data-board-ai-chat-action="send"]');
    expect(posted.at(-1)).toMatchObject({
      context: { items: [{ type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 1 }] },
    });
    expect(posted.at(-1)).not.toMatchObject({ threadId: THREAD_A });

    await rerender(DOC_A, 'Alpha.pdf');
    expect(host.textContent).toContain('question for A');
    expect(host.textContent).not.toContain('question for B');
    expect((q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement).value).toBe('draft for A');
  });

  it('New chat resets only the active PDF session and keeps the mandatory scope', async () => {
    stubPdfScopedChat();
    const { rerender } = await mountPdfScope(DOC_A, 'Alpha.pdf');
    await type('question for A');
    await click('[data-board-ai-chat-action="send"]');

    await rerender(DOC_B, 'Beta.pdf');
    await type('question for B');
    await click('[data-board-ai-chat-action="send"]');
    await click('[data-board-ai-chat-action="new"]');
    expect(host.textContent).not.toContain('question for B');
    expect(q('[data-board-ai-context-mandatory="knowledge-page"]')?.textContent).toContain('Beta.pdf');

    await rerender(DOC_A, 'Alpha.pdf');
    expect(host.textContent).toContain('question for A');

    await rerender(DOC_B, 'Beta.pdf');
    await type('new question for B');
    await click('[data-board-ai-chat-action="send"]');
    expect(posted.at(-1)).toMatchObject({ message: 'new question for B' });
    expect(posted.at(-1)).not.toMatchObject({ threadId: THREAD_A });
  });

  it('late responses from a previous PDF do not repaint the active PDF', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    stubChat();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posted.push(body);
        await gate;
        return json({
          threadId: THREAD_A,
          message: { id: 'late-a', role: 'assistant', content: 'late A answer', provider: null, model: null, createdAt: 'n' },
        });
      }
      return json({ threads: [] });
    });

    const { rerender } = await mountPdfScope(DOC_A, 'Alpha.pdf');
    await type('slow A');
    await act(async () => { q('[data-board-ai-chat-action="send"]')!.click(); });
    await rerender(DOC_B, 'Beta.pdf');
    await act(async () => { release!(); await Promise.resolve(); await Promise.resolve(); });

    expect(host.textContent).toContain('Beta.pdf');
    expect(host.textContent).not.toContain('late A answer');
  });

  it('shows Save as Note only on assistant messages for editable PDF threads', async () => {
    await mountPdfSaveHarness();
    expect(all('[data-board-ai-chat-action="save-note"]')).toHaveLength(1);
    expect(q('[data-board-ai-chat-message="assistant"]')?.textContent).toContain('Save as Note');
    expect(q('[data-board-ai-chat-message="user"]')?.querySelector('[data-board-ai-chat-action="save-note"]')).toBeNull();
  });

  it('hides Save as Note from read-only viewers and attempts no mutation', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({ canSave: false, onSave });
    expect(q('[data-board-ai-chat-action="save-note"]')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves assistant text with the originating PDF/page, not provider metadata or the current page at click time', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({
      activeDocumentId: DOC_A,
      activeFilename: 'Alpha.pdf',
      activePageNumber: 6,
      initialSessions: {
        [DOC_A]: {
          activeThreadId: THREAD_A,
          messages: pdfThreadMessages(DOC_A, 3, 'answer body without metadata', 'assistant-a'),
          draft: '',
          loadingMessages: false,
          sending: false,
          error: null,
        },
      },
      onSave,
    });

    await click('[data-board-ai-chat-action="save-note"]');

    // The answer's OWN validated citation decides this, not the reader's
    // current page and not the preceding user message's context.
    expect(onSave).toHaveBeenCalledWith({
      messageId: 'assistant-a',
      content: 'answer body without metadata',
      evidence: [{ sourceDocumentId: DOC_A, pageStart: 3, pageEnd: 3, charStart: null, charEnd: null }],
    });
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toMatch(/deepseek|provider|model/i);
  });

  /**
   * The real drawer, driven by STORED assistant citation envelopes.
   *
   * These go through the production component and the production evidence
   * derivation -- no hand-built source object is handed in at Save time, which
   * is exactly the substitution the invariant forbids.
   */
  const sessionWith = (citationItems: readonly Record<string, unknown>[] | null, contextItems?: readonly Record<string, unknown>[]) => ({
    [DOC_A]: {
      activeThreadId: THREAD_A,
      messages: pdfThreadMessages(DOC_A, 3, 'the answer', 'assistant-a', citationItems, contextItems),
      draft: '',
      loadingMessages: false,
      sending: false,
      error: null,
    },
  });

  it('CONTEXT IS NOT PROVENANCE: context A+B+C, cited A+C, saved with A+C only', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({
      initialSessions: sessionWith(
        // cited: A p4 and A p31
        [
          { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'A p4' },
          { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 31, label: 'A p31' },
        ],
        // context also carried B p9, which the answer never cited
        [
          { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 4 },
          { type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 9 },
          { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 31 },
        ],
      ),
      onSave,
    });

    await click('[data-board-ai-chat-action="save-note"]');

    const request = onSave.mock.calls[0][0];
    expect(request.evidence).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 4, pageEnd: 4, charStart: null, charEnd: null },
      { sourceDocumentId: DOC_A, pageStart: 31, pageEnd: 31, charStart: null, charEnd: null },
    ]);
    // The context-only source is nowhere in the request.
    expect(JSON.stringify(request)).not.toContain(DOC_B);
  });

  it('ZERO validated citations: Save as Note still offered, and saves with no evidence', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({
      // The user's context DID carry PDF A. The answer cited nothing.
      initialSessions: sessionWith(null, [
        { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 3 },
      ]),
      onSave,
    });

    // The action is available -- an uncited answer is still a saveable Note.
    expect(q('[data-board-ai-chat-action="save-note"]')).not.toBeNull();
    await click('[data-board-ai-chat-action="save-note"]');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].evidence).toEqual([]);
    // No fallback to the open document, the active page or anything else.
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toContain(DOC_A);
  });

  it('EXACT SELECTION: a cited selection reaches the save with its span intact', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({
      initialSessions: sessionWith([{
        type: 'knowledge-selection',
        knowledgeDocumentId: DOC_A,
        pageNumber: 5,
        charStart: 120,
        charEnd: 214,
        label: 'Alpha.pdf p. 5',
      }]),
      onSave,
    });

    await click('[data-board-ai-chat-action="save-note"]');

    // Page-only provenance here would be a silent degradation of a location
    // the server already knew exactly.
    expect(onSave.mock.calls[0][0].evidence).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 5, pageEnd: 5, charStart: 120, charEnd: 214 },
    ]);
  });

  it('MULTIPLE citations across documents become multiple references', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({
      initialSessions: sessionWith([
        { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 14, label: 'A p14' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 37, label: 'A p37' },
        { type: 'knowledge-page', knowledgeDocumentId: DOC_B, pageNumber: 8, label: 'B p8' },
      ]),
      onSave,
    });

    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave.mock.calls[0][0].evidence).toHaveLength(3);
  });

  it('a failing save leaves the message saveable again -- retry is not lost', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('source_link_failed'));
    await mountPdfSaveHarness({ initialSessions: sessionWith(null), onSave });

    await click('[data-board-ai-chat-action="save-note"]');
    const button = q('[data-board-ai-chat-action="save-note"]') as HTMLButtonElement;
    // Not marked Saved, and not stuck disabled: nothing was written.
    expect(button.textContent).not.toContain('Saved');
    expect(button.disabled).toBe(false);

    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('keeps PDF A and PDF B assistant saves isolated by stored message provenance', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialSessions = {
      [DOC_A]: {
        activeThreadId: THREAD_A,
        messages: pdfThreadMessages(DOC_A, 2, 'answer A', 'assistant-a'),
        draft: '',
        loadingMessages: false,
        sending: false,
        error: null,
      },
      [DOC_B]: {
        activeThreadId: THREAD_B,
        messages: pdfThreadMessages(DOC_B, 5, 'answer B', 'assistant-b'),
        draft: '',
        loadingMessages: false,
        sending: false,
        error: null,
      },
    };
    const { render } = await mountPdfSaveHarness({ initialSessions, onSave });
    await click('[data-board-ai-chat-action="save-note"]');

    await render(DOC_B, 'Beta.pdf', 5);
    await click('[data-board-ai-chat-action="save-note"]');

    expect(onSave.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        content: 'answer A',
        evidence: [{ sourceDocumentId: DOC_A, pageStart: 2, pageEnd: 2, charStart: null, charEnd: null }],
      }),
      expect.objectContaining({
        content: 'answer B',
        evidence: [{ sourceDocumentId: DOC_B, pageStart: 5, pageEnd: 5, charStart: null, charEnd: null }],
      }),
    ]);
  });

  it('shows Saved and prevents an immediate duplicate save for the same assistant message', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({ onSave });
    await click('[data-board-ai-chat-action="save-note"]');
    const button = q('[data-board-ai-chat-action="save-note"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Saved');

    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps a saved answer Saved and disabled across an AI -> Library -> AI switch', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { render } = await mountPdfSaveHarness({ onSave });
    await click('[data-board-ai-chat-action="save-note"]');
    expect(saveButton(`a-${DOC_A}`)?.textContent).toContain('Saved');

    // Library owns the panel: the AI drawer is gone, not hidden.
    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    expect(q('[data-board-ai-chat-action="save-note"]')).toBeNull();
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');

    const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
    expect(button.textContent).toContain('Saved');
    expect(button.disabled).toBe(true);

    // The remounted panel offers no second Note for a message already saved.
    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps saved and unsaved answers in one thread independent across the switch', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { render } = await mountPdfSaveHarness({
      initialSessions: {
        [DOC_A]: {
          activeThreadId: THREAD_A,
          messages: pdfTwoAnswerThread(DOC_A, 2),
          draft: '',
          loadingMessages: false,
          sending: false,
          error: null,
        },
      },
      onSave,
    });

    await click('[data-board-ai-chat-save-message-id="assistant-a"]');
    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');

    expect(saveButton('assistant-a')?.textContent).toContain('Saved');
    expect((saveButton('assistant-a') as HTMLButtonElement).disabled).toBe(true);
    expect(saveButton('assistant-b')?.textContent).toContain('Save as Note');
    expect((saveButton('assistant-b') as HTMLButtonElement).disabled).toBe(false);

    await click('[data-board-ai-chat-save-message-id="assistant-b"]');
    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');

    expect(saveButton('assistant-a')?.textContent).toContain('Saved');
    expect(saveButton('assistant-b')?.textContent).toContain('Saved');
    expect((saveButton('assistant-a') as HTMLButtonElement).disabled).toBe(true);
    expect((saveButton('assistant-b') as HTMLButtonElement).disabled).toBe(true);
    expect(onSave.mock.calls.map((call) => call[0].messageId)).toEqual(['assistant-a', 'assistant-b']);
  });

  it('remembers no save that failed, so the answer is still saveable after the switch', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('internal details'));
    const { render } = await mountPdfSaveHarness({ onSave });
    await click('[data-board-ai-chat-action="save-note"]');
    expect(q('[data-board-ai-chat-save-note-error="true"]')).not.toBeNull();

    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');

    const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
    expect(button.textContent).toContain('Save as Note');
    expect(button.textContent).not.toContain('Saved');
    expect(button.disabled).toBe(false);
  });

  it('leaves an earlier saved answer saved when a new turn is generated', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await mountPdfSaveHarness({ onSave });
    await click('[data-board-ai-chat-action="save-note"]');

    await type('another question');
    await click('[data-board-ai-chat-action="send"]');

    const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
    expect(button.textContent).toContain('Saved');
    expect(button.disabled).toBe(true);
  });

  it('B: a citation survives an AI -> Library -> AI switch, with the thread', async () => {
    const cited = {
      version: 1,
      items: [{ type: 'knowledge-page' as const, knowledgeDocumentId: DOC_A, pageNumber: 4, label: 'Alpha.pdf' }],
    };
    const { render } = await mountPdfSaveHarness({
      initialSessions: {
        [DOC_A]: {
          activeThreadId: THREAD_A,
          messages: [
            ...pdfThreadMessages(DOC_A, 4, 'answer body', 'assistant-a').slice(0, 1),
            { ...pdfThreadMessages(DOC_A, 4, 'answer body', 'assistant-a')[1], citations: cited },
          ],
          draft: '',
          loadingMessages: false,
          sending: false,
          error: null,
        },
      },
    });

    expect(q('[data-board-ai-chat-citations="true"]')).not.toBeNull();
    expect(q('[data-board-ai-chat-citation]')?.textContent).toContain('Alpha.pdf · p. 4');

    await render(DOC_A, 'Alpha.pdf', 4, 'library');
    await render(DOC_A, 'Alpha.pdf', 4, 'ai');

    expect(q('[data-board-ai-chat-citations="true"]')).not.toBeNull();
    expect(q('[data-board-ai-chat-citation]')?.textContent).toContain('Alpha.pdf · p. 4');
  });

  it('A/D: a save still in flight survives remounts, and cannot be started twice', async () => {
    let release: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { release = () => resolve(); }));
    const { render } = await mountPdfSaveHarness({ onSave });

    // The write begins and does not resolve.
    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((saveButton(`a-${DOC_A}`) as HTMLButtonElement).disabled).toBe(true);

    // Library and back, twice: the panel that started the save is gone, and
    // the one that replaces it must still refuse to start a second one.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await render(DOC_A, 'Alpha.pdf', 3, 'library');
      await render(DOC_A, 'Alpha.pdf', 3, 'ai');
      const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
      expect(button, 'the remounted panel must still know the save is running').not.toBeNull();
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Saving');
      await click('[data-board-ai-chat-action="save-note"]');
      expect(onSave, 'no remount may start a second Note for one answer').toHaveBeenCalledTimes(1);
    }

    // The original write finishes: pending becomes saved, still once.
    await act(async () => { release!(); await Promise.resolve(); await Promise.resolve(); });
    const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
    expect(button.textContent).toContain('Saved');
    expect(button.disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);

    // And it stays saved across another switch.
    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');
    expect(saveButton(`a-${DOC_A}`)?.textContent).toContain('Saved');
  });

  it('B: a failed save releases the claim, and the answer can be retried once', async () => {
    let reject: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((_resolve, rejectPromise) => {
      reject = () => rejectPromise(new Error('internal details'));
    }));
    const { render } = await mountPdfSaveHarness({ onSave });

    await click('[data-board-ai-chat-action="save-note"]');
    expect((saveButton(`a-${DOC_A}`) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { reject!(); await Promise.resolve(); await Promise.resolve(); });

    // Saveable again, and nothing was recorded as saved -- no Note exists.
    const button = saveButton(`a-${DOC_A}`) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Save as Note');
    expect(q('[data-board-ai-chat-save-note-error="true"]')).not.toBeNull();

    // The release survives a remount too: still retryable, not stuck pending.
    await render(DOC_A, 'Alpha.pdf', 3, 'library');
    await render(DOC_A, 'Alpha.pdf', 3, 'ai');
    expect((saveButton(`a-${DOC_A}`) as HTMLButtonElement).disabled).toBe(false);

    await click('[data-board-ai-chat-action="save-note"]');
    expect(onSave, 'a released claim allows exactly one retry').toHaveBeenCalledTimes(2);
  });

  it('C: one answer saving does not block a different answer in the same thread', async () => {
    const pending = new Map<string, () => void>();
    const onSave = vi.fn((request: { messageId: string }) => new Promise<void>((resolve) => {
      pending.set(request.messageId, () => resolve());
    }));
    await mountPdfSaveHarness({
      initialSessions: {
        [DOC_A]: {
          activeThreadId: THREAD_A,
          messages: pdfTwoAnswerThread(DOC_A, 2),
          draft: '',
          loadingMessages: false,
          sending: false,
          error: null,
        },
      },
      onSave,
    });

    await click('[data-board-ai-chat-save-message-id="assistant-a"]');
    // B is untouched by A's claim: different message, independent save.
    expect((saveButton('assistant-b') as HTMLButtonElement).disabled).toBe(false);
    await click('[data-board-ai-chat-save-message-id="assistant-b"]');
    expect(onSave).toHaveBeenCalledTimes(2);

    // They resolve independently, in the other order.
    await act(async () => { pending.get('assistant-b')!(); await Promise.resolve(); await Promise.resolve(); });
    expect(saveButton('assistant-b')?.textContent).toContain('Saved');
    expect(saveButton('assistant-a')?.textContent).toContain('Saving');

    await act(async () => { pending.get('assistant-a')!(); await Promise.resolve(); await Promise.resolve(); });
    expect(saveButton('assistant-a')?.textContent).toContain('Saved');
  });

  it('shows a generic failure and never reports Saved when Note/source-link persistence fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('internal details'));
    await mountPdfSaveHarness({ onSave });
    await click('[data-board-ai-chat-action="save-note"]');

    expect(q('[data-board-ai-chat-save-note-error="true"]')?.textContent).toContain('Could not save note.');
    expect(q('[data-board-ai-chat-action="save-note"]')?.textContent).not.toContain('Saved');
    expect(host.textContent).not.toContain('internal details');
  });

  it('Save as Note does not affect the open AI session or send another AI request', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    await mountPdfSaveHarness({ onSave, onClose });
    const fetchesBefore = fetchMock.mock.calls.length;

    await click('[data-board-ai-chat-action="save-note"]');

    expect(onClose).not.toHaveBeenCalled();
    expect(host.textContent).toContain('assistant answer text');
    expect(fetchMock.mock.calls.slice(fetchesBefore).filter((call) => call[1]?.method === 'POST')).toHaveLength(0);
  });

  it('CanvasClient creates one standard source-linked Note, refreshes the PDF Notes projection, and rolls back on link failure', () => {
    const start = CLIENT.indexOf('const savePdfAssistantAnswerAsNote = useCallback(');
    // Ends at the SELECTION save, which legitimately has its own
    // request.pageNumber -- the old slice ran past it and read its text.
    const end = CLIENT.indexOf('const saveKnowledgeSelectionAsNote = useCallback(', start);
    const body = CLIENT.slice(start, end);
    expect(body).toContain("type: 'text'");
    expect(body).toContain('title: \'AI Note\'');
    expect(body).toContain('knowledgeSourceSelectionToNoteHtml(request.content)');
    expect(body).not.toMatch(/request\.provider|request\.model|provider:|model:/);
    // 0..N references, each from the validated evidence set, exact span kept.
    expect(body).toContain('const evidence = request.evidence ?? [];');
    expect(body).toContain('for (const item of evidence) {');
    expect(body).toContain('pageStart: item.pageStart');
    expect(body).toContain('pageEnd: item.pageEnd');
    expect(body).toContain('charStart: item.charStart');
    expect(body).toContain('charEnd: item.charEnd');
    expect(body).toContain('quoteText: null');
    expect(body).toContain('region: null');
    // The context-derived rule is gone, not merely bypassed.
    expect(body).not.toContain('request.pageNumber');
    expect(body).not.toContain('request.sourceDocumentId');
    expect(body.indexOf('await insertPostAndSelectOrThrow')).toBeLessThan(body.indexOf('await persistKnowledgeSourceReference'));
    expect(body.indexOf('await persistKnowledgeSourceReference')).toBeLessThan(body.indexOf('setPadlets'));
    // MULTI-REFERENCE ROLLBACK: the delete sits INSIDE the evidence loop, so a
    // failure on the third reference removes the Note (and, by the schema's
    // cascade, the two already written) rather than leaving a Note claiming
    // partial provenance.
    expect(body).toContain('await deletePostOrThrow(created.id)');
    const loopStart = body.indexOf('for (const item of evidence) {');
    expect(loopStart).toBeGreaterThan(-1);
    expect(body.indexOf('await deletePostOrThrow(created.id)')).toBeGreaterThan(loopStart);
    expect(body.indexOf("throw new Error('source_link_failed')")).toBeGreaterThan(loopStart);
    // Success is published only after the loop completes.
    expect(body.indexOf('setPadlets')).toBeGreaterThan(body.indexOf('await deletePostOrThrow(created.id)'));
    expect(body.indexOf("toast.success('Note saved')")).toBeGreaterThan(loopStart);
    expect(body).not.toContain('setIsNoteEditorOpen');

    const persist = CLIENT.slice(
      CLIENT.indexOf('const persistKnowledgeSourceReference = useCallback('),
      CLIENT.indexOf('const savePdfAssistantAnswerAsNote = useCallback('),
    );
    expect(persist).toContain('setSourceReferencesByPadletId');
    expect(persist).toContain('return true');
    expect(persist).toContain('return false');
    expect(CLIENT).toContain('noteSummaries={knowledgeSourceNoteSummaries}');
  });

  it('the in-flight save claim is session state, written before the write begins', () => {
    // The claim has to outlive the panel that made it, so it lives in the
    // host-owned session beside the completed one -- not in mount-local state,
    // and not in a second registry, a global, storage or a timestamp.
    expect(DRAWER).toContain('readonly pendingNoteSaveMessageIds?: readonly string[];');
    const save = DRAWER.slice(
      DRAWER.indexOf('const saveAssistantAsNote = useCallback('),
      DRAWER.indexOf('const setDraftContext = useCallback('),
    );
    expect(save).toContain("setAssistantNoteSaveOutcome(message.id, 'pending');");
    expect(save.indexOf("setAssistantNoteSaveOutcome(message.id, 'pending');"))
      .toBeLessThan(save.indexOf('await onSaveAssistantAsNote('));
    expect(save).toContain("setAssistantNoteSaveOutcome(message.id, 'saved');");
    expect(save).toContain("setAssistantNoteSaveOutcome(message.id, 'idle');");
    for (const forbidden of ['localStorage', 'sessionStorage', 'Date.now', 'window.']) {
      expect(save, forbidden).not.toContain(forbidden);
    }
    // A completion that lands after its own panel unmounted merges into the
    // CURRENT session rather than restoring a snapshot of it.
    const writer = DRAWER.slice(
      DRAWER.indexOf('const setAssistantNoteSaveOutcome = useCallback('),
      DRAWER.indexOf('// The click guard reads both identity sets'),
    );
    expect(writer).toContain('setDocumentSessionValue(documentScopeId, apply)');
    expect(writer).toContain('...session,');
    expect(writer).toContain('pendingNoteSaveMessageIds: nextPending, savedNoteMessageIds: nextSaved');
  });

  it('the reader host owns document-scoped Board AI sessions across right-panel unmounts', () => {
    expect(READER).toContain('const [boardAiSessionsByDocumentId, setBoardAiSessionsByDocumentId]');
    expect(READER).toContain('pageNumber: activePageNumber');
    expect(READER).toContain('onSaveAssistantAsNote={onSaveAssistantAsNote}');
    // ONE store, and BOTH hosts read it: the focused workspace and the docked
    // side panel are two geometries over the same conversation, so moving
    // between them cannot start a second thread for the same PDF.
    expect((READER.match(/documentSessions=\{boardAiSessionsByDocumentId\}/g) ?? [])).toHaveLength(2);
    expect((READER.match(/onDocumentSessionsChange=\{setBoardAiSessionsByDocumentId\}/g) ?? [])).toHaveLength(2);
    expect((READER.match(/useState<Record<string, BoardAiDocumentScopedSession>>/g) ?? [])).toHaveLength(1);
  });
});

// ============================================================================
// BOARD_AI_PDF_CITATIONS_1 -- the Sources area under an assistant answer
// ============================================================================

describe('grounded citations', () => {
  const CITED_DOC = '44444444-4444-4444-8444-444444444444';
  const OTHER_DOC = '66666666-6666-4666-8666-666666666666';

  /** A page citation, or -- with no page -- a whole-document one. */
  const citation = (documentId: string, pageNumber: number | undefined, label: string) => (
    pageNumber === undefined
      ? { type: 'knowledge-document', knowledgeDocumentId: documentId, label }
      : { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber, label }
  );

  const threadWith = (citations: unknown) => [
    {
      id: 'u-1', role: 'user', content: 'what does page 4 say?', provider: null, model: null, createdAt: 'n',
      context: { version: 1, items: [{ type: 'knowledge-page', knowledgeDocumentId: CITED_DOC, pageNumber: 4 }] },
    },
    {
      id: 'a-1', role: 'assistant', content: 'Page four says so.', provider: 'deepseek', model: 'deepseek-chat',
      createdAt: 'n', context: null, ...(citations === null ? {} : { citations }),
    },
  ] as const;

  async function mountWithCitations(citations: unknown, onOpenCitation?: (request: unknown) => void) {
    stubChat({
      threads: [summary(THREAD_A, 'z')],
      messages: { [THREAD_A]: [...threadWith(citations)] },
    });
    await mount({ onOpenCitation } as never);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return host;
  }

  const chips = () => all('[data-board-ai-chat-citation]');

  it('A: renders the cited page beneath the answer it belongs to', async () => {
    await mountWithCitations({
      version: 1,
      items: [citation(CITED_DOC, 4, 'My fancy padlet-slideshow.pdf')],
    });

    expect(q('[data-board-ai-chat-citations="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Sources');
    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toContain('My fancy padlet-slideshow.pdf · p. 4');
    // Under the assistant turn, never the user's.
    const assistant = q('[data-board-ai-chat-message="assistant"]')!;
    expect(assistant.querySelector('[data-board-ai-chat-citations="true"]')).not.toBeNull();
    expect(q('[data-board-ai-chat-message="user"]')!.querySelector('[data-board-ai-chat-citations]')).toBeNull();
  });

  it('F: an answer that cited nothing shows no Sources area at all', async () => {
    await mountWithCitations(null);
    expect(q('[data-board-ai-chat-citations]')).toBeNull();
    expect(host.textContent).not.toContain('Sources');

    await act(async () => { root!.unmount(); });
    root = null;
    // An empty envelope is the same thing said differently.
    await mountWithCitations({ version: 1, items: [] });
    expect(q('[data-board-ai-chat-citations]')).toBeNull();
  });

  it('renders several distinct sources once each, in the order given', async () => {
    await mountWithCitations({
      version: 1,
      items: [
        citation(CITED_DOC, 4, 'Alpha.pdf'),
        citation(OTHER_DOC, 7, 'Beta.pdf'),
        citation(CITED_DOC, 4, 'Alpha.pdf'),
      ],
    });

    const labels = chips().map((chip) => chip.textContent?.trim());
    expect(labels).toEqual(['Alpha.pdf · p. 4', 'Beta.pdf · p. 7']);
  });

  it('C/D: clicking a chip asks the board for that exact document and page', async () => {
    const opened: unknown[] = [];
    await mountWithCitations(
      { version: 1, items: [citation(CITED_DOC, 4, 'Alpha.pdf'), citation(OTHER_DOC, 7, 'Beta.pdf')] },
      (request) => { opened.push(request); },
    );

    await click('[data-board-ai-chat-citation-document="' + CITED_DOC + '"]');
    await click('[data-board-ai-chat-citation-document="' + OTHER_DOC + '"]');
    // Repeat: a second click on the same chip is a second navigation.
    await click('[data-board-ai-chat-citation-document="' + CITED_DOC + '"]');

    expect(opened).toEqual([
      { knowledgeDocumentId: CITED_DOC, pageNumber: 4 },
      { knowledgeDocumentId: OTHER_DOC, pageNumber: 7 },
      { knowledgeDocumentId: CITED_DOC, pageNumber: 4 },
    ]);
  });

  it('names a whole-document citation without inventing a page', async () => {
    const opened: unknown[] = [];
    await mountWithCitations(
      { version: 1, items: [citation(CITED_DOC, undefined, 'Alpha.pdf')] },
      (request) => { opened.push(request); },
    );

    expect(chips()[0].textContent?.trim()).toBe('Alpha.pdf');
    await click('[data-board-ai-chat-citation-document="' + CITED_DOC + '"]');
    expect(opened).toEqual([{ knowledgeDocumentId: CITED_DOC }]);
  });

  it('states the source as a label where this surface cannot navigate', async () => {
    await mountWithCitations({ version: 1, items: [citation(CITED_DOC, 4, 'Alpha.pdf')] });
    expect(chips()).toHaveLength(1);
    expect(chips()[0].tagName).toBe('SPAN');
    expect(chips()[0].textContent).toContain('Alpha.pdf · p. 4');
  });
});
