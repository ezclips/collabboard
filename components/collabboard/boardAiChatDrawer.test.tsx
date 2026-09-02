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

import BoardAiChatDrawer from './BoardAiChatDrawer';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_A = '22222222-2222-4222-8222-222222222222';
const THREAD_B = '33333333-3333-4333-8333-333333333333';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const DRAWER = read('components/collabboard/BoardAiChatDrawer.tsx');

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

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
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { threadId?: string; message: string };
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
    expect(empty.textContent).toMatch(/No board content is shared/i);
    // It must not promise analysis that does not happen.
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
      'padlet', 'knowledgeDocumentId', 'KnowledgePageCache', 'useKnowledgeSource',
      'selectedText', 'pageNumber', 'citation', 'Save as Note', 'sourceReference',
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
