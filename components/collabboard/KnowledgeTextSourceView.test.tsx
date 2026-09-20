// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import KnowledgeTextSourceView, { splitKnowledgeTextHighlight } from './KnowledgeTextSourceView';

const DOC = '33333333-3333-4333-8333-333333333333';
const TEXT = 'Alpha paragraph.\n\nBeta paragraph.\n\nAlpha paragraph.';

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function render(props: Partial<React.ComponentProps<typeof KnowledgeTextSourceView>> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <KnowledgeTextSourceView
        documentId={DOC}
        originalFilename="tide-pools.md"
        text={TEXT}
        presentation="side-panel"
        {...props}
      />,
    );
  });
  return { host, root };
}

describe('the range is applied by INDEX, never by searching', () => {
  it('marks exactly the cited characters', () => {
    const { host } = render({ highlight: { charStart: 0, charEnd: 16, requestId: 1 } });
    const mark = host.querySelector('[data-knowledge-text-source-highlight]');
    expect(mark?.textContent).toBe('Alpha paragraph.');
  });

  it('marks the SECOND occurrence when that is what the offsets name', () => {
    // The whole reason offsets are used rather than the quoted string: the
    // same sentence appears twice, and a search would highlight the first.
    const start = TEXT.lastIndexOf('Alpha paragraph.');
    const { host } = render({ highlight: { charStart: start, charEnd: TEXT.length, requestId: 1 } });
    const mark = host.querySelector('[data-knowledge-text-source-highlight]')!;
    expect(mark.textContent).toBe('Alpha paragraph.');
    // And it is the LAST one: everything after it is empty.
    expect(host.textContent?.endsWith('Alpha paragraph.')).toBe(true);
    expect(host.querySelector('[data-knowledge-text-source-range]')?.getAttribute('data-knowledge-text-source-range'))
      .toBe(`${start}:${TEXT.length}`);
  });

  it('shows the whole source, not just the cited part', () => {
    const { host } = render({ highlight: { charStart: 18, charEnd: 33, requestId: 1 } });
    expect(host.textContent).toContain('Alpha paragraph.');
    expect(host.textContent).toContain('Beta paragraph.');
  });
});

describe('a range it cannot vouch for yields the document, unmarked', () => {
  it.each([
    ['past the end', { charStart: 0, charEnd: TEXT.length + 1 }],
    ['entirely past the end', { charStart: 9000, charEnd: 9100 }],
    ['inverted', { charStart: 20, charEnd: 5 }],
    ['empty', { charStart: 5, charEnd: 5 }],
    ['negative', { charStart: -1, charEnd: 5 }],
    ['fractional', { charStart: 0.5, charEnd: 9 }],
  ])('%s', (_label, range) => {
    // Fails open TOWARDS THE DOCUMENT. A reader that shows the source and
    // marks nothing is right about the source; one that clamps the range to
    // fit is confidently wrong about characters nobody cited.
    const { host } = render({ highlight: { ...range, requestId: 1 } });
    expect(host.querySelector('[data-knowledge-text-source-highlight]')).toBeNull();
    expect(host.textContent).toContain('Beta paragraph.');
    expect(host.querySelector('[data-knowledge-text-source-ready]')
      ?? host.querySelector('[data-knowledge-text-source]')).not.toBeNull();
  });

  it('a range exactly at the end IS valid', () => {
    const { host } = render({ highlight: { charStart: 0, charEnd: TEXT.length, requestId: 1 } });
    expect(host.querySelector('[data-knowledge-text-source-highlight]')?.textContent).toBe(TEXT);
  });
});

describe('the states a reader can be in', () => {
  it('shows nothing but the source when no citation asked for a range', () => {
    const { host } = render();
    expect(host.querySelector('[data-knowledge-text-source-highlight]')).toBeNull();
    expect(host.textContent).toContain('Beta paragraph.');
  });

  it('says it is opening while loading, and names the file', () => {
    const { host } = render({ loading: true, text: null });
    expect(host.querySelector('[data-knowledge-text-source]')?.getAttribute('data-knowledge-text-source'))
      .toBe('loading');
    expect(host.textContent).toContain('tide-pools.md');
  });

  it.each([
    ['an error', { error: true, text: TEXT }],
    ['text that never arrived', { error: false, text: null }],
  ])('refuses to pretend a document is there: %s', (_label, props) => {
    const { host } = render(props);
    expect(host.querySelector('[data-knowledge-text-source]')?.getAttribute('data-knowledge-text-source'))
      .toBe('error');
  });
});

describe('scrolling to the citation', () => {
  it('moves once per REQUEST, and again for a second click on the same range', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView, configurable: true, writable: true,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (requestId: number) => act(() => {
      root.render(
        <KnowledgeTextSourceView
          documentId={DOC} originalFilename="tide-pools.md" text={TEXT}
          presentation="side-panel"
          highlight={{ charStart: 0, charEnd: 16, requestId }}
        />,
      );
    });

    draw(1);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // A re-render for an unrelated reason must not yank a reader who scrolled.
    draw(1);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // A second click on the same citation is a new intent.
    draw(2);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});

describe('splitKnowledgeTextHighlight', () => {
  it('reassembles the original text exactly', () => {
    const split = splitKnowledgeTextHighlight(TEXT, { charStart: 18, charEnd: 33 })!;
    expect(split.before + split.marked + split.after).toBe(TEXT);
    expect(split.marked).toBe('Beta paragraph.');
  });

  it('is null without a highlight at all', () => {
    expect(splitKnowledgeTextHighlight(TEXT, null)).toBeNull();
    expect(splitKnowledgeTextHighlight(TEXT, undefined)).toBeNull();
  });
});
