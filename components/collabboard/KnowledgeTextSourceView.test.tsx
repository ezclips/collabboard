// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import KnowledgeTextSourceView, { splitKnowledgeTextHighlight } from './KnowledgeTextSourceView';
import { knowledgeTranscriptReadingBlocks }
  from '@/lib/domain/knowledge/knowledgeTranscriptReadingLayout';
import type { KnowledgeTranscriptStoredRepresentation }
  from '@/lib/domain/knowledge/knowledgeTranscriptVersion';

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

/**
 * PATCH-159. THE RENDERER A TRANSCRIPT ACTUALLY REACHES.
 *
 * PATCH-157 put the reading layout in the PDF reader, which a transcript never
 * reaches (the reader routes on kind: a transcript is 'text' and renders here,
 * while KnowledgeDocumentDetails is reached only for 'pdf'). So this is where
 * the grouping has to be, and the constraint is the one this file already
 * states: offsets index the SOURCE text, so the rendered textContent must still
 * reconstruct `text` verbatim.
 */
describe('a transcript reads as paragraphs here, without changing its text', () => {
  const representation = {
    representationVersion: 1,
    videoIdentity: 'yt:dQw4w9WgXcQ',
    cues: [{ charStart: 0, charEnd: 5, startMs: 1000, endMs: 3000 }],
    language: null,
    trackKind: 'machine' as const,
    format: 'youtube-panel' as const,
    videoAssociation: 'claimed' as const,
  } satisfies KnowledgeTranscriptStoredRepresentation;

  // ONE CUE PER LINE and YouTube's doubled spaces -- the shape the complaint
  // came from. Long enough to produce at least three blocks, asserted below.
  const TRANSCRIPT = Array.from(
    { length: 12 },
    (_, index) => `cue ${index} says a sentence of spoken words long enough to fill the reading measure`,
  ).join('\n');

  const blockSpans = (host: HTMLElement) =>
    [...host.querySelectorAll('[data-transcript-reading-block]')];

  it('1. THE GATE: textContent reconstructs the text exactly, across 3+ blocks', () => {
    // Asserted from the REAL module, so the test fails loudly if the fixture or
    // the target constant drifts into the one-block case that exercises nothing.
    expect(knowledgeTranscriptReadingBlocks(TRANSCRIPT).length).toBeGreaterThanOrEqual(3);

    const { host } = render({ text: TRANSCRIPT, transcriptRepresentation: representation });
    expect(host.textContent).toBe(TRANSCRIPT);
    // And stated as a length, so a subtle difference cannot hide in the equality.
    expect(host.textContent!.length).toBe(TRANSCRIPT.length);
  });

  it('2. emits more than one block, and is NOT monospace', () => {
    const { host } = render({ text: TRANSCRIPT, transcriptRepresentation: representation });
    expect(blockSpans(host).length).toBeGreaterThan(1);
    const paragraph = host.querySelector('p')!;
    expect(paragraph.className).not.toContain('font-mono');
    expect(paragraph.className).toContain('whitespace-normal');
  });

  it('3. WITHOUT a transcript: zero blocks, mono and pre-wrap kept, text verbatim', () => {
    const { host } = render({ text: TRANSCRIPT, transcriptRepresentation: null });
    expect(blockSpans(host).length).toBe(0);
    const paragraph = host.querySelector('p')!;
    expect(paragraph.className).toContain('font-mono');
    expect(paragraph.className).toContain('whitespace-pre-wrap');
    expect(host.textContent).toBe(TRANSCRIPT);
  });

  it('4. a highlight inside ONE block renders exactly one mark with the right text', () => {
    // Derived from a REAL block boundary, not hardcoded.
    const blocks = knowledgeTranscriptReadingBlocks(TRANSCRIPT);
    const inFirst = TRANSCRIPT.slice(blocks[0].charStart, blocks[0].charEnd);
    const wordAt = inFirst.indexOf('sentence');
    const charStart = blocks[0].charStart + wordAt;
    const charEnd = charStart + 'sentence'.length;

    const { host } = render({
      text: TRANSCRIPT,
      transcriptRepresentation: representation,
      highlight: { charStart, charEnd, requestId: 1 },
    });

    const marks = host.querySelectorAll('[data-knowledge-text-source-highlight]');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('sentence');
    expect(host.textContent).toBe(TRANSCRIPT);
  });

  it('5. a highlight STRADDLING a boundary renders in more than one block, verbatim', () => {
    const blocks = knowledgeTranscriptReadingBlocks(TRANSCRIPT);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    // Cross the FIRST boundary: from inside block 0 into block 1.
    const charStart = blocks[0].charEnd - 20;
    const charEnd = blocks[1].charStart + 20;
    expect(charStart).toBeLessThan(blocks[0].charEnd);
    expect(charEnd).toBeGreaterThan(blocks[0].charEnd);

    const { host } = render({
      text: TRANSCRIPT,
      transcriptRepresentation: representation,
      highlight: { charStart, charEnd, requestId: 1 },
    });

    const marks = host.querySelectorAll('[data-knowledge-text-source-highlight]');
    expect(marks.length).toBeGreaterThan(1);
    // The marks together are exactly the cited range -- clamped per block,
    // absolute throughout.
    expect([...marks].map((mark) => mark.textContent).join(''))
      .toBe(TRANSCRIPT.slice(charStart, charEnd));
    // And the blocks it renders in are more than one.
    const blocksWithMarks = blockSpans(host).filter((span) => span.querySelector('mark') !== null);
    expect(blocksWithMarks.length).toBeGreaterThan(1);
    // The gate still holds with the highlight present.
    expect(host.textContent).toBe(TRANSCRIPT);
  });
});
