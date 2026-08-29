// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import SelectedTextAIPanel from './SelectedTextAIPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
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

// Same real-DOM-selection technique as NoteEditor.characterization.test.tsx.
function selectText(container: HTMLElement, text: string) {
  const pm = container.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    let idx = -1;
    while ((node = walker.nextNode() as Text | null)) {
      idx = node.textContent?.indexOf(text) ?? -1;
      if (idx !== -1) break;
    }
    if (!node || idx === -1) throw new Error(`text not found: ${text}`);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + text.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

function Harness(props: { onEditor: (e: Editor) => void }) {
  const editor = useSharedTipTapEditor({ initialContent: '<p>Alpha Bravo Charlie</p>' });
  if (editor) props.onEditor(editor);
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

// Mounts a real editor, selects `word`, returns the exact range/text captured.
function setupEditor(word = 'Bravo') {
  let editor: Editor | null = null;
  const { container } = mount(<Harness onEditor={(e) => { editor = e; }} />);
  selectText(container, word);
  const range = { from: editor!.state.selection.from, to: editor!.state.selection.to };
  const capturedText = editor!.state.doc.textBetween(range.from, range.to, '\n', '\n');
  return { container, editor: editor!, range, capturedText };
}

function mountPanel(editor: Editor, range: { from: number; to: number }, capturedText: string, onClose = vi.fn()) {
  const { container, root } = mount(
    <SelectedTextAIPanel editor={editor} range={range} capturedText={capturedText} onClose={onClose} />
  );
  return { container, root, onClose };
}

function fetchOk(text: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ text }), { status: 200 }));
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function clickByText(container: HTMLElement, text: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement;
  act(() => { btn.click(); });
  return btn;
}

describe('SelectedTextAIPanel: shared by Note and Document (source-level)', () => {
  it('both editors import the one shared panel, no NoteSelectedTextAI/DocumentSelectedTextAI duplicate', () => {
    const noteSrc = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    const docSrc = fs.readFileSync('components/collabboard/editors/DocumentEditor.tsx', 'utf8');
    expect(noteSrc).toContain("from './SelectedTextAIPanel'");
    expect(docSrc).toContain("from './SelectedTextAIPanel'");
  });
});

describe('SelectedTextAIPanel: opening makes zero request', () => {
  it('mounting the panel alone does not call fetch', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    mountPanel(editor, range, capturedText);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SelectedTextAIPanel: explicit action triggers exactly one request', () => {
  it('Improve writing sends action=improve and the captured text only', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = fetchOk('Better text');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ action: 'improve', selectedText: 'Bravo' });
  });

  it('Shorten sends action=shorten', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Shorten');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('shorten');
  });

  it('Fix grammar sends action=fix-grammar', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Fix grammar');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('fix-grammar');
  });

  it('Custom instruction sends the instruction only when action=custom', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = fetchOk('ok');
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel(editor, range, capturedText);
    const input = container.querySelector('input') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'translate to pirate speak');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickByText(container, 'Custom instruction');
    await flush();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ action: 'custom', selectedText: 'Bravo', instruction: 'translate to pirate speak' });
  });
});

describe('SelectedTextAIPanel: loading, preview, never auto-applies', () => {
  it('shows loading while in flight, then a preview that does not touch the editor until applied', async () => {
    const { editor, range, capturedText } = setupEditor();
    let resolveFetch: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/thinking/i);
    act(() => { resolveFetch!(new Response(JSON.stringify({ text: 'Better text' }), { status: 200 })); });
    await flush();
    expect(container.textContent).toContain('Better text');
    expect(editor.getHTML()).toBe('<p>Alpha Bravo Charlie</p>');
  });
});

describe('SelectedTextAIPanel: Replace and Insert semantics', () => {
  it('Replace selection changes only the original range', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('Better text'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    clickByText(container, 'Replace selection');
    expect(editor.getHTML()).toBe('<p>Alpha Better text Charlie</p>');
  });

  it('Insert after keeps the original selection text and appends the result after it', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('Better text'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    clickByText(container, 'Insert after');
    expect(editor.getHTML()).toBe('<p>Alpha Bravo Better text Charlie</p>');
  });

  it('apply targets the originally captured range even if the caret moved elsewhere during the request', async () => {
    const { editor, range, capturedText } = setupEditor();
    let resolveFetch: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    act(() => { editor.chain().setTextSelection(1).run(); }); // caret moves to "Alpha"
    act(() => { resolveFetch!(new Response(JSON.stringify({ text: 'Better text' }), { status: 200 })); });
    await flush();
    clickByText(container, 'Replace selection');
    expect(editor.getHTML()).toBe('<p>Alpha Better text Charlie</p>');
  });
});

describe('SelectedTextAIPanel: stale-range protection', () => {
  it('refuses to apply when the text at the captured range changed', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('Better text'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    act(() => { editor.chain().insertContentAt(range, { type: 'text', text: 'Zulu' }).run(); });
    clickByText(container, 'Replace selection');
    expect(container.textContent).toMatch(/changed/i);
    expect(editor.getHTML()).toBe('<p>Alpha Zulu Charlie</p>');
  });

  it('refuses to apply when the range is no longer a valid document position', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('Better text'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    act(() => { editor.commands.clearContent(); });
    clickByText(container, 'Replace selection');
    expect(container.textContent).toMatch(/changed/i);
  });
});

describe('SelectedTextAIPanel: cancellation and generations', () => {
  it('a second request invalidates the first; the late first response is ignored', async () => {
    const { editor, range, capturedText } = setupEditor();
    const deferred: Array<(v: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { deferred.push(r); })));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    clickByText(container, 'Shorten');
    await flush();
    act(() => { deferred[1](new Response(JSON.stringify({ text: 'Second result' }), { status: 200 })); });
    await flush();
    expect(container.textContent).toContain('Second result');
    act(() => { deferred[0](new Response(JSON.stringify({ text: 'First result (stale)' }), { status: 200 })); });
    await flush();
    expect(container.textContent).not.toContain('First result (stale)');
    expect(container.textContent).toContain('Second result');
  });

  it('closing the panel aborts the in-flight request', async () => {
    const { editor, range, capturedText } = setupEditor();
    let capturedSignal: AbortSignal | null = null;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise(() => {}); // never resolves
    }));
    const onClose = vi.fn();
    const { container } = mountPanel(editor, range, capturedText, onClose);
    clickByText(container, 'Improve writing');
    await flush();
    const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLButtonElement;
    act(() => { closeBtn.click(); });
    expect(capturedSignal!.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a response that resolves after the panel unmounts never touches the editor', async () => {
    const { editor, range, capturedText } = setupEditor();
    let resolveFetch: (v: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));
    const { container, root } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    act(() => { root.unmount(); });
    mounted = mounted.filter((m) => m.container !== container);
    act(() => { resolveFetch!(new Response(JSON.stringify({ text: 'Too late' }), { status: 200 })); });
    await flush();
    expect(editor.getHTML()).toBe('<p>Alpha Bravo Charlie</p>');
  });
});

describe('SelectedTextAIPanel: failure UX', () => {
  it('a 429 shows a distinct rate-limit message and performs zero mutation', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), { status: 429 })));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(container.textContent).toMatch(/too many ai requests/i);
    expect(editor.getHTML()).toBe('<p>Alpha Bravo Charlie</p>');
  });

  it('a provider/network failure shows a generic error and performs zero mutation', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(container.textContent).toMatch(/ai request failed/i);
    expect(editor.getHTML()).toBe('<p>Alpha Bravo Charlie</p>');
  });

  it('Retry reuses the original captured text and range, not the editor current selection', async () => {
    const { editor, range, capturedText } = setupEditor();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => new Response(JSON.stringify({ text: 'Recovered text' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    act(() => { editor.chain().setTextSelection(1).run(); }); // move caret elsewhere before retry
    clickByText(container, 'Retry');
    await flush();
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondBody).toEqual({ action: 'improve', selectedText: 'Bravo' });
    clickByText(container, 'Replace selection');
    expect(editor.getHTML()).toBe('<p>Alpha Recovered text Charlie</p>');
  });
});

describe('SelectedTextAIPanel: hostile AI output is never parsed as HTML', () => {
  it('a <script> result renders as literal text and is applied as literal text, never a real element', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('<script>alert(1)</script>'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    clickByText(container, 'Replace selection');
    expect(document.querySelector('script')).toBeNull();
    expect(editor.getHTML()).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('an <img onerror> result renders as literal text and is applied as literal text, never a real img element', async () => {
    const { editor, range, capturedText } = setupEditor();
    vi.stubGlobal('fetch', fetchOk('<img src=x onerror=alert(1)>'));
    const { container } = mountPanel(editor, range, capturedText);
    clickByText(container, 'Improve writing');
    await flush();
    expect(container.querySelector('img')).toBeNull();
    clickByText(container, 'Replace selection');
    expect(editor.state.doc.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.ProseMirror img')).toBeNull();
  });
});
