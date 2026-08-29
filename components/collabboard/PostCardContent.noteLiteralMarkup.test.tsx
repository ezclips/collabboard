// @vitest-environment jsdom
/**
 * KNI-R1A -- the TEXT/DEFAULT branch's render pipeline used to decode HTML
 * entities before sanitizing, which un-escapes an R1 Note body's own literal
 * text (e.g. `<p>&lt;img ...&gt;</p>`) back into real markup. This proves the
 * corrected pipeline keeps a stored Note's literal text literal, matches
 * Freeform's existing no-decode rendering for modern TipTap content, and
 * still decodes fully-encoded legacy content for display compatibility.
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { afterEach, describe, expect, it } from 'vitest';
import PostCardContent from './PostCardContent';
import type { Padlet } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(content: string): Element {
  const padlet = { id: 'p-1', title: 'Note', content, type: 'text', metadata: {} } as unknown as Padlet;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<PostCardContent padlet={padlet} />); });
  return host!.querySelector('.tiptap')!;
}

describe('KNI-R1A literal source text on Note cards', () => {
  it('A: hostile literal <img> text renders as visible text, never an element', () => {
    const body = mount('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(body.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(body.querySelector('img')).toBeNull();
  });

  it('B: hostile literal <script> text renders as visible text, never an element', () => {
    const body = mount('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(body.textContent).toBe('<script>alert(1)</script>');
    expect(body.querySelector('script')).toBeNull();
  });

  it('C: ordinary TipTap formatting still renders real elements', () => {
    const body = mount('<p><strong>Bold</strong> &amp; normal</p>');
    expect(body.textContent).toBe('Bold & normal');
    expect(body.querySelector('strong')).not.toBeNull();
  });

  it('D: ordinary escaped ampersand/angle-bracket text displays literally', () => {
    const body = mount('<p>A &amp; B &lt; C &gt; D</p>');
    expect(body.textContent).toBe('A & B < C > D');
  });

  it('E: fully-encoded legacy content still decodes for display', () => {
    // No literal tag exists in the stored string itself, so it is not
    // recognized as already-structured markup and keeps the pre-R1 decode
    // compatibility path.
    const body = mount('&lt;p&gt;Legacy&lt;/p&gt;');
    expect(body.textContent).toBe('Legacy');
  });

  it('F: matches Freeform\'s direct DOMPurify.sanitize(padlet.content) semantics for modern TipTap content', () => {
    const cases = [
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      '<p><strong>Bold</strong> &amp; normal</p>',
      '<p>A &amp; B &lt; C &gt; D</p>',
    ];
    for (const content of cases) {
      const body = mount(content);
      // Freeform's exact pipeline: no decode step at all.
      const freeformSanitized = DOMPurify.sanitize(content);
      const probe = document.createElement('div');
      probe.innerHTML = freeformSanitized;

      expect(body.textContent, content).toBe(probe.textContent);
      expect(!!body.querySelector('img'), content).toBe(!!probe.querySelector('img'));
      expect(!!body.querySelector('script'), content).toBe(!!probe.querySelector('script'));
    }
  });

  it('a plain unwrapped string is unaffected', () => {
    const body = mount('plain text no tags');
    expect(body.textContent).toBe('plain text no tags');
  });
});
