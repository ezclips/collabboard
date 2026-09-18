// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
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
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';

/**
 * ADDING A FILE TO THE CHAT.
 *
 * The other half of the original report: there was no way to change the model,
 * and no way to add a file. The upload itself is small -- it posts to the SAME
 * knowledge endpoint the PDF uploader already uses and attaches the id that
 * endpoint returns, which is exactly what `knowledge-document` context already
 * accepts. No new route, no new ingestion path, no new context type.
 *
 * THE REAL WORK IS THE PENDING STATE, and it is a silent-failure guard of the
 * same family as the three found this week. Ingestion is asynchronous and every
 * reader filters on `processing_status = 'ready'`, so a just-uploaded document
 * resolves to NO TEXT. Sending it would attach an empty source; the model would
 * answer honestly from nothing, and the user would read a confident reply about
 * the file they had just handed over. Nothing downstream can tell an empty
 * attachment from an absent one -- the composer is the only place that knows,
 * so the composer is where it must be stopped.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '44444444-4444-4444-8444-444444444444';

const ROOT = path.resolve(__dirname, '../..');
const DRAWER = fs.readFileSync(path.join(ROOT, 'components/collabboard/BoardAiChatDrawer.tsx'), 'utf8');

let root: Root | null = null;
let host: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;
/** What the knowledge GET reports, mutated between polls by a test. */
let documentStatus: string;
let uploadResponse: () => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubRoutes() {
  documentStatus = 'uploaded';
  uploadResponse = () => json(
    { id: DOC_ID, boardId: BOARD_ID, originalFilename: 'handbook.pdf', processingStatus: 'uploaded' },
    201,
  );
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/knowledge')) {
      if (init?.method === 'POST') return uploadResponse();
      return json({ documents: [{ id: DOC_ID, processingStatus: documentStatus }] });
    }
    if (init?.method === 'POST') {
      return json({ threadId: 'ttttttt1-1111-4111-8111-111111111111', message: { id: 'a1', role: 'assistant', content: 'answer', provider: 'deepseek', model: 'deepseek-flash', createdAt: 'n' } });
    }
    return json({ threads: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
}

/**
 * The shell owns draft context, so the test owns it too -- holding it in React
 * state exactly as CanvasClient does, rather than re-rendering by hand from
 * inside the change handler.
 */
let draftContext: readonly BoardAiDraftContextItem[] = [];

function Harness({ initial }: { initial: readonly BoardAiDraftContextItem[] }) {
  const [items, setItems] = React.useState(initial);
  draftContext = items;
  return (
    <BoardAiChatDrawer
      boardId={BOARD_ID}
      isOpen
      onClose={vi.fn()}
      draftContext={items}
      onDraftContextChange={setItems}
    />
  );
}

async function mount(initial: readonly BoardAiDraftContextItem[] = []) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  draftContext = initial;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness initial={initial} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const sendButton = () => q('[data-board-ai-chat-send="true"]') as HTMLButtonElement
  ?? Array.from(host.querySelectorAll('button')).find((b) => /send/i.test(b.getAttribute('aria-label') ?? '')) as HTMLButtonElement;

const type = async (value: string) => {
  const input = q('[data-board-ai-chat-input="true"]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** Drives the real input element, so the component's own handler runs. */
const choose = async (file: File) => {
  const input = q('[data-board-ai-context-file-input="true"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'handbook.pdf', { type: 'application/pdf' });

beforeEach(() => { document.body.innerHTML = ''; stubRoutes(); });
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the upload rides the existing rails', () => {
  it('posts the file to the board knowledge endpoint, as multipart `file`', async () => {
    await mount();
    await choose(pdf());

    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(call).toBeDefined();
    expect(String(call![0])).toBe(`/api/boards/${BOARD_ID}/knowledge`);
    const body = call![1]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('handbook.pdf');
    // No hand-set Content-Type: the boundary has to come from the browser.
    expect(call![1]!.headers).toBeUndefined();
  });

  it('attaches the id the SERVER returned, not one the browser made up', async () => {
    await mount();
    await choose(pdf());
    expect(draftContext).toHaveLength(1);
    expect(draftContext[0].request).toEqual({ type: 'knowledge-document', knowledgeDocumentId: DOC_ID });
    expect(draftContext[0].label).toBe('handbook.pdf');
  });

  it('offers PDF only, because that is what ingestion can read', async () => {
    await mount();
    const input = q('[data-board-ai-context-file-input="true"]') as HTMLInputElement;
    expect(input.accept).toContain('application/pdf');
    // The action lives in the Context menu, beside the other ways to attach.
    await act(async () => { q('[data-board-ai-context-add="true"]')!.click(); });
    expect(q('[data-board-ai-context-upload="true"]')!.textContent).toMatch(/PDF/);
  });

  it('a refused upload says so and attaches nothing', async () => {
    uploadResponse = () => json({ error: 'A PDF file is required' }, 400);
    await mount();
    await choose(pdf());
    expect(draftContext).toHaveLength(0);
    expect(q('[data-board-ai-context-notice="true"]')!.textContent).toContain('A PDF file is required');
  });

  it('the picker can be reopened on the same file after a failure', () => {
    // Clearing input.value is what makes a retry with the SAME file fire a
    // second change event; without it the second attempt is silently inert.
    expect(DRAWER).toContain('event.target.value = ');
  });
});

describe('a document that is not ready cannot be sent as if it were', () => {
  it('the chip says it is still processing, and does not claim to hold text', async () => {
    await mount();
    await choose(pdf());

    const chip = q('[data-board-ai-context-readiness="pending"]')!;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('Processing');
    // "text only" describes a source that HAS text. This one does not yet.
    expect(chip.textContent).not.toContain('text only');
  });

  it('THE GATE: send is refused while an attachment is pending', async () => {
    await mount();
    await choose(pdf());
    await type('what does the handbook say about leave?');

    expect(sendButton().disabled).toBe(true);
    // And the reason is stated -- a dead button with no explanation is the
    // same silent failure wearing a different costume.
    expect(q('[data-board-ai-context-blocked="true"]')!.textContent).toMatch(/still reading/i);

    // The guard is not only on the button: calling through must refuse too.
    const before = fetchMock.mock.calls.filter(([u, i]) => i?.method === 'POST' && !String(u).includes('/knowledge')).length;
    await act(async () => { sendButton().click(); });
    const after = fetchMock.mock.calls.filter(([u, i]) => i?.method === 'POST' && !String(u).includes('/knowledge')).length;
    expect(after).toBe(before);
  });

  it('a failed ingestion blocks too, and says the thing that is actually true', async () => {
    await mount([boardAiDraftFromDocument(DOC_ID, 'handbook.pdf', 'failed')]);
    await type('what does it say?');
    expect(sendButton().disabled).toBe(true);
    expect(q('[data-board-ai-context-blocked="true"]')!.textContent).toMatch(/could not be read/i);
    // 'failed' never resolves itself, so removal is the only way forward --
    // which means the remove control must stay live in this state.
    expect((q(`[data-board-ai-context-remove]`) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a ready attachment is not blocked -- the gate is about readiness, not about uploads', async () => {
    await mount([boardAiDraftFromDocument(DOC_ID, 'handbook.pdf', 'ready')]);
    await type('what does it say?');
    expect(sendButton().disabled).toBe(false);
    expect(q('[data-board-ai-context-blocked="true"]')).toBeNull();
  });

  it('once ingestion finishes, the chip clears and the message can be sent', async () => {
    await mount();
    await choose(pdf());
    expect(sendButton().disabled || draftContext[0].readiness === 'pending').toBe(true);

    // The poll sees the document become readable. Driven by letting the real
    // interval fire and flushing React between ticks, rather than reaching past
    // the component to set the state this test exists to observe.
    documentStatus = 'ready';
    for (let tick = 0; tick < 20 && draftContext[0]?.readiness !== undefined; tick += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    }
    expect(draftContext[0].readiness).toBeUndefined();

    await type('now ask it something');
    expect(q('[data-board-ai-context-readiness="pending"]')).toBeNull();
    expect(sendButton().disabled).toBe(false);
  }, 15000);

  it('polling stops when nothing is pending, so an idle composer is not a load source', async () => {
    await mount([boardAiDraftFromDocument(DOC_ID, 'handbook.pdf', 'ready')]);
    const knowledgeGets = () => fetchMock.mock.calls
      .filter(([u, i]) => String(u).includes('/knowledge') && i?.method !== 'POST').length;
    expect(knowledgeGets()).toBe(0);
  });
});

describe('what the upload path may not do', () => {
  it('readiness never travels to the server', () => {
    // Belt and braces over the domain test: the payload builder rebuilds each
    // item field by field, and this asserts the drawer did not route around it.
    expect(DRAWER).not.toMatch(/readiness:\s*[^u]/);
    expect(DRAWER).toContain('boardAiDraftContextPayload');
  });

  it('the upload posts to the knowledge endpoint and nowhere new', () => {
    const executable = DRAWER
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Two endpoints, both pre-existing. A third would mean this unit grew a
    // server surface it was supposed to avoid entirely.
    const paths = executable.match(/`\/api\/[^`]+`/g) ?? [];
    expect(new Set(paths).size).toBeLessThanOrEqual(2);
    expect(executable).toContain('/knowledge');
  });
});
