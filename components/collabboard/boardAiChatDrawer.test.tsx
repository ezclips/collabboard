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
    for (const forbidden of [
      'KnowledgePageCache', 'useKnowledgeSource', 'selectedText',
      'citation', 'sourceReference', 'reader.pages', 'page.text',
    ]) {
      expect(code, `${forbidden} belongs to a later slice`).not.toContain(forbidden);
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

  const pdfThreadMessages = (
    documentId: string,
    pageNumber: number,
    assistantContent = 'assistant answer text',
    assistantId = `a-${documentId}`,
  ) => [
    {
      id: `u-${documentId}`,
      role: 'user',
      content: 'question',
      provider: null,
      model: null,
      createdAt: 'n',
      context: {
        version: 1,
        items: [{ type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber }],
      },
    },
    {
      id: assistantId,
      role: 'assistant',
      content: assistantContent,
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
    }: {
      documentId: string;
      filename: string;
      pageNumber: number;
    }) {
      const [sessions, setSessions] = React.useState<Record<string, BoardAiDocumentScopedSession>>(seededSessions);
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
    const render = async (documentId: string, filename: string, pageNumber: number) => {
      await act(async () => {
        root!.render(<Harness documentId={documentId} filename={filename} pageNumber={pageNumber} />);
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

    expect(onSave).toHaveBeenCalledWith({
      messageId: 'assistant-a',
      content: 'answer body without metadata',
      sourceDocumentId: DOC_A,
      pageNumber: 3,
      originalFilename: 'Alpha.pdf',
    });
    expect(JSON.stringify(onSave.mock.calls[0][0])).not.toMatch(/deepseek|provider|model/i);
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
      expect.objectContaining({ content: 'answer A', sourceDocumentId: DOC_A, pageNumber: 2 }),
      expect.objectContaining({ content: 'answer B', sourceDocumentId: DOC_B, pageNumber: 5 }),
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
    const end = CLIENT.indexOf('  /** The one completion point for any Note finalised out of a placement draft. */', start);
    const body = CLIENT.slice(start, end);
    expect(body).toContain("type: 'text'");
    expect(body).toContain('title: \'AI Note\'');
    expect(body).toContain('knowledgeSourceSelectionToNoteHtml(request.content)');
    expect(body).not.toMatch(/request\.provider|request\.model|provider:|model:/);
    expect(body).toContain('pageStart: request.pageNumber');
    expect(body).toContain('pageEnd: request.pageNumber');
    expect(body).toContain('quoteText: null');
    expect(body).toContain('region: null');
    expect(body.indexOf('await insertPostAndSelectOrThrow')).toBeLessThan(body.indexOf('await persistKnowledgeSourceReference'));
    expect(body.indexOf('await persistKnowledgeSourceReference')).toBeLessThan(body.indexOf('setPadlets'));
    expect(body).toContain('await deletePostOrThrow(created.id)');
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

  it('the workspace host owns document-scoped Board AI sessions across right-panel unmounts', () => {
    expect(READER).toContain('const [workspaceBoardAiSessionsByDocumentId, setWorkspaceBoardAiSessionsByDocumentId]');
    expect(READER).toContain('documentSessions={workspaceBoardAiSessionsByDocumentId}');
    expect(READER).toContain('onDocumentSessionsChange={setWorkspaceBoardAiSessionsByDocumentId}');
    expect(READER).toContain('pageNumber: activePageNumber');
    expect(READER).toContain('onSaveAssistantAsNote={onSaveWorkspaceAssistantAsNote}');
  });
});
