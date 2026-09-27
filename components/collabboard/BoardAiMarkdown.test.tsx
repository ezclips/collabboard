// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import BoardAiMarkdown from './BoardAiMarkdown';

/**
 * PATCH-203. The model answers in Markdown and the chat printed it raw, so
 * `**1.d4**` reached the reader with its asterisks. This pins the rendering and,
 * just as importantly, its safety: raw HTML is never rendered and unsafe URLs
 * are dropped.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(content: string) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<BoardAiMarkdown content={content} />);
  });
  return host;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('PATCH-203 Board AI answers render Markdown', () => {
  it('renders **bold** as a strong element with no asterisks left', async () => {
    const container = await render('**1.d4**');
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('1.d4');
    expect(container.textContent).not.toContain('*');
  });

  it('renders a dash list as a ul with two items', async () => {
    const container = await render('- a\n- b');
    expect(container.querySelector('ul')).not.toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a heading as a small heading element', async () => {
    const container = await render('## Heading');
    const heading = container.querySelector('h1, h2, h3, h4, h5, h6');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe('Heading');
    // A heading in a chat bubble is a label, never a page title.
    expect(heading!.className).toContain('text-xs');
  });

  it('never renders raw HTML as an element', async () => {
    const container = await render('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('drops a javascript: URL rather than rendering it', async () => {
    const container = await render('[click me](javascript:alert(1))');
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href') ?? '').not.toContain('javascript:');
  });

  it('opens a normal link in a new tab, safely', async () => {
    const container = await render('[docs](https://example.com/guide)');
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://example.com/guide');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
