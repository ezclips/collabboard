// @vitest-environment jsdom
//
// PATCH-346. The modern reader panel header: file card, meta line and a
// segmented Library / AI switch.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeReaderPanelHeader } from './KnowledgeReaderPanelHeader';
import {
  KNOWLEDGE_CONTROL_ACTIVE_BLUE,
  KNOWLEDGE_TEXT_BUTTON_CLASS,
} from './knowledgeReaderControls';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function render(props: Partial<React.ComponentProps<typeof KnowledgeReaderPanelHeader>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgeReaderPanelHeader
        filename="Audi_A2_tire_big.pdf"
        kind="pdf"
        pageSummary="1 page"
        noteCount={0}
        panel="library"
        aiAvailable
        onSelectPanel={vi.fn()}
        {...props}
      />,
    );
  });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const tabs = () => Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'));

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-346 KnowledgeReaderPanelHeader', () => {
  it('shows a PDF badge for a PDF and a text badge otherwise', async () => {
    await render({ kind: 'pdf' });
    expect(q('[data-knowledge-reader-kind="pdf"]')?.textContent).toContain('PDF');
    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';

    await render({ kind: 'transcript' });
    expect(q('[data-knowledge-reader-kind="transcript"]')?.querySelector('svg')).not.toBeNull();
    expect(q('[data-knowledge-reader-kind="transcript"]')?.textContent).not.toContain('PDF');
  });

  it('shows the filename with a full-name title', async () => {
    await render({ filename: 'A very long document name.pdf' });
    const name = q('[data-knowledge-library-filename="true"]')!;
    expect(name.textContent).toBe('A very long document name.pdf');
    expect(name.getAttribute('title')).toBe('A very long document name.pdf');
    expect(q('[data-knowledge-library-pagecount="true"]')?.textContent).toBe('1 page');
  });

  it('adds the note count, singular and plural, and switches to Library', async () => {
    const onSelectPanel = vi.fn();
    await render({ noteCount: 1, onSelectPanel });
    const one = q('[data-knowledge-library-note-count="true"]')!;
    expect(one.textContent).toBe('used in 1 note');
    await act(async () => { one.click(); });
    expect(onSelectPanel).toHaveBeenCalledWith('library');

    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
    await render({ noteCount: 3 });
    expect(q('[data-knowledge-library-note-count="true"]')?.textContent).toBe('used in 3 notes');
  });

  it('omits the note count when there are none', async () => {
    await render({ noteCount: 0 });
    expect(q('[data-knowledge-library-note-count="true"]')).toBeNull();
    expect(q('[data-knowledge-library-pagecount="true"]')?.textContent).toBe('1 page');
  });

  it('renders a segmented switch with aria-selected and calls onSelectPanel', async () => {
    const onSelectPanel = vi.fn();
    await render({ panel: 'library', onSelectPanel });
    const [library, ai] = tabs();
    expect(library.textContent).toContain('Library');
    expect(ai.textContent).toContain('AI');
    expect(library.getAttribute('aria-selected')).toBe('true');
    expect(ai.getAttribute('aria-selected')).toBe('false');
    expect(q('[role="tablist"]')?.getAttribute('data-knowledge-reader-panel-title')).toBe('Library');

    await act(async () => { ai.click(); });
    expect(onSelectPanel).toHaveBeenCalledWith('ai');
  });

  it('PATCH-349: the switch uses the reader\'s ONE small text-button shape', async () => {
    await render({ panel: 'library' });
    const [library, ai] = tabs();
    // Same h-6/rounded/border tokens as the top-bar toggle, active = the tint.
    expect(library.className).toBe(KNOWLEDGE_TEXT_BUTTON_CLASS + KNOWLEDGE_CONTROL_ACTIVE_BLUE);
    expect(ai.className).toBe(KNOWLEDGE_TEXT_BUTTON_CLASS);
    expect(library.className).toContain('h-6');
    expect(library.className).not.toContain('rounded-full');
    expect(library.className).not.toContain('py-1.5');
    // The icons are the shared compact size, not 14px.
    expect(library.querySelector('svg')?.getAttribute('class')).toContain('h-3.5');
    expect(ai.querySelector('svg')?.getAttribute('class')).toContain('h-3.5');
  });

  it('reports the active panel name on the switch', async () => {
    await render({ panel: 'ai' });
    expect(q('[role="tablist"]')?.getAttribute('data-knowledge-reader-panel-title')).toBe('AI');
  });

  it('does not render the AI tab when AI is unavailable', async () => {
    await render({ aiAvailable: false });
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0].textContent).toContain('Library');
  });

  it('Addendum 4: no back control -- the header starts with the file card', async () => {
    await render({ kind: 'pdf' });
    expect(q('[data-knowledge-library-back="true"]')).toBeNull();
    expect(host.querySelector('header button[aria-label="Back to PDFs"]')).toBeNull();
    expect(host.querySelector('header button[aria-label="Close"]')).toBeNull();
    expect(q('[data-knowledge-library-filename="true"]')).not.toBeNull();
  });

  it('Addendum 1: hides the switch when asked', async () => {
    await render({ showPanelSwitch: false });
    expect(q('[role="tablist"]')).toBeNull();
    expect(tabs()).toHaveLength(0);
  });

  it('Addendum 1: the note count is plain text when onSelectPanel is absent', async () => {
    await render({ noteCount: 2, onSelectPanel: undefined });
    const count = q('[data-knowledge-library-note-count="true"]')!;
    expect(count.tagName).toBe('SPAN');
    expect(count.textContent).toBe('used in 2 notes');
  });
});
