import { describe, expect, it } from 'vitest';

import { matchLayerSelectionToPageText } from './knowledgePageLayerSelection';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

/**
 * THE CORE PROMISE, asserted on every positive case below:
 * `pageText.slice(charStart, charEnd)`, whitespace removed, equals the
 * selection whitespace removed. A match that did not satisfy that would produce
 * a span the server rejects and the user never asked for.
 */

/** The same comparison normalization the matcher uses, for the core promise. */
const strip = (text: string) => text.normalize('NFKC').replace(/\u00AD/g, '').replace(/\s+/g, '');

function expectExactMatch(pageText: string, selected: string, hint = 0.5) {
  const match = matchLayerSelectionToPageText(pageText, selected, hint);
  expect(match).not.toBeNull();
  const sliced = pageText.slice(match!.charStart, match!.charEnd);
  expect(strip(sliced)).toBe(strip(selected));
  return match!;
}

describe('an exact match', () => {
  it('gives the right offsets', () => {
    const pageText = 'The quick brown fox';
    const match = matchLayerSelectionToPageText(pageText, 'quick', 0.5);
    expect(match).toEqual({ charStart: 4, charEnd: 9 });
    expect(pageText.slice(match!.charStart, match!.charEnd)).toBe('quick');
  });
});

describe('spacing differences are ignored', () => {
  it('the layer has no spaces while the page text has spaces and newlines', () => {
    const pageText = 'EMERGENCY\nCHECK   LIST';
    expectExactMatch(pageText, 'EMERGENCYCHECKLIST');
  });

  it('the layer has spaces while the page text does not', () => {
    const pageText = 'EMERGENCYCHECKLIST';
    expectExactMatch(pageText, 'EMERGENCY CHECK LIST');
  });

  it('line breaks inside the selection', () => {
    const pageText = 'first line\nsecond line\nthird line';
    const match = matchLayerSelectionToPageText(pageText, 'line second line\nthird', 0.5);
    // The span starts on the 'l' of the first "line" and ends on the 'd' of
    // "third", so it starts and ends on non-whitespace.
    expect(match).not.toBeNull();
    expect(pageText[match!.charStart]).toBe('l');
    expect(pageText[match!.charEnd - 1]).toBe('d');
    expect(strip(pageText.slice(match!.charStart, match!.charEnd))).toBe('linesecondlinethird');
  });
});

describe('normalization', () => {
  it('folds the ﬁ ligature to fi', () => {
    // The page text (OpenDataLoader) has "fi", the layer (pdf.js) has the ligature.
    expectExactMatch('find the file', 'ﬁnd the ﬁle');
  });

  it('ignores soft hyphens', () => {
    // U+00AD lives in the page text; the selection has the plain word.
    expectExactMatch('emergency\u00AD checklist', 'emergencychecklist');
  });
});

describe('repeated phrases', () => {
  const pageText = 'alpha beta alpha beta alpha beta';

  it('a hint near the start picks the first', () => {
    const match = matchLayerSelectionToPageText(pageText, 'alpha', 0.0);
    expect(match!.charStart).toBe(0);
  });

  it('a hint near the end picks the last', () => {
    const match = matchLayerSelectionToPageText(pageText, 'alpha', 1.0);
    expect(match!.charStart).toBe(pageText.lastIndexOf('alpha'));
  });

  it('an exact tie picks the earliest', () => {
    // "ab" occurs at normalized offsets 0 and 4 in an 8-char text; hint 0.25 is
    // equidistant (0.25) from both, so the earliest must win.
    const tie = 'abXXabXX';
    const match = matchLayerSelectionToPageText(tie, 'ab', 0.25);
    expect(match!.charStart).toBe(0);
  });
});

describe('refusals', () => {
  it('no match', () => {
    expect(matchLayerSelectionToPageText('the page text', 'absent', 0.5)).toBeNull();
  });

  it('fewer than 2 characters', () => {
    expect(matchLayerSelectionToPageText('the page text', 'a', 0.5)).toBeNull();
    expect(matchLayerSelectionToPageText('the page text', '', 0.5)).toBeNull();
  });

  it('whitespace only', () => {
    expect(matchLayerSelectionToPageText('the page text', '   \n\t', 0.5)).toBeNull();
  });

  it('over the length cap', () => {
    const pageText = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 10);
    const selected = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1);
    expect(matchLayerSelectionToPageText(pageText, selected, 0.5)).toBeNull();
  });

  it('an empty page text', () => {
    expect(matchLayerSelectionToPageText('', 'anything', 0.5)).toBeNull();
  });
});

describe('the result never starts or ends on whitespace', () => {
  it('surrounding whitespace is not included', () => {
    const pageText = 'before   the match   after';
    const match = matchLayerSelectionToPageText(pageText, 'the match', 0.5)!;
    expect(pageText[match.charStart]).toBe('t');
    expect(pageText[match.charEnd - 1]).toBe('h');
  });
});
