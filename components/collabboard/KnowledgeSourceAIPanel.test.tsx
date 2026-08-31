// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSourceAIPanel from './KnowledgeSourceAIPanel';
import { TEXT_ACTION_INSTRUCTION_MAX, TEXT_ACTION_SELECTED_TEXT_MAX } from '@/lib/ai/textActions';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mountUi(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return { container, root };
}
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  vi.unstubAllGlobals();
});

function fetchOk(text: string) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text }), { status: 200 }));
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function clickByText(container: HTMLElement, text: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement;
  act(() => { btn.click(); });
  return btn;
}

function mountPanel(selectedText = 'Bravo', onNotePost = vi.fn(), onClose = vi.fn()) {
  const { container, root } = mountUi(
    <KnowledgeSourceAIPanel selectedText={selectedText} onNotePost={onNotePost} onClose={onClose} />,
  );
  return { container, root, onNotePost, onClose };
}

describe('KnowledgeSourceAIPanel: source excerpt is plain text', () => {
  it('renders the captured selection', () => {
    const { container } = mountPanel('the exact selected text');
    expect(container.textContent).toContain('the exact selected text');
  });

  it('a long excerpt is truncated for DISPLAY only -- the request still carries it whole', async () => {
    const longText = 'z'.repeat(300);
    vi.stubGlobal('fetch', fetchOk('ok'));
    const { container } = mountPanel(longText);
    expect(container.textContent).toContain('…');
    clickByText(container, 'Summarize');
    await flush();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.selectedText).toBe(longText);
  });
});

describe('KnowledgeSourceAIPanel: opening makes zero request', () => {
  it('mounting alone does not call fetch, onNotePost or onClose', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { onNotePost, onClose } = mountPanel();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onNotePost).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('KnowledgeSourceAIPanel: presets reuse the existing endpoint with fixed instructions', () => {
  it('Summarize sends action=custom, the exact selectedText, and the fixed summarize instruction', async () => {
    const fetchMock = fetchOk('Summary');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    clickByText(container, 'Summarize');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/text-action');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: 'custom', selectedText: 'Bravo', instruction: 'Summarize the selected text clearly and concisely.', purpose: 'source-ai',
    });
  });

  it('Explain sends action=custom with the fixed explain instruction', async () => {
    const fetchMock = fetchOk('Explanation');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    clickByText(container, 'Explain');
    await flush();
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      action: 'custom', selectedText: 'Bravo', instruction: 'Explain the selected text clearly in plain language.', purpose: 'source-ai',
    });
  });

  it('a custom prompt sends the typed instruction, capped at TEXT_ACTION_INSTRUCTION_MAX', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const tooLong = 'p'.repeat(TEXT_ACTION_INSTRUCTION_MAX + 500);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, tooLong);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea.value.length).toBe(TEXT_ACTION_INSTRUCTION_MAX);
    clickByText(container, 'Ask AI');
    await flush();
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      action: 'custom',
      selectedText: 'Bravo',
      instruction: 'p'.repeat(TEXT_ACTION_INSTRUCTION_MAX),
      purpose: 'source-ai',
    });
  });

  it('sends ONLY action/selectedText/instruction/purpose -- no document, page, or board field ever rides along', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    clickByText(container, 'Summarize');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(['action', 'instruction', 'purpose', 'selectedText']);
  });

  it('BYOK Phase 3: names the source-ai role, and carries no provider, model or key', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    clickByText(container, 'Summarize');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.purpose).toBe('source-ai');
    // `purpose` selects a SERVER-stored preference; it is not provider control.
    for (const forbidden of ['provider', 'providerType', 'model', 'apiKey', 'connectionId', 'baseUrl', 'endpoint']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('BYOK Phase 3: the custom prompt path also names the source-ai role', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'Explain simply.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickByText(container, 'Ask AI');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.purpose).toBe('source-ai');
    expect(body.instruction).toBe('Explain simply.');
  });
});

describe('KnowledgeSourceAIPanel: the 4,000-character bound fails closed', () => {
  it('an over-limit selection renders no action buttons and makes no fetch', async () => {
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const overLimit = 'x'.repeat(TEXT_ACTION_SELECTED_TEXT_MAX + 1);
    const { container } = mountPanel(overLimit);
    expect(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Summarize')).toBeUndefined();
    expect(container.textContent).toContain('AI supports selections up to 4,000 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('KnowledgeSourceAIPanel: loading, error, retry', () => {
  it('shows a loading state while in flight, then the result', async () => {
    let resolveFetch: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/thinking/i);
    act(() => { resolveFetch!(new Response(JSON.stringify({ text: 'done' }), { status: 200 })); });
    await flush();
    expect(container.textContent).toContain('done');
  });

  it('a provider/network failure shows a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    expect(container.textContent).toMatch(/ai request failed/i);
  });

  it('a 429 shows a distinct rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), { status: 429 })));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    expect(container.textContent).toMatch(/too many ai requests/i);
  });

  it('Retry reuses the exact instruction that failed', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => new Response(JSON.stringify({ text: 'Recovered' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel('Bravo');
    clickByText(container, 'Explain');
    await flush();
    clickByText(container, 'Retry');
    await flush();
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      action: 'custom', selectedText: 'Bravo', instruction: 'Explain the selected text clearly in plain language.', purpose: 'source-ai',
    });
    expect(container.textContent).toContain('Recovered');
  });
});

describe('KnowledgeSourceAIPanel: cancellation and generations', () => {
  it('a second request invalidates the first; the late first response is ignored', async () => {
    const deferred: Array<(v: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { deferred.push(r); })));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    clickByText(container, 'Explain');
    await flush();
    act(() => { deferred[1](new Response(JSON.stringify({ text: 'Second result' }), { status: 200 })); });
    await flush();
    expect(container.textContent).toContain('Second result');
    act(() => { deferred[0](new Response(JSON.stringify({ text: 'First result (stale)' }), { status: 200 })); });
    await flush();
    expect(container.textContent).not.toContain('First result (stale)');
    expect(container.textContent).toContain('Second result');
  });

  it('aborts the in-flight request the moment a new one starts', async () => {
    let firstSignal: AbortSignal | null = null;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      if (!firstSignal) firstSignal = init.signal as AbortSignal;
      return new Promise(() => {});
    }));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    clickByText(container, 'Explain');
    await flush();
    expect(firstSignal!.aborted).toBe(true);
  });

  it('unmounting aborts the in-flight request', async () => {
    let capturedSignal: AbortSignal | null = null;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise(() => {});
    }));
    const { container, root } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    act(() => { root.unmount(); });
    mounted = mounted.filter((m) => m.container !== container);
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('a response that resolves after unmount touches nothing', async () => {
    let resolveFetch: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));
    const { container, root, onNotePost } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    act(() => { root.unmount(); });
    mounted = mounted.filter((m) => m.container !== container);
    act(() => { resolveFetch!(new Response(JSON.stringify({ text: 'Too late' }), { status: 200 })); });
    await flush();
    expect(onNotePost).not.toHaveBeenCalled();
  });
});

describe('KnowledgeSourceAIPanel: hostile model output is never parsed as HTML', () => {
  it('a <script> result renders as literal text, never a real element', async () => {
    vi.stubGlobal('fetch', fetchOk('<script>alert(1)</script>'));
    const { container } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('a <b> result stays literal in the preview AND in what Note Post forwards', async () => {
    vi.stubGlobal('fetch', fetchOk('<b>model text</b>'));
    const { container, onNotePost } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>model text</b>');
    clickByText(container, 'Note Post');
    expect(onNotePost).toHaveBeenCalledWith('<b>model text</b>');
  });
});

describe('KnowledgeSourceAIPanel: Note Post and the Source Notes back affordance', () => {
  it('Note Post forwards the exact plain-text result and nothing else', async () => {
    vi.stubGlobal('fetch', fetchOk('Final answer'));
    const { container, onNotePost } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    clickByText(container, 'Note Post');
    expect(onNotePost).toHaveBeenCalledTimes(1);
    expect(onNotePost).toHaveBeenCalledWith('Final answer');
  });

  it('the Source Notes back control calls onClose, available even mid-preview', async () => {
    vi.stubGlobal('fetch', fetchOk('Final answer'));
    const { container, onClose } = mountPanel();
    clickByText(container, 'Summarize');
    await flush();
    const back = container.querySelector('[aria-label="Back to Source Notes"]') as HTMLButtonElement;
    expect(back).not.toBeNull();
    act(() => back.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
